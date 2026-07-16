/* global React */
(() => {
const { createElement: h, Fragment, useEffect, useMemo, useRef } = React;

function escapeInstructionHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function highlightInstructionHtml(html) {
    return window.IeltsInstructionHighlighter
        ? window.IeltsInstructionHighlighter.highlightHtml(html)
        : (html || "");
}

function highlightInstructionText(text) {
    return window.IeltsInstructionHighlighter
        ? window.IeltsInstructionHighlighter.highlightText(text)
        : escapeInstructionHtml(text);
}

function SafeHtml({ html, className, tag: Tag = "div", highlightInstructions = false }) {
    if (!html) return null;
    const renderedHtml = highlightInstructions ? highlightInstructionHtml(html) : html;
    return h(Tag, { className, dangerouslySetInnerHTML: { __html: renderedHtml } });
}

function stripEmbeddedParagraphLetter(html, letter) {
    const normalizedLetter = String(letter || "").trim();
    if (!html || !normalizedLetter) return html || "";

    if (typeof DOMParser !== "undefined") {
        const parser = new DOMParser();
        const documentFragment = parser.parseFromString(`<body>${html}</body>`, "text/html");
        const contentRoot = documentFragment.body.firstElementChild || documentFragment.body;
        const embeddedLabel = contentRoot.firstElementChild;

        if (
            embeddedLabel?.matches?.("span.letter, strong.letter, .paragraph-letter") &&
            embeddedLabel.textContent.trim().replace(/[).]$/, "") === normalizedLetter
        ) {
            embeddedLabel.remove();
            return documentFragment.body.innerHTML;
        }
    }

    const escapedLetter = normalizedLetter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const openingWrapper = "(\\s*(?:<p\\b[^>]*>\\s*)?)";
    const strongLabel = `<strong\\b[^>]*>\\s*${escapedLetter}[\\).]?\\s*</strong>`;
    const spanLabel = `<span\\b(?=[^>]*\\bclass\\s*=\\s*["'][^"']*\\bletter\\b[^"']*["'])[^>]*>\\s*${escapedLetter}[\\).]?\\s*</span>`;

    return String(html).replace(
        new RegExp(`^${openingWrapper}(?:${strongLabel}|${spanLabel})\\s*`, "i"),
        "$1"
    );
}

function normalizeOption(option) {
    if (typeof option === "object" && option !== null) {
        const value = option.value ?? option.letter ?? option.key ?? option.id ?? option.label ?? option.text ?? "";
        const text = option.label ?? option.text ?? option.value ?? option.letter ?? "";
        const letter = String(option.letter ?? "").trim();
        const label = letter && String(text).trim() && !String(text).trim().toUpperCase().startsWith(`${letter.toUpperCase()} `)
            ? `${letter} ${String(text).trim()}`
            : String(text || value);
        return {
            value: String(value),
            label,
            html: option.html || ""
        };
    }

    const label = String(option || "");
    const normalizedLabel = label.trim().toUpperCase();
    if (["TRUE", "FALSE", "YES", "NO", "NOT GIVEN"].includes(normalizedLabel)) {
        return { value: normalizedLabel, label: normalizedLabel, html: "" };
    }

    const value = label.match(/^([A-Za-z0-9ivx]+)[\).:\s]/)?.[1] || label;
    return { value, label, html: "" };
}

