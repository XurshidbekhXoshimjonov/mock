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
    const hasMistakes = Number(result.correct) < Number(result.total);
    const reviewMistakes = modal.querySelector("[data-listening-review-mistakes]");
    const reviewLater = modal.querySelector("[data-listening-review-later]");
    const close = modal.querySelector("[data-listening-result-close]:not(.lc-modal-close)");
    if (reviewMistakes) {
        reviewMistakes.classList.toggle("hidden", !hasMistakes);
        const params = new URLSearchParams({ skill: "listening" });
        if (result.attemptId) params.set("attemptId", result.attemptId);
        reviewMistakes.href = `/review-mistakes?${params}`;
        reviewMistakes.textContent = "Review Listening Mistakes";
    }
    if (reviewLater) reviewLater.classList.toggle("hidden", !hasMistakes);
    if (close) close.classList.toggle("hidden", hasMistakes);
    modal.classList.remove("hidden");
}

function listeningStatusLabel(status) {
    if (status === "correct") return "Correct";
    if (status === "incorrect") return "Incorrect";
    return "Unanswered";
}

function formatReviewAnswer(value) {
    const formatted = ListeningResultUtils.formatAnswer
        ? ListeningResultUtils.formatAnswer(value)
        : (String(value || "").trim() || "\u2014");
    const trimmed = String(formatted || "").trim();
    if (/^\[.*\]$/.test(trimmed)) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join(" / ");
        } catch {
            // Keep legacy non-JSON answer text unchanged.
        }
    }
    return trimmed || "\u2014";
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

function applyMultiSelectReview(result, root = listeningRoot) {
    const number = Number(result.number);

    root.querySelectorAll(".lc-multiple-select").forEach((group) => {
        const numbers = String(group.dataset.questionNumbers || "").split(",").map(Number);
        if (!numbers.includes(number)) return;

        group.querySelectorAll('input[type="checkbox"]').forEach((field) => {
            field.disabled = true;
            applyChoiceReview(field, result);
        });
    });
}

function applyListeningFieldReview(result, root = listeningRoot) {
    const number = Number(result.number);
    const fields = root.querySelectorAll(`#q${number}, [name="q${number}"]`);

    fields.forEach((field) => {
        field.readOnly = true;
        field.disabled = true;
        field.classList.add(`lc-answer-field--${result.status}`);
        if (field.matches?.('input[type="radio"], input[type="checkbox"]')) {
            applyChoiceReview(field, result);
        }
    });
    applyMultiSelectReview(result, root);

    const inline = root.querySelector(`[data-question="${number}"]`);
    if (inline) {
        inline.classList.add(`lc-answer-inline--${result.status}`);
        inline.querySelector(".lc-inline-correct-answer")?.remove();
        if (result.status !== "correct" && root === listeningRoot) {
            const hint = document.createElement("span");
            hint.className = "lc-inline-correct-answer";
            hint.textContent = `Correct: ${formatReviewAnswer(result.mainAnswer)}`;
            inline.appendChild(hint);
        }
    }
}

function inlineQuestionReviewResult(item, options = {}) {
    const isCorrect = item.status === "correct";
    const userAnswer = String(item.userAnswer || "").trim();
    const canExplain = Boolean(item.hasTranscript && item.explanation && item.relevantText);
    return `<span class="lc-inline-review-result lc-inline-review-result--${escapeReviewHtml(item.status)}" data-inline-review-question="${Number(item.number)}">
        ${options.tailOnly ? "" : `${userAnswer ? `<span class="lc-inline-review-user">${escapeReviewHtml(formatReviewAnswer(userAnswer))}</span>` : ""}
        <span class="lc-inline-review-status" aria-label="${escapeReviewHtml(listeningStatusLabel(item.status))}">${isCorrect ? "✓" : "✕"}</span>`}
        ${isCorrect ? "" : `<span class="lc-inline-review-correct">→ ${escapeReviewHtml(formatReviewAnswer(item.mainAnswer))}</span>`}
        ${canExplain ? `<button type="button" class="lc-inline-review-explain" data-explain-question="${Number(item.number)}">Explain More <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false"><path d="m7.5 4.5 5.5 5.5-5.5 5.5"/></svg></button>` : ""}
    </span>`;
}

function inlineBlankReviewResult(item, options = {}) {
    const isCorrect = item.status === "correct";
    const userAnswer = String(item.userAnswer || "").trim();
    return `<span class="lc-inline-review-blank lc-inline-review-blank--${escapeReviewHtml(item.status)}">
        ${options.includeNumber === false ? "" : `<span class="lc-inline-review-number">${Number(item.number)}</span>`}
        ${userAnswer ? `<span class="lc-inline-review-user">${escapeReviewHtml(formatReviewAnswer(userAnswer))}</span>` : ""}
        <span class="lc-inline-review-status" aria-label="${escapeReviewHtml(listeningStatusLabel(item.status))}">${isCorrect ? "✓" : "✕"}</span>
    </span>`;
}

function findQuestionReviewAnchor(root, number) {
    const inline = root.querySelector(`[data-question="${number}"]`);
    if (inline) return inline;
    const directField = root.querySelector(`#q${number}, [name="q${number}"]`);
    if (directField) return directField.closest(".lc-choice-list, .lc-question-card, .lc-table-cell") || directField.parentElement;
    return [...root.querySelectorAll("[data-question-numbers]")].find((group) =>
        String(group.dataset.questionNumbers || "").split(",").map(Number).includes(Number(number))
    ) || null;
}

