"use strict";

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const ROOT = path.resolve(__dirname, "..");
const TEST_ID = "cambridge-ielts-10-test-3";
const TITLE = "Cambridge IELTS 10 Test 3 Listening";
const DEFAULT_HTML = "C:/Users/dizay/Downloads/ielts_listening_test_3.html";
const DEFAULT_AUDIO = [
    "C:/Users/dizay/Downloads/Music/Cam10-Test3-Section1.mp3",
    "C:/Users/dizay/Downloads/Music/Cam10-Test3-Section2.mp3",
    "C:/Users/dizay/Downloads/Music/Cam10-Test3-Section3.mp3",
    "C:/Users/dizay/Downloads/Music/Practice Cam 10 Listening Test 03 - IELTS Training Online.mp3"
];

const answers = {
    1: "4",
    2: "46 WOMBAT",
    3: "THURSDAY",
    4: "8.30 | 8:30 | 8 30 | 830",
    5: "RED",
    6: "LUNCH",
    7: "GLASSES",
    8: "BALL",
    9: "AUNT",
    10: "MONTH",
    11: "C | E",
    12: "C | E",
    13: "B",
    14: "A",
    15: "C",
    16: "B",
    17: "C",
    18: "D",
    19: "D",
    20: "A",
    21: "C",
    22: "A",
    23: "A",
    24: "B",
    25: "B",
    26: "E",
    27: "D",
    28: "A",
    29: "G",
    30: "C",
    31: "ACHIEVEMENT | ACHIEVEMENTS",
    32: "PERSONALITY | CHARACTER",
    33: "SITUATIONAL",
    34: "FRIEND",
    35: "ASPIRATIONS | AMBITIONS",
    36: "STYLE",
    37: "DEVELOPMENT",
    38: "VISION",
    39: "STRUCTURES",
    40: "INNOVATION | INNOVATIONS"
};

const part1Prompts = {
    1: "Age: ...",
    2: "Address: ... Road, Woodside, 4032",
    3: "Days enrolled for: Monday and ...",
    4: "Start time: ... am",
    5: "Childcare group: the ... group",
    6: "Which meal/s are required each day? ...",
    7: "Medical conditions: needs ...",
    8: "Emergency contact: Jenny ...; Phone: 3346 7523",
    9: "Relationship to child: ...",
    10: "Will pay each ..."
};

const part4Prompts = {
    31: "Promotion goals focus on ...",
    32: "The Chronic Factor comes from one's ...",
    33: "The ... Factor",
    34: "We are more likely to focus on promotion goals when with a ...",
    35: "Promotion Focus: People think about an ideal version of themselves, their ... and their gains.",
    36: "Leadership behaviour and ... affects people's focus.",
    37: "Transformational leaders pay special attention to the ... of their followers.",
    38: "Transformational leaders passionately communicate a clear ...",
    39: "Transactional leaders create ... to make expectations clear.",
    40: "Promotion Focus is good for jobs requiring ..."
};

const part1Content = [
    "<strong>Personal Details</strong>",
    "Child's name: Kate",
    "Age: {{1}}",
    "Address: {{2}} Road, Woodside, 4032",
    "Phone: 3345 9865",
    "<strong>Childcare Information</strong>",
    "Days enrolled for: Monday and {{3}}",
    "Start time: {{4}} am",
    "Childcare group: the {{5}} group",
    "Which meal/s are required each day? {{6}}",
    "Medical conditions: needs {{7}}",
    "Emergency contact: Jenny {{8}} Phone: 3346 7523",
    "Relationship to child: {{9}}",
    "<strong>Fees</strong>",
    "Will pay each {{10}}"
];

const part4Content = [
    "<strong>Self-regulatory focus theory</strong>",
    "People's focus is to approach pleasure or avoid pain",
    "Promotion goals focus on {{31}}",
    "Prevention goals emphasise avoiding punishment",
    "<strong>Factors that affect people's focus</strong>",
    "<em>The Chronic Factor</em>",
    "• comes from one's {{32}}",
    "<em>The {{33}} Factor</em>",
    "• we are more likely to focus on promotion goals when with a {{34}}",
    "• we are more likely to focus on prevention goals with our boss",
    "<strong>How people's focus affects them</strong>",
    "Promotion Focus: People think about an ideal version of themselves, their {{35}} and their gains.",
    "Prevention Focus: People think about their ‘ought’ self and their obligations",
    "<strong>Leaders</strong>",
    "Leadership behaviour and {{36}} affects people's focus",
    "<em>Transformational Leaders</em>",
    "• pay special attention to the {{37}} of their followers",
    "• passionately communicate a clear {{38}}",
    "• inspire promotion focus in followers",
    "<em>Transactional Leaders</em>",
    "• create {{39}} to make expectations clear",
    "• emphasise the results of a mistake",
    "• inspire prevention focus in followers",
    "<strong>Conclusion</strong>",
    "Promotion Focus is good for jobs requiring {{40}}",
    "Prevention Focus is good for work such as a surgeon",
    "Leaders' actions affect which focus people use"
];

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function options(letters, labels) {
    return letters.split("").map((letter, index) => ({
        letter,
        text: labels[index]
    }));
}

