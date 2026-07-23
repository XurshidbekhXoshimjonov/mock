const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const sourcePaths = process.argv.slice(2, 5);
if (sourcePaths.length !== 3 || sourcePaths.some((file) => !fs.existsSync(file))) {
    console.error("Usage: node scripts/import-reading-practice-test-7.js <passage-1.html> <passage-2.html> <passage-3.html>");
    process.exit(1);
}

const sources = sourcePaths.map((file) => ({
    file,
    $: cheerio.load(fs.readFileSync(file, "utf8"))
}));

const id = "reading-practice-test-7";
const title = "Reading Practice Test 7";
const createdAt = new Date().toISOString();

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function parseAnswers($) {
    const scriptText = $("script").toArray().map((node) => $(node).html() || "").join("\n");
    const objectMatch = scriptText.match(/const\s+correctAnswers\s*=\s*\{([\s\S]*?)\};/);
    if (!objectMatch) throw new Error("Correct answer key was not found");

    const answers = {};
    const entryPattern = /['"]?(\d+)['"]?\s*:\s*(['"])((?:\\.|(?!\2).)*)\2/g;
    let match;
    while ((match = entryPattern.exec(objectMatch[1]))) {
        answers[Number(match[1])] = match[3]
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
    }
    return answers;
}

const answerMaps = sources.map(({ $ }) => parseAnswers($));
const answers = {
    ...Object.fromEntries(Object.entries(answerMaps[0]).filter(([number]) => Number(number) <= 13)),
    ...answerMaps[1],
    ...Object.fromEntries(Object.entries(answerMaps[2]).filter(([number]) => Number(number) >= 27))
};

function option(value, text) {
    return { value, label: `${value}. ${text}` };
}

function question(number, type, text, options = []) {
    return {
        number,
        type,
        question: cleanText(text),
        stemHtml: escapeHtml(cleanText(text)),
        options,
        answer: answers[number]
    };
}

function group({ passage, suffix, type, start, end, instructionText, rule = "", options = [], optionsTitle = "", questions, contentHtml = "" }) {
    return {
        id: `${id}-p${passage}-${suffix}`,
        type,
        instructionTitle: `Questions ${start}–${end}`,
        instructionText,
        instructionHtml: {
            titleHtml: `<h3>Questions ${start}–${end}</h3>`,
            bodyHtml: `<p>${escapeHtml(instructionText)}</p>`,
            rulesHtml: rule ? `<p>${escapeHtml(rule)}</p>` : ""
        },
        rule,
        options,
        optionsTitle,
        contentHtml,
        questionNumbers: questions.map((item) => item.number),
        questions,
        questionRange: [start, end]
    };
}

