const form = document.getElementById("readingTestForm");
const testTitle = document.getElementById("testTitle");
const testPart = document.getElementById("testPart");
const passageText = document.getElementById("passageText");
const instructionText = document.getElementById("instructionText");
const questionText = document.getElementById("questionText");
const answerText = document.getElementById("answerText");
const saveStatus = document.getElementById("saveStatus");
const previewBtn = document.getElementById("previewBtn");
const previewPanel = document.getElementById("previewPanel");
const manualTestsList = document.getElementById("manualTestsList");
const submitButton = form.querySelector('button[type="submit"]');
const vocabularyEditor = document.getElementById("vocabularyEditor");
const vocabularyDisabledNotice = document.getElementById("vocabularyDisabledNotice");
const vocabularyCount = document.getElementById("vocabularyCount");
const vocabWord = document.getElementById("vocabWord");
const vocabDefinition = document.getElementById("vocabDefinition");
const vocabTranslation = document.getElementById("vocabTranslation");
const vocabExample = document.getElementById("vocabExample");
const saveVocabEntry = document.getElementById("saveVocabEntry");
const cancelVocabEdit = document.getElementById("cancelVocabEdit");
const vocabularyList = document.getElementById("vocabularyList");

let editingTestId = null;
let vocabularyEntries = [];
let editingVocabularyIndex = null;
let importedReadingHtml = "";
let importedReadingPassageHtml = "";
let importedReadingRichPassages = [];
let importedReadingAutoNumber = false;

const mockBuilderParams = new URLSearchParams(window.location.search);
const isMockBuilderEmbed = mockBuilderParams.get("mockBuilder") === "1";

if (isMockBuilderEmbed) {
    document.body.classList.add("mock-builder-embed");
}

function notifyMockBuilder(test) {
    if (!isMockBuilderEmbed || window.parent === window || !test) return;
    window.parent.postMessage({
        type: "ieltsx-admin-test-saved",
        section: "reading",
        testId: test.id || test._id,
        test
    }, window.location.origin);
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showStatus(message, type) {
    saveStatus.textContent = message;
    saveStatus.className = `save-status ${type || ""}`;
}

function resetEditMode() {
    editingTestId = null;
    submitButton.textContent = "Save reading test";
}

function isSupportedHtmlFile(file) {
    return /\.(html?|txt)$/i.test(file?.name || "");
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(String(event.target?.result || ""));
        reader.onerror = () => reject(new Error("HTML upload failed. Please upload a valid .html file."));
        reader.readAsText(file);
    });
}

function clearImportedReadingHtml() {
    importedReadingHtml = "";
    importedReadingPassageHtml = "";
    importedReadingRichPassages = [];
    importedReadingAutoNumber = false;
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
                id: entry.id || `${Date.now()}-${normalized}`,
                word,
                normalized,
                definition: String(entry.definition || entry.englishDefinition || "").trim(),
                uzbekTranslation: String(entry.uzbekTranslation || entry.translation || "").trim(),
                example: String(entry.example || entry.exampleSentence || "").trim(),
                source: String(entry.source || "manual").trim()
            };
        })
        .filter(Boolean);
}

function clearVocabularyForm() {
    editingVocabularyIndex = null;
    vocabWord.value = "";
    vocabDefinition.value = "";
    vocabTranslation.value = "";
    vocabExample.value = "";
    saveVocabEntry.textContent = "Add word";
    cancelVocabEdit.classList.add("hidden");
}

