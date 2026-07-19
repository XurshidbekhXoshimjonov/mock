const mongoose = require("mongoose");

const aiMessageSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true,
    collection: "ai_messages"
});

aiMessageSchema.index({ userId: 1, conversationId: 1, createdAt: 1 });

module.exports = mongoose.models.AIMessage || mongoose.model("AIMessage", aiMessageSchema);
