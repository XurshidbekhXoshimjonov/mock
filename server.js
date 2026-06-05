require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const pdf = require("pdf-parse");
const User = require("./models/User");
const { createAuthToken, verifyAuthToken, publicUser, isAdminEmail } = require("./lib/auth");
const { createUserStore } = require("./lib/user-store");
const { sendTelegramMessage } = require("./lib/telegram");
const { createFullTestStore } = require("./lib/full-test-store");
const { registerFullTestRoutes } = require("./lib/full-test-routes");
const { createUserProgressStore } = require("./lib/user-progress-store");
const ManualTestParser = require("./lib/manual-test-parser");

const app = express();

const ROOT_DIR = __dirname;
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const DATA_DIR = path.join(ROOT_DIR, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const userStore = createUserStore({ User, usersFile: USERS_FILE });
const USER_PROGRESS_FILE = path.join(DATA_DIR, "user-progress.json");
const userProgressStore = createUserProgressStore(USER_PROGRESS_FILE);
const TESTS_FILE = path.join(DATA_DIR, "tests.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "output.txt");
const READING_JSON_FILE = path.join(ROOT_DIR, "reading.json");
const READING_TESTS_DIR = path.join(DATA_DIR, "reading-tests");
const LISTENING_TESTS_DIR = path.join(DATA_DIR, "listening-tests");
const FULL_TESTS_DIR = path.join(DATA_DIR, "full-tests");
const AUDIO_UPLOAD_DIR = path.join(UPLOAD_DIR, "audio");
const LISTENING_IMAGE_UPLOAD_DIR = path.join(UPLOAD_DIR, "listening-images");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(READING_TESTS_DIR, { recursive: true });
fs.mkdirSync(LISTENING_TESTS_DIR, { recursive: true });
fs.mkdirSync(FULL_TESTS_DIR, { recursive: true });
fs.mkdirSync(AUDIO_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(LISTENING_IMAGE_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, "ielts-import"), { recursive: true });

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

const audioStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, AUDIO_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${safeFileName(file.originalname)}`);
    }
});

const audioUpload = multer({
    storage: audioStorage,
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const accepted = [".mp3", ".wav", ".m4a"].includes(extension);
        cb(accepted ? null : new Error("Audio must be an MP3, WAV, or M4A file"), accepted);
    }
});

const listeningImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, LISTENING_IMAGE_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${safeFileName(file.originalname)}`);
    }
});

const listeningImageUpload = multer({
    storage: listeningImageStorage,
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const accepted = [".jpg", ".jpeg", ".png", ".webp"].includes(extension);
        cb(accepted ? null : new Error("Image must be a JPG, PNG, or WebP file"), accepted);
    }
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

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

function makeId(title) {
    const slug = String(title || "reading-test")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50) || "reading-test";

    return `${Date.now()}-${slug}`;
}

function getReadingTestPath(id) {
    return path.join(READING_TESTS_DIR, `${safeFileName(id)}.json`);
}

function normalizePart(part) {
    if (part === "full") {
        return "full";
    }

    const number = Number(part);

    if ([1, 2, 3].includes(number)) {
        return number;
    }

    return 1;
}

function parseAnswerLines(answerText) {
    const answers = {};

    String(answerText || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            const match = line.match(/^(\d{1,2})\s*[\).:\-=\|]\s*(.+)$/);

            if (!match) {
                return;
            }

            answers[match[1]] = match[2].trim();
        });

    return answers;
}

function parseOptionText(optionText) {
    return String(optionText || "")
        .split(/\s*;\s*/)
        .map((option) => option.trim())
        .filter(Boolean);
}

function optionsForType(type, options) {
    if (type === "true_false_not_given") {
        return ["TRUE", "FALSE", "NOT GIVEN"];
    }

    if (type === "yes_no_not_given") {
        return ["YES", "NO", "NOT GIVEN"];
    }

    if (["multiple_choice", "multi_select", "matching_headings", "matching_information", "diagram_labeling"].includes(type)) {
        return parseOptionText(options);
    }

    if (Array.isArray(options)) {
        return options.map(String).map((item) => item.trim()).filter(Boolean);
    }

    return parseOptionText(options);
}

function normalizeQuestion(rawQuestion, answers) {
    const number = Number(rawQuestion.number);
    const type = String(rawQuestion.type || "sentence_completion")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    const question = String(rawQuestion.question || rawQuestion.text || "").trim();
    const answerFromMap = answers[String(number)];
    const answer = rawQuestion.answer !== undefined ? rawQuestion.answer : answerFromMap;

    return {
        number,
        type,
        question,
        options: optionsForType(type, rawQuestion.options),
        answer: Array.isArray(answer) ? answer.join(" | ") : String(answer || "").trim()
    };
}

function parseQuestionLines(questionText, answers) {
    return String(questionText || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split("|").map((item) => item.trim());

            return normalizeQuestion({
                number: parts[0],
                type: parts[1],
                question: parts[2],
                options: parts[3] || ""
            }, answers);
        });
}

