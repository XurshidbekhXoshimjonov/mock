const crypto = require("crypto");

const BANDS = new Set(Array.from({ length: 11 }, (_, index) => 4 + index * 0.5));
const SKILLS = ["listening", "reading", "writing", "speaking"];
const ROUTES = new Set(["/listening", "/reading", "/writing", "/speaking", "/review-mistakes", "/vocabulary", "/mock-tests"]);
const PREPARATION_DAYS = Object.freeze({ "2_weeks": 14, "1_month": 30, "2_months": 60, "3_months": 90, "6_months": 180 });

function roundBand(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(9, Math.round(number * 2) / 2));
}

function average(values) {
    const valid = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function isoDay(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function startOfDay(value = Date.now()) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
}

function addDays(value, days) {
    const date = startOfDay(value);
    date.setDate(date.getDate() + days);
    return date;
}

function parseSettings(input = {}) {
    const currentBand = roundBand(input.currentBand);
    const targetBand = roundBand(input.targetBand);
    const dailyMinutes = Number(input.dailyMinutes);
    const studyDaysPerWeek = Number(input.studyDaysPerWeek);
    const noExamDate = input.noExamDate === true || input.noExamDate === "true";
    const examDate = noExamDate ? null : startOfDay(input.examDate);
    const preparationPeriod = String(input.preparationPeriod || "");
    const preferredStudyTime = String(input.preferredStudyTime || "flexible").toLowerCase();
    const intensity = String(input.intensity || "balanced").toLowerCase();
    const prioritySkills = [...new Set((Array.isArray(input.prioritySkills) ? input.prioritySkills : [])
        .map((skill) => String(skill).toLowerCase()).filter((skill) => SKILLS.includes(skill)))];

    if (!BANDS.has(currentBand)) throw Object.assign(new Error("Select a valid current estimated band."), { statusCode: 400 });
    if (!BANDS.has(targetBand) || targetBand <= currentBand) throw Object.assign(new Error("Target band must be higher than your current estimated band."), { statusCode: 400 });
    if (![30, 60, 120, 180, 240, 300].includes(dailyMinutes)) throw Object.assign(new Error("Select a valid daily study time."), { statusCode: 400 });
    if (![3, 4, 5, 6, 7].includes(studyDaysPerWeek)) throw Object.assign(new Error("Select a valid number of study days."), { statusCode: 400 });
    if (!["morning", "afternoon", "evening", "flexible"].includes(preferredStudyTime)) throw Object.assign(new Error("Select a valid preferred study time."), { statusCode: 400 });
    if (!["light", "balanced", "intensive"].includes(intensity)) throw Object.assign(new Error("Select a valid study intensity."), { statusCode: 400 });
    if (noExamDate && !PREPARATION_DAYS[preparationPeriod]) throw Object.assign(new Error("Select an approximate preparation period."), { statusCode: 400 });
    if (!noExamDate && (Number.isNaN(examDate.getTime()) || examDate < startOfDay())) throw Object.assign(new Error("Exam date cannot be in the past."), { statusCode: 400 });

    return {
        currentBand,
        targetBand,
        examDate: examDate ? examDate.toISOString() : null,
        noExamDate,
        preparationPeriod: noExamDate ? preparationPeriod : "",
        dailyMinutes,
        studyDaysPerWeek,
        preferredStudyTime,
        intensity,
        prioritySkills
    };
}

function criterionLabel(skill, key) {
    const normalized = String(key || "").toLowerCase();
    if (skill === "writing") {
        if (normalized.includes("grammar")) return "grammar accuracy";
        if (normalized.includes("lexical") || normalized.includes("vocab")) return "vocabulary range";
        if (normalized.includes("coherence") || normalized.includes("cohesion")) return "coherence and cohesion";
        if (normalized.includes("task")) return "task response";
    }
    if (skill === "speaking") {
        if (normalized.includes("fluency") || normalized.includes("coherence")) return "fluency";
        if (normalized.includes("grammar")) return "grammar accuracy";
        if (normalized.includes("lexical") || normalized.includes("vocab")) return "vocabulary range";
        if (normalized.includes("pronun")) return "pronunciation";
    }
    return normalized.replace(/[_-]+/g, " ") || "core skills";
}

function weakestCriterion(skill, submissions) {
    const totals = new Map();
    submissions.forEach((submission) => {
        Object.entries(submission.criteriaScores || {}).forEach(([key, value]) => {
            const score = Number(value?.band ?? value?.score ?? value);
            if (!Number.isFinite(score) || score <= 0) return;
            const current = totals.get(key) || { sum: 0, count: 0 };
            current.sum += score;
            current.count += 1;
            totals.set(key, current);
        });
    });
    return [...totals.entries()]
        .map(([key, item]) => ({ category: criterionLabel(skill, key), score: item.sum / item.count }))
        .sort((a, b) => a.score - b.score)[0] || null;
}

async function analysePerformance(userId, dependencies) {
    const progress = dependencies.userProgressStore.getProgress(userId, { historyLimit: 50, activityLimit: 50 });
    const mock = dependencies.mockTestStore.profileSummary(userId);
    const [mistakes, vocabulary, writing, speaking] = await Promise.all([
        dependencies.reviewMistakeStore.list(userId, { sort: "repeated" }),
        dependencies.vocabularyStore.list(userId, { sort: "newest" }),
        dependencies.loadWriting(userId),
        dependencies.loadSpeaking(userId)
    ]);

    const recent = progress.testHistory || [];
    const recentListening = recent.filter((item) => item.skill === "listening").slice(0, 6);
    const recentReading = recent.filter((item) => item.skill === "reading").slice(0, 6);
    const mockRecent = mock.recent || [];
    const bandSources = {
        listening: [...recentListening.map((item) => item.band), ...mockRecent.slice(0, 3).map((item) => item.listening?.band)],
        reading: [...recentReading.map((item) => item.band), ...mockRecent.slice(0, 3).map((item) => item.reading?.band)],
        writing: [...writing.slice(0, 6).map((item) => item.overallBand || item.estimatedBand), ...mockRecent.slice(0, 3).map((item) => item.writing?.band)],
        speaking: [...speaking.slice(0, 6).map((item) => item.overallBand), ...mockRecent.slice(0, 3).map((item) => item.speaking?.band)]
    };
    const estimatedBands = Object.fromEntries(SKILLS.map((skill) => [skill, roundBand(average(bandSources[skill]))]));
    estimatedBands.overall = roundBand(average(SKILLS.map((skill) => estimatedBands[skill])));

    const mistakeCounts = new Map();
    mistakes.filter((item) => item.status !== "mastered").forEach((item) => {
        const category = String(item.questionType || "repeated mistakes").trim() || "repeated mistakes";
        const key = `${item.skill}:${category}`;
        mistakeCounts.set(key, (mistakeCounts.get(key) || 0) + 1);
    });
    const repeatedMistakes = [...mistakeCounts.entries()]
        .map(([key, count]) => ({ skill: key.split(":")[0], category: key.split(":").slice(1).join(":"), count }))
        .sort((a, b) => b.count - a.count).slice(0, 6);
    const writingWeak = weakestCriterion("writing", writing);
    const speakingWeak = weakestCriterion("speaking", speaking);
    const performanceCount = recent.length + mockRecent.length + writing.length + speaking.length;
    const hasEnoughData = performanceCount >= 3 && SKILLS.filter((skill) => estimatedBands[skill] > 0).length >= 2;
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify({
        resultIds: recent.slice(0, 20).map((item) => [item.id, item.band, item.completedAt]),
        mockIds: mockRecent.slice(0, 10).map((item) => [item.id, item.overallBand, item.completedAt]),
        writing: writing.slice(0, 8).map((item) => [String(item._id || item.id), item.overallBand || item.estimatedBand, item.createdAt]),
        speaking: speaking.slice(0, 8).map((item) => [String(item._id || item.id), item.overallBand, item.createdAt]),
        unresolvedMistakes: mistakes.filter((item) => item.status !== "mastered").length,
        vocabulary: vocabulary.map((item) => [item.id, item.reviewStatus, item.reviewCount]).slice(0, 50)
    })).digest("hex");

    return {
        estimatedBands,
        hasEnoughData,
        performanceCount,
        repeatedMistakes,
        weakestCriteria: { writing: writingWeak, speaking: speakingWeak },
        vocabulary: {
            total: vocabulary.length,
            due: vocabulary.filter((item) => !item.nextReviewAt || new Date(item.nextReviewAt) <= new Date()).length,
            mastered: vocabulary.filter((item) => item.reviewStatus === "mastered").length
        },
        completionFrequency: recent.length,
        recentTrend: recent.slice(0, 6).map((item) => ({ skill: item.skill, band: item.band, date: item.completedAt })),
        mockTrend: mock.chart || [],
        fingerprint
    };
}

