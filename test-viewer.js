const params = new URLSearchParams(window.location.search);
const testId = params.get("id");
const selectedPart = params.get("part") || "full";

const viewerType = document.getElementById("viewerType");
const viewerTitle = document.getElementById("viewerTitle");
const viewerBack = document.getElementById("viewerBack");
const viewerTabs = document.getElementById("viewerTabs");
const testText = document.getElementById("testText");
const answerHelp = document.getElementById("answerHelp");
const answerForm = document.getElementById("answerForm");
const checkAnswers = document.getElementById("checkAnswers");
const scoreText = document.getElementById("scoreText");

let currentAnswers = [];

function normalizeAnswer(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function rangeForPart(type, part) {
    if (part === "full") {
        return [1, 40];
    }

    const partNumber = Number(part);

    if (type === "listening") {
        return [(partNumber - 1) * 10 + 1, partNumber * 10];
    }

    const readingRanges = {
        1: [1, 13],
        2: [14, 26],
        3: [27, 40]
    };

    return readingRanges[partNumber] || [1, 40];
}

function answerIsInPart(answer, type, part) {
    const [start, end] = rangeForPart(type, part);
    return answer.question >= start && answer.question <= end;
}

function renderTabs(test) {
    const tabs = [
        { label: "Full test", part: "full" },
        ...test.parts.map((part) => ({ label: `Part ${part.number}`, part: String(part.number) }))
    ];

    viewerTabs.innerHTML = tabs.map((tab) => {
        const active = String(selectedPart) === String(tab.part) ? "active" : "";
        return `<a class="${active}" href="/test-viewer.html?id=${encodeURIComponent(test.id)}&part=${encodeURIComponent(tab.part)}&type=${encodeURIComponent(test.type)}">${tab.label}</a>`;
    }).join("");
}

function renderAnswers(test) {
    currentAnswers = test.answers.filter((answer) => answerIsInPart(answer, test.type, selectedPart));

    if (!currentAnswers.length) {
        answerHelp.textContent = "No answer key was uploaded for this section.";
        answerForm.innerHTML = "";
        checkAnswers.disabled = true;
        return;
    }

    answerHelp.textContent = `${currentAnswers.length} saved answers in this section.`;
    checkAnswers.disabled = false;
    answerForm.innerHTML = currentAnswers.map((answer) => `
        <label class="answer-line" data-question="${answer.question}">
            <span>${answer.question}</span>
            <input type="text" name="q${answer.question}" autocomplete="off">
        </label>
    `).join("");
}

function renderTest(test) {
    const part = selectedPart === "full"
        ? { title: "Full test", text: test.fullText }
        : test.parts.find((item) => String(item.number) === String(selectedPart));

    viewerType.textContent = test.type;
    viewerTitle.textContent = part ? `${test.title} - ${part.title}` : test.title;
    viewerBack.href = test.type === "listening" ? "listening.html" : "reading.html";
    testText.textContent = part ? part.text : "This part was not found in the extracted PDF.";

    renderTabs(test);
    renderAnswers(test);
}

checkAnswers.addEventListener("click", () => {
    let score = 0;

    currentAnswers.forEach((answer) => {
        const row = answerForm.querySelector(`[data-question="${answer.question}"]`);
        const input = row.querySelector("input");
        const userAnswer = normalizeAnswer(input.value);
        const accepted = answer.answers.map(normalizeAnswer);
        const isCorrect = accepted.includes(userAnswer);

        row.classList.toggle("correct", isCorrect);
        row.classList.toggle("wrong", !isCorrect);

        if (isCorrect) {
            score++;
        }
    });

    scoreText.textContent = `Your score is ${score}/${currentAnswers.length}`;
});

async function loadTest() {
    if (!testId) {
        throw new Error("Missing test id");
    }

    const response = await fetch(`/api/tests/${encodeURIComponent(testId)}`);
    const test = await response.json();

    if (!response.ok) {
        throw new Error(test.error || "Could not load test");
    }

    renderTest(test);
}

loadTest().catch((error) => {
    viewerTitle.textContent = "Could not load test";
    testText.textContent = error.message;
    answerHelp.textContent = "";
    checkAnswers.disabled = true;
});
