(() => {
    const READING_BANDS = [
        [39, "9"], [37, "8.5"], [35, "8"], [33, "7.5"], [30, "7"],
        [27, "6.5"], [23, "6"], [19, "5.5"], [15, "5"], [13, "4.5"],
        [10, "4"], [8, "3.5"], [6, "3"], [4, "2.5"], [0, "0-2"]
    ];
    const LISTENING_BANDS = [
        [39, "9"], [37, "8.5"], [35, "8"], [32, "7.5"], [30, "7"],
        [26, "6.5"], [23, "6"], [18, "5.5"], [16, "5"], [13, "4.5"],
        [10, "4"], [6, "3.5"], [4, "3"], [0, "2.5"]
    ];

    function normalizeAnswer(value) {
        return String(value ?? "")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase()
            .replace(/[’‘]/g, "'")
            .replace(/&/g, " and ")
            .replace(/['"“”`´.,;:!?()[\]{}]/g, " ")
            .replace(/[-–—/\\]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function numericValue(value) {
        const normalized = normalizeAnswer(String(value ?? "").replace(/,/g, "")).replace(/\s+/g, "");
        if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
        const number = Number(normalized);
        return Number.isFinite(number) ? number : null;
    }

    function splitAnswerText(value) {
        return String(value ?? "")
            .split(/\s*(?:\||;|\n|\bor\b)\s*/i)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    function acceptedAnswers(answer) {
        if (Array.isArray(answer)) {
            return answer.flatMap(acceptedAnswers);
        }

        if (answer && typeof answer === "object") {
            return acceptedAnswers(answer.value || answer.label || answer.answer || "");
        }

        return splitAnswerText(answer);
    }

    function questionAcceptedAnswers(question) {
        const values = [
            question?.answer,
            question?.correctAnswer,
            question?.acceptedAnswer,
            question?.acceptedAnswers,
            question?.answers,
            question?.answerKey
        ];

        return values.flatMap(acceptedAnswers).filter(Boolean);
    }

    function answersMatch(userAnswer, accepted) {
        const normalizedUser = normalizeAnswer(userAnswer);
        if (!normalizedUser) return false;

        const userNumber = numericValue(userAnswer);
        return accepted.some((answer) => {
            const normalizedAccepted = normalizeAnswer(answer);
            if (!normalizedAccepted) return false;
            if (normalizedUser === normalizedAccepted) return true;

            const acceptedNumber = numericValue(answer);
            return userNumber !== null &&
                acceptedNumber !== null &&
                Math.abs(userNumber - acceptedNumber) < 0.000001;
        });
    }

    function evaluateAnswer(question, userAnswer, acceptedOverride) {
        const accepted = (acceptedOverride || questionAcceptedAnswers(question))
            .map((answer) => String(answer ?? "").trim())
            .filter(Boolean);
        const normalizedUser = normalizeAnswer(userAnswer);
        const isUnanswered = !normalizedUser;
        const isCorrect = !isUnanswered && answersMatch(userAnswer, accepted);

        return {
            number: Number(question?.number || question?.questionNumber),
            userAnswer: String(userAnswer ?? "").trim(),
            correctAnswers: accepted,
            mainAnswer: accepted[0] || "",
            alternatives: accepted.slice(1),
            status: isUnanswered ? "unanswered" : (isCorrect ? "correct" : "incorrect"),
            isCorrect,
            isUnanswered
        };
    }

    function summarizeResults(questionResults, skill) {
        const results = questionResults || [];
        const correct = results.filter((item) => item.status === "correct").length;
        const unanswered = results.filter((item) => item.status === "unanswered").length;
        const total = results.length;

        return {
            correct,
            incorrect: Math.max(0, total - correct - unanswered),
            unanswered,
            total,
            normalizedScore: normalizeToForty(correct, total),
            band: estimateBand(correct, total, skill),
            questionResults: results
        };
    }

    function normalizeToForty(correct, total) {
        return total ? Math.round((correct / total) * 40) : 0;
    }

    function estimateBand(correct, total, skill = "reading") {
        const scaledCorrect = normalizeToForty(correct, total);
        const table = skill === "listening" ? LISTENING_BANDS : READING_BANDS;
        return table.find(([minimum]) => scaledCorrect >= minimum)?.[1] || "0-2";
    }

    function formatAnswer(value) {
        const text = String(value ?? "").trim();
        return text || "\u2014";
    }

    const AUTO_SUBMIT_MESSAGE = "Time is over. Your test has been submitted automatically.";

    function disableAnswerInputs(root = document) {
        const scope = root?.querySelectorAll ? root : document;
        scope.querySelectorAll([
            ".answer-input",
            ".listening-answer",
            ".lc-answer-input",
            ".lc-inline-select",
            ".cbt-blank-input",
            ".cbt-select",
            "input[type='radio']",
            "input[type='checkbox']",
            "input[id^='q']:not([type='range'])",
            "input[name^='q']:not([type='range'])",
            "select[name^='q']",
            "textarea[name^='q']"
        ].join(",")).forEach((field) => {
            field.readOnly = true;
            field.disabled = true;
            field.setAttribute("aria-disabled", "true");
        });
    }

    function stopAudioPlayers(root = document) {
        const scope = root?.querySelectorAll ? root : document;
        scope.querySelectorAll("audio").forEach((audio) => {
            try {
                audio.pause();
            } catch {
                // The audio element may be detached during route changes.
            }
        });
        scope.querySelectorAll(".lc-play-button, #play-pause-btn, #start-listening-btn").forEach((button) => {
            button.disabled = true;
            button.setAttribute("aria-disabled", "true");
        });
    }

    window.IeltsResultUtils = {
        normalizeAnswer,
        acceptedAnswers,
        questionAcceptedAnswers,
        answersMatch,
        evaluateAnswer,
        summarizeResults,
        normalizeToForty,
        estimateBand,
        formatAnswer,
        AUTO_SUBMIT_MESSAGE,
        disableAnswerInputs,
        stopAudioPlayers
    };
})();
