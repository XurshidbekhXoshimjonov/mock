const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATUSES = new Set(["new", "learning", "mastered"]);
const DIFFICULTIES = new Set(["again", "hard", "good", "easy"]);

function cleanText(value, limit = 5000) {
    return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, limit);
}

function normalizeWord(value) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/[^a-z0-9'\-\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function finiteNumber(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
        ? Number(value)
        : null;
}

function normalizeSource(value = {}) {
    const sourceType = value.sourceType === "listening" ? "listening" : "reading";
    const start = finiteNumber(value.audioStartTime);
    const endCandidate = finiteNumber(value.audioEndTime);
    return {
        sourceType,
        testId: cleanText(value.testId, 300),
        testTitle: cleanText(value.testTitle, 500),
        passageNumber: finiteNumber(value.passageNumber),
        partNumber: finiteNumber(value.partNumber),
        questionNumber: finiteNumber(value.questionNumber),
        contextSentence: cleanText(value.contextSentence || value.sentence, 3000),
        transcriptContext: cleanText(value.transcriptContext, 5000),
        audioUrl: cleanText(value.audioUrl, 2000),
        audioStartTime: start === null ? null : Math.max(0, start),
        audioEndTime: endCandidate !== null && endCandidate > (start ?? -1) ? endCandidate : null,
        createdAt: value.createdAt || new Date().toISOString()
    };
}

function sourceKey(source) {
    return [
        source.sourceType,
        source.testId,
        source.passageNumber ?? source.partNumber ?? "",
        source.questionNumber ?? "",
        source.contextSentence || source.transcriptContext
    ].join("|");
}

function normalizeInput(userId, value = {}) {
    const word = cleanText(value.word, 160);
    const normalizedWord = normalizeWord(value.normalizedWord || word);
    if (!word || !normalizedWord) {
        throw Object.assign(new Error("A valid word is required"), { statusCode: 400 });
    }
    const rawSources = Array.isArray(value.sources) ? value.sources : [value.source || value];
    const sources = rawSources.map(normalizeSource).filter((source) => (
        source.testId || source.contextSentence || source.transcriptContext || source.audioUrl
    ));
    return {
        userId: String(userId),
        word,
        normalizedWord,
        definition: cleanText(value.definition || value.englishDefinition, 5000),
        uzbekTranslation: cleanText(value.uzbekTranslation || value.translation, 3000),
        partOfSpeech: cleanText(value.partOfSpeech, 100),
        pronunciation: cleanText(value.pronunciation || value.phonetic, 200),
        simpleExample: cleanText(value.simpleExample || value.example, 3000),
        synonyms: [...new Set((value.synonyms || []).map((item) => cleanText(item, 100)).filter(Boolean))].slice(0, 20),
        antonyms: [...new Set((value.antonyms || []).map((item) => cleanText(item, 100)).filter(Boolean))].slice(0, 20),
        sources
    };
}