function priorityCategory(skill, analysis) {
    if (skill === "writing" && analysis.weakestCriteria.writing) return analysis.weakestCriteria.writing.category;
    if (skill === "speaking" && analysis.weakestCriteria.speaking) return analysis.weakestCriteria.speaking.category;
    const repeated = analysis.repeatedMistakes.find((item) => item.skill === skill);
    if (repeated) return repeated.category;
    if (skill === "reading" && analysis.vocabulary.total > 0) return "vocabulary";
    return skill === "listening" ? "answer accuracy" : skill === "reading" ? "reading accuracy" : "core skills";
}

function buildPriorities(settings, analysis) {
    const bands = { ...analysis.estimatedBands };
    SKILLS.forEach((skill) => { if (!bands[skill]) bands[skill] = settings.currentBand; });
    const weighted = SKILLS.map((skill) => {
        const gap = Math.max(0.5, settings.targetBand - bands[skill]);
        const manualBoost = settings.prioritySkills.includes(skill) ? 1.2 : 0;
        const repeatedBoost = Math.min(1.2, (analysis.repeatedMistakes.find((item) => item.skill === skill)?.count || 0) * 0.15);
        return { skill, band: bands[skill], weight: gap + manualBoost + repeatedBoost };
    }).sort((a, b) => b.weight - a.weight || a.band - b.band);
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let percentages = weighted.map((item) => Math.round((item.weight / total) * 100));
    percentages[0] += 100 - percentages.reduce((sum, value) => sum + value, 0);
    return weighted.map((item, index) => ({
        skill: item.skill,
        category: priorityCategory(item.skill, analysis),
        percentage: percentages[index],
        reason: `${item.skill[0].toUpperCase() + item.skill.slice(1)} is estimated at Band ${item.band.toFixed(1)} and needs focused ${priorityCategory(item.skill, analysis)} practice to move toward the selected target.`
    }));
}

