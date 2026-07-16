const mongoose = require("mongoose");

const manualPaymentRequestSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    userEmail: {
        type: String,
        default: ""
    },
    userName: {
        type: String,
        default: ""
    },
    planId: {
        type: String,
        enum: ["monthly", "threeMonths", "annual"],
        required: true,
        index: true
    },
    planName: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "UZS"
    },
    paymentMethod: {
        type: String,
        default: "manual_card"
    },
    status: {
        type: String,
        enum: ["pending", "verified", "rejected", "cancelled"],
        default: "pending",
        index: true
    },
    cardLastFour: {
        type: String,
        default: "0011"
    },
    verifiedAt: {
        type: Date,
        default: null
    },
    verifiedBy: {
        type: String,
        default: null
    },
    rejectedAt: {
        type: Date,
        default: null
    },
    rejectedBy: {
        type: String,
        default: null
    },
    adminNote: {
        type: String,
        default: ""
    }
}, {
    timestamps: true
});

manualPaymentRequestSchema.index({ userId: 1, planId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("ManualPaymentRequest", manualPaymentRequestSchema);
