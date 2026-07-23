"use strict";

const fs = require("fs");
const path = require("path");
const { parseFullTestHtml } = require("../lib/ielts-import");
const { createFullTestStore } = require("../lib/full-test-store");

const rootDir = path.resolve(__dirname, "..");
const sourcePath = process.argv[2];

if (!sourcePath) {
    throw new Error("Usage: node scripts/import-listening-mock-20143.js <html>");
}

const resolvedSource = path.resolve(sourcePath);
if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source file not found: ${resolvedSource}`);
}

const testId = "ielts-listening-mock-test-20143";
const dataDir = path.join(rootDir, "data");
const listeningTestsDir = path.join(dataDir, "listening-tests");
const readingTestsDir = path.join(dataDir, "reading-tests");
const audioDir = path.join(rootDir, "uploads", "audio");

fs.mkdirSync(listeningTestsDir, { recursive: true });
fs.mkdirSync(readingTestsDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });

const html = fs.readFileSync(resolvedSource, "utf8");
const test = parseFullTestHtml(html, {
    fileName: path.basename(resolvedSource),
    htmlPath: resolvedSource,
    testId,
    uploadsRoot: path.join(rootDir, "uploads"),
    title: "Listening test July"
});

test.skill = "listening";
test.subtitle = "Listening full test";
test.reading = { passages: [] };

const sectionAudioFiles = [
    {
        source: "E:\\Listening audio IELTSX\\Music Alive Agency.mp3",
        fileName: "listening-test-july-part-1.mp3"
    },
    {
        source: "E:\\Listening audio IELTSX\\Information for participants in the Albany fishing competition11.mp3",
        fileName: "listening-test-july-part-2.mp3"
    },
    {
        source: "E:\\Listening audio IELTSX\\Preparing for the end-of-year art exhibition.mp3",
        fileName: "listening-test-july-part-3.mp3"
    },
    {
        source: "E:\\Listening audio IELTSX\\The Mangrove Regeneration Project.mp3",
        fileName: "listening-test-july-part-4.mp3"
    }
];

sectionAudioFiles.forEach((audioFile, index) => {
    if (!fs.existsSync(audioFile.source)) {
        throw new Error(`Audio file not found: ${audioFile.source}`);
    }

    fs.copyFileSync(audioFile.source, path.join(audioDir, audioFile.fileName));
    const section = test.listening.sections.find((item) => Number(item.number) === index + 1);
    if (section) {
        section.audio = `/uploads/audio/${audioFile.fileName}`;
    }
});

test.listening.audio = "/uploads/audio/listening-test-july-part-1.mp3";

const partOneGroup = test.listening.sections.find((section) => Number(section.number) === 1)?.questionGroups?.[0];
if (partOneGroup) {
    partOneGroup.instructionText = "Complete the notes below.\nWrite ONE WORD OR A NUMBER for each answer.";
}

// The source keeps the Part 2 map inside the Questions 15-20 block. The
// generic importer sees it at section scope as well, so keep it only on the
// group that actually asks learners to label the map.
const partTwoGroups = test.listening.sections.find((section) => Number(section.number) === 2)?.questionGroups || [];
if (partTwoGroups[0]) {
    delete partTwoGroups[0].imageUrl;
    partTwoGroups[0].imageIds = [];
    partTwoGroups[0].title = "Information for participants in the Albany fishing competition";
    partTwoGroups[0].instructionText = "Choose the correct letter, A, B or C.";
}
const mapGroup = partTwoGroups[1];
if (mapGroup) {
    const mapLabels = {
        15: "Registration area",
        16: "Shore fishing area",
        17: "Boat launching area",
        18: "Judging area",
        19: "Dining area",
        20: "Prize-giving area"
    };

    mapGroup.type = "matching";
    mapGroup.title = "Albany Fishing Competition Map";
    mapGroup.instructionText = "Label the map below.\nWrite the correct letter, A-I, next to questions 15-20.";
    mapGroup.imageLayout = "stacked";
    mapGroup.optionsTitle = "Map labels";
    mapGroup.options = mapGroup.options.map((option) => ({
        ...option,
        text: ""
    }));
    mapGroup.questions = mapGroup.questions.map((question) => ({
        ...question,
        type: "matching",
        question: mapLabels[Number(question.number)] || question.question
    }));
}
test.images = test.images.filter((image) => image.section === "listening");

const partThreeGroups = test.listening.sections.find((section) => Number(section.number) === 3)?.questionGroups || [];
if (partThreeGroups[0]) {
    partThreeGroups[0].title = "Preparing for the end-of-year art exhibition";
    partThreeGroups[0].instructionText = "Choose the correct letter, A, B or C.";

    const question26 = partThreeGroups[0].questions.find((question) => Number(question.number) === 26);
    if (question26?.options?.[0]) {
        question26.options[0].label = "ranging the lighting.";
        question26.options[0].html = "ranging the lighting.";
    }
}

const exhibitionGroup = partThreeGroups[1];
if (exhibitionGroup) {
    const exhibitionNames = {
        27: "On the Water",
        28: "City Life",
        29: "Faces",
        30: "Moods"
    };
    const interestingFeatures = {
        A: "the realistic colors",
        B: "the sense of space",
        C: "the unusual interpretation of the theme",
        D: "the painting technique",
        E: "the variety of materials used",
        F: "the use of light and shade"
    };

    exhibitionGroup.type = "matching";
    exhibitionGroup.instructionText = "Which feature do the speakers identify as particularly interesting for each of the following exhibitions they saw?\nChoose FOUR answers from the box and drag the correct letter, A-F, next to questions 27-30.";
    exhibitionGroup.questionsTitle = "Exhibitions";
    exhibitionGroup.optionsTitle = "Interesting features";
    exhibitionGroup.options = Object.entries(interestingFeatures).map(([letter, text]) => ({ letter, text }));
    exhibitionGroup.questions = exhibitionGroup.questions.map((question) => ({
        ...question,
        type: "matching",
        question: exhibitionNames[Number(question.number)] || question.question
    }));
}

const partFourGroup = test.listening.sections.find((section) => Number(section.number) === 4)?.questionGroups?.[0];
if (partFourGroup) {
    partFourGroup.title = "The Mangrove Regeneration Project";
    partFourGroup.noteStyle = "mangrove-project";
    partFourGroup.instructionText = "Complete the notes below.\nWrite NO MORE THAN TWO WORDS for each answer.";
    partFourGroup.content = partFourGroup.content.filter((line, index) => (
        index !== 0 || String(line).trim() !== "The Mangrove Regeneration Project"
    ));
}

const questions = test.listening.sections.flatMap((section) =>
    (section.questionGroups || []).flatMap((group) => group.questions || [])
);
const questionNumbers = questions.map((question) => Number(question.number)).sort((a, b) => a - b);
const expectedNumbers = Array.from({ length: 40 }, (_, index) => index + 1);

if (test.listening.sections.length !== 4) {
    throw new Error(`Expected 4 Listening sections, found ${test.listening.sections.length}`);
}
if (JSON.stringify(questionNumbers) !== JSON.stringify(expectedNumbers)) {
    throw new Error(`Expected Listening questions 1-40, found: ${questionNumbers.join(", ")}`);
}
if (Object.keys(test.answers).length !== 40) {
    throw new Error(`Expected 40 answers, found ${Object.keys(test.answers).length}`);
}

const saveJson = (directory) => (item) => {
    const safeId = String(item.id).replace(/[^a-z0-9.\-_]/gi, "_");
    fs.writeFileSync(
        path.join(directory, `${safeId}.json`),
        JSON.stringify(item, null, 2),
        "utf8"
    );
};

const store = createFullTestStore({
    dataDir,
    readingTestsDir,
    listeningTestsDir,
    saveReadingTest: saveJson(readingTestsDir),
    saveListeningTest: saveJson(listeningTestsDir)
});

const result = store.publish(test);
console.log(JSON.stringify({
    id: result.test.id,
    title: result.test.title,
    status: result.test.status,
    sections: result.test.listening.sections.length,
    questions: questions.length,
    answers: Object.keys(result.test.answers).length,
    publishedListeningTests: result.published.listeningTests.map((item) => item.id)
}, null, 2));
