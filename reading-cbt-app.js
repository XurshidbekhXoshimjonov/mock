/* global React, ReactDOM, IeltsTestComponents */
(() => {
const { createElement: h, Fragment, useEffect, useMemo, useRef, useState } = React;
const { PassageRenderer, QuestionsPanel } = IeltsTestComponents;

const params = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split("/").filter(Boolean);
const routeSkill = ["reading", "listening"].includes(pathParts[0]) ? pathParts[0] : "";
function cleanRouteId(value) {
    const resolved = decodeURIComponent(String(value || "")).trim();
    return resolved === "undefined" || resolved === "null" ? "" : resolved;
}
const routeTestSlug = routeSkill ? cleanRouteId(pathParts[1]) : "";
const mockTestId = cleanRouteId(params.get("mockTestId") || params.get("testId"));
const testId = cleanRouteId(params.get("id"))
    || routeTestSlug
    || (mockTestId ? `mock-${routeSkill === "listening" ? "listening" : "reading"}-${mockTestId}` : "");
const rootElement = document.getElementById("readingAppRoot");
const mode = document.body.dataset.testMode === "full" ? "full" : "individual";
const skill = mode === "full" && (params.get("skill") === "listening" || routeSkill === "listening") ? "listening" : "reading";
const isMockMode = params.get("mockMode") === "1" || params.has("mockTestId");
const READING_LOAD_TIMEOUT_MS = 10000;
const duration = isMockMode
    ? (skill === "listening" ? 40 : 60) * 60
    : mode === "full"
        ? (skill === "listening" ? 40 : 60) * 60
        : 20 * 60;
const ResultUtils = window.IeltsResultUtils || {};
const FULLSCREEN_STATE_EVENT = "ieltsx-fullscreen-state-change";
const VOCABULARY_ERROR_MESSAGE = "Translation is unavailable right now. Please try again.";
const ANONYMOUS_SESSION_KEY = "ieltsx.anonymousSessionId.v1";
const VOCABULARY_STORAGE_PREFIX = "readingVocabulary";
const TRANSLATE_API_ENDPOINT = "/api/translate";

function fullscreenButtons() {
    return Array.from(document.querySelectorAll("[data-fullscreen-toggle]"));
}

function isFullscreenActive() {
    return Boolean(document.fullscreenElement) || document.body.classList.contains("fullscreen-fallback");
}

function updateFullScreenUI() {
    const active = isFullscreenActive();

    document.body.classList.toggle("exam-fullscreen-active", active);
    document.querySelectorAll(".full-test-shell").forEach((shell) => {
        shell.classList.toggle("fullscreen", active);
    });
    fullscreenButtons().forEach((button) => {
        button.textContent = active ? "Exit Full Screen" : "Full Screen";
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.setAttribute("title", active ? "Exit Full Screen" : "Full Screen");
    });
    document.dispatchEvent(new CustomEvent(FULLSCREEN_STATE_EVENT, { detail: { active } }));
}

function notifyMockSectionComplete(section, payload) {
    if (!isMockMode || window.parent === window) return;

    window.parent.postMessage({
        type: "ieltsx-mock-section-complete",
        section,
        ...payload
    }, window.location.origin);
}

function notifyMockSectionReady(section) {
    if (!isMockMode || window.parent === window) return;
    window.parent.postMessage({
        type: "ieltsx-mock-section-ready",
        section,
        testId
    }, window.location.origin);
}

function notifyMockSectionError(section, error) {
    if (!isMockMode || window.parent === window) return;
    window.parent.postMessage({
        type: "ieltsx-mock-section-error",
        section,
        testId,
        message: error?.message || `${section === "listening" ? "Listening" : "Reading"} could not be loaded.`
    }, window.location.origin);
}

function requestMockExamExit() {
    if (isMockMode && window.parent !== window) {
        window.parent.postMessage({ type: "ieltsx-mock-exit-request" }, window.location.origin);
    }
}

document.addEventListener("click", (event) => {
    if (!isMockMode) return;
    const exitButton = event.target.closest("[data-mock-exit]");
    if (!exitButton) return;
    event.preventDefault();
    requestMockExamExit();
});

async function enterFullScreenMode() {
    try {
        if (!document.documentElement.requestFullscreen) {
            throw new Error("Fullscreen API is not available.");
        }
        await document.documentElement.requestFullscreen();
        document.body.classList.remove("fullscreen-fallback");
        document.body.classList.add("exam-fullscreen-active");
    } catch (error) {
        document.body.classList.add("exam-fullscreen-active", "fullscreen-fallback");
    }
    updateFullScreenUI();
}

async function exitFullScreenMode() {
    try {
        if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
        }
    } catch (error) {
        // Restore the page layout even if the browser refuses the exit call.
    }
    document.body.classList.remove("exam-fullscreen-active", "fullscreen-fallback");
    updateFullScreenUI();
}

function bindFullScreenEvents(root = document) {
    const scope = root.querySelectorAll ? root : document;

    scope.querySelectorAll("[data-fullscreen-toggle]").forEach((button) => {
        if (button.dataset.fullscreenBound === "true") return;
        button.dataset.fullscreenBound = "true";
        button.addEventListener("click", () => {
            if (isFullscreenActive()) {
                exitFullScreenMode();
            } else {
                enterFullScreenMode();
            }
        });
    });

    if (!document.documentElement.dataset.fullscreenEventsBound) {
        document.documentElement.dataset.fullscreenEventsBound = "true";
        document.addEventListener("fullscreenchange", () => {
            document.body.classList.toggle("exam-fullscreen-active", Boolean(document.fullscreenElement));
            if (!document.fullscreenElement) {
                document.body.classList.remove("exam-fullscreen-active");
            }
            updateFullScreenUI();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && document.body.classList.contains("fullscreen-fallback")) {
                exitFullScreenMode();
            }
        });
    }

    updateFullScreenUI();
}

window.enterFullScreenMode = enterFullScreenMode;
window.exitFullScreenMode = exitFullScreenMode;
window.updateFullScreenUI = updateFullScreenUI;
window.bindFullScreenEvents = bindFullScreenEvents;

function normalizeAnswer(value) {
    return ResultUtils.normalizeAnswer
        ? ResultUtils.normalizeAnswer(value)
        : String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function acceptedAnswers(value) {
    return ResultUtils.acceptedAnswers
        ? ResultUtils.acceptedAnswers(value)
        : String(value || "").split("|").map((answer) => answer.trim()).filter(Boolean);
}

function questionTypeInstruction(type) {
    const map = {
        true_false_not_given: "Do the following statements agree with the information given in the reading passage?",
        yes_no_not_given: "Do the following statements agree with the claims of the writer?",
        matching_headings: "Choose the correct heading for each paragraph.",
        matching_information: "Choose the paragraph which contains the following information.",
        multiple_choice: "Choose the correct answer.",
        multi_select: "Choose the correct letters.",
        summary_completion: "Complete the summary below.",
        sentence_completion: "Complete the sentences below.",
        short_answer: "Answer the questions below.",
        diagram_labeling: "Label the diagram below.",
        table_completion: "Complete the table below.",
        flowchart_completion: "Complete the flow-chart below."
    };
    return map[type] || "Complete the questions below.";
}

function normalizeReadingQuestion(question = {}) {
    const number = Number(question.number || question.questionNumber || question.question_number || question.no);
    return {
        ...question,
        number: Number.isFinite(number) ? number : question.number
    };
}

function questionNumbersFromGroup(group = {}) {
    const explicitNumbers = firstArray(group.questionNumbers, group.question_numbers, group.numbers);
    if (explicitNumbers.length) {
        return explicitNumbers.map(Number).filter(Number.isFinite);
    }

    const range = group.questionRange || group.range;
    if (Array.isArray(range) && range.length >= 2) {
        const start = Number(range[0]);
        const end = Number(range[1]);
        if (Number.isFinite(start) && Number.isFinite(end)) {
            return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
        }
    }

    if (range && typeof range === "object") {
        const start = Number(range.start || range.from || range.first);
        const end = Number(range.end || range.to || range.last);
        if (Number.isFinite(start) && Number.isFinite(end)) {
            return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
        }
    }

    if (typeof range === "string") {
        const matches = range.match(/\d+/g) || [];
        const start = Number(matches[0]);
        const end = Number(matches[1] || matches[0]);
        if (Number.isFinite(start) && Number.isFinite(end)) {
            return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
        }
    }

    return [];
}

function groupManualQuestions(questions) {
    const groups = [];

    (questions || []).map(normalizeReadingQuestion).forEach((question) => {
        const last = groups[groups.length - 1];
        if (!last || last.type !== question.type) {
            groups.push({
                type: question.type || "sentence_completion",
                questions: [question]
            });
        } else {
            last.questions.push(question);
        }
    });

    return groups.map((group) => {
        const first = group.questions[0]?.number;
        const last = group.questions[group.questions.length - 1]?.number;
        return {
            ...group,
            instructionTitle: first === last ? `Question ${first}` : `Questions ${first}-${last}`,
            instructionText: questionTypeInstruction(group.type)
        };
    });
}

function hydrateGroups(groups, questions) {
    const normalizedQuestions = (questions || []).map(normalizeReadingQuestion);
    const byNumber = new Map(normalizedQuestions.map((question) => [Number(question.number), question]));
    return (groups || []).map((group) => {
        const embeddedQuestions = Array.isArray(group.questions)
            ? group.questions.map(normalizeReadingQuestion)
            : [];
        const numbers = questionNumbersFromGroup(group);

        return {
            ...group,
            questionNumbers: embeddedQuestions.length
                ? embeddedQuestions.map((question) => question.number)
                : numbers,
            questions: embeddedQuestions.length
                ? embeddedQuestions
                : numbers.map((number) => byNumber.get(number)).filter(Boolean)
        };
    });
}

function paragraphsFromText(text) {
    return String(text || "")
        .split(/\n{2,}/)
        .map((value) => {
            const trimmed = value.trim();
            const letterMatch = trimmed.match(/^([A-Z])(?:[\).]|\s+)\s*/);
            return {
                letter: letterMatch?.[1] || null,
                text: letterMatch ? trimmed.slice(letterMatch[0].length) : trimmed,
                html: ""
            };
        })
        .filter((paragraph) => paragraph.text);
}

