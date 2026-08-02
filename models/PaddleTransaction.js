const mongoose = require("mongoose");

const paddleTransactionSchema = new mongoose.Schema({
    transactionId: { type: String, required: true, unique: true, index: true },
    environment: { type: String, enum: ["sandbox", "production"], default: "sandbox", index: true },
    customerId: { type: String, default: null, index: true },
    subscriptionId: { type: String, default: null, index: true },
    userId: { type: String, default: null, index: true },
    status: { type: String, required: true },
    currencyCode: { type: String, default: "" },
    total: { type: String, default: "" },
    priceIds: { type: [String], default: [] },
    customData: { type: mongoose.Schema.Types.Mixed, default: null },
    paddleCreatedAt: { type: Date, default: null },
    paddleUpdatedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastEventId: { type: String, default: "" },
    lastEventOccurredAt: { type: Date, default: null, index: true }
}, { timestamps: true });

module.exports = mongoose.model("PaddleTransaction", paddleTransactionSchema);
