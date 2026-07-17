const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseSettings, generatePlan, planStats, ROUTES } = require("../lib/study-plan-service");
const { createStudyPlanStore } = require("../lib/study-plan-store");
const { generationRateLimit, clearGenerationRateLimit } = require("../lib/study-plan-routes");

function settings(overrides = {}) {
    return {
        currentBand: 6,
        targetBand: 7,
        noExamDate: true,
        preparationPeriod: "2_months",
        dailyMinutes: 120,
        studyDaysPerWeek: 5,
        preferredStudyTime: "evening",
        intensity: "balanced",
        prioritySkills: ["writing"],
        ...overrides
    };
}

function analysis(overrides = {}) {
    return {
        estimatedBands: { listening: 7, reading: 6.5, writing: 5.5, speaking: 6, overall: 6.5 },
        hasEnoughData: true,
        performanceCount: 8,
        repeatedMistakes: [{ skill: "reading", category: "matching headings", count: 4 }],
        weakestCriteria: { writing: { category: "grammar accuracy", score: 5.5 }, speaking: { category: "fluency", score: 6 } },
        vocabulary: { total: 20, due: 5, mastered: 3 },
        completionFrequency: 8,
        recentTrend: [],
        mockTrend: [],
        fingerprint: "fingerprint-1",
        ...overrides
    };
}

test("Study Plan settings reject a target at or below the current band", () => {
    assert.throws(() => parseSettings(settings({ targetBand: 6 })), /higher than your current/);
    assert.throws(() => parseSettings(settings({ targetBand: 5.5 })), /higher than your current/);
});

test("Study Plan settings reject past exam dates", () => {
    assert.throws(() => parseSettings(settings({ noExamDate: false, examDate: "2020-01-01", preparationPeriod: "" })), /past/);
});

test("structured Study Plan respects time, routes, priorities, and real-data notice", async () => {
    const result = await generatePlan(settings(), analysis(), { skipAi: true });
    assert.equal(result.weeks.length, 1);
    assert.equal(result.generationSource, "structured_fallback");
    assert.equal(result.dataNotice, "");
    assert.equal(result.priorities.reduce((sum, item) => sum + item.percentage, 0), 100);
    assert.equal(result.priorities[0].skill, "writing");
    const perDay = new Map();
    result.weeks[0].tasks.forEach((task) => {
        assert.ok(ROUTES.has(task.route));
        assert.ok(task.durationMinutes >= 15);
        const day = String(task.date).slice(0, 10);
        perDay.set(day, (perDay.get(day) || 0) + task.durationMinutes);
    });
    perDay.forEach((minutes) => assert.ok(minutes <= 120));

    const limited = await generatePlan(settings(), analysis({ hasEnoughData: false, performanceCount: 0 }), { skipAi: true });
    assert.match(limited.dataNotice, /need more IELTSX performance data/);
});

test("task completion affects study statistics but not estimated bands", async () => {
    const result = await generatePlan(settings(), analysis(), { skipAi: true });
    const originalBands = structuredClone(result.estimatedBands);
    result.weeks[0].tasks[0].status = "completed";
    result.weeks[0].tasks[0].completedAt = new Date().toISOString();
    const stats = planStats(result);
    assert.ok(stats.completedMinutes > 0);
    assert.deepEqual(result.estimatedBands, originalBands);
});

test("Study Plan file store keeps plans isolated by authenticated user id", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ieltsx-study-plan-"));
    const filePath = path.join(directory, "plans.json");
    const store = createStudyPlanStore({ filePath, mongoose: { connection: { readyState: 0 } }, StudyPlan: null });
    await store.save("user-a", { settings: settings(), estimatedBands: analysis().estimatedBands, weeks: [] });
    await store.save("user-b", { settings: settings({ targetBand: 7.5 }), estimatedBands: analysis().estimatedBands, weeks: [] });
    assert.equal((await store.get("user-a")).settings.targetBand, 7);
    assert.equal((await store.get("user-b")).settings.targetBand, 7.5);
    assert.equal(await store.get("user-c"), null);
    await store.remove("user-a");
    assert.equal(await store.get("user-a"), null);
    assert.equal((await store.get("user-b")).userId, "user-b");
});

test("Study Plan generation rate limits are scoped by action and reset after deletion", () => {
    const userId = "rate-limit-user";
    const request = { user: { id: userId }, method: "POST", path: "/api/study-plan/generate" };
    let nextCalls = 0;
    const response = {
        statusCode: 200,
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; }
    };

    for (let index = 0; index < 8; index += 1) {
        generationRateLimit(request, response, () => { nextCalls += 1; });
    }
    assert.equal(nextCalls, 8);
    generationRateLimit(request, response, () => { nextCalls += 1; });
    assert.equal(response.statusCode, 429);
    assert.ok(Number(response.headers["Retry-After"]) > 0);

    const settingsRequest = { ...request, method: "PATCH", path: "/api/study-plan/settings" };
    generationRateLimit(settingsRequest, response, () => { nextCalls += 1; });
    assert.equal(nextCalls, 9);

    clearGenerationRateLimit(userId);
    generationRateLimit(request, response, () => { nextCalls += 1; });
    assert.equal(nextCalls, 10);
});

test("Study Plan Premium screen reuses the three-column Premium Required component", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "study-plan-premium-locked.html"), "utf8");
    const component = fs.readFileSync(path.join(__dirname, "..", "premium-required-page.js"), "utf8");
    assert.match(html, /icon:\s*"CalendarCheck2"/);
    assert.match(html, /title:\s*"Study Plan requires Premium"/);
    assert.match(html, /Personalized IELTS study plans are available for Premium users/);
    assert.match(html, /Personalized plan/);
    assert.match(html, /AI analysis/);
    assert.match(html, /Daily schedule/);
    assert.match(html, /study-plan-personalized\.png/);
    assert.match(html, /study-plan-ai-analysis\.png/);
    assert.match(html, /study-plan-daily-schedule\.png/);
    assert.match(html, /backLabel:\s*"Back to Home"/);
    assert.match(html, /backPath:\s*"\/"/);
    assert.doesNotMatch(html, /Back to Profile/);
    assert.doesNotMatch(html, /topImage:/);
    assert.match(component, /features\.length === 4/);
});