function stripHtmlToText(html) {
    return String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>|<\/div>|<\/section>|<\/article>|<\/h[1-6]>|<\/li>/gi, "\n\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+\n/g, "\n")
        .replace(/\n\s+/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function readingPassageObject(source = {}) {
    const value = source.readingPassage || source.reading_passage || source.passage;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function readingPassageString(source = {}) {
    const value = source.readingPassage || source.reading_passage || source.passage;
    return typeof value === "string" ? value : "";
}

function passageHtmlFromSource(source = {}) {
    const nested = readingPassageObject(source);
    const value = [
        source.passageHtml,
        source.readingPassageHtml,
        source.readingHtml,
        source.html,
        source.contentHtml,
        nested?.passageHtml,
        nested?.readingPassageHtml,
        nested?.readingHtml,
        nested?.html,
        nested?.contentHtml
    ].find((item) => typeof item === "string" && item.trim()) || "";
    if (value) return String(value);
    const content = String([
        source.content,
        nested?.content,
        readingPassageString(source)
    ].find((item) => typeof item === "string" && item.trim()) || "").trim();
    return /<\w+[\s>]/.test(content) ? content : "";
}

function passageTextFromSource(source = {}) {
    const nested = readingPassageObject(source);
    const value = [
        source.passageText,
        source.readingText,
        source.passage,
        source.text,
        source.content,
        nested?.passageText,
        nested?.readingText,
        nested?.passage,
        nested?.text,
        nested?.content,
        readingPassageString(source)
    ].find((item) => typeof item === "string" && item.trim()) || "";
    if (value && !/<\w+[\s>]/.test(String(value))) {
        return String(value);
    }
    return stripHtmlToText(value || passageHtmlFromSource(source));
}

function passageParagraphsFromSource(source = {}) {
    const nested = readingPassageObject(source);
    const paragraphs = Array.isArray(source.paragraphs) && source.paragraphs.length
        ? source.paragraphs
        : (Array.isArray(nested?.paragraphs) && nested.paragraphs.length ? nested.paragraphs : null);

    if (paragraphs) {
        return paragraphs;
    }

    const html = passageHtmlFromSource(source);
    const text = passageTextFromSource(source);

    return html
        ? [{ letter: null, html, text }]
        : paragraphsFromText(text);
}

function firstArray(...values) {
    return values.find((value) => Array.isArray(value) && value.length) || [];
}

function questionGroupsFromSource(source = {}, fallbackGroups = [], fallbackQuestions = []) {
    const nested = readingPassageObject(source) || {};
    const questionSource = firstArray(source.questions, nested.questions, fallbackQuestions)
        .map(normalizeReadingQuestion);
    const groupSource = firstArray(
        source.questionGroups,
        source.groups,
        source.question_sections,
        source.questionSections,
        nested.questionGroups,
        nested.groups
    );

    if (groupSource.length) {
        return hydrateGroups(groupSource, questionSource);
    }

    if (questionSource.length) {
        return groupManualQuestions(questionSource);
    }

    return fallbackGroups;
}

function flatQuestionsFromGroups(groups = []) {
    return groups.flatMap((group) => group.questions || []);
}

function isUsableReadingPassage(passage) {
    const hasText = Boolean(String(passage?.passageText || passage?.text || "").trim());
    const hasParagraphs = (passage?.paragraphs || []).some((paragraph) =>
        String(paragraph?.text || paragraph?.html || "").trim()
    );
    const hasGroups = (passage?.questionGroups || []).some((group) =>
        (group.questions || []).length || (group.questionNumbers || []).length || (group.questionRange || []).length
    );
    const hasQuestions = (passage?.questions || []).length > 0;

    return hasText || hasParagraphs || hasGroups || hasQuestions;
}

function normalizeGenericReadingPassage(source = {}, index = 0, fallbackGroups = [], fallbackQuestions = []) {
    const number = Number(source.number || source.part || source.section || index + 1) || index + 1;
    const text = passageTextFromSource(source);
    const groups = questionGroupsFromSource(source, fallbackGroups, fallbackQuestions);
    const questions = flatQuestionsFromGroups(groups);

    return {
        id: source.id || source.passageId || `reading-passage-${number}`,
        number,
        title: source.title || source.passageTitle || source.name || `Reading Passage ${number}`,
        subtitle: source.subtitle || source.passageSubtitle || "",
        subtitleStrong: Boolean(source.subtitleStrong),
        displayLabel: source.displayLabel || `Reading Passage ${number}`,
        text,
        passageText: text,
        paragraphs: passageParagraphsFromSource(source),
        vocabulary: normalizeVocabularyEntries(source.vocabulary),
        questions,
        questionGroups: groups
    };
}

function splitFullManualPassages(test, groups) {
    const source = String(test.passage || test.passageText || "");
    const markers = [...source.matchAll(/READING PASSAGE\s+(\d+)\s*:\s*([^\n]+)/gi)];

    if (markers.length < 2) {
        return null;
    }

    const ranges = [[1, 13], [14, 26], [27, 40]];

    return markers.map((marker, index) => {
        const number = Number(marker[1]) || index + 1;
        const title = marker[2].trim();
        const start = marker.index + marker[0].length;
        const end = index + 1 < markers.length ? markers[index + 1].index : source.length;
        const passageText = source.slice(start, end).trim();
        const [firstQuestion, lastQuestion] = ranges[index] || [1, 40];
        const questionGroups = groups
            .map((group) => {
                const questions = (group.questions || []).filter((question) => {
                    const questionNumber = Number(question.number);
                    return questionNumber >= firstQuestion && questionNumber <= lastQuestion;
                });

                return {
                    ...group,
                    questionNumbers: questions.map((question) => question.number),
                    questions
                };
            })
            .filter((group) => group.questions.length);

        return {
            number,
            title,
            displayLabel: `Reading Passage ${number}`,
            passageText,
            paragraphs: paragraphsFromText(passageText),
            questionGroups
        };
    }).filter((passage) => passage.passageText || passage.questionGroups.length);
}

function questionGroupsForRange(groups, firstQuestion, lastQuestion) {
    return groups
        .map((group) => {
            const questions = (group.questions || []).filter((question) => {
                const questionNumber = Number(question.number);
                return questionNumber >= firstQuestion && questionNumber <= lastQuestion;
            });

            return {
                ...group,
                questionNumbers: questions.map((question) => question.number),
                questions
            };
        })
        .filter((group) => group.questions.length);
}

function splitDelimitedFullManualPassages(test, groups) {
    const source = String(test.passage || test.passageText || "");
    const chunks = source
        .split(/\n\s*-{3,}\s*\n/g)
        .map((chunk) => chunk.trim())
        .filter(Boolean);

    if (chunks.length < 2) {
        return null;
    }

    const ranges = [[1, 13], [14, 26], [27, 40]];
    const passageTitles = Array.isArray(test.passageTitles)
        ? test.passageTitles
        : (Array.isArray(test.partTitles) ? test.partTitles : []);
    return chunks.slice(0, 3).map((passageText, index) => {
        const number = index + 1;
        const [firstQuestion, lastQuestion] = ranges[index] || [1, 40];
        const questionGroups = questionGroupsForRange(groups, firstQuestion, lastQuestion);
        const configuredTitle = passageTitles[index];
        const title = typeof configuredTitle === "string"
            ? configuredTitle.trim()
            : String(configuredTitle?.title || configuredTitle?.passageTitle || "").trim();

        return {
            number,
            title: title || `Reading Passage ${number}`,
            displayLabel: `Reading Passage ${number}`,
            passageText,
            paragraphs: paragraphsFromText(passageText),
            questionGroups
        };
    }).filter((passage) => passage.passageText || passage.questionGroups.length);
}

function collectArrayValues(...values) {
    return values.flatMap((value) => Array.isArray(value) ? value : []);
}

function readingPassageSourcesFrom(source = {}) {
    const nested = readingPassageObject(source) || {};
    return collectArrayValues(
        source.passages,
        source.readingPassages,
        source.reading_passages,
        source.sections,
        source.parts,
        nested.passages,
        nested.readingPassages,
        nested.reading_passages,
        nested.sections,
        nested.parts
    );
}

function hasReadingPassageContent(passage) {
    const hasText = Boolean(String(passage?.passageText || passage?.text || "").trim());
    const hasParagraphs = (passage?.paragraphs || []).some((paragraph) =>
        String(paragraph?.text || paragraph?.html || "").trim()
    );

    return hasText || hasParagraphs;
}

function fallbackGroupsForPassage(groups, index, total) {
    if (!groups.length) {
        return [];
    }

    if (total > 1) {
        const ranges = [[1, 13], [14, 26], [27, 40]];
        const [firstQuestion, lastQuestion] = ranges[index] || [1, 40];
        return questionGroupsForRange(groups, firstQuestion, lastQuestion);
    }

    return groups;
}

function normalizePassageList(sources = [], topGroups = [], topQuestions = []) {
    return sources
        .map((item, index) => {
            const ownGroups = questionGroupsFromSource(item, [], topQuestions);
            const groups = ownGroups.length
                ? ownGroups
                : fallbackGroupsForPassage(topGroups, index, sources.length);
            return normalizeGenericReadingPassage({
                ...item,
                questionGroups: groups,
                questions: firstArray(item.questions, flatQuestionsFromGroups(groups))
            }, index, groups, topQuestions);
        })
        .filter(isUsableReadingPassage);
}

function normalizeRichReadingPassages(source = {}, topGroups = [], topQuestions = []) {
    if (!Array.isArray(source.richPassages) || !source.richPassages.length) {
        return [];
    }

    return source.richPassages
        .map((richPassage, index) => {
            const ownGroups = questionGroupsFromSource(richPassage, [], topQuestions);
            const groups = ownGroups.length
                ? ownGroups
                : fallbackGroupsForPassage(topGroups, index, source.richPassages.length);

            return normalizeGenericReadingPassage({
                ...richPassage,
                id: richPassage.id || `${source.id || "reading"}-rich-passage-${index + 1}`,
                number: Number(richPassage.number) || index + 1,
                title: richPassage.title || richPassage.passageTitle || `Reading Passage ${index + 1}`,
                displayLabel: richPassage.displayLabel || `Reading Passage ${index + 1}`,
                questionGroups: groups,
                questions: firstArray(richPassage.questions, flatQuestionsFromGroups(groups))
            }, index, groups, topQuestions);
        })
        .filter(isUsableReadingPassage);
}

function firstReadingPassageList(...lists) {
    const candidates = lists
        .map((list) => (Array.isArray(list) ? list.filter(isUsableReadingPassage) : []))
        .filter((list) => list.length);
    const withContent = candidates.find((list) => list.some(hasReadingPassageContent));

    return withContent || candidates[0] || [];
}

function looksLikeFullReading(source = {}, topQuestions = [], structuredPassages = []) {
    const text = String(source.passage || source.passageText || readingPassageString(source) || "");
    return String(source.part) === "full"
        || structuredPassages.length > 1
        || topQuestions.some((question) => Number(question.number) > 26)
        || /READING PASSAGE\s+\d+/i.test(text)
        || (Array.isArray(source.passageTitles) && source.passageTitles.length > 1)
        || (Array.isArray(source.partTitles) && source.partTitles.length > 1);
}

function finalizeReadingPassages(passages = [], testId = "reading") {
    return passages.map((passage, index) => {
        const number = Number(passage.number || passage.part || index + 1) || index + 1;
        const passageText = String(passage.passageText || passage.text || "").trim();
        const paragraphs = Array.isArray(passage.paragraphs) && passage.paragraphs.length
            ? passage.paragraphs
            : paragraphsFromText(passageText);
        const questionGroups = (passage.questionGroups || []).map((group) => {
            const questions = (group.questions || []).map(normalizeReadingQuestion);
            return {
                ...group,
                questionNumbers: questions.length
                    ? questions.map((question) => question.number)
                    : questionNumbersFromGroup(group),
                questions
            };
        });
        const questions = passage.questions?.length
            ? passage.questions.map(normalizeReadingQuestion)
            : flatQuestionsFromGroups(questionGroups);

        return {
            ...passage,
            id: passage.id || `${testId}-passage-${number}`,
            number,
            title: passage.title || passage.passageTitle || `Reading Passage ${number}`,
            displayLabel: passage.displayLabel || `Reading Passage ${number}`,
            text: passageText,
            passageText,
            paragraphs,
            questions,
            questionGroups
        };
    });
}

function normalizeReadingTest(test = {}, options = {}) {
    const readingSource = test.reading && typeof test.reading === "object" && !Array.isArray(test.reading)
        ? test.reading
        : {};
    const source = Object.keys(readingSource).length
        ? { ...test, ...readingSource }
        : test;
    const topQuestions = firstArray(source.questions, test.questions).map(normalizeReadingQuestion);
    const topGroups = questionGroupsFromSource(source, [], topQuestions);
    const allTopQuestions = topQuestions.length ? topQuestions : flatQuestionsFromGroups(topGroups);
    const structuredPassages = normalizePassageList(readingPassageSourcesFrom(source), topGroups, allTopQuestions);
    const richPassages = normalizeRichReadingPassages(source, topGroups, allTopQuestions);
    const isFullReading = options.fullTest || looksLikeFullReading(source, allTopQuestions, structuredPassages);
    const fullManualPassages = isFullReading
        ? (splitFullManualPassages(source, topGroups) || splitDelimitedFullManualPassages(source, topGroups) || [])
        : [];
    const passageNumber = Number(source.part) || Number(source.number) || 1;
    const fallbackPassage = normalizeGenericReadingPassage({
        ...source,
        id: source.id ? `${source.id}-passage-${passageNumber}` : undefined,
        number: passageNumber,
        title: source.passageTitle || source.title || `Reading Passage ${passageNumber}`,
        displayLabel: `Reading Passage ${passageNumber}`,
        questionGroups: topGroups,
        questions: allTopQuestions
    }, passageNumber - 1, topGroups, allTopQuestions);
    const passages = firstReadingPassageList(
        richPassages,
        structuredPassages,
        fullManualPassages,
        [fallbackPassage]
    );
    const normalizedPassages = finalizeReadingPassages(passages, test.id || source.id || "reading");

    return {
        id: test.id || source.id,
        title: test.title || source.title || "IELTS Academic Reading",
        part: source.part || test.part || (normalizedPassages.length > 1 ? "full" : passageNumber),
        images: test.images || source.images || [],
        vocabulary: normalizeVocabularyEntries(test.vocabulary || source.vocabulary),
        passages: normalizedPassages
    };
}

function normalizeManualTest(test) {
    return normalizeReadingTest(test);
}

function normalizeFullTest(test) {
    if (skill === "listening") {
        return {
            id: test.id,
            title: test.title || "IELTS Listening",
            images: test.images || [],
            passages: (test.listening?.sections || []).map((section) => ({
                number: section.number,
                title: section.title || `Listening Section ${section.number}`,
                displayLabel: `Listening Section ${section.number}`,
                audio: section.audio || test.listening?.audio || "",
                passageText: "",
                paragraphs: [{
                    letter: null,
                    html: section.sectionHtml || "",
                    text: "Listen and answer the questions."
                }],
                questionGroups: section.questionGroups || []
            }))
        };
    }

    return normalizeReadingTest(test, { fullTest: true });
}

function collectQuestions(passages) {
    return (passages || []).flatMap((passage) =>
        (passage.questionGroups || []).flatMap((group) => group.questions || [])
    ).sort((a, b) => Number(a.number) - Number(b.number));
}

function countWords(passage) {
    return String(passage?.passageText || passage?.paragraphs?.map((paragraph) => paragraph.text).join(" ") || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .length;
}

function scoreBand(correct, total, resultSkill = skill) {
    if (ResultUtils.estimateBand) {
        return ResultUtils.estimateBand(correct, total, resultSkill);
    }

    const scaledCorrect = total ? Math.round((correct / total) * 40) : 0;
    const table = resultSkill === "listening"
        ? [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [6, 3.5], [4, 3], [0, 2.5]]
        : [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, "0-2"]];
    return table.find(([minimum]) => scaledCorrect >= minimum)?.[1] || "0-2";
}

function evaluateQuestionResult(question, userAnswer, acceptedOverride) {
    if (ResultUtils.evaluateAnswer) {
        return ResultUtils.evaluateAnswer(question, userAnswer, acceptedOverride);
    }

    const accepted = acceptedAnswers(acceptedOverride || question.answer);
    const isUnanswered = !normalizeAnswer(userAnswer);
    const isCorrect = !isUnanswered && accepted.map(normalizeAnswer).includes(normalizeAnswer(userAnswer));

    return {
        number: Number(question.number || question.questionNumber),
        userAnswer: String(userAnswer || "").trim(),
        correctAnswers: accepted,
        mainAnswer: accepted[0] || "",
        alternatives: accepted.slice(1),
        status: isUnanswered ? "unanswered" : (isCorrect ? "correct" : "incorrect"),
        isCorrect,
        isUnanswered
    };
}

function summarizeQuestionResults(questionResults, resultSkill = skill) {
    if (ResultUtils.summarizeResults) {
        return ResultUtils.summarizeResults(questionResults, resultSkill);
    }

    const correct = questionResults.filter((item) => item.status === "correct").length;
    const unanswered = questionResults.filter((item) => item.status === "unanswered").length;
    const total = questionResults.length;

    return {
        correct,
        incorrect: Math.max(0, total - correct - unanswered),
        unanswered,
        total,
        normalizedScore: total ? Math.round((correct / total) * 40) : 0,
        band: scoreBand(correct, total, resultSkill),
        questionResults
    };
}

function gradeReadingQuestions(questions, answers) {
    const questionResults = (questions || []).map((question) =>
        evaluateQuestionResult(question, answers[question.number])
    );

    return summarizeQuestionResults(questionResults, "reading");
}

function escapeListeningHtml(value) {
    return window.ListeningComponents?.escapeHtml
        ? window.ListeningComponents.escapeHtml(value)
        : String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

function ensureListeningStyles() {
    if (document.querySelector('link[href^="listening-template.css"]')) return;

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "listening-template.css?v=20260712-full-player-v10";
    document.head.appendChild(stylesheet);
}

async function fetchJson(url, fallbackMessage) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || fallbackMessage);
    }

    return data;
}

function questionRangeFromQuestions(questions, fallback = "Questions") {
    const numbers = (questions || []).map((question) => Number(question.number || question.questionNumber)).filter(Boolean);
    if (!numbers.length) return fallback;

    const first = Math.min(...numbers);
    const last = Math.max(...numbers);
    return first === last ? `Question ${first}` : `Questions ${first}-${last}`;
}

function listeningQuestionText(question) {
    const number = Number(question.number || question.questionNumber);
    const raw = sanitizeLabel(String(question.stemHtml || question.question || question.text || `Question ${number}`).trim());
    const blankPattern = /_{3,}|<span[^>]*class=["'][^"']*ielts-blank[^"']*["'][^>]*>.*?<\/span>/i;

    if (/\{\{\d{1,2}\}\}/.test(raw)) {
        return raw;
    }

    if (blankPattern.test(raw)) {
        return raw.replace(blankPattern, `{{${number}}}`);
    }

    return `${raw} {{${number}}}`;
}

/** Strip __(...)__ formatting artifacts that may appear in imported data */
function sanitizeLabel(str) {
    if (!str || typeof str !== "string") return str || "";
    let s = str;
    // Replace  __(  and  )__  with a single space to preserve word boundaries
    s = s.replace(/\s*__\(\s*/g, " ");
    s = s.replace(/\s*\)__\s*/g, " ");
    // Fix punctuation spacing: " ." → "."
    s = s.replace(/\s+([.,;:!?])/g, "$1");
    return s.trim();
}

function normalizeListeningOption(option) {
    if (typeof option === "object" && option !== null) {
        const label = sanitizeLabel(String(option.text || option.label || option.value || "").trim());
        const letter = String(option.letter || option.value || label.match(/^([A-Za-z0-9ivx]+)[\).:\s]/)?.[1] || "").trim();
        const rawText = option.text ? sanitizeLabel(option.text) : label.replace(new RegExp(`^${letter}[\\).:\\s-]*`, "i"), "").trim() || label;
        const text = rawText.replace(/^[-–—]\s*/, "").trim();
        return { letter, text };
    }

    const label = sanitizeLabel(String(option || "").trim());
    const letter = label.match(/^([A-Za-z0-9ivx]+)[\).:\s-]/)?.[1] || "";
    const text = letter ? label.slice(letter.length).replace(/^[\).:\s-]+/, "").replace(/^[-–—]\s*/, "").trim() : label;
    return { letter, text: text || label };
}

