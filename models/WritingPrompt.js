const mongoose = require("mongoose");

const writingPromptSchema = new mongoose.Schema({
    taskType: {
        type: String,
        enum: ["task1", "task2"],
        required: true
    },
    assessmentType: {
        type: String,
        enum: ["academic_task1", "general_task1", "task2"],
        default: undefined
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
    visualDiagramUrl: {
        type: String,
        default: ""
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
    },
    fullTestOnly: {
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

writingPromptSchema.index({ taskType: 1, status: 1, createdAt: -1 });
writingPromptSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.WritingPrompt || mongoose.model("WritingPrompt", writingPromptSchema);
