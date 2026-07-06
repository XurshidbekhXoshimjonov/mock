const mongoose = require('mongoose');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: 'd:\\mock\\.env' });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("MONGO_URI not found in .env file");
    process.exit(1);
}

// Load models
const WritingPrompt = require('../models/WritingPrompt');
const WritingFullTest = require('../models/WritingFullTest');

async function runTest() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
        dbName: 'ieltsmock'
    });
    console.log("Connected successfully.");

    try {
        // 1. Test Prompt Update
        console.log("Finding a Task 1 prompt...");
        const prompt = await WritingPrompt.findOne({ taskType: 'task1' });
        if (prompt) {
            const originalTitle = prompt.title;
            const testTitle = "React Verification Prompt";
            console.log(`Original Prompt Title: "${originalTitle}". Updating to: "${testTitle}"`);

            // Apply updates similar to route handler
            prompt.title = testTitle;
            prompt.taskText = "Updated test task prompt text";
            prompt.promptText = "Updated test task prompt text";
            
            await prompt.save();

            // Fetch again
            const updatedPrompt = await WritingPrompt.findById(prompt._id);
            if (updatedPrompt.title === testTitle) {
                console.log("SUCCESS: Prompt title updated correctly in DB.");
            } else {
                throw new Error("FAILED: Prompt title not updated.");
            }

            // Restore
            updatedPrompt.title = originalTitle;
            await updatedPrompt.save();
            console.log("Prompt restored successfully.");
        } else {
            console.log("No Task 1 prompt found in DB to test.");
        }

        // 2. Test Full Test Update
        console.log("Finding a Writing Full Test...");
        const fullTest = await WritingFullTest.findOne();
        if (fullTest) {
            const originalTitle = fullTest.title;
            const testTitle = "React Verification Full Test";
            console.log(`Original Full Test Title: "${originalTitle}". Updating to: "${testTitle}"`);

            // Apply updates similar to route handler
            fullTest.title = testTitle;
            await fullTest.save();

            // Fetch again
            const updatedFullTest = await WritingFullTest.findById(fullTest._id);
            if (updatedFullTest.title === testTitle) {
                console.log("SUCCESS: Full Test title updated correctly in DB.");
            } else {
                throw new Error("FAILED: Full Test title not updated.");
            }

            // Restore
            updatedFullTest.title = originalTitle;
            await updatedFullTest.save();
            console.log("Full Test restored successfully.");
        } else {
            console.log("No Writing Full Test found in DB to test.");
        }

    } catch (e) {
        console.error("Test error:", e.message);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

runTest();
