require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const User = require("./models/User");
const { createAuthToken, verifyAuthToken, publicUser, isAdminEmail } = require("./lib/auth");
const { createUserStore } = require("./lib/user-store");
const { sendTelegramMessage } = require("./lib/telegram");
const { createFullTestStore } = require("./lib/full-test-store");
const { registerFullTestRoutes } = require("./lib/full-test-routes");
const { createUserProgressStore } = require("./lib/user-progress-store");
const ManualTestParser = require("./lib/manual-test-parser");

let TranslateClient = null;
try {
    TranslateClient = require("@google-cloud/translate").v2.Translate;
} catch (error) {
    console.warn("Google Translate package is unavailable:", error.message);
}

const app = express();
app.disable("etag");

const ROOT_DIR = __dirname;
const IS_VERCEL = Boolean(process.env.VERCEL);
const RUNTIME_WRITE_DIR = IS_VERCEL ? path.join("/tmp", "ieltsx") : ROOT_DIR;
const BUNDLED_DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOAD_DIR = path.join(RUNTIME_WRITE_DIR, "uploads");
const DATA_DIR = IS_VERCEL ? path.join(RUNTIME_WRITE_DIR, "data") : BUNDLED_DATA_DIR;
const USERS_FILE = path.join(DATA_DIR, "users.json");
const userStore = createUserStore({ User, usersFile: USERS_FILE });
const USER_PROGRESS_FILE = path.join(DATA_DIR, "user-progress.json");
const userProgressStore = createUserProgressStore(USER_PROGRESS_FILE);
const TESTS_FILE = path.join(DATA_DIR, "tests.json");
const VOCABULARY_CACHE_FILE = path.join(DATA_DIR, "vocabulary-cache.json");
const READING_VOCABULARY_CLICKS_FILE = path.join(DATA_DIR, "reading-vocabulary-clicks.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "output.txt");
const READING_JSON_FILE = path.join(ROOT_DIR, "reading.json");
const READING_TESTS_DIR = path.join(DATA_DIR, "reading-tests");
const LISTENING_TESTS_DIR = path.join(DATA_DIR, "listening-tests");
const FULL_TESTS_DIR = path.join(DATA_DIR, "full-tests");
const AUDIO_UPLOAD_DIR = path.join(UPLOAD_DIR, "audio");
const LISTENING_IMAGE_UPLOAD_DIR = path.join(UPLOAD_DIR, "listening-images");
const VOCABULARY_DEFINITION_FALLBACK = "Definition is not available yet.";
const VOCABULARY_TRANSLATION_FALLBACK = "Uzbek translation is not available yet.";
const GOOGLE_TRANSLATE_API_KEY = String(
    process.env.GOOGLE_TRANSLATE_API_KEY ||
    process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY ||
    ""
).trim();
const GOOGLE_TRANSLATE_PROJECT_ID = String(
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_PROJECT_ID ||
    ""
).trim();
const GOOGLE_TRANSLATE_CLIENT_ENABLED = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_PROJECT_ID ||
    process.env.K_SERVICE ||
    process.env.GAE_SERVICE
);

let translateClient = null;
let translateConfigWarningShown = false;
const vocabularyLookupRequests = new Map();
let pdfParser = null;

function getPdfParser() {
    if (!pdfParser) {
        pdfParser = require("pdf-parse");
    }

    return pdfParser;
}

function ensureRuntimeDir(dirPath) {
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch (error) {
        console.warn(`Could not create runtime directory ${dirPath}:`, error.message);
    }
}

function bootstrapRuntimeDataDir() {
    if (!IS_VERCEL || !fs.existsSync(BUNDLED_DATA_DIR) || fs.existsSync(USERS_FILE)) {
        return;
    }

    try {
        fs.cpSync(BUNDLED_DATA_DIR, DATA_DIR, { recursive: true });
    } catch (error) {
        console.warn("Could not copy bundled data to runtime storage:", error.message);
    }
}

ensureRuntimeDir(UPLOAD_DIR);
ensureRuntimeDir(DATA_DIR);
bootstrapRuntimeDataDir();
ensureRuntimeDir(READING_TESTS_DIR);
ensureRuntimeDir(LISTENING_TESTS_DIR);
ensureRuntimeDir(FULL_TESTS_DIR);
ensureRuntimeDir(AUDIO_UPLOAD_DIR);
ensureRuntimeDir(LISTENING_IMAGE_UPLOAD_DIR);
ensureRuntimeDir(path.join(UPLOAD_DIR, "ielts-import"));

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

app.use((req, res, next) => {
    const path = req.path.toLowerCase();
    if (
        path.startsWith("/api/auth") || 
        path.startsWith("/api/profile") || 
        path === "/login" || 
        path === "/signup" || 
        path.startsWith("/auth/google")
    ) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
    }
    next();
});

app.use(async (req, res, next) => {
    try {
        const token = getRequestAuthToken(req);
        if (token) {
            const payload = verifyAuthToken(token);
            if (payload) {
                const user = await userStore.findUserById(payload.id);
                if (user) {
                    req.user = publicUser(user);
                    req.account = user;
                }
            }
        }
    } catch (error) {
        console.error("Auth middleware error:", error);
    }
    next();
});

// Clean route redirects for navigation pages
app.use((req, res, next) => {
    const path = req.path.toLowerCase();
    const redirects = {
        "/login.html": "/login",
        "/signup.html": "/signup",
        "/profile.html": "/dashboard",
        "/dashboard.html": "/dashboard",
        "/profile-settings.html": "/profile-settings",
        "/reading.html": "/reading",
        "/listening.html": "/listening",
        "/speaking.html": "/speaking",
        "/writing.html": "/writing",
        "/ieltsmock.html": "/",
        "/admin.html": "/admin",
        "/admin-users.html": "/admin/users",
        "/admin-reading.html": "/admin-reading",
        "/admin-listening.html": "/admin-listening",
        "/admin-import.html": "/admin-import",
        "/reading-tests.html": "/reading-tests",
        "/listening-tests.html": "/listening-tests",
        "/part1.html": "/reading/part1",
        "/part2.html": "/reading/part2",
        "/part3.html": "/reading/part3",
        "/fulltest.html": "/reading/fulltest",
        "/listeningpart1.html": "/listening/part1",
        "/listeningpart2.html": "/listening/part2",
        "/listeningpart3.html": "/listening/part3",
        "/listeningpart4.html": "/listening/part4",
        "/listeningfulltest.html": "/listening/fulltest",
        "/full-test-player.html": "/full-test-player"
    };

    if (redirects[path] && req.method === "GET") {
        return res.redirect(redirects[path]);
    }
    next();
});

function readTests() {
    if (!fs.existsSync(TESTS_FILE)) {
        return [];
    }

    try {
        return JSON.parse(fs.readFileSync(TESTS_FILE, "utf8"));
    } catch (error) {
        console.warn("Could not read tests.json:", error.message);
        return [];
    }
}

function writeTests(tests) {
    fs.writeFileSync(TESTS_FILE, JSON.stringify(tests, null, 2));
}

function readJsonArray(filePath) {
    if (!fs.existsSync(filePath)) {
        return [];
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(`Could not read ${path.basename(filePath)}:`, error.message);
        return [];
    }
}

function writeJsonArray(filePath, items) {
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf8");
}

function makeId(title) {
    const slug = String(title || "reading-test")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50) || "reading-test";

    return `${Date.now()}-${slug}`;
}

function slugify(value, fallback = "test") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        || fallback;
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

