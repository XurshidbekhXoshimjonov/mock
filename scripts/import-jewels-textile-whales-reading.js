const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { buildPublishedTests } = require("../lib/ielts-import/publish");

const sourcePaths = process.argv.slice(2);
if (sourcePaths.length !== 3 || sourcePaths.some((sourcePath) => !fs.existsSync(sourcePath))) {
    console.error("Usage: node scripts/import-jewels-textile-whales-reading.js <passage-1.html> <passage-2.html> <passage-3.html>");
    process.exit(1);
}

const sources = sourcePaths.map((sourcePath) => ({
    sourcePath,
    html: fs.readFileSync(sourcePath, "utf8")
}));
const pages = sources.map(({ html }) => cheerio.load(html));

const id = "jewels-golden-textile-whale-culture-20260806";
const title = "August 06";
const createdAt = new Date().toISOString();

function option(value, label) {
    return { value, label: label || value };
}

function question(number, type, prompt, answer, options = []) {
    return {
        number,
        type,
        question: prompt,
        stemHtml: prompt,
        options,
        answer
    };
}

function group({ suffix, type, start, end, instructionText, instructionBodyHtml = "", rule = "", options = [], questions, contentHtml = "", question: prompt = "", hideOptionsList = false }) {
    return {
        id: `${id}-${suffix}`,
        type,
        instructionTitle: `Questions ${start}\u2013${end}`,
        instructionText,
        instructionHtml: {
            titleHtml: `<h3>Questions ${start}\u2013${end}</h3>`,
            bodyHtml: instructionBodyHtml || `<p>${instructionText}</p>`,
            rulesHtml: rule ? `<p>${rule}</p>` : ""
        },
        rule,
        options,
        hideOptionsList,
        contentHtml,
        question: prompt,
        questionNumbers: questions.map((item) => item.number),
        questions,
        questionRange: [start, end]
    };
}

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function passageOne() {
    const $ = pages[0];
    const paragraphs = $("#passage > p").toArray()
        .filter((element) => !$(element).find("em").length)
        .map((element) => ({
            letter: null,
            html: $(element).html(),
            text: cleanText($(element).text())
        }));

    const choiceOptions = ["TRUE", "FALSE", "NOT GIVEN"].map((value) => option(value));
    const firstQuestions = [
        question(1, "true_false_not_given", "After European settlement, Tasmanian Aboriginals stopped making necklaces for a short time.", "FALSE", choiceOptions),
        question(2, "true_false_not_given", "Aboriginal women on the Furneaux Islands made the most beautiful necklaces.", "NOT GIVEN", choiceOptions),
        question(3, "true_false_not_given", "An 1866 photograph of the leader Truganini shows her wearing a necklace she had made herself.", "NOT GIVEN", choiceOptions),
        question(4, "true_false_not_given", "Men assist in gathering shells growing on sea plants.", "TRUE", choiceOptions),
        question(5, "true_false_not_given", "Tasmanian Aboriginal men wore long necklaces when hunting.", "FALSE", choiceOptions),
        question(6, "true_false_not_given", "Tasmanian Aboriginal necklaces are appreciated outside Australia.", "TRUE", choiceOptions)
    ];
    const noteData = [
        [7, "The traditional procedure: hole put in shell with an instrument made of animal's bone and ______.", "tooth"],
        [8, "Shells wiped with ______ to achieve a pearly surface.", "grass"],
        [9, "Animal ______ applied.", "oil"],
        [10, "Changes after Europeans arrived: cleaning substances like ______ were used.", "vinegar"],
        [11, "Furneaux Islands: shells need to be gathered in the right ______.", "season"],
        [12, "Shell collectors walk along the beach then ______ in order to pick up shells.", "crawl"],
        [13, "Shells from beach not suitable as they do not keep their ______ and break easily.", "colour"]
    ];
    const noteQuestions = noteData.map(([number, prompt, answer]) => question(number, "notes_completion", prompt, answer));
    const notesHtml = noteQuestions.map((item) => `<p>${item.question.replace("______", `<span class="ielts-blank" data-blank="${item.number}"></span>`)}</p>`).join("\n");
    const groups = [
        group({
            suffix: "p1-g1",
            type: "true_false_not_given",
            start: 1,
            end: 6,
            instructionText: "Do the following statements agree with the information given in Reading Passage 1?",
            options: choiceOptions,
            questions: firstQuestions
        }),
        group({
            suffix: "p1-g2",
            type: "notes_completion",
            start: 7,
            end: 13,
            instructionText: "Complete the notes below.",
            rule: "Choose ONE WORD ONLY from the passage for each answer.",
            questions: noteQuestions,
            contentHtml: notesHtml
        })
    ];

    return makePassage(1, "Jewels from the sea", "Indigenous necklaces in Tasmania", paragraphs, groups);
}

