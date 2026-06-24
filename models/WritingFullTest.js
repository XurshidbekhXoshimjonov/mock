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
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.models.WritingFullTest || mongoose.model("WritingFullTest", writingFullTestSchema);