function normalizeVocabularyWord(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
        .replace(/'s$/i, "")
        .replace(/[^a-z0-9'-]/g, "");
}

function normalizeVocabularyList(vocabulary) {
    if (!Array.isArray(vocabulary)) {
        return [];
    }

    const seen = new Set();

    return vocabulary
        .map((entry) => {
            const word = String(entry?.word || "").trim();
            const normalized = normalizeVocabularyWord(word);

            if (!word || !normalized || seen.has(normalized)) {
                return null;
            }

            seen.add(normalized);

            return {
                id: entry.id || `${Date.now()}-${normalized}`,
                word,
                normalized,
                phonetic: String(entry.phonetic || "").trim(),
                partOfSpeech: String(entry.partOfSpeech || entry.part_of_speech || "").trim(),
                definition: String(entry.definition || entry.englishDefinition || "").trim(),
                uzbekTranslation: String(entry.uzbekTranslation || entry.translation || "").trim(),
                example: String(entry.example || entry.exampleSentence || "").trim(),
                source: "manual"
            };
        })
        .filter(Boolean);
}

function vocabularyCandidates(value) {
    const normalized = normalizeVocabularyWord(value);
    const candidates = [normalized];

    if (normalized.endsWith("ies") && normalized.length > 3) {
        candidates.push(`${normalized.slice(0, -3)}y`);
    }

    if (normalized.endsWith("ves") && normalized.length > 3) {
        candidates.push(`${normalized.slice(0, -3)}f`, `${normalized.slice(0, -3)}fe`);
    }

    if (normalized.endsWith("es") && normalized.length > 2) {
        candidates.push(normalized.slice(0, -2));
    }

    if (normalized.endsWith("s") && normalized.length > 1) {
        candidates.push(normalized.slice(0, -1));
    }

    return [...new Set(candidates.filter(Boolean))];
}

function normalizeVocabularyRecord(record) {
    const word = String(record?.word || "").trim();
    const normalized = normalizeVocabularyWord(record?.normalized_word || record?.normalized || word);

    if (!word || !normalized) {
        return null;
    }

    return {
        id: record.id || `${Date.now()}-${normalized}`,
        word,
        normalized_word: normalized,
        phonetic: String(record.phonetic || "").trim(),
        part_of_speech: String(record.part_of_speech || record.partOfSpeech || "").trim(),
        english_definition: String(record.english_definition || record.definition || record.englishDefinition || "").trim() || VOCABULARY_DEFINITION_FALLBACK,
        uzbek_translation: String(record.uzbek_translation || record.uzbekTranslation || record.translation || "").trim() || VOCABULARY_TRANSLATION_FALLBACK,
        example_sentence: String(record.example_sentence || record.example || record.exampleSentence || "").trim(),
        source: String(record.source || "api_generated").trim(),
        passage_id: record.passage_id || record.passageId || null,
        created_at: record.created_at || record.createdAt || new Date().toISOString(),
        updated_at: record.updated_at || record.updatedAt || new Date().toISOString()
    };
}

function readVocabularyCache() {
    return readJsonArray(VOCABULARY_CACHE_FILE)
        .map(normalizeVocabularyRecord)
        .filter(Boolean);
}

function writeVocabularyCache(records) {
    writeJsonArray(VOCABULARY_CACHE_FILE, records.map(normalizeVocabularyRecord).filter(Boolean));
}

function vocabularyResponse(record, requestedWord) {
    const normalized = normalizeVocabularyRecord({
        ...record,
        word: record?.word || requestedWord
    });

    return {
        id: normalized.id,
        word: normalized.word,
        normalized: normalized.normalized_word,
        normalized_word: normalized.normalized_word,
        phonetic: normalized.phonetic,
        partOfSpeech: normalized.part_of_speech,
        part_of_speech: normalized.part_of_speech,
        definition: normalized.english_definition,
        english_definition: normalized.english_definition,
        uzbekTranslation: normalized.uzbek_translation,
        uzbek_translation: normalized.uzbek_translation,
        example: normalized.example_sentence,
        example_sentence: normalized.example_sentence,
        source: normalized.source,
        passageId: normalized.passage_id,
        passage_id: normalized.passage_id
    };
}

function manualVocabularyRecord(entry, test, passageId) {
    return normalizeVocabularyRecord({
        id: entry.id,
        word: entry.word,
        normalized_word: entry.normalized,
        phonetic: entry.phonetic,
        part_of_speech: entry.partOfSpeech,
        english_definition: entry.definition || VOCABULARY_DEFINITION_FALLBACK,
        uzbek_translation: entry.uzbekTranslation || VOCABULARY_TRANSLATION_FALLBACK,
        example_sentence: entry.example,
        source: "manual",
        passage_id: passageId || `${test.id}-passage-${test.part || 1}`,
        created_at: test.createdAt,
        updated_at: new Date().toISOString()
    });
}

function findManualVocabulary(test, candidates, passageId) {
    const entries = normalizeVocabularyList(test?.vocabulary || []);

    for (const candidate of candidates) {
        const entry = entries.find((item) => item.normalized === candidate);
        if (entry) {
            return manualVocabularyRecord(entry, test, passageId);
        }
    }

    return null;
}

function findCachedVocabulary(candidates) {
    const records = readVocabularyCache();

    for (const candidate of candidates) {
        const record = records.find((item) => item.normalized_word === candidate);
        if (record) {
            return record;
        }
    }

    return null;
}

function upsertVocabularyCache(record) {
    const normalized = normalizeVocabularyRecord(record);
    if (!normalized) {
        return null;
    }

    const records = readVocabularyCache();
    const index = records.findIndex((item) => item.normalized_word === normalized.normalized_word);

    if (index === -1) {
        records.push(normalized);
    } else if (records[index].source !== "manual") {
        records[index] = {
            ...records[index],
            ...normalized,
            created_at: records[index].created_at,
            updated_at: new Date().toISOString()
        };
    }

    writeVocabularyCache(records);
    return index === -1 ? normalized : records[Math.max(index, 0)];
}

function dictionaryDefinitionFromEntries(entries, requestedWord) {
    const entry = Array.isArray(entries) ? entries[0] : null;
    const meanings = Array.isArray(entry?.meanings) ? entry.meanings : [];
    const bestMeaning = meanings.find((meaning) => meaning?.definitions?.length) || meanings[0] || {};
    const definitions = Array.isArray(bestMeaning.definitions) ? bestMeaning.definitions : [];
    const bestDefinition = definitions.find((item) => item?.definition) || {};
    const phonetic = entry?.phonetic || (entry?.phonetics || []).find((item) => item?.text)?.text || "";

    return {
        word: entry?.word || requestedWord,
        phonetic,
        part_of_speech: bestMeaning.partOfSpeech || "",
        english_definition: bestDefinition.definition || VOCABULARY_DEFINITION_FALLBACK,
        example_sentence: bestDefinition.example || ""
    };
}

async function fetchDictionaryVocabulary(candidate, requestedWord) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(candidate)}`, {
            signal: controller.signal
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return dictionaryDefinitionFromEntries(data, requestedWord);
    } catch (error) {
        console.warn("Free Dictionary lookup failed:", error.message);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function decodeHtmlEntities(value) {
    return String(value || "")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

async function translateToUzbekWithApiKey(value) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(GOOGLE_TRANSLATE_API_KEY)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                q: value,
                target: "uz",
                format: "text"
            }),
            signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data?.error?.message || `Google Translate API returned ${response.status}`);
        }

        const translation = data?.data?.translations?.[0]?.translatedText;
        return decodeHtmlEntities(translation).trim();
    } finally {
        clearTimeout(timeout);
    }
}

async function translateToUzbekSimple(value) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const params = new URLSearchParams({
        client: "gtx",
        sl: "en",
        tl: "uz",
        dt: "t",
        q: value
    });

    try {
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`, {
            signal: controller.signal
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(`Simple translate returned ${response.status}`);
        }

        const translation = Array.isArray(data?.[0])
            ? data[0].map((part) => Array.isArray(part) ? part[0] : "").join("")
            : "";

        return decodeHtmlEntities(translation).trim();
    } finally {
        clearTimeout(timeout);
    }
}

function getTranslateClient() {
    if (!TranslateClient || !GOOGLE_TRANSLATE_CLIENT_ENABLED) {
        return null;
    }

    if (!translateClient) {
        translateClient = new TranslateClient(
            GOOGLE_TRANSLATE_PROJECT_ID ? { projectId: GOOGLE_TRANSLATE_PROJECT_ID } : undefined
        );
    }

    return translateClient;
}

async function translateToUzbek(text) {
    const value = String(text || "").trim();

    if (!value) {
        return VOCABULARY_TRANSLATION_FALLBACK;
    }

    const errors = [];

    if (GOOGLE_TRANSLATE_API_KEY) {
        try {
            return await translateToUzbekWithApiKey(value) || VOCABULARY_TRANSLATION_FALLBACK;
        } catch (error) {
            errors.push(`API key: ${error.message}`);
        }
    }

    try {
        const client = getTranslateClient();

        if (client) {
            const [translation] = await client.translate(value, "uz");
            return decodeHtmlEntities(translation).trim() || VOCABULARY_TRANSLATION_FALLBACK;
        }
    } catch (error) {
        errors.push(`client: ${error.message}`);
    }

    try {
        return await translateToUzbekSimple(value) || VOCABULARY_TRANSLATION_FALLBACK;
    } catch (error) {
        errors.push(`simple: ${error.message}`);
    }

    if (errors.length) {
        console.warn("Google Translate lookup failed:", errors.join(" | "));
    } else if (!translateConfigWarningShown) {
        console.info("Google Translate lookup skipped: set GOOGLE_TRANSLATE_API_KEY or Google Cloud credentials.");
        translateConfigWarningShown = true;
    }

    return VOCABULARY_TRANSLATION_FALLBACK;
}

async function refreshFallbackTranslation(record, requestedWord) {
    const normalized = normalizeVocabularyRecord(record);

    if (!normalized || normalized.uzbek_translation !== VOCABULARY_TRANSLATION_FALLBACK) {
        return record;
    }

    const translation = await translateToUzbek(requestedWord || normalized.word || normalized.normalized_word);

    if (!translation || translation === VOCABULARY_TRANSLATION_FALLBACK) {
        return record;
    }

    return upsertVocabularyCache({
        ...normalized,
        uzbek_translation: translation,
        updated_at: new Date().toISOString()
    });
}

async function generateVocabularyRecord(normalized, requestedWord, passageId) {
    const candidates = vocabularyCandidates(normalized);
    let dictionary = null;
    let dictionaryCandidate = normalized;

    for (const candidate of candidates) {
        dictionary = await fetchDictionaryVocabulary(candidate, requestedWord);
        if (dictionary?.english_definition && dictionary.english_definition !== VOCABULARY_DEFINITION_FALLBACK) {
            dictionaryCandidate = candidate;
            break;
        }
    }

    const now = new Date().toISOString();
    const translation = await translateToUzbek(requestedWord || dictionary?.word || normalized);

    return normalizeVocabularyRecord({
        id: `${Date.now()}-${dictionaryCandidate}-${Math.random().toString(16).slice(2, 8)}`,
        word: dictionary?.word || requestedWord || normalized,
        normalized_word: dictionaryCandidate,
        phonetic: dictionary?.phonetic || "",
        part_of_speech: dictionary?.part_of_speech || "",
        english_definition: dictionary?.english_definition || VOCABULARY_DEFINITION_FALLBACK,
        uzbek_translation: translation,
        example_sentence: dictionary?.example_sentence || "",
        source: "api_generated",
        passage_id: passageId || null,
        created_at: now,
        updated_at: now
    });
}

function fullReadingPassageMatches(fullTest, passage, passageId) {
    if (!fullTest || !passageId) {
        return false;
    }

    const passageNumber = passage?.number || 1;
    const candidates = [
        passage?.id,
        `${fullTest.id}-passage-${passageNumber}`,
        `${fullTest.id}-reading-p${passageNumber}`,
        `${fullTest.id}-p${passageNumber}`
    ].filter(Boolean);

    return candidates.includes(passageId);
}

