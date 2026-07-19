const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const adminUsersScript = fs.readFileSync(path.join(root, "admin-users.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const adminUsersHtml = fs.readFileSync(path.join(root, "admin-users.html"), "utf8");

test("admin Premium grants start from today instead of an expired subscription start", () => {
    assert.match(adminUsersScript, /manageStartDate"\)\.value = dateInputValue\(\)/);
    assert.doesNotMatch(adminUsersScript, /manageStartDate"\)\.value = details\.startedAt/);
});

test("admin Premium endpoint rejects grants that are already expired", () => {
    assert.match(serverSource, /expiryDate <= startDate/);
    assert.match(serverSource, /expiryDate <= now/);
});

test("admin users page loads the regrant fix without a stale browser cache", () => {
    assert.match(adminUsersHtml, /admin-users\.js\?v=20260719-premium-regrant-fix/);
});
