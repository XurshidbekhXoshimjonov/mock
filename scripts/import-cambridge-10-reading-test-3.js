"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const ROOT = path.resolve(__dirname, "..");
const sourceArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const SOURCE = path.resolve(sourceArgument || "C:/Users/dizay/Downloads/academic_reading_test_3.html");
const TEST_ID = "cambridge-ielts-10-test-3-reading";
const TITLE = "Cambridge IELTS 10 Test 3 Reading";

if (!fs.existsSync(SOURCE)) {
    throw new Error(`Source file not found: ${SOURCE}`);
}

const source = fs.readFileSync(SOURCE, "utf8");
const $ = cheerio.load(source, { decodeEntities: false });
const createdAt = new Date().toISOString();

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function extractBalancedLiteral(sourceText, name) {
    const assignment = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`).exec(sourceText);
    if (!assignment) throw new Error(`Could not find ${name}`);
    const start = assignment.index + assignment[0].length;
    if (sourceText[start] !== "{") throw new Error(`${name} is not an object literal`);
    let depth = 0;
    let quote = "";
    let escaped = false;

    for (let index = start; index < sourceText.length; index += 1) {
        const character = sourceText[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === quote) quote = "";
            continue;
        }
        if (character === '"' || character === "'" || character === "`") {
            quote = character;
            continue;
        }
        if (character === "{") depth += 1;
        if (character === "}") depth -= 1;
        if (depth === 0) return sourceText.slice(start, index + 1);
    }
    throw new Error(`Unclosed ${name} literal`);
}

const rawAnswers = vm.runInNewContext(
    `(${extractBalancedLiteral(source, "answers")})`,
    Object.create(null),
    { timeout: 1000 }
);
const answers = Object.fromEntries(
    Object.entries(rawAnswers).map(([number, values]) => [
        Number(number),
        (Array.isArray(values) ? values : [values])
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .join(" | ")
    ])
);

function option(value, text) {
    return { value, label: text ? `${value}. ${text}` : value };
}

function parseKeyGrid(container) {
    const children = $(container).find(".key-grid").children().toArray();
    const parsed = [];
    for (let index = 0; index < children.length; index += 2) {
        const value = cleanText($(children[index]).text());
        const text = cleanText($(children[index + 1]).text());
        if (value) parsed.push(option(value, text));
    }
    return parsed;
}

function question(number, type, text, questionOptions = []) {
    return {
        number,
        type,
        question: cleanText(text),
        stemHtml: escapeHtml(cleanText(text)),
        options: questionOptions,
        answer: answers[number]
    };
}

function questionRoot(number) {
    const root = $(`[data-q="${number}"]`).first();
    if (!root.length) throw new Error(`Question ${number} was not found`);
    return root;
}

function questionStem(number) {
    const clone = questionRoot(number).clone();
    clone.find("input.text-answer").replaceWith(" ______ ");
    clone.find(".qnum, .feedback, .answer-row, .options, select").remove();
    return cleanText(clone.text()).replace(new RegExp(`^${number}\\s*`), "");
}

function multipleChoiceQuestion(number) {
    const root = questionRoot(number);
    const stem = cleanText(root.find("strong").first().text());
    const questionOptions = root.find(".options label").toArray().map((label) => {
        const item = $(label);
        const value = cleanText(item.find(".letter").first().text()) || item.find("input").attr("value");
        const text = cleanText(item.find("span").last().text()).replace(new RegExp(`^${value}\\s*`), "");
        return option(value, text);
    });
    if (!stem || questionOptions.length < 3) throw new Error(`Could not parse multiple-choice question ${number}`);
    return question(number, "multiple_choice", stem, questionOptions);
}

