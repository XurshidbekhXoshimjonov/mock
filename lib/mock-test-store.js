const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
    calculateReadingBand,
    calculateListeningBand
} = require("./ielts-import/bandScoring");

const SECTIONS = ["listening", "reading", "writing", "speaking"];
const REQUIRED_SECTION_REFS = ["listening", "reading", "writing"];
const MAX_RESULTS_PER_USER = 100;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function roundBand(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 2) / 2;
}

function makeId(prefix = "mock-test") {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function ensureJsonFile(filePath, fallback) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
    }
}

function readJson(filePath, fallback) {
    ensureJsonFile(filePath, fallback);

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return parsed && typeof parsed === "object" ? parsed : clone(fallback);
    } catch {
        return clone(fallback);
    }
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function normalizeStatus(value) {
    const status = String(value || "").trim().toLowerCase();
    if (status === "active" || status === "published") return "active";
    return "draft";
}

function hasCompleteSectionRefs(test) {
    return REQUIRED_SECTION_REFS.every((section) => String(test?.[`${section}TestId`] || "").trim());
}

function isActiveTest(test) {
    return normalizeStatus(test?.status) === "active";
}

function normalizeNumber(value, fallback = 1) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeTest(test = {}, fallbackNumber = 1) {
    const number = normalizeNumber(test.testNumber ?? test.number, fallbackNumber);
    const createdAt = test.createdAt || new Date().toISOString();
    const rawAccess = String(test.access || (test.isPremium === true || test.requiresPremium === true ? "premium" : "free")).trim().toLowerCase();
    const access = rawAccess === "premium" ? "premium" : "free";

    return {
        id: String(test.id || makeId("mock-test")),
        title: String(test.title || `Mock Test ${number}`).trim(),
        testNumber: number,
        number,
        description: String(test.description || "").trim(),
        status: normalizeStatus(test.status),
        access,
        isPremium: access === "premium",
        listeningTestId: String(test.listeningTestId || test.listening?.testId || "").trim(),
        readingTestId: String(test.readingTestId || test.reading?.testId || "").trim(),
        writingTestId: String(test.writingTestId || test.writing?.testId || "").trim(),
        speakingTestId: String(test.speakingTestId || test.speaking?.testId || "").trim(),
        createdAt,
        updatedAt: test.updatedAt || createdAt
    };
}

function publicSummary(test) {
    return {
        id: test.id,
        number: test.number,
        testNumber: test.testNumber,
        title: test.title,
        description: test.description,
        status: test.status,
        access: test.access || (test.isPremium ? "premium" : "free"),
        isPremium: test.isPremium === true || test.access === "premium",
        label: test.description || "Full IELTS mock exam",
        sections: "Listening + Reading + Writing + Speaking",
        estimatedTime: "2h 55m",
        openUrl: `/mock-test/${encodeURIComponent(test.id)}`,
        resultUrl: `/mock-test/${encodeURIComponent(test.id)}/result`,
        updatedAt: test.updatedAt,
        createdAt: test.createdAt
    };
}

function adminSummary(test) {
    return {
        ...publicSummary(test),
        listeningTestId: test.listeningTestId,
        readingTestId: test.readingTestId,
        writingTestId: test.writingTestId,
        speakingTestId: test.speakingTestId,
        listeningQuestionCount: 0,
        readingQuestionCount: 0
    };
}

function collectListeningQuestions(test) {
    if (Array.isArray(test?.listeningQuestions)) return test.listeningQuestions;
    if (Array.isArray(test?.listening?.questions)) return test.listening.questions;
    return (test?.listening?.parts || []).flatMap((part) => part.questions || []);
}

function collectReadingQuestions(test) {
    if (Array.isArray(test?.readingQuestions)) return test.readingQuestions;
    if (Array.isArray(test?.reading?.questions)) return test.reading.questions;
    return (test?.reading?.passages || []).flatMap((passage) => passage.questions || []);
}

function normalizeAnswerValue(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/\s+/g, " ");
}

function answerAlternatives(answer) {
    if (Array.isArray(answer)) {
        return answer.flatMap(answerAlternatives);
    }

    return String(answer || "")
        .split(/\s*(?:\/|\||,|;)\s*/)
        .map(normalizeAnswerValue)
        .filter(Boolean);
}

function isAnswerCorrect(userAnswer, correctAnswer) {
    const alternatives = answerAlternatives(correctAnswer);
    if (!alternatives.length) return false;

    if (Array.isArray(userAnswer)) {
        const selected = userAnswer.map(normalizeAnswerValue).filter(Boolean).sort();
        return alternatives.some((answer) => answer.split("+").map(normalizeAnswerValue).filter(Boolean).sort().join("|") === selected.join("|"));
    }

    return alternatives.includes(normalizeAnswerValue(userAnswer));
}

