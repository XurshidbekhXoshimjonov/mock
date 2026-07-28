const cheerio = require("cheerio");
const { sanitizeHtml, replaceInputsWithBlankMarkers } = require("./htmlSanitizer");
const { parseQuestionRange, rangeTitle } = require("./utils");
const { detectFromHtml, normalizeType } = require("./questionTypeDetector");
const { normalizeAnswerValue } = require("./answerExtractor");

function loadDom(html) {
    return cheerio.load(String(html || ""), { decodeEntities: false });
}

function outerHtml($, el) {
    if (!el || !el.length) return "";
    return $.html(el);
}

function innerHtml($, el) {
    if (!el || !el.length) return "";
    return el.html() || "";
}

function extractPassageLabel($, root) {
    const label = $(root).find(".passage-label").first();
    if (label.length) return sanitizeHtml(innerHtml($, label) || label.text());
    const match = $(root).html().match(/passage\s+\d+/i);
    return match ? match[0].toUpperCase() : "";
}

function extractPassageTitle($, root) {
    const heading = $(root).find("h1, h2, h4").first();
    if (!heading.length) return "";
    return heading.text().replace(/^passage\s+\d+\s*[:\-]?\s*/i, "").trim();
}

function extractParagraphs($, root) {
    const paragraphs = [];
    const container = $(root);

    container.find("p").each((_, el) => {
        const $p = $(el);
        if ($p.closest(".question-block, .question, #questions, [id^='questions-']").length) {
            return;
        }
        if ($p.closest(".rules, .instruction, .question-info").length) return;

        const html = sanitizeHtml(innerHtml($, $p));
        if (!html && !$p.text().trim()) return;

        let letter = null;
        let cleanHtml = html;
        let cleanText = $p.text().trim();

        const paraLabel = $p.find(".para-label").first();
        const paraLabelText = paraLabel.text().trim();
        if (/^[A-Z]$/.test(paraLabelText)) {
            letter = paraLabelText;
            const cloneP = $p.clone();
            cloneP.find(".para-label").first().remove();
            cleanHtml = sanitizeHtml(innerHtml($, cloneP));
            cleanText = cloneP.text().trim();
        }

        const strongText = $p.find("strong").first().text().trim();
        const letterMatch = strongText.match(/^([A-Z])[\).]?\s*$/);
        if (!letter && letterMatch) {
            letter = letterMatch[1];
            const $strong = $p.find("strong").first();
            if ($strong.text().trim() === strongText) {
                const cloneP = $p.clone();
                cloneP.find("strong").first().remove();
                cleanHtml = sanitizeHtml(innerHtml($, cloneP));
                cleanText = cloneP.text().trim();
            }
        } else if (!letter) {
            const pText = $p.text().trim();
            const textMatch = pText.match(/^\s*(?:[\(\[]([A-Z])[\)\]]|([A-Z])[\).])\s+/);
            if (textMatch) {
                letter = textMatch[1] || textMatch[2];
                const prefixRegex = /^\s*(?:[\(\[]?[A-Z][\)\]\.]?)\s*/;
                cleanHtml = cleanHtml.replace(prefixRegex, "");
                cleanText = cleanText.replace(prefixRegex, "");
            }
        }

        paragraphs.push({
            letter,
            html: cleanHtml,
            text: cleanText
        });
    });

    if (!paragraphs.length) {
        const textBlocks = container
            .clone()
            .find(".question-block, .question, script, style, audio").remove().end()
            .find("h1, h2, h4, .passage-label").remove().end();

        const fallbackHtml = sanitizeHtml(innerHtml($, textBlocks));
        if (fallbackHtml) {
            paragraphs.push({ letter: null, html: fallbackHtml, text: textBlocks.text().trim() });
        }
    }

    return paragraphs;
}

