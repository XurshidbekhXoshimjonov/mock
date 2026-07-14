"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    WRITING_ASSESSMENT_MODEL,
    writingStructuredOutput,
    normalizeBand,
    calculateTaskBand,
    calculateFinalWritingBand,
    calculateAverageWritingBand,
    normalizeSingleEvaluation,
    normalizeFullEvaluation,
    validateWritingAssessmentInput,
    classifyWritingEvaluationError
} = require("../lib/writing-evaluator");

function criterion(summary, strengths = [], limitations = [], evidence = []) {
    return { summary, strengths, limitations, evidence };
}

function evaluationFixture(mode, bands, options = {}) {
    const taskCriterion = mode === "task1" ? "taskAchievement" : "taskResponse";
    const errors = options.errors || [];
    return {
        taskType: mode,
        wordCount: options.modelWordCount ?? 280,
        scores: {
            [taskCriterion]: bands[0],
            coherenceAndCohesion: bands[1],
            lexicalResource: bands[2],
            grammaticalRangeAndAccuracy: bands[3],
            overallBand: options.modelOverall ?? 0
        },
        criterionFeedback: {
            [taskCriterion]: criterion(
                options.taskSummary || "The response addresses the task.",
                options.taskStrengths || ["A clear position is maintained."],
                options.taskLimitations || [],
                options.taskEvidence || ["The position is stated and developed in the response."]
            ),
            coherenceAndCohesion: criterion(
                options.coherenceSummary || "The response progresses logically.",
                ["Paragraphs have clear purposes."],
                options.coherenceLimitations || [],
                ["Ideas move from cause to consequence."]
            ),
            lexicalResource: criterion(
                options.lexicalSummary || "Vocabulary is relevant and sufficiently flexible.",
                ["Topic vocabulary is used precisely."],
                options.lexicalLimitations || [],
                ["Relevant transport vocabulary is used."]
            ),
            grammaticalRangeAndAccuracy: criterion(
                options.grammarSummary || "A range of structures is used with adequate control.",
                ["Several complex sentences are accurate."],
                options.grammarLimitations || [],
                ["Subordination is used to connect reasons and outcomes."]
            )
        },
        errors,
        overallFeedback: {
            summary: options.summary || "The response communicates its main ideas clearly.",
            mainStrengths: options.mainStrengths || ["Relevant ideas are logically organised."],
            priorityImprovements: options.priorityImprovements || ["Develop the least-supported point further."],
            estimatedLevelExplanation: options.levelExplanation || "The descriptor fit is strongest at the selected adjacent band."
        },
        improvedEssay: options.improvedEssay || "An improved response preserving the candidate's ideas."
    };
}

test("strong Band 7 response with two spelling errors is not forced down to Band 6", () => {
    const raw = evaluationFixture("task2", [7, 7, 6.5, 6.5], {
        modelOverall: 5,
        errors: [
            { original: "authroties", correction: "authorities", type: "spelling", explanation: "Spelling error.", severity: "minor" },
            { original: "constracted", correction: "constructed", type: "spelling", explanation: "Spelling error.", severity: "minor" }
        ]
    });
    const result = normalizeSingleEvaluation(raw, "task2", 311);
    assert.equal(result.estimatedBand, 7);
    assert.equal(result.errors.length, 2);
    assert.equal(result.scores.overallBand, 7);
});

test("Band 6 response with relevant but limited development remains Band 6", () => {
    const raw = evaluationFixture("task2", [6, 6, 6, 6], {
        taskLimitations: ["One main idea is only briefly developed."]
    });
    assert.equal(normalizeSingleEvaluation(raw, "task2", 258).estimatedBand, 6);
});

test("off-topic response can receive a low Task Response score independently", () => {
    const raw = evaluationFixture("task2", [3, 5, 5, 5], {
        taskSummary: "Most of the response is unrelated to the question.",
        taskLimitations: ["The central topic is not addressed."]
    });
    const result = normalizeSingleEvaluation(raw, "task2", 270);
    assert.equal(result.taskResponse, 3);
    assert.equal(result.estimatedBand, 4.5);
});

test("underlength response keeps its actual server word count without a fixed penalty", () => {
    const raw = evaluationFixture("task1", [5.5, 6, 6, 6], { modelWordCount: 999 });
    const result = normalizeSingleEvaluation(raw, "task1", 92);
    assert.equal(result.wordCount, 92);
    assert.equal(result.estimatedBand, 6);
});

test("empty candidate response is rejected before any assessment", () => {
    assert.throws(
        () => validateWritingAssessmentInput("task2", "Discuss both views.", "   "),
        /non-empty candidate response/
    );
});

test("memorised or irrelevant response is represented through Task Response evidence", () => {
    const raw = evaluationFixture("task2", [2.5, 4.5, 5.5, 5], {
        taskSummary: "The response is largely memorised and irrelevant.",
        taskLimitations: ["Stock material does not answer the question."]
    });
    const result = normalizeSingleEvaluation(raw, "task2", 264);
    assert.equal(result.taskResponse, 2.5);
    assert.match(result.criterionFeedback.taskResponse.summary, /memorised/i);
});