function buildManualReadingTest(body) {
    let questions = [];
    let questionGroups = Array.isArray(body.questionGroups) ? body.questionGroups : [];

    if (Array.isArray(body.questions)) {
        const answers = parseAnswerLines(body.answerText || body.answersText || "");
        questions = body.questions.map((question) => normalizeQuestion(question, answers));
    } else {
        const parsed = ManualTestParser.parseStructuredContent(
            body.questionText || "",
            body.answerText || body.answersText || "",
            "reading"
        );
        questions = parsed.questions;
        questionGroups = parsed.groups;
    }

    questions = questions
        .filter((question) => (
            Number.isFinite(question.number) &&
            question.question &&
            question.type &&
            question.answer
        ))
        .sort((a, b) => a.number - b.number);

    const title = String(body.title || "").trim();
    const passage = String(body.passage || "").trim();

    if (!title) {
        const error = new Error("Test title is required");
        error.statusCode = 400;
        throw error;
    }

    if (!passage) {
        const error = new Error("Passage text is required");
        error.statusCode = 400;
        throw error;
    }

    if (!questions.length) {
        const error = new Error("At least one valid question with an answer is required");
        error.statusCode = 400;
        throw error;
    }

    if (!questionGroups.length && questions.length) {
        questionGroups = [{
            title: `Questions ${questions[0].number}-${questions[questions.length - 1].number}`,
            instruction: "",
            rule: "",
            questionNumbers: questions.map((q) => q.number)
        }];
    }

    questionGroups = ManualTestParser.inferDeclaredGroupTypes(
        ManualTestParser.normalizeQuestionGroups(questionGroups, questions),
        questions
    );

    return {
        id: body.id || makeId(title),
        title,
        part: normalizePart(body.part),
        passage,
        questionGroups,
        questions,
        createdAt: body.createdAt || new Date().toISOString()
    };
}

function saveManualReadingTest(test) {
    fs.writeFileSync(getReadingTestPath(test.id), JSON.stringify(test, null, 2), "utf8");
}