function passageTwo() {
    const $ = pages[1];
    const paragraphs = $("#passageCard .para-block").toArray().map((element) => {
        const paragraph = $(element);
        const textNode = paragraph.find("p").last();
        return {
            letter: cleanText(paragraph.find(".para-label").first().text()),
            html: textNode.html(),
            text: cleanText(textNode.text())
        };
    });
    const headingEntries = [
        ["i", "Experimenting with an old idea"],
        ["ii", "Life cycle of Madagascar spiders"],
        ["iii", "Advances in the textile industry"],
        ["iv", "Resources needed to meet the project's demands"],
        ["v", "The physical properties of spider silk"],
        ["vi", "A scientific analysis of spider silk"],
        ["vii", "A unique work of art"],
        ["viii", "Importance of the silk textile market"],
        ["ix", "Difficulties of raising spiders in captivity"]
    ];
    const headingOptions = headingEntries.map(([value, label]) => option(value, `${value}. ${label}`));
    const headingAnswers = ["vii", "v", "ix", "i", "iv", "vi"];
    const headingQuestions = headingAnswers.map((answer, index) => question(
        14 + index,
        "matching_headings",
        `Paragraph ${String.fromCharCode(65 + index)}`,
        answer,
        headingOptions
    ));

    const researcherOptions = [
        option("A", "A. Simon Peers"),
        option("B", "B. Nicholas Godley"),
        option("C", "C. Todd Blackledge")
    ];
    const researcherAnswers = { 20: "B", 21: "A", 22: "C", 23: "A" };
    const researcherQuestions = Object.entries(researcherAnswers).map(([number, answer]) => {
        const prompt = cleanText($(`#anchor-${number} .qhead`).text()).replace(/^\d+\.\s*/, "");
        return question(Number(number), "matching_features", prompt, answer, researcherOptions);
    });

    const summaryQuestions = [
        question(24, "summary_completion", "Some researchers have tried to grow silk by introducing genetic material into ______ and some animals.", "bacteria"),
        question(25, "summary_completion", "The liquid protein used to make spider silk is made in a ______ inside the spider's body.", "gland"),
        question(26, "summary_completion", "Spinning causes a ______ that turns the liquid protein into solid silk.", "transformation")
    ];
    const summaryHtml = [
        "<h4>Producing spider silk in the lab</h4>",
        `<p>Both scientists and manufacturers are interested in producing silk for many different purposes. Some researchers have tried to grow silk by introducing genetic material into <span class="ielts-blank" data-blank="24"></span> and some animals. But these experiments have been somewhat disappointing.</p>`,
        `<p>It is difficult to make spider silk in a lab setting because the silk comes from a liquid protein made in a <span class="ielts-blank" data-blank="25"></span> inside the spider's body. When a spider spins silk, it causes a <span class="ielts-blank" data-blank="26"></span> that turns this liquid into solid silk. Scientists cannot replicate this yet.</p>`
    ].join("\n");
    const groups = [
        group({
            suffix: "p2-g1",
            type: "matching_headings",
            start: 14,
            end: 19,
            instructionText: "Choose the correct heading for each paragraph from the list of headings below.",
            options: headingOptions,
            questions: headingQuestions
        }),
        group({
            suffix: "p2-g2",
            type: "matching_features",
            start: 20,
            end: 23,
            instructionText: "Match each statement with the correct researcher, A, B or C.",
            rule: "You may use any letter more than once.",
            options: researcherOptions,
            questions: researcherQuestions
        }),
        group({
            suffix: "p2-g3",
            type: "summary_completion",
            start: 24,
            end: 26,
            instructionText: "Complete the summary below.",
            rule: "Choose ONE WORD ONLY from the passage for each answer.",
            questions: summaryQuestions,
            contentHtml: summaryHtml
        })
    ];

    return makePassage(2, "A Unique Golden Textile", "A two-man project to use spider silk is achieved after 4 years", paragraphs, groups);
}

