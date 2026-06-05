const listeningRoot = document.getElementById("listeningTestRoot");
const listeningParams = new URLSearchParams(window.location.search);
const listeningTestId = listeningParams.get("id");
const listeningPart = listeningParams.get("part");
let activeListeningTest = null;

function normalizeAnswer(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getListeningAnswer(number) {
    const selected = listeningRoot.querySelector(`[name="q${number}"]:checked`);
    const field = listeningRoot.querySelector(`#q${number}, [name="q${number}"]`);
    return selected ? selected.value : (field?.value || "");
}

function parseStructuredAnswers(test) {
    const answers = {};

    (test.parts || []).forEach((part) => {
        String(part.answerText || "")
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
                const match = line.match(/^(\d{1,2})\s*[\).:\-=\|]\s*(.+)$/);
                if (!match) return;
                answers[match[1]] = match[2]
                    .split(/\s*\|\s*/)
                    .map(normalizeAnswer)
                    .filter(Boolean);
            });
    });

    return answers;
}

function gradeStructuredListeningTest(test) {
    const answers = parseStructuredAnswers(test);
    const gradedMultipleSelectQuestions = new Set();
    let correct = 0;

    listeningRoot.querySelectorAll(".lc-multiple-select").forEach((group) => {
        const numbers = String(group.dataset.questionNumbers || "")
            .split(",")
            .map(Number)
            .filter((number) => answers[number]);
        const selected = new Set(
            [...group.querySelectorAll('input[type="checkbox"]:checked')]
                .map((input) => normalizeAnswer(input.value))
                .filter(Boolean)
        );

        if (!numbers.length) return;
        numbers.forEach((number) => gradedMultipleSelectQuestions.add(number));

        if (numbers.length === 1) {
            if (answers[numbers[0]].some((answer) => selected.has(answer))) correct += 1;
            return;
        }

        const expected = new Set(numbers.flatMap((number) => answers[number]));
        correct += Math.min(numbers.length, [...selected].filter((answer) => expected.has(answer)).length);
    });

    Object.entries(answers).forEach(([number, accepted]) => {
        if (gradedMultipleSelectQuestions.has(Number(number))) return;
        if (accepted.includes(normalizeAnswer(getListeningAnswer(number)))) correct += 1;
    });

    return { correct, total: Object.keys(answers).length };
}

function gradeLegacyListeningTest(test) {
    const questions = Array.isArray(test.questions) ? test.questions : [];
    const correct = questions.reduce((score, question) => {
        const accepted = String(question.answer || "").split("|").map(normalizeAnswer).filter(Boolean);
        return score + (accepted.includes(normalizeAnswer(getListeningAnswer(question.number))) ? 1 : 0);
    }, 0);

    return { correct, total: questions.length };
}

function listeningBand(correct, total) {
    const scaledCorrect = total ? Math.round((correct / total) * 40) : 0;
    const table = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [0, 0]];
    return table.find(([minimum]) => scaledCorrect >= minimum)?.[1] || 0;
}

function showListeningResult(result, questionNumbers = []) {
    const modal = listeningRoot.querySelector("[data-listening-result-modal]");

    if (!modal) {
        return;
    }

    const numbers = questionNumbers.length
        ? questionNumbers
        : Array.from({ length: result.total }, (_, index) => index + 1);
    const unanswered = numbers
        .filter((number) => !normalizeAnswer(getListeningAnswer(number))).length;

    modal.querySelector("[data-listening-result-score]").textContent = `${result.correct} / ${result.total}`;
    modal.querySelector("[data-listening-result-band]").textContent = `Estimated band: ${listeningBand(result.correct, result.total)}`;
    modal.querySelector("[data-listening-result-unanswered]").textContent =
        `${unanswered} unanswered question${unanswered === 1 ? "" : "s"}.`;
    modal.classList.remove("hidden");
}

function recordListeningResult(test) {
    const structuredResult = gradeStructuredListeningTest(test);
    const result = structuredResult.total ? structuredResult : gradeLegacyListeningTest(test);
    const answerNumbers = Object.keys(parseStructuredAnswers(test)).map(Number).filter(Number.isFinite);
    const status = listeningRoot.querySelector(".lc-submit-status");

    if (!result.total) {
        status.textContent = "This Listening test does not have an answer key yet.";
        return;
    }

    status.textContent = `Result: ${result.correct}/${result.total} correct answers.`;
    showListeningResult(result, answerNumbers);

    window.authClient?.recordTestResult({
        type: "Listening",
        title: test.title || "IELTS Listening Practice",
        correct: result.correct,
        total: result.total,
        band: listeningBand(result.correct, result.total),
        testId: test.id || listeningTestId,
        part: test.part
    });
}

async function loadListeningTest() {
    if (!listeningTestId) {
        return window.ListeningComponents.sampleListeningTest();
    }

    const response = await fetch(`/api/listening-tests/${encodeURIComponent(listeningTestId)}`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Could not load Listening test");
    }

    if (listeningPart && Array.isArray(data.parts)) {
        const selectedPart = data.parts.find((part) => String(part.partNumber) === String(listeningPart));

        if (!selectedPart) {
            throw new Error(`Listening Part ${listeningPart} was not found`);
        }

        return {
            ...data,
            title: `${data.title} - ${selectedPart.title || `Part ${listeningPart}`}`,
            part: Number(listeningPart),
            parts: [selectedPart]
        };
    }

    return data;
}

loadListeningTest()
    .then((test) => {
        activeListeningTest = test;
        document.title = `${test.title || "IELTS"} - Listening`;
        listeningRoot.innerHTML = window.ListeningComponents.ListeningTestPage(test);
        window.ListeningComponents.bindListeningTest(listeningRoot);
    })
    .catch((error) => {
        listeningRoot.innerHTML = `<p class="lc-submit-status">${window.ListeningComponents.escapeHtml(error.message)}</p>`;
    });

listeningRoot.addEventListener("listening-submit", () => {
    if (activeListeningTest) {
        recordListeningResult(activeListeningTest);
    }
});