function readManualReadingTests() {
    if (!fs.existsSync(READING_TESTS_DIR)) {
        return [];
    }

    return fs.readdirSync(READING_TESTS_DIR)
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
            try {
                return JSON.parse(fs.readFileSync(path.join(READING_TESTS_DIR, file), "utf8"));
            } catch (error) {
                console.log(`Could not read ${file}:`, error.message);
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function summarizeManualReadingTest(test) {
    return {
        id: test.id,
        title: test.title,
        part: test.part,
        questionCount: test.questions.length,
        createdAt: test.createdAt
    };
}

function getListeningTestPath(id) {
    return path.join(LISTENING_TESTS_DIR, `${safeFileName(id)}.json`);
}

function normalizeListeningPart(part) {
    if (part === "full") {
        return "full";
    }

    const number = Number(part);

    if ([1, 2, 3, 4].includes(number)) {
        return number;
    }

    return 1;
}

function listeningQuestionCount(test) {
    if (Array.isArray(test.questions)) {
        return test.questions.length;
    }

    const numbers = new Set();

    function inspect(value, key) {
        if (key === "questionNumber" && Number.isFinite(Number(value))) {
            numbers.add(Number(value));
        }

        if (typeof value === "string") {
            for (const match of value.matchAll(/\{\{(\d{1,2})\}\}/g)) {
                numbers.add(Number(match[1]));
            }
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => inspect(item, ""));
            return;
        }

        if (value && typeof value === "object") {
            Object.entries(value).forEach(([childKey, childValue]) => inspect(childValue, childKey));
        }
    }

    inspect(test.parts || [], "parts");
    return numbers.size;
}

function normalizeListeningBlock(block, blockIndex) {
    const supportedTypes = [
        "form_completion",
        "multiple_select",
        "sentence_completion_inline",
        "multiple_choice",
        "note_completion",
        "table_completion",
        "matching",
        "map_labelling"
    ];
    const type = supportedTypes.includes(block?.type) ? block.type : "sentence_completion_inline";

    return {
        ...JSON.parse(JSON.stringify(block || {})),
        id: String(block?.id || `block-${Date.now()}-${blockIndex + 1}`),
        type
    };
}

function buildStructuredListeningTest(body) {
    const source = typeof body.data === "string" ? JSON.parse(body.data) : body;
    const title = String(source.title || "").trim();
    const duration = Number(source.duration) || 30;
    const requestedPart = source.part !== undefined
        ? normalizeListeningPart(source.part)
        : "full";

    if (!title) {
        const error = new Error("Test title is required");
        error.statusCode = 400;
        throw error;
    }

    if (!Array.isArray(source.parts) || !source.parts.length) {
        const error = new Error("At least one listening part is required");
        error.statusCode = 400;
        throw error;
    }

    const parts = source.parts.map((part, partIndex) => ({
        partNumber: Number(part.partNumber) || partIndex + 1,
        title: String(part.title || `Part ${partIndex + 1}`),
        questionRange: String(part.questionRange || ""),
        audioUrl: String(part.audioUrl || ""),
        audioFileName: String(part.audioFileName || ""),
        instruction: String(part.instruction || ""),
        answerText: String(part.answerText || ""),
        blocks: Array.isArray(part.blocks)
            ? part.blocks.map((block, blockIndex) => normalizeListeningBlock(block, blockIndex))
            : []
    }));
    const savedParts = requestedPart === "full"
        ? parts
        : parts.filter((part) => Number(part.partNumber) === Number(requestedPart));

    if (!savedParts.length) {
        const error = new Error(`Listening Part ${requestedPart} was not found`);
        error.statusCode = 400;
        throw error;
    }

    return {
        id: source.id || makeId(title),
        title,
        duration,
        part: requestedPart,
        parts: savedParts,
        createdAt: source.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function normalizeListeningType(type) {
    const value = String(type || "sentence_completion").trim().toLowerCase();

    return ManualTestParser.LISTENING_TYPES.includes(value) ? value : "sentence_completion";
}

function optionsForListeningType(type, options) {
    if (["multiple_choice", "map_labeling", "matching", "diagram_labeling"].includes(type)) {
        return parseOptionText(options);
    }

    return [];
}

function normalizeListeningQuestion(rawQuestion, answers) {
    const number = Number(rawQuestion.number);
    const type = normalizeListeningType(rawQuestion.type);
    const answerFromMap = answers[String(number)];
    const answer = rawQuestion.answer !== undefined ? rawQuestion.answer : answerFromMap;

    return {
        number,
        type,
        question: String(rawQuestion.question || rawQuestion.text || "").trim(),
        options: optionsForListeningType(type, rawQuestion.options),
        answer: Array.isArray(answer) ? answer.join(" | ") : String(answer || "").trim()
    };
}

function isListeningSectionLine(line) {
    const trimmed = String(line || "").trim();

    if (!trimmed) {
        return false;
    }

    if (/^section\b/i.test(trimmed)) {
        return true;
    }

    if (/^#\s*questions\b/i.test(trimmed)) {
        return true;
    }

    return /^questions\s+\d/i.test(trimmed);
}

function parseListeningSectionLine(line) {
    const parts = line.split("|").map((item) => item.trim());

    if (/^section\b/i.test(parts[0])) {
        return {
            title: parts[1] || "Questions",
            instruction: parts[2] || "",
            rule: parts[3] || "",
            questionNumbers: []
        };
    }

    const title = line.replace(/^#\s*/, "").trim();

    return {
        title,
        instruction: "",
        rule: "",
        questionNumbers: []
    };
}

function parseListeningQuestionLines(questionText, answers) {
    const sections = [];
    let currentSection = null;
    const questions = [];

    String(questionText || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            if (isListeningSectionLine(line)) {
                currentSection = parseListeningSectionLine(line);
                sections.push(currentSection);
                return;
            }

            const parts = line.split("|").map((item) => item.trim());
            const question = normalizeListeningQuestion({
                number: parts[0],
                type: parts[1],
                question: parts[2],
                options: parts[3] || ""
            }, answers);

            if (!Number.isFinite(question.number)) {
                return;
            }

            if (!currentSection) {
                currentSection = {
                    title: "",
                    instruction: "",
                    rule: "",
                    questionNumbers: []
                };
                sections.push(currentSection);
            }

            currentSection.questionNumbers.push(question.number);
            questions.push(question);
        });

    return { sections, questions };
}

function buildDefaultListeningSections(questions) {
    const completionTypes = ["form_completion", "notes_completion", "sentence_completion"];
    const completionQuestions = questions.filter((question) => completionTypes.includes(question.type));
    const choiceQuestions = questions.filter((question) => !completionTypes.includes(question.type));
    const sections = [];

    function rangeTitle(items) {
        const numbers = items.map((question) => question.number);
        const first = Math.min(...numbers);
        const last = Math.max(...numbers);
        return first === last ? `Question ${first}` : `Questions ${first}-${last}`;
    }

    if (completionQuestions.length) {
        sections.push({
            title: rangeTitle(completionQuestions),
            instruction: "Complete the notes below.",
            rule: "NO MORE THAN THREE WORDS AND/OR A NUMBER",
            questionNumbers: completionQuestions.map((question) => question.number)
        });
    }

    if (choiceQuestions.length) {
        sections.push({
            title: rangeTitle(choiceQuestions),
            instruction: "Choose the correct letter, A, B or C.",
            rule: "",
            questionNumbers: choiceQuestions.map((question) => question.number)
        });
    }

    return sections;
}

function normalizeListeningSections(sections, questions) {
    const questionMap = new Map(questions.map((question) => [question.number, question]));

    let normalized = (sections || [])
        .map((section) => ({
            title: String(section.title || "").trim(),
            instruction: String(section.instruction || "").trim(),
            rule: String(section.rule || "").trim(),
            questionNumbers: Array.isArray(section.questionNumbers)
                ? section.questionNumbers.map(Number).filter(Number.isFinite)
                : []
        }))
        .filter((section) => section.title || section.questionNumbers.length);

    if (!normalized.length && questions.length) {
        normalized = buildDefaultListeningSections(questions);
    }

    const used = new Set();

    normalized = normalized.map((section) => {
        const questionNumbers = section.questionNumbers.filter((number) => {
            if (!questionMap.has(number) || used.has(number)) {
                return false;
            }

            used.add(number);
            return true;
        });

        return {
            ...section,
            title: section.title || (questionNumbers.length
                ? buildDefaultListeningSections(
                    questionNumbers.map((number) => questionMap.get(number))
                )[0].title
                : "Questions"),
            questionNumbers
        };
    });

    const leftover = questions
        .map((question) => question.number)
        .filter((number) => !used.has(number));

    if (leftover.length) {
        normalized.push({
            title: buildDefaultListeningSections(
                leftover.map((number) => questionMap.get(number))
            )[0].title,
            instruction: "",
            rule: "",
            questionNumbers: leftover
        });
    }

    return normalized.filter((section) => section.questionNumbers.length);
}

function buildManualListeningTest(body, audioFile) {
    if (Array.isArray(body.parts) || typeof body.data === "string") {
        return buildStructuredListeningTest(body);
    }

    const answers = parseAnswerLines(body.answerText || body.answersText || "");
    let sections = Array.isArray(body.sections) ? body.sections : [];
    let questions = [];

    if (Array.isArray(body.questions)) {
        questions = body.questions.map((question) => normalizeListeningQuestion(question, answers));
    } else {
        const parsed = ManualTestParser.parseStructuredContent(
            body.questionText || "",
            body.answerText || body.answersText || "",
            "listening"
        );
        sections = parsed.groups;
        questions = parsed.questions.map((question) => normalizeListeningQuestion(question, {}));
    }

    questions = questions
        .filter((question) => (
            Number.isFinite(question.number) &&
            question.question &&
            question.type &&
            question.answer
        ))
        .sort((a, b) => a.number - b.number);

    sections = ManualTestParser.sortQuestionGroups(
        normalizeListeningSections(sections, questions)
    );

    const title = String(body.title || "").trim();
    const transcript = String(body.transcript || "").trim();

    if (!title) {
        const error = new Error("Test title is required");
        error.statusCode = 400;
        throw error;
    }

    if (!audioFile && !body.audio) {
        const error = new Error("Audio file is required");
        error.statusCode = 400;
        throw error;
    }

    if (!questions.length) {
        const error = new Error("At least one valid question with an answer is required");
        error.statusCode = 400;
        throw error;
    }

    const audio = audioFile
        ? `/uploads/audio/${path.basename(audioFile.path)}`
        : String(body.audio || "");

    return {
        id: body.id || makeId(title),
        title,
        part: normalizeListeningPart(body.part),
        audio,
        transcript,
        sections,
        questions,
        createdAt: body.createdAt || new Date().toISOString()
    };
}

function saveManualListeningTest(test) {
    fs.writeFileSync(getListeningTestPath(test.id), JSON.stringify(test, null, 2), "utf8");
}

function inspectStructuredQuestion(value, number, context = {}) {
    if (typeof value === "string") {
        if (value.includes(`{{${number}}}`)) {
            return {
                question: value.replace(new RegExp(`\\{\\{${number}\\}\\}`, "g"), "_____"),
                options: []
            };
        }
        return null;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = inspectStructuredQuestion(item, number, context);
            if (found) return found;
        }
        return null;
    }

    if (!value || typeof value !== "object") {
        return null;
    }

    const nextContext = {
        title: value.title || context.title || "",
        question: value.question || context.question || "",
        label: value.label || context.label || "",
        options: value.options || context.options || []
    };

    if (Number(value.questionNumber) === number) {
        return {
            question: nextContext.question || nextContext.label || nextContext.title || `Listening question ${number}`,
            options: (nextContext.options || []).map((option) => (
                typeof option === "string" ? option : option.text || option.label || option.letter || ""
            )).filter(Boolean)
        };
    }

    for (const child of Object.values(value)) {
        const found = inspectStructuredQuestion(child, number, nextContext);
        if (found) return found;
    }

    return null;
}

function buildStructuredListeningPart(fullTest, part) {
    const answers = parseAnswerLines(part.answerText || "");
    const numbers = new Set();

    function collect(value, key) {
        if (key === "questionNumber" && Number.isFinite(Number(value))) {
            numbers.add(Number(value));
        }
        if (typeof value === "string") {
            for (const match of value.matchAll(/\{\{(\d{1,2})\}\}/g)) {
                numbers.add(Number(match[1]));
            }
        } else if (Array.isArray(value)) {
            value.forEach((item) => collect(item, ""));
        } else if (value && typeof value === "object") {
            Object.entries(value).forEach(([childKey, childValue]) => collect(childValue, childKey));
        }
    }

    collect(part.blocks || [], "blocks");
    const questions = [...numbers]
        .sort((a, b) => a - b)
        .filter((number) => answers[String(number)])
        .map((number) => {
            const context = inspectStructuredQuestion(part.blocks || [], number) || {};
            return {
                number,
                type: context.options?.length ? "multiple_choice" : "sentence_completion",
                question: context.question || `Listening question ${number}`,
                options: context.options || [],
                answer: answers[String(number)]
            };
        });

    if (!questions.length) {
        return null;
    }

    return {
        id: `${fullTest.id}-part-${part.partNumber}`,
        title: `${fullTest.title} - ${part.title || `Part ${part.partNumber}`}`,
        part: Number(part.partNumber),
        audio: part.audioUrl || "",
        duration: fullTest.duration,
        parts: [part],
        sections: [{
            title: part.questionRange || `Questions ${questions[0].number}-${questions[questions.length - 1].number}`,
            instruction: part.instruction || "",
            rule: "",
            questionNumbers: questions.map((question) => question.number)
        }],
        questions,
        sourceFullTestId: fullTest.id,
        createdAt: fullTest.createdAt,
        updatedAt: new Date().toISOString()
    };
}

function saveStructuredListeningParts(test) {
    if (test.part !== "full" || !Array.isArray(test.parts)) {
        return [];
    }

    return test.parts
        .map((part) => buildStructuredListeningPart(test, part))
        .filter(Boolean)
        .map((partTest) => {
            saveManualListeningTest(partTest);
            return partTest;
        });
}

const fullTestStore = createFullTestStore({
    dataDir: DATA_DIR,
    readingTestsDir: READING_TESTS_DIR,
    listeningTestsDir: LISTENING_TESTS_DIR,
    saveReadingTest: saveManualReadingTest,
    saveListeningTest: saveManualListeningTest
});

function readManualListeningTests() {
    if (!fs.existsSync(LISTENING_TESTS_DIR)) {
        return [];
    }

    return fs.readdirSync(LISTENING_TESTS_DIR)
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
            try {
                return JSON.parse(fs.readFileSync(path.join(LISTENING_TESTS_DIR, file), "utf8"));
            } catch (error) {
                console.log(`Could not read ${file}:`, error.message);
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function summarizeManualListeningTest(test) {
    return {
        id: test.id,
        title: test.title,
        part: test.part,
        audio: test.audio || test.parts?.[0]?.audioUrl || "",
        questionCount: Number(test.questionCount) || listeningQuestionCount(test),
        createdAt: test.createdAt,
        openUrl: String(test.openUrl || ""),
        readOnly: Boolean(test.readOnly)
    };
}

function cleanText(text) {
    return String(text || "")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();
}

function getLineNumber(text, index) {
    return text.slice(0, index).split("\n").length;
}

function getSnippet(text, start, end) {
    return text
        .slice(start, end)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
}

function findReadingPassageMarkers(text) {
    const markers = [];
    const patterns = [
        /(?:^|\n)\s*((?:reading\s+)?passage\s*([123])\b[^\n]*)/gi,
        /(?:^|\n)\s*((?:section|part)\s*([123])\b[^\n]*)/gi
    ];

    patterns.forEach((pattern) => {
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const number = Number(match[2]);

            if (number >= 1 && number <= 3 && !markers.some((item) => item.number === number)) {
                markers.push({
                    number,
                    title: match[1].trim(),
                    index: match.index,
                    line: getLineNumber(text, match.index)
                });
            }
        }
    });

    return markers.sort((a, b) => a.index - b.index);
}

function findQuestionSections(text) {
    const sections = [];
    const pattern = /(?:^|\n)\s*((?:questions?|q)\s*(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})(?:[^\n]*)?)/gi;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        const startQuestion = Number(match[2]);
        const endQuestion = Number(match[3]);

        if (!Number.isFinite(startQuestion) || !Number.isFinite(endQuestion)) {
            continue;
        }

        sections.push({
            title: match[1].trim(),
            startQuestion,
            endQuestion,
            index: match.index,
            line: getLineNumber(text, match.index)
        });
    }

    return sections.sort((a, b) => a.index - b.index);
}

function removeMarkerLine(block, markerTitle) {
    const lines = block.split("\n");
    const markerIndex = lines.findIndex((line) => (
        line.trim().toLowerCase() === markerTitle.trim().toLowerCase()
    ));

    if (markerIndex >= 0) {
        lines.splice(markerIndex, 1);
    }

    return lines.join("\n").trim();
}

function isQuestionOverview(section, text) {
    const nextText = text.slice(section.index, section.index + 260).toLowerCase();

    return /based\s+on\s+reading\s+passage/.test(nextText) ||
        /reading\s+passage\s+\d\s+below/.test(nextText) ||
        /you\s+should\s+spend\s+about/.test(nextText);
}

function trimLeadingReadingInstructions(text) {
    return text
        .split("\n")
        .filter((line) => {
            const value = line.trim();

            if (!value) {
                return true;
            }

            return !/^you should spend about/i.test(value) &&
                !/^questions?\s+\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}.*reading passage/i.test(value) &&
                !/^questions?\s+\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}.*below/i.test(value);
        })
        .join("\n")
        .trim();
}

