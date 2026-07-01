const fs = require("fs");
const path = require("path");
const { buildPublishedTests } = require("./ielts-import/publish");

function createFullTestStore(options) {
    const {
        dataDir,
        readingTestsDir,
        listeningTestsDir,
        saveReadingTest,
        saveListeningTest
    } = options;

    const fullTestsDir = path.join(dataDir, "full-tests");
    fs.mkdirSync(fullTestsDir, { recursive: true });

    function getPath(id) {
        return path.join(fullTestsDir, `${String(id).replace(/[^a-z0-9.\-_]/gi, "_")}.json`);
    }

    function readAll() {
        return fs.readdirSync(fullTestsDir)
            .filter((file) => file.endsWith(".json"))
            .map((file) => {
                try {
                    return JSON.parse(fs.readFileSync(path.join(fullTestsDir, file), "utf8"));
                } catch (error) {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    function readPrefix(filePath, maxBytes = 64 * 1024) {
        const fd = fs.openSync(filePath, "r");
        try {
            const buffer = Buffer.alloc(maxBytes);
            const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
            return buffer.toString("utf8", 0, bytesRead);
        } finally {
            fs.closeSync(fd);
        }
    }

    function stringField(source, key) {
        const match = String(source || "").match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
        return match ? match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\") : "";
    }

    function booleanField(source, key) {
        const match = String(source || "").match(new RegExp(`"${key}"\\s*:\\s*(true|false)`));
        return match ? match[1] === "true" : false;
    }

    function inferSkillFromPrefix(prefix) {
        const explicit = stringField(prefix, "skill");
        if (["reading", "listening", "combined"].includes(explicit)) return explicit;
        const titleSignal = `${stringField(prefix, "title")} ${stringField(prefix, "sourceFile")}`.toLowerCase();
        if (titleSignal.includes("listening")) return "listening";
        if (titleSignal.includes("reading")) return "reading";
        return "combined";
    }

    function readSummaries() {
        return fs.readdirSync(fullTestsDir)
            .filter((file) => file.endsWith(".json"))
            .map((file) => {
                const filePath = path.join(fullTestsDir, file);
                try {
                    const prefix = readPrefix(filePath);
                    const stat = fs.statSync(filePath);
                    if (booleanField(prefix, "mockOnly") || booleanField(prefix, "mockTestOnly")) {
                        return null;
                    }
                    const id = stringField(prefix, "id") || path.basename(file, ".json");
                    const skill = inferSkillFromPrefix(prefix);
                    return {
                        id,
                        title: stringField(prefix, "title") || "Full Test",
                        skill,
                        status: stringField(prefix, "status") || "draft",
                        type: "full",
                        createdAt: stringField(prefix, "createdAt") || stat.mtime.toISOString(),
                        publishedAt: stringField(prefix, "publishedAt") || "",
                        openUrl: `/full-test-player?id=${encodeURIComponent(id)}&skill=${encodeURIComponent(skill === "listening" ? "listening" : "reading")}`,
                        questionCount: undefined
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    function read(id) {
        const filePath = getPath(id);
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    function save(test) {
        fs.writeFileSync(getPath(test.id), JSON.stringify(test, null, 2), "utf8");
        return test;
    }

    function remove(id) {
        const filePath = getPath(id);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    function playerUrl(test, inferredSkill) {
        const saved = String(test.openUrl || "");
        if (!saved) return "";

        if (saved.includes("full-test-player.html")) {
            const queryIndex = saved.indexOf("?");
            const query = queryIndex >= 0 ? saved.slice(queryIndex) : `?id=${encodeURIComponent(test.id)}&skill=${encodeURIComponent(inferredSkill || "reading")}`;
            return `/full-test-player${query}`;
        }

        return saved;
    }

    function summarize(test) {
        const readingQuestions = (test.reading?.passages || []).reduce((sum, p) =>
            sum + (p.questionGroups || []).reduce((gSum, g) => gSum + (g.questions || []).length, 0), 0);
        const listeningQuestions = (test.listening?.sections || []).reduce((sum, s) =>
            sum + (s.questionGroups || []).reduce((gSum, g) => gSum + (g.questions || []).length, 0), 0);
        const titleSignal = `${test.title || ""} ${test.sourceFile || ""}`.toLowerCase();
        const inferredSkill = test.skill
            || (titleSignal.includes("reading") ? "reading" : null)
            || (titleSignal.includes("listening") ? "listening" : null)
            || (readingQuestions && !listeningQuestions ? "reading" : null)
            || (listeningQuestions && !readingQuestions ? "listening" : "combined");

        return {
            id: test.id,
            title: test.title,
            skill: inferredSkill,
            status: test.status,
            sourceFile: test.sourceFile,
            passageCount: (test.reading?.passages || []).length,
            listeningSectionCount: (test.listening?.sections || []).length,
            questionCount: readingQuestions + listeningQuestions,
            duration: inferredSkill === "reading" ? 60 : 40,
            imageCount: (test.images || []).length,
            createdAt: test.createdAt,
            publishedAt: test.publishedAt,
            openUrl: playerUrl(test, inferredSkill),
            manualListeningTestId: test.manualListeningTestId || ""
        };
    }

    function publish(test) {
        const published = buildPublishedTests(test);
        const readingTests = test.skill === "listening"
            ? []
            : published.readingTests.filter((item) => Array.isArray(item.questions) && item.questions.length);
        const listeningTests = test.skill === "reading"
            ? []
            : published.listeningTests.filter((item) => Array.isArray(item.questions) && item.questions.length);

        readingTests.forEach(saveReadingTest);
        listeningTests.forEach(saveListeningTest);

        test.status = "published";
        test.publishedAt = new Date().toISOString();
        save(test);

        return { test, published: { readingTests, listeningTests } };
    }

    return {
        fullTestsDir,
        readAll,
        readSummaries,
        read,
        save,
        remove,
        summarize,
        publish
    };
}

module.exports = { createFullTestStore };