function QuestionsReviewPanel(sourceContent, questionResults) {
    if (!sourceContent) return null;
    const review = sourceContent.cloneNode(true);
    review.classList.add("lc-inline-questions-review");
    review.removeAttribute("hidden");
    review.querySelectorAll(".lc-audio-card, .lc-submit-status").forEach((element) => element.remove());
    review.querySelectorAll(".lc-listening-section, [data-listening-test-content]").forEach((element) => {
        element.removeAttribute("hidden");
        element.classList.remove("hidden");
    });
    review.querySelectorAll("input, select, textarea, button:not([data-explain-question])").forEach((field) => {
        field.disabled = true;
        if ("readOnly" in field) field.readOnly = true;
    });

    questionResults.forEach((item) => {
        applyListeningFieldReview(item, review);
        const answerAnchor = findQuestionReviewAnchor(review, item.number);
        if (!answerAnchor || review.querySelector(`[data-inline-review-question="${Number(item.number)}"]`)) return;
        const textField = answerAnchor.querySelector?.('input[type="text"], textarea, select');
        const lineAnchor = textField
            ? (answerAnchor.closest("li, tr, p, .lc-note-line, .lc-question-card") || answerAnchor.parentElement)
            : answerAnchor;
        lineAnchor.classList.add("lc-inline-review-anchor", `lc-inline-review-anchor--${item.status}`);
        const badge = answerAnchor.querySelector?.(".lc-question-badge")
            || answerAnchor.closest?.("[data-question]")?.querySelector?.(".lc-question-badge");
        if (badge) badge.remove();
        if (textField) {
            textField.insertAdjacentHTML("afterend", inlineBlankReviewResult(item));
            textField.remove();
            lineAnchor.insertAdjacentHTML("beforeend", inlineQuestionReviewResult(item, { tailOnly: true }));
        } else {
            lineAnchor.insertAdjacentHTML("beforeend", inlineQuestionReviewResult(item));
        }
    });
    return review;
}

function ReviewAudioPlayer(test) {
    const partNumber = Number(test?.part || test?.parts?.[0]?.partNumber) || 1;
    const questionRange = String(test?.parts?.[0]?.questionRange || "").replace(/^Questions?\s*/i, "") || "1–10";
    return `<section class="lc-review-audio-player" aria-label="Listening review audio player">
        <div class="lc-review-audio-heading">
            <strong>Listening Part ${partNumber} Review</strong>
            <span>Review your answers for questions ${escapeReviewHtml(questionRange)}.</span>
        </div>
        <div class="lc-review-audio-controls">
            <button type="button" data-review-audio-action="back" aria-label="Go back 5 seconds">↶</button>
            <button type="button" class="lc-review-audio-play" data-review-audio-action="play" aria-label="Play audio">▶</button>
            <button type="button" data-review-audio-action="forward" aria-label="Go forward 5 seconds">↷</button>
            <output data-review-audio-time>0:00 / 0:00</output>
            <input data-review-audio-seek type="range" min="0" max="0" step="0.01" value="0" aria-label="Audio position">
            <select data-review-audio-speed aria-label="Playback speed">
                <option value="0.75">0.75x</option>
                <option value="1" selected>1x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
            </select>
        </div>
        <span class="lc-review-audio-status" data-review-audio-status aria-live="polite"></span>
        <audio data-review-audio preload="metadata"></audio>
    </section>`;
}