function passageOne() {
    const $ = sources[0].$;
    const container = $("#passageContent");
    const titleText = cleanText(container.children("h2").first().text());
    const allParagraphs = container.children("p").toArray();
    const subtitle = cleanText($(allParagraphs.shift()).text());
    const paragraphs = allParagraphs.map((node) => ({
        letter: null,
        html: $(node).html() || "",
        text: cleanText($(node).text())
    }));

    const tfQuestions = $(".question-item").toArray().slice(0, 6).map((node, index) => {
        const stem = cleanText($(node).children("p").first().text()).replace(new RegExp(`^${index + 1}\\s*`), "");
        return question(index + 1, "true_false_not_given", stem, ["TRUE", "FALSE", "NOT GIVEN"]);
    });

    const noteQuestions = Array.from({ length: 7 }, (_, index) => question(index + 7, "notes_completion", ""));
    const notesHtml = [
        '<div class="notes-box reading-practice-test-7-notes">',
        '<div class="nb-title">Bert Mercer and aviation on the Coast</div>',
        '<div class="nb-sub">Early Years</div>',
        '<ul style="list-style:none;padding-left:14px;margin-bottom:6px">',
        '<li style="margin-bottom:3px;line-height:2"><span style="color:#111;font-weight:700;margin-right:8px">•</span>Mercer set up Air Travel (NZ) in <span class="ielts-blank" data-blank="7">______</span></li>',
        '<li style="margin-bottom:3px;line-height:2"><span style="color:#111;font-weight:700;margin-right:8px">•</span>the Fox Moth was noted for its <span class="ielts-blank" data-blank="8">______</span> compared to other planes</li>',
        '<li style="margin-bottom:3px;line-height:2"><span style="color:#111;font-weight:700;margin-right:8px">•</span>in <span class="ielts-blank" data-blank="9">______</span> Mercer’s company started to transport mail and passengers</li>',
        '<li style="margin-bottom:3px;line-height:2"><span style="color:#111;font-weight:700;margin-right:8px">•</span>from <span class="ielts-blank" data-blank="10">______</span> planes landed on beaches to pick up fresh produce</li>',
        '</ul>',
        '<div class="nb-sub">World War II</div>',
        '<ul style="list-style:none;padding-left:14px;margin-bottom:6px">',
        '<li style="margin-bottom:3px;line-height:2"><span style="color:#111;font-weight:700;margin-right:8px">•</span>the airline expanded at first because it got a <span class="ielts-blank" data-blank="11">______</span> from the state</li>',
        '<li style="margin-bottom:3px;line-height:2"><span style="color:#111;font-weight:700;margin-right:8px">•</span>there was a shortage of <span class="ielts-blank" data-blank="12">______</span> by 1942</li>',
        '</ul>',
        '<div class="nb-sub">Final Years</div>',
        '<ul style="list-style:none;padding-left:14px;margin-bottom:6px">',
        '<li style="margin-bottom:3px;line-height:2"><span style="color:#111;font-weight:700;margin-right:8px">•</span>there were disputes at the airline about the quantity of <span class="ielts-blank" data-blank="13">______</span> in each plane</li>',
        '</ul>',
        '</div>'
    ].join("");

    const questionGroups = [
        group({
            passage: 1,
            suffix: "g1",
            type: "true_false_not_given",
            start: 1,
            end: 6,
            instructionText: "Do the following statements agree with the information given in Reading Passage 1?",
            rule: "Write TRUE, FALSE or NOT GIVEN.",
            options: ["TRUE", "FALSE", "NOT GIVEN"],
            questions: tfQuestions
        }),
        group({
            passage: 1,
            suffix: "g2",
            type: "notes_completion",
            start: 7,
            end: 13,
            instructionText: "Complete the notes below.",
            rule: "Choose ONE WORD ONLY from the passage for each answer.",
            questions: noteQuestions,
            contentHtml: notesHtml
        })
    ];

    return {
        id: `${id}-passage-1`,
        number: 1,
        title: titleText,
        subtitle,
        displayLabel: "Reading Passage 1",
        passageLabel: "Reading Passage 1",
        passageText: paragraphs.map((item) => item.text).join("\n\n"),
        passageHtml: paragraphs.map((item) => `<p>${item.html}</p>`).join("\n"),
        paragraphs,
        questionGroups,
        questions: questionGroups.flatMap((item) => item.questions)
    };
}