function uniqueListeningOptions(options) {
    const seen = new Set();
    return (options || [])
        .map(normalizeListeningOption)
        .filter((option) => {
            const key = option.letter || option.text;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function listeningGroupImageUrl(group, images = []) {
    if (group.imageUrl || group.image || group.imageSrc) {
        return group.imageUrl || group.image || group.imageSrc;
    }

    const imageIds = group.imageIds || group.images || [];
    const match = (images || []).find((image) => imageIds.includes(image.id || image.imageId || image.name));
    return match?.url || match?.src || match?.path || "";
}

function listeningBlocksFromQuestionGroup(group, index, images = []) {
    const type = String(group.type || "").toLowerCase().replace(/[\s-]+/g, "_");
    const questions = group.questions || [];
    const questionRange = group.instructionTitle || group.questionRange || questionRangeFromQuestions(questions);
    const instruction = sanitizeLabel(group.instructionText || group.instruction || group.rule || "");
    const id = group.id || `listening-group-${index + 1}`;

    if (type === "matching" || type === "map_labelling" || type === "map_labeling") {
        const questionOptions = questions.find((question) => (question.options || []).length)?.options || [];
        return [{
            id,
            type: "matching",
            title: group.title || group.question || "",
            questionRange,
            instruction,
            imageUrl: listeningGroupImageUrl(group, images),
            options: uniqueListeningOptions(group.options || group.matchingOptions || questionOptions),
            content: group.content || group.flowchartContent || [],
            questions: questions.map((question) => ({
                questionNumber: Number(question.number || question.questionNumber),
                text: sanitizeLabel(question.text || question.question || `Label ${question.number || question.questionNumber}`)
            }))
        }];
    }

    if (type === "multiple_choice") {
        return [{
            id,
            type: "multiple_choice",
            questionRange,
            instruction,
            questions: questions.map((question) => ({
                number: Number(question.number || question.questionNumber),
                questionNumber: Number(question.number || question.questionNumber),
                question: sanitizeLabel(question.question || question.text || ""),
                text: sanitizeLabel(question.text || question.question || ""),
                options: uniqueListeningOptions(question.options || group.options)
            }))
        }];
    }

    if (type === "multi_select" || type === "multiple_select") {
        const questionOptions = questions.find((question) => (question.options || []).length)?.options || [];
        return [{
            id,
            type: "multiple_select",
            questionNumber: Number(questions[0]?.number || questions[0]?.questionNumber),
            answerQuestions: questions.slice(1).map((question) => ({ questionNumber: Number(question.number || question.questionNumber) })),
            questionRange,
            instruction,
            maxSelections: Number(group.maxSelections) || Math.max(2, questions.length),
            question: sanitizeLabel(group.question || questions[0]?.question || ""),
            options: uniqueListeningOptions(group.options || group.multiSelectOptions || questionOptions)
        }];
    }

    if (((type === "form_completion" || type === "table_completion") && Array.isArray(group.rows)) ||
        ((type === "note_completion" || type === "sentence_completion_inline") && Array.isArray(group.content))) {
        return [{
            ...group,
            id,
            type,
            questionRange,
            instruction
        }];
    }

    return [{
        id,
        type: "sentence_completion_inline",
        title: group.title || "",
        questionRange,
        instruction,
        content: questions.map(listeningQuestionText)
    }];
}

function answerTextFromQuestionGroups(groups) {
    return (groups || [])
        .flatMap((group) => group.questions || [])
        .map((question) => {
            const number = Number(question.number || question.questionNumber);
            const answer = String(question.answer || "").trim();
            return number && answer ? `${number}: ${answer}` : "";
        })
        .filter(Boolean)
        .join("\n");
}

function fallbackListeningTestFromFullTest(fullTest) {
    const sections = fullTest.listening?.sections || [];

    return {
        id: fullTest.id,
        title: fullTest.title || "IELTS Listening Practice",
        part: "full",
        duration: 40,
        parts: sections.map((section, index) => {
            const partNumber = Number(section.number) || index + 1;
            const groups = section.questionGroups || [];

            return {
                partNumber,
                title: section.title || `Part ${partNumber}`,
                questionRange: section.questionRange || questionRangeFromQuestions(
                    groups.flatMap((group) => group.questions || []),
                    `Questions ${(partNumber - 1) * 10 + 1}-${partNumber * 10}`
                ),
                audioUrl: section.audio || fullTest.listening?.audio || "",
                instruction: section.instruction || "",
                answerText: answerTextFromQuestionGroups(groups),
                blocks: groups.flatMap((group, groupIndex) => listeningBlocksFromQuestionGroup(group, groupIndex, fullTest.images))
            };
        })
    };
}

function normalizeFullListeningPlayerTest(fullTest, manualTest) {
    const source = manualTest && Array.isArray(manualTest.parts)
        ? manualTest
        : fallbackListeningTestFromFullTest(fullTest);
    const parts = (source.parts || []).map((part, index) => ({
        ...part,
        partNumber: Number(part.partNumber) || index + 1,
        title: part.title || `Part ${index + 1}`,
        audioUrl: part.audioUrl || part.audio || fullTest.listening?.audio || ""
    }));

    return {
        ...source,
        id: fullTest.id || source.id,
        sourceListeningTestId: source.id,
        title: fullTest.title || source.title || "IELTS Listening Practice",
        part: "full",
        duration: 40,
        headerTitle: "Full Test",
        dashboardHref: "/listeningfulltest.html",
        parts
    };
}

function parseListeningAnswerKey(test) {
    const answers = {};

    (test.parts || []).forEach((part) => {
        String(part.answerText || "")
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
                const match = line.match(/^(\d{1,2})\s*[\).:\-=\|]\s*(.+)$/);
                if (!match) return;
                answers[match[1]] = match[2]
                    .split(/\s*\|\s*/)
                    .map((answer) => answer.trim())
                    .filter(Boolean);
            });
    });

    return answers;
}

