const express = require("express");
const { EventName } = require("@paddle/paddle-node-sdk");
const { getPaddleInstance } = require("./paddle-client");
const { requirePaddleWebhookIp } = require("./paddle-ip-allowlist");
const {
    handleCustomerEvent,
    handleSubscriptionEvent,
    handleTransactionCompletedEvent
} = require("./paddle-sync");

/**
 * @param {import("@paddle/paddle-node-sdk").EventEntity} event
 */
async function routePaddleEvent(event) {
    switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionCanceled:
        return handleSubscriptionEvent(event);
    case EventName.CustomerCreated:
    case EventName.CustomerUpdated:
        return handleCustomerEvent(event);
    case EventName.TransactionCompleted:
        return handleTransactionCompletedEvent(event);
    default:
        return null;
    }
}

function registerPaddleWebhookRoute(app) {
    app.post(
        "/api/paddle/webhook",
        requirePaddleWebhookIp,
        express.raw({ type: "application/json", limit: "1mb" }),
        async (req, res) => {
            const signature = String(req.get("paddle-signature") || "").trim();
            const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
            const secret = String(process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET || "").trim();

            if (!signature || !rawBody || !secret) {
                return res.status(400).json({ error: "Missing Paddle webhook signature, raw body, or signing secret" });
            }

            try {
                const event = await getPaddleInstance().webhooks.unmarshal(rawBody, secret, signature);
                if (event) await routePaddleEvent(event);
                return res.status(200).json({ received: true });
            } catch (error) {
                console.error("Paddle webhook delivery failed:", error?.message || error);
                return res.status(500).json({ error: "Paddle webhook delivery failed" });
            }
        }
    );
}

module.exports = { registerPaddleWebhookRoute, routePaddleEvent };
