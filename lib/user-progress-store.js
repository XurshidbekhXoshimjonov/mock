const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
    calculateReadingBand,
    calculateListeningBand
} = require("./ielts-import/bandScoring");

const MAX_RESULTS_PER_USER = 250;
const MAX_ACCOUNT_ACTIVITIES = 50;
const MAX_VOCABULARY_WORDS_PER_RESULT = 80;

function roundBand(value) {
    if (!Number.isFinite(Number(value))) {
        return 0;
    }

    return Math.round(Number(value) * 2) / 2;
}

function skillFromType(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized.includes("listening")) {
        return "listening";
    }

    if (normalized.includes("reading")) {
        return "reading";
    }

    return "practice";
}

function scaledBand(skill, correct, total) {
    if (!total) {
        return 0;
    }

    const scaledCorrect = Math.round((correct / total) * 40);
    return skill === "listening"
        ? calculateListeningBand(scaledCorrect)
        : calculateReadingBand(scaledCorrect);
}

function average(items) {
    if (!items.length) {
        return 0;
    }

    return items.reduce((sum, value) => sum + Number(value || 0), 0) / items.length;
}

function isoDay(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toISOString().slice(0, 10);
}

function normalizePart(value) {
    if (String(value).toLowerCase() === "full") {
        return "full";
    }

    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeVocabularyWord(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
        .replace(/'s$/i, "")
        .replace(/[^a-z0-9'-]/g, "");
}

function normalizeVocabularyReviewItems(items, attemptId) {
    if (!Array.isArray(items)) {
        return [];
    }

    const seen = new Set();
    const timestampFor = (value) => {
        const date = new Date(value || Date.now());
        return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    };

    return items
        .map((item) => {
            const word = String(item?.word || "").trim();
            const normalized = normalizeVocabularyWord(item?.normalized || word);

            if (!word || !normalized || seen.has(normalized)) {
                return null;
            }

            seen.add(normalized);

            return {
                word,
                normalized,
                definition: String(item.definition || item.englishDefinition || "").trim(),
                uzbekTranslation: String(item.uzbekTranslation || item.translation || "").trim(),
                example: String(item.example || item.exampleSentence || "").trim(),
                passageId: String(item.passageId || "").trim(),
                attemptId: String(item.attemptId || attemptId || "").trim(),
                timestamp: timestampFor(item.timestamp)
            };
        })
        .filter(Boolean)
        .slice(0, MAX_VOCABULARY_WORDS_PER_RESULT);
}

function normalizeAnswerReviewItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map((item) => {
            const number = Number(item?.number);
            if (!Number.isFinite(number)) {
                return null;
            }

            return {
                number,
                userAnswer: String(item.userAnswer || "").trim(),
                correctAnswer: String(item.correctAnswer || item.mainAnswer || "").trim(),
                alternatives: Array.isArray(item.alternatives)
                    ? item.alternatives.map((answer) => String(answer || "").trim()).filter(Boolean)
                    : [],
                status: String(item.status || "").trim()
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.number - b.number);
}

function createUserProgressStore(filePath) {
    function ensureFile() {
        const directory = path.dirname(filePath);
        fs.mkdirSync(directory, { recursive: true });

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify({ users: {} }, null, 2), "utf8");
        }
    }

    function readStore() {
        ensureFile();

        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
            return parsed && parsed.users ? parsed : { users: {} };
        } catch {
            return { users: {} };
        }
    }

    function writeStore(store) {
        ensureFile();
        fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
    }

    function getUserEntry(store, userId) {
        const id = String(userId);
        const existing = store.users[id] || {};

        return {
            preferences: {
                targetBand: existing.preferences?.targetBand ?? null
            },
            results: Array.isArray(existing.results) ? existing.results : [],
            accountActivities: Array.isArray(existing.accountActivities) ? existing.accountActivities : []
        };
    }

    function normalizeResult(result) {
        const correct = Math.max(0, Number(result.correct) || 0);
        const total = Math.max(0, Number(result.total) || 0);

        if (!total || correct > total) {
            const error = new Error("A valid completed test score is required");
            error.statusCode = 400;
            throw error;
        }

        const type = String(result.type || result.skill || "Practice").trim() || "Practice";
        const skill = skillFromType(result.skill || type);
        const suppliedBand = Number(result.band);
        const band = Number.isFinite(suppliedBand) && suppliedBand >= 0
            ? roundBand(suppliedBand)
            : scaledBand(skill, correct, total);
        const completedAt = new Date(result.completedAt || Date.now());
        const attemptId = String(result.attemptId || "").trim();

        return {
            id: result.id || `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
            testId: String(result.testId || "").trim(),
            title: String(result.title || `${type} Test`).trim(),
            type,
            skill,
            part: normalizePart(result.part),
            correct,
            total,
            accuracy: Math.round((correct / total) * 100),
            band,
            practiceUrl: String(result.practiceUrl || "").trim(),
            attemptId,
            vocabulary: normalizeVocabularyReviewItems(result.vocabulary, attemptId),
            correctAnswers: normalizeAnswerReviewItems(result.correctAnswers),
            wrongAnswers: normalizeAnswerReviewItems(result.wrongAnswers),
            completedAt: Number.isNaN(completedAt.getTime())
                ? new Date().toISOString()
                : completedAt.toISOString()
        };
    }

    function recordResult(userId, result) {
        const store = readStore();
        const entry = getUserEntry(store, userId);
        const normalized = normalizeResult(result);

        entry.results = [normalized, ...entry.results]
            .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        store.users[String(userId)] = entry;
        writeStore(store);
        return normalized;
    }

    function removeResult(userId, resultId) {
        const store = readStore();
        const entry = getUserEntry(store, userId);
        const id = String(resultId || "").trim();
        const index = entry.results.findIndex((result) => String(result.id) === id);
        if (index < 0) return null;

        const [removed] = entry.results.splice(index, 1);
        store.users[String(userId)] = entry;
        writeStore(store);
        return removed;
    }

    function updatePreferences(userId, preferences) {
        const store = readStore();
        const entry = getUserEntry(store, userId);
        const targetBand = preferences.targetBand === null || preferences.targetBand === ""
            ? null
            : roundBand(preferences.targetBand);

        if (targetBand !== null && (targetBand < 0 || targetBand > 9)) {
            const error = new Error("Target band must be between 0 and 9");
            error.statusCode = 400;
            throw error;
        }

        entry.preferences.targetBand = targetBand;
        store.users[String(userId)] = entry;
        writeStore(store);
        return entry.preferences;
    }

    function recordAccountActivity(userId, title, occurredAt = new Date().toISOString()) {
        const store = readStore();
        const entry = getUserEntry(store, userId);
        const latest = entry.accountActivities[0];
        const next = {
            id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
            type: "account",
            title: String(title || "Account activity"),
            occurredAt: new Date(occurredAt).toISOString()
        };

        if (latest?.title === next.title && isoDay(latest.occurredAt) === isoDay(next.occurredAt)) {
            return latest;
        }

        entry.accountActivities = [next, ...entry.accountActivities].slice(0, MAX_ACCOUNT_ACTIVITIES);
        store.users[String(userId)] = entry;
        writeStore(store);
        return next;
    }

    function buildWeeklyActivity(results) {
        const counts = new Map();
        results.forEach((result) => {
            const day = isoDay(result.completedAt);
            if (day) counts.set(day, (counts.get(day) || 0) + 1);
        });

        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setUTCHours(0, 0, 0, 0);
            date.setUTCDate(date.getUTCDate() - (6 - index));
            const day = date.toISOString().slice(0, 10);

            return {
                date: day,
                label: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
                count: counts.get(day) || 0
            };
        });
    }

    function buildProgress(results, skill) {
        return results
            .filter((result) => result.skill === skill)
            .slice()
            .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
            .slice(-12)
            .map((result) => ({
                id: result.id,
                label: new Date(result.completedAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short"
                }),
                accuracy: result.accuracy,
                band: result.band,
                completedAt: result.completedAt
            }));
    }

    function buildSummary(entry, accountCreatedAt, options = {}) {
        const historyLimit = Math.min(Math.max(Number(options.historyLimit) || 20, 1), 50);
        const activityLimit = Math.min(Math.max(Number(options.activityLimit) || 20, 1), 50);
        const results = entry.results
            .slice()
            .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        const reading = results.filter((result) => result.skill === "reading");
        const listening = results.filter((result) => result.skill === "listening");
        const totalQuestions = results.reduce((sum, result) => sum + result.total, 0);
        const totalCorrect = results.reduce((sum, result) => sum + result.correct, 0);
        const best = results.slice().sort((a, b) => (
            b.accuracy - a.accuracy ||
            b.band - a.band ||
            new Date(b.completedAt) - new Date(a.completedAt)
        ))[0] || null;
        const skillBands = [
            reading.length ? roundBand(average(reading.map((result) => result.band))) : null,
            listening.length ? roundBand(average(listening.map((result) => result.band))) : null
        ].filter((value) => value !== null);
        const activity = [
            ...results.slice(0, 12).flatMap((result) => ([
                {
                    id: result.id,
                    type: result.skill,
                    title: `Completed ${result.title}`,
                    detail: `${result.correct}/${result.total} correct | Band ${result.band.toFixed(1)}`,
                    occurredAt: result.completedAt
                },
                {
                    id: `${result.id}-band`,
                    type: "band",
                    title: `${result.skill === "listening" ? "Listening" : "Reading"} band updated to ${result.band.toFixed(1)}`,
                    detail: `Calculated from ${result.title}`,
                    occurredAt: result.completedAt
                }
            ])),
            ...entry.accountActivities.map((item) => ({
                ...item,
                detail: "Account activity"
            }))
        ];

        if (accountCreatedAt && !entry.accountActivities.some((item) => item.title === "Account created")) {
            activity.push({
                id: "account-created",
                type: "account",
                title: "Account created",
                detail: "IELTSX profile activity",
                occurredAt: new Date(accountCreatedAt).toISOString()
            });
        }

        activity.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));

        return {
            targetBand: entry.preferences.targetBand,
            overallBand: skillBands.length ? roundBand(average(skillBands)) : 0,
            readingBand: reading.length ? roundBand(average(reading.map((result) => result.band))) : 0,
            listeningBand: listening.length ? roundBand(average(listening.map((result) => result.band))) : 0,
            testsCompleted: results.length,
            accuracy: totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
            bestScore: best ? `${best.correct}/${best.total}` : null,
            bestAccuracy: best?.accuracy || 0,
            totalQuestions,
            averageReadingScore: reading.length ? Math.round(average(reading.map((result) => result.accuracy))) : null,
            averageListeningScore: listening.length ? Math.round(average(listening.map((result) => result.accuracy))) : null,
            lastPracticeDate: results[0]?.completedAt || null,
            testHistory: results.slice(0, historyLimit),
            activities: activity.slice(0, activityLimit),
            charts: {
                weeklyActivity: buildWeeklyActivity(results),
                readingProgress: buildProgress(results, "reading"),
                listeningProgress: buildProgress(results, "listening"),
                bandTrend: results
                    .slice()
                    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
                    .slice(-12)
                    .map((result) => ({
                        id: result.id,
                        label: new Date(result.completedAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short"
                        }),
                        value: result.band,
                        skill: result.skill,
                        completedAt: result.completedAt
                    }))
            }
        };
    }

    function getProgress(userId, options = {}) {
        const store = readStore();
        const entry = getUserEntry(store, userId);
        return buildSummary(entry, options.accountCreatedAt, options);
    }

    return {
        getProgress,
        recordResult,
        removeResult,
        updatePreferences,
        recordAccountActivity
    };
}

module.exports = {
    createUserProgressStore
};
