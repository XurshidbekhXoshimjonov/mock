require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const compression = require("compression");
const fs = require("fs");
const crypto = require("crypto");
const OpenAI = require("openai");
const User = require("./models/User");
const ManualPaymentRequest = require("./models/ManualPaymentRequest");
const WritingFullTest = require("./models/WritingFullTest");
const FullSpeakingTest = require("./models/FullSpeakingTest");
const ReviewMistake = require("./models/ReviewMistake");
const VocabularyWord = require("./models/VocabularyWord");
const StudyPlan = require("./models/StudyPlan");
const WritingSubmission = require("./models/WritingSubmission");
const SpeakingSubmission = require("./models/SpeakingSubmission");
const AIConversation = require("./models/AIConversation");
const AIMessage = require("./models/AIMessage");
const AIMemory = require("./models/AIMemory");
const AIActionLog = require("./models/AIActionLog");
const { createAuthToken, verifyAuthToken, publicUser, getAdminEmails, isAdminUser } = require("./lib/auth");
const { createUserStore } = require("./lib/user-store");
const { sendTelegramMessage } = require("./lib/telegram");
const { createFullTestStore } = require("./lib/full-test-store");
const { registerFullTestRoutes } = require("./lib/full-test-routes");
const { registerWritingRoutes } = require("./lib/writing-routes");
const { registerSpeakingRoutes } = require("./lib/speaking-routes");
const { premiumPlans, hasPremiumAccess, canAccessSubscriptionFeature } = require("./premium-config");
const { createUserProgressStore } = require("./lib/user-progress-store");
const { createReviewMistakeStore } = require("./lib/review-mistake-store");
const { createVocabularyStore } = require("./lib/vocabulary-store");
const { createMockTestStore } = require("./lib/mock-test-store");
const { createStudyPlanStore } = require("./lib/study-plan-store");
const { registerStudyPlanRoutes } = require("./lib/study-plan-routes");
const { createAICoachStore } = require("./lib/ai-coach-store");
const { registerAICoachRoutes } = require("./lib/ai-coach-routes");
const ManualTestParser = require("./lib/manual-test-parser");
const { sanitizeHtml, replaceInputsWithBlankMarkers } = require("./lib/ielts-import/htmlSanitizer");
const { stripTags } = require("./lib/ielts-import/utils");
const { protectImportedUploads } = require("./lib/upload-security");
const { OAUTH_STATE_TTL_MS, createOAuthState, verifyOAuthState } = require("./lib/oauth-state");
const { AuthRateLimitStore, createAuthRateLimiter, ipRule, emailRule } = require("./lib/auth-rate-limit");
const { createSecurityHeaders } = require("./lib/security-headers");
const { renderLegalPage } = require("./lib/legal-page-layout");
const { legalPages } = require("./lib/legal-pages");
const { UPLOAD_LIMITS, multipartLimits, uploadErrorResponse } = require("./lib/upload-limits");
const { validateUploadContents } = require("./lib/upload-content-validation");
const { calculateReadingBand, calculateListeningBand, scoreSkill } = require("./lib/ielts-import/bandScoring");
const { publicTestData, collectScorableQuestions } = require("./lib/public-test-data");
const {
    normalizeTranscriptSegments,
    normalizeTranscriptSegmentIds,
    transcriptEvidence
} = require("./lib/listening-transcript");
const { createCsrfProtection } = require("./lib/csrf-protection");
const { registerLemonSqueezyWebhookRoute } = require("./lib/lemonsqueezy-webhook");
const { isLemonSqueezyPremiumActive, effectivePremiumDates } = require("./lib/subscription-access");
const {
    runtimeNamespace,
    resolveRuntimeDataDir,
    resolveMongoDbName
} = require("./lib/runtime-environment");

let TranslateClient = null;
try {
    TranslateClient = require("@google-cloud/translate").v2.Translate;
} catch (error) {
    console.warn("Google Translate package is unavailable:", error.message);
}

const app = express();
app.disable("etag");
app.disable("x-powered-by");

const ROOT_DIR = __dirname;
const TRUST_PROXY_HEADERS = String(process.env.TRUST_PROXY_HEADERS || "").trim().toLowerCase() === "true";
app.use(createSecurityHeaders({ trustForwardedProto: TRUST_PROXY_HEADERS }));
app.use(compression({
    threshold: 1024,
    filter(req, res) {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
    }
}));
const authRateLimitStore = new AuthRateLimitStore({ mongoose });
const loginRateLimit = createAuthRateLimiter({
    store: authRateLimitStore,
    rules: [
        ipRule({ scope: "login-ip", limit: 25, windowMs: 15 * 60 * 1000, trustForwardedFor: TRUST_PROXY_HEADERS }),
        emailRule({ scope: "login-email", limit: 8, windowMs: 15 * 60 * 1000 })
    ]
});
const signupRateLimit = createAuthRateLimiter({
    store: authRateLimitStore,
    rules: [
        ipRule({ scope: "signup-ip", limit: 10, windowMs: 60 * 60 * 1000, trustForwardedFor: TRUST_PROXY_HEADERS }),
        emailRule({ scope: "signup-email", limit: 3, windowMs: 60 * 60 * 1000 })
    ]
});
const RUNTIME_WRITE_DIR = ROOT_DIR;
const BUNDLED_DATA_DIR = path.join(ROOT_DIR, "data");
const RUNTIME_NAMESPACE = runtimeNamespace();
const RUNTIME_DATA_DIR = resolveRuntimeDataDir(ROOT_DIR);
const UPLOAD_DIR = path.join(RUNTIME_WRITE_DIR, "uploads");
const DATA_DIR = BUNDLED_DATA_DIR;

function runtimeDataFile(fileName) {
    const target = path.join(RUNTIME_DATA_DIR, fileName);
    const legacy = path.join(BUNDLED_DATA_DIR, fileName);

    fs.mkdirSync(RUNTIME_DATA_DIR, { recursive: true });
    if (RUNTIME_NAMESPACE !== "production" && !fs.existsSync(target) && fs.existsSync(legacy)) {
        fs.copyFileSync(legacy, target);
    }

    return target;
}

const USERS_FILE = runtimeDataFile("users.json");
const userStore = createUserStore({ User, usersFile: USERS_FILE });
const USER_PROGRESS_FILE = runtimeDataFile("user-progress.json");
const userProgressStore = createUserProgressStore(USER_PROGRESS_FILE);
const REVIEW_MISTAKES_FILE = runtimeDataFile("review-mistakes.json");
const reviewMistakeStore = createReviewMistakeStore({
    filePath: REVIEW_MISTAKES_FILE,
    mongoose,
    ReviewMistake
});
const USER_VOCABULARY_FILE = runtimeDataFile("user-vocabulary.json");
const vocabularyStore = createVocabularyStore({
    filePath: USER_VOCABULARY_FILE,
    mongoose,
    VocabularyWord
});
const STUDY_PLANS_FILE = runtimeDataFile("study-plans.json");
const studyPlanStore = createStudyPlanStore({ filePath: STUDY_PLANS_FILE, mongoose, StudyPlan });
const AI_COACH_FILE = runtimeDataFile("ai-coach.json");
const aiCoachStore = createAICoachStore({
    filePath: AI_COACH_FILE,
    mongoose,
    AIConversation,
    AIMessage,
    AIMemory,
    AIActionLog
});
const TESTS_FILE = path.join(DATA_DIR, "tests.json");
const MOCK_TESTS_FILE = path.join(DATA_DIR, "mock-tests.json");
const MOCK_TEST_RESULTS_FILE = runtimeDataFile("mock-test-results.json");
const VOCABULARY_CACHE_FILE = runtimeDataFile("vocabulary-cache.json");
const READING_VOCABULARY_CLICKS_FILE = runtimeDataFile("reading-vocabulary-clicks.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "output.txt");
const READING_JSON_FILE = path.join(ROOT_DIR, "reading.json");
const READING_TESTS_DIR = path.join(DATA_DIR, "reading-tests");
const LISTENING_TESTS_DIR = path.join(DATA_DIR, "listening-tests");
const FULL_TESTS_DIR = path.join(DATA_DIR, "full-tests");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const AUDIO_UPLOAD_DIR = path.join(UPLOAD_DIR, "audio");
const LISTENING_IMAGE_UPLOAD_DIR = path.join(UPLOAD_DIR, "listening-images");
const MOCK_TEST_ASSET_UPLOAD_DIR = path.join(UPLOAD_DIR, "mock-tests");
const VOCABULARY_DEFINITION_FALLBACK = "Definition is not available yet.";
const VOCABULARY_TRANSLATION_FALLBACK = "Uzbek translation is not available yet.";
const MAX_REVIEW_MISTAKE_SNAPSHOTS_PER_RESULT = 40;
const MAX_REVIEW_MISTAKE_SNAPSHOT_BYTES = 80_000;
const MAX_REVIEW_MISTAKE_SNAPSHOTS_BYTES = 1_500_000;
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
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "").trim();
const OPENAI_TRANSLATION_MODEL = String(
    process.env.OPENAI_TRANSLATION_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini"
).trim();
const OPENAI_TRANSCRIPTION_MODEL = String(process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1").trim();
let listeningTranscriptionClient = null;
const CONTEXT_TRANSLATION_ERROR_MESSAGE = "Translation is unavailable right now. Please try again.";
const CONTEXT_TRANSLATION_CACHE_LIMIT = 500;
const TRANSLATE_CORS_ORIGINS = new Set([
    "https://ieltsx.org",
    "https://www.ieltsx.org",
    "http://localhost:30004",
    "http://localhost:3000"
]);

let translateClient = null;
let translateConfigWarningShown = false;
const vocabularyLookupRequests = new Map();
const contextTranslationRequests = new Map();
const contextTranslationCache = new Map();
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

ensureRuntimeDir(UPLOAD_DIR);
ensureRuntimeDir(DATA_DIR);
ensureRuntimeDir(READING_TESTS_DIR);
ensureRuntimeDir(LISTENING_TESTS_DIR);
ensureRuntimeDir(FULL_TESTS_DIR);
ensureRuntimeDir(AUDIO_UPLOAD_DIR);
ensureRuntimeDir(LISTENING_IMAGE_UPLOAD_DIR);
ensureRuntimeDir(MOCK_TEST_ASSET_UPLOAD_DIR);
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

const upload = multer({
    storage,
    limits: multipartLimits({ fileSize: UPLOAD_LIMITS.pdf, fields: 2 })
});

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
    limits: multipartLimits({ fileSize: UPLOAD_LIMITS.audio, fields: 12 }),
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
    limits: multipartLimits({ fileSize: UPLOAD_LIMITS.image, fields: 8 }),
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const accepted = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension);
        cb(accepted ? null : new Error("Image must be a JPG, PNG, WebP, or GIF file"), accepted);
    }
});

const mockAssetStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, MOCK_TEST_ASSET_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${safeFileName(file.originalname)}`);
    }
});

const mockAudioUpload = multer({
    storage: mockAssetStorage,
    limits: multipartLimits({ fileSize: UPLOAD_LIMITS.audio, fields: 4 }),
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const accepted = [".mp3", ".wav", ".m4a", ".webm"].includes(extension);
        cb(accepted ? null : new Error("Audio must be an MP3, WAV, M4A, or WebM file"), accepted);
    }
});

const mockImageUpload = multer({
    storage: mockAssetStorage,
    limits: multipartLimits({ fileSize: UPLOAD_LIMITS.image, fields: 4 }),
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const accepted = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension);
        cb(accepted ? null : new Error("Image must be a JPG, PNG, WebP, or GIF file"), accepted);
    }
});

const candidatePhotoStorage = multer.diskStorage({
    destination(req, file, cb) {
        const dir = path.join(UPLOAD_DIR, "candidate-photos");
        ensureRuntimeDir(dir);
        cb(null, dir);
    },
    filename(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
    }
});

const candidatePhotoUpload = multer({
    storage: candidatePhotoStorage,
    limits: multipartLimits({ fileSize: UPLOAD_LIMITS.profilePhoto, fields: 2 }),
    fileFilter(req, file, cb) {
        const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG, JPEG, and PNG images are allowed"), false);
        }
    }
});

// Lemon Squeezy signs the exact request bytes, so this route must precede JSON and CSRF middleware.
registerLemonSqueezyWebhookRoute(app, { userStore });
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(createCsrfProtection({
    trustForwardedProto: TRUST_PROXY_HEADERS,
    pathAllowedOrigins: {
        "/api/translate": TRANSLATE_CORS_ORIGINS,
        "/api/translate-context": TRANSLATE_CORS_ORIGINS
    }
}));

function responseByteSize(payload) {
    try {
        if (Buffer.isBuffer(payload)) return payload.length;
        if (typeof payload === "string") return Buffer.byteLength(payload);
        return Buffer.byteLength(JSON.stringify(payload || null));
    } catch {
        return 0;
    }
}

app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) {
        return next();
    }

    const startedAt = process.hrtime.bigint();
    let responseSize = 0;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = (payload) => {
        responseSize = responseByteSize(payload);
        return originalJson(payload);
    };

    res.send = (payload) => {
        if (!responseSize) responseSize = responseByteSize(payload);
        return originalSend(payload);
    };

    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        console.info("[API PERF]", {
            route: `${req.method} ${req.originalUrl}`,
            status: res.statusCode,
            ms: Math.round(durationMs * 10) / 10,
            bytes: responseSize
        });
    });

    return next();
});

function paginationParams(req, defaults = {}) {
    const maxLimit = Number(defaults.maxLimit) || 100;
    const defaultLimit = Number(defaults.defaultLimit) || 50;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), maxLimit);
    return { page, limit, skip: (page - 1) * limit };
}

function setPaginationHeaders(res, { page, limit, total }) {
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("X-Page", String(page));
    res.setHeader("X-Limit", String(limit));
    res.setHeader("X-Total-Pages", String(totalPages));
}

function paginateArray(req, res, items, defaults = {}) {
    const pagination = paginationParams(req, defaults);
    setPaginationHeaders(res, { ...pagination, total: items.length });
    return items.slice(pagination.skip, pagination.skip + pagination.limit);
}

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
        const extension = path.extname(req.path).toLowerCase();
        if (extension && extension !== ".html") {
            return next();
        }
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
        "/admin-speaking.html": "/admin-speaking",
        "/admin-import.html": "/admin-import",
        "/admin-mock-tests.html": "/admin-mock-tests",
        "/reading-tests.html": "/reading-tests",
        "/listening-tests.html": "/listening-tests",
        "/mock-tests.html": "/mock-tests",
        "/mock-test.html": "/mock-tests",
        "/mock-test-result.html": "/mock-tests",
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

function readFilePrefix(filePath, maxBytes = 512 * 1024) {
    const fd = fs.openSync(filePath, "r");
    try {
        const buffer = Buffer.alloc(maxBytes);
        const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
        return buffer.toString("utf8", 0, bytesRead);
    } finally {
        fs.closeSync(fd);
    }
}

function jsonStringField(source, key) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`);
    const match = String(source || "").match(pattern);
    if (!match) return "";
    return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function jsonNumberField(source, key) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*(\\d+)`);
    const match = String(source || "").match(pattern);
    return match ? Number(match[1]) : 0;
}

function jsonBooleanField(source, key) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*(true|false)`);
    const match = String(source || "").match(pattern);
    return match ? match[1] === "true" : false;
}

function isMockOnlyTest(test) {
    return Boolean(test?.mockOnly || test?.mockTestOnly);
}

function publicIdUrl(skill, id, options = {}) {
    const encoded = encodeURIComponent(id);
    if (skill === "listening" && Number(options.part) > 0) {
        return `/listening/${encoded}/part-${Number(options.part)}`;
    }
    return `/${skill}/${encoded}`;
}

function publicListMetadata({ id, title, testNumber, type, status, createdAt, extra = {} }) {
    return {
        _id: id,
        id,
        title,
        testNumber: Number(testNumber) || undefined,
        type,
        status: status || "published",
        createdAt,
        ...extra
    };
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

const PUBLIC_ROUTE_SLUG_ALIASES = {
    listening: {
        "c10-listening-test-1-1783826761800-listening-full": "c10-listening-test-1-1783831879508",
        "c10-listening-test-1-1783826848064": "c10-listening-test-1-1783831879508",
        "c10-listening-test-1-1783826848064-listening-full": "c10-listening-test-1-1783831879508",
        "c10-listening-test-1-1783830949232": "c10-listening-test-1-1783831879508",
        "c10-listening-test-1-1783830949232-listening-full": "c10-listening-test-1-1783831879508"
    }
};

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

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

function cleanPrivacyScopeId(value, fallback = "") {
    const cleaned = String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9_.:-]/g, "-")
        .slice(0, 160);
    return cleaned || fallback;
}

function vocabularyOwnerFromRequest(req) {
    const userId = cleanPrivacyScopeId(req.user?.id || req.user?._id || req.user?.memberId || "");

    if (userId) {
        return {
            ownerType: "user",
            ownerId: userId
        };
    }

    const sessionId = cleanPrivacyScopeId(req.query.sessionId || req.body?.sessionId || "");
    return {
        ownerType: "session",
        ownerId: sessionId
    };
}

function compactText(value, maxLength = 500) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function shortUzbekPhrase(value, maxWords = 8) {
    let text = compactText(value, 260)
        .replace(/^[\s"'`]+|[\s"'`]+$/g, "");

    [
        /^(?:bu\s+)?(?:yerda\s+)?(?:ushbu\s+)?(?:kontekst(?:da|dagi)?\s+)?(?:so['\u2019`]?z(?:ning)?|ibora(?:ning)?|tanlangan\s+matn(?:ning)?)?\s*(?:ma['\u2019`]?nosi|mazmuni|tarjimasi)\s*[,:;\-]?\s*/i,
        /^(?:bu\s+)?(?:kontekst(?:da|dagi)?|yerda)\s*(?:u\s+)?(?:degani|anglatadi|bildiradi)\s*[,:;\-]?\s*/i,
        /^(?:ya['\u2019`]?ni|demak)\s*[,:;\-]?\s*/i
    ].forEach((pattern) => {
        text = text.replace(pattern, "");
    });

    text = text
        .replace(/\s+(?:ya['\u2019`]?ni|degani|anglatadi|bildiradi)\b[\s\S]*$/i, "")
        .replace(/[.!?]\s*[\s\S]*$/, "")
        .trim();

    const words = text.split(/\s+/).filter(Boolean);
    return (words.length > maxWords ? words.slice(0, maxWords).join(" ") : text).trim();
}

function simpleHash(value) {
    const text = String(value || "");
    let hash = 5381;

    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
    }

    return hash.toString(36);
}

function normalizeContextTranslationPayload(body = {}) {
    const selectedText = compactText(body.selectedText || body.word || body.phrase, 160);
    const sentence = compactText(body.sentence || selectedText, 700);
    const paragraph = compactText(body.paragraph || body.context || sentence, 1800);

    return {
        selectedText,
        sentence,
        paragraph,
        testId: cleanPrivacyScopeId(body.testId || body.test_id || "practice", "practice"),
        passageId: cleanPrivacyScopeId(body.passageId || body.passage_id || "passage", "passage")
    };
}

function contextTranslationCacheKey(owner, payload) {
    const ownerType = owner.ownerType === "user" ? "user" : "session";
    const ownerId = cleanPrivacyScopeId(owner.ownerId || "");
    const selected = normalizeVocabularyWord(payload.selectedText) || payload.selectedText.toLowerCase();

    return [
        ownerType,
        ownerId,
        payload.testId || "practice",
        payload.passageId || "passage",
        safeHashPart(selected),
        safeHashPart(payload.sentence)
    ].join(":");
}

function safeHashPart(value) {
    return simpleHash(String(value || "").toLowerCase());
}

function cacheContextTranslation(cacheKey, record) {
    if (!cacheKey || !record) {
        return;
    }

    if (contextTranslationCache.size >= CONTEXT_TRANSLATION_CACHE_LIMIT) {
        const oldestKey = contextTranslationCache.keys().next().value;
        if (oldestKey) {
            contextTranslationCache.delete(oldestKey);
        }
    }

    contextTranslationCache.set(cacheKey, {
        ...record,
        cachedAt: new Date().toISOString()
    });
}

function isUsableUzbekTranslation(value) {
    const text = shortUzbekPhrase(value);
    return text && text !== VOCABULARY_TRANSLATION_FALLBACK ? text : "";
}

async function requestContextTranslationFallback(payload, cause) {
    console.warn("Context translation primary provider failed; using fallback:", {
        message: cause?.message || "unknown error",
        statusCode: cause?.statusCode || null,
        provider: "openai",
        hasOpenAIKey: Boolean(OPENAI_API_KEY),
        hasGoogleTranslateKey: Boolean(GOOGLE_TRANSLATE_API_KEY)
    });

    const normalized = normalizeVocabularyWord(payload.selectedText);
    const candidates = vocabularyCandidates(normalized || payload.selectedText);
    let dictionary = null;

    for (const candidate of candidates) {
        dictionary = await fetchDictionaryVocabulary(candidate, payload.selectedText);
        if (dictionary?.english_definition && dictionary.english_definition !== VOCABULARY_DEFINITION_FALLBACK) {
            break;
        }
    }

    const uzbekTranslation = isUsableUzbekTranslation(await translateToUzbek(payload.selectedText));

    if (!uzbekTranslation && !dictionary?.english_definition) {
        const error = new Error("Fallback translation providers returned no result");
        error.statusCode = 502;
        throw error;
    }

    return normalizeContextTranslationRecord({
        selectedText: payload.selectedText,
        meaningInEnglish: dictionary?.english_definition && dictionary.english_definition !== VOCABULARY_DEFINITION_FALLBACK
            ? dictionary.english_definition
            : `Meaning of "${payload.selectedText}" in this sentence.`,
        uzbekTranslation,
        contextualMeaningUzbek: uzbekTranslation,
        partOfSpeech: dictionary?.part_of_speech || "",
        source: "translate_fallback"
    }, payload);
}

function normalizeContextTranslationRecord(data, payload) {
    const selectedText = compactText(data?.selectedText || payload.selectedText, 160);
    const meaningInEnglish = compactText(data?.meaningInEnglish || data?.englishMeaning || data?.definition, 420);
    const uzbekTranslation = shortUzbekPhrase(data?.uzbekTranslation || data?.uzbek_translation || data?.translation);
    const contextualMeaningUzbek = shortUzbekPhrase(data?.contextualMeaningUzbek || data?.contextualUzbek);
    const sentenceTranslationUzbek = compactText(data?.sentenceTranslationUzbek || data?.sentenceUzbek, 620);
    const example = compactText(data?.example || data?.exampleSentence, 260);
    const partOfSpeech = compactText(data?.partOfSpeech || data?.part_of_speech, 80);
    const pronunciation = compactText(data?.pronunciation || data?.phonetic || data?.ipa, 160);
    const synonyms = (Array.isArray(data?.synonyms) ? data.synonyms : [])
        .map((item) => compactText(item, 80)).filter(Boolean).slice(0, 12);
    const antonyms = (Array.isArray(data?.antonyms) ? data.antonyms : [])
        .map((item) => compactText(item, 80)).filter(Boolean).slice(0, 12);
    const normalized = normalizeVocabularyWord(selectedText);

    return {
        selectedText,
        meaningInEnglish,
        uzbekTranslation,
        contextualMeaningUzbek,
        sentenceTranslationUzbek,
        example,
        partOfSpeech,
        pronunciation,
        phonetic: pronunciation,
        synonyms,
        antonyms,
        word: selectedText,
        normalized,
        normalized_word: normalized,
        definition: meaningInEnglish,
        english_definition: meaningInEnglish,
        uzbek_translation: contextualMeaningUzbek || uzbekTranslation,
        translation: contextualMeaningUzbek || uzbekTranslation,
        example_sentence: example,
        source: compactText(data?.source || "gpt_context", 80),
        testId: payload.testId,
        passageId: payload.passageId,
        passage_id: payload.passageId
    };
}

function parseJsonObjectFromText(value) {
    const text = String(value || "").trim();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) {
            return null;
        }

        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
}

async function requestContextTranslationFromGpt(payload) {
    if (!OPENAI_API_KEY) {
        const error = new Error("OPENAI_API_KEY is not configured");
        error.statusCode = 503;
        throw error;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: OPENAI_TRANSLATION_MODEL,
            temperature: 0.2,
            max_tokens: 550,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: [
                        "You help IELTS Reading learners understand vocabulary in context.",
                        "Return only valid JSON.",
                        "Keep every field short and useful.",
                        "Choose the meaning that fits the supplied sentence and paragraph.",
                        "Use natural Uzbek, not literal word-by-word translation.",
                        "For Uzbek fields, return only the translation phrase.",
                        "Do not include explanations, commentary, labels, or phrases like 'bu kontekstdagi ma'nosi'."
                    ].join(" ")
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        task: "Translate the selected IELTS Reading word or phrase in context.",
                        selectedText: payload.selectedText,
                        sentence: payload.sentence,
                        paragraph: payload.paragraph,
                        rules: [
                            "contextualMeaningUzbek must be only the selected text's short Uzbek meaning in this context, ideally 1-4 words.",
                            "uzbekTranslation must be a short natural Uzbek translation, ideally 1-4 words.",
                            "meaningInEnglish must be a short simple English explanation.",
                            "Do not translate the whole sentence.",
                            "Do not add notes, explanations, or 'means in this context' style wording."
                        ],
                        requiredJsonShape: {
                            selectedText: "string",
                            meaningInEnglish: "short simple English meaning",
                            uzbekTranslation: "short natural Uzbek translation only",
                            contextualMeaningUzbek: "short contextual Uzbek translation only",
                            partOfSpeech: "noun/verb/adjective/adverb/etc",
                            pronunciation: "IPA pronunciation",
                            example: "one short simple English example sentence",
                            synonyms: ["up to four relevant synonyms"],
                            antonyms: ["up to four relevant antonyms when useful"]
                        }
                    })
                }
            ]
        })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(body?.error?.message || "OpenAI translation request failed");
        error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
        throw error;
    }

    const content = body?.choices?.[0]?.message?.content || "";
    const parsed = parseJsonObjectFromText(content);
    const record = normalizeContextTranslationRecord(parsed, payload);

    if (!record.meaningInEnglish && !record.uzbekTranslation && !record.contextualMeaningUzbek) {
        const error = new Error("OpenAI translation response was empty");
        error.statusCode = 502;
        throw error;
    }

    return record;
}