function passageTwo() {
    const $ = sources[1].$;
    const container = $("#passageContent");
    const titleText = cleanText(container.children("h2").first().text());
    const subtitle = "";
    const paragraphs = [];
    let currentLetter = null;
    container.children("h3, p").each((_, node) => {
        const item = $(node);
        if (node.tagName === "h3") {
            currentLetter = cleanText(item.text()).replace(/^Section\s+/i, "");
            return;
        }
        paragraphs.push({
            letter: currentLetter,
            html: item.html() || "",
            text: cleanText(item.text())
        });
        currentLetter = null;
    });

    const headingOptions = $(".question").first().find(".helper-list li").toArray().map((node) => {
        const value = cleanText($(node).find("strong").first().text());
        const text = cleanText($(node).text()).replace(new RegExp(`^${value}\\s*`), "");
        return option(value, text);
    });
    const headingQuestions = Array.from({ length: 6 }, (_, index) =>
        question(index + 14, "matching_headings", `Section ${String.fromCharCode(65 + index)}`, headingOptions)
    );

    const researcherGroup = $(".question").eq(1);
    const researcherOptions = researcherGroup.find(".helper-list li").toArray().map((node) => {
        const value = cleanText($(node).find("strong").first().text());
        const text = cleanText($(node).text()).replace(new RegExp(`^${value}\\s*`), "");
        return option(value, text);
    });
    const researcherQuestions = researcherGroup.find(".dropdown-question-row").toArray().map((node) => {
        const number = Number($(node).find(".question-number").text());
        const stem = cleanText($(node).find("p").text()).replace(new RegExp(`^${number}\\s*`), "");
        return question(number, "matching_features", stem, researcherOptions);
    });

    const summaryQuestions = [24, 25, 26].map((number) => question(number, "summary_completion", ""));
    const summaryHtml = [
        '<div class="ielts-import-summary"><div class="ielts-summary-title">Super-taskers</div><div class="summary-text">',
        "Super-taskers are those of us who possess special multi-tasking ability. They can be found in all professions. ",
        `People who are pilots, chefs and doctors are often super-taskers, and super-taskers are most likely to achieve a <span class="ielts-blank" data-blank="24">______</span> that is high on the career ladder. `,
        `Super-taskers typically have to undertake many tasks simultaneously that need their <span class="ielts-blank" data-blank="25">______</span>. `,
        `Genes play an important role in having this capability: these people have a special brain <span class="ielts-blank" data-blank="26">______</span> which helps them do what we cannot.`,
        "</div></div>"
    ].join("");

    const questionGroups = [
        group({
            passage: 2,
            suffix: "g1",
            type: "matching_headings",
            start: 14,
            end: 19,
            instructionText: "Choose the correct heading for each section from the list of headings below.",
            options: headingOptions,
            questions: headingQuestions
        }),
        group({
            passage: 2,
            suffix: "g2",
            type: "matching_features",
            start: 20,
            end: 23,
            instructionText: "Match each statement with the correct researcher, A–E.",
            rule: "You may use any letter more than once.",
            options: researcherOptions,
            optionsTitle: "List of Researchers",
            questions: researcherQuestions
        }),
        group({
            passage: 2,
            suffix: "g3",
            type: "summary_completion",
            start: 24,
            end: 26,
            instructionText: "Complete the summary below.",
            rule: "Choose ONE WORD ONLY from the passage for each answer.",
            questions: summaryQuestions,
            contentHtml: summaryHtml
        })
    ];

    return {
        id: `${id}-passage-2`,
        number: 2,
        title: titleText,
        subtitle,
        displayLabel: "Reading Passage 2",
        passageLabel: "Reading Passage 2",
        passageText: paragraphs.map((item) => `${item.letter ? `${item.letter}. ` : ""}${item.text}`).join("\n\n"),
        passageHtml: paragraphs.map((item) => `<p>${item.letter ? `<strong>${escapeHtml(item.letter)}</strong> ` : ""}${item.html}</p>`).join("\n"),
        paragraphs,
        questionGroups,
        questions: questionGroups.flatMap((item) => item.questions)
    };
}

