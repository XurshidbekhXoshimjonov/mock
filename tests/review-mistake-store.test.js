const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createReviewMistakeStore } = require("../lib/review-mistake-store");

const storeSource = fs.readFileSync(path.join(__dirname, "..", "lib", "review-mistake-store.js"), "utf8");

function fixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ieltsx-mistakes-"));
    const store = createReviewMistakeStore({
        filePath: path.join(directory, "mistakes.json")
    });
    return {
        store,
        cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
    };
}

function snapshot(overrides = {}) {
    return {
        skill: "reading",
        testId: "reading-1",
        testTitle: "Reading Test 1",
        questionId: "q7",
        questionNumber: 7,
        questionType: "sentence_completion",
        questionText: "Complete the sentence.",
        userAnswer: "weather",
        correctAnswer: "climate",
        context: "A stable snapshot of the passage.",
        ...overrides
    };
}

test("mistakes are deduplicated within one attempt and scoped by user", async (t) => {
    const { store, cleanup } = fixture();
    t.after(cleanup);

    await store.upsertMany("user-a", "attempt-1", [snapshot(), snapshot()]);
    await store.upsertMany("user-a", "attempt-1", [snapshot()]);
    await store.upsertMany("user-b", "attempt-1", [snapshot()]);

    assert.equal((await store.list("user-a")).length, 1);
    assert.equal((await store.list("user-b")).length, 1);
    assert.equal((await store.summary("user-a")).unresolved, 1);
});

test("same question id from Reading and Listening is preserved in one full mock attempt", async (t) => {
    const { store, cleanup } = fixture();
    t.after(cleanup);

    await store.upsertMany("user-a", "mock-attempt-1", [
        snapshot({ skill: "listening", questionId: "q1", questionNumber: 1, correctAnswer: "station" }),
        snapshot({ skill: "reading", questionId: "q1", questionNumber: 1, correctAnswer: "climate" }),
        snapshot({ skill: "reading", questionId: "q1", questionNumber: 1, correctAnswer: "climate" })
    ]);

    const items = await store.list("user-a", { attemptId: "mock-attempt-1" });
    assert.equal(items.length, 2);
    assert.deepEqual(new Set(items.map((item) => item.skill)), new Set(["listening", "reading"]));
});

test("server-side retry transitions new to learning to mastered", async (t) => {
    const { store, cleanup } = fixture();
    t.after(cleanup);

    const [created] = await store.upsertMany("user-a", "attempt-1", [snapshot()]);
    const wrong = await store.retry("user-a", created.id, "weather");
    assert.equal(wrong.retryCorrect, false);
    assert.equal(wrong.status, "new");
    assert.equal(wrong.reviewCount, 1);

    const learning = await store.retry("user-a", created.id, "climate");
    assert.equal(learning.retryCorrect, true);
    assert.equal(learning.status, "learning");
    assert.equal(learning.correctReviewCount, 1);

    const mastered = await store.retry("user-a", created.id, "CLIMATE");
    assert.equal(mastered.status, "mastered");
    assert.equal((await store.summary("user-a")).unresolved, 0);
});

test("Mongo retry updates review counters atomically", () => {
    assert.match(storeSource, /ReviewMistake\.findOneAndUpdate/);
    assert.match(storeSource, /reviewCount:\s*\{\s*\$add:\s*\[\{\s*\$ifNull:\s*\["\$reviewCount", 0\]\s*\}, 1\]\s*\}/);
    assert.match(storeSource, /correctReviewCount:\s*\{\s*\$add:\s*\[\{\s*\$ifNull:\s*\["\$correctReviewCount", 0\]\s*\}, correct \? 1 : 0\]\s*\}/);
    assert.doesNotMatch(storeSource, /reviewCount:\s*next\.reviewCount/);
    assert.doesNotMatch(storeSource, /correctReviewCount:\s*next\.correctReviewCount/);
});

test("users cannot update or delete another user's mistake", async (t) => {
    const { store, cleanup } = fixture();
    t.after(cleanup);

    const [created] = await store.upsertMany("owner", "attempt-1", [snapshot()]);
    assert.equal(await store.retry("intruder", created.id, "climate"), null);
    assert.equal(await store.markMastered("intruder", created.id), null);
    assert.equal(await store.remove("intruder", created.id), false);
    assert.equal((await store.list("owner")).length, 1);
});

test("listening evidence metadata is persisted and invalid ranges fall back safely", async (t) => {
    const { store, cleanup } = fixture();
    t.after(cleanup);

    const [created] = await store.upsertMany("listener", "attempt-audio", [snapshot({
        skill: "listening",
        partNumber: 2,
        questionGroupId: "group-11-15",
        instructions: "Choose one answer.",
        audioUrl: "/uploads/audio/test.mp3",
        transcriptText: "The relevant transcript.",
        evidenceStartTime: 61.5,
        evidenceEndTime: 74,
        imageUrl: "/uploads/images/map.png"
    })]);
    assert.equal(created.partNumber, 2);
    assert.equal(created.evidenceStartTime, 61.5);
    assert.equal(created.evidenceEndTime, 74);
    assert.equal(created.questionGroupId, "group-11-15");

    const [invalid] = await store.upsertMany("listener", "attempt-invalid", [snapshot({
        skill: "listening",
        evidenceStartTime: 20,
        evidenceEndTime: 10
    })]);
    assert.equal(invalid.evidenceStartTime, 20);
    assert.equal(invalid.evidenceEndTime, null);
});

test("retry uses the same case-and-space normalization as test scoring", async (t) => {
    const { store, cleanup } = fixture();
    t.after(cleanup);

    const [created] = await store.upsertMany("listener", "attempt-scoring", [snapshot({
        skill: "listening",
        correctAnswer: "High Street"
    })]);
    assert.equal((await store.retry("listener", created.id, "  HIGH   STREET ")).retryCorrect, true);
    assert.equal((await store.retry("listener", created.id, "High-Street")).retryCorrect, false);
});
