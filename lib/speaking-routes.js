const fs = require("fs");
const path = require("path");
const multer = require("multer");
const OpenAI = require("openai");
const SpeakingSubmission = require("../models/SpeakingSubmission");
const SpeakingPart1Test = require("../models/SpeakingPart1Test");
const SpeakingPart2Test = require("../models/SpeakingPart2Test");
const SpeakingPart3Test = require("../models/SpeakingPart3Test");
const FullSpeakingTest = require("../models/FullSpeakingTest");

const OPENAI_MISSING_KEY_ERROR = "OpenAI API key is missing on the server.";
let openaiClient = null;
let openaiClientKey = "";
const recentSpeakingQuestions = new Map();
const SPEAKING_FALLBACK_SETS = [
    {
        part1: { topics: [
            { topic: "Home and neighbourhood", questions: ["Where do you live?", "What do you like most about your neighbourhood?", "Is it a good place for young people?", "Would you like to live there in the future?"] },
            { topic: "Daily routines", questions: ["What is the busiest part of your day?", "Do you usually follow the same routine?", "What would you like to change about your routine?"] }
        ] },
        part2: { topic: "Describe a useful skill you learned", bulletPoints: ["what the skill is", "when and where you learned it", "how you use it", "and explain why it is useful to you"] },
        part3: { questions: ["Why do people continue learning new skills?", "Which skills should schools teach more effectively?", "Is practical experience more valuable than formal education?", "How has technology changed the way people learn?", "Which skills may become important in the future?"] }
    },
    {
        part1: { topics: [
            { topic: "Friends", questions: ["How often do you meet your friends?", "What do you usually do together?", "Do you prefer a few close friends or a large group?", "Has the way you make friends changed?"] },
            { topic: "Weekends", questions: ["What do you usually do at weekends?", "Are your weekends different from your weekdays?", "What would make an ideal weekend for you?"] }
        ] },
        part2: { topic: "Describe a place where you enjoy spending time", bulletPoints: ["where this place is", "when you go there", "what you do there", "and explain why you enjoy spending time there"] },
        part3: { questions: ["Why are public spaces important in cities?", "What makes a place attractive to different age groups?", "Should governments spend more on parks or cultural buildings?", "How do shared spaces affect communities?", "How might public spaces change in the future?"] }
    },
    {
        part1: { topics: [
            { topic: "Reading", questions: ["Do you enjoy reading?", "What kinds of things do you read most often?", "Did you read more when you were younger?", "Do you prefer printed or digital texts?"] },
            { topic: "Weather", questions: ["What kind of weather do you prefer?", "Does weather affect your plans?", "Has the weather in your area changed in recent years?"] }
        ] },
        part2: { topic: "Describe an event you enjoyed attending", bulletPoints: ["what the event was", "where and when it took place", "who you attended it with", "and explain why you enjoyed it"] },
        part3: { questions: ["Why do people enjoy attending public events?", "What benefits can events bring to a community?", "Are large events better than small local events?", "How has technology affected live events?", "Should public money be used to support cultural events?"] }
    }
];

const SPEAKING_TYPE_LABELS = {
    part_1: "Speaking Part 1",
    cue_card: "Cue Card",
    part_3: "Speaking Part 3",
    full_test: "Full Speaking Test"
};

function modeFromPartNumber(partNumber) {
    if (Number(partNumber) === 1) return "part_1";
    if (Number(partNumber) === 3) return "part_3";
    return "cue_card";
}

function normalizeSpeakingMode(value, testMode, partNumber) {
    const mode = String(value || "").trim();
    if (Object.prototype.hasOwnProperty.call(SPEAKING_TYPE_LABELS, mode)) return mode;
    if (mode === "full" || testMode === "full") return "full_test";
    if (mode === "part" || testMode === "part") return modeFromPartNumber(partNumber);
    return mode === "part_2" ? "cue_card" : "cue_card";
}

function normalizeTestMode(value, speakingMode) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "full" || speakingMode === "full_test") return "full";
    return "part";
}

function defaultPartForMode(mode, index) {
    if (mode === "part_1") return 1;
    if (mode === "cue_card") return 2;
    if (mode === "part_3") return 3;
    return index + 1;
}

function registerSpeakingRoutes(app, deps) {
    const { requireAuth, requireAdmin, uploadsRoot, safeFileName, getMockSpeakingTests } = deps;
    const speakingUploadDir = path.join(uploadsRoot, "speaking");
    fs.mkdirSync(speakingUploadDir, { recursive: true });

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, speakingUploadDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || "") || ".webm";
            cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeFileName(file.fieldname)}${ext}`);
        }
    });

    const speakingUpload = multer({
        storage,
        limits: { fileSize: 30 * 1024 * 1024, files: 24 },
        fileFilter: (req, file, cb) => {
            const ext = path.extname(file.originalname || "").toLowerCase();
            const mime = String(file.mimetype || "").toLowerCase();
            const accepted = [".webm", ".ogg", ".mp3", ".wav", ".m4a", ".mp4"].includes(ext) || mime.startsWith("audio/");
            cb(accepted ? null : new Error("Audio must be a browser recording or common audio file."), accepted);
        }
    });

    function getOpenAIClient() {
        const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
        if (!apiKey) {
            const error = new Error(OPENAI_MISSING_KEY_ERROR);
            error.statusCode = 500;
            error.code = "OPENAI_API_KEY_MISSING";
            throw error;
        }

        if (!openaiClient || openaiClientKey !== apiKey) {
            openaiClient = new OpenAI({ apiKey });
            openaiClientKey = apiKey;
        }

        return openaiClient;
    }

    function parseJsonObject(rawContent) {
        const content = String(rawContent || "").trim();
        const withoutFence = content
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/i, "")
            .trim();
        return JSON.parse(withoutFence);
    }

    function coerceBand(value, fieldName) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            throw new Error(`OpenAI response is missing numeric field: ${fieldName}`);
        }
        if (numeric < 0 || numeric > 9) {
            throw new Error(`OpenAI response has out-of-range IELTS band for ${fieldName}: ${numeric}`);
        }
        return Math.round(numeric * 2) / 2;
    }

    function normalizeStringArray(value) {
        return Array.isArray(value)
            ? value.map((item) => String(item || "").trim()).filter(Boolean)
            : [];
    }

    function average(values) {
        return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
    }

    function overallFromCriteria(criteria) {
        return Math.round(average([
            criteria.fluencyCoherence,
            criteria.lexicalResource,
            criteria.grammaticalRangeAccuracy,
            criteria.pronunciation
        ]) * 2) / 2;
    }

    function normalizeFeedback(raw) {
        const criteria = {
            fluencyCoherence: coerceBand(raw.fluencyCoherence, "fluencyCoherence"),
            lexicalResource: coerceBand(raw.lexicalResource, "lexicalResource"),
            grammaticalRangeAccuracy: coerceBand(raw.grammaticalRangeAccuracy, "grammaticalRangeAccuracy"),
            pronunciation: coerceBand(raw.pronunciation, "pronunciation")
        };
        const overallBand = overallFromCriteria(criteria);

        return {
            overallBand,
            ...criteria,
            detailedFeedback: String(raw.detailedFeedback || "").trim(),
            strengths: normalizeStringArray(raw.strengths),
            problems: normalizeStringArray(raw.problems),
            howToImprove: normalizeStringArray(raw.howToImprove),
            improvedAnswers: normalizeStringArray(raw.improvedAnswers),
            practicalTips: normalizeStringArray(raw.practicalTips)
        };
    }

    async function transcribeAudio(filePath) {
        const openai = getOpenAIClient();
        const result = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1",
            language: "en",
            response_format: "text"
        });
        return String(result || "").trim();
    }

    async function evaluateSpeaking({ mode, testMode, testId, part, title, prompt, questionText, userAnswer, parts, transcript }) {
        const openai = getOpenAIClient();
        const partSummary = parts.map((part, index) => (
            `Part ${part.part || index + 1}: ${part.title || part.label || "Speaking response"}\nQuestion text: ${part.questionText || part.prompt || part.topic || ""}\nTranscript:\n${part.transcript || part.userAnswer || ""}`
        )).join("\n\n---\n\n");
        const systemPrompt = `You are an expert IELTS Speaking examiner. Evaluate IELTS Speaking performance from the provided transcript. Return only JSON.
