const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createVocabularyStore } = require("../lib/vocabulary-store");

function fixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ieltsx-vocabulary-"));
    return {
        store: createVocabularyStore({ filePath: path.join(directory, "vocabulary.json") }),
        cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
    };
}

function word(overrides = {}) {
    return {
        word: "Mitigate",
        definition: "To make something less harmful or serious.",
        uzbekTranslation: "kamaytirmoq",
        partOfSpeech: "verb",
        pronunciation: "/ˈmɪtɪɡeɪt/",
        sourceType: "reading",
        testId: "reading-10",
        testTitle: "Cambridge IELTS 10",
        passageNumber: 1,
        contextSentence: "Scientists attempted to mitigate the environmental damage.",
        ...overrides
    };
}

test("duplicate normalized words merge source history instead of creating another word", async (t) => {
    const { store, cleanup } = fixture();
    t.after(cleanup);
    const first = await store.upsert("user-a", word());
    const duplicate = await store.upsert("user-a", word({
        word: "mitigate",
        sourceType: "listening",
        testId: "listening-2",
        partNumber: 3,
        contextSentence: "",
        transcriptContext: "We need to mitigate the risk.",
        audioUrl: "/audio/test.mp3",
        audioStartTime: 12,
        audioEndTime: 18
    }));
    assert.equal(first.alreadyExists, false);
    assert.equal(duplicate.alreadyExists, true);
    assert.equal((await store.list("user-a")).length, 1);
    assert.equal(duplicate.item.sources.length, 2);
});

test("vocabulary CRUD and filters remain scoped to the authenticated user", async (t) => {
    const { store, cleanup } = fixture();
    t.after(cleanup);
    const { item } = await store.upsert("owner", word());
    await store.upsert("other", word());
    assert.equal(await store.get("intruder", item.id), null);
    assert.equal(await store.update("intruder", item.id, { definition: "Changed" }), null);
    assert.equal(await store.remove("intruder", item.id), false);
    assert.equal((await store.list("owner", { sourceType: "reading" })).length, 1);
    assert.equal((await store.list("owner", { sourceType: "listening" })).length, 0);
    assert.equal((await store.list("owner", { search: "kamaytirmoq" })).length, 1);
    const updated = await store.update("owner", item.id, { definition: "Reduce harmful effects." });
    assert.equal(updated.definition, "Reduce harmful effects.");
    assert.equal(await store.remove("owner", item.id), true);
});

test("spaced repetition schedules reviews and advances learning status", async (t) => {
    const { store, cleanup } = fixture();
    t.after(cleanup);
    const { item } = await store.upsert("learner", word());
    const again = await store.review("learner", item.id, "again");
    assert.equal(again.reviewStatus, "new");
    assert.equal(again.reviewCount, 1);
    assert.ok(new Date(again.nextReviewAt) > new Date(again.lastReviewedAt));
    let reviewed = again;
    for (let index = 0; index < 5; index += 1) {
        reviewed = await store.review("learner", item.id, "good");
    }
    assert.equal(reviewed.reviewStatus, "mastered");
    assert.equal(reviewed.correctCount, 5);
    assert.equal((await store.summary("learner")).mastered, 1);
});

test("Vocabulary UI exposes real API actions, Reading-only filters and practice modes", () => {
    const page = fs.readFileSync(path.join(__dirname, "..", "vocabulary.js"), "utf8");
    const reading = fs.readFileSync(path.join(__dirname, "..", "reading-cbt-app.js"), "utf8");
    const readingTemplate = fs.readFileSync(path.join(__dirname, "..", "reading-template.html"), "utf8");
    const fullReadingTemplate = fs.readFileSync(path.join(__dirname, "..", "full-test-player.html"), "utf8");
    const vocabularyHtml = fs.readFileSync(path.join(__dirname, "..", "vocabulary.html"), "utf8");
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.match(reading, /saveVocabularyWord\(finalRecord\)/);
    assert.match(reading, /saveVocabularyWord\(fallbackRecord\)/);
    assert.doesNotMatch(reading, /Add to Vocabulary/);
    assert.match(reading, /skill === "reading"/);
    assert.match(reading, /const isPracticeReading = skill === "reading" && !isFullTest && !isMockMode/);
    assert.match(reading, /if \(!canUseVocabulary \|\| isFullTest \|\| isMockMode \|\| !target\)/);
    assert.match(reading, /Added to this Reading review\./);
    assert.doesNotMatch(reading, /window\.location\.assign\("\/vocabulary\?source=add-word"\)/);
    assert.match(readingTemplate, /reading-cbt-app\.js\?v=20260718-vocabulary-practice-only-v2/);
    assert.match(fullReadingTemplate, /reading-cbt-app\.js\?v=20260718-vocabulary-practice-only-v2/);
    ["word-uzbek", "uzbek-word", "context", "definition"].forEach((mode) => assert.match(page, new RegExp(mode)));
    assert.doesNotMatch(page, /data-practice-mode="listening"/);
    assert.doesNotMatch(page, /Start Listening/);
    assert.match(vocabularyHtml, /English ↔ Uzbek Translator/);
    assert.match(vocabularyHtml, /id="startTranslate"[^>]*>Translate</);
    assert.match(vocabularyHtml, /id="aiTranslator"[^>]*hidden/);
    assert.doesNotMatch(vocabularyHtml, /id="startReview"/);
    assert.match(vocabularyHtml, /data-translate-direction="en-uz"/);
    assert.match(vocabularyHtml, /data-translate-direction="uz-en"/);
    assert.match(page, /\/api\/vocabulary\/translate/);
    assert.match(server, /app\.post\("\/api\/vocabulary\/translate", requireUser/);
    [
        'app.post("/api/vocabulary"',
        'app.get("/api/vocabulary"',
        'app.get("/api/vocabulary/review/due"',
        'app.post("/api/vocabulary/:id/review"'
    ].forEach((route) => assert.ok(server.includes(route)));
});
