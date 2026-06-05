require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const pdf = require("pdf-parse");
const User = require("./models/User");

const app = express();

const ROOT_DIR = __dirname;
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const DATA_DIR = path.join(ROOT_DIR, "data");
const TESTS_FILE = path.join(DATA_DIR, "tests.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function safeFileName(fileName) {
    return fileName
        .replace(/[^a-z0-9.\-_]/gi, "_")
        .replace(/_+/g, "_");
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${safeFileName(file.originalname)}`);
    }
});

const upload = multer({ storage });

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT_DIR));

function readTests() {
    if (!fs.existsSync(TESTS_FILE)) {
        return [];
    }

    try {
        return JSON.parse(fs.readFileSync(TESTS_FILE, "utf8"));
    } catch (error) {
        console.log("Could not read tests.json:", error.message);
        return [];
    }
}

function writeTests(tests) {
    fs.writeFileSync(TESTS_FILE, JSON.stringify(tests, null, 2));
}

function cleanText(text) {
    return String(text || "")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();
}

function getPartCount(type) {
    return type === "listening" ? 4 : 3;
}

function chunkText(text, count) {
    const chunks = [];
    const size = Math.ceil(text.length / count);

    for (let i = 0; i < count; i++) {
        const start = i * size;
        const end = start + size;
        chunks.push(text.slice(start, end).trim());
    }

    return chunks;
}

function splitIntoParts(text, type) {
    const partCount = getPartCount(type);
    const markerPattern = /(?:^|\n)\s*((?:part|section|reading passage)\s*([1-4])(?:[^\n]*)?)/gi;
    const found = [];
    let match;

    while ((match = markerPattern.exec(text)) !== null) {
        const number = Number(match[2]);

        if (number >= 1 && number <= partCount && !found.some((item) => item.number === number)) {
            found.push({
                number,
                title: match[1].trim(),
                index: match.index
            });
        }
    }

    const ordered = found.sort((a, b) => a.index - b.index);

    if (ordered.length >= 2) {
        return ordered.map((part, index) => {
            const next = ordered[index + 1];
            const partText = text.slice(part.index, next ? next.index : text.length).trim();

            return {
                number: part.number,
                title: part.title || `Part ${part.number}`,
                text: partText
            };
        });
    }

    const chunks = chunkText(text, partCount);

    return chunks.map((partText, index) => ({
        number: index + 1,
        title: `Part ${index + 1}`,
        text: partText
    }));
}

function parseAnswers(rawAnswers) {
    const text = cleanText(rawAnswers);

    if (!text) {
        return [];
    }

    if (text.startsWith("{")) {
        try {
            const parsed = JSON.parse(text);

            return Object.entries(parsed)
                .map(([question, answer]) => ({
                    question: Number(String(question).replace(/\D/g, "")),
                    answers: Array.isArray(answer) ? answer.map(String) : [String(answer)]
                }))
                .filter((item) => Number.isFinite(item.question) && item.answers.length > 0)
                .sort((a, b) => a.question - b.question);
        } catch (error) {
            console.log("Answer JSON parse failed, falling back to line parser:", error.message);
        }
    }

    return text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const match =
                line.match(/^(?:q(?:uestion)?\s*)?(\d{1,2})\s*[\).:\-=]\s*(.+)$/i) ||
                line.match(/^(?:q(?:uestion)?\s*)?(\d{1,2})\s+(.+)$/i);

            if (!match) {
                return null;
            }

            const answers = match[2]
                .split(/\s*(?:\||;| \/ )\s*/)
                .map((answer) => answer.trim())
                .filter(Boolean);

            return {
                question: Number(match[1]),
                answers
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.question - b.question);
}

function extractEmbeddedAnswerBlock(text) {
    const match = text.match(/(?:answer key|answers?)\s*[:\n]+([\s\S]+)$/i);
    return match ? match[1].trim() : "";
}

function summarizeTest(test) {
    return {
        id: test.id,
        title: test.title,
        type: test.type,
        createdAt: test.createdAt,
        sourceFile: test.sourceFile,
        audioFile: test.audioFile || null,
        parts: test.parts.map((part) => ({
            number: part.number,
            title: part.title,
            characters: part.text.length
        })),
        answersCount: test.answers.length
    };
}

app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "ieltsmock.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "login.html"));
});

app.get("/signup", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "signup.html"));
});

app.post("/api/admin/tests", upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "audio", maxCount: 1 }
]), async (req, res) => {
    try {
        const pdfFile = req.files && req.files.pdf && req.files.pdf[0];

        if (!pdfFile) {
            return res.status(400).json({ error: "PDF file is required" });
        }

        const type = req.body.testType === "listening" ? "listening" : "reading";
        const title = (req.body.title || "").trim() || `${type === "listening" ? "Listening" : "Reading"} Test`;
        const parsedPdf = await pdf(fs.readFileSync(pdfFile.path));
        const extractedText = cleanText(parsedPdf.text);

        if (!extractedText) {
            return res.status(400).json({ error: "No selectable text was found in this PDF" });
        }

        const answerText = (req.body.answers || "").trim() || extractEmbeddedAnswerBlock(extractedText);
        const audioFile = req.files && req.files.audio && req.files.audio[0];
        const test = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title,
            type,
            createdAt: new Date().toISOString(),
            sourceFile: path.basename(pdfFile.path),
            originalFileName: pdfFile.originalname,
            audioFile: audioFile ? path.basename(audioFile.path) : null,
            originalAudioName: audioFile ? audioFile.originalname : null,
            pageCount: parsedPdf.numpages || null,
            fullText: extractedText,
            parts: splitIntoParts(extractedText, type),
            answers: parseAnswers(answerText)
        };

        const tests = readTests();
        tests.unshift(test);
        writeTests(tests);

        res.json({
            message: "PDF extracted and saved",
            test
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "PDF extraction failed" });
    }
});

app.get("/api/tests", (req, res) => {
    const type = req.query.type;
    const part = req.query.part;
    let tests = readTests();

    if (type === "reading" || type === "listening") {
        tests = tests.filter((test) => test.type === type);
    }

    if (part && part !== "full") {
        const partNumber = Number(part);
        tests = tests.filter((test) => test.parts.some((item) => item.number === partNumber));
    }

    res.json(tests.map(summarizeTest));
});

app.get("/api/tests/:id", (req, res) => {
    const test = readTests().find((item) => item.id === req.params.id);

    if (!test) {
        return res.status(404).json({ error: "Test not found" });
    }

    res.json(test);
});

app.post("/upload", upload.single("pdf"), async (req, res) => {
    try {
        const filePath = req.file.path;
        const data = await pdf(fs.readFileSync(filePath));

        console.log(cleanText(data.text));
        res.send("PDF uploaded + parsed successfully");
    } catch (error) {
        console.log(error);
        res.send("Upload failed");
    }
});

app.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });

        await newUser.save();
        res.send("User created successfully");
    } catch (error) {
        console.log(error);
        res.send("Signup failed");
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.send("User not found");
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.send("Wrong password");
        }

        res.send("Login successful");
    } catch (error) {
        console.log(error);
        res.send("Login failed");
    }
});

if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => {
            console.log("MongoDB connected");
        })
        .catch((error) => {
            console.log(error);
        });
} else {
    console.log("MONGO_URI is not set; login/signup database features are disabled");
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