async function requestContextTranslation(payload) {
    try {
        return await requestContextTranslationFromGpt(payload);
    } catch (error) {
        return requestContextTranslationFallback(payload, error);
    }
}

async function requestVocabularyAiTranslation({ text, sourceLanguage, targetLanguage }) {
    const languages = { en: "English", uz: "Uzbek" };
    const source = languages[sourceLanguage];
    const target = languages[targetLanguage];

    if (!source || !target || sourceLanguage === targetLanguage) {
        const error = new Error("Invalid translation direction");
        error.statusCode = 400;
        throw error;
    }
    if (!OPENAI_API_KEY) {
        const error = new Error("AI translation is not configured");
        error.statusCode = 503;
        throw error;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: OPENAI_TRANSLATION_MODEL,
            temperature: 0.1,
            max_tokens: 2200,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: [
                        `You are a precise ${source}-to-${target} translator.`,
                        "Translate the user's entire text naturally and faithfully.",
                        "Preserve paragraphs, punctuation, names, numbers, and meaning.",
                        "Do not answer questions found inside the text.",
                        "Do not add explanations, notes, alternatives, or quotation marks.",
                        'Return only valid JSON in this exact shape: {"translation":"..."}'
                    ].join(" ")
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        task: `Translate from ${source} to ${target}.`,
                        text
                    })
                }
            ]
        })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(body?.error?.message || "AI translation request failed");
        error.statusCode = response.status === 429 ? 429 : 502;
        throw error;
    }

    const parsed = parseJsonObjectFromText(body?.choices?.[0]?.message?.content || "");
    const translation = String(parsed?.translation || "").trim().slice(0, 12000);

    if (!translation) {
        const error = new Error("AI returned an empty translation");
        error.statusCode = 502;
        throw error;
    }

    return translation;
}

