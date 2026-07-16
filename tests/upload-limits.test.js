"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");
const {
    MB,
    UPLOAD_LIMITS,
    multipartLimits,
    isUploadLimitError,
    uploadErrorResponse
} = require("../lib/upload-limits");

test("every upload class has an explicit practical byte limit", () => {
    assert.equal(UPLOAD_LIMITS.pdf, 20 * MB);
    assert.equal(UPLOAD_LIMITS.html, 2 * MB);
    assert.equal(UPLOAD_LIMITS.image, 10 * MB);
    assert.equal(UPLOAD_LIMITS.profilePhoto, 2 * MB);
    assert.equal(UPLOAD_LIMITS.audio, 80 * MB);
    assert.equal(UPLOAD_LIMITS.speakingAudio, 30 * MB);
});

test("multipart limits constrain files, fields, parts and field payloads", () => {
    const limits = multipartLimits({ fileSize: 10 * MB, files: 2, fields: 4 });
    assert.deepEqual(limits, {
        fileSize: 10 * MB,
        files: 2,
        fields: 4,
        parts: 6,
        fieldSize: 256 * 1024,
        fieldNameSize: 100
    });
});

test("Multer size and multipart limit errors return JSON 413 responses", () => {
    for (const code of ["LIMIT_FILE_SIZE", "LIMIT_FILE_COUNT", "LIMIT_FIELD_COUNT", "LIMIT_PART_COUNT", "LIMIT_FIELD_VALUE"]) {
        const error = new multer.MulterError(code);
        const headers = {};
        let nextCalled = false;
        const res = {
            statusCode: 200,
            body: null,
            setHeader(name, value) { headers[name] = value; },
            status(value) { this.statusCode = value; return this; },
            json(value) { this.body = value; return this; }
        };
        uploadErrorResponse(error, {}, res, () => { nextCalled = true; });

        assert.equal(isUploadLimitError(error), true, code);
        assert.equal(nextCalled, false, code);
        assert.equal(res.statusCode, 413, code);
        assert.equal(res.body.error, "upload_limit_exceeded", code);
        assert.equal(res.body.code, code, code);
        assert.equal(headers["Cache-Control"], "no-store", code);
    }
});

test("non-limit errors continue to the normal error handler", () => {
    const error = new Error("bad file type");
    let forwarded = null;
    uploadErrorResponse(error, {}, {}, (value) => { forwarded = value; });
    assert.equal(forwarded, error);
});

test("all disk-backed upload middleware is wired to shared limits", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const fullTestRoutes = fs.readFileSync(path.join(__dirname, "..", "lib", "full-test-routes.js"), "utf8");
    const speakingRoutes = fs.readFileSync(path.join(__dirname, "..", "lib", "speaking-routes.js"), "utf8");

    assert.match(server, /fileSize:\s*UPLOAD_LIMITS\.pdf/);
    assert.match(server, /fileSize:\s*UPLOAD_LIMITS\.audio/g);
    assert.match(server, /fileSize:\s*UPLOAD_LIMITS\.image/g);
    assert.match(server, /fileSize:\s*UPLOAD_LIMITS\.profilePhoto/);
    assert.match(server, /const crypto = require\("crypto"\)/);
    assert.match(server, /app\.use\(uploadErrorResponse\)/);
    assert.match(fullTestRoutes, /fileSize:\s*UPLOAD_LIMITS\.html/);
    assert.match(fullTestRoutes, /fileSize:\s*UPLOAD_LIMITS\.audio/);
    assert.match(speakingRoutes, /fileSize:\s*UPLOAD_LIMITS\.speakingAudio/);
});
