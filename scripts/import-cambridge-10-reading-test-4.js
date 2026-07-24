"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const ROOT = path.resolve(__dirname, "..");
const sourceArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const SOURCE = path.resolve(sourceArgument || "C:/Users/dizay/Downloads/preview.html");
const TEST_ID = "cambridge-ielts-10-test-4-reading";
const TITLE = "Cambridge IELTS 10 Test 4 Reading";

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
    const root = $(`#q${number}`).first();
    if (!root.length) throw new Error(`Question ${number} was not found`);
    return root;
}

function selectQuestion(number, type, questionOptions) {
    const root = questionRoot(number);
    const clone = root.find(".qline > div").last().clone();
    clone.find("select").remove();
    return question(number, type, clone.text(), questionOptions);
}

function multipleChoiceQuestion(number) {
    const root = questionRoot(number);
    const stem = cleanText(root.find(".qline > div").last().text());
    const questionOptions = root.find(".option").toArray().map((label) => {
        const item = $(label);
        const value = cleanText(item.find("input").attr("value") || item.find(".letter").text());
        const text = cleanText(item.find("span").last().text());
        return option(value, text);
    });
    if (!stem || questionOptions.length !== 4) {
        throw new Error(`Could not parse multiple-choice question ${number}`);
    }
    return question(number, "multiple_choice", stem, questionOptions);
}

function parseGridOptions(container) {
    const children = $(container).find(".match-grid").children().toArray();
    const parsed = [];
    for (let index = 0; index < children.length; index += 2) {
        const value = cleanText($(children[index]).text());
        const text = cleanText($(children[index + 1]).text());
        if (value) parsed.push(option(value, text));
    }
    return parsed;
}

function richCompletionContent(container, className = "") {
    const clone = $(container).clone();
    clone.find(".inline-answer").each((_, element) => {
        const number = Number($(element).find("[data-q]").attr("data-q"));
        $(element).replaceWith(`<span class="ielts-blank" data-blank="${number}">______</span>`);
    });
    clone.find(".review").remove();
    const classes = ["ielts-import-summary", className].filter(Boolean).join(" ");
    return `<div class="${classes}">${clone.html()}</div>`;
}

function wildfiresCompletionContent() {
    const blank = (number) => `<span class="ielts-blank" data-blank="${number}">______</span>`;
    return `<div class="ielts-import-summary cambridge10-test4-wildfires">
        <div class="ielts-summary-title">Wildfires</div>
        <ul class="c10t4-wildfires-main">
            <li>
                <p>Characteristics of wildfires and wildfire conditions today compared to the past:</p>
                <ul class="c10t4-wildfires-details">
                    <li>occurrence: more frequent</li>
                    <li>temperature: hotter</li>
                    <li>speed: faster</li>
                    <li>movement: ${blank(1)} more unpredictably</li>
                    <li>size of fires: ${blank(2)} greater on average than two decades ago</li>
                </ul>
            </li>
            <li>
                <p>Reasons wildfires cause more damage today compared to the past:</p>
                <ul class="c10t4-wildfires-details">
                    <li>rainfall: ${blank(3)} average</li>
                    <li>more brush to act as ${blank(4)}</li>
                    <li>increase in yearly temperature</li>
                    <li>extended fire ${blank(5)}</li>
                    <li>more building of ${blank(6)} in vulnerable places</li>
                </ul>
            </li>
        </ul>
    </div>`;
}

function group({
    passage,
    suffix,
    type,
    start,
    end,
    instructionText,
    rule = "",
    options = [],
    optionsTitle = "",
    hideOptionsList = false,
    optionsAfterQuestions = false,
    className = "",
    questions,
    contentHtml = ""
}) {
    return {
        id: `${TEST_ID}-p${passage}-${suffix}`,
        type,
        instructionTitle: `Questions ${start}–${end}`,
        instructionText,
        instructionHtml: {
            titleHtml: `<h3>Questions ${start}–${end}</h3>`,
            bodyHtml: `<p>${escapeHtml(instructionText)}</p>`,
            rulesHtml: rule
                ? rule.split(/\n+/).map((line) => `<p>${escapeHtml(line)}</p>`).join("")
                : ""
        },
        rule,
        options,
        optionsTitle,
        hideOptionsList,
        optionsAfterQuestions,
        className,
        contentHtml,
        questionNumbers: questions.map((item) => item.number),
        questions,
        questionRange: [start, end]
    };
}

