const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const sourcePath = process.argv[2];

if (!sourcePath || !fs.existsSync(sourcePath)) {
    console.error("Usage: node scripts/import-custom-full-reading.js <html-file>");
    process.exit(1);
}

const html = fs.readFileSync(sourcePath, "utf8");
const $ = cheerio.load(html);
const id = "full-reading-wood-birds-piaget-20260718";
const title = "Reading Test 1";
const createdAt = new Date().toISOString();

function parseAnswerKey() {
    const scriptText = $("script").toArray().map((element) => $(element).html() || "").join("\n");
    const objectMatch = scriptText.match(/var\s+CORRECT\s*=\s*\{([\s\S]*?)\};/);
    if (!objectMatch) throw new Error("CORRECT answer key was not found");

    const answers = {};
    const entryPattern = /(\d+)\s*:\s*'((?:\\.|[^'])*)'/g;
    let match;
    while ((match = entryPattern.exec(objectMatch[1]))) {
        answers[Number(match[1])] = match[2]
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\");
    }
    return answers;
}

const answers = parseAnswerKey();

const optionSets = {
    headings: [
        ["i", "The theory linking capacity for tool use in birds and survival"],
        ["ii", "The influence of humans on tool use"],
        ["iii", "The theory linking cognitive ability and living in a society"],
        ["iv", "Reviewing long-held beliefs"],
        ["v", "Intelligence helps birds to remember"],
        ["vi", "How some birds trick each other"],
        ["vii", "Physiological evidence of birds' intelligence"],
        ["viii", "Several examples of birds who use tools"],
        ["ix", "One species' multiple tool-using techniques"]
    ],
    birds: [
        ["A", "White-winged choughs"],
        ["B", "Black kites"],
        ["C", "New Caledonian crows"]
    ],
    summary: [
        ["A", "correct"],
        ["B", "theories"],
        ["C", "brain"],
        ["D", "simple"],
        ["E", "teachers"],
        ["F", "psychology"],
        ["G", "logical"],
        ["H", "thought"],
        ["I", "philosophers"]
    ]
};

function structuredOptions(entries) {
    return entries.map(([value, text]) => ({ value, label: `${value}. ${text}` }));
}

function cleanFootnoteMarkers(value) {
    return String(value || "").replace(/\b(pulp|preening)\*/gi, "$1");
}

function questionType(number) {
    if (number <= 6) return "true_false_not_given";
    if (number <= 13) return "short_answer";
    if (number <= 20) return "matching_headings";
    if (number <= 26) return "matching_features";
    if (number <= 31) return "multiple_choice";
    if (number <= 36) return "summary_completion";
    return "yes_no_not_given";
}

function questionElement(number) {
    const inputRow = $(`#q${number}`).closest(".input-card-row");
    if (inputRow.length) return inputRow;
    const mcq = $(`#mcq-${number}`);
    if (mcq.length) return mcq;
    return $(`#card-${number}`);
}

function optionsForQuestion(number, element) {
    if (number >= 14 && number <= 20) return structuredOptions(optionSets.headings);
    if (number >= 21 && number <= 26) return structuredOptions(optionSets.birds);
    if (number >= 32 && number <= 36) return structuredOptions(optionSets.summary);

    const options = [];
    element.find(".tf-opt-btn").each((_, option) => {
        options.push($(option).attr("data-val") || $(option).text().trim());
    });
    element.find(".mcq-option").each((_, option) => {
        const value = $(option).attr("data-val") || "";
        const text = $(option).find(".opt-text").text().trim();
        options.push({ value, label: `${value}. ${text}` });
    });
    return options;
}

function parseQuestion(number) {
    const element = questionElement(number);
    if (!element.length) throw new Error(`Question ${number} was not found`);

    let stem = element.find(".q-text").first().text().trim();
    if (number >= 32 && number <= 36) {
        stem = stem.replace(new RegExp(`\\b${number}\\s*_{2,}`), "______");
    }

    const type = questionType(number);
    return {
        number,
        type,
        question: stem,
        stemHtml: stem,
        options: optionsForQuestion(number, element),
        answer: answers[number]
    };
}

const allQuestions = Array.from({ length: 40 }, (_, index) => parseQuestion(index + 1));

function group({ suffix, type, start, end, instructionText, rule = "", options = [], contentHtml = "" }) {
    const questions = allQuestions.slice(start - 1, end);
    return {
        id: `${id}-${suffix}`,
        type,
        instructionTitle: `Questions ${start}–${end}`,
        instructionText,
        instructionHtml: {
            titleHtml: `<h3>Questions ${start}–${end}</h3>`,
            bodyHtml: `<p>${instructionText}</p>`,
            rulesHtml: rule ? `<p>${rule}</p>` : ""
        },
        rule,
        options,
        contentHtml,
        questionNumbers: questions.map((question) => question.number),
        questions,
        questionRange: [start, end]
    };
}

const summaryOptions = structuredOptions(optionSets.summary);
const summaryContent = [
    '<div class="cbt-group-options-box" aria-label="Available options">',
    ...summaryOptions.map((option) => `<span class="cbt-group-option-chip">${option.label}</span>`),
    "</div>",
    ...allQuestions.slice(31, 36).map((question) =>
        `<p>${question.question.replace("______", `<span class="ielts-blank" data-blank="${question.number}"></span>`)}</p>`
    )
].join("\n");