function listeningAnswerValue(root, number) {
    const namedFields = [...root.querySelectorAll(`[name="q${number}"]`)];
    const isChoiceField = namedFields.some((field) => field.matches?.('input[type="radio"], input[type="checkbox"]'));
    const selected = root.querySelector(`[name="q${number}"]:checked`);
    if (isChoiceField) return selected ? selected.value : "";

    const field = root.querySelector(`#q${number}, [name="q${number}"]`);
    return selected ? selected.value : (field?.value || "");
}

function gradeFullListeningTest(root, test) {
    const answerKey = parseListeningAnswerKey(test);
    const gradedMultipleSelectQuestions = new Set();
    const questionResults = [];

    root.querySelectorAll(".lc-multiple-select").forEach((group) => {
        const numbers = String(group.dataset.questionNumbers || "")
            .split(",")
            .map(Number)
            .filter((number) => answerKey[number]);
        const selected = (
            [...group.querySelectorAll('input[type="checkbox"]:checked')]
                .map((input) => input.value)
                .filter(Boolean)
        );
        const usedSelected = new Set();

        if (!numbers.length) return;
        numbers.forEach((number) => gradedMultipleSelectQuestions.add(number));

        numbers.forEach((number) => {
            const accepted = answerKey[number] || [];
            let selectedIndex = selected.findIndex((value, index) =>
                !usedSelected.has(index) && (
                    ResultUtils.answersMatch
                        ? ResultUtils.answersMatch(value, accepted)
                        : accepted.map(normalizeAnswer).includes(normalizeAnswer(value))
                )
            );

            if (selectedIndex === -1) {
                selectedIndex = selected.findIndex((_, index) => !usedSelected.has(index));
            }

            const userAnswer = selectedIndex >= 0 ? selected[selectedIndex] : "";
            if (selectedIndex >= 0) usedSelected.add(selectedIndex);
            questionResults.push(evaluateQuestionResult({ number }, userAnswer, accepted));
        });
    });

    Object.entries(answerKey).forEach(([number, accepted]) => {
        if (gradedMultipleSelectQuestions.has(Number(number))) return;
        questionResults.push(evaluateQuestionResult({ number }, listeningAnswerValue(root, number), accepted));
    });

    const result = summarizeQuestionResults(
        questionResults.sort((a, b) => Number(a.number) - Number(b.number)),
        "listening"
    );

    return {
        ...result,
        answerNumbers: Object.keys(answerKey).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    };
}

function showFullListeningResult(root, result, options = {}) {
    const modal = root.querySelector("[data-listening-result-modal]");
    if (!modal) return;
    const autoSubmitMessage = ResultUtils.AUTO_SUBMIT_MESSAGE || "Time is over. Your test has been submitted automatically.";

    modal.querySelector("[data-listening-result-score]").textContent = `${result.correct} / ${result.total}`;
    modal.querySelector("[data-listening-result-band]").textContent = `Estimated band: ${result.band}`;
    modal.querySelector("[data-listening-result-unanswered]").textContent =
        `${result.unanswered} unanswered question${result.unanswered === 1 ? "" : "s"}.`;
    modal.querySelector("[data-listening-result-correct]").textContent =
        `${result.correct} correct answer${result.correct === 1 ? "" : "s"}`;
    modal.querySelector("[data-listening-result-incorrect]").textContent =
        `${result.incorrect} incorrect answer${result.incorrect === 1 ? "" : "s"}`;
    const notice = modal.querySelector("[data-auto-submit-message]");
    if (notice) {
        notice.textContent = autoSubmitMessage;
        notice.classList.toggle("hidden", !options.autoSubmit);
    }
    modal.classList.remove("hidden");
}

function listeningStatusLabel(status) {
    if (status === "correct") return "Correct";
    if (status === "incorrect") return "Incorrect";
    return "Unanswered";
}

function formatReviewAnswer(value) {
    return ResultUtils.formatAnswer ? ResultUtils.formatAnswer(value) : (String(value || "").trim() || "\u2014");
}

function optionMatchesAccepted(value, accepted) {
    const answers = Array.isArray(accepted) ? accepted : [accepted];
    return ResultUtils.answersMatch
        ? ResultUtils.answersMatch(value, answers)
        : answers.map(normalizeAnswer).includes(normalizeAnswer(value));
}

function applyListeningChoiceReview(field, result) {
    const optionLabel = field.closest(".lc-choice-row");
    if (!optionLabel) return;

    const isCorrectOption = optionMatchesAccepted(field.value, result.correctAnswers || [result.mainAnswer]);
    if (isCorrectOption) {
        optionLabel.classList.add("lc-choice-row--correct");
    }
    if (field.checked && !isCorrectOption) {
        optionLabel.classList.add("lc-choice-row--incorrect");
    }
}

function applyListeningMultiSelectReview(root, result) {
    const number = Number(result.number);

    root.querySelectorAll(".lc-multiple-select").forEach((group) => {
        const numbers = String(group.dataset.questionNumbers || "").split(",").map(Number);
        if (!numbers.includes(number)) return;

        group.querySelectorAll('input[type="checkbox"]').forEach((field) => {
            field.disabled = true;
            applyListeningChoiceReview(field, result);
        });
    });
}

function applyListeningFieldReview(root, result) {
    const number = Number(result.number);
    const fields = root.querySelectorAll(`#q${number}, [name="q${number}"]`);
    const statusClass = `lc-answer-field--${result.status}`;

    fields.forEach((field) => {
        field.readOnly = true;
        field.disabled = true;
        field.classList.add(statusClass);

        if (field.matches?.('input[type="radio"], input[type="checkbox"]')) {
            applyListeningChoiceReview(field, result);
        }
    });
    applyListeningMultiSelectReview(root, result);

    const inline = root.querySelector(`[data-question="${number}"]`);
    if (inline) {
        inline.classList.add(`lc-answer-inline--${result.status}`);
        const existing = inline.querySelector(".lc-inline-correct-answer");
        if (existing) existing.remove();
        if (result.status !== "correct") {
            const hint = document.createElement("span");
            hint.className = "lc-inline-correct-answer";
            hint.textContent = `Correct: ${formatReviewAnswer(result.mainAnswer)}`;
            inline.appendChild(hint);
        }
    }
}

function renderListeningReview(root, result) {
    if (!result?.questionResults?.length) return;

    root.classList.add("lc-review-mode");
    root.querySelectorAll(".lc-answer-input, input[type='radio'], input[type='checkbox'], select, textarea").forEach((field) => {
        field.readOnly = true;
        field.disabled = true;
    });
    result.questionResults.forEach((item) => applyListeningFieldReview(root, item));

    root.querySelector(".lc-review-summary")?.remove();
    const summary = document.createElement("section");
    summary.className = "lc-review-summary";
    summary.innerHTML = `
        <div class="lc-review-summary-header">
            <span>Review answers</span>
            <h2>Question results</h2>
        </div>
        <div class="lc-review-grid">
            ${result.questionResults.map((item) => `
                <article class="lc-review-card lc-review-card--${item.status}">
                    <h3>Question ${item.number}</h3>
                    <p><strong>Your answer:</strong> ${escapeListeningHtml(formatReviewAnswer(item.userAnswer))}</p>
                    <p><strong>Correct answer:</strong> ${escapeListeningHtml(formatReviewAnswer(item.mainAnswer))}
                        ${item.alternatives?.length ? `<span class="lc-answer-alternatives"> Alternatives: ${escapeListeningHtml(item.alternatives.join(", "))}</span>` : ""}
                    </p>
                    <p><strong>Status:</strong> <span>${listeningStatusLabel(item.status)}</span></p>
                </article>
            `).join("")}
        </div>
    `;
    root.querySelector(".lc-main")?.appendChild(summary);
}

async function loadFullListeningPlayerTest() {
    if (!testId) {
        throw new Error("Missing test id");
    }

    const fullTest = await fetchJson(`/api/full-tests/${encodeURIComponent(testId)}?skill=listening`, "Could not load Listening full test");
    const manualListeningId = fullTest.manualListeningTestId || fullTest.sourceListeningTestId || "";
    let manualTest = null;

    if (manualListeningId) {
        try {
            manualTest = await fetchJson(
                `/api/listening-tests/${encodeURIComponent(manualListeningId)}`,
                "Could not load Academic Listening layout"
            );
        } catch {
            manualTest = null;
        }
    }

    return normalizeFullListeningPlayerTest(fullTest, manualTest);
}