function planEndDate(settings) {
    return settings.examDate ? startOfDay(settings.examDate) : addDays(Date.now(), PREPARATION_DAYS[settings.preparationPeriod]);
}

function taskTemplate(skill, category, duration, priority = "medium") {
    const templates = {
        listening: ["Listening accuracy practice", `Complete a focused Listening set and review every ${category} error.`, "/listening"],
        reading: ["Reading strategy practice", `Complete a timed Reading passage with extra attention to ${category}.`, "/reading"],
        writing: ["Writing improvement session", `Write and review a focused response targeting ${category}.`, "/writing"],
        speaking: ["Speaking simulation", `Complete a speaking simulation and review feedback on ${category}.`, "/speaking"]
    };
    const [title, description, route] = templates[skill];
    return { title, description, skill, durationMinutes: duration, priority, route };
}

function distributeMinutes(total, priorities, maxTasks) {
    const minimum = total <= 30 ? 15 : 20;
    const selected = priorities.slice(0, Math.max(1, Math.min(maxTasks, Math.floor(total / minimum))));
    const weightTotal = selected.reduce((sum, item) => sum + item.percentage, 0);
    const durations = selected.map((item) => Math.max(minimum, Math.floor((total * item.percentage / weightTotal) / 5) * 5));
    let difference = total - durations.reduce((sum, value) => sum + value, 0);
    for (let index = 0; difference >= 5; index = (index + 1) % durations.length) {
        durations[index] += 5;
        difference -= 5;
    }
    while (difference < 0) {
        const index = durations.findIndex((value) => value > minimum);
        if (index < 0) break;
        durations[index] -= 5;
        difference += 5;
    }
    return selected.map((item, index) => ({ ...item, duration: durations[index] }));
}

