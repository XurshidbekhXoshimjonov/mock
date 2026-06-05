/**
 * Parses structured manual IELTS test text (questions, groups, inline answers).
 */

const READING_TYPES = [
    "true_false_not_given",
    "yes_no_not_given",
    "multiple_choice",
    "multi_select",
    "summary_completion",
    "sentence_completion",
    "matching_headings",
    "matching_information",
    "diagram_labeling"
];

const LISTENING_TYPES = [
    "form_completion",
    "notes_completion",
    "multiple_choice",
    "map_labeling",
    "matching",
    "sentence_completion",
    "diagram_labeling",
    "table_completion"
];

function parseAnswerLines(answerText) {
    const answers = {};

    String(answerText || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            const match = line.match(/^(\d{1,2})\s*[\).:\-=\|]\s*(.+)$/);

            if (match) {
                answers[match[1]] = match[2].trim();
            }
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

    if (Array.isArray(options)) {
        return options.map(String).map((item) => item.trim()).filter(Boolean);
    }

    return parseOptionText(options);
}

function normalizeType(type, skill) {
    const value = String(type || "sentence_completion").trim().toLowerCase();
    const allowed = skill === "listening" ? LISTENING_TYPES : READING_TYPES;

    if (allowed.includes(value)) {
        return value;
    }

    if (value === "map_labeling" && skill === "reading") {
        return "diagram_labeling";
    }

    return skill === "listening" ? "sentence_completion" : "sentence_completion";
}

function needsOptions(type) {
    return [
        "multiple_choice",
        "multi_select",
        "matching_headings",
        "matching_information",
        "matching",
        "map_labeling",
        "diagram_labeling"
    ].includes(type);
}

function normalizeQuestion(raw, answers, skill) {
    const number = Number(raw.number);
    const type = normalizeType(raw.type, skill);
    const question = String(raw.question || "").trim();
    const answerFromMap = answers[String(number)];
    const answer = raw.answer !== undefined && raw.answer !== ""
        ? String(raw.answer).trim()
        : (answerFromMap || "");

    return {
        number,
        type,
        question,
        options: needsOptions(type) ? optionsForType(type, raw.options) : optionsForType(type, raw.options),
        answer
    };
}

function isGroupHeaderLine(line, skill) {
    const trimmed = String(line || "").trim();

    if (!trimmed) {
        return false;
    }

    if (/^(group|section)\b/i.test(trimmed)) {
        return true;
    }

    if (/^#\s*questions\b/i.test(trimmed)) {
        return true;
    }

    return /^questions\s+\d/i.test(trimmed) && !/^\d+\s*\|/.test(trimmed);
}

