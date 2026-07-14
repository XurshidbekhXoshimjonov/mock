"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
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
