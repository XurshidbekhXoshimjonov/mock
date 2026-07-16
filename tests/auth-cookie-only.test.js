"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(file) {
    return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("password authentication keeps the session token out of JSON responses", () => {
    const server = source("server.js");
    const signupResponse = server.match(/res\.status\(201\)\.json\(\{[\s\S]*?\n\s*\}\);/)?.[0] || "";
    const loginResponse = server.match(/message:\s*"Login successful"[\s\S]*?\n\s*\}\);/)?.[0] || "";

    assert.ok(signupResponse);
    assert.ok(loginResponse);
    assert.doesNotMatch(signupResponse, /\btoken\b/);
    assert.doesNotMatch(loginResponse, /\btoken\b/);
    assert.match(server, /res\.cookie\("ieltsmockAuthToken", token, \{\s*httpOnly:\s*true/);
});

test("browser authentication never persists or forwards a bearer token", () => {
    const files = [
        "auth-client.js",
        "login.js",
        "signup.js",
        "premium.js",
        "profile-dashboard.js",
        "admin.js",
        "admin-users.js",
        "admin-import.js",
        "admin-listening.js",
        "admin-reading.js"
    ];
    const browserAuthSource = files.map(source).join("\n");

    assert.doesNotMatch(browserAuthSource, /Authorization\s*[:=].*Bearer/);
    assert.doesNotMatch(browserAuthSource, /document\.cookie\s*=.*ieltsmockAuthToken/);
    assert.doesNotMatch(browserAuthSource, /token:\s*data\.token/);
});

test("Google callback redirects after setting only the httpOnly session cookie", () => {
    const server = source("server.js");
    const callback = server.match(/app\.get\("\/auth\/google\/callback"[\s\S]*?\n\}\);/)?.[0] || "";

    assert.ok(callback);
    assert.match(callback, /httpOnly:\s*true/);
    assert.match(callback, /res\.redirect\(302, redirectUrl\)/);
    assert.doesNotMatch(callback, /localStorage|document\.cookie/);
});
