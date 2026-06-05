const mongoose = require("mongoose");

/**
 * Optional MongoDB schema for full IELTS tests.
 * Primary storage remains JSON files in data/full-tests/.
 * Enable by setting FULL_TESTS_IN_MONGO=true when saving.
 */
const questionSchema = new mongoose.Schema({
    number: Number,
    type: String,
    question: String,
    options: [String],
    answer: String
}, { _id: false });

const questionGroupSchema = new mongoose.Schema({
    instructionTitle: String,
    instructionText: String,
    rule: String,
    questionRange: [Number],
    questionType: String,
    layoutHtml: String,
    imageIds: [String],
    questions: [questionSchema]
}, { _id: false });

const passageSchema = new mongoose.Schema({
    number: Number,
    title: String,
    passageText: String,
    passageHtml: String,
    questionGroups: [questionGroupSchema]
}, { _id: false });

const listeningSectionSchema = new mongoose.Schema({
    number: Number,
    title: String,
    questionGroups: [questionGroupSchema]
}, { _id: false });

const imageSchema = new mongoose.Schema({
    id: String,
    src: String,
    alt: String,
    section: String,
    sectionNumber: Number,
    questionGroupIndex: Number
}, { _id: false });

const fullTestSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    sourceFile: String,
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    layout: String,
    metadata: {
        book: String,
        testNumber: Number,
        label: String
    },
    reading: {
        passages: [passageSchema]
    },
    listening: {
        audio: String,
        transcript: String,
        sections: [listeningSectionSchema]
    },
    answers: mongoose.Schema.Types.Mixed,
    images: [imageSchema],
    parseReport: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
    publishedAt: Date
});

module.exports = mongoose.models.FullTest || mongoose.model("FullTest", fullTestSchema);