function transcriptSegmentsHtml(transcript, questionResults) {
    if (Array.isArray(transcript?.segments) && transcript.segments.length) {
        return transcript.segments.map((segment) => {
            const matches = (questionResults || []).filter((item) =>
                (item.transcriptSegmentIds || []).includes(String(segment.id))
                && (!segment.partNumber || !item.partNumber || Number(segment.partNumber) === Number(item.partNumber))
            );
            const numbers = matches.map((item) => Number(item.number)).join(" ");
            const tag = matches.length ? "mark" : "span";
            const className = matches.length ? ' class="lc-transcript-evidence"' : "";
            const questionData = matches.length ? ` data-transcript-questions="${numbers}"` : "";
            const marker = matches.length
                ? matches.map((item) => `<span class="lc-transcript-question-marker">Q${Number(item.number)}</span>`).join(" ") + " "
                : "";
            return `<article class="lc-transcript-turn">
                <time>${escapeReviewHtml(formatReviewTimestamp(segment.start))}</time>
                <div><p><${tag}${className}${questionData} data-transcript-segment-id="${escapeReviewHtml(segment.id)}">${marker}${escapeReviewHtml(segment.text)}</${tag}></p></div>
            </article>`;
        }).join("");
    }
    const transcriptText = typeof transcript === "object" ? transcript.text : transcript;
    const relevantQuestions = (questionResults || []).filter((item) => item.relevantText);
    return String(transcriptText || "").split(/\n{2,}/).map((paragraph) => {
        const lines = String(paragraph).split("\n").map((line) => line.trim()).filter(Boolean);
        const explicitTime = /^\d{1,2}:\d{2}$/.test(lines[0] || "") ? lines.shift() : "";
        const speaker = /^(Test Presenter|Lecturer|Presenter|Speaker(?: \d+)?)$/i.test(lines[0] || "")
            ? lines.shift() : "";
        const paragraphText = lines.join(" ");
        const sentences = paragraphText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraphText];
        const sentenceHtml = sentences.map((sentence) => {
            const inlineHighlights = [...String(sentence).matchAll(/\[\[Q(\d{1,2})\|([\s\S]*?)\]\]/g)];
            if (inlineHighlights.length) {
                let cursor = 0;
                let html = "";
                inlineHighlights.forEach((match) => {
                    const number = Number(match[1]);
                    html += escapeReviewHtml(String(sentence).slice(cursor, match.index));
                    html += `<mark class="lc-transcript-evidence" data-transcript-questions="${number}"><span class="lc-transcript-question-marker">Q${number}</span> ${escapeReviewHtml(match[2])}</mark>`;
                    cursor = Number(match.index) + match[0].length;
                });
                return html + escapeReviewHtml(String(sentence).slice(cursor));
            }
            const markerNumbers = [...String(sentence).matchAll(/Q(\d{1,2})(?=[A-Za-z\s])/g)]
                .map((match) => Number(match[1]));
            const normalizedSentence = normalizeAnswer(sentence);
            const matches = relevantQuestions.filter((item) => {
                const normalizedRelevant = normalizeAnswer(item.relevantText);
                return normalizedRelevant && (
                    normalizedSentence.includes(normalizedRelevant)
                    || normalizedRelevant.includes(normalizedSentence)
                );
            });
            const numbers = [...new Set([
                ...markerNumbers,
                ...matches.map((item) => Number(item.number))
            ])].filter(Number.isFinite);
            if (!numbers.length) return escapeReviewHtml(sentence);
            const firstMarker = String(sentence).search(/Q\d{1,2}(?=[A-Za-z\s])/);
            if (firstMarker >= 0) {
                const prefix = String(sentence).slice(0, firstMarker);
                const evidenceText = escapeReviewHtml(String(sentence).slice(firstMarker))
                    .replace(/Q(\d{1,2})(?=[A-Za-z\s])/g, '<span class="lc-transcript-question-marker">Q$1</span> ');
                return `${escapeReviewHtml(prefix)}<mark class="lc-transcript-evidence" data-transcript-questions="${numbers.join(" ")}">${evidenceText}</mark>`;
            }
            return `<mark class="lc-transcript-evidence" data-transcript-questions="${numbers.join(" ")}">${escapeReviewHtml(sentence)}</mark>`;
        }).join(" ");
        const markerItems = markerNumbersForText(paragraphText);
        const inferredTime = markerItems.map((number) => (questionResults || []).find((item) => Number(item.number) === number))
            .find((item) => Number.isFinite(Number(item?.transcriptStartTime)))?.transcriptStartTime;
        const displayTime = explicitTime || (Number.isFinite(Number(inferredTime)) ? formatReviewTimestamp(inferredTime) : "");
        return `<article class="lc-transcript-turn">
            <time>${escapeReviewHtml(displayTime)}</time>
            <div>${speaker ? `<strong>${escapeReviewHtml(speaker)}</strong>` : ""}<p>${sentenceHtml}</p></div>
        </article>`;
    }).join("");
}

