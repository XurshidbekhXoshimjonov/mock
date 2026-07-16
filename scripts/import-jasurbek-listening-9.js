const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE = "C:/Users/dizay/Downloads/Telegram Desktop/FULL LISTENING.html";
const TEST_ID = "jasurbek-full-listening-test-9";
const TITLE = "Full Listening Test 9 — Jasurbek";

function safeFileName(value) {
    return String(value || "").replace(/[^a-z0-9.\-_]/gi, "_").replace(/_+/g, "_");
}

function extractBalancedLiteral(source, name, opening = "{") {
    const assignment = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`).exec(source);
    if (!assignment) throw new Error(`Could not find ${name}`);
    const start = assignment.index + assignment[0].length;
    if (source[start] !== opening) throw new Error(`${name} is not a ${opening} literal`);
    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
        const character = source[index];
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
        if (character === opening) depth += 1;
        if (character === closing) depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unclosed ${name} literal`);
}

function literal(source, name, opening) {
    return vm.runInNewContext(`(${extractBalancedLiteral(source, name, opening)})`, Object.create(null), { timeout: 1000 });
}

function extractStringConstant(source, name) {
    const match = source.match(new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(["'])(.*?)\\1`));
    if (!match) throw new Error(`Could not find ${name}`);
    return match[2];
}

function extractAudio(source) {
    const $ = cheerio.load(source, { decodeEntities: false });
    return $("#test-audio").attr("src") || $("audio").first().attr("src") || "";
}

function extractMcQuestions(source, answers) {
    const questions = [];
    const pattern = /mcQuestion\(\s*(\d+)\s*,\s*("(?:\\.|[^"\\])*")\s*,\s*(\[(?:\\.|[^\]])*\])\s*\)/g;
    let match;
    while ((match = pattern.exec(source))) {
        const number = Number(match[1]);
        const question = vm.runInNewContext(`(${match[2]})`, Object.create(null), { timeout: 1000 });
        const optionLabels = vm.runInNewContext(`(${match[3]})`, Object.create(null), { timeout: 1000 });
        questions.push({
            number,
            type: "multiple_choice",
            question,
            options: optionLabels.map((text, index) => ({
                letter: String.fromCharCode(65 + index),
                text
            })),
            answer: String(answers[number] || "").toUpperCase()
        });
    }
    return questions.sort((a, b) => a.number - b.number);
}

function renderTemplate(source, functionName) {
    const match = source.match(new RegExp('function\\s+' + functionName + '\\s*\\(\\)\\s*\\{\\s*return\\s*`([\\s\\S]*?)`;\\s*\\}'));
    if (!match) throw new Error(`Could not read ${functionName}`);
    return match[1]
        .replace(/\$\{partBanner\([^}]+\)\}/g, "")
        .replace(/\$\{inputBlank\((\d+)\)\}/g, "{{$1}}");
}

function noteGroup(source, functionName, numbers, answers, settings) {
    const $ = cheerio.load(`<div id="template">${renderTemplate(source, functionName)}</div>`, { decodeEntities: false });
    const content = [];
    $("#template .notes-block").children().each((_, element) => {
        const value = $(element).text().replace(/\s+/g, " ").trim();
        if (value) content.push(value);
    });
    const questions = numbers.map((number) => {
        const line = content.find((item) => item.includes(`{{${number}}}`));
        if (!line) throw new Error(`Question ${number} is missing from ${functionName}`);
        return {
            number,
            type: "sentence_completion",
            question: line.replace(`{{${number}}}`, "...").replace(/^[-•]\s*/, ""),
            options: [],
            answer: String(answers[number] || "")
        };
    });
    return {
        id: `${TEST_ID}-p${settings.part}-g1`,
        type: "note_completion",
        instructionTitle: `Questions ${numbers[0]}-${numbers[numbers.length - 1]}`,
        instructionText: settings.instruction,
        title: settings.title,
        noteStyle: "boxed-flow",
        content,
        questions
    };
}

function options(values) {
    return values.map((text, index) => ({ letter: String.fromCharCode(65 + index), text }));
}

function buildTest(sourcePath) {
    const html = fs.readFileSync(sourcePath, "utf8");
    const answers = literal(html, "answerKey", "{");
    const mcQuestions = extractMcQuestions(html, answers);
    const p2MapLetters = literal(html, "p2MapLetters", "[");
    const p2MapLabels = literal(html, "p2MapLabels", "[");
    const p3Opinions = literal(html, "p3BookOpinions", "[");
    const p3Books = literal(html, "p3Books", "[");
    const mapImage = extractStringConstant(html, "MAP_IMAGE_SRC");
    const audio = extractAudio(html);
    const now = new Date().toISOString();

    const part1 = noteGroup(html, "renderPart1", Array.from({ length: 10 }, (_, index) => index + 1), answers, {
        part: 1,
        title: "Holiday rental",
        instruction: "Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer."
    });
    const part4 = noteGroup(html, "renderPart4", Array.from({ length: 10 }, (_, index) => index + 31), answers, {
        part: 4,
        title: "Aboriginal Textile Design",
        instruction: "Complete the notes below. Write ONE WORD ONLY for each answer."
    });

    const part2Mcq = mcQuestions.filter((question) => question.number >= 11 && question.number <= 14);
    const part3Mcq = mcQuestions.filter((question) => question.number >= 21 && question.number <= 26);
    const mapOptions = p2MapLetters.map((letter) => ({ letter, text: "" }));
    const opinionOptions = options(p3Opinions);

    const sections = [
        { number: 1, title: "Part 1", questionGroups: [part1] },
        {
            number: 2,
            title: "Part 2",
            questionGroups: [
                {
                    id: `${TEST_ID}-p2-g1`,
                    type: "multiple_choice",
                    instructionTitle: "Questions 11-14",
                    instructionText: "Choose the correct letter, A, B or C.",
                    title: "Bridge to Brisbane Fun Run",
                    questions: part2Mcq
                },
                {
                    id: `${TEST_ID}-p2-g2`,
                    type: "matching",
                    instructionTitle: "Questions 15-20",
                    instructionText: "Label the map below. Write the correct letter, A-I, next to questions 15-20.",
                    imageUrl: mapImage,
                    options: mapOptions,
                    questions: p2MapLabels.map(([number, question]) => ({
                        number,
                        type: "matching",
                        question,
                        options: mapOptions,
                        answer: String(answers[number] || "").toUpperCase()
                    }))
                }
            ]
        },
        {
            number: 3,
            title: "Part 3",
            questionGroups: [
                {
                    id: `${TEST_ID}-p3-g1`,
                    type: "multiple_choice",
                    instructionTitle: "Questions 21-26",
                    instructionText: "Choose the correct letter, A, B or C.",
                    title: "Farmers' attitudes to new developments in agriculture",
                    questions: part3Mcq
                },
                {
                    id: `${TEST_ID}-p3-g2`,
                    type: "matching",
                    instructionTitle: "Questions 27-30",
                    instructionText: "What opinion is expressed about each book? Choose FOUR answers from the box.",
                    optionsTitle: "Opinions",
                    options: opinionOptions,
                    questions: p3Books.map(([number, question]) => ({
                        number,
                        type: "matching",
                        question,
                        options: opinionOptions,
                        answer: String(answers[number] || "").toUpperCase()
                    }))
                }
            ]
        },
        { number: 4, title: "Part 4", questionGroups: [part4] }
    ];

    const questions = sections.flatMap((section) => section.questionGroups.flatMap((group) => group.questions || []));
    const numbers = questions.map((question) => Number(question.number)).sort((a, b) => a - b);
    const expected = Array.from({ length: 40 }, (_, index) => index + 1);
    if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
        throw new Error(`Expected questions 1-40, received: ${numbers.join(", ")}`);
    }
    if (!audio) throw new Error("Listening audio was not found");
    questions.forEach((question) => {
        if (!String(question.answer || "").trim()) throw new Error(`Question ${question.number} has no answer`);
    });

    return {
        id: TEST_ID,
        slug: TEST_ID,
        title: TITLE,
        subtitle: "Listening full test",
        sourceFile: path.basename(sourcePath),
        status: "published",
        skill: "listening",
        layout: "jasurbek-static-listening-v1",
        manualListeningTestId: `${TEST_ID}-listening-full`,
        reading: { passages: [] },
        listening: { audio, transcript: "", sections },
        answers: Object.fromEntries(questions.map((question) => [String(question.number), question.answer])),
        images: [{
            id: `${TEST_ID}-map-1`,
            src: mapImage,
            alt: "Map of Race Village",
            section: "listening",
            sectionNumber: 2
        }],
        parseReport: {
            hasReading: false,
            hasListening: true,
            passageCount: 0,
            listeningSectionCount: 4,
            imageCount: 1,
            answerKeyCount: 40
        },
        createdAt: now,
        publishedAt: now
    };
}

function saveJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main() {
    const sourcePath = path.resolve(process.argv.find((argument) => !argument.startsWith("--") && argument !== process.argv[0] && argument !== process.argv[1]) || DEFAULT_SOURCE);
    if (!fs.existsSync(sourcePath)) throw new Error(`Source file not found: ${sourcePath}`);
    const test = buildTest(sourcePath);
    const published = buildPublishedTests(test);
    const listeningTests = published.listeningTests.map((item) => ({ ...item, status: "published" }));
    const summary = {
        id: test.id,
        title: test.title,
        sections: test.listening.sections.length,
        questions: Object.keys(test.answers).length,
        audio: test.listening.audio,
        derivedTests: listeningTests.map((item) => item.id),
        apply: process.argv.includes("--apply")
    };

    if (process.argv.includes("--apply")) {
        const uploadedSource = path.join(ROOT, "uploads", "ielts-import", `${TEST_ID}-source.html`);
        fs.mkdirSync(path.dirname(uploadedSource), { recursive: true });
        fs.copyFileSync(sourcePath, uploadedSource);
        saveJson(path.join(ROOT, "data", "full-tests", `${safeFileName(test.id)}.json`), test);
        listeningTests.forEach((item) => {
            saveJson(path.join(ROOT, "data", "listening-tests", `${safeFileName(item.id)}.json`), item);
        });
    }

    console.log(JSON.stringify(summary, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
}
