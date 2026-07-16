"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    AuthRateLimitStore,
    clientAddress,
    createAuthRateLimiter,
    ipRule,
    emailRule
} = require("../lib/auth-rate-limit");

function responseStub() {
    return {
        headers: {},
        statusCode: 200,
        body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; }
    };
}

async function runMiddleware(middleware, req) {
    const res = responseStub();
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    return { res, nextCalled };
}

test("login limiter blocks the ninth attempt for one normalized email", async () => {
    let now = 1_000_000;
    const store = new AuthRateLimitStore({ now: () => now });
    const limiter = createAuthRateLimiter({
        store,
        rules: [emailRule({ scope: "login-email", limit: 8, windowMs: 15 * 60 * 1000 })]
    });
    const req = { body: { email: "  USER@Example.COM " }, headers: {}, ip: "127.0.0.1" };

    for (let attempt = 1; attempt <= 8; attempt += 1) {
        const result = await runMiddleware(limiter, { ...req });
        assert.equal(result.nextCalled, true, `attempt ${attempt}`);
    }

    const blocked = await runMiddleware(limiter, { ...req });
    assert.equal(blocked.nextCalled, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.body.error, "rate_limit_exceeded");
    assert.ok(Number(blocked.res.headers["Retry-After"]) >= 1);
    assert.equal(blocked.res.headers["RateLimit-Remaining"], "0");

    now += 15 * 60 * 1000;
    const nextWindow = await runMiddleware(limiter, { ...req });
    assert.equal(nextWindow.nextCalled, true);
});

test("IP and email limits use independent hashed buckets", async () => {
    const store = new AuthRateLimitStore({ now: () => 2_000_000 });
    const limiter = createAuthRateLimiter({
        store,
        rules: [
            ipRule({ scope: "login-ip", limit: 25, windowMs: 900_000, trustForwardedFor: false }),
            emailRule({ scope: "login-email", limit: 8, windowMs: 900_000 })
        ]
    });
    const req = { body: { email: "user@example.com" }, headers: {}, ip: "203.0.113.8" };
    const result = await runMiddleware(limiter, req);

    assert.equal(result.nextCalled, true);
    assert.equal(req.authRateLimitBuckets.length, 2);
    assert.match(req.authRateLimitBuckets[0], /^login-ip:[a-f0-9]{64}:/);
    assert.match(req.authRateLimitBuckets[1], /^login-email:[a-f0-9]{64}:/);
    assert.doesNotMatch(req.authRateLimitBuckets.join(" "), /user@example\.com|203\.0\.113\.8/);
});

test("forwarded client addresses are trusted only in configured proxy environments", () => {
    const req = {
        headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.2" },
        ip: "127.0.0.1"
    };
    assert.equal(clientAddress(req, false), "127.0.0.1");
    assert.equal(clientAddress(req, true), "198.51.100.7");
});

test("successful-login reset can clear only the email bucket", async () => {
    const store = new AuthRateLimitStore({ now: () => 3_000_000 });
    const email = await store.consume({ scope: "login-email", key: "user@example.com", windowMs: 900_000 });
    const ip = await store.consume({ scope: "login-ip", key: "127.0.0.1", windowMs: 900_000 });
    await store.reset([email.bucketId]);

    const emailAfterReset = await store.consume({ scope: "login-email", key: "user@example.com", windowMs: 900_000 });
    const ipAfterReset = await store.consume({ scope: "login-ip", key: "127.0.0.1", windowMs: 900_000 });
    assert.equal(emailAfterReset.count, 1);
    assert.equal(ipAfterReset.count, 2);
});

test("authentication routes mount distributed-capable limiters before handlers", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.match(server, /new AuthRateLimitStore\(\{ mongoose \}\)/);
    assert.match(server, /app\.post\("\/signup", signupRateLimit,/);
    assert.match(server, /app\.post\("\/login", loginRateLimit, handleLogin\)/);
    assert.match(server, /app\.post\("\/api\/auth\/login", loginRateLimit, handleLogin\)/);
    assert.match(server, /startsWith\("login-email:"\)/);
});
