"use strict";

const fs = require("fs");

const HEADER_BYTES = 16 * 1024;

function startsWith(buffer, bytes, offset = 0) {
    if (buffer.length < offset + bytes.length) return false;
    return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function ascii(buffer, start, length) {
    return buffer.subarray(start, start + length).toString("ascii");
}

function isPdf(buffer) {
    return buffer.subarray(0, 1024).includes(Buffer.from("%PDF-", "ascii"));
}

function isImage(buffer) {
    return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        || startsWith(buffer, [0xff, 0xd8, 0xff])
        || ascii(buffer, 0, 6) === "GIF87a"
        || ascii(buffer, 0, 6) === "GIF89a"
        || (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 4) === "WEBP");
}

function isAudio(buffer) {
    const mp3Frame = buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    const mp4Family = buffer.length >= 12 && ascii(buffer, 4, 4) === "ftyp";
    return ascii(buffer, 0, 3) === "ID3"
        || mp3Frame
        || (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 4) === "WAVE")
        || mp4Family
        || startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])
        || ascii(buffer, 0, 4) === "OggS";
}

function isHtml(buffer) {
    if (!buffer.length || buffer.includes(0)) return false;
    const sample = buffer.toString("utf8").replace(/^\uFEFF/, "").trimStart().toLowerCase();
    return sample.startsWith("<!doctype html")
        || sample.startsWith("<html")
        || /<(?:head|body|main|section|article)\b/.test(sample);
}

const validators = Object.freeze({ pdf: isPdf, image: isImage, audio: isAudio, html: isHtml });

async function readHeader(filePath) {
    const handle = await fs.promises.open(filePath, "r");
    try {
        const buffer = Buffer.alloc(HEADER_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
}

async function removeUploadedFiles(files) {
    await Promise.all(files.map(async (file) => {
        if (!file?.path) return;
        try {
            await fs.promises.unlink(file.path);
        } catch (error) {
            if (error.code !== "ENOENT") console.warn("Could not remove rejected upload:", error.message);
        }
    }));
}

function uploadedFiles(req) {
    if (req.file) return [req.file];
    if (Array.isArray(req.files)) return req.files;
    if (req.files && typeof req.files === "object") return Object.values(req.files).flat();
    return [];
}

function uploadValidationError(file, expectedKind) {
    const error = new Error(`Uploaded ${file.fieldname || "file"} content does not match the expected ${expectedKind} format`);
    error.statusCode = 415;
    error.code = "INVALID_FILE_CONTENT";
    return error;
}

function validateUploadContents(fieldKinds) {
    return async function validateUploadContentMiddleware(req, res, next) {
        const files = uploadedFiles(req);
        try {
            for (const file of files) {
                const kind = fieldKinds[file.fieldname] || fieldKinds["*"];
                const validator = validators[kind];
                if (!validator) continue;
                const header = await readHeader(file.path);
                if (!validator(header)) throw uploadValidationError(file, kind);
            }
            return next();
        } catch (error) {
            await removeUploadedFiles(files);
            return next(error);
        }
    };
}

module.exports = {
    isPdf,
    isImage,
    isAudio,
    isHtml,
    readHeader,
    removeUploadedFiles,
    validateUploadContents
};
