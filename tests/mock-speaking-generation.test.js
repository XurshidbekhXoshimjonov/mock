"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMockTestStore } = require("../lib/mock-test-store");

test("an active mock test is complete without an admin Speaking test", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ieltsx-mock-speaking-"));
    const store = createMockTestStore({
        testsFile: path.join(directory, "tests.json"),
        resultsFile: path.join(directory, "results.json")
    });

    const created = store.createTest({
        title: "AI Speaking Mock",
        status: "active",
        listeningTestId: "listening-1",
        readingTestId: "reading-1",
        writingTestId: "writing-1",
        speakingTestId: ""
    });

    assert.equal(store.listTests().length, 1);
    assert.equal(store.getTest(created.id)?.id, created.id);
    assert.equal(store.getTest(created.id)?.speakingTestId, "");
});

test("Speaking generation is available to mock access and rejects repeated questions", () => {
    const routes = fs.readFileSync(path.join(__dirname, "..", "lib", "speaking-routes.js"), "utf8");

    assert.match(routes, /app\.post\("\/api\/speaking\/generate-test", requireAuth, requirePremiumSpeakingOrMockAccess/);
    assert.match(routes, /Generated Speaking test contains duplicate questions/);
    assert.match(routes, /hasRecentSpeakingOverlap\(userKey, test\)/);
    assert.match(routes, /Part 3: 5-7 unique, progressively deeper analytical questions directly connected to the exact Part 2 theme/);
});

test("mock Speaking requests fresh AI questions and treats admin content as fallback", () => {
    const player = fs.readFileSync(path.join(__dirname, "..", "speaking.js"), "utf8");

    assert.match(player, /mockMode:\s*isSpeakingMockMode\s*\?\s*"1"\s*:\s*"0"/);
    assert.match(player, /mockTestId\s*\n?\s*\}\)/);
    assert.match(player, /state\.test = defaultFullSpeakingTest\(\)/);
    assert.match(player, /const optionalAdminFallbackId = String\(speakingParams\.get\("sourceTestId"\)/);
    assert.match(player, /if \(optionalAdminFallbackId\)/);
    assert.match(player, /state\.test = await requestGeneratedSpeakingTest\(\)/);
});
