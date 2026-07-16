const listeningRoot = document.getElementById("listeningTestRoot");
const listeningParams = new URLSearchParams(window.location.search);
const listeningPathParts = window.location.pathname.split("/").filter(Boolean);
const listeningRouteSlug = listeningPathParts[0] === "listening" ? listeningPathParts[1] || "" : "";
const listeningRoutePart = (listeningPathParts[2] || "").match(/^part-(\d+)$/)?.[1] || "";
const listeningMockTestId = cleanListeningId(listeningParams.get("mockTestId") || listeningParams.get("testId"));
const listeningTestId = cleanListeningId(listeningParams.get("id"))
    || cleanListeningId(listeningRouteSlug)
    || (listeningMockTestId ? `mock-listening-${listeningMockTestId}` : "");
const listeningPart = listeningParams.get("part") || listeningRoutePart;
const isListeningMockMode = listeningParams.get("mockMode") === "1" || listeningParams.has("mockTestId") || String(listeningTestId).includes("mock");
const LISTENING_LOAD_TIMEOUT_MS = 10000;
let activeListeningTest = null;
let activeListeningResult = null;
let isSubmitted = false;
const ListeningResultUtils = window.IeltsResultUtils || {};
const AUTO_SUBMIT_MESSAGE = ListeningResultUtils.AUTO_SUBMIT_MESSAGE || "Time is over. Your test has been submitted automatically.";

function cleanListeningId(value) {
    const resolved = decodeURIComponent(String(value || "")).trim();
    return resolved === "undefined" || resolved === "null" ? "" : resolved;
}

function normalizeAnswer(value) {
    return ListeningResultUtils.normalizeAnswer
        ? ListeningResultUtils.normalizeAnswer(value)
        : String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function notifyMockListeningComplete(result, options = {}) {
    if (!isListeningMockMode || window.parent === window) return;

    window.parent.postMessage({
        type: "ieltsx-mock-section-complete",
        section: "listening",
        testId: listeningTestId,
        autoSubmit: Boolean(options.autoSubmit),
        answers: options.answers || {},
        result: result || undefined,
        deferred: Boolean(options.deferred)
    }, window.location.origin);
}

function notifyMockListeningReady() {
    if (!isListeningMockMode || window.parent === window) return;
    window.parent.postMessage({
        type: "ieltsx-mock-section-ready",
        section: "listening",
        testId: listeningTestId
    }, window.location.origin);
}

function notifyMockListeningError(error) {
    if (!isListeningMockMode || window.parent === window) return;
    window.parent.postMessage({
        type: "ieltsx-mock-section-error",
        section: "listening",
        testId: listeningTestId,
        message: error?.message || "Listening could not be loaded."
    }, window.location.origin);
}

function collectListeningAnswers(test) {
    const answers = {};
    const answerNumbers = new Set([
        ...Object.keys(parseStructuredAnswers(test)).map(Number).filter(Number.isFinite),
        ...(Array.isArray(test.questions) ? test.questions : []).map((question) => Number(question.number)).filter(Number.isFinite)
    ]);

    listeningRoot.querySelectorAll(".lc-multiple-select").forEach((group) => {
        const numbers = String(group.dataset.questionNumbers || "")
            .split(",")
            .map(Number)
            .filter(Number.isFinite);
        const selected = [...group.querySelectorAll('input[type="checkbox"]:checked')]
            .map((input) => input.value)
            .filter(Boolean);

        numbers.forEach((number, index) => {
            answerNumbers.add(number);
            answers[number] = selected[index] || "";
        });
    });

    answerNumbers.forEach((number) => {
        if (answers[number] !== undefined) return;
        answers[number] = getListeningAnswer(number);
    });

    return answers;
}

function getListeningAnswer(number) {
    const namedFields = [...listeningRoot.querySelectorAll(`[name="q${number}"]`)];
    const isChoiceField = namedFields.some((field) => field.matches?.('input[type="radio"], input[type="checkbox"]'));
    const selected = listeningRoot.querySelector(`[name="q${number}"]:checked`);
    if (isChoiceField) return selected ? selected.value : "";

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
                    .map((answer) => answer.trim())
                    .filter(Boolean);
            });
    });

    return answers;
}