function group({ passage, suffix, type, start, end, instructionText, rule = "", options = [], optionsTitle = "", example = null, hideOptionsList = false, questions, contentHtml = "" }) {
    return {
        id: `${TEST_ID}-p${passage}-${suffix}`,
        type,
        instructionTitle: `Questions ${start}–${end}`,
        instructionText,
        instructionHtml: {
            titleHtml: `<h3>Questions ${start}–${end}</h3>`,
            bodyHtml: `<p>${escapeHtml(instructionText)}</p>`,
            rulesHtml: rule ? `<p>${escapeHtml(rule)}</p>` : ""
        },
        rule,
        options,
        optionsTitle,
        example,
        hideOptionsList,
        contentHtml,
        questionNumbers: questions.map((item) => item.number),
        questions,
        questionRange: [start, end]
    };
}

function completionContent(numbers, title) {
    const lines = numbers.map((number) => {
        const marker = `<span class="ielts-blank" data-blank="${number}">______</span>`;
        return `<p>${escapeHtml(questionStem(number)).replace("______", marker)}</p>`;
    }).join("");
    return `<div class="ielts-import-summary"><div class="ielts-summary-title">${escapeHtml(title)}</div><div class="summary-text">${lines}</div></div>`;
}

const headingOptions = parseKeyGrid($("#questions-1 .heading-box").first());
const paragraphOptions = "ABCDEFGHI".split("").map((letter) => option(letter, `Paragraph ${letter}`));
const wordOptions = parseKeyGrid($("#questions-3 .word-box").first());

const passageOneGroups = [
    group({
        passage: 1,
        suffix: "g1",
        type: "matching_headings",
        start: 1,
        end: 4,
        instructionText: "Reading Passage 1 has five paragraphs, A–E. Choose the correct heading for paragraphs B–E from the list of headings below.",
        options: headingOptions,
        optionsTitle: "List of Headings",
        example: { text: "Paragraph A - viii" },
        questions: [1, 2, 3, 4].map((number) =>
            question(number, "matching_headings", questionStem(number), headingOptions)
        )
    }),
    group({
        passage: 1,
        suffix: "g2",
        type: "true_false_not_given",
        start: 5,
        end: 10,
        instructionText: "Do the following statements agree with the information given in Reading Passage 1?",
        rule: "Write TRUE, FALSE or NOT GIVEN.",
        options: ["TRUE", "FALSE", "NOT GIVEN"],
        questions: [5, 6, 7, 8, 9, 10].map((number) =>
            question(number, "true_false_not_given", questionStem(number), ["TRUE", "FALSE", "NOT GIVEN"])
        )
    }),
    group({
        passage: 1,
        suffix: "g3",
        type: "sentence_completion",
        start: 11,
        end: 13,
        instructionText: "Complete the sentences.",
        rule: "Choose NO MORE THAN THREE WORDS from the passage for each answer.",
        questions: [11, 12, 13].map((number) =>
            question(number, "sentence_completion", questionStem(number))
        )
    })
];

const passageTwoGroups = [
    group({
        passage: 2,
        suffix: "g1",
        type: "matching_information",
        start: 14,
        end: 18,
        instructionText: "Which paragraph contains the following information?",
        rule: "You may use any letter more than once.",
        options: paragraphOptions,
        optionsTitle: "Paragraphs",
        hideOptionsList: true,
        questions: [14, 15, 16, 17, 18].map((number) =>
            question(number, "matching_information", questionStem(number), paragraphOptions)
        )
    }),
    group({
        passage: 2,
        suffix: "g2",
        type: "notes_completion",
        start: 19,
        end: 22,
        instructionText: "Complete the notes.",
        rule: "Choose ONE WORD ONLY from the passage for each answer.",
        contentHtml: completionContent([19, 20, 21, 22], "Why believe the ‘light screen’ hypothesis?"),
        questions: [19, 20, 21, 22].map((number) =>
            question(number, "notes_completion", questionStem(number))
        )
    }),
    group({
        passage: 2,
        suffix: "g3",
        type: "true_false_not_given",
        start: 23,
        end: 25,
        instructionText: "Do the following statements agree with the information given in Reading Passage 2?",
        rule: "Write TRUE, FALSE or NOT GIVEN.",
        options: ["TRUE", "FALSE", "NOT GIVEN"],
        questions: [23, 24, 25].map((number) =>
            question(number, "true_false_not_given", questionStem(number), ["TRUE", "FALSE", "NOT GIVEN"])
        )
    }),
    group({
        passage: 2,
        suffix: "g4",
        type: "multiple_choice",
        start: 26,
        end: 26,
        instructionText: "Choose the correct letter, A, B, C or D.",
        questions: [multipleChoiceQuestion(26)]
    })
];