function buildStructuredWeek(settings, analysis, priorities, weekNumber = 1, startDate = new Date()) {
    const start = startOfDay(startDate);
    const end = addDays(start, 6);
    const availableDays = Math.min(settings.studyDaysPerWeek, 7);
    const intensityFactor = settings.intensity === "light" ? 0.75 : settings.intensity === "intensive" ? 1 : 0.9;
    const plannedMinutes = Math.max(30, Math.floor(settings.dailyMinutes * intensityFactor / 5) * 5);
    const tasks = [];
    let studyDayIndex = 0;

    for (let offset = 0; offset < 7; offset += 1) {
        const date = addDays(start, offset);
        if (date > planEndDate(settings)) break;
        const isStudyDay = studyDayIndex < availableDays;
        if (!isStudyDay) continue;
        const isMockDay = availableDays >= 4 && studyDayIndex === availableDays - 1;
        if (isMockDay && plannedMinutes >= 60) {
            const mockMinutes = Math.min(plannedMinutes, plannedMinutes >= 120 ? 120 : 60);
            tasks.push({
                id: crypto.randomUUID(), date: date.toISOString(), title: "Weekly IELTS mock checkpoint",
                description: "Complete an IELTSX mock or timed two-skill checkpoint, then review the result without assuming a guaranteed band increase.",
                skill: "mock", durationMinutes: mockMinutes, priority: "high", route: "/mock-tests", status: "pending"
            });
            if (plannedMinutes - mockMinutes >= 20) tasks.push({
                id: crypto.randomUUID(), date: date.toISOString(), title: "Review repeated mistakes", description: "Review unresolved mistakes from this week and note the pattern behind each error.",
                skill: "review", durationMinutes: plannedMinutes - mockMinutes, priority: "high", route: "/review-mistakes", status: "pending"
            });
        } else {
            const reviewMinutes = plannedMinutes >= 60 ? 15 : 0;
            const vocabularyMinutes = plannedMinutes >= 90 ? 15 : 0;
            const skillMinutes = plannedMinutes - reviewMinutes - vocabularyMinutes;
            distributeMinutes(skillMinutes, priorities.slice(studyDayIndex % 2).concat(priorities.slice(0, studyDayIndex % 2)), skillMinutes >= 90 ? 2 : 1)
                .forEach((item, index) => tasks.push({
                    id: crypto.randomUUID(), date: date.toISOString(),
                    ...taskTemplate(item.skill, item.category || "core skills", item.duration, index === 0 ? "high" : "medium"), status: "pending"
                }));
            if (reviewMinutes) tasks.push({ id: crypto.randomUUID(), date: date.toISOString(), title: "Review Mistakes", description: "Review five unresolved or repeated IELTSX mistakes.", skill: "review", durationMinutes: reviewMinutes, priority: "medium", route: "/review-mistakes", status: "pending" });
            if (vocabularyMinutes) tasks.push({ id: crypto.randomUUID(), date: date.toISOString(), title: "Vocabulary review", description: "Review due words and save useful academic vocabulary from today’s practice.", skill: "vocabulary", durationMinutes: vocabularyMinutes, priority: "medium", route: "/vocabulary", status: "pending" });
        }
        studyDayIndex += 1;
    }

    return {
        weekNumber,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        objective: `Build toward Band ${settings.targetBand.toFixed(1)} with extra focus on ${priorities.slice(0, 2).map((item) => `${item.skill} ${item.category}`).join(" and ")}.`,
        tasks,
        checkpoint: null
    };
}

function validateAiPayload(payload, settings) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.days) || !Array.isArray(payload.priorities)) throw new Error("AI returned an invalid Study Plan structure.");
    const percentageTotal = payload.priorities.reduce((sum, item) => sum + Number(item.percentage || 0), 0);
    if (percentageTotal < 95 || percentageTotal > 105) throw new Error("AI skill allocation must total approximately 100%.");
    payload.days.forEach((day) => {
        if (!isoDay(day.date) || !Array.isArray(day.tasks)) throw new Error("AI returned an invalid plan date.");
        const total = day.tasks.reduce((sum, task) => sum + Number(task.durationMinutes || 0), 0);
        if (total > settings.dailyMinutes || total <= 0) throw new Error("AI daily workload exceeds the selected availability.");
        day.tasks.forEach((task) => {
            if (!ROUTES.has(task.route) || !["low", "medium", "high"].includes(task.priority) || Number(task.durationMinutes) < 10) throw new Error("AI returned an invalid Study Plan task.");
        });
    });
    return payload;
}

async function requestAiPlan(settings, analysis, priorities) {
    const apiKey = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "").trim();
    if (!apiKey) return null;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: String(process.env.STUDY_PLAN_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"),
            temperature: 0.25,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You create realistic IELTS study plans. Return only strict JSON. Never guarantee a score increase. Use only these routes: /listening, /reading, /writing, /speaking, /review-mistakes, /vocabulary, /mock-tests. Do not divide time equally: prioritize weaker skills while maintaining stronger skills." },
                { role: "user", content: JSON.stringify({
                    requiredShape: { summary: "string", estimatedBands: { listening: 0, reading: 0, writing: 0, speaking: 0, overall: 0 }, priorities: [{ skill: "string", reason: "string", percentage: 0 }], weeklyObjective: "string", days: [{ date: "YYYY-MM-DD", totalMinutes: 0, tasks: [{ title: "string", description: "string", skill: "string", durationMinutes: 0, priority: "low|medium|high", route: "string" }] }] },
                    settings, performance: analysis, recommendedPriorities: priorities,
                    constraints: [`No day may exceed ${settings.dailyMinutes} minutes.`, `Create exactly ${settings.studyDaysPerWeek} study days in the next seven days.`, "Task durations must be at least 10 minutes and realistic.", "Include review, vocabulary where useful, and one mock checkpoint when time permits."]
                }) }
            ]
        })
    });
    if (!response.ok) throw new Error(`Study Plan AI request failed (${response.status}).`);
    const data = await response.json();
    return validateAiPayload(JSON.parse(data.choices?.[0]?.message?.content || "{}"), settings);
}

