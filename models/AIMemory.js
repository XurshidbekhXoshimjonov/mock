const mongoose = require("mongoose");

const aiMemorySchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    key: {
        type: String,
        required: true,
        enum: ["preferredStudyTime", "examDate", "weakestSkill", "dailyAvailableMinutes"]
    },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    source: { type: String, default: "user_confirmed" }
}, {
    timestamps: true,
    collection: "ai_memories"
});

aiMemorySchema.index({ userId: 1, key: 1 }, { unique: true });

module.exports = mongoose.models.AIMemory || mongoose.model("AIMemory", aiMemorySchema);
