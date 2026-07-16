"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    normalizedOrigin,
    crossSiteRequest,
    createCsrfProtection
} = require("../lib/csrf-protection");

function request(overrides = {}) {
    return {
        method: "POST",
        path: "/api/profile",
        protocol: "https",
        secure: true,
        headers: { host: "ieltsx.org", ...(overrides.headers || {}) },
        ...overrides
    };
}

function runMiddleware(req, options = {}) {
    let nextCalled = false;
    const headers = {};
    const response = {
        statusCode: 200,
        body: null,
        setHeader(name, value) { headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; }
    };
    createCsrfProtection(options)(req, response, () => { nextCalled = true; });
    return { nextCalled, response, headers };
}

test("origin normalization accepts valid origins and rejects opaque or malformed values", () => {
    assert.equal(normalizedOrigin("https://ieltsx.org/path?q=1"), "https://ieltsx.org");
    assert.equal(normalizedOrigin("null"), "");
    assert.equal(normalizedOrigin("not a url"), "");
});

test("same-origin modifying API requests are allowed", () => {
    const req = request({ headers: { host: "ieltsx.org", origin: "https://ieltsx.org", "sec-fetch-site": "same-origin" } });
    assert.equal(crossSiteRequest(req), false);
    assert.equal(runMiddleware(req).nextCalled, true);
});

test("cross-site modifying API requests are rejected without reaching a route", () => {
    const result = runMiddleware(request({
        headers: { host: "ieltsx.org", origin: "https://attacker.example", "sec-fetch-site": "cross-site" }
    }));
    assert.equal(result.nextCalled, false);
    assert.equal(result.response.statusCode, 403);
    assert.deepEqual(result.response.body, { error: "Cross-site request blocked" });
    assert.equal(result.headers["Cache-Control"], "no-store");
});

test("safe requests, non-API requests and allowlisted cross-origin translation routes remain usable", () => {
    assert.equal(runMiddleware(request({ method: "GET" })).nextCalled, true);
    assert.equal(runMiddleware(request({ path: "/login" })).nextCalled, true);
    assert.equal(runMiddleware(
        request({ path: "/api/translate", headers: { host: "api.ieltsx.org", origin: "https://ieltsx.org", "sec-fetch-site": "cross-site" } }),
        { pathAllowedOrigins: { "/api/translate": ["https://ieltsx.org"] } }
    ).nextCalled, true);
    assert.equal(runMiddleware(
        request({ path: "/api/translate", headers: { host: "ieltsx.org", origin: "https://attacker.example" } }),
        { pathAllowedOrigins: { "/api/translate": ["https://ieltsx.org"] } }
    ).response.statusCode, 403);
});

test("headerless API clients remain compatible while browser referers are validated", () => {
    assert.equal(runMiddleware(request()).nextCalled, true);
    assert.equal(runMiddleware(request({ headers: { host: "ieltsx.org", referer: "https://attacker.example/form" } })).response.statusCode, 403);
});

test("forwarded HTTPS is trusted only when explicitly configured", () => {
    const proxied = request({
        secure: false,
        protocol: "http",
        headers: { host: "ieltsx.org", origin: "https://ieltsx.org", "x-forwarded-proto": "https" }
    });
    assert.equal(runMiddleware(proxied).response.statusCode, 403);
    assert.equal(runMiddleware(proxied, { trustForwardedProto: true }).nextCalled, true);
});

test("CSRF middleware is mounted before API routes", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const middlewareIndex = server.indexOf("app.use(createCsrfProtection");
    const firstApiRoute = server.indexOf('app.get("/api/');
    assert.ok(middlewareIndex >= 0);
    assert.ok(firstApiRoute > middlewareIndex);
});
