const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Environment, Paddle } = require("@paddle/paddle-node-sdk");
const { subscriptionGrantsPaidAccess } = require("../lib/paddle-access");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("paid access follows actual Paddle status, not a scheduled change", () => {
    assert.equal(subscriptionGrantsPaidAccess({ status: "active", scheduledChangeAction: "cancel" }), true);
    assert.equal(subscriptionGrantsPaidAccess({ status: "trialing", scheduledChangeAction: "pause" }), true);
    assert.equal(subscriptionGrantsPaidAccess({ status: "canceled" }), false);
    assert.equal(subscriptionGrantsPaidAccess({ status: "paused" }), false);
    assert.equal(subscriptionGrantsPaidAccess({ status: "past_due" }), false);
    assert.equal(subscriptionGrantsPaidAccess(null), false);
});

test("Paddle SDK verifies the unchanged raw request body", async () => {
    const rawBody = JSON.stringify({
        event_id: "evt_test",
        event_type: "customer.created",
        occurred_at: new Date().toISOString(),
        notification_id: "ntf_test",
        data: {
            id: "ctm_test",
            name: null,
            email: "test@example.com",
            locale: "en",
            marketing_consent: false,
            status: "active",
            custom_data: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            import_meta: null
        }
    });
    const secret = "test_notification_signing_secret";
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = crypto.createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
    const signature = `ts=${timestamp};h1=${digest}`;
    const paddle = new Paddle("pdl_sdbx_apikey_test", { environment: Environment.sandbox });

    const event = await paddle.webhooks.unmarshal(rawBody, secret, signature);
    assert.equal(event.eventType, "customer.created");
    await assert.rejects(() => paddle.webhooks.unmarshal(`${rawBody} `, secret, signature));
});

test("webhook route is raw, verified first, retry-safe, and mounted before JSON parsing", () => {
    const server = read("server.js");
    const webhook = read("lib/paddle-webhooks.js");
    assert.ok(server.indexOf("registerPaddleWebhookRoute(app)") < server.indexOf("app.use(express.json"));
    assert.match(webhook, /express\.raw\(\{ type: "application\/json"/);
    assert.doesNotMatch(webhook, /JSON\.parse\(req\.body/);
    assert.ok(webhook.indexOf("webhooks.unmarshal(rawBody, secret, signature)") < webhook.lastIndexOf("routePaddleEvent(event)"));
    assert.match(webhook, /res\.status\(500\)/);
    for (const eventName of [
        "SubscriptionCreated", "SubscriptionUpdated", "SubscriptionCanceled",
        "CustomerCreated", "CustomerUpdated", "TransactionCompleted"
    ]) {
        assert.match(webhook, new RegExp(`EventName\\.${eventName}`));
    }
});

test("portal resolves Paddle ownership server-side after auth", () => {
    const portal = read("lib/paddle-portal-routes.js");
    assert.match(portal, /app\.post\("\/api\/paddle\/customer-portal", requireUser/);
    assert.doesNotMatch(portal, /req\.body[^\n]*customer/i);
    assert.match(portal, /PaddleCustomer\.findOne/);
    assert.match(portal, /customerPortalSessions\.create/);
    assert.match(portal, /return res\.json\(\{ url \}\)/);
});

test("Paddle resource mirrors use unique stable resource IDs", () => {
    assert.match(read("models/PaddleCustomer.js"), /customerId: \{ type: String, required: true, unique: true/);
    assert.match(read("models/PaddleSubscription.js"), /subscriptionId: \{ type: String, required: true, unique: true/);
    assert.match(read("models/PaddleTransaction.js"), /transactionId: \{ type: String, required: true, unique: true/);
    assert.match(read("lib/paddle-sync.js"), /lastEventOccurredAt: \{ \$lte: occurredAt \}/);
});
