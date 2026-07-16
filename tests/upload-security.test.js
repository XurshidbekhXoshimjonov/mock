"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    isSafeImportedAssetPath,
    protectImportedUploads,
    withoutPrivateImportMetadata
} = require("../lib/upload-security");

test("import uploads expose only explicitly allowed media assets", () => {
    for (const safePath of [
        "/map.jpg",
        "/nested/diagram.PNG",
        "/audio/test.mp3",
        "/clip.webm"
    ]) {
        assert.equal(isSafeImportedAssetPath(safePath), true, safePath);
    }

    for (const blockedPath of [
        "/source.html",
        "/source.HTM",
        "/source.xhtml",
        "/script.js",
        "/vector.svg",
        "/folder/",
        "/folder",
        "/source%2ehtml",
        "/source%252ehtml"
    ]) {
        assert.equal(isSafeImportedAssetPath(blockedPath), false, blockedPath);
    }
});

test("blocked import files return a non-cacheable 404 with defensive headers", () => {
    const headers = {};
    let nextCalled = false;
    let sentBody = "";
    const response = {
        statusCode: 200,
        setHeader(name, value) { headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        type(value) { headers["Content-Type"] = value; return this; },
        send(value) { sentBody = value; return this; }
    };

    protectImportedUploads(
        { path: "/untrusted.html" },
        response,
        () => { nextCalled = true; }
    );

    assert.equal(response.statusCode, 404);
    assert.equal(nextCalled, false);
    assert.equal(sentBody, "Not found");
    assert.equal(headers["Cache-Control"], "no-store");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.match(headers["Content-Security-Policy"], /default-src 'none'/);
});

test("allowed import media continues to the static file server", () => {
    const headers = {};
    let nextCalled = false;
    protectImportedUploads(
        { path: "/maps/test-map.jpg" },
        { setHeader(name, value) { headers[name] = value; } },
        () => { nextCalled = true; }
    );

    assert.equal(nextCalled, true);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Cross-Origin-Resource-Policy"], "same-origin");
});

test("public test payloads do not reveal stored import URLs", () => {
    const input = {
        id: "example",
        sourceUpload: "/uploads/ielts-import/source.html",
        nested: { originalUpload: "/uploads/ielts-import/original.htm", keep: true }
    };
    const output = withoutPrivateImportMetadata(input);

    assert.deepEqual(output, { id: "example", nested: { keep: true } });
    assert.equal(input.sourceUpload, "/uploads/ielts-import/source.html");
});

test("import upload protection is mounted before static file serving", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const protectionIndex = server.indexOf('app.use("/uploads/ielts-import", protectImportedUploads)');
    const staticIndex = server.indexOf('app.use("/uploads", express.static');

    assert.ok(protectionIndex >= 0);
    assert.ok(staticIndex > protectionIndex);
});
