const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createAICoachStore({ filePath, mongoose, AIConversation, AIMessage, AIMemory, AIActionLog }) {
    const useMongo = () => Boolean(mongoose && mongoose.connection.readyState === 1);
    let writeQueue = Promise.resolve();

    function emptyData() {
        return { conversations: [], messages: [], memories: [], actions: [] };
    }

    function readFile() {
        try {
            if (!fs.existsSync(filePath)) return emptyData();
            return { ...emptyData(), ...JSON.parse(fs.readFileSync(filePath, "utf8")) };
        } catch {
            return emptyData();
        }
    }

    function mutateFile(mutator) {
        const operation = writeQueue.then(() => {
            const data = readFile();
            const result = mutator(data);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
            return clone(result);
        });
        writeQueue = operation.catch(() => {});
        return operation;
    }

    const serialize = (item) => {
        const source = item?.toObject ? item.toObject() : item;
        return source ? { ...clone(source), id: String(source.id || source._id || ""), _id: undefined, __v: undefined } : null;
    };

    async function createConversation(userId, title = "New conversation") {
        const now = new Date();
        if (useMongo()) return serialize(await AIConversation.create({ userId: String(userId), title, preview: "", lastMessageAt: now }));
        return mutateFile((data) => {
            const item = { id: crypto.randomUUID(), userId: String(userId), title, preview: "", lastMessageAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() };
            data.conversations.push(item);
            return item;
        });
    }

    async function listConversations(userId, search = "", options = {}) {
        const normalized = String(search).trim();
        const paginated = options.paginated === true;
        const limit = Math.max(1, Math.min(50, Number(options.limit) || 15));
        const before = options.before ? new Date(options.before) : null;
        if (useMongo()) {
            const query = { userId: String(userId) };
            if (normalized) query.title = { $regex: normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
            if (before && !Number.isNaN(before.getTime())) query.lastMessageAt = { $lt: before };
            const conversations = await AIConversation.find(query)
                .select("title preview lastMessageAt createdAt updatedAt")
                .sort({ lastMessageAt: -1 })
                .limit(limit + 1)
                .lean();
            const page = conversations.slice(0, limit).map(serialize);
            const result = {
                items: page,
                hasMore: conversations.length > limit
            };
            return paginated ? result : result.items;
        }
        const data = readFile();
        const conversations = data.conversations
            .filter((item) => item.userId === String(userId) && (!normalized || item.title.toLowerCase().includes(normalized.toLowerCase())))
            .filter((item) => !before || Number.isNaN(before.getTime()) || new Date(item.lastMessageAt) < before)
            .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
            .slice(0, limit + 1);
        const page = conversations.slice(0, limit).map(serialize);
        const result = { items: page, hasMore: conversations.length > limit };
        return paginated ? result : result.items;
    }

    async function getConversation(userId, id) {
        if (useMongo()) return serialize(await AIConversation.findOne({ _id: id, userId: String(userId) }).lean().catch(() => null));
        return serialize(readFile().conversations.find((item) => item.id === id && item.userId === String(userId)));
    }

    async function renameConversation(userId, id, title) {
        const cleanTitle = String(title || "").trim().slice(0, 80);
        if (!cleanTitle) return null;
        if (useMongo()) return serialize(await AIConversation.findOneAndUpdate(
            { _id: id, userId: String(userId) }, { $set: { title: cleanTitle } }, { new: true, lean: true }
        ).catch(() => null));
        return mutateFile((data) => {
            const item = data.conversations.find((entry) => entry.id === id && entry.userId === String(userId));
            if (!item) return null;
            item.title = cleanTitle;
            item.updatedAt = new Date().toISOString();
            return item;
        });
    }

    async function deleteConversation(userId, id) {
        if (useMongo()) {
            const owned = await AIConversation.findOne({ _id: id, userId: String(userId) }).lean().catch(() => null);
            if (!owned) return false;
            await Promise.all([
                AIConversation.deleteOne({ _id: id, userId: String(userId) }),
                AIMessage.deleteMany({ conversationId: String(id), userId: String(userId) }),
                AIActionLog.deleteMany({ conversationId: String(id), userId: String(userId) })
            ]);
            return true;
        }
        return mutateFile((data) => {
            const count = data.conversations.length;
            data.conversations = data.conversations.filter((entry) => !(entry.id === id && entry.userId === String(userId)));
            if (data.conversations.length === count) return false;
            data.messages = data.messages.filter((entry) => !(entry.conversationId === id && entry.userId === String(userId)));
            data.actions = data.actions.filter((entry) => !(entry.conversationId === id && entry.userId === String(userId)));
            return true;
        });
    }

    async function addMessage(userId, conversationId, role, content, payload = {}) {
        const now = new Date();
        if (useMongo()) {
            const item = await AIMessage.create({ userId: String(userId), conversationId: String(conversationId), role, content, payload });
            await AIConversation.updateOne(
                { _id: conversationId, userId: String(userId) },
                { $set: { lastMessageAt: now, preview: String(content || "").replace(/\s+/g, " ").slice(0, 100) } }
            );
            return serialize(item);
        }
        return mutateFile((data) => {
            const item = { id: crypto.randomUUID(), userId: String(userId), conversationId: String(conversationId), role, content, payload, createdAt: now.toISOString(), updatedAt: now.toISOString() };
            data.messages.push(item);
            const conversation = data.conversations.find((entry) => entry.id === conversationId && entry.userId === String(userId));
            if (conversation) {
                conversation.lastMessageAt = now.toISOString();
                conversation.preview = String(content || "").replace(/\s+/g, " ").slice(0, 100);
            }
            return item;
        });
    }

    async function listMessages(userId, conversationId, options = {}) {
        const paginated = options.paginated === true;
        const limit = Math.max(1, Math.min(100, Number(options.limit) || 30));
        const before = options.before ? new Date(options.before) : null;
        if (useMongo()) {
            const query = { userId: String(userId), conversationId: String(conversationId) };
            if (before && !Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
            const messages = await AIMessage.find(query)
                .select("role content payload createdAt updatedAt")
                .sort({ createdAt: -1 })
                .limit(limit + 1)
                .lean();
            const result = {
                items: messages.slice(0, limit).reverse().map(serialize),
                hasMore: messages.length > limit
            };
            return paginated ? result : result.items;
        }
        const messages = readFile().messages
            .filter((item) => item.userId === String(userId) && item.conversationId === String(conversationId))
            .filter((item) => !before || Number.isNaN(before.getTime()) || new Date(item.createdAt) < before)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit + 1);
        const result = { items: messages.slice(0, limit).reverse().map(serialize), hasMore: messages.length > limit };
        return paginated ? result : result.items;
    }

    async function countUserMessages(userId) {
        if (useMongo()) return AIMessage.countDocuments({ userId: String(userId), role: "user" });
        return readFile().messages.filter((item) => item.userId === String(userId) && item.role === "user").length;
    }

    async function listMemories(userId) {
        if (useMongo()) return (await AIMemory.find({ userId: String(userId) }).sort({ updatedAt: -1 }).lean()).map(serialize);
        return readFile().memories.filter((item) => item.userId === String(userId)).map(serialize);
    }

    async function saveMemory(userId, key, value) {
        const now = new Date();
        if (useMongo()) return serialize(await AIMemory.findOneAndUpdate(
            { userId: String(userId), key }, { $set: { value, source: "user_confirmed" } }, { upsert: true, new: true, lean: true, setDefaultsOnInsert: true }
        ));
        return mutateFile((data) => {
            let item = data.memories.find((entry) => entry.userId === String(userId) && entry.key === key);
            if (item) {
                item.value = value;
                item.updatedAt = now.toISOString();
            } else {
                item = { id: crypto.randomUUID(), userId: String(userId), key, value, source: "user_confirmed", createdAt: now.toISOString(), updatedAt: now.toISOString() };
                data.memories.push(item);
            }
            return item;
        });
    }

    async function deleteMemory(userId, id) {
        if (useMongo()) return (await AIMemory.deleteOne({ _id: id, userId: String(userId) }).catch(() => ({ deletedCount: 0 }))).deletedCount > 0;
        return mutateFile((data) => {
            const count = data.memories.length;
            data.memories = data.memories.filter((entry) => !(entry.id === id && entry.userId === String(userId)));
            return data.memories.length !== count;
        });
    }

    async function createAction(userId, conversationId, action, input) {
        const now = new Date();
        if (useMongo()) return serialize(await AIActionLog.create({ userId: String(userId), conversationId: String(conversationId), action, input }));
        return mutateFile((data) => {
            const item = { id: crypto.randomUUID(), userId: String(userId), conversationId: String(conversationId), action, input, result: {}, status: "pending", confirmedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString() };
            data.actions.push(item);
            return item;
        });
    }

    async function getAction(userId, id) {
        if (useMongo()) return serialize(await AIActionLog.findOne({ _id: id, userId: String(userId) }).lean().catch(() => null));
        return serialize(readFile().actions.find((item) => item.id === id && item.userId === String(userId)));
    }

    async function updateAction(userId, id, status, result = {}) {
        const update = { status, result, confirmedAt: status === "completed" ? new Date() : null };
        if (useMongo()) return serialize(await AIActionLog.findOneAndUpdate(
            { _id: id, userId: String(userId) }, { $set: update }, { new: true, lean: true }
        ).catch(() => null));
        return mutateFile((data) => {
            const item = data.actions.find((entry) => entry.id === id && entry.userId === String(userId));
            if (!item) return null;
            Object.assign(item, clone(update), { updatedAt: new Date().toISOString() });
            return item;
        });
    }

    return {
        createConversation, listConversations, getConversation, renameConversation, deleteConversation,
        addMessage, listMessages, countUserMessages,
        listMemories, saveMemory, deleteMemory,
        createAction, getAction, updateAction
    };
}

module.exports = { createAICoachStore };
