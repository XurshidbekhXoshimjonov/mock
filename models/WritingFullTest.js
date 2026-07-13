const mongoose = require("mongoose");

const writingFullTestSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    task1PromptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WritingPrompt",
        required: true
    },
    task2PromptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WritingPrompt",
        required: true
    },
    timeLimit: {
        type: Number,
        default: 60
    },
    status: {
        type: String,
        enum: ["draft", "published"],
        default: "draft"
    },
    mockOnly: {
        type: Boolean,
        default: false,
        index: true
    },
    isPremium: {
        type: Boolean,
        default: false,
        index: true
    }
}, { 
    timestamps: true 
});

writingFullTestSchema.index({ status: 1, createdAt: -1 });
writingFullTestSchema.index({ task1PromptId: 1 });
writingFullTestSchema.index({ task2PromptId: 1 });

module.exports = mongoose.models.WritingFullTest || mongoose.model("WritingFullTest", writingFullTestSchema);
