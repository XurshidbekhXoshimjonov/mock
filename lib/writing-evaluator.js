"use strict";

const WRITING_ASSESSMENT_MODEL = "gpt-5.6-terra";
const HALF_BAND_VALUES = Array.from({ length: 19 }, (_, index) => index / 2);

function halfBandSchema(description) {
    return {
        type: "number",
        enum: HALF_BAND_VALUES,
        description
    };
}

function stringArraySchema(description) {
    return {
        type: "array",
        description,
        items: { type: "string" }
    };
}

function criterionFeedbackSchema(description) {
    return {
        type: "object",
        additionalProperties: false,
        description,
        required: ["summary", "strengths", "limitations", "evidence"],
        properties: {
            summary: { type: "string" },
            strengths: stringArraySchema("Criterion-specific strengths supported by the response"),
            limitations: stringArraySchema("Criterion-specific score limitations supported by the response"),
            evidence: stringArraySchema("Short quotations or accurate references to the candidate response")
        }
    };
}

function singleWritingEvaluationSchema(mode) {
    if (mode !== "task1" && mode !== "task2") {
        throw new Error(`Unsupported Writing task mode: ${mode}`);
    }

    const taskCriterion = mode === "task1" ? "taskAchievement" : "taskResponse";
    const criterionKeys = [
        taskCriterion,
        "coherenceAndCohesion",
        "lexicalResource",
        "grammaticalRangeAndAccuracy"
    ];

    return {
        type: "object",
        additionalProperties: false,
        required: [
            "taskType",
            "wordCount",
            "scores",
            "criterionFeedback",
            "errors",
            "overallFeedback",
            "improvedEssay"
        ],
        properties: {
            taskType: {
                type: "string",
                enum: [mode]
            },
            wordCount: {
                type: "integer",
                minimum: 0
            },
            scores: {
                type: "object",
                additionalProperties: false,
                required: [...criterionKeys, "overallBand"],
                properties: {
                    [taskCriterion]: halfBandSchema(mode === "task1"
                        ? "IELTS Task Achievement band"
                        : "IELTS Task Response band"),
                    coherenceAndCohesion: halfBandSchema("IELTS Coherence and Cohesion band"),
                    lexicalResource: halfBandSchema("IELTS Lexical Resource band"),
                    grammaticalRangeAndAccuracy: halfBandSchema("IELTS Grammatical Range and Accuracy band"),
                    overallBand: halfBandSchema("Tentative overall band; the backend recalculates this value")
                }
            },
            criterionFeedback: {
                type: "object",
                additionalProperties: false,
                required: criterionKeys,
                properties: {
                    [taskCriterion]: criterionFeedbackSchema(mode === "task1"
                        ? "Task Achievement feedback"
                        : "Task Response feedback"),
                    coherenceAndCohesion: criterionFeedbackSchema("Coherence and Cohesion feedback"),
                    lexicalResource: criterionFeedbackSchema("Lexical Resource feedback"),
                    grammaticalRangeAndAccuracy: criterionFeedbackSchema("Grammatical Range and Accuracy feedback")
                }
            },
            errors: {
                type: "array",
                description: "Only genuine errors found in the original response",
                items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["original", "correction", "type", "explanation", "severity"],
                    properties: {
                        original: { type: "string" },
                        correction: { type: "string" },
                        type: {
                            type: "string",
                            enum: [
                                "spelling",
                                "grammar",
                                "spelling_and_grammar",
                                "punctuation",
                                "word_choice",
                                "collocation",
                                "cohesion",
                                "task_fulfilment"
                            ]
                        },
                        explanation: { type: "string" },
                        severity: {
                            type: "string",
                            enum: ["minor", "major", "communication_blocking"]
                        }
                    }
                }
            },
            overallFeedback: {
                type: "object",
                additionalProperties: false,
                required: ["summary", "mainStrengths", "priorityImprovements", "estimatedLevelExplanation"],
                properties: {
                    summary: { type: "string" },
                    mainStrengths: stringArraySchema("The most important strengths in the response"),
                    priorityImprovements: stringArraySchema("The highest-priority next steps"),
                    estimatedLevelExplanation: { type: "string" }
                }
            },
            improvedEssay: {
                type: "string",
                description: "An improved version produced only after the original response has been scored"
            }
        }
    };
}

