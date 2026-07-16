"use strict";

const multer = require("multer");

const MB = 1024 * 1024;
const UPLOAD_LIMITS = Object.freeze({
    pdf: 20 * MB,
    html: 2 * MB,
    image: 10 * MB,
    profilePhoto: 2 * MB,
    audio: 80 * MB,
    speakingAudio: 30 * MB
});

function multipartLimits({ fileSize, files = 1, fields = 8, parts = files + fields, fieldSize = 256 * 1024 }) {
    return {
        fileSize,
        files,
        fields,
        parts,
        fieldSize,
        fieldNameSize: 100
    };
}

const MULTER_ERROR_MESSAGES = Object.freeze({
    LIMIT_FILE_SIZE: "Uploaded file is too large",
    LIMIT_FILE_COUNT: "Too many files were uploaded",
    LIMIT_FIELD_COUNT: "Too many form fields were submitted",
    LIMIT_PART_COUNT: "Multipart request contains too many parts",
    LIMIT_FIELD_KEY: "Multipart field name is too long",
    LIMIT_FIELD_VALUE: "Multipart field value is too large",
    LIMIT_UNEXPECTED_FILE: "Unexpected upload field"
});

function isUploadLimitError(error) {
    return error instanceof multer.MulterError && Object.hasOwn(MULTER_ERROR_MESSAGES, error.code);
}

function uploadErrorResponse(error, req, res, next) {
    if (isUploadLimitError(error)) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(413).json({
            error: "upload_limit_exceeded",
            code: error.code,
            message: MULTER_ERROR_MESSAGES[error.code]
        });
    }
    if (error?.code === "INVALID_FILE_CONTENT") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(415).json({
            error: "invalid_file_content",
            code: error.code,
            message: error.message
        });
    }
    return next(error);
}

module.exports = {
    MB,
    UPLOAD_LIMITS,
    multipartLimits,
    isUploadLimitError,
    uploadErrorResponse
};
