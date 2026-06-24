const mongoose = require("mongoose");

const speakingQuestionSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
        trim: true
    }
}, { _id: false });

const speakingPart1TestSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: "",
        trim: true
    },
    questions: {
        type: [speakingQuestionSchema],
        default: []
    },
    prepTime: {
        type: String,
        default: "No prep",
        trim: true
    },
    speakingTime: {
        type: String,
        default: "5 min",
        trim: true
    },
    status: {
        type: String,
        enum: ["draft", "published"],
        default: "draft",
        index: true
    }
}, {
    timestamps: true,
    collection: "speaking_part1_tests"
});

module.exports = mongoose.models.SpeakingPart1Test || mongoose.model("SpeakingPart1Test", speakingPart1TestSchema);
