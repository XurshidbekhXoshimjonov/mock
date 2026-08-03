const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const {
    verifySignature,
    eventStatus,
    buildSubscriptionUpdates,
    registerLemonSqueezyWebhookRoute
} = require("../lib/lemonsqueezy-webhook");
const { hasEffectivePremiumAccess } = require("../lib/subscription-access");

function payload(eventName, status = "active") {
    return {
        meta: { event_name: eventName, custom_data: { user_id: "user-1", plan: "three_months" } },
        data: {
            type: "subscriptions",
            id: "sub_123",
            attributes: {
                customer_id: 456,
                variant_id: 789,
                status,
                created_at: "2026-08-01T00:00:00.000Z",
                updated_at: "2026-08-03T00:00:00.000Z",
                renews_at: "2026-11-01T00:00:00.000Z",
                ends_at: "2026-11-01T00:00:00.000Z"
            }
        }
    };
}

test("verifies the Lemon Squeezy HMAC against the raw body", () => {
    const body = Buffer.from('{"signed":true}');
    const signature = crypto.createHmac("sha256", "secret").update(body).digest("hex");
    assert.equal(verifySignature(body, signature, "secret"), true);
    assert.equal(verifySignature(body, "0".repeat(64), "secret"), false);
});

test("maps webhook data to provider fields and grants non-expired access", () => {
    const body = Buffer.from("three-month subscription");
    const updates = buildSubscriptionUpdates({
        payload: payload("subscription_created"),
        eventName: "subscription_created",
        rawBody: body,
        existingUser: {},
        now: new Date("2026-08-03T12:00:00.000Z")
    });
    assert.equal(updates.lemonSqueezySubscriptionId, "sub_123");
    assert.equal(updates.lemonSqueezyCustomerId, "456");
    assert.equal(updates.lemonSqueezyVariantId, "789");
    assert.equal(updates.subscriptionPlan, "three_months");
    assert.equal(updates.subscriptionStatus, "active");
    assert.equal(updates.isPremium, true);
});

test("cancelled access lasts until ends_at and expired does not revoke a manual grant", () => {
    assert.equal(eventStatus("subscription_cancelled", {}), "cancelled");
    assert.equal(hasEffectivePremiumAccess({
        lemonSqueezySubscriptionId: "sub_123",
        subscriptionStatus: "cancelled",
        subscriptionEndsAt: "2026-09-01T00:00:00.000Z"
    }, new Date("2026-08-03T00:00:00.000Z")), true);
    const body = Buffer.from("expired subscription");
    const updates = buildSubscriptionUpdates({
        payload: payload("subscription_expired", "expired"),
        eventName: "subscription_expired",
        rawBody: body,
        existingUser: {
            manualPremiumActive: true,
            manualPremiumStartsAt: "2026-08-01T00:00:00.000Z",
            manualPremiumEndsAt: "2027-08-01T00:00:00.000Z"
        },
        now: new Date("2026-08-03T12:00:00.000Z")
    });
    assert.equal(updates.subscriptionStatus, "expired");
    assert.equal(updates.isPremium, true);
});