function normalizeQuestionType(type) {
    return String(type || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function optionList(options) {
    if (Array.isArray(options)) return options;
    if (typeof options === "string") {
        return options.split(/\s*;\s*/).map((option) => option.trim()).filter(Boolean);
    }
    return [];
}

function inferredType(question, groupType) {
    const type = normalizeQuestionType(groupType || question.type || "sentence_completion");
    const labels = optionList(question.options).map((option) => normalizeOption(option).label.toUpperCase());

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

function statusLabel(status) {
    if (status === "correct") return "Correct";
    if (status === "incorrect") return "Incorrect";
    return "Unanswered";
}

function answerDisplay(value) {
    return window.IeltsResultUtils?.formatAnswer
        ? window.IeltsResultUtils.formatAnswer(value)
        : (String(value ?? "").trim() || "\u2014");
}

function statusClass(result, baseClass) {
    return result?.status ? `${baseClass} cbt-answer-field--${result.status}` : baseClass;
}

function AnswerReviewDetails({ result }) {
    if (!result) return null;

    return h("div", { className: `cbt-answer-review cbt-answer-review--${result.status}` },
        h("p", null,
            h("strong", null, "Your answer: "),
            answerDisplay(result.userAnswer)
        ),
        h("p", null,
            h("strong", null, "Correct answer: "),
            answerDisplay(result.mainAnswer),
            result.alternatives?.length
                ? h("span", { className: "cbt-answer-alternatives" },
                    ` Alternative${result.alternatives.length === 1 ? "" : "s"}: ${result.alternatives.join(", ")}`
                )
                : null
        ),
        h("p", null,
            h("strong", null, "Status: "),
            h("span", { className: "cbt-answer-status" }, statusLabel(result.status))
        )
    );
}

function QuestionShell({ question, children, className = "", reviewResult }) {
    return h("article", {
        id: `question-${question.number}`,
        className: `cbt-question ${className} ${reviewResult ? `cbt-question--review cbt-question--${reviewResult.status}` : ""}`.trim(),
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

function TFNGRenderer({ question, value, onAnswer, groupType, reviewResult, readOnly }) {
    const type = inferredType(question, groupType);
    const defaults = type === "yes_no_not_given"
        ? ["YES", "NO", "NOT GIVEN"]
        : ["TRUE", "FALSE", "NOT GIVEN"];
    const questionOptions = optionList(question.options);
    const options = questionOptions.length ? questionOptions : defaults;

    return h(QuestionShell, { question, className: "cbt-question--tfng", reviewResult },
        h(Stem, { question }),
        h("select", {
            className: statusClass(reviewResult, "cbt-select cbt-select--tfng"),
            value: value || "",
            disabled: readOnly,
            onChange: (event) => onAnswer?.(question.number, event.target.value),
            "aria-label": `Answer for question ${question.number}`
        },
            h("option", { value: "" }, "Select answer"),
            options.map((raw) => {
                const option = normalizeOption(raw);
                return h("option", { key: option.value, value: option.value }, option.label);
            })
        ),
        h(AnswerReviewDetails, { result: reviewResult })
    );
}

function MultipleChoiceRenderer({ question, value, onAnswer, reviewResult, readOnly }) {
    return h(QuestionShell, { question, className: "cbt-question--choice", reviewResult },
        h(Stem, { question }),
        h("div", { className: "cbt-options cbt-options--stacked" },
            optionList(question.options).map((raw) => {
                const option = normalizeOption(raw);
                const isSelected = value === option.value;
                return h("label", {
                    key: option.value,
                    className: `cbt-option-card cbt-option-card--wide${isSelected ? " selected" : ""}${reviewResult && isSelected ? ` cbt-option-card--${reviewResult.status}` : ""}`
                },
                    h("input", {
                        type: "radio",
                        name: `q${question.number}`,
                        value: option.value,
                        checked: isSelected,
                        disabled: readOnly,
                        onChange: () => onAnswer?.(question.number, option.value)
                    }),
                    option.html
                        ? h(SafeHtml, { html: option.html, tag: "span" })
                        : h("span", null, option.label)
                );
            })
        ),
        h(AnswerReviewDetails, { result: reviewResult })
    );
}

function uniqueOptions(options) {
    return optionList(options).map(normalizeOption).filter((option, index, list) =>
        option.value && list.findIndex((candidate) => candidate.value === option.value) === index
    );
}

function matchingOptions(question, group) {
    const groupOptions = optionList(group.options || group.headings || group.matchingOptions || group.listOfHeadings);
    const source = groupOptions.length ? groupOptions : optionList(question.options);
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

function MatchingRenderer({ question, group, value, onAnswer, reviewResult, readOnly }) {
    const options = matchingOptions(question, group);
    return h(QuestionShell, { question, className: "cbt-question--matching", reviewResult },
        h(Stem, { question }),
        h("select", {
            className: statusClass(reviewResult, "cbt-select"),
            value: value || "",
            disabled: readOnly,
            onChange: (event) => onAnswer?.(question.number, event.target.value),
            "aria-label": `Answer for question ${question.number}`
        },
            h("option", { value: "" }, "Select answer"),
            options.map((option) =>
                h("option", { key: option.value, value: option.value }, option.label)
            )
        ),
        h(AnswerReviewDetails, { result: reviewResult })
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

function MultiSelectGroupRenderer({ group, answers, onAnswer, reviewByNumber, readOnly }) {
    const questions = group.questions || [];
    const questionOptions = questions.find((question) => (question.options || []).length)?.options || [];
    const options = uniqueOptions(group.options || group.multiSelectOptions || questionOptions);
    const selected = questions
        .map((question) => String(answers[question.number] || ""))
        .filter(Boolean);
    const selectedSet = new Set(selected);

    return h("div", { className: "cbt-multi-select-task" },
        h("div", { className: "cbt-multi-select-options", role: "group", "aria-label": "Select answers" },
            options.map((option) =>
                h("div", {
                    key: option.value,
                    className: `cbt-option-card cbt-option-card--checkbox${selectedSet.has(option.value) ? " selected" : ""}`
                },
                    option.html
                        ? h(SafeHtml, { html: option.html, tag: "span" })
                        : h("span", null, option.label)
                )
            )
        ),
        h("div", { className: "cbt-multi-select-slots" },
            questions.map((question) =>
                h("div", {
                    key: question.number,
                    className: `cbt-multi-select-slot${reviewByNumber?.[question.number] ? ` cbt-multi-select-slot--${reviewByNumber[question.number].status}` : ""}`,
                    "data-number": question.number
                },
                    h(QuestionBadge, { number: question.number }),
                    h("select", {
                        className: "cbt-multi-select-select",
                        value: answers[question.number] || "",
                        disabled: readOnly,
                        onChange: (event) => onAnswer?.(question.number, event.target.value),
                        "aria-label": `Select answer for question ${question.number}`
                    },
                        h("option", { value: "" }, "Select an option"),
                        options.map((opt) => {
                            const isChosenElsewhere = selectedSet.has(opt.value) && answers[question.number] !== opt.value;
                            return h("option", {
                                key: opt.value,
                                value: opt.value,
                                disabled: isChosenElsewhere
                            }, opt.value);
                        })
                    ),
                    h(AnswerReviewDetails, { result: reviewByNumber?.[question.number] })
                )
            )
        ),
        h("p", { className: "cbt-multi-select-count" }, `${selected.length} of ${questions.length} selected`)
    );
}

function CompletionInput({ question, value, onAnswer, inline = false, reviewResult, readOnly }) {
    return h("input", {
        type: "text",
        className: statusClass(reviewResult, inline ? "cbt-blank-input cbt-blank-input--inline" : "cbt-blank-input"),
        value: value || "",
        onChange: (event) => onAnswer?.(question.number, event.target.value),
        readOnly: readOnly,
        autoComplete: "off",
        placeholder: inline ? "" : "Type your answer",
        "aria-label": `Answer for question ${question.number}`
    });
}

function InlineCorrectAnswer({ result }) {
    if (!result || result.status === "correct") return null;
    return h("span", { className: "cbt-inline-correct-answer" }, `Correct: ${answerDisplay(result.mainAnswer)}`);
}

function SentenceCompletionRenderer({ question, value, onAnswer, reviewResult, readOnly }) {
    const stem = questionStem(question);
    const blankPattern = /_{3,}|<span[^>]*class=["'][^"']*ielts-blank[^"']*["'][^>]*>.*?<\/span>/i;
    const hasInlineBlank = blankPattern.test(stem);

    if (!hasInlineBlank) {
        return h(QuestionShell, { question, className: "cbt-question--completion", reviewResult },
            h(Stem, { question }),
            h(CompletionInput, { question, value, onAnswer, reviewResult, readOnly }),
            h(InlineCorrectAnswer, { result: reviewResult }),
            h(AnswerReviewDetails, { result: reviewResult })
        );
    }

    const parts = stem.split(new RegExp(blankPattern.source, "gi"));
    const blankCount = Math.max(0, parts.length - 1);

    if (blankCount > 1) {
        const values = String(value || "").split(/\s+and\s+/i, 2);
        const updatePart = (index, nextValue) => {
            const next = [values[0] || "", values[1] || ""];
            next[index] = nextValue;
            onAnswer?.(question.number, next.every((item) => !item.trim()) ? "" : `${next[0]} and ${next[1]}`);
        };

        return h(QuestionShell, { question, className: "cbt-question--completion", reviewResult },
            h("div", { className: "cbt-question-line" },
                h(QuestionBadge, { number: question.number }),
                h("div", { className: "cbt-question-copy cbt-completion-copy" },
                    parts.map((part, index) => h(Fragment, { key: `${question.number}-${index}` },
                        h(SafeHtml, { html: part || "", tag: "span" }),
                        index < blankCount
                            ? h("input", {
                                type: "text",
                                className: statusClass(reviewResult, "cbt-blank-input cbt-blank-input--inline"),
                                value: values[index] || "",
                                onChange: (event) => updatePart(index, event.target.value),
                                readOnly,
                                autoComplete: "off",
                                "aria-label": `Answer ${index + 1} for question ${question.number}`
                            })
                            : null
                    )),
                    h(InlineCorrectAnswer, { result: reviewResult })
                )
            ),
            h(AnswerReviewDetails, { result: reviewResult })
        );
    }

    return h(QuestionShell, { question, className: "cbt-question--completion", reviewResult },
        h("div", { className: "cbt-question-line" },
            h(QuestionBadge, { number: question.number }),
            h("div", { className: "cbt-question-copy cbt-completion-copy" },
                h(SafeHtml, { html: parts[0] || "", tag: "span" }),
                h(CompletionInput, { question, value, onAnswer, inline: true, reviewResult, readOnly }),
                h(InlineCorrectAnswer, { result: reviewResult }),
                h(SafeHtml, { html: parts.slice(1).join(" ") || "", tag: "span" })
            )
        ),
        h(AnswerReviewDetails, { result: reviewResult })
    );
}

function RichCompletionRenderer({ contentHtml, questions, answers, onAnswer, className = "", reviewByNumber, readOnly }) {
    const ref = useRef(null);
    const numberKey = (questions || []).map((question) => question.number).join(",");
    const renderedHtml = useMemo(() => highlightInstructionHtml(contentHtml || ""), [contentHtml]);

    useEffect(() => {
        const root = ref.current;
        if (!root) return undefined;

        const markers = [...new Set([
            ...root.querySelectorAll("[data-blank]"),
            ...root.querySelectorAll(".ielts-blank")
        ])];

        markers.forEach((marker, index) => {
            if (marker.matches("input") || marker.matches("select")) return;
            const markerNumber = Number(marker.getAttribute("data-blank"));
            const question = (questions || []).find((item) => item.number === markerNumber) || (questions || [])[index];
            if (!question) return;

            const wrapper = document.createElement("span");
            wrapper.id = `question-${question.number}`;
            wrapper.className = "cbt-blank-wrapper";
            wrapper.style.display = "inline-flex";
            wrapper.style.alignItems = "center";
            wrapper.style.gap = "4px";
            wrapper.style.margin = "0 4px";

            const numberSpan = document.createElement("strong");
            numberSpan.className = "cbt-blank-number";
            numberSpan.textContent = String(question.number);
            numberSpan.style.fontSize = "0.9em";
            numberSpan.style.color = "var(--cbt-muted)";
            numberSpan.style.fontWeight = "700";

            let input;
            if (question.options && question.options.length > 0) {
                input = document.createElement("select");
                input.className = "cbt-select cbt-select--inline";
                
                const defaultOpt = document.createElement("option");
                defaultOpt.value = "";
                defaultOpt.textContent = "Select";
                input.appendChild(defaultOpt);

                question.options.forEach((opt) => {
                    const normalized = normalizeOption(opt);
                    const optionEl = document.createElement("option");
                    optionEl.value = normalized.value;
                    optionEl.textContent = normalized.label;
                    input.appendChild(optionEl);
                });

                input.addEventListener("change", (event) => onAnswer?.(question.number, event.target.value));
            } else {
                input = document.createElement("input");
                input.type = "text";
                input.className = "cbt-blank-input cbt-blank-input--inline";
                input.placeholder = "";
                input.setAttribute("autocomplete", "off");
                input.addEventListener("input", (event) => onAnswer?.(question.number, event.target.value));
            }

            input.value = answers[question.number] || "";
            input.dataset.questionNumber = String(question.number);
            input.setAttribute("aria-label", `Answer for question ${question.number}`);

            wrapper.appendChild(numberSpan);
            wrapper.appendChild(input);
            marker.replaceWith(wrapper);
        });

        return undefined;
    }, [contentHtml, numberKey]);

    useEffect(() => {
        const inputs = ref.current?.querySelectorAll(".cbt-blank-input, .cbt-select--inline") || [];
        inputs.forEach((input, index) => {
            const markerNumber = Number(input.dataset.questionNumber);
            const question = (questions || []).find((item) => item.number === markerNumber) || (questions || [])[index];
            if (question && input.value !== (answers[question.number] || "")) {
                input.value = answers[question.number] || "";
            }
            const result = question ? reviewByNumber?.[question.number] : null;
            ["correct", "incorrect", "unanswered"].forEach((status) => {
                input.classList.toggle(`cbt-answer-field--${status}`, result?.status === status);
            });
            if (input.tagName.toLowerCase() === "select") {
                input.disabled = Boolean(readOnly);
            } else {
                input.readOnly = Boolean(readOnly);
            }
            const existingHint = input.nextElementSibling?.classList?.contains("cbt-inline-correct-answer")
                ? input.nextElementSibling
                : null;
            if (result && result.status !== "correct") {
                const hint = existingHint || document.createElement("span");
                hint.className = "cbt-inline-correct-answer";
                hint.textContent = `Correct: ${answerDisplay(result.mainAnswer)}`;
                if (!existingHint) input.after(hint);
            } else if (existingHint) {
                existingHint.remove();
            }
        });
    }, [answers, numberKey, reviewByNumber, readOnly]);

    return h("div", {
        ref,
        className: `cbt-rich-completion ${className}`.trim(),
        dangerouslySetInnerHTML: { __html: renderedHtml }
    });
}

function DiagramLabelingRenderer({ group, images, answers, onAnswer, reviewByNumber, readOnly }) {
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
                            inline: true,
                            reviewResult: reviewByNumber?.[question.number],
                            readOnly
                        }),
                        h(InlineCorrectAnswer, { result: reviewByNumber?.[question.number] })
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
                    onAnswer,
                    reviewResult: reviewByNumber?.[question.number],
                    readOnly
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

    const groupInstructionObj = typeof group.instruction === "object" && group.instruction !== null
        ? group.instruction
        : {};
    const instruction = {
        ...groupInstructionObj,
        ...(group.instructionHtml || {})
    };

    const groupText = [
        instruction.bodyHtml,
        instruction.rulesHtml,
        instruction.body,
        instruction.text,
        group.instructionText,
        typeof group.instruction === "string" ? group.instruction : null,
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

function ChoiceInstructionBlock({ type, questions, showPrompt, showLead }) {
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
    const prompt = type === "yes_no_not_given"
        ? "Do the following statements agree with the claims of the writer in the reading passage?"
        : "Do the following statements agree with the information given in the reading passage?";

    return h("div", { className: "cbt-choice-instructions" },
        showPrompt ? h("p", { className: "cbt-choice-instructions-prompt" }, prompt) : null,
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
    const groupInstructionObj = typeof group.instruction === "object" && group.instruction !== null
        ? group.instruction
        : {};
    const instruction = {
        ...groupInstructionObj,
        ...(group.instructionHtml || {})
    };
    const title = group.instructionTitle || group.title || instruction.title || instruction.titleHtml;
    const body = instruction.bodyHtml 
        || instruction.body 
        || instruction.text 
        || group.instructionText 
        || (typeof group.instruction === "string" ? group.instruction : "");
    const rules = instruction.rulesHtml 
        || instruction.rules 
        || instruction.rule 
        || group.rule;
    const bodyHtml = instruction.bodyHtml && title
        ? instruction.bodyHtml.replace(
            /<p[^>]*>\s*<strong[^>]*>\s*Questions?\s+\d+(?:\s*[-–]\s*\d+)?\s*<\/strong>\s*(?:<br\s*\/?>)?/i,
            "<p>"
        )
        : instruction.bodyHtml;
    const choiceType = groupChoiceInstructionType(group);
    const visibleBodyText = [bodyHtml, body].filter(Boolean).join(" ");
    const bodyHasChoiceDefinitions = /if\s+(?:the\s+statement|there\s+is|it\s+is|the\s+writer)/i.test(visibleBodyText);
    const hasVisibleChoicePrompt = choicePromptMatches(choiceType, visibleBodyText);
    const hasVisibleChoiceLead = /in\s+boxes?\s+\d/i.test(visibleBodyText);
    const showAutomaticChoiceInstructions = Boolean(choiceType);
    const renderBody = !bodyHasChoiceDefinitions;

    return h("header", { className: "cbt-group-instructions" },
        instruction.titleHtml
            ? h(SafeHtml, { html: instruction.titleHtml, className: "cbt-group-title" })
            : (title ? h("h3", { className: "cbt-group-title" }, title) : null),
        renderBody && bodyHtml
            ? h(SafeHtml, { html: bodyHtml, className: "cbt-instruction-copy", highlightInstructions: true })
            : (renderBody && body ? h(SafeHtml, { tag: "p", html: highlightInstructionText(body), className: "cbt-instruction-copy" }) : null),
        showAutomaticChoiceInstructions
            ? h(ChoiceInstructionBlock, {
                type: choiceType,
                questions: group.questions || [],
                showPrompt: renderBody ? !hasVisibleChoicePrompt : true,
                showLead: renderBody ? !hasVisibleChoiceLead : true
            })
            : (rules
            ? (instruction.rulesHtml
                ? h(SafeHtml, { html: instruction.rulesHtml, className: "cbt-rule-box", highlightInstructions: true })
                : h(SafeHtml, { tag: "p", html: highlightInstructionText(rules), className: "cbt-rule-box" }))
            : null)
    );
}

function QuestionRenderer({ question, group, value, onAnswer, reviewResult, readOnly }) {
    const type = inferredType(question, group.type || group.questionType);

    if (type === "true_false_not_given" || type === "yes_no_not_given") {
        return h(TFNGRenderer, { question, value, onAnswer, groupType: type, reviewResult, readOnly });
    }
    if (type === "multiple_choice") {
        return h(MultipleChoiceRenderer, { question, value, onAnswer, reviewResult, readOnly });
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
        return h(MatchingRenderer, { question, group, value, onAnswer, reviewResult, readOnly });
    }

    return h(SentenceCompletionRenderer, { question, value, onAnswer, reviewResult, readOnly });
}

function QuestionGroupRenderer({ group, images, answers, onAnswer, reviewByNumber, readOnly }) {
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
        showGroupOptions
            ? (group.contentHtml
                ? h(SafeHtml, { html: group.contentHtml, className: "cbt-group-content-html" })
                : h(GroupOptionsBox, { group: effectiveGroup }))
            : null,
        isDiagram
            ? h(DiagramLabelingRenderer, { group: effectiveGroup, images, answers, onAnswer, reviewByNumber, readOnly })
            : (isMultiSelect
                ? h(MultiSelectGroupRenderer, { group: effectiveGroup, answers, onAnswer, reviewByNumber, readOnly })
                : (isRichCompletion
                ? h(RichCompletionRenderer, {
                    contentHtml: group.contentHtml,
                    questions,
                    answers,
                    onAnswer,
                    className: type === "table_completion" ? "cbt-rich-completion--table" : "",
                    reviewByNumber,
                    readOnly
                })
                : h("div", { className: "cbt-question-list" },
                    questions.map((question) =>
                        h(QuestionRenderer, {
                            key: question.number,
                            question,
                            group: effectiveGroup,
                            value: answers[question.number],
                            onAnswer,
                            reviewResult: reviewByNumber?.[question.number],
                            readOnly
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

function QuestionsPanel({ groups, images = [], answers = {}, onAnswer, reviewResults = [], readOnly = false }) {
    const reviewByNumber = Object.fromEntries((reviewResults || []).map((result) => [result.number, result]));

    return h("div", { className: "cbt-questions-inner" },
        (groups || []).map((group, index) =>
            h(QuestionGroupRenderer, {
                key: group.id || group.groupId || `group-${index}`,
                group,
                images,
                answers,
                onAnswer,
                reviewByNumber,
                readOnly
            })
        )
    );
}

function normalizeVocabularyToken(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
        .replace(/'s$/i, "")
        .replace(/[^a-z0-9'-]/g, "");
}

function renderVocabularyText(text, keyPrefix, enableVocabulary, activeVocabularyKey) {
    if (!enableVocabulary) {
        return text;
    }

    const parts = String(text || "").split(/([A-Za-z0-9]+(?:[’'\-][A-Za-z0-9]+)*)/g);

    return parts.map((part, index) => {
        const normalized = normalizeVocabularyToken(part);

        if (!normalized) {
            return part;
        }

        return h("span", {
            key: `${keyPrefix}-word-${index}`,
            className: `cbt-vocab-word translatable-word${activeVocabularyKey === normalized ? " is-selected" : ""}`,
            role: "button",
            tabIndex: 0,
            "data-word": normalized,
            "data-vocab-word": part,
            "data-vocab-normalized": normalized,
            "aria-label": `Check vocabulary for ${part}`
        }, part);
    });
}

function renderVocabularyHtml(html, keyPrefix, enableVocabulary, activeVocabularyKey) {
    if (!enableVocabulary || typeof DOMParser === "undefined") {
        return null;
    }

    const parser = new DOMParser();
    const documentFragment = parser.parseFromString(`<body>${html}</body>`, "text/html");
    const allowedTags = new Set(["article", "blockquote", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "i", "li", "ol", "p", "section", "span", "strong", "b", "br", "sup", "sub", "ul"]);

    function renderNode(node, key) {
        if (node.nodeType === 3) {
            return renderVocabularyText(node.textContent || "", key, enableVocabulary, activeVocabularyKey);
        }

        if (node.nodeType !== 1) {
            return null;
        }

        const tag = node.tagName.toLowerCase();

        if (!allowedTags.has(tag)) {
            return renderVocabularyText(node.textContent || "", key, enableVocabulary, activeVocabularyKey);
        }

        if (tag === "br") {
            return h("br", { key });
        }

        const props = { key };
        const className = node.getAttribute("class");

        if (className) {
            props.className = className;
        }

        return h(tag, props, [...node.childNodes].map((child, index) =>
            renderNode(child, `${key}-${index}`)
        ));
    }

    return [...documentFragment.body.childNodes].map((node, index) =>
        renderNode(node, `${keyPrefix}-html-${index}`)
    );
}

function passageNumberLabel(passage) {
    const explicitNumber = Number(passage?.number);
    if (Number.isFinite(explicitNumber) && explicitNumber > 0) return explicitNumber;

    const labelMatch = String(passage?.displayLabel || passage?.title || "").match(/passage\s+(\d+)/i);
    return labelMatch ? Number(labelMatch[1]) : 1;
}

function passageQuestionRange(passage) {
    const numbers = [];

    (passage?.questionGroups || []).forEach((group) => {
        (group.questions || []).forEach((question) => {
            const number = Number(question.number);
            if (Number.isFinite(number)) numbers.push(number);
        });
        (group.questionNumbers || []).forEach((value) => {
            const number = Number(value);
            if (Number.isFinite(number)) numbers.push(number);
        });
        (group.questionRange || []).forEach((value) => {
            const number = Number(value);
            if (Number.isFinite(number)) numbers.push(number);
        });
    });

    (passage?.questions || []).forEach((question) => {
        const number = Number(question.number);
        if (Number.isFinite(number)) numbers.push(number);
    });

    if (numbers.length) {
        return {
            start: Math.min(...numbers),
            end: Math.max(...numbers)
        };
    }

    const passageNumber = passageNumberLabel(passage);
    if (passageNumber === 2) return { start: 14, end: 26 };
    if (passageNumber === 3) return { start: 27, end: 40 };
    return { start: 1, end: 13 };
}

function PassageRenderer({ passage, enableVocabulary = false, activeVocabularyKey = "", onVocabularyWord }) {
    if (!passage) return null;

    const passageNumber = passageNumberLabel(passage);
    const range = passageQuestionRange(passage);
    const rangeText = range.start === range.end
        ? `Question ${range.start}`
        : `Questions ${range.start}\u2013${range.end}`;
    const subtitle = String(passage.subtitle || "").trim();
    const allParagraphs = passage.paragraphs?.length
        ? passage.paragraphs
        : String(passage.passageText || "")
            .split(/\n{2,}/)
            .map((text) => ({ text, html: "" }))
            .filter((paragraph) => paragraph.text.trim());
    const paragraphs = subtitle
        ? allParagraphs.filter((paragraph, index) => index !== 0 || String(paragraph.text || "").trim() !== subtitle)
        : allParagraphs;

    function handleVocabularyClick(event) {
        if (!enableVocabulary || !onVocabularyWord || !event.target?.closest) {
            return;
        }

        if (event.target.closest("mark.ieltsx-highlight, .reading-highlight, .highlighted-word")) {
            return;
        }

        const target = event.target.closest("[data-vocab-word]");

        if (!target || !event.currentTarget.contains(target)) {
            return;
        }

        onVocabularyWord({
            word: target.dataset.vocabWord,
            normalized: target.dataset.vocabNormalized,
            target
        });
    }

    function handleVocabularyKeyDown(event) {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        if (!enableVocabulary || !onVocabularyWord || !event.target?.closest) {
            return;
        }

        if (event.target.closest("mark.ieltsx-highlight, .reading-highlight, .highlighted-word")) {
            return;
        }

        const target = event.target.closest("[data-vocab-word]");

        if (!target || !event.currentTarget.contains(target)) {
            return;
        }

        event.preventDefault();
        onVocabularyWord({
            word: target.dataset.vocabWord,
            normalized: target.dataset.vocabNormalized,
            target
        });
    }

    return h("article", {
        className: `cbt-passage${enableVocabulary ? " has-vocabulary" : ""}`,
        "data-passage": "true",
        "data-passage-id": passage.id || `passage-${passageNumber}`,
        onClick: handleVocabularyClick,
        onKeyDown: handleVocabularyKeyDown
    },
        h("header", { className: "cbt-passage-kicker" },
            h("div", { className: "cbt-passage-label" }, `READING PASSAGE ${passageNumber}`),
            h("p", { className: "cbt-passage-guidance" },
                "You should spend about 20 minutes on ",
                h("strong", null, rangeText),
                `, which are based on Reading Passage ${passageNumber} below.`
            )
        ),
        h("h1", { className: "cbt-passage-title" },
            passage.title || passage.passageTitle || `Reading Passage ${passage.number || 1}`
        ),
        subtitle
            ? h("p", {
                className: `cbt-passage-subtitle${passage.subtitleStrong ? " cbt-passage-subtitle--strong" : ""}`
            }, subtitle)
            : null,
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
                        ? h("strong", {
                            className: "cbt-paragraph-letter",
                            "data-letter": paragraph.letter,
                            "data-letter-label": paragraph.letter,
                            "aria-hidden": "true"
                        })
                        : null,
                    paragraph.html
                        ? (enableVocabulary
                            ? h("div", { className: "cbt-paragraph-html" },
                            renderVocabularyHtml(
                                stripEmbeddedParagraphLetter(paragraph.html, paragraph.letter),
                                `${paragraph.letter || "p"}-${index}`,
                                enableVocabulary,
                                activeVocabularyKey
                            )
                        )
                            : h(SafeHtml, {
                                html: stripEmbeddedParagraphLetter(paragraph.html, paragraph.letter),
                                className: "cbt-paragraph-html"
                            }))
                        : h("p", null, renderVocabularyText(
                            paragraph.text || "",
                            `${paragraph.letter || "p"}-${index}`,
                            enableVocabulary,
                            activeVocabularyKey
                        ))
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
