const mongoose = require("mongoose");

const speakingSubmissionSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    userObjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: undefined
    },
    testType: {
        type: String,
        enum: ["part_1", "cue_card", "part_3", "full_test"],
        required: true,
        index: true
    },
    title: {
        type: String,
        default: ""
    },
    topic: {
        type: String,
        default: ""
    },
    prompt: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    parts: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
    },
    audioFiles: {
        type: [String],
        default: []
    },
    transcript: {
        type: String,
        default: ""
    },
    criteriaScores: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    overallBand: {
        type: Number,
        required: true
    },
    strengths: {
        type: [String],
        default: []
    },
    problems: {
        type: [String],
        default: []
    },
    howToImprove: {
        type: [String],
        default: []
    },
    improvedAnswers: {
        type: [String],
        default: []
    },
    practicalTips: {
        type: [String],
        default: []
    },
    feedback: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

speakingSubmissionSchema.index({ userId: 1, createdAt: -1 });
speakingSubmissionSchema.index({ userObjectId: 1, createdAt: -1 });
speakingSubmissionSchema.index({ testType: 1, createdAt: -1 });

module.exports = mongoose.models.SpeakingSubmission || mongoose.model("SpeakingSubmission", speakingSubmissionSchema);