function scoreObjective(questions, answers, skill) {
    const total = questions.length;
    const correct = questions.reduce((sum, question) => {
        const value = answers?.[question.id] ?? answers?.[question.number] ?? answers?.[`q${question.number}`] ?? "";
        return sum + (isAnswerCorrect(value, question.answer) ? 1 : 0);
    }, 0);
    const scaledCorrect = total ? Math.round((correct / total) * 40) : 0;
    const band = total
        ? (skill === "listening" ? calculateListeningBand(scaledCorrect) : calculateReadingBand(scaledCorrect))
        : 0;

    return {
        correct,
        total,
        band: roundBand(band),
        rawBandBasis: scaledCorrect
    };
}

function scoreObjectiveSection(questions, sectionPayload, skill) {
    const result = sectionPayload?.result || {};
    const correct = Number(result.correct);
    const total = Number(result.total);
    const band = Number(result.band);

    if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) {
        const rawBandBasis = Number(result.normalizedScore) || Math.round((correct / total) * 40);
        return {
            correct,
            total,
            band: roundBand(Number.isFinite(band) ? band : (skill === "listening" ? calculateListeningBand(rawBandBasis) : calculateReadingBand(rawBandBasis))),
            rawBandBasis
        };
    }

    return scoreObjective(questions, sectionPayload?.answers || sectionPayload || {}, skill);
}

function estimateSpeakingBand(answers = {}) {
    const values = Object.values(answers || {}).map((value) => String(value || "").trim()).filter(Boolean);
    const wordCount = values.join(" ").split(/\s+/).filter(Boolean).length;

    if (wordCount >= 80) return 6;
    if (wordCount > 0) return 5;
    return 0;
}

function resultFromSubmission(test, submission = {}) {
    const scoringTest = submission.__scoringTest || test;
    const sections = submission.sections || submission.answers || submission || {};
    const listening = scoreObjectiveSection(collectListeningQuestions(scoringTest), sections.listening || {}, "listening");
    const reading = scoreObjectiveSection(collectReadingQuestions(scoringTest), sections.reading || {}, "reading");
    const writingBand = roundBand(Number(sections.writing?.result?.overallBand || sections.writing?.band) || 0);
    const speakingBand = roundBand(Number(sections.speaking?.band || sections.speaking?.result?.overallBand) || estimateSpeakingBand(sections.speaking?.answers || sections.speaking || {}));
    const bandValues = [listening.band, reading.band, writingBand, speakingBand].filter((value) => Number(value) > 0);
    const completedSections = SECTIONS.filter((section) => sections[section]);

    return {
        id: makeId("mock-result"),
        testId: test.id,
        testNumber: test.testNumber || test.number,
        title: test.title,
        overallBand: bandValues.length ? roundBand(bandValues.reduce((sum, value) => sum + value, 0) / bandValues.length) : 0,
        listening,
        reading,
        writing: {
            band: writingBand,
            status: writingBand ? "completed" : "pending"
        },
        speaking: {
            band: speakingBand,
            status: speakingBand ? "completed" : "pending"
        },
        completedSections,
        answers: sections,
        completedAt: new Date(submission.completedAt || Date.now()).toISOString()
    };
}