function passageThree() {
    const $ = pages[2];
    const paragraphs = $(".passage-container > p").toArray()
        .filter((element) => /^[A-H]\s/.test(cleanText($(element).text())))
        .map((element) => {
            const item = $(element);
            const letter = cleanText(item.find("strong").first().text());
            return { letter, html: item.html(), text: cleanText(item.text()) };
        });
    const ynngOptions = ["YES", "NO", "NOT GIVEN"].map((value) => option(value));
    const ynngAnswers = { 27: "YES", 28: "NO", 29: "YES", 30: "NO", 31: "NOT GIVEN" };
    const ynngQuestions = Object.entries(ynngAnswers).map(([number, answer]) => {
        const prompt = cleanText($(`#q${number}`).closest(".question").find("p").first().text()).replace(/^\d+\s*/, "");
        return question(Number(number), "yes_no_not_given", prompt, answer, ynngOptions);
    });
    const summaryQuestions = [
        question(32, "summary_completion", "Resident killer whales live in fixed family groups, known as ______.", "pods"),
        question(33, "summary_completion", "Differences in dialect could not have emerged as a result of the whales' ______.", "physical environment"),
        question(34, "summary_completion", "A calf communicates exclusively with the dialect of the group to which its ______ belongs.", "mother")
    ];
    const summaryHtml = [
        `<p>It has been observed that resident killer whales invariably live in fixed family groups, known as <span class="ielts-blank" data-blank="32"></span>. Each of these has its own unique set of calls, despite close contact with other family groups. As the same areas of ocean contain many different groups with widely varying dialects, it is clear that these differences could not have emerged as a result of the whales' <span class="ielts-blank" data-blank="33"></span>.</p>`,
        `<p>According to tests conducted by Lance Barrett-Lennard, a calf communicates exclusively with the dialect of the group to which its <span class="ielts-blank" data-blank="34"></span> belongs. Barrett-Lennard also rejects the idea that the call patterns are inherited.</p>`
    ].join("\n");
    const featureOptions = [
        option("A", "intelligence"),
        option("B", "physical strength"),
        option("C", "sensitivity to sound"),
        option("D", "prolonged life span"),
        option("E", "lengthy period of fertility"),
        option("F", "adaptability to a variety of foods")
    ];
    const featurePrompt = "Which THREE of the following features of whales are mentioned in the passage?";
    const featureQuestions = [
        question(35, "multi_select", "", "A", featureOptions),
        question(36, "multi_select", "", "C", featureOptions),
        question(37, "multi_select", "", "D", featureOptions)
    ];
    const paragraphOptions = "ABCDEFGH".split("").map((value) => option(value, `Paragraph ${value}`));
    const paragraphAnswers = { 38: "G", 39: "D", 40: "F" };
    const paragraphQuestions = Object.entries(paragraphAnswers).map(([number, answer]) => {
        const prompt = cleanText($(`#q${number}`).closest(".question").find("p").first().text()).replace(/^\d+\s*/, "");
        return question(Number(number), "matching_information", prompt, answer, paragraphOptions);
    });
    const groups = [
        group({
            suffix: "p3-g1",
            type: "yes_no_not_given",
            start: 27,
            end: 31,
            instructionText: "Do the following statements agree with the views of the writer in Reading Passage 3?",
            options: ynngOptions,
            questions: ynngQuestions
        }),
        group({
            suffix: "p3-g2",
            type: "summary_completion",
            start: 32,
            end: 34,
            instructionText: "Complete the summary below.",
            rule: "Choose NO MORE THAN TWO WORDS from the passage for each answer.",
            questions: summaryQuestions,
            contentHtml: summaryHtml
        }),
        group({
            suffix: "p3-g3",
            type: "multi_select",
            start: 35,
            end: 37,
            instructionText: featurePrompt,
            instructionBodyHtml: '<p>Which <strong style="color:#dc2626">THREE</strong> of the following features of whales are mentioned in the passage?</p>',
            options: featureOptions,
            questions: featureQuestions
        }),
        group({
            suffix: "p3-g4",
            type: "matching_information",
            start: 38,
            end: 40,
            instructionText: "Reading Passage 3 has eight paragraphs, A\u2013H. Which paragraph contains the following information?",
            options: paragraphOptions,
            questions: paragraphQuestions,
            hideOptionsList: true
        })
    ];

    return makePassage(3, "Whale Culture", "", paragraphs, groups);
}

