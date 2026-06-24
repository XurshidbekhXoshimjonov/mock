const mongoose = require("mongoose");

const fullSpeakingTestSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    part1Id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SpeakingPart1Test",
        default: null
    },
    part2Id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SpeakingPart2Test",
        default: null
    },
    part3Id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SpeakingPart3Test",
        default: null
    },
    estimatedTime: {
        type: String,
        default: "11-14 min",
        trim: true
    },
    aiFeedback: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ["draft", "published"],
        default: "draft",
        index: true
    }
}, {
    timestamps: true,
    collection: "full_speaking_tests"
});

module.exports = mongoose.models.FullSpeakingTest || mongoose.model("FullSpeakingTest", fullSpeakingTestSchema);
