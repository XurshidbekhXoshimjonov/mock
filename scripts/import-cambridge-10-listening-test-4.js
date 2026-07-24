"use strict";

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const ROOT = path.resolve(__dirname, "..");
const TEST_ID = "cambridge-ielts-10-test-4";
const TITLE = "Cambridge IELTS 10 Test 4 Listening";
const DEFAULT_HTML = "C:/Users/dizay/Downloads/Cambridge_IELTS_10_Test_4_Listening.html";
const DEFAULT_AUDIO = [
    "C:/Users/dizay/Downloads/Music/Practice Cam 10 Listening Test 04 - IELTS Training Online.mp3",
    "C:/Users/dizay/Downloads/Music/Practice Cam 10 Listening Test 04 - IELTS Training Online_2.mp3",
    "C:/Users/dizay/Downloads/Music/Practice Cam 10 Listening Test 04 - IELTS Training Online_3.mp3",
    "C:/Users/dizay/Downloads/Music/cambridge-ielts-10-academic-listening-4-audio-4.mp3"
];

const answers = {
    1: "PARGETTER",
    2: "EAST",
    3: "LIBRARY",
    4: "MORNING | MORNINGS",
    5: "POSTBOX",
    6: "PRICES",
    7: "GLASS",
    8: "COOKER",
    9: "WEEK",
    10: "FENCE",
    11: "B",
    12: "B",
    13: "A",
    14: "A",
    15: "C",
    16: "TRAINS",
    17: "DARK",
    18: "GAMES",
    19: "GUIDED TOUR",
    20: "LADDER | LADDERS",
    21: "A",
    22: "E",
    23: "B",
    24: "C",
    25: "D",
    26: "F",
    27: "G",
    28: "B",
    29: "E",
    30: "C",
    31: "C",
    32: "B",
    33: "C",
    34: "METAL | METALS",
    35: "SPACE",
    36: "MEMORY",
    37: "SOLAR",
    38: "OIL",
    39: "WASTE",
    40: "TESTS"
};

const part1Notes = [
    "<strong>Name:</strong> Edith {{1}}",
    "<strong>Address:</strong> Flat 4, {{2}} Park Flats",
    "• Behind the {{3}}",
    "<strong>Phone number:</strong> 875934",
    "<strong>Best time to contact customer:</strong> during the {{4}}",
    "<strong>Where to park:</strong> opposite entrance next to the {{5}}",
    "Needs full quote showing all the jobs and the {{6}}."
];

