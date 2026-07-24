"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const testData = JSON.parse(fs.readFileSync(
    path.join(root, "data", "reading-tests", "1784036458214-when-people-are-deaf-to-music.json"),
    "utf8"
));

test("Reading questions 36-40 render as matching sentence endings", () => {
    const group = testData.questionGroups.find((item) => item.questionRange?.[0] === 36);

    assert.equal(group.type, "matching_sentence_endings");
    assert.deepEqual(group.questions.map((question) => question.number), [36, 37, 38, 39, 40]);
    assert.deepEqual(group.options.map((option) => option.value), ["A", "B", "C", "D", "E", "F", "G", "H"]);
    assert.ok(group.options.every((option) => option.label.length > 3));
    assert.ok(group.options.every((option) => option.label.startsWith(`${option.value}. `)));
    assert.deepEqual(group.questions.map((question) => question.answer), ["E", "C", "D", "G", "B"]);
});

test("Matching questions prefer descriptive group endings over letter-only choices", () => {
    const source = fs.readFileSync(path.join(root, "ielts-test-components.js"), "utf8");
    assert.match(source, /const source = groupOptions\.length \? groupOptions : optionList\(question\.options\)/);
});

test("Matching groups can place their reference options after the questions", () => {
    const source = fs.readFileSync(path.join(root, "ielts-test-components.js"), "utf8");
    assert.match(source, /!group\.optionsAfterQuestions \? renderGroupOptions\(\) : null/);
    assert.match(source, /group\.optionsAfterQuestions \? renderGroupOptions\(\) : null/);
});

test("Rich Reading passages inherit normalized top-level question groups", () => {
    const source = fs.readFileSync(path.join(root, "reading-cbt-app.js"), "utf8");
    assert.match(source, /questionGroupsFromSource\(richPassage, \[\], \[\]\)/);
});

test("Reading renderer accepts semicolon-delimited imported options", () => {
    const source = fs.readFileSync(path.join(root, "ielts-test-components.js"), "utf8");
    assert.match(source, /options\.split\(\/\\s\*;\\s\*\/\)/);
    assert.match(source, /optionList\(question\.options\)/);
});