function isLikelyInstructionLine(line) {
    return /^questions?\s+\d/i.test(line) ||
        /^choose/i.test(line) ||
        /^complete/i.test(line) ||
        /^write/i.test(line) ||
        /^do the following/i.test(line) ||
        /^look at/i.test(line) ||
        /^which paragraph/i.test(line) ||
        /^true|false|not given$/i.test(line);
}

function splitTitleAndPassageText(text, fallbackTitle) {
    const lines = text.split("\n");
    const titleIndex = lines.findIndex((line) => {
        const value = line.trim();

        return value.length >= 3 &&
            value.length <= 120 &&
            !isLikelyInstructionLine(value);
    });

    if (titleIndex === -1) {
        return {
            passageTitle: fallbackTitle,
            passageText: text.trim()
        };
    }

    return {
        passageTitle: lines[titleIndex].trim(),
        passageText: lines
            .slice(titleIndex + 1)
            .join("\n")
            .trim()
    };
}

function parseQuestionItems(questionText) {
    const items = [];
    const pattern = /(?:^|\n)\s*(\d{1,2})[\).]?\s+([^\n]+(?:\n(?!\s*\d{1,2}[\).]?\s)[^\n]+)*)/g;
    let match;

    while ((match = pattern.exec(questionText)) !== null) {
        items.push({
            number: Number(match[1]),
            text: match[2].replace(/\s+/g, " ").trim()
        });
    }

    return items;
}

