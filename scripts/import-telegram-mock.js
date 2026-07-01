require("dotenv").config();

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cheerio = require("cheerio");
const mongoose = require("mongoose");

const { sanitizeHtml } = require("../lib/ielts-import/htmlSanitizer");
const { buildPublishedTests } = require("../lib/ielts-import/publish");
const WritingPrompt = require("../models/WritingPrompt");
const WritingFullTest = require("../models/WritingFullTest");
const SpeakingPart1Test = require("../models/SpeakingPart1Test");
const SpeakingPart2Test = require("../models/SpeakingPart2Test");
const SpeakingPart3Test = require("../models/SpeakingPart3Test");
const FullSpeakingTest = require("../models/FullSpeakingTest");

const ROOT = path.resolve(__dirname, "..");
const READING_FILE = "C:/Users/dizay/Downloads/Telegram Desktop/FULL READING.html";
const LISTENING_FILE = "C:/Users/dizay/Downloads/Telegram Desktop/FULL LISTENING TEST 1.html";
const WRITING_FILE = "C:/Users/dizay/Downloads/Telegram Desktop/FULL WRITING.html";

const FULL_TEST_ID = "telegram-full-mock-test-4";
const MOCK_TEST_ID = "mock-test-4";
const MOCK_TITLE = "Mock Test 4";
const READING_TEST_ID = `${FULL_TEST_ID}-reading-full`;
const LISTENING_TEST_ID = `${FULL_TEST_ID}-listening-full`;

function text($, value) {
    const raw = typeof value === "string" ? value : $(value).text();
    return String(raw || "").replace(/\s+/g, " ").trim();
}

function safeFileName(fileName) {
    return String(fileName || "")
        .replace(/[^a-z0-9.\-_]/gi, "_")
        .replace(/_+/g, "_");
}