function renderVocabularyList() {
    const isFullMode = testPart.value === "full";
    vocabularyEditor.classList.toggle("is-disabled", isFullMode);
    vocabularyDisabledNotice.classList.toggle("hidden", !isFullMode);
    [vocabWord, vocabDefinition, vocabTranslation, vocabExample, saveVocabEntry].forEach((element) => {
        element.disabled = isFullMode;
    });

    vocabularyCount.textContent = `${vocabularyEntries.length} word${vocabularyEntries.length === 1 ? "" : "s"}`;

    if (!vocabularyEntries.length) {
        vocabularyList.innerHTML = `<p class="vocabulary-empty">No vocabulary entries yet.</p>`;
        return;
    }

    vocabularyList.innerHTML = vocabularyEntries.map((entry, index) => `
        <article class="vocabulary-row">
            <div>
                <h3>${escapeHtml(entry.word)}</h3>
                <span class="vocabulary-source">${escapeHtml(entry.source || "manual")}</span>
                <p><strong>Definition:</strong> ${escapeHtml(entry.definition || "Definition is not available yet.")}</p>
                <p><strong>Uzbek:</strong> ${escapeHtml(entry.uzbekTranslation || "Translation is not available yet.")}</p>
                ${entry.example ? `<p><strong>Example:</strong> ${escapeHtml(entry.example)}</p>` : ""}
            </div>
            <div class="vocabulary-row-actions">
                <button type="button" data-vocab-action="edit" data-index="${index}">Edit</button>
                <button type="button" class="danger-button" data-vocab-action="delete" data-index="${index}">Delete</button>
            </div>
        </article>
    `).join("");
}

function saveVocabularyEntryFromForm() {
    if (testPart.value === "full") {
        showStatus("Vocabulary is disabled for Full Test mode.", "error");
        return;
    }

    const word = vocabWord.value.trim();
    const normalized = normalizeVocabularyWord(word);

    if (!word || !normalized) {
        showStatus("Add a vocabulary word first.", "error");
        return;
    }

    const duplicateIndex = vocabularyEntries.findIndex((entry, index) =>
        index !== editingVocabularyIndex && entry.normalized === normalized
    );

    if (duplicateIndex !== -1) {
        showStatus("This vocabulary word already exists for the passage.", "error");
        return;
    }

    const entry = {
        id: editingVocabularyIndex !== null
            ? vocabularyEntries[editingVocabularyIndex].id
            : `${Date.now()}-${normalized}`,
        word,
        normalized,
        definition: vocabDefinition.value.trim(),
        uzbekTranslation: vocabTranslation.value.trim(),
        example: vocabExample.value.trim(),
        source: "manual"
    };

    if (editingVocabularyIndex !== null) {
        vocabularyEntries[editingVocabularyIndex] = entry;
        showStatus("Vocabulary word updated.", "success");
    } else {
        vocabularyEntries.push(entry);
        showStatus("Vocabulary word added.", "success");
    }

    clearVocabularyForm();
    renderVocabularyList();
}

function buildQuestionTextForEdit(test) {
    const lines = [];
    const questionByNumber = new Map((test.questions || []).map((question) => [Number(question.number), question]));
    const emitted = new Set();

    (test.questionGroups || []).forEach((group) => {
        if (group.title || group.instruction || group.rule || group.type || group.questionType) {
            lines.push([
                "group",
                group.title || "",
                group.instruction || "",
                group.rule || "",
                group.type || group.questionType || ""
            ].join(" | ").replace(/\s+\|\s*$/g, ""));
            lines.push("");
        }

        (group.questionNumbers || []).forEach((number) => {
            const question = questionByNumber.get(Number(number));
            if (!question || emitted.has(question.number)) return;

            const options = (question.options || []).join("; ");
            lines.push([
                question.number,
                question.type,
                question.question,
                options,
                question.answer
            ].filter((item, index) => index < 4 || item).join(" | "));
            emitted.add(question.number);
        });

        lines.push("");
    });

    (test.questions || []).forEach((question) => {
        if (emitted.has(question.number)) return;
        const options = (question.options || []).join("; ");
        const parts = [
            question.number,
            question.type,
            question.question,
            options,
            question.answer
        ].filter((item, index) => index < 4 || item);
        lines.push(parts.join(" | "));
    });

    return lines.join("\n").trim();
}

function getCombinedQuestionText() {
    const instructions = instructionText.value.trim();
    const questions = questionText.value.trim();

    if (instructions && questions) {
        return `${instructions}\n\n${questions}`;
    }

    return instructions || questions;
}

