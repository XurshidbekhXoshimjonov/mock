const mongoose = require("mongoose");

const reviewMistakeSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    attemptId: { type: String, required: true },
    testId: { type: String, default: "" },
    testTitle: { type: String, default: "" },
    skill: { type: String, enum: ["listening", "reading"], required: true, index: true },
    sectionNumber: { type: Number, default: null },
    sectionLabel: { type: String, default: "" },
    partNumber: { type: Number, default: null },
    questionGroupId: { type: String, default: "" },
    questionId: { type: String, required: true },
    questionNumber: { type: Number, required: true },
    questionType: { type: String, default: "" },
    questionText: { type: String, default: "" },
    options: { type: [mongoose.Schema.Types.Mixed], default: [] },
    userAnswer: { type: mongoose.Schema.Types.Mixed, default: "" },
    correctAnswer: { type: mongoose.Schema.Types.Mixed, required: true },
    acceptedAnswers: { type: [String], default: [] },
    instructions: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    context: { type: String, default: "" },
    transcriptText: { type: String, default: "" },
    transcriptStartTime: { type: Number, default: null },
    evidenceStartTime: { type: Number, default: null },
    evidenceEndTime: { type: Number, default: null },
    audioUrl: { type: String, default: "" },
    status: { type: String, enum: ["new", "learning", "mastered"], default: "new", index: true },
    reviewCount: { type: Number, default: 0 },
    correctReviewCount: { type: Number, default: 0 },
    lastReviewedAt: { type: Date, default: null }
}, {
    timestamps: true,
    collection: "review_mistakes"
});

reviewMistakeSchema.index(
    { userId: 1, attemptId: 1, skill: 1, questionId: 1 },
    { unique: true }
);
reviewMistakeSchema.index({ userId: 1, status: 1, createdAt: -1 });
reviewMistakeSchema.index({ userId: 1, skill: 1, createdAt: -1 });

module.exports = mongoose.models.ReviewMistake
    || mongoose.model("ReviewMistake", reviewMistakeSchema);
