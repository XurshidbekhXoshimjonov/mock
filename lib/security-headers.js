"use strict";

const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https://translation.googleapis.com https://translate.googleapis.com",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'"
].join("; ");

const PERMISSIONS_POLICY = [
    "accelerometer=()",
    "ambient-light-sensor=()",
    "autoplay=(self)",
    "camera=(self)",
    "display-capture=()",
    "encrypted-media=()",
    "fullscreen=(self)",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=(self)",
    "payment=()",
    "publickey-credentials-get=(self)",
    "screen-wake-lock=(self)",
    "usb=()"
].join(", ");

function requestIsSecure(req, trustForwardedProto = false) {
    if (req.secure) return true;
    if (!trustForwardedProto) return false;
    return String(req.headers?.["x-forwarded-proto"] || "")
        .split(",")[0]
        .trim()
        .toLowerCase() === "https";
}

function createSecurityHeaders({ trustForwardedProto = false } = {}) {
    return function securityHeaders(req, res, next) {
        res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        res.setHeader("Origin-Agent-Cluster", "?1");
        res.setHeader("X-DNS-Prefetch-Control", "off");
        res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

        if (requestIsSecure(req, trustForwardedProto)) {
            res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        }

        return next();
    };
}

module.exports = {
    CONTENT_SECURITY_POLICY,
    PERMISSIONS_POLICY,
    requestIsSecure,
    createSecurityHeaders
};