test("payment events use the invoice subscription_id without replacing subscription dates", () => {
    const invoicePayload = payload("subscription_payment_failed", "pending");
    invoicePayload.data.type = "subscription-invoices";
    invoicePayload.data.id = "invoice_999";
    invoicePayload.data.attributes.subscription_id = 123;
    delete invoicePayload.data.attributes.variant_id;
    delete invoicePayload.data.attributes.renews_at;
    delete invoicePayload.data.attributes.ends_at;
    const updates = buildSubscriptionUpdates({
        payload: invoicePayload,
        eventName: "subscription_payment_failed",
        rawBody: Buffer.from("failed invoice"),
        existingUser: {
            lemonSqueezySubscriptionId: "123",
            lemonSqueezyVariantId: "789",
            lemonSqueezyActivatedAt: "2026-08-01T00:00:00.000Z",
            subscriptionRenewsAt: "2026-11-01T00:00:00.000Z",
            subscriptionEndsAt: null
        },
        now: new Date("2026-08-03T12:00:00.000Z")
    });
    assert.equal(updates.lemonSqueezySubscriptionId, "123");
    assert.equal(updates.subscriptionStatus, "past_due");
    assert.equal(updates.subscriptionRenewsAt.toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(updates.subscriptionEndsAt, null);
    assert.equal(updates.lemonSqueezyVariantId, undefined);
    assert.equal(updates.isPremium, true);
});

test("duplicate webhook bodies are no-ops", () => {
    const body = Buffer.from("same event");
    const hash = crypto.createHash("sha256").update(body).digest("hex");
    const updates = buildSubscriptionUpdates({
        payload: payload("subscription_updated"),
        eventName: "subscription_updated",
        rawBody: body,
        existingUser: { lemonSqueezyLastEventHash: hash }
    });
    assert.deepEqual(updates, {});
});

test("the HTTP endpoint rejects bad signatures and processes signed raw JSON", async () => {
    const app = express();
    const saved = [];
    registerLemonSqueezyWebhookRoute(app, {
        secret: "webhook-secret",
        userStore: {
            async findUserById(id) {
                return id === "user-1" ? { id, email: "student@example.com" } : null;
            },
            async findUserByLemonSqueezySubscriptionId(subscriptionId) {
                return subscriptionId === "sub_123"
                    ? { id: "user-1", lemonSqueezySubscriptionId: "sub_123", subscriptionStatus: "active" }
                    : null;
            },
            async updateUser(id, updates) {
                saved.push({ id, updates });
                return { id, ...updates };
            }
        }
    });
    app.use(express.json());
    const server = await new Promise((resolve) => {
        const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });

    try {
        const signedPayload = payload("subscription_payment_success");
        signedPayload.data.type = "subscription-invoices";
        signedPayload.data.attributes.subscription_id = 123;
        const body = JSON.stringify(signedPayload);
        const baseUrl = `http://127.0.0.1:${server.address().port}/api/webhooks/lemonsqueezy`;
        const rejected = await fetch(baseUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "x-signature": "0".repeat(64) },
            body
        });
        assert.equal(rejected.status, 401);

        const signature = crypto.createHmac("sha256", "webhook-secret").update(Buffer.from(body)).digest("hex");
        const accepted = await fetch(baseUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "x-signature": signature },
            body
        });
        assert.equal(accepted.status, 200);
        assert.equal(saved.length, 1);
        assert.equal(saved[0].id, "user-1");
        assert.equal(saved[0].updates.isPremium, true);

        const laterPayload = payload("subscription_updated");
        delete laterPayload.meta.custom_data.user_id;
        const laterBody = JSON.stringify(laterPayload);
        const laterSignature = crypto.createHmac("sha256", "webhook-secret").update(Buffer.from(laterBody)).digest("hex");
        const linkedBySubscription = await fetch(baseUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "x-signature": laterSignature },
            body: laterBody
        });
        assert.equal(linkedBySubscription.status, 200);
        assert.equal(saved.length, 2);

        laterPayload.data.id = "unlinked_old_subscription";
        const oldBody = JSON.stringify(laterPayload);
        const oldSignature = crypto.createHmac("sha256", "webhook-secret").update(Buffer.from(oldBody)).digest("hex");
        const ignored = await fetch(baseUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "x-signature": oldSignature },
            body: oldBody
        });
        assert.equal(ignored.status, 200);
        assert.equal((await ignored.json()).ignored, true);
        assert.equal(saved.length, 2);

        const unlinkedCreatedPayload = payload("subscription_created");
        delete unlinkedCreatedPayload.meta.custom_data.user_id;
        const unlinkedCreatedBody = JSON.stringify(unlinkedCreatedPayload);
        const unlinkedCreatedSignature = crypto.createHmac("sha256", "webhook-secret").update(Buffer.from(unlinkedCreatedBody)).digest("hex");
        const ignoredCreated = await fetch(baseUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "x-signature": unlinkedCreatedSignature },
            body: unlinkedCreatedBody
        });
        assert.equal(ignoredCreated.status, 200);
        assert.equal((await ignoredCreated.json()).ignored, true);
        assert.equal(saved.length, 2);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});