function createMockTestStore({ testsFile, resultsFile }) {
    function readTestsPayload() {
        const payload = readJson(testsFile, { tests: [] });
        const tests = Array.isArray(payload.tests) ? payload.tests : [];

        return {
            tests: tests
                .map((test, index) => normalizeTest(test, index + 1))
                .sort((a, b) => a.number - b.number)
        };
    }

    function writeTestsPayload(tests) {
        writeJson(testsFile, {
            tests: tests.map((test, index) => normalizeTest(test, index + 1))
        });
    }

    function readResultsPayload() {
        return readJson(resultsFile, { users: {} });
    }

    function writeResultsPayload(payload) {
        writeJson(resultsFile, payload);
    }

    function listTests(options = {}) {
        const tests = readTestsPayload().tests;
        return options.includeDraft ? tests : tests.filter((test) => test.status === "active" && hasCompleteSectionRefs(test));
    }

    function listActiveTests(options = {}) {
        const tests = readTestsPayload().tests.filter(isActiveTest);
        return options.requireComplete === false
            ? tests
            : tests.filter(hasCompleteSectionRefs);
    }

    function latestActiveTest(options = {}) {
        return listActiveTests(options)
            .slice()
            .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0] || null;
    }

    function getTest(id, options = {}) {
        const locator = String(id || "").trim().toLowerCase();
        const test = readTestsPayload().tests.find((item) => (
            item.id.toLowerCase() === locator ||
            String(item.number) === locator ||
            `mock-test-${item.number}` === locator
        ));

        if (!test) return null;
        if (!options.includeDraft && test.status !== "active") return null;
        if (!options.includeDraft && options.requireComplete !== false && !hasCompleteSectionRefs(test)) return null;
        return test;
    }

    function nextNumber(tests) {
        return tests.reduce((max, test) => Math.max(max, Number(test.number) || 0), 0) + 1;
    }

    function createTest(payload = {}) {
        const current = readTestsPayload().tests;
        const number = normalizeNumber(payload.testNumber ?? payload.number, nextNumber(current));
        const now = new Date().toISOString();
        const test = normalizeTest({
            ...payload,
            id: payload.id || makeId("mock-test"),
            testNumber: number,
            number,
            createdAt: now,
            updatedAt: now
        }, number);

        current.push(test);
        writeTestsPayload(current);
        return test;
    }

    function updateTest(id, payload = {}) {
        const current = readTestsPayload().tests;
        const index = current.findIndex((test) => test.id === id);

        if (index === -1) return null;

        const existing = current[index];
        current[index] = normalizeTest({
            ...existing,
            ...payload,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString()
        }, existing.number);
        writeTestsPayload(current);
        return current[index];
    }

    function deleteTest(id) {
        const current = readTestsPayload().tests;
        const next = current.filter((test) => test.id !== id);
        if (next.length === current.length) return false;
        writeTestsPayload(next);
        return true;
    }

    function userResultEntry(payload, userId) {
        const id = String(userId || "guest");
        const existing = payload.users[id] || {};
        return {
            progress: existing.progress && typeof existing.progress === "object" ? existing.progress : {},
            results: Array.isArray(existing.results) ? existing.results : []
        };
    }

    function recordSectionProgress(userId, testId, sectionPayload = {}) {
        const payload = readResultsPayload();
        const entry = userResultEntry(payload, userId);
        const section = String(sectionPayload.section || "").toLowerCase();

        if (!SECTIONS.includes(section)) {
            const error = new Error("A valid mock test section is required");
            error.statusCode = 400;
            throw error;
        }

        entry.progress[testId] = {
            ...(entry.progress[testId] || {}),
            [section]: {
                answers: sectionPayload.answers || {},
                result: sectionPayload.result || {},
                band: Number(sectionPayload.band) || 0,
                completed: Boolean(sectionPayload.completed),
                savedAt: new Date().toISOString()
            }
        };
        payload.users[String(userId)] = entry;
        writeResultsPayload(payload);
        return entry.progress[testId];
    }

    function submitAttempt(userId, testId, submission = {}) {
        const test = getTest(testId, { includeDraft: true });
        if (!test) {
            const error = new Error("Mock test not found");
            error.statusCode = 404;
            throw error;
        }

        const payload = readResultsPayload();
        const entry = userResultEntry(payload, userId);
        const result = resultFromSubmission(test, submission);

        entry.results = [result, ...entry.results]
            .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        delete entry.progress[test.id];
        payload.users[String(userId)] = entry;
        writeResultsPayload(payload);
        return result;
    }

    function clearProgress(userId, testId) {
        const payload = readResultsPayload();
        const entry = userResultEntry(payload, userId);
        delete entry.progress[testId];
        payload.users[String(userId)] = entry;
        writeResultsPayload(payload);
        return entry.progress;
    }

    function latestResult(userId, testId) {
        const payload = readResultsPayload();
        const entry = userResultEntry(payload, userId);
        return entry.results.find((result) => String(result.testId) === String(testId)) || null;
    }

    function resultById(userId, resultId) {
        const payload = readResultsPayload();
        const entry = userResultEntry(payload, userId);
        return entry.results.find((result) => String(result.id) === String(resultId)) || null;
    }

    function removeResult(userId, resultId) {
        const payload = readResultsPayload();
        const entry = userResultEntry(payload, userId);
        const id = String(resultId || "").trim();
        const index = entry.results.findIndex((result) => String(result.id) === id);
        if (index < 0) return null;

        const [removed] = entry.results.splice(index, 1);
        payload.users[String(userId)] = entry;
        writeResultsPayload(payload);
        return removed;
    }

    function profileSummary(userId) {
        const payload = readResultsPayload();
        const entry = userResultEntry(payload, userId);
        const results = entry.results
            .slice()
            .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        const best = results.reduce((winner, result) => (
            !winner || Number(result.overallBand || 0) > Number(winner.overallBand || 0) ? result : winner
        ), null);
        const latest = results[0] || null;
        const scoredResults = results.map((result) => Number(result.overallBand || 0)).filter((value) => Number.isFinite(value) && value > 0);

        return {
            completedMockTests: results.length,
            averageOverallBand: scoredResults.length
                ? roundBand(scoredResults.reduce((sum, value) => sum + value, 0) / scoredResults.length)
                : 0,
            bestOverallBand: best ? Number(best.overallBand || 0) : 0,
            lastResult: latest,
            breakdown: latest ? {
                listening: latest.listening?.band || 0,
                reading: latest.reading?.band || 0,
                writing: latest.writing?.band || 0,
                speaking: latest.speaking?.band || 0
            } : {
                listening: 0,
                reading: 0,
                writing: 0,
                speaking: 0
            },
            chart: results.slice(0, 6).reverse().map((result) => ({
                id: result.id,
                label: `Mock ${result.testNumber}`,
                value: Number(result.overallBand || 0),
                completedAt: result.completedAt
            })),
            recent: results.slice(0, 10)
        };
    }

    return {
        listTests,
        getTest,
        latestActiveTest,
        createTest,
        updateTest,
        deleteTest,
        publicSummary,
        adminSummary,
        recordSectionProgress,
        clearProgress,
        submitAttempt,
        latestResult,
        resultById,
        removeResult,
        profileSummary
    };
}

module.exports = {
    createMockTestStore
};
