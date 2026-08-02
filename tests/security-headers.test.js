"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    CONTENT_SECURITY_POLICY,
    PERMISSIONS_POLICY,
    requestIsSecure,
    createSecurityHeaders
} = require("../lib/security-headers");

function applyHeaders(req) {
    const headers = {};
    let nextCalled = false;
    createSecurityHeaders({ trustForwardedProto: true })(
        req,
        { setHeader(name, value) { headers[name] = value; } },
        () => { nextCalled = true; }
    );
    return { headers, nextCalled };
}

test("global responses receive framing, MIME, referrer and browser-permission protections", () => {
    const { headers, nextCalled } = applyHeaders({ secure: false, headers: {} });

    assert.equal(nextCalled, true);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["X-Frame-Options"], "SAMEORIGIN");
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.equal(headers["Cross-Origin-Opener-Policy"], "same-origin-allow-popups");
    assert.equal(headers["Cross-Origin-Resource-Policy"], "same-origin");
    assert.equal(headers["Origin-Agent-Cluster"], "?1");
    assert.equal(headers["X-DNS-Prefetch-Control"], "off");
    assert.equal(headers["Strict-Transport-Security"], undefined);
});

test("CSP permits same-origin mock players while blocking external framing and plugins", () => {
    assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'/);
    assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'self'/);
    assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
    assert.match(CONTENT_SECURITY_POLICY, /form-action 'self'/);
    assert.match(CONTENT_SECURITY_POLICY, /fonts\.googleapis\.com/);
    assert.match(CONTENT_SECURITY_POLICY, /fonts\.gstatic\.com/);
    assert.match(CONTENT_SECURITY_POLICY, /media-src 'self' blob: https:/);
    assert.match(CONTENT_SECURITY_POLICY, /script-src[^;]+cdn\.paddle\.com/);
    assert.match(CONTENT_SECURITY_POLICY, /frame-src[^;]+\*\.paddle\.com/);
    assert.doesNotMatch(CONTENT_SECURITY_POLICY, /default-src \*/);
});

test("permissions policy keeps IELTS microphone and camera flows but denies unrelated sensors", () => {
    assert.match(PERMISSIONS_POLICY, /microphone=\(self\)/);
    assert.match(PERMISSIONS_POLICY, /camera=\(self\)/);
    assert.match(PERMISSIONS_POLICY, /geolocation=\(\)/);
    assert.match(PERMISSIONS_POLICY, /payment=\(self "https:\/\/\*\.paddle\.com"\)/);
    assert.match(PERMISSIONS_POLICY, /usb=\(\)/);
});

test("HSTS is emitted only for trusted HTTPS requests", () => {
    assert.equal(requestIsSecure({ secure: true, headers: {} }, false), true);
    assert.equal(requestIsSecure({ secure: false, headers: { "x-forwarded-proto": "https" } }, false), false);
    assert.equal(requestIsSecure({ secure: false, headers: { "x-forwarded-proto": "https, http" } }, true), true);

    const secure = applyHeaders({ secure: false, headers: { "x-forwarded-proto": "https" } });
    assert.equal(secure.headers["Strict-Transport-Security"], "max-age=31536000; includeSubDomains");
});

test("Express fingerprinting is disabled before routes are registered", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.match(server, /app\.disable\("x-powered-by"\)/);
    const middlewareIndex = server.indexOf("app.use(createSecurityHeaders");
    const firstRouteIndex = server.indexOf("app.get(");
    assert.ok(middlewareIndex >= 0);
    assert.ok(firstRouteIndex > middlewareIndex);
});