function question(number, type, prompt, questionOptions = []) {
    return {
        number,
        type,
        question: prompt,
        options: questionOptions,
        answer: answers[number]
    };
}

function multipleChoiceQuestions($, numbers) {
    return numbers.map((number) => {
        const root = $(`[data-q="${number}"]`).first();
        const prompt = cleanText(root.find("strong").first().text());
        const questionOptions = root.find(".answers label").map((_, label) => {
            const item = $(label);
            return {
                letter: cleanText(item.find(".choice-letter").text()),
                text: cleanText(item.find("span").last().text())
            };
        }).get();
        if (!prompt || questionOptions.length < 3) {
            throw new Error(`Could not parse multiple-choice question ${number}`);
        }
        return question(number, "multiple_choice", prompt, questionOptions);
    });
}

function matchingQuestions($, numbers, selector, questionOptions) {
    return numbers.map((number) => {
        const root = $(`${selector}[data-q="${number}"]`).first();
        const prompt = cleanText(root.find("span").first().text());
        if (!prompt) throw new Error(`Could not parse matching question ${number}`);
        return question(number, "matching", prompt, questionOptions);
    });
}

function completionQuestions(prompts) {
    return Object.entries(prompts).map(([number, prompt]) =>
        question(Number(number), "sentence_completion", prompt)
    );
}