function writingStructuredOutput(mode) {
    const schema = mode === "full"
        ? {
            type: "object",
            additionalProperties: false,
            required: ["task1", "task2"],
            properties: {
                task1: singleWritingEvaluationSchema("task1"),
                task2: singleWritingEvaluationSchema("task2")
            }
        }
        : singleWritingEvaluationSchema(mode);

    return {
        type: "json_schema",
        name: mode === "full"
            ? "academic_writing_full_evaluation"
            : `academic_writing_${mode}_evaluation`,
        strict: true,
        schema
    };
}

function parseJsonObject(rawContent) {
    const content = String(rawContent || "").trim();
    if (!content) throw new Error("Writing assessment output was empty.");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Writing assessment output must be a JSON object.");
    }
    return parsed;
}

function validateWritingAssessmentInput(mode, question, essay) {
    if (mode !== "task1" && mode !== "task2") {
        throw new Error("Writing assessment task type must be task1 or task2.");
    }
    if (!String(question || "").trim()) {
        throw new Error("Writing assessment requires the complete original question.");
    }
    if (!String(essay || "").trim()) {
        throw new Error("Writing assessment requires a non-empty candidate response.");
    }
    return true;
}

function normalizeBand(value, fieldName = "band") {
    if (typeof value === "string" && !/^\s*\d+(?:\.\d+)?\s*$/.test(value)) {
        throw new Error(`Writing assessment score is not numeric: ${fieldName}`);
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error(`Writing assessment score is missing or invalid: ${fieldName}`);
    }
    const clamped = Math.min(9, Math.max(0, numeric));
    return Math.round(clamped * 2) / 2;
}

function calculateTaskBand(criteriaScores, label = "writing") {
    const values = Object.entries(criteriaScores || {});
    if (values.length !== 4) {
        throw new Error(`Expected four IELTS criterion scores for ${label}`);
    }
    const normalized = values.map(([criterion, score]) => normalizeBand(score, `${label}.${criterion}`));
    const rawAverage = normalized.reduce((sum, score) => sum + score, 0) / 4;
    return Math.round(rawAverage * 2) / 2;
}

function calculateFinalWritingBand(task1Band, task2Band) {
    const normalizedTask1 = normalizeBand(task1Band, "task1Band");
    const normalizedTask2 = normalizeBand(task2Band, "task2Band");
    return Math.round(((normalizedTask1 + normalizedTask2 * 2) / 3) * 2) / 2;
}

