"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "reading-cbt-app.js"), "utf8");
const dynamicTestsSource = fs.readFileSync(path.join(root, "dynamic-tests.js"), "utf8");
const fullTestHtml = fs.readFileSync(path.join(root, "fulltest.html"), "utf8");
const listeningFullTestHtml = fs.readFileSync(path.join(root, "listeningfulltest.html"), "utf8");

test("Practice Reading tests show the same question navigation as Full Tests", () => {
    assert.match(source, /hasStarted\s*\? h\(QuestionNavigationPanel/);
    assert.doesNotMatch(source, /hasStarted && isFullTestOrMock/);
});

test("Practice navigation displays the real passage number", () => {
    assert.match(source, /const pNumber = Number\(passage\.number\) \|\| pIdx \+ 1/);
});

test("Full skill pages put published full tests before legacy manual tests", () => {
    assert.match(dynamicTestsSource, /if \(config\.part === "full"\)/);
    assert.match(dynamicTestsSource, /while \(storedFullTestCards\.firstChild\)[\s\S]*grid\.appendChild\(storedFullTestCards\.firstChild\)[\s\S]*await loadManualTests/);
    assert.match(fullTestHtml, /dynamic-tests\.js\?v=20260718-latest-full-test-first-v2/);
    assert.match(listeningFullTestHtml, /dynamic-tests\.js\?v=20260718-latest-full-test-first-v2/);
});
