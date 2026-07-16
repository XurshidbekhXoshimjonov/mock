"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getAdminEmails, isAdminEmail, isAdminUser, publicUser } = require("../lib/auth");

function withAdminEnvironment(values, callback) {
    const previous = {
        ADMIN_EMAIL: process.env.ADMIN_EMAIL,
        ADMIN_EMAILS: process.env.ADMIN_EMAILS
    };

    if (values.ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = values.ADMIN_EMAIL;
    if (values.ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = values.ADMIN_EMAILS;

    try {
        callback();
    } finally {
        if (previous.ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
        else process.env.ADMIN_EMAIL = previous.ADMIN_EMAIL;
        if (previous.ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
        else process.env.ADMIN_EMAILS = previous.ADMIN_EMAILS;
    }
}

test("an allowlisted email alone never grants administrator access", () => {
    withAdminEnvironment({ ADMIN_EMAIL: "owner@example.com", ADMIN_EMAILS: undefined }, () => {
        const registeredUser = { id: "1", email: "owner@example.com", username: "owner", role: "user" };

        assert.equal(isAdminEmail(registeredUser.email), true);
        assert.equal(isAdminUser(registeredUser), false);
        assert.equal(publicUser(registeredUser).role, "user");
    });
});

test("administrator access requires both the stored role and explicit email allowlist", () => {
    withAdminEnvironment({ ADMIN_EMAILS: "owner@example.com, second@example.com", ADMIN_EMAIL: undefined }, () => {
        const configuredAdmin = { id: "1", email: "OWNER@example.com", username: "owner", role: "admin" };
        const unconfiguredAdmin = { id: "2", email: "attacker@example.com", username: "attacker", role: "admin" };

        assert.equal(isAdminUser(configuredAdmin), true);
        assert.equal(publicUser(configuredAdmin).role, "admin");
        assert.equal(isAdminUser(unconfiguredAdmin), false);
        assert.equal(publicUser(unconfiguredAdmin).role, "user");
    });
});

test("missing admin configuration fails closed without a hardcoded fallback", () => {
    withAdminEnvironment({ ADMIN_EMAIL: undefined, ADMIN_EMAILS: undefined }, () => {
        assert.deepEqual(getAdminEmails(), []);
        assert.equal(isAdminUser({ email: "owner@example.com", role: "admin" }), false);
    });
});

test("public authentication routes cannot assign or promote administrator roles", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const signupRoute = server.match(/app\.post\("\/signup"[\s\S]*?\n\}\);/)?.[0] || "";
    const passwordLogin = server.match(/async function handleLogin[\s\S]*?\n\}/)?.[0] || "";
    const googleCallback = server.match(/app\.get\("\/auth\/google\/callback"[\s\S]*?\n\}\);/)?.[0] || "";

    assert.match(signupRoute, /role:\s*"user"/);
    assert.doesNotMatch(signupRoute, /role:\s*isAdminEmail/);
    assert.doesNotMatch(passwordLogin, /updates\.role\s*=\s*"admin"/);
    assert.match(googleCallback, /role:\s*"user"/);
    assert.doesNotMatch(googleCallback, /updates\.role|role\s*=\s*isAdmin/);
});

test("admin reset tooling contains no hardcoded administrator identity", () => {
    const resetScript = fs.readFileSync(path.join(__dirname, "..", "scripts", "reset-users-keep-admin.js"), "utf8");

    assert.match(resetScript, /process\.env\.ADMIN_EMAILS \|\| process\.env\.ADMIN_EMAIL/);
    assert.doesNotMatch(resetScript, /const\s+(?:DEFAULT|PRIMARY|FALLBACK)_ADMIN_EMAIL\s*=\s*"[^"@]+@/);
});