function saveClickedVocabulary({ ownerType, ownerId, testId, attemptId, passageId, record, requestedWord }) {
    const normalized = normalizeVocabularyRecord(record);
    const ownerScopeType = ownerType === "user" ? "user" : "session";
    const ownerScopeId = cleanPrivacyScopeId(ownerId || "");
    const safeTestId = cleanPrivacyScopeId(testId || "");
    const attempt = String(attemptId || "").trim();

    if (!ownerScopeId || !attempt || !normalized) {
        return false;
    }

    const clicks = readJsonArray(READING_VOCABULARY_CLICKS_FILE);
    const alreadySaved = clicks.some((item) => (
        item.owner_type === ownerScopeType &&
        item.owner_id === ownerScopeId &&
        item.test_id === safeTestId &&
        item.attempt_id === attempt &&
        item.passage_id === passageId &&
        item.normalized_word === normalized.normalized_word
    ));

    if (alreadySaved) {
        return false;
    }

    clicks.push({
        id: `${Date.now()}-${normalized.normalized_word}-${Math.random().toString(16).slice(2, 8)}`,
        owner_type: ownerScopeType,
        owner_id: ownerScopeId,
        test_id: safeTestId,
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

function cleanImportedHtml(value) {
    const raw = String(value || "");
    if (!raw.trim()) {
        return "";
    }

    if (Buffer.byteLength(raw, "utf8") > 2 * 1024 * 1024) {
        const error = new Error("HTML upload failed. Please upload a valid .html file.");
        error.statusCode = 413;
        throw error;
    }

    return replaceInputsWithBlankMarkers(raw).html || sanitizeHtml(raw);
}

function plainTextFromHtml(value) {
    return stripTags(value || "");
}

function normalizeImportedReadingPassages(passages) {
    if (!Array.isArray(passages)) {
        return [];
    }

    return passages
        .map((passage, index) => {
            const html = cleanImportedHtml(passage.html || passage.passageHtml || passage.sourceHtml || "");
            const passageText = String(passage.passageText || plainTextFromHtml(html)).trim();
            const paragraphs = Array.isArray(passage.paragraphs)
                ? passage.paragraphs.map((paragraph) => {
                    const paragraphHtml = cleanImportedHtml(paragraph.html || "");
                    const text = String(paragraph.text || plainTextFromHtml(paragraphHtml)).trim();

                    if (!paragraphHtml && !text) {
                        return null;
                    }

                    return {
                        letter: paragraph.letter || null,
                        html: paragraphHtml,
                        text
                    };
                }).filter(Boolean)
                : [];

            if (!paragraphs.length && html) {
                paragraphs.push({
                    letter: null,
                    html,
                    text: passageText
                });
            }

            if (!html && !paragraphs.length && !passageText) {
                return null;
            }

            return {
                id: String(passage.id || `rich-passage-${index + 1}`),
                number: Number(passage.number) || index + 1,
                title: String(passage.title || passage.passageTitle || `Reading Passage ${index + 1}`),
                displayLabel: String(passage.displayLabel || `Reading Passage ${Number(passage.number) || index + 1}`),
                passageText,
                html,
                passageHtml: html,
                paragraphs
            };
        })
        .filter(Boolean);
}

function normalizeImportedListeningParts(parts) {
    return (Array.isArray(parts) ? parts : []).map((part) => ({
        ...part,
        html: cleanImportedHtml(part.html || part.listeningHtml || part.questionsHtml || "")
    }));
}

function buildManualReadingTest(body) {
    const part = normalizePart(body.part);
    let title = String(body.title || "").trim();
    if (part === "full") {
        const existingCount = readManualReadingTests().filter(t => t.part === "full").length;
        title = title || `Test ${existingCount + 1}`;
    }

    if (!title) {
        const error = new Error("Test title is required");
        error.statusCode = 400;
        throw error;
    }

    const passage = String(body.passage || body.passageText || "").trim();
    const passageTitle = String(body.passageTitle || body.passage_title || "").trim();
    const readingHtml = cleanImportedHtml(body.readingHtml || "");
    const passageHtml = cleanImportedHtml(body.passageHtml || "");
    const richPassages = normalizeImportedReadingPassages(body.richPassages);

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
        readingHtml,
        passageHtml,
        richPassages,
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

function shiftNewestManualReadingTitles() {
    readManualReadingTests()
        .map((test) => ({
            test,
            match: String(test?.title || "").match(/^Test\s+(\d+)$/i)
        }))
        .filter(({ test, match }) => test?.part === "full" && match)
        .sort((a, b) => Number(b.match[1]) - Number(a.match[1]))
        .forEach(({ test, match }) => {
            test.title = `Test ${Number(match[1]) + 1}`;
            saveManualReadingTest(test);

            if (test.sourceFullTestId) {
                const sourceFullTest = fullTestStore.read(test.sourceFullTestId);
                if (sourceFullTest) {
                    sourceFullTest.title = test.title;
                    fullTestStore.save(sourceFullTest);
                }
            }
        });
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

function readManualReadingTestSummaries() {
    if (!fs.existsSync(READING_TESTS_DIR)) {
        return [];
    }

    const tests = fs.readdirSync(READING_TESTS_DIR)
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
            const filePath = path.join(READING_TESTS_DIR, file);
            try {
                const prefix = readFilePrefix(filePath);
                const stat = fs.statSync(filePath);
                const id = jsonStringField(prefix, "id") || path.basename(file, ".json");
                const part = String(jsonStringField(prefix, "part") || jsonNumberField(prefix, "part") || "1");
                if (jsonBooleanField(prefix, "mockOnly") || jsonBooleanField(prefix, "mockTestOnly")) {
                    return null;
                }
                return publicListMetadata({
                    id,
                    title: jsonStringField(prefix, "title") || "Untitled Reading Test",
                    testNumber: jsonNumberField(prefix, "testNumber"),
                    type: part === "full" ? "reading-full" : "reading",
                    status: jsonStringField(prefix, "status") || "published",
                    createdAt: jsonStringField(prefix, "createdAt") || stat.mtime.toISOString(),
                    extra: {
                        part,
                        openUrl: publicIdUrl("reading", id),
                        slug: id
                    }
                });
            } catch (error) {
                console.warn(`Could not read reading metadata ${file}:`, error.message);
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return tests;
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
        "rich_content",
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

    const normalized = {
        ...JSON.parse(JSON.stringify(block || {})),
        id: String(block?.id || `block-${Date.now()}-${blockIndex + 1}`),
        type
    };

    if (type === "rich_content") {
        normalized.html = cleanImportedHtml(normalized.html || "");
    }

    return normalized;
}

function buildStructuredListeningTest(body) {
    const source = typeof body.data === "string" ? JSON.parse(body.data) : body;
    const title = String(source.title || "").trim();
    const listeningHtml = cleanImportedHtml(source.listeningHtml || source.questionsHtml || "");
    const requestedPart = source.part !== undefined
        ? normalizeListeningPart(source.part)
        : "full";
    const duration = listeningDurationForPart(requestedPart);
    const fullAudioUrl = String(source.fullAudioUrl || "").trim();

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
        audioUrls: Array.isArray(part.audioUrls)
            ? part.audioUrls.map((audioUrl) => String(audioUrl || "").trim()).filter(Boolean)
            : [],
        audioFileName: String(part.audioFileName || ""),
        audioDuration: part.audioDuration !== null && part.audioDuration !== undefined && part.audioDuration !== ""
            && Number.isFinite(Number(part.audioDuration))
            ? Number(part.audioDuration)
            : null,
        html: cleanImportedHtml(part.html || part.listeningHtml || part.questionsHtml || ""),
        instruction: String(part.instruction || ""),
        transcriptText: String(part.transcriptText || part.transcript || "").slice(0, 100000),
        transcriptSegments: normalizeTranscriptSegments(part.transcriptSegments),
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

    savedParts.forEach((part) => validateStructuredListeningPart(part, {
        allowMissingAudio: requestedPart === "full" && Boolean(fullAudioUrl)
    }));
    const questions = savedParts.flatMap(structuredListeningQuestionsForPart);

    return {
        id: source.id || makeId(title),
        title,
        duration,
        part: requestedPart,
        fullAudioUrl,
        fullAudioFileName: String(source.fullAudioFileName || ""),
        audio: fullAudioUrl || savedParts[0]?.audioUrl || "",
        listeningHtml,
        questionsHtml: listeningHtml,
        assetFiles: [fullAudioUrl, ...savedParts
            .flatMap((part) => [part.audioUrl, ...(part.audioUrls || [])])]
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

    const acceptedAnswers = normalizeListeningAcceptedAnswers(
        rawQuestion.acceptedAnswers || rawQuestion.alternativeAcceptedAnswers || answer
    );

    return {
        number,
        type,
        question: String(rawQuestion.question || rawQuestion.text || "").trim(),
        options: optionsForListeningType(type, rawQuestion.options),
        answer: acceptedAnswers.join(" | ") || (Array.isArray(answer) ? answer.join(" | ") : String(answer || "").trim()),
        correctAnswer: String(rawQuestion.correctAnswer || acceptedAnswers[0] || "").trim(),
        acceptedAnswers,
        relevantText: String(rawQuestion.relevantText || "").trim(),
        explanation: String(rawQuestion.explanation || "").trim(),
        transcriptStartTime: rawQuestion.transcriptStartTime ?? rawQuestion.evidenceStartTime ?? null,
        transcriptEndTime: rawQuestion.transcriptEndTime ?? rawQuestion.evidenceEndTime ?? null
    };
}

function normalizeListeningAcceptedAnswers(value) {
    const values = Array.isArray(value) ? value : String(value || "").split(/\s*(?:\||;|\n)\s*|\s+\/\s+/);
    return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
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
        title = title || `Test ${existingCount + 1}`;
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
    if (test.fullAudioUrl) {
        assets.add(test.fullAudioUrl);
    }

    (Array.isArray(test.parts) ? test.parts : []).forEach((part) => {
        if (part.audioUrl) {
            assets.add(part.audioUrl);
        }
        (Array.isArray(part.audioUrls) ? part.audioUrls : []).forEach((audioUrl) => assets.add(audioUrl));
    });

    return [...assets]
        .map(resolveUploadedAssetPath)
        .filter((assetPath) => assetPath && fs.existsSync(assetPath));
}

function inspectStructuredQuestion(value, number, context = {}) {
    if (typeof value === "string") {
        if (value.includes(`{{${number}}}`)) {
            const questionEvidence = context.questionEvidence?.[String(number)]
                || context.questionEvidence?.[number]
                || {};
            const linkedEvidence = transcriptEvidence(
                context.transcriptSegments,
                questionEvidence.transcriptSegmentIds,
                questionEvidence
            );
            return {
                question: value.replace(new RegExp(`\\{\\{${number}\\}\\}`, "g"), "_____"),
                options: [],
                questionGroupId: context.questionGroupId || "",
                instructions: context.instructions || "",
                imageUrl: context.imageUrl || "",
                evidenceStartTime: questionEvidence.evidenceStartTime ?? context.evidenceStartTime ?? null,
                evidenceEndTime: questionEvidence.evidenceEndTime ?? context.evidenceEndTime ?? null,
                transcriptStartTime: linkedEvidence.transcriptStartTime ?? questionEvidence.evidenceStartTime
                    ?? context.transcriptStartTime ?? context.evidenceStartTime ?? null,
                transcriptEndTime: linkedEvidence.transcriptEndTime ?? questionEvidence.evidenceEndTime
                    ?? context.transcriptEndTime ?? context.evidenceEndTime ?? null,
                correctAnswer: String(questionEvidence.correctAnswer || "").trim(),
                acceptedAnswers: normalizeListeningAcceptedAnswers(questionEvidence.acceptedAnswers),
                relevantText: linkedEvidence.relevantText,
                transcriptSegmentIds: linkedEvidence.transcriptSegmentIds,
                explanation: String(questionEvidence.explanation || "").trim()
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
        options: value.options || context.options || [],
        questionGroupId: value.questionGroupId || value.id || context.questionGroupId || "",
        instructions: value.instructions || value.instruction || context.instructions || "",
        imageUrl: value.imageUrl || context.imageUrl || "",
        evidenceStartTime: value.evidenceStartTime ?? context.evidenceStartTime ?? null,
        evidenceEndTime: value.evidenceEndTime ?? context.evidenceEndTime ?? null,
        transcriptStartTime: value.transcriptStartTime ?? context.transcriptStartTime ?? null,
        transcriptEndTime: value.transcriptEndTime ?? context.transcriptEndTime ?? null,
        correctAnswer: value.correctAnswer || context.correctAnswer || "",
        acceptedAnswers: value.acceptedAnswers || context.acceptedAnswers || [],
        relevantText: value.relevantText || context.relevantText || "",
        explanation: value.explanation || context.explanation || "",
        transcriptSegments: value.transcriptSegments || context.transcriptSegments || [],
        questionEvidence: value.questionEvidence || context.questionEvidence || {}
    };

    if (Number(value.questionNumber) === number) {
        const questionEvidence = nextContext.questionEvidence?.[String(number)]
            || nextContext.questionEvidence?.[number]
            || {};
        const linkedEvidence = transcriptEvidence(
            nextContext.transcriptSegments,
            questionEvidence.transcriptSegmentIds,
            questionEvidence
        );
        return {
            question: nextContext.question || nextContext.label || nextContext.title || `Listening question ${number}`,
            options: (nextContext.options || []).map((option) => (
                typeof option === "string" ? option : option.text || option.label || option.letter || ""
            )).filter(Boolean),
            questionGroupId: nextContext.questionGroupId,
            instructions: nextContext.instructions,
            imageUrl: nextContext.imageUrl,
            evidenceStartTime: questionEvidence.evidenceStartTime ?? nextContext.evidenceStartTime,
            evidenceEndTime: questionEvidence.evidenceEndTime ?? nextContext.evidenceEndTime,
            transcriptStartTime: linkedEvidence.transcriptStartTime ?? questionEvidence.evidenceStartTime
                ?? nextContext.transcriptStartTime ?? nextContext.evidenceStartTime ?? null,
            transcriptEndTime: linkedEvidence.transcriptEndTime ?? questionEvidence.evidenceEndTime
                ?? nextContext.transcriptEndTime ?? nextContext.evidenceEndTime ?? null,
            correctAnswer: String(questionEvidence.correctAnswer || nextContext.correctAnswer || "").trim(),
            acceptedAnswers: normalizeListeningAcceptedAnswers(
                questionEvidence.acceptedAnswers || nextContext.acceptedAnswers
            ),
            relevantText: linkedEvidence.relevantText || String(nextContext.relevantText || "").trim(),
            transcriptSegmentIds: linkedEvidence.transcriptSegmentIds,
            explanation: String(questionEvidence.explanation || nextContext.explanation || "").trim()
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
        .filter((number) => {
            const context = inspectStructuredQuestion(part.blocks || [], number, {
                transcriptSegments: part.transcriptSegments || []
            }) || {};
            return Boolean(answers[String(number)] || context.correctAnswer || (context.acceptedAnswers || []).length);
        })
        .map((number) => {
            const context = inspectStructuredQuestion(part.blocks || [], number, {
                transcriptSegments: part.transcriptSegments || []
            }) || {};
            const storedAnswers = normalizeListeningAcceptedAnswers(answers[String(number)]);
            const acceptedAnswers = normalizeListeningAcceptedAnswers([
                context.correctAnswer,
                ...(context.acceptedAnswers || []),
                ...storedAnswers
            ]);
            return {
                number,
                type: context.options?.length ? "multiple_choice" : "sentence_completion",
                question: context.question || `Listening question ${number}`,
                options: context.options || [],
                answer: acceptedAnswers.join(" | "),
                correctAnswer: context.correctAnswer || acceptedAnswers[0] || "",
                acceptedAnswers,
                relevantText: context.relevantText || "",
                explanation: context.explanation || "",
                partNumber: Number(part.partNumber) || null,
                questionGroupId: context.questionGroupId || "",
                instructions: context.instructions || part.instruction || "",
                imageUrl: context.imageUrl || "",
                audioUrl: part.audioUrl || "",
                transcriptText: part.transcriptText || part.transcript || "",
                transcriptSegments: normalizeTranscriptSegments(part.transcriptSegments),
                transcriptSegmentIds: normalizeTranscriptSegmentIds(context.transcriptSegmentIds),
                evidenceStartTime: context.evidenceStartTime ?? null,
                evidenceEndTime: context.evidenceEndTime ?? null,
                transcriptStartTime: context.transcriptStartTime ?? context.evidenceStartTime ?? null,
                transcriptEndTime: context.transcriptEndTime ?? context.evidenceEndTime ?? null
            };
        });
}

function validateStructuredListeningPart(part, options = {}) {
    const partNumber = Number(part.partNumber) || 1;
    const answers = parseAnswerLines(part.answerText || part.answersText || "");

    const partAudioUrls = Array.isArray(part.audioUrls) ? part.audioUrls.filter(Boolean) : [];
    if (!options.allowMissingAudio && !String(part.audioUrl || "").trim() && !partAudioUrls.length) {
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
    const missingAnswers = numbers.filter((number) => {
        const context = inspectStructuredQuestion(part.blocks || [], number) || {};
        return !answers[String(number)] && !context.correctAnswer && !(context.acceptedAnswers || []).length;
    });
    if (missingAnswers.length) {
        const error = new Error(`[Part ${partNumber}] Question ${missingAnswers[0]} is missing a correct answer.`);
        error.statusCode = 400;
        throw error;
    }

    // 3. Check unsupported question types and empty question text
    const allowedListeningTypes = [
        "form_completion",
        "rich_content",
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

const mockTestStore = createMockTestStore({
    testsFile: MOCK_TESTS_FILE,
    resultsFile: MOCK_TEST_RESULTS_FILE
});

function mockTestIdFromAdapterId(value, prefix) {
    const id = String(value || "").trim();
    return id.startsWith(prefix) ? id.slice(prefix.length) : "";
}

function getMockTestFromAdapterId(value, prefix) {
    const testId = mockTestIdFromAdapterId(value, prefix);
    return testId ? mockTestStore.getTest(testId, { includeDraft: true }) : null;
}

function clonePlain(value) {
    if (!value) return value;
    return JSON.parse(JSON.stringify(value));
}

function documentObject(doc) {
    return typeof doc?.toObject === "function" ? doc.toObject() : doc;
}

function collectScoringQuestions(test) {
    if (Array.isArray(test?.questions)) return test.questions;
    if (Array.isArray(test?.questionGroups)) {
        return test.questionGroups.flatMap((group) => group.questions || []);
    }
    if (Array.isArray(test?.parts)) {
        return test.parts.flatMap((part) => (
            Array.isArray(part.questions) && part.questions.length
                ? part.questions
                : structuredListeningQuestionsForPart(part)
        ));
    }
    return [];
}

async function findByIdSafe(model, id) {
    if (!id) return null;
    try {
        return await model.findById(id);
    } catch {
        return null;
    }
}

async function buildMockScoringTest(mockTest) {
    const listening = mockTest?.listeningTestId ? getListeningTestById(mockTest.listeningTestId) : null;
    const reading = mockTest?.readingTestId ? getReadingTestById(mockTest.readingTestId) : null;

    return {
        ...mockTest,
        listeningQuestions: collectScoringQuestions(listening),
        readingQuestions: collectScoringQuestions(reading)
    };
}

function normalizeMockQuestionType(type, fallback = "sentence_completion") {
    return String(type || fallback)
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function mockAnswerValue(answer) {
    if (Array.isArray(answer)) {
        return answer.map((item) => String(item || "").trim()).filter(Boolean).join(" | ");
    }

    return String(answer || "").trim();
}

function mockQuestionText(question, fallback) {
    return String(question?.prompt || question?.question || question?.text || fallback || "").trim();
}

function optionLetter(index) {
    return String.fromCharCode(65 + index);
}

function mockListeningOptions(question) {
    return (Array.isArray(question?.options) ? question.options : [])
        .map((option, index) => {
            const value = String(option?.value || option?.letter || optionLetter(index)).trim();
            const text = String(option?.text || option?.label || option?.value || value).trim();
            return {
                letter: value || optionLetter(index),
                text: text || value || optionLetter(index)
            };
        })
        .filter((option) => option.letter || option.text);
}

function questionRangeLabel(questions) {
    const numbers = (questions || []).map((question) => Number(question.number)).filter(Number.isFinite);
    if (!numbers.length) return "Questions";
    const first = Math.min(...numbers);
    const last = Math.max(...numbers);
    return first === last ? `Question ${first}` : `Questions ${first}-${last}`;
}

function listeningCompletionLine(question) {
    const number = Number(question.number) || 1;
    const prompt = mockQuestionText(question, `Listening question ${number}`);

    if (/\{\{\d{1,2}\}\}/.test(prompt)) {
        return prompt;
    }

    if (/_{2,}/.test(prompt)) {
        return prompt.replace(/_{2,}/, `{{${number}}}`);
    }

    return `${prompt} {{${number}}}`;
}

function mockListeningBlocksForPart(part) {
    const blocks = [];
    const completionQuestions = [];
    let choiceQuestions = [];
    let matchingQuestions = [];

    function flushChoiceQuestions() {
        if (!choiceQuestions.length) return;
        blocks.push({
            id: `mock-mcq-${part.partNumber}-${blocks.length + 1}`,
            type: "multiple_choice",
            questionRange: questionRangeLabel(choiceQuestions),
            instruction: "Choose the correct answer.",
            questions: choiceQuestions.map((question) => ({
                questionNumber: Number(question.number),
                question: mockQuestionText(question, `Listening question ${question.number}`),
                options: mockListeningOptions(question)
            }))
        });
        choiceQuestions = [];
    }

    function flushMatchingQuestions() {
        if (!matchingQuestions.length) return;
        const optionMap = new Map();
        matchingQuestions.forEach((question) => {
            mockListeningOptions(question).forEach((option) => {
                if (!optionMap.has(option.letter)) optionMap.set(option.letter, option);
            });
        });
        blocks.push({
            id: `mock-matching-${part.partNumber}-${blocks.length + 1}`,
            type: "matching",
            title: part.title || `Part ${part.partNumber}`,
            questionRange: questionRangeLabel(matchingQuestions),
            instruction: part.instruction || "Choose the correct option.",
            imageUrl: part.imageUrl || "",
            options: [...optionMap.values()],
            questions: matchingQuestions.map((question) => ({
                questionNumber: Number(question.number),
                text: mockQuestionText(question, `Listening question ${question.number}`)
            }))
        });
        matchingQuestions = [];
    }

    (part.questions || []).forEach((question) => {
        const type = normalizeMockQuestionType(question.type, "sentence_completion");
        const hasOptions = mockListeningOptions(question).length > 0;

        if (!hasOptions) {
            flushChoiceQuestions();
            flushMatchingQuestions();
            completionQuestions.push(question);
            return;
        }

        if (["matching", "map_diagram_labeling", "map_labeling", "map_labelling", "diagram_labeling", "diagram_labelling"].includes(type)) {
            flushChoiceQuestions();
            matchingQuestions.push(question);
            return;
        }

        flushMatchingQuestions();
        choiceQuestions.push(question);
    });

    flushChoiceQuestions();
    flushMatchingQuestions();

    if (completionQuestions.length) {
        blocks.push({
            id: `mock-completion-${part.partNumber}-${blocks.length + 1}`,
            type: "sentence_completion_inline",
            questionRange: questionRangeLabel(completionQuestions),
            instruction: part.instruction || "Complete the sentences below.",
            content: completionQuestions.map(listeningCompletionLine)
        });
    }

    return blocks;
}

function buildMockListeningTest(id) {
    const mockTest = getMockTestFromAdapterId(id, "mock-listening-");
    if (!mockTest) return null;

    const sourceTest = getListeningTestById(mockTest.listeningTestId);
    if (!sourceTest) return null;

    const selected = clonePlain(sourceTest);
    const parts = Array.isArray(selected.parts) ? selected.parts : [];
    const questions = Array.isArray(selected.questions)
        ? selected.questions
        : parts.flatMap(structuredListeningQuestionsForPart);
    const sections = Array.isArray(selected.sections) && selected.sections.length
        ? selected.sections
        : parts.map((part) => ({
            title: part.questionRange || part.title || `Part ${part.partNumber}`,
            instruction: part.instruction || "",
            rule: "",
            questionNumbers: structuredListeningQuestionsForPart(part).map((question) => question.number)
        }));

    return {
        ...selected,
        id,
        title: `${mockTest.title} - Listening`,
        headerTitle: "Academic Listening",
        dashboardHref: `/mock-test/${encodeURIComponent(mockTest.id)}`,
        duration: Number(selected.duration) || listeningDurationForPart(selected.part || "full"),
        part: selected.part || "full",
        audio: selected.fullAudioUrl || selected.audio || parts.find((part) => part.audioUrl)?.audioUrl || "",
        parts,
        questions,
        sections,
        sourceTestId: selected.id,
        createdAt: mockTest.createdAt,
        updatedAt: mockTest.updatedAt
    };
}

function mockReadingType(question) {
    const type = normalizeMockQuestionType(question?.type, "sentence_completion");
    const supported = new Set([
        "true_false_not_given",
        "yes_no_not_given",
        "multiple_choice",
        "multi_select",
        "summary_completion",
        "sentence_completion",
        "matching_headings",
        "matching_information",
        "short_answer",
        "diagram_labeling",
        "table_completion",
        "notes_completion",
        "note_completion",
        "form_completion"
    ]);

    if (type === "fill_in_the_blank") return "sentence_completion";
    if (type === "map_diagram_labeling" || type === "map_labeling" || type === "map_labelling" || type === "diagram_labelling") return "diagram_labeling";
    if (supported.has(type)) return type;
    return Array.isArray(question?.options) && question.options.length ? "multiple_choice" : "sentence_completion";
}

function mockReadingOptions(question, type) {
    if (type === "true_false_not_given") {
        return ["TRUE", "FALSE", "NOT GIVEN"].map((value) => ({ value, label: value }));
    }

    if (type === "yes_no_not_given") {
        return ["YES", "NO", "NOT GIVEN"].map((value) => ({ value, label: value }));
    }

    return (Array.isArray(question?.options) ? question.options : [])
        .map((option, index) => {
            const value = String(option?.value || option?.letter || optionLetter(index)).trim();
            const text = String(option?.text || option?.label || option?.value || value).trim();
            const label = text && text !== value ? `${value}. ${text}` : (text || value);

            return {
                value: value || optionLetter(index),
                label: label || value || optionLetter(index)
            };
        })
        .filter((option) => option.value || option.label);
}

function mockReadingQuestion(question, forcedNumber) {
    const type = mockReadingType(question);
    const number = Number(forcedNumber) || Number(question.number) || 1;

    return {
        number,
        type,
        question: mockQuestionText(question, `Reading question ${number}`),
        options: mockReadingOptions(question, type),
        answer: mockAnswerValue(question.answer)
    };
}

function mockReadingGroupsForPassage(passage, questions) {
    const groups = [];

    questions.forEach((question) => {
        const last = groups[groups.length - 1];
        if (!last || last.type !== question.type) {
            groups.push({
                type: question.type,
                title: questionRangeLabel([question]),
                instruction: "",
                rule: "",
                questionNumbers: [question.number],
                questions: [question]
            });
        } else {
            last.questionNumbers.push(question.number);
            last.questions.push(question);
            last.title = questionRangeLabel(last.questions);
        }
    });

    return groups.map((group) => ({
        ...group,
        title: group.title || `${passage.title || `Passage ${passage.number}`} Questions`
    }));
}

function buildMockReadingTest(id) {
    const mockTest = getMockTestFromAdapterId(id, "mock-reading-");
    if (!mockTest) return null;

    const sourceTest = getReadingTestById(mockTest.readingTestId);
    if (!sourceTest) return null;

    const selected = clonePlain(sourceTest);

    return {
        ...selected,
        id,
        title: `${mockTest.title} - Reading`,
        passageTitle: selected.passageTitle || `${mockTest.title} - Reading`,
        sourceTestId: selected.id,
        createdAt: mockTest.createdAt
    };
}

async function buildMockWritingFullTest(id) {
    const mockTest = getMockTestFromAdapterId(id, "mock-writing-");
    if (!mockTest) return null;

    let sourceTest = null;
    try {
        sourceTest = await WritingFullTest.findById(mockTest.writingTestId)
            .populate("task1PromptId")
            .populate("task2PromptId");
    } catch {
        sourceTest = null;
    }

    if (!sourceTest) {
        const inlineWriting = mockTest.writing && typeof mockTest.writing === "object"
            ? mockTest.writing
            : null;
        const task1Prompt = inlineWriting?.task1Prompt || inlineWriting?.task1;
        const task2Prompt = inlineWriting?.task2Prompt || inlineWriting?.task2;
        if (!task1Prompt?.promptText || !task2Prompt?.promptText) return null;

        return {
            _id: id,
            id,
            title: `${mockTest.title} - Writing`,
            status: "published",
            access: mockTest.access || (mockTest.isPremium ? "premium" : "free"),
            isPremium: mockTest.isPremium === true || mockTest.access === "premium",
            timeLimit: Number(inlineWriting.timeLimit) || 60,
            __mockWritingTest: true,
            sourceTestId: String(mockTest.writingTestId || id),
            task1PromptId: {
                ...task1Prompt,
                _id: `${id}-task1`,
                status: "published",
                mockOnly: true
            },
            task2PromptId: {
                ...task2Prompt,
                _id: `${id}-task2`,
                status: "published",
                mockOnly: true
            }
        };
    }

    const selected = documentObject(sourceTest);

    return {
        _id: id,
        id,
        title: `${mockTest.title} - Writing`,
        status: "published",
        access: mockTest.access || (mockTest.isPremium ? "premium" : "free"),
        isPremium: mockTest.isPremium === true || mockTest.access === "premium",
        timeLimit: Number(selected.timeLimit) || 60,
        __mockWritingTest: true,
        sourceTestId: String(selected._id || mockTest.writingTestId),
        task1PromptId: selected.task1PromptId,
        task2PromptId: selected.task2PromptId
    };
}

function normalizeSpeakingTextItems(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(typeof item === "string" ? item : item?.text || "").trim())
        .filter(Boolean);
}

function parseSpeakingMinutes(value, fallbackMinutes) {
    const raw = String(value || "").trim();
    const match = raw.match(/(\d+(?:\.\d+)?)/);
    if (!match) return fallbackMinutes;
    const minutes = Number(match[1]);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : fallbackMinutes;
}

function speakingSeconds(value, fallbackMinutes) {
    return Math.round(parseSpeakingMinutes(value, fallbackMinutes) * 60);
}

async function buildMockSpeakingFullTest(mockTest) {
    let sourceTest = null;
    try {
        sourceTest = await FullSpeakingTest.findById(mockTest.speakingTestId)
            .populate("part1Id")
            .populate("part2Id")
            .populate("part3Id");
    } catch {
        sourceTest = null;
    }

    if (!sourceTest) return null;

    const selected = documentObject(sourceTest);
    const part1 = selected.part1Id ? documentObject(selected.part1Id) : null;
    const part2 = selected.part2Id ? documentObject(selected.part2Id) : null;
    const part3 = selected.part3Id ? documentObject(selected.part3Id) : null;

    return {
        id: `mock-speaking-${mockTest.id}`,
        title: `${mockTest.title} - Speaking`,
        topic: [part1?.title, part2?.title, part3?.title].filter(Boolean).join(", "),
        description: "Complete Parts 1, 2, and 3 in one full AI-evaluated test.",
        estimatedTime: selected.estimatedTime || "11-14 min",
        aiFeedback: selected.aiFeedback !== false,
        sourceTestId: String(selected._id || mockTest.speakingTestId),
        parts: [
            part1 && {
                part: 1,
                title: `Part 1: ${part1.title || "Introduction and general questions"}`,
                duration: speakingSeconds(part1.speakingTime, 5),
                prompt: part1.description || "Answer general questions naturally.",
                questions: normalizeSpeakingTextItems(part1.questions)
            },
            part2 && {
                part: 2,
                title: `Part 2: ${part2.title || "Cue Card"}`,
                duration: speakingSeconds(part2.speakingTime, 2),
                preparation: speakingSeconds(part2.prepTime, 1),
                prompt: part2.instruction || part2.title || "",
                questions: normalizeSpeakingTextItems(part2.bulletPoints)
            },
            part3 && {
                part: 3,
                title: `Part 3: ${part3.title || "Follow-up discussion questions"}`,
                duration: speakingSeconds(part3.speakingTime, 5),
                prompt: part3.description || "Answer follow-up discussion questions.",
                questions: normalizeSpeakingTextItems(part3.questions)
            }
        ].filter(Boolean)
    };
}

async function buildMockSpeakingFullTests(options = {}) {
    const mockTests = mockTestStore.listTests({ includeDraft: Boolean(options.includeDraft) });
    const tests = await Promise.all(mockTests.map((mockTest) => buildMockSpeakingFullTest(mockTest)));
    return tests.filter(Boolean);
}

function hasMockHtmlImport(section) {
    const importValue = section?.htmlImport || {};
    return Boolean(importValue.enabled && String(importValue.html || importValue.sanitizedHtml || importValue.sourceHtml || "").trim());
}

function filled(value) {
    return String(value || "").trim().length > 0;
}

function questionIsComplete(question) {
    return filled(question?.prompt || question?.question || question?.text) && filled(question?.answer || question?.correctAnswer || question?.correct);
}

function validateMockTestBasics(test) {
    const errors = [];

    if (!filled(test?.title)) {
        errors.push("Mock Test title is required.");
    }

    if (!Number.isFinite(Number(test?.testNumber ?? test?.number)) || Number(test?.testNumber ?? test?.number) <= 0) {
        errors.push("Mock Test number is required.");
    }

    return errors;
}

async function validateMockTestPayload(payload) {
    const errors = validateMockTestBasics(payload);

    if (errors.length) {
        return errors;
    }

    const isActive = ["active", "published"].includes(String(payload?.status || "").trim().toLowerCase());

    if (isActive && (!filled(payload?.listeningTestId) || !filled(payload?.readingTestId) || !filled(payload?.writingTestId))) {
        errors.push("Please select Listening, Reading, and Writing tests. Speaking is generated automatically by AI.");
        return errors;
    }

    if (filled(payload.listeningTestId) && !getListeningTestById(payload.listeningTestId)) {
        errors.push("Selected Listening test was not found.");
    }

    if (filled(payload.readingTestId) && !getReadingTestById(payload.readingTestId)) {
        errors.push("Selected Reading test was not found.");
    }

    if (filled(payload.writingTestId) && !await findByIdSafe(WritingFullTest, payload.writingTestId)) {
        errors.push("Selected Writing test was not found.");
    }

    if (filled(payload.speakingTestId) && !await findByIdSafe(FullSpeakingTest, payload.speakingTestId)) {
        errors.push("Selected Speaking test was not found.");
    }

    return errors;
}

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

function readManualListeningTestSummaries() {
    if (!fs.existsSync(LISTENING_TESTS_DIR)) {
        return [];
    }

    const tests = fs.readdirSync(LISTENING_TESTS_DIR)
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
            const filePath = path.join(LISTENING_TESTS_DIR, file);
            try {
                const prefix = readFilePrefix(filePath);
                const stat = fs.statSync(filePath);
                const id = jsonStringField(prefix, "id") || path.basename(file, ".json");
                const title = jsonStringField(prefix, "title") || "Untitled Listening Test";
                const rawPart = jsonStringField(prefix, "part") || jsonNumberField(prefix, "part") || "full";
                const part = rawPart === "full" ? "full" : normalizeListeningPart(rawPart);
                const slug = routeBaseSlug({
                    id,
                    slug: jsonStringField(prefix, "slug"),
                    publicSlug: jsonStringField(prefix, "publicSlug"),
                    routeSlug: jsonStringField(prefix, "routeSlug"),
                    title
                });
                const openUrl = part === "full"
                    ? `/listening/${slug}`
                    : `/listening/${slug}/part-${part}`;
                if (jsonBooleanField(prefix, "mockOnly") || jsonBooleanField(prefix, "mockTestOnly")) {
                    return null;
                }
                return publicListMetadata({
                    id,
                    title,
                    testNumber: jsonNumberField(prefix, "testNumber"),
                    type: part === "full" ? "listening-full" : "listening",
                    status: jsonStringField(prefix, "status") || "published",
                    createdAt: jsonStringField(prefix, "createdAt") || stat.mtime.toISOString(),
                    extra: {
                        part,
                        sourceFullTestId: jsonStringField(prefix, "sourceFullTestId") || "",
                        duration: listeningDurationForPart(part),
                        openUrl,
                        slug,
                        readOnly: false
                    }
                });
            } catch (error) {
                console.warn(`Could not read listening metadata ${file}:`, error.message);
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return tests;
}

function summarizeManualListeningTest(test) {
    const part = test.part === "full" ? "full" : normalizeListeningPart(test.part);

    return {
        id: test.id,
        title: test.title,
        subtitle: test.subtitle || (part === "full" ? "Listening full test" : "Academic Listening practice"),
        part,
        audio: test.fullAudioUrl || test.audio || test.parts?.[0]?.audioUrl || "",
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
            if (isMockOnlyTest(test)) return;
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
            if (isMockOnlyTest(test)) return;
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
        if (isMockOnlyTest(test)) return;
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

    const findEntry = (slug, rawId = raw) => scopedEntries.find((entry) => entry.explicitSlug && entry.explicitSlug === slug)
        || scopedEntries.find((entry) => entry.publicSlug === slug)
        || scopedEntries.find((entry) => entry.generatedSlug && entry.generatedSlug === slug)
        || scopedEntries.find((entry) => String(entry.id) === rawId)
        || scopedEntries.find((entry) => slugify(entry.id || "", "") === slug)
        || null;

    const directEntry = findEntry(normalized);
    if (directEntry) {
        return directEntry;
    }

    const aliasTarget = PUBLIC_ROUTE_SLUG_ALIASES[skill]?.[normalized];
    if (aliasTarget) {
        const aliasEntry = findEntry(slugify(aliasTarget, ""), aliasTarget);
        return aliasEntry ? { ...aliasEntry, publicSlug: normalized } : null;
    }

    return null;
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

    if (routeSkill === "listening" && test.manualListeningTestId) {
        const manualEntry = publicEntryForTest("listening", "listening", test.manualListeningTestId);
        if (manualEntry) {
            return publicTestUrl("listening", "listening", manualEntry.test);
        }
    }

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

    readManualReadingTestSummaries().forEach((test) => {
        items.push({
            id: test.id,
            title: test.title,
            type: "reading",
            part: test.part,
            questionCount: Number(test.questionCount) || 0,
            createdAt: test.createdAt,
            openUrl: test.openUrl,
            editUrl: "admin-reading.html"
        });
    });

    readManualListeningTestSummaries().forEach((test) => {
        items.push({
            id: test.id,
            title: test.title,
            type: "listening",
            part: test.part,
            questionCount: Number(test.questionCount) || 0,
            createdAt: test.createdAt,
            openUrl: test.openUrl,
            editUrl: test.readOnly ? "" : `admin-listening.html?id=${encodeURIComponent(test.id)}`
        });
    });

    const fullSummaries = typeof fullTestStore.readSummaries === "function"
        ? fullTestStore.readSummaries()
        : fullTestStore.readAll().map((test) => fullTestStore.summarize(test));
    fullSummaries.forEach((summary) => {
        items.push({
            id: summary.id,
            title: summary.title,
            type: "full",
            part: "full",
            questionCount: Number(summary.questionCount) || 0,
            createdAt: summary.createdAt,
            openUrl: summary.openUrl,
            editUrl: "admin-import.html"
        });
    });

    mockTestStore.listTests({ includeDraft: true }).forEach((test) => {
        const summary = mockTestStore.adminSummary(test);

        items.push({
            id: test.id,
            title: summary.title,
            type: "mock",
            part: "full",
            questionCount: summary.listeningQuestionCount + summary.readingQuestionCount,
            createdAt: test.createdAt,
            openUrl: summary.openUrl,
            editUrl: `/admin-mock-tests?id=${encodeURIComponent(test.id)}`
        });
    });

    return items
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
}

async function getAdminStats() {
    const readingTests = readManualReadingTestSummaries().length;
    const listeningTests = readManualListeningTestSummaries().length;
    const fullTests = typeof fullTestStore.readSummaries === "function"
        ? fullTestStore.readSummaries().length
        : fullTestStore.readAll().length;
    const mockTests = mockTestStore.listTests({ includeDraft: true }).length;

    const users = await userStore.countUsers();

    return {
        users,
        readingTests,
        listeningTests,
        fullTests,
        mockTests
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

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
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

function requirePageAuth(req, res, next) {
    if (!req.user) {
        const redirectUrl = encodeURIComponent(req.originalUrl || req.url);
        return res.redirect(`/login?redirect=${redirectUrl}`);
    }
    next();
}

function premiumFeatureLabel(featureKey) {
    const labels = {
        speaking: "Speaking practice and AI evaluation",
        writing: "Writing practice and AI evaluation",
        fullMockTest: "Full IELTS Mock Tests",
        pdfResults: "PDF result downloads",
        progressStatistics: "Progress statistics",
        detailedBandFeedback: "Detailed IELTS band feedback",
        reviewMistakes: "Review Mistakes",
        vocabulary: "Vocabulary and AI Translate",
        studyPlan: "Study Plan",
        aiCoach: "AI Coach"
    };
    return labels[featureKey] || "This feature";
}

function requirePremiumFeaturePage(featureKey) {
    return (req, res, next) => {
        if (canAccessSubscriptionFeature(req.user, featureKey)) {
            return next();
        }

        setNoStorePageHeaders(res);
        res.sendFile(path.join(ROOT_DIR, "premium-locked.html"));
    };
}

function requirePremiumFeatureApi(featureKey) {
    return (req, res, next) => {
        if (canAccessSubscriptionFeature(req.user, featureKey)) {
            return next();
        }

        return res.status(403).json({
            error: "premium_required",
            code: "PREMIUM_REQUIRED",
            message: `${premiumFeatureLabel(featureKey)} requires Premium.`,
            feature: featureKey,
            upgradeUrl: "/premium"
        });
    };
}

function isOwnerUser(user) {
    const ownerEmails = String(process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || "")
        .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    return ownerEmails.includes(String(user?.email || "").trim().toLowerCase());
}

function canAccessStudyPlan(user) {
    return isAdminUser(user) || isOwnerUser(user) || canAccessSubscriptionFeature(user, "studyPlan");
}

function requireStudyPlanAccessApi(req, res, next) {
    if (canAccessStudyPlan(req.user)) return next();
    return res.status(403).json({
        error: "premium_required",
        code: "PREMIUM_REQUIRED",
        message: "Study Plan requires Premium.",
        feature: "studyPlan",
        upgradeUrl: "/premium"
    });
}

function requireStudyPlanAccessPage(req, res, next) {
    if (canAccessStudyPlan(req.user)) return next();
    setNoStorePageHeaders(res);
    return res.sendFile(path.join(ROOT_DIR, "study-plan-premium-locked.html"));
}

function canAccessReviewMistakesFeature(user) {
    return isAdminUser(user) || canAccessSubscriptionFeature(user, "reviewMistakes");
}

function requireReviewMistakesPremiumPage(req, res, next) {
    if (canAccessReviewMistakesFeature(req.user)) return next();
    setNoStorePageHeaders(res);
    return res.sendFile(path.join(ROOT_DIR, "review-mistakes-premium-locked.html"));
}

function requireReviewMistakesPremiumApi(req, res, next) {
    if (canAccessReviewMistakesFeature(req.user)) return next();
    return res.status(403).json({
        error: "premium_required",
        code: "PREMIUM_REQUIRED",
        message: "Review Mistakes requires Premium.",
        feature: "reviewMistakes",
        upgradeUrl: "/premium"
    });
}

function canAccessVocabularyFeature(user) {
    return isAdminUser(user) || canAccessSubscriptionFeature(user, "vocabulary");
}

function requireVocabularyPremiumPage(req, res, next) {
    if (canAccessVocabularyFeature(req.user)) return next();
    setNoStorePageHeaders(res);
    return res.sendFile(path.join(ROOT_DIR, "vocabulary-premium-locked.html"));
}

function requireVocabularyPremiumApi(req, res, next) {
    if (canAccessVocabularyFeature(req.user)) return next();
    return res.status(403).json({
        error: "premium_required",
        code: "PREMIUM_REQUIRED",
        message: "Saving words requires Premium.",
        feature: "vocabulary",
        upgradeUrl: "/premium",
        lockedUrl: "/vocabulary"
    });
}

function mockTestRequiresPremium(test) {
    if (!test || typeof test !== "object") return false;
    return test.isPremium === true
        || test.requiresPremium === true
        || String(test.access || "").trim().toLowerCase() === "premium";
}

function canAccessMockTest(req, test) {
    return !mockTestRequiresPremium(test) || canAccessSubscriptionFeature(req.user, "fullMockTest");
}

function premiumMockTestApiResponse(res) {
    return res.status(403).json({
        error: "premium_required",
        code: "PREMIUM_REQUIRED",
        message: "Full IELTS Mock Tests require Premium.",
        feature: "fullMockTest",
        upgradeUrl: "/premium"
    });
}

function requireMockTestAccessApi(req, res, next) {
    const includeDraft = isAdminUser(req.user);
    const test = mockTestStore.getTest(req.params.id, { includeDraft, requireComplete: false });
    if (test && !canAccessMockTest(req, test)) {
        return premiumMockTestApiResponse(res);
    }
    return next();
}

function mockTestIdFromRequest(req) {
    const body = req.body || {};
    const query = req.query || {};
    const state = (() => {
        try {
            const parsed = typeof body.state === "string" ? JSON.parse(body.state) : body.state;
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    })();
    return String(
        query.mockTestId
        || query.testId
        || body.mockTestId
        || body.fullTestId
        || body.testId
        || state.mockTestId
        || state.testId
        || state.test?.mockTestId
        || state.test?.testId
        || state.test?.id
        || ""
    )
        .replace(/^mock-(?:writing|speaking|listening|reading)-/i, "")
        .trim();
}

function canAccessMockModeRequest(req) {
    const mockTestId = mockTestIdFromRequest(req);
    if (!mockTestId) return false;
    const test = mockTestStore.getTest(mockTestId, { includeDraft: isAdminUser(req.user), requireComplete: false });
    return Boolean(test && canAccessMockTest(req, test));
}

function requirePremiumFeatureOrMockAccessApi(featureKey) {
    const requireFeature = requirePremiumFeatureApi(featureKey);
    return (req, res, next) => {
        if (canAccessMockModeRequest(req)) return next();
        return requireFeature(req, res, next);
    };
}

function requirePremiumFeatureOrMockAccessPage(featureKey) {
    const requireFeature = requirePremiumFeaturePage(featureKey);
    return (req, res, next) => {
        if (canAccessMockModeRequest(req)) return next();
        return requireFeature(req, res, next);
    };
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
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.sendFile(path.join(ROOT_DIR, "ieltsmock.html"));
});

app.get("/reading", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "reading.html"));
});

app.get("/listening", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listening.html"));
});

for (const [slug, page] of Object.entries(legalPages)) {
    app.get(`/${slug}`, (req, res) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.status(200).type("html").send(renderLegalPage(page));
    });
}

app.get("/sitemap.xml", (req, res) => {
    const paths = ["/", "/premium", "/terms", "/privacy"];
    const urls = paths.map((routePath) => `<url><loc>https://ieltsx.org${routePath}</loc></url>`).join("");
    res.status(200).type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

function setNoStorePageHeaders(res) {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Surrogate-Control": "no-store"
    });
}

function sendExamPage(res, fileName) {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, fileName));
}

function sendSpeakingPage(req, res) {
    sendExamPage(res, "speaking.html");
}

app.get("/speaking", requirePageAuth, (req, res) => {
    sendSpeakingPage(req, res);
});

app.get("/speaking/player", requirePageAuth, (req, res, next) => {
    const isMockRequest = req.query.mockMode === "1" || req.query.mockTestId;
    if (isMockRequest) {
        if (!canAccessMockModeRequest(req)) {
            return requirePremiumFeaturePage("fullMockTest")(req, res, next);
        }
        return sendSpeakingPage(req, res);
    }
    if (!canAccessSubscriptionFeature(req.user, "speaking")) {
        return requirePremiumFeaturePage("speaking")(req, res, next);
    }
    sendSpeakingPage(req, res);
});

app.get("/speaking/part1", requirePageAuth, requirePremiumFeaturePage("speaking"), (req, res) => {
    sendSpeakingPage(req, res);
});

app.get("/speaking/part1/:testId", requirePageAuth, requirePremiumFeaturePage("speaking"), (req, res) => {
    sendSpeakingPage(req, res);
});

app.get("/speaking/part2", requirePageAuth, requirePremiumFeaturePage("speaking"), (req, res) => {
    sendSpeakingPage(req, res);
});

app.get("/speaking/part2/:testId", requirePageAuth, requirePremiumFeaturePage("speaking"), (req, res) => {
    sendSpeakingPage(req, res);
});

app.get("/speaking/part3", requirePageAuth, requirePremiumFeaturePage("speaking"), (req, res) => {
    sendSpeakingPage(req, res);
});

app.get("/speaking/part3/:testId", requirePageAuth, requirePremiumFeaturePage("speaking"), (req, res) => {
    sendSpeakingPage(req, res);
});

app.get("/speaking/full-test", requirePageAuth, requirePremiumFeaturePage("speaking"), (req, res) => {
    sendSpeakingPage(req, res);
});

app.get("/speaking/full-test/:testId", requirePageAuth, requirePremiumFeaturePage("speaking"), (req, res) => {
    sendSpeakingPage(req, res);
});

app.get("/writing", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "writing.html"));
});

app.get("/writing/task-1", requirePageAuth, (req, res) => {
    sendExamPage(res, "writing-task1.html");
});

app.get("/writing/task-2", requirePageAuth, (req, res) => {
    sendExamPage(res, "writing-task2.html");
});

app.get("/writing/full-test", requirePageAuth, (req, res) => {
    sendExamPage(res, "full-writing-test.html");
});

app.get("/reading/part1", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "part1.html"));
});

app.get("/reading/part2", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "part2.html"));
});

app.get("/reading/part3", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "part3.html"));
});