function markerNumbersForText(value) {
    return [...String(value || "").matchAll(/Q(\d{1,2})(?=[A-Za-z\s])/g)].map((match) => Number(match[1]));
}

function TranscriptPanel(transcript, questionResults) {
    const fallbackText = (questionResults || []).map((item) => item.relevantText).filter(Boolean).join("\n\n");
    const transcriptText = typeof transcript === "object" ? transcript.text : transcript;
    const hasSegments = Array.isArray(transcript?.segments) && transcript.segments.length;
    const displayTranscript = String(transcriptText || fallbackText || "").trim();
    const partLabel = transcript?.partNumbers?.length === 1 ? `Part ${transcript.partNumbers[0]}` : "Full Test";
    return `<aside class="lc-transcript-panel" aria-label="Listening transcript">
        <section class="lc-transcript-card">
        <div class="lc-review-panel-heading">
            <h2>Listening Transcript</h2>
            <h3>${escapeReviewHtml(partLabel)}</h3>
        </div>
        <div class="lc-transcript-copy" data-review-transcript tabindex="0">
            ${(displayTranscript || hasSegments)
                ? transcriptSegmentsHtml(transcript, questionResults)
                : '<p class="lc-review-empty">A transcript has not been added for this test yet.</p>'}
        </div>
        </section>
    </aside>`;
}

function ListeningReviewQuestion(item) {
    const isCorrect = item.status === "correct";
    const hasExplanation = Boolean(item.hasTranscript && String(item.explanation || "").trim() && String(item.relevantText || "").trim());
    const canPlayAudio = Boolean(item.hasTranscript && hasReviewAudioEvidence(item));
    return `<article class="lc-review-question lc-review-question--${escapeReviewHtml(item.status)}" data-review-question="${Number(item.number)}">
        <div class="lc-review-question__topline">
            <span class="lc-review-question__number">${Number(item.number)}</span>
            <span class="lc-review-question__status" aria-label="${escapeReviewHtml(listeningStatusLabel(item.status))}">
                <span aria-hidden="true">${isCorrect ? "✓" : "✕"}</span>
                ${escapeReviewHtml(listeningStatusLabel(item.status))}
            </span>
        </div>
        <h3>${escapeReviewHtml(item.questionText || `Question ${item.number}`)}</h3>
        <dl class="lc-review-answer-list">
            <div><dt>Your answer</dt><dd>${escapeReviewHtml(formatReviewAnswer(item.userAnswer))}</dd></div>
            <div><dt>Correct answer</dt><dd class="lc-review-correct-answer">${escapeReviewHtml(formatReviewAnswer(item.mainAnswer))}</dd></div>
        </dl>
        <div class="lc-review-question__actions">
            ${hasExplanation ? `<button type="button" class="lc-review-explain-button" data-explain-question="${Number(item.number)}">Explain More</button>` : ""}
            ${canPlayAudio ? `<button type="button" class="lc-review-audio-button" data-play-review-audio="${Number(item.number)}">Play relevant audio</button>` : ""}
        </div>
    </article>`;
}

