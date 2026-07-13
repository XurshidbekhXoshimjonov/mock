require("dotenv").config();
const OpenAI = require("openai");

async function test() {
    const apiKey = process.env.OPENAI_API_KEY;
    console.log("Using API key:", apiKey ? apiKey.substring(0, 15) + "..." : "MISSING");
    if (!apiKey) {
        console.error("API Key is missing!");
        process.exit(1);
    }

    try {
        const openai = new OpenAI({ apiKey });
        console.log("Calling OpenAI chat completions...");
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Hello, say test" }],
            temperature: 0.1
        });
        console.log("Response:", response.choices[0].message.content);
    } catch (err) {
        console.error("OpenAI call failed:", err);
    }
}

test();