function gradeStructuredListeningTest(test) {
    const answers = parseStructuredAnswers(test);
    const gradedMultipleSelectQuestions = new Set();
    const questionResults = [];

    listeningRoot.querySelectorAll(".lc-multiple-select").forEach((group) => {
        const numbers = String(group.dataset.questionNumbers || "")
            .split(",")
            .map(Number)
            .filter((number) => answers[number]);
        const selected = (
            [...group.querySelectorAll('input[type="checkbox"]:checked')]
                .map((input) => input.value)
                .filter(Boolean)
        );
        const usedSelected = new Set();

        if (!numbers.length) return;
        numbers.forEach((number) => gradedMultipleSelectQuestions.add(number));

        numbers.forEach((number) => {
            const accepted = answers[number] || [];
            let selectedIndex = selected.findIndex((value, index) =>
                !usedSelected.has(index) && (
                    ListeningResultUtils.answersMatch
                        ? ListeningResultUtils.answersMatch(value, accepted)
                        : accepted.map(normalizeAnswer).includes(normalizeAnswer(value))
                )
            );

            if (selectedIndex === -1) {
                selectedIndex = selected.findIndex((_, index) => !usedSelected.has(index));
            }

            const userAnswer = selectedIndex >= 0 ? selected[selectedIndex] : "";
            if (selectedIndex >= 0) usedSelected.add(selectedIndex);
            questionResults.push(evaluateListeningAnswer({ number }, userAnswer, accepted));
        });
    });

    Object.entries(answers).forEach(([number, accepted]) => {
        if (gradedMultipleSelectQuestions.has(Number(number))) return;
        questionResults.push(evaluateListeningAnswer({ number }, getListeningAnswer(number), accepted));
    });

    return summarizeListeningResults(questionResults);
}

function gradeLegacyListeningTest(test) {
    const questions = Array.isArray(test.questions) ? test.questions : [];
    const questionResults = questions.map((question) =>
        evaluateListeningAnswer(question, getListeningAnswer(question.number))
    );

    return summarizeListeningResults(questionResults);
}

function evaluateListeningAnswer(question, userAnswer, acceptedOverride) {
    if (ListeningResultUtils.evaluateAnswer) {
        return ListeningResultUtils.evaluateAnswer(question, userAnswer, acceptedOverride);
    }

    const accepted = String(acceptedOverride || question.answer || "").split("|").map((answer) => answer.trim()).filter(Boolean);
    const isUnanswered = !normalizeAnswer(userAnswer);
    const isCorrect = !isUnanswered && accepted.map(normalizeAnswer).includes(normalizeAnswer(userAnswer));

    return {
        number: Number(question.number || question.questionNumber),
        userAnswer: String(userAnswer || "").trim(),
        correctAnswers: accepted,
        mainAnswer: accepted[0] || "",
        alternatives: accepted.slice(1),
        status: isUnanswered ? "unanswered" : (isCorrect ? "correct" : "incorrect"),
        isCorrect,
        isUnanswered
    };
}

function summarizeListeningResults(questionResults) {
    const sorted = (questionResults || []).sort((a, b) => Number(a.number) - Number(b.number));
    if (ListeningResultUtils.summarizeResults) {
        return ListeningResultUtils.summarizeResults(sorted, "listening");
    }

    const correct = sorted.filter((item) => item.status === "correct").length;
    const unanswered = sorted.filter((item) => item.status === "unanswered").length;
    const total = sorted.length;

    return {
        correct,
        incorrect: Math.max(0, total - correct - unanswered),
        unanswered,
        total,
        band: listeningBand(correct, total),
        questionResults: sorted
    };
}

