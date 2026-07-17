const { analysePerformance, generatePlan, buildStructuredWeek, parseSettings, planStats, startOfDay, addDays, isoDay } = require("./study-plan-service");

const generationAttempts = new Map();
const GENERATION_WINDOW_MS = 10 * 60 * 1000;
const GENERATION_LIMIT = 8;

function generationRateKey(req) {
    return `${String(req.user?.id || "anonymous")}:${String(req.method || "POST").toUpperCase()}:${String(req.path || req.originalUrl || "")}`;
}

function clearGenerationRateLimit(userId) {
    const prefix = `${String(userId)}:`;
    for (const key of generationAttempts.keys()) {
        if (key.startsWith(prefix)) generationAttempts.delete(key);
    }
}

function generationRateLimit(req, res, next) {
    const key = generationRateKey(req);
    const now = Date.now();
    const recent = (generationAttempts.get(key) || []).filter((time) => now - time < GENERATION_WINDOW_MS);
    if (recent.length >= GENERATION_LIMIT) {
        const retryAfterSeconds = Math.max(1, Math.ceil((GENERATION_WINDOW_MS - (now - recent[0])) / 1000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
            error: `Too many Study Plan generation requests. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute${retryAfterSeconds > 60 ? "s" : ""}.`,
            retryAfterSeconds
        });
    }
    recent.push(now);
    generationAttempts.set(key, recent);
    next();
}

function publicPlan(plan) {
    return plan ? { ...plan, stats: planStats(plan) } : null;
}

function taskById(plan, taskId) {
    for (const week of plan.weeks || []) {
        const task = (week.tasks || []).find((item) => item.id === taskId);
        if (task) return { week, task };
    }
    return null;
}

function markMissedTasks(plan) {
    const today = startOfDay();
    let changed = false;
    (plan.weeks || []).forEach((week) => (week.tasks || []).forEach((task) => {
        if (task.status === "pending" && startOfDay(task.date) < today) {
            task.status = "missed";
            task.originalDate = task.originalDate || task.date;
            changed = true;
        }
    }));
    return changed;
}

function mergeCompletedHistory(previous, next) {
    const completedWeeks = (previous.weeks || []).map((week) => ({
        ...week,
        tasks: (week.tasks || []).filter((task) => task.status === "completed")
    })).filter((week) => week.tasks.length || week.checkpoint);
    const pendingCompletedIds = new Set(completedWeeks.flatMap((week) => week.tasks.map((task) => task.id)));
    const completedWeekNumber = Math.max(0, ...completedWeeks.map((item) => item.weekNumber || 0));
    next.weeks = [...completedWeeks, ...(next.weeks || []).map((week) => ({
        ...week,
        weekNumber: completedWeekNumber + week.weekNumber,
        tasks: (week.tasks || []).filter((task) => !pendingCompletedIds.has(task.id))
    }))];
    next.createdAt = previous.createdAt;
    return next;
}

