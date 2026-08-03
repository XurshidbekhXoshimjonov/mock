const crypto = require("crypto");
const express = require("express");
const {
    isManualPremiumActive,
    isLemonSqueezyPremiumActive,
    effectivePremiumDates,
    validDate
} = require("./subscription-access");

const SUPPORTED_EVENTS = new Set([
    "subscription_created",
    "subscription_updated",
    "subscription_payment_success",
    "subscription_cancelled",
    "subscription_resumed",
    "subscription_expired",
    "subscription_payment_failed"
]);

const PLAN_ALIASES = Object.freeze({
    monthly: "monthly",
    three_months: "three_months",
    threeMonths: "three_months",
    yearly: "yearly",
    annual: "yearly"
});

function verifySignature(rawBody, signature, secret) {
    if (!Buffer.isBuffer(rawBody) || !secret || !/^[a-f\d]{64}$/i.test(String(signature || ""))) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
    const supplied = Buffer.from(signature, "hex");
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function eventStatus(eventName, attributes) {
    const supplied = String(attributes.status || "").trim().toLowerCase();
    if (eventName === "subscription_cancelled") return "cancelled";
    if (eventName === "subscription_expired") return "expired";
    if (eventName === "subscription_payment_failed") return "past_due";
    if (eventName === "subscription_resumed") return supplied === "expired" ? "active" : (supplied || "active");
    if (eventName === "subscription_payment_success") return "active";
    return supplied || "active";
}

function compactUpdates(updates) {
    return Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
}

function buildSubscriptionUpdates({ payload, eventName, rawBody, existingUser, now = new Date() }) {
    const attributes = payload?.data?.attributes || {};
    const customData = payload?.meta?.custom_data || {};
    const eventHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    if (existingUser.lemonSqueezyLastEventHash === eventHash) return {};
    const incomingEventAt = validDate(attributes.updated_at);
    const lastEventAt = validDate(existingUser.lemonSqueezyLastEventAt);
    if (incomingEventAt && lastEventAt && incomingEventAt.getTime() < lastEventAt.getTime()) return {};
    const status = eventStatus(eventName, attributes);
    const isInvoiceEvent = String(payload?.data?.type || "") === "subscription-invoices"
        || eventName === "subscription_payment_success"
        || eventName === "subscription_payment_failed";
    const plan = PLAN_ALIASES[String(customData.plan || "").trim()] || existingUser.subscriptionPlan || null;
    const subscriptionId = isInvoiceEvent ? attributes.subscription_id : payload?.data?.id;
    const createdAt = (isInvoiceEvent ? existingUser.lemonSqueezyActivatedAt : validDate(attributes.created_at))
        || validDate(attributes.created_at)
        || now;
    const renewsAt = isInvoiceEvent ? validDate(existingUser.subscriptionRenewsAt) : validDate(attributes.renews_at);
    const endsAt = isInvoiceEvent ? validDate(existingUser.subscriptionEndsAt) : validDate(attributes.ends_at);
    const providerState = {
        ...existingUser,
        lemonSqueezySubscriptionId: subscriptionId == null ? existingUser.lemonSqueezySubscriptionId : String(subscriptionId),
        subscriptionStatus: status,
        subscriptionEndsAt: endsAt
    };
    const lemonAccess = isLemonSqueezyPremiumActive(providerState, now);
    const manualAccess = isManualPremiumActive(existingUser, now);
    const isPremium = lemonAccess || manualAccess;
    const dates = effectivePremiumDates({
        ...providerState,
        lemonSqueezyActivatedAt: createdAt
    }, now);

    return compactUpdates({
        lemonSqueezySubscriptionId: providerState.lemonSqueezySubscriptionId,
        lemonSqueezyCustomerId: attributes.customer_id == null ? undefined : String(attributes.customer_id),
        lemonSqueezyVariantId: attributes.variant_id == null ? undefined : String(attributes.variant_id),
        lemonSqueezyActivatedAt: createdAt,
        lemonSqueezyLastEventHash: eventHash,
        lemonSqueezyLastEventAt: incomingEventAt || now,
        subscriptionPlan: plan,
        subscriptionStatus: status,
        subscriptionRenewsAt: renewsAt,
        subscriptionEndsAt: endsAt,
        subscriptionStartedAt: createdAt,
        subscriptionExpiresAt: endsAt,
        premiumActivatedAt: dates.activatedAt || createdAt,
        premiumExpiresAt: dates.expiresAt,
        premiumUntil: dates.expiresAt,
        isPremium,
        plan: isPremium ? "premium" : "free"
    });
}

function registerLemonSqueezyWebhookRoute(app, { userStore, secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET } = {}) {
    app.post("/api/webhooks/lemonsqueezy", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
        if (!secret) {
            console.error("Lemon Squeezy webhook secret is not configured.");
            return res.status(500).json({ error: "Webhook is not configured" });
        }
        if (!verifySignature(req.body, req.get("X-Signature"), secret)) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        let payload;
        try {
            payload = JSON.parse(req.body.toString("utf8"));
        } catch {
            return res.status(400).json({ error: "Invalid JSON payload" });
        }

        const eventName = String(payload?.meta?.event_name || "").trim();
        if (!SUPPORTED_EVENTS.has(eventName)) return res.status(200).json({ received: true, ignored: true });

        const userId = String(payload?.meta?.custom_data?.user_id || "").trim();
        if (!userId) return res.status(422).json({ error: "Missing meta.custom_data.user_id" });

        try {
            const user = await userStore.findUserById(userId);
            if (!user) return res.status(404).json({ error: "User not found" });
            const existingUser = typeof user.toObject === "function" ? user.toObject() : user;
            const updates = buildSubscriptionUpdates({ payload, eventName, rawBody: req.body, existingUser });
            await userStore.updateUser(String(user._id || user.id), updates);
            return res.status(200).json({ received: true });
        } catch (error) {
            console.error("Lemon Squeezy webhook processing error:", error);
            return res.status(500).json({ error: "Webhook processing failed" });
        }
    });
}

module.exports = {
    SUPPORTED_EVENTS,
    verifySignature,
    eventStatus,
    buildSubscriptionUpdates,
    registerLemonSqueezyWebhookRoute
};