function parseQuestionSectionsForJson(blockText) {
    const sections = findQuestionSections(blockText)
        .filter((section) => !isQuestionOverview(section, blockText));

    return sections.map((section, index) => {
        const nextSection = sections[index + 1];
        const sectionStart = section.index;
        const sectionEnd = nextSection ? nextSection.index : blockText.length;
        const sectionText = blockText.slice(sectionStart, sectionEnd).trim();
        const instruction = sectionText
            .split("\n")
            .slice(1)
            .map((line) => line.trim())
            .find((line) => line && !/^\d{1,2}[\).]?\s/.test(line)) || "";

        return {
            sectionTitle: section.title,
            startQuestion: section.startQuestion,
            endQuestion: section.endQuestion,
            instruction,
            questionText: sectionText,
            items: parseQuestionItems(sectionText)
        };
    });
}

function parseReadingTextToJson(text) {
    const cleanedText = cleanText(text);
    const markers = findReadingPassageMarkers(cleanedText);

    if (!markers.length) {
        const parsedTitle = splitTitleAndPassageText(cleanedText, "Reading Passage");

        return [{
            passageTitle: parsedTitle.passageTitle,
            passageText: parsedTitle.passageText,
            questions: parseQuestionSectionsForJson(cleanedText)
        }];
    }

    return markers.map((marker, index) => {
        const nextMarker = markers[index + 1];
        const blockStart = marker.index;
        const blockEnd = nextMarker ? nextMarker.index : cleanedText.length;
        const block = cleanedText.slice(blockStart, blockEnd).trim();
        const blockWithoutMarker = removeMarkerLine(block, marker.title);
        const questionSections = findQuestionSections(blockWithoutMarker)
            .filter((section) => !isQuestionOverview(section, blockWithoutMarker));
        const firstQuestionSection = questionSections[0];
        const rawPassageText = firstQuestionSection
            ? blockWithoutMarker.slice(0, firstQuestionSection.index).trim()
            : blockWithoutMarker;
        const cleanPassageText = trimLeadingReadingInstructions(rawPassageText);
        const parsedTitle = splitTitleAndPassageText(cleanPassageText, marker.title);

        return {
            passageTitle: parsedTitle.passageTitle,
            passageText: parsedTitle.passageText,
            questions: parseQuestionSectionsForJson(blockWithoutMarker)
        };
    });
}

