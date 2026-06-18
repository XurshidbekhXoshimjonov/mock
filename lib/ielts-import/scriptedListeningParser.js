const cheerio = require("cheerio");
const { normalizeText, stripTags } = require("./utils");
const { normalizeAnswerValue } = require("./answerExtractor");
const { sanitizeHtml } = require("./htmlSanitizer");

function clean(value) {
    return normalizeText(String(value || "").replace(/^[•\-\s]+/, ""));
}

function questionNumberFromField($field) {
    const value = $field.attr("id") || $field.attr("name") || "";
    const match = value.match(/q(\d{1,2})/i);
    return match ? Number(match[1]) : null;
}

function extractQuestionText($, $field) {
    const container = $field.closest(".form-row, .question, li, p");
    const clone = container.length ? container.clone() : $field.parent().clone();
    clone.find("input, select, textarea").remove();
    return clean(clone.text());
}

function optionsFromLabels($, labels) {
    return labels.map((label) => {
        const $label = $(label);
        const input = $label.find("input[type='radio'], input[type='checkbox']").first();
        const value = String(input.attr("value") || "").trim().toUpperCase();
        const labelText = clean($label.clone().find("input").remove().end().text());
        const text = value
            ? labelText.replace(new RegExp(`^${value}[\\).:\\s-]*`, "i"), "").trim()
            : labelText;

        return {
            value,
            label: labelText,
            html: text || labelText
        };
    }).filter((option) => option.value);
}

function rangeFromText(value) {
    const match = String(value || "").match(/questions?\s+(\d{1,2})\s*[–—-]\s*(\d{1,2})/i);
    return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
}

function parseQuestionTypesObject(html) {
    const match = String(html || "").match(/(?:const|let|var)?\s*questionTypes\s*=\s*(\{[\s\S]*?\});/);
    if (!match) return {};

    try {
        const { vm } = require("./utils");
        return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
    } catch (error) {
        return {};
    }
}

function parseInstructionText(content) {
    const textStr = stripTags(content);
    const titleMatch = textStr.match(/questions?\s+\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}|question\s+\d{1,2}/i);
    const title = titleMatch ? titleMatch[0] : "";
    const text = textStr
        .replace(title, "")
        .replace(/\s+/g, " ")
        .trim();

    return { title, text };
}

