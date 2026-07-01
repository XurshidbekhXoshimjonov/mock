const mongoose = require("mongoose");

const writingPromptSchema = new mongoose.Schema({
    taskType: {
        type: String,
        enum: ["task1", "task2"],
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    promptText: {
        type: String,
        required: true
    },
    instructions: {
        type: String,
        default: ""
    },
    questionType: {
        type: String,
        default: ""
    },
    wordLimit: {
        type: Number,
        default: 0
    },
    timeLimit: {
        type: Number,
        default: 0
    },
    imageUrl: {
        type: String,
        default: ""
    },
    difficulty: {
        type: String,
        enum: ["easy", "medium", "hard"],
        default: "medium"
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
    }
}, { 
    timestamps: true 
});

writingPromptSchema.index({ taskType: 1, status: 1, createdAt: -1 });
writingPromptSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.WritingPrompt || mongoose.model("WritingPrompt", writingPromptSchema);
