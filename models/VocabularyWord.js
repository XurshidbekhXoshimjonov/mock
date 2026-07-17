const mongoose = require("mongoose");

const vocabularySourceSchema = new mongoose.Schema({
    sourceType: { type: String, enum: ["reading", "listening"], required: true },
    testId: { type: String, default: "" },
    testTitle: { type: String, default: "" },
    passageNumber: { type: Number, default: null },
    partNumber: { type: Number, default: null },
    questionNumber: { type: Number, default: null },
    contextSentence: { type: String, default: "" },
    transcriptContext: { type: String, default: "" },
    audioUrl: { type: String, default: "" },
    audioStartTime: { type: Number, default: null },
    audioEndTime: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });

const vocabularyWordSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    word: { type: String, required: true },
    normalizedWord: { type: String, required: true },
    definition: { type: String, default: "" },
    uzbekTranslation: { type: String, default: "" },
    partOfSpeech: { type: String, default: "" },
    pronunciation: { type: String, default: "" },
    simpleExample: { type: String, default: "" },
    synonyms: { type: [String], default: [] },
    antonyms: { type: [String], default: [] },
    sources: { type: [vocabularySourceSchema], default: [] },
    reviewStatus: { type: String, enum: ["new", "learning", "mastered"], default: "new", index: true },
    lastReviewedAt: { type: Date, default: null },
    nextReviewAt: { type: Date, default: null, index: true },
    reviewCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    difficulty: { type: String, enum: ["again", "hard", "good", "easy", ""], default: "" },
    reviewHistory: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, {
    timestamps: true,
    collection: "vocabulary_words"
});

vocabularyWordSchema.index({ userId: 1, normalizedWord: 1 }, { unique: true });
vocabularyWordSchema.index({ userId: 1, nextReviewAt: 1 });

module.exports = mongoose.models.VocabularyWord
    || mongoose.model("VocabularyWord", vocabularyWordSchema);