function parseStandaloneListeningHtml(html, answers = {}) {
    const $ = cheerio.load(String(html || ""), { decodeEntities: false });
    
    // Extract questionTypes from script
    const questionTypes = parseQuestionTypesObject(html);

    // Split by sections using splitListeningSections
    const { splitListeningSections } = require("./sectionSplitter");
    const sections = splitListeningSections(html);

    return sections.map((sectionBlock, index) => {
        const partNumber = sectionBlock.number || index + 1;
        const sectionHtml = sectionBlock.sectionHtml || "";
        const $section = cheerio.load(sectionHtml, { decodeEntities: false });
        
        // Find all question inputs in the section html
        const inputs = $section("input[type='text'], input[type='radio'], input[type='checkbox'], select").toArray();
        const questionNumbers = [...new Set(inputs.map(input => {
            const $input = $section(input);
            const id = $input.attr("id") || "";
            const name = $input.attr("name") || "";
            const match = (id + " " + name).match(/q(\d{1,2})/i);
            return match ? Number(match[1]) : null;
        }).filter(Boolean))].sort((a, b) => a - b);

        if (questionNumbers.length === 0) {
            return {
                number: partNumber,
                title: `Part ${partNumber}`,
                sectionHtml: sanitizeHtml(sectionHtml),
                questionGroups: []
            };
        }

        // Find all potential range headers in the section
        const headings = [];
        $section(".question-prompt, .part-header, .instruction, h2, h3, h4, h5, p").each((_, el) => {
            const text = clean($section(el).text());
            const range = rangeFromText(text);
            if (range) {
                headings.push({
                    element: $section(el),
                    text,
                    range
                });
            }
        });

        // Filter headings to get unique ranges
        const uniqueHeadings = [];
        for (const h of headings) {
            const isDuplicate = uniqueHeadings.some(uh => uh.range.start === h.range.start && uh.range.end === h.range.end);
            if (!isDuplicate) {
                uniqueHeadings.push(h);
            }
        }

        // Filter out ranges that are proper supersets of other ranges (e.g. discard 21-30 in favor of 21-22, 23-27, 28-30)
        const nonCoveringHeadings = [];
        for (const h of uniqueHeadings) {
            const isCovering = uniqueHeadings.some(other => {
                if (other === h) return false;
                return other.range.start >= h.range.start && other.range.end <= h.range.end &&
                       (other.range.start !== h.range.start || other.range.end !== h.range.end);
            });
            if (!isCovering) {
                nonCoveringHeadings.push(h);
            }
        }

        nonCoveringHeadings.sort((a, b) => a.range.start - b.range.start);

        // If no headings found, default to one group spanning all question numbers
        if (nonCoveringHeadings.length === 0) {
            nonCoveringHeadings.push({
                text: `Questions ${questionNumbers[0]}-${questionNumbers[questionNumbers.length - 1]}`,
                range: { start: questionNumbers[0], end: questionNumbers[questionNumbers.length - 1] }
            });
        }

        // Build question groups
        const questionGroups = nonCoveringHeadings.map((heading) => {
            const range = heading.range;
            const parsedInstr = parseInstructionText(heading.text);
            const groupQuestions = [];

            for (let number = range.start; number <= range.end; number++) {
                // Determine type
                let type = "sentence_completion";
                const scriptType = questionTypes[`q${number}`] || questionTypes[String(number)];
                if (scriptType === "mcq") {
                    type = "multiple_choice";
                } else if (scriptType === "checkbox") {
                    type = "multi_select";
                } else {
                    const $input = $section(`input[id='q${number}'], input[name='q${number}']`).first();
                    if ($input.length) {
                        if ($input.attr("type") === "radio") {
                            type = "multiple_choice";
                        } else if ($input.attr("type") === "checkbox") {
                            type = "multi_select";
                        }
                    }
                }

                if (!questionNumbers.includes(number) && type !== "multi_select" && !answers[String(number)]) {
                    continue;
                }

                // Correct answer
                let answerVal = answers[String(number)];
                if (!answerVal) {
                    answerVal = answers[`q${number}`];
                }
                const answer = normalizeAnswerValue(answerVal);

                const qObj = {
                    number,
                    type,
                    question: "",
                    options: [],
                    answer
                };

                // Extract details based on type
                if (type === "multiple_choice") {
                    const radioInputs = $section(`input[type='radio'][name='q${number}']`).toArray();
                    const labels = radioInputs.map(input => $section(input).closest("label")).filter(l => l.length);
                    if (labels.length) {
                        qObj.options = optionsFromLabels($section, labels);
                    }

                    // Extract question text
                    const container = $section(`input[name='q${number}']`).closest(".multi-choice-question, .question, p, div");
                    if (container.length) {
                        const clone = container.clone();
                        clone.find("label, input, br, .lc-letter-badge, .question-number").remove();
                        qObj.question = clean(clone.text().replace(new RegExp(`^${number}\\.?\\s*`), ""));
                    }
                    if (!qObj.question && container.length) {
                        qObj.question = clean(container.find(".question-prompt").text().replace(new RegExp(`^${number}\\.?\\s*`), ""));
                    }
                } else if (type === "multi_select") {
                    const checkboxName = $section(`input[type='checkbox'][name='q${number}']`).length ? `q${number}` : `q${range.start}`;
                    const checkboxInputs = $section(`input[type='checkbox'][name='${checkboxName}']`).toArray();
                    const labels = checkboxInputs.map(input => $section(input).closest("label")).filter(l => l.length);
                    if (labels.length) {
                        qObj.options = optionsFromLabels($section, labels);
                    }

                    const headingEl = checkboxInputs.length ? $section(checkboxInputs[0]).closest(".question").find(".question-prompt, h2, h3, h4, p").first() : null;
                    if (headingEl && headingEl.length) {
                        const clone = headingEl.clone();
                        clone.find("strong, span.sr-only").remove();
                        qObj.question = clean(clone.text().replace(new RegExp(`^Questions?\\s+\\d+.*$`, "i"), ""));
                    }
                    if (!qObj.question) {
                        qObj.question = parsedInstr.text;
                    }
                } else {
                    const $input = $section(`input[id='q${number}'], input[name='q${number}']`).first();
                    if ($input.length) {
                        qObj.question = extractQuestionText($, $input);
                    }
                }

                groupQuestions.push(qObj);
            }

            return {
                type: groupQuestions[0]?.type || "sentence_completion",
                instructionTitle: parsedInstr.title || heading.text,
                instructionText: parsedInstr.text || "",
                questions: groupQuestions
            };
        }).filter(group => group.questions.length > 0);

        return {
            number: partNumber,
            title: `Part ${partNumber}`,
            sectionHtml: sanitizeHtml(sectionHtml),
            questionGroups
        };
    });
}

module.exports = {
    parseStandaloneListeningHtml
};