function writeReadingJson(parsedReading) {
    fs.writeFileSync(READING_JSON_FILE, JSON.stringify(parsedReading, null, 2), "utf8");
}

function detectReadingStructure(text) {
    const passageMarkers = findReadingPassageMarkers(text);
    const questionSections = findQuestionSections(text);

    const passages = passageMarkers.map((marker, index) => {
        const nextMarker = passageMarkers[index + 1];
        const start = marker.index;
        const end = nextMarker ? nextMarker.index : text.length;
        const passageQuestions = questionSections.filter((section) => (
            section.index >= start && section.index < end
        ));

        return {
            number: marker.number,
            title: marker.title,
            line: marker.line,
            startIndex: start,
            endIndex: end,
            characterCount: end - start,
            snippet: getSnippet(text, start, end),
            questionSections: passageQuestions.map((section) => ({
                title: section.title,
                startQuestion: section.startQuestion,
                endQuestion: section.endQuestion,
                line: section.line
            }))
        };
    });

    return {
        outputFile: OUTPUT_FILE,
        detectedPassages: passages.length,
        detectedQuestionSections: questionSections.length,
        passages,
        questionSections: questionSections.map((section) => ({
            title: section.title,
            startQuestion: section.startQuestion,
            endQuestion: section.endQuestion,
            line: section.line
        }))
    };
}

async function extractReadingPdf(filePath) {
    const data = await pdf(fs.readFileSync(filePath));
    const extractedText = cleanText(data.text);

    if (!extractedText) {
        const error = new Error("No selectable text was found in this PDF");
        error.statusCode = 400;
        throw error;
    }

    fs.writeFileSync(OUTPUT_FILE, extractedText, "utf8");
    const parsedReading = parseReadingTextToJson(extractedText);
    writeReadingJson(parsedReading);

    return {
        pageCount: data.numpages || null,
        text: extractedText,
        structure: detectReadingStructure(extractedText),
        parsedReading
    };
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

function getRecentManualTests(limit = 10) {
    const items = [];

    readManualReadingTests().forEach((test) => {
        items.push({
            id: test.id,
            title: test.title,
            type: "reading",
            part: test.part,
            questionCount: Array.isArray(test.questions) ? test.questions.length : 0,
            createdAt: test.createdAt,
            openUrl: `reading-template.html?id=${encodeURIComponent(test.id)}`,
            editUrl: "admin-reading.html"
        });
    });

    readManualListeningTests().forEach((test) => {
        items.push({
            id: test.id,
            title: test.title,
            type: "listening",
            part: test.part,
            questionCount: Number(test.questionCount) || listeningQuestionCount(test),
            createdAt: test.createdAt,
            openUrl: test.openUrl || `listening-template.html?id=${encodeURIComponent(test.id)}`,
            editUrl: test.readOnly ? "" : `admin-listening.html?id=${encodeURIComponent(test.id)}`
        });
    });

    fullTestStore.readAll().forEach((test) => {
        items.push({
            id: test.id,
            title: test.title,
            type: "full",
            part: "full",
            questionCount: fullTestStore.summarize(test).questionCount,
            createdAt: test.createdAt,
            openUrl: `full-test-player.html?id=${encodeURIComponent(test.id)}`,
            editUrl: "admin-import.html"
        });
    });

    return items
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
}

async function getAdminStats() {
    const readingTests = readManualReadingTests().length;
    const listeningTests = readManualListeningTests().length;
    const fullTests = fullTestStore.readAll().length;

    const users = await userStore.countUsers();

    return {
        users,
        readingTests,
        listeningTests,
        fullTests
    };
}

function getCookieValue(req, name) {
    const cookieHeader = req.headers.cookie || "";
    const target = `${name}=`;
    const cookie = cookieHeader
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith(target));

    if (!cookie) {
        return null;
    }

    try {
        return decodeURIComponent(cookie.slice(target.length));
    } catch {
        return cookie.slice(target.length);
    }
}

function getRequestAuthToken(req) {
    return getBearerToken(req) || getCookieValue(req, "ieltsmockAuthToken");
}

async function getRequestUser(req) {
    const payload = verifyAuthToken(getRequestAuthToken(req));

    if (!payload) {
        return null;
    }

    const user = await userStore.findUserById(payload.id);

    return user ? publicUser(user) : null;
}

async function requireUser(req, res, next) {
    try {
        const payload = verifyAuthToken(getRequestAuthToken(req));

        if (!payload) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const account = await userStore.findUserById(payload.id);

        if (!account) {
            return res.status(401).json({ error: "User not found" });
        }

        req.account = account;
        req.user = publicUser(account);
        next();
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Could not verify account" });
    }
}

async function requireAdmin(req, res, next) {
    try {
        const user = await getRequestUser(req);

        if (user?.role === "admin") {
            req.user = user;
            next();
            return;
        }

        const isHtmlRequest = req.method === "GET" && !req.path.startsWith("/api") && (req.accepts("html") || req.path.endsWith(".html"));

        if (isHtmlRequest) {
            res.redirect(user ? "/profile.html" : "/login.html");
            return;
        }

        res.status(user ? 403 : 401).json({
            error: user ? "Admin access required" : "Not authenticated"
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Could not verify admin access" });
    }
}

app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "ieltsmock.html"));
});

app.get("/admin", requireAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin.html"));
});

app.get("/admin-reading", requireAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-reading.html"));
});

app.get("/admin-listening", requireAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-listening.html"));
});

