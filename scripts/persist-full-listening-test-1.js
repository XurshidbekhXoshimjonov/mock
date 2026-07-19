"use strict";

const fs = require("fs");
const path = require("path");
const { parseFullTestHtml } = require("../lib/ielts-import");
const { createFullTestStore } = require("../lib/full-test-store");

const rootDir = path.resolve(__dirname, "..");
const sourcePath = process.argv[2];
const audioPath = process.argv[3];

if (!sourcePath || !audioPath) {
    throw new Error("Usage: node scripts/persist-full-listening-test-1.js <html> <audio>");
}

const testId = "full-listening-test-1";
const dataDir = path.join(rootDir, "data");
const listeningTestsDir = path.join(dataDir, "listening-tests");
const readingTestsDir = path.join(dataDir, "reading-tests");
const audioDir = path.join(rootDir, "uploads", "audio");
const bundledAudioName = `${testId}.mp3`;
const bundledAudioPath = path.join(audioDir, bundledAudioName);

fs.mkdirSync(listeningTestsDir, { recursive: true });
fs.mkdirSync(readingTestsDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });
fs.copyFileSync(path.resolve(audioPath), bundledAudioPath);

const html = fs.readFileSync(path.resolve(sourcePath), "utf8");
const test = parseFullTestHtml(html, {
    fileName: path.basename(sourcePath),
    testId,
    uploadsRoot: path.join(rootDir, "uploads"),
    title: "Test 15"
});

test.skill = "listening";
test.subtitle = "Listening full test";
test.reading = { passages: [] };
test.listening.audio = `/uploads/audio/${bundledAudioName}`;

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

store.publish(test);

const questionCount = test.listening.sections
    .flatMap((section) => section.questionGroups || [])
    .flatMap((group) => group.questions || [])
    .length;

if (questionCount !== 40) {
    throw new Error(`Expected 40 Listening questions, found ${questionCount}`);
}

console.log(`Persisted ${test.title}: ${questionCount} questions`);