function renderFullListeningPlayer() {
    ensureListeningStyles();

    if (!window.ListeningComponents) {
        rootElement.innerHTML = `<main class="cbt-status"><h1>Could not load test</h1><p>Academic Listening components are unavailable.</p></main>`;
        return;
    }

    rootElement.innerHTML = `<main class="cbt-status"><p>Loading IELTS Listening test...</p></main>`;
    loadFullListeningPlayerTest()
        .then((test) => {
            document.title = `${test.title || "IELTS Listening"} - Full Test`;
            rootElement.innerHTML = window.ListeningComponents.ListeningTestPage(test);
            window.ListeningComponents.bindListeningTest(rootElement);
            bindFullScreenEvents(rootElement);
            let isSubmitted = false;
            rootElement.addEventListener("listening-submit", (event) => {
                if (isSubmitted) return;
                isSubmitted = true;

                const result = gradeFullListeningTest(rootElement, test);
                const status = rootElement.querySelector(".lc-submit-status");
                const options = event.detail || {};
                const autoSubmitMessage = ResultUtils.AUTO_SUBMIT_MESSAGE || "Time is over. Your test has been submitted automatically.";
                const isAutoSubmit = Boolean(options.autoSubmit || options.auto);

                if (isMockMode) {
                    ResultUtils.stopAudioPlayers?.(rootElement);
                    ResultUtils.disableAnswerInputs?.(rootElement);
                    if (status) {
                        status.textContent = isAutoSubmit
                            ? autoSubmitMessage
                            : "Moving to the next section...";
                    }
                    notifyMockSectionComplete("listening", {
                        testId: test?.id || testId,
                        autoSubmit: isAutoSubmit,
                        result
                    });
                    return;
                }

                if (!result.total) {
                    if (status) status.textContent = "This Listening test does not have an answer key yet.";
                    return;
                }

                ResultUtils.stopAudioPlayers?.(rootElement);
                ResultUtils.disableAnswerInputs?.(rootElement);
                if (status) {
                    status.textContent = options.autoSubmit
                        ? autoSubmitMessage
                        : `Result: ${result.correct}/${result.total} correct answers.`;
                }
                rootElement._listeningResult = result;
                showFullListeningResult(rootElement, result, options);
                window.authClient?.recordTestResult({
                    type: "full-test",
                    skill: "listening",
                    title: test.title || "IELTS Listening Practice",
                    correct: result.correct,
                    total: result.total,
                    band: result.band,
                    testId: test.id || testId,
                    part: "full",
                    practiceUrl: window.location.pathname,
                    correctAnswers: result.questionResults
                        .filter((item) => item.status === "correct")
                        .map((item) => ({
                            number: item.number,
                            userAnswer: item.userAnswer,
                            correctAnswer: item.mainAnswer,
                            alternatives: item.alternatives || []
                        })),
                    wrongAnswers: result.questionResults
                        .filter((item) => item.status !== "correct")
                        .map((item) => ({
                            number: item.number,
                            userAnswer: item.userAnswer,
                            correctAnswer: item.mainAnswer,
                            alternatives: item.alternatives || [],
                            status: item.status
                        }))
                });
            });
            rootElement.addEventListener("listening-review", () => {
                renderListeningReview(rootElement, rootElement._listeningResult);
            });
        })
        .catch((error) => {
            rootElement.innerHTML = `<main class="cbt-status"><h1>Could not load test</h1><p>${escapeListeningHtml(error.message)}</p></main>`;
        });
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

function compactContextText(value, maxLength = 500) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function shortUzbekPhrase(value, maxWords = 8) {
    let text = compactContextText(value, 260)
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

function translationCacheEntryKey(selectedText, sentence) {
    return [
        simpleHash(compactContextText(selectedText, 180).toLowerCase()),
        simpleHash(compactContextText(sentence, 760).toLowerCase())
    ].join(":");
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

function normalizeVocabularyEntries(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    const seen = new Set();

    return entries
        .map((entry) => {
            const word = String(entry?.word || "").trim();
            const normalized = normalizeVocabularyWord(word);

            if (!word || !normalized || seen.has(normalized)) {
                return null;
            }

            seen.add(normalized);

            return {
                id: entry.id || normalized,
                word,
                normalized,
                phonetic: String(entry.phonetic || "").trim(),
                partOfSpeech: String(entry.partOfSpeech || entry.part_of_speech || "").trim(),
                definition: String(entry.definition || entry.englishDefinition || "").trim(),
                uzbekTranslation: String(entry.uzbekTranslation || entry.translation || "").trim(),
                example: String(entry.example || entry.exampleSentence || "").trim(),
                source: String(entry.source || "manual").trim()
            };
        })
        .filter(Boolean);
}

function buildVocabularyLookup(entries) {
    const lookup = new Map();

    normalizeVocabularyEntries(entries).forEach((entry) => {
        vocabularyCandidates(entry.word).forEach((candidate) => {
            if (!lookup.has(candidate)) {
                lookup.set(candidate, entry);
            }
        });
    });

    return lookup;
}

function normalizeVocabularyLookupRecord(data, fallback) {
    const word = String(data?.selectedText || data?.word || fallback.word || "").trim();
    const normalized = normalizeVocabularyWord(data?.normalized_word || data?.normalized || fallback.normalized || word);
    const meaningInEnglish = String(data?.meaningInEnglish || data?.english_definition || data?.definition || "").trim();
    const uzbekTranslation = shortUzbekPhrase(data?.uzbekTranslation || data?.uzbek_translation || data?.translation || "");
    const contextualMeaningUzbek = shortUzbekPhrase(data?.contextualMeaningUzbek || "");
    const sentenceTranslationUzbek = String(data?.sentenceTranslationUzbek || "").trim();

    return {
        word: word || fallback.word,
        normalized: normalized || fallback.normalized,
        selectedNormalized: fallback.selectedNormalized || fallback.normalized,
        phonetic: String(data?.phonetic || "").trim(),
        partOfSpeech: String(data?.part_of_speech || data?.partOfSpeech || "").trim(),
        definition: meaningInEnglish || "Definition is not available yet.",
        meaningInEnglish,
        uzbekTranslation: contextualMeaningUzbek || uzbekTranslation || "Uzbek translation is not available yet.",
        naturalUzbekTranslation: uzbekTranslation,
        contextualMeaningUzbek,
        sentenceTranslationUzbek,
        example: String(data?.example_sentence || data?.example || "").trim(),
        source: String(data?.source || fallback.source || "api_generated").trim(),
        passageId: data?.passage_id || data?.passageId || fallback.passageId,
        sentence: fallback.sentence || "",
        paragraph: fallback.paragraph || "",
        attemptId: fallback.attemptId,
        timestamp: fallback.timestamp || new Date().toISOString(),
        isAvailable: true,
        isLoading: false
    };
}

function safeStoragePart(value, fallback = "unknown") {
    const cleaned = String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9_.:-]/g, "-")
        .slice(0, 160);
    return cleaned || fallback;
}

function readStoredAuthUser() {
    try {
        if (window.authClient?.getAuthState) {
            return window.authClient.getAuthState()?.user || null;
        }

        const raw = localStorage.getItem("ieltsmock.auth") || localStorage.getItem("ieltsAuth");
        const auth = raw ? JSON.parse(raw) : null;
        return auth?.user || null;
    } catch {
        return null;
    }
}

function getAnonymousSessionId() {
    try {
        let sessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
        if (!sessionId) {
            sessionId = `anon-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
            localStorage.setItem(ANONYMOUS_SESSION_KEY, sessionId);
        }
        return safeStoragePart(sessionId, "anonymous");
    } catch {
        return "anonymous";
    }
}

function getReadingOwnerScope() {
    const user = readStoredAuthUser();
    const userId = safeStoragePart(user?.id || user?._id || user?.memberId || "");

    if (userId !== "unknown") {
        return {
            ownerType: "user",
            ownerId: userId,
            ownerKey: `user:${userId}`
        };
    }

    const sessionId = getAnonymousSessionId();
    return {
        ownerType: "session",
        ownerId: sessionId,
        ownerKey: `session:${sessionId}`
    };
}

function readingVocabularyStorageKey(testIdValue, passageIdValue) {
    const owner = getReadingOwnerScope();
    return `${VOCABULARY_STORAGE_PREFIX}:${owner.ownerKey}:${safeStoragePart(testIdValue || testId || "practice")}:${safeStoragePart(passageIdValue || "passage")}`;
}

function readStoredVocabularyCache(testIdValue, passageIdValue) {
    try {
        return JSON.parse(localStorage.getItem(readingVocabularyStorageKey(testIdValue, passageIdValue)) || "{}") || {};
    } catch {
        return {};
    }
}

function getStoredVocabularyRecord(cacheEntryKey, testIdValue, passageIdValue) {
    const cache = readStoredVocabularyCache(testIdValue, passageIdValue);
    return cache[cacheEntryKey] || null;
}

function setStoredVocabularyRecord(cacheEntryKey, record, testIdValue, passageIdValue) {
    try {
        const cache = readStoredVocabularyCache(testIdValue, passageIdValue);
        cache[cacheEntryKey] = {
            ...record,
            cachedAt: new Date().toISOString()
        };
        localStorage.setItem(readingVocabularyStorageKey(testIdValue, passageIdValue), JSON.stringify(cache));
    } catch {}
}

function makeAttemptId(id) {
    const owner = getReadingOwnerScope();
    const key = `ieltsx_current_attempt_reading_${owner.ownerKey}_${safeStoragePart(id || "practice")}`;
    let attemptId = sessionStorage.getItem(key);
    if (!attemptId) {
        attemptId = `reading-${safeStoragePart(owner.ownerKey)}-${safeStoragePart(id || "practice")}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        sessionStorage.setItem(key, attemptId);
    }
    return attemptId;
}

function nearestVocabularyContextElement(target) {
    return target?.closest?.([
        ".cbt-passage-paragraph",
        ".cbt-paragraph-html",
        "p",
        "li",
        "blockquote",
        ".cbt-passage-copy",
        "[data-passage]",
        ".cbt-passage",
        ".reading-passage",
        ".passage-content",
        ".passage-text"
    ].join(","));
}

function extractVocabularySentence(paragraph, selectedText) {
    const text = compactContextText(paragraph, 1800);
    const selected = compactContextText(selectedText, 180);

    if (!text) {
        return selected;
    }

    const lowerText = text.toLowerCase();
    const lowerSelected = selected.toLowerCase();
    const selectedIndex = lowerSelected ? lowerText.indexOf(lowerSelected) : -1;

    if (selectedIndex === -1) {
        const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
        const fallback = sentences.find((sentence) =>
            sentence.toLowerCase().includes(lowerSelected)
        );
        return compactContextText(fallback || text, 700);
    }

    const before = text.slice(0, selectedIndex);
    const sentenceStartMark = Math.max(before.lastIndexOf("."), before.lastIndexOf("?"), before.lastIndexOf("!"));
    const start = sentenceStartMark === -1 ? 0 : sentenceStartMark + 1;
    const afterStart = selectedIndex + selected.length;
    const after = text.slice(afterStart);
    const endMatch = after.search(/[.!?](?:\s|$)/);
    const end = endMatch === -1
        ? Math.min(text.length, afterStart + 260)
        : afterStart + endMatch + 1;

    return compactContextText(text.slice(start, end), 700) || selected;
}

function vocabularyContextForTarget(target, selectedText) {
    const contextElement = nearestVocabularyContextElement(target);
    const passageElement = target?.closest?.("[data-passage-id], [data-passage], .cbt-passage, .reading-passage, .passage-content, .passage-text");
    const paragraph = compactContextText(contextElement?.textContent || passageElement?.textContent || selectedText, 1800);

    return {
        sentence: extractVocabularySentence(paragraph, selectedText),
        paragraph: paragraph || compactContextText(selectedText, 180)
    };
}

function positionVocabularyPopover(target) {
    const rect = target.getBoundingClientRect();
    const width = Math.min(320, Math.max(260, window.innerWidth - 24));
    const left = Math.min(
        Math.max(12, rect.left + (rect.width / 2) - (width / 2)),
        Math.max(12, window.innerWidth - width - 12)
    );
    const belowTop = rect.bottom + 10;
    const estimatedHeight = 230;
    const hasRoomBelow = belowTop + estimatedHeight < window.innerHeight - 12;
    const top = hasRoomBelow
        ? belowTop
        : Math.max(12, rect.top - estimatedHeight - 10);

    return { left, top, width };
}

function Timer({ seconds }) {
    const minutes = Math.floor(seconds / 60);
    const remainder = String(seconds % 60).padStart(2, "0");
    return h("div", { className: `cbt-timer${seconds <= 300 ? " warning" : ""}`, "aria-live": "polite" },
        h("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" },
            h("circle", { cx: "12", cy: "12", r: "9" }),
            h("path", { d: "M12 7v5l3 2" })
        ),
        h("div", null,
            h("strong", null, `${minutes}:${remainder}`),
            h("span", null, "TIME LEFT")
        )
    );
}

function ExamNavbar({ seconds, dashboardHref, onSubmit, showFullscreen = false, fullscreenActive = false, submitted = false, submitDisabled = false }) {
    const title = isMockMode
        ? (skill === "listening" ? "Listening" : "Reading")
        : mode === "full"
        ? "Full Test"
        : (skill === "listening" ? "Academic Listening" : "Academic Reading");
    const submitLabel = isMockMode ? "Submit Section" : "Submit";

    return h("header", { className: "cbt-header" },
        h("div", { className: "cbt-brand" },
            h("img", { className: "cbt-logo", src: "/IELTS-logo.png", alt: "IELTS" }),
            h("span", { className: "cbt-brand-divider", "aria-hidden": "true" }),
            h("span", { className: "cbt-brand-title" }, title)
        ),
        h(Timer, { seconds }),
        h("div", { className: "cbt-header-actions" },
            isMockMode
                ? h(Fragment, null,
                    h("button", {
                        className: "cbt-button cbt-button--exit",
                        type: "button",
                        "data-mock-exit": "true"
                    }, "Exit Exam"),
                    h("span", { "data-notes-anchor": "true", style: { display: "none" } })
                  )
                : h("a", { className: "cbt-button cbt-button--secondary", href: dashboardHref },
                    h("span", { className: "cbt-grid-icon", "aria-hidden": "true" }),
                    "Dashboard"
                ),
            showFullscreen
                ? h("button", {
                    className: "cbt-button cbt-button--fullscreen fullscreen-toggle-btn",
                    type: "button",
                    "data-fullscreen-toggle": "true",
                    "aria-pressed": fullscreenActive ? "true" : "false"
                }, fullscreenActive ? "Exit Full Screen" : "Full Screen")
                : null,
            h("button", {
                className: "cbt-button cbt-button--submit",
                type: "button",
                onClick: onSubmit,
                disabled: submitted || submitDisabled
            }, submitLabel)
        )
    );
}

function PassageTools({ wordCount, textScale, onTextScale, focus, onFocus }) {
    return h("footer", { className: "cbt-panel-footer cbt-passage-tools" },
        h("span", { className: "cbt-word-count" }, `Word count: ${wordCount}`),
        h("div", { className: "cbt-tool-buttons" },
            h("button", {
                type: "button",
                className: focus ? "active" : "",
                onClick: onFocus,
                "aria-pressed": focus
            }, "⌕", h("span", null, "Zoom")),
            h("button", { type: "button", onClick: onTextScale }, "Aa", h("span", null, `Text size ${textScale + 1}`))
        )
    );
}

function BottomBar({ passages, activeIndex, onSelect, onPrevious, onNext, fullMode }) {
    return null;
}

function ResultModal({ result, onClose, onReview, vocabularyCount = 0, autoSubmitted = false }) {
    if (!result) return null;

    const resultTitle = skill === "listening" ? "IELTS Listening result" : "IELTS Reading result";
    const autoSubmitMessage = ResultUtils.AUTO_SUBMIT_MESSAGE || "Time is over. Your test has been submitted automatically.";

    return h("div", { className: "cbt-modal-backdrop", onClick: onClose },
        h("section", {
            className: "cbt-result-modal",
            role: "dialog",
            "aria-modal": "true",
            onClick: (event) => event.stopPropagation()
        },
            h("button", { className: "cbt-modal-close", type: "button", onClick: onClose, "aria-label": "Close" }, "×"),
            autoSubmitted
                ? h("p", { className: "cbt-auto-submit-notice", role: "alert" }, autoSubmitMessage)
                : null,
            h("span", { className: "cbt-result-eyebrow" }, resultTitle),
            h("h2", null, `${result.correct} / ${result.total}`),
            h("p", { className: "cbt-band" }, `Estimated band: ${result.band}`),
            h("div", { className: "cbt-result-stats" },
                h("span", null, `${result.correct} correct answer${result.correct === 1 ? "" : "s"}`),
                h("span", null, `${result.incorrect} incorrect answer${result.incorrect === 1 ? "" : "s"}`),
                h("span", null, `${result.unanswered} unanswered question${result.unanswered === 1 ? "" : "s"}`)
            ),
            skill === "reading"
                ? h("p", { className: "cbt-result-vocab-count" },
                    vocabularyCount
                        ? `${vocabularyCount} unknown word${vocabularyCount === 1 ? "" : "s"} checked.`
                        : "No unknown words were checked during this test."
                )
                : null,
            h("div", { className: "cbt-result-actions" },
                h("button", { className: "cbt-button cbt-button--primary", type: "button", onClick: onReview }, "Review answers"),
                h("button", { className: "cbt-button cbt-button--secondary", type: "button", onClick: onClose }, "Close")
            )
        )
    );
}

function VocabularyPopover({ item, onClose }) {
    if (!item) return null;

    const [coords, setCoords] = useState({
        left: item.left || 0,
        top: item.top || 0,
        opacity: 0,
        placement: "below",
        arrowLeft: 24
    });
    const popoverRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        const handleClickOutside = (e) => {
            if (e.target.closest(".cbt-vocab-popover") || e.target.closest(".cbt-vocab-word")) {
                return;
            }
            onClose();
        };

        window.addEventListener("keydown", handleKeyDown);
        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [onClose]);

    useEffect(() => {
        const el = popoverRef.current;
        if (!el || !item.targetRect) return;

        const rect = item.targetRect;
        const popupWidth = 300;
        const popupHeight = el.offsetHeight;

        const container = document.querySelector(".cbt-passage-panel");
        const containerRect = container 
            ? container.getBoundingClientRect() 
            : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };

        let left = rect.left + rect.width / 2 - popupWidth / 2;
        const minLeft = containerRect.left + 16;
        const maxLeft = containerRect.right - popupWidth - 16;
        
        if (maxLeft < minLeft) {
            left = containerRect.left + (containerRect.width - popupWidth) / 2;
        } else {
            left = Math.min(Math.max(minLeft, left), maxLeft);
        }

        const gap = 8;
        const spaceAbove = rect.top - containerRect.top;
        const spaceBelow = containerRect.bottom - rect.bottom;

        let top = 0;
        let placement = "below";

        if (spaceAbove > popupHeight + 16 + gap) {
            top = rect.top - popupHeight - gap;
            placement = "above";
        } else if (spaceBelow > popupHeight + 16 + gap) {
            top = rect.bottom + gap;
            placement = "below";
        } else {
            if (spaceAbove > spaceBelow) {
                top = Math.max(containerRect.top + 16, rect.top - popupHeight - gap);
                placement = "above";
            } else {
                top = Math.min(containerRect.bottom - popupHeight - 16, rect.bottom + gap);
                placement = "below";
            }
        }

        top = Math.min(Math.max(containerRect.top + 16, top), containerRect.bottom - popupHeight - 16);

        // Arrow left placement relative to popup
        let arrowLeft = rect.left + rect.width / 2 - left - 6; // 6px is half of 12px arrow width
        arrowLeft = Math.min(Math.max(16, arrowLeft), popupWidth - 24);

        setCoords({ left, top, opacity: 1, placement, arrowLeft });
    }, [item]);

    const hasDefinition = Boolean(item.definition);
    const hasTranslation = Boolean(item.uzbekTranslation);
    const naturalTranslation = shortUzbekPhrase(item.naturalUzbekTranslation || item.uzbekTranslation || "");
    const wordType = item.partOfSpeech || (String(item.word || "").trim().includes(" ") ? "phrase" : "word");

    return h("aside", {
        ref: popoverRef,
        className: "cbt-vocab-popover",
        role: "dialog",
        "aria-label": `Vocabulary for ${item.word}`,
        style: {
            left: `${coords.left}px`,
            top: `${coords.top}px`,
            width: `300px`,
            opacity: coords.opacity,
            transition: "opacity 0.15s ease-in-out"
        }
    },
        coords.opacity > 0 ? h("div", {
            className: "cbt-vocab-arrow",
            style: coords.placement === "above"
                ? { bottom: "-7px", left: `${coords.arrowLeft}px`, transform: "rotate(225deg)" }
                : { top: "-7px", left: `${coords.arrowLeft}px`, transform: "rotate(45deg)" }
        }) : null,
        h("button", {
            className: "cbt-vocab-close",
            type: "button",
            onClick: onClose,
            "aria-label": "Close vocabulary popup"
        }, "×"),
        h("span", { className: "cbt-vocab-eyebrow" }, item.isLoading ? "Translating" : "Selected text"),
        h("h2", null, item.word),
        h("div", { className: "cbt-vocab-content" },
            item.isLoading
                ? h("p", { className: "cbt-vocab-loading" }, "Translating selected word...")
                : null,
            !item.isLoading && (hasDefinition || hasTranslation)
                ? h(Fragment, null,
                    h("dl", { className: "cbt-vocab-definition-list" },
                        h("div", null,
                            h("dt", null, "Word type"),
                            h("dd", null, wordType)
                        ),
                        h("div", null,
                            h("dt", null, "Contextual Uzbek"),
                            h("dd", null, item.uzbekTranslation || "Uzbek translation is not available yet.")
                        ),
                        h("div", null,
                            h("dt", null, "Natural Uzbek"),
                            h("dd", null, naturalTranslation || item.uzbekTranslation || "Uzbek translation is not available yet.")
                        ),
                        h("div", null,
                            h("dt", null, "Simple English"),
                            h("dd", null, item.definition || "Definition is not available yet.")
                        )
                    )
                )
                : (!item.isLoading ? h("p", { className: "cbt-vocab-fallback" }, item.errorMessage || "Definition is not available yet.") : null)
        )
    );
}

