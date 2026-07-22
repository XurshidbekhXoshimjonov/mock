"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createUserProgressStore } = require("../lib/user-progress-store");
const { createMockTestStore } = require("../lib/mock-test-store");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("objective result deletion remains scoped to the signed-in user", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ieltsx-progress-delete-"));
    const store = createUserProgressStore(path.join(directory, "progress.json"));
    const first = store.recordResult("admin-a", { skill: "listening", correct: 30, total: 40 });
    store.recordResult("admin-b", { id: first.id, skill: "reading", correct: 28, total: 40 });

    assert.equal(store.removeResult("admin-a", first.id)?.id, first.id);
    assert.equal(store.getProgress("admin-a").testHistory.length, 0);
    assert.equal(store.getProgress("admin-b").testHistory.length, 1);
});

test("mock result deletion remains scoped to the signed-in user", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ieltsx-mock-delete-"));
    const resultsFile = path.join(directory, "results.json");
    fs.writeFileSync(resultsFile, JSON.stringify({ users: {
        "admin-a": { results: [{ id: "same-result", overallBand: 7 }] },
        "admin-b": { results: [{ id: "same-result", overallBand: 8 }] }
    } }), "utf8");
    const store = createMockTestStore({
        testsFile: path.join(directory, "tests.json"),
        resultsFile
    });

    assert.equal(store.removeResult("admin-a", "same-result")?.overallBand, 7);
    assert.equal(store.profileSummary("admin-a").completedMockTests, 0);
    assert.equal(store.profileSummary("admin-b").completedMockTests, 1);
});

test("all performance delete endpoints and controls are admin-only", () => {
    const server = read("server.js");
    const writing = read("lib/writing-routes.js");
    const speaking = read("lib/speaking-routes.js");
    const dashboard = read("profile-dashboard.js");

    assert.match(server, /app\.delete\("\/api\/profile\/results\/:id", requireUser, requireAdmin/);
    assert.match(server, /app\.delete\("\/api\/mock-test-results\/:id", requireUser, requireAdmin/);
    assert.match(writing, /app\.delete\("\/api\/profile\/writing\/:id", requireAuth, requireAdmin/);
    assert.match(speaking, /app\.delete\("\/api\/profile\/speaking\/:id", requireAuth, requireAdmin/);
    assert.match(dashboard, /if \(!isAdmin \|\| !resultId\) return null/);
    assert.match(dashboard, /Delete Result/);
});