function fullReadingTestVocabularyContext(fullTest, passageId) {
    const passages = fullTest?.reading?.passages || [];
    if (!passages.length) {
        return null;
    }

    const passage = passageId
        ? passages.find((item) => fullReadingPassageMatches(fullTest, item, passageId))
        : passages[0];

    if (!passage) {
        return null;
    }

    return {
        id: fullTest.id,
        title: fullTest.title,
        part: passage.number || 1,
        vocabulary: [
            ...(Array.isArray(fullTest.vocabulary) ? fullTest.vocabulary : []),
            ...(Array.isArray(passage.vocabulary) ? passage.vocabulary : [])
        ],
        createdAt: fullTest.createdAt
    };
}

function findReadingTestForVocabulary(testId, passageId) {
    let test = testId ? getReadingTestById(testId) : null;

    if (!test && passageId) {
        test = readManualReadingTests().find((item) =>
            passageId === item.id || String(passageId).startsWith(`${item.id}-passage-`)
        );
    }

    if (test && test.part !== "full") {
        return test;
    }

    const fullTest = testId ? fullTestStore.read(testId) : null;
    const fullContext = fullReadingTestVocabularyContext(fullTest, passageId);
    if (fullContext) {
        return fullContext;
    }

    if (passageId) {
        const matchedFullTest = fullTestStore.readAll().find((item) =>
            (item.reading?.passages || []).some((passage) => fullReadingPassageMatches(item, passage, passageId))
        );

        return fullReadingTestVocabularyContext(matchedFullTest, passageId);
    }

    if (!test || test.part === "full") {
        return null;
    }

    return test;
}

