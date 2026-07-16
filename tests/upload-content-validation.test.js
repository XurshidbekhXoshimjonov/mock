"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    isPdf,
    isImage,
    isAudio,
    isHtml,
    validateUploadContents
} = require("../lib/upload-content-validation");
const { uploadErrorResponse } = require("../lib/upload-limits");

test("file signatures identify supported PDF, image and audio content", () => {
    assert.equal(isPdf(Buffer.from("%PDF-1.7\n")), true);
    assert.equal(isPdf(Buffer.from("not a pdf")), false);

    assert.equal(isImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
    assert.equal(isImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true);
    assert.equal(isImage(Buffer.from("GIF89a")), true);
    assert.equal(isImage(Buffer.from("RIFFxxxxWEBP")), true);
    assert.equal(isImage(Buffer.from("<script>alert(1)</script>")), false);

    assert.equal(isAudio(Buffer.from("ID3test")), true);
    assert.equal(isAudio(Buffer.from("RIFFxxxxWAVE")), true);
    assert.equal(isAudio(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), true);
    assert.equal(isAudio(Buffer.from("OggSdata")), true);
    assert.equal(isAudio(Buffer.from("fake mp3 content")), false);
});

test("HTML imports require text HTML structure and reject binary payloads", () => {
    assert.equal(isHtml(Buffer.from("<!doctype html><html><body>Test</body></html>")), true);
    assert.equal(isHtml(Buffer.from("<main>Imported test</main>")), true);
    assert.equal(isHtml(Buffer.from("plain text with no HTML structure")), false);
    assert.equal(isHtml(Buffer.from([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x00, 0x3e])), false);
});

test("invalid uploaded content is deleted before a 415 response", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ieltsx-upload-validation-"));
    const filePath = path.join(tempDir, "fake.png");
    fs.writeFileSync(filePath, "<script>not an image</script>");
    const req = { file: { path: filePath, fieldname: "image", originalname: "fake.png" } };
    let validationError = null;

    await validateUploadContents({ image: "image" })(req, {}, (error) => { validationError = error || null; });

    assert.equal(validationError.code, "INVALID_FILE_CONTENT");
    assert.equal(validationError.statusCode, 415);
    assert.equal(fs.existsSync(filePath), false);

    const headers = {};
    const res = {
        statusCode: 200,
        body: null,
        setHeader(name, value) { headers[name] = value; },
        status(value) { this.statusCode = value; return this; },
        json(value) { this.body = value; return this; }
    };
    uploadErrorResponse(validationError, req, res, () => assert.fail("validation error was not handled"));
    assert.equal(res.statusCode, 415);
    assert.equal(res.body.error, "invalid_file_content");
    assert.equal(headers["Cache-Control"], "no-store");
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test("all public disk upload routes validate content after Multer", () => {
    const files = [
        "server.js",
        "lib/full-test-routes.js",
        "lib/speaking-routes.js",
        "lib/writing-routes.js"
    ].map((file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8")).join("\n");

    const multerUses = [...files.matchAll(/(?:\.single\("(photo|pdf|audio|image|html)"\)|\.array\("audio",\s*16\))/g)].length;
    const validations = [...files.matchAll(/validateUploadContents\(\{\s*(?:photo|pdf|audio|image|html):\s*"(?:image|pdf|audio|html)"\s*\}\)/g)].length;
    assert.equal(multerUses, validations);
    assert.ok(validations >= 15);
});