function extractInstructions($, groupEl) {
    const $group = $(groupEl);
    const rangeSource = $group.text();
    const range = parseQuestionRange(rangeSource);

    let titleHtml = "";
    let title = "";

    const h = $group.find("h1, h2, h3, h4").filter((_, el) => /questions?\s+\d/i.test($(el).text())).first();
    if (h.length) {
        titleHtml = sanitizeHtml(outerHtml($, h));
        title = h.text().trim();
    } else {
        const prompt = $group.find(".question-prompt").first();
        if (prompt.length) {
            const firstLine = prompt.text().split("\n")[0].trim();
            if (/questions?\s+\d/i.test(firstLine)) {
                title = firstLine;
                titleHtml = sanitizeHtml(`<h3>${firstLine}</h3>`);
            }
        }
    }

    if (!title && range) title = rangeTitle(range.start, range.end);

    const bodyParts = [];
    $group.find(".question-info, .question-prompt, .instructions").each((_, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        if (/questions?\s+\d/i.test(text) && text.length < 30) return;

        if ($el.hasClass("question-prompt") && title) {
            const clone = $el.clone();
            clone.find("h1, h2, h3, h4").remove();
            const inner = clone.html() || "";
            const withoutTitle = inner.replace(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").trim();
            if (withoutTitle) {
                bodyParts.push(sanitizeHtml(withoutTitle));
                return;
            }
        }

        if (title && text.startsWith(title)) return;
        bodyParts.push(sanitizeHtml(outerHtml($, $el)));
    });

    $group.find("p.instruction, .instruction").not(".rules .instruction").each((_, el) => {
        bodyParts.push(sanitizeHtml(outerHtml($, $(el))));
    });

    const rulesEl = $group.find(".rules").first();
    const rulesHtml = rulesEl.length ? sanitizeHtml(outerHtml($, rulesEl)) : "";

    let bodyHtml = bodyParts.filter(Boolean).join("");
    if (!bodyHtml) {
        const firstP = $group.find("p").not(".rules p").first();
        if (firstP.length && !/^(TRUE|FALSE|NOT GIVEN)/i.test(firstP.text())) {
            bodyHtml = sanitizeHtml(outerHtml($, firstP));
        }
    }

    return {
        title,
        titleHtml,
        bodyHtml,
        rulesHtml,
        questionRange: range ? [range.start, range.end] : []
    };
}

function answerFor(answers, number) {
    return normalizeAnswerValue(answers[String(number)]);
}

function parseOptionsFromHtml($, container) {
    const options = [];
    $(container).find("label").each((_, label) => {
        const $label = $(label);
        const input = $label.find("input[type='radio'], input[type='checkbox']").first();
        const value = input.attr("value") || $label.text().trim().charAt(0);
        
        // Clone label and remove input and .letter span to get clean text/html
        const $clone = $label.clone();
        $clone.find("input").remove();
        $clone.find(".letter").remove();
        
        const cleanText = $clone.text().trim();
        const firstBold = $clone.find("b, strong").first();
        if (firstBold.length && firstBold.text().trim() === String(value || "").trim()) {
            firstBold.remove();
        }
        const finalText = $clone.text().trim();
        const labelHtml = sanitizeHtml($clone.html() || cleanText);
        
        options.push({
            value: String(value || "").trim(),
            label: finalText,
            html: labelHtml
        });
    });

    if (!options.length) {
        $(container).find("input[type='radio']").each((_, input) => {
            const $input = $(input);
            options.push({
                value: $input.attr("value") || "",
                label: $input.attr("value") || "",
                html: ""
            });
        });
    }

    return options;
}

function normalizeOptionObject(option) {
    const label = String(option?.label || option?.html || option?.value || "").trim();
    const value = String(option?.value || label.match(/^([A-Za-zivx]+)(?:\b|[\).:\s-])/i)?.[1] || label).trim();

    return {
        value,
        label,
        html: option?.html || label
    };
}

function parseOptionsFromSelect($, selectEl, fallbackOptions = []) {
    const options = [];

    $(selectEl).find("option").each((_, option) => {
        const $option = $(option);
        const value = String($option.attr("value") || $option.text() || "").trim();
        const label = String($option.text() || value).trim();

        if (!value || /^select(?:\s+answer)?$/i.test(label)) return;

        options.push(normalizeOptionObject({
            value,
            label,
            html: sanitizeHtml($option.html() || label)
        }));
    });

    return options.length ? options : fallbackOptions;
}

function parseOptionsFromWordBox($, groupEl) {
    const options = [];

    $(groupEl).find(".word-box span, .option-box span, .options-box span, .word-list span").each((_, element) => {
        const $option = $(element);
        const text = $option.text().replace(/\s+/g, " ").trim();
        const strong = $option.find("strong").first().text().trim();
        const value = strong || text.match(/^([A-Za-zivx]+)(?:\b|[\).:\s-])/i)?.[1] || "";

        if (!value || !text) return;

        options.push(normalizeOptionObject({
            value,
            label: text,
            html: sanitizeHtml(innerHtml($, $option) || text)
        }));
    });

    return options;
}