app.get("/reading/fulltest", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "fulltest.html"));
});

app.get("/listening/part1", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningpart1.html"));
});

app.get("/listening/part2", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningpart2.html"));
});

app.get("/listening/part3", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningpart3.html"));
});

app.get("/listening/part4", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningpart4.html"));
});

app.get("/listening/fulltest", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listeningfulltest.html"));
});

app.get("/reading-tests", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "reading-tests.html"));
});

app.get("/listening-tests", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "listening-tests.html"));
});

app.get("/mock-tests", (req, res) => {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, "mock-tests.html"));
});

app.get("/mock-test", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "mock-test.html"));
});

app.get("/mock-test/:id/result", requirePageAuth, (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.sendFile(path.join(ROOT_DIR, "mock-test-result.html"));
});

app.get("/mock-test-result/:resultId", requirePageAuth, (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.sendFile(path.join(ROOT_DIR, "mock-test-result.html"));
});

app.get("/mock-test/:id", requirePageAuth, (req, res) => {
    const includeDraft = isAdminUser(req.user);
    const test = mockTestStore.getTest(req.params.id, { includeDraft, requireComplete: false });
    if (test && !canAccessMockTest(req, test)) {
        setNoStorePageHeaders(res);
        return res.sendFile(path.join(ROOT_DIR, "premium-locked.html"));
    }
    res.sendFile(path.join(ROOT_DIR, "mock-test.html"));
});

// Private pages clean routes
app.get("/dashboard", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "profile.html"));
});

app.get("/profile", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "profile.html"));
});

app.get("/ai-coach", requirePageAuth, (req, res) => {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, "ai-coach.html"));
});

app.get("/study-plan", requirePageAuth, requireStudyPlanAccessPage, (req, res) => {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, "study-plan.html"));
});

app.get("/review-mistakes", requirePageAuth, requireReviewMistakesPremiumPage, (req, res) => {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, "review-mistakes.html"));
});

app.get("/vocabulary", requirePageAuth, requireVocabularyPremiumPage, (req, res) => {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, "vocabulary.html"));
});

app.get("/profile-settings", requirePageAuth, (req, res) => {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, "profile-settings.html"));
});

app.get("/profile/subscription", requirePageAuth, (req, res) => {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, "profile-subscription.html"));
});

app.get("/premium", (req, res) => {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, "premium.html"));
});

app.get("/welcome", requirePageAuth, (req, res) => {
    setNoStorePageHeaders(res);
    res.sendFile(path.join(ROOT_DIR, "welcome.html"));
});

app.get("/my-results", requirePageAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "profile.html"));
});

app.get("/full-test-player", requirePageAuth, (req, res) => {
    const isMockRequest = req.query.mockMode === "1" || req.query.mockTestId;
    if (isMockRequest && !canAccessMockModeRequest(req)) {
        setNoStorePageHeaders(res);
        return res.sendFile(path.join(ROOT_DIR, "premium-locked.html"));
    }
    if (!isMockRequest && req.query.id) {
        const preferredSkill = req.query.skill === "listening" ? "listening" : "reading";
        const test = resolveFullTest(req.query.id, preferredSkill);

        if (test && !isMockOnlyTest(test)) {
            return res.redirect(302, publicFullTestUrl(test, preferredSkill));
        }
    }
    sendExamPage(res, "full-test-player.html");
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

app.get("/admin-speaking", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-speaking.html"));
});

app.get("/admin-speaking/:section", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-speaking.html"));
});

app.get("/admin-import", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-import.html"));
});

app.get("/admin-writing", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-writing.html"));
});

app.get("/admin-mock-tests", requirePageAdmin, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "admin-mock-tests.html"));
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

app.get("/reading-template.html", requirePageAuth, (req, res) => {
    const isMockRequest = req.query.mockMode === "1" || req.query.mockTestId;
    if (!isMockRequest && req.query.id && redirectToCleanTestUrl(req, res, "reading", "reading", req.query.id)) {
        return;
    }

    sendExamPage(res, "reading-template.html");
});

app.get("/listening-template.html", requirePageAuth, (req, res) => {
    const isMockRequest = req.query.mockMode === "1" || req.query.mockTestId;
    if (!isMockRequest && req.query.id && redirectToCleanTestUrl(req, res, "listening", "listening", req.query.id, { part: req.query.part })) {
        return;
    }

    sendExamPage(res, "listening-template.html");
});

app.get("/reading/:slug", requirePageAuth, (req, res) => {
    const entry = resolvePublicEntry("reading", req.params.slug);

    if (!entry) {
        res.status(404).send("Reading test not found");
        return;
    }

    if (req.params.slug !== entry.publicSlug) {
        res.redirect(302, publicTestUrl("reading", entry.source, entry.test));
        return;
    }

    sendExamPage(res, entry.htmlFile);
});

app.get("/listening/:slug/part-:part", requirePageAuth, (req, res) => {
    const entry = resolvePublicEntry("listening", req.params.slug, "listening");

    if (!entry) {
        res.status(404).send("Listening test not found");
        return;
    }

    if (req.params.slug !== entry.publicSlug) {
        res.redirect(302, publicTestUrl("listening", "listening", entry.test, { part: req.params.part }));
        return;
    }

    sendExamPage(res, "listening-template.html");
});

app.get("/listening/:slug", requirePageAuth, (req, res) => {
    const entry = resolvePublicEntry("listening", req.params.slug);

    if (!entry) {
        res.status(404).send("Listening test not found");
        return;
    }

    if (entry.source === "full" && entry.test.manualListeningTestId) {
        const manualEntry = publicEntryForTest("listening", "listening", entry.test.manualListeningTestId);
        if (manualEntry) {
            res.redirect(302, publicTestUrl("listening", "listening", manualEntry.test));
            return;
        }
    }

    if (req.params.slug !== entry.publicSlug) {
        res.redirect(302, publicTestUrl("listening", entry.source, entry.test));
        return;
    }

    sendExamPage(res, entry.htmlFile);
});

app.get("/api/profile/progress", requireUser, (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
    res.json(userProgressStore.getProgress(req.user.id, {
        accountCreatedAt: req.account.createdAt,
        historyLimit: limit,
        activityLimit: 20
    }));
});

function mistakeQuestionSnapshot(test, number, inherited = {}) {
    if (Array.isArray(test)) {
        for (const item of test) {
            const found = mistakeQuestionSnapshot(item, number, inherited);
            if (found) return found;
        }
        return null;
    }
    if (!test || typeof test !== "object") return null;

    const nextInherited = {
        sectionNumber: Number(test.partNumber || test.part || test.passageNumber || (
            inherited.skill === "reading" ? test.number : null
        )) || inherited.sectionNumber || null,
        partNumber: Number(test.partNumber || test.part) || inherited.partNumber || null,
        sectionLabel: String(test.sectionLabel || test.title || inherited.sectionLabel || ""),
        context: String(
            test.passageText || test.passage || test.transcript || test.transcriptText ||
            inherited.context || ""
        ),
        transcriptText: String(test.transcriptText || test.transcript || inherited.transcriptText || ""),
        transcriptSegments: normalizeTranscriptSegments(test.transcriptSegments || inherited.transcriptSegments),
        audioUrl: String(test.audioUrl || test.audio || inherited.audioUrl || ""),
        questionType: String(test.questionType || test.type || inherited.questionType || ""),
        options: Array.isArray(test.options) && test.options.length ? test.options : (inherited.options || []),
        questionGroupId: String(test.questionGroupId || (
            Array.isArray(test.blocks) ? "" : test.id
        ) || inherited.questionGroupId || ""),
        instructions: String(test.instructions || test.instruction || inherited.instructions || ""),
        imageUrl: String(test.imageUrl || inherited.imageUrl || ""),
        evidenceStartTime: test.evidenceStartTime ?? inherited.evidenceStartTime ?? null,
        evidenceEndTime: test.evidenceEndTime ?? inherited.evidenceEndTime ?? null,
        transcriptStartTime: test.transcriptStartTime ?? inherited.transcriptStartTime ?? null,
        transcriptEndTime: test.transcriptEndTime ?? inherited.transcriptEndTime ?? null,
        correctAnswer: String(test.correctAnswer || inherited.correctAnswer || ""),
        acceptedAnswers: normalizeListeningAcceptedAnswers(test.acceptedAnswers || inherited.acceptedAnswers),
        relevantText: String(test.relevantText || inherited.relevantText || ""),
        explanation: String(test.explanation || inherited.explanation || ""),
        questionEvidence: test.questionEvidence || inherited.questionEvidence || {}
    };
    const candidateNumber = Number(test.questionNumber || test.number);
    const hasAnswer = test.answer !== undefined || test.correctAnswer !== undefined || test.correct !== undefined;
    if (candidateNumber === Number(number) && hasAnswer) {
        const questionEvidence = nextInherited.questionEvidence?.[String(number)]
            || nextInherited.questionEvidence?.[number]
            || {};
        const linkedEvidence = transcriptEvidence(
            nextInherited.transcriptSegments,
            test.transcriptSegmentIds || questionEvidence.transcriptSegmentIds,
            {
                relevantText: test.relevantText || questionEvidence.relevantText,
                transcriptStartTime: test.transcriptStartTime ?? test.startTime ?? questionEvidence.transcriptStartTime,
                transcriptEndTime: test.transcriptEndTime ?? test.endTime ?? questionEvidence.transcriptEndTime
            }
        );
        return {
            questionId: String(test.id || test.questionId || `q${number}`),
            questionNumber: Number(number),
            questionType: String(test.questionType || test.type || nextInherited.questionType || ""),
            questionText: String(test.questionText || test.question || test.prompt || test.text || `Question ${number}`),
            options: Array.isArray(test.options) && test.options.length ? test.options : nextInherited.options,
            sectionNumber: nextInherited.sectionNumber,
            sectionLabel: nextInherited.sectionLabel,
            context: nextInherited.context,
            transcriptText: nextInherited.transcriptText,
            transcriptSegments: nextInherited.transcriptSegments,
            transcriptSegmentIds: linkedEvidence.transcriptSegmentIds,
            partNumber: nextInherited.partNumber || nextInherited.sectionNumber,
            questionGroupId: nextInherited.questionGroupId,
            instructions: nextInherited.instructions,
            imageUrl: nextInherited.imageUrl,
            transcriptStartTime: linkedEvidence.transcriptStartTime
                ?? questionEvidence.evidenceStartTime ?? nextInherited.transcriptStartTime
                ?? nextInherited.evidenceStartTime ?? null,
            transcriptEndTime: linkedEvidence.transcriptEndTime
                ?? questionEvidence.evidenceEndTime ?? nextInherited.transcriptEndTime
                ?? nextInherited.evidenceEndTime ?? null,
            evidenceStartTime: test.evidenceStartTime ?? questionEvidence.evidenceStartTime
                ?? nextInherited.evidenceStartTime ?? null,
            evidenceEndTime: test.evidenceEndTime ?? questionEvidence.evidenceEndTime
                ?? nextInherited.evidenceEndTime ?? null,
            correctAnswer: String(test.correctAnswer || questionEvidence.correctAnswer || nextInherited.correctAnswer || ""),
            acceptedAnswers: normalizeListeningAcceptedAnswers(
                test.acceptedAnswers || questionEvidence.acceptedAnswers || nextInherited.acceptedAnswers
            ),
            relevantText: linkedEvidence.relevantText || String(nextInherited.relevantText || ""),
            explanation: String(test.explanation || questionEvidence.explanation || nextInherited.explanation || ""),
            audioUrl: nextInherited.audioUrl
        };
    }

    for (const [key, child] of Object.entries(test)) {
        if (["answer", "correctAnswer", "correct", "answers", "options"].includes(key)) continue;
        const found = mistakeQuestionSnapshot(child, number, nextInherited);
        if (found) return found;
    }
    return null;
}

function snapshotsFromScore(test, skill, score, metadata = {}) {
    return (score.results || score.questionResults || [])
        .filter((item) => !item.correct && item.status !== "correct")
        .map((item) => {
            const number = Number(item.number || item.questionNumber);
            const question = mistakeQuestionSnapshot(test, number, { skill }) || {};
            const accepted = String(item.answer ?? item.correctAnswer ?? item.mainAnswer ?? "")
                .split(/\s*(?:\||;|\n|\bor\b)\s*/i)
                .filter(Boolean);
            return {
                ...question,
                skill,
                testId: String(metadata.testId || test?.id || ""),
                testTitle: String(metadata.testTitle || test?.title || `${skill === "listening" ? "Listening" : "Reading"} Test`),
                questionNumber: number,
                questionId: question.questionId || `q${number}`,
                userAnswer: item.userAnswer ?? "",
                correctAnswer: accepted[0] || item.answer || item.correctAnswer || item.mainAnswer || "",
                acceptedAnswers: accepted,
                alternatives: item.alternatives || accepted.slice(1),
                sectionNumber: question.sectionNumber || metadata.sectionNumber || null
            };
        });
}

function validateProfileMistakeSnapshots(body = {}) {
    const snapshots = body.mistakeSnapshots;
    if (snapshots === undefined || snapshots === null) return;
    if (!Array.isArray(snapshots)) {
        const error = new Error("mistakeSnapshots must be an array");
        error.statusCode = 400;
        throw error;
    }

    const correct = Math.max(0, Number(body.correct) || 0);
    const total = Math.max(0, Number(body.total) || 0);
    const wrongCount = total >= correct ? total - correct : 0;
    const maxSnapshots = Math.min(MAX_REVIEW_MISTAKE_SNAPSHOTS_PER_RESULT, wrongCount);
    if (snapshots.length > maxSnapshots) {
        const error = new Error("Too many mistake snapshots for this result");
        error.statusCode = 400;
        throw error;
    }

    const payloadSize = Buffer.byteLength(JSON.stringify(snapshots), "utf8");
    if (payloadSize > MAX_REVIEW_MISTAKE_SNAPSHOTS_BYTES) {
        const error = new Error("Mistake snapshots payload is too large");
        error.statusCode = 413;
        throw error;
    }

    const oversized = snapshots.some((snapshot) => (
        Buffer.byteLength(JSON.stringify(snapshot ?? null), "utf8") > MAX_REVIEW_MISTAKE_SNAPSHOT_BYTES
    ));
    if (oversized) {
        const error = new Error("A mistake snapshot is too large");
        error.statusCode = 413;
        throw error;
    }
}

