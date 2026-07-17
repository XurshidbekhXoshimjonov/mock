const fs = require("fs");
const path = require("path");

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createStudyPlanStore({ filePath, mongoose, StudyPlan }) {
    const useMongo = () => Boolean(mongoose && StudyPlan && mongoose.connection.readyState === 1);

    function readFile() {
        try {
            if (!fs.existsSync(filePath)) return { users: {} };
            const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
            return parsed?.users ? parsed : { users: {} };
        } catch {
            return { users: {} };
        }
    }

    function writeFile(payload) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
    }

    async function get(userId) {
        const key = String(userId);
        if (useMongo()) return clone(await StudyPlan.findOne({ userId: key }).lean());
        return clone(readFile().users[key] || null);
    }

    async function save(userId, plan) {
        const key = String(userId);
        const now = new Date().toISOString();
        const payload = { ...clone(plan), userId: key, updatedAt: now, createdAt: plan.createdAt || now };
        if (useMongo()) {
            return clone(await StudyPlan.findOneAndUpdate(
                { userId: key },
                { $set: payload, $setOnInsert: { createdAt: new Date(payload.createdAt) } },
                { upsert: true, returnDocument: "after", lean: true, runValidators: true }
            ));
        }
        const file = readFile();
        file.users[key] = payload;
        writeFile(file);
        return clone(payload);
    }

    async function remove(userId) {
        const key = String(userId);
        if (useMongo()) return (await StudyPlan.deleteOne({ userId: key })).deletedCount > 0;
        const file = readFile();
        const existed = Boolean(file.users[key]);
        delete file.users[key];
        writeFile(file);
        return existed;
    }

    return { get, save, remove };
}

module.exports = { createStudyPlanStore };