function saveClickedVocabulary({ attemptId, passageId, record, requestedWord }) {
    const normalized = normalizeVocabularyRecord(record);
    const attempt = String(attemptId || "").trim();

    if (!attempt || !normalized) {
        return false;
    }

    const clicks = readJsonArray(READING_VOCABULARY_CLICKS_FILE);
    const alreadySaved = clicks.some((item) => (
        item.attempt_id === attempt &&
        item.passage_id === passageId &&
        item.normalized_word === normalized.normalized_word
    ));

    if (alreadySaved) {
        return false;
    }

    clicks.push({
        id: `${Date.now()}-${normalized.normalized_word}-${Math.random().toString(16).slice(2, 8)}`,
        attempt_id: attempt,
        passage_id: passageId,
        word: requestedWord || normalized.word,
        normalized_word: normalized.normalized_word,
        english_definition: normalized.english_definition,
        uzbek_translation: normalized.uzbek_translation,
        example_sentence: normalized.example_sentence,
        clicked_at: new Date().toISOString()
    });

    writeJsonArray(READING_VOCABULARY_CLICKS_FILE, clicks);
    return true;
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

function answerValue(...values) {
    for (const value of values) {
        if (Array.isArray(value)) {
            const joined = value.map(String).map((item) => item.trim()).filter(Boolean).join(" | ");
            if (joined) return joined;
            continue;
        }

        if (value !== undefined && value !== null) {
            const normalized = String(value).trim();
            if (normalized) return normalized;
        }
    }

    return "";
}

function hasQuestionInput(rawQuestion) {
    if (!rawQuestion || typeof rawQuestion !== "object") {
        return false;
    }

    return [
        rawQuestion.number,
        rawQuestion.type,
        rawQuestion.question,
        rawQuestion.questionText,
        rawQuestion.text,
        rawQuestion.prompt,
        rawQuestion.answer,
        rawQuestion.correctAnswer,
        rawQuestion.correct_answer,
        rawQuestion.correct,
        rawQuestion.answers
    ].some((value) => {
        if (Array.isArray(value)) return value.some((item) => String(item || "").trim());
        return String(value || "").trim();
    });
}

function optionsForType(type, options) {
    if (type === "true_false_not_given") {
        return ["TRUE", "FALSE", "NOT GIVEN"];
    }

    if (type === "yes_no_not_given") {
        return ["YES", "NO", "NOT GIVEN"];
    }

    if (["multiple_choice", "multi_select", "matching_headings", "matching_information", "matching_features", "matching_sentence_endings", "diagram_labeling"].includes(type)) {
        return parseOptionText(options);
    }

    if (Array.isArray(options)) {
        return options.map((item) => {
            if (item && typeof item === "object") return item;
            return String(item).trim();
        }).filter(Boolean);
    }

    return parseOptionText(options);
}

function normalizeQuestion(rawQuestion, answers) {
    const number = Number(rawQuestion.number);
    const type = String(rawQuestion.type || "sentence_completion")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    const question = String(rawQuestion.question || rawQuestion.questionText || rawQuestion.text || rawQuestion.prompt || "").trim();
    const answerFromMap = answers[String(number)];
    const answer = answerValue(
        rawQuestion.answer,
        rawQuestion.correctAnswer,
        rawQuestion.correct_answer,
        rawQuestion.correct,
        rawQuestion.answers,
        answerFromMap
    );

    return {
        number,
        type,
        question,
        options: optionsForType(type, rawQuestion.options || rawQuestion.choices),
        answer
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

function validateManualReadingText(questionText, answerText, part) {
    if (!questionText || !questionText.trim()) {
        throw new Error("Questions text is required.");
    }

    const answers = ManualTestParser.parseAnswerLines(answerText);
    const lines = questionText.split(/\n/);
    const seenNumbers = new Set();
    const partNumberStr = part === "full" ? "Full Test" : `Passage ${part}`;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Skip headers
        if (/^(group|section)\b/i.test(line) || /^#\s*questions\b/i.test(line) || (/^questions\s+\d/i.test(line) && !/^\d+\s*\|/.test(line))) {
            continue;
        }

        if (/^\d{1,2}\s*\|/.test(line)) {
            const parts = line.split("|").map(item => item.trim());
            const numStr = parts[0];
            const number = Number(numStr);
            
            if (!Number.isFinite(number)) {
                throw new Error(`[${partNumberStr}] Line ${i + 1}: Question number '${numStr}' is invalid.`);
            }

            if (seenNumbers.has(number)) {
                throw new Error(`[${partNumberStr}] Question ${number} is duplicated.`);
            }
            seenNumbers.add(number);

            const rawType = parts[1];
            if (!rawType) {
                throw new Error(`[${partNumberStr}] Question ${number} is missing a question type.`);
            }

            const allowedReadingTypes = [
                "true_false_not_given",
                "yes_no_not_given",
                "multiple_choice",
                "multi_select",
                "summary_completion",
                "sentence_completion",
                "matching_headings",
                "matching_information",
                "diagram_labeling",
                "diagram_labelling",
                "short_answer",
                "table_completion",
                "notes_completion",
                "note_completion",
                "form_completion"
            ];
            const normalizedType = ManualTestParser.normalizeType(rawType, "reading");
            if (!allowedReadingTypes.includes(normalizedType)) {
                throw new Error(`[${partNumberStr}] Question ${number} has unsupported question type '${rawType}'.`);
            }

            const questionTextVal = parts[2];
            if (!questionTextVal) {
                throw new Error(`[${partNumberStr}] Question ${number} has empty question text.`);
            }

            const needsOptionsList = [
                "multiple_choice",
                "multi_select",
                "matching_headings",
                "matching_information",
                "matching",
                "map_labeling",
                "map_labelling",
                "diagram_labeling",
                "diagram_labelling"
            ];
            const needsOpt = needsOptionsList.includes(normalizedType);
            let answer = "";
            if (parts.length >= 5) {
                answer = parts[4];
            } else if (parts.length === 4) {
                if (!needsOpt) {
                    answer = parts[3];
                }
            }

            if (!answer) {
                answer = answers[String(number)];
            }

            if (!answer || !answer.trim()) {
                throw new Error(`[${partNumberStr}] Question ${number} must have a correct answer.`);
            }
        }
    }

    if (seenNumbers.size === 0) {
        throw new Error(`[${partNumberStr}] Add at least one Reading question.`);
    }
}

function validateManualListeningText(questionText, answerText, part) {
    if (!questionText || !questionText.trim()) {
        throw new Error("Questions text is required.");
    }

    const answers = ManualTestParser.parseAnswerLines(answerText);
    const lines = questionText.split(/\n/);
    const seenNumbers = new Set();
    const partNumberStr = part === "full" ? "Full Test" : `Part ${part}`;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (/^section\b/i.test(line) || /^#\s*questions\b/i.test(line) || /^questions\s+\d/i.test(line)) {
            continue;
        }

        if (/^\d{1,2}\s*\|/.test(line)) {
            const parts = line.split("|").map(item => item.trim());
            const numStr = parts[0];
            const number = Number(numStr);

            if (!Number.isFinite(number)) {
                throw new Error(`[${partNumberStr}] Line ${i + 1}: Question number '${numStr}' is invalid.`);
            }

            if (seenNumbers.has(number)) {
                throw new Error(`[${partNumberStr}] Question ${number} is duplicated.`);
            }
            seenNumbers.add(number);

            const rawType = parts[1];
            if (!rawType) {
                throw new Error(`[${partNumberStr}] Question ${number} is missing a question type.`);
            }

            const allowedListeningTypes = [
                "form_completion",
                "notes_completion",
                "note_completion",
                "multiple_choice",
                "map_labeling",
                "map_labelling",
                "matching",
                "sentence_completion",
                "diagram_labeling",
                "diagram_labelling",
                "table_completion",
                "short_answer",
                "multiple_select",
                "sentence_completion_inline"
            ];
            const normalizedType = ManualTestParser.normalizeType(rawType, "listening");
            if (!allowedListeningTypes.includes(normalizedType)) {
                throw new Error(`[${partNumberStr}] Question ${number} has unsupported question type '${rawType}'.`);
            }

            const questionTextVal = parts[2];
            if (!questionTextVal) {
                throw new Error(`[${partNumberStr}] Question ${number} has empty question text.`);
            }

            const needsOptionsList = [
                "multiple_choice",
                "multi_select",
                "matching_headings",
                "matching_information",
                "matching",
                "map_labeling",
                "map_labelling",
                "diagram_labeling",
                "diagram_labelling"
            ];
            const needsOpt = needsOptionsList.includes(normalizedType);
            let answer = "";
            if (parts.length >= 5) {
                answer = parts[4];
            } else if (parts.length === 4) {
                if (!needsOpt) {
                    answer = parts[3];
                }
            }

            if (!answer) {
                answer = answers[String(number)];
            }

            if (!answer || !answer.trim()) {
                throw new Error(`[${partNumberStr}] Question ${number} must have a correct answer.`);
            }
        }
    }

    if (seenNumbers.size === 0) {
        throw new Error(`[${partNumberStr}] Add at least one Listening question.`);
    }
}

function buildManualReadingTest(body) {
    const part = normalizePart(body.part);
    let title = String(body.title || "").trim();
    if (part === "full") {
        const existingCount = readManualReadingTests().filter(t => t.part === "full").length;
        title = `Test ${existingCount + 1}`;
    }

    if (!title) {
        const error = new Error("Test title is required");
        error.statusCode = 400;
        throw error;
    }

    const passage = String(body.passage || body.passageText || "").trim();
    const passageTitle = String(body.passageTitle || body.passage_title || "").trim();

    if (part !== "full" && ![1, 2, 3].includes(Number(part))) {
        const error = new Error("Invalid part. Must be 1, 2, 3 or full.");
        error.statusCode = 400;
        throw error;
    }

    if (!passage) {
        const error = new Error("Passage text is required");
        error.statusCode = 400;
        throw error;
    }

    // Run strong manual text validator!
    try {
        if (Array.isArray(body.questions)) {
            const answers = parseAnswerLines(body.answerText || body.answersText || "");
            const rawQuestions = body.questions.filter(hasQuestionInput);
            const seenNumbers = new Set();
            const partNumberStr = part === "full" ? "Full Test" : `Passage ${part}`;
            
            rawQuestions.forEach((q) => {
                const number = Number(q.number);
                if (!Number.isFinite(number)) {
                    throw new Error(`[${partNumberStr}] Question number is invalid.`);
                }
                if (seenNumbers.has(number)) {
                    throw new Error(`[${partNumberStr}] Question ${number} is duplicated.`);
                }
                seenNumbers.add(number);

                const normalizedType = ManualTestParser.normalizeType(q.type, "reading");
                const isCompletion = [
                    "summary_completion",
                    "notes_completion",
                    "sentence_completion",
                    "table_completion",
                    "form_completion"
                ].includes(normalizedType);

                if (!q.question && !isCompletion) {
                    throw new Error(`[${partNumberStr}] Question ${number} has empty question text.`);
                }

                const allowedReadingTypes = [
                    "true_false_not_given",
                    "yes_no_not_given",
                    "multiple_choice",
                    "multi_select",
                    "summary_completion",
                    "sentence_completion",
                    "matching_headings",
                    "matching_information",
                    "diagram_labeling",
                    "diagram_labelling",
                    "short_answer",
                    "table_completion",
                    "notes_completion",
                    "note_completion",
                    "form_completion"
                ];
                if (!allowedReadingTypes.includes(ManualTestParser.normalizeType(q.type, "reading"))) {
                    throw new Error(`[${partNumberStr}] Question ${number} has unsupported question type '${q.type}'.`);
                }

                const ans = q.answer || answers[String(number)];
                if (!ans || !ans.trim()) {
                    throw new Error(`[${partNumberStr}] Question ${number} must have a correct answer.`);
                }
            });
            if (seenNumbers.size === 0) {
                throw new Error(`[${partNumberStr}] Add at least one Reading question.`);
            }
        } else {
            validateManualReadingText(
                body.questionText || "",
                body.answerText || body.answersText || "",
                part
            );
        }
    } catch (e) {
        const error = new Error(e.message);
        error.statusCode = 400;
        throw error;
    }

    let questions = [];
    let questionGroups = Array.isArray(body.questionGroups) ? body.questionGroups : [];
    let submittedQuestionCount = 0;

    if (Array.isArray(body.questions)) {
        const answers = parseAnswerLines(body.answerText || body.answersText || "");
        const rawQuestions = body.questions.filter(hasQuestionInput);
        submittedQuestionCount = rawQuestions.length;
        questions = rawQuestions.map((question) => normalizeQuestion(question, answers));
    } else {
        const parsed = ManualTestParser.parseStructuredContent(
            body.questionText || "",
            body.answerText || body.answersText || "",
            "reading"
        );
        submittedQuestionCount = parsed.questions.length;
        questions = parsed.questions;
        questionGroups = parsed.groups;
    }

    const validQuestions = questions
        .filter((question) => {
            const normalizedType = ManualTestParser.normalizeType(question.type, "reading");
            const isCompletion = [
                "summary_completion",
                "notes_completion",
                "sentence_completion",
                "table_completion",
                "form_completion"
            ].includes(normalizedType);

            return (
                Number.isFinite(question.number) &&
                (question.question || isCompletion) &&
                question.type &&
                question.answer
            );
        })
        .sort((a, b) => a.number - b.number);

    questions = validQuestions;

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
        part,
        passage,
        passageText: passage,
        passageTitle,
        questionGroups,
        questions,
        vocabulary: part === "full" ? [] : normalizeVocabularyList(body.vocabulary),
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
                console.warn(`Could not read ${file}:`, error.message);
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
        subtitle: test.subtitle || (test.part === "full" ? "Reading full test" : "Academic Reading practice"),
        part: test.part,
        questionCount: test.questions.length,
        vocabularyCount: Array.isArray(test.vocabulary) ? test.vocabulary.length : 0,
        createdAt: test.createdAt,
        slug: publicSlugForTest("reading", "reading", test),
        openUrl: publicTestUrl("reading", "reading", test)
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

function listeningDurationForPart(part) {
    return normalizeListeningPart(part) === "full" ? 40 : 10;
}

function listeningQuestionCount(test) {
    if (Array.isArray(test.questions)) {
        return test.questions.length;
    }

    return collectStructuredListeningNumbers(test.parts || []).length;
}

function collectStructuredListeningNumbers(value) {
    const numbers = new Set();

    function inspect(item, key) {
        if (key === "questionNumber" && Number.isFinite(Number(item))) {
            const number = Number(item);
            if (number >= 1 && number <= 40) {
                numbers.add(number);
            }
        }

        if (typeof item === "string") {
            for (const match of item.matchAll(/\{\{(\d{1,2})\}\}/g)) {
                const number = Number(match[1]);
                if (number >= 1 && number <= 40) {
                    numbers.add(number);
                }
            }
            return;
        }

        if (Array.isArray(item)) {
            item.forEach((child) => inspect(child, ""));
            return;
        }

        if (item && typeof item === "object") {
            Object.entries(item).forEach(([childKey, childValue]) => inspect(childValue, childKey));
        }
    }

    inspect(value, "");
    return [...numbers].sort((a, b) => a - b);
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
    const requestedPart = source.part !== undefined
        ? normalizeListeningPart(source.part)
        : "full";
    const duration = listeningDurationForPart(requestedPart);

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

    if (requestedPart === "full" && savedParts.length !== 4) {
        const error = new Error("Full Listening Test requires Part 1, Part 2, Part 3, and Part 4");
        error.statusCode = 400;
        throw error;
    }

    savedParts.forEach(validateStructuredListeningPart);
    const questions = savedParts.flatMap(structuredListeningQuestionsForPart);

    return {
        id: source.id || makeId(title),
        title,
        duration,
        part: requestedPart,
        audio: savedParts[0]?.audioUrl || "",
        assetFiles: savedParts
            .map((part) => part.audioUrl)
            .filter((audioUrl) => String(audioUrl || "").startsWith("/uploads/")),
        parts: savedParts,
        questions,
        sections: savedParts.map((part) => ({
            title: part.questionRange || part.title || `Part ${part.partNumber}`,
            instruction: part.instruction || "",
            rule: "",
            questionNumbers: structuredListeningQuestionsForPart(part).map((question) => question.number)
        })),
        createdAt: source.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function normalizeListeningType(type) {
    const value = String(type || "sentence_completion").trim().toLowerCase();

    return ManualTestParser.LISTENING_TYPES.includes(value) ? value : "sentence_completion";
}

function optionsForListeningType(type, options) {
    if (Array.isArray(options)) {
        return options.map((item) => {
            if (item && typeof item === "object") return item;
            return String(item).trim();
        }).filter(Boolean);
    }

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

    const part = normalizeListeningPart(body.part);
    let title = String(body.title || "").trim();
    if (part === "full") {
        const existingCount = readManualListeningTests().filter(t => t.part === "full").length;
        title = `Test ${existingCount + 1}`;
    }

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

    if (part !== "full" && ![1, 2, 3, 4].includes(Number(part))) {
        const error = new Error("Invalid part. Must be 1, 2, 3, 4 or full.");
        error.statusCode = 400;
        throw error;
    }

    // Run strong manual text validator!
    try {
        if (Array.isArray(body.questions)) {
            const answers = parseAnswerLines(body.answerText || body.answersText || "");
            const rawQuestions = body.questions.filter(hasQuestionInput);
            const seenNumbers = new Set();
            const partNumberStr = part === "full" ? "Full Test" : `Part ${part}`;
            
            rawQuestions.forEach((q) => {
                const number = Number(q.number);
                if (!Number.isFinite(number)) {
                    throw new Error(`[${partNumberStr}] Question number is invalid.`);
                }
                if (seenNumbers.has(number)) {
                    throw new Error(`[${partNumberStr}] Question ${number} is duplicated.`);
                }
                seenNumbers.add(number);

                const normalizedType = ManualTestParser.normalizeType(q.type, "listening");
                const isCompletion = [
                    "form_completion",
                    "notes_completion",
                    "note_completion",
                    "sentence_completion",
                    "table_completion",
                    "flowchart_completion",
                    "flow_chart_completion",
                    "sentence_completion_inline"
                ].includes(normalizedType);

                if (!q.question && !isCompletion) {
                    throw new Error(`[${partNumberStr}] Question ${number} has empty question text.`);
                }

                const allowedListeningTypes = [
                    "form_completion",
                    "notes_completion",
                    "note_completion",
                    "multiple_choice",
                    "map_labeling",
                    "map_labelling",
                    "matching",
                    "sentence_completion",
                    "diagram_labeling",
                    "diagram_labelling",
                    "table_completion",
                    "short_answer",
                    "multiple_select",
                    "sentence_completion_inline"
                ];
                if (!allowedListeningTypes.includes(ManualTestParser.normalizeType(q.type, "listening"))) {
                    throw new Error(`[${partNumberStr}] Question ${number} has unsupported question type '${q.type}'.`);
                }

                const ans = q.answer || answers[String(number)];
                if (!ans || !ans.trim()) {
                    throw new Error(`[${partNumberStr}] Question ${number} must have a correct answer.`);
                }
            });
            if (seenNumbers.size === 0) {
                throw new Error(`[${partNumberStr}] Add at least one Listening question.`);
            }
        } else {
            validateManualListeningText(
                body.questionText || "",
                body.answerText || body.answersText || "",
                part
            );
        }
    } catch (e) {
        const error = new Error(e.message);
        error.statusCode = 400;
        throw error;
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
        .filter((question) => {
            const normalizedType = ManualTestParser.normalizeType(question.type, "listening");
            const isCompletion = [
                "form_completion",
                "notes_completion",
                "note_completion",
                "sentence_completion",
                "table_completion",
                "flowchart_completion",
                "flow_chart_completion",
                "sentence_completion_inline"
            ].includes(normalizedType);

            return (
                Number.isFinite(question.number) &&
                (question.question || isCompletion) &&
                question.type &&
                question.answer
            );
        })
        .sort((a, b) => a.number - b.number);

    sections = ManualTestParser.sortQuestionGroups(
        normalizeListeningSections(sections, questions)
    );

    const transcript = String(body.transcript || "").trim();
    const audio = audioFile
        ? `/uploads/audio/${path.basename(audioFile.path)}`
        : String(body.audio || "");

    return {
        id: body.id || makeId(title),
        title,
        part,
        audio,
        assetFiles: audio.startsWith("/uploads/") ? [audio] : [],
        transcript,
        sections,
        questions,
        createdAt: body.createdAt || new Date().toISOString()
    };
}

function saveManualListeningTest(test) {
    fs.writeFileSync(getListeningTestPath(test.id), JSON.stringify(test, null, 2), "utf8");
}

function resolveUploadedAssetPath(assetPath) {
    const cleanPath = String(assetPath || "").split(/[?#]/)[0].replace(/^\/+/, "");

    if (!cleanPath.startsWith("uploads/")) {
        return "";
    }

    const resolvedPath = path.resolve(ROOT_DIR, cleanPath);
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);

    if (resolvedPath !== resolvedUploadDir && !resolvedPath.startsWith(`${resolvedUploadDir}${path.sep}`)) {
        return "";
    }

    return resolvedPath;
}

function listeningAssetFiles(test) {
    const assets = new Set(Array.isArray(test.assetFiles) ? test.assetFiles : []);

    if (test.audio) {
        assets.add(test.audio);
    }

    (Array.isArray(test.parts) ? test.parts : []).forEach((part) => {
        if (part.audioUrl) {
            assets.add(part.audioUrl);
        }
    });

    return [...assets]
        .map(resolveUploadedAssetPath)
        .filter((assetPath) => assetPath && fs.existsSync(assetPath));
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

function structuredListeningQuestionsForPart(part) {
    const answers = parseAnswerLines(part.answerText || part.answersText || "");

    return collectStructuredListeningNumbers(part.blocks || [])
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
}

function validateStructuredListeningPart(part) {
    const partNumber = Number(part.partNumber) || 1;
    const answers = parseAnswerLines(part.answerText || part.answersText || "");

    if (!String(part.audioUrl || "").trim()) {
        const error = new Error(`[Part ${partNumber}] Audio is required.`);
        error.statusCode = 400;
        throw error;
    }

    // 1. Check duplicate question numbers
    const numberCounts = {};
    function countNumbers(item, key) {
        if (key === "questionNumber" && Number.isFinite(Number(item))) {
            const num = Number(item);
            numberCounts[num] = (numberCounts[num] || 0) + 1;
        }
        if (typeof item === "string") {
            for (const match of item.matchAll(/\{\{(\d{1,2})\}\}/g)) {
                const num = Number(match[1]);
                numberCounts[num] = (numberCounts[num] || 0) + 1;
            }
        }
        if (Array.isArray(item)) {
            item.forEach(child => countNumbers(child, ""));
        } else if (item && typeof item === "object") {
            Object.entries(item).forEach(([childKey, childValue]) => countNumbers(childValue, childKey));
        }
    }
    countNumbers(part.blocks || [], "");
    for (const [num, count] of Object.entries(numberCounts)) {
        if (count > 1) {
            const error = new Error(`[Part ${partNumber}] Question ${num} is duplicated.`);
            error.statusCode = 400;
            throw error;
        }
    }

    const numbers = Object.keys(numberCounts).map(Number);
    if (!numbers.length) {
        const error = new Error(`[Part ${partNumber}] Add at least one question block.`);
        error.statusCode = 400;
        throw error;
    }

    // 2. Check missing answers
    const missingAnswers = numbers.filter((number) => !answers[String(number)]);
    if (missingAnswers.length) {
        const error = new Error(`[Part ${partNumber}] Question ${missingAnswers[0]} is missing a correct answer.`);
        error.statusCode = 400;
        throw error;
    }

    // 3. Check unsupported question types and empty question text
    const allowedListeningTypes = [
        "form_completion",
        "notes_completion",
        "note_completion",
        "multiple_choice",
        "map_labeling",
        "map_labelling",
        "matching",
        "sentence_completion",
        "diagram_labeling",
        "diagram_labelling",
        "table_completion",
        "short_answer",
        "multiple_select",
        "sentence_completion_inline"
    ];
    (part.blocks || []).forEach((block, idx) => {
        if (!allowedListeningTypes.includes(block.type)) {
            const error = new Error(`[Part ${partNumber}] Question block ${idx + 1} has unsupported type '${block.type}'.`);
            error.statusCode = 400;
            throw error;
        }
        if (block.type === "multiple_choice" || block.type === "multiple_select") {
            if (!block.question || !block.question.trim()) {
                const error = new Error(`[Part ${partNumber}] Question text in block ${idx + 1} cannot be empty.`);
                error.statusCode = 400;
                throw error;
            }
        }
    });

    const answeredNumbers = Object.keys(answers)
        .map(Number)
        .filter(Number.isFinite);
    const unknownAnswers = answeredNumbers.filter((number) => !numbers.includes(number));
    if (unknownAnswers.length) {
        const error = new Error(`[Part ${partNumber}] Answer key contains question ${unknownAnswers[0]} which does not exist in any question block.`);
        error.statusCode = 400;
        throw error;
    }
}

function buildStructuredListeningPart(fullTest, part) {
    const questions = structuredListeningQuestionsForPart(part);

    if (!questions.length) {
        return null;
    }

    return {
        id: `${fullTest.id}-part-${part.partNumber}`,
        title: `${fullTest.title} - ${part.title || `Part ${part.partNumber}`}`,
        part: Number(part.partNumber),
        audio: part.audioUrl || "",
        duration: 10,
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
                console.warn(`Could not read ${file}:`, error.message);
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function summarizeManualListeningTest(test) {
    const part = test.part === "full" ? "full" : normalizeListeningPart(test.part);

    return {
        id: test.id,
        title: test.title,
        subtitle: test.subtitle || (part === "full" ? "Listening full test" : "Academic Listening practice"),
        part,
        audio: test.audio || test.parts?.[0]?.audioUrl || "",
        duration: listeningDurationForPart(part),
        questionCount: Number(test.questionCount) || listeningQuestionCount(test),
        createdAt: test.createdAt,
        slug: publicSlugForTest("listening", "listening", test),
        openUrl: publicTestUrl("listening", "listening", test),
        readOnly: Boolean(test.readOnly)
    };
}

function fullTestSkill(test) {
    const readingQuestions = (test.reading?.passages || []).reduce((sum, passage) =>
        sum + (passage.questionGroups || []).reduce((groupSum, group) => groupSum + (group.questions || []).length, 0), 0);
    const listeningQuestions = (test.listening?.sections || []).reduce((sum, section) =>
        sum + (section.questionGroups || []).reduce((groupSum, group) => groupSum + (group.questions || []).length, 0), 0);
    const titleSignal = `${test.title || ""} ${test.sourceFile || ""}`.toLowerCase();

    return test.skill
        || (titleSignal.includes("reading") ? "reading" : null)
        || (titleSignal.includes("listening") ? "listening" : null)
        || (readingQuestions && !listeningQuestions ? "reading" : null)
        || (listeningQuestions && !readingQuestions ? "listening" : "combined");
}

function routeBaseSlug(test, fallback = "test") {
    const explicit = slugify(test.slug || test.publicSlug || test.routeSlug || "", "");
    const generated = slugify(test.title || "", "");

    return explicit || generated || slugify(test.id || "", fallback);
}

function uniqueRouteEntries(entries) {
    const used = new Set();
    const baseCounts = new Map();

    return entries.map((entry) => {
        const explicitSlug = slugify(entry.test.slug || entry.test.publicSlug || entry.test.routeSlug || "", "");
        const generatedSlug = slugify(entry.test.title || "", "");
        const baseSlug = explicitSlug || generatedSlug || slugify(entry.id || "", "test");
        const nextCount = (baseCounts.get(baseSlug) || 0) + 1;
        baseCounts.set(baseSlug, nextCount);

        let publicSlug = nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
        let suffix = nextCount;

        while (used.has(publicSlug)) {
            suffix += 1;
            publicSlug = `${baseSlug}-${suffix}`;
        }

        used.add(publicSlug);

        return {
            ...entry,
            explicitSlug,
            generatedSlug,
            publicSlug
        };
    });
}

function buildPublicRouteEntries(skill) {
    const entries = [];

    if (skill === "reading") {
        readManualReadingTests().forEach((test) => {
            entries.push({
                skill: "reading",
                source: "reading",
                id: test.id,
                test,
                htmlFile: "reading-template.html"
            });
        });
    }

    if (skill === "listening") {
        readManualListeningTests().forEach((test) => {
            entries.push({
                skill: "listening",
                source: "listening",
                id: test.id,
                test,
                htmlFile: "listening-template.html"
            });
        });
    }

    fullTestStore.readAll().forEach((test) => {
        const inferredSkill = fullTestSkill(test);

        if (inferredSkill !== skill && inferredSkill !== "combined") {
            return;
        }

        entries.push({
            skill,
            source: "full",
            id: test.id,
            test,
            htmlFile: "full-test-player.html"
        });
    });

    return uniqueRouteEntries(entries);
}

function publicEntryForTest(skill, source, id) {
    return buildPublicRouteEntries(skill).find((entry) => (
        entry.source === source &&
        String(entry.id) === String(id)
    ));
}

function publicSlugForTest(skill, source, test) {
    const entry = publicEntryForTest(skill, source, test.id);
    return entry?.publicSlug || routeBaseSlug(test);
}

function publicTestUrl(skill, source, test, options = {}) {
    const slug = publicSlugForTest(skill, source, test);
    const base = `/${skill}/${slug}`;
    const part = Number(options.part);

    if (skill === "listening" && Number.isFinite(part) && part > 0) {
        return `${base}/part-${part}`;
    }

    return base;
}

function resolvePublicEntry(skill, locator, source = "") {
    const raw = String(locator || "").trim();
    const normalized = slugify(raw, "");
    const entries = buildPublicRouteEntries(skill);
    const scopedEntries = source ? entries.filter((entry) => entry.source === source) : entries;

    return scopedEntries.find((entry) => entry.explicitSlug && entry.explicitSlug === normalized)
        || scopedEntries.find((entry) => entry.publicSlug === normalized)
        || scopedEntries.find((entry) => entry.generatedSlug && entry.generatedSlug === normalized)
        || scopedEntries.find((entry) => String(entry.id) === raw)
        || scopedEntries.find((entry) => slugify(entry.id || "", "") === normalized)
        || null;
}

function resolveManualReadingTest(locator) {
    return resolvePublicEntry("reading", locator, "reading")?.test || null;
}

function resolveManualListeningTest(locator) {
    return resolvePublicEntry("listening", locator, "listening")?.test || null;
}

function resolveFullTest(locator, preferredSkill = "") {
    const skills = preferredSkill === "listening" || preferredSkill === "reading"
        ? [preferredSkill]
        : ["reading", "listening"];

    for (const skill of skills) {
        const entry = resolvePublicEntry(skill, locator, "full");

        if (entry) {
            return entry.test;
        }
    }

    return fullTestStore.read(locator);
}

function publicFullTestUrl(test, skill = "") {
    const routeSkill = skill === "listening" ? "listening" : "reading";
    return publicTestUrl(routeSkill, "full", test);
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
    const data = await getPdfParser()(fs.readFileSync(filePath));
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
            console.warn("Answer JSON parse failed, falling back to line parser:", error.message);
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
            openUrl: publicTestUrl("reading", "reading", test),
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
            openUrl: publicTestUrl("listening", "listening", test),
            editUrl: test.readOnly ? "" : `admin-listening.html?id=${encodeURIComponent(test.id)}`
        });
    });

    fullTestStore.readAll().forEach((test) => {
        const summary = fullTestStore.summarize(test);

        items.push({
            id: test.id,
            title: test.title,
            type: "full",
            part: "full",
            questionCount: summary.questionCount,
            createdAt: test.createdAt,
            openUrl: publicFullTestUrl(test, summary.skill || "reading"),
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

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

const requireUser = requireAuth;

// Page-level authentication check for redirection
function requirePageAuth(req, res, next) {
    if (!req.user) {
        return res.redirect("/login");
    }
    next();
}

function requirePageAdmin(req, res, next) {
    if (!req.user) {
        return res.redirect("/login");
    }
    if (req.user.role !== "admin") {
        return res.redirect("/dashboard");
    }
    next();
}

// Public pages clean routes
app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "ieltsmock.html"));
});

app.get("/reading", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "reading.html"));
});

app.get("/listening", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listening.html"));
});

app.get("/speaking", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "speaking.html"));
});

