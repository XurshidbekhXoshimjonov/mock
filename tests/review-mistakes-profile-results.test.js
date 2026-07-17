const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("profile results validate client-submitted mistake snapshots before saving", () => {
    assert.match(server, /MAX_REVIEW_MISTAKE_SNAPSHOTS_PER_RESULT\s*=\s*40/);
    assert.match(server, /MAX_REVIEW_MISTAKE_SNAPSHOT_BYTES\s*=\s*80_000/);
    assert.match(server, /MAX_REVIEW_MISTAKE_SNAPSHOTS_BYTES\s*=\s*1_500_000/);
    assert.match(server, /function validateProfileMistakeSnapshots/);
    assert.match(server, /Too many mistake snapshots for this result/);
    assert.match(server, /Mistake snapshots payload is too large/);

    const routeStart = server.indexOf('app.post("/api/profile/results"');
    const validatorCall = server.indexOf("validateProfileMistakeSnapshots(req.body || {})", routeStart);
    const resultSave = server.indexOf("userProgressStore.recordResult", routeStart);
    assert.ok(routeStart > 0, "profile results route should exist");
    assert.ok(validatorCall > routeStart, "validator should run in the profile results route");
    assert.ok(validatorCall < resultSave, "validator should run before saving the result");
});