function createVocabularyStore({ filePath, mongoose, VocabularyWord }) {
    let writeQueue = Promise.resolve();
    const useMongo = () => Boolean(mongoose && VocabularyWord && mongoose.connection.readyState === 1);
    const serialize = (item) => {
        const source = item?.toObject ? item.toObject() : item;
        return source ? { ...source, id: String(source.id || source._id || ""), _id: undefined, __v: undefined } : null;
    };
    const ensureFile = () => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({ users: {} }, null, 2));
    };
    const readFile = () => {
        ensureFile();
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
            return parsed?.users ? parsed : { users: {} };
        } catch {
            return { users: {} };
        }
    };
    const writeFile = (value) => fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
    const merge = (existing, incoming) => {
        const knownSources = new Set((existing.sources || []).map(sourceKey));
        const addedSources = incoming.sources.filter((source) => !knownSources.has(sourceKey(source)));
        return {
            ...existing,
            word: existing.word || incoming.word,
            definition: incoming.definition || existing.definition || "",
            uzbekTranslation: incoming.uzbekTranslation || existing.uzbekTranslation || "",
            partOfSpeech: incoming.partOfSpeech || existing.partOfSpeech || "",
            pronunciation: incoming.pronunciation || existing.pronunciation || "",
            simpleExample: incoming.simpleExample || existing.simpleExample || "",
            synonyms: [...new Set([...(existing.synonyms || []), ...incoming.synonyms])],
            antonyms: [...new Set([...(existing.antonyms || []), ...incoming.antonyms])],
            sources: [...(existing.sources || []), ...addedSources],
            updatedAt: new Date().toISOString()
        };
    };

    async function upsert(userId, value) {
        const incoming = normalizeInput(userId, value);
        if (useMongo()) {
            const existing = await VocabularyWord.findOne({ userId: String(userId), normalizedWord: incoming.normalizedWord });
            if (existing) {
                const merged = merge(serialize(existing), incoming);
                existing.set({
                    word: merged.word,
                    definition: merged.definition,
                    uzbekTranslation: merged.uzbekTranslation,
                    partOfSpeech: merged.partOfSpeech,
                    pronunciation: merged.pronunciation,
                    simpleExample: merged.simpleExample,
                    synonyms: merged.synonyms,
                    antonyms: merged.antonyms,
                    sources: merged.sources
                });
                await existing.save();
                return { item: serialize(existing), alreadyExists: true };
            }
            try {
                const created = await VocabularyWord.create(incoming);
                return { item: serialize(created), alreadyExists: false };
            } catch (error) {
                if (error?.code !== 11000) throw error;
                return upsert(userId, value);
            }
        }
        return new Promise((resolve, reject) => {
            writeQueue = writeQueue.then(() => {
                const payload = readFile();
                const key = String(userId);
                const items = payload.users[key] || [];
                const index = items.findIndex((item) => item.normalizedWord === incoming.normalizedWord);
                if (index >= 0) {
                    items[index] = merge(items[index], incoming);
                    payload.users[key] = items;
                    writeFile(payload);
                    return resolve({ item: items[index], alreadyExists: true });
                }
                const now = new Date().toISOString();
                const created = {
                    ...incoming,
                    id: crypto.randomUUID(),
                    reviewStatus: "new",
                    lastReviewedAt: null,
                    nextReviewAt: null,
                    reviewCount: 0,
                    correctCount: 0,
                    difficulty: "",
                    reviewHistory: [],
                    createdAt: now,
                    updatedAt: now
                };
                items.push(created);
                payload.users[key] = items;
                writeFile(payload);
                resolve({ item: created, alreadyExists: false });
            }).catch(reject);
        });
    }

    async function all(userId) {
        if (useMongo()) return (await VocabularyWord.find({ userId: String(userId) }).lean()).map(serialize);
        return (readFile().users[String(userId)] || []).map(serialize);
    }

    async function list(userId, options = {}) {
        let items = await all(userId);
        const now = Date.now();
        if (STATUSES.has(options.status)) items = items.filter((item) => item.reviewStatus === options.status);
        if (["reading", "listening"].includes(options.sourceType)) {
            items = items.filter((item) => (item.sources || []).some((source) => source.sourceType === options.sourceType));
        }
        if (options.due) items = items.filter((item) => !item.nextReviewAt || new Date(item.nextReviewAt).getTime() <= now);
        if (options.search) {
            const query = normalizeWord(options.search);
            items = items.filter((item) => item.normalizedWord.includes(query)
                || normalizeWord(item.uzbekTranslation).includes(query)
                || normalizeWord(item.definition).includes(query));
        }
        items.sort((a, b) => options.sort === "oldest"
            ? new Date(a.createdAt) - new Date(b.createdAt)
            : new Date(b.createdAt) - new Date(a.createdAt));
        return items;
    }

    async function get(userId, id) {
        if (useMongo()) return serialize(await VocabularyWord.findOne({ _id: id, userId: String(userId) }).lean().catch(() => null));
        return (await all(userId)).find((item) => item.id === id) || null;
    }

    async function updateFile(userId, id, updater) {
        return new Promise((resolve, reject) => {
            writeQueue = writeQueue.then(() => {
                const payload = readFile();
                const items = payload.users[String(userId)] || [];
                const index = items.findIndex((item) => item.id === id);
                if (index < 0) return resolve(null);
                items[index] = updater({ ...items[index] });
                payload.users[String(userId)] = items;
                writeFile(payload);
                resolve(items[index]);
            }).catch(reject);
        });
    }

    async function update(userId, id, changes = {}) {
        const allowed = {};
        ["word", "definition", "uzbekTranslation", "partOfSpeech", "pronunciation", "simpleExample"].forEach((key) => {
            if (changes[key] !== undefined) allowed[key] = cleanText(changes[key], key === "word" ? 160 : 5000);
        });
        if (allowed.word !== undefined) {
            allowed.normalizedWord = normalizeWord(allowed.word);
            if (!allowed.normalizedWord) throw Object.assign(new Error("A valid word is required"), { statusCode: 400 });
        }
        ["synonyms", "antonyms"].forEach((key) => {
            if (Array.isArray(changes[key])) allowed[key] = changes[key].map((item) => cleanText(item, 100)).filter(Boolean).slice(0, 20);
        });
        if (changes.reviewStatus !== undefined) {
            if (!STATUSES.has(changes.reviewStatus)) throw Object.assign(new Error("Invalid review status"), { statusCode: 400 });
            allowed.reviewStatus = changes.reviewStatus;
        }
        allowed.updatedAt = new Date().toISOString();
        if (useMongo()) {
            try {
                return serialize(await VocabularyWord.findOneAndUpdate(
                    { _id: id, userId: String(userId) }, { $set: allowed }, { returnDocument: "after", lean: true }
                ));
            } catch (error) {
                if (error?.code === 11000) throw Object.assign(new Error("This word is already in your vocabulary"), { statusCode: 409 });
                throw error;
            }
        }
        const existingItems = await all(userId);
        if (allowed.normalizedWord && existingItems.some((item) => item.id !== id && item.normalizedWord === allowed.normalizedWord)) {
            throw Object.assign(new Error("This word is already in your vocabulary"), { statusCode: 409 });
        }
        return updateFile(userId, id, (item) => ({ ...item, ...allowed }));
    }

    async function remove(userId, id) {
        if (useMongo()) return (await VocabularyWord.deleteOne({ _id: id, userId: String(userId) }).catch(() => ({ deletedCount: 0 }))).deletedCount > 0;
        let removed = false;
        await new Promise((resolve, reject) => {
            writeQueue = writeQueue.then(() => {
                const payload = readFile();
                const items = payload.users[String(userId)] || [];
                const next = items.filter((item) => item.id !== id);
                removed = next.length !== items.length;
                payload.users[String(userId)] = next;
                writeFile(payload);
                resolve();
            }).catch(reject);
        });
        return removed;
    }

    function reviewed(item, difficulty) {
        if (!DIFFICULTIES.has(difficulty)) throw Object.assign(new Error("Invalid review difficulty"), { statusCode: 400 });
        const now = new Date();
        const successful = difficulty !== "again";
        const reviewCount = Number(item.reviewCount || 0) + 1;
        const correctCount = Number(item.correctCount || 0) + (successful ? 1 : 0);
        const multiplier = Math.max(1, Math.floor(correctCount / 2) + 1);
        const baseHours = { again: 4, hard: 24, good: 72, easy: 168 }[difficulty];
        const intervalHours = difficulty === "again" ? baseHours : baseHours * multiplier;
        let reviewStatus = item.reviewStatus || "new";
        if (!successful) reviewStatus = reviewCount > 1 ? "learning" : "new";
        else if (correctCount >= 5) reviewStatus = "mastered";
        else reviewStatus = "learning";
        const history = [...(item.reviewHistory || []), {
            reviewedAt: now.toISOString(),
            difficulty,
            nextReviewAt: new Date(now.getTime() + intervalHours * 60 * 60 * 1000).toISOString()
        }].slice(-100);
        return {
            ...item,
            reviewStatus,
            lastReviewedAt: now.toISOString(),
            nextReviewAt: history.at(-1).nextReviewAt,
            reviewCount,
            correctCount,
            difficulty,
            reviewHistory: history,
            updatedAt: now.toISOString()
        };
    }

    async function review(userId, id, difficulty) {
        const item = await get(userId, id);
        if (!item) return null;
        const next = reviewed(item, difficulty);
        if (useMongo()) {
            const reviewFields = {
                reviewStatus: next.reviewStatus,
                lastReviewedAt: next.lastReviewedAt,
                nextReviewAt: next.nextReviewAt,
                reviewCount: next.reviewCount,
                correctCount: next.correctCount,
                difficulty: next.difficulty,
                reviewHistory: next.reviewHistory
            };
            return serialize(await VocabularyWord.findOneAndUpdate(
                { _id: id, userId: String(userId) }, { $set: reviewFields }, { returnDocument: "after", lean: true }
            ));
        }
        return updateFile(userId, id, () => next);
    }

    async function summary(userId, options = {}) {
        const items = options.sourceType
            ? await list(userId, { sourceType: options.sourceType })
            : await all(userId);
        const now = Date.now();
        return {
            total: items.length,
            new: items.filter((item) => item.reviewStatus === "new").length,
            learning: items.filter((item) => item.reviewStatus === "learning").length,
            mastered: items.filter((item) => item.reviewStatus === "mastered").length,
            due: items.filter((item) => !item.nextReviewAt || new Date(item.nextReviewAt).getTime() <= now).length
        };
    }

    return { upsert, list, get, update, remove, review, summary };
}

module.exports = { createVocabularyStore, normalizeWord, normalizeSource };