app.get("/admin-import", requireAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-import.html"));
});

app.get("/full-tests", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "full-tests.html"));
});

app.get("/full-test-player", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "full-test-player.html"));
});

app.get("/api/profile/progress", requireUser, (req, res) => {
    res.json(userProgressStore.getProgress(req.user.id, {
        accountCreatedAt: req.account.createdAt
    }));
});

app.post("/api/profile/results", requireUser, (req, res) => {
    try {
        const result = userProgressStore.recordResult(req.user.id, req.body || {});
        res.status(201).json({
            result,
            progress: userProgressStore.getProgress(req.user.id, {
                accountCreatedAt: req.account.createdAt
            })
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not save completed test"
        });
    }
});

app.put("/api/profile/preferences", requireUser, (req, res) => {
    try {
        const preferences = userProgressStore.updatePreferences(req.user.id, req.body || {});
        res.json({
            preferences,
            progress: userProgressStore.getProgress(req.user.id, {
                accountCreatedAt: req.account.createdAt
            })
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not update profile preferences"
        });
    }
});

function getReadingTestById(id) {
    const filePath = getReadingTestPath(id);

    if (!fs.existsSync(filePath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getListeningTestById(id) {
    const filePath = getListeningTestPath(id);

    if (!fs.existsSync(filePath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

registerFullTestRoutes(app, {
    requireAdmin,
    fullTestStore,
    uploadsRoot: UPLOAD_DIR,
    safeFileName,
    getReadingTestById,
    getListeningTestById
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "login.html"));
});

app.get("/signup", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "signup.html"));
});

app.post("/api/reading-tests", requireAdmin, (req, res) => {
    try {
        const test = buildManualReadingTest(req.body);
        saveManualReadingTest(test);

        res.status(201).json({
            message: "Reading test saved",
            test
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not save reading test"
        });
    }
});

app.get("/api/reading-tests", (req, res) => {
    const part = req.query.part ? normalizePart(req.query.part) : null;
    let tests = readManualReadingTests();

    if (part) {
        tests = tests.filter((test) => test.part === part);
    }

    res.json(tests.map(summarizeManualReadingTest));
});

app.get("/api/reading-tests/:id", (req, res) => {
    const filePath = getReadingTestPath(req.params.id);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Reading test not found" });
    }

    res.sendFile(filePath);
});

app.put("/api/reading-tests/:id", requireAdmin, (req, res) => {
    const filePath = getReadingTestPath(req.params.id);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Reading test not found" });
    }

    try {
        const existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const test = buildManualReadingTest({
            ...req.body,
            id: existing.id,
            createdAt: existing.createdAt
        });

        saveManualReadingTest(test);

        res.json({
            message: "Reading test updated",
            test
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not update reading test"
        });
    }
});

app.delete("/api/reading-tests/:id", requireAdmin, (req, res) => {
    const filePath = getReadingTestPath(req.params.id);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Reading test not found" });
    }

    fs.unlinkSync(filePath);

    res.json({ message: "Reading test deleted" });
});

app.post("/api/listening-assets/audio", requireAdmin, audioUpload.single("audio"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Choose an audio file" });
    }

    res.status(201).json({
        audioUrl: `/uploads/audio/${path.basename(req.file.path)}`,
        fileName: req.file.originalname
    });
});

app.post("/api/listening-assets/image", requireAdmin, listeningImageUpload.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Choose an image file" });
    }

    res.status(201).json({
        imageUrl: `/uploads/listening-images/${path.basename(req.file.path)}`,
        fileName: req.file.originalname
    });
});

app.post("/api/listening-tests", requireAdmin, audioUpload.single("audio"), (req, res) => {
    try {
        const test = buildManualListeningTest(req.body, req.file);
        saveManualListeningTest(test);
        const publishedParts = saveStructuredListeningParts(test);

        res.status(201).json({
            message: "Listening test saved",
            test,
            publishedParts: publishedParts.map(summarizeManualListeningTest)
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not save listening test"
        });
    }
});

app.get("/api/listening-tests", (req, res) => {
    const part = req.query.part ? normalizeListeningPart(req.query.part) : null;
    let tests = readManualListeningTests();

    if (part && part !== "full") {
        const partNumber = Number(part);
        const individualPartTests = tests.filter((test) => test.part === part);
        const publishedPartKeys = new Set(individualPartTests
            .filter((test) => test.sourceFullTestId)
            .map((test) => `${test.sourceFullTestId}:${test.part}`));
        const partViews = tests
            .filter((test) => test.part === "full" && Array.isArray(test.parts))
            .map((test) => {
                if (publishedPartKeys.has(`${test.id}:${partNumber}`)) {
                    return null;
                }

                const selectedPart = test.parts.find((item) => Number(item.partNumber) === partNumber);

                if (!selectedPart) {
                    return null;
                }

                return {
                    id: test.id,
                    title: `${test.title} - ${selectedPart.title || `Part ${partNumber}`}`,
                    part: partNumber,
                    audio: selectedPart.audioUrl || "",
                    questionCount: listeningQuestionCount({ parts: [selectedPart] }),
                    createdAt: test.createdAt,
                    openUrl: `listening-template.html?id=${encodeURIComponent(test.id)}&part=${partNumber}`
                };
            })
            .filter(Boolean);

        const individualTests = individualPartTests.map(summarizeManualListeningTest);

        return res.json([...partViews, ...individualTests]);
    }

    if (part === "full") {
        tests = tests.filter((test) => test.part === "full");
    }

    res.json(tests.map(summarizeManualListeningTest));
});

app.get("/api/listening-tests/:id", (req, res) => {
    const filePath = getListeningTestPath(req.params.id);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Listening test not found" });
    }

    res.sendFile(filePath);
});

