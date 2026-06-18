const fs = require("fs");
const path = require("path");
const vm = require("vm");

function decodeHtml(value) {
    return String(value || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#039;/gi, "'")
        .replace(/&#39;/gi, "'")
        .replace(/&rsquo;/gi, "'")
        .replace(/&lsquo;/gi, "'")
        .replace(/&rdquo;/gi, '"')
        .replace(/&ldquo;/gi, '"')
        .replace(/&ndash;/gi, "-")
        .replace(/&mdash;/gi, "-");
}

function normalizeText(value) {
    return decodeHtml(value)
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function stripTags(html) {
    return normalizeText(
        String(html || "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<\/div>/gi, "\n")
            .replace(/<\/li>/gi, "\n")
            .replace(/<\/tr>/gi, "\n")
            .replace(/<\/h[1-6]>/gi, "\n")
            .replace(/<[^>]+>/g, "")
    );
}

function getAttr(tag, name) {
    const pattern = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
    const match = String(tag || "").match(pattern);

    return match ? decodeHtml(match[1]) : "";
}

function findStartTagById(html, id) {
    const pattern = new RegExp(`<([a-z0-9]+)\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, "i");
    const match = pattern.exec(html);

    if (!match) {
        return null;
    }

    return {
        tagName: match[1].toLowerCase(),
        tag: match[0],
        index: match.index,
        end: match.index + match[0].length
    };
}

function extractBalancedElementAt(html, startInfo) {
    const tagName = startInfo.tagName;
    const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
    tokenPattern.lastIndex = startInfo.index;

    let depth = 0;
    let token;

    while ((token = tokenPattern.exec(html)) !== null) {
        if (token[0].startsWith("</")) {
            depth--;
        } else if (!token[0].endsWith("/>")) {
            depth++;
        }

        if (depth === 0) {
            return {
                outerHTML: html.slice(startInfo.index, tokenPattern.lastIndex),
                innerHTML: html.slice(startInfo.end, token.index),
                startIndex: startInfo.index,
                endIndex: tokenPattern.lastIndex,
                startTag: startInfo.tag
            };
        }
    }

    return null;
}

function extractElementById(html, id) {
    const startInfo = findStartTagById(html, id);
    return startInfo ? extractBalancedElementAt(html, startInfo) : null;
}

function extractElementsByClass(html, className, tagName = "div") {
    const items = [];
    const pattern = new RegExp(`<${tagName}\\b(?=[^>]*\\bclass=["'][^"']*\\b${className}\\b)[^>]*>`, "gi");
    let match;

    while ((match = pattern.exec(html)) !== null) {
        const startInfo = {
            tagName,
            tag: match[0],
            index: match.index,
            end: match.index + match[0].length
        };
        const element = extractBalancedElementAt(html, startInfo);

        if (element) {
            items.push(element);
            pattern.lastIndex = element.endIndex;
        }
    }

    return items;
}

function parseCorrectAnswers(html) {
    const match = html.match(/const\s+correctAnswers\s*=\s*(\{[\s\S]*?\n\s*\});/);

    if (!match) {
        return {};
    }

    try {
        return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
    } catch (error) {
        console.warn("Could not parse correctAnswers:", error.message);
        return {};
    }
}

function parsePassage(passageHtml) {
    const titleMatch = passageHtml.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i);
    const passageTitle = titleMatch ? stripTags(titleMatch[1]) : "";
    const withoutTitle = passageHtml.replace(/<h4\b[^>]*>[\s\S]*?<\/h4>/i, "");
    const withoutDropZones = withoutTitle.replace(/<div\b(?=[^>]*\bdrop-zone\b)[\s\S]*?<\/div>/gi, "");
    const paragraphMatches = [...withoutDropZones.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
    const passageText = paragraphMatches.length
        ? paragraphMatches.map((item) => stripTags(item[1])).filter(Boolean).join("\n\n")
        : stripTags(withoutDropZones);

    return {
        passageTitle,
        passageText
    };
}

function parseOptions(html) {
    return [...String(html || "").matchAll(/<label\b[^>]*>\s*<input\b[^>]*\bvalue=["']([^"']+)["'][^>]*>\s*([\s\S]*?)<\/label>/gi)]
        .map((match) => ({
            value: decodeHtml(match[1]),
            text: stripTags(match[2])
        }));
}

function parseQuestionTitle(html, fallbackStart, fallbackEnd) {
    const prompt = extractElementsByClass(html, "question-prompt")[0];
    const promptText = prompt ? stripTags(prompt.innerHTML) : stripTags(html);
    const titleMatch = promptText.match(/Questions?\s+\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}|Question\s+\d{1,2}/i);
    const rangeMatch = titleMatch
        ? titleMatch[0].match(/(\d{1,2})(?:\s*(?:-|–|—|to)\s*(\d{1,2}))?/)
        : null;
    const startQuestion = rangeMatch ? Number(rangeMatch[1]) : fallbackStart;
    const endQuestion = rangeMatch && rangeMatch[2] ? Number(rangeMatch[2]) : fallbackEnd;

    return {
        sectionTitle: titleMatch ? titleMatch[0] : `Questions ${fallbackStart}-${fallbackEnd}`,
        startQuestion,
        endQuestion,
        instruction: promptText
    };
}

function answerFor(answers, number) {
    const answer = answers[String(number)];

    if (answer === undefined) {
        return null;
    }

    return Array.isArray(answer) ? answer : [answer];
}

function parseTrueFalseQuestions(groupHtml, answers) {
    return extractElementsByClass(groupHtml, "tf-question").map((element) => {
        const number = Number(getAttr(element.startTag, "data-q-start"));
        const textElement = extractElementsByClass(element.innerHTML, "tf-question-text", "span")[0];

        return {
            number,
            type: "true_false_not_given",
            text: textElement ? stripTags(textElement.innerHTML) : "",
            options: ["TRUE", "FALSE", "NOT GIVEN"],
            answer: answerFor(answers, number)
        };
    });
}

function parseMultipleChoiceQuestions(groupHtml, answers) {
    return extractElementsByClass(groupHtml, "multi-choice-question").map((element) => {
        const number = Number(getAttr(element.startTag, "data-q-start"));
        const prompt = extractElementsByClass(element.innerHTML, "question-prompt")[0];
        const promptText = prompt ? stripTags(prompt.innerHTML).replace(/^Questions?\s+\d+.*?\n/i, "") : "";

        return {
            number,
            type: "multiple_choice",
            text: promptText,
            options: parseOptions(element.innerHTML),
            answer: answerFor(answers, number)
        };
    });
}

function replaceInputsWithBlanks(html) {
    return String(html || "").replace(/<input\b[^>]*\bid=["']q(\d{1,2})["'][^>]*>/gi, " [[q$1]] ");
}

function parseSummaryQuestions(groupHtml, answers) {
    const summaryMatch = groupHtml.match(/<div\b(?=[^>]*\bsummary-text\b)[^>]*>([\s\S]*?)<\/div>/i);
    const summaryHtml = summaryMatch ? summaryMatch[1] : groupHtml;
    const summaryText = stripTags(replaceInputsWithBlanks(summaryHtml));
    const numbers = [...summaryHtml.matchAll(/\bid=["']q(\d{1,2})["']/gi)].map((match) => Number(match[1]));

    return numbers.map((number) => ({
        number,
        type: "summary_completion",
        text: summaryText,
        answer: answerFor(answers, number)
    }));
}

function parseMatchingTableQuestions(groupHtml, answers) {
    return [...groupHtml.matchAll(/<td\b(?=[^>]*\bclass=["'][^"']*\bstatement\b)[^>]*>([\s\S]*?)<\/td>/gi)]
        .map((match) => {
            const statement = stripTags(match[1]);
            const numberMatch = statement.match(/^(\d{1,2})[\).]?\s*(.+)$/);

            if (!numberMatch) {
                return null;
            }

            const number = Number(numberMatch[1]);

            return {
                number,
                type: "matching",
                text: numberMatch[2],
                options: [...groupHtml.matchAll(/<th>([A-Z])<\/th>/g)].map((item) => item[1]),
                answer: answerFor(answers, number)
            };
        })
        .filter(Boolean);
}

function parseHeadingQuestions(groupHtml, passageHtml, start, end, answers) {
    const options = [...groupHtml.matchAll(/<div\b(?=[^>]*\bdrag-item\b)[^>]*\bdata-value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/div>/gi)]
        .map((match) => ({
            value: decodeHtml(match[1]),
            text: stripTags(match[2])
        }));
    const foundNumbers = [...passageHtml.matchAll(/<div\b(?=[^>]*\bdrop-zone\b)[^>]*\bdata-q-start=["'](\d{1,2})["'][^>]*>/gi)]
        .map((match) => Number(match[1]))
        .filter((number) => number >= start && number <= end);
    const numbers = foundNumbers.length
        ? foundNumbers
        : Array.from({ length: end - start + 1 }, (_, index) => start + index);

    return numbers.map((number) => ({
        number,
        type: "heading_matching",
        text: `Choose the correct heading for paragraph ${number}.`,
        options,
        answer: answerFor(answers, number)
    }));
}

function parseFallbackItems(groupHtml, start, end, answers) {
    return Array.from({ length: end - start + 1 }, (_, index) => {
        const number = start + index;

        return {
            number,
            type: "unknown",
            text: "",
            answer: answerFor(answers, number)
        };
    });
}

function parseQuestionGroup(groupHtml, passageHtml, answers) {
    const startTag = groupHtml.match(/<div\b[^>]*\bclass=["'][^"']*\bquestion\b[^"']*["'][^>]*>/i);
    const start = startTag ? Number(getAttr(startTag[0], "data-q-start")) : 0;
    const end = startTag ? Number(getAttr(startTag[0], "data-q-end")) : start;
    const title = parseQuestionTitle(groupHtml, start, end);
    let items = [];

    if (groupHtml.includes("tf-question")) {
        items = parseTrueFalseQuestions(groupHtml, answers);
    } else if (groupHtml.includes("multi-choice-question")) {
        items = parseMultipleChoiceQuestions(groupHtml, answers);
    } else if (groupHtml.includes("summary-text") || groupHtml.includes("answer-input")) {
        items = parseSummaryQuestions(groupHtml, answers);
    } else if (groupHtml.includes("matching-table")) {
        items = parseMatchingTableQuestions(groupHtml, answers);
    } else if (groupHtml.includes("drag-drop-container")) {
        items = parseHeadingQuestions(groupHtml, passageHtml, start, end, answers);
    }

    if (!items.length) {
        items = parseFallbackItems(groupHtml, start, end, answers);
    }

    return {
        sectionTitle: title.sectionTitle,
        startQuestion: title.startQuestion,
        endQuestion: title.endQuestion,
        instruction: title.instruction,
        items
    };
}

function parseQuestionSet(questionSetHtml, passageHtml, answers) {
    return extractElementsByClass(questionSetHtml, "question")
        .map((element) => parseQuestionGroup(element.outerHTML, passageHtml, answers));
}

function parseReadingHtml(html) {
    const answers = parseCorrectAnswers(html);
    const passages = [];

    for (let part = 1; part <= 3; part++) {
        const passageElement = extractElementById(html, `passage-text-${part}`);
        const questionElement = extractElementById(html, `questions-${part}`);

        if (!passageElement) {
            continue;
        }

        const passage = parsePassage(passageElement.innerHTML);

        passages.push({
            passageTitle: passage.passageTitle,
            passageText: passage.passageText,
            questions: questionElement
                ? parseQuestionSet(questionElement.innerHTML, passageElement.innerHTML, answers)
                : []
        });
    }

    return passages;
}

function parseFile(inputPath, outputPath) {
    const html = fs.readFileSync(inputPath, "utf8");
    const parsed = parseReadingHtml(html);
    fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2), "utf8");
    return parsed;
}

if (require.main === module) {
    const inputPath = process.argv[2];
    const outputPath = process.argv[3] || path.join(__dirname, "reading.json");

    if (!inputPath) {
        console.error("Usage: node reading-html-parser.js <input.html> [output.json]");
        process.exit(1);
    }

    const parsed = parseFile(inputPath, outputPath);
    console.info(`Parsed ${parsed.length} passages`);
    console.info(`Saved ${outputPath}`);
}

module.exports = {
    parseReadingHtml,
    parseFile
};
