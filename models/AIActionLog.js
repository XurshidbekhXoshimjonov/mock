const mongoose = require("mongoose");

const aiActionLogSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    status: { type: String, enum: ["pending", "completed", "cancelled", "failed"], default: "pending" },
    input: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: { type: mongoose.Schema.Types.Mixed, default: {} },
    confirmedAt: { type: Date, default: null }
}, {
    timestamps: true,
    collection: "ai_action_logs"
});

aiActionLogSchema.index({ userId: 1, createdAt: -1 });
aiActionLogSchema.index({ userId: 1, conversationId: 1, createdAt: -1 });

module.exports = mongoose.models.AIActionLog || mongoose.model("AIActionLog", aiActionLogSchema);
