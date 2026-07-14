"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const annotationsSource = fs.readFileSync(path.join(__dirname, "..", "annotations.js"), "utf8");

test("Reading and Listening highlights are discarded when annotations load", () => {
    assert.match(annotationsSource, /currentConfig\.skill === 'reading' \|\| currentConfig\.skill === 'listening'/);
    assert.match(annotationsSource, /annotationsData\.highlights = \[\]/);
});

test("Reading and Listening persist notes but never persist highlights", () => {
    assert.match(annotationsSource, /\{ highlights: \[\], notes: annotationsData\.notes \}/);
    assert.match(annotationsSource, /const storedData = currentConfig\.skill/);
});

test("Reading surfaces use the cache-busted transient highlight script", () => {
    for (const file of ["reading-template.html", "listening-template.html", "full-test-player.html"]) {
        const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        assert.match(html, /annotations\.js\?v=20260714-transient-reading-highlight-v1/);
    }
});
