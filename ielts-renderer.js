/**
 * Vanilla IELTS CBT question renderer (templates + admin preview).
 */
const IeltsRenderer = (() => {
    const BLANK_PATTERN = /_{2,}|____+/;
    const SELECT_TYPES = [
        "matching_headings",
        "matching_information",
        "matching_features",
        "matching_sentence_endings",
        "matching",
        "map_labeling",
        "diagram_labeling"
    ];
    const RADIO_TYPES = [
        "true_false_not_given",
        "yes_no_not_given",
        "multiple_choice"
    ];
    const COMPLETION_TYPES = [
        "form_completion",
        "notes_completion",
        "sentence_completion",
        "summary_completion",
        "table_completion"
    ];

    function renderRichCompletion(contentHtml) {
        return (contentHtml || "").replace(/<span\s+class="ielts-blank"[^>]*data-blank="(\d+)"[^>]*>.*?<\/span>/gi, (match, number) => {
            return '<span class="cbt-blank-wrapper"><strong class="cbt-blank-number">' + number + '</strong><input type="text" class="ielts-blank-input" id="q' + number + '" name="q' + number + '" autocomplete="off"></span>';
        }).replace(/<span\s+class="ielts-blank"[^>]*>.*?<\/span>/gi, '______');
    }

    function extractFirstQuestionNumber(text) {
        const value = String(text || "").trim();
        if (!value) {
            return null;
        }
        const rangeMatch = value.match(/(?:questions?|boxes?)\s*(\d{1,2})\s*[-–]/i);
        if (rangeMatch) {
            return Number(rangeMatch[1]);
        }
        const singleMatch = value.match(/(?:questions?|boxes?)\s*(\d{1,2})\b/i);
        if (singleMatch) {
            return Number(singleMatch[1]);
        }
        const fallback = value.match(/\b(\d{1,2})\b/);
        return fallback ? Number(fallback[1]) : null;
    }

    function groupStartNumber(group) {
        const numbers = (group.questionNumbers || []).map(Number).filter(Number.isFinite);
        if (numbers.length) {
            return Math.min(...numbers);
        }
        const questionList = group.questions || [];
        if (questionList.length) {
            return Math.min(...questionList.map((q) => q.number).filter(Number.isFinite));
        }
        const fromTitle = extractFirstQuestionNumber(group.title || group.instructionTitle || "");
        return fromTitle !== null ? fromTitle : Number.MAX_SAFE_INTEGER;
    }

    function sortQuestionGroups(groups) {
        if (window.IeltsManualParser && window.IeltsManualParser.sortQuestionGroups) {
            return window.IeltsManualParser.sortQuestionGroups(groups);
        }
        return [...(groups || [])].sort((a, b) => groupStartNumber(a) - groupStartNumber(b));
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function optionValue(option) {
        const match = String(option || "").match(/^([A-Za-zivx]+)[\).:\s]/);
        return match ? match[1] : String(option || "").trim();
    }

    function defaultOptions(type) {
        if (type === "true_false_not_given") {
            return ["TRUE", "FALSE", "NOT GIVEN"];
        }

        if (type === "yes_no_not_given") {
            return ["YES", "NO", "NOT GIVEN"];
        }

        return [];
    }

    function blankInput(number) {
        return '<input type="text" class="ielts-blank-input" id="q' + number + '" name="q' + number + '" autocomplete="off">';
    }

    function renderRadioOptions(question) {
        const name = "q" + question.number;
        const options = (question.options || []).length
            ? question.options
            : defaultOptions(question.type);
        const items = options.map((option) => {
            return '<label class="ielts-option"><input type="radio" name="' + name + '" value="' +
                escapeHtml(optionValue(option)) + '"><span>' + escapeHtml(option) + '</span></label>';
        }).join("");
        const tag = "d" + "iv";
        return "<" + tag + ' class="ielts-option-list">' + items + "</" + tag + ">";
    }

    function renderSelect(question) {
        const options = question.options || [];
        const opts = ['<option value="">—</option>'].concat(options.map((option) => {
            const value = escapeHtml(optionValue(option));
            return '<option value="' + value + '">' + escapeHtml(option) + "</option>";
        }));
        return '<select class="ielts-select" id="q' + question.number + '">' + opts.join("") + "</select>";
    }

    function renderInlineCompletion(question) {
        const text = escapeHtml(question.question);

        if (BLANK_PATTERN.test(question.question)) {
            return '<p class="ielts-completion-line">' +
                text.replace(BLANK_PATTERN, blankInput(question.number)) + "</p>";
        }

        return '<p class="ielts-completion-line">' + text + "</p>" + blankInput(question.number);
    }

    function renderQuestionInput(question) {
        const type = question.type || "sentence_completion";

        if (RADIO_TYPES.includes(type)) {
            return renderRadioOptions(question);
        }

        if (SELECT_TYPES.includes(type)) {
            return renderSelect(question);
        }

        return renderInlineCompletion(question);
    }

    function renderQuestionStem(question) {
        const type = question.type || "";

        if (type === "sentence_completion" || type === "summary_completion") {
            return "";
        }

        return '<div class="ielts-question-stem"><span class="ielts-q-num">' + question.number +
            '.</span><span>' + escapeHtml(question.question) + "</span></div>";
    }

    function renderQuestion(question, typeOverride) {
        const type = normalizeQuestionType(typeOverride || question.type);
        const effectiveQuestion = type === question.type ? question : { ...question, type };

        return '<article class="ielts-question ielts-question--' + escapeHtml(type) +
            '" data-number="' + question.number + '">' +
            renderQuestionStem(effectiveQuestion) +
            renderQuestionInput(effectiveQuestion) +
            "</article>";
    }

    function normalizeQuestionType(type) {
        return String(type || "")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_");
    }

    function groupQuestionType(group, questions) {
        const explicitType = normalizeQuestionType(group.type || group.questionType);
        if (explicitType) {
            return explicitType;
        }

        const instructionText = [
            group.title,
            group.instructionTitle,
            group.instruction,
            group.instructionText,
            group.rule
        ].filter(Boolean).join(" ").toUpperCase();

        if (instructionText.includes("TRUE") && instructionText.includes("FALSE") && instructionText.includes("NOT GIVEN")) {
            return "true_false_not_given";
        }

        if (instructionText.includes("YES") && instructionText.includes("NO") && instructionText.includes("NOT GIVEN")) {
            return "yes_no_not_given";
        }

        const questionTypes = (questions || [])
            .map((question) => normalizeQuestionType(question.type))
            .filter(Boolean);

        return questionTypes.length && questionTypes.every((type) => type === questionTypes[0])
            ? questionTypes[0]
            : "";
    }

    function choicePromptMatches(type, text) {
        if (!/do\s+the\s+following\s+statements\s+agree/i.test(text || "")) return false;

        if (type === "yes_no_not_given") {
            return /claims?\s+of\s+(?:the\s+)?writer|writer[’']?s\s+claims|what\s+the\s+writer\s+thinks/i.test(text);
        }

        if (type === "true_false_not_given") {
            return /information\s+given/i.test(text);
        }

        return false;
    }

    function renderChoiceInstructionBlock(type, questions, options = {}) {
        const numbers = (questions || [])
            .map((question) => Number(question.number))
            .filter(Number.isFinite)
            .sort((a, b) => a - b);
        const first = numbers[0];
        const last = numbers[numbers.length - 1];
        const range = first === last ? String(first) : `${first} - ${last}`;
        const prompt = type === "yes_no_not_given"
            ? "Do the following statements agree with the claims of the writer in the reading passage?"
            : "Do the following statements agree with the information given in the reading passage?";
        const rows = type === "yes_no_not_given"
            ? [
                ["YES.", "if the statement agrees with the claims of the writer"],
                ["NO.", "if the statement contradicts the claims of the writer"],
                ["NOT GIVEN.", "if it is impossible to say what the writer thinks about this"]
            ]
            : [
                ["TRUE.", "if the statement agrees with the information"],
                ["FALSE.", "if the statement contradicts the information"],
                ["NOT GIVEN.", "if there is no information on this"]
            ];
        const lead = numbers.length
            ? `<p class="ielts-choice-instruction-lead">In boxes <strong>${range}</strong> on your answer sheet, write</p>`
            : "";

        return `${options.showPrompt === false ? "" : `<p class="ielts-choice-instruction-prompt">${prompt}</p>`}${lead}
            <div class="ielts-choice-definition-list" aria-label="${type === "yes_no_not_given" ? "YES NO NOT GIVEN" : "TRUE FALSE NOT GIVEN"} instructions">
                ${rows.map(([label, description]) => `<div class="ielts-choice-definition-row">
                    <strong>${label}</strong>
                    <span>${description}</span>
                </div>`).join("")}
            </div>`;
    }

    function highlightInstructionText(text) {
        return window.IeltsInstructionHighlighter
            ? window.IeltsInstructionHighlighter.highlightText(text, { preserveLineBreaks: true })
            : escapeHtml(text).replace(/\n/g, "<br>");
    }

    function renderInstructionBlock(group, questions) {
        const title = group.title || group.instructionTitle;
        const instruction = group.instruction || group.instructionText;
        const rule = group.rule;
        const type = groupQuestionType(group, questions);
        const tag = "d" + "iv";
        let html = "<" + tag + ' class="ielts-instruction-block">';

        if (title) {
            html += '<h3 class="ielts-group-title">' + escapeHtml(title) + "</h3>";
        }

        if (instruction) {
            html += '<p class="ielts-instruction-body">' +
                highlightInstructionText(instruction) + "</p>";
        }

        if (type === "true_false_not_given" || type === "yes_no_not_given") {
            const instructionText = [instruction, rule].filter(Boolean).join(" ");
            const hasChoiceDefinitions = /if\s+(?:the\s+statement|there\s+is|it\s+is|the\s+writer)/i.test(instructionText);
            const hasVisibleChoicePrompt = choicePromptMatches(type, instructionText);
            if (!hasChoiceDefinitions) {
                html += renderChoiceInstructionBlock(type, questions, {
                    showPrompt: !hasVisibleChoicePrompt
                });
            }
        } else if (rule) {
            html += '<p class="ielts-instruction-rule"><span>' + highlightInstructionText(rule) + "</span></p>";
        }

        html += "</" + tag + ">";
        return html;
    }

    function groupOptions(group, questions) {
        const source = (group.options || []).length
            ? group.options
            : ((questions || []).find((question) => (question.options || []).length)?.options || []);

        return source.filter((option, index) =>
            source.findIndex((candidate) => optionValue(candidate) === optionValue(option)) === index
        );
    }

    function renderGroupOptionsBox(group, questions) {
        const options = groupOptions(group, questions);
        if (!options.length) return "";

        return '<div class="ielts-group-options-box">' + options.map((option) =>
            '<span class="ielts-group-option-chip">' + escapeHtml(option) + "</span>"
        ).join("") + "</div>";
    }

    function renderMultiSelectGroup(group, questions) {
        const options = groupOptions(group, questions);
        const groupName = "group-" + questions.map((question) => question.number).join("-");

        return '<div class="ielts-multi-select-task">' +
            '<div class="ielts-multi-select-options">' +
            options.map((option) =>
                '<label class="ielts-multi-select-option"><input type="checkbox" name="' +
                escapeHtml(groupName) + '" value="' + escapeHtml(optionValue(option)) + '"><span>' +
                escapeHtml(option) + "</span></label>"
            ).join("") +
            "</div>" +
            '<div class="ielts-multi-select-slots">' +
            questions.map((question) =>
                '<span class="ielts-multi-select-slot" data-number="' + question.number + '">' +
                '<strong>' + question.number + "</strong><span>Select an option</span></span>"
            ).join("") +
            "</div></div>";
    }

    function renderQuestionGroup(group, questionMap) {
        const numbers = group.questionNumbers || (group.questions || []).map((q) => q.number);
        const questions = numbers
            .map((num) => questionMap.get(num) || (typeof num === "object" ? num : null))
            .filter(Boolean);
        const type = groupQuestionType(group, questions);
        let html = '<section class="ielts-question-group ielts-question-group--' + escapeHtml(type) + '">';
        html += renderInstructionBlock(group, questions);

        const isRichCompletion = group.contentHtml && COMPLETION_TYPES.includes(type);

        if (group.contentHtml) {
            if (isRichCompletion) {
                html += '<div class="ielts-rich-completion">' + renderRichCompletion(group.contentHtml) + '</div>';
            } else {
                html += '<div class="ielts-group-content-html">' + group.contentHtml + '</div>';
            }
        } else if (SELECT_TYPES.includes(type)) {
            html += renderGroupOptionsBox(group, questions);
        }

        if (type === "multi_select") {
            html += renderMultiSelectGroup(group, questions);
        } else if (!isRichCompletion) {
            html += '<div class="ielts-question-list">';
            questions.forEach((question) => {
                html += renderQuestion(question, type);
            });
            html += "</div>";
        }

        html += "</section>";
        return html;
    }

    function renderPassage(passage) {
        return String(passage || "")
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => "<p>" + escapeHtml(p) + "</p>")
            .join("");
    }

    function renderReadingTest(test) {
        const questionMap = new Map((test.questions || []).map((q) => [q.number, q]));
        const groups = test.questionGroups && test.questionGroups.length
            ? test.questionGroups
            : [{ title: "Questions", questionNumbers: (test.questions || []).map((q) => q.number) }];
        const panel = "d" + "iv";

        return '<' + panel + ' class="ielts-reading-layout">' +
            '<' + panel + ' class="ielts-passage-panel">' + renderPassage(test.passage) + "</" + panel + ">" +
            '<' + panel + ' class="ielts-questions-panel">' +
            groups.map((group) => renderQuestionGroup(group, questionMap)).join("") +
            "</" + panel + "></" + panel + ">";
    }

    function renderListeningTest(test) {
        const questionMap = new Map((test.questions || []).map((q) => [q.number, q]));
        const sections = sortQuestionGroups(
            test.sections && test.sections.length
                ? test.sections
                : [{ title: test.title, questionNumbers: (test.questions || []).map((q) => q.number) }]
        );

        return sections.map((section) => renderQuestionGroup(section, questionMap)).join("");
    }

    function normalizeAnswer(value) {
        return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    }

    function acceptedAnswers(answer) {
        return String(answer || "").split("|").map(normalizeAnswer).filter(Boolean);
    }

    function getUserAnswer(question) {
        const type = question.type || "";

        if (RADIO_TYPES.includes(type)) {
            const selected = document.querySelector('input[name="q' + question.number + '"]:checked');
            return selected ? selected.value : "";
        }

        const input = document.getElementById("q" + question.number);
        return input ? input.value : "";
    }

    function scoreQuestions(questions, root) {
        const scope = root || document;
        let correct = 0;

        questions.forEach((question) => {
            const card = scope.querySelector('[data-number="' + question.number + '"]');
            const userAnswer = normalizeAnswer(getUserAnswer(question));
            const isCorrect = acceptedAnswers(question.answer).includes(userAnswer);

            if (card) {
                card.classList.toggle("ielts-correct", isCorrect);
                card.classList.toggle("ielts-wrong", !isCorrect);
            }

            if (isCorrect) {
                correct += 1;
            }
        });

        return { correct, total: questions.length };
    }

    return {
        escapeHtml,
        renderPassage,
        renderQuestion,
        renderQuestionGroup,
        renderReadingTest,
        renderListeningTest,
        getUserAnswer,
        scoreQuestions,
        normalizeAnswer,
        acceptedAnswers,
        sortQuestionGroups,
        groupStartNumber
    };
})();

if (typeof window !== "undefined") {
    window.IeltsRenderer = IeltsRenderer;
}
