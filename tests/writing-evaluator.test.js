"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    WRITING_ASSESSMENT_MODEL,
    WRITING_EVALUATOR_VERSION,
    WRITING_TEMPERATURE,
    writingStructuredOutput,
    normalizeAssessmentType,
    normalizeBand,
    calculateTaskBand,
    calculateFinalWritingBand,
    calculateAverageWritingBand,
    normalizeCriterionAssessment,
    mergeAssessmentPasses,
    criterionScores,
    normalizeFinalEvaluation,
    normalizeFullEvaluation,
    validateWritingAssessmentInput,
    classifyWritingEvaluationError
} = require("../lib/writing-evaluator");
const calibrationSamples = require("./fixtures/writing-calibration-samples");

function criterion(score, label, weaknesses = []) {
    return {
        score,
        evidence: [`Direct evidence for ${label} at Band ${score}.`],
        weaknesses
    };
}

function assessment(score, weaknesses = []) {
    return {
        taskAchievement: criterion(score, "task", weaknesses),
        coherenceAndCohesion: criterion(score, "coherence", weaknesses),
        lexicalResource: criterion(score, "lexis", weaknesses),
        grammarRangeAndAccuracy: criterion(score, "grammar", weaknesses)
    };
}

test("strict JSON schema contains criterion objects only and never asks AI for overall band", () => {
    const format = writingStructuredOutput("provisional");
    assert.equal(format.type, "json_schema");
    assert.equal(format.strict, true);
    assert.deepEqual(format.schema.required, [
        "taskAchievement",
        "coherenceAndCohesion",
        "lexicalResource",
        "grammarRangeAndAccuracy"
    ]);
    assert.equal(format.schema.additionalProperties, false);
    assert.deepEqual(format.schema.properties.taskAchievement.required, ["score", "evidence", "weaknesses"]);
    assert.equal(Object.hasOwn(format.schema.properties, "overallBand"), false);
    assert.equal(JSON.stringify(format.schema).includes("overallBand"), false);
});

test("all three IELTS Writing assessment types are explicit and validated", () => {
    assert.equal(normalizeAssessmentType("Academic Task1"), "academic_task1");
    assert.equal(normalizeAssessmentType("general-task1"), "general_task1");
    assert.equal(normalizeAssessmentType("task2"), "task2");
    assert.throws(() => normalizeAssessmentType("task1"), /academic_task1/);
    assert.throws(() => validateWritingAssessmentInput("task2", "Discuss both views.", "  "), /non-empty/);
});

test("malformed or evidence-free model output is rejected without fallback scores", () => {
    const raw = assessment(7);
    raw.lexicalResource.evidence = [];
    assert.throws(() => normalizeCriterionAssessment(raw), /requires evidence/);
    const missingCriterion = assessment(7);
    delete missingCriterion.grammarRangeAndAccuracy;
    assert.throws(() => normalizeCriterionAssessment(missingCriterion), /grammarRangeAndAccuracy/);
});

test("second pass can lower but can never inflate the provisional criterion score", () => {
    const first = assessment(9);
    const second = assessment(8, ["The response is polished but not fully natural or exceptional."]);
    const final = mergeAssessmentPasses(first, second);
    assert.deepEqual(criterionScores(final), {
        taskAchievement: 8,
        coherenceAndCohesion: 8,
        lexicalResource: 8,
        grammarRangeAndAccuracy: 8
    });
    assert.match(final.lexicalResource.weaknesses[0], /not fully natural/i);
});

test("backend alone calculates the task and full Writing bands", () => {
    assert.equal(calculateTaskBand({ task: 8, cc: 8.5, lr: 8, gra: 8.5 }), 8.5);
    assert.equal(calculateFinalWritingBand(7.5, 8.5), 8);
    const task1 = normalizeFinalEvaluation(assessment(7.5), "academic_task1", 180);
    const task2 = normalizeFinalEvaluation(assessment(8.5), "task2", 290);
    assert.equal(normalizeFullEvaluation(task1, task2).overallBand, 8);
});

test("IELTS half-band rounding remains deterministic", () => {
    assert.equal(normalizeBand(6.24), 6);
    assert.equal(normalizeBand(6.25), 6.5);
    assert.equal(normalizeBand(8.74), 8.5);
    assert.equal(normalizeBand(8.75), 9);
    assert.equal(calculateAverageWritingBand([6, 6.5, 7]), 6.5);
});