function aiWeek(payload, settings) {
    const tasks = payload.days.flatMap((day) => day.tasks.map((task) => ({
        id: crypto.randomUUID(), date: startOfDay(day.date).toISOString(), title: String(task.title).slice(0, 140), description: String(task.description).slice(0, 600),
        skill: String(task.skill).toLowerCase(), durationMinutes: Number(task.durationMinutes), priority: task.priority, route: task.route, status: "pending"
    })));
    const start = startOfDay(payload.days[0]?.date || Date.now());
    return { weekNumber: 1, startDate: start.toISOString(), endDate: addDays(start, 6).toISOString(), objective: String(payload.weeklyObjective || "Build consistent IELTS progress."), tasks, checkpoint: null };
}

async function generatePlan(settingsInput, analysis, options = {}) {
    const settings = parseSettings(settingsInput);
    const estimatedBands = { ...analysis.estimatedBands };
    SKILLS.forEach((skill) => { if (!estimatedBands[skill]) estimatedBands[skill] = settings.currentBand; });
    estimatedBands.overall = analysis.estimatedBands.overall || settings.currentBand;
    const priorities = buildPriorities(settings, { ...analysis, estimatedBands });
    let aiPayload = null;
    if (!options.skipAi) aiPayload = await requestAiPlan(settings, analysis, priorities).catch((error) => {
        console.warn("Study Plan AI generation fallback:", error.message);
        return null;
    });
    const week = aiPayload ? aiWeek(aiPayload, settings) : buildStructuredWeek(settings, analysis, priorities);
    return {
        settings,
        estimatedBands,
        weaknesses: priorities.slice(0, 3).map((item, index) => ({ skill: item.skill, category: item.category, reason: item.reason, priority: index + 1 })),
        priorities: aiPayload?.priorities || priorities,
        summary: aiPayload?.summary || `This AI-recommended plan emphasizes ${priorities.slice(0, 2).map((item) => item.skill).join(" and ")} while maintaining all four IELTS skills. It does not guarantee a target score.`,
        dataNotice: analysis.hasEnoughData ? "" : "We need more IELTSX performance data to identify your exact weaknesses. Your first plan will be based on the level and goals you selected.",
        performanceSnapshot: analysis,
        weeks: [week],
        completedMinutes: 0,
        adaptationRecommended: false,
        adaptationReason: "",
        performanceFingerprint: analysis.fingerprint,
        generationSource: aiPayload ? "ai" : "structured_fallback",
        lastGeneratedAt: new Date().toISOString(),
        lastAdaptedAt: options.adapting ? new Date().toISOString() : null
    };
}

function planStats(plan) {
    const tasks = (plan.weeks || []).flatMap((week) => week.tasks || []);
    const completed = tasks.filter((task) => task.status === "completed");
    const completedDates = new Set(completed.map((task) => isoDay(task.completedAt || task.date)).filter(Boolean));
    let streak = 0;
    for (let offset = 0; offset < 365; offset += 1) {
        if (!completedDates.has(isoDay(addDays(Date.now(), -offset)))) break;
        streak += 1;
    }
    const now = startOfDay();
    const end = planEndDate(plan.settings);
    return {
        totalTasks: tasks.length,
        completedTasks: completed.length,
        completedMinutes: completed.reduce((sum, task) => sum + Number(task.durationMinutes || 0), 0),
        completionRate: tasks.length ? Math.round(completed.length / tasks.length * 100) : 0,
        streak,
        daysRemaining: Math.max(0, Math.ceil((end - now) / 86400000))
    };
}

module.exports = {
    SKILLS, ROUTES, parseSettings, analysePerformance, generatePlan, buildStructuredWeek, planStats, startOfDay, addDays, isoDay
};
