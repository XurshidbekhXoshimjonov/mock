"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    shiftImportedTestTitles,
    importedTestTitle
} = require("../lib/full-test-routes");
const { extractMetadataFromFileName } = require("../lib/ielts-import/htmlParser");

test("generic Reading upload filenames expose their test number", () => {
    assert.equal(
        extractMetadataFromFileName("academic_reading_test_1.html").testNumber,
        1
    );
});

test("every automatic Reading import starts as Test 1", () => {
    const title = importedTestTitle({
        parsedTest: { metadata: { testNumber: 3 } }
    });

    assert.equal(title, "Test 1");
});

test("older automatic titles shift up separately for the imported skill", () => {
    const saved = [];
    const refreshed = [];
    const tests = [
        { skill: "reading", title: "Test 1" },
        { skill: "reading", title: "Test 2", status: "published" },
        { skill: "listening", title: "Test 2" },
        { skill: "reading", title: "Reading Practice Test 8" }
    ];
    const store = {
        readAll: () => tests,
        save: (item) => saved.push(item.title),
        refreshPublishedArtifacts: (item) => refreshed.push(item.title)
    };

    shiftImportedTestTitles(store, "reading");

    assert.deepEqual(saved, ["Test 3", "Test 2"]);
    assert.deepEqual(refreshed, ["Test 3", "Test 2"]);
    assert.equal(tests[2].title, "Test 2");
    assert.equal(tests[3].title, "Reading Practice Test 8");
});

test("an explicitly entered import title remains unchanged", () => {
    assert.equal(importedTestTitle({
        requestedTitle: "Cambridge 21 Test 2",
        parsedTest: { metadata: { testNumber: 1 } },
        existingTests: [],
        skill: "reading"
    }), "Cambridge 21 Test 2");
});

test("Reading builder requests parse-only import before its final save", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(path.join(__dirname, "..", "admin-reading.js"), "utf8");

    assert.match(source, /formData\.append\("parseOnly", "1"\)/);
    assert.match(source, /autoNumberNewest:\s*importedReadingAutoNumber/);
});
