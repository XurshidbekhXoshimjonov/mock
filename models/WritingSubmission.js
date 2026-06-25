const mongoose = require("mongoose");

const writingSubmissionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    mode: {
        type: String,
        enum: ["task1", "task2", "full"],
        required: true
    },
    testType: {
        type: String,
        enum: ["task1", "task2", "full"],
        default: undefined
    },
    taskTitle: {
        type: String,
        default: ""
    },
    task1PromptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WritingPrompt"
    },
    task2PromptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WritingPrompt"
    },
    task1Essay: {
        type: String,
        default: ""
    },
    task2Essay: {
        type: String,
        default: ""
    },
    userResponse: {
        type: String,
        default: ""
    },
    task1Response: {
        type: String,
        default: ""
    },
    task2Response: {
        type: String,
        default: ""
    },
    criteriaScores: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    overallBand: {
        type: Number,
        default: 0
    },
    task1Band: {
        type: Number,
        default: 0
    },
    task2Band: {
        type: Number,
        default: 0
    },
    strengths: {
        type: [String],
        default: []
    },
    areasForImprovement: {
        type: [String],
        default: []
    },
    suggestions: {
        type: [String],
        default: []
    },
    task1WordCount: {
        type: Number,
        default: 0
    },
    task2WordCount: {
        type: Number,
        default: 0
    },
    timeSpent: {
        type: Number,
        default: 0 // in seconds
    },
    feedback: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    estimatedBand: {
        type: Number,
        required: true
    }
}, { 
    timestamps: true 
});

writingSubmissionSchema.index({ userId: 1, createdAt: -1 });
writingSubmissionSchema.index({ mode: 1, createdAt: -1 });
writingSubmissionSchema.index({ testType: 1, createdAt: -1 });
writingSubmissionSchema.index({ task1PromptId: 1, createdAt: -1 });
writingSubmissionSchema.index({ task2PromptId: 1, createdAt: -1 });

module.exports = mongoose.models.WritingSubmission || mongoose.model("WritingSubmission", writingSubmissionSchema);