function registerStudyPlanRoutes(app, dependencies) {
    const {
        requireAuth, requireStudyPlanAccessApi, studyPlanStore,
        userProgressStore, mockTestStore, reviewMistakeStore, vocabularyStore,
        loadWriting, loadSpeaking
    } = dependencies;
    const analysisDependencies = { userProgressStore, mockTestStore, reviewMistakeStore, vocabularyStore, loadWriting, loadSpeaking };

    app.get("/api/study-plan", requireAuth, requireStudyPlanAccessApi, async (req, res) => {
        try {
            const plan = await studyPlanStore.get(req.user.id);
            if (!plan) return res.json({ plan: null });
            const changed = markMissedTasks(plan);
            const analysis = await analysePerformance(req.user.id, analysisDependencies);
            if (analysis.fingerprint !== plan.performanceFingerprint && !plan.adaptationRecommended) {
                plan.adaptationRecommended = true;
                plan.adaptationReason = "Your recent performance has changed. We recommend updating your Study Plan.";
            }
            if (changed || plan.adaptationRecommended) await studyPlanStore.save(req.user.id, plan);
            res.json({ plan: publicPlan(plan) });
        } catch (error) {
            console.error("Study Plan load error:", error);
            res.status(500).json({ error: "We could not load your Study Plan." });
        }
    });

    app.get("/api/study-plan/analysis", requireAuth, requireStudyPlanAccessApi, async (req, res) => {
        try {
            const analysis = await analysePerformance(req.user.id, analysisDependencies);
            res.json({ analysis });
        } catch (error) {
            console.error("Study Plan analysis error:", error);
            res.status(500).json({ error: "We could not analyse your IELTSX performance." });
        }
    });

    app.post("/api/study-plan/generate", requireAuth, requireStudyPlanAccessApi, generationRateLimit, async (req, res) => {
        try {
            const existing = await studyPlanStore.get(req.user.id);
            const analysis = await analysePerformance(req.user.id, analysisDependencies);
            const plan = await generatePlan(req.body || {}, analysis);
            if (existing) plan.createdAt = existing.createdAt;
            const saved = await studyPlanStore.save(req.user.id, plan);
            res.status(existing ? 200 : 201).json({ plan: publicPlan(saved) });
        } catch (error) {
            console.error("Study Plan generation error:", error.message);
            res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "We could not generate your Study Plan." });
        }
    });

    app.patch("/api/study-plan/settings", requireAuth, requireStudyPlanAccessApi, generationRateLimit, async (req, res) => {
        try {
            const current = await studyPlanStore.get(req.user.id);
            if (!current) return res.status(404).json({ error: "Your Study Plan has not been created yet." });
            const settings = parseSettings({ ...current.settings, ...(req.body || {}) });
            const analysis = await analysePerformance(req.user.id, analysisDependencies);
            const regenerated = await generatePlan(settings, analysis, { adapting: true });
            const saved = await studyPlanStore.save(req.user.id, mergeCompletedHistory(current, regenerated));
            res.json({ plan: publicPlan(saved), message: "Plan settings saved and the remaining schedule was rebalanced." });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "We could not update your Study Plan settings." });
        }
    });

    app.patch("/api/study-plan/tasks/:taskId", requireAuth, requireStudyPlanAccessApi, async (req, res) => {
        try {
            const plan = await studyPlanStore.get(req.user.id);
            if (!plan) return res.status(404).json({ error: "Your Study Plan has not been created yet." });
            const match = taskById(plan, String(req.params.taskId));
            if (!match) return res.status(404).json({ error: "Study Plan task not found." });
            const action = String(req.body?.action || "");
            if (action === "complete") {
                match.task.status = "completed";
                match.task.completedAt = new Date().toISOString();
            } else if (action === "skip") {
                match.task.status = "skipped";
                match.task.completedAt = null;
                match.task.skipReason = String(req.body?.reason || "").slice(0, 160);
            } else if (action === "reschedule") {
                const date = startOfDay(req.body?.date);
                if (Number.isNaN(date.getTime()) || date < startOfDay()) return res.status(400).json({ error: "Choose a valid future reschedule date." });
                const minutesOnDate = (plan.weeks || []).flatMap((week) => week.tasks || [])
                    .filter((task) => task.id !== match.task.id && task.status === "pending" && isoDay(task.date) === isoDay(date))
                    .reduce((sum, task) => sum + Number(task.durationMinutes || 0), 0);
                if (minutesOnDate + match.task.durationMinutes > plan.settings.dailyMinutes) return res.status(409).json({ error: "That day is already full. Choose another day to avoid an overloaded schedule." });
                match.task.originalDate = match.task.originalDate || match.task.date;
                match.task.date = date.toISOString();
                match.task.status = "pending";
                match.task.completedAt = null;
            } else if (action === "pending") {
                match.task.status = "pending";
                match.task.completedAt = null;
            } else {
                return res.status(400).json({ error: "Select a valid task action." });
            }
            const saved = await studyPlanStore.save(req.user.id, plan);
            res.json({ plan: publicPlan(saved) });
        } catch (error) {
            res.status(500).json({ error: "We could not update this Study Plan task." });
        }
    });

    app.post("/api/study-plan/adapt", requireAuth, requireStudyPlanAccessApi, generationRateLimit, async (req, res) => {
        try {
            const current = await studyPlanStore.get(req.user.id);
            if (!current) return res.status(404).json({ error: "Your Study Plan has not been created yet." });
            if (req.body?.keepCurrent === true) {
                const analysis = await analysePerformance(req.user.id, analysisDependencies);
                current.adaptationRecommended = false;
                current.adaptationReason = "";
                current.performanceFingerprint = analysis.fingerprint;
                return res.json({ plan: publicPlan(await studyPlanStore.save(req.user.id, current)) });
            }
            const analysis = await analysePerformance(req.user.id, analysisDependencies);
            const adapted = await generatePlan(current.settings, analysis, { adapting: true });
            const saved = await studyPlanStore.save(req.user.id, mergeCompletedHistory(current, adapted));
            res.json({ plan: publicPlan(saved), message: "Your Study Plan was updated using your latest IELTSX performance." });
        } catch (error) {
            res.status(500).json({ error: "We could not update your Study Plan." });
        }
    });

    app.post("/api/study-plan/weekly-checkpoint", requireAuth, requireStudyPlanAccessApi, generationRateLimit, async (req, res) => {
        try {
            const plan = await studyPlanStore.get(req.user.id);
            if (!plan) return res.status(404).json({ error: "Your Study Plan has not been created yet." });
            const currentWeek = (plan.weeks || []).find((week) => week.weekNumber === Number(req.body?.weekNumber)) || plan.weeks[plan.weeks.length - 1];
            if (!currentWeek) return res.status(400).json({ error: "No Study Plan week is available." });
            const tasks = currentWeek.tasks || [];
            const completed = tasks.filter((task) => task.status === "completed");
            const analysis = await analysePerformance(req.user.id, analysisDependencies);
            currentWeek.checkpoint = {
                completedTasks: completed.length,
                totalTasks: tasks.length,
                completedMinutes: completed.reduce((sum, task) => sum + Number(task.durationMinutes || 0), 0),
                strongestImprovement: analysis.recentTrend[0] ? `${analysis.recentTrend[0].skill} recent performance` : "Consistent study activity",
                mainWeakness: plan.weaknesses?.[0] ? `${plan.weaknesses[0].skill} ${plan.weaknesses[0].category}` : "More test evidence is needed",
                nextRecommendation: `Continue prioritising ${plan.priorities?.[0]?.skill || "your weakest skill"} while maintaining all four skills.`,
                createdAt: new Date().toISOString()
            };
            if (req.body?.generateNextWeek === true) {
                const nextStart = addDays(currentWeek.endDate, 1);
                const nextNumber = Math.max(...plan.weeks.map((week) => week.weekNumber || 0)) + 1;
                plan.weeks.push(buildStructuredWeek(plan.settings, analysis, plan.priorities, nextNumber, nextStart));
                plan.performanceFingerprint = analysis.fingerprint;
            }
            const saved = await studyPlanStore.save(req.user.id, plan);
            res.json({ plan: publicPlan(saved), checkpoint: currentWeek.checkpoint });
        } catch (error) {
            res.status(500).json({ error: "We could not create your weekly checkpoint." });
        }
    });

    app.delete("/api/study-plan", requireAuth, requireStudyPlanAccessApi, async (req, res) => {
        await studyPlanStore.remove(req.user.id);
        clearGenerationRateLimit(req.user.id);
        res.status(204).end();
    });
}

module.exports = { registerStudyPlanRoutes, generationRateLimit, clearGenerationRateLimit };
