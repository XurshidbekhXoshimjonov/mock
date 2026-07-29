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
const SOURCE_FILE = path.resolve(process.argv[2] || "");
const TEST_NUMBER = Number(process.argv[3] || 2);
const MOCK_TITLE = `Mock Test ${TEST_NUMBER}`;
const MOCK_TEST_ID = `mock-test-${TEST_NUMBER}`;
const FULL_TEST_ID = `full-mock-10-test-${TEST_NUMBER}`;
const READING_TEST_ID = `${FULL_TEST_ID}-reading-full`;
const LISTENING_TEST_ID = `${FULL_TEST_ID}-listening-full`;

if (!SOURCE_FILE || !fs.existsSync(SOURCE_FILE)) {
    throw new Error("Usage: node scripts/import-integrated-mock-html.js <html-file> [test-number]");
}

const sourceHtml = fs.readFileSync(SOURCE_FILE, "utf8");

function safeFileName(fileName) {
    return String(fileName || "").replace(/[^a-z0-9.\-_]/gi, "_").replace(/_+/g, "_");
}

function text(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function instructionLines(value) {
    const $ = cheerio.load(`<div id="instruction-root">${value || ""}</div>`, { decodeEntities: false });
    $("#instruction-root br").replaceWith("\n");
    return $("#instruction-root").text()
        .split(/\r?\n/)
        .map(text)
        .filter(Boolean);
}

function instructionBodyHtml(value) {
    return String(value || "")
        .split("\n")
        .map((line) => `<p>${sanitizeHtml(line)}</p>`)
        .join("");
}

function readingParagraphs(items) {
    return (items || []).flatMap((item) => {
        const letter = String(item?.[0] || "").trim();
        const source = String(item?.[1] || "").trim();
        const headingMatch = source.match(/(?:<br\s*\/?>\s*){2,}<(?:b|strong)[^>]*>([^<]+)<\/(?:b|strong)>\s*$/i);
        const paragraphSource = headingMatch
            ? source.slice(0, headingMatch.index).trim()
            : source;
        const $paragraph = cheerio.load(`<div id="reading-paragraph">${paragraphSource}</div>`, { decodeEntities: false });
        const paragraph = {
            letter,
            html: sanitizeHtml(paragraphSource),
            text: text($paragraph("#reading-paragraph").text())
        };

        if (!headingMatch) return [paragraph];

        const heading = text(headingMatch[1]);
        return [
            paragraph,
            {
                letter: "",
                html: `<h2 class="cbt-passage-section-heading">${sanitizeHtml(heading)}</h2>`,
                text: heading,
                isSectionHeading: true
            }
        ];
    });
}

function extractString(name) {
    const match = new RegExp(`const\\s+${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")`).exec(sourceHtml);
    if (!match) throw new Error(`Could not find ${name}`);
    return JSON.parse(match[1]);
}

function extractObject(name, nextMarker, context = {}) {
    const declaration = `const ${name} =`;
    const start = sourceHtml.indexOf(declaration);
    const end = sourceHtml.indexOf(nextMarker, start + declaration.length);
    if (start < 0 || end < 0) throw new Error(`Could not find ${name}`);

    let expression = sourceHtml.slice(start + declaration.length, end).trim();
    const finalBrace = expression.lastIndexOf("}");
    if (finalBrace < 0) throw new Error(`Could not parse ${name}`);
    expression = expression.slice(0, finalBrace + 1);
    return vm.runInNewContext(`(${expression})`, context, { timeout: 3000 });
}

function answerValue(value) {
    return Array.isArray(value)
        ? value.map((item) => String(item || "").trim()).filter(Boolean).join(" | ")
        : String(value || "").trim();
}

function optionObjects(values, labelMap = {}) {
    return values.map((value, index) => {
        const key = String(value || String.fromCharCode(65 + index)).trim();
        return { value: key, label: labelMap[key] || key };
    });
}

function letteredOptionObjects(values) {
    return values.map((value, index) => ({
        value: String.fromCharCode(65 + index),
        label: text(value)
    }));
}

function rangeNumbers(value) {
    const match = String(value || "").match(/(\d+)\s*[-–—]\s*(\d+)/);
    if (!match) return [Number(value)].filter(Number.isFinite);
    const start = Number(match[1]);
    const end = Number(match[2]);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function splitInstructionGroups(template) {
    const $ = cheerio.load(`<div id="import-root">${template}</div>`, { decodeEntities: false });
    const groups = [];
    let current = null;

    $("#import-root").contents().each((_, node) => {
        const $node = $(node);
        if (node.type === "tag" && $node.hasClass("instructions")) {
            if (current) groups.push(current);
            current = { instructionHtml: $.html(node), bodyHtml: "" };
            return;
        }
        if (!current) current = { instructionHtml: "", bodyHtml: "" };
        current.bodyHtml += $.html(node) || "";
    });
    if (current) groups.push(current);
    return groups.filter((group) => /\{\{(?:input|tfng|mc|multi|select|short):/.test(group.bodyHtml));
}

function choiceLabelMap(groupHtml) {
    const $ = cheerio.load(groupHtml, { decodeEntities: false });
    const html = $(".choice-box").first().html() || "";
    const labels = {};
    html.split(/<br\s*\/?>/i).forEach((line) => {
        const plain = text(cheerio.load(`<div>${line}</div>`).text());
        const match = plain.match(/^([A-Z])\s*[.)]\s*(.+)$/);
        if (match) labels[match[1]] = match[2];
    });
    return labels;
}

function completionType(instruction, skill) {
    const value = instruction.toLowerCase();
    if (value.includes("form")) return "form_completion";
    if (value.includes("table")) return "table_completion";
    if (value.includes("summary")) return "summary_completion";
    if (value.includes("note")) return skill === "listening" ? "note_completion" : "notes_completion";
    if (value.includes("flow-chart") || value.includes("flow chart")) return "summary_completion";
    return "sentence_completion";
}

function contextualPrompt(bodyHtml, number) {
    const marked = bodyHtml.replace(/\{\{(?:input|short):(\d+):[\s\S]*?\}\}/g, (_, q) => (
        `<span data-import-question="${q}">...</span>`
    )).replace(/\{\{(?:tfng|mc|multi|select):[\s\S]*?\}\}/g, "");
    const $ = cheerio.load(`<div id="context-root">${marked}</div>`, { decodeEntities: false });
    const marker = $(`[data-import-question="${number}"]`).first();
    const container = marker.closest("li, p, .notes-row, .flow > div, div").first();
    return text(container.text()) || `Question ${number}`;
}

function tokenQuestions(bodyHtml, answers, instruction, skill) {
    const tokens = [];
    const pattern = /\{\{(input|tfng|mc|multi|select|short):([\s\S]*?)\}\}/g;
    let match;
    while ((match = pattern.exec(bodyHtml))) {
        const kind = match[1];
        const payload = match[2];
        const firstColon = payload.indexOf(":");
        const numberPart = firstColon >= 0 ? payload.slice(0, firstColon) : payload;
        const rest = firstColon >= 0 ? payload.slice(firstColon + 1) : "";
        tokens.push({ kind, numberPart, rest, raw: match[0], index: match.index });
    }

    const labels = choiceLabelMap(bodyHtml);
    const questions = [];
    tokens.forEach((token) => {
        if (token.kind === "multi") {
            const values = token.rest.split("|").map(text).filter(Boolean);
            rangeNumbers(token.numberPart).forEach((number) => {
                questions.push({
                    number,
                    type: "multiple_choice",
                    question: `Select the correct option for Question ${number}`,
                    options: optionObjects(values),
                    answer: answerValue(answers[number])
                });
            });
            return;
        }

        const number = Number(token.numberPart);
        if (!Number.isFinite(number)) return;
        if (token.kind === "mc") {
            const values = token.rest.split("|");
            questions.push({
                number,
                type: "multiple_choice",
                question: text(values.shift()),
                options: letteredOptionObjects(values.map(text).filter(Boolean)),
                answer: answerValue(answers[number])
            });
            return;
        }
        if (token.kind === "tfng") {
            questions.push({
                number,
                type: "true_false_not_given",
                question: text(token.rest),
                options: optionObjects(["TRUE", "FALSE", "NOT GIVEN"]),
                answer: answerValue(answers[number])
            });
            return;
        }
        if (token.kind === "select") {
            const separator = token.rest.lastIndexOf(":");
            const prompt = separator >= 0 ? token.rest.slice(0, separator) : token.rest;
            const values = separator >= 0 ? token.rest.slice(separator + 1).split("|") : [];
            questions.push({
                number,
                type: skill === "listening" ? "matching" : "matching_information",
                question: text(prompt),
                options: optionObjects(values.map(text).filter(Boolean), labels),
                answer: answerValue(answers[number])
            });
            return;
        }

        const isShort = token.kind === "short";
        questions.push({
            number,
            type: isShort ? "short_answer" : completionType(instruction, skill),
            question: isShort ? text(token.rest) : contextualPrompt(bodyHtml, number),
            options: [],
            answer: answerValue(answers[number])
        });
    });
    return questions.sort((a, b) => a.number - b.number);
}

function completionHtml(bodyHtml) {
    const converted = bodyHtml
        .replace(/\{\{input:(\d+):\d+\}\}/g, '<span class="ielts-blank" data-blank="$1">______</span>')
        .replace(/\{\{short:(\d+):[\s\S]*?\}\}/g, '<span class="ielts-blank" data-blank="$1">______</span>')
        .replace(/\{\{(?:tfng|mc|multi|select):[\s\S]*?\}\}/g, "");
    return sanitizeHtml(converted);
}

function listeningContentLines(bodyHtml) {
    const converted = bodyHtml
        .replace(/\{\{input:(\d+):\d+\}\}/g, "{{$1}}")
        .replace(/\{\{short:(\d+):[\s\S]*?\}\}/g, "{{$1}}")
        .replace(/\{\{(?:tfng|mc|multi|select):[\s\S]*?\}\}/g, "");
    const $ = cheerio.load(`<div id="listening-content">${converted}</div>`, { decodeEntities: false });
    const lines = [];
    $("#listening-content").find("h3, h4, p, li, .notes-row, .flow > div").each((_, element) => {
        const $element = $(element);
        if ($element.is("li")) {
            const clone = $element.clone();
            clone.children("ul, ol").remove();
            const value = sanitizeHtml(clone.html() || "");
            const nesting = $element.parents("li").length;
            if (text(clone.text())) lines.push(`${"  ".repeat(nesting)}- ${value}`);
            return;
        }
        if ($element.parents("li").length && $element.is("p, .notes-row")) return;
        const value = sanitizeHtml($element.html() || "");
        if (text($element.text())) lines.push(value);
    });
    return [...new Set(lines)];
}

function groupsFromTemplate(template, answers, skill, partNumber) {
    return splitInstructionGroups(template).map((segment, index) => {
        const lines = instructionLines(segment.instructionHtml);
        const instruction = lines
            .filter((line, lineIndex) => !(
                lineIndex === 0
                && /^Questions?\s+\d+(?:\s*[-–—]\s*\d+)?$/i.test(line)
            ))
            .join("\n");
        const questions = tokenQuestions(segment.bodyHtml, answers, instruction, skill);
        const first = questions[0]?.number;
        const last = questions[questions.length - 1]?.number;
        const dominantType = questions[0]?.type || "sentence_completion";
        const isCompletion = questions.every((question) => [
            "form_completion", "note_completion", "notes_completion", "table_completion",
            "summary_completion", "sentence_completion", "short_answer"
        ].includes(question.type));

        const $body = cheerio.load(segment.bodyHtml, { decodeEntities: false });
        const groupType = skill === "listening" && isCompletion ? "note_completion" : dominantType;
        const groupOptions = questions.find((question) => question.options?.length)?.options || [];
        const optionTitle = text($body(".choice-box strong, .choice-box b").first().text());
        const contentTitle = text($body("h3").first().text());
        let noteStyle = "";
        if (skill === "listening" && isCompletion) {
            if (/^CAPITAL ONE BANK$/i.test(contentTitle)) {
                noteStyle = "capital-one-bank";
            } else if (/^STAFF NOTICE AT CANTERBURY ROCK FESTIVAL$/i.test(contentTitle)) {
                noteStyle = "canterbury-staff-notice";
            } else if (/^IMPACT OF GLOBAL WARMING ON AGRICULTURE$/i.test(contentTitle)) {
                noteStyle = "global-warming-agriculture";
            } else {
                noteStyle = "boxed-flow";
            }
        } else if (
            skill === "listening"
            && groupType === "multiple_choice"
            && /^RESEARCH ON THE SUCCESS OF A VIDEO GAME COMPANY$/i.test(contentTitle)
        ) {
            noteStyle = "video-game-company-mcq";
        }
        return {
            id: `${FULL_TEST_ID}-${skill}-p${partNumber}-g${index + 1}`,
            type: groupType,
            instructionTitle: first ? (first === last ? `Question ${first}` : `Questions ${first}-${last}`) : "Questions",
            instructionText: instruction,
            instructionHtml: {
                titleHtml: first ? `<h3>${first === last ? `Question ${first}` : `Questions ${first}-${last}`}</h3>` : "",
                bodyHtml: instructionBodyHtml(instruction),
                rulesHtml: ""
            },
            rule: "",
            options: groupOptions,
            optionsTitle: optionTitle,
            title: contentTitle,
            imageUrl: $body("img").first().attr("src") || "",
            imageLayout: "stacked",
            contentHtml: isCompletion ? completionHtml(segment.bodyHtml) : "",
            content: skill === "listening" && isCompletion ? listeningContentLines(segment.bodyHtml) : [],
            noteStyle,
            className: skill === "reading" && /\b(?:NO MORE THAN|ONE WORD(?: ONLY)?|[A-Z]+ WORDS?)\b/i.test(instruction)
                ? "imported-reading-limit-group"
                : "",
            hideOptionsList: skill === "reading" && first === 36 && last === 40,
            questions,
            questionRange: first ? [first, last] : []
        };
    });
}

function parseSource() {
    const mapImage = extractString("MAP_IMAGE_SRC");
    const task1Image = extractString("TASK1_IMG");
    const listeningAnswers = extractObject("listeningAnswerKey", "const readingAnswerKey");
    const readingAnswers = extractObject("readingAnswerKey", "const state");
    const passage1 = extractObject("passage1", "const passage2");
    const passage2 = extractObject("passage2", "const passage3");
    const passage3 = extractObject("passage3", "function inputBlank");
    const listeningParts = extractObject("currentListeningParts", "const currentReadingQuestions", { MAP_IMAGE_SRC: mapImage });
    const readingQuestions = extractObject("currentReadingQuestions", "function upperMcQuestion");
    const $ = cheerio.load(sourceHtml, { decodeEntities: false });
    const audio = $("#test-audio").attr("src") || $("audio").first().attr("src") || "";

    const passages = [passage1, passage2, passage3].map((passage, index) => {
        const paragraphs = readingParagraphs(passage.paras);
        return {
            number: index + 1,
            title: passage.title || `Reading Passage ${index + 1}`,
            displayLabel: `Reading Passage ${index + 1}`,
            passageTitle: passage.title || `Reading Passage ${index + 1}`,
            passageText: paragraphs.map((paragraph) => paragraph.text).filter(Boolean).join("\n\n"),
            passageHtml: paragraphs.map((paragraph) => paragraph.isSectionHeading
                ? paragraph.html
                : `<p><strong>${paragraph.letter}</strong> ${paragraph.html}</p>`).join(""),
            paragraphs,
            questionGroups: groupsFromTemplate(readingQuestions[String(index + 1)], readingAnswers, "reading", index + 1)
        };
    });

    const sections = Object.keys(listeningParts).sort().map((key) => ({
        number: Number(key),
        title: listeningParts[key].title || `Part ${key}`,
        questionGroups: groupsFromTemplate(listeningParts[key].html, listeningAnswers, "listening", Number(key))
    }));

    const task1Block = /function renderWritingTask1\(\)\{[\s\S]*?return `([\s\S]*?)`;\s*\}/.exec(sourceHtml)?.[1] || "";
    const task2Block = /function renderWritingTask2\(\)\{[\s\S]*?return `([\s\S]*?)`;\s*\}/.exec(sourceHtml)?.[1] || "";
    const taskText = (block) => {
        const rendered = block.replace(/\$\{partBanner\([^}]+\)\}/g, "").replace(/\$\{TASK1_IMG\}/g, task1Image);
        const $block = cheerio.load(rendered, { decodeEntities: false });
        return $block(".task-text").toArray().map((el) => text($block(el).text())).filter((line) => !/^write at least/i.test(line)).join("\n\n");
    };

    return { audio, passages, sections, task1Image, task1Prompt: taskText(task1Block), task2Prompt: taskText(task2Block) };
}

function flattenQuestions(items) {
    return items.flatMap((item) => item.questionGroups.flatMap((group) => group.questions)).sort((a, b) => a.number - b.number);
}

function saveJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function saveSectionTests(parsed) {
    const createdAt = new Date().toISOString();
    const fullTest = {
        id: FULL_TEST_ID,
        title: MOCK_TITLE,
        sourceFile: path.basename(SOURCE_FILE),
        status: "published",
        mockOnly: true,
        skill: "combined",
        layout: "integrated-html-import",
        reading: { passages: parsed.passages },
        listening: { audio: parsed.audio, transcript: "", sections: parsed.sections },
        answers: {}, images: [], parseReport: {}, createdAt, publishedAt: createdAt
    };
    const published = buildPublishedTests(fullTest);
    const readingFull = { ...published.readingTests.find((test) => test.id === READING_TEST_ID), status: "published", mockOnly: true, subtitle: "Reading full test" };
    const listeningFull = {
        ...published.listeningTests.find((test) => test.id === LISTENING_TEST_ID),
        status: "published",
        mockOnly: true,
        duration: 40,
        subtitle: "Listening full test",
        fullAudioUrl: parsed.audio
    };
    saveJson(path.join(ROOT, "data", "full-tests", `${safeFileName(FULL_TEST_ID)}.json`), fullTest);
    saveJson(path.join(ROOT, "data", "reading-tests", `${safeFileName(READING_TEST_ID)}.json`), readingFull);
    saveJson(path.join(ROOT, "data", "listening-tests", `${safeFileName(LISTENING_TEST_ID)}.json`), listeningFull);
    return { readingFull, listeningFull };
}

async function upsert(Model, query, payload) {
    const existing = await Model.findOne(query);
    if (existing) { Object.assign(existing, payload); await existing.save(); return existing; }
    return Model.create(payload);
}

async function ensureWriting(parsed) {
    const task1 = await upsert(WritingPrompt, { title: `${MOCK_TITLE} - Writing Task 1`, taskType: "task1" }, {
        title: `${MOCK_TITLE} - Writing Task 1`, promptText: parsed.task1Prompt, imageUrl: parsed.task1Image,
        taskType: "task1", wordLimit: 150, timeLimit: 20, status: "published", mockOnly: true
    });
    const task2 = await upsert(WritingPrompt, { title: `${MOCK_TITLE} - Writing Task 2`, taskType: "task2" }, {
        title: `${MOCK_TITLE} - Writing Task 2`, promptText: parsed.task2Prompt, imageUrl: "", taskType: "task2",
        questionType: "discussion", wordLimit: 250, timeLimit: 40, status: "published", mockOnly: true
    });
    return upsert(WritingFullTest, { title: `${MOCK_TITLE} - Writing` }, {
        title: `${MOCK_TITLE} - Writing`, task1PromptId: task1._id, task2PromptId: task2._id,
        timeLimit: 60, status: "published", mockOnly: true
    });
}

async function ensureSpeaking() {
    const part1 = await upsert(SpeakingPart1Test, { title: `${MOCK_TITLE} - Speaking Part 1` }, {
        title: `${MOCK_TITLE} - Speaking Part 1`, description: "Answer general IELTS Speaking Part 1 questions naturally.",
        questions: [{ text: "Do you work or study?" }, { text: "What do you like about your hometown?" }, { text: "How do you usually spend your free time?" }],
        prepTime: "No prep", speakingTime: "5 min", status: "published"
    });
    const part2 = await upsert(SpeakingPart2Test, { title: `${MOCK_TITLE} - Speaking Part 2` }, {
        title: `${MOCK_TITLE} - Speaking Part 2`, instruction: "Describe a person who has influenced you.",
        bulletPoints: [{ text: "who the person is" }, { text: "how you know this person" }, { text: "what influence this person had" }, { text: "and explain how you feel about this person" }],
        prepTime: "1 min", speakingTime: "2 min", status: "published"
    });
    const part3 = await upsert(SpeakingPart3Test, { title: `${MOCK_TITLE} - Speaking Part 3` }, {
        title: `${MOCK_TITLE} - Speaking Part 3`, description: "Answer follow-up questions about influence and role models.",
        questions: [{ text: "Why do people need role models?" }, { text: "Who influences young people most today?" }, { text: "Can public figures be good role models?" }],
        prepTime: "No prep", speakingTime: "5 min", status: "published"
    });
    return upsert(FullSpeakingTest, { title: `${MOCK_TITLE} - Speaking` }, {
        title: `${MOCK_TITLE} - Speaking`, part1Id: part1._id, part2Id: part2._id, part3Id: part3._id,
        estimatedTime: "11-14 min", aiFeedback: true, status: "published"
    });
}

function updateMockTest(writingTestId, speakingTestId, parsed) {
    const filePath = path.join(ROOT, "data", "mock-tests.json");
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const tests = Array.isArray(payload.tests) ? payload.tests : [];
    const index = tests.findIndex((test) => String(test.id) === MOCK_TEST_ID);
    const now = new Date().toISOString();
    const mock = {
        id: MOCK_TEST_ID, title: MOCK_TITLE, testNumber: TEST_NUMBER, number: TEST_NUMBER,
        description: `Imported from ${path.basename(SOURCE_FILE)}.`, status: "active", access: "free",
        listeningTestId: LISTENING_TEST_ID, readingTestId: READING_TEST_ID,
        writingTestId: String(writingTestId), speakingTestId: String(speakingTestId),
        writing: {
            timeLimit: 60,
            task1Prompt: {
                taskType: "task1",
                title: `${MOCK_TITLE} - Writing Task 1`,
                promptText: parsed.task1Prompt,
                visualDiagramUrl: parsed.task1Image,
                imageUrl: parsed.task1Image,
                wordLimit: 150,
                timeLimit: 20
            },
            task2Prompt: {
                taskType: "task2",
                title: `${MOCK_TITLE} - Writing Task 2`,
                promptText: parsed.task2Prompt,
                questionType: "discussion",
                wordLimit: 250,
                timeLimit: 40
            }
        },
        createdAt: index >= 0 ? tests[index].createdAt || now : now, updatedAt: now
    };
    if (index >= 0) tests[index] = mock; else tests.push(mock);
    tests.sort((a, b) => Number(a.number || a.testNumber || 0) - Number(b.number || b.testNumber || 0));
    saveJson(filePath, { tests });
    return mock;
}

async function main() {
    const parsed = parseSource();
    const listeningQuestions = flattenQuestions(parsed.sections);
    const readingQuestions = flattenQuestions(parsed.passages);
    if (listeningQuestions.length !== 40 || readingQuestions.length !== 40) {
        throw new Error(`Expected 40+40 questions, found ${listeningQuestions.length}+${readingQuestions.length}`);
    }
    if (!parsed.audio || !parsed.task1Prompt || !parsed.task2Prompt) throw new Error("Audio or Writing prompts are missing");

    const sectionTests = saveSectionTests(parsed);
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const writing = await ensureWriting(parsed);
    const speaking = await ensureSpeaking();
    await mongoose.disconnect();
    const mock = updateMockTest(writing._id, speaking._id, parsed);
    console.log(JSON.stringify({
        mock,
        listening: { id: sectionTests.listeningFull.id, questions: listeningQuestions.length, audio: parsed.audio },
        reading: { id: sectionTests.readingFull.id, questions: readingQuestions.length },
        writing: { id: String(writing._id), task1: parsed.task1Prompt, task2: parsed.task2Prompt },
        speaking: { id: String(speaking._id) }
    }, null, 2));
}

main().catch(async (error) => {
    console.error(error);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
});