function listeningBand(correct, total) {
    if (ListeningResultUtils.estimateBand) {
        return ListeningResultUtils.estimateBand(correct, total, "listening");
    }

    const scaledCorrect = total ? Math.round((correct / total) * 40) : 0;
    const table = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, "0-2"]];
    return table.find(([minimum]) => scaledCorrect >= minimum)?.[1] || "0-2";
}

function showListeningResult(result, questionNumbers = [], options = {}) {
    const modal = listeningRoot.querySelector("[data-listening-result-modal]");

    if (!modal) {
        return;
    }

    const numbers = questionNumbers.length
        ? questionNumbers
        : Array.from({ length: result.total }, (_, index) => index + 1);
    const unanswered = Number.isFinite(result.unanswered)
        ? result.unanswered
        : numbers.filter((number) => !normalizeAnswer(getListeningAnswer(number))).length;

    modal.querySelector("[data-listening-result-score]").textContent = `${result.correct} / ${result.total}`;
    modal.querySelector("[data-listening-result-band]").textContent = `Estimated band: ${result.band || listeningBand(result.correct, result.total)}`;
    modal.querySelector("[data-listening-result-unanswered]").textContent =
        `${unanswered} unanswered question${unanswered === 1 ? "" : "s"}.`;
    modal.querySelector("[data-listening-result-correct]").textContent =
        `${result.correct} correct answer${result.correct === 1 ? "" : "s"}`;
    modal.querySelector("[data-listening-result-incorrect]").textContent =
        `${result.incorrect || 0} incorrect answer${result.incorrect === 1 ? "" : "s"}`;
    const notice = modal.querySelector("[data-auto-submit-message]");
    if (notice) {
        notice.textContent = AUTO_SUBMIT_MESSAGE;
        notice.classList.toggle("hidden", !options.autoSubmit);
    }
    modal.classList.remove("hidden");
}

function listeningStatusLabel(status) {
    if (status === "correct") return "Correct";
    if (status === "incorrect") return "Incorrect";
    return "Unanswered";
}

function formatReviewAnswer(value) {
    return ListeningResultUtils.formatAnswer
        ? ListeningResultUtils.formatAnswer(value)
        : (String(value || "").trim() || "\u2014");
}