function buildPreviewTest() {
    const parsed = window.IeltsManualParser.parseStructuredContent(
        getCombinedQuestionText(),
        answerText.value,
        "reading"
    );

    return {
        title: testTitle.value || "Preview",
        passage: passageText.value,
        questionGroups: parsed.groups,
        questions: parsed.questions
    };
}

function validateReadingForm() {
    const title = testTitle.value.trim();
    const passage = passageText.value.trim();
    const parsed = window.IeltsManualParser.parseStructuredContent(
        getCombinedQuestionText(),
        answerText.value,
        "reading"
    );

    if (!title) {
        throw new Error("Test title is required.");
    }

    if (!passage) {
        throw new Error("Reading passage text is required.");
    }

    if (!parsed.questions.length) {
        throw new Error("Add at least one Reading question.");
    }

    const incomplete = parsed.questions.filter((question) => !question.answer);
    if (incomplete.length) {
        throw new Error(`Each Reading question must have a correct answer. Missing: ${incomplete.map((question) => question.number).join(", ")}`);
    }
}

function renderPreview() {
    try {
        const test = buildPreviewTest();

        if (!test.questions.length) {
            throw new Error("Add at least one valid question line with an answer.");
        }

        previewPanel.innerHTML = window.IeltsRenderer.renderReadingTest(test);
        previewPanel.classList.remove("hidden");
        showStatus(`Preview: ${test.questions.length} questions`, "success");
    } catch (error) {
        showStatus(error.message, "error");
    }
}

async function loadManualTests() {
    const response = await fetch("/api/reading-tests");
    const tests = await response.json();

    if (!tests.length) {
        manualTestsList.textContent = "No reading tests yet.";
        return;
    }

    manualTestsList.innerHTML = tests.map((test) => `
        <article class="manual-test-row">
            <h3>${escapeHtml(test.title)}</h3>
            <p>Part ${escapeHtml(test.part)} · ${test.questionCount} questions · ${test.vocabularyCount || 0} vocabulary words</p>
            <div class="manual-test-actions">
                <a href="${escapeHtml(test.openUrl || `/reading/${encodeURIComponent(test.slug || test.title || "test")}`)}">Open</a>
                <button type="button" data-action="edit" data-id="${escapeHtml(test.id)}">Edit</button>
                <button type="button" class="danger-button" data-action="delete" data-id="${escapeHtml(test.id)}">Delete</button>
            </div>
        </article>
    `).join("");
}

async function loadTestForEdit(id) {
    showStatus("Loading…", "");

    const response = await fetch(`/api/reading-tests/${encodeURIComponent(id)}`);
    const test = await response.json();

    if (!response.ok) {
        throw new Error(test.error || "Could not load test");
    }

    editingTestId = test.id;
    testTitle.value = test.title;
    testPart.value = test.part;
    passageText.value = test.passage || test.passageText || "";
    importedReadingHtml = test.readingHtml || "";
    importedReadingPassageHtml = test.passageHtml || "";
    importedReadingRichPassages = Array.isArray(test.richPassages) ? test.richPassages : [];
    instructionText.value = "";
    questionText.value = buildQuestionTextForEdit(test);
    answerText.value = (test.questions || [])
        .map((q) => `${q.number} | ${q.answer}`)
        .join("\n");
    vocabularyEntries = normalizeVocabularyEntries(test.vocabulary);
    clearVocabularyForm();
    renderVocabularyList();
    submitButton.textContent = "Update reading test";
    showStatus("Editing saved test.", "success");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteTest(id) {
    if (!confirm("Delete this reading test?")) {
        return;
    }

    const response = await fetch(`/api/reading-tests/${encodeURIComponent(id)}`, {
        method: "DELETE"
    });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Could not delete test");
    }

    if (editingTestId === id) {
        form.reset();
        resetEditMode();
    }

    showStatus("Deleted.", "success");
    await loadManualTests();
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showStatus("Saving…", "");

    try {
        validateReadingForm();

        const url = editingTestId
            ? `/api/reading-tests/${encodeURIComponent(editingTestId)}`
            : "/api/reading-tests";
        const passage = passageText.value.trim();
        const response = await fetch(url, {
            method: editingTestId ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: testTitle.value,
                part: testPart.value,
                passage,
                passageText: passage,
                readingHtml: importedReadingHtml,
                passageHtml: importedReadingPassageHtml,
                richPassages: testPart.value === "full" ? importedReadingRichPassages : [],
                autoNumberNewest: importedReadingAutoNumber && testPart.value === "full",
                questionText: getCombinedQuestionText(),
                answerText: answerText.value,
                vocabulary: testPart.value === "full" ? [] : vocabularyEntries
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Could not save test");
        }

        showStatus("Test saved successfully.", "success");
        notifyMockBuilder(data.test || data);
        resetEditMode();
        form.reset();
        clearImportedReadingHtml();
        vocabularyEntries = [];
        clearVocabularyForm();
        renderVocabularyList();
        previewPanel.classList.add("hidden");
        await loadManualTests();
    } catch (error) {
        showStatus(error.message, "error");
    }
});

