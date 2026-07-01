const path = require("path");
const OpenAI = require("openai");
const WritingPrompt = require("../models/WritingPrompt");
const WritingFullTest = require("../models/WritingFullTest");
const WritingSubmission = require("../models/WritingSubmission");

const OPENAI_MISSING_KEY_ERROR = "OpenAI API key is missing on the server.";
let openaiClient = null;
let openaiClientKey = "";

function registerWritingRoutes(app, deps) {
    const { requireAuth, requireAdmin, listeningImageUpload, getMockWritingFullTest } = deps;
    const isDevelopment = process.env.NODE_ENV !== "production";

    if (isDevelopment) {
        console.log("OPENAI KEY EXISTS:", Boolean(String(process.env.OPENAI_API_KEY || "").trim()));
    }

    // Helper to calculate word count
    function countWords(str) {
        if (!str || typeof str !== "string") return 0;
        return str.trim().split(/\s+/).filter(Boolean).length;
    }

    function getMongoUserId(user) {
        const id = String(user?.id || "").trim();
        return /^[a-f0-9]{24}$/i.test(id) ? id : null;
    }

    function logDevelopment(label, payload) {
        if (isDevelopment) {
            console.log(label, payload);
        }
    }

    function getOpenAIClient() {
        const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
        if (!apiKey) {
            const error = new Error(OPENAI_MISSING_KEY_ERROR);
            error.statusCode = 500;
            error.publicError = OPENAI_MISSING_KEY_ERROR;
            error.code = "OPENAI_API_KEY_MISSING";
            throw error;
        }

        if (!openaiClient || openaiClientKey !== apiKey) {
            openaiClient = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
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
        const numeric = Number(value);
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

    function normalizeStringArray(value, fieldName) {
        if (!Array.isArray(value)) {
            throw new Error(`OpenAI response is missing array field: ${fieldName}`);
        }
        return value.map(item => String(item || "").trim()).filter(Boolean);
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

        return {
            estimatedBand,
            ...criteria,
            strengths: normalizeStringArray(raw.strengths, "strengths"),
            mistakes: normalizeStringArray(raw.mistakes, "mistakes"),
            suggestions: normalizeStringArray(raw.suggestions, "suggestions"),
            improvedEssay: String(raw.improvedEssay || "").trim()
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

        return {
            estimatedBand,
            ...criteria,
            strengths: normalizeStringArray(raw.strengths, "strengths"),
            mistakes: normalizeStringArray(raw.mistakes, "mistakes"),
            suggestions: normalizeStringArray(raw.suggestions, "suggestions"),
            improvedEssay: String(raw.improvedEssay || "").trim()
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
                improvedVersion: String(task1.improvedVersion || "").trim()
            },
            task2: {
                band: normalizedTask2Band,
                criteria: normalizedTask2Criteria,
                strengths: normalizeStringArray(task2.strengths, "task2.strengths"),
                areasForImprovement: normalizeStringArray(task2.areasForImprovement, "task2.areasForImprovement"),
                suggestions: normalizeStringArray(task2.suggestions, "task2.suggestions"),
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

    function promptSummary(prompt) {
        const item = typeof prompt?.toObject === "function" ? prompt.toObject() : prompt;
        return {
            _id: String(item._id),
            id: String(item._id),
            title: item.title || "",
            testNumber: item.testNumber || undefined,
            type: item.taskType || "task1",
            taskType: item.taskType || "task1",
            status: item.status || "draft",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            wordLimit: item.wordLimit,
            timeLimit: item.timeLimit,
            questionType: item.questionType || ""
        };
    }

    function fullWritingSummary(test) {
        const item = typeof test?.toObject === "function" ? test.toObject() : test;
        return {
            _id: String(item._id),
            id: String(item._id),
            title: item.title || "",
            testNumber: item.testNumber || undefined,
            type: "full",
            status: item.status || "draft",
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

    // OpenAI feedback generation function. This must fail loudly instead of returning fake scores.
    async function generateAIFeedback(mode, promptText, studentEssay, task2PromptText = "", task2StudentEssay = "") {
        try {
            const openai = getOpenAIClient();
            const scoringGuidance = `Apply IELTS Academic Writing band descriptors, not a fixed midpoint.
Score each criterion independently from 0 to 9 in half-band increments.
Do not cap scores around the middle bands. Strong essays should receive high scores when the descriptors fit.
Band 8-level work fully addresses the task, presents a clear position where required, develops ideas logically, uses a wide vocabulary with natural control, and has mostly accurate grammar with only minor errors. It should be scored around Band 8, not pulled down for not being perfect.
Band 7-level work addresses the task with clear progression and good range, but has more noticeable limitations or errors.
Band 6-level work addresses the task but has some underdevelopment, mechanical cohesion, limited range, or frequent errors.
Band 5-level and below shows partial task fulfilment, weak progression, limited vocabulary, or frequent grammar problems that affect clarity.
The server calculates the final task band by averaging the four criteria and rounding to the nearest half band.`;

            const task1StrictGuidance = `
CRITICAL SCORING RULES FOR IELTS WRITING TASK 1 (APPLIES STRICTLY):
You must grade Writing Task 1 extremely strictly, adhering strictly to official IELTS examiner guidelines. Do NOT give generous scores. A basic, simple, or mechanical essay must NOT receive Band 7 or above.
You must apply the following specific Band Cap and Deduction Rules:
- If there is NO clear, distinct overview paragraph/sentence, cap both the Task Achievement score and the overall score at a maximum of 5.0.
- If the overview is very general, weak, or superficial, cap both the Task Achievement score and the overall score at a maximum of 6.0.
- If the essay mostly lists data/numbers/features item-by-item or year-by-year without making real, meaningful comparisons, cap both the Task Achievement score and the overall score at a maximum of 6.0.
- If the vocabulary is basic, simple, repetitive, or lacks precise collocations, cap the Lexical Resource score at a maximum of 6.0.
- If sentence structures are mostly simple (lacking complex/subordinate clauses), cap the Grammatical Range score at a maximum of 6.0.
- If there are several grammar errors (even if minor), cap the Grammar score at a maximum of 5.5.
- If data is inaccurate or if important figures/numbers from the prompt are missing, cap the Task Achievement score at a maximum of 6.0.
- If the student's response is too mechanical, repetitive, or only describes data chronologically with weak analysis, cap the overall score at a maximum of 6.0.
- If the student's essay is under 150 words, apply the official IELTS word count penalty (reduce the Task Achievement score).

BE CAREFUL WITH BAND 7 OR HIGHER:
- Only award Band 7 or higher if the essay clearly demonstrates: mature comparison of data, logical grouping of information, accurate trend analysis, flexible and precise vocabulary, varied complex sentence structures, and a clear, well-supported overview.
- Do NOT award Band 7 just because the essay has an introduction, an overview, some numbers, and basic paragraphs.
- Calibration Example: A year-by-year report listing values chronologically with repetitive verbs (rose, fell, stayed the same) and basic sentence patterns must be scored around Band 6.0, NOT Band 7.
`;

            let systemPrompt = "";
            let userContent = "";

            if (mode === "task1") {
                systemPrompt = `You are an expert IELTS Academic Writing examiner. Grade the student's Writing Task 1 essay based on the prompt. You must provide a JSON response in this exact format:
{
  "estimatedBand": number,
  "taskAchievement": number,
  "coherenceCohesion": number,
  "lexicalResource": number,
  "grammarRangeAccuracy": number,
  "strengths": ["list of strings"],
  "mistakes": ["list of strings"],
  "suggestions": ["list of strings"],
  "improvedEssay": "Full improved version of the essay"
}
Task 1 criteria are Task Achievement, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy.
${scoringGuidance}
${task1StrictGuidance}
Use 'Estimated Band', not 'Official IELTS Band'. estimatedBand should match the rounded average of the four criteria. Return only JSON.`;

                userContent = `Prompt:\n${promptText}\n\nStudent Essay:\n${studentEssay}`;
            } else if (mode === "task2") {
                systemPrompt = `You are an expert IELTS Academic Writing examiner. Grade the student's Writing Task 2 essay based on the prompt. You must provide a JSON response in this exact format:
{
  "estimatedBand": number,
  "taskResponse": number,
  "coherenceCohesion": number,
  "lexicalResource": number,
  "grammarRangeAccuracy": number,
  "strengths": ["list of strings"],
  "mistakes": ["list of strings"],
  "suggestions": ["list of strings"],
  "improvedEssay": "Full improved version of the essay"
}
Task 2 criteria are Task Response, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy.
${scoringGuidance}
Use 'Estimated Band', not 'Official IELTS Band'. estimatedBand should match the rounded average of the four criteria. Return only JSON.`;

                userContent = `Prompt:\n${promptText}\n\nStudent Essay:\n${studentEssay}`;
            } else if (mode === "full") {
                systemPrompt = `You are an expert IELTS Academic Writing examiner. Grade the student's Full Writing Test (both Task 1 and Task 2 essays). You must provide a JSON response in this exact format:
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
    "strengths": ["list of strings"],
    "areasForImprovement": ["list of strings"],
    "suggestions": ["list of strings"]
  },
  "task2": {
    "band": number,
    "criteria": {
      "taskResponse": number,
      "coherenceCohesion": number,
      "lexicalResource": number,
      "grammar": number
    },
    "strengths": ["list of strings"],
    "areasForImprovement": ["list of strings"],
    "suggestions": ["list of strings"]
  }
}
Task 1 criteria are Task Achievement, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy.
Task 2 criteria are Task Response, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy.
${scoringGuidance}
${task1StrictGuidance}
task1.band should match the rounded average of Task 1 criteria. task2.band should match the rounded average of Task 2 criteria.
The server recalculates the overall band as (Task 1 band + Task 2 band * 2) / 3, rounded to the nearest half band. Return only JSON with no markdown or explanatory text.`;

                userContent = `Task 1 Prompt:\n${promptText}\n\nTask 1 Student Essay:\n${studentEssay}\n\n=========================\n\nTask 2 Prompt:\n${task2PromptText}\n\nTask 2 Student Essay:\n${task2StudentEssay}`;
            }

            console.log("Writing OpenAI call starts:", { mode });
            const data = await openai.chat.completions.create({
                model: "gpt-4o-mini",
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
                                overallBand: { type: "number" },
                                task1: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["band", "criteria", "strengths", "areasForImprovement", "suggestions"],
                                    properties: {
                                        band: { type: "number" },
                                        criteria: {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["taskAchievement", "coherenceCohesion", "lexicalResource", "grammar"],
                                            properties: {
                                                taskAchievement: { type: "number" },
                                                coherenceCohesion: { type: "number" },
                                                lexicalResource: { type: "number" },
                                                grammar: { type: "number" }
                                            }
                                        },
                                        strengths: { type: "array", items: { type: "string" } },
                                        areasForImprovement: { type: "array", items: { type: "string" } },
                                        suggestions: { type: "array", items: { type: "string" } }
                                    }
                                },
                                task2: {
                                    type: "object",
                                    additionalProperties: false,
                                    required: ["band", "criteria", "strengths", "areasForImprovement", "suggestions"],
                                    properties: {
                                        band: { type: "number" },
                                        criteria: {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["taskResponse", "coherenceCohesion", "lexicalResource", "grammar"],
                                            properties: {
                                                taskResponse: { type: "number" },
                                                coherenceCohesion: { type: "number" },
                                                lexicalResource: { type: "number" },
                                                grammar: { type: "number" }
                                            }
                                        },
                                        strengths: { type: "array", items: { type: "string" } },
                                        areasForImprovement: { type: "array", items: { type: "string" } },
                                        suggestions: { type: "array", items: { type: "string" } }
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
    app.get("/api/writing/task1", async (req, res) => {
        try {
            const pagination = paginationParams(req);
            const query = { taskType: "task1", status: "published", mockOnly: { $ne: true } };
            const [prompts, total] = await Promise.all([
                WritingPrompt.find(query)
                    .select("_id title taskType status createdAt updatedAt wordLimit timeLimit questionType")
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
    app.get("/api/writing/task2", async (req, res) => {
        try {
            const pagination = paginationParams(req);
            const query = { taskType: "task2", status: "published", mockOnly: { $ne: true } };
            const [prompts, total] = await Promise.all([
                WritingPrompt.find(query)
                    .select("_id title taskType status createdAt updatedAt wordLimit timeLimit questionType")
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
    app.get("/api/writing/full-tests", async (req, res) => {
        try {
            const pagination = paginationParams(req);
            const query = { status: "published", mockOnly: { $ne: true } };
            const [tests, total] = await Promise.all([
                WritingFullTest.find(query)
                    .select("_id title status createdAt updatedAt timeLimit task1PromptId task2PromptId")
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
    app.get("/api/writing/task1/:id", async (req, res) => {
        try {
            const prompt = await WritingPrompt.findOne({ _id: req.params.id, taskType: "task1" });
            if (!prompt || prompt.mockOnly) return res.status(404).json({ error: "Task 1 prompt not found" });
            res.json(prompt);
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch prompt details" });
        }
    });

    // Get specific Task 2 prompt
    app.get("/api/writing/task2/:id", async (req, res) => {
        try {
            const prompt = await WritingPrompt.findOne({ _id: req.params.id, taskType: "task2" });
            if (!prompt || prompt.mockOnly) return res.status(404).json({ error: "Task 2 prompt not found" });
            res.json(prompt);
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch prompt details" });
        }
    });

    // Get specific Full Test (populated)
    app.get("/api/writing/full-tests/:id", async (req, res) => {
        try {
            const mockTest = typeof getMockWritingFullTest === "function"
                ? await getMockWritingFullTest(req.params.id)
                : null;

            if (mockTest) {
                return res.json(mockTest);
            }

            const test = await WritingFullTest.findById(req.params.id)
                .populate("task1PromptId")
                .populate("task2PromptId");
            if (!test || test.mockOnly) return res.status(404).json({ error: "Full test not found" });
            res.json(test);
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch Full test details" });
        }
    });

    async function evaluateSingleWritingRequest(req, res, options = {}) {
        const taskType = options.taskType || req.body.taskType;
        const mode = taskType === "task2" ? "task2" : taskType === "task1" ? "task1" : "";
        const { promptId, essay, timeSpent } = req.body;

        if (!mode) {
            return res.status(400).json({ error: "taskType must be task1 or task2." });
        }
        if (!promptId || !essay) {
            return res.status(400).json({ error: "promptId and essay are required" });
        }

        logDevelopment("Writing evaluate request payload:", {
            taskType: mode,
            promptId,
            essay,
            timeSpent: timeSpent || 0
        });

        try {
            const prompt = await WritingPrompt.findOne({ _id: promptId, taskType: mode });
            if (!prompt || prompt.mockOnly) return res.status(404).json({ error: "Prompt not found" });

            const feedback = await generateAIFeedback(mode, prompt.promptText, essay);
            const mongoUserId = getMongoUserId(req.user);
            const responsePayload = {
                feedback,
                estimatedBand: feedback.estimatedBand
            };

            if (mongoUserId) {
                const submission = new WritingSubmission({
                    userId: mongoUserId,
                    ...buildWritingSubmissionPayload({
                        mode,
                        prompt,
                        essay,
                        feedback,
                        timeSpent
                    }),
                    task1PromptId: mode === "task1" ? promptId : undefined,
                    task2PromptId: mode === "task2" ? promptId : undefined
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
                    .select("_id title taskType status createdAt updatedAt wordLimit timeLimit questionType")
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
            res.json(prompt);
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
                imageUrl,
                difficulty,
                status,
                instructions,
                questionType,
                wordLimit,
                timeLimit
            } = req.body;
            if (!taskType || !title || !promptText) {
                return res.status(400).json({ error: "taskType, title and promptText are required" });
            }
            const defaultWordLimit = taskType === "task2" ? 250 : 150;
            const defaultTimeLimit = taskType === "task2" ? 40 : 20;

            const prompt = new WritingPrompt({
                taskType,
                title,
                promptText,
                imageUrl: imageUrl || "",
                difficulty: difficulty || "medium",
                status: status || "draft",
                instructions: instructions || "",
                questionType: taskType === "task2" ? (questionType || "opinion") : "",
                wordLimit: Number(wordLimit) || defaultWordLimit,
                timeLimit: Number(timeLimit) || defaultTimeLimit
            });

            await prompt.save();
            res.status(201).json(prompt);
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
                imageUrl,
                difficulty,
                status,
                instructions,
                questionType,
                wordLimit,
                timeLimit
            } = req.body;
            const prompt = await WritingPrompt.findById(req.params.id);
            if (!prompt) return res.status(404).json({ error: "Prompt not found" });

            if (taskType !== undefined) prompt.taskType = taskType;
            if (title !== undefined) prompt.title = title;
            if (promptText !== undefined) prompt.promptText = promptText;
            if (imageUrl !== undefined) prompt.imageUrl = imageUrl;
            if (difficulty !== undefined) prompt.difficulty = difficulty;
            if (status !== undefined) prompt.status = status;
            if (instructions !== undefined) prompt.instructions = instructions;
            if (questionType !== undefined) prompt.questionType = questionType;
            if (wordLimit !== undefined) prompt.wordLimit = Number(wordLimit) || 0;
            if (timeLimit !== undefined) prompt.timeLimit = Number(timeLimit) || 0;

            await prompt.save();
            res.json(prompt);
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
                    .select("_id title status createdAt updatedAt timeLimit task1PromptId task2PromptId")
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
            res.json(test);
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch full test" });
        }
    });

    // Create full test
    app.post("/api/admin/writing/full-tests", requireAdmin, async (req, res) => {
        try {
            const { title, task1PromptId, task2PromptId, status, timeLimit } = req.body;
            if (!title || !task1PromptId || !task2PromptId) {
                return res.status(400).json({ error: "title, task1PromptId and task2PromptId are required" });
            }

            const test = new WritingFullTest({
                title,
                task1PromptId,
                task2PromptId,
                timeLimit: Number(timeLimit) || 60,
                status: status || "draft"
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
            const { title, task1PromptId, task2PromptId, status, timeLimit } = req.body;
            const test = await WritingFullTest.findById(req.params.id);
            if (!test) return res.status(404).json({ error: "Full test not found" });

            if (title !== undefined) test.title = title;
            if (task1PromptId !== undefined) test.task1PromptId = task1PromptId;
            if (task2PromptId !== undefined) test.task2PromptId = task2PromptId;
            if (status !== undefined) test.status = status;
            if (timeLimit !== undefined) test.timeLimit = Number(timeLimit) || 60;

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
        res.status(201).json({
            imageUrl: `/uploads/listening-images/${path.basename(req.file.path)}`,
            fileName: req.file.originalname
        });
    });
}

module.exports = { registerWritingRoutes };