function escapeReviewHtml(value) {
    return window.ListeningComponents?.escapeHtml
        ? window.ListeningComponents.escapeHtml(value)
        : String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

function optionMatchesAccepted(value, accepted) {
    const answers = Array.isArray(accepted) ? accepted : [accepted];
    return ListeningResultUtils.answersMatch
        ? ListeningResultUtils.answersMatch(value, answers)
        : answers.map(normalizeAnswer).includes(normalizeAnswer(value));
}

function applyChoiceReview(field, result) {
    const optionLabel = field.closest(".lc-choice-row");
    if (!optionLabel) return;

    const isCorrectOption = optionMatchesAccepted(field.value, result.correctAnswers || [result.mainAnswer]);
    if (isCorrectOption) {
        optionLabel.classList.add("lc-choice-row--correct");
    }
    if (field.checked && !isCorrectOption) {
        optionLabel.classList.add("lc-choice-row--incorrect");
    }
}

function applyMultiSelectReview(result) {
    const number = Number(result.number);

    listeningRoot.querySelectorAll(".lc-multiple-select").forEach((group) => {
        const numbers = String(group.dataset.questionNumbers || "").split(",").map(Number);
        if (!numbers.includes(number)) return;

        group.querySelectorAll('input[type="checkbox"]').forEach((field) => {
            field.disabled = true;
            applyChoiceReview(field, result);
        });
    });
}

function applyListeningFieldReview(result) {
    const number = Number(result.number);
    const fields = listeningRoot.querySelectorAll(`#q${number}, [name="q${number}"]`);

    fields.forEach((field) => {
        field.readOnly = true;
        field.disabled = true;
        field.classList.add(`lc-answer-field--${result.status}`);
        if (field.matches?.('input[type="radio"], input[type="checkbox"]')) {
            applyChoiceReview(field, result);
        }
    });
    applyMultiSelectReview(result);

    const inline = listeningRoot.querySelector(`[data-question="${number}"]`);
    if (inline) {
        inline.classList.add(`lc-answer-inline--${result.status}`);
        inline.querySelector(".lc-inline-correct-answer")?.remove();
        if (result.status !== "correct") {
            const hint = document.createElement("span");
            hint.className = "lc-inline-correct-answer";
            hint.textContent = `Correct: ${formatReviewAnswer(result.mainAnswer)}`;
            inline.appendChild(hint);
        }
    }
}

function renderListeningReview(result) {
    if (!result?.questionResults?.length) return;

    listeningRoot.classList.add("lc-review-mode");
    listeningRoot.querySelectorAll(".lc-answer-input, input[type='radio'], input[type='checkbox'], select, textarea").forEach((field) => {
        field.readOnly = true;
        field.disabled = true;
    });
    result.questionResults.forEach(applyListeningFieldReview);

    listeningRoot.querySelector(".lc-review-summary")?.remove();
    const summary = document.createElement("section");
    summary.className = "lc-review-summary";
    summary.innerHTML = `
        <div class="lc-review-summary-header">
            <span>Review answers</span>
            <h2>Question results</h2>
        </div>
        <div class="lc-review-grid">
            ${result.questionResults.map((item) => `
                <article class="lc-review-card lc-review-card--${item.status}">
                    <h3>Question ${item.number}</h3>
                    <p><strong>Your answer:</strong> ${escapeReviewHtml(formatReviewAnswer(item.userAnswer))}</p>
                    <p><strong>Correct answer:</strong> ${escapeReviewHtml(formatReviewAnswer(item.mainAnswer))}
                        ${item.alternatives?.length ? `<span class="lc-answer-alternatives"> Alternatives: ${escapeReviewHtml(item.alternatives.join(", "))}</span>` : ""}
                    </p>
                    <p><strong>Status:</strong> <span>${listeningStatusLabel(item.status)}</span></p>
                </article>
            `).join("")}
        </div>
    `;
    listeningRoot.querySelector(".lc-main")?.appendChild(summary);
}

function normalizeServerListeningScore(data) {
    const questionResults = (data.results || []).map((item) => {
        const correctAnswers = String(item.answer || "").split("|").map((answer) => answer.trim()).filter(Boolean);
        const isUnanswered = !normalizeAnswer(item.userAnswer);
        return {
            number: Number(item.number),
            userAnswer: String(item.userAnswer || "").trim(),
            correctAnswers,
            mainAnswer: correctAnswers[0] || "",
            alternatives: correctAnswers.slice(1),
            status: isUnanswered ? "unanswered" : (item.correct ? "correct" : "incorrect"),
            isCorrect: Boolean(item.correct),
            isUnanswered
        };
    });
    return {
        correct: Number(data.correct || 0),
        incorrect: Number(data.incorrect ?? questionResults.filter((item) => item.status === "incorrect").length),
        unanswered: Number(data.unanswered ?? questionResults.filter((item) => item.status === "unanswered").length),
        total: Number(data.total ?? questionResults.length),
        band: data.band,
        questionResults
    };
}

async function requestListeningScore(test, answers) {
    const response = await fetch(`/api/listening-tests/${encodeURIComponent(test.id || listeningTestId)}/score`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not score this Listening test");
    return normalizeServerListeningScore(data);
}

async function recordListeningResult(test, options = {}) {
    if (isSubmitted) return;
    isSubmitted = true;

    const submittedAnswers = collectListeningAnswers(test);
    const status = listeningRoot.querySelector(".lc-submit-status");
    const isFull = test.part === "full" || (test.parts || []).length > 1;
    const resultType = isFull ? "full-test" : `part-${Number(test.part || test.parts?.[0]?.partNumber) || 1}`;

    let result;
    try {
        result = await requestListeningScore(test, submittedAnswers);
    } catch (error) {
        isSubmitted = false;
        status.textContent = error.message;
        return;
    }

    const answerNumbers = result.questionResults.map((item) => Number(item.number)).filter(Number.isFinite);

    if (!result.total) {
        isSubmitted = false;
        status.textContent = "This Listening test does not have an answer key yet.";
        return;
    }

    status.textContent = options.autoSubmit
        ? AUTO_SUBMIT_MESSAGE
        : `Result: ${result.correct}/${result.total} correct answers.`;
    activeListeningResult = result;
    ListeningResultUtils.stopAudioPlayers?.(listeningRoot);
    ListeningResultUtils.disableAnswerInputs?.(listeningRoot);
    showListeningResult(result, answerNumbers, options);

    window.authClient?.recordTestResult({
        type: resultType,
        skill: "listening",
        title: test.title || "IELTS Listening Practice",
        correct: result.correct,
        total: result.total,
        band: result.band || listeningBand(result.correct, result.total),
        testId: test.id || listeningTestId,
        part: isFull ? "full" : Number(test.part || test.parts?.[0]?.partNumber) || null,
        practiceUrl: window.location.pathname,
        correctAnswers: result.questionResults
            .filter((item) => item.status === "correct")
            .map((item) => ({
                number: item.number,
                userAnswer: item.userAnswer,
                correctAnswer: item.mainAnswer,
                alternatives: item.alternatives || []
            })),
        wrongAnswers: result.questionResults
            .filter((item) => item.status !== "correct")
            .map((item) => ({
                number: item.number,
                userAnswer: item.userAnswer,
                correctAnswer: item.mainAnswer,
                alternatives: item.alternatives || [],
                status: item.status
            }))
    });

    notifyMockListeningComplete(result, options);
}

async function loadListeningTest() {
    if (!listeningTestId) {
        if (isListeningMockMode) {
            throw new Error("Listening test id is missing. Please open the mock test again.");
        }
        return window.ListeningComponents.sampleListeningTest();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LISTENING_LOAD_TIMEOUT_MS);
    try {
        const response = await fetch(`/api/listening-tests/${encodeURIComponent(listeningTestId)}?t=${Date.now()}`, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));

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
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Listening test could not be loaded. Please check test data or try again.");
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

loadListeningTest()
    .then((test) => {
        activeListeningTest = test;
        isSubmitted = false;
        document.title = `${test.title || "IELTS"} - Listening`;
        listeningRoot.innerHTML = window.ListeningComponents.ListeningTestPage(test);
        window.ListeningComponents.bindListeningTest(listeningRoot, test);
        notifyMockListeningReady();
    })
    .catch((error) => {
        console.error("[Mock Listening] load failed:", error);
        notifyMockListeningError(error);
        const message = window.ListeningComponents.escapeHtml(error.message || "Listening test could not be loaded.");
        listeningRoot.innerHTML = `
            <main class="lc-main">
                <section class="lc-question-card">
                    <h1>Listening could not be loaded</h1>
                    <p class="lc-submit-status">${message}</p>
                    <button class="lc-start-button" type="button" onclick="window.location.reload()">Retry</button>
                    <a class="lc-secondary-button" href="/dashboard">Dashboard</a>
                </section>
            </main>
        `;
    });

listeningRoot.addEventListener("listening-submit", (event) => {
    if (activeListeningTest) {
        if (isListeningMockMode) {
            notifyMockListeningComplete(null, {
                ...(event.detail || {}),
                answers: collectListeningAnswers(activeListeningTest),
                deferred: true
            });
            return;
        }
        recordListeningResult(activeListeningTest, event.detail || {}).catch((error) => {
            isSubmitted = false;
            const status = listeningRoot.querySelector(".lc-submit-status");
            if (status) status.textContent = error.message;
        });
    }
});

listeningRoot.addEventListener("listening-review", () => {
    renderListeningReview(activeListeningResult);
});
