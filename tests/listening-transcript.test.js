"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizeTranscriptSegments,
    transcriptEvidence
} = require("../lib/listening-transcript");

test("normalizes timestamped transcript segments with stable unique ids", () => {
    assert.deepEqual(normalizeTranscriptSegments([
        { id: "segment-1", start: 194.234, end: 199.556, text: " It grazes on plants. " },
        { id: "segment-1", start: -1, end: 3, text: "Next sentence." }
    ]), [
        { id: "segment-1", start: 194.23, end: 199.56, text: "It grazes on plants." },
        { id: "segment-1-2", start: 0, end: 3, text: "Next sentence." }
    ]);
});

test("links evidence by exact segment ids instead of searching answer text", () => {
    const evidence = transcriptEvidence([
        { id: "first", start: 10, end: 12, text: "Plants appear in an unrelated introduction." },
        { id: "answer", start: 194.2, end: 199.5, text: "It grazes on plants." }
    ], ["answer"]);
    assert.deepEqual(evidence, {
        transcriptSegmentIds: ["answer"],
        relevantText: "It grazes on plants.",
        transcriptStartTime: 194.2,
        transcriptEndTime: 199.5
    });
});

test("manual evidence overrides remain supported", () => {
    const evidence = transcriptEvidence([
        { id: "answer", start: 194.2, end: 199.5, text: "It grazes on plants." }
    ], ["answer"], {
        relevantText: "Manually corrected evidence.",
        transcriptStartTime: 195,
        transcriptEndTime: 198
    });
    assert.equal(evidence.relevantText, "Manually corrected evidence.");
    assert.equal(evidence.transcriptStartTime, 195);
    assert.equal(evidence.transcriptEndTime, 198);
});

test("automatically links generated segments by timestamp without answer searching", () => {
    const evidence = transcriptEvidence([
        { id: "intro", start: 10, end: 15, text: "Introduction." },
        { id: "evidence", start: 194.2, end: 199.5, text: "It grazes on plants." }
    ], [], { transcriptStartTime: 194, transcriptEndTime: 199 });
    assert.deepEqual(evidence.transcriptSegmentIds, ["evidence"]);
    assert.equal(evidence.relevantText, "It grazes on plants.");
});

test("automatically links generated segments by relevant transcript text", () => {
    const evidence = transcriptEvidence([
        { id: "first", start: 10, end: 15, text: "The market was elsewhere." },
        { id: "answer", start: 20, end: 25, text: "Asia was an important market for red sea urchins." }
    ], [], { relevantText: "Asia was an important market for red sea urchins." });
    assert.deepEqual(evidence.transcriptSegmentIds, ["answer"]);
});