app.get("/api/review-mistakes/count", requireUser, requireReviewMistakesPremiumApi, async (req, res) => {
    try {
        const summary = await reviewMistakeStore.summary(req.user.id);
        res.json({ count: summary.unresolved, summary });
    } catch (error) {
        res.status(500).json({ error: "Could not load mistake count" });
    }
});

app.get("/api/review-mistakes", requireUser, requireReviewMistakesPremiumApi, async (req, res) => {
    try {
        if (String(req.query.attemptId || "").length > 200) {
            return res.status(400).json({ error: "Invalid attempt id" });
        }
        const options = {
            skill: String(req.query.skill || "").toLowerCase(),
            status: String(req.query.status || "").toLowerCase(),
            sort: String(req.query.sort || "newest").toLowerCase(),
            attemptId: String(req.query.attemptId || "").trim()
        };
        const [items, summary] = await Promise.all([
            reviewMistakeStore.list(req.user.id, options),
            reviewMistakeStore.summary(req.user.id)
        ]);
        res.json({ items, summary });
    } catch (error) {
        res.status(500).json({ error: "Could not load review mistakes" });
    }
});

app.post("/api/review-mistakes/:id/retry", requireUser, requireReviewMistakesPremiumApi, async (req, res) => {
    try {
        const answer = req.body?.answer;
        const answerSize = JSON.stringify(answer ?? "").length;
        if (!req.params.id || String(req.params.id).length > 100
            || !Object.prototype.hasOwnProperty.call(req.body || {}, "answer")
            || answerSize > 10000) {
            return res.status(400).json({ error: "A mistake id and answer are required" });
        }
        const item = await reviewMistakeStore.retry(req.user.id, req.params.id, answer);
        if (!item) return res.status(404).json({ error: "Mistake not found" });
        const summary = await reviewMistakeStore.summary(req.user.id);
        res.json({
            item,
            correct: Boolean(item.retryCorrect),
            correctAnswer: item.retryCorrect ? undefined : item.correctAnswer,
            summary
        });
    } catch (error) {
        res.status(500).json({ error: "Could not check this answer" });
    }
});

app.patch("/api/review-mistakes/:id", requireUser, requireReviewMistakesPremiumApi, async (req, res) => {
    try {
        if (req.body?.status !== "mastered") {
            return res.status(400).json({ error: "Only the mastered status can be set directly" });
        }
        const item = await reviewMistakeStore.markMastered(req.user.id, req.params.id);
        if (!item) return res.status(404).json({ error: "Mistake not found" });
        res.json({ item, summary: await reviewMistakeStore.summary(req.user.id) });
    } catch {
        res.status(500).json({ error: "Could not update this mistake" });
    }
});

app.delete("/api/review-mistakes/:id", requireUser, requireReviewMistakesPremiumApi, async (req, res) => {
    try {
        const removed = await reviewMistakeStore.remove(req.user.id, req.params.id);
        if (!removed) return res.status(404).json({ error: "Mistake not found" });
        res.json({ success: true, summary: await reviewMistakeStore.summary(req.user.id) });
    } catch {
        res.status(500).json({ error: "Could not delete this mistake" });
    }
});

app.post("/api/profile/results", requireUser, async (req, res) => {
    try {
        validateProfileMistakeSnapshots(req.body || {});
        const result = userProgressStore.recordResult(req.user.id, req.body || {});
        const attemptId = result.attemptId || result.id;
        let mistakeCount = 0;
        if (["reading", "listening"].includes(result.skill) && Array.isArray(req.body?.mistakeSnapshots)) {
            const mistakes = await reviewMistakeStore.upsertMany(
                req.user.id,
                attemptId,
                req.body.mistakeSnapshots.map((item) => ({
                    ...item,
                    skill: result.skill,
                    testId: result.testId,
                    testTitle: result.title
                }))
            );
            mistakeCount = mistakes.length;
        }
        res.status(201).json({
            result,
            mistakeCount,
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

async function getNextTestTakerId() {
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState === 1) {
        const User = require("./models/User");
        const highestUser = await User.findOne({ testTakerId: /^[0-9]+$/ }).sort("-testTakerId").select("testTakerId");
        let nextNum = 1;
        if (highestUser && highestUser.testTakerId) {
            const num = parseInt(highestUser.testTakerId, 10);
            if (!isNaN(num)) {
                nextNum = num + 1;
            }
        }
        return String(nextNum).padStart(3, "0");
    }
    return "001";
}

function getNextTestTakerIdLocal(users = []) {
    let max = 0;
    users.forEach((u) => {
        if (u.testTakerId && /^[0-9]+$/.test(u.testTakerId)) {
            const num = parseInt(u.testTakerId, 10);
            if (num > max) max = num;
        }
    });
    return String(max + 1).padStart(3, "0");
}

app.post("/api/profile/photo", requireUser, candidatePhotoUpload.single("photo"), validateUploadContents({ photo: "image" }), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Photo file is required" });
    }
    res.json({
        photoUrl: `/uploads/candidate-photos/${path.basename(req.file.path)}`
    });
});

app.delete("/api/profile/results/:id", requireUser, requireAdmin, async (req, res) => {
    try {
        const removed = userProgressStore.removeResult(req.user.id, req.params.id);
        if (!removed) return res.status(404).json({ error: "Result not found" });
        await reviewMistakeStore.removeAttempt(req.user.id, removed.attemptId || removed.id);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: "Could not delete result" });
    }
});

app.put("/api/profile", requireUser, async (req, res) => {
    try {
        const {
            firstName,
            familyName,
            fullName,
            dateOfBirth,
            sex,
            candidatePhoto,
            testTakerId,
            candidateType,
            countryOfOrigin,
            countryOfNationality,
            firstLanguage,
            targetBand
        } = req.body || {};

        const userId = req.user?.id || req.account?._id || req.account?.id;
        const existingUser = await userStore.findUserById(userId);
        if (!existingUser) {
            return res.status(404).json({ error: "User not found" });
        }

        const finalFirstName = (firstName !== undefined) ? firstName.trim() : (existingUser.firstName || "");
        const finalFamilyName = (familyName !== undefined) ? familyName.trim() : (existingUser.familyName || "");
        const finalFullName = (fullName !== undefined) ? fullName.trim() : (existingUser.fullName || existingUser.name || "");
        const finalName = (req.body.name !== undefined) ? req.body.name.trim() : (existingUser.name || finalFullName || existingUser.username || "");

        if (!finalFirstName) return res.status(400).json({ error: "First Name is required" });
        if (!finalFamilyName) return res.status(400).json({ error: "Family Name is required" });
        if (!finalFullName) return res.status(400).json({ error: "Full Name is required" });
        if (!finalName) return res.status(400).json({ error: "Name is required" });

        const isAdmin = req.user?.role === "admin";
        let finalTestTakerId = existingUser.testTakerId;
        if (!finalTestTakerId || !finalTestTakerId.trim()) {
            const mongoose = require("mongoose");
            if (mongoose.connection.readyState === 1) {
                finalTestTakerId = await getNextTestTakerId();
            } else {
                const users = userStore.getAllUsers ? await userStore.getAllUsers() : [];
                finalTestTakerId = getNextTestTakerIdLocal(users);
            }
        }

        const updates = {
            firstName: finalFirstName,
            familyName: finalFamilyName,
            fullName: finalFullName,
            name: finalName,
            dateOfBirth: (dateOfBirth !== undefined) ? dateOfBirth.trim() : (existingUser.dateOfBirth || ""),
            sex: (sex !== undefined) ? sex.trim() : (existingUser.sex || ""),
            candidatePhoto: (candidatePhoto !== undefined) ? (candidatePhoto || "") : (existingUser.candidatePhoto || ""),
            testTakerId: finalTestTakerId,
            candidateType: (candidateType !== undefined) ? candidateType.trim() : (existingUser.candidateType || "Mock Test Candidate"),
            countryOfOrigin: (countryOfOrigin !== undefined) ? countryOfOrigin.trim() : (existingUser.countryOfOrigin || "Uzbekistan"),
            countryOfNationality: (countryOfNationality !== undefined) ? countryOfNationality.trim() : (existingUser.countryOfNationality || "Uzbekistan"),
            firstLanguage: (firstLanguage !== undefined) ? firstLanguage.trim() : (existingUser.firstLanguage || "Uzbek"),
            targetBand: (targetBand !== undefined) ? (targetBand || "") : (existingUser.targetBand || "")
        };

        console.log("[PROFILE UPDATE] Updating candidate settings");

        const updatedUser = await userStore.updateUser(userId, updates);

        if (!updatedUser) {
            console.warn(`[PROFILE UPDATE] User not found or failed to update: ${userId}`);
            return res.status(404).json({ error: "User not found" });
        }

        console.info(`[PROFILE UPDATE] User ${userId} candidate settings updated successfully`);

        res.json({
            success: true,
            user: publicUser(updatedUser)
        });
    } catch (error) {
        console.error("[PROFILE UPDATE] Error updating profile:", error);
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not update profile"
        });
    }
});

app.post("/api/profile/subscription/cancel", requireUser, async (req, res) => {
    try {
        const userId = req.user?.id || req.account?._id || req.account?.id;
        const existingUser = await userStore.findUserById(userId);
        if (!existingUser) {
            return res.status(404).json({ error: "User not found" });
        }

        if (existingUser.lemonSqueezySubscriptionId) {
            return res.status(409).json({
                error: "Cancel this subscription from your Lemon Squeezy receipt or subscription management link. Premium remains active until Lemon Squeezy confirms the cancellation."
            });
        }

        const now = new Date();
        const updatedUser = await userStore.updateUser(String(userId), {
            plan: "free",
            isPremium: false,
            premiumUntil: now,
            premiumExpiresAt: now,
            premiumCancelledAt: now,
            manualPremiumActive: false,
            manualPremiumEndsAt: now,
            subscriptionAdminNote: String(req.body?.note || "Cancelled by user").trim().slice(0, 500)
        });

        if (!updatedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.json({
            success: true,
            user: publicUser(updatedUser)
        });
    } catch (error) {
        console.error("Profile subscription cancel error:", error);
        res.status(500).json({ error: "Could not cancel subscription" });
    }
});

app.get("/api/mock-tests", (req, res) => {
    const tests = mockTestStore
        .listTests()
        .map(mockTestStore.publicSummary);
    res.json(paginateArray(req, res, tests, { defaultLimit: 50, maxLimit: 100 }));
});

app.get("/api/mock-tests/latest", requireAuth, (req, res) => {
    const includeDraft = isAdminUser(req.user);
    const test = mockTestStore.latestActiveTest({
        includeDraft,
        requireComplete: false
    });

    if (!test) {
        return res.status(404).json({
            error: "Mock test data not found. Please add Listening, Reading, Writing and Speaking sections in admin panel."
        });
    }

    if (!canAccessMockTest(req, test)) {
        return premiumMockTestApiResponse(res);
    }

    res.json(publicTestData(test));
});

function scorePublicTest(test, answers, skill) {
    const questions = collectScorableQuestions(test);
    const scored = scoreSkill(questions, answers || {});
    const band = skill === "listening"
        ? calculateListeningBand(scored.correct, scored.total)
        : calculateReadingBand(scored.correct, scored.total);
    const results = skill === "listening"
        ? scored.results.map((item) => {
            const question = mistakeQuestionSnapshot(test, item.number, { skill }) || {};
            const nestedEvidence = findNestedListeningQuestionEvidence(test, item.number);
            const acceptedAnswers = normalizeListeningAcceptedAnswers(item.answer);
            return {
                ...item,
                questionNumber: Number(item.number),
                questionText: question.questionText || `Question ${item.number}`,
                partNumber: question.partNumber || null,
                correctAnswer: question.correctAnswer || acceptedAnswers[0] || "",
                acceptedAnswers: question.acceptedAnswers?.length ? question.acceptedAnswers : acceptedAnswers,
                relevantText: question.relevantText || String(nestedEvidence.relevantText || ""),
                explanation: question.explanation || String(nestedEvidence.explanation || ""),
                transcriptText: question.transcriptText || "",
                transcriptSegments: question.transcriptSegments || [],
                transcriptSegmentIds: question.transcriptSegmentIds || [],
                transcriptStartTime: question.transcriptStartTime ?? question.evidenceStartTime ?? null,
                transcriptEndTime: question.transcriptEndTime ?? question.evidenceEndTime ?? null,
                audioUrl: question.audioUrl || ""
            };
        })
        : scored.results;
    return {
        skill,
        correct: scored.correct,
        incorrect: results.filter((item) => String(item.userAnswer || "").trim() && !item.correct).length,
        unanswered: results.filter((item) => !String(item.userAnswer || "").trim()).length,
        total: scored.total,
        band,
        results
    };
}

function findNestedListeningQuestionEvidence(value, number) {
    if (Array.isArray(value)) {
        for (const child of value) {
            const found = findNestedListeningQuestionEvidence(child, number);
            if (found) return found;
        }
        return {};
    }
    if (!value || typeof value !== "object") return {};
    const evidence = value.questionEvidence?.[String(number)] || value.questionEvidence?.[number];
    if (evidence && typeof evidence === "object") return evidence;
    for (const child of Object.values(value)) {
        const found = findNestedListeningQuestionEvidence(child, number);
        if (Object.keys(found).length) return found;
    }
    return {};
}

app.post("/api/reading-tests/:id/score", requireUser, async (req, res) => {
    const test = buildMockReadingTest(req.params.id) || resolveManualReadingTest(req.params.id);
    if (!test || (isMockOnlyTest(test) && !String(req.params.id).startsWith("mock-reading-"))) {
        return res.status(404).json({ error: "Reading test not found" });
    }
    const score = scorePublicTest(test, req.body?.answers, "reading");
    const attemptId = String(req.body?.attemptId || `reading-${req.params.id}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`);
    const mistakes = snapshotsFromScore(test, "reading", score, { testId: req.params.id });
    await reviewMistakeStore.upsertMany(req.user.id, attemptId, mistakes);
    res.json({ ...score, attemptId, mistakeCount: mistakes.length });
});

app.get("/api/mock-tests/:id", requireAuth, (req, res) => {
    const includeDraft = isAdminUser(req.user);
    const requestedId = String(req.params.id || "").trim();
    const useLatest = !requestedId || requestedId === "undefined" || requestedId === "null";
    const test = useLatest
        ? mockTestStore.latestActiveTest({ includeDraft, requireComplete: false })
        : mockTestStore.getTest(requestedId, { includeDraft, requireComplete: false });

    if (!test) {
        return res.status(404).json({
            error: "Mock test data not found. Please add Listening, Reading, Writing and Speaking sections in admin panel."
        });
    }

    if (!canAccessMockTest(req, test)) {
        return premiumMockTestApiResponse(res);
    }

    res.json(publicTestData(test));
});

app.post("/api/listening-tests/:id/score", requireUser, async (req, res) => {
    let test = buildMockListeningTest(req.params.id) || resolveManualListeningTest(req.params.id);
    if (!test) test = resolveManualListeningTest(`${req.params.id}-listening-full`);
    if (!test || (isMockOnlyTest(test) && !String(req.params.id).startsWith("mock-listening-"))) {
        return res.status(404).json({ error: "Listening test not found" });
    }
    const score = scorePublicTest(test, req.body?.answers, "listening");
    const attemptId = String(req.body?.attemptId || `listening-${req.params.id}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`);
    const mistakes = snapshotsFromScore(test, "listening", score, { testId: req.params.id });
    await reviewMistakeStore.upsertMany(req.user.id, attemptId, mistakes);
    res.json({ ...score, attemptId, mistakeCount: mistakes.length });
});

app.post("/api/mock-tests/:id/progress", requireUser, requireMockTestAccessApi, (req, res) => {
    try {
        const progress = mockTestStore.recordSectionProgress(req.user.id, req.params.id, req.body || {});
        res.json({ progress });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not save mock test progress"
        });
    }
});

app.delete("/api/mock-tests/:id/progress", requireUser, requireMockTestAccessApi, (req, res) => {
    try {
        const progress = mockTestStore.clearProgress(req.user.id, req.params.id);
        res.json({ progress });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not clear mock test progress"
        });
    }
});

function getCefrLevel(band) {
    const b = Number(band);
    if (b >= 7.0) return "C2";
    if (b >= 5.5) return "C1";
    if (b >= 4.0) return "B2";
    if (b >= 3.0) return "B1";
    if (b >= 2.0) return "A2";
    if (b >= 1.0) return "A1";
    return "N/A";
}

async function mapProfileFieldsToResult(userId, result) {
    if (!result) return null;
    const user = await userStore.findUserById(userId);
    const mapped = { ...result };
    if (user) {
        mapped.firstName = user.firstName || "";
        mapped.familyName = user.familyName || "";
        mapped.fullName = user.fullName || user.name || "";
        mapped.email = user.email || "";
        mapped.dateOfBirth = user.dateOfBirth || "";
        mapped.sex = user.sex || "";
        mapped.candidatePhoto = user.candidatePhoto || "";
        mapped.testTakerId = user.testTakerId || "";
        mapped.candidateType = user.candidateType || "Mock Test Candidate";
        mapped.countryOfOrigin = user.countryOfOrigin || "Uzbekistan";
        mapped.countryOfNationality = user.countryOfNationality || "Uzbekistan";
        mapped.firstLanguage = user.firstLanguage || "Uzbek";
        mapped.targetBand = user.targetBand || "";
    } else {
        mapped.firstName = "";
        mapped.familyName = "";
        mapped.fullName = "";
        mapped.email = "";
        mapped.dateOfBirth = "";
        mapped.sex = "";
        mapped.candidatePhoto = "";
        mapped.testTakerId = "";
        mapped.candidateType = "Mock Test Candidate";
        mapped.countryOfOrigin = "Uzbekistan";
        mapped.countryOfNationality = "Uzbekistan";
        mapped.firstLanguage = "Uzbek";
        mapped.targetBand = "";
    }
    mapped.cefrLevel = getCefrLevel(mapped.overallBand);
    return mapped;
}

const CERT_COLORS = {
    navy: "#06164a",
    blue: "#2563eb",
    violet: "#6d28d9",
    purple: "#4f46e5",
    border: "#c9d7f2",
    pale: "#f7f9ff",
    muted: "#475569",
    softBlue: "#eef4ff"
};

function certificateValue(value, fallback = "Not provided") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function certificateFirstNonEmpty(...values) {
    return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function certificateCandidateName(result = {}) {
    const composed = [result.firstName, result.familyName]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join(" ");

    return certificateFirstNonEmpty(result.fullName, composed, result.name, result.email, "Candidate");
}

function certificateTestTakerId(result = {}, user = {}) {
    return certificateFirstNonEmpty(result.testTakerId, user.testTakerId, user.memberId, "000");
}

function certificateBand(value) {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number.toFixed(1) : "0.0";
}

function certificateDate(value, fallback = "Not provided") {
    const raw = String(value ?? "").trim();
    if (!raw) return fallback;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;

    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function certificateGeneratedAt(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tashkent",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} (UTC+5)`;
}

function certificateNationality(result = {}) {
    const raw = certificateFirstNonEmpty(result.nationality, result.firstLanguage, result.countryOfNationality);
    if (!raw) return "Not provided";
    if (/^uzbekistan$/i.test(raw)) return "Uzbek";
    return raw;
}

function certificateVerificationDate(value) {
    const date = new Date(value);
    const valid = Number.isNaN(date.getTime()) ? new Date() : date;
    const mm = String(valid.getMonth() + 1).padStart(2, "0");
    const dd = String(valid.getDate()).padStart(2, "0");
    const yy = String(valid.getFullYear()).slice(-2);
    return `${mm}${dd}${yy}`;
}

function certificateVerificationId(result = {}, testTakerId = "000") {
    const testNumber = String(result.testNumber || result.number || "").replace(/\D/g, "") || "X";
    const dateCode = certificateVerificationDate(result.completedAt || result.createdAt || result.testDate);
    const suffix = String(result.id || "")
        .split("-")
        .filter(Boolean)
        .pop()
        ?.replace(/[^a-z0-9]/gi, "")
        .slice(0, 6)
        .toUpperCase() || "RESULT";

    return `IELTSX-MT${testNumber}-${testTakerId}-${dateCode}-${suffix}`;
}

function certificateSafeFileName(value) {
    return String(value || "000").replace(/[^a-z0-9_-]/gi, "") || "000";
}

function drawSecurityPattern(doc) {
    doc.save();
    doc.opacity(0.34);
    doc.strokeColor("#e9efff");
    doc.lineWidth(0.55);

    for (let y = 138; y < 790; y += 18) {
        doc.moveTo(0, y);
        for (let x = 0; x < 620; x += 120) {
            doc.bezierCurveTo(x + 30, y - 9, x + 70, y + 9, x + 120, y);
        }
        doc.stroke();
    }

    doc.restore();
}

function drawLogo(doc, x, y) {
    doc.save();
    const logoPath = path.join(ROOT_DIR, "logo.png");
    if (fs.existsSync(logoPath)) {
        doc.image(logoPath, x, y - 2, {
            width: 172
        });
        doc.restore();
        return;
    }

    doc.font("Helvetica-Bold").fontSize(35).fillColor(CERT_COLORS.navy).text("IELTS", x, y, {
        width: 116,
        lineBreak: false
    });
    doc.font("Helvetica-Bold").fontSize(43).fillColor(CERT_COLORS.blue).text("X", x + 116, y - 6, {
        width: 42,
        lineBreak: false
    });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(CERT_COLORS.navy).text(".ORG", x + 153, y + 28, {
        width: 42,
        lineBreak: false
    });
    doc.restore();
}

function drawSectionTab(doc, x, y, text, width = 132) {
    doc.save();
    doc.roundedRect(x, y, width, 28, 5).fill(CERT_COLORS.navy);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff").text(text, x + 16, y + 9, {
        width: width - 26,
        lineBreak: false
    });
    doc.restore();
}

