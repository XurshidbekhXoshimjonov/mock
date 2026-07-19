const mongoose = require("mongoose");

const aiConversationSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, default: "New conversation" },
    preview: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now, index: true }
}, {
    timestamps: true,
    collection: "ai_conversations"
});

aiConversationSchema.index({ userId: 1, lastMessageAt: -1 });

module.exports = mongoose.models.AIConversation
    || mongoose.model("AIConversation", aiConversationSchema);
