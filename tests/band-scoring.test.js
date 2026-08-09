"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isAnswerCorrect } = require("../lib/ielts-import/bandScoring");

test("numeric answers accept equivalent spacing", () => {
    assert.equal(isAnswerCorrect("040 4229160", "040 4229160"), true);
    assert.equal(isAnswerCorrect("0404229160", "040 4229160"), true);
    assert.equal(isAnswerCorrect("040 4229160", "0404229160"), true);
});

test("spacing remains significant for word answers", () => {
    assert.equal(isAnswerCorrect("icecream", "ice cream"), false);
});