function readHtml(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function parseObjectLiteral(html, name) {
    const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(\\{[\\s\\S]*?\\n\\s*\\});`);
    const match = String(html || "").match(re);
    if (!match) return {};
    return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
}

function dashRange(value) {
    const match = String(value || "").match(/(?:Q|Questions?)\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})/i);
    return match ? [Number(match[1]), Number(match[2])] : [];
}

function optionObjectsFromButtons($, $card) {
    return $card.find(".tf-opt-btn").toArray().map((button) => {
        const value = String($(button).attr("data-val") || text($, button)).trim();
        return { value, label: value };
    }).filter((option) => option.value);
}

function readingGroupType(headerText, cards) {
    const header = String(headerText || "").toLowerCase();
    const first = cards[0];
    if (!first) return "sentence_completion";

    const $ = first.$;
    const $el = first.$el;
    const values = $el.find(".tf-opt-btn").toArray().map((button) => String($(button).attr("data-val") || text($, button)).trim().toUpperCase());

    if ($el.find("input.input-field").length) {
        if (header.includes("summary")) return "summary_completion";
        if (header.includes("note")) return "notes_completion";
        return "sentence_completion";
    }
    if ($el.find(".mcq-option").length) return "multiple_choice";
    if (values.includes("TRUE") && values.includes("FALSE")) return "true_false_not_given";
    if (values.includes("YES") && values.includes("NO")) return "yes_no_not_given";
    if (header.includes("heading")) return "matching_headings";
    if (header.includes("match") || header.includes("complete each sentence")) return "matching_information";
    return "multiple_choice";
}

function buildReadingCompletionHtml($, cards) {
    return cards.map(({ $el }) => {
        const $clone = $el.clone();
        $clone.find(".q-num-badge").remove();
        $clone.find("input.input-field").each((_, input) => {
            const number = Number(String($(input).attr("id") || "").replace(/^q/i, ""));
            $(input).replaceWith(`<span class="ielts-blank" data-blank="${number}">______</span>`);
        });
        return sanitizeHtml($clone.html() || "");
    }).join("");
}

function buildReadingGroup($, passageNumber, groupIndex, header, instruction, cards, answers) {
    const headerText = text($, header);
    const instructionText = text($, instruction);
    const type = readingGroupType(headerText, cards);
    const questions = [];

    cards.forEach(({ $el }) => {
        $el.find("input.input-field").each((_, input) => {
            const number = Number(String($(input).attr("id") || "").replace(/^q/i, ""));
            const $row = $(input).closest(".input-card-row");
            const $clone = $row.length ? $row.clone() : $(input).parent().clone();
            $clone.find(".q-num-badge").remove();
            $clone.find("input").replaceWith("...");
            questions.push({
                number,
                type,
                question: text($, $clone),
                stemHtml: sanitizeHtml($clone.html() || ""),
                options: [],
                answer: String(answers[number] || "").trim()
            });
        });

        if ($el.find(".mcq-option").length) {
            const number = Number(String($el.attr("id") || "").replace(/^\D+/, ""));
            const options = $el.find(".mcq-option").toArray().map((option) => ({
                value: String($(option).attr("data-val") || "").trim(),
                label: text($, option).replace(/^\s*[A-Zivx]+\s*/i, "").trim() || text($, option)
            })).filter((option) => option.value);
            questions.push({
                number,
                type,
                question: text($, $el.find(".q-text").first()),
                stemHtml: sanitizeHtml($el.find(".q-text").first().html() || ""),
                options,
                answer: String(answers[number] || "").trim()
            });
        } else if ($el.find(".tf-opt-btn").length) {
            const number = Number(String($el.attr("id") || "").replace(/^\D+/, ""));
            const options = optionObjectsFromButtons($, $el);
            questions.push({
                number,
                type,
                question: text($, $el.find(".q-text").first()),
                stemHtml: sanitizeHtml($el.find(".q-text").first().html() || ""),
                options: type === "true_false_not_given"
                    ? ["TRUE", "FALSE", "NOT GIVEN"]
                    : type === "yes_no_not_given"
                        ? ["YES", "NO", "NOT GIVEN"]
                        : options,
                answer: String(answers[number] || "").trim()
            });
        }
    });

    questions.sort((a, b) => a.number - b.number);

    return {
        id: `${FULL_TEST_ID}-reading-p${passageNumber}-g${groupIndex + 1}`,
        type,
        instructionTitle: dashRange(headerText).length ? `Questions ${dashRange(headerText).join("-")}` : headerText,
        instructionText,
        instructionHtml: {
            titleHtml: headerText ? `<h3>${headerText}</h3>` : "",
            bodyHtml: instructionText ? `<p>${instructionText}</p>` : "",
            rulesHtml: ""
        },
        rule: "",
        options: [],
        contentHtml: questions.length && cards.some(({ $el }) => $el.find("input.input-field").length)
            ? buildReadingCompletionHtml($, cards)
            : "",
        questions,
        questionRange: questions.length ? [questions[0].number, questions[questions.length - 1].number] : []
    };
}

function parseReading() {
    const html = readHtml(READING_FILE);
    const $ = cheerio.load(html, { decodeEntities: false });
    const answers = parseObjectLiteral(html, "CORRECT");

    return $(".passage-view").toArray().map((passageEl, index) => {
        const passageNumber = index + 1;
        const $passage = $(passageEl);
        const paragraphs = $passage.find(".passage-body p").toArray().map((p) => ({
            letter: null,
            html: sanitizeHtml($(p).html() || ""),
            text: text($, p)
        })).filter((p) => p.text);

        const passageText = paragraphs.map((p) => p.text).join("\n\n");
        const title = text($, $passage.find(".passage-title").first()) || `Reading Passage ${passageNumber}`;
        const $qView = $(`#qv-${passageNumber}`);
        const groups = [];
        let current = null;

        function flush() {
            if (!current || !current.cards.length) return;
            groups.push(buildReadingGroup($, passageNumber, groups.length, current.header, current.instruction, current.cards, answers));
        }

        $qView.children().each((_, el) => {
            const $el = $(el);
            if ($el.hasClass("q-section-header")) {
                flush();
                current = { header: $el, instruction: null, cards: [] };
                return;
            }
            if (!current) return;
            if ($el.hasClass("instruction-box")) {
                current.instruction = current.instruction || $el;
                return;
            }
            if ($el.hasClass("tf-card") || $el.hasClass("input-card")) {
                current.cards.push({ $, $el });
            }
        });
        flush();

        return {
            number: passageNumber,
            title,
            displayLabel: `Reading Passage ${passageNumber}`,
            passageTitle: title,
            passageText,
            passageHtml: sanitizeHtml($passage.find(".passage-body").html() || ""),
            paragraphs,
            questionGroups: groups
        };
    });
}