manualTestsList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button) {
        return;
    }

    try {
        if (button.dataset.action === "edit") {
            await loadTestForEdit(button.dataset.id);
        }

        if (button.dataset.action === "delete") {
            await deleteTest(button.dataset.id);
        }
    } catch (error) {
        showStatus(error.message, "error");
    }
});

saveVocabEntry.addEventListener("click", saveVocabularyEntryFromForm);

cancelVocabEdit.addEventListener("click", () => {
    clearVocabularyForm();
    showStatus("Vocabulary edit cancelled.", "");
});

vocabularyList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-vocab-action]");

    if (!button) {
        return;
    }

    const index = Number(button.dataset.index);
    const entry = vocabularyEntries[index];

    if (!entry) {
        return;
    }

    if (button.dataset.vocabAction === "edit") {
        editingVocabularyIndex = index;
        vocabWord.value = entry.word;
        vocabDefinition.value = entry.definition || "";
        vocabTranslation.value = entry.uzbekTranslation || "";
        vocabExample.value = entry.example || "";
        saveVocabEntry.textContent = "Update word";
        cancelVocabEdit.classList.remove("hidden");
        vocabWord.focus();
        return;
    }

    vocabularyEntries.splice(index, 1);
    clearVocabularyForm();
    renderVocabularyList();
    showStatus("Vocabulary word deleted.", "success");
});

testPart.addEventListener("change", () => {
    clearVocabularyForm();
    renderVocabularyList();
});

previewBtn.addEventListener("click", renderPreview);

renderVocabularyList();

loadManualTests().catch((error) => {
    manualTestsList.textContent = error.message;
});

// --- VISUAL BUILDER STATE AND FUNCTIONS ---
let isVisualMode = false;
let visualState = { groups: [] };

const toggleVisualBuilderBtn = document.getElementById("toggleVisualBuilderBtn");
const visualQuestionBuilder = document.getElementById("visualQuestionBuilder");
const rawQuestionFields = document.getElementById("rawQuestionFields");
const visualGroupsContainer = document.getElementById("visualGroupsContainer");
const addVisualGroupBtn = document.getElementById("addVisualGroupBtn");

function toggleVisualBuilder() {
    isVisualMode = !isVisualMode;
    if (isVisualMode) {
        loadVisualStateFromRaw();
        renderVisualBuilder();
        visualQuestionBuilder.classList.remove("hidden");
        rawQuestionFields.classList.add("hidden");
        toggleVisualBuilderBtn.textContent = "Switch to Raw Text Editor";
    } else {
        serializeVisualStateToRaw();
        visualQuestionBuilder.classList.add("hidden");
        rawQuestionFields.classList.remove("hidden");
        toggleVisualBuilderBtn.textContent = "Switch to Visual Question Builder";
    }
}

