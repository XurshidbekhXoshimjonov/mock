"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("browser console output is never forwarded to the server", () => {
    const client = fs.readFileSync(path.join(root, "auth-client.js"), "utf8");

    assert.doesNotMatch(client, /sendLogToServer/);
    assert.doesNotMatch(client, /\/api\/client-log/);
    assert.doesNotMatch(client, /console\.(?:log|warn|error)\s*=/);
});

test("all live HTML pages request the privacy-safe auth client and it is not cached", () => {
    const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith(".html"));
    const pagesUsingAuth = htmlFiles.filter((name) => (
        fs.readFileSync(path.join(root, name), "utf8").includes("auth-client.js")
    ));
    assert.ok(pagesUsingAuth.length > 0);
    pagesUsingAuth.forEach((name) => {
        const html = fs.readFileSync(path.join(root, name), "utf8");
        assert.match(html, /auth-client\.js\?v=20260716-log-privacy-v2/, name);
    });

    const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
    assert.match(server, /noStoreAssets = new Set\(\[[\s\S]*?"auth-client\.js"/);
});

test("server exposes no client-controlled logging endpoint", () => {
    const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

    assert.doesNotMatch(server, /app\.post\("\/api\/client-log"/);
    assert.doesNotMatch(server, /\[CLIENT\s+\$\{/);
});

test("authentication and migration logs do not print direct account identifiers", () => {
    const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

    assert.doesNotMatch(server, /\[AUTH CALLBACK\][^\n]*(?:user\.email|\+\s*email)/);
    assert.doesNotMatch(server, /Migrated (?:admin )?user[^\n]*(?:\.email|\.username)/);
    assert.doesNotMatch(server, /Assigned Test Taker ID[^\n]*(?:\.email|\.username)/);
    assert.doesNotMatch(server, /Failed to fetch user info:\s*",\s*userInfo/);
});
