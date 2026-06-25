const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_HTML = "C:\\Users\\dizay\\Downloads\\full-listening-test-audio-added.html";
const AUDIO_SOURCE_DIR = "C:\\Users\\dizay\\Documents\\IELTS 21 AUDIO";
const LISTENING_DIR = path.join(ROOT, "data", "listening-tests");
const UPLOAD_AUDIO_DIR = path.join(ROOT, "uploads", "audio");
const TEST_ID = "cambridge-21-test-1-listening";
const TITLE = "Cambridge IELTS 21 Test 1 Listening";

const audioByPart = {
    1: ["C21T1P1.1.mp3", "C21T1P1.2.mp3"],
    2: ["C21T1P2.1.mp3", "C21T1P2.2.mp3"],
    3: ["C21T1P3.1.mp3", "C21T1P3.2.mp3"],
    4: ["C21T1P4.mp3"]
};

const letterAnswerNumbers = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30
]);

function extractObjectLiteral(source, name) {
    const startToken = `const ${name} =`;
    const start = source.indexOf(startToken);
    if (start < 0) throw new Error(`Could not find ${name} in source HTML.`);

    const open = source.indexOf("{", start);
    if (open < 0) throw new Error(`Could not find ${name} object.`);

    let depth = 0;
    let inString = "";
    let escaped = false;
    for (let index = open; index < source.length; index += 1) {
        const char = source[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === inString) {
                inString = "";
            }
            continue;
        }
        if (char === "\"" || char === "'" || char === "`") {
            inString = char;
            continue;
        }
        if (char === "{") depth += 1;
        if (char === "}") {
            depth -= 1;
            if (depth === 0) return source.slice(open, index + 1);
        }
    }

    throw new Error(`Could not parse ${name} object.`);
}

function acceptedAnswers(answers, number) {
    const accepted = Array.isArray(answers[number]) ? answers[number] : [answers[number]];
    return accepted
        .filter(Boolean)
        .map((item) => String(item).trim())
        .map((item) => letterAnswerNumbers.has(Number(number)) ? item.toUpperCase() : item);
}

function answerTextForRange(answers, start, end) {
    const lines = [];
    for (let number = start; number <= end; number += 1) {
        lines.push(`${number} | ${acceptedAnswers(answers, number).join(" | ")}`);
    }
    return lines.join("\n");
}

function questionNumbersForPart(partNumber) {
    const start = (partNumber - 1) * 10 + 1;
    return Array.from({ length: 10 }, (_, index) => start + index);
}

function option(letter, text) {
    return { letter, text };
}

function question(answers, number, type, text, options = []) {
    return {
        number,
        questionNumber: number,
        question: text,
        text,
        options,
        type,
        answer: acceptedAnswers(answers, number).join(" | ")
    };
}

function topLevelQuestion(answers, number, type, text, options = []) {
    return {
        number,
        type,
        question: text,
        options: options.map((item) => ({
            value: item.letter,
            label: item.text,
            html: item.text
        })),
        answer: acceptedAnswers(answers, number).join(" | ")
    };
}

