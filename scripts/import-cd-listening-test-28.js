const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const ROOT = path.resolve(__dirname, "..");
const TEST_ID = "cd-ielts-listening-test-28";
const TITLE = "CD IELTS Listening Test 28";
const DEFAULT_HTML = "C:/Users/dizay/Downloads/Telegram Desktop/FULL LISTENING (2).html";
const DEFAULT_AUDIO = "C:/Users/dizay/Downloads/Music/CD IELTS Listening Test 28.mp3";
const DEFAULT_MAP = "C:/Users/dizay/AppData/Local/Temp/codex-clipboard-e22e5b4b-ccca-4b01-ba23-27cab92e58a4.png";

function positionalArguments() {
    return process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
}

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

function parseString(source) {
    return vm.runInNewContext(`(${source})`, Object.create(null), { timeout: 1000 });
}

function optionObjects(labels) {
    return labels.map((text, index) => ({
        letter: String.fromCharCode(65 + index),
        text
    }));
}

function renderTemplate(source, functionName) {
    const match = source.match(new RegExp(`function\\s+${functionName}\\s*\\(\\)\\s*\\{[\\s\\S]*?return\\s*\`([\\s\\S]*?)\`;\\s*\\}`));
    if (!match) throw new Error(`Could not read ${functionName}`);
    return match[1]
        .replace(/\$\{partBanner\([^}]+\)\}/g, "")
        .replace(/\$\{inputBlank\((\d+)\)\}/g, "{{$1}}");
}

function noteGroup(source, functionName, numbers, answers, settings) {
    const $ = cheerio.load(`<div id="template">${renderTemplate(source, functionName)}</div>`, { decodeEntities: false });
    const content = [];
    $("#template .notes-block").children().each((_, element) => {
        const item = $(element);
        let value = item.text()
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^[-*•]\s*/, "");
        if (settings.boldSections && item.hasClass("section-title")) {
            value = `<b>${value}</b>`;
        } else if (settings.bullets && item.hasClass("notes-row")) {
            value = `• ${value}`;
        }
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
        instructionTitle: `Questions ${numbers[0]}–${numbers[numbers.length - 1]}`,
        instructionText: settings.instruction,
        title: settings.title,
        noteStyle: "boxed-flow",
        content,
        questions
    };
}

function extractMcQuestions(source, answers) {
    const questions = [];
    const pattern = /mcQuestion\(\s*(\d+)\s*,\s*("(?:\\.|[^"\\])*")\s*,\s*(\[(?:\\.|[^\]])*\])\s*\)/g;
    let match;
    while ((match = pattern.exec(source))) {
        const number = Number(match[1]);
        const question = parseString(match[2]);
        const labels = vm.runInNewContext(`(${match[3]})`, Object.create(null), { timeout: 1000 });
        questions.push({
            number,
            type: "multiple_choice",
            question,
            options: optionObjects(labels),
            answer: String(answers[number] || "").toUpperCase()
        });
    }
    return questions.sort((a, b) => a.number - b.number);
}

function extractChoiceRows(source, answers, imageUrl) {
    const questions = [];
    const pattern = /choiceRow\(\s*(\d+)\s*,\s*("(?:\\.|[^"\\])*")\s*,\s*lettersAJ\s*\)/g;
    let match;
    const options = "ABCDEFGHIJ".split("").map((letter) => ({ letter, text: "" }));
    while ((match = pattern.exec(source))) {
        const number = Number(match[1]);
        questions.push({
            number,
            type: "map_labelling",
            question: parseString(match[2]),
            options,
            answer: String(answers[number] || "").toUpperCase()
        });
    }

    return {
        id: `${TEST_ID}-p3-g1`,
        type: "map_labelling",
        instructionTitle: "Questions 21–27",
        instructionText: "Label the plan. Write the correct letter, A–J, next to questions 21–27.",
        title: "Potential Community Centre",
        imageUrl,
        options,
        questions
    };
}

function multiSelectGroup(numbers, instructionTitle, prompt, labels, answers, suffix) {
    const options = optionObjects(labels);
    return {
        id: `${TEST_ID}-p2-${suffix}`,
        type: "multi_select",
        instructionTitle,
        instructionText: "Choose TWO letters, A–E.",
        title: prompt,
        question: prompt,
        options,
        maxSelections: 2,
        questions: numbers.map((number) => ({
            number,
            type: "multi_select",
            question: prompt,
            options,
            answer: String(answers[number] || "").toUpperCase()
        }))
    };
}