test("high-level response with occasional grammar errors retains strong non-grammar criteria", () => {
    const raw = evaluationFixture("task2", [8, 7.5, 7.5, 6.5], {
        errors: [
            { original: "people which cycle", correction: "people who cycle", type: "grammar", explanation: "Use who for people.", severity: "minor" }
        ]
    });
    const result = normalizeSingleEvaluation(raw, "task2", 302);
    assert.equal(result.taskResponse, 8);
    assert.equal(result.estimatedBand, 7.5);
});

test("many simple but accurate sentences do not create an invented grammar penalty", () => {
    const raw = evaluationFixture("task2", [6.5, 6.5, 6, 6.5], {
        grammarSummary: "Sentences are mostly simple but generally accurate."
    });
    const result = normalizeSingleEvaluation(raw, "task2", 265);
    assert.equal(result.grammarRangeAccuracy, 6.5);
    assert.equal(result.estimatedBand, 6.5);
});

test("malformed model output is rejected instead of producing a fallback score", () => {
    const raw = evaluationFixture("task2", [7, 7, 7, 7]);
    delete raw.scores.lexicalResource;
    assert.throws(() => normalizeSingleEvaluation(raw, "task2", 280), /lexicalResource/);
});

test("OpenAI timeout and provider errors map to safe status codes", () => {
    assert.deepEqual(
        classifyWritingEvaluationError({ name: "APITimeoutError" }),
        { status: 504, code: "WRITING_AI_TIMEOUT" }
    );
    assert.deepEqual(
        classifyWritingEvaluationError({ status: 429 }),
        { status: 503, code: "WRITING_AI_BUSY" }
    );
    assert.deepEqual(
        classifyWritingEvaluationError({ status: 500 }),
        { status: 502, code: "WRITING_AI_FAILED" }
    );
});

test("invalid decimal bands are normalised to the nearest IELTS half band", () => {
    assert.equal(normalizeBand(6.3), 6.5);
    assert.equal(normalizeBand(6.74), 6.5);
    assert.equal(normalizeBand(6.75), 7);
    assert.equal(calculateTaskBand({ a: 6.3, b: 6.5, c: 7, d: 7.2 }), 7);
});

test("full Writing calculation gives Task 2 twice the Task 1 weight", () => {
    assert.equal(calculateFinalWritingBand(6.5, 7.5), 7);
    const task1 = evaluationFixture("task1", [6.5, 6.5, 6.5, 6.5]);
    const task2 = evaluationFixture("task2", [7.5, 7.5, 7.5, 7.5]);
    assert.equal(normalizeFullEvaluation({ task1, task2 }, { task1: 180, task2: 290 }).overallBand, 7);
});

test("dashboard Writing averages are reported as IELTS half bands", () => {
    assert.equal(calculateAverageWritingBand([6, 6.5]), 6.5);
    assert.equal(calculateAverageWritingBand([6, 6.5, 6.5]), 6.5);
    assert.equal(calculateAverageWritingBand([5.5, 6]), 6);
    assert.equal(calculateAverageWritingBand([]), 0);
});

test("dashboard normalises legacy decimal Writing bands before display", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "profile-dashboard.js"), "utf8");
    assert.match(source, /averageBand:\s*roundHalfBand\(rawSummary\.averageBand\)/);
    assert.match(source, /overallBand:\s*roundHalfBand\(attempt\.overallBand/);
});

test("Responses API schema is strict and exposes all required canonical feedback fields", () => {
    const format = writingStructuredOutput("task2");
    assert.equal(format.type, "json_schema");
    assert.equal(format.strict, true);
    assert.equal(format.schema.additionalProperties, false);
    assert.deepEqual(format.schema.required, [
        "taskType", "wordCount", "scores", "criterionFeedback", "errors", "overallFeedback", "improvedEssay"
    ]);
    assert.deepEqual(format.schema.properties.scores.properties.taskResponse.enum, [
        0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9
    ]);
});

test("assessment transport uses the exact model, Responses API, medium reasoning, and one repair retry", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "lib", "writing-routes.js"), "utf8");
    assert.equal(WRITING_ASSESSMENT_MODEL, "gpt-5.6-terra");
    assert.match(source, /openai\.responses\.create/);
    assert.match(source, /reasoning:\s*\{\s*effort:\s*"medium"\s*\}/);
    assert.match(source, /attempt\s*<=\s*2/);
    assert.match(source, /REPAIR INSTRUCTION/);
    assert.doesNotMatch(source, /openai\.chat\.completions\.create/);
});

test("Writing scoring has no artificial band ceiling or special 7–8 gate", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "lib", "writing-routes.js"), "utf8");
    assert.match(source, /full 0–9 range is available for every criterion/i);
    assert.match(source, /Do not impose an artificial ceiling, floor, target distribution/i);
    assert.match(source, /including 8 or 9, whenever the complete descriptor is supported/i);
    assert.doesNotMatch(source, /BAND 7–8 BOUNDARY/);
    assert.doesNotMatch(source, /normally Band 7/);
});

test("Writing length guidance does not apply a fixed deduction or score cap", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "lib", "writing-routes.js"), "utf8");
    assert.match(source, /Do not apply a fixed deduction or automatic band ceiling/i);
});