Use IELTS Speaking criteria: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, and Pronunciation.
Score every criterion from 0 to 9 using IELTS half-band increments. Do not invent a high score when the transcript is too short, empty, memorized, or off task. Use "Estimated Band", not "Official IELTS Band".
Return this exact JSON shape:
{
  "overallBand": number,
  "fluencyCoherence": number,
  "lexicalResource": number,
  "grammaticalRangeAccuracy": number,
  "pronunciation": number,
  "detailedFeedback": "string",
  "strengths": ["string"],
  "problems": ["string"],
  "howToImprove": ["string"],
  "improvedAnswers": ["string"],
  "practicalTips": ["string"]
}`;
        const userContent = `Mode: ${mode}
Test mode: ${testMode}
Test ID: ${testId}
Submitted part: ${part || ""}
Title: ${title}
Prompt: ${JSON.stringify(prompt || {})}
Question text:
${questionText || ""}

User answer / transcript:
${userAnswer || transcript || ""}

Combined transcript:
${transcript}

Part-by-part transcript:
${partSummary}`;

        const data = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: 0.25
        });

        const parsed = parseJsonObject(data.choices?.[0]?.message?.content);
        return normalizeFeedback(parsed);
    }

    function safeJsonParse(value, fallback) {
        if (!value) return fallback;
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }

    function publicAudioPath(file) {
        return `/uploads/speaking/${path.basename(file.path)}`;
    }

    function cleanConversationText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function normalizeConversationList(value, fallback) {
        const list = Array.isArray(value) ? value : [];
        const normalized = list
            .map((item) => cleanConversationText(typeof item === "string" ? item : item?.text || item?.question || item?.prompt))
            .filter(Boolean);
        return normalized.length ? normalized : fallback;
    }

    function conversationWordCount(value) {
        return cleanConversationText(value).split(/\s+/).filter(Boolean).length;
    }

    function normalizeConversationCueCard(value, test = {}) {
        const fallbackCue = test.part2CueCard && typeof test.part2CueCard === "object" ? test.part2CueCard : {};
        const topic = cleanConversationText(value?.topic || fallbackCue.topic || "Describe a place you visited recently.");
        const bullets = normalizeConversationList(value?.bullets || fallbackCue.bullets, [
            "where it was",
            "when you went there",
            "who you went with",
            "and explain why you liked it"
        ]);
        return { topic, bullets };
    }

    function normalizePartTurns(value) {
        const turns = value && typeof value === "object" ? value : {};
        return {
            1: Math.max(0, Number(turns[1] || turns.part1 || 0)),
            2: Math.max(0, Number(turns[2] || turns.part2 || 0)),
            3: Math.max(0, Number(turns[3] || turns.part3 || 0))
        };
    }

    function validateGeneratedSpeakingTest(raw) {
        const topics = Array.isArray(raw?.part1?.topics) ? raw.part1.topics : [];
        if (topics.length < 2 || topics.length > 3) throw new Error("Part 1 must contain 2-3 topics.");
        const normalizedTopics = topics.map((item) => {
            const topic = cleanConversationText(item?.topic);
            const questions = normalizeConversationList(item?.questions, []);
            if (!topic || questions.length < 3 || questions.length > 4) throw new Error("Each Part 1 topic must contain 3-4 questions.");
            return { topic, questions };
        });
        const topic = cleanConversationText(raw?.part2?.topic);
        const bulletPoints = normalizeConversationList(raw?.part2?.bulletPoints || raw?.part2?.bullets, []);
        if (!topic || bulletPoints.length !== 4) throw new Error("Part 2 must contain one topic and four bullet points.");
        const part3Questions = normalizeConversationList(raw?.part3?.questions, []);
        if (part3Questions.length < 5 || part3Questions.length > 7) throw new Error("Part 3 must contain 5-7 questions.");
        const allQuestions = [
            ...normalizedTopics.flatMap((item) => item.questions),
            topic,
            ...part3Questions
        ];
        if (allQuestions.some((value) => value.length < 8 || value.length > 220)) throw new Error("Generated question length is invalid.");
        return {
            part1: { topics: normalizedTopics },
            part2: { topic, bulletPoints },
            part3: { questions: part3Questions }
        };
    }

    function fallbackSpeakingTest(userKey = "anonymous") {
        const recent = recentSpeakingQuestions.get(userKey) || [];
        const available = SPEAKING_FALLBACK_SETS.filter((set) => !recent.includes(set.part2.topic));
        const pool = available.length ? available : SPEAKING_FALLBACK_SETS;
        return validateGeneratedSpeakingTest(pool[Math.floor(Math.random() * pool.length)]);
    }

    function rememberSpeakingTest(userKey, test) {
        const recent = recentSpeakingQuestions.get(userKey) || [];
        recentSpeakingQuestions.set(userKey, [test.part2.topic, ...recent.filter((item) => item !== test.part2.topic)].slice(0, 8));
    }

    async function generateSpeakingTest(userKey) {
        const fallback = fallbackSpeakingTest(userKey);
        try {
            const recent = recentSpeakingQuestions.get(userKey) || [];
            const openai = getOpenAIClient();
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                temperature: 0.9,
                messages: [
                    {
                        role: "system",
                        content: `Generate one fresh IELTS Speaking test as strict JSON. Use natural examiner-style British English. Avoid politics, medicine, inappropriate, sensitive, or overly personal content. Part 1: 2-3 familiar topics with 3-4 questions each. Part 2: one cue-card topic with exactly four bulletPoints. Part 3: 5-7 progressively deeper analytical questions directly connected to Part 2. Return only: {"part1":{"topics":[{"topic":"string","questions":["string"]}]},"part2":{"topic":"string","bulletPoints":["string","string","string","string"]},"part3":{"questions":["string"]}}.`
                    },
                    { role: "user", content: `Do not reuse these recent Part 2 topics: ${recent.join(" | ") || "none"}.` }
                ]
            });
            return { test: validateGeneratedSpeakingTest(parseJsonObject(completion.choices?.[0]?.message?.content)), source: "ai" };
        } catch (error) {
            console.warn("Speaking question generation fallback:", error.message || error);
            return { test: fallback, source: "fallback" };
        }
    }

    function fallbackExaminerNext({ event, conversationState, transcript }) {
        const speakingMode = String(conversationState.speakingMode || "free").toLowerCase() === "exam" ? "exam" : "free";
        if (speakingMode === "free") {
            if (event === "start") {
                return {
                    part: 0,
                    phase: "conversation",
                    examinerMessage: "Hi, I'm your AI speaking partner. Let's practice naturally. You can talk about anything, and I'll help you improve your English.",
                    shouldRecord: true,
                    isComplete: false,
                    latestTranscript: transcript
                };
            }

            const answerWords = conversationWordCount(transcript);
            const replies = answerWords < 8
                ? [
                    "Don't worry, just speak naturally. Add one more detail and keep going.",
                    "That's a good start. Try saying a little more about what happened.",
                    "Take your time. You can use simple words first, then we can make it more natural."
                ]
                : [
                    "That's interesting. You explained that clearly. A more natural phrase could be: 'It was a useful experience for me.' Now continue your idea.",
                    "I see what you mean. Good example. Try to add one specific detail so it sounds more natural.",
                    "Nice. Let's keep talking about this for a moment. What made that situation important for you?"
                ];
            return {
                part: 0,
                phase: "conversation",
                examinerMessage: replies[Math.max(0, Number(conversationState.turn || 0)) % replies.length],
                shouldRecord: true,
                isComplete: false,
                latestTranscript: transcript
            };
        }

        const test = conversationState.test && typeof conversationState.test === "object" ? conversationState.test : {};
        const partTurns = normalizePartTurns(conversationState.partTurns);
        const cueCard = normalizeConversationCueCard(conversationState.cueCard, test);
        const answeredPart = Number(conversationState.answeringPart || conversationState.part || 1);
        const answerWords = conversationWordCount(transcript);

        if (event === "start") {
            const openingQuestions = normalizeConversationList(test.part1Questions, [
                "Good morning. My name is Alex. Can you tell me your full name, please?"
            ]);
            return {
                part: 1,
                phase: "question",
                examinerMessage: openingQuestions[0],
                shouldRecord: true,
                isComplete: false,
                latestTranscript: transcript
            };
        }

        if (answeredPart === 1) {
            const seededQuestions = normalizeConversationList(test.part1Questions, [
                "What do you like most about the place where you live?",
                "What do you usually do in your free time?",
                "Do you prefer spending time alone or with other people?",
                "Is there anything you would like to change about your daily routine?"
            ]);
            if (answerWords > 0 && answerWords < 8 && partTurns[1] < seededQuestions.length) {
                return {
                    part: 1,
                    phase: "question",
                    examinerMessage: "Thank you. Could you tell me a little more about that?",
                    shouldRecord: true,
                    isComplete: false,
                    latestTranscript: transcript
                };
            }

            if (partTurns[1] < seededQuestions.length) {
                return {
                    part: 1,
                    phase: "question",
                    examinerMessage: `Thank you. ${seededQuestions[Math.max(0, partTurns[1])] || seededQuestions[seededQuestions.length - 1]}`,
                    shouldRecord: true,
                    isComplete: false,
                    latestTranscript: transcript
                };
            }

            return {
                part: 2,
                phase: "prep",
                cueCard,
                prepSeconds: 60,
                examinerMessage: `Now I am going to give you a topic. You will have one minute to prepare and then you should speak for up to two minutes. Your topic is: ${cueCard.topic}`,
                shouldRecord: false,
                isComplete: false,
                latestTranscript: transcript
            };
        }

        if (answeredPart === 2) {
            if (!conversationState.roundingAsked && conversationState.examPhase === "long_turn") {
                return {
                    part: 2,
                    phase: "rounding_off",
                    examinerMessage: "Thank you. Would you like to experience something like that again?",
                    shouldRecord: true,
                    isComplete: false,
                    latestTranscript: transcript
                };
            }

            return {
                part: 3,
                phase: "question",
                examinerMessage: `Let's move on to Part 3. We'll discuss ideas connected with ${cueCard.topic.toLowerCase()}. Why do people value experiences like this?`,
                shouldRecord: true,
                isComplete: false,
                latestTranscript: transcript
            };
        }

        const part3Questions = normalizeConversationList(test.part3Questions, [
                "How have people's attitudes to this topic changed in recent years?",
                "Do you think young people and older people see this differently?",
                "What role should schools or governments play in this area?",
                "How do you think this might change in the future?"
            ]);
        if (partTurns[3] < part3Questions.length) {
            return {
                part: 3,
                phase: "question",
                examinerMessage: `Thank you. ${part3Questions[Math.max(0, partTurns[3])] || part3Questions[part3Questions.length - 1]}`,
                shouldRecord: true,
                isComplete: false,
                latestTranscript: transcript
            };
        }

        return {
            part: 3,
            phase: "complete",
            examinerMessage: "Thank you. That is the end of the speaking test.",
            shouldRecord: false,
            isComplete: true,
            latestTranscript: transcript
        };
    }

    function normalizeExaminerNext(raw, fallback, latestTranscript) {
        const safe = raw && typeof raw === "object" ? raw : {};
        const allowedPhases = new Set(["conversation", "question", "prep", "long_turn", "rounding_off", "complete"]);
        let phase = allowedPhases.has(String(safe.phase || "")) ? String(safe.phase) : fallback.phase;
        const isFreeMode = Number(fallback.part) === 0 || fallback.phase === "conversation";
        let part = isFreeMode ? 0 : Math.min(3, Math.max(1, Number(safe.part || fallback.part || 1)));
        const examinerMessage = cleanConversationText(safe.examinerMessage || safe.aiMessage || safe.assistantMessage || safe.message || fallback.examinerMessage);
        let cueCard = safe.cueCard ? normalizeConversationCueCard(safe.cueCard, {}) : fallback.cueCard;
        let isComplete = Boolean(safe.isComplete) || phase === "complete";
        if (isFreeMode) {
            phase = phase === "complete" || phase === "prep" || phase === "long_turn" || phase === "rounding_off" ? "conversation" : phase;
            cueCard = null;
            isComplete = false;
        }
        return {
            part,
            phase,
            examinerMessage: examinerMessage || fallback.examinerMessage,
            cueCard,
            prepSeconds: Math.max(5, Number(safe.prepSeconds || fallback.prepSeconds || 60)),
            shouldRecord: isFreeMode ? true : (safe.shouldRecord === false ? false : !["prep", "complete"].includes(phase)),
            isComplete,
            latestTranscript: cleanConversationText(safe.latestTranscript || latestTranscript || fallback.latestTranscript)
        };
    }

    async function generateExaminerNext({ event, conversationState, transcript }) {
        const fallback = fallbackExaminerNext({ event, conversationState, transcript });
        const openai = getOpenAIClient();
        const test = conversationState.test && typeof conversationState.test === "object" ? conversationState.test : {};
        const partTurns = normalizePartTurns(conversationState.partTurns);
        const cueCard = normalizeConversationCueCard(conversationState.cueCard, test);
        const speakingMode = String(conversationState.speakingMode || "free").toLowerCase() === "exam" ? "exam" : "free";
        const compactState = {
            event,
            speakingMode,
            currentPart: speakingMode === "free" ? 0 : Number(conversationState.part || 1),
            answeringPart: conversationState.answeringPart || null,
            currentExamPhase: conversationState.examPhase || "",
            partTurns,
            roundingAsked: Boolean(conversationState.roundingAsked),
            currentExaminerMessage: cleanConversationText(conversationState.currentExaminerMessage),
            cueCard,
            test: {
                title: cleanConversationText(test.title || "IELTS Speaking Test"),
                topic: cleanConversationText(test.topic || "General IELTS Speaking practice"),
                part1Questions: normalizeConversationList(test.part1Questions, [
                    "Where are you from?",
                    "What do you like about your hometown?",
                    "What do you do in your free time?"
                ]).slice(0, 8),
                part3Questions: normalizeConversationList(test.part3Questions, [
                    "Why do people enjoy visiting new places?",
                    "How has travel changed in recent years?",
                    "Should people learn about a place before they visit it?"
                ]).slice(0, 8)
            },
            recentHistory: Array.isArray(conversationState.history)
                ? conversationState.history.slice(-16).map((item) => ({
                    role: item?.role === "user" ? "user" : (speakingMode === "free" ? "assistant" : "examiner"),
                    part: Number(item?.part || 1),
                    phase: cleanConversationText(item?.phase || ""),
                    text: cleanConversationText(item?.text || "").slice(0, 700)
                }))
                : []
        };

        const freeSystemPrompt = `You are a friendly AI English speaking partner, not an IELTS examiner. Your goal is to help the user speak more naturally and confidently in English. Have an open voice conversation like ChatGPT Voice Mode. Let the user choose the topic, respond naturally to what they say, and ask follow-up questions only when they feel natural. Gently correct grammar, vocabulary, pronunciation, and fluency when useful, but do not overcorrect. Do not force IELTS Part 1, Part 2, Part 3, fixed questions, scoring, or examiner language unless the user explicitly asks for IELTS mode. Keep replies short and spoken-friendly.