function makePassage(number, passageTitle, subtitle, paragraphs, questionGroups) {
    const passageText = paragraphs.map((paragraph) => paragraph.text).join("\n\n");
    const passageHtml = paragraphs.map((paragraph) => `<p>${paragraph.html}</p>`).join("\n");
    return {
        id: `${id}-passage-${number}`,
        number,
        title: passageTitle,
        subtitle,
        displayLabel: `Reading Passage ${number}`,
        passageLabel: `READING PASSAGE ${number}`,
        passageText,
        passageHtml,
        paragraphs,
        questionGroups,
        questions: questionGroups.flatMap((item) => item.questions)
    };
}

const passages = [passageOne(), passageTwo(), passageThree()];
const allQuestions = passages.flatMap((passage) => passage.questions).sort((a, b) => a.number - b.number);
const answers = Object.fromEntries(allQuestions.map((item) => [String(item.number), item.answer]));
const expectedNumbers = Array.from({ length: 40 }, (_, index) => index + 1);
if (passages.length !== 3 || allQuestions.length !== 40 || expectedNumbers.some((number, index) => allQuestions[index]?.number !== number)) {
    throw new Error(`Invalid import: ${passages.length} passages and ${allQuestions.length} questions`);
}
if (passages.some((passage) => !passage.paragraphs.length) || Object.keys(answers).length !== 40) {
    throw new Error("Invalid import: passage text or answer key is incomplete");
}

const fullTest = {
    id,
    title,
    skill: "reading",
    sourceFile: sourcePaths.map((sourcePath) => path.basename(sourcePath)).join(", "),
    sourceFiles: sourcePaths.map((sourcePath) => path.basename(sourcePath)),
    status: "published",
    layout: "custom-full-reading",
    metadata: { label: title },
    reading: { passages },
    listening: { audio: "", transcript: "", sections: [] },
    answers,
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
sources.forEach(({ sourcePath }, index) => {
    fs.copyFileSync(sourcePath, path.join(sourceDir, `passage-${index + 1}-${path.basename(sourcePath)}`));
});

console.log(JSON.stringify({
    id,
    title,
    passageCount: passages.length,
    paragraphCounts: passages.map((passage) => passage.paragraphs.length),
    questionCount: allQuestions.length,
    answerCount: Object.keys(answers).length,
    publishedReadingTests: published.readingTests.map((test) => test.id),
    openUrl: fullTest.openUrl
}, null, 2));