function listeningAnswers(html) {
    const textAnswers = parseObjectLiteral(html, "ANS_TEXT");
    const altAnswers = parseObjectLiteral(html, "ANS_ALT");
    const mcqAnswers = parseObjectLiteral(html, "ANS_MCQ");
    const matchAnswers = parseObjectLiteral(html, "ANS_MATCH");

    return function answerFor(number) {
        const n = Number(number);
        const values = [];
        if (textAnswers[n]) values.push(String(textAnswers[n]).trim());
        if (Array.isArray(altAnswers[n])) {
            altAnswers[n].forEach((value) => {
                const trimmed = String(value || "").trim();
                if (trimmed && !values.map((v) => v.toLowerCase()).includes(trimmed.toLowerCase())) values.push(trimmed);
            });
        }
        if (mcqAnswers[`q${n}`]) values.push(String(mcqAnswers[`q${n}`]).trim());
        if (matchAnswers[n]) values.push(String(matchAnswers[n]).trim());
        return values.join(" | ");
    };
}

function listeningQuestionFromInput($, input) {
    const $line = $(input).closest(".nc-line, .nc-sub");
    const $clone = $line.length ? $line.clone() : $(input).parent().clone();
    $clone.find(".qn").remove();
    $clone.find("input").replaceWith("...");
    return text($, $clone);
}

function listeningContentLines($, nodes) {
    const lines = [];
    nodes.forEach(($node) => {
        $node.find(".card-title, .nc-line, .nc-sub").each((_, line) => {
            const $clone = $(line).clone();
            $clone.find(".qn").remove();
            $clone.find("input").each((__, input) => {
                const number = Number(String($(input).attr("id") || "").replace(/^inp/i, ""));
                $(input).replaceWith(`{{${number}}}`);
            });
            const value = text($, $clone);
            if (value) lines.push(value);
        });
    });
    return lines;
}

function optionsFromListeningLabels($, $question) {
    return $question.find("label.ol").toArray().map((label) => {
        const value = String($(label).find("input").attr("value") || "").trim();
        const labelText = text($, label);
        return {
            value,
            label: labelText.replace(new RegExp(`^${value}[\\).:\\s-]*`, "i"), "").trim() || labelText
        };
    }).filter((option) => option.value);
}

function matchingOptions($, nodes) {
    const $box = nodes.find(($node) => $node.hasClass("match-box"));
    if (!$box) return [];
    return $box.find(".match-opts div").toArray().map((option) => {
        const value = text($, option);
        const match = value.match(/^([A-Z])\s+(.+)$/);
        return match
            ? { value: match[1], label: match[2] }
            : null;
    }).filter(Boolean);
}