function loadVisualStateFromRaw() {
    const combinedText = getCombinedQuestionText();
    let parsed;
    try {
        parsed = window.IeltsManualParser.parseStructuredContent(
            combinedText,
            answerText.value,
            "reading"
        );
    } catch (e) {
        parsed = { groups: [], questions: [] };
    }

    const questionsByNum = new Map((parsed.questions || []).map(q => [Number(q.number), q]));

    visualState.groups = (parsed.groups || []).map((g, gIdx) => {
        const questionsInGroup = (g.questionNumbers || []).map(num => {
            const q = questionsByNum.get(Number(num));
            return {
                number: num,
                question: q ? q.question : "",
                options: q && Array.isArray(q.options) ? q.options.join("; ") : (q && typeof q.options === 'string' ? q.options : ""),
                answer: q ? q.answer : ""
            };
        });

        return {
            id: `group-${Date.now()}-${gIdx}-${Math.random().toString(36).substr(2, 4)}`,
            title: g.title || "",
            instruction: g.instruction || "",
            rule: g.rule || "",
            type: g.type || g.questionType || "true_false_not_given",
            questions: questionsInGroup
        };
    });

    if (visualState.groups.length === 0) {
        visualState.groups.push({
            id: `group-${Date.now()}-0-${Math.random().toString(36).substr(2, 4)}`,
            title: "Questions 1-5",
            instruction: "Do the following statements agree with the information given in Reading Passage 1?",
            rule: "",
            type: "true_false_not_given",
            questions: [
                { number: 1, question: "Write your first question text here.", options: "", answer: "TRUE" }
            ]
        });
    }
}

function serializeVisualStateToRaw() {
    const rawInstructionLines = [];
    const rawQuestionLines = [];
    const rawAnswerLines = [];

    visualState.groups.forEach(group => {
        if (group.title || group.instruction || group.rule || group.type) {
            rawInstructionLines.push([
                "group",
                group.title || "",
                group.instruction || "",
                group.rule || "",
                group.type || ""
            ].join(" | ").replace(/\s+\|\s*$/g, ""));
            rawInstructionLines.push("");
        }

        group.questions.forEach(q => {
            if (!q.number) return;
            const normalizedType = window.IeltsManualParser.normalizeType(group.type, "reading");
            const needsOpt = [
                "multiple_choice",
                "multi_select",
                "matching_headings",
                "matching_information",
                "matching",
                "map_labeling",
                "map_labelling",
                "diagram_labeling",
                "diagram_labelling"
            ].includes(normalizedType);

            if (needsOpt) {
                rawQuestionLines.push([
                    q.number,
                    group.type,
                    q.question || "",
                    q.options || ""
                ].join(" | "));
            } else {
                rawQuestionLines.push([
                    q.number,
                    group.type,
                    q.question || ""
                ].join(" | "));
            }

            if (q.answer) {
                rawAnswerLines.push(`${q.number} | ${q.answer}`);
            }
        });

        rawInstructionLines.push("");
    });

    instructionText.value = rawInstructionLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    questionText.value = rawQuestionLines.join("\n").trim();
    answerText.value = rawAnswerLines.join("\n").trim();
}

