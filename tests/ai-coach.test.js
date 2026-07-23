const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAICoachStore } = require("../lib/ai-coach-store");
const {
    summarizeDashboard,
    DEMO_MESSAGE_LIMIT,
    AI_COACH_SYSTEM_PROMPT,
    AI_COACH_TOOLS,
    generalAiReply,
    normalizeCoachImage,
    AI_COACH_IMAGE_LIMIT
} = require("../lib/ai-coach-routes");

function emptyDashboardInput() {
    return {
        progress: { testHistory: [], targetBand: null },
        mock: { recent: [] },
        writing: [],
        speaking: [],
        mistakes: [],
        vocabulary: [],
        plan: null
    };
}

test("AI Coach never invents progress when IELTSX has no saved results", () => {
    const summary = summarizeDashboard(emptyDashboardInput());
    assert.equal(summary.hasProgress, false);
    assert.equal(summary.overallBand, null);
    assert.deepEqual(summary.bands, {
        listening: null,
        reading: null,
        writing: null,
        speaking: null
    });
    assert.equal(summary.testsTaken, 0);
});

test("AI Coach file persistence scopes conversations, messages, memories, and actions to the authenticated user", async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ieltsx-ai-coach-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = createAICoachStore({
        filePath: path.join(directory, "ai-coach.json"),
        mongoose: { connection: { readyState: 0 } }
    });
    const first = await store.createConversation("user-a", "Private A");
    const second = await store.createConversation("user-b", "Private B");
    await store.addMessage("user-a", first.id, "user", "My private message");
    await store.addMessage("user-b", second.id, "user", "Another private message");
    await store.saveMemory("user-a", "weakestSkill", "reading");
    const action = await store.createAction("user-a", first.id, "updateTargetBand", { targetBand: 7.5 });

    assert.deepEqual((await store.listConversations("user-a")).map((item) => item.title), ["Private A"]);
    assert.equal((await store.listMessages("user-a", second.id)).length, 0);
    assert.equal((await store.listMemories("user-b")).length, 0);
    assert.equal(await store.getAction("user-b", action.id), null);
});

test("AI Coach has no free message allowance", () => {
    assert.equal(DEMO_MESSAGE_LIMIT, 0);
});

test("AI Coach prompt supports free conversation and limits tools to real data or actions", () => {
    assert.match(AI_COACH_SYSTEM_PROMPT, /translate, explain, analyse, correct grammar, advise, summarize, rewrite, brainstorm/i);
    assert.match(AI_COACH_SYSTEM_PROMPT, /Use the recent conversation to resolve references/i);
    assert.match(AI_COACH_SYSTEM_PROMPT, /Do not fetch dashboard data for translation/i);
    assert.match(AI_COACH_SYSTEM_PROMPT, /If the user explicitly says not to create a plan/i);
    assert.match(AI_COACH_SYSTEM_PROMPT, /call the matching mutating tool immediately/i);
    assert.ok(AI_COACH_TOOLS.some((tool) => tool.function.name === "getRecentTestResults"));
    assert.ok(AI_COACH_TOOLS.some((tool) => tool.function.name === "updateTargetBand"));
    for (const tool of AI_COACH_TOOLS) {
        assert.equal(Object.hasOwn(tool.function.parameters.properties || {}, "userId"), false);
    }
});

test("AI Coach sends the exact message and the latest 20 conversation messages to the model", async (t) => {
    const originalFetch = global.fetch;
    const originalKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.AI_COACH_MODEL;
    t.after(() => {
        global.fetch = originalFetch;
        if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalKey;
        if (originalModel === undefined) delete process.env.AI_COACH_MODEL;
        else process.env.AI_COACH_MODEL = originalModel;
    });
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_COACH_MODEL = "gpt-5.6-terra";
    let requestBody;
    global.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return {
            ok: true,
            json: async () => ({ choices: [{ message: { role: "assistant", content: "Odamlar avtomobillarga tobora ko‘proq qaram bo‘lib bormoqda." } }] })
        };
    };
    const history = Array.from({ length: 24 }, (_, index) => ({
        role: index % 2 ? "assistant" : "user",
        content: `history-${index}`
    }));
    const message = "People are becoming more dependent on cars. O‘zbekchaga tarjima qil.";
    const reply = await generalAiReply(message, [], history, async () => {
        throw new Error("Translation must not require a dashboard tool.");
    });

    assert.equal(reply.content, "Odamlar avtomobillarga tobora ko‘proq qaram bo‘lib bormoqda.");
    assert.equal(requestBody.model, "gpt-5.6-terra");
    assert.equal(requestBody.messages.at(-1).content, message);
    assert.equal(requestBody.reasoning_effort, "none");
    assert.equal(Object.hasOwn(requestBody, "temperature"), false);
    assert.equal(requestBody.messages.filter((item) => item.role === "user" || item.role === "assistant").length, 21);
    assert.equal(requestBody.messages.some((item) => String(item.content).includes("history-3")), false);
    assert.equal(requestBody.messages.some((item) => String(item.content).includes("history-4")), true);
});

