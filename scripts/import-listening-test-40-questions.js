const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const ROOT = path.resolve(__dirname, "..");
const TEST_ID = "ielts-listening-test-40-questions";
const TITLE = "Listening Test";
const DEFAULT_HTML = "C:/Users/dizay/Downloads/IELTS_Listening_Test_40_Questions.html";
const DEFAULT_AUDIO = [
    "E:/Listening audio IELTSX/Australian Overseas Relocation Agency .mp3",
    "E:/Listening audio IELTSX/Sir Michael Grayson part 2.mp3",
    "E:/Listening audio IELTSX/Professor Anderson part 3.mp3",
    "E:/Listening audio IELTSX/The White-lipped Grove Snail.mp3"
];

function safeFileName(value) {
    return String(value || "").replace(/[^a-z0-9.\-_]/gi, "_").replace(/_+/g, "_");
}

function extractBalancedLiteral(source, name) {
    const assignment = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`).exec(source);
    if (!assignment) throw new Error(`Could not find ${name}`);
    const start = assignment.index + assignment[0].length;
    if (source[start] !== "{") throw new Error(`${name} is not an object literal`);
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
        if (character === "{") depth += 1;
        if (character === "}") depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unclosed ${name} literal`);
}

function optionObjects(letters, labels = []) {
    return letters.split("").map((letter, index) => ({
        letter,
        text: labels[index] || ""
    }));
}

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function textWithInputs($, element) {
    const cloned = $(element).clone();
    cloned.find("input[data-q]").each((_, input) => {
        const field = $(input);
        field.replaceWith(` {{${Number(field.attr("data-q"))}}} `);
    });
    return cleanText(cloned.html());
}

function noteGroup($, part, numbers, answers, instruction) {
    const section = $(`#part${part}`);
    const content = [];
    section.find(".notes-body").children().each((_, element) => {
        const item = $(element);
        if (item.hasClass("notes-section-title")) {
            const value = cleanText(item.text());
            if (value) content.push(`<b>${value}</b>`);
            return;
        }
        if (item.hasClass("note-row")) {
            const value = textWithInputs($, element);
            if (value) content.push(`• ${value}`);
        }
    });

    const questions = numbers.map((number) => {
        const marker = `{{${number}}}`;
        const line = content.find((item) => item.includes(marker));
        if (!line) throw new Error(`Question ${number} is missing from Part ${part}`);
        return {
            number,
            type: "sentence_completion",
            question: line.replace(marker, "...").replace(/^•\s*/, ""),
            options: [],
            answer: String(answers[number] || "")
        };
    });

    return {
        id: `${TEST_ID}-p${part}-g1`,
        type: "note_completion",
        instructionTitle: `Questions ${numbers[0]}–${numbers[numbers.length - 1]}`,
        instructionText: instruction,
        title: cleanText(section.find(".notes-title").first().text()),
        noteStyle: "boxed-flow",
        content,
        questions
    };
}

function multipleChoiceGroup($, part, from, to, answers, title) {
    const questions = [];
    for (let number = from; number <= to; number += 1) {
        const root = $(`#question${number}`);
        if (!root.length) throw new Error(`Question ${number} is missing`);
        const question = cleanText(root.find(".q-title span").last().text());
        const options = root.find(".option").map((_, option) => {
            const input = $(option).find("input").first();
            const letter = String(input.attr("value") || "").toUpperCase();
            const clone = $(option).clone();
            clone.find("input").remove();
            return { letter, text: cleanText(clone.text()) };
        }).get();
        questions.push({
            number,
            type: "multiple_choice",
            question,
            options,
            answer: String(answers[number] || "").toUpperCase()
        });
    }
    return {
        id: `${TEST_ID}-p${part}-g1`,
        type: "multiple_choice",
        instructionTitle: `Questions ${from}–${to}`,
        instructionText: "Choose the correct letter, A, B or C.",
        title,
        questions
    };
}

function mapGroup($, answers, imageUrl) {
    const letters = "ABCDEFGHI";
    const options = optionObjects(letters);
    const questions = [];
    for (let number = 17; number <= 20; number += 1) {
        const select = $(`#q${number}`);
        if (!select.length) throw new Error(`Question ${number} is missing`);
        const row = select.closest(".map-row");
        questions.push({
            number,
            type: "matching",
            question: cleanText(row.find("span").first().text()),
            options,
            answer: String(answers[number] || "").toUpperCase()
        });
    }
    return {
        id: `${TEST_ID}-p2-g2`,
        type: "matching",
        instructionTitle: "Questions 17–20",
        instructionText: "Label the map below. Choose the correct letter, A–I, next to questions 17–20.",
        title: "North Wharf and Boat Harbour",
        imageUrl,
        imageLayout: "stacked",
        options,
        questions
    };
}

function extractMap($) {
    const src = $("#part2 .map-grid img").first().attr("src") || "";
    const match = src.match(/^data:image\/(png|jpeg);base64,(.+)$/s);
    if (!match) throw new Error("Embedded Part 2 map image is missing");
    return {
        extension: match[1] === "jpeg" ? "jpg" : match[1],
        buffer: Buffer.from(match[2], "base64")
    };
}

