const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const WritingPrompt = require("../models/WritingPrompt");
const WritingFullTest = require("../models/WritingFullTest");
const WritingSubmission = require("../models/WritingSubmission");
const { createAuthToken } = require("../lib/auth");

const TEST_PORT = 30099;
let server;
let adminToken = "";
let studentToken = "";
let createdTask1Id = "";
let createdTask2Id = "";
let createdFullTestId = "";

async function runTests() {
    console.info("Starting Writing API Integration Tests...");

    // Start server listener
    server = app.listen(TEST_PORT, () => {
        console.info(`Test server listening on port ${TEST_PORT}`);
    });

    try {
        // Connect mongoose if not connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/ieltsmock");
        }

        // Setup mock users and tokens
        let adminUser = await User.findOne({ email: "hoshimjonov08@gmail.com" });
        if (!adminUser) {
            adminUser = await User.create({
                username: "adminTest",
                name: "Admin Test",
                email: "hoshimjonov08@gmail.com",
                role: "admin"
            });
        }
        adminToken = createAuthToken(adminUser);

        let studentUser = await User.findOne({ email: "studentTest@ieltsx.org" });
        if (!studentUser) {
            studentUser = await User.create({
                username: "studentTest",
                name: "Student Test",
                email: "studentTest@ieltsx.org",
                role: "user"
            });
        }
        studentToken = createAuthToken(studentUser);

        // 1. POST: Create Task 1 Prompt (Admin)
        console.info("\n1. Testing Create Task 1 Prompt (Admin)...");
        const resCreateT1 = await fetch(`http://localhost:${TEST_PORT}/api/admin/writing/prompts`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                taskType: "task1",
                title: "Test Task 1 Prompt",
                promptText: "The graph below shows the consumption of fish and meat in a European country.",
                imageUrl: "/uploads/listening-images/test-chart.png",
                difficulty: "medium",
                status: "published"
            })
        });

        if (resCreateT1.status !== 201) {
            throw new Error(`Failed to create Task 1 prompt: ${resCreateT1.status}`);
        }
        const t1Prompt = await resCreateT1.json();
        createdTask1Id = t1Prompt._id;
        console.info(`✓ Success! Task 1 prompt created: ${createdTask1Id}`);

        // 2. POST: Create Task 2 Prompt (Admin)
        console.info("\n2. Testing Create Task 2 Prompt (Admin)...");
        const resCreateT2 = await fetch(`http://localhost:${TEST_PORT}/api/admin/writing/prompts`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                taskType: "task2",
                title: "Test Task 2 Prompt",
                promptText: "Some people think that university education should be free for everyone. Do you agree or disagree?",
                difficulty: "hard",
                status: "published"
            })
        });

        if (resCreateT2.status !== 201) {
            throw new Error(`Failed to create Task 2 prompt: ${resCreateT2.status}`);
        }
        const t2Prompt = await resCreateT2.json();
        createdTask2Id = t2Prompt._id;
        console.info(`✓ Success! Task 2 prompt created: ${createdTask2Id}`);

        // 3. GET: Fetch Published Task 1 Prompts (Student)
        console.info("\n3. Testing Get Published Task 1 Prompts (Student)...");
        const resGetT1 = await fetch(`http://localhost:${TEST_PORT}/api/writing/task1`);
        if (resGetT1.status !== 200) throw new Error("Failed to get Task 1 prompts");
        const t1List = await resGetT1.json();
        const foundT1 = t1List.find(p => p._id === createdTask1Id);
        if (!foundT1) throw new Error("Created Task 1 prompt not found in published list");
        console.info("✓ Success! Task 1 prompt returned in student feed");

        // 4. POST: Create Full Writing Test (Admin)
        console.info("\n4. Testing Create Full Writing Test (Admin)...");
        const resCreateFull = await fetch(`http://localhost:${TEST_PORT}/api/admin/writing/full-tests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                title: "Mock Writing Test 1",
                task1PromptId: createdTask1Id,
                task2PromptId: createdTask2Id,
                status: "published"
            })
        });

        if (resCreateFull.status !== 201) {
            throw new Error(`Failed to create Full test: ${resCreateFull.status}`);
        }
        const fullTest = await resCreateFull.json();
        createdFullTestId = fullTest._id;
        console.info(`✓ Success! Full writing test created: ${createdFullTestId}`);

        // 5. GET: Fetch Published Full Tests (Student)
        console.info("\n5. Testing Get Published Full Tests (Student)...");
        const resGetFullList = await fetch(`http://localhost:${TEST_PORT}/api/writing/full-tests`);
        if (resGetFullList.status !== 200) throw new Error("Failed to get full tests");
        const fullList = await resGetFullList.json();
        const foundFull = fullList.find(t => t._id === createdFullTestId);
        if (!foundFull) throw new Error("Created Full test not found in student list");
        if (!foundFull.task1PromptId || !foundFull.task2PromptId) throw new Error("Task prompts not populated in Full test query");
        console.info("✓ Success! Full Writing test found with populated prompt fields");

        // 6. POST: Submit Student Task 1 Practice
        console.info("\n6. Testing Submit Student Task 1 Practice (OpenAI Fallback Evaluation)...");
        const resSubT1 = await fetch(`http://localhost:${TEST_PORT}/api/writing/submit-task1`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${studentToken}`
            },
            body: JSON.stringify({
                promptId: createdTask1Id,
                essay: "This is a student report describing the fish and meat consumption chart. As shown in the graph, the fish consumption was steady while poultry grew rapidly.",
                timeSpent: 650
            })
        });

        if (resSubT1.status !== 201) {
            const err = await resSubT1.text();
            throw new Error(`Task 1 submit failed: ${resSubT1.status} - ${err}`);
        }
        const sub1 = await resSubT1.json();
        if (!sub1.feedback || !sub1.estimatedBand) {
            throw new Error("Submission was saved but feedback or estimatedBand was missing");
        }
        console.info(`✓ Success! Submission received with estimatedBand: ${sub1.estimatedBand}`);

        // 7. POST: Submit Student Full Writing Test
        console.info("\n7. Testing Submit Student Full Writing Test...");
        const resSubFull = await fetch(`http://localhost:${TEST_PORT}/api/writing/submit-full-test`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${studentToken}`
            },
            body: JSON.stringify({
                fullTestId: createdFullTestId,
                task1Essay: "Fish consumption was stable while chicken consumption rose significantly.",
                task2Essay: "I agree that university education should be free because it improves national literacy and ensures equal career opportunities.",
                timeSpent: 3000
            })
        });

        if (resSubFull.status !== 201) {
            const err = await resSubFull.text();
            throw new Error(`Full test submit failed: ${resSubFull.status} - ${err}`);
        }
        const subFull = await resSubFull.json();
        if (!subFull.feedback || !subFull.estimatedBand) {
            throw new Error("Full test submission did not return feedback");
        }
        console.info(`✓ Success! Full Writing submission saved. Band score: ${subFull.estimatedBand}`);

        // Clean up mock database additions
        console.info("\nCleaning up database entries...");
        await WritingSubmission.deleteMany({ userId: studentUser._id });
        await WritingFullTest.findByIdAndDelete(createdFullTestId);
        await WritingPrompt.findByIdAndDelete(createdTask1Id);
        await WritingPrompt.findByIdAndDelete(createdTask2Id);
        console.info("✓ Cleanup complete.");

        console.info("\n================================================");
        console.info("ALL INTEGRATION TESTS PASSED SUCCESSFULLY!");
        console.info("================================================");

    } catch (err) {
        console.error("\n❌ TEST FAILED:", err.message);
        process.exitCode = 1;
    } finally {
        // Shutdown listener and db connection
        if (server) {
            server.close();
            console.info("Test server listener stopped.");
        }
        await mongoose.connection.close();
        console.info("Database connection closed.");
    }
}

runTests();
