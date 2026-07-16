"use strict";

const crypto = require("crypto");

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function oauthStateSecret() {
    return process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || process.env.AUTH_SECRET || "ielts-mock-dev-secret";
}

function signPayload(encodedPayload) {
    return crypto.createHmac("sha256", oauthStateSecret()).update(encodedPayload).digest("base64url");
}

function safeInternalRedirect(value, fallback = "") {
    const raw = String(value || "").trim();
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
        return fallback;
    }

    try {
        const parsed = new URL(raw, "https://ieltsx.invalid");
        if (parsed.origin !== "https://ieltsx.invalid") return fallback;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return fallback;
    }
}

function createOAuthState(redirectPath = "", now = Date.now()) {
    const state = crypto.randomBytes(32).toString("base64url");
    const payload = {
        state,
        redirectPath: safeInternalRedirect(redirectPath, ""),
        issuedAt: now
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return {
        state,
        cookieValue: `${encodedPayload}.${signPayload(encodedPayload)}`
    };
}

function constantTimeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ""), "utf8");
    const rightBuffer = Buffer.from(String(right || ""), "utf8");
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyOAuthState(state, cookieValue, now = Date.now()) {
    if (!state || !cookieValue) return null;

    try {
        const [encodedPayload, signature, extra] = String(cookieValue).split(".");
        if (!encodedPayload || !signature || extra || !constantTimeEqual(signature, signPayload(encodedPayload))) {
            return null;
        }
        const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
        const age = now - Number(payload.issuedAt);
        if (!Number.isFinite(age) || age < 0 || age > OAUTH_STATE_TTL_MS) return null;
        if (!constantTimeEqual(state, payload.state)) return null;

        return {
            redirectPath: safeInternalRedirect(payload.redirectPath, "")
        };
    } catch {
        return null;
    }
}

module.exports = {
    OAUTH_STATE_TTL_MS,
    safeInternalRedirect,
    createOAuthState,
    verifyOAuthState
};
