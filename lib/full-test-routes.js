const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { parseFullTestHtml } = require("./ielts-import");
const ManualTestParser = require("./manual-test-parser");
const { calculateReadingBand, calculateListeningBand, scoreSkill } = require("./ielts-import/bandScoring");

function registerFullTestRoutes(app, deps) {
    const {
        requireAdmin,
        fullTestStore,
        uploadsRoot,
        safeFileName,
        getReadingTestById,
        getListeningTestById,
        resolveFullTestLocator,
        publicUrlForFullTest
    } = deps;

    const importDir = path.join(uploadsRoot, "ielts-import");
    fs.mkdirSync(importDir, { recursive: true });

    const htmlStorage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, importDir),
        filename: (req, file, cb) => {
            cb(null, `${Date.now()}-${safeFileName(file.originalname)}`);
        }
    });

    const htmlUpload = multer({
        storage: htmlStorage,
        fileFilter: (req, file, cb) => {
            if (/\.html?$/i.test(file.originalname)) {
                cb(null, true);
            } else {
                cb(new Error("Only .html files are supported"));
            }
        }
    });

    const audioStorage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(uploadsRoot, "audio")),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${safeFileName(file.originalname)}`)
    });
    const audioUpload = multer({ storage: audioStorage });

    function summarizeForResponse(test, requestedSkill = "") {
        const summary = fullTestStore.summarize(test);

        if (typeof publicUrlForFullTest === "function") {
            const routeSkill = requestedSkill === "reading" || requestedSkill === "listening"
                ? requestedSkill
                : summary.skill;
            const publicUrl = publicUrlForFullTest(test, routeSkill);

            if (publicUrl) {
                summary.openUrl = publicUrl;
                summary.slug = publicUrl.split("/").filter(Boolean).pop() || "";
            }
        }

        return summary;
    }

    app.post("/api/full-tests/combine", requireAdmin, (req, res) => {
        try {
            const { skill, partIds } = req.body || {};

            if (!["reading", "listening"].includes(skill) || !Array.isArray(partIds)) {
                return res.status(400).json({
                    error: "Create Reading and Listening Full Tests separately by selecting a skill and its parts"
                });
            }

            const expectedParts = skill === "listening" ? [1, 2, 3, 4] : [1, 2, 3];
            const loader = skill === "listening" ? getListeningTestById : getReadingTestById;
            const selectedParts = partIds.map((id) => loader(id));

            if (selectedParts.some((test) => !test)) {
                return res.status(404).json({ error: "One or more selected parts could not be found" });
            }

            const invalidPart = selectedParts.find((test, index) => Number(test.part) !== expectedParts[index]);
            if (invalidPart) {
                return res.status(400).json({
                    error: `Select ${skill === "listening" ? "Listening" : "Reading"} Parts ${expectedParts.join(", ")} in order`
                });
            }

            const existingCount = fullTestStore.readAll().filter(t => t.skill === skill).length;
            const autoTitle = `Test ${existingCount + 1}`;

            const combined = ManualTestParser.combineSkillParts({
                title: autoTitle,
                skill,
                parts: selectedParts
            });
            combined.subtitle = skill === "listening" ? "Listening full test" : "Reading full test";

            fullTestStore.save(combined);

            res.status(201).json({
                message: `${skill === "listening" ? "Listening" : "Reading"} Full Test created from existing parts`,
                test: combined,
                summary: summarizeForResponse(combined, skill)
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message || "Combine failed" });
        }
    });

    app.post("/api/full-tests/import", requireAdmin, htmlUpload.single("html"), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: "HTML file is required" });
            }

            const html = fs.readFileSync(req.file.path, "utf8");
            const testId = `${Date.now()}-${safeFileName(path.basename(req.file.originalname, path.extname(req.file.originalname)))}`;

            // First parse to auto-detect skills if set to auto
            const tempParsed = parseFullTestHtml(html, {
                fileName: req.file.originalname,
                testId,
                uploadsRoot
            });

            const hasReading = tempParsed.parseReport?.hasReading;
            const hasListening = tempParsed.parseReport?.hasListening;

            let skill = req.body.skill;
            if (!skill || skill === "auto") {
                if (hasReading && hasListening) {
                    skill = "combined";
                } else if (hasListening) {
                    skill = "listening";
                } else {
                    skill = "reading";
                }
            }

            const existingCount = fullTestStore.readAll().filter(t => t.skill === skill).length;
            const autoTitle = `Test ${existingCount + 1}`;
            const title = (req.body.title || "").trim() || autoTitle;

            const parsed = parseFullTestHtml(html, {
                fileName: req.file.originalname,
                testId,
                uploadsRoot,
                htmlPath: req.file.path,
                title: title
            });

            parsed.skill = skill;
            if (skill === "reading") {
                parsed.subtitle = "Reading full test";
                parsed.listening = { audio: "", transcript: "", sections: [] };
            } else if (skill === "listening") {
                parsed.subtitle = "Listening full test";
                parsed.reading = { passages: [] };
            } else {
                parsed.subtitle = "Combined full test";
            }

            fullTestStore.save(parsed);

            res.status(201).json({
                message: "Test imported successfully",
                test: parsed,
                summary: summarizeForResponse(parsed, skill)
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message || "Import failed" });
        }
    });

    app.get("/api/full-tests", (req, res) => {
        const status = req.query.status;
        const skill = req.query.skill;
        let tests = fullTestStore.readAll().map((test) => summarizeForResponse(test, skill));
        if (status) {
            tests = tests.filter((test) => test.status === status);
        }
        if (skill === "reading") {
            tests = tests.filter((test) => test.skill === "reading" || test.skill === "combined");
        } else if (skill === "listening") {
            tests = tests.filter((test) => test.skill === "listening" || test.skill === "combined");
        }
        res.json(tests);
    });

    app.get("/api/full-tests/:id", (req, res) => {
        const test = typeof resolveFullTestLocator === "function"
            ? resolveFullTestLocator(req.params.id, req.query.skill)
            : fullTestStore.read(req.params.id);
        if (!test) {
            return res.status(404).json({ error: "Full test not found" });
        }
        res.json(test);
    });

    app.put("/api/full-tests/:id", requireAdmin, (req, res) => {
        const existing = fullTestStore.read(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: "Full test not found" });
        }

        const updated = {
            ...existing,
            ...req.body,
            id: existing.id,
            createdAt: existing.createdAt
        };

        fullTestStore.save(updated);
        res.json({ message: "Test updated", test: updated });
    });

    app.post("/api/full-tests/:id/publish", requireAdmin, (req, res) => {
        try {
            const test = fullTestStore.read(req.params.id);
            if (!test) {
                return res.status(404).json({ error: "Full test not found" });
            }

            const result = fullTestStore.publish(test);
            res.json({
                message: "Test published",
                test: result.test,
                summary: summarizeForResponse(result.test, result.test.skill),
                readingTests: result.published.readingTests.map((t) => t.id),
                listeningTests: result.published.listeningTests.map((t) => t.id)
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message || "Publish failed" });
        }
    });

    app.delete("/api/full-tests/:id", requireAdmin, (req, res) => {
        const test = fullTestStore.read(req.params.id);
        if (!test) {
            return res.status(404).json({ error: "Full test not found" });
        }
        fullTestStore.remove(req.params.id);
        res.json({ message: "Full test deleted" });
    });

    app.post("/api/full-tests/:id/audio", requireAdmin, audioUpload.single("audio"), (req, res) => {
        const test = fullTestStore.read(req.params.id);
        if (!test) {
            return res.status(404).json({ error: "Full test not found" });
        }
        if (!req.file) {
            return res.status(400).json({ error: "Audio file is required" });
        }

        test.listening.audio = `/uploads/audio/${path.basename(req.file.path)}`;
        fullTestStore.save(test);
        res.json({ message: "Audio attached", audio: test.listening.audio });
    });

    app.post("/api/full-tests/score", (req, res) => {
        try {
            const { testId, skill, answers } = req.body;
            const test = fullTestStore.read(testId);

            if (!test) {
                return res.status(404).json({ error: "Full test not found" });
            }

            const skillQuestions = [];
            const containers = skill === "listening"
                ? (test.listening?.sections || [])
                : (test.reading?.passages || []);

            containers.forEach((container) => {
                (container.questionGroups || []).forEach((group) => {
                    skillQuestions.push(...(group.questions || []));
                });
            });

            const scored = scoreSkill(skillQuestions, answers || {});
            const band = skill === "listening"
                ? calculateListeningBand(scored.correct)
                : calculateReadingBand(scored.correct);

            res.json({
                skill,
                correct: scored.correct,
                total: scored.total,
                band,
                results: scored.results
            });
        } catch (error) {
            res.status(500).json({ error: error.message || "Scoring failed" });
        }
    });
}

module.exports = { registerFullTestRoutes };
