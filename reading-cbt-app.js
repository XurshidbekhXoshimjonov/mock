/* global React, ReactDOM, IeltsTestComponents */
(() => {
const { createElement: h, Fragment, useEffect, useMemo, useRef, useState } = React;
const { PassageRenderer, QuestionsPanel } = IeltsTestComponents;

const params = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split("/").filter(Boolean);
const routeSkill = ["reading", "listening"].includes(pathParts[0]) ? pathParts[0] : "";
const routeTestSlug = routeSkill ? pathParts[1] || "" : "";
const testId = params.get("id") || routeTestSlug;
const rootElement = document.getElementById("readingAppRoot");
const mode = document.body.dataset.testMode === "full" ? "full" : "individual";
const skill = mode === "full" && (params.get("skill") === "listening" || routeSkill === "listening") ? "listening" : "reading";
const duration = mode === "full" ? (skill === "listening" ? 40 : 60) * 60 : 20 * 60;
const ResultUtils = window.IeltsResultUtils || {};

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

function groupManualQuestions(questions) {
    const groups = [];

    (questions || []).forEach((question) => {
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
    const byNumber = new Map((questions || []).map((question) => [Number(question.number), question]));
    return (groups || []).map((group) => {
        const embeddedQuestions = Array.isArray(group.questions) ? group.questions : [];
        const numbers = (group.questionNumbers || []).map(Number);

        return {
            ...group,
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

function normalizeManualTest(test) {
    const passageNumber = Number(test.part) || 1;
    const passageText = test.passage || test.passageText || "";
    const paragraphs = paragraphsFromText(passageText);
    const groups = test.questionGroups?.length
        ? hydrateGroups(test.questionGroups, test.questions)
        : groupManualQuestions(test.questions);
    const fullManualPassages = test.part === "full"
        ? splitFullManualPassages(test, groups)
        : null;

    return {
        id: test.id,
        title: test.title || "IELTS Academic Reading",
        part: test.part,
        images: test.images || [],
        vocabulary: test.part === "full" ? [] : normalizeVocabularyEntries(test.vocabulary),
        passages: fullManualPassages || [{
            id: `${test.id}-passage-${passageNumber}`,
            number: passageNumber,
            title: test.title || `Reading Passage ${passageNumber}`,
            passageText,
            paragraphs,
            questionGroups: groups
        }]
    };
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

    let passages = test.reading?.passages || [];
    const hasReadingQuestions = collectQuestions(passages).length > 0;

    if (!hasReadingQuestions) {
        const recoveredGroups = (test.listening?.sections || [])
            .flatMap((section) => section.questionGroups || []);
        const recoveredQuestions = recoveredGroups.flatMap((group) => group.questions || []);

        if (recoveredQuestions.length) {
            const ranges = recoveredQuestions.some((question) => Number(question.number) > 26)
                ? [[1, 13], [14, 26], [27, 40]]
                : [[1, 13]];
            const firstPassage = passages[0] || {};

            passages = ranges.map(([start, end], index) => ({
                ...(index === 0 ? firstPassage : {}),
                number: index + 1,
                title: index === 0
                    ? (firstPassage.title || firstPassage.passageTitle || `Reading Passage ${index + 1}`)
                    : `Reading Passage ${index + 1}`,
                passageText: index === 0
                    ? (firstPassage.passageText || "")
                    : "Passage text was not available in the parsed upload.",
                paragraphs: index === 0 && firstPassage.paragraphs?.length
                    ? firstPassage.paragraphs
                    : [{
                        letter: null,
                        html: "",
                        text: index === 0
                            ? (firstPassage.passageText || "Passage text was not available in the parsed upload.")
                            : "Passage text was not available in the parsed upload."
                    }],
                questionGroups: recoveredGroups
                    .map((group) => ({
                        ...group,
                        questions: (group.questions || []).filter((question) => {
                            const number = Number(question.number);
                            return number >= start && number <= end;
                        })
                    }))
                    .filter((group) => group.questions.length)
            })).filter((passage) => passage.questionGroups.length || passage.passageText);
        }
    }

    return {
        id: test.id,
        title: test.title || "IELTS Academic Reading",
        images: test.images || [],
        passages
    };
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
    stylesheet.href = "listening-template.css?v=1.0.22";
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

function showFullListeningResult(root, result) {
    const modal = root.querySelector("[data-listening-result-modal]");
    if (!modal) return;

    modal.querySelector("[data-listening-result-score]").textContent = `${result.correct} / ${result.total}`;
    modal.querySelector("[data-listening-result-band]").textContent = `Estimated band: ${result.band}`;
    modal.querySelector("[data-listening-result-unanswered]").textContent =
        `${result.unanswered} unanswered question${result.unanswered === 1 ? "" : "s"}.`;
    modal.querySelector("[data-listening-result-correct]").textContent =
        `${result.correct} correct answer${result.correct === 1 ? "" : "s"}`;
    modal.querySelector("[data-listening-result-incorrect]").textContent =
        `${result.incorrect} incorrect answer${result.incorrect === 1 ? "" : "s"}`;
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
            rootElement.addEventListener("listening-submit", () => {
                const result = gradeFullListeningTest(rootElement, test);
                const status = rootElement.querySelector(".lc-submit-status");

                if (!result.total) {
                    if (status) status.textContent = "This Listening test does not have an answer key yet.";
                    return;
                }

                if (status) status.textContent = `Result: ${result.correct}/${result.total} correct answers.`;
                rootElement._listeningResult = result;
                showFullListeningResult(rootElement, result);
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
    const word = String(data?.word || fallback.word || "").trim();
    const normalized = normalizeVocabularyWord(data?.normalized_word || data?.normalized || fallback.normalized || word);

    return {
        word: word || fallback.word,
        normalized: normalized || fallback.normalized,
        selectedNormalized: fallback.selectedNormalized || fallback.normalized,
        phonetic: String(data?.phonetic || "").trim(),
        partOfSpeech: String(data?.part_of_speech || data?.partOfSpeech || "").trim(),
        definition: String(data?.english_definition || data?.definition || "").trim() || "Definition is not available yet.",
        uzbekTranslation: String(data?.uzbek_translation || data?.uzbekTranslation || data?.translation || "").trim() || "Uzbek translation is not available yet.",
        example: String(data?.example_sentence || data?.example || "").trim(),
        source: String(data?.source || fallback.source || "api_generated").trim(),
        passageId: data?.passage_id || data?.passageId || fallback.passageId,
        attemptId: fallback.attemptId,
        timestamp: fallback.timestamp || new Date().toISOString(),
        isAvailable: true,
        isLoading: false
    };
}

function makeAttemptId(id) {
    const key = `ieltsx_current_attempt_reading_${id}`;
    let attemptId = sessionStorage.getItem(key);
    if (!attemptId) {
        attemptId = `reading-${String(id || "practice")}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        sessionStorage.setItem(key, attemptId);
    }
    return attemptId;
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

function Header({ seconds, dashboardHref, onSubmit }) {
    const title = mode === "full"
        ? "Full Test"
        : (skill === "listening" ? "Academic Listening" : "Academic Reading");

    return h("header", { className: "cbt-header" },
        h("div", { className: "cbt-brand" },
            h("img", { className: "cbt-logo", src: "/IELTS-logo.png", alt: "IELTS" }),
            h("span", { className: "cbt-brand-divider", "aria-hidden": "true" }),
            h("span", { className: "cbt-brand-title" }, title)
        ),
        h(Timer, { seconds }),
        h("div", { className: "cbt-header-actions" },
            h("a", { className: "cbt-button cbt-button--secondary", href: dashboardHref },
                h("span", { className: "cbt-grid-icon", "aria-hidden": "true" }),
                "Dashboard"
            ),
            h("button", { className: "cbt-button cbt-button--submit", type: "button", onClick: onSubmit }, "Submit")
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
    const showButtons = passages.length > 1;

    return h("footer", { className: "cbt-bottom-bar" },
        showButtons
            ? h("button", {
                className: "cbt-button cbt-button--outline",
                type: "button",
                disabled: activeIndex === 0,
                onClick: onPrevious
            }, "‹ Previous")
            : h("span"),
        fullMode
            ? h("nav", { className: "cbt-part-tabs", "aria-label": "Reading passages" },
                passages.map((passage, index) =>
                    h("button", {
                        key: passage.number || index,
                        type: "button",
                        className: index === activeIndex ? "active" : "",
                        onClick: () => onSelect(index)
                    }, `${skill === "listening" ? "Section" : "Part"} ${index + 1}`)
                )
            )
            : h("span"),
        showButtons
            ? h("button", {
                className: "cbt-button cbt-button--primary",
                type: "button",
                disabled: activeIndex === passages.length - 1,
                onClick: onNext
            }, "Next ›")
            : h("span")
    );
}

function ResultModal({ result, onClose, onReview, vocabularyCount = 0 }) {
    if (!result) return null;

    const resultTitle = skill === "listening" ? "IELTS Listening result" : "IELTS Reading result";

    return h("div", { className: "cbt-modal-backdrop", onClick: onClose },
        h("section", {
            className: "cbt-result-modal",
            role: "dialog",
            "aria-modal": "true",
            onClick: (event) => event.stopPropagation()
        },
            h("button", { className: "cbt-modal-close", type: "button", onClick: onClose, "aria-label": "Close" }, "×"),
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
    const meta = [item.phonetic, item.partOfSpeech].filter(Boolean).join(" · ");

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
        h("span", { className: "cbt-vocab-eyebrow" }, item.isLoading ? "Translating" : "Selected word"),
        h("h2", null, item.word),
        meta ? h("p", { className: "cbt-vocab-meta" }, meta) : null,
        h("div", { className: "cbt-vocab-content" },
            item.isLoading
                ? h("p", { className: "cbt-vocab-loading" }, "Translating selected word...")
                : null,
            !item.isLoading && (hasDefinition || hasTranslation)
                ? h(Fragment, null,
                    h("dl", { className: "cbt-vocab-definition-list" },
                        h("div", null,
                            h("dt", null, "Uzbek translation"),
                            h("dd", null, item.uzbekTranslation || "Uzbek translation is not available yet.")
                        ),
                        h("div", null,
                            h("dt", null, "English definition"),
                            h("dd", null, item.definition || "Definition is not available yet.")
                        )
                    ),
                    item.example
                        ? h("p", { className: "cbt-vocab-example" }, item.example)
                        : null
                )
                : (!item.isLoading ? h("p", { className: "cbt-vocab-fallback" }, "Definition is not available yet.") : null)
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

function ReadingApp() {
    const [test, setTest] = useState(null);
    const [error, setError] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [seconds, setSeconds] = useState(duration);
    const [textScale, setTextScale] = useState(1);
    const [focus, setFocus] = useState(false);
    const [result, setResult] = useState(null);
    const [showResultModal, setShowResultModal] = useState(false);
    const [reviewMode, setReviewMode] = useState(false);
    const [checkedVocabulary, setCheckedVocabulary] = useState([]);
    const [activeVocabulary, setActiveVocabulary] = useState(null);
    const attemptIdRef = useRef(makeAttemptId(testId));
    const checkedVocabularyRef = useRef([]);
    const vocabularyCacheRef = useRef(new Map());
    const vocabularyRequestsRef = useRef(new Map());
    const passagePanelRef = useRef(null);
    const questionsPanelRef = useRef(null);

    useEffect(() => {
        if (!testId) {
            setError("Missing test id");
            return;
        }

        const endpoint = mode === "full"
            ? `/api/full-tests/${encodeURIComponent(testId)}?skill=${encodeURIComponent(skill)}`
            : `/api/reading-tests/${encodeURIComponent(testId)}`;

        fetch(endpoint)
            .then(async (response) => {
                const data = await response.json();
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
            .catch((loadError) => setError(loadError.message));
    }, []);

    useEffect(() => {
        if (result) return undefined;
        const timerId = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
        return () => clearInterval(timerId);
    }, [result]);

    useEffect(() => {
        if (seconds === 0 && test && !result) submit();
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

    function answerQuestion(number, value) {
        if (result) return;
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

    function vocabularyCacheKey(passageId, normalizedWord) {
        return `${passageId || "passage"}:${normalizedWord}`;
    }

    async function lookupVocabulary(baseRecord) {
        const key = vocabularyCacheKey(baseRecord.passageId, baseRecord.normalized);
        const cached = vocabularyCacheRef.current.get(key);

        if (cached) {
            return cached;
        }

        const pending = vocabularyRequestsRef.current.get(key);
        if (pending) {
            return pending;
        }

        const query = new URLSearchParams({
            word: baseRecord.word,
            normalized: baseRecord.normalized,
            passageId: baseRecord.passageId,
            testId: test?.id || testId || "",
            attemptId: baseRecord.attemptId
        });
        const request = fetch(`/api/vocabulary/lookup?${query.toString()}`)
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data.error || "Could not look up vocabulary");
                }

                const record = normalizeVocabularyLookupRecord(data, baseRecord);
                vocabularyCacheRef.current.set(key, record);
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
            (item.selectedNormalized === normalizedWord || item.normalized === normalizedWord)
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
            .catch(() => {
                const fallbackRecord = {
                    ...baseRecord,
                    definition: "Definition is not available yet.",
                    uzbekTranslation: "Uzbek translation is not available yet.",
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

    function submit() {
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
    }

    if (error) {
        return h("main", { className: "cbt-status" }, h("h1", null, "Could not load test"), h("p", null, error));
    }
    if (!test) {
        return h("main", { className: "cbt-status" }, h("p", null, `Loading IELTS ${skill === "listening" ? "Listening" : "Reading"} test...`));
    }
    if (!passage) {
        return h("main", { className: "cbt-status" },
            h("h1", null, skill === "listening" ? "No listening section found" : "No reading passage found"),
            h("p", null, skill === "listening"
                ? "The uploaded test did not contain a parsed listening section."
                : "The uploaded test did not contain a parsed reading passage.")
        );
    }

    const dashboardHref = isFullTest
        ? (skill === "listening" ? "/listeningfulltest.html" : "/fulltest.html")
        : (skill === "listening" ? "/listening.html" : `/part${passage.number || 1}.html`);
    const answeredCurrent = currentQuestions.filter((question) => normalizeAnswer(answers[question.number])).length;

    return h(Fragment, null,
        h("div", { className: `cbt-shell${!isFullTest && passages.length === 1 ? " no-bottom" : ""}` },
            h(Header, { seconds, dashboardHref, onSubmit: submit }),
            h("main", { className: `cbt-stage${focus ? " focus-passage" : ""}` },
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
            isFullTest
                ? h(BottomBar, {
                    passages,
                    activeIndex,
                    onSelect: selectPassage,
                    onPrevious: () => selectPassage(activeIndex - 1),
                    onNext: () => selectPassage(activeIndex + 1),
                    fullMode: isFullTest
                })
                : null
        ),
        h(VocabularyPopover, { item: activeVocabulary, onClose: () => setActiveVocabulary(null) }),
        showResultModal
            ? h(ResultModal, {
                result,
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