Generate only the next spoken-friendly AI response as JSON. Return phase "conversation", part 0, shouldRecord true, and isComplete false. Never end the conversation unless the user explicitly asks to stop. Return this JSON shape only:
{
  "part": 0,
  "phase": "conversation",
  "examinerMessage": "string",
  "shouldRecord": true,
  "isComplete": false
}`;

        const examSystemPrompt = `You are an IELTS Speaking examiner. Conduct a realistic IELTS Speaking test with Part 1, Part 2, and Part 3. Ask questions naturally, listen to the user's answers, and continue like a real examiner. Do not give feedback during the test. Give feedback only after the test ends.
Generate only the next examiner turn as JSON.
The candidate speaks freely. Use the latest transcript and recent history to react naturally before continuing.
Do not behave like a fixed quiz player. Do not show scores or feedback during the test.
Keep examinerMessage concise and speakable. Usually include a brief acknowledgement plus one next question.
Part 1: use the supplied test.part1Questions in order, one at a time. Ask a short follow-up only if the answer is too short or unclear.
Part 2: introduce the cue card, return phase "prep", include cueCard, and tell the candidate they have one minute to prepare and up to two minutes to speak. After the long turn, ask one brief rounding-off question.
Part 3: use the supplied test.part3Questions in order. They are connected to the Part 2 topic; ask one at a time and use brief follow-ups naturally.
End after a complete Part 1, Part 2, and a reasonable Part 3 discussion.
Return this JSON shape only:
{
  "part": 1,
  "phase": "question",
  "examinerMessage": "string",
  "cueCard": { "topic": "string", "bullets": ["string"] },
  "prepSeconds": 60,
  "shouldRecord": true,
  "isComplete": false
}
Valid phase values: "question", "prep", "long_turn", "rounding_off", "complete".`;

        const freeRules = `Free Speaking Practice rules:
