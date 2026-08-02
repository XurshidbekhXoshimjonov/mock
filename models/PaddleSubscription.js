const mongoose = require("mongoose");

const paddleSubscriptionSchema = new mongoose.Schema({
    subscriptionId: { type: String, required: true, unique: true, index: true },
    environment: { type: String, enum: ["sandbox", "production"], default: "sandbox", index: true },
    customerId: { type: String, required: true, index: true },
    userId: { type: String, default: null, index: true },
    status: { type: String, required: true, index: true },
    priceId: { type: String, required: true },
    productId: { type: String, required: true },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
    scheduledChangeAction: { type: String, default: null },
    scheduledChangeAt: { type: Date, default: null },
    currentBillingPeriodStartsAt: { type: Date, default: null },
    currentBillingPeriodEndsAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    nextBilledAt: { type: Date, default: null },
    currencyCode: { type: String, default: "" },
    customData: { type: mongoose.Schema.Types.Mixed, default: null },
    paddleCreatedAt: { type: Date, default: null },
    paddleUpdatedAt: { type: Date, default: null },
    lastEventId: { type: String, default: "" },
    lastEventOccurredAt: { type: Date, default: null, index: true }
}, { timestamps: true });

paddleSubscriptionSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model("PaddleSubscription", paddleSubscriptionSchema);
