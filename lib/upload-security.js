"use strict";

const path = require("path");

const SAFE_IMPORTED_ASSET_EXTENSIONS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".avif",
    ".mp3",
    ".wav",
    ".m4a",
    ".webm",
    ".ogg"
]);

function decodeRequestPath(value) {
    let decoded = String(value || "");

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        } catch {
            return "";
        }
    }

    return decoded.replace(/\\/g, "/");
}

function isSafeImportedAssetPath(requestPath) {
    const decoded = decodeRequestPath(requestPath);
    if (!decoded || decoded.includes("\0") || decoded.endsWith("/")) return false;

    return SAFE_IMPORTED_ASSET_EXTENSIONS.has(path.posix.extname(decoded).toLowerCase());
}

function protectImportedUploads(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

    if (!isSafeImportedAssetPath(req.path)) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(404).type("text/plain").send("Not found");
    }

    return next();
}

function withoutPrivateImportMetadata(value) {
    if (Array.isArray(value)) {
        return value.map(withoutPrivateImportMetadata);
    }
    if (!value || typeof value !== "object") {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => key !== "sourceUpload" && key !== "originalUpload")
            .map(([key, child]) => [key, withoutPrivateImportMetadata(child)])
    );
}

module.exports = {
    SAFE_IMPORTED_ASSET_EXTENSIONS,
    isSafeImportedAssetPath,
    protectImportedUploads,
    withoutPrivateImportMetadata
};
