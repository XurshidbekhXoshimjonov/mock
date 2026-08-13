"use strict";

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const ROOT = path.resolve(__dirname, "..");
const TEST_ID = "jasurbek-full-listening-test-10";
const TITLE = "August 13";
const DEFAULT_SOURCES = [
    "C:/Users/dizay/Downloads/Telegram Desktop/part 1 (3).html",
    "C:/Users/dizay/Downloads/Telegram Desktop/PART 2 (3).html",
    "C:/Users/dizay/Downloads/Telegram Desktop/part 3 (3).html",
    "C:/Users/dizay/Downloads/Telegram Desktop/part 4 (3).html"
];

const answers = {
    1: "0491570159",
    2: "7:45 | 7.45",
    3: "Friday",
    4: "22 January | 22nd January | January 22",
    5: "uniform",
    6: "parking",
    7: "weight",
    8: "nurse",
    9: "back",
    10: "purple",
    11: "A",
    12: "A",
    13: "B",
    14: "C",
    15: "C",
    16: "B",
    17: "C",
    18: "D",
    19: "A",
    20: "F",
    21: "B",
    22: "C",
    23: "C",
    24: "teaching",
    25: "numbers",
    26: "applications",
    27: "talent",
    28: "observation",
    29: "whole",
    30: "reading",
    31: "rats",
    32: "snakes",
    33: "tourism",
    34: "traffic",
    35: "rain",
    36: "poison",
    37: "building",
    38: "dog",
    39: "noise",
    40: "combination"
};

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function optionObjects(labels) {
    return Object.entries(labels).map(([letter, text]) => ({ letter, text }));
}

function question(number, type, prompt, options = []) {
    return {
        number,
        type,
        question: prompt,
        options,
        answer: answers[number]
    };
}

function completionQuestions(prompts, type = "sentence_completion") {
    return Object.entries(prompts).map(([number, prompt]) =>
        question(Number(number), type, prompt)
    );
}

function extractAudio(html) {
    const $ = cheerio.load(html, { decodeEntities: false });
    return $("audio source").first().attr("src") || $("audio").first().attr("src") || "";
}

function parsePart2MultipleChoice(html) {
    const $ = cheerio.load(html, { decodeEntities: false });
    return [11, 12, 13, 14, 15].map((number) => {
        const card = $(`#card-q${number}`);
        const prompt = cleanText(card.find(".qtext").text());
        const optionBox = card.find(".option-box").first();
        const text = optionBox.html() || "";
        const options = [];
        const pattern = /<strong>([A-C])\.<\/strong>\s*([^<]+)/gi;
        let match;
        while ((match = pattern.exec(text))) {
            options.push({ letter: match[1].toUpperCase(), text: cleanText(match[2]) });
        }
        if (!prompt || options.length !== 3) throw new Error(`Could not parse question ${number}`);
        return question(number, "multiple_choice", prompt, options);
    });
}

function parsePart3MultipleChoice(html) {
    const $ = cheerio.load(html, { decodeEntities: false });
    return [21, 22, 23].map((number) => {
        const input = $(`input[name="q${number}"]`).first();
        const item = input.closest(".mcq-item");
        const prompt = cleanText(item.find("p").first().clone().find("strong").remove().end().text());
        const options = item.find("label.multi-choice-option").map((_, element) => {
            const label = $(element);
            const letter = label.find("input").attr("value") || "";
            const text = cleanText(label.clone().find("input,.opt-letter").remove().end().text());
            return { letter, text };
        }).get();
        if (!prompt || options.length !== 3) throw new Error(`Could not parse question ${number}`);
        return question(number, "multiple_choice", prompt, options);
    });
}

