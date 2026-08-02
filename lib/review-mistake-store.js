const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { isAnswerCorrect } = require("./ielts-import/bandScoring");

const STATUSES = new Set(["new", "learning", "mastered"]);
const SKILLS = new Set(["listening", "reading"]);

function cleanText(value, limit = 12000) {
    return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, limit);
}

function answerList(value) {
    if (Array.isArray(value)) return value.flatMap(answerList);
    return String(value ?? "")
        .split(/\s*(?:\||;|\n|\bor\b)\s*/i)
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeAnswer(value) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/&/g, " and ")
        .replace(/['"“”`´.,;:!?()[\]{}]/g, " ")
        .replace(/[-–—/\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function answersMatch(userAnswer, acceptedAnswers) {
    if (Array.isArray(userAnswer)) {
        const userValues = userAnswer.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean).sort();
        if (!userValues.length) return false;
        return acceptedAnswers.some((accepted) => {
            const acceptedSet = String(accepted ?? "")
                .split(/\s*\+\s*/)
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean)
                .sort();
            return acceptedSet.length === userValues.length
                && acceptedSet.every((value, index) => value === userValues[index]);
        });
    }
    return isAnswerCorrect(userAnswer, acceptedAnswers.join("|"));
}

function mistakeKey(item) {
    return `${String(item?.skill || "").toLowerCase()}:${String(item?.questionId || "")}`;
}

function createReviewMistakeStore({ filePath, mongoose, ReviewMistake }) {
    let writeQueue = Promise.resolve();

    function useMongo() {
        return Boolean(mongoose && ReviewMistake && mongoose.connection.readyState === 1);
    }

    function ensureFile() {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify({ users: {} }, null, 2), "utf8");
        }
    }

    function readFile() {
        ensureFile();
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
            return parsed?.users ? parsed : { users: {} };
        } catch {
            return { users: {} };
        }
    }

    function writeFile(payload) {
        ensureFile();
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
    }

    function serialize(item) {
        if (!item) return null;
        const source = item?.toObject ? item.toObject() : item;

        return {
            ...source,
            id: String(source.id || source._id || ""),
            _id: undefined,
            __v: undefined
        };
    }

    function normalizeSnapshot(userId, attemptId, item) {
        const questionNumber = Number(item.questionNumber ?? item.number);
        const skill = cleanText(item.skill, 20).toLowerCase();
        const correctAnswer = item.correctAnswer ?? item.mainAnswer ?? "";
        const accepted = [
            ...answerList(correctAnswer),
            ...(Array.isArray(item.acceptedAnswers) ? item.acceptedAnswers.flatMap(answerList) : []),
            ...(Array.isArray(item.alternatives) ? item.alternatives.flatMap(answerList) : [])
        ].map((answer) => cleanText(answer, 1000)).filter(Boolean);

        if (!Number.isFinite(questionNumber) || questionNumber < 1 || !SKILLS.has(skill) || !accepted.length) {
            return null;
        }
        const startCandidate = item.evidenceStartTime ?? item.transcriptStartTime;
        const evidenceStartTime = Number.isFinite(Number(startCandidate))
            ? Math.max(0, Number(startCandidate))
            : null;
        const endCandidate = item.evidenceEndTime ?? item.transcriptEndTime;
        const evidenceEndTime = Number.isFinite(Number(endCandidate))
            && Number(endCandidate) > (evidenceStartTime ?? -1)
            ? Number(endCandidate)
            : null;

        return {
            userId: String(userId),
            attemptId: cleanText(attemptId, 200),
            testId: cleanText(item.testId, 300),
            testTitle: cleanText(item.testTitle || item.title || `${skill === "listening" ? "Listening" : "Reading"} Test`, 500),
            skill,
            sectionNumber: Number.isFinite(Number(item.sectionNumber ?? item.part ?? item.passage))
                ? Number(item.sectionNumber ?? item.part ?? item.passage)
                : null,
            sectionLabel: cleanText(item.sectionLabel, 80),
            partNumber: Number.isFinite(Number(item.partNumber ?? item.sectionNumber))
                ? Number(item.partNumber ?? item.sectionNumber)
                : null,
            questionGroupId: cleanText(item.questionGroupId, 300),
            questionId: cleanText(item.questionId || item.id || `q${questionNumber}`, 300),
            questionNumber,
            questionType: cleanText(item.questionType || item.type, 120),
            questionText: cleanText(item.questionText || item.question || item.text || `Question ${questionNumber}`, 8000),
            options: Array.isArray(item.options)
                ? item.options.map((option) => {
                    if (option && typeof option === "object") {
                        return {
                            value: cleanText(option.value ?? option.letter ?? option.label ?? option.text, 300),
                            label: cleanText(option.label ?? option.text ?? option.value ?? option.letter, 1000)
                        };
                    }
                    return cleanText(option, 1000);
                }).filter(Boolean).slice(0, 30)
                : [],
            userAnswer: Array.isArray(item.userAnswer)
                ? item.userAnswer.map((answer) => cleanText(answer, 2000))
                : cleanText(item.userAnswer, 4000),
            correctAnswer: Array.isArray(correctAnswer)
                ? correctAnswer.map((answer) => cleanText(answer, 2000))
                : cleanText(correctAnswer, 4000),
            acceptedAnswers: [...new Set(accepted)],
            instructions: cleanText(item.instructions || item.instruction, 8000),
            imageUrl: cleanText(item.imageUrl, 2000),
            context: cleanText(item.context || item.passageText || item.transcriptContext, 20000),
            transcriptText: cleanText(item.transcriptText || item.transcript, 30000),
            relevantText: cleanText(item.relevantText, 10000),
            explanation: cleanText(item.explanation, 20000),
            transcriptStartTime: Number.isFinite(Number(item.transcriptStartTime))
                ? Math.max(0, Number(item.transcriptStartTime))
                : null,
            transcriptEndTime: Number.isFinite(Number(item.transcriptEndTime))
                && Number(item.transcriptEndTime) > Number(item.transcriptStartTime ?? -1)
                ? Number(item.transcriptEndTime)
                : null,
            evidenceStartTime,
            evidenceEndTime,
            audioUrl: cleanText(item.audioUrl, 2000)
        };
    }

    async function upsertMany(userId, attemptId, snapshots) {
        const normalizedAttemptId = cleanText(attemptId, 200);
        if (!normalizedAttemptId) throw Object.assign(new Error("attemptId is required"), { statusCode: 400 });

        const unique = new Map();
        (Array.isArray(snapshots) ? snapshots : []).forEach((item) => {
            const snapshot = normalizeSnapshot(userId, normalizedAttemptId, item);
            if (snapshot) unique.set(mistakeKey(snapshot), snapshot);
        });
        const items = [...unique.values()];
        if (!items.length) return [];

        if (useMongo()) {
            await ReviewMistake.bulkWrite(items.map((snapshot) => ({
                updateOne: {
                    filter: {
                        userId: String(userId),
                        attemptId: normalizedAttemptId,
                        skill: snapshot.skill,
                        questionId: snapshot.questionId
                    },
                    update: { $setOnInsert: snapshot },
                    upsert: true
                }
            })), { ordered: false });
            return ReviewMistake.find({
                userId: String(userId),
                attemptId: normalizedAttemptId,
                $or: items.map((item) => ({ skill: item.skill, questionId: item.questionId }))
            }).lean();
        }

        return new Promise((resolve, reject) => {
            writeQueue = writeQueue.then(() => {
                const payload = readFile();
                const userKey = String(userId);
                const current = Array.isArray(payload.users[userKey]) ? payload.users[userKey] : [];
                const now = new Date().toISOString();
                const inserted = [];

                items.forEach((snapshot) => {
                    const existing = current.find((item) => (
                        item.attemptId === normalizedAttemptId
                        && item.skill === snapshot.skill
                        && item.questionId === snapshot.questionId
                    ));
                    if (existing) {
                        inserted.push(existing);
                        return;
                    }
                    const next = {
                        ...snapshot,
                        id: crypto.randomUUID(),
                        status: "new",
                        reviewCount: 0,
                        correctReviewCount: 0,
                        createdAt: now,
                        updatedAt: now,
                        lastReviewedAt: null
                    };
                    current.push(next);
                    inserted.push(next);
                });
                payload.users[userKey] = current;
                writeFile(payload);
                resolve(inserted);
            }).catch(reject);
        });
    }

    async function allForUser(userId) {
        if (useMongo()) {
            return (await ReviewMistake.find({ userId: String(userId) }).lean()).map(serialize);
        }
        const payload = readFile();
        return (payload.users[String(userId)] || []).map(serialize);
    }

    async function list(userId, options = {}) {
        let items = await allForUser(userId);
        if (SKILLS.has(options.skill)) items = items.filter((item) => item.skill === options.skill);
        if (STATUSES.has(options.status)) items = items.filter((item) => item.status === options.status);
        if (options.attemptId) items = items.filter((item) => item.attemptId === options.attemptId);
        const sort = options.sort || "newest";
        items.sort((a, b) => {
            if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
            if (sort === "repeated") return Number(b.reviewCount) - Number(a.reviewCount) || new Date(b.createdAt) - new Date(a.createdAt);
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        return items;
    }

    async function summary(userId) {
        const items = await allForUser(userId);
        return {
            toReview: items.filter((item) => item.status === "new").length,
            learning: items.filter((item) => item.status === "learning").length,
            mastered: items.filter((item) => item.status === "mastered").length,
            unresolved: items.filter((item) => item.status !== "mastered").length,
            total: items.length
        };
    }

    async function updateFileItem(userId, id, updater) {
        return new Promise((resolve, reject) => {
            writeQueue = writeQueue.then(() => {
                const payload = readFile();
                const items = payload.users[String(userId)] || [];
                const index = items.findIndex((item) => item.id === id);
                if (index < 0) return resolve(null);
                const updated = updater({ ...items[index] });
                items[index] = updated;
                payload.users[String(userId)] = items;
                writeFile(payload);
                resolve(updated);
            }).catch(reject);
        });
    }

    async function retry(userId, id, answer) {
        const applyRetry = (item) => {
            const accepted = item.acceptedAnswers?.length ? item.acceptedAnswers : answerList(item.correctAnswer);
            const correct = answersMatch(answer, accepted);
            const now = new Date().toISOString();
            const previousStatus = item.status;
            let status = previousStatus;
            if (correct && previousStatus === "new") status = "learning";
            else if (correct && previousStatus === "learning") status = "mastered";
            return {
                ...item,
                status,
                reviewCount: Number(item.reviewCount || 0) + 1,
                correctReviewCount: Number(item.correctReviewCount || 0) + (correct ? 1 : 0),
                lastReviewedAt: now,
                updatedAt: now,
                retryCorrect: correct
            };
        };

        if (useMongo()) {
            const item = await ReviewMistake.findOne({ _id: id, userId: String(userId) }).lean().catch(() => null);
            if (!item) return null;
            const accepted = item.acceptedAnswers?.length ? item.acceptedAnswers : answerList(item.correctAnswer);
            const correct = answersMatch(answer, accepted);
            const now = new Date();
            const update = [{
                $set: {
                    status: correct
                        ? {
                            $switch: {
                                branches: [
                                    { case: { $eq: ["$status", "new"] }, then: "learning" },
                                    { case: { $eq: ["$status", "learning"] }, then: "mastered" }
                                ],
                                default: "$status"
                            }
                        }
                        : "$status",
                    reviewCount: { $add: [{ $ifNull: ["$reviewCount", 0] }, 1] },
                    correctReviewCount: { $add: [{ $ifNull: ["$correctReviewCount", 0] }, correct ? 1 : 0] },
                    lastReviewedAt: now,
                    updatedAt: now
                }
            }];
            const updated = await ReviewMistake.findOneAndUpdate(
                { _id: id, userId: String(userId) },
                update,
                { new: true, lean: true }
            );
            return updated ? { ...serialize(updated), retryCorrect: correct } : null;
        }
        return updateFileItem(userId, id, applyRetry);
    }

    async function markMastered(userId, id) {
        if (useMongo()) {
            return serialize(await ReviewMistake.findOneAndUpdate(
                { _id: id, userId: String(userId) },
                { $set: { status: "mastered" } },
                { new: true, lean: true }
            ));
        }
        return updateFileItem(userId, id, (item) => ({
            ...item,
            status: "mastered",
            updatedAt: new Date().toISOString()
        }));
    }

    async function remove(userId, id) {
        if (useMongo()) {
            const result = await ReviewMistake.deleteOne({ _id: id, userId: String(userId) });
            return result.deletedCount > 0;
        }
        return new Promise((resolve, reject) => {
            writeQueue = writeQueue.then(() => {
                const payload = readFile();
                const items = payload.users[String(userId)] || [];
                const next = items.filter((item) => item.id !== id);
                if (next.length === items.length) return resolve(false);
                payload.users[String(userId)] = next;
                writeFile(payload);
                resolve(true);
            }).catch(reject);
        });
    }

    async function removeAttempt(userId, attemptId) {
        const normalizedAttemptId = cleanText(attemptId, 200);
        if (!normalizedAttemptId) return 0;
        if (useMongo()) {
            const result = await ReviewMistake.deleteMany({
                userId: String(userId),
                attemptId: normalizedAttemptId
            });
            return Number(result.deletedCount || 0);
        }
        return new Promise((resolve, reject) => {
            writeQueue = writeQueue.then(() => {
                const payload = readFile();
                const items = payload.users[String(userId)] || [];
                const next = items.filter((item) => item.attemptId !== normalizedAttemptId);
                payload.users[String(userId)] = next;
                writeFile(payload);
                resolve(items.length - next.length);
            }).catch(reject);
        });
    }

    return { upsertMany, list, summary, retry, markMastered, remove, removeAttempt };
}

module.exports = {
    createReviewMistakeStore,
    normalizeAnswer,
    answersMatch
};
