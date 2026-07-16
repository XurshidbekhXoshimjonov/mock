"use strict";

const PRIVATE_TEST_KEYS = new Set([
    "answer",
    "answers",
    "answerKey",
    "answerText",
    "answersText",
    "correct",
    "correctAnswer",
    "correctAnswers",
    "acceptableAnswers",
    "solutions",
    "sourceFile",
    "sourceUpload",
    "originalUpload"
]);

function publicTestData(value) {
    if (Array.isArray(value)) return value.map(publicTestData);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !PRIVATE_TEST_KEYS.has(key))
            .map(([key, child]) => [key, publicTestData(child)])
    );
}

function collectScorableQuestions(value, collected = [], seen = new Set()) {
    if (Array.isArray(value)) {
        value.forEach((child) => collectScorableQuestions(child, collected, seen));
        return collected;
    }
    if (!value || typeof value !== "object") return collected;

    const number = Number(value.number || value.questionNumber);
    const answer = value.answer ?? value.correctAnswer ?? value.correct;
    if (Number.isFinite(number) && answer !== undefined && answer !== null && String(answer).trim()) {
        const key = String(number);
        if (!seen.has(key)) {
            seen.add(key);
            collected.push({ number, answer: String(answer) });
        }
    }

    Object.entries(value).forEach(([key, child]) => {
        if (!PRIVATE_TEST_KEYS.has(key) || key === "answers") {
            collectScorableQuestions(child, collected, seen);
        }
    });
    return collected.sort((a, b) => a.number - b.number);
}

module.exports = { PRIVATE_TEST_KEYS, publicTestData, collectScorableQuestions };