const groupsByPassage = [
    [
        group({
            suffix: "p1-g1",
            type: "true_false_not_given",
            start: 1,
            end: 6,
            instructionText: "Choose TRUE if the statement agrees with the information, FALSE if it contradicts the information, or NOT GIVEN if there is no information.",
            options: ["TRUE", "FALSE", "NOT GIVEN"]
        }),
        group({
            suffix: "p1-g2",
            type: "short_answer",
            start: 7,
            end: 13,
            instructionText: "Answer the questions below.",
            rule: "Write NO MORE THAN TWO WORDS AND/OR A NUMBER from the passage for each answer."
        })
    ],
    [
        group({
            suffix: "p2-g1",
            type: "matching_headings",
            start: 14,
            end: 20,
            instructionText: "Choose the correct heading for each paragraph from the list of headings below.",
            options: structuredOptions(optionSets.headings)
        }),
        group({
            suffix: "p2-g2",
            type: "matching_features",
            start: 21,
            end: 26,
            instructionText: "Match each characteristic with the correct bird.",
            options: structuredOptions(optionSets.birds)
        })
    ],
    [
        group({
            suffix: "p3-g1",
            type: "multiple_choice",
            start: 27,
            end: 31,
            instructionText: "Choose the correct answer."
        }),
        group({
            suffix: "p3-g2",
            type: "summary_completion",
            start: 32,
            end: 36,
            instructionText: "Complete the summary using the list of words, A–I, below.",
            options: summaryOptions,
            contentHtml: summaryContent
        }),
        group({
            suffix: "p3-g3",
            type: "yes_no_not_given",
            start: 37,
            end: 40,
            instructionText: "Choose YES if the statement agrees with the claims of the writer, NO if it contradicts them, or NOT GIVEN if it is impossible to say what the writer thinks.",
            options: ["YES", "NO", "NOT GIVEN"]
        })
    ]
];

const passages = $(".passage-view").toArray().map((element, index) => {
    const passage = $(element);
    const body = passage.find(".passage-body");
    const paragraphs = body.children("p").toArray()
        .map((paragraph) => {
            const item = $(paragraph);
            const text = cleanFootnoteMarkers(item.text()).replace(/\s+/g, " ").trim();
            if (/^(?:pulp|preening)\s*:/i.test(text)) return null;

            const label = item.find(".para-label").first().text().trim() || null;
            return {
                letter: label,
                html: cleanFootnoteMarkers(item.html()),
                text
            };
        })
        .filter(Boolean);
    const passageText = paragraphs.map((paragraph) => paragraph.text).join("\n\n");

    return {
        id: `${id}-passage-${index + 1}`,
        number: index + 1,
        title: passage.find(".passage-title").first().text().trim(),
        subtitle: passage.find(".passage-subtitle").first().text().trim(),
        displayLabel: `Reading Passage ${index + 1}`,
        passageLabel: passage.find(".eyebrow-tag").first().text().trim(),
        passageText,
        passageHtml: paragraphs.map((paragraph) => `<p>${paragraph.html}</p>`).join("\n"),
        paragraphs,
        questionGroups: groupsByPassage[index],
        questions: groupsByPassage[index].flatMap((item) => item.questions)
    };
});

if (passages.length !== 3 || allQuestions.length !== 40 || Object.keys(answers).length !== 40) {
    throw new Error(`Invalid import: ${passages.length} passages, ${allQuestions.length} questions, ${Object.keys(answers).length} answers`);
}

const fullTest = {
    id,
    title,
    skill: "reading",
    sourceFile: path.basename(sourcePath),
    status: "published",
    layout: "custom-full-reading",
    metadata: { label: title },
    reading: { passages },
    listening: { audio: "", transcript: "", sections: [] },
    answers: Object.fromEntries(Object.entries(answers).map(([number, answer]) => [String(number), answer])),
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
    openUrl: `/full-test-player?id=${id}&skill=reading`
};

const rootDir = path.resolve(__dirname, "..");
const fullTestsDir = path.join(rootDir, "data", "full-tests");
const readingTestsDir = path.join(rootDir, "data", "reading-tests");
const sourceDir = path.join(rootDir, "uploads", "ielts-import");
fs.mkdirSync(fullTestsDir, { recursive: true });
fs.mkdirSync(readingTestsDir, { recursive: true });
fs.mkdirSync(sourceDir, { recursive: true });

const published = buildPublishedTests(fullTest);
const fullReading = published.readingTests.find((test) => test.id.endsWith("-reading-full"));
if (fullReading) {
    fullReading.richPassages = passages;
    fullReading.passageTitles = passages.map((passage) => passage.title);
    fullReading.openUrl = fullTest.openUrl;
}

fs.writeFileSync(path.join(fullTestsDir, `${id}.json`), JSON.stringify(fullTest, null, 2), "utf8");
published.readingTests.forEach((test) => {
    fs.writeFileSync(path.join(readingTestsDir, `${test.id}.json`), JSON.stringify(test, null, 2), "utf8");
});
fs.copyFileSync(sourcePath, path.join(sourceDir, `${id}-source.html`));

console.log(JSON.stringify({
    id,
    title,
    passageCount: passages.length,
    questionCount: allQuestions.length,
    answerCount: Object.keys(answers).length,
    publishedReadingTests: published.readingTests.map((test) => test.id),
    openUrl: fullTest.openUrl
}, null, 2));