function summaryContent() {
    const paragraphs = $("#questions-3 .summary-text").toArray().map((paragraph) => {
        const clone = $(paragraph).clone();
        clone.find(".question-block").each((_, element) => {
            const number = Number($(element).attr("data-q"));
            $(element).replaceWith(`<span class="ielts-blank" data-blank="${number}">______</span>`);
        });
        return `<p>${clone.html()}</p>`;
    }).join("");
    const wordList = wordOptions
        .map((item) => `<span class="cbt-group-option-chip">${escapeHtml(item.label)}</span>`)
        .join("");
    return `<div class="ielts-import-summary"><div class="ielts-summary-title">The Éfaté burial site</div><div class="summary-text">${paragraphs}</div><div class="reading-practice-test-7-word-list-title">Word List</div><div class="cbt-group-options-box reading-practice-test-7-word-options" aria-label="Word List">${wordList}</div></div>`;
}

const passageThreeGroups = [
    group({
        passage: 3,
        suffix: "g1",
        type: "summary_completion",
        start: 27,
        end: 31,
        instructionText: "Complete the summary using the list of words and phrases, A–J, below.",
        options: wordOptions,
        contentHtml: summaryContent(),
        questions: [27, 28, 29, 30, 31].map((number) =>
            question(number, "summary_completion", "", wordOptions)
        )
    }),
    group({
        passage: 3,
        suffix: "g2",
        type: "multiple_choice",
        start: 32,
        end: 35,
        instructionText: "Choose the correct letter, A, B, C or D.",
        questions: [32, 33, 34, 35].map(multipleChoiceQuestion)
    }),
    group({
        passage: 3,
        suffix: "g3",
        type: "yes_no_not_given",
        start: 36,
        end: 40,
        instructionText: "Do the following statements agree with the views of the writer in Reading Passage 3?",
        rule: "Write YES, NO or NOT GIVEN.",
        options: ["YES", "NO", "NOT GIVEN"],
        questions: [36, 37, 38, 39, 40].map((number) =>
            question(number, "yes_no_not_given", questionStem(number), ["YES", "NO", "NOT GIVEN"])
        )
    })
];

const groupsByPassage = [passageOneGroups, passageTwoGroups, passageThreeGroups];

function elementTextWithBreaks(element) {
    const clone = $(element).clone();
    clone.find("br").replaceWith(" ");
    return cleanText(clone.text());
}

const passages = $(".passage").toArray().map((element, index) => {
    const passage = $(element);
    const paragraphRows = passage.find(".para").length
        ? passage.find(".para").toArray().map((row) => {
            const item = $(row);
            const paragraph = item.find("p").first();
            return {
                letter: cleanText(item.find(".para-label").text()) || null,
                html: paragraph.html() || "",
                text: cleanText(paragraph.text())
            };
        })
        : passage.children("p").toArray().map((paragraph) => ({
            letter: null,
            html: $(paragraph).html() || "",
            text: cleanText($(paragraph).text())
        }));
    const groups = groupsByPassage[index];
    const title = elementTextWithBreaks(passage.find(".passage-title").first());
    const subtitle = elementTextWithBreaks(passage.find(".passage-subtitle").first());

    return {
        id: `${TEST_ID}-passage-${index + 1}`,
        number: index + 1,
        title,
        subtitle,
        displayLabel: `Reading Passage ${index + 1}`,
        passageLabel: `Reading Passage ${index + 1}`,
        passageText: paragraphRows.map((item) => `${item.letter ? `${item.letter}. ` : ""}${item.text}`).join("\n\n"),
        passageHtml: paragraphRows.map((item) =>
            `<p>${item.letter ? `<strong>${escapeHtml(item.letter)}</strong> ` : ""}${item.html}</p>`
        ).join("\n"),
        paragraphs: paragraphRows,
        questionGroups: groups,
        questions: groups.flatMap((item) => item.questions)
    };
});

