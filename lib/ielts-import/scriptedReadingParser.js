const cheerio = require("cheerio");
const { sanitizeHtml } = require("./htmlSanitizer");
const { normalizeText, stripTags, vm } = require("./utils");
const { loadDom, extractQuestionGroup, findQuestionGroups } = require("./domParser");

const ANSWER_CODE_MAP = {
    T: "TRUE",
    F: "FALSE",
    Y: "YES",
    N: "NO",
    NGV: "NOT GIVEN"
};

function extractScriptBlock(html) {
    const source = String(html || "");
    const start = source.indexOf("function blank(");
    const passagesStart = source.indexOf("const PASSAGES");
    const stateMatch = /\/\*\s*=+\s*STATE/i.exec(source);
    const stateStart = stateMatch ? stateMatch.index : source.indexOf("const state =");

    if (passagesStart === -1 || stateStart === -1) {
        return "";
    }

    return source.slice(start === -1 ? passagesStart : start, stateStart);
}

function extractScriptedReadingData(html) {
    const scriptBlock = extractScriptBlock(html);

    if (!scriptBlock) {
        return null;
    }

    const wrapped = `
        (() => {
            ${scriptBlock}
            return {
                passages: PASSAGES,
                titles: PASSAGE_TITLES,
                answerKey: AK,
                questions: QUESTIONS
            };
        })()
    `;

    try {
        return vm.runInNewContext(wrapped, Object.create(null), { timeout: 1000 });
    } catch (error) {
        return null;
    }
}

function extractLowercaseScriptedReadingData(html) {
    const source = String(html || "");
    const passagesStart = source.indexOf("const passages =");
    const renderEnd = source.indexOf("function renderQuestions");

    if (passagesStart === -1 || renderEnd === -1 || !/const\s+answerKey\s*=/.test(source)) {
        return null;
    }

    const scriptBlock = source
        .slice(passagesStart, renderEnd)
        // loadHtml decodes HTML entities before parsing. Replace the page's
        // entity-escaping helper because its decoded quote literal is no
        // longer valid JavaScript, and DOM access is unnecessary here.
        .replace(/^.*const\s+\$\s*=\s*id\s*=>.*$/m, "const esc = s => String(s);");
    const wrapped = `
        (() => {
            ${scriptBlock}
            return {
                passages,
                answerKey,
                questionHtml: [renderP1(), renderP2(), renderP3()]
            };
        })()
    `;

    try {
        return vm.runInNewContext(wrapped, Object.create(null), { timeout: 1000 });
    } catch (error) {
        return null;
    }
}

function normalizeAnswerValue(value) {
    if (Array.isArray(value)) {
        return value.map(normalizeAnswerValue).filter(Boolean).join("|");
    }

    const raw = String(value ?? "").trim();
    return ANSWER_CODE_MAP[raw] || raw;
}

function parsePassageHtml(html, number, fallbackTitle) {
    const $ = cheerio.load(String(html || ""), { decodeEntities: false });
    const title = normalizeText(fallbackTitle || $(".pass-title, h1, h2, h4").first().text() || `Reading Passage ${number}`);
    const paragraphs = [];

    $(".pass-body p, p").each((_, element) => {
        const $paragraph = $(element);
        const clone = $paragraph.clone();
        const letter = normalizeText(clone.find(".para-letter").first().text()).replace(/[^A-Z]/g, "") || null;

        clone.find(".para-letter").first().remove();

        const text = normalizeText(clone.text());
        const paragraphHtml = sanitizeHtml(clone.html() || "");

        if (text) {
            paragraphs.push({
                letter,
                html: paragraphHtml,
                text
            });
        }
    });

    const passageText = paragraphs
        .map((paragraph) => `${paragraph.letter ? `${paragraph.letter}. ` : ""}${paragraph.text}`)
        .join("\n\n");

    return {
        number,
        title,
        displayLabel: `Reading Passage ${number}`,
        passageTitle: title,
        passageText,
        passageHtml: sanitizeHtml($(".pass-body").html() || html),
        paragraphs
    };
}

