"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { publicTestData, collectScorableQuestions } = require("../lib/public-test-data");

test("public test data recursively removes answer keys and source metadata", () => {
    const stored = {
        id: "reading-1",
        sourceFile: "source.html",
        sourceUpload: "/uploads/ielts-import/source.html",
        answers: { 1: "alpha" },
        passages: [{
            title: "Passage",
            questionGroups: [{
                questions: [{
                    number: 1,
                    question: "Complete the sentence",
                    answer: "alpha|an alpha",
                    correctAnswer: "alpha",
                    options: ["alpha", "beta"]
                }]
            }]
        }]
    };

    const result = publicTestData(stored);

    assert.deepEqual(result, {
        id: "reading-1",
        passages: [{
            title: "Passage",
            questionGroups: [{
                questions: [{
                    number: 1,
                    question: "Complete the sentence",
                    options: ["alpha", "beta"]
                }]
            }]
        }]
    });
    assert.equal(stored.passages[0].questionGroups[0].questions[0].answer, "alpha|an alpha");
});

test("server-side scoring can still collect nested answer keys", () => {
    const stored = {
        reading: {
            passages: [{
                questionGroups: [{
                    questions: [
                        { number: 2, answer: "B" },
                        { questionNumber: 1, correctAnswer: "A|Alpha" },
                        { number: 2, answer: "duplicate is ignored" }
                    ]
                }]
            }]
        }
    };

    assert.deepEqual(collectScorableQuestions(stored), [
        { number: 1, answer: "A|Alpha" },
        { number: 2, answer: "B" }
    ]);
});

test("public detail routes sanitize payloads and scoring routes require login", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const fullRoutes = fs.readFileSync(path.join(__dirname, "..", "lib", "full-test-routes.js"), "utf8");

    assert.match(server, /app\.post\("\/api\/reading-tests\/:id\/score", requireUser,/);
    assert.match(server, /app\.post\("\/api\/listening-tests\/:id\/score", requireUser,/);
    assert.match(server, /app\.get\("\/api\/tests\/:id"[\s\S]*?res\.json\(publicTestData\(test\)\)/);
    assert.match(fullRoutes, /app\.post\("\/api\/full-tests\/score", requireAuth,/);
    assert.match(fullRoutes, /app\.get\("\/api\/full-tests\/:id"[\s\S]*?res\.json\(publicTestData\(test\)\)/);
});

test("browser players request server scoring instead of grading exposed keys", () => {
    const readingPlayer = fs.readFileSync(path.join(__dirname, "..", "reading-cbt-app.js"), "utf8");
    const listeningPlayer = fs.readFileSync(path.join(__dirname, "..", "listening-template.js"), "utf8");

    assert.match(readingPlayer, /await scoreTestOnServer\(/);
    assert.match(listeningPlayer, /await requestListeningScore\(/);
});