function buildTest(htmlPath, audioUrl, imageUrl) {
    const source = fs.readFileSync(htmlPath, "utf8");
    const answers = literal(source, "answerKey", "{");
    const mcQuestions = extractMcQuestions(source, answers);
    const now = new Date().toISOString();

    const part1 = noteGroup(source, "renderPart1", Array.from({ length: 10 }, (_, index) => index + 1), answers, {
        part: 1,
        title: "Car Club Scheme",
        instruction: "Complete the notes below.\nWrite ONE WORD AND/OR A NUMBER for each answer.",
        bullets: true,
        boldSections: true
    });
    const part4 = noteGroup(source, "renderPart4", Array.from({ length: 10 }, (_, index) => index + 31), answers, {
        part: 4,
        title: "How Ordinary People Assist in Scientific Research",
        instruction: "Complete the notes below.\nWrite ONE WORD AND/OR A NUMBER for each answer.",
        bullets: true
    });

    const sections = [
        {
            number: 1,
            title: "Part 1",
            audio: audioUrl,
            questionGroups: [part1]
        },
        {
            number: 2,
            title: "Part 2",
            audio: audioUrl,
            questionGroups: [
                {
                    id: `${TEST_ID}-p2-g1`,
                    type: "multiple_choice",
                    instructionTitle: "Questions 11–16",
                    instructionText: "Choose the correct letter, A, B or C.",
                    title: "Market manager",
                    questions: mcQuestions.filter((question) => question.number >= 11 && question.number <= 16)
                },
                multiSelectGroup(
                    [17, 18],
                    "Questions 17 and 18",
                    "Which TWO things does Tracy find most difficult about her job?",
                    [
                        "ensuring regulations are followed",
                        "the amount of administration involved",
                        "dealing with conflict between stallholders",
                        "the early start and long hours",
                        "introducing changes to existing systems"
                    ],
                    answers,
                    "g2"
                ),
                multiSelectGroup(
                    [19, 20],
                    "Questions 19 and 20",
                    "Which TWO pieces of advice does Tracy give people thinking of having a market stall?",
                    [
                        "Try to vary your stock regularly",
                        "Don't be discouraged if you don't sell much at first",
                        "Make sure you choose the right type of market",
                        "Offer goods at low prices for the first few weeks",
                        "Take care with the presentation of objects on the stall"
                    ],
                    answers,
                    "g3"
                )
            ]
        },
        {
            number: 3,
            title: "Part 3",
            audio: audioUrl,
            questionGroups: [
                extractChoiceRows(source, answers, imageUrl),
                {
                    id: `${TEST_ID}-p3-g2`,
                    type: "multiple_choice",
                    instructionTitle: "Questions 28–30",
                    instructionText: "Who do Lindy and Baz agree should do each job? Choose A, B or C.",
                    optionsTitle: "A Lindy · B Baz · C both Lindy and Baz",
                    questions: mcQuestions.filter((question) => question.number >= 28 && question.number <= 30)
                }
            ]
        },
        {
            number: 4,
            title: "Part 4",
            audio: audioUrl,
            questionGroups: [part4]
        }
    ];

    const questions = sections.flatMap((section) =>
        section.questionGroups.flatMap((group) => group.questions || [])
    );
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
        listening: { audio: audioUrl, transcript: "", sections },
        answers: Object.fromEntries(questions.map((question) => [String(question.number), question.answer])),
        images: [{
            id: `${TEST_ID}-map-1`,
            src: imageUrl,
            alt: "Potential Community Centre plan",
            section: "listening",
            sectionNumber: 3
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
    const args = positionalArguments();
    const htmlPath = path.resolve(args[0] || DEFAULT_HTML);
    const audioPath = path.resolve(args[1] || DEFAULT_AUDIO);
    const mapPath = path.resolve(args[2] || DEFAULT_MAP);

    [htmlPath, audioPath, mapPath].forEach((filePath) => {
        if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    });

    const audioFileName = `${TEST_ID}.mp3`;
    const mapFileName = "potential-community-centre.png";
    const audioUrl = `/uploads/audio/${audioFileName}`;
    const imageUrl = `/uploads/ielts-import/${TEST_ID}/${mapFileName}`;
    const test = buildTest(htmlPath, audioUrl, imageUrl);
    const published = buildPublishedTests(test);
    const listeningTests = published.listeningTests.map((item) => ({
        ...item,
        status: "published",
        duration: item.part === "full" ? 40 : 10
    }));

    if (process.argv.includes("--apply")) {
        const sourceTarget = path.join(ROOT, "uploads", "ielts-import", `${TEST_ID}-source.html`);
        const audioTarget = path.join(ROOT, "uploads", "audio", audioFileName);
        const mapTarget = path.join(ROOT, "uploads", "ielts-import", TEST_ID, mapFileName);
        fs.mkdirSync(path.dirname(sourceTarget), { recursive: true });
        fs.mkdirSync(path.dirname(audioTarget), { recursive: true });
        fs.mkdirSync(path.dirname(mapTarget), { recursive: true });
        fs.copyFileSync(htmlPath, sourceTarget);
        fs.copyFileSync(audioPath, audioTarget);
        fs.copyFileSync(mapPath, mapTarget);
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
        answers: Object.keys(test.answers).length,
        audio: audioUrl,
        map: imageUrl,
        derivedTests: listeningTests.map((item) => item.id),
        apply: process.argv.includes("--apply"),
        openUrl: test.openUrl
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
}
