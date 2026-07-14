"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(file) {
    return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("Full Writing builder shows direct Task 1 and Task 2 content fields", () => {
    const html = source("admin-writing.html");
    const js = source("admin-writing.js");
    assert.match(html, /id="task1PromptText"/);
    assert.match(html, /id="task2PromptText"/);
    assert.doesNotMatch(html, /id="fullTask1Select"/);
    assert.doesNotMatch(html, /id="fullTask2Select"/);
    assert.match(js, /type !== "task1" && type !== "full"/);
    assert.match(js, /type !== "task2" && type !== "full"/);
});

test("Full Writing save sends two inline prompts instead of selected IDs", () => {
    const js = source("admin-writing.js");
    assert.match(js, /async function saveFullTest/);
    assert.match(js, /task1:\s*\{/);
    assert.match(js, /task2:\s*\{/);
    assert.match(js, /if \(typeof ref === "object"\) return ref/);
    assert.doesNotMatch(js, /fullTask1Select/);
    assert.doesNotMatch(js, /fullTask2Select/);
});

test("inline Full Test prompts remain private to their parent test", () => {
    const routes = source("lib/writing-routes.js");
    const model = source("models/WritingPrompt.js");
    assert.match(model, /fullTestOnly:/);
    assert.match(routes, /fullTestOnly:\s*true/);
    assert.match(routes, /fullTestOnly:\s*\{\s*\$ne:\s*true\s*\}/);
    assert.match(routes, /WritingPrompt\.deleteMany/);
});