app.get("/writing", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "writing.html"));
});

// Parts & Lists clean routes
app.get("/reading/part1", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "part1.html"));
});

app.get("/reading/part2", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "part2.html"));
});

app.get("/reading/part3", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "part3.html"));
});

app.get("/reading/fulltest", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "fulltest.html"));
});

app.get("/listening/part1", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningpart1.html"));
});

app.get("/listening/part2", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningpart2.html"));
});

app.get("/listening/part3", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningpart3.html"));
});

app.get("/listening/part4", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningpart4.html"));
});

app.get("/listening/fulltest", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningfulltest.html"));
});

app.get("/reading-tests", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "reading-tests.html"));
});

app.get("/listening-tests", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listening-tests.html"));
});

// Private pages clean routes
app.get("/dashboard", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "profile.html"));
});

app.get("/profile", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "profile.html"));
});

app.get("/profile-settings", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "profile-settings.html"));
});

app.get("/my-results", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "profile.html"));
});

app.get("/full-test-player", requirePageAuth, (req, res) => {
    if (req.query.id) {
        const preferredSkill = req.query.skill === "listening" ? "listening" : "reading";
        const test = resolveFullTest(req.query.id, preferredSkill);

        if (test) {
            return res.redirect(302, publicFullTestUrl(test, preferredSkill));
        }
    }
    res.sendFile(path.join(ROOT_DIR, "full-test-player.html"));
});

