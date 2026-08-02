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
    firstName: {
        type: String,
        default: ""
    },
    familyName: {
        type: String,
        default: ""
    },
    fullName: {
        type: String,
        default: ""
    },
    dateOfBirth: {
        type: String,
        default: ""
    },
    sex: {
        type: String,
        default: ""
    },
    candidatePhoto: {
        type: String,
        default: ""
    },
    testTakerId: {
        type: String,
        default: "",
        index: { unique: true, sparse: true }
    },
    candidateType: {
        type: String,
        default: "Mock Test Candidate"
    },
    countryOfOrigin: {
        type: String,
        default: "Uzbekistan"
    },
    countryOfNationality: {
        type: String,
        default: "Uzbekistan"
    },
    firstLanguage: {
        type: String,
        default: "Uzbek"
    },
    targetBand: {
        type: String,
        default: ""
    },
    googleId: {
        type: String
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
    premiumActivatedAt: {
        type: Date,
        default: null
    },
    premiumExpiresAt: {
        type: Date,
        default: null
    },
    premiumCancelledAt: {
        type: Date,
        default: null
    },
    premiumUntil: {
        type: Date,
        default: null
    },
    subscriptionPlan: {
        type: String,
        enum: ["monthly", "threeMonths", "annual", null],
        default: null
    },
    subscriptionStatus: {
        type: String,
        enum: ["free", "active", "trialing", "past_due", "paused", "canceled", "cancelled", "expired"],
        default: "free"
    },
    subscriptionStartedAt: { type: Date, default: null },
    subscriptionExpiresAt: { type: Date, default: null },
    subscriptionAdminNote: { type: String, default: "" },
    paddleCustomerId: { type: String, default: null, index: true, sparse: true },
    paddleSubscriptionId: { type: String, default: null, index: true, sparse: true },
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

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ plan: 1, createdAt: -1 });
userSchema.index({ lastLogin: -1 });
userSchema.index(
    { googleId: 1 },
    {
        unique: true,
        partialFilterExpression: { googleId: { $type: "string" } }
    }
);

module.exports = mongoose.model("User", userSchema);