function drawLineIcon(doc, type, x, y, color = CERT_COLORS.navy) {
    doc.save();
    doc.strokeColor(color).lineWidth(1.25).lineCap("round").lineJoin("round");

    if (type === "user") {
        doc.circle(x + 7, y + 5, 4).stroke();
        doc.moveTo(x, y + 17).quadraticCurveTo(x + 7, y + 9, x + 14, y + 17).stroke();
    } else if (type === "id") {
        doc.roundedRect(x, y + 1, 16, 13, 1.5).stroke();
        doc.moveTo(x + 4, y + 5).lineTo(x + 12, y + 5).stroke();
        doc.moveTo(x + 4, y + 9).lineTo(x + 10, y + 9).stroke();
    } else if (type === "calendar") {
        doc.roundedRect(x, y + 2, 17, 15, 2).stroke();
        doc.moveTo(x, y + 7).lineTo(x + 17, y + 7).stroke();
        doc.moveTo(x + 5, y).lineTo(x + 5, y + 4).stroke();
        doc.moveTo(x + 12, y).lineTo(x + 12, y + 4).stroke();
    } else if (type === "globe") {
        doc.circle(x + 8, y + 8, 8).stroke();
        doc.moveTo(x, y + 8).lineTo(x + 16, y + 8).stroke();
        doc.moveTo(x + 8, y).bezierCurveTo(x + 4, y + 5, x + 4, y + 11, x + 8, y + 16).stroke();
        doc.moveTo(x + 8, y).bezierCurveTo(x + 12, y + 5, x + 12, y + 11, x + 8, y + 16).stroke();
    } else if (type === "flag") {
        doc.moveTo(x + 2, y).lineTo(x + 2, y + 18).stroke();
        doc.moveTo(x + 2, y + 2).lineTo(x + 15, y + 2).lineTo(x + 12, y + 8).lineTo(x + 2, y + 8).stroke();
    } else if (type === "clock") {
        doc.circle(x + 8, y + 8, 8).stroke();
        doc.moveTo(x + 8, y + 4).lineTo(x + 8, y + 9).lineTo(x + 12, y + 11).stroke();
    } else if (type === "monitor") {
        doc.roundedRect(x, y + 2, 18, 12, 1.5).stroke();
        doc.moveTo(x + 9, y + 14).lineTo(x + 9, y + 18).stroke();
        doc.moveTo(x + 5, y + 18).lineTo(x + 13, y + 18).stroke();
    } else if (type === "mail") {
        doc.roundedRect(x, y + 3, 18, 13, 1.5).stroke();
        doc.moveTo(x + 1, y + 5).lineTo(x + 9, y + 11).lineTo(x + 17, y + 5).stroke();
    } else if (type === "shield") {
        doc.moveTo(x + 8, y).lineTo(x + 16, y + 3).lineTo(x + 15, y + 10).quadraticCurveTo(x + 13, y + 16, x + 8, y + 18).quadraticCurveTo(x + 3, y + 16, x + 1, y + 10).lineTo(x, y + 3).closePath().stroke();
    }

    doc.restore();
}

function drawDetailRow(doc, icon, label, value, x, y, width) {
    drawLineIcon(doc, icon, x, y + 2);
    doc.font("Helvetica").fontSize(9.2).fillColor("#111827").text(label, x + 30, y, {
        width,
        lineBreak: false
    });
    doc.font("Helvetica-Bold").fontSize(10.3).fillColor("#0b102f").text(certificateValue(value), x + 30, y + 14, {
        width,
        lineBreak: false
    });
}

function drawSkillIcon(doc, skill, cx, cy) {
    doc.save();
    doc.strokeColor(CERT_COLORS.navy).lineWidth(1.7).lineCap("round").lineJoin("round");
    if (skill === "Listening") {
        doc.moveTo(cx - 13, cy + 6).lineTo(cx - 13, cy - 2).bezierCurveTo(cx - 13, cy - 14, cx + 13, cy - 14, cx + 13, cy - 2).lineTo(cx + 13, cy + 6).stroke();
        doc.roundedRect(cx - 18, cy + 3, 7, 12, 2).stroke();
        doc.roundedRect(cx + 11, cy + 3, 7, 12, 2).stroke();
    } else if (skill === "Reading") {
        doc.moveTo(cx, cy - 13).lineTo(cx, cy + 14).stroke();
        doc.moveTo(cx, cy - 10).quadraticCurveTo(cx - 16, cy - 17, cx - 18, cy - 4).lineTo(cx - 18, cy + 13).quadraticCurveTo(cx - 9, cy + 8, cx, cy + 14).stroke();
        doc.moveTo(cx, cy - 10).quadraticCurveTo(cx + 16, cy - 17, cx + 18, cy - 4).lineTo(cx + 18, cy + 13).quadraticCurveTo(cx + 9, cy + 8, cx, cy + 14).stroke();
    } else if (skill === "Writing") {
        doc.moveTo(cx - 12, cy + 13).lineTo(cx + 12, cy - 11).stroke();
        doc.moveTo(cx + 7, cy - 16).lineTo(cx + 16, cy - 7).stroke();
        doc.moveTo(cx - 15, cy + 17).lineTo(cx - 7, cy + 14).stroke();
        doc.moveTo(cx - 16, cy + 20).lineTo(cx + 12, cy + 20).stroke();
    } else {
        doc.moveTo(cx - 16, cy - 4).quadraticCurveTo(cx - 16, cy - 17, cx, cy - 17).quadraticCurveTo(cx + 17, cy - 17, cx + 17, cy - 3).quadraticCurveTo(cx + 17, cy + 11, cx, cy + 11).lineTo(cx - 9, cy + 18).lineTo(cx - 6, cy + 9).quadraticCurveTo(cx - 16, cy + 5, cx - 16, cy - 4).stroke();
    }
    doc.restore();
}

function drawBandBox(doc, label, score, x, y, w, h) {
    doc.save();
    doc.roundedRect(x, y, w, h, 5).fillAndStroke("#f7f9ff", CERT_COLORS.border);
    drawSkillIcon(doc, label, x + w / 2, y + 26);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(CERT_COLORS.navy).text(label.toUpperCase(), x, y + 55, {
        width: w,
        align: "center",
        lineBreak: false
    });
    doc.rect(x, y + h - 31, w, 31).fill(CERT_COLORS.navy);
    doc.font("Helvetica-Bold").fontSize(23).fillColor("#ffffff").text(certificateBand(score), x, y + h - 26, {
        width: w,
        align: "center",
        lineBreak: false
    });
    doc.restore();
}

function drawSeal(doc, cx, cy) {
    doc.save();
    doc.strokeColor(CERT_COLORS.blue).lineWidth(1.2);
    doc.circle(cx, cy, 48).stroke();
    doc.circle(cx, cy, 38).stroke();
    doc.circle(cx, cy, 24).stroke();
    doc.font("Helvetica-Bold").fontSize(18).fillColor(CERT_COLORS.blue).text("IELTSX", cx - 36, cy - 12, {
        width: 72,
        align: "center",
        lineBreak: false
    });
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(CERT_COLORS.navy).text("MOCK TEST", cx - 32, cy + 10, {
        width: 64,
        align: "center",
        lineBreak: false
    });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(CERT_COLORS.blue).text("IELTSX.ORG", cx - 30, cy - 39, {
        width: 60,
        align: "center",
        lineBreak: false
    });
    doc.text("IELTSX.ORG", cx - 30, cy + 30, {
        width: 60,
        align: "center",
        lineBreak: false
    });
    doc.circle(cx - 38, cy, 2.2).fill(CERT_COLORS.blue);
    doc.circle(cx + 38, cy, 2.2).fill(CERT_COLORS.blue);
    doc.restore();
}

function drawFooterInfo(doc, icon, label, value, x, y, width) {
    drawLineIcon(doc, icon, x, y + 3);
    doc.font("Helvetica").fontSize(8.4).fillColor("#334155").text(label, x + 28, y, {
        width,
        lineBreak: false
    });
    doc.font("Helvetica-Bold").fontSize(8.6).fillColor(CERT_COLORS.navy).text(value, x + 28, y + 13, {
        width,
        lineBreak: false
    });
}

