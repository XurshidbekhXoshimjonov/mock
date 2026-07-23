"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const annotationsSource = fs.readFileSync(path.join(__dirname, "..", "annotations.js"), "utf8");
const annotationsStyles = fs.readFileSync(path.join(__dirname, "..", "annotations.css"), "utf8");

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

test("Full-screen Reading and Listening keep annotation controls above the exam shell", () => {
    assert.match(annotationsStyles, /body\.exam-fullscreen-active > \.ieltsx-toolbar[\s\S]*?z-index:\s*100010/);
    assert.match(annotationsStyles, /body\.fullscreen-fallback > \.ieltsx-drawer[\s\S]*?z-index:\s*100021/);
    assert.match(annotationsStyles, /body\.exam-fullscreen-active > \.ieltsx-modal-overlay[\s\S]*?z-index:\s*100030/);

    for (const file of ["reading-template.html", "listening-template.html", "full-test-player.html"]) {
        const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        assert.match(html, /annotations\.css\?v=20260723-fullscreen-overlays-v1/);
    }
});