function questionNumberFromControl($control) {
    const attrs = [
        $control.attr("data-q"),
        $control.attr("data-question"),
        $control.attr("data-number"),
        $control.attr("id"),
        $control.attr("name"),
        $control.attr("placeholder")
    ];

    for (const attr of attrs) {
        const match = String(attr || "").match(/(?:^|q)(\d{1,2})$/i) || String(attr || "").match(/\b(\d{1,2})\b/);
        if (match) return Number(match[1]);
    }

    return null;
}

function typeFromSelectOptions(options, instructionText, fallbackType) {
    const labels = (options || []).map((option) => String(option.label || option.value || "").toUpperCase());
    const joined = `${instructionText || ""} ${labels.join(" ")}`;

    if (labels.includes("TRUE") && labels.includes("FALSE") && joined.includes("NOT GIVEN")) {
        return "true_false_not_given";
    }
    if (labels.includes("YES") && labels.includes("NO") && joined.includes("NOT GIVEN")) {
        return "yes_no_not_given";
    }
    if (/choose\s+the\s+correct\s+letter|A\s*,\s*B\s*,\s*C/i.test(joined)) {
        return "multiple_choice";
    }
    if (/heading/i.test(joined)) {
        return "matching_headings";
    }

    return fallbackType || "matching_information";
}

function extractControlStem($, groupEl, controlEl) {
    const $control = $(controlEl);
    const $row = $control.closest(".q-row, .question-row, li, .flow-step, .summary-text, .completion-line");
    const $label = $row.find("label").first();
    const $source = $label.length ? $label.clone() : $row.clone();

    $source.find("select, input, textarea, .result-pill, .correct-answer, .qnum").remove();

    const stemHtml = sanitizeHtml($source.html() || "");
    const question = $source.text().replace(/^\s*\d{1,2}\s*/, "").replace(/\s+/g, " ").trim();

    if (question || stemHtml) {
        return { question, stemHtml };
    }

    const number = questionNumberFromControl($control);
    return {
        question: number ? `Question ${number}` : "",
        stemHtml: ""
    };
}

function extractTfngQuestions($, groupEl, questionType, answers) {
    const questions = [];
    $(groupEl).find(".tf-question, .statement").each((_, el) => {
        const $el = $(el);
        let number = Number($el.attr("data-q-start"));
        const strongNum = $el.find("strong").first().text().match(/^(\d{1,2})\./);
        if (!number && strongNum) number = Number(strongNum[1]);
        if (!number) number = questions.length + 1;

        const stemEl = $el.find(".tf-question-text, .question-text").first();
        let stemHtml = stemEl.length
            ? sanitizeHtml(outerHtml($, stemEl).replace(/<\/?(div|span)[^>]*>/gi, "").trim() || innerHtml($, stemEl))
            : sanitizeHtml(
                $el.clone().find(".answer-options, input, label").remove().end().html() || ""
            );

        if (!stemHtml) {
            stemHtml = sanitizeHtml($el.clone().find(".answer-options, input").remove().end().html() || $el.text());
        }

        const defaultOptions = questionType === "yes_no_not_given"
            ? ["YES", "NO", "NOT GIVEN"]
            : ["TRUE", "FALSE", "NOT GIVEN"];

        let options = parseOptionsFromHtml($, $el.find(".answer-options").first());
        if (!options.length) {
            options = defaultOptions.map((label) => ({ value: label, label, html: label }));
        }

        questions.push({
            number,
            type: questionType,
            stemHtml,
            question: $el.text().replace(/^\d{1,2}\.\s*/, "").trim(),
            options,
            answer: answerFor(answers, number)
        });
    });
    return questions;
}