// Admin pages clean routes
app.get("/admin", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin.html"));
});

app.get("/admin-dashboard", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin.html"));
});

app.get("/admin/users", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-users.html"));
});

app.get("/admin-users", requirePageAdmin, (req, res) => {
    res.redirect("/admin/users");
});

app.get("/admin-reading", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-reading.html"));
});

app.get("/admin-listening", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-listening.html"));
});

app.get("/admin-import", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-import.html"));
});

app.get("/admin-full-test", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-import.html"));
});

function redirectToCleanTestUrl(req, res, skill, source, locator, options = {}) {
    const entry = resolvePublicEntry(skill, locator, source);

    if (!entry) {
        return false;
    }

    res.redirect(302, publicTestUrl(skill, source, entry.test, options));
    return true;
}

app.get("/reading-template.html", (req, res) => {
    if (req.query.id && redirectToCleanTestUrl(req, res, "reading", "reading", req.query.id)) {
        return;
    }

    res.sendFile(path.join(ROOT_DIR, "reading-template.html"));
});

app.get("/listening-template.html", (req, res) => {
    if (req.query.id && redirectToCleanTestUrl(req, res, "listening", "listening", req.query.id, { part: req.query.part })) {
        return;
    }

    res.sendFile(path.join(ROOT_DIR, "listening-template.html"));
});

app.get("/reading/:slug", (req, res) => {
    const entry = resolvePublicEntry("reading", req.params.slug);

    if (!entry) {
        res.status(404).send("Reading test not found");
        return;
    }

    if (req.params.slug !== entry.publicSlug) {
        res.redirect(302, publicTestUrl("reading", entry.source, entry.test));
        return;
    }

    res.sendFile(path.join(ROOT_DIR, entry.htmlFile));
});

app.get("/listening/:slug/part-:part", (req, res) => {
    const entry = resolvePublicEntry("listening", req.params.slug, "listening");

    if (!entry) {
        res.status(404).send("Listening test not found");
        return;
    }

    if (req.params.slug !== entry.publicSlug) {
        res.redirect(302, publicTestUrl("listening", "listening", entry.test, { part: req.params.part }));
        return;
    }

    res.sendFile(path.join(ROOT_DIR, "listening-template.html"));
});

