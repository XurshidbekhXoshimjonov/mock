"use strict";

const WRITING_ASSESSMENT_MODEL = "gpt-5.6-terra";
const WRITING_EVALUATOR_VERSION = "ielts-writing-v3.1.0-holistic-two-pass";
const WRITING_TEMPERATURE = 0.1;
const HALF_BAND_VALUES = Array.from({ length: 19 }, (_, index) => index / 2);
const ASSESSMENT_TYPES = new Set(["academic_task1", "general_task1", "task2"]);
const CRITERION_KEYS = [
    "taskAchievement",
    "coherenceAndCohesion",
    "lexicalResource",
    "grammarRangeAndAccuracy"
];

function stringArraySchema(description, minimum = 0) {
    return {
        type: "array",
        description,
        minItems: minimum,
        items: { type: "string" }
    };
}

function criterionSchema(description) {
    return {
        type: "object",
        additionalProperties: false,
        description,
        required: ["score", "evidence", "weaknesses"],
        properties: {
            score: {
                type: "number",
                enum: HALF_BAND_VALUES,
                description: "IELTS criterion band selected from direct evidence"
            },
            evidence: stringArraySchema("Direct quotations or exact references from the candidate response", 1),
            weaknesses: {
                ...stringArraySchema("Only the most important repeated or score-limiting weaknesses"),
                maxItems: 3
            }
        }
    };
}

function writingAssessmentSchema() {
    return {
        type: "object",
        additionalProperties: false,
        required: CRITERION_KEYS,
        properties: {
            taskAchievement: criterionSchema("Task Achievement for Task 1 or Task Response for Task 2"),
            coherenceAndCohesion: criterionSchema("Coherence and Cohesion"),
            lexicalResource: criterionSchema("Lexical Resource"),
            grammarRangeAndAccuracy: criterionSchema("Grammatical Range and Accuracy")
        }
    };
}

