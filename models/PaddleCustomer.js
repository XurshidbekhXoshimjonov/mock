const mongoose = require("mongoose");

const paddleCustomerSchema = new mongoose.Schema({
    customerId: { type: String, required: true, unique: true, index: true },
    environment: { type: String, enum: ["sandbox", "production"], default: "sandbox", index: true },
    userId: { type: String, default: null, index: true },
    email: { type: String, default: "", lowercase: true, trim: true, index: true },
    name: { type: String, default: "" },
    status: { type: String, default: "active" },
    paddleCreatedAt: { type: Date, default: null },
    paddleUpdatedAt: { type: Date, default: null },
    lastEventId: { type: String, default: "" },
    lastEventOccurredAt: { type: Date, default: null, index: true }
}, { timestamps: true });

module.exports = mongoose.model("PaddleCustomer", paddleCustomerSchema);