function buildListeningGroup($, partNumber, groupIndex, heading, instruction, nodes, answerFor) {
    const title = text($, heading);
    const instructionText = text($, instruction);
    const $nodes = nodes;
    const mcqs = $nodes.flatMap(($node) => [
        ...($node.hasClass("mcqq") ? [$node[0]] : []),
        ...$node.find(".mcqq").toArray()
    ]);
    const matches = $nodes.flatMap(($node) => [
        ...($node.hasClass("match-row") ? [$node[0]] : []),
        ...$node.find(".match-row").toArray()
    ]);
    const inputs = $nodes.flatMap(($node) => [
        ...($node.is("input.ai") ? [$node[0]] : []),
        ...$node.find("input.ai").toArray()
    ]);

    if (mcqs.length) {
        const questions = mcqs.map((questionEl) => {
            const $q = $(questionEl);
            const number = Number(String($q.attr("id") || "").replace(/^q/i, ""));
            const qText = text($, $q.find(".qt").first().clone().find(".qnum").remove().end());
            return {
                number,
                type: "multiple_choice",
                question: qText,
                options: optionsFromListeningLabels($, $q),
                answer: answerFor(number)
            };
        });
        return {
            type: "multiple_choice",
            instructionTitle: title,
            instructionText,
            questions
        };
    }

    if (matches.length) {
        const options = matchingOptions($, $nodes);
        const questions = matches.map((row) => {
            const $row = $(row);
            const number = Number($row.find("select.msel").attr("data-q") || String($row.attr("id") || "").replace(/^q/i, ""));
            return {
                number,
                type: "matching",
                question: text($, $row.find(".mt").first()),
                options,
                answer: answerFor(number)
            };
        });
        return {
            type: "matching",
            instructionTitle: title,
            instructionText,
            options,
            questions
        };
    }

    if (inputs.length) {
        const questions = inputs.map((input) => {
            const number = Number(String($(input).attr("id") || "").replace(/^inp/i, ""));
            return {
                number,
                type: "sentence_completion",
                question: listeningQuestionFromInput($, input),
                options: [],
                answer: answerFor(number)
            };
        });
        return {
            type: "note_completion",
            instructionTitle: title,
            instructionText,
            title: text($, $nodes[0]?.find(".card-title").first()) || "",
            content: listeningContentLines($, $nodes),
            noteStyle: "boxed-flow",
            questions
        };
    }

    return {
        type: "sentence_completion",
        instructionTitle: title,
        instructionText,
        questions: []
    };
}

function parseListening() {
    const html = readHtml(LISTENING_FILE);
    const $ = cheerio.load(html, { decodeEntities: false });
    const answerFor = listeningAnswers(html);
    const audio = $("audio").first().attr("src") || "";

    return {
        audio,
        transcript: "",
        sections: $(".part-section").toArray().map((partEl, index) => {
            const partNumber = index + 1;
            const $part = $(partEl);
            const groups = [];
            let current = null;

            function flush() {
                if (!current || !current.nodes.length) return;
                const group = buildListeningGroup($, partNumber, groups.length, current.heading, current.instruction, current.nodes, answerFor);
                if (group.questions.length) groups.push(group);
            }

            $part.children().each((_, el) => {
                const $el = $(el);
                if ($el.hasClass("stitle")) {
                    flush();
                    current = { heading: $el, instruction: null, nodes: [] };
                    return;
                }
                if (!current) return;
                if ($el.hasClass("instr")) {
                    current.instruction = current.instruction || $el;
                    return;
                }
                current.nodes.push($el);
            });
            flush();

            return {
                number: partNumber,
                title: `Part ${partNumber}`,
                questionGroups: groups
            };
        })
    };
}

function flattenReadingQuestions(passages) {
    return passages.flatMap((passage) => passage.questionGroups.flatMap((group) => group.questions))
        .sort((a, b) => a.number - b.number)
        .map((question) => ({
            number: question.number,
            type: question.type,
            question: question.question,
            options: question.options || [],
            answer: question.answer
        }));
}

function flattenListeningQuestions(sections) {
    return sections.flatMap((section) => section.questionGroups.flatMap((group) => group.questions))
        .sort((a, b) => a.number - b.number);
}