function questionsForPart(answers, partNumber) {
    const definitions = {
        1: [
            [1, "sentence_completion", "small groups (max ... people)"],
            [2, "sentence_completion", "basic theory e.g. understanding the ... and tides"],
            [3, "sentence_completion", "basic sailing skills including ... information"],
            [4, "sentence_completion", "... available for club members"],
            [5, "sentence_completion", "all inclusive (plus a useful ...)"],
            [6, "sentence_completion", "a ... at the end of the course for all participants"],
            [7, "sentence_completion", "Bring suitable clothing, a ... and toiletries."],
            [8, "sentence_completion", "There is an ... at the club."],
            [9, "sentence_completion", "Online training ... are recommended."],
            [10, "sentence_completion", "... are available for course participants."]
        ],
        2: [
            [11, "multiple_choice", "What should trainees always expect to get when working on low budget short films?", [
                option("A", "travel expenses"),
                option("B", "a minimum wage"),
                option("C", "meals")
            ]],
            [12, "multiple_choice", "According to the speaker, on big budget films trainees may get experience of", [
                option("A", "makeup for special effects."),
                option("B", "working with different ethnicities."),
                option("C", "creating a variety of hair styles.")
            ]],
            [13, "multiple_choice", "The speaker says a problem for makeup artists is", [
                option("A", "dealing with difficult directors."),
                option("B", "being shouted at by their supervisor."),
                option("C", "waiting around for hours doing nothing.")
            ]],
            [14, "multiple_choice", "How did the speaker feel when she met famous actors for the first time?", [
                option("A", "very shy"),
                option("B", "very proud"),
                option("C", "very disappointed")
            ]],
            [15, "multiple_choice", "What advice does the speaker give about makeup kits?", [
                option("A", "Always carry a basic kit with you."),
                option("B", "Only buy the best products for a makeup kit."),
                option("C", "Ask other makeup artists to check your kit.")
            ]],
            [16, "multiple_choice", "What advice does the speaker give about creating a portfolio?", [
                option("A", "Keep print and digital photos."),
                option("B", "Only include a small selection of photos."),
                option("C", "Get permission to use photos.")
            ]],
            [17, "matching", "Prepping an actor"],
            [18, "matching", "Continuity"],
            [19, "matching", "General"],
            [20, "matching", "Applying makeup"]
        ],
        3: [
            [21, "multiple_select", "Which TWO features of the lecture on ocean biodiversity had the greatest impact on the students?"],
            [22, "multiple_select", "Which TWO features of the lecture on ocean biodiversity had the greatest impact on the students?"],
            [23, "multiple_select", "Which TWO details about the research project particularly impressed the students?"],
            [24, "multiple_select", "Which TWO details about the research project particularly impressed the students?"],
            [25, "matching", "Article on invasive lionfish"],
            [26, "matching", "Documentary on microplastics"],
            [27, "matching", "Podcast on ocean pollution"],
            [28, "matching", "Book on coastal ecosystems"],
            [29, "matching", "Article on metal toxicity"],
            [30, "matching", "Podcast on floating marine cities"]
        ],
        4: [
            [31, "sentence_completion", "Three resources which are essential for industrial civilisation: ..."],
            [32, "sentence_completion", "the growth of the tree is ..."],
            [33, "sentence_completion", "production cannot easily be adjusted because of increasing or decreasing ..."],
            [34, "sentence_completion", "the tree only grows near the ..."],
            [35, "sentence_completion", "it is very difficult to ... rubber after production."],
            [36, "sentence_completion", "danger of disease caused by a ..."],
            [37, "sentence_completion", "extreme ... events."],
            [38, "sentence_completion", "is less ... than natural rubber"],
            [39, "sentence_completion", "A wild flower has rubber in its ..."],
            [40, "sentence_completion", "It can be grown in many locations and does not require good ..."]
        ]
    };

    return (definitions[partNumber] || []).map(([number, type, text, options = []]) =>
        topLevelQuestion(answers, number, type, text, options)
    );
}