function renderVisualBuilder() {
    visualGroupsContainer.innerHTML = visualState.groups.map((group, groupIndex) => {
        const questionsHtml = group.questions.map((q, qIdx) => {
            const normalizedType = window.IeltsManualParser.normalizeType(group.type, "reading");
            const needsOptions = [
                "multiple_choice",
                "multi_select",
                "matching_headings",
                "matching_information",
                "matching",
                "map_labeling",
                "map_labelling",
                "diagram_labeling",
                "diagram_labelling"
            ].includes(normalizedType);

            return `
                <div class="visual-question-row" data-group-index="${groupIndex}" data-q-index="${qIdx}">
                    <input type="number" data-q-field="number" value="${escapeHtml(q.number)}" placeholder="No." required>
                    <input type="text" data-q-field="question" value="${escapeHtml(q.question)}" placeholder="Question text/stem" required>
                    <input type="text" data-q-field="options" value="${escapeHtml(q.options)}" placeholder="Option A; Option B..." ${needsOptions ? "" : "disabled"}>
                    <input type="text" data-q-field="answer" value="${escapeHtml(q.answer)}" placeholder="Answer" required>
                    <button type="button" class="delete-question-btn" data-action="delete-question" data-group-index="${groupIndex}" data-q-index="${qIdx}">&times;</button>
                </div>
            `;
        }).join("");

        return `
            <div class="visual-group-card" data-group-index="${groupIndex}">
                <div class="visual-group-card-header">
                    <span class="visual-group-card-title">Question Group ${groupIndex + 1}</span>
                    <button type="button" class="delete-group-btn" data-action="delete-group" data-group-index="${groupIndex}">Delete Group</button>
                </div>
                <div class="visual-group-inputs">
                    <label>
                        Group Title (e.g. Questions 1-5)
                        <input type="text" data-group-field="title" value="${escapeHtml(group.title)}" placeholder="Questions 1-5" required>
                    </label>
                    <label>
                        Instructions Text
                        <input type="text" data-group-field="instruction" value="${escapeHtml(group.instruction)}" placeholder="Choose the correct letters...">
                    </label>
                    <label>
                        Rule (e.g. NO MORE THAN TWO WORDS)
                        <input type="text" data-group-field="rule" value="${escapeHtml(group.rule)}" placeholder="NO MORE THAN TWO WORDS">
                    </label>
                    <label>
                        Question Type
                        <select data-group-field="type">
                            <option value="true_false_not_given" ${group.type === "true_false_not_given" ? "selected" : ""}>TRUE / FALSE / NOT GIVEN</option>
                            <option value="yes_no_not_given" ${group.type === "yes_no_not_given" ? "selected" : ""}>YES / NO / NOT GIVEN</option>
                            <option value="multiple_choice" ${group.type === "multiple_choice" ? "selected" : ""}>Multiple Choice</option>
                            <option value="matching_headings" ${group.type === "matching_headings" ? "selected" : ""}>Matching Headings</option>
                            <option value="matching_information" ${group.type === "matching_information" ? "selected" : ""}>Matching Information (Paragraphs)</option>
                            <option value="sentence_completion" ${group.type === "sentence_completion" ? "selected" : ""}>Sentence Completion</option>
                            <option value="summary_completion" ${group.type === "summary_completion" ? "selected" : ""}>Summary Completion</option>
                            <option value="short_answer" ${group.type === "short_answer" ? "selected" : ""}>Short Answer</option>
                            <option value="table_completion" ${group.type === "table_completion" ? "selected" : ""}>Table Completion</option>
                            <option value="notes_completion" ${group.type === "notes_completion" ? "selected" : ""}>Notes Completion</option>
                            <option value="diagram_labeling" ${group.type === "diagram_labeling" ? "selected" : ""}>Diagram Labeling</option>
                        </select>
                    </label>
                </div>
                
                <div class="visual-questions-list">
                    <div class="visual-question-row header-row">
                        <span>Q#</span>
                        <span>Question / Stem</span>
                        <span>Options (Semicolon-separated)</span>
                        <span>Answer</span>
                        <span></span>
                    </div>
                    ${questionsHtml}
                </div>
                <div class="visual-builder-actions" style="margin-top: 12px;">
                    <button type="button" class="light-button add-question-btn" data-action="add-question" data-group-index="${groupIndex}">+ Add Question</button>
                </div>
            </div>
        `;
    }).join("");
}

// Event Listeners for Visual Builder input changes
visualGroupsContainer.addEventListener("input", (event) => {
    const groupCard = event.target.closest(".visual-group-card");
    const qRow = event.target.closest(".visual-question-row");
    if (!groupCard) return;

    const groupIndex = Number(groupCard.dataset.groupIndex);
    const group = visualState.groups[groupIndex];
    if (!group) return;

    const groupField = event.target.dataset.groupField;
    if (groupField) {
        group[groupField] = event.target.value;
        if (groupField === "type") {
            renderVisualBuilder();
        }
    }

    if (qRow) {
        const qIndex = Number(qRow.dataset.qIndex);
        const qField = event.target.dataset.qField;
        const question = group.questions[qIndex];
        if (question && qField) {
            if (qField === "number") {
                question.number = event.target.value ? Number(event.target.value) : "";
            } else {
                question[qField] = event.target.value;
            }
        }
    }

    serializeVisualStateToRaw();
});