function QuestionExplanationModal(item) {
    const canPlayAudio = Boolean(item.hasTranscript && hasReviewAudioEvidence(item));
    return `<div class="lc-explanation-backdrop" data-explanation-modal>
        <section class="lc-explanation-modal" role="dialog" aria-modal="true" aria-labelledby="listeningExplanationTitle">
            <button class="lc-explanation-modal__close" type="button" aria-label="Close explanation" data-close-explanation>&times;</button>
            <h2 id="listeningExplanationTitle">Question ${Number(item.number)} - Explanation</h2>
            <section class="lc-explanation-result" aria-label="Question result">
                <p><strong>Your answer:</strong> ${escapeReviewHtml(formatReviewAnswer(item.userAnswer))}</p>
                <p><strong>Correct:</strong> <span>${escapeReviewHtml(formatReviewAnswer(item.mainAnswer))}</span></p>
            </section>
            <section>
                <h3>Relevant Text</h3>
                <blockquote>${escapeReviewHtml(item.relevantText || "Relevant transcript text is not available.")}</blockquote>
            </section>
            <section>
                <h3>Explanation</h3>
                <p>${escapeReviewHtml(item.explanation || "")}</p>
            </section>
            ${canPlayAudio ? `<button type="button" class="lc-review-audio-button" data-play-review-audio="${Number(item.number)}">Play relevant audio</button>` : ""}
        </section>
    </div>`;
}

function combinedListeningTranscript(test) {
    const transcripts = (test?.parts || [])
        .map((part) => String(part.transcriptText || part.transcript || "").trim())
        .filter(Boolean);
    const segments = (test?.parts || []).flatMap((part) => Array.isArray(part.transcriptSegments)
        ? part.transcriptSegments.map((segment) => ({ ...segment, id: String(segment.id), partNumber: Number(part.partNumber) || null }))
        : []);
    if (!transcripts.length && test?.transcript) transcripts.push(String(test.transcript).trim());
    return {
        text: [...new Set(transcripts)].join("\n\n"),
        segments,
        partNumbers: (test?.parts || []).map((part) => Number(part.partNumber)).filter(Number.isFinite)
    };
}

function reviewVocabularyPanel(questionResults) {
    const entries = (questionResults || []).filter((item) => item.mainAnswer || item.relevantText);
    return `<div class="lc-review-vocabulary-list">
        ${entries.length ? entries.map((item) => `<article>
            <span>Question ${Number(item.number)}</span>
            <strong>${escapeReviewHtml(formatReviewAnswer(item.mainAnswer))}</strong>
            ${item.relevantText ? `<p>${escapeReviewHtml(item.relevantText)}</p>` : ""}
        </article>`).join("") : '<p class="lc-review-empty">Vocabulary context has not been added for this test.</p>'}
    </div>`;
}

function focusTranscriptQuestion(number) {
    const transcript = listeningRoot.querySelector("[data-review-transcript]");
    if (!transcript) return;
    transcript.querySelectorAll(".lc-transcript-evidence--active").forEach((item) => {
        item.classList.remove("lc-transcript-evidence--active");
    });
    const evidence = [...transcript.querySelectorAll("[data-transcript-questions]")].find((item) =>
        String(item.dataset.transcriptQuestions || "").split(/\s+/).includes(String(number))
    );
    if (!evidence) return;
    evidence.classList.add("lc-transcript-evidence--active");
    evidence.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hasReviewAudioEvidence(item) {
    return Boolean(
        item?.audioUrl
        && item.transcriptStartTime !== null
        && item.transcriptStartTime !== undefined
        && Number.isFinite(Number(item.transcriptStartTime))
    );
}

function playReviewAudio(item) {
    const audio = listeningRoot.querySelector("[data-review-audio]");
    const status = listeningRoot.querySelector("[data-review-audio-status]");
    if (!audio || !hasReviewAudioEvidence(item)) return;
    const start = Math.max(0, Number(item.transcriptStartTime));
    const end = item.transcriptEndTime === null || item.transcriptEndTime === undefined
        ? NaN : Number(item.transcriptEndTime);
    if (audio.getAttribute("src") !== item.audioUrl) audio.setAttribute("src", item.audioUrl);
    if (audio._reviewTimeHandler) audio.removeEventListener("timeupdate", audio._reviewTimeHandler);
    audio.currentTime = start;
    audio._reviewTimeHandler = () => {
        if (Number.isFinite(end) && end > start && audio.currentTime >= end) audio.pause();
    };
    audio.addEventListener("timeupdate", audio._reviewTimeHandler);
    if (status) status.textContent = `Playing Question ${item.number} from ${formatReviewTimestamp(start)}${Number.isFinite(end) ? ` to ${formatReviewTimestamp(end)}` : ""}.`;
    audio.play().catch(() => {
        if (status) status.textContent = "Press play in the audio controls to hear this section.";
    });
}

function initializeReviewAudioPlayer(workspace, questionResults) {
    const audio = workspace.querySelector("[data-review-audio]");
    const firstAudioUrl = (questionResults || []).find((item) => item.audioUrl)?.audioUrl;
    if (!audio || !firstAudioUrl) return;
    audio.src = firstAudioUrl;
    const seek = workspace.querySelector("[data-review-audio-seek]");
    const time = workspace.querySelector("[data-review-audio-time]");
    const play = workspace.querySelector('[data-review-audio-action="play"]');
    const render = () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        if (seek) {
            seek.max = String(duration);
            seek.value = String(Math.min(current, duration || current));
        }
        if (time) time.textContent = `${formatReviewClock(current)} / ${formatReviewClock(duration)}`;
        if (play) {
            play.textContent = audio.paused ? "▶" : "❚❚";
            play.setAttribute("aria-label", audio.paused ? "Play audio" : "Pause audio");
        }
    };
    ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended"].forEach((type) => audio.addEventListener(type, render));
    render();
}