const tfng = ["TRUE", "FALSE", "NOT GIVEN"];
const yng = ["YES", "NO", "NOT GIVEN"];
const peopleOptions = parseGridOptions($('.q-section[data-qsection="2"] .list-box').first());
const sectionOptions = "ABCDEFGH".split("").map((letter) => option(letter, `Section ${letter}`));
const endingOptions = parseGridOptions($('.q-section[data-qsection="3"] .ending-box').first());

const completionPrompts = {
    1: "Movement: ... more unpredictably",
    2: "Size of fires: ... greater on average than two decades ago",
    3: "Rainfall: ... average",
    4: "More brush to act as ...",
    5: "Extended fire ...",
    6: "More building of ... in vulnerable places",
    14: "Psychologists traditionally believed that a personality ... was impossible",
    15: "By a ..., a person's character tends to be fixed",
    16: "One of the easiest qualities to acquire is ...",
    17: "It is necessary to learn a variety of different ...",
    18: "A person must understand and feel some ... to increase happiness"
};

function peopleOptionsContent() {
    const rows = peopleOptions.map((item) => {
        const value = escapeHtml(item.value || "");
        const label = escapeHtml(String(item.label || "").replace(/^[A-G]\.\s*/, ""));
        return `<div class="c10t4-person-row"><strong>${value}</strong><span>${label}</span></div>`;
    }).join("");
    return `<div class="cambridge10-test4-people-box">
        <h4>List of People</h4>
        <div class="c10t4-person-list">${rows}</div>
    </div>`;
}

function endingOptionsContent() {
    const rows = endingOptions.map((item) => {
        const value = escapeHtml(item.value || "");
        const label = escapeHtml(String(item.label || "").replace(/^[A-G]\.\s*/, ""));
        return `<div class="c10t4-ending-row"><strong>${value}</strong><span>${label}</span></div>`;
    }).join("");
    return `<div class="cambridge10-test4-endings-box">
        <div class="c10t4-ending-list">${rows}</div>
    </div>`;
}

const passageOneGroups = [
    group({
        passage: 1,
        suffix: "g1",
        type: "notes_completion",
        start: 1,
        end: 6,
        instructionText: "Complete the notes below.",
        rule: "Choose ONE WORD AND/OR A NUMBER from the passage for each answer.\nWrite your answers in boxes 1–6 on your answer sheet.",
        contentHtml: wildfiresCompletionContent(),
        questions: [1, 2, 3, 4, 5, 6].map((number) =>
            question(number, "notes_completion", completionPrompts[number])
        )
    }),
    group({
        passage: 1,
        suffix: "g2",
        type: "true_false_not_given",
        start: 7,
        end: 13,
        instructionText: "Do the following statements agree with the information given in Reading Passage 1?",
        rule: "Choose TRUE, FALSE or NOT GIVEN.",
        options: tfng,
        questions: [7, 8, 9, 10, 11, 12, 13].map((number) =>
            selectQuestion(number, "true_false_not_given", tfng)
        )
    })
];