test("AI Coach validates image attachments and sends them as multimodal model input", async (t) => {
    const originalFetch = global.fetch;
    const originalKey = process.env.OPENAI_API_KEY;
    t.after(() => {
        global.fetch = originalFetch;
        if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalKey;
    });
    process.env.OPENAI_API_KEY = "test-key";
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const attachment = normalizeCoachImage({
        name: "essay.png",
        dataUrl: `data:image/png;base64,${png.toString("base64")}`
    });
    let requestBody;
    global.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return {
            ok: true,
            json: async () => ({ choices: [{ message: { role: "assistant", content: "I can see the essay image." } }] })
        };
    };

    const reply = await generalAiReply("Check this essay.", [], [], async () => ({}), attachment);
    const content = requestBody.messages.at(-1).content;
    assert.equal(reply.content, "I can see the essay image.");
    assert.equal(content[0].type, "text");
    assert.equal(content[1].type, "image_url");
    assert.equal(content[1].image_url.url, attachment.dataUrl);
    assert.equal(content[1].image_url.detail, "auto");
    assert.ok(attachment.size <= AI_COACH_IMAGE_LIMIT);
    assert.throws(() => normalizeCoachImage({ dataUrl: "data:image/png;base64,bm90LWFuLWltYWdl" }), /not a valid image/);
});

test("AI Coach frontend exposes image selection, preview, and message payload", () => {
    const root = path.join(__dirname, "..");
    const html = fs.readFileSync(path.join(root, "ai-coach.html"), "utf8");
    const script = fs.readFileSync(path.join(root, "ai-coach.js"), "utf8");
    assert.match(html, /id="imageAttachmentInput"[^>]+accept="image\/png,image\/jpeg,image\/gif,image\/webp"/);
    assert.match(html, /id="imageAttachmentPreview"/);
    assert.match(script, /body:\s*JSON\.stringify\(\{ message, image: attachment \}\)/);
    assert.match(script, /file\.size > 3 \* 1024 \* 1024/);
});

test("AI Coach archived chats expose a right-click delete action", () => {
    const script = fs.readFileSync(path.join(__dirname, "..", "ai-coach.js"), "utf8");
    assert.match(script, /addEventListener\("contextmenu",[\s\S]*?openHistoryContextMenu/);
    assert.match(script, /remove\.textContent = "Delete chat"/);
    assert.match(script, /deleteConversation\(conversation\.id\)/);
});

test("AI Coach returns tool results to the model before producing a natural final response", async (t) => {
    const originalFetch = global.fetch;
    const originalKey = process.env.OPENAI_API_KEY;
    t.after(() => {
        global.fetch = originalFetch;
        if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalKey;
    });
    process.env.OPENAI_API_KEY = "test-key";
    const requests = [];
    global.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        if (requests.length === 1) {
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            role: "assistant",
                            content: null,
                            tool_calls: [{
                                id: "call-reading",
                                type: "function",
                                function: { name: "getRecentTestResults", arguments: "{\"skill\":\"reading\"}" }
                            }]
                        }
                    }]
                })
            };
        }
        return {
            ok: true,
            json: async () => ({ choices: [{ message: { role: "assistant", content: "Oxirgi Reading natijangiz Band 6.5." } }] })
        };
    };
    let executed = null;
    const reply = await generalAiReply(
        "Oxirgi Reading natijamni tahlil qil.",
        [],
        [],
        async (name, input) => {
            executed = { name, input };
            return {
                modelResult: { requestedSkill: "reading", recentSkillResults: [{ band: 6.5 }] },
                card: { type: "progress", empty: false, skills: [] }
            };
        }
    );

    assert.deepEqual(executed, { name: "getRecentTestResults", input: { skill: "reading" } });
    assert.equal(requests[1].messages.at(-1).role, "tool");
    assert.match(requests[1].messages.at(-1).content, /6\.5/);
    assert.equal(reply.content, "Oxirgi Reading natijangiz Band 6.5.");
    assert.equal(reply.payload.cards.length, 1);
    assert.deepEqual(reply.payload.toolCalls[0], {
        name: "getRecentTestResults",
        input: { skill: "reading" },
        status: "completed",
        actionId: null
    });
});

test("AI Coach message route no longer dispatches user text through keyword templates", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "lib", "ai-coach-routes.js"), "utf8");
    const start = source.indexOf('app.post("/api/ai-coach/conversations/:id/messages"');
    const end = source.indexOf('app.post("/api/ai-coach/actions/:id/confirm"', start);
    const messageRoute = source.slice(start, end);

    assert.doesNotMatch(messageRoute, /else if\s*\(\/.*(?:progress|natija|reja|plan|mistake|xato)/);
    assert.match(messageRoute, /generalAiReply\(/);
    assert.match(messageRoute, /existingMessages/);
});