function VocabularyReview({ words }) {
    return h("section", { className: "cbt-vocab-review", "aria-labelledby": "checkedVocabularyTitle" },
        h("div", { className: "cbt-vocab-review-header" },
            h("span", { className: "cbt-vocab-review-kicker" }, "Reading review"),
            h("h2", { id: "checkedVocabularyTitle" }, "Unknown words you checked")
        ),
        words.length
            ? h("div", { className: "cbt-vocab-review-grid" },
                words.map((item) =>
                    h("article", { key: `${item.passageId || "passage"}:${item.normalized}`, className: "cbt-vocab-review-card" },
                        h("h3", null, item.word),
                        item.passageNumber || item.count > 1
                            ? h("p", { className: "cbt-vocab-review-meta" },
                                [
                                    item.passageNumber ? `Passage ${item.passageNumber}` : "",
                                    item.count > 1 ? `checked ${item.count} times` : ""
                                ].filter(Boolean).join(" · ")
                            )
                            : null,
                        item.phonetic || item.partOfSpeech
                            ? h("p", { className: "cbt-vocab-review-meta" },
                                [item.phonetic, item.partOfSpeech].filter(Boolean).join(" · ")
                            )
                            : null,
                        h("p", null,
                            h("strong", null, "English definition: "),
                            item.isLoading ? "Looking up definition..." : (item.definition || "Definition is not available yet.")
                        ),
                        h("p", null,
                            h("strong", null, "Uzbek translation: "),
                            item.isLoading ? "Looking up translation..." : (item.uzbekTranslation || "Uzbek translation is not available yet.")
                        ),
                        item.example
                            ? h("p", { className: "cbt-vocab-review-example" },
                                h("strong", null, "Example: "),
                                item.example
                            )
                            : null
                    )
                )
            )
            : h("p", { className: "cbt-vocab-review-empty" }, "No unknown words were checked during this test.")
    );
}

const injectNavigationStyles = () => {
    if (document.getElementById("ieltsmock-question-nav-styles")) return;
    const style = document.createElement("style");
    style.id = "ieltsmock-question-nav-styles";
    style.textContent = `
        .question-nav {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 48px;
            padding: 0 24px;
            background: #ffffff;
            border-top: 1px solid #e2e8f0;
            box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
            overflow-x: auto;
            width: 100%;
            height: 68px;
            box-sizing: border-box;
        }
        .question-nav-part {
            display: flex;
            align-items: center;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .question-nav-part.active {
            gap: 20px;
        }
        .question-nav-part.inactive {
            gap: 12px;
        }
        .question-nav-title {
            font-weight: 700;
            color: #000000;
            font-size: 15px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .question-nav-progress {
            font-size: 14px;
            color: #64748b;
            font-weight: 400;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .question-nav-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: nowrap;
        }
        .question-number-btn {
            width: 32px;
            height: 32px;
            min-width: 32px;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #1f2937;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 150ms ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .question-number-btn:hover {
            border-color: #3b82f6;
            background: #f8fafc;
        }
        .question-number-btn.active {
            background: #2563eb;
            color: #ffffff !important;
            border-color: #2563eb !important;
        }
        .flash {
            animation: flash 1s ease-out;
        }
        @keyframes flash {
            0% { background-color: rgba(59, 130, 246, 0.25); }
            100% { background-color: transparent; }
        }
    `;
    document.head.appendChild(style);
};