function extractMcqQuestions($, groupEl, answers) {
    const questions = [];
    $(groupEl).find(".multi-choice-question, .question-card").filter((_, el) => $(el).find("input[type='radio']").length > 0).each((_, el) => {
        const $el = $(el);
        const number = Number($el.attr("data-q-start") || $el.attr("data-qblock") || $el.find("input[data-q]").first().attr("data-q")) || questions.length + 1;
        
        let $prompt = $el.find(".question-prompt").first();
        if (!$prompt.length) {
            $prompt = $el.children("p").first();
        }
        if (!$prompt.length) {
            $prompt = $el.find(".multi-choice-options").prev();
        }
        if (!$prompt.length) {
            $prompt = $el.find(".question-heading").first();
        }
        
        let stemHtml = "";
        let questionText = "";
        if ($prompt.length) {
            const $clone = $prompt.clone();
            $clone.find(".qnum").remove();
            $clone.find("strong").each((_, strongEl) => {
                const txt = $(strongEl).text().trim();
                if (/^\d+$/.test(txt)) {
                    $(strongEl).remove();
                }
            });
            let htmlContent = $clone.html() || "";
            htmlContent = htmlContent.replace(/^\s*(?:<strong>)?\d+(?:<\/strong>)?\s*(?:&nbsp;|\s)*/i, "");
            stemHtml = sanitizeHtml(htmlContent);
            questionText = $clone.text().replace(/^\s*\d+\s*/, "").trim();
        }

        const options = parseOptionsFromHtml($, $el);
        questions.push({
            number,
            type: "multiple_choice",
            stemHtml,
            question: questionText,
            options,
            answer: answerFor(answers, number)
        });
    });
    return questions;
}