app.put("/api/listening-tests/:id", requireAdmin, audioUpload.single("audio"), (req, res) => {
    const filePath = getListeningTestPath(req.params.id);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Listening test not found" });
    }

    try {
        const existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const test = buildManualListeningTest({
            ...req.body,
            id: existing.id,
            audio: existing.audio,
            createdAt: existing.createdAt
        }, req.file);

        saveManualListeningTest(test);
        const publishedParts = saveStructuredListeningParts(test);

        res.json({
            message: "Listening test updated",
            test,
            publishedParts: publishedParts.map(summarizeManualListeningTest)
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not update listening test"
        });
    }
});

app.delete("/api/listening-tests/:id", requireAdmin, (req, res) => {
    const filePath = getListeningTestPath(req.params.id);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Listening test not found" });
    }

    const existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const derivedTests = readManualListeningTests()
        .filter((test) => test.sourceFullTestId === req.params.id)
        .map((test) => getListeningTestPath(test.id))
        .filter((derivedPath) => fs.existsSync(derivedPath));
    const assetFiles = (Array.isArray(existing.assetFiles) ? existing.assetFiles : [])
        .map((fileName) => path.join(ROOT_DIR, path.basename(fileName)))
        .filter((assetPath) => fs.existsSync(assetPath));

    fs.unlinkSync(filePath);
    derivedTests.forEach((derivedPath) => fs.unlinkSync(derivedPath));
    assetFiles.forEach((assetPath) => fs.unlinkSync(assetPath));

    res.json({
        message: "Listening test deleted",
        deletedDerivedTests: derivedTests.length,
        deletedAssets: assetFiles.length
    });
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

app.delete("/api/tests/:id", requireAdmin, (req, res) => {
    const tests = readTests();
    const index = tests.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: "Test not found" });
    }

    tests.splice(index, 1);
    writeTests(tests);

    res.json({ message: "Test deleted" });
});

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
        const stats = await getAdminStats();
        res.json({
            users: stats.users,
            readingTests: stats.readingTests,
            listeningTests: stats.listeningTests,
            fullTests: stats.fullTests
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Could not load admin stats" });
    }
});

app.get("/api/admin/recent-tests", requireAdmin, (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
        res.json({ tests: getRecentManualTests(limit) });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Could not load recent tests" });
    }
});

app.post("/upload", requireAdmin, upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "PDF file is required" });
        }

        const result = await extractReadingPdf(req.file.path);

        res.json({
            message: "Reading PDF extracted successfully",
            outputFile: OUTPUT_FILE,
            jsonFile: READING_JSON_FILE,
            pageCount: result.pageCount,
            readingJson: result.parsedReading,
            passages: result.structure.passages,
            questionSections: result.structure.questionSections
        });
    } catch (error) {
        console.log(error);
        res.status(error.statusCode || 500).json({ error: "Upload failed" });
    }
});

app.get("/api/reading-json", (req, res) => {
    if (!fs.existsSync(READING_JSON_FILE)) {
        return res.status(404).json({ error: "reading.json has not been created yet" });
    }

    res.sendFile(READING_JSON_FILE);
});

function getBearerToken(req) {
    const header = req.headers.authorization || "";

    if (header.startsWith("Bearer ")) {
        return header.slice(7).trim();
    }

    return null;
}

app.post("/signup", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Username, email, and password are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        const existingUser = await userStore.findUserByEmail(email);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This email is already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await userStore.createUser({
            username,
            email,
            passwordHash: hashedPassword,
            role: isAdminEmail(email) ? "admin" : "student"
        });
        const token = createAuthToken(newUser);
        userProgressStore.recordAccountActivity(newUser._id || newUser.id, "Account created");

        res.status(201).json({
            success: true,
            message: "Account created successfully",
            user: publicUser(newUser),
            token
        });

        sendTelegramMessage(
            `🆕 New signup\n<b>${username}</b>\n${email}\nStorage: ${userStore.getStorageMode()}`
        ).catch(() => {});
    } catch (error) {
        console.log(error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Signup failed"
        });
    }
});

app.post("/login", async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const user = await userStore.findUserByEmail(email);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = createAuthToken(user);
        userProgressStore.recordAccountActivity(user._id || user.id, "Signed in");

        res.json({
            success: true,
            message: "Login successful",
            user: publicUser(user),
            token
        });
    } catch (error) {
        console.log(error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Login failed"
        });
    }
});

app.get("/api/auth/me", async (req, res) => {
    try {
        const token = getBearerToken(req);
        const payload = verifyAuthToken(token);

        if (!payload) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated"
            });
        }

        const user = await userStore.findUserById(payload.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            user: publicUser(user)
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Could not verify session"
        });
    }
});

app.post("/api/auth/logout", (req, res) => {
    res.json({ success: true, message: "Logged out" });
});

if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI, {
        dbName: process.env.MONGO_DB_NAME || "ieltsmock",
        serverSelectionTimeoutMS: 8000
    })
        .then(() => {
            console.log("MongoDB connected — using Atlas for accounts");
        })
        .catch((error) => {
            console.log("MongoDB connection error:", error.message);
            console.log("Using local file storage for accounts: data/users.json");
            console.log("Atlas fix: Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0/0) for development");
        });
} else {
    console.log("MONGO_URI is not set — using local file storage: data/users.json");
}

app.use([
    "/admin.html",
    "/admin-reading.html",
    "/admin-listening.html",
    "/admin-import.html"
], requireAdmin);

app.use(express.static(ROOT_DIR));

const PORT = process.env.PORT || 30004;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    if (process.env.BOT_TOKEN && process.env.ADMIN_ID) {
        sendTelegramMessage("✅ IELTS Mock server started").catch(() => {});
    }
});