function parseInstructionText(content) {
    const title = stripTags(content).match(/Questions?\s+\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}|Question\s+\d{1,2}/i)?.[0] || "";
    const text = stripTags(content)
        .replace(title, "")
        .replace(/\s+/g, " ")
        .trim();

    return { title, text };
}

function completionHtml(rawHtml) {
    const $ = cheerio.load(`<div id="root">${rawHtml || ""}</div>`, { decodeEntities: false });
    const blanks = [];

    $("#root").find("input[data-q], input[id^='q']").each((_, input) => {
        const $input = $(input);
        const number = Number($input.attr("data-q") || String($input.attr("id") || "").replace(/^q/i, ""));

        if (number) {
            blanks.push(number);
        }

        const replacement = `<span class="ielts-blank"${number ? ` data-blank="${number}"` : ""}>______</span>`;
        const wrapper = $input.closest(".q-blank");

        if (wrapper.length) {
            wrapper.replaceWith(replacement);
        } else {
            $input.replaceWith(replacement);
        }
    });

    return {
        html: sanitizeHtml($("#root").html() || ""),
        blanks: [...new Set(blanks)]
    };
}

function optionObjects(options = []) {
    return options.map((option) => {
        if (Array.isArray(option)) {
            return { value: String(option[0]), label: String(option[1] || option[0]) };
        }

        return { value: String(option), label: String(option) };
    });
}

function groupTypeFromItems(items, instructionText) {
    const firstQuestion = items.find((item) => item.type !== "group-header" && item.type !== "html");

    if (firstQuestion?.type === "tfng") return "true_false_not_given";
    if (firstQuestion?.type === "ynng") return "yes_no_not_given";
    if (firstQuestion?.type === "mcq") return "multiple_choice";
    if (firstQuestion?.type === "select-q" && /people|person|list of ideas|match each person/i.test(instructionText)) {
        return "matching_features";
    }
    if (firstQuestion?.type === "select-q") return "matching_information";
    if (/complete the notes/i.test(instructionText)) return "notes_completion";
    if (/complete the summary/i.test(instructionText)) return "summary_completion";

    return "sentence_completion";
}

function choiceInstruction(type, passageNumber) {
    if (type === "yes_no_not_given") {
        return `Do the following statements agree with the claims of the writer in Reading Passage ${passageNumber}?`;
    }

    return `Do the following statements agree with the information given in Reading Passage ${passageNumber}?`;
}

function buildQuestionGroup({ passageNumber, index, header, items, answerKey }) {
    const parsedInstruction = parseInstructionText(header?.content || "");
    const type = groupTypeFromItems(items, parsedInstruction.text);
    const instructionText = (type === "true_false_not_given" || type === "yes_no_not_given")
        ? choiceInstruction(type, passageNumber)
        : parsedInstruction.text;
    const options = optionObjects(items.find((item) => item.options)?.options || []);
    const questions = [];
    let contentHtml = "";

    items.forEach((item) => {
        if (item.type === "tfng" || item.type === "ynng") {
            const isYesNo = item.type === "ynng";
            questions.push({
                number: item.n,
                type,
                question: item.text,
                stemHtml: sanitizeHtml(item.text),
                options: isYesNo ? ["YES", "NO", "NOT GIVEN"] : ["TRUE", "FALSE", "NOT GIVEN"],
                answer: normalizeAnswerValue(answerKey[String(item.n)])
            });
        }

        if (item.type === "select-q") {
            const itemOptions = optionObjects(item.options || []);
            questions.push({
                number: item.n,
                type,
                question: item.text,
                stemHtml: sanitizeHtml(item.text),
                options: itemOptions,
                answer: normalizeAnswerValue(answerKey[String(item.n)])
            });
        }

        if (item.type === "mcq") {
            const itemOptions = optionObjects(item.options || []);
            questions.push({
                number: item.n,
                type,
                question: item.text,
                stemHtml: sanitizeHtml(item.text),
                options: itemOptions,
                answer: normalizeAnswerValue(answerKey[String(item.n)])
            });
        }

        if (item.type === "html") {
            const completion = completionHtml(item.content || "");
            contentHtml = [contentHtml, completion.html].filter(Boolean).join("");
            completion.blanks.forEach((number) => {
                questions.push({
                    number,
                    type,
                    question: "",
                    stemHtml: "",
                    options: [],
                    answer: normalizeAnswerValue(answerKey[String(number)])
                });
            });
        }
    });

    return {
        id: `scripted-reading-p${passageNumber}-g${index + 1}`,
        type,
        instructionTitle: parsedInstruction.title,
        instructionText,
        instructionHtml: {
            titleHtml: parsedInstruction.title ? `<h3>${parsedInstruction.title}</h3>` : "",
            bodyHtml: "",
            rulesHtml: ""
        },
        rule: /[A-Z]\s*(?:-|–|—)\s*[A-Z]/.test(instructionText)
            ? instructionText.match(/[A-Z]\s*(?:-|–|—)\s*[A-Z]/)?.[0] || ""
            : "",
        options,
        contentHtml,
        questions: questions.sort((a, b) => a.number - b.number),
        questionRange: questions.length ? [questions[0].number, questions[questions.length - 1].number] : []
    };
}