function QuestionNavigationPanel({ passages, answers, activeIndex, selectPassage, activeQuestionNumber, setActiveQuestionNumber }) {
    const passagesConfig = useMemo(() => {
        return passages.map((passage, pIdx) => {
            const pNumber = pIdx + 1;
            const questionNumbers = [];
            (passage.questionGroups || []).forEach((group) => {
                (group.questions || []).forEach((q) => {
                    const qNum = Number(q.number || q.questionNumber);
                    if (qNum && !questionNumbers.includes(qNum)) {
                        questionNumbers.push(qNum);
                    }
                });
            });
            questionNumbers.sort((a, b) => a - b);
            return {
                passageIndex: pIdx,
                passageNumber: pNumber,
                questions: questionNumbers
            };
        });
    }, [passages]);

    const handleQuestionClick = (qNumber, pIdx) => {
        if (activeIndex !== pIdx) {
            selectPassage(pIdx);
            setTimeout(() => {
                scrollToQuestion(qNumber);
            }, 150);
        } else {
            scrollToQuestion(qNumber);
        }
        setActiveQuestionNumber(qNumber);
    };

    const handlePartClick = (config) => {
        if (config.questions.length > 0) {
            const firstQ = config.questions[0];
            handleQuestionClick(firstQ, config.passageIndex);
        }
    };

    const scrollToQuestion = (number) => {
        let target = document.getElementById(`question-${number}`);
        if (!target) {
            target = [...document.querySelectorAll('[data-number]')].find(el => Number(el.dataset.number) === number);
        }
        if (!target) {
            const input = document.getElementById(`q${number}`) || 
                          document.querySelector(`[name="q${number}"]`) || 
                          document.querySelector(`[aria-label*="${number}"]`);
            if (input) {
                target = input.closest('.cbt-question') || input.closest('.questions-panel') || input;
            }
        }
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('flash');
            setTimeout(() => {
                target.classList.remove('flash');
            }, 1000);
        }
    };

    return h("div", { className: "question-nav" },
        passagesConfig.map((config) => {
            const isActivePart = config.passageIndex === activeIndex;
            const answeredCount = config.questions.filter((qNum) => {
                const ans = answers[qNum];
                return ans !== undefined && ans !== null && String(ans).trim().length > 0;
            }).length;

            if (isActivePart) {
                return h("div", { key: config.passageNumber, className: "question-nav-part active" },
                    h("span", { className: "question-nav-title" }, `Part ${config.passageNumber}`),
                    h("div", { className: "question-nav-buttons" },
                        config.questions.map((qNum) => {
                            const isActiveQ = activeQuestionNumber === qNum;
                            const btnClass = `question-number-btn${isActiveQ ? " active" : ""}`;

                            return h("button", {
                                key: qNum,
                                type: "button",
                                className: btnClass,
                                onClick: () => handleQuestionClick(qNum, config.passageIndex)
                            }, qNum);
                        })
                    )
                );
            } else {
                return h("div", {
                    key: config.passageNumber,
                    className: "question-nav-part inactive",
                    style: { cursor: "pointer" },
                    onClick: () => handlePartClick(config)
                },
                    h("span", { className: "question-nav-title" }, `Part ${config.passageNumber}`),
                    h("span", { className: "question-nav-progress" }, `${answeredCount} of ${config.questions.length}`)
                );
            }
        })
    );
}