function buildTest(htmlPath, audioUrls, imageUrl) {
    const source = fs.readFileSync(htmlPath, "utf8");
    const $ = cheerio.load(source, { decodeEntities: false });
    const answers = vm.runInNewContext(`(${extractBalancedLiteral(source, "answerKey")})`, Object.create(null), { timeout: 1000 });
    const now = new Date().toISOString();
    const part1 = noteGroup($, 1, Array.from({ length: 10 }, (_, index) => index + 1), answers,
        "Complete the notes below.\nWrite ONE WORD AND/OR A NUMBER for each answer.");
    const part4 = noteGroup($, 4, Array.from({ length: 10 }, (_, index) => index + 31), answers,
        "Complete the notes below.\nWrite ONE WORD ONLY for each answer.");

    const sections = [
        { number: 1, title: "Part 1", audio: audioUrls[0], questionGroups: [part1] },
        {
            number: 2,
            title: "Part 2",
            audio: audioUrls[1],
            questionGroups: [
                multipleChoiceGroup($, 2, 11, 16, answers, "Sir Michael Grayson"),
                mapGroup($, answers, imageUrl)
            ]
        },
        {
            number: 3,
            title: "Part 3",
            audio: audioUrls[2],
            questionGroups: [multipleChoiceGroup($, 3, 21, 30, answers, "Professor Anderson")]
        },
        { number: 4, title: "Part 4", audio: audioUrls[3], questionGroups: [part4] }
    ];
    const questions = sections.flatMap((section) => section.questionGroups.flatMap((group) => group.questions || []));
    const numbers = questions.map((question) => Number(question.number)).sort((a, b) => a - b);
    const expected = Array.from({ length: 40 }, (_, index) => index + 1);
    if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
        throw new Error(`Expected questions 1–40, received: ${numbers.join(", ")}`);
    }
    questions.forEach((question) => {
        if (!String(question.answer || "").trim()) throw new Error(`Question ${question.number} has no answer`);
    });

    return {
        id: TEST_ID,
        slug: TEST_ID,
        title: TITLE,
        subtitle: "Listening full test",
        sourceFile: path.basename(htmlPath),
        status: "published",
        skill: "listening",
        layout: "cd-listening-static-v1",
        manualListeningTestId: `${TEST_ID}-listening-full`,
        reading: { passages: [] },
        listening: { audio: audioUrls[0], transcript: "", sections },
        answers: Object.fromEntries(questions.map((question) => [String(question.number), question.answer])),
        images: [{
            id: `${TEST_ID}-map-1`,
            src: imageUrl,
            alt: "North Wharf and Boat Harbour map",
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
        publishedAt: now,
        openUrl: `/full-test-player?id=${TEST_ID}&skill=listening`
    };
}

function saveJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main() {
    const args = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
    const htmlPath = path.resolve(args[0] || DEFAULT_HTML);
    const audioPaths = DEFAULT_AUDIO.map((fallback, index) => path.resolve(args[index + 1] || fallback));
    [htmlPath, ...audioPaths].forEach((filePath) => {
        if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    });

    const $ = cheerio.load(fs.readFileSync(htmlPath, "utf8"), { decodeEntities: false });
    const map = extractMap($);
    const audioFileNames = audioPaths.map((_, index) => `${TEST_ID}-part-${index + 1}.mp3`);
    const audioUrls = audioFileNames.map((fileName) => `/uploads/audio/${fileName}`);
    const mapFileName = `north-wharf-map.${map.extension}`;
    const imageUrl = `/uploads/ielts-import/${TEST_ID}/${mapFileName}`;
    const test = buildTest(htmlPath, audioUrls, imageUrl);
    const published = buildPublishedTests(test);
    const listeningTests = published.listeningTests.map((item) => ({
        ...item,
        status: "published",
        duration: item.part === "full" ? 40 : 10
    }));

    if (process.argv.includes("--apply")) {
        const sourceTarget = path.join(ROOT, "uploads", "ielts-import", `${TEST_ID}-source.html`);
        const mapTarget = path.join(ROOT, "uploads", "ielts-import", TEST_ID, mapFileName);
        fs.mkdirSync(path.dirname(sourceTarget), { recursive: true });
        fs.mkdirSync(path.dirname(mapTarget), { recursive: true });
        fs.mkdirSync(path.join(ROOT, "uploads", "audio"), { recursive: true });
        fs.copyFileSync(htmlPath, sourceTarget);
        fs.writeFileSync(mapTarget, map.buffer);
        audioPaths.forEach((audioPath, index) => {
            fs.copyFileSync(audioPath, path.join(ROOT, "uploads", "audio", audioFileNames[index]));
        });
        saveJson(path.join(ROOT, "data", "full-tests", `${safeFileName(TEST_ID)}.json`), test);
        listeningTests.forEach((item) => {
            saveJson(path.join(ROOT, "data", "listening-tests", `${safeFileName(item.id)}.json`), item);
        });
    }

    console.log(JSON.stringify({
        id: test.id,
        title: test.title,
        sections: test.listening.sections.length,
        questions: Object.keys(test.answers).length,
        audio: audioUrls,
        map: imageUrl,
        derivedTests: listeningTests.map((item) => item.id),
        apply: process.argv.includes("--apply"),
        openUrl: `/listening/${TEST_ID}`
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
}