function parseWriting() {
    const html = readHtml(WRITING_FILE);
    const $ = cheerio.load(html, { decodeEntities: false });
    const task1Prompt = text($, $("#part-1 .task-prompt").first());
    const task1Image = $("#part-1 img").first().attr("src") || "";
    const task2Prompt = text($, $("#part-2 .task-prompt").first());

    return {
        task1: {
            title: `${MOCK_TITLE} - Writing Task 1`,
            promptText: task1Prompt,
            imageUrl: task1Image,
            taskType: "task1",
            wordLimit: 150,
            timeLimit: 20,
            status: "published",
            mockOnly: true
        },
        task2: {
            title: `${MOCK_TITLE} - Writing Task 2`,
            promptText: task2Prompt,
            imageUrl: "",
            taskType: "task2",
            questionType: "opinion",
            wordLimit: 250,
            timeLimit: 40,
            status: "published",
            mockOnly: true
        }
    };
}

async function upsertWritingPrompt(payload) {
    const existing = await WritingPrompt.findOne({ title: payload.title, taskType: payload.taskType });
    if (existing) {
        Object.assign(existing, payload);
        await existing.save();
        return existing;
    }
    return WritingPrompt.create(payload);
}

async function ensureWritingFullTest() {
    const writing = parseWriting();
    const task1 = await upsertWritingPrompt(writing.task1);
    const task2 = await upsertWritingPrompt(writing.task2);
    const existing = await WritingFullTest.findOne({ title: `${MOCK_TITLE} - Writing` });
    const payload = {
        title: `${MOCK_TITLE} - Writing`,
        task1PromptId: task1._id,
        task2PromptId: task2._id,
        timeLimit: 60,
        status: "published",
        mockOnly: true
    };
    if (existing) {
        Object.assign(existing, payload);
        await existing.save();
        return existing;
    }
    return WritingFullTest.create(payload);
}

async function upsertDoc(Model, query, payload) {
    const existing = await Model.findOne(query);
    if (existing) {
        Object.assign(existing, payload);
        await existing.save();
        return existing;
    }
    return Model.create(payload);
}

async function ensureSpeakingFullTest() {
    const part1 = await upsertDoc(SpeakingPart1Test, { title: `${MOCK_TITLE} - Speaking Part 1` }, {
        title: `${MOCK_TITLE} - Speaking Part 1`,
        description: "Answer general IELTS Speaking Part 1 questions naturally.",
        questions: [
            { text: "Do you work or study?" },
            { text: "What do you like about your hometown?" },
            { text: "How often do you use technology for learning?" },
            { text: "What do you usually do in your free time?" }
        ],
        prepTime: "No prep",
        speakingTime: "5 min",
        status: "published"
    });

    const part2 = await upsertDoc(SpeakingPart2Test, { title: `${MOCK_TITLE} - Speaking Part 2` }, {
        title: `${MOCK_TITLE} - Speaking Part 2`,
        instruction: "Describe a useful skill you learned.",
        bulletPoints: [
            { text: "what the skill is" },
            { text: "how you learned it" },
            { text: "how often you use it" },
            { text: "and explain why it is useful to you" }
        ],
        prepTime: "1 min",
        speakingTime: "2 min",
        status: "published"
    });

    const part3 = await upsertDoc(SpeakingPart3Test, { title: `${MOCK_TITLE} - Speaking Part 3` }, {
        title: `${MOCK_TITLE} - Speaking Part 3`,
        description: "Answer follow-up questions related to learning and skills.",
        questions: [
            { text: "Why do people need to keep learning new skills?" },
            { text: "What skills are most important for young people today?" },
            { text: "Should schools teach more practical skills?" },
            { text: "How has technology changed the way people learn?" }
        ],
        prepTime: "No prep",
        speakingTime: "5 min",
        status: "published"
    });

    return upsertDoc(FullSpeakingTest, { title: `${MOCK_TITLE} - Speaking` }, {
        title: `${MOCK_TITLE} - Speaking`,
        part1Id: part1._id,
        part2Id: part2._id,
        part3Id: part3._id,
        estimatedTime: "11-14 min",
        aiFeedback: true,
        status: "published"
    });
}

function saveJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function saveSectionTests() {
    const createdAt = new Date().toISOString();
    const fullTest = {
        id: FULL_TEST_ID,
        title: MOCK_TITLE,
        sourceFile: "Telegram Desktop HTML import",
        status: "published",
        mockOnly: true,
        skill: "combined",
        layout: "telegram-static-player",
        reading: { passages: parseReading() },
        listening: parseListening(),
        answers: {},
        images: [],
        parseReport: {},
        createdAt,
        publishedAt: createdAt
    };

    const published = buildPublishedTests(fullTest);
    const readingFull = {
        ...published.readingTests.find((test) => test.id === READING_TEST_ID),
        status: "published",
        mockOnly: true,
        subtitle: "Reading full test"
    };
    const listeningFull = {
        ...published.listeningTests.find((test) => test.id === LISTENING_TEST_ID),
        status: "published",
        mockOnly: true,
        duration: 40,
        subtitle: "Listening full test"
    };

    saveJson(path.join(ROOT, "data", "full-tests", `${safeFileName(FULL_TEST_ID)}.json`), fullTest);
    saveJson(path.join(ROOT, "data", "reading-tests", `${safeFileName(READING_TEST_ID)}.json`), readingFull);
    saveJson(path.join(ROOT, "data", "listening-tests", `${safeFileName(LISTENING_TEST_ID)}.json`), listeningFull);

    return {
        readingFull,
        listeningFull,
        readingQuestions: flattenReadingQuestions(fullTest.reading.passages).length,
        listeningQuestions: flattenListeningQuestions(fullTest.listening.sections).length
    };
}

function updateMockTest({ writingTestId, speakingTestId }) {
    const filePath = path.join(ROOT, "data", "mock-tests.json");
    const payload = fs.existsSync(filePath)
        ? JSON.parse(fs.readFileSync(filePath, "utf8"))
        : { tests: [] };
    const tests = Array.isArray(payload.tests) ? payload.tests : [];
    const existingIndex = tests.findIndex((test) => String(test.id) === MOCK_TEST_ID);
    const now = new Date().toISOString();
    const mock = {
        id: MOCK_TEST_ID,
        title: MOCK_TITLE,
        testNumber: 4,
        number: 4,
        description: "Imported from Telegram Desktop full Reading, Listening and Writing HTML files.",
        status: "active",
        listeningTestId: LISTENING_TEST_ID,
        readingTestId: READING_TEST_ID,
        writingTestId: String(writingTestId),
        speakingTestId: String(speakingTestId),
        createdAt: existingIndex >= 0 ? tests[existingIndex].createdAt || now : now,
        updatedAt: now
    };

    if (existingIndex >= 0) {
        tests[existingIndex] = mock;
    } else {
        tests.push(mock);
    }

    tests.sort((a, b) => Number(a.number || a.testNumber || 0) - Number(b.number || b.testNumber || 0));
    saveJson(filePath, { tests });
    return mock;
}

async function main() {
    const sectionResult = saveSectionTests();

    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const writingFull = await ensureWritingFullTest();
    const speakingFull = await ensureSpeakingFullTest();
    await mongoose.disconnect();

    const mock = updateMockTest({
        writingTestId: writingFull._id,
        speakingTestId: speakingFull._id
    });

    console.log(JSON.stringify({
        mock,
        reading: {
            id: sectionResult.readingFull.id,
            questions: sectionResult.readingQuestions
        },
        listening: {
            id: sectionResult.listeningFull.id,
            questions: sectionResult.listeningQuestions,
            audio: sectionResult.listeningFull.audio
        },
        writing: {
            id: String(writingFull._id),
            title: writingFull.title
        },
        speaking: {
            id: String(speakingFull._id),
            title: speakingFull.title
        }
    }, null, 2));
}

main().catch(async (error) => {
    console.error(error);
    try {
        await mongoose.disconnect();
    } catch {}
    process.exit(1);
});