function extractMultiSelectGroup($, groupEl, answers, instruction) {
    const $group = $(groupEl);
    const $card = $group.find(".pair-card").first();
    if (!$card.length) return null;

    const start = Number($card.attr("data-pair-block") || $card.attr("data-qblock") || $card.find("input[data-pair]").first().attr("data-pair"));
    if (!start) return null;

    const rangeText = $card.find(".qnum").first().text().trim();
    const rangeMatch = rangeText.match(/(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/i);
    const end = rangeMatch ? Number(rangeMatch[2]) : start + 1;
    const options = parseOptionsFromHtml($, $card);
    const title = $card.find(".pair-title").first().clone();
    title.find(".qnum").remove();
    const question = title.text().replace(/\s+/g, " ").trim();
    const questions = [];

    for (let number = start; number <= end; number++) {
        questions.push({
            number,
            type: "multi_select",
            stemHtml: number === start ? sanitizeHtml(title.html() || question) : "",
            question: number === start ? question : "",
            options,
            answer: answerFor(answers, number)
        });
    }

    return {
        type: "multi_select",
        question,
        instruction,
        instructionTitle: instruction.title,
        instructionText: instruction.bodyHtml ? $(`<div>${instruction.bodyHtml}</div>`).text().trim() : "Choose TWO answers.",
        instructionHtml: {
            titleHtml: instruction.titleHtml,
            bodyHtml: instruction.bodyHtml,
            rulesHtml: instruction.rulesHtml
        },
        rule: instruction.rulesHtml ? $(`<div>${instruction.rulesHtml}</div>`).text().trim() : "",
        questionRange: [start, end],
        contentHtml: "",
        layoutHtml: sanitizeHtml(outerHtml($, $group)),
        questions
    };
}

function cleanBlankWrappers($, root) {
    $(root).find(".blank-wrap").each((_, wrap) => {
        const $wrap = $(wrap);
        const input = $wrap.find("input, select, textarea").first();
        if (input.length) {
            $wrap.replaceWith(input);
        } else {
            $wrap.replaceWith($wrap.html() || "");
        }
    });
}

function extractSummaryContent($, groupEl, answers) {
    const originalSummaryEl = $(groupEl).find(".summary-text").first();
    if (!originalSummaryEl.length) return { questions: [], contentHtml: "" };
    const summaryEl = originalSummaryEl.clone();
    cleanBlankWrappers($, summaryEl);

    const noteTitleEl = $(groupEl).find(".note-title, h3").first();
    const noteTitleHtml = noteTitleEl.length
        ? outerHtml($, noteTitleEl).replace(/class=(["'])note-title\1/i, 'class="ielts-summary-title"')
        : "";
    const summaryHtml = outerHtml($, summaryEl);
    const wordBoxHtml = $(groupEl)
        .find(".word-box, .option-box, .options-box, .word-list")
        .map((_, el) => outerHtml($, $(el)))
        .get()
        .join("");
    const groupOptions = parseOptionsFromWordBox($, groupEl);
    const raw = (noteTitleHtml || wordBoxHtml)
        ? `<div class="ielts-import-summary">${noteTitleHtml}${summaryHtml}${wordBoxHtml}</div>`
        : summaryHtml;
    const { html, blanks } = replaceInputsWithBlankMarkers(raw);
    const questions = blanks.map((number) => ({
        number,
        type: "summary_completion",
        stemHtml: "",
        question: "",
        options: groupOptions,
        answer: answerFor(answers, number)
    }));

    return { questions, contentHtml: html };
}

function extractCompletionContent($, groupEl, answers, questionType) {
    const $clone = $(groupEl).clone();
    $clone.find(".question-prompt, h1, h2, h3, h4, p.instruction, .instruction, .instructions, .rules, .rule-table, .qnum").remove();
    cleanBlankWrappers($, $clone);

    const raw = $clone.html() || "";
    const { html, blanks } = replaceInputsWithBlankMarkers(raw);
    const questions = blanks.map((number) => ({
        number,
        type: questionType,
        stemHtml: "",
        question: "",
        options: [],
        answer: answerFor(answers, number)
    }));

    return { questions, contentHtml: html };
}

function extractQuestionGroup($, groupEl, answers, skill = "reading") {
    const groupHtml = outerHtml($, $(groupEl));
    const instruction = extractInstructions($, groupEl);
    const questionType = normalizeType(detectFromHtml(groupHtml, skill), skill);

    let questions = [];
    let contentHtml = "";

    const multiSelect = extractMultiSelectGroup($, groupEl, answers, instruction);
    if (multiSelect) return multiSelect;

    if ($(groupEl).find(".summary-text").length) {
        const summary = extractSummaryContent($, groupEl, answers);
        questions = summary.questions;
        contentHtml = summary.contentHtml;
    }

    // Support parsing select-based questions directly from DOM.
    const selectElements = $(groupEl).find("select");
    if (selectElements.length) {
        const groupOptions = parseOptionsFromWordBox($, groupEl);
        const foundTypes = [];

        selectElements.each((_, sel) => {
            const $sel = $(sel);
            const number = questionNumberFromControl($sel);
            if (!number) return;

            const options = parseOptionsFromSelect($, $sel, groupOptions);
            const instructionText = `${instruction.title} ${instruction.bodyHtml} ${instruction.rulesHtml}`;
            const specificType = typeFromSelectOptions(options, instructionText, questionType);
            const stem = extractControlStem($, groupEl, $sel);
            foundTypes.push(specificType);

            const existing = questions.find((question) => question.number === number);
            const parsedQuestion = {
                number,
                type: specificType,
                stemHtml: stem.stemHtml,
                question: stem.question,
                options,
                answer: answerFor(answers, number)
            };

            if (existing) {
                Object.assign(existing, parsedQuestion, {
                    stemHtml: existing.stemHtml || parsedQuestion.stemHtml,
                    question: existing.question || parsedQuestion.question
                });
            } else {
                questions.push(parsedQuestion);
            }
        });

        if (questions.length) {
            const finalType = foundTypes.length && foundTypes.every((type) => type === foundTypes[0])
                ? foundTypes[0]
                : questionType;
            return {
                type: finalType,
                instruction,
                instructionTitle: instruction.title,
                instructionText: instruction.bodyHtml ? $(`<div>${instruction.bodyHtml}</div>`).text().trim() : "",
                instructionHtml: {
                    titleHtml: instruction.titleHtml,
                    bodyHtml: instruction.bodyHtml,
                    rulesHtml: instruction.rulesHtml
                },
                rule: instruction.rulesHtml ? $(`<div>${instruction.rulesHtml}</div>`).text().trim() : "",
                questionRange: [questions[0].number, questions[questions.length - 1].number],
                contentHtml,
                layoutHtml: sanitizeHtml(groupHtml),
                questions: questions.sort((a, b) => a.number - b.number)
            };
        }
    }

    if (questionType === "true_false_not_given" || questionType === "yes_no_not_given" || $(groupEl).find(".tf-question").length) {
        questions = extractTfngQuestions($, groupEl, questionType, answers);
    }

    if (!questions.length && (questionType === "multiple_choice" || $(groupEl).find(".multi-choice-question").length)) {
        questions = extractMcqQuestions($, groupEl, answers);
    }

    if (!questions.length && $(groupEl).find("input[type='text'], input.answer-input, input.blank-input, input[data-q]").length) {
        const completion = extractCompletionContent($, groupEl, answers, questionType);
        questions = completion.questions;
        contentHtml = completion.contentHtml;
    }

    if (!questions.length) {
        $(groupEl).find(".statement").each((_, el) => {
            const $st = $(el);
            const numMatch = $st.text().match(/^(\d{1,2})[\).]/);
            const number = numMatch ? Number(numMatch[1]) : questions.length + 1;
            const stemHtml = sanitizeHtml(
                $st.clone().find(".answer-options, input, label").remove().end().html() || $st.text()
            );
            let options = parseOptionsFromHtml($, $st);
            if (!options.length && /(?:true|false|yes|no|not given)/i.test(groupHtml)) {
                const defaultOptions = questionType === "yes_no_not_given"
                    ? ["YES", "NO", "NOT GIVEN"]
                    : ["TRUE", "FALSE", "NOT GIVEN"];
                options = defaultOptions.map((label) => ({ value: label, label, html: label }));
            }
            questions.push({
                number,
                type: questionType,
                stemHtml,
                question: $st.text().trim(),
                options,
                answer: answerFor(answers, number)
            });
        });
    }

    const range = instruction.questionRange.length === 2 ? instruction.questionRange : null;
    if (!questions.length && range) {
        for (let n = range[0]; n <= range[1]; n++) {
            questions.push({
                number: n,
                type: questionType,
                stemHtml: "",
                question: "",
                options: [],
                answer: answerFor(answers, n)
            });
        }
    }

    return {
        type: questionType,
        instruction,
        instructionTitle: instruction.title,
        instructionText: instruction.bodyHtml ? $(`<div>${instruction.bodyHtml}</div>`).text().trim() : "",
        instructionHtml: {
            titleHtml: instruction.titleHtml,
            bodyHtml: instruction.bodyHtml,
            rulesHtml: instruction.rulesHtml
        },
        rule: instruction.rulesHtml ? $(`<div>${instruction.rulesHtml}</div>`).text().trim() : "",
        questionRange: range || (questions.length ? [questions[0].number, questions[questions.length - 1].number] : []),
        contentHtml,
        layoutHtml: sanitizeHtml(groupHtml),
        questions
    };
}

function findQuestionGroups($, container) {
    const groups = [];
    const $c = $(container);

    const sections = $c.find(".question-section").toArray();
    if (sections.length) {
        sections.forEach((section) => {
            const $section = $(section);
            const pairCards = $section.find(".pair-card").toArray();

            if (!pairCards.length) {
                groups.push(section);
                return;
            }

            pairCards.forEach((card) => {
                const $card = $(card);
                const wrap = $("<div class='parsed-question-group'></div>");
                const sectionHeading = $section.children("h2").first();
                const instructions = $section.children(".instructions, .instruction").first();
                const subHeading = $card.prevAll("h3").first();
                if (sectionHeading.length) wrap.append(sectionHeading.clone());
                if (instructions.length) wrap.append(instructions.clone());
                if (subHeading.length) wrap.append(subHeading.clone());
                wrap.append($card.clone());
                groups.push(wrap[0]);
            });
        });
        return groups;
    }

    $c.find(".question-card").each((_, el) => groups.push(el));
    if (groups.length) return groups;

    $c.find(".question[data-q-start], .question").each((_, el) => groups.push(el));
    if (groups.length) return groups;

    $c.find(".question-block").each((_, el) => groups.push(el));
    if (groups.length) return groups;

    $c.find("h1, h2, h3").each((_, heading) => {
        const $h = $(heading);
        if (!/questions?\s+\d/i.test($h.text())) return;
        const chunk = [$h];
        let sib = $h.next();
        while (sib.length && !/^h[1-3]$/i.test(sib.prop("tagName") || "")) {
            chunk.push(sib);
            sib = sib.next();
        }
        const wrap = $("<div class='parsed-question-group'></div>");
        chunk.forEach((node) => wrap.append(node.clone()));
        groups.push(wrap[0]);
    });

    return groups;
}

module.exports = {
    loadDom,
    outerHtml,
    innerHtml,
    sanitizeHtml,
    extractPassageLabel,
    extractPassageTitle,
    extractParagraphs,
    extractInstructions,
    extractQuestionGroup,
    findQuestionGroups,
    parseOptionsFromHtml
};
