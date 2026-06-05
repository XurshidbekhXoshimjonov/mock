/* global React */
(() => {
const { createElement: h, Fragment, useEffect, useMemo, useRef } = React;

function SafeHtml({ html, className, tag: Tag = "div" }) {
    if (!html) return null;
    return h(Tag, { className, dangerouslySetInnerHTML: { __html: html } });
}

function normalizeOption(option) {
    if (typeof option === "object" && option !== null) {
        return {
            value: String(option.value || option.label || ""),
            label: option.label || option.value || "",
            html: option.html || ""
        };
    }

    const label = String(option || "");
    const value = label.match(/^([A-Za-z0-9ivx]+)[\).:\s]/)?.[1] || label;
    return { value, label, html: "" };
}

function normalizeQuestionType(type) {
    return String(type || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function inferredType(question, groupType) {
    const type = normalizeQuestionType(groupType || question.type || "sentence_completion");
    const labels = (question.options || []).map((option) => normalizeOption(option).label.toUpperCase());

    if (labels.includes("TRUE") && labels.includes("FALSE")) return "true_false_not_given";
    if (labels.includes("YES") && labels.includes("NO")) return "yes_no_not_given";
    if (type === "flow_chart_completion") return "flowchart_completion";
    return type;
}

function questionStem(question) {
    return question.stemHtml || question.question || "";
}

function QuestionBadge({ number }) {
    return h("span", { className: "cbt-question-badge" }, number);
}

function QuestionShell({ question, children, className = "" }) {
    return h("article", {
        className: `cbt-question ${className}`.trim(),
        "data-number": question.number
    }, children);
}

function Stem({ question }) {
    return h("div", { className: "cbt-question-line" },
        h(QuestionBadge, { number: question.number }),
        question.stemHtml
            ? h(SafeHtml, { html: question.stemHtml, tag: "div", className: "cbt-question-copy" })
            : h("div", { className: "cbt-question-copy" }, question.question || "")
    );
}

function TFNGRenderer({ question, value, onAnswer, groupType }) {
    const type = inferredType(question, groupType);
    const defaults = type === "yes_no_not_given"
        ? ["YES", "NO", "NOT GIVEN"]
        : ["TRUE", "FALSE", "NOT GIVEN"];
    const options = (question.options || []).length ? question.options : defaults;

    return h(QuestionShell, { question, className: "cbt-question--choice" },
        h(Stem, { question }),
        h("div", { className: "cbt-options cbt-options--horizontal" },
            options.map((raw) => {
                const option = normalizeOption(raw);
                return h("label", {
                    key: option.value,
                    className: `cbt-option-card${value === option.value ? " selected" : ""}`
                },
                    h("input", {
                        type: "radio",
                        name: `q${question.number}`,
                        value: option.value,
                        checked: value === option.value,
                        onChange: () => onAnswer(question.number, option.value)
                    }),
                    h("span", null, option.label)
                );
            })
        )
    );
}

function MultipleChoiceRenderer({ question, value, onAnswer }) {
    return h(QuestionShell, { question, className: "cbt-question--choice" },
        h(Stem, { question }),
        h("div", { className: "cbt-options cbt-options--stacked" },
            (question.options || []).map((raw) => {
                const option = normalizeOption(raw);
                return h("label", {
                    key: option.value,
                    className: `cbt-option-card cbt-option-card--wide${value === option.value ? " selected" : ""}`
                },
                    h("input", {
                        type: "radio",
                        name: `q${question.number}`,
                        value: option.value,
                        checked: value === option.value,
                        onChange: () => onAnswer(question.number, option.value)
                    }),
                    option.html
                        ? h(SafeHtml, { html: option.html, tag: "span" })
                        : h("span", null, option.label)
                );
            })
        )
    );
}

function uniqueOptions(options) {
    return (options || []).map(normalizeOption).filter((option, index, list) =>
        option.value && list.findIndex((candidate) => candidate.value === option.value) === index
    );
}

function matchingOptions(question, group) {
    const source = (question.options || []).length
        ? question.options
        : (group.options || group.headings || group.matchingOptions || group.listOfHeadings || []);
    const normalized = source.map(normalizeOption);
    if (normalized.length || !group.layoutHtml || typeof DOMParser === "undefined") return normalized;

    const documentFragment = new DOMParser().parseFromString(group.layoutHtml, "text/html");
    return [...documentFragment.querySelectorAll(
        "select option:not([value='']), .heading-list li, .headings li, .drag-item, .matching-option, .clickable-cell[data-value]"
    )]
        .map((element) => {
            const value = element.getAttribute("value") || element.getAttribute("data-value") || element.textContent.trim();
            return normalizeOption({ value, label: element.textContent.trim() || value });
        })
        .filter((option, index, list) =>
            option.label && list.findIndex((candidate) => candidate.value === option.value) === index
        );
}

function MatchingRenderer({ question, group, value, onAnswer }) {
    const options = matchingOptions(question, group);
    return h(QuestionShell, { question, className: "cbt-question--matching" },
        h(Stem, { question }),
        h("select", {
            className: "cbt-select",
            value: value || "",
            onChange: (event) => onAnswer(question.number, event.target.value),
            "aria-label": `Answer for question ${question.number}`
        },
            h("option", { value: "" }, "Select answer"),
            options.map((option) =>
                h("option", { key: option.value, value: option.value }, option.label)
            )
        )
    );
}

function GroupOptionsBox({ group }) {
    const questionOptions = (group.questions || []).find((question) => (question.options || []).length)?.options || [];
    const options = uniqueOptions(
        group.options || group.headings || group.matchingOptions || group.listOfHeadings || questionOptions
    );
    if (!options.length) return null;

    return h("div", { className: "cbt-group-options-box", "aria-label": "Available options" },
        options.map((option) =>
            h("span", { key: option.value, className: "cbt-group-option-chip" }, option.label)
        )
    );
}

function MultiSelectGroupRenderer({ group, answers, onAnswer }) {
    const questions = group.questions || [];
    const questionOptions = questions.find((question) => (question.options || []).length)?.options || [];
    const options = uniqueOptions(group.options || group.multiSelectOptions || questionOptions);
    const selected = questions
        .map((question) => String(answers[question.number] || ""))
        .filter(Boolean);
    const selectedSet = new Set(selected);

    function toggleOption(optionValue, checked) {
        if (!onAnswer) return;

        if (checked) {
            if (selectedSet.has(optionValue) || selected.length >= questions.length) return;
            const emptyQuestion = questions.find((question) => !String(answers[question.number] || ""));
            if (emptyQuestion) onAnswer(emptyQuestion.number, optionValue);
            return;
        }

        const answeredQuestion = questions.find(
            (question) => String(answers[question.number] || "") === optionValue
        );
        if (answeredQuestion) onAnswer(answeredQuestion.number, "");
    }

    return h("div", { className: "cbt-multi-select-task" },
        h("div", { className: "cbt-multi-select-options", role: "group", "aria-label": "Select answers" },
            options.map((option) =>
                h("label", {
                    key: option.value,
                    className: `cbt-option-card cbt-option-card--checkbox${selectedSet.has(option.value) ? " selected" : ""}`
                },
                    h("input", {
                        type: "checkbox",
                        value: option.value,
                        checked: selectedSet.has(option.value),
                        disabled: !selectedSet.has(option.value) && selected.length >= questions.length,
                        onChange: (event) => toggleOption(option.value, event.target.checked)
                    }),
                    option.html
                        ? h(SafeHtml, { html: option.html, tag: "span" })
                        : h("span", null, option.label)
                )
            )
        ),
        h("div", { className: "cbt-multi-select-slots" },
            questions.map((question) =>
                h("div", { key: question.number, className: "cbt-multi-select-slot", "data-number": question.number },
                    h(QuestionBadge, { number: question.number }),
                    h("span", null, answers[question.number] || "Select an option")
                )
            )
        ),
        h("p", { className: "cbt-multi-select-count" }, `${selected.length} of ${questions.length} selected`)
    );
}

function CompletionInput({ question, value, onAnswer, inline = false }) {
    return h("input", {
        type: "text",
        className: inline ? "cbt-blank-input cbt-blank-input--inline" : "cbt-blank-input",
        value: value || "",
        onChange: (event) => onAnswer(question.number, event.target.value),
        autoComplete: "off",
        placeholder: inline ? "" : "Type your answer",
        "aria-label": `Answer for question ${question.number}`
    });
}

function SentenceCompletionRenderer({ question, value, onAnswer }) {
    const stem = questionStem(question);
    const blankPattern = /_{3,}|<span[^>]*class=["'][^"']*ielts-blank[^"']*["'][^>]*>.*?<\/span>/i;
    const hasInlineBlank = blankPattern.test(stem);

    if (!hasInlineBlank) {
        return h(QuestionShell, { question, className: "cbt-question--completion" },
            h(Stem, { question }),
            h(CompletionInput, { question, value, onAnswer })
        );
    }

    const parts = stem.split(blankPattern);
    return h(QuestionShell, { question, className: "cbt-question--completion" },
        h("div", { className: "cbt-question-line" },
            h(QuestionBadge, { number: question.number }),
            h("div", { className: "cbt-question-copy cbt-completion-copy" },
                h(SafeHtml, { html: parts[0] || "", tag: "span" }),
                h(CompletionInput, { question, value, onAnswer, inline: true }),
                h(SafeHtml, { html: parts.slice(1).join(" ") || "", tag: "span" })
            )
        )
    );
}

function RichCompletionRenderer({ contentHtml, questions, answers, onAnswer, className = "" }) {
    const ref = useRef(null);
    const numberKey = (questions || []).map((question) => question.number).join(",");

    useEffect(() => {
        const root = ref.current;
        if (!root) return undefined;

        const markers = [...new Set([
            ...root.querySelectorAll("[data-blank]"),
            ...root.querySelectorAll(".ielts-blank")
        ])];

        markers.forEach((marker, index) => {
            if (marker.matches("input")) return;
            const markerNumber = Number(marker.getAttribute("data-blank"));
            const question = (questions || []).find((item) => item.number === markerNumber) || (questions || [])[index];
            if (!question) return;

            const input = document.createElement("input");
            input.type = "text";
            input.className = "cbt-blank-input cbt-blank-input--inline";
            input.value = answers[question.number] || "";
            input.setAttribute("aria-label", `Answer for question ${question.number}`);
            input.addEventListener("input", (event) => onAnswer(question.number, event.target.value));
            marker.replaceWith(input);
        });

        return undefined;
    }, [contentHtml, numberKey]);

    useEffect(() => {
        const inputs = ref.current?.querySelectorAll(".cbt-blank-input") || [];
        inputs.forEach((input, index) => {
            const question = (questions || [])[index];
            if (question && input.value !== (answers[question.number] || "")) {
                input.value = answers[question.number] || "";
            }
        });
    }, [answers, numberKey]);

    return h("div", {
        ref,
        className: `cbt-rich-completion ${className}`.trim(),
        dangerouslySetInnerHTML: { __html: contentHtml || "" }
    });
}

function DiagramLabelingRenderer({ group, images, answers, onAnswer }) {
    const groupImages = (group.imageIds || [])
        .map((id) => images.find((image) => image.id === id))
        .filter(Boolean);

    return h("div", { className: "cbt-diagram-task" },
        groupImages.map((image) =>
            h("div", { key: image.id, className: "cbt-diagram-canvas" },
                h("img", { src: image.src, alt: image.alt || "IELTS diagram" }),
                (group.questions || []).filter((question) => question.position || question.hotspot).map((question) => {
                    const position = question.position || question.hotspot;
                    return h("label", {
                        key: question.number,
                        className: "cbt-diagram-hotspot",
                        style: { left: `${position.x}%`, top: `${position.y}%` }
                    },
                        h(QuestionBadge, { number: question.number }),
                        h(CompletionInput, {
                            question,
                            value: answers[question.number],
                            onAnswer,
                            inline: true
                        })
                    );
                })
            )
        ),
        h("div", { className: "cbt-diagram-fallback" },
            (group.questions || []).filter((question) => !(question.position || question.hotspot)).map((question) =>
                h(SentenceCompletionRenderer, {
                    key: question.number,
                    question,
                    value: answers[question.number],
                    onAnswer
                })
            )
        )
    );
}

function GroupMedia({ group, images }) {
    const groupImages = (group.imageIds || [])
        .map((id) => images.find((image) => image.id === id))
        .filter(Boolean);
    if (!groupImages.length) return null;

    return h("div", { className: "cbt-group-media" },
        groupImages.map((image) =>
            h("img", { key: image.id, src: image.src, alt: image.alt || "IELTS question image" })
        )
    );
}

function groupChoiceInstructionType(group) {
    const supportedTypes = ["true_false_not_given", "yes_no_not_given"];
    const explicitType = normalizeQuestionType(group.type || group.questionType);

    if (supportedTypes.includes(explicitType)) return explicitType;

    const instruction = group.instructionHtml || {};
    const groupText = [
        instruction.bodyHtml,
        instruction.rulesHtml,
        group.instructionText,
        group.instruction,
        group.rule
    ].filter((value) => typeof value === "string").join(" ").toUpperCase();

    if (groupText.includes("TRUE") && groupText.includes("FALSE") && groupText.includes("NOT GIVEN")) {
        return "true_false_not_given";
    }
    if (groupText.includes("YES") && groupText.includes("NO") && groupText.includes("NOT GIVEN")) {
        return "yes_no_not_given";
    }

    const questionTypes = (group.questions || []).map((question) => inferredType(question));
    if (!questionTypes.length || !questionTypes.every((type) => type === questionTypes[0])) return null;

    return supportedTypes.includes(questionTypes[0]) ? questionTypes[0] : null;
}

function groupQuestionType(group) {
    const explicitType = normalizeQuestionType(group.type || group.questionType);
    if (explicitType) return explicitType;

    const choiceType = groupChoiceInstructionType(group);
    if (choiceType) return choiceType;

    const questionTypes = (group.questions || [])
        .map((question) => inferredType(question))
        .filter(Boolean);

    return questionTypes.length && questionTypes.every((type) => type === questionTypes[0])
        ? questionTypes[0]
        : "";
}

function ChoiceInstructionBlock({ type, questions, showLead }) {
    const numbers = (questions || [])
        .map((question) => Number(question.number))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    const first = numbers[0];
    const last = numbers[numbers.length - 1];
    const range = first === last ? String(first) : `${first}-${last}`;
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

    return h("div", { className: "cbt-choice-instructions" },
        showLead && numbers.length
            ? h("p", { className: "cbt-choice-instructions-lead" },
                `In boxes ${range} on your answer sheet, write`
            )
            : null,
        h("div", { className: "cbt-choice-definition-list" },
            rows.map(([label, description]) =>
                h("div", { key: label, className: "cbt-choice-definition-row" },
                    h("strong", null, label),
                    h("span", null, description)
                )
            )
        )
    );
}

function InstructionRenderer({ group }) {
    const instruction = group.instructionHtml || {};
    const title = group.instructionTitle || group.title || group.instruction?.title;
    const body = instruction.bodyHtml || group.instructionText || group.instruction;
    const rules = instruction.rulesHtml || group.rule;
    const bodyHtml = instruction.bodyHtml && title
        ? instruction.bodyHtml.replace(
            /<p[^>]*>\s*<strong[^>]*>\s*Questions?\s+\d+(?:\s*[-–]\s*\d+)?\s*<\/strong>\s*(?:<br\s*\/?>)?/i,
            "<p>"
        )
        : instruction.bodyHtml;
    const choiceType = groupChoiceInstructionType(group);
    const instructionText = [bodyHtml, body, rules].filter(Boolean).join(" ");
    const visibleBodyText = [bodyHtml, body].filter(Boolean).join(" ");
    const hasChoiceDefinitions = /if\s+(?:the\s+statement|there\s+is|it\s+is|the\s+writer)/i.test(instructionText);
    const hasVisibleChoiceLead = /in\s+boxes?\s+\d/i.test(visibleBodyText);
    const showAutomaticChoiceInstructions = choiceType && !hasChoiceDefinitions;

    return h("header", { className: "cbt-group-instructions" },
        instruction.titleHtml
            ? h(SafeHtml, { html: instruction.titleHtml, className: "cbt-group-title" })
            : (title ? h("h3", { className: "cbt-group-title" }, title) : null),
        bodyHtml
            ? h(SafeHtml, { html: bodyHtml, className: "cbt-instruction-copy" })
            : (body ? h("p", { className: "cbt-instruction-copy" }, body) : null),
        showAutomaticChoiceInstructions
            ? h(ChoiceInstructionBlock, {
                type: choiceType,
                questions: group.questions || [],
                showLead: !hasVisibleChoiceLead
            })
            : (rules
            ? (instruction.rulesHtml
                ? h(SafeHtml, { html: instruction.rulesHtml, className: "cbt-rule-box" })
                : h("p", { className: "cbt-rule-box" }, rules))
            : null)
    );
}

function QuestionRenderer({ question, group, value, onAnswer }) {
    const type = inferredType(question, group.type || group.questionType);

    if (type === "true_false_not_given" || type === "yes_no_not_given") {
        return h(TFNGRenderer, { question, value, onAnswer, groupType: type });
    }
    if (type === "multiple_choice") {
        return h(MultipleChoiceRenderer, { question, value, onAnswer });
    }
    if ([
        "matching",
        "matching_headings",
        "matching_information",
        "matching_features",
        "matching_sentence_endings",
        "map_labeling",
        "plan_labeling"
    ].includes(type)) {
        return h(MatchingRenderer, { question, group, value, onAnswer });
    }

    return h(SentenceCompletionRenderer, { question, value, onAnswer });
}

function QuestionGroupRenderer({ group, images, answers, onAnswer }) {
    const type = groupQuestionType(group) || "sentence_completion";
    const effectiveGroup = normalizeQuestionType(group.type) === type ? group : { ...group, type };
    const questions = group.questions || [];
    const isDiagram = type === "diagram_labeling";
    const isMultiSelect = type === "multi_select";
    const showGroupOptions = [
        "matching",
        "matching_headings",
        "matching_information",
        "matching_features",
        "matching_sentence_endings"
    ].includes(type);
    const isRichCompletion = Boolean(group.contentHtml) && [
        "summary_completion",
        "table_completion",
        "form_completion",
        "notes_completion",
        "flowchart_completion",
        "flow_chart_completion",
        "sentence_completion"
    ].includes(type);

    return h("section", { className: `cbt-question-group cbt-question-group--${type}` },
        h(InstructionRenderer, { group: effectiveGroup }),
        !isDiagram ? h(GroupMedia, { group: effectiveGroup, images }) : null,
        showGroupOptions ? h(GroupOptionsBox, { group: effectiveGroup }) : null,
        isDiagram
            ? h(DiagramLabelingRenderer, { group: effectiveGroup, images, answers, onAnswer })
            : (isMultiSelect
                ? h(MultiSelectGroupRenderer, { group: effectiveGroup, answers, onAnswer })
                : (isRichCompletion
                ? h(RichCompletionRenderer, {
                    contentHtml: group.contentHtml,
                    questions,
                    answers,
                    onAnswer,
                    className: type === "table_completion" ? "cbt-rich-completion--table" : ""
                })
                : h("div", { className: "cbt-question-list" },
                    questions.map((question) =>
                        h(QuestionRenderer, {
                            key: question.number,
                            question,
                            group: effectiveGroup,
                            value: answers[question.number],
                            onAnswer
                        })
                    )
                )))
    );
}

function groupStartNumber(group) {
    const numbers = (group.questionNumbers || [])
        .map(Number)
        .filter(Number.isFinite);
    if (numbers.length) return Math.min(...numbers);

    const questionNumbers = (group.questions || [])
        .map((question) => Number(question.number))
        .filter(Number.isFinite);
    if (questionNumbers.length) return Math.min(...questionNumbers);

    const title = group.instructionTitle || group.title || "";
    return Number(title.match(/\d{1,2}/)?.[0]) || Number.MAX_SAFE_INTEGER;
}

function sortQuestionGroups(groups) {
    return [...(groups || [])].sort((a, b) => groupStartNumber(a) - groupStartNumber(b));
}

function QuestionsPanel({ groups, images = [], answers = {}, onAnswer }) {
    return h("div", { className: "cbt-questions-inner" },
        (groups || []).map((group, index) =>
            h(QuestionGroupRenderer, {
                key: group.id || group.groupId || `group-${index}`,
                group,
                images,
                answers,
                onAnswer
            })
        )
    );
}

function PassageRenderer({ passage }) {
    if (!passage) return null;

    const paragraphs = passage.paragraphs?.length
        ? passage.paragraphs
        : String(passage.passageText || "")
            .split(/\n{2,}/)
            .map((text) => ({ text, html: "" }))
            .filter((paragraph) => paragraph.text.trim());

    return h("article", { className: "cbt-passage" },
        h("div", { className: "cbt-passage-kicker" },
            h("span", { className: "cbt-book-icon", "aria-hidden": "true" }, "▢"),
            h("span", null, passage.displayLabel || `Reading Passage ${passage.number || 1}`)
        ),
        h("h1", { className: "cbt-passage-title" },
            passage.title || passage.passageTitle || `Reading Passage ${passage.number || 1}`
        ),
        passage.audio
            ? h("audio", { className: "cbt-audio-player", controls: true, src: passage.audio })
            : null,
        h("div", { className: "cbt-passage-copy" },
            paragraphs.map((paragraph, index) =>
                h("section", {
                    key: `${paragraph.letter || "p"}-${index}`,
                    className: `cbt-passage-paragraph${paragraph.letter ? " lettered" : ""}`
                },
                    paragraph.letter
                        ? h("strong", { className: "cbt-paragraph-letter" }, paragraph.letter)
                        : null,
                    paragraph.html
                        ? h(SafeHtml, {
                            html: paragraph.letter
                                ? paragraph.html.replace(new RegExp(`^\\s*<strong[^>]*>\\s*${paragraph.letter}[\\).]?\\s*</strong>\\s*`, "i"), "")
                                : paragraph.html,
                            className: "cbt-paragraph-html"
                        })
                        : h("p", null, paragraph.text || "")
                )
            )
        )
    );
}

window.IeltsTestComponents = {
    SafeHtml,
    PassageRenderer,
    QuestionsPanel,
    QuestionGroupRenderer,
    QuestionRenderer,
    TFNGRenderer,
    MultipleChoiceRenderer,
    MultiSelectGroupRenderer,
    MatchingRenderer,
    SentenceCompletionRenderer,
    RichCompletionRenderer,
    DiagramLabelingRenderer,
    sortQuestionGroups,
    groupStartNumber
};
})();
