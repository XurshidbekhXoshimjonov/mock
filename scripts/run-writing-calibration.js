"use strict";

require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../models/User");
const WritingSubmission = require("../models/WritingSubmission");
const { createAuthToken } = require("../lib/auth");
const samples = require("../tests/fixtures/writing-calibration-samples");

const API_BASE = String(process.env.WRITING_CALIBRATION_API || "http://127.0.0.1:30004").replace(/\/$/, "");
const EVALUATOR_VERSION = "ielts-writing-v3.0.0-evidence-two-pass";

async function calibrationToken() {
    if (process.env.WRITING_CALIBRATION_TOKEN) return process.env.WRITING_CALIBRATION_TOKEN;
    await mongoose.connect(process.env.MONGO_URI);
    const user = await User.findOne({ role: "admin" });
    if (!user) throw new Error("Set WRITING_CALIBRATION_TOKEN or create an admin user.");
    return createAuthToken(user);
}

async function run() {
    const token = await calibrationToken();
    const requestIds = [];
    const results = [];
    try {
        for (const sample of samples) {
            const requestId = `cal${sample.id}${Date.now().toString(36)}`.slice(0, 40);
            requestIds.push(requestId);
            const response = await fetch(`${API_BASE}/api/writing/evaluate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    evaluationRequestId: requestId,
                    taskId: `calibration-${sample.id}`,
                    taskType: "task2",
                    assessmentType: "task2",
                    prompt: sample.taskText,
                    essay: sample.response,
                    wordCount: sample.response.trim().split(/\s+/).length
                })
            });
            const body = await response.json();
            if (!response.ok) throw new Error(`${sample.label}: ${body.error || body.code || response.status}`);
            const band = Number(body.estimatedBand);
            assert.ok(band >= sample.expected[0] && band <= sample.expected[1], `${sample.label}: expected ${sample.expected.join("-")}, received ${band}`);
            assert.equal(body.feedback?.evaluatorVersion, EVALUATOR_VERSION);
            results.push({ id: sample.id, label: sample.label, band, criteria: body.feedback.scores });
            console.log(JSON.stringify(results.at(-1)));
        }
        for (let index = 1; index < results.length; index += 1) {
            assert.ok(results[index].band >= results[index - 1].band, `${results[index].label} scored below ${results[index - 1].label}`);
        }
        console.log(`Writing live calibration passed for ${results.length} samples.`);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await WritingSubmission.deleteMany({ evaluatorVersion: EVALUATOR_VERSION, evaluationRequestId: { $in: requestIds } });
            await mongoose.disconnect();
        }
    }
}

run().catch(async error => {
    console.error(error.stack || error.message || error);
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    process.exit(1);
});