function buildQuestionGroups(items = [], passageNumber, answerKey) {
    const groups = [];
    let header = null;
    let groupItems = [];

    function flush() {
        if (!header || !groupItems.length) {
            groupItems = [];
            return;
        }

        groups.push(buildQuestionGroup({
            passageNumber,
            index: groups.length,
            header,
            items: groupItems,
            answerKey
        }));
        groupItems = [];
    }

    items.forEach((item) => {
        if (item.type === "group-header") {
            flush();
            header = item;
            return;
        }

        groupItems.push(item);
    });
    flush();

    return groups;
}

function parseScriptedReadingHtml(html, answers = {}) {
    const data = extractScriptedReadingData(html);

    if (!data?.passages || !data?.questions) {
        return parseLowercaseScriptedReadingHtml(html, answers);
    }

    const answerKey = { ...answers };
    Object.entries(data.answerKey || {}).forEach(([number, value]) => {
        answerKey[number] = normalizeAnswerValue(value);
    });

    return Object.keys(data.passages)
        .map(Number)
        .sort((a, b) => a - b)
        .map((number) => {
            const passage = parsePassageHtml(data.passages[number], number, data.titles?.[number]);
            passage.questionGroups = buildQuestionGroups(data.questions[number] || [], number, answerKey);
            return passage;
        });
}

