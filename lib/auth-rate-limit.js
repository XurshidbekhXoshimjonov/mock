"use strict";

const crypto = require("crypto");

function hashKey(value) {
    return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function clientAddress(req, trustForwardedFor = false) {
    if (trustForwardedFor) {
        const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
        if (forwarded) return forwarded;
    }
    return String(req.ip || req.socket?.remoteAddress || "unknown").trim() || "unknown";
}

class AuthRateLimitStore {
    constructor({ mongoose = null, collectionName = "auth_rate_limits", now = () => Date.now() } = {}) {
        this.mongoose = mongoose;
        this.collectionName = collectionName;
        this.now = now;
        this.memory = new Map();
        this.indexPromise = null;
    }

    collection() {
        if (this.mongoose?.connection?.readyState !== 1 || !this.mongoose.connection.db) return null;
        return this.mongoose.connection.db.collection(this.collectionName);
    }

    ensureMongoIndex(collection) {
        if (!this.indexPromise) {
            this.indexPromise = collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
                .catch((error) => {
                    this.indexPromise = null;
                    throw error;
                });
        }
        return this.indexPromise;
    }

    bucket(scope, key, windowMs, timestamp) {
        const windowStart = Math.floor(timestamp / windowMs) * windowMs;
        return {
            id: `${scope}:${hashKey(key)}:${windowStart}`,
            windowStart,
            resetAt: windowStart + windowMs
        };
    }

    pruneMemory(timestamp) {
        if (this.memory.size < 500) return;
        for (const [id, entry] of this.memory) {
            if (entry.resetAt <= timestamp) this.memory.delete(id);
        }
        while (this.memory.size >= 10_000) {
            this.memory.delete(this.memory.keys().next().value);
        }
    }

    consumeMemory(bucket) {
        this.pruneMemory(this.now());
        const count = (this.memory.get(bucket.id)?.count || 0) + 1;
        this.memory.set(bucket.id, { count, resetAt: bucket.resetAt });
        return count;
    }

    async consume({ scope, key, windowMs }) {
        const timestamp = this.now();
        const bucket = this.bucket(scope, key, windowMs, timestamp);
        const collection = this.collection();

        if (collection) {
            try {
                await this.ensureMongoIndex(collection);
                await collection.updateOne(
                    { _id: bucket.id },
                    {
                        $inc: { count: 1 },
                        $setOnInsert: {
                            scope,
                            windowStart: new Date(bucket.windowStart),
                            expiresAt: new Date(bucket.resetAt + windowMs)
                        }
                    },
                    { upsert: true }
                );
                const document = await collection.findOne({ _id: bucket.id }, { projection: { count: 1 } });
                return { count: Number(document?.count) || 1, resetAt: bucket.resetAt, bucketId: bucket.id };
            } catch (error) {
                console.warn("Auth rate-limit MongoDB store unavailable; using local fallback:", error.message);
            }
        }

        return { count: this.consumeMemory(bucket), resetAt: bucket.resetAt, bucketId: bucket.id };
    }

    async reset(bucketIds = []) {
        const ids = [...new Set(bucketIds.filter(Boolean))];
        ids.forEach((id) => this.memory.delete(id));
        const collection = this.collection();
        if (collection && ids.length) {
            try {
                await collection.deleteMany({ _id: { $in: ids } });
            } catch (error) {
                console.warn("Could not reset auth rate-limit counters:", error.message);
            }
        }
    }
}

function rateLimitResponse(res, rule, result) {
    const retryAfterSeconds = Math.max(Math.ceil((result.resetAt - Date.now()) / 1000), 1);
    res.setHeader("RateLimit-Limit", String(rule.limit));
    res.setHeader("RateLimit-Remaining", "0");
    res.setHeader("RateLimit-Reset", String(retryAfterSeconds));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.setHeader("Cache-Control", "no-store");
    return res.status(429).json({
        success: false,
        error: "rate_limit_exceeded",
        message: rule.message || "Too many authentication attempts. Please try again later."
    });
}

function createAuthRateLimiter({ store, rules }) {
    return async function authRateLimiter(req, res, next) {
        req.authRateLimitBuckets = req.authRateLimitBuckets || [];
        try {
            for (const rule of rules) {
                const key = rule.key(req);
                if (!key) continue;
                const result = await store.consume({ scope: rule.scope, key, windowMs: rule.windowMs });
                req.authRateLimitBuckets.push(result.bucketId);
                const remaining = Math.max(rule.limit - result.count, 0);
                res.setHeader("RateLimit-Limit", String(rule.limit));
                res.setHeader("RateLimit-Remaining", String(remaining));
                res.setHeader("RateLimit-Reset", String(Math.max(Math.ceil((result.resetAt - Date.now()) / 1000), 1)));
                if (result.count > rule.limit) return rateLimitResponse(res, rule, result);
            }
            return next();
        } catch (error) {
            console.error("Auth rate-limit middleware error:", error);
            return res.status(503).json({ success: false, message: "Authentication protection is temporarily unavailable" });
        }
    };
}

function ipRule({ scope, limit, windowMs, trustForwardedFor, message }) {
    return { scope, limit, windowMs, message, key: (req) => clientAddress(req, trustForwardedFor) };
}

function emailRule({ scope, limit, windowMs, message }) {
    return { scope, limit, windowMs, message, key: (req) => normalizeEmail(req.body?.email) };
}

module.exports = {
    AuthRateLimitStore,
    clientAddress,
    normalizeEmail,
    createAuthRateLimiter,
    ipRule,
    emailRule
};