function buildNativeBlocks(answers, partNumber) {
    if (partNumber === 1) {
        return [
            {
                id: `${TEST_ID}-part-1-table`,
                type: "table_completion",
                questionRange: "Questions 1-6",
                title: "Oyster Bay Sailing Club Courses",
                instruction: "Complete the table below. Write ONE WORD AND/OR A NUMBER for each answer.",
                columns: ["Name of course", "What you learn", "Cost", "Other information"],
                rows: [
                    [
                        "Taster day",
                        "introduction to sailing",
                        "\u00a3120 if booking one place",
                        "small groups (max {{1}} people)"
                    ],
                    [
                        "Level 1",
                        "basic theory e.g. understanding the {{2}} and tides\n\nbasic sailing skills including {{3}} information",
                        "\u00a3200\n\n{{4}} available for club members\n\nall inclusive (plus a useful {{5}})",
                        "a {{6}} at the end of the course for all participants"
                    ]
                ],
                questions: [1, 2, 3, 4, 5, 6].map((number) =>
                    question(answers, number, "sentence_completion", questionsForPart(answers, 1).find((item) => item.number === number).question)
                )
            },
            {
                id: `${TEST_ID}-part-1-notes`,
                type: "note_completion",
                questionRange: "Questions 7-10",
                title: "General information",
                instruction: "Complete the notes below. Write ONE WORD ONLY for each answer.",
                content: [
                    "Participants must be able to swim.",
                    "- Bring suitable clothing, a {{7}} and toiletries (e.g. shampoo).",
                    "- There is an {{8}} at the club.",
                    "- Online training {{9}} are recommended.",
                    "- {{10}} are available for course participants."
                ],
                noteStyle: "boxed-flow",
                questions: [7, 8, 9, 10].map((number) =>
                    question(answers, number, "sentence_completion", questionsForPart(answers, 1).find((item) => item.number === number).question)
                )
            }
        ];
    }

    if (partNumber === 2) {
        const multipleChoiceQuestions = questionsForPart(answers, 2)
            .filter((item) => item.type === "multiple_choice")
            .map((item) => question(answers, item.number, "multiple_choice", item.question, item.options.map((optionItem) =>
                option(optionItem.value || optionItem.letter, optionItem.html || optionItem.text || optionItem.label)
            )));

        return [
            {
                id: `${TEST_ID}-part-2-mcq`,
                type: "multiple_choice",
                questionRange: "Questions 11-16",
                title: "Working as a makeup trainee",
                instruction: "Choose the correct letter, A, B or C.",
                questions: multipleChoiceQuestions
            },
            {
                id: `${TEST_ID}-part-2-matching`,
                type: "matching",
                questionRange: "Questions 17-20",
                instruction: "What ability is required for each of the following duties? Write the correct letter, A, B, or C, next to Questions 17-20.",
                options: [
                    option("A", "being well-organised"),
                    option("B", "being flexible"),
                    option("C", "working quickly")
                ],
                questions: [
                    question(answers, 17, "matching", "Prepping an actor"),
                    question(answers, 18, "matching", "Continuity"),
                    question(answers, 19, "matching", "General"),
                    question(answers, 20, "matching", "Applying makeup")
                ]
            }
        ];
    }

    if (partNumber === 3) {
        const biodiversityOptions = [
            option("A", "the references to local problems"),
            option("B", "the broad focus of the examples"),
            option("C", "the practical suggestions for solutions"),
            option("D", "the type of issues discussed"),
            option("E", "the implications for government policy")
        ];
        const projectOptions = [
            option("A", "the team's previous successes"),
            option("B", "its wide geographical scale"),
            option("C", "the use of new technology"),
            option("D", "the extensive statistical evidence"),
            option("E", "the large range of specialists involved")
        ];
        const opinionOptions = [
            option("A", "This is aimed at a very specialist audience."),
            option("B", "This is now rather outdated."),
            option("C", "This was an effective description of a new danger."),
            option("D", "This suggests possible ways to improve the situation."),
            option("E", "This does not give a balanced account."),
            option("F", "This is too predictable to be useful."),
            option("G", "This gives insufficient evidence for its claims."),
            option("H", "This gives a clear explanation of the problems.")
        ];

        return [
            {
                id: `${TEST_ID}-part-3-biodiversity-impact`,
                type: "multiple_select",
                questionRange: "Questions 21-22",
                instruction: "Choose TWO letters, A-E.",
                questionNumber: 21,
                answerQuestions: [{ questionNumber: 22 }],
                maxSelections: 2,
                question: "Which TWO features of the lecture on ocean biodiversity had the greatest impact on the students?",
                options: biodiversityOptions,
                questions: [21, 22].map((number) =>
                    question(answers, number, "multi_select", "Which TWO features of the lecture on ocean biodiversity had the greatest impact on the students?", biodiversityOptions)
                )
            },
            {
                id: `${TEST_ID}-part-3-research-project`,
                type: "multiple_select",
                questionRange: "Questions 23-24",
                instruction: "Choose TWO letters, A-E.",
                questionNumber: 23,
                answerQuestions: [{ questionNumber: 24 }],
                maxSelections: 2,
                question: "Which TWO details about the research project particularly impressed the students?",
                options: projectOptions,
                questions: [23, 24].map((number) =>
                    question(answers, number, "multi_select", "Which TWO details about the research project particularly impressed the students?", projectOptions)
                )
            },
            {
                id: `${TEST_ID}-part-3-opinions`,
                type: "matching",
                questionRange: "Questions 25-30",
                instruction: "What is the students' opinion of each of the following resources related to ocean biodiversity? Choose SIX answers from the box and write the correct letter, A-H, next to Questions 25-30.",
                options: opinionOptions,
                questions: [
                    question(answers, 25, "matching", "Article on invasive lionfish"),
                    question(answers, 26, "matching", "Documentary on microplastics"),
                    question(answers, 27, "matching", "Podcast on ocean pollution"),
                    question(answers, 28, "matching", "Book on coastal ecosystems"),
                    question(answers, 29, "matching", "Article on metal toxicity"),
                    question(answers, 30, "matching", "Podcast on floating marine cities")
                ]
            }
        ];
    }

    return [
        {
            id: `${TEST_ID}-part-4-notes`,
            type: "note_completion",
            questionRange: "Questions 31-40",
            title: "Sources of rubber",
            instruction: "Complete the notes below. Write ONE WORD ONLY for each answer.",
            content: [
                "Three resources which are essential for industrial civilisation",
                "- {{31}}",
                "- fossil fuels",
                "- rubber",
                "<strong>Natural rubber</strong>",
                "This mainly comes from the Para rubber tree, now cultivated in South-East Asia.",
                "The supply is limited because",
                "- the growth of the tree is {{32}}",
                "- production cannot easily be adjusted because of increasing or decreasing {{33}}",
                "- the tree only grows near the {{34}}",
                "- extracting the latex (rubber) is labour-intensive",
                "- it is very difficult to {{35}} rubber after production.",
                "<strong>New threats include</strong>",
                "- lack of genetic diversity, leading to danger of disease caused by a {{36}}",
                "- a shift to the cultivation of palm oil",
                "- extreme {{37}} events.",
                "<strong>Synthetic rubber</strong>",
                "- may be used for engine parts and cooking utensils",
                "- is less {{38}} than natural rubber",
                "- is unsuitable for many purposes e.g. the tyres of aircraft.",
                "<strong>An alternative source of natural rubber</strong>",
                "- A wild flower (a type of dandelion) has rubber in its {{39}}.",
                "- It can be grown in many locations and does not require good {{40}}."
            ],
            noteStyle: "boxed-flow",
            questions: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40].map((number) =>
                question(answers, number, "sentence_completion", questionsForPart(answers, 4).find((item) => item.number === number).question)
            )
        }
    ];
}