async function streamMockResultCertificatePdf(req, res, result) {
    const PDFDocument = require("pdfkit");
    const QRCode = require("qrcode");
    const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        info: {
            Title: `IELTSX Mock Test Result - ${result.title || "Mock Test"}`,
            Author: "IELTSX",
            Subject: "IELTSX Mock Test Result"
        }
    });

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const title = certificateFirstNonEmpty(result.title, result.testNumber ? `Mock Test ${result.testNumber}` : "", "Mock Test");
    const testTakerId = certificateTestTakerId(result, req.user);
    const candidate = certificateCandidateName(result);
    const testDate = certificateDate(result.testDate || result.completedAt || result.createdAt);
    const verificationId = certificateVerificationId(result, testTakerId);
    const verificationUrl = `https://ieltsx.org/verify?code=${encodeURIComponent(verificationId)}&result=${encodeURIComponent(result.id || "")}`;
    const qrBuffer = await QRCode.toBuffer(verificationUrl, {
        type: "png",
        width: 96,
        margin: 1,
        color: {
            dark: CERT_COLORS.navy,
            light: "#ffffff"
        }
    });
    const fileName = `IELTSX-Mock-Test-Result-${certificateSafeFileName(testTakerId)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    doc.pipe(res);

    doc.rect(0, 0, pageWidth, pageHeight).fill("#ffffff");
    drawSecurityPattern(doc);

    drawLogo(doc, 36, 38);
    doc.font("Helvetica-Bold").fontSize(19).fillColor(CERT_COLORS.navy).text("IELTSX MOCK TEST RESULT", 284, 40, {
        width: 278,
        align: "right",
        lineBreak: false
    });
    doc.font("Helvetica-Bold").fontSize(15).fillColor(CERT_COLORS.violet).text(title, 284, 66, {
        width: 278,
        align: "right",
        lineBreak: false
    });
    doc.moveTo(32, 103).lineTo(pageWidth - 32, 103).lineWidth(1.4).strokeColor(CERT_COLORS.blue).stroke();

    const cardX = 32;
    const cardW = pageWidth - 64;

    doc.roundedRect(cardX, 134, cardW, 212, 6).strokeColor(CERT_COLORS.border).lineWidth(0.9).stroke();
    drawSectionTab(doc, cardX, 120, "CANDIDATE DETAILS", 154);
    doc.save();
    doc.opacity(0.06);
    doc.font("Helvetica-Bold").fontSize(168).fillColor(CERT_COLORS.blue).text("X", cardX + 370, 180, {
        width: 116,
        align: "center",
        lineBreak: false
    });
    doc.restore();
    doc.moveTo(cardX + 238, 171).lineTo(cardX + 238, 322).strokeColor(CERT_COLORS.border).lineWidth(0.8).stroke();

    const leftX = cardX + 38;
    const rightX = cardX + 262;
    const detailTop = 162;
    drawDetailRow(doc, "user", "Candidate Name", candidate, leftX, detailTop, 142);
    drawDetailRow(doc, "id", "Test Taker ID", testTakerId, leftX, detailTop + 32, 142);
    drawDetailRow(doc, "calendar", "Date of Birth", certificateDate(result.dateOfBirth), leftX, detailTop + 64, 142);
    drawDetailRow(doc, "globe", "Nationality", certificateNationality(result), leftX, detailTop + 96, 142);
    drawDetailRow(doc, "flag", "Country", certificateValue(result.countryOfOrigin || result.countryOfNationality), leftX, detailTop + 128, 142);
    drawDetailRow(doc, "calendar", "Test Date", testDate, rightX, detailTop, 188);
    drawDetailRow(doc, "clock", "Test Type", "IELTSX Mock Test (Full Test)", rightX, detailTop + 43, 188);
    drawDetailRow(doc, "monitor", "Test Format", "Computer Based Test", rightX, detailTop + 86, 188);
    drawDetailRow(doc, "mail", "Email", certificateValue(result.email), rightX, detailTop + 129, 188);

    doc.roundedRect(cardX, 376, cardW, 206, 6).strokeColor(CERT_COLORS.border).lineWidth(0.9).stroke();
    drawSectionTab(doc, cardX, 362, "YOUR BAND SCORES", 154);
    const scoreY = 415;
    const boxW = 106;
    const boxGap = 12;
    const startX = cardX + (cardW - (boxW * 4 + boxGap * 3)) / 2;
    [
        ["Listening", result.listening?.band],
        ["Reading", result.reading?.band],
        ["Writing", result.writing?.band],
        ["Speaking", result.speaking?.band]
    ].forEach(([label, score], index) => {
        drawBandBox(doc, label, score, startX + index * (boxW + boxGap), scoreY, boxW, 98);
    });

    const overallY = 537;
    const overallX = startX;
    const overallW = boxW * 4 + boxGap * 3;
    doc.roundedRect(overallX, overallY, overallW, 42, 5).fillAndStroke("#fbfcff", CERT_COLORS.border);
    doc.font("Helvetica-Bold").fontSize(13.5).fillColor(CERT_COLORS.navy).text("OVERALL BAND SCORE", overallX + 28, overallY + 15, {
        width: overallW - 178,
        align: "center",
        lineBreak: false
    });
    const gradient = doc.linearGradient(overallX + overallW - 146, overallY, overallX + overallW, overallY);
    gradient.stop(0, CERT_COLORS.violet).stop(1, CERT_COLORS.purple);
    doc.roundedRect(overallX + overallW - 146, overallY + 5, 126, 32, 5).fill(gradient);
    doc.font("Helvetica-Bold").fontSize(24).fillColor("#ffffff").text(certificateBand(result.overallBand), overallX + overallW - 146, overallY + 9, {
        width: 126,
        align: "center",
        lineBreak: false
    });

    const noteY = 604;
    doc.roundedRect(cardX, noteY, cardW, 188, 6).strokeColor(CERT_COLORS.border).lineWidth(0.9).stroke();
    drawLineIcon(doc, "shield", cardX + 30, noteY + 24, CERT_COLORS.blue);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(CERT_COLORS.blue).text("IMPORTANT NOTE", cardX + 60, noteY + 26, {
        width: 142,
        lineBreak: false
    });
    doc.font("Helvetica").fontSize(8.4).fillColor("#111827").text("This is an IELTSX Mock Test result.\nIt is not an official IELTS Test Report Form.\nThis result is for practice and self-assessment purposes only.", cardX + 30, noteY + 58, {
        width: 170,
        lineGap: 5
    });
    doc.save();
    doc.opacity(0.07);
    doc.font("Helvetica-Bold").fontSize(33).fillColor(CERT_COLORS.blue).text("IELTSX", cardX + 30, noteY + 127, {
        width: 150,
        lineBreak: false
    });
    doc.restore();

    drawSeal(doc, cardX + cardW / 2, noteY + 82);

    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(CERT_COLORS.blue).text("VERIFICATION", cardX + 382, noteY + 24, {
        width: 120,
        lineBreak: false
    });
    doc.font("Helvetica").fontSize(8.2).fillColor("#111827").text("Verification ID", cardX + 382, noteY + 48, {
        width: 130,
        lineBreak: false
    });
    doc.font("Helvetica-Bold").fontSize(8.1).fillColor("#0b102f").text(verificationId, cardX + 382, noteY + 60, {
        width: 140
    });
    doc.image(qrBuffer, cardX + 382, noteY + 82, {
        width: 52,
        height: 52
    });
    doc.font("Helvetica").fontSize(7.3).fillColor("#111827").text("Scan to verify this result\nat ieltsx.org/verify", cardX + 382, noteY + 137, {
        width: 130,
        lineGap: 2
    });

    const noteFooterY = noteY + 156;
    doc.moveTo(cardX, noteFooterY).lineTo(cardX + cardW, noteFooterY).strokeColor(CERT_COLORS.border).lineWidth(0.8).stroke();
    doc.moveTo(cardX + 195, noteFooterY + 7).lineTo(cardX + 195, noteY + 180).strokeColor("#e3e9f7").lineWidth(0.6).stroke();
    doc.moveTo(cardX + 373, noteFooterY + 7).lineTo(cardX + 373, noteY + 180).strokeColor("#e3e9f7").lineWidth(0.6).stroke();
    drawFooterInfo(doc, "calendar", "Result Generated On", certificateGeneratedAt(), cardX + 30, noteFooterY + 10, 148);
    drawFooterInfo(doc, "globe", "Website", "www.ieltsx.org", cardX + 220, noteFooterY + 10, 130);
    drawFooterInfo(doc, "mail", "Support", "support@ieltsx.org", cardX + 400, noteFooterY + 10, 128);

    doc.rect(0, pageHeight - 42, pageWidth, 42).fill(CERT_COLORS.navy);
    doc.font("Helvetica-Bold").fontSize(11.5).fillColor("#ffffff").text("Thank you for practicing with IELTSX!", 0, pageHeight - 27, {
        width: pageWidth,
        align: "center",
        lineBreak: false
    });

    doc.end();
}

app.post("/api/mock-tests/:id/submit", requireUser, requireMockTestAccessApi, async (req, res) => {
    try {
        const mockTest = mockTestStore.getTest(req.params.id, { includeDraft: true });
        const scoringTest = mockTest ? await buildMockScoringTest(mockTest) : null;
        const result = mockTestStore.submitAttempt(req.user.id, req.params.id, {
            ...(req.body || {}),
            __scoringTest: scoringTest || undefined
        });
        let mistakeCount = 0;
        if (scoringTest) {
            for (const skill of ["listening", "reading"]) {
                const questions = scoringTest[`${skill}Questions`] || [];
                const answers = req.body?.sections?.[skill]?.answers || req.body?.answers?.[skill]?.answers || {};
                if (!questions.length) continue;
                const scored = scorePublicTest({ questions }, answers, skill);
                const snapshots = snapshotsFromScore({ questions, title: result.title }, skill, scored, {
                    testId: result.testId,
                    testTitle: result.title
                });
                const saved = await reviewMistakeStore.upsertMany(req.user.id, result.id, snapshots);
                mistakeCount += saved.length;
            }
        }
        const mappedResult = await mapProfileFieldsToResult(req.user.id, result);
        res.status(201).json({ result: { ...mappedResult, mistakeCount } });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.message || "Could not submit mock test"
        });
    }
});

app.get("/api/mock-tests/:id/latest-result", requireUser, requireMockTestAccessApi, async (req, res) => {
    const result = mockTestStore.latestResult(req.user.id, req.params.id);

    if (!result) {
        return res.status(404).json({ error: "Mock test result not found" });
    }

    const mappedResult = await mapProfileFieldsToResult(req.user.id, result);
    res.json({ result: mappedResult });
});

app.get("/api/mock-test-results/:id/pdf", requireUser, requirePremiumFeatureApi("pdfResults"), async (req, res) => {
    try {
        const result = mockTestStore.resultById(req.user.id, req.params.id);

        if (!result) {
            return res.status(404).json({ error: "Mock test result not found" });
        }

        const mappedResult = await mapProfileFieldsToResult(req.user.id, result);
        await streamMockResultCertificatePdf(req, res, mappedResult);
    } catch (error) {
        console.error("Mock result PDF generation failed:", error);
        if (!res.headersSent) {
            res.status(500).json({
                error: error.message || "Could not generate mock test result PDF"
            });
        } else {
            res.end();
        }
    }
});

app.get("/api/mock-test-results/:id", requireUser, async (req, res) => {
    const result = mockTestStore.resultById(req.user.id, req.params.id);

    if (!result) {
        return res.status(404).json({ error: "Mock test result not found" });
    }

    const test = mockTestStore.getTest(result.testId, { includeDraft: true, requireComplete: false });
    if (test && !canAccessMockTest(req, test)) {
        return premiumMockTestApiResponse(res);
    }
    if (!test && !canAccessSubscriptionFeature(req.user, "detailedBandFeedback")) {
        return requirePremiumFeatureApi("detailedBandFeedback")(req, res, () => {});
    }

    const mappedResult = await mapProfileFieldsToResult(req.user.id, result);
    res.json({ result: mappedResult });
});

app.delete("/api/mock-test-results/:id", requireUser, requireAdmin, (req, res) => {
    try {
        const removed = mockTestStore.removeResult(req.user.id, req.params.id);
        if (!removed) return res.status(404).json({ error: "Mock test result not found" });
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: "Could not delete mock test result" });
    }
});

app.get("/api/profile/mock-tests", requireUser, (req, res) => {
    res.json(mockTestStore.profileSummary(req.user.id));
});

function manualPaymentResponse(request) {
    if (!request) return null;
    return {
        id: String(request._id || request.id),
        userId: String(request.userId || ""),
        userEmail: request.userEmail || "",
        userName: request.userName || "",
        planId: request.planId,
        planName: request.planName,
        amount: request.amount,
        currency: request.currency || "UZS",
        paymentMethod: request.paymentMethod || "manual_card",
        status: request.status || "pending",
        cardLastFour: request.cardLastFour || "0011",
        createdAt: request.createdAt || null,
        updatedAt: request.updatedAt || null,
        verifiedAt: request.verifiedAt || null,
        verifiedBy: request.verifiedBy ? String(request.verifiedBy) : null,
        rejectedAt: request.rejectedAt || null,
        rejectedBy: request.rejectedBy ? String(request.rejectedBy) : null,
        adminNote: request.adminNote || ""
    };
}

app.post("/api/premium/manual-payment-requests", requireUser, async (req, res) => {
    res.status(410).json({ error: "Manual Premium payment requests are no longer accepted through this endpoint." });
});

app.post("/api/mock-test-assets/audio", requireAdmin, mockAudioUpload.single("audio"), validateUploadContents({ audio: "audio" }), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Choose an audio file" });
    }

    res.status(201).json({
        audioUrl: `/uploads/mock-tests/${path.basename(req.file.path)}`,
        fileName: req.file.originalname
    });
});

app.post("/api/mock-test-assets/image", requireAdmin, mockImageUpload.single("image"), validateUploadContents({ image: "image" }), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Choose an image file" });
    }

    res.status(201).json({
        imageUrl: `/uploads/mock-tests/${path.basename(req.file.path)}`,
        fileName: req.file.originalname
    });
});

app.get("/api/admin/mock-tests", requireAdmin, (req, res) => {
    const tests = mockTestStore
        .listTests({ includeDraft: true })
        .map(mockTestStore.adminSummary);
    res.json({ tests: paginateArray(req, res, tests, { defaultLimit: 50, maxLimit: 100 }) });
});

app.get("/api/admin/mock-tests/:id", requireAdmin, (req, res) => {
    const test = mockTestStore.getTest(req.params.id, { includeDraft: true });

    if (!test) {
        return res.status(404).json({ error: "Mock test not found" });
    }

    res.json({ test });
});

app.post("/api/admin/mock-tests", requireAdmin, async (req, res) => {
    try {
        const payload = req.body || {};
        const errors = await validateMockTestPayload(payload);

        if (errors.length) {
            return res.status(400).json({ error: errors.join(" ") });
        }

        const test = mockTestStore.createTest(payload);
        res.status(201).json({
            message: "Mock test created successfully.",
            test
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : "Failed to save mock test."
        });
    }
});

app.put("/api/admin/mock-tests/:id", requireAdmin, async (req, res) => {
    try {
        const existing = mockTestStore.getTest(req.params.id, { includeDraft: true });

        if (!existing) {
            return res.status(404).json({ error: "Mock test not found" });
        }

        const payload = req.body || {};
        const errors = await validateMockTestPayload({
            ...existing,
            ...payload
        });

        if (errors.length) {
            return res.status(400).json({ error: errors.join(" ") });
        }

        const test = mockTestStore.updateTest(req.params.id, payload);

        if (!test) {
            return res.status(404).json({ error: "Mock test not found" });
        }

        res.json({
            message: "Mock test updated successfully.",
            test
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : "Failed to save mock test."
        });
    }
});

app.delete("/api/admin/mock-tests/:id", requireAdmin, (req, res) => {
    if (!mockTestStore.deleteTest(req.params.id)) {
        return res.status(404).json({ error: "Mock test not found" });
    }

    res.json({ message: "Mock test deleted successfully." });
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
    requireAuth,
    fullTestStore,
    uploadsRoot: UPLOAD_DIR,
    safeFileName,
    getReadingTestById,
    getListeningTestById,
    resolveFullTestLocator: resolveFullTest,
    publicUrlForFullTest: publicFullTestUrl,
    reviewMistakeStore
});

registerWritingRoutes(app, {
    requireAuth,
    requireAdmin,
    requirePremiumWriting: requirePremiumFeatureApi("writing"),
    requirePremiumWritingOrMockAccess: requirePremiumFeatureOrMockAccessApi("writing"),
    listeningImageUpload,
    getMockWritingFullTest: buildMockWritingFullTest
});

registerSpeakingRoutes(app, {
    requireAuth,
    requireAdmin,
    requirePremiumSpeaking: requirePremiumFeatureApi("speaking"),
    requirePremiumSpeakingOrMockAccess: requirePremiumFeatureOrMockAccessApi("speaking"),
    uploadsRoot: UPLOAD_DIR,
    safeFileName,
    getMockSpeakingTests: buildMockSpeakingFullTests
});

registerStudyPlanRoutes(app, {
    requireAuth,
    requireStudyPlanAccessApi,
    studyPlanStore,
    userProgressStore,
    mockTestStore,
    reviewMistakeStore,
    vocabularyStore,
    loadWriting: async (userId) => mongoose.connection.readyState === 1
        ? WritingSubmission.find({ userId: String(userId) }).sort({ createdAt: -1 }).limit(20).lean()
        : [],
    loadSpeaking: async (userId) => mongoose.connection.readyState === 1
        ? SpeakingSubmission.find({ userId: String(userId) }).sort({ createdAt: -1 }).limit(20).lean()
        : []
});

registerAICoachRoutes(app, {
    requireAuth,
    aiCoachStore,
    hasPremiumAccess,
    userProgressStore,
    mockTestStore,
    reviewMistakeStore,
    vocabularyStore,
    studyPlanStore,
    userStore,
    loadWriting: async (userId) => mongoose.connection.readyState === 1
        ? WritingSubmission.find({ userId: String(userId) }).sort({ createdAt: -1 }).limit(20).lean()
        : [],
    loadSpeaking: async (userId) => mongoose.connection.readyState === 1
        ? SpeakingSubmission.find({ userId: String(userId) }).sort({ createdAt: -1 }).limit(20).lean()
        : []
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "login.html"));
});

app.get("/signup", (req, res) => {
    res.sendFile(path.join(ROOT_DIR, "signup.html"));
});

app.post("/api/reading-tests", requireAdmin, (req, res) => {
    try {
        const body = { ...req.body };
        if (body.autoNumberNewest === true && normalizePart(body.part) === "full") {
            shiftNewestManualReadingTitles();
            body.title = "Test 1";
        }
        const test = buildManualReadingTest(body);
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
    let tests = readManualReadingTestSummaries();

    if (part) {
        tests = tests.filter((test) => String(test.part) === String(part));
    }

    res.json(paginateArray(req, res, tests, { defaultLimit: 50, maxLimit: 100 }));
});

app.get("/api/reading-tests/:id", (req, res) => {
    const test = buildMockReadingTest(req.params.id) || resolveManualReadingTest(req.params.id);

    if (!test || (isMockOnlyTest(test) && !String(req.params.id).startsWith("mock-reading-"))) {
        return res.status(404).json({ error: "Reading test not found" });
    }

    res.json(publicTestData(test));
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

function setTranslateCorsHeaders(req, res) {
    const origin = String(req.headers.origin || "").trim();

    if (TRANSLATE_CORS_ORIGINS.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function handleTranslateOptions(req, res) {
    setTranslateCorsHeaders(req, res);
    res.status(204).end();
}

async function handleContextTranslateRequest(req, res) {
    setTranslateCorsHeaders(req, res);

    try {
        let owner = vocabularyOwnerFromRequest(req);
        const payload = normalizeContextTranslationPayload(req.body || {});

        if (!owner.ownerId) {
            const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
            owner = {
                ownerType: "session",
                ownerId: cleanPrivacyScopeId(forwardedFor || req.ip || "anonymous", "anonymous")
            };
        }

        if (!payload.selectedText) {
            return res.status(400).json({
                error: "selectedText is required"
            });
        }

        const cacheKey = contextTranslationCacheKey(owner, payload);
        const cached = contextTranslationCache.get(cacheKey);

        if (cached) {
            return res.json({
                ...cached,
                cached: true
            });
        }

        let pending = contextTranslationRequests.get(cacheKey);

        if (!pending) {
            pending = requestContextTranslation(payload)
                .then((record) => {
                    cacheContextTranslation(cacheKey, record);
                    return record;
                })
                .finally(() => contextTranslationRequests.delete(cacheKey));
            contextTranslationRequests.set(cacheKey, pending);
        }

        const record = await pending;
        res.json({
            ...record,
            cached: false
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const requestId = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

        console.error("Context translation error:", {
            requestId,
            message: error.message,
            statusCode,
            stack: error.stack,
            hasOpenAIKey: Boolean(OPENAI_API_KEY),
            hasGoogleTranslateKey: Boolean(GOOGLE_TRANSLATE_API_KEY),
            selectedText: req.body?.selectedText || req.body?.word || req.body?.phrase || ""
        });

        res.status(statusCode).json({
            error: CONTEXT_TRANSLATION_ERROR_MESSAGE,
            errorCode: "TRANSLATION_UNAVAILABLE",
            requestId
        });
    }
}

app.options("/api/translate", handleTranslateOptions);
app.options("/api/translate-context", handleTranslateOptions);
app.post("/api/translate", handleContextTranslateRequest);
app.post("/api/translate-context", handleContextTranslateRequest);

app.get("/api/vocabulary/lookup", async (req, res) => {
    try {
        const requestedWord = String(req.query.word || "").trim();
        const normalized = normalizeVocabularyWord(requestedWord);
        const testId = String(req.query.testId || "").trim();
        const passageIdFromQuery = String(req.query.passageId || "").trim();
        const attemptId = String(req.query.attemptId || "").trim();
        const owner = vocabularyOwnerFromRequest(req);

        if (!requestedWord || !normalized) {
            return res.status(400).json({ error: "A valid word is required" });
        }

        const test = findReadingTestForVocabulary(testId, passageIdFromQuery);
        const passageId = passageIdFromQuery || (test ? `${test.id}-passage-${test.part || 1}` : "reading-passage");
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
            ownerType: owner.ownerType,
            ownerId: owner.ownerId,
            testId,
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
    const testId = cleanPrivacyScopeId(req.query.testId || "");
    const owner = vocabularyOwnerFromRequest(req);

    if (!attemptId) {
        return res.status(400).json({ error: "attemptId is required" });
    }
    if (!owner.ownerId) {
        return res.status(400).json({ error: "sessionId is required for anonymous vocabulary history" });
    }

    const words = readJsonArray(READING_VOCABULARY_CLICKS_FILE)
        .filter((item) => (
            item.owner_type === owner.ownerType &&
            item.owner_id === owner.ownerId &&
            item.attempt_id === attemptId &&
            (!testId || item.test_id === testId)
        ))
        .sort((a, b) => new Date(a.clicked_at) - new Date(b.clicked_at));

    res.json(words);
});

app.post("/api/vocabulary", requireUser, requireVocabularyPremiumApi, async (req, res) => {
    try {
        const body = req.body || {};
        if (JSON.stringify(body).length > 50000) {
            return res.status(413).json({ error: "Vocabulary payload is too large" });
        }
        const contextSentence = String(body.contextSentence || "").trim();
        let generated = {};
        if (body.word && (!body.definition || !body.uzbekTranslation || !body.partOfSpeech)) {
            try {
                generated = await requestContextTranslation(normalizeContextTranslationPayload({
                    selectedText: body.word,
                    sentence: contextSentence || body.word,
                    paragraph: contextSentence || body.word,
                    testId: body.testId,
                    passageId: body.passageNumber ? `passage-${body.passageNumber}` : `part-${body.partNumber || 1}`
                }));
            } catch (error) {
                console.warn("Vocabulary enrichment failed; saving available fields:", error.message);
            }
        }
        const result = await vocabularyStore.upsert(req.user.id, {
            ...generated,
            ...body,
            sourceType: "reading",
            transcriptContext: "",
            audioUrl: "",
            audioStartTime: null,
            audioEndTime: null,
            partNumber: null,
            definition: body.definition || generated.definition || generated.meaningInEnglish || "",
            uzbekTranslation: body.uzbekTranslation || generated.uzbekTranslation || generated.translation || "",
            partOfSpeech: body.partOfSpeech || generated.partOfSpeech || "",
            pronunciation: body.pronunciation || generated.pronunciation || generated.phonetic || "",
            simpleExample: body.simpleExample || generated.example || generated.example_sentence || "",
            synonyms: body.synonyms || generated.synonyms || [],
            antonyms: body.antonyms || generated.antonyms || []
        });
        res.status(result.alreadyExists ? 200 : 201).json({
            ...result,
            message: result.alreadyExists
                ? "This word is already in your vocabulary. Its source history was updated."
                : "Word added to your vocabulary.",
            summary: await vocabularyStore.summary(req.user.id)
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message || "Could not save this word" });
    }
});

app.post("/api/vocabulary/translate", requireUser, requireVocabularyPremiumApi, async (req, res) => {
    try {
        const text = String(req.body?.text || "").trim();
        const sourceLanguage = String(req.body?.sourceLanguage || "").toLowerCase();
        const targetLanguage = String(req.body?.targetLanguage || "").toLowerCase();

        if (!text) return res.status(400).json({ error: "Enter text to translate" });
        if (text.length > 5000) return res.status(413).json({ error: "Text must be 5,000 characters or fewer" });

        const translation = await requestVocabularyAiTranslation({ text, sourceLanguage, targetLanguage });
        res.setHeader("Cache-Control", "no-store");
        res.json({ translation, sourceLanguage, targetLanguage });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        console.warn("Vocabulary AI translation failed:", {
            statusCode,
            message: error.message,
            hasOpenAIKey: Boolean(OPENAI_API_KEY)
        });
        res.status(statusCode).json({
            error: statusCode === 429
                ? "AI translator is busy. Please try again shortly."
                : (statusCode === 400 || statusCode === 413 ? error.message : "AI translation is unavailable right now.")
        });
    }
});

app.get("/api/vocabulary", requireUser, requireVocabularyPremiumApi, async (req, res) => {
    try {
        const options = {
            search: String(req.query.search || "").slice(0, 160),
            sourceType: String(req.query.sourceType || "").toLowerCase(),
            status: String(req.query.status || "").toLowerCase(),
            due: req.query.due === "1" || req.query.due === "true",
            sort: String(req.query.sort || "newest").toLowerCase()
        };
        const [items, summary] = await Promise.all([
            vocabularyStore.list(req.user.id, options),
            vocabularyStore.summary(req.user.id, { sourceType: "reading" })
        ]);
        res.json({ items, summary });
    } catch {
        res.status(500).json({ error: "Could not load vocabulary" });
    }
});

app.get("/api/vocabulary/review/due", requireUser, requireVocabularyPremiumApi, async (req, res) => {
    try {
        res.json({
            items: await vocabularyStore.list(req.user.id, { due: true, sourceType: "reading" }),
            summary: await vocabularyStore.summary(req.user.id, { sourceType: "reading" })
        });
    } catch {
        res.status(500).json({ error: "Could not load due vocabulary" });
    }
});

app.get("/api/vocabulary/:id", requireUser, requireVocabularyPremiumApi, async (req, res) => {
    if (!req.params.id || String(req.params.id).length > 100) return res.status(400).json({ error: "Invalid vocabulary id" });
    const item = await vocabularyStore.get(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: "Vocabulary word not found" });
    res.json({ item });
});

app.post("/api/vocabulary/:id/regenerate", requireUser, requireVocabularyPremiumApi, async (req, res) => {
    try {
        if (!req.params.id || String(req.params.id).length > 100) return res.status(400).json({ error: "Invalid vocabulary id" });
        const existing = await vocabularyStore.get(req.user.id, req.params.id);
        if (!existing) return res.status(404).json({ error: "Vocabulary word not found" });
        const source = existing.sources?.[existing.sources.length - 1] || {};
        const context = source.contextSentence || source.transcriptContext || existing.word;
        const generated = await requestContextTranslation(normalizeContextTranslationPayload({
            selectedText: existing.word,
            sentence: context,
            paragraph: context,
            testId: source.testId,
            passageId: source.passageNumber ? `passage-${source.passageNumber}` : `part-${source.partNumber || 1}`
        }));
        const item = await vocabularyStore.update(req.user.id, req.params.id, {
            definition: generated.definition || generated.meaningInEnglish || existing.definition,
            uzbekTranslation: generated.uzbekTranslation || generated.translation || existing.uzbekTranslation,
            partOfSpeech: generated.partOfSpeech || existing.partOfSpeech,
            pronunciation: generated.pronunciation || generated.phonetic || existing.pronunciation,
            simpleExample: generated.example || generated.example_sentence || existing.simpleExample,
            synonyms: generated.synonyms || existing.synonyms,
            antonyms: generated.antonyms || existing.antonyms
        });
        res.json({ item, message: "Vocabulary details regenerated." });
    } catch (error) {
        res.status(error.statusCode || 502).json({ error: error.message || "Could not regenerate vocabulary details" });
    }
});

app.patch("/api/vocabulary/:id", requireUser, requireVocabularyPremiumApi, async (req, res) => {
    try {
        if (!req.params.id || String(req.params.id).length > 100 || JSON.stringify(req.body || {}).length > 30000) {
            return res.status(400).json({ error: "Invalid vocabulary update" });
        }
        const item = await vocabularyStore.update(req.user.id, req.params.id, req.body || {});
        if (!item) return res.status(404).json({ error: "Vocabulary word not found" });
        res.json({ item, summary: await vocabularyStore.summary(req.user.id) });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message || "Could not update vocabulary" });
    }
});

app.delete("/api/vocabulary/:id", requireUser, requireVocabularyPremiumApi, async (req, res) => {
    if (!req.params.id || String(req.params.id).length > 100) return res.status(400).json({ error: "Invalid vocabulary id" });
    const removed = await vocabularyStore.remove(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: "Vocabulary word not found" });
    res.json({ success: true, summary: await vocabularyStore.summary(req.user.id) });
});

app.post("/api/vocabulary/:id/review", requireUser, requireVocabularyPremiumApi, async (req, res) => {
    try {
        if (!req.params.id || String(req.params.id).length > 100) return res.status(400).json({ error: "Invalid vocabulary id" });
        const item = await vocabularyStore.review(req.user.id, req.params.id, String(req.body?.difficulty || "").toLowerCase());
        if (!item) return res.status(404).json({ error: "Vocabulary word not found" });
        res.json({ item, summary: await vocabularyStore.summary(req.user.id) });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message || "Could not save vocabulary review" });
    }
});

app.post("/api/listening-assets/audio", requireAdmin, audioUpload.single("audio"), validateUploadContents({ audio: "audio" }), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Choose an audio file" });
    }

    res.status(201).json({
        audioUrl: `/uploads/audio/${path.basename(req.file.path)}`,
        fileName: req.file.originalname
    });
});

app.post("/api/listening-assets/image", requireAdmin, listeningImageUpload.single("image"), validateUploadContents({ image: "image" }), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Choose an image file" });
    }

    res.status(201).json({
        imageUrl: `/uploads/listening-images/${path.basename(req.file.path)}`,
        fileName: req.file.originalname
    });
});

app.post("/api/listening-tests", requireAdmin, audioUpload.single("audio"), validateUploadContents({ audio: "audio" }), (req, res) => {
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
    let tests = readManualListeningTestSummaries();

    if (part && part !== "full") {
        const partNumber = Number(part);
        return res.json(paginateArray(req, res, tests.filter((test) => Number(test.part) === partNumber), { defaultLimit: 50, maxLimit: 100 }));
    }

    if (part === "full") {
        tests = tests.filter((test) => test.part === "full");
    } else if (!part && !includeDerived) {
        tests = tests.filter((test) => !test.sourceFullTestId || test.part === "full");
    }

    res.json(paginateArray(req, res, tests, { defaultLimit: 50, maxLimit: 100 }));
});

app.post("/api/listening-assets/transcript", requireAdmin, async (req, res) => {
    try {
        if (!OPENAI_API_KEY) {
            return res.status(503).json({ error: "Automatic transcription is not configured. Add OPENAI_API_KEY or use manual transcript import." });
        }
        const audioPath = resolveUploadedAssetPath(req.body?.audioUrl);
        const resolvedAudioDir = path.resolve(AUDIO_UPLOAD_DIR);
        if (!audioPath || !fs.existsSync(audioPath) || !audioPath.startsWith(`${resolvedAudioDir}${path.sep}`)) {
            return res.status(400).json({ error: "Upload the Listening part audio before generating a transcript." });
        }
        if (!listeningTranscriptionClient) {
            listeningTranscriptionClient = new OpenAI({ apiKey: OPENAI_API_KEY, timeout: 10 * 60 * 1000 });
        }
        const transcription = await listeningTranscriptionClient.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: OPENAI_TRANSCRIPTION_MODEL,
            response_format: "verbose_json",
            timestamp_granularities: ["segment"]
        });
        const transcriptSegments = normalizeTranscriptSegments(
            (transcription.segments || []).map((segment, index) => ({
                id: `segment-${index + 1}`,
                start: segment.start,
                end: segment.end,
                text: segment.text
            }))
        );
        res.json({
            transcriptText: String(transcription.text || transcriptSegments.map((segment) => segment.text).join(" ")).trim(),
            transcriptSegments
        });
    } catch (error) {
        console.error("Listening transcript generation error:", error.message);
        res.status(error.status || error.statusCode || 502).json({
            error: error.message || "Could not generate transcript"
        });
    }
});

app.get("/api/admin/listening-tests/:id", requireAdmin, (req, res) => {
    let test = buildMockListeningTest(req.params.id) || resolveManualListeningTest(req.params.id);
    if (!test) test = resolveManualListeningTest(`${req.params.id}-listening-full`);
    if (!test) return res.status(404).json({ error: "Listening test not found" });
    res.setHeader("Cache-Control", "no-store");
    res.json(test);
});

app.get("/api/listening-tests/:id", (req, res) => {
    let test = buildMockListeningTest(req.params.id) || resolveManualListeningTest(req.params.id);

    if (!test) {
        test = resolveManualListeningTest(`${req.params.id}-listening-full`);
    }

    if (!test) {
        const fullTest = resolveFullTest(req.params.id, "listening");
        if (fullTest && fullTest.listening) {
            const manualId = fullTest.manualListeningTestId || `${fullTest.id}-listening-full`;
            test = resolveManualListeningTest(manualId);
        }
    }

    if (!test || (isMockOnlyTest(test) && !String(req.params.id).startsWith("mock-listening-"))) {
        return res.status(404).json({ error: "Listening test not found" });
    }

    res.json(publicTestData(test));
});

app.put("/api/listening-tests/:id", requireAdmin, audioUpload.single("audio"), validateUploadContents({ audio: "audio" }), (req, res) => {
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

    res.json(paginateArray(req, res, tests.map(summarizeTest), { defaultLimit: 50, maxLimit: 100 }));
});

app.get("/api/tests/:id", (req, res) => {
    const test = readTests().find((item) => item.id === req.params.id);

    if (!test) {
        return res.status(404).json({ error: "Test not found" });
    }

    res.json(publicTestData(test));
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
            fullTests: stats.fullTests,
            mockTests: stats.mockTests
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not load admin stats" });
    }
});

app.get("/api/admin/manual-payments", requireAuth, adminOnly, async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json([]);
        }

        const status = String(req.query.status || "").trim();
        const query = {};
        if (["pending", "verified", "rejected", "cancelled"].includes(status)) {
            query.status = status;
        }

        const requests = await ManualPaymentRequest.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        res.json(requests.map(manualPaymentResponse));
    } catch (error) {
        console.error("Manual payments list error:", error);
        res.status(500).json({ error: "Could not load manual payment requests" });
    }
});

app.put("/api/admin/manual-payments/:id/verify", requireAuth, adminOnly, async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Manual payment verification requires the database connection" });
        }

        const requestId = String(req.params.id || "");
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return res.status(400).json({ error: "Invalid payment request" });
        }

        const pendingRequest = await ManualPaymentRequest.findById(requestId);
        if (!pendingRequest) {
            return res.status(404).json({ error: "Payment request not found" });
        }
        if (pendingRequest.status !== "pending") {
            return res.status(409).json({ error: "This payment request has already been processed" });
        }

        const plan = premiumPlans[pendingRequest.planId];
        if (!plan) {
            return res.status(400).json({ error: "Payment request plan is no longer valid" });
        }

        const user = await userStore.findUserById(String(pendingRequest.userId));
        if (!user) {
            return res.status(404).json({ error: "Payment request user not found" });
        }

        const verifiedRequest = await ManualPaymentRequest.findOneAndUpdate(
            { _id: requestId, status: "pending" },
            {
                $set: {
                    status: "verified",
                    verifiedAt: new Date(),
                    verifiedBy: req.user.id,
                    adminNote: String(req.body?.adminNote || "").trim().slice(0, 500)
                }
            },
            { new: true }
        );

        if (!verifiedRequest) {
            return res.status(409).json({ error: "This payment request has already been processed" });
        }

        const startDate = new Date();
        const expiryDate = new Date(startDate.getTime() + plan.durationDays * 86400000);
        const manualGrantDates = effectivePremiumDates({
            ...(typeof user.toObject === "function" ? user.toObject() : user),
            manualPremiumActive: true,
            manualPremiumStartsAt: startDate,
            manualPremiumEndsAt: expiryDate
        });
        const updatedUser = await userStore.updateUser(String(pendingRequest.userId), {
            plan: "premium",
            isPremium: true,
            premiumUntil: manualGrantDates.expiresAt,
            premiumActivatedAt: manualGrantDates.activatedAt || startDate,
            premiumExpiresAt: manualGrantDates.expiresAt,
            premiumCancelledAt: null,
            manualPremiumActive: true,
            manualPremiumPlan: plan.id,
            manualPremiumStartsAt: startDate,
            manualPremiumEndsAt: expiryDate,
            manualPremiumNote: String(req.body?.adminNote || `Verified manual card payment ${verifiedRequest._id}`).trim().slice(0, 500),
            subscriptionAdminNote: String(req.body?.adminNote || `Verified manual card payment ${verifiedRequest._id}`).trim().slice(0, 500)
        });

        res.json({
            success: true,
            request: manualPaymentResponse(verifiedRequest),
            user: publicUser(updatedUser)
        });
    } catch (error) {
        console.error("Manual payment verify error:", error);
        res.status(500).json({ error: "Could not verify manual payment" });
    }
});

app.put("/api/admin/manual-payments/:id/reject", requireAuth, adminOnly, async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Manual payment rejection requires the database connection" });
        }

        const requestId = String(req.params.id || "");
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return res.status(400).json({ error: "Invalid payment request" });
        }

        const rejectedRequest = await ManualPaymentRequest.findOneAndUpdate(
            { _id: requestId, status: "pending" },
            {
                $set: {
                    status: "rejected",
                    rejectedAt: new Date(),
                    rejectedBy: req.user.id,
                    adminNote: String(req.body?.adminNote || "").trim().slice(0, 500)
                }
            },
            { new: true }
        );

        if (!rejectedRequest) {
            const existing = await ManualPaymentRequest.findById(requestId);
            if (!existing) return res.status(404).json({ error: "Payment request not found" });
            return res.status(409).json({ error: "This payment request has already been processed" });
        }

        res.json({
            success: true,
            request: manualPaymentResponse(rejectedRequest)
        });
    } catch (error) {
        console.error("Manual payment reject error:", error);
        res.status(500).json({ error: "Could not reject manual payment" });
    }
});

app.get("/api/admin/users", requireAuth, adminOnly, async (req, res) => {
    try {
        const pagination = paginationParams(req, { defaultLimit: 50, maxLimit: 100 });
        const result = await userStore.listUsers({
            page: pagination.page,
            limit: pagination.limit,
            role: req.query.role
        });
        const formatted = result.items.map((user) => {
            const uRole = publicUser(user).role;
            const isPremium = hasPremiumAccess(publicUser(user));
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
                subscriptionPlan: user.subscriptionPlan || user.manualPremiumPlan || null,
                subscriptionStatus: isPremium ? "active" : (user.subscriptionStatus || "free"),
                subscriptionStartedAt: user.subscriptionStartedAt || user.manualPremiumStartsAt || null,
                subscriptionExpiresAt: user.subscriptionEndsAt || user.subscriptionExpiresAt || user.manualPremiumEndsAt || user.premiumUntil || null,
                subscriptionAdminNote: user.subscriptionAdminNote || "",
                createdAt: user.createdAt || null,
                lastLogin: user.lastLogin || null
            };
        });
        setPaginationHeaders(res, {
            page: result.page,
            limit: result.limit,
            total: result.total
        });
        res.json(formatted);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not load admin users" });
    }
});

app.put("/api/admin/users/:id/subscription", requireAuth, adminOnly, async (req, res) => {
    try {
        const planId = String(req.body?.planId || "").trim();
        const cancel = req.body?.status === "cancelled";
        const plan = premiumPlans[planId];
        if (!cancel && !plan) return res.status(400).json({ error: "A valid Premium plan is required" });

        const existingUser = await userStore.findUserById(req.params.id);
        if (!existingUser) return res.status(404).json({ error: "User not found" });

        const startDate = new Date(req.body?.startDate || Date.now());
        if (Number.isNaN(startDate.getTime())) return res.status(400).json({ error: "A valid start date is required" });
        const now = new Date();
        const expiryDate = cancel
            ? now
            : new Date(req.body?.expiryDate || (startDate.getTime() + plan.durationDays * 86400000));
        if (Number.isNaN(expiryDate.getTime())) return res.status(400).json({ error: "A valid expiry date is required" });
        if (!cancel && expiryDate <= startDate) {
            return res.status(400).json({ error: "Expiry date must be after the start date" });
        }
        if (!cancel && expiryDate <= now) {
            return res.status(400).json({ error: "Expiry date must be in the future" });
        }

        const note = String(req.body?.note || "").trim().slice(0, 500);
        const existingSource = typeof existingUser.toObject === "function" ? existingUser.toObject() : existingUser;
        const lemonAccess = isLemonSqueezyPremiumActive(existingSource, now);
        const sourceAfterManualChange = {
            ...existingSource,
            manualPremiumActive: !cancel,
            manualPremiumStartsAt: cancel ? existingSource.manualPremiumStartsAt : startDate,
            manualPremiumEndsAt: expiryDate
        };
        const combinedDates = effectivePremiumDates(sourceAfterManualChange);
        const updates = cancel ? {
            plan: lemonAccess ? "premium" : "free",
            isPremium: lemonAccess,
            premiumUntil: combinedDates.expiresAt || (lemonAccess ? null : expiryDate),
            premiumExpiresAt: combinedDates.expiresAt || (lemonAccess ? null : expiryDate),
            premiumCancelledAt: now,
            manualPremiumActive: false,
            manualPremiumEndsAt: expiryDate,
            manualPremiumNote: note,
            subscriptionAdminNote: note
        } : {
            plan: "premium",
            isPremium: true,
            premiumUntil: combinedDates.expiresAt,
            premiumActivatedAt: combinedDates.activatedAt || startDate,
            premiumExpiresAt: combinedDates.expiresAt,
            premiumCancelledAt: null,
            manualPremiumActive: true,
            manualPremiumPlan: planId,
            manualPremiumStartsAt: startDate,
            manualPremiumEndsAt: expiryDate,
            manualPremiumNote: note,
            subscriptionAdminNote: note
        };
        const user = await userStore.updateUser(req.params.id, updates);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, user: publicUser(user) });
    } catch (error) {
        console.error("Subscription management error:", error);
        res.status(500).json({ error: "Could not update subscription" });
    }
});

app.get("/api/admin/stats/users", requireAuth, adminOnly, async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const adminEmails = getAdminEmails();
            const [totalUsers, todayUsers, premiumUsers, adminUsers] = await Promise.all([
                User.countDocuments(),
                User.countDocuments({ createdAt: { $gte: startOfToday } }),
                User.countDocuments({ isPremium: true }),
                adminEmails.length
                    ? User.countDocuments({ role: "admin", email: { $in: adminEmails } })
                    : Promise.resolve(0)
            ]);

            return res.json({
                totalUsers,
                todayUsers,
                premiumUsers,
                freeUsers: Math.max(totalUsers - premiumUsers, 0),
                adminUsers
            });
        }

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
            const uRole = publicUser(user).role;
            
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

app.post("/upload", requireAdmin, upload.single("pdf"), validateUploadContents({ pdf: "pdf" }), async (req, res) => {
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

app.post("/signup", signupRateLimit, async (req, res) => {
    try {
        const body = req.body || {};
        const username = String(body.username || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

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
            role: "user"
        });
        const token = createAuthToken(newUser);
        userProgressStore.recordAccountActivity(newUser._id || newUser.id, "Account created");

        // Set the secure, httpOnly cookie correctly from backend
        const secureCookie = process.env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https";
        res.cookie("ieltsmockAuthToken", token, {
            httpOnly: true,
            secure: secureCookie,
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.status(201).json({
            success: true,
            message: "Account created successfully",
            user: publicUser(newUser)
        });

        sendTelegramMessage(
            `🆕 New signup\n<b>${username}</b>\n${email}\nStorage: ${userStore.getStorageMode()}`
        ).catch(() => {});
    } catch (error) {
        console.error(error);
        if (error?.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0] || "account";
            const duplicateMessage = duplicateField === "email"
                ? "This email is already registered"
                : "This account cannot be created with the current login method. Please try logging in instead.";
            return res.status(409).json({
                success: false,
                message: duplicateMessage
            });
        }

        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Signup failed"
        });
    }
});

async function handleLogin(req, res) {
    try {
        const body = req.body || {};
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

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
        
        const updates = { lastLogin };
        if (!user.testTakerId || !user.testTakerId.trim()) {
            const mongoose = require("mongoose");
            let generatedId;
            if (mongoose.connection.readyState === 1) {
                generatedId = await getNextTestTakerId();
            } else {
                const users = userStore.getAllUsers ? await userStore.getAllUsers() : [];
                generatedId = getNextTestTakerIdLocal(users);
            }
            updates.testTakerId = generatedId;
            user.testTakerId = generatedId;
        }
        
        await userStore.updateUser(user._id || user.id, updates);

        const token = createAuthToken(user);
        userProgressStore.recordAccountActivity(user._id || user.id, "Signed in");

        // Set the secure, httpOnly cookie correctly from backend
        const secureCookie = process.env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https";
        res.cookie("ieltsmockAuthToken", token, {
            httpOnly: true,
            secure: secureCookie,
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        await authRateLimitStore.reset(
            (req.authRateLimitBuckets || []).filter((bucketId) => bucketId.startsWith("login-email:"))
        );

        res.json({
            success: true,
            message: "Login successful",
            user: publicUser(user)
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Login failed"
        });
    }
}

app.post("/login", loginRateLimit, handleLogin);
app.post("/api/auth/login", loginRateLimit, handleLogin);


app.get("/auth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

    if (!clientId || !callbackUrl) {
        return res.status(500).send("Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CALLBACK_URL in your environment.");
    }

    const oauthState = createOAuthState(req.query.redirect);
    const secureCookie = process.env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https";
    res.cookie("ieltsxGoogleOAuthState", oauthState.cookieValue, {
        httpOnly: true,
        secure: secureCookie,
        sameSite: "lax",
        path: "/auth/google/callback",
        maxAge: OAUTH_STATE_TTL_MS
    });

    const paramsObj = {
        client_id: clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "select_account",
        state: oauthState.state
    };

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
        new URLSearchParams(paramsObj).toString();

    res.redirect(googleAuthUrl);
});

app.get("/auth/google/callback", async (req, res) => {
    try {
        console.log("[AUTH CALLBACK] Google callback reached");
        const { code, state } = req.query;
        const stateCookie = getCookieValue(req, "ieltsxGoogleOAuthState");
        const verifiedState = verifyOAuthState(state, stateCookie);
        const secureCookie = process.env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https";
        res.clearCookie("ieltsxGoogleOAuthState", {
            httpOnly: true,
            secure: secureCookie,
            sameSite: "lax",
            path: "/auth/google/callback"
        });

        if (!verifiedState) {
            return res.status(400).send("Invalid or expired OAuth state. Please start Google sign-in again.");
        }
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
            console.error("Failed to fetch Google user info", { status: userInfoResponse.status });
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
        console.log("[AUTH CALLBACK] Google email verified");

        let user = await userStore.findUserByEmail(email);

        if (user) {
            console.log("[AUTH CALLBACK] Existing user found");

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
                user = await userStore.updateUser(user._id || user.id, updates);
                console.log("[AUTH CALLBACK] Google account linked");
            } else if (user.googleId !== sub) {
                return res.status(400).send("Safe error: This email is already linked to a different Google account.");
            } else {
                const updates = { lastLogin: new Date() };
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
                role: "user",
                googleId: sub,
                avatar: picture || "",
                authProviders: ["google"]
            });

            console.log("[AUTH CALLBACK] Google account created");
            userProgressStore.recordAccountActivity(user._id || user.id, "Account created (Google)");

            sendTelegramMessage(
                `🆕 New Google signup\n<b>${user.username}</b>\n${user.email}\nStorage: ${userStore.getStorageMode()}`
            ).catch(() => {});
        }

        // Generate JWT
        const token = createAuthToken(user);
        console.log("[AUTH CALLBACK] JWT session created");

        // Store JWT in a secure httpOnly cookie
        const isProduction = secureCookie;
        res.cookie("ieltsmockAuthToken", token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        const defaultPath = user.role === "admin" ? "/admin" : "/dashboard";
        const redirectUrl = verifiedState.redirectPath || defaultPath;
        console.log("[AUTH CALLBACK] Redirect target: " + redirectUrl);

        res.redirect(302, redirectUrl);
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
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated"
            });
        }

        const cookieToken = getCookieValue(req, "ieltsmockAuthToken");
        const cookiePayload = verifyAuthToken(cookieToken);
        if (cookiePayload && String(cookiePayload.id || "") === String(req.user.id || "")) {
            const secureCookie = process.env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https";
            res.cookie("ieltsmockAuthToken", cookieToken, {
                httpOnly: true,
                secure: secureCookie,
                sameSite: "lax",
                path: "/",
                maxAge: 7 * 24 * 60 * 60 * 1000
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
    const secureCookie = process.env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https";

    res.cookie("ieltsmockAuthToken", "", {
        httpOnly: true,
        secure: secureCookie,
        sameSite: "lax",
        path: "/",
        expires: new Date(0),
        maxAge: 0
    });

    res.json({ success: true, message: "Logged out" });
});

async function runUserMigration() {
    console.info("Checking if user ID migration is needed...");
    
    const isMongo = mongoose.connection.readyState === 1;
    
    if (isMongo) {
        try {
            const User = require("./models/User");
            await ensureUserAuthIndexes(User);
            const countMissing = await User.countDocuments({ memberIdNumber: { $exists: false } });
            if (countMissing > 0) {
                console.info(`Found ${countMissing} users without memberId. Starting migration...`);
                
                const allDbUsers = await User.find({});
                let adminUser = allDbUsers.find(isAdminUser);
                
                if (adminUser) {
                    await User.updateOne({ _id: adminUser._id }, { $set: { memberIdNumber: 1, memberId: "001" } });
                    console.info("Migrated administrator account to ID 001");
                }
                
                const nonAdmins = allDbUsers.filter(u => u._id.toString() !== (adminUser?._id.toString() || ""));
                nonAdmins.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
                
                let nextNum = 2;
                for (const user of nonAdmins) {
                    const memberId = String(nextNum).padStart(3, "0");
                    await User.updateOne({ _id: user._id }, { $set: { memberIdNumber: nextNum, memberId } });
                    console.info(`Migrated user account to ID ${memberId}`);
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
        const usersFile = USERS_FILE;
        if (fs.existsSync(usersFile)) {
            try {
                const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
                const needsMigration = users.some(u => !u.memberIdNumber);
                if (needsMigration) {
                    console.info("Starting local users JSON ID migration...");
                    let adminUser = users.find(isAdminUser);
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

    await runSubscriptionSourceMigration().catch(err => console.error("Premium source migration error:", err));
    await ensureReviewMistakeIndexes().catch(err => console.error("Review Mistakes index migration error:", err));
    await runTestTakerIdMigration().catch(err => console.error("Test Taker ID migration error:", err));
}

async function runSubscriptionSourceMigration() {
    if (mongoose.connection.readyState === 1) {
        const legacyPremiumUsers = await User.find({
            isPremium: true,
            lemonSqueezySubscriptionId: { $in: [null, ""] },
            manualPremiumActive: { $ne: true }
        });
        for (const user of legacyPremiumUsers) {
            await User.updateOne({ _id: user._id }, {
                $set: {
                    manualPremiumActive: true,
                    manualPremiumPlan: user.subscriptionPlan || null,
                    manualPremiumStartsAt: user.premiumActivatedAt || user.subscriptionStartedAt || null,
                    manualPremiumEndsAt: user.premiumExpiresAt || user.subscriptionExpiresAt || user.premiumUntil || null,
                    manualPremiumNote: user.subscriptionAdminNote || "Migrated legacy Premium grant"
                }
            });
        }
        if (legacyPremiumUsers.length) console.info(`Separated ${legacyPremiumUsers.length} legacy manual Premium grants.`);
        return;
    }

    if (!fs.existsSync(USERS_FILE)) return;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    let changed = false;
    for (const user of users) {
        if (user.isPremium === true && !user.lemonSqueezySubscriptionId && user.manualPremiumActive !== true) {
            user.manualPremiumActive = true;
            user.manualPremiumPlan = user.subscriptionPlan || null;
            user.manualPremiumStartsAt = user.premiumActivatedAt || user.subscriptionStartedAt || null;
            user.manualPremiumEndsAt = user.premiumExpiresAt || user.subscriptionExpiresAt || user.premiumUntil || null;
            user.manualPremiumNote = user.subscriptionAdminNote || "Migrated legacy Premium grant";
            changed = true;
        }
    }
    if (changed) fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

async function ensureUserAuthIndexes(UserModel) {
    const collection = UserModel.collection;
    const indexes = await collection.indexes();
    const googleIdIndex = indexes.find((index) => index.name === "googleId_1");
    const expectedPartial = googleIdIndex?.partialFilterExpression?.googleId?.$type === "string";

    if (googleIdIndex && !expectedPartial) {
        console.info("Rebuilding users.googleId index for password and Google auth compatibility...");
        await collection.dropIndex("googleId_1");
    }

    if (!googleIdIndex || !expectedPartial) {
        await collection.createIndex(
            { googleId: 1 },
            {
                name: "googleId_1",
                unique: true,
                partialFilterExpression: { googleId: { $type: "string" } }
            }
        );
        console.info("users.googleId index is ready.");
    }
}

async function ensureReviewMistakeIndexes() {
    if (mongoose.connection.readyState !== 1) return;
    const collection = ReviewMistake.collection;
    const indexes = await collection.indexes();
    const legacyIndex = indexes.find((index) => (
        index.name === "userId_1_attemptId_1_questionId_1"
        || JSON.stringify(index.key) === JSON.stringify({ userId: 1, attemptId: 1, questionId: 1 })
    ));
    const currentIndex = indexes.find((index) => (
        index.name === "userId_1_attemptId_1_skill_1_questionId_1"
        || JSON.stringify(index.key) === JSON.stringify({ userId: 1, attemptId: 1, skill: 1, questionId: 1 })
    ));

    if (legacyIndex) {
        console.info("Rebuilding review_mistakes unique index to include skill.");
        await collection.dropIndex(legacyIndex.name);
    }

    if (!currentIndex) {
        await collection.createIndex(
            { userId: 1, attemptId: 1, skill: 1, questionId: 1 },
            { name: "userId_1_attemptId_1_skill_1_questionId_1", unique: true }
        );
        console.info("review_mistakes skill-aware unique index is ready.");
    }
}

async function runTestTakerIdMigration() {
    console.info("Checking if Test Taker ID migration is needed...");
    const isMongo = mongoose.connection.readyState === 1;

    if (isMongo) {
        try {
            const User = require("./models/User");
            const allDbUsers = await User.find({});
            
            allDbUsers.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                if (dateA.getTime() !== dateB.getTime()) {
                    return dateA - dateB;
                }
                return String(a._id).localeCompare(String(b._id));
            });

            const assignedIds = new Set();
            allDbUsers.forEach(u => {
                if (u.testTakerId && u.testTakerId.trim()) {
                    assignedIds.add(u.testTakerId.trim());
                }
            });

            let currentNum = 1;
            for (const user of allDbUsers) {
                if (!user.testTakerId || !user.testTakerId.trim()) {
                    while (true) {
                        const candidate = String(currentNum).padStart(3, "0");
                        if (!assignedIds.has(candidate)) {
                            user.testTakerId = candidate;
                            assignedIds.add(candidate);
                            await User.updateOne({ _id: user._id }, { $set: { testTakerId: candidate } });
                            console.info(`Assigned Test Taker ID ${candidate} to database user`);
                            break;
                        }
                        currentNum++;
                    }
                }
            }
            console.info("MongoDB Test Taker ID migration completed.");
        } catch (err) {
            console.error("MongoDB Test Taker ID migration failed:", err);
        }
    } else {
        const usersFile = USERS_FILE;
        if (fs.existsSync(usersFile)) {
            try {
                const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
                
                users.sort((a, b) => {
                    const dateA = new Date(a.createdAt || 0);
                    const dateB = new Date(b.createdAt || 0);
                    if (dateA.getTime() !== dateB.getTime()) {
                        return dateA - dateB;
                    }
                    return String(a.id).localeCompare(String(b.id));
                });

                const assignedIds = new Set();
                users.forEach(u => {
                    if (u.testTakerId && u.testTakerId.trim()) {
                        assignedIds.add(u.testTakerId.trim());
                    }
                });

                let currentNum = 1;
                let changed = false;
                for (const user of users) {
                    if (!user.testTakerId || !user.testTakerId.trim()) {
                        while (true) {
                            const candidate = String(currentNum).padStart(3, "0");
                            if (!assignedIds.has(candidate)) {
                                user.testTakerId = candidate;
                                assignedIds.add(candidate);
                                changed = true;
                                console.info(`Assigned Test Taker ID ${candidate} to local user`);
                                break;
                            }
                            currentNum++;
                        }
                    }
                }

                if (changed) {
                    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), "utf8");
                }
                console.info("Local users JSON Test Taker ID migration completed.");
            } catch (err) {
                console.error("Local Test Taker ID migration failed:", err);
            }
        }
    }
}

function connectMongooseOnce() {
    if (!process.env.MONGO_URI) return null;
    if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
    if (!global.__ieltsxMongooseConnectionPromise) {
        global.__ieltsxMongooseConnectionPromise = mongoose.connect(process.env.MONGO_URI, {
            dbName: resolveMongoDbName(),
            serverSelectionTimeoutMS: 8000,
            maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10
        });
    }
    return global.__ieltsxMongooseConnectionPromise;
}

if (process.env.MONGO_URI) {
    connectMongooseOnce()
        .then(() => {
            console.info(`MongoDB connected — environment: ${RUNTIME_NAMESPACE}, database: ${resolveMongoDbName()}`);
            runUserMigration().catch(err => console.error("Migration error:", err));
        })
        .catch((error) => {
            global.__ieltsxMongooseConnectionPromise = null;
            console.warn("MongoDB connection error:", error.message);
            console.info(`Using ${RUNTIME_NAMESPACE} file storage for accounts: ${USERS_FILE}`);
            console.info("Atlas fix: Network Access -> Add IP Address -> Allow Access from Anywhere (0.0.0.0/0) for development");
            runUserMigration().catch(err => console.error("Migration error:", err));
        });
} else {
    console.info(`MONGO_URI is not set - using ${RUNTIME_NAMESPACE} file storage: ${USERS_FILE}`);
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

        const privateHtmls = ["/profile.html", "/profile-settings.html", "/full-test-player.html", "/vocabulary.html", "/ai-coach.html"];
        if (privateHtmls.includes(pathLower)) {
            if (!req.user) {
                return res.redirect("/login");
            }
        }
    }
    next();
});

function staticCacheHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();
    const noStoreAssets = new Set([
        "auth-client.js",
        "review-mistakes.js",
        "review-mistakes.css",
        "vocabulary.js",
        "vocabulary.css",
        "study-plan.js",
        "study-plan.css",
        "reading-cbt-app.js",
        "reading-cbt.css",
        "ielts-test-components.js",
        "listening-template.css",
        "listening-test-components.js",
        "listening-template.js"
    ]);

    if (noStoreAssets.has(fileName)) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return;
    }

    if (ext === ".html") {
        res.setHeader("Cache-Control", "no-store");
        return;
    }
    if ([".js", ".css", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff", ".woff2", ".mp3", ".m4a", ".wav", ".webm"].includes(ext)) {
        res.setHeader("Cache-Control", "public, max-age=604800");
    }
}

app.use("/uploads/ielts-import", protectImportedUploads);
app.use("/uploads", express.static(UPLOAD_DIR, {
    maxAge: "7d",
    index: false,
    redirect: false,
    setHeaders: staticCacheHeaders
}));
app.get("/vendor/html2canvas.min.js", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(path.join(ROOT_DIR, "node_modules", "html2canvas", "dist", "html2canvas.min.js"));
});
app.get("/vendor/jspdf.umd.min.js", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(path.join(ROOT_DIR, "node_modules", "jspdf", "dist", "jspdf.umd.min.js"));
});
app.use(express.static(PUBLIC_DIR, {
    maxAge: "7d",
    index: false,
    redirect: false,
    setHeaders: staticCacheHeaders
}));
app.use(express.static(ROOT_DIR, {
    maxAge: "7d",
    setHeaders: staticCacheHeaders
}));

app.use(uploadErrorResponse);

const PORT = process.env.PORT || 30004;

app.listen(PORT, () => {
    console.info(`Server running on http://localhost:${PORT}`);

    if (process.env.BOT_TOKEN && process.env.ADMIN_ID) {
        sendTelegramMessage("IELTSX server started").catch(() => {});
    }
});

module.exports = app;
