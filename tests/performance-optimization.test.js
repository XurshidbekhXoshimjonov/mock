"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createAICoachStore } = require("../lib/ai-coach-store");

test("static assets bypass database-backed auth hydration and responses use compression", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.match(server, /app\.use\(compression\(/);
    assert.match(server, /const extension = path\.extname\(req\.path\)\.toLowerCase\(\);[\s\S]*?extension !== "\.html"[\s\S]*?return next\(\)/);
});

test("AI Coach assets remain route-local and receive versioned cacheable URLs", () => {
    const root = path.join(__dirname, "..");
    const coachHtml = fs.readFileSync(path.join(root, "ai-coach.html"), "utf8");
    const otherPages = ["ieltsmock.html", "reading.html", "listening.html", "speaking.html", "writing.html", "mock-test.html"];

    assert.match(coachHtml, /ai-coach\.css\?v=20260723-chat-menu-v1/);
    assert.match(coachHtml, /ai-coach\.js\?v=20260723-chat-menu-v1/);
    otherPages.forEach((file) => {
        const source = fs.readFileSync(path.join(root, file), "utf8");
        assert.doesNotMatch(source, /(?:src|href)=["'][^"']*ai-coach\.(?:js|css)/);
        assert.doesNotMatch(source, /\/api\/ai-coach/);
    });
});

test("AI Coach file store paginates conversations and messages newest-first", async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ieltsx-ai-page-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = createAICoachStore({
        filePath: path.join(directory, "ai-coach.json"),
        mongoose: { connection: { readyState: 0 } }
    });
    const conversations = [];
    for (let index = 0; index < 18; index += 1) {
        conversations.push(await store.createConversation("user-a", `Chat ${index}`));
    }
    const conversationPage = await store.listConversations("user-a", "", { paginated: true, limit: 15 });
    assert.equal(conversationPage.items.length, 15);
    assert.equal(conversationPage.hasMore, true);

    const active = conversations[0];
    for (let index = 0; index < 35; index += 1) {
        await store.addMessage("user-a", active.id, index % 2 ? "assistant" : "user", `message-${index}`);
    }
    const messagePage = await store.listMessages("user-a", active.id, { paginated: true, limit: 30 });
    assert.equal(messagePage.items.length, 30);
    assert.equal(messagePage.hasMore, true);
    assert.equal(messagePage.items.at(-1).content, "message-34");
});

test("AI Coach frontend cancels stale message and search requests", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "ai-coach.js"), "utf8");
    assert.match(source, /state\.messageRequest\?\.abort\(\)/);
    assert.match(source, /state\.searchRequest\?\.abort\(\)/);
    assert.match(source, /Promise\.all\(\[\s*api\("\/api\/ai-coach\/dashboard"\),\s*api\("\/api\/ai-coach\/conversations\?limit=15"\)/);
    assert.doesNotMatch(source, /const list = await api\("\/api\/ai-coach\/conversations"\)/);
});