function formatReviewClock(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function isListeningPracticeTest(test) {
    const parts = Array.isArray(test?.parts) ? test.parts.filter(Boolean) : [];
    return test?.part !== "full" && parts.length <= 1;
}

function renderFullListeningReview(result) {
    if (!result?.questionResults?.length) return;
    result.questionResults.forEach((item) => applyListeningFieldReview(item));
    listeningRoot.querySelector("[data-listening-result-modal]")?.classList.add("hidden");
    listeningRoot.querySelector(".lc-main")?.removeAttribute("hidden");
    const content = listeningRoot.querySelector("[data-listening-test-content]");
    if (content) content.removeAttribute("hidden");
    const status = listeningRoot.querySelector(".lc-submit-status");
    if (status) status.textContent = `Review: ${result.correct}/${result.total} correct answers.`;
}

function formatReviewTimestamp(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderListeningReview(result) {
    if (!result?.questionResults?.length) return;
    if (!isListeningPracticeTest(activeListeningTest)) {
        renderFullListeningReview(result);
        return;
    }

    listeningRoot.classList.add("lc-review-mode");
    listeningRoot.querySelector(".lc-main")?.setAttribute("hidden", "");
    listeningRoot.querySelector("[data-listening-question-nav]")?.classList.add("hidden");
    listeningRoot.querySelector(".lc-review-workspace")?.remove();

    const transcript = combinedListeningTranscript(activeListeningTest);
    const hasTranscript = Boolean(String(transcript.text || "").trim() || transcript.segments.length);
    const questionResults = result.questionResults.map((item) => ({ ...item, hasTranscript }));
    const sourceQuestions = listeningRoot.querySelector(".lc-test-content");
    const workspace = document.createElement("main");
    workspace.className = `lc-review-workspace${hasTranscript ? "" : " lc-review-workspace--no-transcript"}`;
    const hasAudio = questionResults.some((item) => item.audioUrl);
    workspace.innerHTML = `
        ${hasAudio ? ReviewAudioPlayer(activeListeningTest) : ""}
        ${hasTranscript ? TranscriptPanel(transcript, questionResults) : ""}
        <section class="lc-review-detail-panel" aria-label="Listening questions review">
            <div class="lc-review-tabs" role="tablist" aria-label="Listening review sections">
                <button type="button" role="tab" aria-selected="true" data-review-tab="questions">Questions Review</button>
                <button type="button" role="tab" aria-selected="false" data-review-tab="vocabulary">Vocabulary</button>
            </div>
            <div class="lc-review-tab-panel" data-review-panel="questions">
                <div data-inline-questions-review-slot></div>
            </div>
            <div class="lc-review-tab-panel hidden" data-review-panel="vocabulary">${reviewVocabularyPanel(questionResults)}</div>
        </section>
        <div data-explanation-modal-slot></div>
    `;
    listeningRoot.querySelector(".lc-page")?.appendChild(workspace);
    const inlineReview = QuestionsReviewPanel(sourceQuestions, questionResults);
    if (inlineReview) workspace.querySelector("[data-inline-questions-review-slot]")?.appendChild(inlineReview);
    initializeReviewAudioPlayer(workspace, questionResults);

    workspace.addEventListener("click", (event) => {
        const tabButton = event.target.closest("[data-review-tab]");
        if (tabButton) {
            const selected = tabButton.dataset.reviewTab;
            workspace.querySelectorAll("[data-review-tab]").forEach((button) => {
                button.setAttribute("aria-selected", String(button === tabButton));
            });
            workspace.querySelectorAll("[data-review-panel]").forEach((panel) => {
                panel.classList.toggle("hidden", panel.dataset.reviewPanel !== selected);
            });
            return;
        }
        const explainButton = event.target.closest("[data-explain-question]");
        if (explainButton) {
            const item = questionResults.find((question) => Number(question.number) === Number(explainButton.dataset.explainQuestion));
            if (!item?.explanation) return;
            focusTranscriptQuestion(item.number);
            const slot = workspace.querySelector("[data-explanation-modal-slot]");
            slot.innerHTML = QuestionExplanationModal(item);
            slot.querySelector("[data-close-explanation]")?.focus();
            return;
        }
        const audioButton = event.target.closest("[data-play-review-audio]");
        if (audioButton) {
            const item = questionResults.find((question) => Number(question.number) === Number(audioButton.dataset.playReviewAudio));
            focusTranscriptQuestion(item?.number);
            playReviewAudio(item);
            return;
        }
        const audioAction = event.target.closest("[data-review-audio-action]");
        if (audioAction) {
            const audio = workspace.querySelector("[data-review-audio]");
            if (!audio) return;
            if (audioAction.dataset.reviewAudioAction === "play") {
                if (audio.paused) audio.play().catch(() => {});
                else audio.pause();
            }
            if (audioAction.dataset.reviewAudioAction === "back") audio.currentTime = Math.max(0, audio.currentTime - 5);
            if (audioAction.dataset.reviewAudioAction === "forward") {
                audio.currentTime = Math.min(Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + 5, audio.currentTime + 5);
            }
            return;
        }
        const modal = event.target.closest("[data-explanation-modal]");
        if (event.target.matches("[data-close-explanation]") || (modal && event.target === modal)) {
            workspace.querySelector("[data-explanation-modal-slot]").innerHTML = "";
        }
    });
    workspace.querySelector("[data-review-audio-seek]")?.addEventListener("input", (event) => {
        const audio = workspace.querySelector("[data-review-audio]");
        if (audio) audio.currentTime = Number(event.target.value) || 0;
    });
    workspace.querySelector("[data-review-audio-speed]")?.addEventListener("change", (event) => {
        const audio = workspace.querySelector("[data-review-audio]");
        if (audio) audio.playbackRate = Number(event.target.value) || 1;
    });
    workspace.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && workspace.querySelector("[data-explanation-modal]")) {
            workspace.querySelector("[data-explanation-modal-slot]").innerHTML = "";
        }
    });
}