function parseGroupHeaderLine(line) {
    const parts = line.split("|").map((item) => item.trim());

    if (/^(group|section)\b/i.test(parts[0])) {
        return {
            title: parts[1] || "Questions",
            instruction: parts[2] || "",
            rule: parts[3] || "",
            type: String(parts[4] || "").trim().toLowerCase().replace(/[\s-]+/g, "_"),
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

function isQuestionLine(line) {
    return /^\d{1,2}\s*\|/.test(String(line || "").trim());
}

function parseQuestionLine(line, answers, skill) {
    const parts = line.split("|").map((item) => item.trim());
    const type = normalizeType(parts[1], skill);
    let optionsPart = "";
    let inlineAnswer = "";

    if (parts.length >= 5) {
        optionsPart = parts[3];
        inlineAnswer = parts[4];
    } else if (parts.length === 4) {
        if (needsOptions(type)) {
            optionsPart = parts[3];
        } else {
            inlineAnswer = parts[3];
        }
    }

    return normalizeQuestion({
        number: parts[0],
        type: parts[1],
        question: parts[2],
        options: optionsPart,
        answer: inlineAnswer
    }, answers, skill);
}

function extractFirstQuestionNumber(text) {
    const value = String(text || "").trim();

    if (!value) {
        return null;
    }

    const rangeMatch = value.match(/(?:questions?|boxes?)\s*(\d{1,2})\s*[-–]/i);
    if (rangeMatch) {
        return Number(rangeMatch[1]);
    }

    const singleMatch = value.match(/(?:questions?|boxes?)\s*(\d{1,2})\b/i);
    if (singleMatch) {
        return Number(singleMatch[1]);
    }

    const fallback = value.match(/\b(\d{1,2})\b/);
    return fallback ? Number(fallback[1]) : null;
}

function extractQuestionRange(text) {
    const value = String(text || "").trim();
    if (!value) return null;

    const rangeMatch = value.match(/(?:questions?|boxes?)\s*(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/i);
    if (rangeMatch) {
        return { start: Number(rangeMatch[1]), end: Number(rangeMatch[2]) };
    }

    const singleMatch = value.match(/(?:question|box)\s*(\d{1,2})\b/i);
    if (singleMatch) {
        const number = Number(singleMatch[1]);
        return { start: number, end: number };
    }

    return null;
}

function normalizeQuestionGroups(groups, questions) {
    const validNumbers = new Set(
        (questions || []).map((question) => Number(question.number)).filter(Number.isFinite)
    );

    return (groups || []).map((group) => {
        const questionNumbers = (group.questionNumbers || [])
            .map(Number)
            .filter((number) => validNumbers.has(number));

        return {
            ...group,
            questionNumbers: [...new Set(questionNumbers)]
        };
    });
}

function assignQuestionsToDeclaredGroups(groups, questions) {
    const validNumbers = (questions || [])
        .map((question) => Number(question.number))
        .filter(Number.isFinite);

    return (groups || []).map((group) => {
        const range = extractQuestionRange(group.title || group.instructionTitle || "");
        if (!range) return group;

        return {
            ...group,
            questionNumbers: validNumbers.filter((number) => number >= range.start && number <= range.end)
        };
    });
}

function inferDeclaredGroupTypes(groups, questions) {
    const byNumber = new Map((questions || []).map((question) => [Number(question.number), question]));

    return (groups || []).map((group) => {
        if (group.type || group.questionType) return group;

        const types = (group.questionNumbers || [])
            .map((number) => byNumber.get(Number(number))?.type)
            .filter(Boolean);

        return types.length && types.every((type) => type === types[0])
            ? { ...group, type: types[0] }
            : group;
    });
}

function groupStartNumber(group) {
    const numbers = (group.questionNumbers || [])
        .map(Number)
        .filter(Number.isFinite);

    if (numbers.length) {
        return Math.min(...numbers);
    }

    const questionList = group.questions || [];
    if (questionList.length) {
        return Math.min(...questionList.map((q) => q.number).filter(Number.isFinite));
    }

    const fromTitle = extractFirstQuestionNumber(group.title || group.instructionTitle || "");
    return fromTitle !== null ? fromTitle : Number.MAX_SAFE_INTEGER;
}

function sortQuestionGroups(groups) {
    return [...(groups || [])].sort((a, b) => {
        const diff = groupStartNumber(a) - groupStartNumber(b);
        return diff !== 0 ? diff : 0;
    });
}

function parseStructuredContent(questionText, answerText, skill) {
    const answers = parseAnswerLines(answerText);
    const groups = [];
    let currentGroup = null;
    const questions = [];
    let instructionBuffer = [];

    function flushInstructions() {
        if (!currentGroup || !instructionBuffer.length) {
            instructionBuffer = [];
            return;
        }

        const extra = instructionBuffer.join("\n").trim();

        if (extra) {
            currentGroup.instruction = [currentGroup.instruction, extra]
                .filter(Boolean)
                .join("\n");
        }

        instructionBuffer = [];
    }

    function ensureGroup() {
        if (!currentGroup) {
            currentGroup = {
                title: "",
                instruction: "",
                rule: "",
                questionNumbers: []
            };
            groups.push(currentGroup);
        }
    }

    String(questionText || "")
        .split(/\n/)
        .forEach((rawLine) => {
            const line = rawLine.trim();

            if (!line) {
                flushInstructions();
                return;
            }

            if (isGroupHeaderLine(line, skill)) {
                flushInstructions();
                currentGroup = parseGroupHeaderLine(line);
                groups.push(currentGroup);
                return;
            }

            if (isQuestionLine(line)) {
                flushInstructions();
                ensureGroup();
                const question = parseQuestionLine(line, answers, skill);

                if (!Number.isFinite(question.number)) {
                    return;
                }

                currentGroup.questionNumbers.push(question.number);
                questions.push(question);
                return;
            }

            instructionBuffer.push(line);
        });

    flushInstructions();

    const validQuestions = questions
        .filter((q) => Number.isFinite(q.number) && q.question && q.type && q.answer)
        .sort((a, b) => a.number - b.number);

    const cleanedGroups = inferDeclaredGroupTypes(
        normalizeQuestionGroups(assignQuestionsToDeclaredGroups(groups, validQuestions), validQuestions),
        validQuestions
    )
        .map((group) => ({
            ...group,
            questionNumbers: [...new Set(group.questionNumbers || [])]
        }))
        .filter((group) => group.title || group.instruction || group.rule || group.questionNumbers.length);

    if (!cleanedGroups.length && validQuestions.length) {
        const first = validQuestions[0].number;
        const last = validQuestions[validQuestions.length - 1].number;

        cleanedGroups.push({
            title: first === last ? `Question ${first}` : `Questions ${first}-${last}`,
            instruction: "",
            rule: "",
            questionNumbers: validQuestions.map((q) => q.number)
        });
    }

    return {
        groups: cleanedGroups,
        questions: validQuestions
    };
}

function manualReadingToFullTest(readingTest) {
    const questions = readingTest.questions || [];
    const groups = inferDeclaredGroupTypes(
        normalizeQuestionGroups(readingTest.questionGroups || [], questions),
        questions
    );

    return {
        number: 1,
        title: readingTest.title,
        passageText: readingTest.passage,
        paragraphs: String(readingTest.passage || "")
            .split(/\n{2,}/)
            .map((text) => text.trim())
            .filter(Boolean)
            .map((text) => ({ text, html: `<p>${escapeHtml(text)}</p>` })),
        questionGroups: groups.map((group) => ({
            type: group.type || group.questionType || "",
            instructionTitle: group.title,
            instructionText: group.instruction,
            rule: group.rule,
            options: group.options || [],
            questions: (group.questionNumbers || [])
                .map((num) => questions.find((q) => q.number === num))
                .filter(Boolean)
        }))
    };
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function remapQuestionRangeText(value, numberMap) {
    return String(value || "").replace(
        /\b(questions?|boxes?)\s+(\d{1,2})(?:\s*([-–—]|to)\s*(\d{1,2}))?/gi,
        (match, label, start, separator, end) => {
            const mappedStart = numberMap.get(Number(start));
            const mappedEnd = end ? numberMap.get(Number(end)) : null;

            if (!mappedStart) {
                return match;
            }

            return mappedEnd
                ? `${label} ${mappedStart}${separator || "-"}${mappedEnd}`
                : `${label} ${mappedStart}`;
        }
    );
}

function remapManualQuestions(test, startNumber) {
    const sourceQuestions = [...(test.questions || [])]
        .sort((a, b) => Number(a.number) - Number(b.number));
    const numberMap = new Map();

    sourceQuestions.forEach((question, index) => {
        numberMap.set(Number(question.number), startNumber + index);
    });

    return {
        ...JSON.parse(JSON.stringify(test || {})),
        questions: sourceQuestions.map((question) => ({
            ...JSON.parse(JSON.stringify(question)),
            number: numberMap.get(Number(question.number))
        })),
        questionGroups: (test.questionGroups || []).map((group) => ({
            ...JSON.parse(JSON.stringify(group)),
            title: remapQuestionRangeText(group.title, numberMap),
            questionNumbers: (group.questionNumbers || [])
                .map((number) => numberMap.get(Number(number)))
                .filter(Number.isFinite)
        })),
        sections: (test.sections || []).map((section) => ({
            ...JSON.parse(JSON.stringify(section)),
            title: remapQuestionRangeText(section.title, numberMap),
            questionNumbers: (section.questionNumbers || [])
                .map((number) => numberMap.get(Number(number)))
                .filter(Number.isFinite)
        }))
    };
}

function listeningPartToFullSection(test, number) {
    const questions = test.questions || [];
    const groups = (test.sections || []).length
        ? test.sections
        : [{
            title: questions.length > 1
                ? `Questions ${questions[0].number}-${questions[questions.length - 1].number}`
                : `Question ${questions[0]?.number || 1}`,
            instruction: "",
            rule: "",
            questionNumbers: questions.map((question) => question.number)
        }];

    return {
        number,
        title: test.title || `Listening Part ${number}`,
        audio: test.audio || "",
        questionGroups: groups.map((group) => ({
            type: group.type || group.questionType || "",
            instructionTitle: group.title || "",
            instructionText: group.instruction || "",
            rule: group.rule || "",
            questions: (group.questionNumbers || [])
                .map((questionNumber) => questions.find((question) => question.number === questionNumber))
                .filter(Boolean)
        }))
    };
}

function combineSkillParts({ title, skill, parts }) {
    const normalizedSkill = skill === "listening" ? "listening" : "reading";
    const expectedCount = normalizedSkill === "listening" ? 4 : 3;

    if (!Array.isArray(parts) || parts.length !== expectedCount) {
        throw new Error(`${normalizedSkill === "listening" ? "Listening" : "Reading"} Full Test requires ${expectedCount} parts`);
    }

    let nextQuestionNumber = 1;
    const normalizedParts = parts.map((part) => {
        if (!Array.isArray(part.questions) || !part.questions.length) {
            throw new Error(`"${part.title || "Selected part"}" does not contain scored questions and answers`);
        }

        const normalized = remapManualQuestions(part, nextQuestionNumber);
        nextQuestionNumber += normalized.questions.length;
        return normalized;
    });
    const testTitle = String(title || "").trim()
        || `${normalizedParts[0].title} — ${normalizedSkill === "listening" ? "Listening" : "Reading"} Full Test`;
    const id = `${Date.now()}-${normalizedSkill}-full-${String(testTitle).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36)}`;
    const answers = {};

    normalizedParts.flatMap((part) => part.questions).forEach((question) => {
        answers[String(question.number)] = question.answer;
    });

    const readingPassages = normalizedSkill === "reading"
        ? normalizedParts.map((part, index) => ({
            ...manualReadingToFullTest(part),
            number: index + 1,
            title: part.title || `Reading Part ${index + 1}`
        }))
        : [];
    const listeningSections = normalizedSkill === "listening"
        ? normalizedParts.map((part, index) => listeningPartToFullSection(part, index + 1))
        : [];

    return {
        id,
        title: testTitle,
        status: "published",
        publishedAt: new Date().toISOString(),
        source: "manual-parts-combine",
        sourcePartIds: normalizedParts.map((part) => part.id),
        skill: normalizedSkill,
        reading: {
            passages: readingPassages
        },
        listening: {
            audio: listeningSections[0]?.audio || "",
            sections: listeningSections
        },
        answers,
        images: [],
        createdAt: new Date().toISOString()
    };
}

const ManualTestParser = {
    READING_TYPES,
    LISTENING_TYPES,
    parseAnswerLines,
    parseStructuredContent,
    combineSkillParts,
    normalizeType,
    optionsForType,
    extractFirstQuestionNumber,
    extractQuestionRange,
    normalizeQuestionGroups,
    assignQuestionsToDeclaredGroups,
    inferDeclaredGroupTypes,
    groupStartNumber,
    sortQuestionGroups
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ManualTestParser;
}

if (typeof window !== "undefined") {
    window.IeltsManualParser = ManualTestParser;
}