- Treat the latest transcript as the user's message in an open conversation, not as a submitted answer.
- Do not say Question 1, Part 1, next question, test, exam, examiner, candidate, answer, band, or score unless the user asks for IELTS mode.
- Do not always ask a new question. Sometimes react, give a better phrase, ask the user to repeat, suggest a clearer natural sentence, or encourage them to continue.
- Keep the same topic going when possible.
- Keep replies short enough to be spoken aloud naturally.`;

        const examRules = `Important flow rules:
- If event is "start", begin Part 1 with a natural first question.
- partTurns already includes the latest answer when event is "answer".
- If the latest answer is too short, ask one natural expansion follow-up instead of blindly moving on.
- Transition from Part 1 to Part 2 after all supplied Part 1 questions have been answered.
- If currentExamPhase is "long_turn" and answeringPart is 2, ask one rounding-off question unless roundingAsked is true.
- After the rounding-off answer, move to Part 3.
- After all supplied Part 3 questions have been answered, return phase "complete".`;

        const userContent = `Conversation state:
${JSON.stringify(compactState, null, 2)}

${speakingMode === "free" ? "Latest user speech transcript" : "Latest candidate answer transcript"}:
${transcript || "(No transcript available. Continue gracefully from the audio/context.)"}

${speakingMode === "free" ? freeRules : examRules}`;

        const data = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: speakingMode === "free" ? freeSystemPrompt : examSystemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: speakingMode === "free" ? 0.72 : 0.55
        });

        const parsed = parseJsonObject(data.choices?.[0]?.message?.content);
        return normalizeExaminerNext(parsed, fallback, transcript);
    }

    async function handleExaminerNext(req, res) {
        const conversationState = safeJsonParse(req.body.state, {});
        const event = cleanConversationText(req.body.event || "answer") || "answer";
        let transcript = cleanConversationText(req.body.transcript || "");
        const file = req.file || null;

        if (file && !transcript) {
            try {
                transcript = cleanConversationText(await transcribeAudio(file.path));
            } catch (error) {
                console.warn("Speaking examiner transcription fallback:", error.message || error);
            }
        }

        const fallback = fallbackExaminerNext({ event, conversationState, transcript });

        if (String(conversationState.speakingMode || "").toLowerCase() === "exam") {
            return res.json({
                ...normalizeExaminerNext(fallback, fallback, transcript),
                fallback: false,
                latestTranscript: transcript
            });
        }

        try {
            const next = await generateExaminerNext({ event, conversationState, transcript });
            return res.json({ ...next, latestTranscript: transcript || next.latestTranscript || "" });
        } catch (error) {
            console.error("Speaking examiner next-turn error:", error.message || error);
            return res.json({
                ...normalizeExaminerNext(fallback, fallback, transcript),
                fallback: true,
                latestTranscript: transcript
            });
        }
    }

    const sectionConfig = {
        part1: {
            model: SpeakingPart1Test,
            minQuestions: 4,
            defaultPrepTime: "No prep",
            defaultSpeakingTime: "5 min",
            label: "Speaking Part 1"
        },
        part2: {
            model: SpeakingPart2Test,
            minBullets: 3,
            defaultPrepTime: "1 min",
            defaultSpeakingTime: "2 min",
            label: "Speaking Part 2"
        },
        part3: {
            model: SpeakingPart3Test,
            minQuestions: 4,
            defaultPrepTime: "No prep",
            defaultSpeakingTime: "5 min",
            label: "Speaking Part 3"
        },
        full: {
            model: FullSpeakingTest,
            label: "Full Speaking Test"
        }
    };

    function getSectionConfig(section) {
        const config = sectionConfig[String(section || "").trim()];
        if (!config) {
            const error = new Error("Unknown Speaking section.");
            error.statusCode = 404;
            throw error;
        }
        return config;
    }

    function normalizeStatus(value) {
        return value === "published" ? "published" : "draft";
    }

    function normalizeTextItems(value) {
        if (!Array.isArray(value)) return [];
        return value
            .map((item) => ({
                text: String(typeof item === "string" ? item : item?.text || "").trim()
            }))
            .filter((item) => item.text);
    }

    function parseMinutes(value, fallbackMinutes) {
        const raw = String(value || "").trim();
        const match = raw.match(/(\d+(?:\.\d+)?)/);
        if (!match) return fallbackMinutes;
        const minutes = Number(match[1]);
        return Number.isFinite(minutes) && minutes > 0 ? minutes : fallbackMinutes;
    }

    function speakingSeconds(value, fallbackMinutes) {
        return Math.round(parseMinutes(value, fallbackMinutes) * 60);
    }

    function documentObject(doc) {
        return typeof doc?.toObject === "function" ? doc.toObject() : doc;
    }

    function paginationParams(req, defaults = {}) {
        const maxLimit = Number(defaults.maxLimit) || 100;
        const defaultLimit = Number(defaults.defaultLimit) || 50;
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), maxLimit);
        return { page, limit, skip: (page - 1) * limit };
    }

    function setPaginationHeaders(res, { page, limit, total }) {
        res.setHeader("X-Total-Count", String(total));
        res.setHeader("X-Page", String(page));
        res.setHeader("X-Limit", String(limit));
        res.setHeader("X-Total-Pages", String(Math.max(Math.ceil(total / limit), 1)));
    }

    function serializePartAdminSummary(doc, section) {
        const item = documentObject(doc);
        const count = section === "part2"
            ? normalizeTextItems(item.bulletPoints).length
            : normalizeTextItems(item.questions).length;
        return {
            _id: String(item._id),
            id: String(item._id),
            title: item.title || "",
            type: section,
            status: item.status || "draft",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            prepTime: item.prepTime,
            speakingTime: item.speakingTime,
            description: item.description || "",
            instruction: item.instruction || "",
            itemCount: count,
            questionCount: section === "part2" ? undefined : count,
            bulletPointCount: section === "part2" ? count : undefined
        };
    }

    function serializeFullAdminSummary(doc) {
        const item = documentObject(doc);
        return {
            _id: String(item._id),
            id: String(item._id),
            title: item.title || "",
            type: "full",
            status: item.status || "draft",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            estimatedTime: item.estimatedTime,
            aiFeedback: item.aiFeedback !== false,
            part1Id: String(item.part1Id?._id || item.part1Id || ""),
            part2Id: String(item.part2Id?._id || item.part2Id || ""),
            part3Id: String(item.part3Id?._id || item.part3Id || "")
        };
    }

    function serializeSpeakingListSummary(test, section) {
        return section === "full" ? serializeFullAdminSummary(test) : serializePartAdminSummary(test, section);
    }

    function serializeMockSpeakingSummary(test) {
        return {
            id: test.id,
            _id: test.id,
            title: test.title || "Full Speaking Test",
            type: "full",
            status: "published",
            createdAt: test.createdAt || new Date().toISOString(),
            estimatedTime: test.estimatedTime || "11-14 min",
            aiFeedback: test.aiFeedback !== false,
            isMockTest: true
        };
    }

    function serializePartAdmin(doc, section) {
        const item = documentObject(doc);
        if (section === "part2") {
            return {
                ...item,
                _id: String(item._id),
                bulletPoints: normalizeTextItems(item.bulletPoints)
            };
        }
        return {
            ...item,
            _id: String(item._id),
            questions: normalizeTextItems(item.questions)
        };
    }

    function serializeFullAdmin(doc) {
        const item = documentObject(doc);
        return {
            ...item,
            _id: String(item._id),
            part1Id: item.part1Id,
            part2Id: item.part2Id,
            part3Id: item.part3Id
        };
    }

    function serializeAdmin(doc, section) {
        return section === "full" ? serializeFullAdmin(doc) : serializePartAdmin(doc, section);
    }

    function serializePublicPart1(doc) {
        const item = documentObject(doc);
        return {
            id: String(item._id),
            title: item.title || "Speaking Part 1",
            topic: item.title || "",
            description: item.description || "",
            prepTime: item.prepTime || "No prep",
            speakingTime: item.speakingTime || "5 min",
            questions: normalizeTextItems(item.questions).map((question) => question.text)
        };
    }

    function serializePublicPart2(doc) {
        const item = documentObject(doc);
        return {
            id: String(item._id),
            title: item.title || "Speaking Part 2",
            topic: item.instruction || item.title || "",
            description: item.instruction || "",
            prepTime: item.prepTime || "1 min",
            speakingTime: item.speakingTime || "2 min",
            bullets: normalizeTextItems(item.bulletPoints).map((point) => point.text)
        };
    }

    function serializePublicPart3(doc) {
        const item = documentObject(doc);
        return {
            id: String(item._id),
            title: item.title || "Speaking Part 3",
            topic: item.title || "",
            description: item.description || "",
            prepTime: item.prepTime || "No prep",
            speakingTime: item.speakingTime || "5 min",
            questions: normalizeTextItems(item.questions).map((question) => question.text)
        };
    }

    function serializePublicFull(doc) {
        const item = documentObject(doc);
        const part1 = item.part1Id ? serializePublicPart1(item.part1Id) : null;
        const part2 = item.part2Id ? serializePublicPart2(item.part2Id) : null;
        const part3 = item.part3Id ? serializePublicPart3(item.part3Id) : null;
        return {
            id: String(item._id),
            title: item.title || "Full Speaking Test",
            topic: [part1?.topic, part2?.title, part3?.topic].filter(Boolean).join(", "),
            description: "Complete Parts 1, 2, and 3 in one full AI-evaluated test.",
            estimatedTime: item.estimatedTime || "11-14 min",
            aiFeedback: item.aiFeedback !== false,
            parts: [
                part1 && {
                    part: 1,
                    title: `Part 1: ${part1.topic || "Introduction and general questions"}`,
                    duration: speakingSeconds(part1.speakingTime, 5),
                    prompt: part1.description || "Answer general questions naturally.",
                    questions: part1.questions || []
                },
                part2 && {
                    part: 2,
                    title: `Part 2: ${part2.title || "Cue Card"}`,
                    duration: speakingSeconds(part2.speakingTime, 2),
                    preparation: speakingSeconds(part2.prepTime, 1),
                    prompt: part2.topic || part2.description || "",
                    questions: part2.bullets || []
                },
                part3 && {
                    part: 3,
                    title: `Part 3: ${part3.topic || "Follow-up discussion questions"}`,
                    duration: speakingSeconds(part3.speakingTime, 5),
                    prompt: part3.description || "Answer follow-up discussion questions.",
                    questions: part3.questions || []
                }
            ].filter(Boolean)
        };
    }

    function serializePublic(doc, section) {
        if (section === "part1") return serializePublicPart1(doc);
        if (section === "part2") return serializePublicPart2(doc);
        if (section === "part3") return serializePublicPart3(doc);
        return serializePublicFull(doc);
    }

    function buildPartPayload(section, body) {
        const config = getSectionConfig(section);
        const title = String(body.title || "").trim();
        const status = normalizeStatus(body.status);
        if (!title) {
            const error = new Error("Title is required.");
            error.statusCode = 400;
            throw error;
        }

        if (section === "part2") {
            return {
                title,
                instruction: String(body.instruction || "").trim(),
                bulletPoints: normalizeTextItems(body.bulletPoints),
                prepTime: String(body.prepTime || config.defaultPrepTime).trim() || config.defaultPrepTime,
                speakingTime: String(body.speakingTime || config.defaultSpeakingTime).trim() || config.defaultSpeakingTime,
                status
            };
        }

        return {
            title,
            description: String(body.description || "").trim(),
            questions: normalizeTextItems(body.questions),
            prepTime: String(body.prepTime || config.defaultPrepTime).trim() || config.defaultPrepTime,
            speakingTime: String(body.speakingTime || config.defaultSpeakingTime).trim() || config.defaultSpeakingTime,
            status
        };
    }

    function normalizeReferenceId(value) {
        if (value && typeof value === "object" && value._id) {
            return String(value._id).trim() || null;
        }
        return String(value || "").trim() || null;
    }

    function buildFullPayload(body) {
        const title = String(body.title || "").trim();
        if (!title) {
            const error = new Error("Title is required.");
            error.statusCode = 400;
            throw error;
        }
        return {
            title,
            part1Id: normalizeReferenceId(body.part1Id),
            part2Id: normalizeReferenceId(body.part2Id),
            part3Id: normalizeReferenceId(body.part3Id),
            estimatedTime: String(body.estimatedTime || "11-14 min").trim() || "11-14 min",
            aiFeedback: body.aiFeedback !== false,
            status: normalizeStatus(body.status)
        };
    }

    function validatePartForPublishing(section, payload) {
        if (payload.status !== "published") return;
        if (section === "part2") {
            if (!payload.instruction) {
                const error = new Error("Part 2 requires an instruction before publishing.");
                error.statusCode = 400;
                throw error;
            }
            if (normalizeTextItems(payload.bulletPoints).length < 3) {
                const error = new Error("Part 2 requires at least 3 bullet points before publishing.");
                error.statusCode = 400;
                throw error;
            }
            return;
        }
        if (normalizeTextItems(payload.questions).length < 4) {
            const error = new Error(`${section === "part1" ? "Part 1" : "Part 3"} requires at least 4 questions before publishing.`);
            error.statusCode = 400;
            throw error;
        }
    }

    async function validateFullForPublishing(payload) {
        if (payload.status !== "published") return;
        if (!payload.part1Id || !payload.part2Id || !payload.part3Id) {
            const error = new Error("Full Speaking Test requires Part 1, Part 2, and Part 3 before publishing.");
            error.statusCode = 400;
            throw error;
        }
        const [part1, part2, part3] = await Promise.all([
            SpeakingPart1Test.findOne({ _id: payload.part1Id, status: "published" }),
            SpeakingPart2Test.findOne({ _id: payload.part2Id, status: "published" }),
            SpeakingPart3Test.findOne({ _id: payload.part3Id, status: "published" })
        ]);
        if (!part1 || !part2 || !part3) {
            const error = new Error("Full Speaking Test can only publish with published Part 1, Part 2, and Part 3 tests.");
            error.statusCode = 400;
            throw error;
        }
    }

    function serializeSpeakingSubmission(submission) {
        const feedback = submission.feedback || {};
        const label = SPEAKING_TYPE_LABELS[submission.testType] || "Speaking";
        return {
            id: String(submission._id),
            testType: submission.testType,
            type: label,
            title: submission.title || label,
            topic: submission.topic || "",
            prompt: submission.prompt || {},
            parts: submission.parts || [],
            audioFiles: submission.audioFiles || [],
            transcript: submission.transcript || "",
            criteriaScores: submission.criteriaScores || {},
            overallBand: Number(submission.overallBand || feedback.overallBand || 0),
            band: Number(submission.overallBand || feedback.overallBand || 0),
            feedback,
            strengths: submission.strengths || feedback.strengths || [],
            problems: submission.problems || feedback.problems || [],
            howToImprove: submission.howToImprove || feedback.howToImprove || [],
            improvedAnswers: submission.improvedAnswers || feedback.improvedAnswers || [],
            practicalTips: submission.practicalTips || feedback.practicalTips || [],
            createdAt: submission.createdAt,
            updatedAt: submission.updatedAt
        };
    }

    function serializeSpeakingSubmissionSummary(submission) {
        const label = SPEAKING_TYPE_LABELS[submission.testType] || "Speaking";
        return {
            id: String(submission._id),
            testType: submission.testType,
            type: label,
            title: submission.title || label,
            topic: submission.topic || "",
            overallBand: Number(submission.overallBand || 0),
            band: Number(submission.overallBand || 0),
            createdAt: submission.createdAt,
            updatedAt: submission.updatedAt
        };
    }

    function summarizeSpeakingSubmissions(submissions) {
        const attempts = Array.isArray(submissions) ? submissions : [];
        const bands = attempts
            .map((item) => Number(item.overallBand || 0))
            .filter((value) => Number.isFinite(value));
        const latest = attempts[0] || null;
        return {
            totalAttempts: attempts.length,
            part1Attempts: attempts.filter((item) => item.testType === "part_1").length,
            cueCardAttempts: attempts.filter((item) => item.testType === "cue_card").length,
            part3Attempts: attempts.filter((item) => item.testType === "part_3").length,
            fullAttempts: attempts.filter((item) => item.testType === "full_test").length,
            averageBand: bands.length
                ? Math.round((bands.reduce((sum, value) => sum + value, 0) / bands.length) * 10) / 10
                : 0,
            bestBand: bands.length ? Math.max(...bands) : 0,
            latestBand: bands.length ? Number(latest?.overallBand || 0) : 0
        };
    }

    function emptySpeakingProfilePayload() {
        return {
            summary: {
                totalAttempts: 0,
                part1Attempts: 0,
                cueCardAttempts: 0,
                part3Attempts: 0,
                fullAttempts: 0,
                averageBand: 0,
                bestBand: 0,
                latestBand: 0
            },
            recent: []
        };
    }

    function sendSpeakingRouteError(res, error, fallbackMessage) {
        const statusCode = Number(error?.statusCode || 500);
        if (statusCode >= 500) {
            console.error(fallbackMessage, error);
        }
        return res.status(statusCode).json({ error: error?.message || fallbackMessage });
    }

    async function findFullTests(query = {}) {
        return FullSpeakingTest.find(query)
            .populate("part1Id")
            .populate("part2Id")
            .populate("part3Id")
            .sort({ createdAt: -1 });
    }

    app.get("/api/speaking/:section/:id", async (req, res) => {
        try {
            const section = String(req.params.section || "").trim();
            const config = getSectionConfig(section);
            if (section === "full" && typeof getMockSpeakingTests === "function") {
                const includeDraft = Boolean(req.user && req.user.role === "admin");
                const mockTests = await getMockSpeakingTests({ includeDraft });
                const mockTest = mockTests.find((test) => String(test.id) === String(req.params.id));
                if (mockTest) {
                    return res.json(mockTest);
                }
            }
            const query = config.model.findById(req.params.id);
            const test = section === "full"
                ? await query.populate("part1Id").populate("part2Id").populate("part3Id")
                : await query;
            if (!test || test.status !== "published") {
                const error = new Error("Speaking test not found.");
                error.statusCode = 404;
                throw error;
            }
            res.json(serializePublic(test, section));
        } catch (error) {
            return sendSpeakingRouteError(res, error, "Failed to fetch Speaking test");
        }
    });

    app.get("/api/speaking/:section", async (req, res) => {
        try {
            const section = String(req.params.section || "").trim();
            const config = getSectionConfig(section);
            const pagination = paginationParams(req);
            const query = { status: "published" };
            const [tests, total] = await Promise.all([
                (section === "full"
                    ? config.model.find(query).select("_id title status createdAt updatedAt estimatedTime aiFeedback part1Id part2Id part3Id")
                    : config.model.find(query).select("_id title status createdAt updatedAt description instruction prepTime speakingTime questions bulletPoints"))
                    .sort({ createdAt: -1 })
                    .skip(pagination.skip)
                    .limit(pagination.limit)
                    .lean(),
                config.model.countDocuments(query)
            ]);
            setPaginationHeaders(res, { ...pagination, total });
            const serialized = tests.map((test) => serializeSpeakingListSummary(test, section));
            if (section === "full" && typeof getMockSpeakingTests === "function") {
                const includeDraft = Boolean(req.user && req.user.role === "admin");
                const mockTests = await getMockSpeakingTests({ includeDraft });
                return res.json([...mockTests.map(serializeMockSpeakingSummary), ...serialized]);
            }
            res.json(serialized);
        } catch (error) {
            return sendSpeakingRouteError(res, error, "Failed to fetch Speaking tests");
        }
    });

    app.get("/api/admin/speaking/:section", requireAdmin, async (req, res) => {
        try {
            const section = String(req.params.section || "").trim();
            const config = getSectionConfig(section);
            const pagination = paginationParams(req);
            const query = {};
            if (req.query.status) query.status = req.query.status;
            const [tests, total] = await Promise.all([
                (section === "full"
                    ? config.model.find(query).select("_id title status createdAt updatedAt estimatedTime aiFeedback part1Id part2Id part3Id")
                    : config.model.find(query).select("_id title status createdAt updatedAt description instruction prepTime speakingTime questions bulletPoints"))
                    .sort({ createdAt: -1 })
                    .skip(pagination.skip)
                    .limit(pagination.limit)
                    .lean(),
                config.model.countDocuments(query)
            ]);
            setPaginationHeaders(res, { ...pagination, total });
            res.json(section === "full"
                ? tests.map(serializeFullAdminSummary)
                : tests.map((test) => serializePartAdminSummary(test, section)));
        } catch (error) {
            return sendSpeakingRouteError(res, error, "Failed to fetch admin Speaking tests");
        }
    });

    app.get("/api/admin/speaking/:section/:id", requireAdmin, async (req, res) => {
        try {
            const section = String(req.params.section || "").trim();
            const config = getSectionConfig(section);
            const query = config.model.findById(req.params.id);
            const test = section === "full"
                ? await query.populate("part1Id").populate("part2Id").populate("part3Id")
                : await query;
            if (!test) {
                const error = new Error("Speaking test not found.");
                error.statusCode = 404;
                throw error;
            }
            res.json(serializeAdmin(test, section));
        } catch (error) {
            return sendSpeakingRouteError(res, error, "Failed to fetch Speaking test");
        }
    });

    app.post("/api/admin/speaking/:section", requireAdmin, async (req, res) => {
        try {
            const section = String(req.params.section || "").trim();
            const config = getSectionConfig(section);
            if (section === "full") {
                const payload = buildFullPayload(req.body);
                await validateFullForPublishing(payload);
                const test = new FullSpeakingTest(payload);
                await test.save();
                const populated = await FullSpeakingTest.findById(test._id)
                    .populate("part1Id")
                    .populate("part2Id")
                    .populate("part3Id");
                return res.status(201).json(serializeFullAdmin(populated));
            }

            const payload = buildPartPayload(section, req.body);
            validatePartForPublishing(section, payload);
            const test = new config.model(payload);
            await test.save();
            return res.status(201).json(serializePartAdmin(test, section));
        } catch (error) {
            return sendSpeakingRouteError(res, error, "Failed to create Speaking test");
        }
    });

    app.put("/api/admin/speaking/:section/:id", requireAdmin, async (req, res) => {
        try {
            const section = String(req.params.section || "").trim();
            const config = getSectionConfig(section);
            const test = await config.model.findById(req.params.id);
            if (!test) {
                const error = new Error("Speaking test not found.");
                error.statusCode = 404;
                throw error;
            }

            if (section === "full") {
                const payload = buildFullPayload({
                    title: req.body.title !== undefined ? req.body.title : test.title,
                    part1Id: req.body.part1Id !== undefined ? req.body.part1Id : test.part1Id,
                    part2Id: req.body.part2Id !== undefined ? req.body.part2Id : test.part2Id,
                    part3Id: req.body.part3Id !== undefined ? req.body.part3Id : test.part3Id,
                    estimatedTime: req.body.estimatedTime !== undefined ? req.body.estimatedTime : test.estimatedTime,
                    aiFeedback: req.body.aiFeedback !== undefined ? req.body.aiFeedback : test.aiFeedback,
                    status: req.body.status !== undefined ? req.body.status : test.status
                });
                await validateFullForPublishing(payload);
                Object.assign(test, payload);
                await test.save();
                const populated = await FullSpeakingTest.findById(test._id)
                    .populate("part1Id")
                    .populate("part2Id")
                    .populate("part3Id");
                return res.json(serializeFullAdmin(populated));
            }

            const current = documentObject(test);
            const payload = buildPartPayload(section, {
                title: req.body.title !== undefined ? req.body.title : current.title,
                description: req.body.description !== undefined ? req.body.description : current.description,
                instruction: req.body.instruction !== undefined ? req.body.instruction : current.instruction,
                questions: req.body.questions !== undefined ? req.body.questions : current.questions,
                bulletPoints: req.body.bulletPoints !== undefined ? req.body.bulletPoints : current.bulletPoints,
                prepTime: req.body.prepTime !== undefined ? req.body.prepTime : current.prepTime,
                speakingTime: req.body.speakingTime !== undefined ? req.body.speakingTime : current.speakingTime,
                status: req.body.status !== undefined ? req.body.status : current.status
            });
            validatePartForPublishing(section, payload);
            Object.assign(test, payload);
            await test.save();
            return res.json(serializePartAdmin(test, section));
        } catch (error) {
            return sendSpeakingRouteError(res, error, "Failed to update Speaking test");
        }
    });

    app.delete("/api/admin/speaking/:section/:id", requireAdmin, async (req, res) => {
        try {
            const section = String(req.params.section || "").trim();
            const config = getSectionConfig(section);
            const deleted = await config.model.findByIdAndDelete(req.params.id);
            if (!deleted) {
                const error = new Error("Speaking test not found.");
                error.statusCode = 404;
                throw error;
            }
            res.json({ message: "Speaking test deleted successfully" });
        } catch (error) {
            return sendSpeakingRouteError(res, error, "Failed to delete Speaking test");
        }
    });

    async function handleSpeakingEvaluation(req, res) {
        try {
            const prompt = safeJsonParse(req.body.prompt, {});
            const promptObject = prompt && typeof prompt === "object" && !Array.isArray(prompt) ? prompt : {};
            const submittedPartNumber = Number(req.body.part || req.body.partNumber || 0);
            const requestedTestMode = String(req.body.testMode || "").trim().toLowerCase();
            const mode = normalizeSpeakingMode(req.body.mode, requestedTestMode, submittedPartNumber);
            const testMode = normalizeTestMode(requestedTestMode, mode);
            const testId = String(req.body.testId || req.body.test_id || promptObject.id || promptObject._id || "").trim();
            const questionText = String(req.body.questionText || req.body.question || "").trim();
            const userAnswer = String(req.body.userAnswer || req.body.answer || "").trim();
            let submittedParts = safeJsonParse(req.body.parts, []);
            if (!Array.isArray(submittedParts)) submittedParts = [];
            if (!submittedParts.length && (questionText || userAnswer)) {
                submittedParts = [{
                    part: submittedPartNumber || defaultPartForMode(mode, 0),
                    title: SPEAKING_TYPE_LABELS[mode] || "Speaking response",
                    prompt: questionText,
                    questionText,
                    transcript: userAnswer,
                    userAnswer
                }];
            }
            const files = Array.isArray(req.files) ? req.files : [];
            const browserTranscript = String(req.body.transcript || userAnswer || "").trim();
            const title = String(req.body.title || SPEAKING_TYPE_LABELS[mode] || "Speaking Practice").trim();
            const topic = String(req.body.topic || promptObject.topic || title).trim();
            const promptPayload = {
                ...promptObject,
                testId,
                testMode,
                part: submittedPartNumber || defaultPartForMode(mode, 0),
                questionText: questionText || promptObject.questionText || ""
            };

            if (!files.length && !browserTranscript) {
                return res.status(400).json({ error: "Record audio before submitting for AI feedback." });
            }

            const transcribedParts = [];
            for (let index = 0; index < Math.max(files.length, submittedParts.length, 1); index++) {
                const basePart = submittedParts[index] || {};
                const file = files[index] || null;
                const baseQuestionText = String(basePart.questionText || basePart.prompt || basePart.topic || questionText || "").trim();
                let transcript = String(basePart.userAnswer || basePart.transcript || "").trim();

                if (file) {
                    try {
                        const audioTranscript = await transcribeAudio(file.path);
                        if (audioTranscript) transcript = audioTranscript;
                    } catch (error) {
                        if (!transcript) {
                            throw error;
                        }
                    }
                }

                transcribedParts.push({
                    ...basePart,
                    part: basePart.part || defaultPartForMode(mode, index),
                    prompt: basePart.prompt || baseQuestionText,
                    questionText: basePart.questionText || baseQuestionText,
                    transcript,
                    userAnswer: transcript,
                    testId,
                    audioUrl: file ? publicAudioPath(file) : ""
                });
            }

            const combinedTranscript = transcribedParts.map((part) => part.transcript).filter(Boolean).join("\n\n") || browserTranscript;
            if (!combinedTranscript.trim()) {
                return res.status(400).json({ error: "Could not create a transcript from this recording. Please try again." });
            }

            const feedback = await evaluateSpeaking({
                mode,
                testMode,
                testId,
                part: submittedPartNumber || defaultPartForMode(mode, 0),
                title,
                prompt: promptPayload,
                questionText,
                userAnswer: combinedTranscript,
                parts: transcribedParts,
                transcript: combinedTranscript
            });
            const audioFiles = files.map(publicAudioPath);
            const submission = new SpeakingSubmission({
                userId: String(req.user.id || req.user._id || req.user.email || ""),
                userObjectId: /^[a-f0-9]{24}$/i.test(String(req.user.id || "")) ? req.user.id : undefined,
                testType: mode,
                title,
                topic,
                prompt: promptPayload,
                parts: transcribedParts,
                audioFiles,
                transcript: combinedTranscript,
                criteriaScores: {
                    fluencyCoherence: feedback.fluencyCoherence,
                    lexicalResource: feedback.lexicalResource,
                    grammaticalRangeAccuracy: feedback.grammaticalRangeAccuracy,
                    pronunciation: feedback.pronunciation
                },
                overallBand: feedback.overallBand,
                strengths: feedback.strengths,
                problems: feedback.problems,
                howToImprove: feedback.howToImprove,
                improvedAnswers: feedback.improvedAnswers,
                practicalTips: feedback.practicalTips,
                feedback
            });

            await submission.save();

            return res.status(201).json({
                testId,
                testMode,
                part: submittedPartNumber || defaultPartForMode(mode, 0),
                feedback,
                attempt: serializeSpeakingSubmission(submission)
            });
        } catch (error) {
            console.error("Speaking submission error:", error);
            if (error?.code === "OPENAI_API_KEY_MISSING") {
                return res.status(500).json({ error: OPENAI_MISSING_KEY_ERROR });
            }
            return res.status(502).json({ error: "AI speaking feedback failed. Please try again." });
        }
    }

    app.post("/api/speaking/generate-test", requireAuth, async (req, res) => {
        const userKey = String(req.user?.id || req.user?._id || req.user?.email || "anonymous");
        try {
            const generated = await generateSpeakingTest(userKey);
            rememberSpeakingTest(userKey, generated.test);
            return res.json({ ...generated.test, source: generated.source });
        } catch (error) {
            console.error("Speaking test generation error:", error);
            const test = fallbackSpeakingTest(userKey);
            rememberSpeakingTest(userKey, test);
            return res.json({ ...test, source: "fallback" });
        }
    });

    app.post("/api/speaking/examiner-next", requireAuth, speakingUpload.single("audio"), handleExaminerNext);
    app.post("/api/speaking/conversation-turn", requireAuth, speakingUpload.single("audio"), handleExaminerNext);
    app.post("/api/evaluate-speaking", requireAuth, speakingUpload.array("audio", 16), handleSpeakingEvaluation);
    app.post("/api/speaking/submit", requireAuth, speakingUpload.array("audio", 16), handleSpeakingEvaluation);

    app.get("/api/profile/speaking", requireAuth, async (req, res) => {
        try {
            const userId = String(req.user.id || req.user._id || req.user.email || "");
            if (!userId) {
                return res.json(emptySpeakingProfilePayload());
            }

            const pagination = paginationParams(req, { defaultLimit: 8, maxLimit: 30 });
            const [summaryDocs, submissions] = await Promise.all([
                SpeakingSubmission.find({ userId })
                    .select("testType overallBand createdAt")
                    .sort({ createdAt: -1 })
                    .lean(),
                SpeakingSubmission.find({ userId })
                    .select("_id testType title topic overallBand createdAt updatedAt")
                    .sort({ createdAt: -1 })
                    .skip(pagination.skip)
                    .limit(pagination.limit)
                    .lean()
            ]);
            const summary = summarizeSpeakingSubmissions(summaryDocs);
            const recent = submissions.map(serializeSpeakingSubmissionSummary);
            setPaginationHeaders(res, { ...pagination, total: summary.totalAttempts });

            return res.json({
                summary,
                recent
            });
        } catch (error) {
            console.error("Speaking profile history error:", error);
            return res.status(500).json({ error: "Failed to load Speaking history" });
        }
    });

    app.get("/api/profile/speaking/:id", requireAuth, async (req, res) => {
        try {
            const userId = String(req.user.id || req.user._id || req.user.email || "");
            if (!userId) {
                return res.status(404).json({ error: "Speaking attempt not found" });
            }

            const submission = await SpeakingSubmission.findOne({ _id: req.params.id, userId });
            if (!submission) {
                return res.status(404).json({ error: "Speaking attempt not found" });
            }

            return res.json(serializeSpeakingSubmission(submission));
        } catch (error) {
            console.error("Speaking profile detail error:", error);
            return res.status(500).json({ error: "Failed to load Speaking attempt" });
        }
    });
}

module.exports = {
    registerSpeakingRoutes
};
