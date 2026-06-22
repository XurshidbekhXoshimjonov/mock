const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    memberIdNumber: {
        type: Number,
        unique: true,
        sparse: true
    },
    memberId: {
        type: String,
        unique: true,
        sparse: true
    },
    name: {
        type: String,
        default: ""
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: false
    },
    avatar: {
        type: String,
        default: ""
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    role: {
        type: String,
        enum: ["user", "admin", "student"],
        default: "user"
    },
    plan: {
        type: String,
        enum: ["free", "premium"],
        default: "free"
    },
    isPremium: {
        type: Boolean,
        default: false
    },
    premiumUntil: {
        type: Date,
        default: null
    },
    authProviders: {
        type: [String],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: null
    }
});

module.exports = mongoose.model("User", userSchema);