function copyAudioFiles() {
    fs.mkdirSync(UPLOAD_AUDIO_DIR, { recursive: true });
    const copied = {};

    Object.entries(audioByPart).forEach(([partNumber, files]) => {
        copied[partNumber] = files.map((fileName) => {
            const source = path.join(AUDIO_SOURCE_DIR, fileName);
            if (!fs.existsSync(source)) throw new Error(`Missing audio file: ${source}`);
            const destination = path.join(UPLOAD_AUDIO_DIR, fileName);
            fs.copyFileSync(source, destination);
            return `/uploads/audio/${fileName}`;
        });
    });

    return copied;
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function main() {
    if (!fs.existsSync(SOURCE_HTML)) throw new Error(`Missing source HTML: ${SOURCE_HTML}`);
    fs.mkdirSync(LISTENING_DIR, { recursive: true });

    const source = fs.readFileSync(SOURCE_HTML, "utf8");
    const answers = vm.runInNewContext(`(${extractObjectLiteral(source, "answers")})`);
    const copiedAudio = copyAudioFiles();
    const createdAt = new Date().toISOString();

    const parts = [1, 2, 3, 4].map((partNumber) => {
        const questionNumbers = questionNumbersForPart(partNumber);
        const audioUrls = copiedAudio[partNumber] || [];

        return {
            partNumber,
            title: `Part ${partNumber}`,
            questionRange: `Questions ${questionNumbers[0]}-${questionNumbers[questionNumbers.length - 1]}`,
            audioUrl: audioUrls[0] || "",
            audioUrls,
            audioFileName: audioUrls.map((item) => path.basename(item)).join(", "),
            html: "",
            instruction: "",
            answerText: answerTextForRange(answers, questionNumbers[0], questionNumbers[questionNumbers.length - 1]),
            blocks: buildNativeBlocks(answers, partNumber)
        };
    });

    const fullTest = {
        id: TEST_ID,
        title: TITLE,
        slug: "cambridge-21-test-1-listening",
        status: "published",
        duration: 40,
        part: "full",
        audio: parts[0].audioUrl,
        questionsHtml: "",
        listeningHtml: "",
        assetFiles: parts.flatMap((part) => part.audioUrls),
        parts,
        sections: parts.map((part) => ({
            title: part.questionRange,
            instruction: "",
            rule: "",
            questionNumbers: questionNumbersForPart(part.partNumber)
        })),
        questions: parts.flatMap((part) => questionsForPart(answers, part.partNumber)),
        createdAt,
        updatedAt: createdAt
    };

    writeJson(path.join(LISTENING_DIR, `${TEST_ID}.json`), fullTest);

    parts.forEach((part) => {
        const partTest = {
            id: `${TEST_ID}-part-${part.partNumber}`,
            title: `${TITLE} - Part ${part.partNumber}`,
            slug: `cambridge-21-test-1-listening-part-${part.partNumber}`,
            status: "published",
            part: part.partNumber,
            audio: part.audioUrl,
            audioUrls: part.audioUrls,
            duration: 10,
            parts: [part],
            sections: [{
                title: part.questionRange,
                instruction: "",
                rule: "",
                questionNumbers: questionNumbersForPart(part.partNumber)
            }],
            questions: questionsForPart(answers, part.partNumber),
            sourceFullTestId: TEST_ID,
            createdAt,
            updatedAt: createdAt
        };
        writeJson(path.join(LISTENING_DIR, `${partTest.id}.json`), partTest);
    });

    console.log(`Imported ${TITLE}`);
    console.log(`Full test: ${TEST_ID}`);
    console.log(`Parts: ${parts.map((part) => `${TEST_ID}-part-${part.partNumber}`).join(", ")}`);
    console.log(`Audio files copied: ${parts.reduce((sum, part) => sum + part.audioUrls.length, 0)}`);
}

main();
