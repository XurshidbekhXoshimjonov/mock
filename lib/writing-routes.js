const path = require("path");
const OpenAI = require("openai");
const WritingPrompt = require("../models/WritingPrompt");
const WritingFullTest = require("../models/WritingFullTest");
const WritingSubmission = require("../models/WritingSubmission");
const { hasPremiumAccess } = require("../premium-config");

const OPENAI_MISSING_KEY_ERROR = "OpenAI API key is missing on the server.";
const HALF_BAND_VALUES = Array.from({ length: 19 }, (_, index) => index / 2);
let openaiClient = null;
let openaiClientKey = "";

function registerWritingRoutes(app, deps) {
    const {
        requireAuth,
        requireAdmin,
        requirePremiumWriting = (req, res, next) => next(),
        requirePremiumWritingOrMockAccess = requirePremiumWriting,
        listeningImageUpload,
        getMockWritingFullTest
    } = deps;
    const isDevelopment = process.env.NODE_ENV !== "production";

    if (isDevelopment) {
        console.log("OPENAI KEY EXISTS:", Boolean(getWritingOpenAIKey()));
    }

    function getWritingOpenAIKey() {
        return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.AI_API_KEY || "").trim();
    }

    function getWritingOpenAIModel() {
        return String(process.env.OPENAI_WRITING_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
    }

    // Helper to calculate word count
    function countWords(str) {
        if (!str || typeof str !== "string") return 0;
        return str.trim().split(/\s+/).filter(Boolean).length;
    }

    function getMongoUserId(user) {
        const id = String(user?.id || "").trim();
        return id || null;
    }

    function getUserObjectId(user) {
        const id = String(user?.id || "").trim();
        return /^[a-f0-9]{24}$/i.test(id) ? id : undefined;
    }

    function getMongoDocumentId(value) {
        const id = String(value || "").trim();
        return /^[a-f0-9]{24}$/i.test(id) ? id : null;
    }

    function logDevelopment(label, payload) {
        if (isDevelopment) {
            console.log(label, payload);
        }
    }

    function getOpenAIClient() {
        const apiKey = getWritingOpenAIKey();
        if (!apiKey) {
            const error = new Error(OPENAI_MISSING_KEY_ERROR);
            error.statusCode = 500;
            error.publicError = OPENAI_MISSING_KEY_ERROR;
            error.code = "OPENAI_API_KEY_MISSING";
            throw error;
        }

        if (!openaiClient || openaiClientKey !== apiKey) {
            openaiClient = new OpenAI({
                apiKey
            });
            openaiClientKey = apiKey;
        }

        return openaiClient;
    }

    function isMissingOpenAIKeyError(error) {
        return error?.code === "OPENAI_API_KEY_MISSING";
    }

    function sendWritingEvaluationError(res, error) {
        if (isMissingOpenAIKeyError(error)) {
            return res.status(500).json({ error: OPENAI_MISSING_KEY_ERROR });
        }

        return res.status(502).json({ error: "AI evaluation failed. Please try again." });
    }

    function parseJsonObject(rawContent) {
        const content = String(rawContent || "").trim();
        const withoutFence = content
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/i, "")
            .trim();
        return JSON.parse(withoutFence);
    }

    function coerceBand(value, fieldName) {
        const numeric = parseFloat(String(value).trim());
        if (!Number.isFinite(numeric)) {
            throw new Error(`OpenAI response is missing numeric field: ${fieldName}`);
        }
        if (numeric < 0 || numeric > 9) {
            throw new Error(`OpenAI response has out-of-range IELTS band for ${fieldName}: ${numeric}`);
        }
        if (Math.abs(numeric * 2 - Math.round(numeric * 2)) > 0.000001) {
            throw new Error(`OpenAI response must use IELTS half-band increments for ${fieldName}: ${numeric}`);
        }
        return numeric;
    }

    function halfBandSchema() {
        return { type: "number", enum: HALF_BAND_VALUES };
    }

    function normalizeStringArray(value, fieldName) {
        if (!Array.isArray(value)) {
            throw new Error(`OpenAI response is missing array field: ${fieldName}`);
        }
        return value.map(item => String(item || "").trim()).filter(Boolean);
    }

    function normalizeOptionalStringArray(value) {
        return Array.isArray(value)
            ? value.map(item => String(item || "").trim()).filter(Boolean)
            : [];
    }

    function buildExaminerFeedback(raw, criteria, weaknessItems) {
        const explicit = String(
            raw.examinerFeedback ||
            raw.examiner_feedback ||
            raw.overallFeedback ||
            raw.feedback ||
            raw.summary ||
            ""
        ).trim();
        if (explicit) return explicit;

        const scores = Object.entries(criteria)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ");
        const weaknessSummary = normalizeOptionalStringArray(weaknessItems).slice(0, 2).join(" ");
        return `Estimated from IELTS Writing descriptors. Criteria scores: ${scores}.${weaknessSummary ? ` Main focus: ${weaknessSummary}` : ""}`;
    }

    function roundToNearestHalf(value, fieldName = "band") {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            throw new Error(`Cannot calculate IELTS band from non-numeric value: ${fieldName}`);
        }
        return Math.round(numeric * 2) / 2;
    }

    function calculateTaskBand(criteriaScores, label) {
        const entries = Object.entries(criteriaScores);
        if (entries.length !== 4) {
            throw new Error(`Expected four IELTS criteria scores for ${label}`);
        }

        const values = entries.map(([criterion, value]) => coerceBand(value, `${label}.${criterion}`));
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        const band = roundToNearestHalf(average, `${label}.band`);

        logDevelopment("Writing calculated task band:", {
            task: label,
            criteria: criteriaScores,
            average,
            band
        });

        return band;
    }

    function normalizeTask1Feedback(raw) {
        const criteria = {
            taskAchievement: coerceBand(raw.taskAchievement, "taskAchievement"),
            coherenceCohesion: coerceBand(raw.coherenceCohesion, "coherenceCohesion"),
            lexicalResource: coerceBand(raw.lexicalResource, "lexicalResource"),
            grammarRangeAccuracy: coerceBand(raw.grammarRangeAccuracy, "grammarRangeAccuracy")
        };
        logDevelopment("Writing parsed criteria scores:", { mode: "task1", criteria });
        const estimatedBand = calculateTaskBand(criteria, "task1");
        const strengths = normalizeStringArray(raw.strengths, "strengths");
        const weaknesses = normalizeOptionalStringArray(raw.weaknesses).length
            ? normalizeOptionalStringArray(raw.weaknesses)
            : normalizeStringArray(raw.mistakes, "mistakes");
        const suggestions = normalizeStringArray(raw.suggestions, "suggestions");
        const improvedEssay = String(raw.improvedEssay || raw.improvedVersion || "").trim();

        return {
            estimatedBand,
            ...criteria,
            strengths,
            weaknesses,
            mistakes: weaknesses,
            suggestions,
            mainProblems: normalizeOptionalStringArray(raw.mainProblems),
            grammarMistakes: normalizeOptionalStringArray(raw.grammarMistakes),
            unnaturalPhrases: normalizeOptionalStringArray(raw.unnaturalPhrases),
            repeatedIdeas: normalizeOptionalStringArray(raw.repeatedIdeas),
            howToReachNextBand: normalizeOptionalStringArray(raw.howToReachNextBand),
            improvedEssay,
            improvedVersion: improvedEssay,
            examinerFeedback: buildExaminerFeedback(raw, criteria, weaknesses)
        };
    }

    function normalizeTask2Feedback(raw) {
        const criteria = {
            taskResponse: coerceBand(raw.taskResponse, "taskResponse"),
            coherenceCohesion: coerceBand(raw.coherenceCohesion, "coherenceCohesion"),
            lexicalResource: coerceBand(raw.lexicalResource, "lexicalResource"),
            grammarRangeAccuracy: coerceBand(raw.grammarRangeAccuracy, "grammarRangeAccuracy")
        };
        logDevelopment("Writing parsed criteria scores:", { mode: "task2", criteria });
        const estimatedBand = calculateTaskBand(criteria, "task2");
        const strengths = normalizeStringArray(raw.strengths, "strengths");
        const weaknesses = normalizeOptionalStringArray(raw.weaknesses).length
            ? normalizeOptionalStringArray(raw.weaknesses)
            : normalizeStringArray(raw.mistakes, "mistakes");
        const suggestions = normalizeStringArray(raw.suggestions, "suggestions");
        const improvedEssay = String(raw.improvedEssay || raw.improvedVersion || "").trim();

        return {
            estimatedBand,
            ...criteria,
            strengths,
            weaknesses,
            mistakes: weaknesses,
            suggestions,
            mainProblems: normalizeOptionalStringArray(raw.mainProblems),
            grammarMistakes: normalizeOptionalStringArray(raw.grammarMistakes),
            unnaturalPhrases: normalizeOptionalStringArray(raw.unnaturalPhrases),
            repeatedIdeas: normalizeOptionalStringArray(raw.repeatedIdeas),
            howToReachNextBand: normalizeOptionalStringArray(raw.howToReachNextBand),
            improvedEssay,
            improvedVersion: improvedEssay,
            examinerFeedback: buildExaminerFeedback(raw, criteria, weaknesses)
        };
    }

    function normalizeFullEvaluation(raw) {
        const task1 = raw.task1 || {};
        const task2 = raw.task2 || {};
        const task1Criteria = task1.criteria || {};
        const task2Criteria = task2.criteria || {};
        const normalizedTask1Criteria = {
            taskAchievement: coerceBand(task1Criteria.taskAchievement, "task1.criteria.taskAchievement"),
            coherenceCohesion: coerceBand(task1Criteria.coherenceCohesion, "task1.criteria.coherenceCohesion"),
            lexicalResource: coerceBand(task1Criteria.lexicalResource, "task1.criteria.lexicalResource"),
            grammar: coerceBand(task1Criteria.grammar, "task1.criteria.grammar")
        };
        const normalizedTask2Criteria = {
            taskResponse: coerceBand(task2Criteria.taskResponse, "task2.criteria.taskResponse"),
            coherenceCohesion: coerceBand(task2Criteria.coherenceCohesion, "task2.criteria.coherenceCohesion"),
            lexicalResource: coerceBand(task2Criteria.lexicalResource, "task2.criteria.lexicalResource"),
            grammar: coerceBand(task2Criteria.grammar, "task2.criteria.grammar")
        };
        logDevelopment("Writing parsed criteria scores:", {
            mode: "full",
            task1: normalizedTask1Criteria,
            task2: normalizedTask2Criteria
        });

        const normalizedTask1Band = calculateTaskBand(normalizedTask1Criteria, "full.task1");
        const normalizedTask2Band = calculateTaskBand(normalizedTask2Criteria, "full.task2");
        const weightedAverage = (normalizedTask1Band + normalizedTask2Band * 2) / 3;
        const overallBand = roundToNearestHalf(weightedAverage, "full.overallBand");
        logDevelopment("Writing calculated overall band:", {
            task1Band: normalizedTask1Band,
            task2Band: normalizedTask2Band,
            weightedAverage,
            overallBand
        });

        return {
            overallBand,
            task1: {
                band: normalizedTask1Band,
                criteria: normalizedTask1Criteria,
                strengths: normalizeStringArray(task1.strengths, "task1.strengths"),
                areasForImprovement: normalizeStringArray(task1.areasForImprovement, "task1.areasForImprovement"),
                suggestions: normalizeStringArray(task1.suggestions, "task1.suggestions"),
                mainProblems: normalizeOptionalStringArray(task1.mainProblems),
                grammarMistakes: normalizeOptionalStringArray(task1.grammarMistakes),
                unnaturalPhrases: normalizeOptionalStringArray(task1.unnaturalPhrases),
                repeatedIdeas: normalizeOptionalStringArray(task1.repeatedIdeas),
                howToReachNextBand: normalizeOptionalStringArray(task1.howToReachNextBand),
                improvedVersion: String(task1.improvedVersion || "").trim()
            },
            task2: {
                band: normalizedTask2Band,
                criteria: normalizedTask2Criteria,
                strengths: normalizeStringArray(task2.strengths, "task2.strengths"),
                areasForImprovement: normalizeStringArray(task2.areasForImprovement, "task2.areasForImprovement"),
                suggestions: normalizeStringArray(task2.suggestions, "task2.suggestions"),
                mainProblems: normalizeOptionalStringArray(task2.mainProblems),
                grammarMistakes: normalizeOptionalStringArray(task2.grammarMistakes),
                unnaturalPhrases: normalizeOptionalStringArray(task2.unnaturalPhrases),
                repeatedIdeas: normalizeOptionalStringArray(task2.repeatedIdeas),
                howToReachNextBand: normalizeOptionalStringArray(task2.howToReachNextBand),
                improvedVersion: String(task2.improvedVersion || "").trim()
            }
        };
    }

    function getPromptTitle(prompt, fallback) {
        return String(prompt?.title || fallback || "Writing Test").trim();
    }

    function paginationParams(req, defaults = {}) {
        const maxLimit = Number(defaults.maxLimit) || 100;
        const defaultLimit = Number(defaults.defaultLimit) || 50;
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), maxLimit);
        return { page, limit, skip: (page - 1) * limit };
    }

    function setPaginationHeaders(res, { page, limit, total }) {
        res.setHeader("X-Total-Count", String(total));
        res.setHeader("X-Page", String(page));
        res.setHeader("X-Limit", String(limit));
        res.setHeader("X-Total-Pages", String(Math.max(Math.ceil(total / limit), 1)));
    }

    function documentObject(document) {
        return typeof document?.toObject === "function" ? document.toObject() : document;
    }

    function hasAllowedVisualDiagramExtension(value) {
        const pathname = String(value || "").split(/[?#]/)[0].toLowerCase();
        return [".jpg", ".jpeg", ".png", ".webp", ".gif"].some(extension => pathname.endsWith(extension));
    }

    function isExternalVisualDiagramUrl(value) {
        try {
            const parsed = new URL(String(value || "").trim());
            return parsed.protocol === "https:" && hasAllowedVisualDiagramExtension(parsed.pathname);
        } catch {
            return false;
        }
    }

    function isUploadedVisualDiagramUrl(value) {
        const raw = String(value || "").trim();
        return raw.startsWith("/uploads/") && hasAllowedVisualDiagramExtension(raw);
    }

    function getVisualDiagramUrl(prompt) {
        return String(prompt?.visualDiagramUrl || prompt?.imageUrl || "").trim();
    }

    function validateVisualDiagramUrl(value) {
        const visualDiagramUrl = String(value || "").trim();
        if (!visualDiagramUrl) return { visualDiagramUrl: "", error: "" };
        if (isUploadedVisualDiagramUrl(visualDiagramUrl) || isExternalVisualDiagramUrl(visualDiagramUrl)) {
            return { visualDiagramUrl, error: "" };
        }
        if (visualDiagramUrl.startsWith("/uploads/")) {
            return {
                visualDiagramUrl,
                error: "Uploaded image URLs must end in .jpg, .jpeg, .png, .webp, or .gif."
            };
        }
        return {
            visualDiagramUrl,
            error: "Visual Diagram URL must start with https:// and end in .jpg, .jpeg, .png, .webp, or .gif."
        };
    }

    function serializePrompt(prompt) {
        const item = documentObject(prompt) || {};
        return {
            ...item,
            visualDiagramUrl: getVisualDiagramUrl(item),
            isPremium: item.isPremium === true
        };
    }

    function serializeFullWritingTest(test) {
        const item = documentObject(test) || {};
        const task1PromptId = item.task1PromptId && typeof item.task1PromptId === "object"
            ? serializePrompt(item.task1PromptId)
            : item.task1PromptId;
        const task2PromptId = item.task2PromptId && typeof item.task2PromptId === "object"
            ? serializePrompt(item.task2PromptId)
            : item.task2PromptId;
        return {
            ...item,
            task1PromptId,
            task2PromptId,
            isPremium: item.isPremium === true
        };
    }

    function writingTestRequiresPremium(test) {
        const item = documentObject(test) || {};
        return item.isPremium === true || item.requiresPremium === true || String(item.access || item.accessType || "").toLowerCase() === "premium";
    }

    function ensureWritingTestAccess(req, res, test) {
        if (!writingTestRequiresPremium(test)) return true;
        if (hasPremiumAccess(req.user)) return true;
        res.status(403).json({
            error: "premium_required",
            code: "PREMIUM_REQUIRED",
            message: "Writing practice and AI Writing evaluation require Premium.",
            feature: "writing",
            upgradeUrl: "/premium"
        });
        return false;
    }

    function promptSummary(prompt) {
        const item = documentObject(prompt);
        return {
            _id: String(item._id),
            id: String(item._id),
            title: item.title || "",
            testNumber: item.testNumber || undefined,
            type: item.taskType || "task1",
            taskType: item.taskType || "task1",
            status: item.status || "draft",
            isPremium: item.isPremium === true,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            wordLimit: item.wordLimit,
            timeLimit: item.timeLimit,
            questionType: item.questionType || "",
            visualDiagramUrl: getVisualDiagramUrl(item)
        };
    }

    function fullWritingSummary(test) {
        const item = documentObject(test);
        return {
            _id: String(item._id),
            id: String(item._id),
            title: item.title || "",
            testNumber: item.testNumber || undefined,
            type: "full",
            status: item.status || "draft",
            isPremium: item.isPremium === true,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            timeLimit: item.timeLimit,
            task1PromptId: String(item.task1PromptId?._id || item.task1PromptId || ""),
            task2PromptId: String(item.task2PromptId?._id || item.task2PromptId || "")
        };
    }

    function safeStringArray(value) {
        return Array.isArray(value)
            ? value.map(item => String(item || "").trim()).filter(Boolean)
            : [];
    }

    function buildSingleCriteria(mode, feedback) {
        if (mode === "task1") {
            return {
                taskAchievement: coerceBand(feedback.taskAchievement, "taskAchievement"),
                coherenceCohesion: coerceBand(feedback.coherenceCohesion, "coherenceCohesion"),
                lexicalResource: coerceBand(feedback.lexicalResource, "lexicalResource"),
                grammarRangeAccuracy: coerceBand(feedback.grammarRangeAccuracy, "grammarRangeAccuracy")
            };
        }

        return {
            taskResponse: coerceBand(feedback.taskResponse, "taskResponse"),
            coherenceCohesion: coerceBand(feedback.coherenceCohesion, "coherenceCohesion"),
            lexicalResource: coerceBand(feedback.lexicalResource, "lexicalResource"),
            grammarRangeAccuracy: coerceBand(feedback.grammarRangeAccuracy, "grammarRangeAccuracy")
        };
    }

    function prefixList(label, items) {
        return safeStringArray(items || [])
            .map(item => item.includes(":") ? item : `${label}: ${item}`);
    }

    function buildFullList(task1Items, task2Items, fieldName) {
        return [
            ...prefixList("Task 1", task1Items || []),
            ...prefixList("Task 2", task2Items || [])
        ].filter(Boolean);
    }

    function buildWritingSubmissionPayload({
        mode,
        prompt,
        test,
        essay,
        task1Response,
        task2Response,
        feedback,
        timeSpent
    }) {
        if (mode === "full") {
            const taskTitle = getPromptTitle(test, "Full Writing Test");
            return {
                mode,
                testType: mode,
                taskTitle,
                userResponse: [task1Response, task2Response].filter(Boolean).join("\n\n--- Task 2 ---\n\n"),
                task1Response: task1Response || "",
                task2Response: task2Response || "",
                task1Essay: task1Response || "",
                task2Essay: task2Response || "",
                task1WordCount: countWords(task1Response),
                task2WordCount: countWords(task2Response),
                timeSpent: timeSpent || 0,
                criteriaScores: {
                    task1: feedback.task1?.criteria || {},
                    task2: feedback.task2?.criteria || {}
                },
                overallBand: Number(feedback.overallBand) || 0,
                task1Band: Number(feedback.task1?.band) || 0,
                task2Band: Number(feedback.task2?.band) || 0,
                strengths: buildFullList(feedback.task1?.strengths, feedback.task2?.strengths),
                areasForImprovement: buildFullList(feedback.task1?.areasForImprovement, feedback.task2?.areasForImprovement),
                suggestions: buildFullList(feedback.task1?.suggestions, feedback.task2?.suggestions),
                feedback,
                estimatedBand: Number(feedback.overallBand) || 0
            };
        }

        const taskTitle = getPromptTitle(prompt, mode === "task2" ? "Writing Task 2" : "Writing Task 1");
        return {
            mode,
            testType: mode,
            taskTitle,
            userResponse: essay || "",
            task1Response: mode === "task1" ? essay || "" : "",
            task2Response: mode === "task2" ? essay || "" : "",
            task1Essay: mode === "task1" ? essay || "" : "",
            task2Essay: mode === "task2" ? essay || "" : "",
            task1WordCount: mode === "task1" ? countWords(essay) : 0,
            task2WordCount: mode === "task2" ? countWords(essay) : 0,
            timeSpent: timeSpent || 0,
            criteriaScores: buildSingleCriteria(mode, feedback),
            overallBand: Number(feedback.estimatedBand) || 0,
            strengths: normalizeStringArray(feedback.strengths || [], "strengths"),
            areasForImprovement: normalizeStringArray(feedback.mistakes || [], "mistakes"),
            suggestions: normalizeStringArray(feedback.suggestions || [], "suggestions"),
            feedback,
            estimatedBand: Number(feedback.estimatedBand) || 0
        };
    }

    function deriveSingleCriteria(mode, feedback, storedCriteria) {
        if (storedCriteria && Object.keys(storedCriteria).length) return storedCriteria;
        if (mode === "task1") {
            return {
                taskAchievement: Number(feedback.taskAchievement) || 0,
                coherenceCohesion: Number(feedback.coherenceCohesion) || 0,
                lexicalResource: Number(feedback.lexicalResource) || 0,
                grammarRangeAccuracy: Number(feedback.grammarRangeAccuracy) || 0
            };
        }
        return {
            taskResponse: Number(feedback.taskResponse) || 0,
            coherenceCohesion: Number(feedback.coherenceCohesion) || 0,
            lexicalResource: Number(feedback.lexicalResource) || 0,
            grammarRangeAccuracy: Number(feedback.grammarRangeAccuracy) || 0
        };
    }

    function serializeWritingSubmission(submission) {
        const feedback = submission.feedback || {};
        const mode = submission.testType || submission.mode || "task1";
        const task1Prompt = submission.task1PromptId || null;
        const task2Prompt = submission.task2PromptId || null;
        const titleFallback = mode === "full"
            ? "Full Writing Test"
            : mode === "task2"
                ? getPromptTitle(task2Prompt, "Writing Task 2")
                : getPromptTitle(task1Prompt, "Writing Task 1");
        const criteriaScores = mode === "full"
            ? (submission.criteriaScores && Object.keys(submission.criteriaScores).length
                ? submission.criteriaScores
                : {
                    task1: feedback.task1?.criteria || {},
                    task2: feedback.task2?.criteria || {}
                })
            : deriveSingleCriteria(mode, feedback, submission.criteriaScores || {});
        const overallBand = Number(submission.overallBand || submission.estimatedBand || feedback.overallBand || feedback.estimatedBand || 0);

        return {
            id: String(submission._id),
            testType: mode,
            taskTitle: submission.taskTitle || titleFallback,
            userResponse: submission.userResponse || submission.task1Response || submission.task2Response || submission.task1Essay || submission.task2Essay || "",
            task1Response: submission.task1Response || submission.task1Essay || "",
            task2Response: submission.task2Response || submission.task2Essay || "",
            criteriaScores,
            overallBand,
            task1Band: Number(submission.task1Band || feedback.task1?.band || 0),
            task2Band: Number(submission.task2Band || feedback.task2?.band || 0),
            strengths: submission.strengths?.length ? submission.strengths : (
                mode === "full" ? buildFullList(feedback.task1?.strengths, feedback.task2?.strengths) : safeStringArray(feedback.strengths || [])
            ),
            areasForImprovement: submission.areasForImprovement?.length ? submission.areasForImprovement : (
                mode === "full" ? buildFullList(feedback.task1?.areasForImprovement, feedback.task2?.areasForImprovement) : safeStringArray(feedback.mistakes || [])
            ),
            suggestions: submission.suggestions?.length ? submission.suggestions : (
                mode === "full" ? buildFullList(feedback.task1?.suggestions, feedback.task2?.suggestions) : safeStringArray(feedback.suggestions || [])
            ),
            feedback,
            createdAt: submission.createdAt,
            updatedAt: submission.updatedAt
        };
    }

    function serializeWritingSubmissionSummary(submission) {
        const mode = submission.testType || submission.mode || "task1";
        const task1Prompt = submission.task1PromptId || null;
        const task2Prompt = submission.task2PromptId || null;
        const titleFallback = mode === "full"
            ? "Full Writing Test"
            : mode === "task2"
                ? getPromptTitle(task2Prompt, "Writing Task 2")
                : getPromptTitle(task1Prompt, "Writing Task 1");
        return {
            id: String(submission._id),
            testType: mode,
            taskTitle: submission.taskTitle || titleFallback,
            overallBand: Number(submission.overallBand || submission.estimatedBand || 0),
            task1Band: Number(submission.task1Band || 0),
            task2Band: Number(submission.task2Band || 0),
            createdAt: submission.createdAt,
            updatedAt: submission.updatedAt
        };
    }

    function summarizeWritingSubmissions(submissions) {
        const attempts = Array.isArray(submissions) ? submissions : [];
        const bands = attempts
            .map(item => Number(item.overallBand || item.estimatedBand || 0))
            .filter(value => Number.isFinite(value) && value > 0);
        const isType = (item, type) => (item.testType || item.mode) === type;
        const latest = attempts[0] || null;
        return {
            totalAttempts: attempts.length,
            task1Attempts: attempts.filter(item => isType(item, "task1")).length,
            task2Attempts: attempts.filter(item => isType(item, "task2")).length,
            fullAttempts: attempts.filter(item => isType(item, "full")).length,
            averageBand: bands.length
                ? Math.round((bands.reduce((sum, value) => sum + value, 0) / bands.length) * 10) / 10
                : 0,
            bestBand: bands.length ? Math.max(...bands) : 0,
            latestBand: bands.length ? Number(latest?.overallBand || latest?.estimatedBand || 0) : 0
        };
    }

    function emptyWritingProfilePayload() {
        return {
            summary: {
                totalAttempts: 0,
                task1Attempts: 0,
                task2Attempts: 0,
                fullAttempts: 0,
                averageBand: 0,
                bestBand: 0,
                latestBand: 0
            },
            recent: []
        };
    }

    async function generateAIFeedback(mode, promptText, studentEssay, task2PromptText = "", task2StudentEssay = "") {
        try {
            const openai = getOpenAIClient();
            const scoringGuidance = `You are a STRICT and REALISTIC IELTS examiner. You must score like a real examiner in a formal IELTS test center, NOT like a friendly English tutor. Your goal is ACCURATE scoring that differentiates essay quality.

FUNDAMENTAL RULES:
- Score each of the 4 criteria INDEPENDENTLY using half-band increments.
- Allowed values: ${HALF_BAND_VALUES.map(value => value.toFixed(1)).join(", ")}.
- CRITICAL: Do NOT default to any single score (like 5.5, 6.5, or 7.0) for all essays. Differentiate between weak (4.0-5.0), average (5.5-6.0), good (6.5-7.0), and excellent (7.5-9.0) essays based on their actual quality.
- The final overall band score must be calculated as: average = (TR + CC + LR + GRA) / 4, overall = Math.round(average * 2) / 2.

STRICT CALIBRATION RULES (YOU MUST ADHERE TO THESE):
- Band 5.0: Ideas are limited/underdeveloped, frequent grammar errors, meaning is sometimes unclear, and cohesion is faulty.
- Band 5.5: Understandable essay but has frequent grammatical/lexical errors and limited development of ideas.
- Band 6.0: Answers the task and has clear progression, but has noticeable grammar/vocabulary problems, mechanical linking, or minor spelling/word choice issues.
- Band 6.5: Clear answer with some good language and complex sentences, but noticeable errors still prevent it from reaching Band 7.
- Band 7.0: Clear position throughout, well-developed ideas with support, good vocabulary with collocations, and mostly error-free sentences with complex structures. Very few minor errors.
- Band 7.5+: Natural and flexible language, strong idea development, precise vocabulary, and very few grammatical errors.

DETAILED CRITERIA SCORING GUIDELINES:

1. Task Achievement (Task 1) / Task Response (Task 2)
- Band 9.0: Fully addresses all parts of the task, presents a fully developed answer with well-supported ideas.
- Band 7.0-8.0: Clear position throughout, addresses all parts of the prompt, ideas are well-developed.
- Band 6.0-6.5: Addresses all parts of the task but some ideas are listed rather than explained/developed, or position is clear but conclusion is slightly incomplete.
- Band 5.0-5.5: Only addresses the task partially, position is unclear, or ideas are very limited/underdeveloped.
- Band 4.0 or below: Does not address the task, off-topic, or ideas are completely undeveloped.

2. Coherence and Cohesion
- Band 9.0: Cohesive devices used naturally/sparingly, paragraphs flow perfectly.
- Band 7.0-8.0: Logical paragraphing, clear progression, variety of linking words used well.
- Band 6.0-6.5: Clear paragraphing, but linking words are mechanical, repetitive, or noticeable.
- Band 5.0-5.5: Paragraphing is confusing/missing, faulty linking words, lacks clear progression.
- Band 4.0 or below: Lacks organization, ideas are disjointed, very weak linking.

3. Lexical Resource
- Band 9.0: Sophisticated, natural vocabulary, precise collocations, virtually no spelling errors.
- Band 7.0-8.0: Wide vocabulary range, less common words, collocations, only occasional spelling/word choice errors.
- Band 6.0-6.5: Adequate vocabulary for the topic, but uses repetitive words, basic terms, or has some word choice/spelling errors.
- Band 5.0-5.5: Limited vocabulary, frequent word choice errors, or spelling mistakes that occasionally impede meaning.
- Band 4.0 or below: Extremely limited vocabulary, frequent spelling errors that make it hard to understand.

4. Grammatical Range and Accuracy
- Band 9.0: Wide range of complex sentence structures used with full accuracy, virtually no grammar mistakes.
- Band 7.0-8.0: Mix of simple and complex sentences, mostly error-free sentences, very few grammar errors.
- Band 6.0-6.5: Mix of simple and complex sentences, but has noticeable grammar errors in complex sentences, though meaning remains clear.
- Band 5.0-5.5: Frequent grammar errors (subject-verb, tenses, plurals) that sometimes make sentences hard to understand; simple structures dominate.
- Band 4.0 or below: Severe/frequent grammar errors in almost every sentence, meaning is often unclear.

MANDATORY PENALTY RULES (APPLY STRICTLY):
- GRAMMAR PENALTY: If the essay has frequent grammar errors, Grammatical Range and Accuracy MUST NOT be higher than 6.0.
- POSITION PENALTY: If the position/opinion is unclear or does not directly answer the question, Task Response MUST NOT be higher than 6.0.
- DEVELOPMENT PENALTY: If ideas are listed but not explained, Task Response MUST NOT be higher than 6.0.
- MEMORIZED PHRASES PENALTY: If the essay is memorized, unnatural, or full of template phrases (e.g., 'In today's modern world', 'There are two sides of the coin', 'plays a vital/crucial role'), reduce Lexical Resource and Coherence scores by at least 1.0 band.
- CONCLUSION PENALTY: If the conclusion is incomplete, penalize Task Response and Coherence scores.

BEFORE SCORES ARE ASSIGNED, YOU MUST:
1. Identify the essay type.
2. Check whether the student answered the exact question asked.
3. Check if the opinion is clear.
4. Count major grammar mistakes (subject-verb agreement, tenses, plural/singular, punctuation).
5. Identify repeated ideas.
6. Identify memorized or unnatural phrases.
7. Assess whether ideas are fully developed.`;

            const task1StrictGuidance = `
ADDITIONAL RULES FOR TASK 1:
- If there is NO clear overview paragraph/sentence identifying main trends/features, cap Task Achievement at 5.0.
- If the overview is weak or superficial, cap Task Achievement at 6.0.
- If the essay lists data item-by-item without meaningful comparisons, cap Task Achievement at 6.0.
- If important data/figures from the visual are missing or inaccurate, cap Task Achievement at 6.0.
- If the essay is under 150 words, apply word count penalty.
- Band 7+ requires: mature comparison, logical grouping, accurate trend analysis, flexible vocabulary, varied complex sentences, and a clear well-supported overview.
- A year-by-year report listing values chronologically with basic patterns = Band 5.5-6.0, NOT Band 7.`;

            let systemPrompt = "";
            let userContent = "";
            const studentWordCount = countWords(studentEssay);
            const task2StudentWordCount = countWords(task2StudentEssay);

            if (mode === "task1") {
                systemPrompt = `You are a STRICT IELTS Academic Writing examiner scoring a formal IELTS test. You must NOT be generous. Grade the student's Writing Task 1 essay.

${scoringGuidance}
${task1StrictGuidance}

You MUST respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "estimatedBand": number,
  "taskAchievement": number,
  "coherenceCohesion": number,
  "lexicalResource": number,
  "grammarRangeAccuracy": number,
  "strengths": ["string"],
  "weaknesses": ["string"],
  "suggestions": ["string"],
  "mainProblems": ["string - list the 3-5 most critical problems that lowered the score"],
  "grammarMistakes": ["string - quote each specific grammar error from the essay with correction, e.g. 'the number of students were → was (subject-verb agreement)'"],
  "unnaturalPhrases": ["string - quote each memorized, unnatural, or template phrase found in the essay"],
  "repeatedIdeas": ["string - describe any ideas that were repeated without adding new content"],
  "improvedEssay": "Full improved Band 8+ version of the essay",
  "examinerFeedback": "Detailed examiner feedback: explain WHY each criterion received its score, referencing specific parts of the essay",
  "howToReachNextBand": ["string - specific, actionable advice to improve by 0.5-1.0 band"]
}

Task 1 criteria: Task Achievement, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy.
estimatedBand = Math.round(average of four criteria * 2) / 2.
Return ONLY JSON.`;

                userContent = `IELTS Writing Task 1 Prompt:\n${promptText}\n\nStudent Essay (${studentWordCount} words):\n${studentEssay}`;
            } else if (mode === "task2") {
                systemPrompt = `You are a STRICT IELTS Academic Writing examiner scoring a formal IELTS test. You must NOT be generous. Grade the student's Writing Task 2 essay.

${scoringGuidance}

ADDITIONAL STRICT RULES FOR TASK 2:
- If the essay does not address ALL parts of the question, cap Task Response at 6.0 maximum.
- If the essay presents both sides in a "discuss both views" question but does not give a clear personal opinion when asked, cap Task Response at 6.0.
- If body paragraphs contain only one sentence of explanation per idea, cap Task Response at 6.0.
- If the essay uses more than 3 memorized template phrases, cap Lexical Resource at 5.5.
- Band 7 Task Response requires: a clear position throughout, fully extended and well-supported ideas, and a conclusion that clearly follows from the discussion.

You MUST respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "estimatedBand": number,
  "taskResponse": number,
  "coherenceCohesion": number,
  "lexicalResource": number,
  "grammarRangeAccuracy": number,
  "strengths": ["string"],
  "weaknesses": ["string"],
  "suggestions": ["string"],
  "mainProblems": ["string - list the 3-5 most critical problems that lowered the score"],
  "grammarMistakes": ["string - quote each specific grammar error from the essay with correction, e.g. 'peoples → people (uncountable noun)'"],
  "unnaturalPhrases": ["string - quote each memorized, unnatural, or template phrase found in the essay"],
  "repeatedIdeas": ["string - describe any ideas that were repeated without adding new content"],
  "improvedEssay": "Full improved Band 8+ version of the essay",
  "examinerFeedback": "Detailed examiner feedback: explain WHY each criterion received its score, referencing specific parts of the essay",
  "howToReachNextBand": ["string - specific, actionable advice to improve by 0.5-1.0 band"]
}

Task 2 criteria: Task Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy.
estimatedBand = Math.round(average of four criteria * 2) / 2.
Return ONLY JSON.`;

                userContent = `IELTS Writing Task 2 Prompt:\n${promptText}\n\nStudent Essay (${studentWordCount} words):\n${studentEssay}`;
            } else if (mode === "full") {
                systemPrompt = `You are a STRICT IELTS Academic Writing examiner scoring a formal IELTS test. You must NOT be generous. Grade BOTH Task 1 and Task 2 essays independently.

${scoringGuidance}
${task1StrictGuidance}

ADDITIONAL STRICT RULES FOR TASK 2 (apply to task2 scoring):
- If the essay does not address ALL parts of the question, cap Task Response at 6.0 maximum.
- If the essay presents both sides in a "discuss both views" question but does not give a clear personal opinion when asked, cap Task Response at 6.0.
- If body paragraphs contain only one sentence of explanation per idea, cap Task Response at 6.0.
- If the essay uses more than 3 memorized template phrases, cap Lexical Resource at 5.5.

You MUST respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "overallBand": number,
  "task1": {
    "band": number,
    "criteria": {
      "taskAchievement": number,
      "coherenceCohesion": number,
      "lexicalResource": number,
      "grammar": number
    },
    "strengths": ["string"],
    "areasForImprovement": ["string"],
    "suggestions": ["string"],
    "mainProblems": ["string"],
    "grammarMistakes": ["string"],
    "unnaturalPhrases": ["string"],
    "repeatedIdeas": ["string"],
    "howToReachNextBand": ["string"]
  },
  "task2": {
    "band": number,
    "criteria": {
      "taskResponse": number,
      "coherenceCohesion": number,
      "lexicalResource": number,
      "grammar": number
    },
    "strengths": ["string"],
    "areasForImprovement": ["string"],
    "suggestions": ["string"],
    "mainProblems": ["string"],
    "grammarMistakes": ["string"],
    "unnaturalPhrases": ["string"],
    "repeatedIdeas": ["string"],
    "howToReachNextBand": ["string"]
  }
}

task1.band = Math.round(average of Task 1 four criteria * 2) / 2.
task2.band = Math.round(average of Task 2 four criteria * 2) / 2.
The server recalculates overall band as (Task 1 band + Task 2 band * 2) / 3, rounded to nearest half band.
Return ONLY JSON.`;

                userContent = `IELTS Writing Task 1 Prompt:\n${promptText}\n\nTask 1 Student Essay (${studentWordCount} words):\n${studentEssay}\n\n=========================\n\nIELTS Writing Task 2 Prompt:\n${task2PromptText}\n\nTask 2 Student Essay (${task2StudentWordCount} words):\n${task2StudentEssay}`;
            }

            console.log("Writing OpenAI call starts:", { mode });
            const data = await openai.chat.completions.create({
                model: getWritingOpenAIModel(),
                response_format: mode === "full" ? {
                    type: "json_schema",
                    json_schema: {
                        name: "academic_writing_full_evaluation",
                        strict: true,
                        schema: {
                            type: "object",
                            additionalProperties: false,
                            required: ["overallBand", "task1", "task2"],
                            properties: {
                                overallBand: halfBandSchema(),
                                task1: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["band", "criteria", "strengths", "areasForImprovement", "suggestions", "mainProblems", "grammarMistakes", "unnaturalPhrases", "repeatedIdeas", "howToReachNextBand"],
                                    properties: {
                                        band: halfBandSchema(),
                                        criteria: {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["taskAchievement", "coherenceCohesion", "lexicalResource", "grammar"],
                                            properties: {
                                                taskAchievement: halfBandSchema(),
                                                coherenceCohesion: halfBandSchema(),
                                                lexicalResource: halfBandSchema(),
                                                grammar: halfBandSchema()
                                            }
                                        },
                                        strengths: { type: "array", items: { type: "string" } },
                                        areasForImprovement: { type: "array", items: { type: "string" } },
                                        suggestions: { type: "array", items: { type: "string" } },
                                        mainProblems: { type: "array", items: { type: "string" } },
                                        grammarMistakes: { type: "array", items: { type: "string" } },
                                        unnaturalPhrases: { type: "array", items: { type: "string" } },
                                        repeatedIdeas: { type: "array", items: { type: "string" } },
                                        howToReachNextBand: { type: "array", items: { type: "string" } }
                                    }
                                },
                                task2: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["band", "criteria", "strengths", "areasForImprovement", "suggestions", "mainProblems", "grammarMistakes", "unnaturalPhrases", "repeatedIdeas", "howToReachNextBand"],
                                    properties: {
                                        band: halfBandSchema(),
                                        criteria: {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["taskResponse", "coherenceCohesion", "lexicalResource", "grammar"],
                                            properties: {
                                                taskResponse: halfBandSchema(),
                                                coherenceCohesion: halfBandSchema(),
                                                lexicalResource: halfBandSchema(),
                                                grammar: halfBandSchema()
                                            }
                                        },
                                        strengths: { type: "array", items: { type: "string" } },
                                        areasForImprovement: { type: "array", items: { type: "string" } },
                                        suggestions: { type: "array", items: { type: "string" } },
                                        mainProblems: { type: "array", items: { type: "string" } },
                                        grammarMistakes: { type: "array", items: { type: "string" } },
                                        unnaturalPhrases: { type: "array", items: { type: "string" } },
                                        repeatedIdeas: { type: "array", items: { type: "string" } },
                                        howToReachNextBand: { type: "array", items: { type: "string" } }
                                    }
                                }
                            }
                        }
                    }
                } : { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ],
                temperature: 0.3
            });
            console.log("Writing OpenAI response received:", {
                mode,
                id: data.id || null,
                model: data.model || null
            });
            const resultText = data.choices?.[0]?.message?.content;
            logDevelopment("Writing raw AI response:", { mode, content: resultText });
            let parsed;
            try {
                parsed = parseJsonObject(resultText);
            } catch (parseError) {
                console.error("Writing OpenAI JSON parsing failed:", parseError, resultText);
                throw parseError;
            }

            if (mode === "task1") return normalizeTask1Feedback(parsed);
            if (mode === "task2") return normalizeTask2Feedback(parsed);
            if (mode === "full") return normalizeFullEvaluation(parsed);

            throw new Error(`Unknown writing feedback mode: ${mode}`);
        } catch (error) {
            console.error("OpenAI API error message:", error?.message || error);
            throw error;
        }
    }

    // ==========================================
    // Student Endpoints
    // ==========================================

    // List published Task 1 prompts
    app.get("/api/writing/task1", requireAuth, async (req, res) => {
        try {
            const pagination = paginationParams(req);
            const query = { taskType: "task1", status: "published", mockOnly: { $ne: true } };
            const [prompts, total] = await Promise.all([
                WritingPrompt.find(query)
                    .select("_id title taskType status createdAt updatedAt wordLimit timeLimit questionType visualDiagramUrl imageUrl isPremium")
                    .sort({ createdAt: -1 })
                    .skip(pagination.skip)
                    .limit(pagination.limit)
                    .lean(),
                WritingPrompt.countDocuments(query)
            ]);
            setPaginationHeaders(res, { ...pagination, total });
            res.json(prompts.map(promptSummary));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch Task 1 prompts" });
        }
    });

    // List published Task 2 prompts
    app.get("/api/writing/task2", requireAuth, async (req, res) => {
        try {
            const pagination = paginationParams(req);
            const query = { taskType: "task2", status: "published", mockOnly: { $ne: true } };
            const [prompts, total] = await Promise.all([
                WritingPrompt.find(query)
                    .select("_id title taskType status createdAt updatedAt wordLimit timeLimit questionType visualDiagramUrl imageUrl isPremium")
                    .sort({ createdAt: -1 })
                    .skip(pagination.skip)
                    .limit(pagination.limit)
                    .lean(),
                WritingPrompt.countDocuments(query)
            ]);
            setPaginationHeaders(res, { ...pagination, total });
            res.json(prompts.map(promptSummary));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch Task 2 prompts" });
        }
    });

    // List published Full Tests
    app.get("/api/writing/full-tests", requireAuth, async (req, res) => {
        try {
            const pagination = paginationParams(req);
            const query = { status: "published", mockOnly: { $ne: true } };
            const [tests, total] = await Promise.all([
                WritingFullTest.find(query)
                    .select("_id title status createdAt updatedAt timeLimit task1PromptId task2PromptId isPremium")
                    .sort({ createdAt: -1 })
                    .skip(pagination.skip)
                    .limit(pagination.limit)
                    .lean(),
                WritingFullTest.countDocuments(query)
            ]);
            setPaginationHeaders(res, { ...pagination, total });
            res.json(tests.map(fullWritingSummary));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch Full Writing tests" });
        }
    });

    // Get specific Task 1 prompt
    app.get("/api/writing/task1/:id", requireAuth, async (req, res) => {
        try {
            const prompt = await WritingPrompt.findOne({ _id: req.params.id, taskType: "task1" });
            if (!prompt || prompt.mockOnly) return res.status(404).json({ error: "Task 1 prompt not found" });
            if (!ensureWritingTestAccess(req, res, prompt)) return;
            res.json(serializePrompt(prompt));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch prompt details" });
        }
    });

    // Get specific Task 2 prompt
    app.get("/api/writing/task2/:id", requireAuth, async (req, res) => {
        try {
            const prompt = await WritingPrompt.findOne({ _id: req.params.id, taskType: "task2" });
            if (!prompt || prompt.mockOnly) return res.status(404).json({ error: "Task 2 prompt not found" });
            if (!ensureWritingTestAccess(req, res, prompt)) return;
            res.json(serializePrompt(prompt));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch prompt details" });
        }
    });

    // Get specific Full Test (populated)
    app.get("/api/writing/full-tests/:id", requireAuth, async (req, res) => {
        try {
            const mockTest = typeof getMockWritingFullTest === "function"
                ? await getMockWritingFullTest(req.params.id)
                : null;

            if (mockTest) {
                if (!ensureWritingTestAccess(req, res, mockTest)) return;
                return res.json(serializeFullWritingTest(mockTest));
            }

            const test = await WritingFullTest.findById(req.params.id)
                .populate("task1PromptId")
                .populate("task2PromptId");
            if (!test || test.mockOnly) return res.status(404).json({ error: "Full test not found" });
            if (!ensureWritingTestAccess(req, res, test)) return;
            res.json(serializeFullWritingTest(test));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch Full test details" });
        }
    });

    async function evaluateSingleWritingRequest(req, res, options = {}) {
        const body = req.body || {};
        const taskType = options.taskType || body.taskType || body.task || body.type;
        const mode = taskType === "task2" ? "task2" : taskType === "task1" ? "task1" : "";
        const promptId = String(body.promptId || body.questionId || "").trim();
        const promptMongoId = getMongoDocumentId(promptId);
        const essay = String(body.essay ?? body.answer ?? body.response ?? body.userResponse ?? "").trim();
        const frontendPromptText = String(body.promptText ?? body.prompt ?? body.question ?? "").trim();
        const timeSpent = Number(body.timeSpent) || 0;
        const submittedWordCount = Number(body.wordCount ?? body.words ?? countWords(essay)) || countWords(essay);

        if (!mode) {
            return res.status(400).json({ error: "taskType must be task1 or task2." });
        }
        if (!essay) {
            return res.status(400).json({ error: `${mode === "task2" ? "Task 2" : "Task 1"} answer must not be empty.` });
        }
        if (!promptId && !frontendPromptText) {
            return res.status(400).json({ error: "promptId or prompt/question is required." });
        }
        if (promptId && !promptMongoId && !frontendPromptText) {
            return res.status(400).json({ error: "A valid promptId or prompt/question is required." });
        }

        logDevelopment("Writing evaluate request payload:", {
            taskType: mode,
            promptId: promptId || null,
            hasPromptText: Boolean(frontendPromptText),
            wordCount: submittedWordCount,
            essay,
            timeSpent
        });

        try {
            let prompt = null;
            if (promptMongoId) {
                prompt = await WritingPrompt.findOne({ _id: promptMongoId, taskType: mode });
            }
            if (prompt?.mockOnly) prompt = null;
            if (promptId && !prompt && !frontendPromptText) {
                return res.status(404).json({ error: "Prompt not found" });
            }
            if (prompt && !ensureWritingTestAccess(req, res, prompt)) return;

            const promptText = String(prompt?.promptText || frontendPromptText).trim();
            if (!promptText) {
                return res.status(400).json({ error: "Prompt/question text is required for writing evaluation." });
            }

            const feedback = await generateAIFeedback(mode, promptText, essay);
            const mongoUserId = getMongoUserId(req.user);
            const promptForPayload = prompt || {
                title: String(body.promptTitle || body.title || (mode === "task2" ? "Writing Task 2" : "Writing Task 1")).trim(),
                promptText
            };
            const responsePayload = {
                success: true,
                taskType: mode,
                wordCount: submittedWordCount,
                feedback,
                estimatedBand: feedback.estimatedBand
            };

            if (mongoUserId) {
                const submission = new WritingSubmission({
                    userId: mongoUserId,
                    userObjectId: getUserObjectId(req.user),
                    ...buildWritingSubmissionPayload({
                        mode,
                        prompt: promptForPayload,
                        essay,
                        feedback,
                        timeSpent
                    }),
                    task1PromptId: mode === "task1" && prompt ? promptMongoId : undefined,
                    task2PromptId: mode === "task2" && prompt ? promptMongoId : undefined
                });

                await submission.save();
                responsePayload.submissionId = submission._id;
            } else {
                logDevelopment(`Writing ${mode} submission save skipped: user id is not a Mongo ObjectId.`, {
                    userId: req.user?.id || null
                });
            }

            logDevelopment("Writing evaluate backend response:", responsePayload);
            return res.status(200).json(responsePayload);
        } catch (err) {
            console.error("Writing evaluation error:", err);
            return sendWritingEvaluationError(res, err);
        }
    }

    async function evaluateFullWritingRequest(req, res, options = {}) {
        const { requireFullTestId = false } = options;
        const {
            fullTestId,
            timeSpent,
            testType
        } = req.body;
        let {
            task1Prompt,
            task1Response,
            task2Prompt,
            task2Response
        } = req.body;

        task1Response = String(task1Response ?? req.body.task1Essay ?? "").trim();
        task2Response = String(task2Response ?? req.body.task2Essay ?? "").trim();
        task1Prompt = String(task1Prompt ?? "").trim();
        task2Prompt = String(task2Prompt ?? "").trim();

        console.log("Writing evaluate-full request received:", {
            fullTestId: fullTestId || null,
            testType: testType || null,
            hasTask1Prompt: Boolean(task1Prompt),
            hasTask1Response: Boolean(task1Response),
            hasTask2Prompt: Boolean(task2Prompt),
            hasTask2Response: Boolean(task2Response)
        });

        if (testType && testType !== "academic-writing-full") {
            return res.status(400).json({ success: false, message: "Invalid writing test type." });
        }
        if (!task1Response) {
            return res.status(400).json({ success: false, message: "Task 1 answer must not be empty." });
        }
        if (!task2Response) {
            return res.status(400).json({ success: false, message: "Task 2 answer must not be empty." });
        }
        if (requireFullTestId && !fullTestId) {
            return res.status(400).json({ success: false, message: "fullTestId is required." });
        }

        let test = null;
        if (fullTestId) {
            const mockTest = typeof getMockWritingFullTest === "function"
                ? await getMockWritingFullTest(fullTestId)
                : null;
            test = mockTest || await WritingFullTest.findById(fullTestId)
                    .populate("task1PromptId")
                    .populate("task2PromptId");
            if (!test) {
                return res.status(404).json({ success: false, message: "Full test not found." });
            }
            if (!ensureWritingTestAccess(req, res, test)) return;

            task1Prompt = task1Prompt || String(test.task1PromptId?.promptText || "").trim();
            task2Prompt = task2Prompt || String(test.task2PromptId?.promptText || "").trim();
        }

        if (!task1Prompt || !task2Prompt) {
            return res.status(400).json({ success: false, message: "task1Prompt and task2Prompt are required." });
        }

        const requestPayload = {
            fullTestId,
            task1Prompt,
            task1Response,
            task2Prompt,
            task2Response,
            testType: testType || "academic-writing-full",
            timeSpent: timeSpent || 0
        };
        logDevelopment("Writing evaluate-full request payload:", requestPayload);

        try {
            const evaluation = await generateAIFeedback(
                "full",
                task1Prompt,
                task1Response,
                task2Prompt,
                task2Response
            );

            const mongoUserId = getMongoUserId(req.user);
            if (mongoUserId) {
                const submissionPayload = buildWritingSubmissionPayload({
                    mode: "full",
                    test,
                    task1Response,
                    task2Response,
                    feedback: evaluation,
                    timeSpent
                });
                const submission = new WritingSubmission({
                    userId: mongoUserId,
                    userObjectId: getUserObjectId(req.user),
                    ...submissionPayload,
                    task1PromptId: test?.__mockWritingTest ? undefined : test?.task1PromptId?._id,
                    task2PromptId: test?.__mockWritingTest ? undefined : test?.task2PromptId?._id
                });
                await submission.save();
            } else {
                logDevelopment("Writing submission save skipped: user id is not a Mongo ObjectId.", {
                    userId: req.user?.id || null
                });
            }

            const responsePayload = evaluation;
            logDevelopment("Writing evaluate-full backend response:", responsePayload);
            return res.status(200).json(responsePayload);
        } catch (err) {
            console.error("Writing full evaluation error:", err);
            return sendWritingEvaluationError(res, err);
        }
    }

    app.post("/api/writing/evaluate", requireAuth, async (req, res) => {
        return evaluateSingleWritingRequest(req, res);
    });

    // Submit Task 1 Response
    app.post("/api/writing/submit-task1", requireAuth, async (req, res) => {
        return evaluateSingleWritingRequest(req, res, { taskType: "task1" });
    });

    // Submit Task 2 Response
    app.post("/api/writing/submit-task2", requireAuth, async (req, res) => {
        return evaluateSingleWritingRequest(req, res, { taskType: "task2" });
    });

    app.post("/api/writing/evaluate-full", requireAuth, async (req, res) => {
        return evaluateFullWritingRequest(req, res);
    });

    // Submit Full Test Response
    app.post("/api/writing/submit-full-test", requireAuth, async (req, res) => {
        return evaluateFullWritingRequest(req, res, { requireFullTestId: true });
    });

    app.get("/api/profile/writing", requireAuth, async (req, res) => {
        try {
            const mongoUserId = getMongoUserId(req.user);
            if (!mongoUserId) {
                return res.json(emptyWritingProfilePayload());
            }

            const pagination = paginationParams(req, { defaultLimit: 8, maxLimit: 30 });
            const [summaryDocs, submissions] = await Promise.all([
                WritingSubmission.find({ userId: mongoUserId })
                    .select("testType mode overallBand estimatedBand createdAt")
                    .sort({ createdAt: -1 })
                    .lean(),
                WritingSubmission.find({ userId: mongoUserId })
                    .select("_id testType mode taskTitle task1PromptId task2PromptId overallBand estimatedBand task1Band task2Band createdAt updatedAt")
                    .populate({ path: "task1PromptId", select: "title" })
                    .populate({ path: "task2PromptId", select: "title" })
                    .sort({ createdAt: -1 })
                    .skip(pagination.skip)
                    .limit(pagination.limit)
                    .lean()
            ]);
            const summary = summarizeWritingSubmissions(summaryDocs);
            const recent = submissions.map(serializeWritingSubmissionSummary);
            setPaginationHeaders(res, { ...pagination, total: summary.totalAttempts });

            res.json({
                summary,
                recent
            });
        } catch (err) {
            console.error("Writing profile history error:", err);
            res.status(500).json({ error: "Failed to load Writing history" });
        }
    });

    app.get("/api/profile/writing/:id", requireAuth, async (req, res) => {
        try {
            const mongoUserId = getMongoUserId(req.user);
            if (!mongoUserId) {
                return res.status(404).json({ error: "Writing attempt not found" });
            }

            const submission = await WritingSubmission.findOne({ _id: req.params.id, userId: mongoUserId })
                .populate({ path: "task1PromptId", select: "title" })
                .populate({ path: "task2PromptId", select: "title" });
            if (!submission) {
                return res.status(404).json({ error: "Writing attempt not found" });
            }

            res.json(serializeWritingSubmission(submission));
        } catch (err) {
            console.error("Writing profile detail error:", err);
            res.status(500).json({ error: "Failed to load Writing attempt" });
        }
    });

    // ==========================================
    // Admin Endpoints
    // ==========================================

    // Get all prompts
    app.get("/api/admin/writing/prompts", requireAdmin, async (req, res) => {
        try {
            const pagination = paginationParams(req);
            const query = {};
            if (req.query.taskType) query.taskType = req.query.taskType;
            if (req.query.status) query.status = req.query.status;
            const [prompts, total] = await Promise.all([
                WritingPrompt.find(query)
                    .select("_id title taskType status createdAt updatedAt wordLimit timeLimit questionType visualDiagramUrl imageUrl isPremium")
                    .sort({ createdAt: -1 })
                    .skip(pagination.skip)
                    .limit(pagination.limit)
                    .lean(),
                WritingPrompt.countDocuments(query)
            ]);
            setPaginationHeaders(res, { ...pagination, total });
            res.json(prompts.map(promptSummary));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch prompts" });
        }
    });

    app.get("/api/admin/writing/prompts/:id", requireAdmin, async (req, res) => {
        try {
            const prompt = await WritingPrompt.findById(req.params.id);
            if (!prompt) return res.status(404).json({ error: "Prompt not found" });
            res.json(serializePrompt(prompt));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch prompt" });
        }
    });

    // Create prompt
    app.post("/api/admin/writing/prompts", requireAdmin, async (req, res) => {
        try {
            const {
                taskType,
                title,
                promptText,
                visualDiagramUrl,
                imageUrl,
                difficulty,
                status,
                instructions,
                questionType,
                wordLimit,
                timeLimit,
                isPremium
            } = req.body;
            if (!taskType || !title || !promptText) {
                return res.status(400).json({ error: "taskType, title and promptText are required" });
            }
            const defaultWordLimit = taskType === "task2" ? 250 : 150;
            const defaultTimeLimit = taskType === "task2" ? 40 : 20;
            const diagramInput = visualDiagramUrl !== undefined ? visualDiagramUrl : imageUrl;
            const diagramValidation = validateVisualDiagramUrl(taskType === "task1" ? diagramInput : "");
            if (diagramValidation.error) {
                return res.status(400).json({ error: diagramValidation.error });
            }

            const prompt = new WritingPrompt({
                taskType,
                title,
                promptText,
                visualDiagramUrl: diagramValidation.visualDiagramUrl,
                imageUrl: diagramValidation.visualDiagramUrl,
                difficulty: difficulty || "medium",
                status: status || "draft",
                instructions: instructions || "",
                questionType: taskType === "task2" ? (questionType || "opinion") : "",
                wordLimit: Number(wordLimit) || defaultWordLimit,
                timeLimit: Number(timeLimit) || defaultTimeLimit,
                isPremium: isPremium === true
            });

            await prompt.save();
            res.status(201).json(serializePrompt(prompt));
        } catch (err) {
            res.status(500).json({ error: "Failed to create prompt" });
        }
    });

    // Update prompt
    app.put("/api/admin/writing/prompts/:id", requireAdmin, async (req, res) => {
        try {
            const {
                taskType,
                title,
                promptText,
                visualDiagramUrl,
                imageUrl,
                difficulty,
                status,
                instructions,
                questionType,
                wordLimit,
                timeLimit,
                isPremium
            } = req.body;
            const prompt = await WritingPrompt.findById(req.params.id);
            if (!prompt) return res.status(404).json({ error: "Prompt not found" });

            if (taskType !== undefined) prompt.taskType = taskType;
            if (title !== undefined) prompt.title = title;
            if (promptText !== undefined) prompt.promptText = promptText;
            if (visualDiagramUrl !== undefined || imageUrl !== undefined) {
                const diagramInput = visualDiagramUrl !== undefined ? visualDiagramUrl : imageUrl;
                const diagramValidation = validateVisualDiagramUrl(prompt.taskType === "task1" ? diagramInput : "");
                if (diagramValidation.error) {
                    return res.status(400).json({ error: diagramValidation.error });
                }
                prompt.visualDiagramUrl = diagramValidation.visualDiagramUrl;
                prompt.imageUrl = diagramValidation.visualDiagramUrl;
            }
            if (difficulty !== undefined) prompt.difficulty = difficulty;
            if (status !== undefined) prompt.status = status;
            if (instructions !== undefined) prompt.instructions = instructions;
            if (questionType !== undefined) prompt.questionType = questionType;
            if (wordLimit !== undefined) prompt.wordLimit = Number(wordLimit) || 0;
            if (timeLimit !== undefined) prompt.timeLimit = Number(timeLimit) || 0;
            if (isPremium !== undefined) prompt.isPremium = isPremium === true;

            await prompt.save();
            res.json(serializePrompt(prompt));
        } catch (err) {
            res.status(500).json({ error: "Failed to update prompt" });
        }
    });

    // Delete prompt
    app.delete("/api/admin/writing/prompts/:id", requireAdmin, async (req, res) => {
        try {
            const prompt = await WritingPrompt.findByIdAndDelete(req.params.id);
            if (!prompt) return res.status(404).json({ error: "Prompt not found" });
            res.json({ message: "Prompt deleted successfully" });
        } catch (err) {
            res.status(500).json({ error: "Failed to delete prompt" });
        }
    });

    // Get all full tests
    app.get("/api/admin/writing/full-tests", requireAdmin, async (req, res) => {
        try {
            const pagination = paginationParams(req);
            const query = {};
            if (req.query.status) query.status = req.query.status;
            const [tests, total] = await Promise.all([
                WritingFullTest.find(query)
                    .select("_id title status createdAt updatedAt timeLimit task1PromptId task2PromptId isPremium")
                    .sort({ createdAt: -1 })
                    .skip(pagination.skip)
                    .limit(pagination.limit)
                    .lean(),
                WritingFullTest.countDocuments(query)
            ]);
            setPaginationHeaders(res, { ...pagination, total });
            res.json(tests.map(fullWritingSummary));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch full tests" });
        }
    });

    app.get("/api/admin/writing/full-tests/:id", requireAdmin, async (req, res) => {
        try {
            const test = await WritingFullTest.findById(req.params.id)
                .populate("task1PromptId")
                .populate("task2PromptId");
            if (!test) return res.status(404).json({ error: "Full test not found" });
            res.json(serializeFullWritingTest(test));
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch full test" });
        }
    });

    // Create full test
    app.post("/api/admin/writing/full-tests", requireAdmin, async (req, res) => {
        try {
            const { title, task1PromptId, task2PromptId, status, timeLimit, isPremium } = req.body;
            if (!title || !task1PromptId || !task2PromptId) {
                return res.status(400).json({ error: "title, task1PromptId and task2PromptId are required" });
            }

            const test = new WritingFullTest({
                title,
                task1PromptId,
                task2PromptId,
                timeLimit: Number(timeLimit) || 60,
                status: status || "draft",
                isPremium: isPremium === true
            });

            await test.save();
            res.status(201).json(test);
        } catch (err) {
            res.status(500).json({ error: "Failed to create full test" });
        }
    });

    // Update full test
    app.put("/api/admin/writing/full-tests/:id", requireAdmin, async (req, res) => {
        try {
            const { title, task1PromptId, task2PromptId, status, timeLimit, isPremium } = req.body;
            const test = await WritingFullTest.findById(req.params.id);
            if (!test) return res.status(404).json({ error: "Full test not found" });

            if (title !== undefined) test.title = title;
            if (task1PromptId !== undefined) test.task1PromptId = task1PromptId;
            if (task2PromptId !== undefined) test.task2PromptId = task2PromptId;
            if (status !== undefined) test.status = status;
            if (timeLimit !== undefined) test.timeLimit = Number(timeLimit) || 60;
            if (isPremium !== undefined) test.isPremium = isPremium === true;

            await test.save();
            res.json(test);
        } catch (err) {
            res.status(500).json({ error: "Failed to update full test" });
        }
    });

    // Delete full test
    app.delete("/api/admin/writing/full-tests/:id", requireAdmin, async (req, res) => {
        try {
            const test = await WritingFullTest.findByIdAndDelete(req.params.id);
            if (!test) return res.status(404).json({ error: "Full test not found" });
            res.json({ message: "Full test deleted successfully" });
        } catch (err) {
            res.status(500).json({ error: "Failed to delete full test" });
        }
    });

    // Upload image route (delegated from multer)
    app.post("/api/admin/writing/upload-image", requireAdmin, listeningImageUpload.single("image"), (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "Choose an image file" });
        }
        const visualDiagramUrl = `/uploads/listening-images/${path.basename(req.file.path)}`;
        res.status(201).json({
            visualDiagramUrl,
            imageUrl: visualDiagramUrl,
            fileName: req.file.originalname
        });
    });
}

module.exports = { registerWritingRoutes };
