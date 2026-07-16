"use strict";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizedOrigin(value) {
    const raw = String(value || "").trim();
    if (!raw || raw === "null") return "";
    try {
        return new URL(raw).origin;
    } catch {
        return "";
    }
}

function requestHeader(req, name) {
    if (typeof req.get === "function") return req.get(name) || "";
    return req.headers?.[String(name).toLowerCase()] || "";
}

function expectedRequestOrigin(req, trustForwardedProto = false) {
    const host = String(requestHeader(req, "host") || "").trim();
    if (!host) return "";
    const forwardedProto = trustForwardedProto
        ? String(requestHeader(req, "x-forwarded-proto") || "").split(",")[0].trim()
        : "";
    const protocol = req.secure ? "https" : (forwardedProto || String(req.protocol || "http")).split(":")[0];
    return normalizedOrigin(`${protocol}://${host}`);
}

function crossSiteRequest(req, allowedOrigins = new Set(), trustForwardedProto = false) {
    const fetchSite = String(requestHeader(req, "sec-fetch-site") || "").trim().toLowerCase();
    const trusted = new Set(
        [...allowedOrigins, expectedRequestOrigin(req, trustForwardedProto)]
            .map(normalizedOrigin)
            .filter(Boolean)
    );
    const suppliedOrigin = String(requestHeader(req, "origin") || "").trim();
    if (suppliedOrigin) {
        const origin = normalizedOrigin(suppliedOrigin);
        return !origin || !trusted.has(origin);
    }

    if (fetchSite === "cross-site") return true;

    const suppliedReferer = String(requestHeader(req, "referer") || "").trim();
    if (suppliedReferer) {
        const refererOrigin = normalizedOrigin(suppliedReferer);
        return !refererOrigin || !trusted.has(refererOrigin);
    }

    // Non-browser clients often send neither header. Cookie SameSite remains the
    // fallback while browser cross-site requests are rejected above.
    return false;
}

function createCsrfProtection(options = {}) {
    const allowedOrigins = new Set(options.allowedOrigins || []);
    const exemptPaths = new Set(options.exemptPaths || []);
    const pathAllowedOrigins = options.pathAllowedOrigins || {};
    const trustForwardedProto = options.trustForwardedProto === true;

    return function csrfProtection(req, res, next) {
        const method = String(req.method || "GET").toUpperCase();
        if (SAFE_METHODS.has(method) || !String(req.path || "").startsWith("/api/") || exemptPaths.has(req.path)) {
            return next();
        }
        const requestAllowedOrigins = new Set([
            ...allowedOrigins,
            ...(pathAllowedOrigins[req.path] || [])
        ]);
        if (!crossSiteRequest(req, requestAllowedOrigins, trustForwardedProto)) return next();

        res.setHeader("Cache-Control", "no-store");
        return res.status(403).json({ error: "Cross-site request blocked" });
    };
}

module.exports = {
    SAFE_METHODS,
    normalizedOrigin,
    expectedRequestOrigin,
    crossSiteRequest,
    createCsrfProtection
};