visualGroupsContainer.addEventListener("change", (event) => {
    const groupCard = event.target.closest(".visual-group-card");
    if (!groupCard) return;

    const groupIndex = Number(groupCard.dataset.groupIndex);
    const group = visualState.groups[groupIndex];
    if (!group) return;

    const groupField = event.target.dataset.groupField;
    if (groupField === "type") {
        group[groupField] = event.target.value;
        renderVisualBuilder();
        serializeVisualStateToRaw();
    }
});

visualGroupsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const groupIndex = Number(button.dataset.groupIndex);
    const group = visualState.groups[groupIndex];
    if (!group) return;

    if (button.dataset.action === "add-question") {
        let lastNumber = 0;
        visualState.groups.forEach(g => {
            g.questions.forEach(q => {
                if (q.number > lastNumber) lastNumber = q.number;
            });
        });
        group.questions.push({
            number: lastNumber + 1,
            question: "",
            options: "",
            answer: ""
        });
        renderVisualBuilder();
        serializeVisualStateToRaw();
        return;
    }

    if (button.dataset.action === "delete-question") {
        const qIndex = Number(button.dataset.qIndex);
        group.questions.splice(qIndex, 1);
        renderVisualBuilder();
        serializeVisualStateToRaw();
        return;
    }

    if (button.dataset.action === "delete-group") {
        if (confirm("Are you sure you want to delete this question group?")) {
            visualState.groups.splice(groupIndex, 1);
            renderVisualBuilder();
            serializeVisualStateToRaw();
        }
        return;
    }
});

addVisualGroupBtn.addEventListener("click", () => {
    let lastNumber = 0;
    visualState.groups.forEach(g => {
        g.questions.forEach(q => {
            if (q.number > lastNumber) lastNumber = q.number;
        });
    });

    visualState.groups.push({
        id: `group-${Date.now()}-${visualState.groups.length}-${Math.random().toString(36).substr(2, 4)}`,
        title: `Questions ${lastNumber + 1}-${lastNumber + 5}`,
        instruction: "Choose the correct letters...",
        rule: "",
        type: "multiple_choice",
        questions: [
            { number: lastNumber + 1, question: "", options: "A. Option A; B. Option B", answer: "A" }
        ]
    });
    renderVisualBuilder();
    serializeVisualStateToRaw();
});

toggleVisualBuilderBtn.addEventListener("click", toggleVisualBuilder);

// Hook into edit mode to load visual mode from raw text
const originalLoadTestForEdit = loadTestForEdit;
loadTestForEdit = async function(id) {
    await originalLoadTestForEdit(id);
    if (isVisualMode) {
        loadVisualStateFromRaw();
        renderVisualBuilder();
    }
};

// Hook into form reset to clear visual builder state
form.addEventListener("reset", () => {
    visualState = { groups: [] };
    clearImportedReadingHtml();
    if (isVisualMode) {
        setTimeout(() => {
            loadVisualStateFromRaw();
            renderVisualBuilder();
        }, 50);
    }
});