const part4Notes = [
    "<strong>Transport</strong>",
    "• Nanotechnology could allow the development of stronger {{34}}.",
    "• Planes would be much lighter in weight.",
    "• {{35}} travel will be made available to the masses.",
    "<strong>Technology</strong>",
    "• Computers will be even smaller, faster, and will have a greater {{36}}.",
    "• {{37}} energy will become more affordable.",
    "<strong>The Environment</strong>",
    "• Nano-robots could rebuild the ozone layer.",
    "• Pollutants such as {{38}} could be removed from water more easily.",
    "• There will be no {{39}} from manufacturing.",
    "<strong>Health and Medicine</strong>",
    "• New methods of food production could eradicate famine.",
    "• Analysis of medical {{40}} will be speeded up.",
    "• Life expectancy could be increased."
];

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function optionObjects(letters, labels) {
    return letters.split("").map((letter, index) => ({
        letter,
        text: labels[index] || ""
    }));
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

function parseMultipleChoice($, numbers) {
    return numbers.map((number) => {
        const root = $(`#q${number}`).first();
        const prompt = cleanText(root.find(".question-title span").last().text());
        const options = root.find(".option").map((_, optionElement) => {
            const option = $(optionElement);
            return {
                letter: cleanText(option.find("input").attr("value")),
                text: cleanText(option.find("span").last().text())
            };
        }).get();

        if (!prompt || options.length !== 3) {
            throw new Error(`Could not parse multiple-choice question ${number}.`);
        }
        return question(number, "multiple_choice", prompt, options);
    });
}

function buildTest(htmlPath, audioUrls) {
    const html = fs.readFileSync(htmlPath, "utf8");
    const $ = cheerio.load(html, { decodeEntities: false });
    const now = new Date().toISOString();

    const placementSkillOptions = optionObjects("ABCDE", [
        "communication",
        "design",
        "IT",
        "marketing",
        "organisation"
    ]);
    const companyBenefitOptions = optionObjects("ABCDE", [
        "updates for its software",
        "cost savings",
        "an improved image",
        "new clients",
        "a growth in sales"
    ]);
    const informationSourceOptions = optionObjects("ABCDEFG", [
        "company manager",
        "company's personnel department",
        "personal tutor",
        "psychology department",
        "mentor",
        "university careers officer",
        "internet"
    ]);
    const placementStages = {
        25: "obtaining booklet",
        26: "discussing options",
        27: "getting updates",
        28: "responding to invitation for interview",
        29: "informing about outcome of interview",
        30: "requesting a reference"
    };

    const sections = [
        {
            number: 1,
            title: "Part 1",
            audio: audioUrls[0],
            instruction: "",
            questionGroups: [
                {
                    id: `${TEST_ID}-p1-g1`,
                    type: "note_completion",
                    instructionTitle: "Questions 1–6",
                    instructionText: "Complete the notes below.\nWrite ONE WORD ONLY for each answer.",
                    title: "THORNDYKE'S BUILDERS",
                    example: "Customer heard about Thorndyke's from a friend.",
                    noteStyle: "thorndykes-builders",
                    content: part1Notes,
                    questions: completionQuestions({
                        1: "Name: Edith ...",
                        2: "Address: Flat 4, ... Park Flats",
                        3: "Behind the ...",
                        4: "Best time to contact customer: during the ...",
                        5: "Where to park: opposite entrance next to the ...",
                        6: "Needs full quote showing all the jobs and the ..."
                    })
                },
                {
                    id: `${TEST_ID}-p1-g2`,
                    type: "table_completion",
                    instructionTitle: "Questions 7–10",
                    instructionText: "Complete the table below.\nWrite ONE WORD ONLY for each answer.",
                    noteStyle: "thorndykes-work-table",
                    columns: ["Area", "Work to be done", "Notes"],
                    rows: [
                        ["Kitchen", "Replace the {{7}} in the door", "Fix tomorrow"],
                        ["Kitchen", "Paint wall above the {{8}}", "Strip paint and plaster approximately one {{9}} in advance"],
                        ["Garden", "One {{10}} needs replacing (end of garden)", ""]
                    ],
                    questions: completionQuestions({
                        7: "Replace the ... in the door",
                        8: "Paint wall above the ...",
                        9: "Strip paint and plaster approximately one ... in advance",
                        10: "One ... needs replacing (end of garden)"
                    }, "table_completion")
                }
            ]
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
                    instructionText: "Choose the correct letter, A, B or C.",
                    title: "MANHAM PORT",
                    questions: parseMultipleChoice($, [11, 12, 13, 14, 15])
                },
                {
                    id: `${TEST_ID}-p2-g2`,
                    type: "table_completion",
                    instructionTitle: "Questions 16–20",
                    instructionText: "Complete the table below.\nWrite NO MORE THAN TWO WORDS for each answer.",
                    title: "Tourist attractions in Manham",
                    columns: ["Place", "Features and activities", "Advice"],
                    rows: [
                        [
                            "copper mine",
                            "specially adapted miners' {{16}} take visitors into the mountain",
                            "the mine is {{17}} and enclosed — unsuitable for children and animals"
                        ],
                        [
                            "village school",
                            "classrooms and a special exhibition of {{18}}",
                            "a {{19}} is recommended"
                        ],
                        [
                            "'The George' (old sailing ship)",
                            "the ship's wheel (was lost but has now been restored)",
                            "children shouldn't use the {{20}}"
                        ]
                    ],
                    questions: completionQuestions({
                        16: "Specially adapted miners' ... take visitors into the mountain",
                        17: "The mine is ... and enclosed",
                        18: "A special exhibition of ...",
                        19: "A ... is recommended",
                        20: "Children shouldn't use the ..."
                    }, "table_completion")
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
                    type: "multiple_select",
                    instructionTitle: "Questions 21–22",
                    instructionText: "Choose TWO letters, A–E.",
                    question: "Which TWO skills did Laura improve as a result of her work placement?",
                    options: placementSkillOptions,
                    questions: [21, 22].map((number) =>
                        question(number, "multi_select", "Which TWO skills did Laura improve as a result of her work placement?", placementSkillOptions)
                    )
                },
                {
                    id: `${TEST_ID}-p3-g2`,
                    type: "multiple_select",
                    instructionTitle: "Questions 23–24",
                    instructionText: "Choose TWO letters, A–E.",
                    question: "Which TWO immediate benefits did the company get from Laura's work placement?",
                    options: companyBenefitOptions,
                    questions: [23, 24].map((number) =>
                        question(number, "multi_select", "Which TWO immediate benefits did the company get from Laura's work placement?", companyBenefitOptions)
                    )
                },
                {
                    id: `${TEST_ID}-p3-g3`,
                    type: "matching",
                    instructionTitle: "Questions 25–30",
                    instructionText: "What source of information should Tim use at each of the following stages of the work placement?\nChoose SIX answers from the box and write the correct letter, A–G, next to questions 25–30.",
                    title: "Stages of the work placement procedure",
                    optionsTitle: "Sources of information",
                    noteStyle: "work-placement-sources",
                    options: informationSourceOptions,
                    questions: completionQuestions(placementStages, "matching").map((item) => ({
                        ...item,
                        options: informationSourceOptions
                    }))
                }
            ]
        },
        {
            number: 4,
            title: "Part 4",
            audio: audioUrls[3],
            instruction: "",
            questionGroups: [
                {
                    id: `${TEST_ID}-p4-g1`,
                    type: "multiple_choice",
                    instructionTitle: "Questions 31–33",
                    instructionText: "Choose the correct letter, A, B or C.",
                    title: "Nanotechnology: technology on a small scale",
                    questions: parseMultipleChoice($, [31, 32, 33])
                },
                {
                    id: `${TEST_ID}-p4-g2`,
                    type: "note_completion",
                    instructionTitle: "Questions 34–40",
                    instructionText: "Complete the notes below.\nWrite ONE WORD ONLY for each answer.",
                    title: "Uses of Nanotechnology",
                    noteStyle: "nanotechnology-uses",
                    content: part4Notes,
                    questions: completionQuestions({
                        34: "Nanotechnology could allow the development of stronger ...",
                        35: "... travel will be made available to the masses",
                        36: "Computers will have a greater ...",
                        37: "... energy will become more affordable",
                        38: "Pollutants such as ... could be removed from water more easily",
                        39: "There will be no ... from manufacturing",
                        40: "Analysis of medical ... will be speeded up"
                    })
                }
            ]
        }
    ];

    const questions = sections.flatMap((section) =>
        section.questionGroups.flatMap((group) => group.questions || [])
    ).sort((a, b) => a.number - b.number);
    const expectedNumbers = Array.from({ length: 40 }, (_, index) => index + 1);
    if (JSON.stringify(questions.map((item) => item.number)) !== JSON.stringify(expectedNumbers)) {
        throw new Error("The generated test does not contain questions 1–40 exactly once.");
    }
    questions.forEach((item) => {
        if (!String(item.answer || "").trim()) {
            throw new Error(`Question ${item.number} has no answer.`);
        }
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
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
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
        audio: audioUrls,
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
