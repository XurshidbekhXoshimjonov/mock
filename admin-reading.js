const form = document.getElementById("readingTestForm");
const testTitle = document.getElementById("testTitle");
const testPart = document.getElementById("testPart");
const passageText = document.getElementById("passageText");
const instructionText = document.getElementById("instructionText");
const questionText = document.getElementById("questionText");
const answerText = document.getElementById("answerText");
const saveStatus = document.getElementById("saveStatus");
const fillExample = document.getElementById("fillExample");
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
                <a href="reading-template.html?id=${encodeURIComponent(test.id)}">Open</a>
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
    passageText.value = test.passage;
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
        const url = editingTestId
            ? `/api/reading-tests/${encodeURIComponent(editingTestId)}`
            : "/api/reading-tests";
        const response = await fetch(url, {
            method: editingTestId ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: testTitle.value,
                part: testPart.value,
                passage: passageText.value,
                questionText: getCombinedQuestionText(),
                answerText: answerText.value,
                vocabulary: testPart.value === "full" ? [] : vocabularyEntries
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Could not save test");
        }

        showStatus(editingTestId ? "Updated." : "Saved.", "success");
        resetEditMode();
        form.reset();
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

fillExample.addEventListener("click", () => {
    resetEditMode();
    testTitle.value = "River Floods Practice";
    testPart.value = "1";
    passageText.value = `Dirty river but clean water

Floods once raged through the canyon every year. Spring snow melted and swelled the river, carrying sediment through the Grand Canyon. These floods carved beaches and built sandbars.

After the Glen Canyon dam was built, the river stopped receiving enough sediment. Some fish lost the cloudy water that helped them hide from predators. Scientists now believe controlled floods can help rebuild the canyon ecosystem.`;
    instructionText.value = `group | Questions 1-2 | Do the following statements agree with the information in the passage?

group | Questions 3-5 | Complete the sentences below. | Choose NO MORE THAN TWO WORDS from the passage.`;
    questionText.value = `1 | true_false_not_given | Floods can help build sandbars. | NOT GIVEN
2 | true_false_not_given | The dam increased sediment in the river. | FALSE
3 | sentence_completion | The cloudy water helped fish hide from ____. | predators
4 | multiple_choice | Why do scientists use controlled floods? | A. To rebuild the ecosystem; B. To stop all fishing; C. To remove the river | A
5 | matching_headings | Paragraph 1 | i. A natural river process; ii. A modern city problem; iii. A tourist attraction | i`;
    answerText.value = "";
    vocabularyEntries = normalizeVocabularyEntries([
        {
            word: "sediment",
            definition: "Small pieces of sand, soil, or rock carried by water.",
            uzbekTranslation: "cho'kindi",
            example: "Spring snow carried sediment through the Grand Canyon."
        },
        {
            word: "predators",
            definition: "Animals that hunt and eat other animals.",
            uzbekTranslation: "yirtqichlar",
            example: "Cloudy water helped fish hide from predators."
        },
        {
            word: "ecosystem",
            definition: "All the living things in an area and the environment they depend on.",
            uzbekTranslation: "ekotizim",
            example: "Controlled floods can help rebuild the canyon ecosystem."
        }
    ]);
    clearVocabularyForm();
    renderVocabularyList();
    renderPreview();
});

renderVocabularyList();

loadManualTests().catch((error) => {
    manualTestsList.textContent = error.message;
});
