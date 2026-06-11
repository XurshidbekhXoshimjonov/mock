/* global React, ReactDOM, IeltsTestComponents */
(() => {
const { createElement: h, Fragment, useEffect, useMemo, useRef, useState } = React;
const { PassageRenderer, QuestionsPanel } = IeltsTestComponents;

const params = new URLSearchParams(window.location.search);
const testId = params.get("id");
const rootElement = document.getElementById("readingAppRoot");
const mode = document.body.dataset.testMode === "full" ? "full" : "individual";
const skill = mode === "full" && params.get("skill") === "listening" ? "listening" : "reading";
const duration = mode === "full" ? 40 * 60 : 20 * 60;

function normalizeAnswer(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function acceptedAnswers(value) {
    return String(value || "").split("|").map(normalizeAnswer).filter(Boolean);
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

    const ranges = [[1, 13], [14, 27], [28, 40]];

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

function scoreBand(correct, total) {
    const scaledCorrect = total ? Math.round((correct / total) * 40) : 0;
    const table = skill === "listening"
        ? [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [0, 0]]
        : [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [0, 0]];
    return table.find(([minimum]) => scaledCorrect >= minimum)?.[1] || 0;
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
    return `reading-${String(id || "practice")}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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
            h("img", { className: "cbt-logo", src: "IELTS-logo.png", alt: "IELTS" }),
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

function ResultModal({ result, onClose }) {
    if (!result) return null;

    return h("div", { className: "cbt-modal-backdrop", onClick: onClose },
        h("section", {
            className: "cbt-result-modal",
            role: "dialog",
            "aria-modal": "true",
            onClick: (event) => event.stopPropagation()
        },
            h("button", { className: "cbt-modal-close", type: "button", onClick: onClose, "aria-label": "Close" }, "×"),
            h("span", { className: "cbt-result-eyebrow" }, "IELTS Reading result"),
            h("h2", null, `${result.correct} / ${result.total}`),
            h("p", { className: "cbt-band" }, `Estimated band: ${result.band}`),
            h("p", null, `${result.unanswered} unanswered question${result.unanswered === 1 ? "" : "s"}.`),
            h("button", { className: "cbt-button cbt-button--primary", type: "button", onClick: onClose }, "Review answers")
        )
    );
}

function VocabularyPopover({ item, onClose }) {
    if (!item) return null;

    const hasDefinition = Boolean(item.definition);
    const hasTranslation = Boolean(item.uzbekTranslation);
    const meta = [item.phonetic, item.partOfSpeech].filter(Boolean).join(" · ");

    return h("aside", {
        className: "cbt-vocab-popover",
        role: "dialog",
        "aria-label": `Vocabulary for ${item.word}`,
        style: {
            left: `${item.left}px`,
            top: `${item.top}px`,
            width: `${item.width}px`
        }
    },
        h("button", {
            className: "cbt-vocab-close",
            type: "button",
            onClick: onClose,
            "aria-label": "Close vocabulary popup"
        }, "×"),
        h("span", { className: "cbt-vocab-eyebrow" }, item.isLoading ? "Looking up" : "Vocabulary"),
        h("h2", null, item.word),
        meta ? h("p", { className: "cbt-vocab-meta" }, meta) : null,
        item.isLoading
            ? h("p", { className: "cbt-vocab-loading" }, "Looking up definition and translation...")
            : null,
        !item.isLoading && (hasDefinition || hasTranslation)
            ? h(Fragment, null,
                h("dl", { className: "cbt-vocab-definition-list" },
                    h("div", null,
                        h("dt", null, "English definition"),
                        h("dd", null, item.definition || "Definition is not available yet.")
                    ),
                    h("div", null,
                        h("dt", null, "Uzbek translation"),
                        h("dd", null, item.uzbekTranslation || "Uzbek translation is not available yet.")
                    )
                ),
                item.example
                    ? h("p", { className: "cbt-vocab-example" }, item.example)
                    : null
            )
            : (!item.isLoading ? h("p", { className: "cbt-vocab-fallback" }, "Definition is not available yet.") : null)
    );
}

function VocabularyReview({ words }) {
    return h("section", { className: "cbt-vocab-review", "aria-labelledby": "checkedVocabularyTitle" },
        h("div", { className: "cbt-vocab-review-header" },
            h("span", { className: "cbt-vocab-review-kicker" }, "Vocabulary review"),
            h("h2", { id: "checkedVocabularyTitle" }, "Words you checked during the test")
        ),
        words.length
            ? h("div", { className: "cbt-vocab-review-grid" },
                words.map((item) =>
                    h("article", { key: item.normalized, className: "cbt-vocab-review-card" },
                        h("h3", null, item.word),
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
            : h("p", { className: "cbt-vocab-review-empty" }, "No words were checked during this attempt.")
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
            ? `/api/full-tests/${encodeURIComponent(testId)}`
            : `/api/reading-tests/${encodeURIComponent(testId)}`;

        fetch(endpoint)
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "Could not load test");
                return data;
            })
            .then((data) => {
                setTest(mode === "full" ? normalizeFullTest(data) : normalizeManualTest(data));
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
            setSeconds(40 * 60);
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
    const enableVocabulary = skill === "reading" && mode === "individual" && !isFullTest;
    const canUseVocabulary = enableVocabulary && !result;
    const questions = useMemo(() => collectQuestions(passages), [passages]);
    const currentQuestions = useMemo(() =>
        collectQuestions(passage ? [passage] : []), [passage]
    );

    function answerQuestion(number, value) {
        setAnswers((current) => ({ ...current, [number]: value }));
        setResult(null);
    }

    function selectPassage(index) {
        setActiveIndex(index);
        setActiveVocabulary(null);
        passagePanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        questionsPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }

    function addCheckedVocabulary(record) {
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
                return [...current, record];
            }

            const next = [...current];
            next[index] = {
                ...next[index],
                ...record,
                timestamp: next[index].timestamp || record.timestamp
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
            attemptId: attemptIdRef.current,
            timestamp: new Date().toISOString(),
            isAvailable: true,
            isLoading: true,
            source: ""
        };
        const existing = checkedVocabularyRef.current.find((item) => (
            item.passageId === passageId &&
            (item.selectedNormalized === normalizedWord || item.normalized === normalizedWord)
        ));

        if (existing) {
            setActiveVocabulary({ ...existing, selectedNormalized: normalizedWord, ...position });
            return;
        }

        setActiveVocabulary({ ...baseRecord, ...position });
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
                        ? { ...finalRecord, ...position }
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
                        ? { ...fallbackRecord, ...position }
                        : current
                ));
            });
    }

    function submit() {
        let correct = 0;
        questions.forEach((question) => {
            if (acceptedAnswers(question.answer).includes(normalizeAnswer(answers[question.number]))) {
                correct += 1;
            }
        });
        const unanswered = questions.filter((question) => !normalizeAnswer(answers[question.number])).length;
        const nextResult = { correct, total: questions.length, unanswered, band: scoreBand(correct, questions.length) };
        setResult(nextResult);

        window.authClient?.recordTestResult({
            type: skill === "listening" ? "Listening" : "Reading",
            title: test?.title || "IELTS Academic Reading",
            correct,
            total: questions.length,
            band: nextResult.band,
            testId: test?.id || testId,
            part: isFullTest ? "full" : passage?.number,
            attemptId: enableVocabulary ? attemptIdRef.current : undefined,
            vocabulary: enableVocabulary ? checkedVocabulary : undefined
        });
    }

    if (error) {
        return h("main", { className: "cbt-status" }, h("h1", null, "Could not load test"), h("p", null, error));
    }
    if (!test) {
        return h("main", { className: "cbt-status" }, h("p", null, "Loading IELTS Reading test..."));
    }
    if (!passage) {
        return h("main", { className: "cbt-status" },
            h("h1", null, "No reading passage found"),
            h("p", null, "The uploaded test did not contain a parsed reading passage.")
        );
    }

    const dashboardHref = skill === "listening"
        ? "listeningfulltest.html"
        : (isFullTest ? "fulltest.html" : `part${passage.number || 1}.html`);
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
                            onAnswer: answerQuestion
                        }),
                        result && enableVocabulary
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
        h(ResultModal, { result, onClose: () => setResult(null) })
    );
}

ReactDOM.createRoot(rootElement).render(h(ReadingApp));
})();
