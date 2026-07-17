const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
    id: { type: String, required: true },
    date: { type: Date, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    skill: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    route: { type: String, default: "" },
    status: { type: String, enum: ["pending", "completed", "missed", "skipped"], default: "pending" },
    completedAt: { type: Date, default: null },
    relatedTestId: { type: String, default: "" },
    skipReason: { type: String, default: "" },
    originalDate: { type: Date, default: null }
}, { _id: false });

const weekSchema = new mongoose.Schema({
    weekNumber: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    objective: { type: String, default: "" },
    tasks: { type: [taskSchema], default: [] },
    checkpoint: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false });

const studyPlanSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    settings: { type: mongoose.Schema.Types.Mixed, required: true },
    estimatedBands: { type: mongoose.Schema.Types.Mixed, required: true },
    weaknesses: { type: [mongoose.Schema.Types.Mixed], default: [] },
    priorities: { type: [mongoose.Schema.Types.Mixed], default: [] },
    summary: { type: String, default: "" },
    dataNotice: { type: String, default: "" },
    performanceSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    weeks: { type: [weekSchema], default: [] },
    completedMinutes: { type: Number, default: 0 },
    adaptationRecommended: { type: Boolean, default: false },
    adaptationReason: { type: String, default: "" },
    performanceFingerprint: { type: String, default: "" },
    generationSource: { type: String, enum: ["ai", "structured_fallback"], default: "structured_fallback" },
    lastGeneratedAt: { type: Date, required: true },
    lastAdaptedAt: { type: Date, default: null }
}, {
    timestamps: true,
    collection: "study_plans"
});

module.exports = mongoose.models.StudyPlan || mongoose.model("StudyPlan", studyPlanSchema);