app.get("/listening/:slug", (req, res) => {
    const entry = resolvePublicEntry("listening", req.params.slug);

    if (!entry) {
        res.status(404).send("Listening test not found");
        return;
    }

    if (req.params.slug !== entry.publicSlug) {
        res.redirect(302, publicTestUrl("listening", entry.source, entry.test));
        return;
    }

    res.sendFile(path.join(ROOT_DIR, entry.htmlFile));
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

app.put("/api/profile", requireUser, async (req, res) => {
    try {
        const { name } = req.body || {};
        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ error: "Name is required" });
        }

        const userId = req.user?.id || req.account?._id || req.account?.id;
        console.log(`[PROFILE UPDATE] Updating user ${userId} name to "${name.trim()}"`);

        const updatedUser = await userStore.updateUser(userId, {
            name: name.trim()
        });

        if (!updatedUser) {
            console.warn(`[PROFILE UPDATE] User not found or failed to update: ${userId}`);
            return res.status(404).json({ error: "User not found" });
        }

        console.info(`[PROFILE UPDATE] User ${userId} name updated successfully`);

        res.json({
            success: true,
            user: publicUser(updatedUser)
        });
    } catch (error) {
        console.error("[PROFILE UPDATE] Error updating profile name:", error);
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not update profile"
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
    getListeningTestById,
    resolveFullTestLocator: resolveFullTest,
    publicUrlForFullTest: publicFullTestUrl
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
    const test = resolveManualReadingTest(req.params.id);

    if (!test) {
        return res.status(404).json({ error: "Reading test not found" });
    }

    res.json(test);
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
            vocabulary: req.body.vocabulary === undefined ? existing.vocabulary : req.body.vocabulary,
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

app.get("/api/vocabulary/lookup", async (req, res) => {
    try {
        const requestedWord = String(req.query.word || "").trim();
        const normalized = normalizeVocabularyWord(requestedWord);
        const testId = String(req.query.testId || "").trim();
        const passageIdFromQuery = String(req.query.passageId || "").trim();
        const attemptId = String(req.query.attemptId || "").trim();

        if (!requestedWord || !normalized) {
            return res.status(400).json({ error: "A valid word is required" });
        }

        if (String(testId).includes("-full")) {
            return res.status(403).json({
                error: "Vocabulary lookup is not allowed in Full Tests"
            });
        }

        const test = findReadingTestForVocabulary(testId, passageIdFromQuery);

        if (!test || String(test.id).includes("-full")) {
            return res.status(403).json({
                error: "Vocabulary lookup is not allowed in Full Tests"
            });
        }

        const passageId = passageIdFromQuery || `${test.id}-passage-${test.part || 1}`;
        const candidates = vocabularyCandidates(normalized);
        let record = findManualVocabulary(test, candidates, passageId) || findCachedVocabulary(candidates);

        if (!record) {
            const requestKey = candidates[0];
            let pending = vocabularyLookupRequests.get(requestKey);

            if (!pending) {
                pending = generateVocabularyRecord(normalized, requestedWord, passageId)
                    .then((generated) => upsertVocabularyCache(generated))
                    .finally(() => vocabularyLookupRequests.delete(requestKey));
                vocabularyLookupRequests.set(requestKey, pending);
            }

            record = await pending;
        }

        record = await refreshFallbackTranslation(record, requestedWord);

        saveClickedVocabulary({
            attemptId,
            passageId,
            record,
            requestedWord
        });

        res.json(vocabularyResponse(record, requestedWord));
    } catch (error) {
        console.warn("Vocabulary lookup error:", error.message);
        res.status(500).json({
            error: "Could not look up vocabulary",
            definition: VOCABULARY_DEFINITION_FALLBACK,
            uzbekTranslation: VOCABULARY_TRANSLATION_FALLBACK
        });
    }
});

app.get("/api/vocabulary/clicked", (req, res) => {
    const attemptId = String(req.query.attemptId || "").trim();

    if (!attemptId) {
        return res.status(400).json({ error: "attemptId is required" });
    }

    const words = readJsonArray(READING_VOCABULARY_CLICKS_FILE)
        .filter((item) => item.attempt_id === attemptId)
        .sort((a, b) => new Date(a.clicked_at) - new Date(b.clicked_at));

    res.json(words);
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
    const includeDerived = req.query.includeDerived === "1" || req.query.includeDerived === "true";
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
                    duration: 10,
                    questionCount: listeningQuestionCount({ parts: [selectedPart] }),
                    createdAt: test.createdAt,
                    openUrl: publicTestUrl("listening", "listening", test, { part: partNumber })
                };
            })
            .filter(Boolean);

        const individualTests = individualPartTests.map(summarizeManualListeningTest);

        return res.json([...partViews, ...individualTests]);
    }

    if (part === "full") {
        tests = tests.filter((test) => test.part === "full");
    } else if (!part && !includeDerived) {
        tests = tests.filter((test) => !test.sourceFullTestId || test.part === "full");
    }

    res.json(tests.map(summarizeManualListeningTest));
});

app.get("/api/listening-tests/:id", (req, res) => {
    const test = resolveManualListeningTest(req.params.id);

    if (!test) {
        return res.status(404).json({ error: "Listening test not found" });
    }

    res.json(test);
});

app.put("/api/listening-tests/:id", requireAdmin, audioUpload.single("audio"), (req, res) => {
    const filePath = getListeningTestPath(req.params.id);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Listening test not found" });
    }

    try {
        const existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const updateBody = { ...req.body };

        if (typeof updateBody.data === "string") {
            const parsedData = JSON.parse(updateBody.data);
            updateBody.data = JSON.stringify({
                ...parsedData,
                id: existing.id,
                createdAt: existing.createdAt,
                audio: existing.audio
            });
        } else {
            updateBody.id = existing.id;
            updateBody.audio = existing.audio;
            updateBody.createdAt = existing.createdAt;
        }

        const test = buildManualListeningTest(updateBody, req.file);

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
    const assetFiles = listeningAssetFiles(existing);

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

app.use("/api/admin", requireAuth, requireAdmin);

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
        console.error(error);
        res.status(500).json({ error: "Could not load admin stats" });
    }
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
        const users = await userStore.getAllUsers();
        const formatted = users.map((user) => {
            const email = String(user.email || "").trim().toLowerCase();
            const uRole = isAdminEmail(email) ? "admin" : (user.role === "student" ? "user" : (user.role || "user"));
            const isPremium = !!user.isPremium;
            return {
                id: String(user._id || user.id),
                memberIdNumber: user.memberIdNumber || null,
                memberId: user.memberId || null,
                username: user.username,
                name: user.name || user.username || "",
                email: user.email,
                role: uRole,
                plan: user.plan || "free",
                isPremium: isPremium,
                premiumUntil: user.premiumUntil || null,
                createdAt: user.createdAt || null,
                lastLogin: user.lastLogin || null
            };
        });
        const sorted = formatted.sort((a, b) => (a.memberIdNumber || 99999) - (b.memberIdNumber || 99999));
        res.json(sorted);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not load admin users" });
    }
});

app.get("/api/admin/stats/users", requireAdmin, async (req, res) => {
    try {
        const users = await userStore.getAllUsers();
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        let totalUsers = 0;
        let todayUsers = 0;
        let premiumUsers = 0;
        let freeUsers = 0;
        let adminUsers = 0;

        for (const user of users) {
            totalUsers++;
            const email = String(user.email || "").trim().toLowerCase();
            const uRole = isAdminEmail(email) ? "admin" : (user.role === "student" ? "user" : (user.role || "user"));
            
            if (uRole === "admin") {
                adminUsers++;
            }

            const isPremium = !!user.isPremium;
            if (isPremium) {
                premiumUsers++;
            } else {
                freeUsers++;
            }

            const createdDate = user.createdAt ? new Date(user.createdAt) : null;
            if (createdDate && createdDate >= startOfToday) {
                todayUsers++;
            }
        }

        res.json({
            totalUsers,
            todayUsers,
            premiumUsers,
            freeUsers,
            adminUsers
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not load admin user stats" });
    }
});

app.get("/api/admin/recent-tests", requireAdmin, (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
        res.json({ tests: getRecentManualTests(limit) });
    } catch (error) {
        console.error(error);
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
        console.error(error);
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
            name: username,
            email,
            passwordHash: hashedPassword,
            role: isAdminEmail(email) ? "admin" : "user"
        });
        const token = createAuthToken(newUser);
        userProgressStore.recordAccountActivity(newUser._id || newUser.id, "Account created");

        // Set the secure, httpOnly cookie correctly from backend
        res.cookie("ieltsmockAuthToken", token, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/"
        });

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
        console.error(error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Signup failed"
        });
    }
});

async function handleLogin(req, res) {
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

        const lastLogin = new Date();
        user.lastLogin = lastLogin;
        await userStore.updateUser(user._id || user.id, { lastLogin });

        const token = createAuthToken(user);
        userProgressStore.recordAccountActivity(user._id || user.id, "Signed in");

        // Set the secure, httpOnly cookie correctly from backend
        res.cookie("ieltsmockAuthToken", token, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/"
        });

        res.json({
            success: true,
            message: "Login successful",
            user: publicUser(user),
            token
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Login failed"
        });
    }
}

app.post("/login", handleLogin);
app.post("/api/auth/login", handleLogin);


app.get("/auth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

    if (!clientId || !callbackUrl) {
        return res.status(500).send("Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CALLBACK_URL in your environment.");
    }

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
        new URLSearchParams({
            client_id: clientId,
            redirect_uri: callbackUrl,
            response_type: "code",
            scope: "openid email profile",
            access_type: "offline",
            prompt: "select_account"
        }).toString();

    res.redirect(googleAuthUrl);
});