function writingStructuredOutput(pass = "provisional") {
    return {
        type: "json_schema",
        name: `ielts_writing_${pass}_criteria`,
        strict: true,
        schema: writingAssessmentSchema()
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

function normalizeAssessmentType(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!ASSESSMENT_TYPES.has(normalized)) {
        throw new Error("Writing assessment type must be academic_task1, general_task1, or task2.");
    }
    return normalized;
}

function validateWritingAssessmentInput(assessmentType, question, essay) {
    normalizeAssessmentType(assessmentType);
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
    const values = Object.values(criteriaScores || {});
    if (values.length !== 4) {
        throw new Error(`Expected four IELTS criterion scores for ${label}`);
    }
    const normalized = values.map((score, index) => normalizeBand(score, `${label}.${index}`));
    return Math.round((normalized.reduce((sum, score) => sum + score, 0) / 4) * 2) / 2;
}

function calculateFinalWritingBand(task1Band, task2Band) {
    const task1 = normalizeBand(task1Band, "task1Band");
    const task2 = normalizeBand(task2Band, "task2Band");
    return Math.round(((task1 + task2 * 2) / 3) * 2) / 2;
}

function calculateAverageWritingBand(bands) {
    const normalized = (Array.isArray(bands) ? bands : [])
        .map(Number)
        .filter(value => Number.isFinite(value) && value > 0)
        .map((value, index) => normalizeBand(value, `writingAverage.${index}`));
    if (!normalized.length) return 0;
    return normalizeBand(normalized.reduce((sum, value) => sum + value, 0) / normalized.length, "writingAverage");
}

function requireObject(value, fieldName) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Writing assessment is missing object: ${fieldName}`);
    }
    return value;
}

function requireStringArray(value, fieldName, minimum = 0) {
    if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
        throw new Error(`Writing assessment is missing string array: ${fieldName}`);
    }
    const result = value.map(item => item.trim()).filter(Boolean);
    if (result.length < minimum) {
        throw new Error(`Writing assessment requires evidence: ${fieldName}`);
    }
    return result;
}

function uniqueStrings(items) {
    return [...new Set((items || []).map(item => String(item || "").trim()).filter(Boolean))];
}

function normalizeCriterion(value, fieldName) {
    const criterion = requireObject(value, fieldName);
    const evidence = requireStringArray(criterion.evidence, `${fieldName}.evidence`, 1);
    const weaknesses = requireStringArray(criterion.weaknesses, `${fieldName}.weaknesses`);
    const reportedScore = normalizeBand(criterion.score, `${fieldName}.score`);
    return {
        score: reportedScore === 9 && weaknesses.length ? 8.5 : reportedScore,
        evidence,
        weaknesses
    };
}

function normalizeCriterionAssessment(raw) {
    const value = requireObject(raw, "criteria");
    return Object.fromEntries(CRITERION_KEYS.map(key => [key, normalizeCriterion(value[key], key)]));
}

function mergeAssessmentPasses(provisionalRaw, verificationRaw) {
    const provisional = normalizeCriterionAssessment(provisionalRaw);
    const verification = normalizeCriterionAssessment(verificationRaw);
    return Object.fromEntries(CRITERION_KEYS.map(key => {
        const first = provisional[key];
        const second = verification[key];
        const stricter = second.score <= first.score ? second : first;
        return [key, {
            score: Math.min(first.score, second.score),
            evidence: uniqueStrings(first.score === second.score
                ? [...first.evidence, ...second.evidence]
                : stricter.evidence),
            weaknesses: uniqueStrings([...first.weaknesses, ...second.weaknesses])
        }];
    }));
}

function criterionScores(assessment) {
    const value = normalizeCriterionAssessment(assessment);
    return Object.fromEntries(CRITERION_KEYS.map(key => [key, value[key].score]));
}

function criterionFeedbackItem(item) {
    return {
        summary: item.weaknesses.length
            ? item.weaknesses.join(" ")
            : "The response demonstrates the selected descriptor consistently.",
        strengths: item.evidence,
        limitations: item.weaknesses,
        evidence: item.evidence
    };
}

function buildDetailedExaminerFeedback(criterionFeedback) {
    const labels = {
        taskAchievement: "Task Achievement",
        taskResponse: "Task Response",
        coherenceAndCohesion: "Coherence and Cohesion",
        lexicalResource: "Lexical Resource",
        grammaticalRangeAndAccuracy: "Grammatical Range and Accuracy"
    };
    return Object.entries(criterionFeedback).map(([key, item]) => {
        const evidence = item.evidence.length ? ` Evidence: ${item.evidence.join("; ")}` : "";
        return `${labels[key] || key}: ${item.summary}${evidence}`;
    }).join("\n\n");
}

function normalizeFinalEvaluation(assessmentRaw, assessmentType, actualWordCount) {
    const type = normalizeAssessmentType(assessmentType);
    const assessment = normalizeCriterionAssessment(assessmentRaw);
    const isTask2 = type === "task2";
    const taskCriterion = isTask2 ? "taskResponse" : "taskAchievement";
    const scores = criterionScores(assessment);
    const overallBand = calculateTaskBand(scores, type);
    const criterionFeedback = {
        [taskCriterion]: criterionFeedbackItem(assessment.taskAchievement),
        coherenceAndCohesion: criterionFeedbackItem(assessment.coherenceAndCohesion),
        lexicalResource: criterionFeedbackItem(assessment.lexicalResource),
        grammaticalRangeAndAccuracy: criterionFeedbackItem(assessment.grammarRangeAndAccuracy)
    };
    const evidence = uniqueStrings(CRITERION_KEYS.flatMap(key => assessment[key].evidence));
    const weaknesses = uniqueStrings(CRITERION_KEYS.flatMap(key => assessment[key].weaknesses));
    const publicScores = {
        [taskCriterion]: assessment.taskAchievement.score,
        coherenceAndCohesion: assessment.coherenceAndCohesion.score,
        lexicalResource: assessment.lexicalResource.score,
        grammaticalRangeAndAccuracy: assessment.grammarRangeAndAccuracy.score
    };

    return {
        evaluatorVersion: WRITING_EVALUATOR_VERSION,
        assessmentType: type,
        taskType: isTask2 ? "task2" : "task1",
        wordCount: Math.max(0, Number(actualWordCount) || 0),
        scores: publicScores,
        criterionFeedback,
        errors: [],
        overallFeedback: {
            summary: weaknesses.length ? weaknesses.join(" ") : "The response consistently meets the selected descriptors.",
            mainStrengths: evidence,
            priorityImprovements: weaknesses,
            estimatedLevelExplanation: `The backend calculated Band ${overallBand.toFixed(1)} from the four verified criterion scores.`
        },
        improvedEssay: "",
        estimatedBand: overallBand,
        [taskCriterion]: assessment.taskAchievement.score,
        coherenceCohesion: assessment.coherenceAndCohesion.score,
        lexicalResource: assessment.lexicalResource.score,
        grammarRangeAccuracy: assessment.grammarRangeAndAccuracy.score,
        strengths: evidence,
        weaknesses,
        mistakes: weaknesses,
        limitations: weaknesses,
        correctedMistakes: [],
        suggestions: weaknesses,
        mainProblems: weaknesses,
        grammarMistakes: assessment.grammarRangeAndAccuracy.weaknesses,
        unnaturalPhrases: assessment.lexicalResource.weaknesses,
        repeatedIdeas: assessment.coherenceAndCohesion.weaknesses,
        howToReachNextBand: weaknesses,
        improvedVersion: "",
        examinerFeedback: buildDetailedExaminerFeedback(criterionFeedback),
        verifiedCriteria: assessment
    };
}

function normalizeFullEvaluation(task1Evaluation, task2Evaluation) {
    const task1 = task1Evaluation;
    const task2 = task2Evaluation;
    const overallBand = calculateFinalWritingBand(task1.estimatedBand, task2.estimatedBand);
    return {
        evaluatorVersion: WRITING_EVALUATOR_VERSION,
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
        || /^Writing assessment (?:is missing|output|score|requires)/.test(String(error?.message || ""))
        || /Expected four IELTS criterion scores/.test(String(error?.message || ""));
}

function classifyWritingEvaluationError(error) {
    const status = Number(error?.status || error?.statusCode);
    const isTimeout = error?.name === "APITimeoutError"
        || error?.name === "AbortError"
        || error?.code === "ETIMEDOUT"
        || error?.code === "ECONNABORTED";
    if (error?.code === "OPENAI_API_KEY_MISSING") return { status: 503, code: "WRITING_AI_NOT_CONFIGURED" };
    if (isTimeout) return { status: 504, code: "WRITING_AI_TIMEOUT" };
    if (status === 429) return { status: 503, code: "WRITING_AI_BUSY" };
    if (status === 401 || status === 403) return { status: 503, code: "WRITING_AI_AUTH_ERROR" };
    return { status: 502, code: "WRITING_AI_FAILED" };
}

module.exports = {
    WRITING_ASSESSMENT_MODEL,
    WRITING_EVALUATOR_VERSION,
    WRITING_TEMPERATURE,
    HALF_BAND_VALUES,
    ASSESSMENT_TYPES,
    CRITERION_KEYS,
    writingAssessmentSchema,
    writingStructuredOutput,
    parseJsonObject,
    normalizeAssessmentType,
    validateWritingAssessmentInput,
    normalizeBand,
    calculateTaskBand,
    calculateFinalWritingBand,
    calculateAverageWritingBand,
    normalizeCriterionAssessment,
    mergeAssessmentPasses,
    criterionScores,
    normalizeFinalEvaluation,
    normalizeFullEvaluation,
    isRepairableAssessmentError,
    classifyWritingEvaluationError
};