const allQuestions = passages
    .flatMap((passage) => passage.questions)
    .sort((left, right) => left.number - right.number);
const expectedNumbers = Array.from({ length: 40 }, (_, index) => index + 1);
if (passages.length !== 3) throw new Error(`Expected 3 passages, found ${passages.length}`);
if (JSON.stringify(allQuestions.map((item) => item.number)) !== JSON.stringify(expectedNumbers)) {
    throw new Error(`Invalid question sequence: ${allQuestions.map((item) => item.number).join(", ")}`);
}
if (Object.keys(answers).length !== 40 || allQuestions.some((item) => !String(item.answer || "").trim())) {
    throw new Error(`Invalid answer key: expected 40 complete answers, found ${Object.keys(answers).length}`);
}

const fullTest = {
    id: TEST_ID,
    slug: TEST_ID,
    title: TITLE,
    subtitle: "Academic Reading full test",
    skill: "reading",
    sourceFile: path.basename(SOURCE),
    status: "published",
    layout: "custom-full-reading",
    metadata: { book: "Cambridge IELTS 10", testNumber: 3, label: TITLE },
    reading: { passages },
    listening: { audio: "", transcript: "", sections: [] },
    answers: Object.fromEntries(allQuestions.map((item) => [String(item.number), item.answer])),
    images: [],
    parseReport: {
        hasReading: true,
        hasListening: false,
        passageCount: 3,
        listeningSectionCount: 0,
        imageCount: 0,
        answerKeyCount: 40
    },
    createdAt,
    publishedAt: createdAt,
    openUrl: `/full-test-player?id=${TEST_ID}&skill=reading`
};

const published = buildPublishedTests(fullTest);
const fullReading = published.readingTests.find((test) => test.id.endsWith("-reading-full"));
if (fullReading) {
    fullReading.richPassages = passages;
    fullReading.passageTitles = passages.map((passage) => passage.title);
    fullReading.openUrl = fullTest.openUrl;
}

if (process.argv.includes("--apply")) {
    const fullTestsDir = path.join(ROOT, "data", "full-tests");
    const readingTestsDir = path.join(ROOT, "data", "reading-tests");
    const sourceDir = path.join(ROOT, "uploads", "ielts-import");
    fs.mkdirSync(fullTestsDir, { recursive: true });
    fs.mkdirSync(readingTestsDir, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(fullTestsDir, `${TEST_ID}.json`), `${JSON.stringify(fullTest, null, 2)}\n`, "utf8");
    published.readingTests.forEach((test) => {
        fs.writeFileSync(path.join(readingTestsDir, `${test.id}.json`), `${JSON.stringify(test, null, 2)}\n`, "utf8");
    });
    fs.copyFileSync(SOURCE, path.join(sourceDir, `${TEST_ID}-source.html`));
}

console.log(JSON.stringify({
    id: TEST_ID,
    title: TITLE,
    passages: passages.map((passage) => ({
        number: passage.number,
        title: passage.title,
        questions: passage.questions.length,
        groups: passage.questionGroups.map((item) => item.type)
    })),
    questions: allQuestions.length,
    answers: Object.keys(answers).length,
    publishedTests: published.readingTests.map((test) => test.id),
    apply: process.argv.includes("--apply"),
    openUrl: fullTest.openUrl
}, null, 2));
