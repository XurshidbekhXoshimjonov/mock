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
    assert.match(admin, /data-evidence-key="correctAnswer"/);
    assert.match(admin, /data-evidence-key="acceptedAnswers"/);
    assert.match(admin, /data-evidence-key="relevantText"/);
    assert.match(admin, /data-evidence-key="explanation"/);
    assert.match(admin, /data-evidence-key="transcriptStartTime"/);
    assert.match(admin, /Generate Transcript/);
    assert.match(admin, /transcriptFileInput/);
    assert.match(admin, /data-question-transcript-segment/);
    assert.match(admin, /split-segment/);
    assert.match(admin, /merge-segment/);
    assert.match(admin, /data-evidence-key="transcriptEndTime"/);
});

test("Listening review uses reusable split-screen transcript and explanation components", () => {
    const template = read("listening-template.js");
    const styles = read("listening-template.css");
    [
        "ListeningReviewQuestion",
        "QuestionExplanationModal",
        "TranscriptPanel",
        "ReviewAudioPlayer"
    ].forEach((component) => assert.match(template, new RegExp(`function ${component}\\(`)));
    assert.match(template, /data-explain-question/);
    assert.match(template, /data-review-audio-action="back"/);
    assert.match(template, /data-review-audio-action="forward"/);
    assert.match(template, /data-review-audio-seek/);
    assert.match(template, /data-review-audio-speed/);
    assert.match(template, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
    assert.match(template, /hasExplanation/);
    assert.match(template, /transcriptStartTime/);
    assert.match(template, /transcriptSegmentIds/);
    assert.match(template, /transcriptEndTime/);
    assert.match(template, /function QuestionsReviewPanel\(/);
    assert.match(template, /data-inline-questions-review-slot/);
    assert.match(template, /lc-inline-review-correct/);
    assert.match(template, /sourceContent\.cloneNode\(true\)/);
    assert.match(template, /function isListeningPracticeTest\(/);
    assert.match(template, /function renderFullListeningReview\(/);
    assert.match(template, /if \(!isListeningPracticeTest\(activeListeningTest\)\)/);
    assert.doesNotMatch(template, /data-review-question-focus/);
    assert.match(template, /lc-inline-review-explain[\s\S]*<svg/);
    assert.match(template, /matchAll\(\/Q\(\\d\{1,2\}\)/);
    assert.match(styles, /\.lc-inline-review-result/);
    assert.match(styles, /\.lc-review-workspace\s*\{[\s\S]*grid-template-columns:/);
    assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.lc-review-workspace/);
    const redSea = JSON.parse(read("data/listening-tests/red-sea-urchin-part-4.json"));
    assert.deepEqual(Object.keys(redSea.parts[0].blocks[0].questionEvidence).map(Number), [31, 32, 33, 34, 35, 36, 37, 38, 39, 40]);
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
        "relevantText",
        "explanation",
        "transcriptStartTime",
        "transcriptEndTime",
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
    const fullPlayer = read("reading-cbt-app.js");
    const styles = read("listening-template.css");
    assert.match(template, /new URLSearchParams\(\{ skill: "listening" \}\)/);
    assert.match(template, /Review Listening Mistakes/);
    assert.match(template, /ieltsx:mistakes-changed/);
    assert.match(fullPlayer, /function showFullListeningResult[\s\S]*new URLSearchParams\(\{ skill: "listening" \}\)/);
    assert.match(fullPlayer, /showFullListeningResult[\s\S]*attemptId: result\.attemptId/);
    assert.match(fullPlayer, /showFullListeningResult[\s\S]*ieltsx:mistakes-changed/);
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