function parseLowercaseScriptedReadingHtml(html, answers = {}) {
    const data = extractLowercaseScriptedReadingData(html);
    if (!Array.isArray(data?.passages) || !Array.isArray(data?.questionHtml)) {
        return [];
    }

    const answerKey = { ...answers };
    Object.entries(data.answerKey || {}).forEach(([number, value]) => {
        answerKey[number] = normalizeAnswerValue(value);
    });

    return data.passages.map((rawPassage, index) => {
        const number = Number(rawPassage.id) || index + 1;
        const paragraphs = (rawPassage.paras || []).map(([letter, text]) => ({
            letter: normalizeText(letter || "") || null,
            html: sanitizeHtml(String(text || "")),
            text: normalizeText(text || "")
        })).filter((paragraph) => paragraph.text);
        const passageHtml = paragraphs.map((paragraph) =>
            `<p>${paragraph.letter ? `<strong class="para-label">${paragraph.letter}</strong> ` : ""}${paragraph.html}</p>`
        ).join("");
        const questionHtml = String(data.questionHtml[index] || "");
        const $ = loadDom(questionHtml);
        const questionGroups = findQuestionGroups($, $.root()).map((groupEl) =>
            extractQuestionGroup($, groupEl, answerKey, "reading")
        ).filter((group) => group.questions?.length);

        questionGroups.forEach((group) => {
            if (group.contentHtml) {
                group.questions.forEach((question) => {
                    const number = Number(question.number);
                    if (!number) return;
                    group.contentHtml = group.contentHtml.replace(
                        new RegExp(`(^|[^\\d])${number}\\s+(<span[^>]*data-blank=["']${number}["'][^>]*>)`, "g"),
                        "$1$2"
                    );
                });

                if (
                    group.type === "sentence_completion"
                    && /complete\s+the\s+summary(?:\s+paragraph)?\s+below/i.test(group.contentHtml)
                ) {
                    group.type = "summary_completion";
                    group.questions.forEach((question) => {
                        question.type = "summary_completion";
                    });
                }

                if (["notes_completion", "summary_completion"].includes(group.type)) {
                    const instructionMatch = group.contentHtml.match(
                        /<div\b[^>]*class=["'][^"']*\binstr\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
                    );
                    if (instructionMatch) {
                        let instructionHtmlParts = instructionMatch[1]
                            .split(/<br\s*\/?>/i)
                            .map((part) => part.trim())
                            .filter((part) => stripTags(part));
                        if (instructionHtmlParts.length === 1) {
                            const inlineParts = instructionHtmlParts[0].match(
                                /^(.*?\bbelow\.)\s+(In\s+boxes?\b[\s\S]*)$/i
                            );
                            if (inlineParts) {
                                instructionHtmlParts = [inlineParts[1], inlineParts[2]];
                            }
                        }
                        const instructionParts = instructionHtmlParts.map((part) => stripTags(part));
                        const body = instructionParts[0] || "";
                        const rule = instructionParts.slice(1).join(" ");

                        group.instructionText = body;
                        group.rule = rule;
                        group.instructionHtml = {
                            ...(group.instructionHtml || {}),
                            bodyHtml: body ? `<p>${instructionHtmlParts[0]}</p>` : "",
                            rulesHtml: rule ? `<p>${instructionHtmlParts.slice(1).join("<br>")}</p>` : ""
                        };
                        group.contentHtml = group.contentHtml.replace(instructionMatch[0], "");
                    }

                    if (group.type === "summary_completion") {
                        group.instructionTitle = String(group.instructionTitle || "")
                            .replace(/\s+[—–-]\s*Summary Completion\s*$/i, "");
                        group.instructionHtml = {
                            ...(group.instructionHtml || {}),
                            titleHtml: group.instructionTitle ? `<h3>${group.instructionTitle}</h3>` : ""
                        };
                    }

                    if (group.type === "notes_completion") {
                        group.contentHtml = group.contentHtml.replace(
                            /(<div\b[^>]*class=["'][^"']*\bnote-title\b[^"']*["'][^>]*>)\s*•\s*([^<]*?)(\s*<\/div>)/gi,
                            (_, opening, label, closing) => `${opening}${label.trim().replace(/:$/, "")}:${closing}`
                        );
                    }

                    const titleMatch = group.contentHtml.match(
                        /<div\b[^>]*class=["'][^"']*\bnote-title\b[^"']*["'][^>]*>\s*([^<]+?)\s*<\/div>/i
                    );
                    if (titleMatch) {
                        group.contentTitle = stripTags(titleMatch[1]);
                        group.contentHtml = group.contentHtml.replace(titleMatch[0], "");
                    }

                    if (group.type === "notes_completion") {
                        group.contentHtml = group.contentHtml
                            .replace(
                                /(<div\b[^>]*class=["'][^"']*\bnote-title\b[^"']*["'][^>]*>)\s*([^<]+?:)\s*(<\/div>)/gi,
                                "$1<strong>$2</strong>$3"
                            )
                            .replace(/(^|>)(\s*)◦(\s*)/g, "$1$2<strong>•</strong>$3");
                    }
                }
            }

            if (group.type === "matching_headings" && group.layoutHtml) {
                const $layout = loadDom(group.layoutHtml);
                const instructionElement = $layout(".instr").first();
                const instructionHtmlParts = String(instructionElement.html() || "")
                    .split(/<br\s*\/?>/i)
                    .map((part) => part.trim())
                    .filter((part) => stripTags(part));
                const instructionParts = instructionHtmlParts.map((part) => stripTags(part));
                const ruleIndex = instructionParts.findIndex((part) => /^write\b/i.test(part));
                const bodyParts = ruleIndex >= 0 ? instructionParts.slice(0, ruleIndex) : instructionParts;
                const bodyHtmlParts = ruleIndex >= 0 ? instructionHtmlParts.slice(0, ruleIndex) : instructionHtmlParts;
                const rule = ruleIndex >= 0 ? instructionParts.slice(ruleIndex).join(" ") : "";
                const rulesHtml = ruleIndex >= 0 ? instructionHtmlParts.slice(ruleIndex).join("<br>") : "";
                const headingOptions = [];

                $layout(".listbox > div").each((_, element) => {
                    const $option = $layout(element);
                    const value = $option.find("b, strong").first().text().replace(/[.\s]+$/g, "").trim();
                    const label = normalizeText($option.text());
                    if (!value || !label) return;
                    headingOptions.push({ value, label, html: sanitizeHtml($option.html() || label) });
                });

                if (headingOptions.length) {
                    group.instructionTitle = String(group.instructionTitle || "").replace(/\s+[—–-]\s*Matching Headings\s*$/i, "");
                    group.instructionText = bodyParts.join(" ");
                    group.rule = rule;
                    group.instructionHtml = {
                        ...(group.instructionHtml || {}),
                        titleHtml: group.instructionTitle ? `<h3>${group.instructionTitle}</h3>` : "",
                        bodyHtml: bodyHtmlParts.map((part) => `<p>${part}</p>`).join(""),
                        rulesHtml: rulesHtml ? `<p>${rulesHtml}</p>` : ""
                    };
                    group.optionsTitle = "List of Headings";
                    group.options = headingOptions;
                    group.questions.forEach((question) => {
                        question.options = headingOptions;
                    });
                }
            }

            if (group.type === "matching_information" && group.layoutHtml) {
                const $layout = loadDom(group.layoutHtml);
                const instructionElement = $layout(".instr").first();
                const instructionHtmlParts = String(instructionElement.html() || "")
                    .split(/<br\s*\/?>/i)
                    .map((part) => part.trim())
                    .filter((part) => stripTags(part));
                const instructionParts = instructionHtmlParts.map((part) => stripTags(part));
                const ruleIndex = instructionParts.findIndex((part) => /^write\b/i.test(part));

                if (instructionParts.length) {
                    const bodyParts = ruleIndex >= 0 ? instructionParts.slice(0, ruleIndex) : instructionParts;
                    const bodyHtmlParts = ruleIndex >= 0 ? instructionHtmlParts.slice(0, ruleIndex) : instructionHtmlParts;
                    const ruleParts = ruleIndex >= 0 ? instructionParts.slice(ruleIndex) : [];
                    const ruleHtmlParts = ruleIndex >= 0 ? instructionHtmlParts.slice(ruleIndex) : [];

                    group.instructionText = bodyParts.join(" ");
                    group.rule = ruleParts.join(" ");
                    group.instructionHtml = {
                        ...(group.instructionHtml || {}),
                        titleHtml: group.instructionTitle ? `<h3>${group.instructionTitle}</h3>` : "",
                        bodyHtml: bodyHtmlParts.map((part) => `<p>${part}</p>`).join(""),
                        rulesHtml: ruleHtmlParts.length ? `<p>${ruleHtmlParts.join("<br>")}</p>` : ""
                    };
                }
            }

            const instruction = `${group.instructionTitle || ""} ${group.instructionText || ""} ${group.layoutHtml || ""}`;
            if (group.questions.length !== 2 || !/choose\s+two\s+letters/i.test(instruction)) return;

            const pairAnswers = [...new Set(group.questions
                .flatMap((question) => String(question.answer || "").split("|"))
                .map((answer) => answer.trim())
                .filter(Boolean))];
            if (pairAnswers.length !== 2) return;

            group.type = "multi_select";
            group.questions.forEach((question) => {
                question.type = "multi_select";
                question.answer = pairAnswers.join("|");
            });
        });

        return {
            number,
            title: normalizeText(rawPassage.title || `Reading Passage ${number}`),
            displayLabel: `Reading Passage ${number}`,
            passageLabel: `READING PASSAGE ${number}`,
            passageTitle: normalizeText(rawPassage.title || `Reading Passage ${number}`),
            passageText: paragraphs.map((paragraph) =>
                `${paragraph.letter ? `${paragraph.letter}. ` : ""}${paragraph.text}`
            ).join("\n\n"),
            passageHtml: sanitizeHtml(passageHtml),
            paragraphs,
            questionGroups
        };
    });
}

module.exports = {
    parseScriptedReadingHtml,
    extractScriptedReadingData,
    extractLowercaseScriptedReadingData,
    normalizeAnswerValue
};
