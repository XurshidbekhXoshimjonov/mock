const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Listening builder captures group and question evidence with transcript metadata", () => {
    const admin = read("admin-listening.js");
    assert.match(admin, /data-evidence-action="group-start"/);
    assert.match(admin, /data-evidence-action="question-start"/);
    assert.match(admin, /data-part-field="transcriptText"/);
    assert.match(admin, /evidence cannot exceed the audio duration/);
});

test("Listening scoring snapshots exact evidence fields", () => {
    const server = read("server.js");
    const model = read("models/ReviewMistake.js");
    [
        "partNumber",
        "questionGroupId",
        "instructions",
        "imageUrl",
        "transcriptText",
        "evidenceStartTime",
        "evidenceEndTime",
        "audioUrl"
    ].forEach((field) => {
        assert.match(server, new RegExp(field));
        assert.match(model, new RegExp(field));
    });
});

test("Review page uses one shared bounded audio player and listening-specific retry", () => {
    const review = read("review-mistakes.js");
    assert.equal((review.match(/new Audio\(\)/g) || []).length, 1);
    assert.match(review, /sharedAudio\.currentTime >= evidenceEnd/);
    assert.match(review, /data-audio-action="replay"/);
    assert.match(review, /data-audio-action="speed"/);
    assert.match(review, /data-audio-seek/);
    assert.match(review, /multiple\.\?select\|checkbox/);
    assert.match(review, /data-transcript-evidence hidden/);
    assert.match(review, /retry-inline-answer/);
});

test("Listening results deep-link only the current listening attempt", () => {
    const template = read("listening-template.js");
    const styles = read("listening-template.css");
    assert.match(template, /new URLSearchParams\(\{ skill: "listening" \}\)/);
    assert.match(template, /Review Listening Mistakes/);
    assert.match(template, /ieltsx:mistakes-changed/);
    assert.match(styles, /\.lc-result-actions > \.hidden\s*\{\s*display: none;/);
    assert.match(styles, /\[data-listening-review-mistakes\][^{]*\{[^}]*flex-basis: 210px;/s);
});

test("Reading matching headings keep heading labels in cards and retry selects", () => {
    const review = read("review-mistakes.js");
    assert.match(review, /matching\.\?headings/);
    assert.match(review, /answerTextForItem/);
    assert.match(review, /MATCHING HEADING EVIDENCE/);
    assert.match(review, /matching\|map\|plan\|diagram/);
});

test("Review Mistakes controls expose keyboard and pressed states", () => {
    const page = read("review-mistakes.html");
    const review = read("review-mistakes.js");
    const styles = read("review-mistakes.css");

    assert.match(page, /data-filter="all" aria-pressed="true"/);
    assert.match(page, /data-filter="listening" aria-pressed="false"/);
    assert.match(review, /setAttribute\("aria-pressed", String\(isActive\)\)/);
    assert.match(review, /function trapModalFocus/);
    assert.match(review, /event\.key === "Escape"/);
    assert.match(review, /lastFocusedBeforeModal/);
    assert.match(styles, /:focus-visible/);
});
