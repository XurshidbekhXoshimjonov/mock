const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { extractAndSaveImages } = require("../lib/ielts-import/imageExtractor");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const sourcePath = process.argv[2];
const requestedTitle = process.argv.slice(3).join(" ").trim() || "August 19";

if (!sourcePath || !fs.existsSync(sourcePath)) {
    console.error("Usage: node scripts/import-august-19-reading.js <html-file> [title]");
    process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const TEST_ID = "august-19-reading-20260820";
const PUBLIC_SLUG = "august-19";
const html = fs.readFileSync(sourcePath, "utf8");
const $ = cheerio.load(html);
const createdAt = new Date().toISOString();

function cleanText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseAnswers() {
    const objectMatch = html.match(/const\s+CORRECT\s*=\s*\{([\s\S]*?)\};/);
    if (!objectMatch) throw new Error("CORRECT answer key was not found");

    const answers = {};
    const entryPattern = /(\d+)\s*:\s*(\[(?:\s*'[^']*'\s*,?)*\]|'[^']*')/g;
    for (const match of objectMatch[1].matchAll(entryPattern)) {
        const values = [...match[2].matchAll(/'([^']*)'/g)].map((item) => item[1]);
        answers[Number(match[1])] = values.join(" | ");
    }
    return answers;
}

const answers = parseAnswers();
const groupDefinitions = [
    { passage: 1, start: 1, end: 7, type: "true_false_not_given" },
    { passage: 1, start: 8, end: 13, type: "notes_completion" },
    { passage: 2, start: 14, end: 19, type: "short_answer" },
    { passage: 2, start: 20, end: 26, type: "diagram_labeling" },
    { passage: 3, start: 27, end: 32, type: "multiple_choice" },
    { passage: 3, start: 33, end: 36, type: "yes_no_not_given" },
    { passage: 3, start: 37, end: 40, type: "summary_completion" }
];

function instructionElement(definition) {
    return $(`.question-content[data-passage="${definition.passage}"] h3`)
        .filter((_, element) => cleanText($(element).text()).includes(String(definition.start)))
        .first()
        .nextAll(".instr")
        .first();
}

function instructionHtml(definition) {
    const element = instructionElement(definition);
    const lines = (element.html() || "")
        .split(/<br\s*\/?\s*>/i)
        .flatMap((line) => line.split(/(?<=\.)\s+(?=Write\s)/i))
        .map((line) => line.trim())
        .filter(Boolean);
    return { bodyHtml: lines.map((line) => `<p>${line}</p>`).join("\n") };
}

function selectOptions(block) {
    return block.find("select option").toArray()
        .map((element) => cleanText($(element).attr("value") || $(element).text()))
        .filter((value) => value && value !== "—")
        .map((value) => ({ value, label: value }));
}

function radioOptions(block) {
    return block.find('.mcq-options input[type="radio"]').toArray().map((element) => {
        const input = $(element);
        const label = cleanText(input.closest("label").text()).replace(/^([A-D])\s+/, "$1. ");
        return { value: cleanText(input.attr("value")), label };
    });
}

function wordListOptions() {
    return $("#optionsBank .drag-item").toArray().map((element) => ({
        value: cleanText($(element).attr("data-value")),
        label: cleanText($(element).text()).replace(/^([A-I])\s+/, "$1. ")
    }));
}

function questionStem(number, definition) {
    if (definition.start === 20) return "______";
    if (definition.start === 37) {
        const summary = $(".summary-text").first().clone();
        summary.find(".drop-zone").each((_, element) => {
            const blankNumber = Number($(element).attr("data-q"));
            $(element).replaceWith(blankNumber === number ? " ______ " : " […] ");
        });
        return cleanText(summary.text());
    }

    const text = $(`#qb-${number} .qtext`).first().clone();
    text.find("input, select").replaceWith(" ______ ");
    return cleanText(text.text()) || `Question ${number}`;
}

function parseQuestion(number, definition) {
    const block = $(`#qb-${number}`);
    if (!block.length && definition.start !== 37) throw new Error(`Question ${number} was not found`);
    const options = definition.type === "multiple_choice"
        ? radioOptions(block)
        : definition.start === 37
            ? wordListOptions()
            : selectOptions(block);
    const question = questionStem(number, definition);
    return {
        number,
        type: definition.type,
        question,
        stemHtml: question,
        options,
        answer: answers[number]
    };
}

const imageDir = path.join(ROOT, "uploads", "ielts-import", TEST_ID);
const extractedImages = extractAndSaveImages(html, {
    destDir: imageDir,
    publicBase: `/uploads/ielts-import/${TEST_ID}`
});
const diagramOverrideFile = "submarine-diagram-20-26.png";
const diagramOverridePath = path.join(imageDir, diagramOverrideFile);
if (extractedImages[0] && fs.existsSync(diagramOverridePath)) {
    extractedImages[0].src = `/uploads/ielts-import/${TEST_ID}/${diagramOverrideFile}`;
    extractedImages[0].fileName = diagramOverrideFile;
    extractedImages[0].alt = "Submarine diagram for Questions 20–26";
}
const diagramImage = extractedImages[0]?.src || "";

function groupContent(definition) {
    if (definition.start === 8) {
        const blank = (number) => `<span class="ielts-blank" data-blank="${number}"></span>`;
        return [
            '<div class="notes-box august-19-rfds-notes">',
            '  <div class="notes-section">',
            '    <div class="notes-heading">Challenges faced by RFDS dentists</div>',
            `    <p>need to bring equipment including ${blank(8)} for records</p>`,
            `    <p>aircraft used to carry equipment have restricted ${blank(9)}</p>`,
            `    <p>problems offering some services, e.g., fitting ${blank(10)}</p>`,
            '  </div>',
            '  <div class="notes-section">',
            '    <div class="notes-heading">Products supplied by RFDS dentists</div>',
            '    <p>If necessary, RFDS provides:</p>',
            `    <p>${blank(11)} and ${blank(12)} for regular use</p>`,
            `    <p>${blank(13)} to protect teeth of sports players</p>`,
            '  </div>',
            '</div>'
        ].join("\n");
    }
    if (definition.start === 20 && diagramImage) {
        return `<div class="ielts-import-diagram"><img src="${diagramImage}" alt="Submarine diagram"></div>`;
    }
    if (definition.start === 37) {
        const summary = $(".summary-text").first().clone();
        summary.find(".drop-zone").each((_, element) => {
            const number = Number($(element).attr("data-q"));
            $(element).replaceWith(`<span class="ielts-blank" data-blank="${number}"></span>`);
        });
        return summary.toString();
    }
    return "";
}

function parseGroup(definition) {
    const questions = [];
    for (let number = definition.start; number <= definition.end; number += 1) {
        questions.push(parseQuestion(number, definition));
    }
    const options = definition.start === 37 ? wordListOptions() : [];
    return {
        id: `${TEST_ID}-p${definition.passage}-g${definition.start}`,
        type: definition.type,
        instructionTitle: `Questions ${definition.start}–${definition.end}`,
        instructionText: cleanText(instructionElement(definition).text()),
        instructionHtml: instructionHtml(definition),
        className: definition.start === 8
            ? "august-19-notes-group"
            : (definition.start === 37 ? "cgi-summary-group" : ""),
        options,
        optionsTitle: definition.start === 37 ? "List of Words" : "",
        showOptionsList: definition.start === 37,
        optionsAfterQuestions: false,
        contentTitle: definition.start === 37 ? "The work of Marschner and his colleagues" : "",
        contentHtml: groupContent(definition),
        imageUrl: definition.start === 20 ? diagramImage : "",
        imageIds: definition.start === 20 && extractedImages[0] ? [extractedImages[0].id] : [],
        questionNumbers: questions.map((question) => question.number),
        questions,
        questionRange: [definition.start, definition.end]
    };
}

const groups = groupDefinitions.map(parseGroup);

function parsePassage(number) {
    const source = $(`.passage-content[data-passage="${number}"]`).first();
    if (!source.length) throw new Error(`Reading passage ${number} was not found`);
    const titleElement = source.children("h2").first();
    const title = cleanText(titleElement.text());
    const body = source.clone();
    body.children("h2").first().remove();
    const paragraphs = body.children("p").toArray().map((element) => {
        const item = $(element);
        const letter = cleanText(item.children("strong, b").first().text()).replace(/\.$/, "") || null;
        return { letter, html: item.toString(), text: cleanText(item.text()) };
    });
    const passageGroups = groups.filter((group) => group.id.includes(`-p${number}-`));
    return {
        id: `${TEST_ID}-passage-${number}`,
        number,
        title,
        subtitle: "",
        displayLabel: `Reading Passage ${number}`,
        passageLabel: `READING PASSAGE ${number}`,
        passageText: paragraphs.map((paragraph) => paragraph.text).join("\n\n"),
        passageHtml: body.html() || "",
        paragraphs,
        questionGroups: passageGroups,
        questions: passageGroups.flatMap((group) => group.questions)
    };
}

const passages = [1, 2, 3].map(parsePassage);
const questions = groups.flatMap((group) => group.questions);
if (passages.length !== 3 || questions.length !== 40 || Object.keys(answers).length !== 40) {
    throw new Error(`Invalid import: ${passages.length} passages, ${questions.length} questions, ${Object.keys(answers).length} answers`);
}

const fullTest = {
    id: TEST_ID,
    slug: PUBLIC_SLUG,
    publicSlug: PUBLIC_SLUG,
    title: requestedTitle,
    sourceFile: path.basename(sourcePath),
    status: "published",
    skill: "reading",
    subtitle: "Reading full test",
    layout: "scripted-reading",
    metadata: { label: requestedTitle },
    reading: { passages },
    listening: { audio: "", transcript: "", sections: [] },
    answers: Object.fromEntries(Object.entries(answers).map(([number, answer]) => [String(number), answer])),
    images: extractedImages.map((image) => ({
        id: image.id,
        src: image.src,
        alt: image.alt,
        section: "reading",
        sectionNumber: 2,
        questionGroupIndex: null
    })),
    parseReport: {
        hasReading: true,
        hasListening: false,
        passageCount: 3,
        listeningSectionCount: 0,
        imageCount: extractedImages.length,
        answerKeyCount: 40
    },
    createdAt,
    publishedAt: createdAt,
    openUrl: `/reading/${PUBLIC_SLUG}`
};

const fullTestsDir = path.join(ROOT, "data", "full-tests");
const readingTestsDir = path.join(ROOT, "data", "reading-tests");
const sourceDir = path.join(ROOT, "uploads", "ielts-import");
fs.mkdirSync(fullTestsDir, { recursive: true });
fs.mkdirSync(readingTestsDir, { recursive: true });
fs.mkdirSync(sourceDir, { recursive: true });

const published = buildPublishedTests(fullTest);
const fullReading = published.readingTests.find((test) => test.id.endsWith("-reading-full"));
if (fullReading) {
    fullReading.richPassages = passages;
    fullReading.passageTitles = passages.map((passage) => passage.title);
    fullReading.openUrl = fullTest.openUrl;
    fullReading.slug = PUBLIC_SLUG;
    fullReading.publicSlug = PUBLIC_SLUG;
}

fs.writeFileSync(path.join(fullTestsDir, `${TEST_ID}.json`), JSON.stringify(fullTest, null, 2), "utf8");
published.readingTests.forEach((test) => {
    fs.writeFileSync(path.join(readingTestsDir, `${test.id}.json`), JSON.stringify(test, null, 2), "utf8");
});
fs.copyFileSync(sourcePath, path.join(sourceDir, `${TEST_ID}-source.html`));

console.log(JSON.stringify({
    id: TEST_ID,
    title: requestedTitle,
    passageTitles: passages.map((passage) => passage.title),
    questionCount: questions.length,
    answerCount: Object.keys(answers).length,
    imageCount: extractedImages.length,
    publishedReadingTests: published.readingTests.map((test) => test.id),
    openUrl: fullTest.openUrl
}, null, 2));