// HTML File Drag & Drop Importer Integration
(function initHtmlImporter() {
    const zone = document.getElementById("importHtmlZone");
    const input = document.getElementById("importHtmlFile");
    if (!zone || !input) return;

    zone.addEventListener("click", () => input.click());

    zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("drag-over");
    });

    ["dragleave", "dragend"].forEach((type) => {
        zone.addEventListener(type, () => {
            zone.classList.remove("drag-over");
        });
    });

    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            handleFile(e.dataTransfer.files[0]);
        }
    });

    input.addEventListener("change", () => {
        if (input.files.length) {
            handleFile(input.files[0]);
        }
    });

    async function handleFile(file) {
        if (!isSupportedHtmlFile(file)) {
            showStatus("HTML upload failed. Please upload a valid .html file.", "error");
            return;
        }

        showStatus("Importing and parsing HTML file...", "success");
        try {
            const htmlContent = await readFileAsText(file);
            const formData = new FormData();
            formData.append("html", file);
            formData.append("skill", "reading");
            formData.append("parseOnly", "1");

            const response = await fetch("/api/full-tests/import", {
                method: "POST",
                body: formData
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to parse HTML file");
            }

            const parsed = data.test;
            if (!parsed || !parsed.reading || !parsed.reading.passages) {
                throw new Error("No reading passages found in the imported file");
            }

            importedReadingHtml = htmlContent;
            importedReadingAutoNumber = true;

            // Fill Form Details
            testTitle.value = parsed.title || "";
            
            const passages = parsed.reading.passages;
            importedReadingRichPassages = passages.map((passage, index) => ({
                id: passage.id || `${parsed.id || "reading-import"}-passage-${index + 1}`,
                number: Number(passage.number) || index + 1,
                title: passage.title || passage.passageTitle || `Reading Passage ${index + 1}`,
                displayLabel: passage.passageLabel || `Reading Passage ${Number(passage.number) || index + 1}`,
                html: passage.passageHtml || "",
                passageHtml: passage.passageHtml || "",
                passageText: passage.passageText || "",
                paragraphs: passage.paragraphs || []
            }));
            importedReadingPassageHtml = passages.length === 1 ? (passages[0].passageHtml || "") : "";

            if (passages.length > 1) {
                testPart.value = "full";
                passageText.value = passages.map((p, idx) => `READING PASSAGE ${idx + 1}: ${p.title || `Passage ${idx + 1}`}\n\n${p.passageText || ""}`).join("\n\n---\n\n");
            } else if (passages.length === 1) {
                testPart.value = String(passages[0].number || 1);
                passageText.value = passages[0].passageText || "";
            } else {
                passageText.value = "";
            }

            const rawInstructionLines = [];
            const rawQuestionLines = [];
            const rawAnswerLines = [];

            passages.forEach((passage) => {
                (passage.questionGroups || []).forEach((group) => {
                    const questions = group.questions || [];
                    if (!questions.length) return;
                    
                    const numbers = questions.map(q => Number(q.number)).filter(Number.isFinite);
                    const first = Math.min(...numbers);
                    const last = Math.max(...numbers);
                    const rangeStr = first === last ? `Question ${first}` : `Questions ${first}-${last}`;
                    
                    rawInstructionLines.push([
                        "group",
                        group.instructionTitle || rangeStr,
                        group.instructionText || "",
                        group.rule || "",
                        group.type || ""
                    ].join(" | ").replace(/\s+\|\s*$/g, ""));
                    
                    questions.forEach((q) => {
                        const optionsStr = Array.isArray(q.options) ? q.options.join("; ") : (q.options || "");
                        rawQuestionLines.push(`${q.number} | ${group.type} | ${q.question || ""} | ${optionsStr} | ${q.answer || ""}`);
                        rawAnswerLines.push(`${q.number} | ${q.answer || ""}`);
                    });
                });
            });

            instructionText.value = rawInstructionLines.join("\n\n");
            questionText.value = rawQuestionLines.join("\n");
            answerText.value = rawAnswerLines.join("\n");

            // Sync visual builder if in visual mode
            if (typeof isVisualMode !== "undefined" && isVisualMode) {
                loadVisualStateFromRaw();
                renderVisualBuilder();
            }

            // Sync vocabulary list if any is present
            if (Array.isArray(parsed.vocabulary)) {
                vocabularyEntries = normalizeVocabularyEntries(parsed.vocabulary);
                renderVocabularyList();
            }

            showStatus("HTML file loaded successfully.", "success");

            // Delete the draft full test from the backend to clean up
            fetch(`/api/full-tests/${parsed.id}`, {
                method: "DELETE",
                headers
            }).catch(() => {});

        } catch (error) {
            showStatus(error.message || "HTML upload failed. Please upload a valid .html file.", "error");
        }
    }
})();