function normalizeServerListeningScore(data) {
    const questionResults = (data.results || []).map((item) => {
        const correctAnswers = (Array.isArray(item.acceptedAnswers) ? item.acceptedAnswers : String(item.answer || "").split("|"))
            .map((answer) => String(answer || "").trim()).filter(Boolean);
        const isUnanswered = !normalizeAnswer(item.userAnswer);
        return {
            number: Number(item.number),
            partNumber: item.partNumber === null || item.partNumber === undefined ? null : Number(item.partNumber),
            questionText: String(item.questionText || `Question ${item.number}`),
            userAnswer: String(item.userAnswer || "").trim(),
            correctAnswers,
            mainAnswer: String(item.correctAnswer || correctAnswers[0] || ""),
            alternatives: correctAnswers.slice(1),
            acceptedAnswers: correctAnswers,
            relevantText: String(item.relevantText || ""),
            explanation: String(item.explanation || ""),
            transcriptText: String(item.transcriptText || ""),
            transcriptSegments: Array.isArray(item.transcriptSegments) ? item.transcriptSegments : [],
            transcriptSegmentIds: Array.isArray(item.transcriptSegmentIds) ? item.transcriptSegmentIds.map(String) : [],
            transcriptStartTime: item.transcriptStartTime === null || item.transcriptStartTime === undefined
                ? null : Number(item.transcriptStartTime),
            transcriptEndTime: item.transcriptEndTime === null || item.transcriptEndTime === undefined
                ? null : Number(item.transcriptEndTime),
            audioUrl: String(item.audioUrl || ""),
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
        attemptId: String(data.attemptId || ""),
        mistakeCount: Number(data.mistakeCount) || 0,
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
    window.dispatchEvent(new CustomEvent("ieltsx:mistakes-changed", {
        detail: { skill: "listening", count: Number(data.mistakeCount) || 0 }
    }));
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
        attemptId: result.attemptId,
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