function buildTest(htmlPath, audioUrls) {
    const source = fs.readFileSync(htmlPath, "utf8");
    const $ = cheerio.load(source, { decodeEntities: false });
    const now = new Date().toISOString();

    const dolphinOptions = options("ABCD", ["Moondancer", "Echo", "Kiwi", "Samson"]);
    const actionOptions = options("ABCDEFG", [
        "be on time",
        "get a letter of recommendation",
        "plan for the final year",
        "make sure the institution's focus is relevant",
        "show ability in Theatre Studies",
        "make travel arrangements and bookings",
        "ask for help"
    ]);
    const trustOptions = options("ABCDE", [
        "Children make up most of the membership.",
        "It's the country's largest conservation organisation.",
        "It helps finance campaigns for changes in fishing practices.",
        "It employs several dolphin experts full-time.",
        "Volunteers help in various ways."
    ]);

    const sections = [
        {
            number: 1,
            title: "Part 1",
            audio: audioUrls[0],
            instruction: "",
            questionGroups: [{
                id: `${TEST_ID}-p1-g1`,
                type: "note_completion",
                instructionTitle: "Questions 1–10",
                instructionText: "Complete the form below.\nWrite ONE WORD AND/OR A NUMBER for each answer.",
                title: "Early Learning Childcare Centre — Enrolment Form",
                example: "Parent or guardian: Caroll Smith",
                noteStyle: "childcare-enrolment",
                content: part1Content,
                questions: completionQuestions(part1Prompts)
            }]
        },
        {
            number: 2,
            title: "Part 2",
            audio: audioUrls[1],
            instruction: "",
            questionGroups: [
                {
                    id: `${TEST_ID}-p2-g1`,
                    type: "multiple_select",
                    instructionTitle: "Questions 11–12",
                    instructionText: "Choose TWO letters, A–E.",
                    question: "Which TWO things does Alice say about the Dolphin Conservation Trust?",
                    options: trustOptions,
                    questions: [11, 12].map((number) =>
                        question(number, "multi_select", "Which TWO things does Alice say about the Dolphin Conservation Trust?", trustOptions)
                    )
                },
                {
                    id: `${TEST_ID}-p2-g2`,
                    type: "multiple_choice",
                    instructionTitle: "Questions 13–15",
                    instructionText: "Choose the correct letter, A, B or C.",
                    questions: multipleChoiceQuestions($, [13, 14, 15])
                },
                {
                    id: `${TEST_ID}-p2-g3`,
                    type: "matching",
                    instructionTitle: "Questions 16–20",
                    instructionText: "Which dolphin does Alice make each comment about?\nWrite the correct letter, A, B, C or D.",
                    title: "",
                    optionsTitle: "Dolphins",
                    options: dolphinOptions,
                    questions: matchingQuestions($, [16, 17, 18, 19, 20], ".comment-row", dolphinOptions)
                }
            ]
        },
        {
            number: 3,
            title: "Part 3",
            audio: audioUrls[2],
            instruction: "",
            questionGroups: [
                {
                    id: `${TEST_ID}-p3-g1`,
                    type: "multiple_choice",
                    instructionTitle: "Questions 21–25",
                    instructionText: "Choose the correct letter, A, B or C.",
                    title: "Theatre Studies Course",
                    questions: multipleChoiceQuestions($, [21, 22, 23, 24, 25])
                },
                {
                    id: `${TEST_ID}-p3-g2`,
                    type: "matching",
                    instructionTitle: "Questions 26–30",
                    instructionText: "Choose FIVE answers from the box and write the correct letter, A–G.",
                    title: "",
                    optionsTitle: "Stages in doing the ‘year abroad’ option",
                    options: actionOptions,
                    questions: matchingQuestions($, [26, 27, 28, 29, 30], ".stage-row", actionOptions)
                }
            ]
        },
        {
            number: 4,
            title: "Part 4",
            audio: audioUrls[3],
            instruction: "",
            questionGroups: [{
                id: `${TEST_ID}-p4-g1`,
                type: "note_completion",
                instructionTitle: "Questions 31–40",
                instructionText: "Complete the notes below.\nWrite ONE WORD ONLY for each answer.",
                title: "‘Self-regulatory focus theory’ and leadership",
                noteStyle: "self-regulatory-focus",
                content: part4Content,
                questions: completionQuestions(part4Prompts)
            }]
        }
    ];

    const questions = sections.flatMap((section) =>
        section.questionGroups.flatMap((group) => group.questions || [])
    ).sort((a, b) => a.number - b.number);
    const expected = Array.from({ length: 40 }, (_, index) => index + 1);
    if (JSON.stringify(questions.map((item) => item.number)) !== JSON.stringify(expected)) {
        throw new Error("The generated test does not contain questions 1–40 exactly once.");
    }
    questions.forEach((item) => {
        if (!String(item.answer || "").trim()) throw new Error(`Question ${item.number} has no answer.`);
    });

    return {
        id: TEST_ID,
        slug: TEST_ID,
        title: TITLE,
        subtitle: "Listening full test",
        sourceFile: path.basename(htmlPath),
        status: "published",
        skill: "listening",
        layout: "generic",
        manualListeningTestId: `${TEST_ID}-listening-full`,
        reading: { passages: [] },
        listening: {
            audio: audioUrls[0],
            transcript: "",
            sections
        },
        answers: Object.fromEntries(questions.map((item) => [String(item.number), item.answer])),
        images: [],
        parseReport: {
            hasReading: false,
            hasListening: true,
            passageCount: 0,
            listeningSectionCount: 4,
            imageCount: 0,
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

    const audioFileNames = audioPaths.map((_, index) => `${TEST_ID}-part-${index + 1}.mp3`);
    const audioUrls = audioFileNames.map((fileName) => `/uploads/audio/${fileName}`);
    const test = buildTest(htmlPath, audioUrls);
    const published = buildPublishedTests(test);
    const listeningTests = published.listeningTests.map((item) => ({
        ...item,
        status: "published",
        duration: item.part === "full" ? 40 : 10
    }));

    if (process.argv.includes("--apply")) {
        const sourceTarget = path.join(ROOT, "uploads", "ielts-import", `${TEST_ID}-source.html`);
        fs.mkdirSync(path.dirname(sourceTarget), { recursive: true });
        fs.mkdirSync(path.join(ROOT, "uploads", "audio"), { recursive: true });
        fs.copyFileSync(htmlPath, sourceTarget);
        audioPaths.forEach((audioPath, index) => {
            fs.copyFileSync(audioPath, path.join(ROOT, "uploads", "audio", audioFileNames[index]));
        });
        saveJson(path.join(ROOT, "data", "full-tests", `${TEST_ID}.json`), test);
        listeningTests.forEach((item) => {
            saveJson(path.join(ROOT, "data", "listening-tests", `${item.id}.json`), item);
        });
    }

    console.log(JSON.stringify({
        id: test.id,
        title: test.title,
        sections: test.listening.sections.length,
        questions: Object.keys(test.answers).length,
        derivedTests: listeningTests.map((item) => item.id),
        apply: process.argv.includes("--apply"),
        openUrl: `/listening/${TEST_ID}-listening-full`
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
}