function ReadingApp() {
    const [test, setTest] = useState(null);
    const [error, setError] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [activeQuestionNumber, setActiveQuestionNumber] = useState(1);
    const activeQuestionNumberRef = useRef(1);
    useEffect(() => {
        activeQuestionNumberRef.current = activeQuestionNumber;
    }, [activeQuestionNumber]);
    const [answers, setAnswers] = useState({});
    const [seconds, setSeconds] = useState(duration);
    const [textScale, setTextScale] = useState(1);
    const [focus, setFocus] = useState(false);
    const [result, setResult] = useState(null);
    const [showResultModal, setShowResultModal] = useState(false);
    const [reviewMode, setReviewMode] = useState(false);
    const [autoSubmitted, setAutoSubmitted] = useState(false);
    const [hasStarted, setHasStarted] = useState(isMockMode);
    const [fullscreenActive, setFullscreenActive] = useState(isFullscreenActive());
    const [checkedVocabulary, setCheckedVocabulary] = useState([]);
    const [activeVocabulary, setActiveVocabulary] = useState(null);
    const attemptIdRef = useRef(makeAttemptId(testId));
    const isSubmittedRef = useRef(false);
    const checkedVocabularyRef = useRef([]);
    const vocabularyCacheRef = useRef(new Map());
    const vocabularyRequestsRef = useRef(new Map());
    const passagePanelRef = useRef(null);
    const questionsPanelRef = useRef(null);

    useEffect(() => {
        injectNavigationStyles();
    }, []);

    useEffect(() => {
        if (!testId) {
            const missingIdError = new Error("Missing test id");
            console.error("[Mock Reading] load failed:", missingIdError);
            setError(missingIdError.message);
            notifyMockSectionError(skill, missingIdError);
            return;
        }

        const endpoint = mode === "full"
            ? `/api/full-tests/${encodeURIComponent(testId)}?skill=${encodeURIComponent(skill)}`
            : `/api/reading-tests/${encodeURIComponent(testId)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), READING_LOAD_TIMEOUT_MS);

        fetch(endpoint, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal
        })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || "Could not load test");
                return data;
            })
            .then((data) => {
                const normalized = mode === "full" ? normalizeFullTest(data) : normalizeManualTest(data);
                document.title = skill === "listening"
                    ? `${normalized.title || "IELTS Listening"} - Listening`
                    : `${normalized.title || "IELTS Academic Reading"} - Reading`;
                setTest(normalized);
            })
            .catch((loadError) => {
                const error = loadError.name === "AbortError"
                    ? new Error(`${skill === "listening" ? "Listening" : "Reading"} test could not be loaded. Please check test data or try again.`)
                    : loadError;
                console.error("[Mock Reading] load failed:", error);
                setError(error.message);
                notifyMockSectionError(skill, error);
            })
            .finally(() => clearTimeout(timeoutId));

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, []);

    useEffect(() => {
        if (test?.id) {
            notifyMockSectionReady(skill);
        }
    }, [test?.id]);

    useEffect(() => {
        if (!hasStarted || result || isSubmittedRef.current) return undefined;
        const timerId = setInterval(() => {
            setSeconds((value) => Math.max(0, value - 1));
        }, 1000);
        return () => clearInterval(timerId);
    }, [hasStarted, result]);

    useEffect(() => {
        if (seconds <= 0 && test && !result && !isSubmittedRef.current) {
            handleTimeExpired();
        }
    }, [seconds, test]);

    useEffect(() => {
        if (test?.part === "full" && mode !== "full") {
            setSeconds(60 * 60);
        }
    }, [test?.part]);

    useEffect(() => {
        if (!test?.id) return;
        attemptIdRef.current = makeAttemptId(test.id);
        checkedVocabularyRef.current = [];
        vocabularyCacheRef.current = new Map();
        vocabularyRequestsRef.current = new Map();
        setCheckedVocabulary([]);
        setActiveVocabulary(null);
        setResult(null);
        setShowResultModal(false);
        setReviewMode(false);
        setAutoSubmitted(false);
        setHasStarted(isMockMode);
        setSeconds(test?.part === "full" && mode !== "full" ? 60 * 60 : duration);
        isSubmittedRef.current = false;
    }, [test?.id]);

    useEffect(() => {
        checkedVocabularyRef.current = checkedVocabulary;
    }, [checkedVocabulary]);

    useEffect(() => {
        if (!activeVocabulary) return undefined;

        const close = () => setActiveVocabulary(null);
        const panel = passagePanelRef.current;

        panel?.addEventListener("scroll", close, { passive: true });
        window.addEventListener("resize", close);

        return () => {
            panel?.removeEventListener("scroll", close);
            window.removeEventListener("resize", close);
        };
    }, [activeVocabulary]);

    useEffect(() => {
        if (result) {
            setActiveVocabulary(null);
        }
    }, [result]);

    const passages = test?.passages || [];
    const passage = passages[activeIndex] || passages[0];
    const isFullTest = mode === "full" || test?.part === "full" || passages.length > 1;
    const enableVocabulary = skill === "reading" && !isFullTest;
    const canUseVocabulary = enableVocabulary && !result;
    const questions = useMemo(() => collectQuestions(passages), [passages]);
    const currentQuestions = useMemo(() =>
        collectQuestions(passage ? [passage] : []), [passage]
    );

    useEffect(() => {
        if (skill !== "reading" || isFullTest) return undefined;
        const timer = window.setTimeout(() => {
            console.log("Reading translation initialized");
            if (typeof window.initializeReadingTranslation === "function") {
                window.initializeReadingTranslation();
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [skill, test?.id, activeIndex, hasStarted, isFullTest]);

    useEffect(() => {
        if (!isFullTest) return undefined;

        const syncFullscreenState = () => setFullscreenActive(isFullscreenActive());
        bindFullScreenEvents(rootElement);
        syncFullscreenState();
        document.addEventListener(FULLSCREEN_STATE_EVENT, syncFullscreenState);

        return () => {
            document.removeEventListener(FULLSCREEN_STATE_EVENT, syncFullscreenState);
        };
    }, [isFullTest, test?.id]);

    useEffect(() => {
        const container = questionsPanelRef.current;
        if (!container || !hasStarted) return undefined;

        const handleScroll = () => {
            const containerRect = container.getBoundingClientRect();
            const containerCenter = containerRect.top + containerRect.height / 2;

            const questionElements = [...container.querySelectorAll('[id^="question-"]')];
            if (!questionElements.length) return;

            let closestQuestionNumber = null;
            let minDistance = Infinity;

            questionElements.forEach((el) => {
                const rect = el.getBoundingClientRect();
                const elementCenter = rect.top + rect.height / 2;
                const distance = Math.abs(elementCenter - containerCenter);
                if (distance < minDistance) {
                    minDistance = distance;
                    const qNum = Number(el.id.replace('question-', ''));
                    if (qNum) closestQuestionNumber = qNum;
                }
            });

            if (closestQuestionNumber && closestQuestionNumber !== activeQuestionNumberRef.current) {
                setActiveQuestionNumber(closestQuestionNumber);
            }
        };

        container.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();

        return () => {
            container.removeEventListener("scroll", handleScroll);
        };
    }, [hasStarted, activeIndex]);

    function answerQuestion(number, value) {
        if (!hasStarted || result) return;
        setAnswers((current) => ({ ...current, [number]: value }));
    }

    function selectPassage(index) {
        setActiveIndex(index);
        setActiveVocabulary(null);
        passagePanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        questionsPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }

    function addCheckedVocabulary(record, options = {}) {
        setCheckedVocabulary((current) => {
            const index = current.findIndex((item) => (
                item.passageId === record.passageId &&
                (
                    item.normalized === record.normalized ||
                    item.normalized === record.selectedNormalized ||
                    item.selectedNormalized === record.normalized ||
                    item.selectedNormalized === record.selectedNormalized
                )
            ));

            if (index === -1) {
                return [...current, { ...record, count: record.count || 1 }];
            }

            const next = [...current];
            next[index] = {
                ...next[index],
                ...record,
                timestamp: next[index].timestamp || record.timestamp,
                lastClickedAt: record.lastClickedAt || record.timestamp || new Date().toISOString(),
                count: (next[index].count || 1) + (options.increment ? 1 : 0)
            };
            return next;
        });
    }

    function vocabularyCacheKey(passageId, selectedText, sentence) {
        const owner = getReadingOwnerScope();
        return `${owner.ownerKey}:${test?.id || testId || "practice"}:${passageId || "passage"}:${translationCacheEntryKey(selectedText, sentence)}`;
    }

    async function lookupVocabulary(baseRecord) {
        const cacheEntryKey = translationCacheEntryKey(baseRecord.word, baseRecord.sentence);
        const key = vocabularyCacheKey(baseRecord.passageId, baseRecord.word, baseRecord.sentence);
        const owner = getReadingOwnerScope();
        const lookupTestId = test?.id || testId || "";
        const cached = vocabularyCacheRef.current.get(key);

        if (cached) {
            return cached;
        }

        const stored = getStoredVocabularyRecord(cacheEntryKey, lookupTestId, baseRecord.passageId);
        if (stored) {
            const record = normalizeVocabularyLookupRecord(stored, baseRecord);
            vocabularyCacheRef.current.set(key, record);
            return record;
        }

        const pending = vocabularyRequestsRef.current.get(key);
        if (pending) {
            return pending;
        }

        const request = fetch(TRANSLATE_API_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                selectedText: baseRecord.word,
                sentence: baseRecord.sentence,
                paragraph: baseRecord.paragraph,
                passageId: baseRecord.passageId,
                testId: lookupTestId,
                attemptId: baseRecord.attemptId,
                ownerType: owner.ownerType,
                sessionId: owner.ownerType === "session" ? owner.ownerId : ""
            })
        })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const error = new Error(data.error || VOCABULARY_ERROR_MESSAGE);
                    error.status = response.status;
                    error.endpoint = TRANSLATE_API_ENDPOINT;
                    error.errorCode = data.errorCode || "";
                    error.requestId = data.requestId || "";
                    throw error;
                }

                const record = normalizeVocabularyLookupRecord(data, baseRecord);
                console.log("Context translation API response received", record);
                vocabularyCacheRef.current.set(key, record);
                setStoredVocabularyRecord(cacheEntryKey, record, lookupTestId, baseRecord.passageId);
                return record;
            })
            .finally(() => {
                vocabularyRequestsRef.current.delete(key);
            });

        vocabularyRequestsRef.current.set(key, request);
        return request;
    }

    function handleVocabularyWord({ word, normalized, target }) {
        if (!canUseVocabulary || !target) {
            return;
        }

        const clickedWord = String(word || "").trim();
        const normalizedWord = normalizeVocabularyWord(normalized || clickedWord);

        if (!clickedWord || !normalizedWord) {
            return;
        }

        console.log(`Word clicked: ${normalizedWord}`);

        const rect = target.getBoundingClientRect();
        const targetRect = {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
        };

        const passageId = passage?.id || `${test?.id || testId}-passage-${passage?.number || 1}`;
        const position = positionVocabularyPopover(target);
        const context = vocabularyContextForTarget(target, clickedWord);
        const baseRecord = {
            word: clickedWord,
            normalized: normalizedWord,
            selectedNormalized: normalizedWord,
            phonetic: "",
            partOfSpeech: "",
            definition: "",
            uzbekTranslation: "",
            example: "",
            passageId: passage?.id || `${test?.id || testId}-passage-${passage?.number || 1}`,
            passageNumber: passage?.number || activeIndex + 1,
            sentence: context.sentence,
            paragraph: context.paragraph,
            attemptId: attemptIdRef.current,
            timestamp: new Date().toISOString(),
            lastClickedAt: new Date().toISOString(),
            count: 1,
            isAvailable: true,
            isLoading: true,
            source: ""
        };
        const existing = checkedVocabularyRef.current.find((item) => (
            item.passageId === passageId &&
            (item.selectedNormalized === normalizedWord || item.normalized === normalizedWord) &&
            item.sentence === context.sentence
        ));

        if (existing) {
            const timestamp = new Date().toISOString();
            addCheckedVocabulary({ ...existing, selectedNormalized: normalizedWord, lastClickedAt: timestamp }, { increment: true });
            setActiveVocabulary({
                ...existing,
                selectedNormalized: normalizedWord,
                count: (existing.count || 1) + 1,
                lastClickedAt: timestamp,
                targetRect,
                ...position
            });
            return;
        }

        setActiveVocabulary({ ...baseRecord, targetRect, ...position });
        addCheckedVocabulary(baseRecord);
        lookupVocabulary(baseRecord)
            .then((record) => {
                const finalRecord = {
                    ...baseRecord,
                    ...record,
                    selectedNormalized: normalizedWord,
                    isLoading: false
                };

                addCheckedVocabulary(finalRecord);
                setActiveVocabulary((current) => (
                    current?.attemptId === baseRecord.attemptId &&
                    current?.selectedNormalized === normalizedWord
                        ? { ...finalRecord, targetRect, ...position }
                        : current
                ));
            })
            .catch((error) => {
                console.error("Reading vocabulary translation failed", {
                    message: error?.message || String(error),
                    endpoint: error?.endpoint || TRANSLATE_API_ENDPOINT,
                    status: error?.status || null,
                    errorCode: error?.errorCode || "",
                    requestId: error?.requestId || "",
                    selectedText: clickedWord,
                    passageId
                });
                const fallbackRecord = {
                    ...baseRecord,
                    definition: "",
                    uzbekTranslation: "",
                    errorMessage: VOCABULARY_ERROR_MESSAGE,
                    isLoading: false,
                    isAvailable: false
                };

                addCheckedVocabulary(fallbackRecord);
                setActiveVocabulary((current) => (
                    current?.attemptId === baseRecord.attemptId &&
                    current?.selectedNormalized === normalizedWord
                        ? { ...fallbackRecord, targetRect, ...position }
                        : current
                ));
            });
    }

    function handleTimeExpired() {
        autoSubmitTest();
    }

    function autoSubmitTest() {
        submit({ auto: true });
    }

    function submit(options = {}) {
        const isAutoSubmit = Boolean(options.auto);
        if (!hasStarted && !isAutoSubmit) return;
        if (isSubmittedRef.current) return;
        isSubmittedRef.current = true;
        setAutoSubmitted(isAutoSubmit);

        if (isMockMode) {
            notifyMockSectionComplete(skill === "listening" ? "listening" : "reading", {
                testId: test?.id || testId,
                autoSubmit: isAutoSubmit,
                answers,
                deferred: true
            });
            return;
        }

        if (isAutoSubmit) {
            setSeconds(0);
            ResultUtils.stopAudioPlayers?.(rootElement);
            ResultUtils.disableAnswerInputs?.(rootElement);
        }

        const nextResult = gradeReadingQuestions(questions, answers);
        setResult(nextResult);
        setShowResultModal(true);
        setReviewMode(false);

        window.authClient?.recordTestResult({
            type: skill === "listening" ? "Listening" : "Reading",
            title: test?.title || "IELTS Academic Reading",
            correct: nextResult.correct,
            total: nextResult.total,
            band: nextResult.band,
            testId: test?.id || testId,
            part: isFullTest ? "full" : passage?.number,
            attemptId: skill === "reading" ? attemptIdRef.current : undefined,
            vocabulary: skill === "reading" ? checkedVocabulary : undefined
        });

        notifyMockSectionComplete(skill === "listening" ? "listening" : "reading", {
            testId: test?.id || testId,
            autoSubmit: isAutoSubmit,
            answers,
            result: nextResult
        });
    }

    if (error) {
        return h("main", { className: "cbt-status" }, h("h1", null, "Could not load test"), h("p", null, error));
    }
    if (!test) {
        return h("main", { className: "cbt-status" }, h("p", null, `Loading IELTS ${skill === "listening" ? "Listening" : "Reading"} test...`));
    }
    if (!passages.length) {
        return h("main", { className: "cbt-status" },
            h("h1", null, skill === "listening" ? "No listening section found" : "No reading passage found"),
            h("p", null, skill === "listening"
                ? "The uploaded test did not contain a parsed listening section."
                : "The uploaded test did not contain a parsed reading passage.")
        );
    }

    const isMock = new URLSearchParams(window.location.search).has("mockTestId") || new URLSearchParams(window.location.search).get("mockMode") === "1";
    const isFullTestOrMock = isFullTest || isMock;

    const dashboardHref = isFullTest
        ? (skill === "listening" ? "/listeningfulltest.html" : "/fulltest.html")
        : (skill === "listening" ? "/listening.html" : `/part${passage.number || 1}.html`);
    const answeredCurrent = currentQuestions.filter((question) => normalizeAnswer(answers[question.number])).length;

    return h(Fragment, null,
        h("div", { className: `cbt-shell${isFullTest ? " full-test-shell full-test-player" : ""}${!hasStarted ? " no-bottom" : ""}` },
            h("div", { className: "cbt-header-wrapper" },
                h(ExamNavbar, {
                    seconds,
                    dashboardHref,
                    onSubmit: submit,
                    showFullscreen: isFullTest && !isMockMode,
                    fullscreenActive,
                    submitted: Boolean(result),
                    submitDisabled: !hasStarted
                })
            ),
            !hasStarted
                ? h("main", { className: "cbt-stage cbt-stage--prestart" },
                    isMockMode && window.PreTestStartScreen?.renderReact
                        ? window.PreTestStartScreen.renderReact(h, { onStart: () => setHasStarted(true), message: "Start Test" })
                    : window.PreTestStartScreen?.renderReact
                        ? window.PreTestStartScreen.renderReact(h, { onStart: () => setHasStarted(true) })
                        : h("section", { className: "ieltsx-prestart-stage", "aria-label": "Start test" },
                            h("button", { className: "ieltsx-prestart-card", type: "button", onClick: () => setHasStarted(true) },
                                h("span", { className: "ieltsx-prestart-text" }, isMockMode ? "Start Test" : h(Fragment, null, "Click ", h("span", { className: "ieltsx-prestart-link" }, "here"), " to start the test"))
                            )
                        )
                )
                : h("main", { className: `cbt-stage${focus ? " focus-passage" : ""}` },
                h("section", { className: "cbt-panel cbt-passage-panel" },
                    h("div", {
                        ref: passagePanelRef,
                        className: "cbt-panel-scroll",
                        style: { "--reading-scale": 1 + (textScale * 0.08) }
                    }, h(PassageRenderer, {
                        passage,
                        enableVocabulary: canUseVocabulary,
                        activeVocabularyKey: activeVocabulary?.selectedNormalized || activeVocabulary?.normalized || "",
                        onVocabularyWord: handleVocabularyWord
                    })),
                    h(PassageTools, {
                        wordCount: countWords(passage),
                        textScale,
                        onTextScale: () => setTextScale((value) => (value + 1) % 4),
                        focus,
                        onFocus: () => setFocus((value) => !value)
                    })
                ),
                h("section", { className: "cbt-panel cbt-questions-panel" },
                    h("div", { ref: questionsPanelRef, className: "cbt-panel-scroll cbt-questions-scroll" },
                        h("div", { className: "cbt-questions-heading" },
                            h("h2", null, currentQuestions.length
                                ? `Questions ${currentQuestions[0].number}-${currentQuestions[currentQuestions.length - 1].number}`
                                : "Questions"),
                            h("p", null, "Complete the tasks below. Your answers are saved while you move between passages.")
                        ),
                        h(QuestionsPanel, {
                            groups: passage.questionGroups || [],
                            images: test.images,
                            answers,
                            onAnswer: answerQuestion,
                            reviewResults: reviewMode ? result?.questionResults : [],
                            readOnly: Boolean(result)
                        }),
                        reviewMode && result && skill === "reading"
                            ? h(VocabularyReview, { words: checkedVocabulary })
                            : null
                    ),
                    h("footer", { className: "cbt-panel-footer cbt-question-progress" },
                        h("span", null, `${answeredCurrent} of ${currentQuestions.length} answered`),
                        h("span", null, `${Object.values(answers).filter((value) => normalizeAnswer(value)).length} / ${questions.length} complete`)
                    )
                )
            ),
            hasStarted && isFullTestOrMock
                ? h(QuestionNavigationPanel, {
                    passages,
                    answers,
                    activeIndex,
                    selectPassage,
                    activeQuestionNumber,
                    setActiveQuestionNumber
                })
                : null
        ),
        h(VocabularyPopover, { item: activeVocabulary, onClose: () => setActiveVocabulary(null) }),
        showResultModal
            ? h(ResultModal, {
                result,
                autoSubmitted,
                vocabularyCount: checkedVocabulary.length,
                onClose: () => {
                    setShowResultModal(false);
                    setReviewMode(true);
                    questionsPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                },
                onReview: () => {
                    setShowResultModal(false);
                    setReviewMode(true);
                    questionsPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                }
            })
            : null
    );
}

if (mode === "full" && skill === "listening") {
    renderFullListeningPlayer();
} else {
    ReactDOM.createRoot(rootElement).render(h(ReadingApp));
}
})();