function passageThree() {
    const $ = sources[2].$;
    const container = $("#passage-text-3");
    const titleText = cleanText(container.children("h2").first().text());
    const allParagraphs = container.children("p").toArray();
    const subtitle = cleanText($(allParagraphs.shift()).text());
    const paragraphs = allParagraphs.map((node) => ({
        letter: null,
        html: $(node).html() || "",
        text: cleanText($(node).text())
    }));
    const set = $("#questions-3");

    const multipleChoiceQuestions = set.find(".multi-choice-question").toArray().map((node) => {
        const number = Number($(node).attr("data-q-start"));
        const stem = cleanText($(node).children("p").first().text()).replace(new RegExp(`^${number}\\.?\\s*`), "");
        const options = $(node).find("input[type=radio]").toArray().map((input) => {
            const value = $(input).attr("value");
            const label = cleanText($(input).closest("label").text()).replace(new RegExp(`^${value}\\s*`), "");
            return option(value, label);
        });
        return question(number, "multiple_choice", stem, options);
    });

    const claimsQuestions = set.find(".question[data-q-start=31] .tf-question").toArray().map((node) => {
        const number = Number($(node).attr("data-q-start"));
        const stem = cleanText($(node).find(".tf-question-line").text()).replace(new RegExp(`^${number}\\s*`), "");
        return question(number, "yes_no_not_given", stem, ["YES", "NO", "NOT GIVEN"]);
    });

    const wordOptions = [
        option("A", "popular"),
        option("B", "artistic"),
        option("C", "completed"),
        option("D", "eight"),
        option("E", "tuition"),
        option("F", "encouragement"),
        option("G", "inherited"),
        option("H", "four"),
        option("I", "practice"),
        option("J", "two")
    ];
    const summaryQuestions = [37, 38, 39, 40].map((number) =>
        question(number, "summary_completion", "", wordOptions)
    );
    const summaryHtml = [
        '<div class="ielts-import-summary"><div class="ielts-summary-title">Mozart</div>',
        '<div class="summary-text">',
        `The case of Mozart could be quoted as evidence against the 10,000-hour-practice theory. However, the writer points out that the young Mozart received a lot of <span class="ielts-blank" data-blank="37">______</span> from his father, `,
        `and that the symphony he wrote at the age of <span class="ielts-blank" data-blank="38">______</span> was not <span class="ielts-blank" data-blank="39">______</span> and may be of only academic interest. `,
        `The case therefore supports the view that expertise is not solely the result of <span class="ielts-blank" data-blank="40">______</span> characteristics.`,
        '</div>',
        '<div class="reading-practice-test-7-word-list-title">Word List</div>',
        '<div class="cbt-group-options-box reading-practice-test-7-word-options" aria-label="Word List">',
        ...wordOptions.map((item) => `<span class="cbt-group-option-chip" style="color:#111!important">${escapeHtml(item.label)}</span>`),
        '</div></div>'
    ].join("");

    const questionGroups = [
        group({
            passage: 3,
            suffix: "g1",
            type: "multiple_choice",
            start: 27,
            end: 30,
            instructionText: "Choose the correct letter, A, B, C or D.",
            questions: multipleChoiceQuestions
        }),
        group({
            passage: 3,
            suffix: "g2",
            type: "yes_no_not_given",
            start: 31,
            end: 36,
            instructionText: "Do the following statements agree with the claims of the writer?",
            rule: "Write YES, NO or NOT GIVEN.",
            options: ["YES", "NO", "NOT GIVEN"],
            questions: claimsQuestions
        }),
        group({
            passage: 3,
            suffix: "g3",
            type: "summary_completion",
            start: 37,
            end: 40,
            instructionText: "Complete the summary using the list of words, A–J, below.",
            options: wordOptions,
            questions: summaryQuestions,
            contentHtml: summaryHtml
        })
    ];

    return {
        id: `${id}-passage-3`,
        number: 3,
        title: titleText,
        subtitle,
        displayLabel: "Reading Passage 3",
        passageLabel: "Reading Passage 3",
        passageText: paragraphs.map((item) => item.text).join("\n\n"),
        passageHtml: paragraphs.map((item) => `<p>${item.html}</p>`).join("\n"),
        paragraphs,
        questionGroups,
        questions: questionGroups.flatMap((item) => item.questions)
    };
}

const passages = [passageOne(), passageTwo(), passageThree()];
const allQuestions = passages.flatMap((passage) => passage.questions).sort((a, b) => a.number - b.number);
const questionNumbers = allQuestions.map((item) => item.number);
const expectedNumbers = Array.from({ length: 40 }, (_, index) => index + 1);

if (JSON.stringify(questionNumbers) !== JSON.stringify(expectedNumbers)) {
    throw new Error(`Invalid question sequence: ${questionNumbers.join(", ")}`);
}
if (Object.keys(answers).length !== 40 || allQuestions.some((item) => !item.answer)) {
    throw new Error(`Invalid answer key: expected 40 answers, received ${Object.keys(answers).length}`);
}

const fullTest = {
    id,
    title,
    skill: "reading",
    sourceFile: sourcePaths.map((file) => path.basename(file)).join(", "),
    status: "published",
    layout: "custom-full-reading",
    metadata: { label: title },
    reading: { passages },
    listening: { audio: "", transcript: "", sections: [] },
    answers: Object.fromEntries(allQuestions.map((item) => [String(item.number), item.answer])),
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
const sourceDir = path.join(rootDir, "uploads", "ielts-import", id);
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
sourcePaths.forEach((file, index) => {
    fs.copyFileSync(file, path.join(sourceDir, `passage-${index + 1}-${path.basename(file)}`));
});

console.log(JSON.stringify({
    id,
    title,
    passageCount: passages.length,
    questionCount: allQuestions.length,
    answerCount: Object.keys(answers).length,
    practiceTests: published.readingTests.filter((test) => test.part !== "full").map((test) => ({
        id: test.id,
        title: test.title,
        questions: test.questions.length
    })),
    fullReadingId: fullReading && fullReading.id,
    openUrl: fullTest.openUrl
}, null, 2));
