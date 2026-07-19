"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SPEAKING_SCORING_PROMPT } = require("../lib/speaking-routes");

test("Speaking scoring allows the full band range without a preferred score", () => {
    assert.match(SPEAKING_SCORING_PROMPT, /full 0–9 range is available/i);
    assert.match(SPEAKING_SCORING_PROMPT, /artificial ceiling, floor, target distribution/i);
    assert.match(SPEAKING_SCORING_PROMPT, /Do not be lenient or harsh by default/i);
});

test("Speaking scoring does not turn response length into an automatic penalty", () => {
    assert.match(SPEAKING_SCORING_PROMPT, /brief answer is not automatically weak/i);
    assert.match(SPEAKING_SCORING_PROMPT, /concise but relevant response/i);
});

test("transcript-only Speaking scoring cannot invent pronunciation problems", () => {
    assert.match(SPEAKING_SCORING_PROMPT, /Never invent pronunciation or delivery problems/i);
    assert.match(SPEAKING_SCORING_PROMPT, /explicitly mention the evidence limitation/i);
    assert.match(SPEAKING_SCORING_PROMPT, /Do not penalise accent/i);
});

test("full Speaking evaluation reuses per-answer uploads instead of exceeding the file limit", () => {
    const player = fs.readFileSync(path.join(__dirname, "..", "speaking.js"), "utf8");
    const routes = fs.readFileSync(path.join(__dirname, "..", "lib", "speaking-routes.js"), "utf8");

    assert.match(player, /if \(response\.audioUrl\) answer\.audioUrl = response\.audioUrl/);
    assert.match(player, /const recordsToUpload = mode === "full_test"\s*\?\s*\[\]/);
    assert.match(routes, /audioUrl: file \? publicAudioPath\(file\) : existingSpeakingAudioPath\(basePart\.audioUrl\)/);
    assert.match(routes, /const audioFiles = transcribedParts\.map\(\(part\) => part\.audioUrl\)\.filter\(Boolean\)/);
});