function buildTest(sourcePaths, audioUrls) {
    const html = sourcePaths.map((sourcePath) => fs.readFileSync(sourcePath, "utf8"));
    const now = new Date().toISOString();
    const staffOptions = optionObjects({
        A: "computer",
        B: "wage",
        C: "production",
        D: "maintenance",
        E: "research and development",
        F: "maintaining customer relationship"
    });

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
                instructionText: "Complete the form below.\nWrite ONE WORD ONLY for each answer.",
                title: "Greenfield Pharmacy - New Employee Details",
                noteStyle: "structured-outline",
                content: [
                    "- Name of manager: John Field",
                    "- John’s phone number: {{1}}",
                    "<strong>Working hours</strong>",
                    "- Shift starts at {{2}} a.m.",
                    "- Late night opening is on {{3}}",
                    "- Start date: {{4}}",
                    "<strong>Things to do</strong>",
                    "- Speak to Barbara about the {{5}}",
                    "- John will email more information about {{6}}",
                    "<strong>Services</strong>",
                    "- When using the {{7}} machine, customers should be aware of the weight limit.",
                    "- If there are any health concerns, speak to the {{8}} on duty.",
                    "- Be careful when lifting heavy boxes to avoid hurting your {{9}}.",
                    "- The new pharmacy bags are now available in {{10}}."
                ],
                questions: completionQuestions({
                    1: "John’s phone number: ...",
                    2: "Shift starts at ... a.m.",
                    3: "Late night opening is on ...",
                    4: "Start date: ...",
                    5: "Speak to Barbara about the ...",
                    6: "John will email more information about ...",
                    7: "When using the ... machine, customers should be aware of the weight limit.",
                    8: "If there are any health concerns, speak to the ... on duty.",
                    9: "Be careful when lifting heavy boxes to avoid hurting your ...",
                    10: "The new pharmacy bags are now available in ..."
                })
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
                    type: "multiple_choice",
                    instructionTitle: "Questions 11–15",
                    instructionText: "Choose the correct answer, A, B or C.",
                    title: "An Electronic Toy Company",
                    questions: parsePart2MultipleChoice(html[1])
                },
                {
                    id: `${TEST_ID}-p2-g2`,
                    type: "matching",
                    instructionTitle: "Questions 16–20",
                    instructionText: "What is the responsibility of each temporary staff member?\nChoose FIVE answers from the box and write the correct letter, A–F, next to Questions 16–20.",
                    optionsTitle: "Responsibilities",
                    optionLetterPunctuation: "dot",
                    options: staffOptions,
                    questions: ["1st person", "2nd person", "3rd person", "4th person", "5th person"].map((prompt, index) =>
                        question(16 + index, "matching", prompt, staffOptions)
                    )
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
                    instructionTitle: "Questions 21–23",
                    instructionText: "Choose the correct answer, A, B or C.",
                    title: "Maths Ability Research",
                    questions: parsePart3MultipleChoice(html[2])
                },
                {
                    id: `${TEST_ID}-p3-g2`,
                    type: "table_completion",
                    instructionTitle: "Questions 24–30",
                    instructionText: "Complete the tables below.\nWrite ONE WORD ONLY for each answer.",
                    title: "Why do people have a negative attitude to maths?",
                    noteStyle: "maths-research-tables",
                    columns: ["Level", "Females", "Males"],
                    rows: [
                        ["First-level importance", "Poor {{24}}", "Fear of {{25}}"],
                        ["Second-level importance", "No obvious {{26}}", "Belief that you need a {{27}} for maths"],
                        ["Third-level importance", "Low awareness of alternative strategies to solve maths problems", "Low awareness of alternative strategies to solve maths problems"]
                    ],
                    content: [
                        "<strong>How do people solve maths questions?</strong>",
                        "Research method: {{28}} of people's strategies",
                        "Successful people most commonly understand the question as a {{29}}.",
                        "Unsuccessful people give up after the first {{30}} of the problem."
                    ],
                    questions: completionQuestions({
                        24: "Females' first-level reason: poor ...",
                        25: "Males' first-level reason: fear of ...",
                        26: "Females' second-level reason: no obvious ...",
                        27: "Males' second-level reason: belief that you need a ... for maths",
                        28: "Research method: ... of people's strategies",
                        29: "Understanding the question as a ...",
                        30: "Giving up after the first ... of the problem"
                    }, "table_completion")
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
                title: "Research in the area around the Chembe Bird Sanctuary",
                noteStyle: "structured-outline",
                content: [
                    "<strong>The importance of birds of prey to local communities</strong>",
                    "- They destroy {{31}} and other rodents.",
                    "- They help to prevent farmers from being bitten by {{32}}.",
                    "- They have been an important part of the local culture for many years.",
                    "- They now support the economy by encouraging {{33}} in the area.",
                    "<strong>Falling numbers of birds of prey</strong>",
                    "- The birds may be accidentally killed:",
                    "  - by {{34}} when they are hunting or sleeping",
                    "  - by electrocution from contact with power lines, especially at times when there is a lot of {{35}}.",
                    "- Local farmers may illegally shoot them or {{36}} them.",
                    "<strong>Ways of protecting chickens from birds of prey</strong>",
                    "- clearly separate vegetation from the areas in which:",
                    "  - {{37}} are kept",
                    "  - chickens (separately)",
                    "- frightening birds of prey by:",
                    "  - keeping a {{38}}",
                    "  - making a {{39}} (e.g. with metal objects)",
                    "- a {{40}} method is usually most effective"
                ],
                questions: completionQuestions({
                    31: "They destroy ... and other rodents.",
                    32: "They help prevent farmers from being bitten by ...",
                    33: "They support the economy by encouraging ...",
                    34: "They may be killed by ... when hunting or sleeping.",
                    35: "Electrocution is especially dangerous when there is a lot of ...",
                    36: "Local farmers may shoot or ... them.",
                    37: "Keep chickens inside a ...",
                    38: "Frighten birds of prey by keeping a ...",
                    39: "Make a ..., for example with metal objects.",
                    40: "A ... method is usually most effective."
                })
            }]
        }
    ];

    const questions = sections.flatMap((section) =>
        section.questionGroups.flatMap((group) => group.questions || [])
    ).sort((a, b) => a.number - b.number);
    const expected = Array.from({ length: 40 }, (_, index) => index + 1);
    if (JSON.stringify(questions.map((item) => item.number)) !== JSON.stringify(expected)) {
        throw new Error("The generated test must contain questions 1–40 exactly once.");
    }
    if (audioUrls.some((audio) => !audio)) throw new Error("All four audio URLs are required.");
    questions.forEach((item) => {
        if (!String(item.answer || "").trim()) throw new Error(`Question ${item.number} has no answer.`);
    });

    return {
        id: TEST_ID,
        slug: TEST_ID,
        title: TITLE,
        subtitle: "Listening full test",
        sourceFile: sourcePaths.map((item) => path.basename(item)).join(", "),
        status: "published",
        skill: "listening",
        layout: "generic",
        manualListeningTestId: `${TEST_ID}-listening-full`,
        reading: { passages: [] },
        listening: { audio: audioUrls[0], transcript: "", sections },
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

async function downloadAudioFiles(remoteAudio, localAudioFiles) {
    const audioDir = path.join(ROOT, "uploads", "audio");
    fs.mkdirSync(audioDir, { recursive: true });
    await Promise.all(remoteAudio.map(async (url, index) => {
        const response = await fetch(url, { redirect: "follow" });
        if (!response.ok) throw new Error(`Audio download failed (${response.status}): ${url}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 1024 || bytes.subarray(0, 256).toString("utf8").includes("<html")) {
            throw new Error(`Downloaded audio ${index + 1} is not a valid media file.`);
        }
        fs.writeFileSync(path.join(audioDir, localAudioFiles[index]), bytes);
    }));
}

async function main() {
    const args = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
    const sourcePaths = DEFAULT_SOURCES.map((fallback, index) => path.resolve(args[index] || fallback));
    sourcePaths.forEach((sourcePath) => {
        if (!fs.existsSync(sourcePath)) throw new Error(`File not found: ${sourcePath}`);
    });

    const sourceHtml = sourcePaths.map((sourcePath) => fs.readFileSync(sourcePath, "utf8"));
    const remoteAudio = sourceHtml.map(extractAudio);
    const localAudioFiles = [1, 2, 3, 4].map((part) => `${TEST_ID}-part-${part}.mp3`);
    if (process.argv.includes("--download-audio")) {
        await downloadAudioFiles(remoteAudio, localAudioFiles);
    }
    const audioUrls = process.argv.includes("--local-audio")
        ? localAudioFiles.map((fileName) => `/uploads/audio/${fileName}`)
        : remoteAudio;
    const test = buildTest(sourcePaths, audioUrls);
    const published = buildPublishedTests(test);
    const listeningTests = published.listeningTests.map((item) => ({
        ...item,
        status: "published",
        duration: item.part === "full" ? 40 : 10
    }));

    if (process.argv.includes("--apply")) {
        const uploadDir = path.join(ROOT, "uploads", "ielts-import", TEST_ID);
        fs.mkdirSync(uploadDir, { recursive: true });
        sourcePaths.forEach((sourcePath, index) => {
            fs.copyFileSync(sourcePath, path.join(uploadDir, `part-${index + 1}.html`));
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
        audio: audioUrls,
        remoteAudio,
        localAudioFiles,
        derivedTests: listeningTests.map((item) => item.id),
        apply: process.argv.includes("--apply"),
        openUrl: `/listening/${TEST_ID}-listening-full`
    }, null, 2));
}

main().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
});
