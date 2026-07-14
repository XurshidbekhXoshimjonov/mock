"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "reading-cbt-app.js"), "utf8");

test("Practice Reading tests show the same question navigation as Full Tests", () => {
    assert.match(source, /hasStarted\s*\? h\(QuestionNavigationPanel/);
    assert.doesNotMatch(source, /hasStarted && isFullTestOrMock/);
});

test("Practice navigation displays the real passage number", () => {
    assert.match(source, /const pNumber = Number\(passage\.number\) \|\| pIdx \+ 1/);
});
