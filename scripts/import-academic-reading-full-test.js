const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { mergeAnswers } = require("../lib/ielts-import/answerExtractor");
const { extractAndSaveImages } = require("../lib/ielts-import/imageExtractor");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const sourcePath = process.argv[2];
const requestedTitle = process.argv.slice(3).join(" ").trim() || "IELTS Academic Reading Full Test 1–40";

if (!sourcePath || !fs.existsSync(sourcePath)) {
    console.error("Usage: node scripts/import-academic-reading-full-test.js <html-file> [title]");
    process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const id = "ielts-academic-reading-full-test-1-40-20260813";
const publicSlug = "august-13";
const html = fs.readFileSync(sourcePath, "utf8");
const $ = cheerio.load(html);
const answers = mergeAnswers(html);
const createdAt = new Date().toISOString();

const passageRanges = [[1, 13], [14, 26], [27, 40]];
const groupDefinitions = [
    { passage: 1, start: 1, end: 7, type: "true_false_not_given" },
    { passage: 1, start: 8, end: 13, type: "notes_completion" },
    { passage: 2, start: 14, end: 19, type: "matching_headings", list: "heading-list", listIndex: 0 },
    { passage: 2, start: 20, end: 21, type: "multi_select", list: "choice-list", listIndex: 0 },
    { passage: 2, start: 22, end: 26, type: "summary_completion" },
    { passage: 3, start: 27, end: 31, type: "matching_features", list: "choice-list", listIndex: 0 },
    { passage: 3, start: 32, end: 35, type: "multiple_choice" },
    { passage: 3, start: 36, end: 40, type: "true_false_not_given" }
];

function normalizeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function option(value, label = value) {
    return { value: String(value), label: normalizeText(label) };
}

function optionValue(label) {
    const match = normalizeText(label).match(/^([A-Za-z]+|[ivxlcdm]+)\b/i);
    return match ? match[1] : normalizeText(label);
}

function listOptions(definition) {
    if (!definition.list) return [];
    const list = $(`#right-p${definition.passage} .${definition.list}`).eq(definition.listIndex || 0);
    return list.children("div").toArray().map((element) => {
        const rawLabel = normalizeText($(element).text());
        const label = definition.start === 27
            ? rawLabel.replace(/^([A-C])\s+/, "$1. ")
            : rawLabel;
        return option(optionValue(label), label);
    });
}

function selectOptions(block) {
    return block.find("select option").toArray()
        .map((element) => normalizeText($(element).attr("value") || $(element).text()))
        .filter((value) => value && value !== "—" && value.toLowerCase() !== "choose")
        .map((value) => option(value));
}

function multipleChoiceParts(block) {
    const qText = block.find(".qtext").first();
    const question = normalizeText(qText.find("b").first().text());
    const fragment = qText.html() || "";
    const withLines = fragment.replace(/<br\s*\/?\s*>/gi, "\n");
    const text = cheerio.load(`<div>${withLines}</div>`)("div").text();
    const options = [];
    const pattern = /(?:^|\n)\s*([A-D])\.\s*([^\n]+)/g;
    let match;
    while ((match = pattern.exec(text))) {
        options.push(option(match[1], `${match[1]}. ${normalizeText(match[2])}`));
    }
    return { question, options };
}

function questionText(block) {
    const clone = block.find(".qtext").first().clone();
    clone.find("input, select").replaceWith(" ______ ");
    return normalizeText(clone.text());
}

function parseQuestion(number, type, groupOptions) {
    const block = $(`#qb-${number}`);
    if (!block.length) throw new Error(`Question ${number} was not found`);

    const mcq = type === "multiple_choice" ? multipleChoiceParts(block) : null;
    let options = mcq ? mcq.options : selectOptions(block);
    if (["matching_headings", "matching_features", "multi_select"].includes(type)) {
        options = groupOptions;
    }

    return {
        number,
        type,
        question: mcq ? mcq.question : questionText(block),
        stemHtml: mcq ? mcq.question : questionText(block),
        options,
        answer: answers[number]
    };
}

function instructionElement(definition) {
    const container = $(`#right-p${definition.passage}`);
    const heading = container.find("h3").filter((_, element) => {
        return normalizeText($(element).text()).includes(`${definition.start}–${definition.end}`)
            || normalizeText($(element).text()).includes(`${definition.start}-${definition.end}`);
    }).first();
    return heading.nextAll(".instr").first();
}

function parseInstruction(definition) {
    return normalizeText(instructionElement(definition).text());
}

function parseInstructionHtml(definition) {
    if (definition.start === 8) {
        return {
            bodyHtml: [
                "<p>Complete the notes below.</p>",
                "<p>Write your answers in boxes 8–13 on your answer sheet.</p>"
            ].join("\n"),
            rulesHtml: "<p>Choose <strong>ONE WORD ONLY</strong> from the passage for each answer.</p>"
        };
    }

    if (definition.start === 22) {
        return {
            bodyHtml: "<p>Complete the summary below.</p>",
            rulesHtml: "<p>Choose <strong>ONE WORD ONLY</strong> from the passage for each answer.</p>"
        };
    }

    const rawHtml = instructionElement(definition).html() || "";
    const lines = rawHtml
        .split(/<br\s*\/?\s*>/gi)
        .map((line) => line.trim())
        .filter(Boolean);
    return {
        bodyHtml: lines.map((line) => `<p>${line}</p>`).join("\n")
    };
}

function notesCompletionHtml() {
    const blank = (number) => `<span class="ielts-blank" data-blank="${number}"></span>`;
    return [
        '<div class="notes-box academic-reading-rfds-notes">',
        '  <div class="notes-section">',
        '    <div class="notes-heading">Challenges faced by RFDS dentists</div>',
        `    <p>need to bring equipment including ${blank(8)} for records</p>`,
        `    <p>aircraft used to carry equipment have restricted ${blank(9)}</p>`,
        `    <p>problems offering some services, e.g., fitting ${blank(10)}</p>`,
        '    <p>people in remote areas are more likely to have infection in their mouth</p>',
        '  </div>',
        '  <div class="notes-section">',
        '    <div class="notes-heading">Products supplied by RFDS dentists</div>',
        '    <p>If necessary, RFDS provides:</p>',
        `    <p>${blank(11)} and ${blank(12)} for regular use</p>`,
        `    <p>${blank(13)} to protect the teeth of sports players</p>`,
        '  </div>',
        '</div>'
    ].join("\n");
}

function parseGroup(definition) {
    const options = listOptions(definition);
    const questions = [];
    for (let number = definition.start; number <= definition.end; number += 1) {
        questions.push(parseQuestion(number, definition.type, options));
    }
    return {
        id: `${id}-p${definition.passage}-g${definition.start}`,
        type: definition.type,
        instructionTitle: `Questions ${definition.start}–${definition.end}`,
        instructionText: parseInstruction(definition),
        instructionHtml: parseInstructionHtml(definition),
        className: definition.start === 22 ? "academic-reading-law-summary" : "",
        options,
        contentHtml: definition.start === 8 ? notesCompletionHtml() : "",
        questionNumbers: questions.map((question) => question.number),
        questions,
        questionRange: [definition.start, definition.end]
    };
}

const groups = groupDefinitions.map(parseGroup);

function parsePassage(number) {
    const source = $(`#left-p${number}`);
    if (!source.length) throw new Error(`Reading passage ${number} was not found`);

    const titleElement = source.children("h1, h2").first();
    const title = normalizeText(titleElement.text());
    const subtitle = normalizeText(source.children(".subtitle").first().text());
    const body = source.clone();
    body.children("h1, h2").first().remove();
    body.children(".subtitle").first().remove();
    const rawParagraphs = body.children("p").toArray().map((element) => {
        const item = $(element);
        const label = normalizeText(item.children("b").first().text()) || null;
        return { letter: label, html: item.html() || "", text: normalizeText(item.text()) };
    });
    const paragraphs = number === 2
        ? rawParagraphs.reduce((merged, paragraph) => {
            if (paragraph.letter) {
                const content = cheerio.load(`<div>${paragraph.html}</div>`)("div");
                content.children("b").first().remove();
                const htmlWithoutLetter = (content.html() || "").trim();
                const textWithoutLetter = normalizeText(content.text());
                merged.push({
                    letter: paragraph.letter,
                    html: `<p>${htmlWithoutLetter}</p>`,
                    text: textWithoutLetter
                });
                return merged;
            }

            const previous = merged[merged.length - 1];
            if (!previous) return merged;
            previous.html += `\n<p>${paragraph.html}</p>`;
            previous.text += `\n\n${paragraph.text}`;
            return merged;
        }, [])
        : rawParagraphs;
    const passageGroups = groups.filter((group) => {
        const [start, end] = passageRanges[number - 1];
        return group.questionRange[0] >= start && group.questionRange[1] <= end;
    });

    return {
        id: `${id}-passage-${number}`,
        number,
        title,
        subtitle,
        displayLabel: `Reading Passage ${number}`,
        passageLabel: `READING PASSAGE ${number}`,
        passageText: number === 2
            ? paragraphs.map((paragraph) => `${paragraph.letter} ${paragraph.text}`).join("\n\n")
            : body.children("p, h2").toArray().map((element) => normalizeText($(element).text())).join("\n\n"),
        passageHtml: body.html() || "",
        paragraphs,
        questionGroups: passageGroups,
        questions: passageGroups.flatMap((group) => group.questions)
    };
}

const passages = [1, 2, 3].map(parsePassage);
const allQuestions = groups.flatMap((group) => group.questions);
if (passages.length !== 3 || allQuestions.length !== 40 || Object.keys(answers).length !== 40) {
    throw new Error(`Invalid import: ${passages.length} passages, ${allQuestions.length} questions, ${Object.keys(answers).length} answers`);
}

const imageDir = path.join(rootDir, "uploads", "ielts-import", id);
const images = extractAndSaveImages(html, {
    destDir: imageDir,
    publicBase: `/uploads/ielts-import/${id}`
}).map((image) => ({
    id: image.id,
    src: image.src,
    alt: image.alt,
    section: "reading",
    sectionNumber: 3,
    questionGroupIndex: null
}));

const fullTest = {
    id,
    slug: publicSlug,
    publicSlug,
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
    images,
    parseReport: {
        hasReading: true,
        hasListening: false,
        passageCount: 3,
        listeningSectionCount: 0,
        imageCount: images.length,
        answerKeyCount: 40
    },
    createdAt,
    publishedAt: createdAt,
    openUrl: `/reading/${publicSlug}`
};

const fullTestsDir = path.join(rootDir, "data", "full-tests");
const readingTestsDir = path.join(rootDir, "data", "reading-tests");
const sourceDir = path.join(rootDir, "uploads", "ielts-import");
fs.mkdirSync(fullTestsDir, { recursive: true });
fs.mkdirSync(readingTestsDir, { recursive: true });
fs.mkdirSync(sourceDir, { recursive: true });

const published = buildPublishedTests(fullTest);
published.readingTests.forEach((test) => {
    if (Number(test.part) >= 1 && Number(test.part) <= 3) {
        const titleSlug = String(test.title || "reading-passage")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        test.slug = titleSlug;
        test.publicSlug = titleSlug;
        test.openUrl = `/reading/${titleSlug}`;
    }
});
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
    title: requestedTitle,
    passageCount: passages.length,
    passageTitles: passages.map((passage) => passage.title),
    questionCount: allQuestions.length,
    answerCount: Object.keys(answers).length,
    publishedReadingTests: published.readingTests.map((test) => test.id),
    openUrl: fullTest.openUrl
}, null, 2));