const passageTwoGroups = [
    group({
        passage: 2,
        suffix: "g1",
        type: "summary_completion",
        start: 14,
        end: 18,
        instructionText: "Complete the summary below.",
        rule: "Choose NO MORE THAN TWO WORDS from the passage for each answer.\nWrite your answers in boxes 14–18 on your answer sheet.",
        contentHtml: richCompletionContent(
            $('.q-section[data-qsection="2"] .summary-box').first(),
            "cambridge10-test4-personality-summary"
        ),
        questions: [14, 15, 16, 17, 18].map((number) =>
            question(number, "summary_completion", completionPrompts[number])
        )
    }),
    group({
        passage: 2,
        suffix: "g2",
        type: "matching_features",
        start: 19,
        end: 22,
        instructionText: "Look at the following statements (Questions 19–22) and the list of people below.",
        rule: "Match each statement with the correct person, A–G.\nWrite the correct letter, A–G, in boxes 19–22 on your answer sheet.",
        options: peopleOptions,
        optionsTitle: "List of People",
        optionsAfterQuestions: true,
        className: "cambridge10-test4-people",
        contentHtml: peopleOptionsContent(),
        questions: [19, 20, 21, 22].map((number) =>
            selectQuestion(number, "matching_features", peopleOptions)
        )
    }),
    group({
        passage: 2,
        suffix: "g3",
        type: "matching_information",
        start: 23,
        end: 26,
        instructionText: "Reading Passage 2 has eight sections, A–H. Which section contains the following information?",
        options: sectionOptions,
        optionsTitle: "Sections",
        hideOptionsList: true,
        questions: [23, 24, 25, 26].map((number) =>
            selectQuestion(number, "matching_information", sectionOptions)
        )
    })
];

const passageThreeGroups = [
    group({
        passage: 3,
        suffix: "g1",
        type: "multiple_choice",
        start: 27,
        end: 31,
        instructionText: "Choose the correct letter, A, B, C or D.",
        questions: [27, 28, 29, 30, 31].map(multipleChoiceQuestion)
    }),
    group({
        passage: 3,
        suffix: "g2",
        type: "matching_sentence_endings",
        start: 32,
        end: 36,
        instructionText: "Complete each sentence with the correct ending, A–G, below.",
        options: endingOptions,
        optionsTitle: "Sentence endings",
        optionsAfterQuestions: true,
        className: "cambridge10-test4-endings",
        contentHtml: endingOptionsContent(),
        questions: [32, 33, 34, 35, 36].map((number) =>
            selectQuestion(number, "matching_sentence_endings", endingOptions)
        )
    }),
    group({
        passage: 3,
        suffix: "g3",
        type: "yes_no_not_given",
        start: 37,
        end: 40,
        instructionText: "Do the following statements agree with the claims of the writer in Reading Passage 3?",
        rule: "Choose YES, NO or NOT GIVEN.",
        options: yng,
        questions: [37, 38, 39, 40].map((number) =>
            selectQuestion(number, "yes_no_not_given", yng)
        )
    })
];

const groupsByPassage = [passageOneGroups, passageTwoGroups, passageThreeGroups];

const passages = $(".passage").toArray().map((element, index) => {
    const passage = $(element);
    let paragraphRows;

    if (passage.find(".section-paragraph").length) {
        paragraphRows = passage.find(".section-paragraph").toArray().map((row) => {
            const item = $(row);
            const paragraph = item.find("p").first();
            return {
                letter: cleanText(item.find(".section-letter").text()) || null,
                html: paragraph.html() || "",
                text: cleanText(paragraph.text())
            };
        });
    } else {
        paragraphRows = passage.children("p").toArray()
            .slice(1)
            .map((paragraph) => ({
                letter: null,
                html: $(paragraph).html() || "",
                text: cleanText($(paragraph).text())
            }));
    }

    const groups = groupsByPassage[index];
    const title = cleanText(passage.find("h1").first().text());
    const subtitle = cleanText(passage.find(".subtitle").first().text());

    return {
        id: `${TEST_ID}-passage-${index + 1}`,
        number: index + 1,
        title,
        subtitle,
        displayLabel: `Reading Passage ${index + 1}`,
        passageLabel: `Reading Passage ${index + 1}`,
        passageText: paragraphRows.map((item) =>
            `${item.letter ? `${item.letter}. ` : ""}${item.text}`
        ).join("\n\n"),
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
    metadata: { book: "Cambridge IELTS 10", testNumber: 4, label: TITLE },
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