for (const sample of [
    { name: "weak Band 5", score: 5, weaknesses: ["Ideas are limited and language errors sometimes impede clarity."] },
    { name: "average Band 6", score: 6, weaknesses: ["Development and language control are uneven."] },
    { name: "good Band 7", score: 7, weaknesses: ["Some imprecision and occasional errors remain."] },
    { name: "strong Band 8", score: 8, weaknesses: ["Minor non-systematic weaknesses prevent fully controlled Band 9 performance."] },
    { name: "exceptional Band 9", score: 9, weaknesses: [] }
]) {
    test(`calibration fixture distinguishes ${sample.name}`, () => {
        const result = normalizeFinalEvaluation(assessment(sample.score, sample.weaknesses), "task2", 280);
        assert.equal(result.estimatedBand, sample.score);
        assert.equal(result.taskResponse, sample.score);
        assert.equal(result.weaknesses.length, sample.weaknesses.length ? 1 : 0);
    });
}

test("live calibration corpus contains complete candidate responses for Bands 5 through 9", () => {
    assert.deepEqual(calibrationSamples.map(sample => sample.id), ["band5", "band6", "band7", "band8", "band9"]);
    for (const sample of calibrationSamples) {
        assert.ok(sample.taskText.length > 50);
        assert.ok(sample.response.trim().split(/\s+/).length >= 200, `${sample.id} response is incomplete`);
        assert.equal(sample.expected.length, 2);
    }
});

test("Responses API uses versioned two-pass evaluator, temperature 0.1, and no legacy call", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "lib", "writing-routes.js"), "utf8");
    assert.equal(WRITING_ASSESSMENT_MODEL, "gpt-5.6-terra");
    assert.equal(WRITING_TEMPERATURE, 0.1);
    assert.match(WRITING_EVALUATOR_VERSION, /two-pass/);
    assert.match(source, /temperature:\s*WRITING_TEMPERATURE/);
    assert.match(source, /reasoning:\s*\{\s*effort:\s*"none"\s*\}/);
    assert.match(source, /pass:\s*"provisional"/);
    assert.match(source, /pass:\s*"verification"/);
    assert.doesNotMatch(source, /generateAIFeedback/);
    assert.doesNotMatch(source, /openai\.chat\.completions\.create/);
});

test("examiner calibration is holistic and does not over-penalize isolated minor errors", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "lib", "writing-routes.js"), "utf8");
    assert.match(source, /Judge the writer's overall control of English rather than counting errors mechanically/);
    assert.match(source, /Three or four minor mistakes[\s\S]*?minimal effect/);
    assert.match(source, /may still merit Band 7 or 7\.5 despite several minor errors/);
    assert.match(source, /identify only the most important score-limiting or repeated problems/);
});

test("cache is content-addressed by task identity, exact text, response, and evaluator version", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "lib", "writing-routes.js"), "utf8");
    assert.match(source, /function writingEvaluationHash/);
    assert.match(source, /taskId:\s*String\(task\.taskId/);
    assert.match(source, /taskText:\s*String\(task\.taskText/);
    assert.match(source, /candidateResponse:\s*String\(task\.candidateResponse/);
    assert.match(source, /evaluatorVersion:\s*WRITING_EVALUATOR_VERSION/);
    assert.match(source, /findCachedWritingEvaluation\(mongoUserId, evaluationHash\)/);
    assert.doesNotMatch(source, /findOne\(\{\s*userId:\s*mongoUserId,\s*evaluationRequestId/);
});

test("frontend sends exact task type, task text, response, and word count", () => {
    const task1 = fs.readFileSync(path.join(__dirname, "..", "writing-task1.html"), "utf8");
    const task2 = fs.readFileSync(path.join(__dirname, "..", "writing-task2.html"), "utf8");
    const full = fs.readFileSync(path.join(__dirname, "..", "full-writing-test.html"), "utf8");
    assert.match(task1, /assessmentType:\s*currentPrompt\?\.assessmentType\s*\|\|\s*'academic_task1'/);
    assert.match(task1, /essay,\s*\n\s*wordCount/);
    assert.match(task2, /assessmentType:\s*'task2'/);
    assert.match(task2, /essay,\s*\n\s*wordCount/);
    assert.match(full, /task1AssessmentType:\s*'academic_task1'/);
    assert.match(full, /task1Prompt,\s*\n\s*task1VisualDiagramUrl,\s*\n\s*task1Response,\s*\n\s*task2Prompt,\s*\n\s*task2Response/);
});

test("mock results never invent a Writing band from response length", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "lib", "mock-test-store.js"), "utf8");
    assert.doesNotMatch(source, /estimateWritingBand/);
    assert.match(source, /sections\.writing\?\.result\?\.overallBand/);
});

test("provider failures map to safe API status codes", () => {
    assert.deepEqual(classifyWritingEvaluationError({ name: "APITimeoutError" }), { status: 504, code: "WRITING_AI_TIMEOUT" });
    assert.deepEqual(classifyWritingEvaluationError({ status: 429 }), { status: 503, code: "WRITING_AI_BUSY" });
    assert.deepEqual(classifyWritingEvaluationError({ status: 500 }), { status: 502, code: "WRITING_AI_FAILED" });
});
