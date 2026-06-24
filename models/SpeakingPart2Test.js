const mongoose = require("mongoose");

const speakingBulletPointSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
        trim: true
    }
}, { _id: false });

const speakingPart2TestSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    instruction: {
        type: String,
        default: "",
        trim: true
    },
    bulletPoints: {
        type: [speakingBulletPointSchema],
        default: []
    },
    prepTime: {
        type: String,
        default: "1 min",
        trim: true
    },
    speakingTime: {
        type: String,
        default: "2 min",
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
    collection: "speaking_part2_tests"
});

module.exports = mongoose.models.SpeakingPart2Test || mongoose.model("SpeakingPart2Test", speakingPart2TestSchema);
