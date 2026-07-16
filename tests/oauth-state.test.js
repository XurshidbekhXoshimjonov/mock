"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    OAUTH_STATE_TTL_MS,
    safeInternalRedirect,
    createOAuthState,
    verifyOAuthState
} = require("../lib/oauth-state");

test("OAuth state is random and bound to its httpOnly cookie payload", () => {
    const first = createOAuthState("/writing?mode=full#task-2", 1_000);
    const second = createOAuthState("/writing?mode=full#task-2", 1_000);

    assert.notEqual(first.state, second.state);
    assert.match(first.state, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(verifyOAuthState(first.state, first.cookieValue, 2_000), {
        redirectPath: "/writing?mode=full#task-2"
    });
    assert.equal(verifyOAuthState(second.state, first.cookieValue, 2_000), null);
    assert.equal(verifyOAuthState(first.state, second.cookieValue, 2_000), null);

    const [payload, signature] = first.cookieValue.split(".");
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;
    assert.equal(verifyOAuthState(first.state, `${tamperedPayload}.${signature}`, 2_000), null);
});

test("OAuth state rejects missing, malformed, future and expired values", () => {
    const created = createOAuthState("/dashboard", 10_000);

    assert.equal(verifyOAuthState("", created.cookieValue, 10_001), null);
    assert.equal(verifyOAuthState(created.state, "not-base64-json", 10_001), null);
    assert.equal(verifyOAuthState(created.state, created.cookieValue, 9_999), null);
    assert.equal(verifyOAuthState(created.state, created.cookieValue, 10_000 + OAUTH_STATE_TTL_MS + 1), null);
});

test("OAuth redirects are restricted to internal absolute paths", () => {
    assert.equal(safeInternalRedirect("/profile?tab=results"), "/profile?tab=results");

    for (const unsafe of [
        "https://evil.example/steal",
        "//evil.example/steal",
        "\\\\evil.example\\steal",
        "/\\evil.example/steal",
        "javascript:alert(1)",
        "dashboard"
    ]) {
        assert.equal(safeInternalRedirect(unsafe, "/dashboard"), "/dashboard", unsafe);
    }
});

test("Google OAuth route sets, verifies and consumes its state cookie", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const startRoute = server.match(/app\.get\("\/auth\/google"[\s\S]*?\n\}\);/)?.[0] || "";
    const callbackRoute = server.match(/app\.get\("\/auth\/google\/callback"[\s\S]*?\n\}\);/)?.[0] || "";

    assert.match(startRoute, /createOAuthState\(req\.query\.redirect\)/);
    assert.match(startRoute, /httpOnly:\s*true/);
    assert.match(startRoute, /state:\s*oauthState\.state/);
    assert.match(callbackRoute, /verifyOAuthState\(state, stateCookie\)/);
    assert.match(callbackRoute, /clearCookie\("ieltsxGoogleOAuthState"/);
    assert.match(callbackRoute, /if \(!verifiedState\)/);
    assert.doesNotMatch(callbackRoute, /decodeURIComponent\(state\)|targetPath\s*=\s*state/);
});