app.get("/auth/google/callback", async (req, res) => {
    try {
        console.log("[AUTH CALLBACK] Google callback reached");
        const { code } = req.query;
        if (!code) {
            return res.status(400).send("Authorization code is missing.");
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

        if (!clientId || !clientSecret || !callbackUrl) {
            return res.status(500).send("Google OAuth configuration is incomplete.");
        }

        // Exchange code for tokens
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: callbackUrl,
                grant_type: "authorization_code"
            })
        });

        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok) {
            console.error("Token exchange failed:", tokens);
            return res.status(400).send(tokens.error_description || tokens.error || "Failed to exchange authorization code.");
        }

        // Get user info from Google
        const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`
            }
        });

        const userInfo = await userInfoResponse.json();
        if (!userInfoResponse.ok) {
            console.error("Failed to fetch user info:", userInfo);
            return res.status(400).send("Failed to retrieve user profile from Google.");
        }

        const { sub, email, email_verified, name, picture } = userInfo;
        if (!email) {
            return res.status(400).send("Google account does not provide an email address.");
        }

        // Reject if email is not verified by Google
        const isEmailVerified = email_verified === true || email_verified === "true";
        if (!isEmailVerified) {
            return res.status(400).send("Login rejected: Google email is not verified.");
        }
        console.log("[AUTH CALLBACK] Google email verified: " + email);

        // Determine user role
        const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
        const isAdmin = email.toLowerCase() === adminEmail;
        const role = isAdmin ? "admin" : "user";

        let user = await userStore.findUserByEmail(email);

        if (user) {
            console.log("[AUTH CALLBACK] Existing user found in store with ID: " + (user._id || user.id));

            if (!user.googleId) {
                // Link Google account to existing user
                const providers = Array.isArray(user.authProviders) ? [...user.authProviders] : [];
                if (!providers.includes("google")) {
                    providers.push("google");
                }

                const updates = {
                    googleId: sub,
                    authProviders: providers,
                    lastLogin: new Date()
                };

                if (!user.avatar && picture) {
                    updates.avatar = picture;
                }
                if ((!user.name || user.name === user.username) && name) {
                    updates.name = name;
                }
                if (user.role !== role) {
                    updates.role = role;
                }

                user = await userStore.updateUser(user._id || user.id, updates);
                console.log("[AUTH CALLBACK] Google account linked for user: " + user.email);
            } else if (user.googleId !== sub) {
                return res.status(400).send("Safe error: This email is already linked to a different Google account.");
            } else {
                const updates = { lastLogin: new Date() };
                if (user.role !== role) {
                    updates.role = role;
                }
                user = await userStore.updateUser(user._id || user.id, updates);
            }

            userProgressStore.recordAccountActivity(user._id || user.id, "Signed in (Google)");
        } else {
            // User does not exist, create a new one
            const username = email.split("@")[0] || name || "google_user";
            user = await userStore.createUser({
                username,
                name: name || username,
                email: email.toLowerCase(),
                passwordHash: "",
                role,
                googleId: sub,
                avatar: picture || "",
                authProviders: ["google"]
            });

            console.log("[AUTH CALLBACK] Google account created for new user: " + user.email);
            userProgressStore.recordAccountActivity(user._id || user.id, "Account created (Google)");

            sendTelegramMessage(
                `🆕 New Google signup\n<b>${user.username}</b>\n${user.email}\nStorage: ${userStore.getStorageMode()}`
            ).catch(() => {});
        }

        // Generate JWT
        const token = createAuthToken(user);
        console.log("[AUTH CALLBACK] JWT session created for user: " + user.email);

        // Store JWT in a secure httpOnly cookie
        const isProduction = process.env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https";
        res.cookie("ieltsmockAuthToken", token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Redirect URL logic using clean paths
        let redirectBase = process.env.FRONTEND_URL || "";
        if (redirectBase.endsWith("/")) {
            redirectBase = redirectBase.slice(0, -1);
        }
        const targetPath = user.role === "admin" ? "/admin" : "/dashboard";
        const redirectUrl = `${redirectBase}${targetPath}`;
        console.log("[AUTH CALLBACK] Redirect target: " + redirectUrl);

        // Return script to write to localStorage for the frontend client-side authentication
        res.setHeader("Content-Type", "text/html");
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Authenticating...</title>
                <script>
                    const token = ${JSON.stringify(token)};
                    const user = ${JSON.stringify(publicUser(user))};
                    const savedAuth = {
                        token,
                        user,
                        savedAt: new Date().toISOString()
                    };
                    localStorage.setItem("ieltsmock.auth", JSON.stringify(savedAuth));
                    localStorage.setItem("ieltsAuth", JSON.stringify(savedAuth));
                    
                    // Also set the cookie client-side as fallback for existing scripts if needed
                    document.cookie = "ieltsmockAuthToken=" + encodeURIComponent(token) + "; path=/; max-age=" + (7 * 24 * 60 * 60) + "; samesite=lax";
                    
                    window.location.href = ${JSON.stringify(redirectUrl)};
                </script>
            </head>
            <body>
                <div style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 10px;">
                    <div style="width: 40px; height: 40px; border: 4px solid #f3f4f6; border-top: 4px solid #2563eb; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <p style="color: #4b5563; font-weight: 500;">Signing in with Google...</p>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </body>
            </html>
        `);
    } catch (error) {
        console.error("Google callback error:", error);
        res.status(500).send("Authentication failed: " + (error.message || "Unknown error"));
    }
});

// Serve profile.html for the /dashboard route
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "profile.html"));
});

app.get("/api/auth/me", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated"
            });
        }

        res.json({
            success: true,
            user: req.user
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

async function runUserMigration() {
    console.info("Checking if user ID migration is needed...");
    
    const isMongo = mongoose.connection.readyState === 1;
    
    if (isMongo) {
        try {
            const User = require("./models/User");
            const countMissing = await User.countDocuments({ memberIdNumber: { $exists: false } });
            if (countMissing > 0) {
                console.info(`Found ${countMissing} users without memberId. Starting migration...`);
                
                const allDbUsers = await User.find({});
                let adminUser = allDbUsers.find(u => u.role === "admin" || isAdminEmail(u.email));
                
                if (adminUser) {
                    await User.updateOne({ _id: adminUser._id }, { $set: { memberIdNumber: 1, memberId: "001" } });
                    console.info(`Migrated admin user: ${adminUser.email || adminUser.username} to ID 001`);
                }
                
                const nonAdmins = allDbUsers.filter(u => u._id.toString() !== (adminUser?._id.toString() || ""));
                nonAdmins.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
                
                let nextNum = 2;
                for (const user of nonAdmins) {
                    const memberId = String(nextNum).padStart(3, "0");
                    await User.updateOne({ _id: user._id }, { $set: { memberIdNumber: nextNum, memberId } });
                    console.info(`Migrated user: ${user.email || user.username} to ID ${memberId}`);
                    nextNum++;
                }
                
                console.info("MongoDB user ID migration finished.");
            } else {
                console.info("MongoDB user ID migration not needed.");
            }
        } catch (err) {
            console.error("MongoDB migration failed:", err);
        }
    } else {
        const usersFile = path.join(ROOT_DIR, "data", "users.json");
        if (fs.existsSync(usersFile)) {
            try {
                const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
                const needsMigration = users.some(u => !u.memberIdNumber);
                if (needsMigration) {
                    console.info("Starting local users JSON ID migration...");
                    let adminUser = users.find(u => u.role === "admin" || isAdminEmail(u.email));
                    if (adminUser) {
                        adminUser.memberIdNumber = 1;
                        adminUser.memberId = "001";
                    }
                    
                    const nonAdmins = users.filter(u => u.id !== (adminUser?.id || ""));
                    nonAdmins.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
                    
                    let nextNum = 2;
                    for (const user of nonAdmins) {
                        user.memberIdNumber = nextNum;
                        user.memberId = String(nextNum).padStart(3, "0");
                        nextNum++;
                    }
                    
                    const migrated = [];
                    if (adminUser) migrated.push(adminUser);
                    migrated.push(...nonAdmins);
                    
                    fs.writeFileSync(usersFile, JSON.stringify(migrated, null, 2), "utf8");
                    console.info("Local users JSON ID migration finished.");
                } else {
                    console.info("Local users JSON ID migration not needed.");
                }
            } catch (err) {
                console.error("Local user migration failed:", err);
            }
        }
    }
}

if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI, {
        dbName: process.env.MONGO_DB_NAME || "ieltsmock",
        serverSelectionTimeoutMS: 8000
    })
        .then(() => {
            console.info("MongoDB connected — using Atlas for accounts");
            runUserMigration().catch(err => console.error("Migration error:", err));
        })
        .catch((error) => {
            console.warn("MongoDB connection error:", error.message);
            console.info("Using local file storage for accounts: data/users.json");
            console.info("Atlas fix: Network Access -> Add IP Address -> Allow Access from Anywhere (0.0.0.0/0) for development");
            runUserMigration().catch(err => console.error("Migration error:", err));
        });
} else {
    console.info("MONGO_URI is not set - using local file storage: data/users.json");
    runUserMigration().catch(err => console.error("Migration error:", err));
}

// Intercept direct .html file requests to enforce admin and user session security
app.use((req, res, next) => {
    const pathLower = req.path.toLowerCase();
    if (pathLower.endsWith(".html")) {
        if (pathLower.includes("admin")) {
            if (!req.user) {
                return res.redirect("/login");
            }
            if (req.user.role !== "admin") {
                return res.redirect("/dashboard");
            }
        }

        const privateHtmls = ["/profile.html", "/profile-settings.html", "/full-test-player.html"];
        if (privateHtmls.includes(pathLower)) {
            if (!req.user) {
                return res.redirect("/login");
            }
        }
    }
    next();
});

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(ROOT_DIR));

const PORT = process.env.PORT || 30004;

if (!IS_VERCEL) {
    app.listen(PORT, () => {
        console.info(`Server running on http://localhost:${PORT}`);

        if (process.env.BOT_TOKEN && process.env.ADMIN_ID) {
            sendTelegramMessage("IELTSX server started").catch(() => {});
        }
    });
}

module.exports = app;