function requireObject(value, fieldName) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Writing assessment is missing object: ${fieldName}`);
    }
    return value;
}

function requireString(value, fieldName) {
    if (typeof value !== "string") {
        throw new Error(`Writing assessment is missing string: ${fieldName}`);
    }
    return value.trim();
}

function requireStringArray(value, fieldName) {
    if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
        throw new Error(`Writing assessment is missing string array: ${fieldName}`);
    }
    return value.map(item => item.trim()).filter(Boolean);
}

function uniqueStrings(items) {
    return [...new Set(items.map(item => String(item || "").trim()).filter(Boolean))];
}

function normalizeCriterionFeedback(raw, fieldName) {
    const value = requireObject(raw, fieldName);
    return {
        summary: requireString(value.summary, `${fieldName}.summary`),
        strengths: requireStringArray(value.strengths, `${fieldName}.strengths`),
        limitations: requireStringArray(value.limitations, `${fieldName}.limitations`),
        evidence: requireStringArray(value.evidence, `${fieldName}.evidence`)
    };
}

function normalizeErrors(raw) {
    if (!Array.isArray(raw)) {
        throw new Error("Writing assessment is missing array: errors");
    }
    return raw.map((item, index) => {
        const error = requireObject(item, `errors[${index}]`);
        return {
            original: requireString(error.original, `errors[${index}].original`),
            correction: requireString(error.correction, `errors[${index}].correction`),
            type: requireString(error.type, `errors[${index}].type`),
            explanation: requireString(error.explanation, `errors[${index}].explanation`),
            severity: requireString(error.severity, `errors[${index}].severity`)
        };
    });
}

function formatError(error) {
    const correction = error.correction ? ` → ${error.correction}` : "";
    const explanation = error.explanation ? ` (${error.explanation})` : "";
    return `“${error.original}”${correction}${explanation}`;
}

function buildDetailedExaminerFeedback(criterionFeedback, overallFeedback) {
    const labels = {
        taskAchievement: "Task Achievement",
        taskResponse: "Task Response",
        coherenceAndCohesion: "Coherence and Cohesion",
        lexicalResource: "Lexical Resource",
        grammaticalRangeAndAccuracy: "Grammatical Range and Accuracy"
    };
    const details = Object.entries(criterionFeedback).map(([key, value]) => {
        const evidence = value.evidence.length ? ` Evidence: ${value.evidence.join("; ")}` : "";
        return `${labels[key] || key}: ${value.summary}${evidence}`;
    });
    return [overallFeedback.summary, ...details, overallFeedback.estimatedLevelExplanation]
        .filter(Boolean)
        .join("\n\n");
}

function normalizeSingleEvaluation(raw, mode, actualWordCount) {
    const value = requireObject(raw, mode);
    if (value.taskType !== mode) {
        throw new Error(`Writing assessment taskType mismatch: expected ${mode}`);
    }

    const taskCriterion = mode === "task1" ? "taskAchievement" : "taskResponse";
    const scores = requireObject(value.scores, `${mode}.scores`);
    const normalizedScores = {
        [taskCriterion]: normalizeBand(scores[taskCriterion], `${mode}.scores.${taskCriterion}`),
        coherenceAndCohesion: normalizeBand(scores.coherenceAndCohesion, `${mode}.scores.coherenceAndCohesion`),
        lexicalResource: normalizeBand(scores.lexicalResource, `${mode}.scores.lexicalResource`),
        grammaticalRangeAndAccuracy: normalizeBand(scores.grammaticalRangeAndAccuracy, `${mode}.scores.grammaticalRangeAndAccuracy`)
    };
    const overallBand = calculateTaskBand(normalizedScores, mode);
    normalizedScores.overallBand = overallBand;

    const feedbackSource = requireObject(value.criterionFeedback, `${mode}.criterionFeedback`);
    const criterionFeedback = {
        [taskCriterion]: normalizeCriterionFeedback(feedbackSource[taskCriterion], `${mode}.criterionFeedback.${taskCriterion}`),
        coherenceAndCohesion: normalizeCriterionFeedback(feedbackSource.coherenceAndCohesion, `${mode}.criterionFeedback.coherenceAndCohesion`),
        lexicalResource: normalizeCriterionFeedback(feedbackSource.lexicalResource, `${mode}.criterionFeedback.lexicalResource`),
        grammaticalRangeAndAccuracy: normalizeCriterionFeedback(feedbackSource.grammaticalRangeAndAccuracy, `${mode}.criterionFeedback.grammaticalRangeAndAccuracy`)
    };
    const errors = normalizeErrors(value.errors);
    const overallSource = requireObject(value.overallFeedback, `${mode}.overallFeedback`);
    const overallFeedback = {
        summary: requireString(overallSource.summary, `${mode}.overallFeedback.summary`),
        mainStrengths: requireStringArray(overallSource.mainStrengths, `${mode}.overallFeedback.mainStrengths`),
        priorityImprovements: requireStringArray(overallSource.priorityImprovements, `${mode}.overallFeedback.priorityImprovements`),
        estimatedLevelExplanation: requireString(overallSource.estimatedLevelExplanation, `${mode}.overallFeedback.estimatedLevelExplanation`)
    };

    const criterionItems = Object.values(criterionFeedback);
    const strengths = uniqueStrings([
        ...overallFeedback.mainStrengths,
        ...criterionItems.flatMap(item => item.strengths)
    ]);
    const limitations = uniqueStrings(criterionItems.flatMap(item => item.limitations));
    const correctedErrors = errors.map(formatError);
    const weaknesses = uniqueStrings([...limitations, ...correctedErrors]);
    const suggestions = uniqueStrings(overallFeedback.priorityImprovements);
    const improvedEssay = requireString(value.improvedEssay, `${mode}.improvedEssay`);
    const grammarErrors = errors
        .filter(error => ["spelling", "grammar", "spelling_and_grammar", "punctuation"].includes(error.type))
        .map(formatError);
    const lexicalErrors = errors
        .filter(error => ["word_choice", "collocation"].includes(error.type))
        .map(formatError);

    return {
        taskType: mode,
        wordCount: Math.max(0, Number(actualWordCount) || 0),
        scores: normalizedScores,
        criterionFeedback,
        errors,
        overallFeedback,
        improvedEssay,
        estimatedBand: overallBand,
        [taskCriterion]: normalizedScores[taskCriterion],
        coherenceCohesion: normalizedScores.coherenceAndCohesion,
        lexicalResource: normalizedScores.lexicalResource,
        grammarRangeAccuracy: normalizedScores.grammaticalRangeAndAccuracy,
        strengths,
        weaknesses,
        mistakes: weaknesses,
        limitations,
        correctedMistakes: correctedErrors,
        suggestions,
        mainProblems: suggestions,
        grammarMistakes: grammarErrors,
        unnaturalPhrases: lexicalErrors,
        repeatedIdeas: errors.filter(error => error.type === "cohesion").map(formatError),
        howToReachNextBand: suggestions,
        improvedVersion: improvedEssay,
        examinerFeedback: buildDetailedExaminerFeedback(criterionFeedback, overallFeedback)
    };
}

function normalizeFullEvaluation(raw, wordCounts = {}) {
    const value = requireObject(raw, "full");
    const task1 = normalizeSingleEvaluation(value.task1, "task1", wordCounts.task1);
    const task2 = normalizeSingleEvaluation(value.task2, "task2", wordCounts.task2);
    const overallBand = calculateFinalWritingBand(task1.estimatedBand, task2.estimatedBand);

    return {
        overallBand,
        task1: {
            ...task1,
            band: task1.estimatedBand,
            criteria: {
                taskAchievement: task1.taskAchievement,
                coherenceCohesion: task1.coherenceCohesion,
                lexicalResource: task1.lexicalResource,
                grammar: task1.grammarRangeAccuracy
            },
            areasForImprovement: task1.weaknesses
        },
        task2: {
            ...task2,
            band: task2.estimatedBand,
            criteria: {
                taskResponse: task2.taskResponse,
                coherenceCohesion: task2.coherenceCohesion,
                lexicalResource: task2.lexicalResource,
                grammar: task2.grammarRangeAccuracy
            },
            areasForImprovement: task2.weaknesses
        }
    };
}

function isRepairableAssessmentError(error) {
    return error instanceof SyntaxError
        || /^Writing assessment (?:is missing|output|score|taskType)/.test(String(error?.message || ""))
        || /Expected four IELTS criterion scores/.test(String(error?.message || ""));
}

function classifyWritingEvaluationError(error) {
    const status = Number(error?.status || error?.statusCode);
    const isTimeout = error?.name === "APITimeoutError"
        || error?.name === "AbortError"
        || error?.code === "ETIMEDOUT"
        || error?.code === "ECONNABORTED";
    if (error?.code === "OPENAI_API_KEY_MISSING") {
        return { status: 503, code: "WRITING_AI_NOT_CONFIGURED" };
    }
    if (isTimeout) return { status: 504, code: "WRITING_AI_TIMEOUT" };
    if (status === 429) return { status: 503, code: "WRITING_AI_BUSY" };
    if (status === 401 || status === 403) return { status: 503, code: "WRITING_AI_AUTH_ERROR" };
    return { status: 502, code: "WRITING_AI_FAILED" };
}

module.exports = {
    WRITING_ASSESSMENT_MODEL,
    HALF_BAND_VALUES,
    singleWritingEvaluationSchema,
    writingStructuredOutput,
    parseJsonObject,
    validateWritingAssessmentInput,
    normalizeBand,
    calculateTaskBand,
    calculateFinalWritingBand,
    normalizeSingleEvaluation,
    normalizeFullEvaluation,
    isRepairableAssessmentError,
    classifyWritingEvaluationError
};
