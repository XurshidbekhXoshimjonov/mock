const {
    escapeHtml,
    clone,
    uniqueId,
    sampleListeningTest,
    ListeningTestPage,
    bindListeningTest
} = window.ListeningComponents;

// DOM Selectors
const partSidebarRoot = document.getElementById("partSidebar");
const partEditorRoot = document.getElementById("partEditor");
const testScopeRoot = document.getElementById("testScope");
const testTitleInput = document.getElementById("testTitle");
const fixedDurationLabel = document.getElementById("fixedDurationLabel");
const builderStatus = document.getElementById("builderStatus");
const addBlockModal = document.getElementById("addBlockModal");
const addBlockMenuRoot = document.getElementById("addBlockMenu");
const blockEditorModal = document.getElementById("blockEditorModal");
const blockEditorForm = document.getElementById("blockEditorForm");
const blockEditorTitle = document.getElementById("blockEditorTitle");
const blockEditorContent = document.getElementById("blockEditorContent");
const studentPreviewModal = document.getElementById("studentPreviewModal");
const studentPreviewContent = document.getElementById("studentPreviewContent");
const savedTestsModal = document.getElementById("savedTestsModal");
const savedTestsList = document.getElementById("savedTestsList");
const btnNewTest = document.getElementById("btnNewTest");

// Block Types configuration
const BLOCK_TYPES = [
    { type: "form_completion", name: "Form Completion", description: "Build a form with left labels and answer inputs." },
    { type: "multiple_select", name: "Multiple Select", description: "Multiple checkbox choices with selection limit." },
    { type: "sentence_completion_inline", name: "Inline Sentence Completion", description: "Sentences with inline input placeholders." },
    { type: "multiple_choice", name: "Multiple Choice", description: "Standard single choice radio button options." },
    { type: "note_completion", name: "Note Completion", description: "Bulleted list notes with blanks." },
    { type: "table_completion", name: "Table Completion", description: "Data table rows/columns with cell blanks." },
    { type: "matching", name: "Matching", description: "Dropdowns matching question items with options." },
    { type: "map_labelling", name: "Map / Diagram Labelling", description: "Draggable markers placed over an uploaded image." }
];

const LISTENING_PART_NUMBERS = [1, 2, 3, 4];

// Dynamic Builder State
function createBlankPart(partNumber) {
    const start = ((Number(partNumber) || 1) - 1) * 10 + 1;
    const end = start + 9;

    return {
        partNumber: Number(partNumber),
        title: `Part ${partNumber}`,
        questionRange: `Questions ${start}-${end}`,
        audioUrl: "",
        audioFileName: "",
        instruction: `Listen and answer Questions ${start}-${end}.`,
        answerText: "",
        blocks: []
    };
}

function createBlankTest() {
    return {
        title: "",
        parts: LISTENING_PART_NUMBERS.map(createBlankPart)
    };
}

let builderState = createBlankTest();
let selectedPartIndex = 0;
let editingTestId = null;
let saveScope = "full"; // "full" or "part"
let savePartNumber = 1;
let loadedSaveKey = "full";
let editingBlockIndex = null;
let blockDraft = null;

// Display Status Log / Toast
function showStatus(message, type = "") {
    builderStatus.textContent = message;
    builderStatus.className = `app-toast ${type ? `is-${type}` : ""}`;
    builderStatus.style.display = "block";
    setTimeout(() => {
        builderStatus.style.display = "none";
    }, 4000);
}

function selectedPart() {
    return builderState.parts[selectedPartIndex];
}

function ensureFourParts(parts = []) {
    const byNumber = new Map((parts || []).map((part) => [Number(part.partNumber), part]));
    return LISTENING_PART_NUMBERS.map((number) => ({
        ...createBlankPart(number),
        ...(byNumber.get(number) || {})
    }));
}

function saveKey(scope = saveScope, partNumber = savePartNumber) {
    return scope === "full" ? "full" : `part:${Number(partNumber) || 1}`;
}

function applySaveScope(scope, partNumber = savePartNumber) {
    saveScope = scope === "part" ? "part" : "full";
    savePartNumber = Number(partNumber) || 1;
    if (saveScope === "part") {
        selectedPartIndex = Math.max(0, savePartNumber - 1);
    }
}

function currentDurationMinutes() {
    return saveScope === "full" ? 40 : 10;
}

// Convert Dynamic Flat JSON Questions into Builder Blocks Structure
function convertLegacyTestToBuilderFormat(test) {
    if (!test) return test;
    if (Array.isArray(test.parts) && test.parts.length) {
        return test;
    }

    const parts = [1, 2, 3, 4].map((partNum) => {
        const partStart = (partNum - 1) * 10 + 1;
        const partEnd = partNum * 10;
        const partQuestions = (test.questions || []).filter(q => q.number >= partStart && q.number <= partEnd);
        
        const blocks = partQuestions.map((question, index) => {
            const rangeStr = `Question ${question.number}`;
            const idVal = `block-${partNum}-${question.number}`;

            if (question.type === "multiple_choice") {
                return {
                    id: idVal,
                    type: "multiple_choice",
                    questionRange: rangeStr,
                    questionNumber: question.number,
                    question: question.question,
                    options: (question.options || []).map((item, optionIndex) => {
                        if (item && typeof item === "object") {
                            const letter = item.letter || item.value || String.fromCharCode(65 + optionIndex);
                            const text = item.text || item.html || item.label || "";
                            return { letter, text };
                        }
                        return {
                            letter: String.fromCharCode(65 + optionIndex),
                            text: String(item)
                        };
                    })
                };
            }

            if (question.type === "multiple_select" || question.type === "multi_select") {
                return {
                    id: idVal,
                    type: "multiple_select",
                    questionRange: rangeStr,
                    questionNumber: question.number,
                    question: question.question,
                    maxSelections: question.maxSelections || 2,
                    options: (question.options || []).map((item, optionIndex) => {
                        if (item && typeof item === "object") {
                            const letter = item.letter || item.value || String.fromCharCode(65 + optionIndex);
                            const text = item.text || item.html || item.label || "";
                            return { letter, text };
                        }
                        return {
                            letter: String.fromCharCode(65 + optionIndex),
                            text: String(item)
                        };
                    })
                };
            }

            // Fallback default: Note Completion
            return {
                id: idVal,
                type: "note_completion",
                questionRange: rangeStr,
                title: question.question || "Note Completion",
                instruction: "Complete the notes below.",
                content: [`- Some detail placeholder {{${question.number}}}`]
            };
        });

        // Try to locate instruction & audio details from matching section
        const matchingSection = (test.sections || []).find((s) => Number(s.number) === partNum || String(s.title).includes(String(partNum)));
        const instruction = matchingSection ? matchingSection.instruction : `Listen and answer Questions ${partStart}-${partEnd}.`;
        const audioUrl = matchingSection ? matchingSection.audioUrl : "";
        const audioFileName = audioUrl ? String(audioUrl).split("/").pop() : "";

        // Collect matching answers from test.answers
        const answerLines = [];
        partQuestions.forEach((q) => {
            const answerVal = test.answers ? test.answers[q.number] || test.answers[`q${q.number}`] || "" : "";
            if (answerVal) {
                answerLines.push(`${q.number} | ${Array.isArray(answerVal) ? answerVal.join(" / ") : answerVal}`);
            }
        });

        return {
            partNumber: partNum,
            title: `Part ${partNum}`,
            questionRange: `Questions ${partStart}-${partEnd}`,
            audioUrl,
            audioFileName,
            instruction,
            answerText: answerLines.join("\n"),
            blocks
        };
    });

    return {
        ...test,
        parts
    };
}

function hydrateBuilderState(test) {
    if (!test) return;
    const normalized = convertLegacyTestToBuilderFormat(test);
    builderState = {
        ...createBlankTest(),
        ...normalized,
        parts: ensureFourParts(normalized.parts)
    };
    applySaveScope(test.part === "full" ? "full" : "part", test.part !== "full" ? Number(test.part) || 1 : 1);
}

// REST Backend Communication Helper Functions
async function readResponse(response) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
}

async function createListeningTest(data) {
    return readResponse(await fetch("/api/listening-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }));
}

async function updateListeningTest(id, data) {
    return readResponse(await fetch(`/api/listening-tests/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }));
}

async function deleteListeningTest(id) {
    if (!confirm("Delete this Listening test?")) return;
    showStatus("Deleting Listening test...");
    await readResponse(await fetch(`/api/listening-tests/${encodeURIComponent(id)}`, {
        method: "DELETE"
    }));

    if (editingTestId === id) {
        builderState = createBlankTest();
        editingTestId = null;
        selectedPartIndex = 0;
        history.replaceState({}, "", "admin-listening.html");
        ListeningTestBuilder();
    }
    await loadSavedTests(false);
    showStatus("Listening test deleted.", "success");
}

async function uploadAudio(file) {
    const formData = new FormData();
    formData.append("audio", file);
    return readResponse(await fetch("/api/listening-assets/audio", { method: "POST", body: formData }));
}

async function uploadImage(file) {
    const formData = new FormData();
    formData.append("image", file);
    return readResponse(await fetch("/api/listening-assets/image", { method: "POST", body: formData }));
}

// Elements markup generators
function SaveScopeSelector() {
    return `<div class="scope-text-info">
        <span>Create as</span>
        <strong>${saveScope === "full" ? "Full Listening Test" : `Listening Part ${savePartNumber}`}</strong>
        <p>${saveScope === "full"
            ? "Save all four parts together as a combined Full Listening test."
            : `Only Part ${savePartNumber} will be saved as an individual listening test.`}</p>
    </div>
    <div class="scope-actions" style="display: flex; gap: 8px;">
        <button class="scope-btn ${saveScope === "full" ? "is-active" : ""}" data-save-scope="full" type="button">Full Test</button>
        ${LISTENING_PART_NUMBERS.map((number) => `<button class="scope-btn ${saveScope === "part" && savePartNumber === number ? "is-active" : ""}" data-save-scope="part" data-save-part="${number}" type="button">Part ${number}</button>`).join("")}
    </div>`;
}

function PartSidebar() {
    return builderState.parts.map((part, index) => `
        <button class="part-sidebar-button ${index === selectedPartIndex ? "is-active" : ""} ${saveScope === "part" && Number(part.partNumber) === savePartNumber ? "is-save-target" : ""}" data-part-index="${index}" type="button">
            <strong>${escapeHtml(part.title)}</strong>
            <span>${escapeHtml(part.questionRange)}</span>
            <small>${(part.blocks || []).length} blocks${saveScope === "part" && Number(part.partNumber) === savePartNumber ? " (target)" : ""}</small>
        </button>
    `).join("");
}

function AudioUpload(part) {
    return `<div class="audio-card">
        <div class="audio-info">
            <strong>Part Audio File</strong>
            <span>${part.audioFileName ? escapeHtml(part.audioFileName) : "No audio uploaded. Accepted formats: MP3, WAV, M4A"}</span>
        </div>
        <div class="audio-controls">
            ${part.audioUrl ? `<audio controls preload="metadata" src="${escapeHtml(part.audioUrl)}" style="height: 38px; border-radius: 6px;"></audio>` : ""}
            <label class="btn btn-secondary" for="audioInput" style="margin-bottom: 0;">
                ${part.audioUrl ? "Change audio" : "Upload audio"}
            </label>
            <input id="audioInput" class="upload-input" type="file" style="display: none;" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4">
            ${part.audioUrl ? '<button class="btn btn-danger" data-action="remove-audio" type="button">Remove</button>' : ""}
        </div>
    </div>`;
}

function blockTypeName(type) {
    const matched = BLOCK_TYPES.find((item) => item.type === type);
    return matched ? matched.name : "Question Block";
}

function blockSummary(block) {
    if (block.type === "multiple_choice") return `MCQ: "${block.question || "Empty question"}"`;
    if (block.type === "multiple_select") return `Select: "${block.question || "Empty question"}"`;
    if (block.type === "sentence_completion_inline" || block.type === "note_completion") {
        const text = Array.isArray(block.content) ? block.content.join(" ") : block.content || "";
        return text.substring(0, 80) + (text.length > 80 ? "..." : "");
    }
    if (block.type === "table_completion") return `Table columns: ${(block.columns || []).join(", ")}`;
    if (block.type === "matching") return `Matching: ${(block.questions || []).length} items`;
    if (block.type === "map_labelling") return `Map: ${(block.labels || []).length} marker labels`;
    return block.title || "No summary available";
}

function QuestionBlockList(part) {
    if (!(part.blocks || []).length) {
        return '<div class="builder-empty">No blocks in this part yet. Add the first question block below.</div>';
    }

    return `<div class="question-blocks-list">${part.blocks.map((block, index) => `
        <article class="builder-question-card">
            <div class="card-header-row">
                <div class="block-title-info">
                    <span class="block-badge">${escapeHtml(blockTypeName(block.type))}</span>
                    <strong style="font-size: 15px; color: var(--dark); font-weight: 700;">${escapeHtml(block.questionRange || "Questions")}</strong>
                </div>
                <div class="card-actions">
                    <button class="card-action-btn" data-action="move-up" data-block-index="${index}" title="Move Up" type="button" ${index === 0 ? "disabled style='opacity:0.4;cursor:not-allowed;'" : ""}>
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    </button>
                    <button class="card-action-btn" data-action="move-down" data-block-index="${index}" title="Move Down" type="button" ${index === part.blocks.length - 1 ? "disabled style='opacity:0.4;cursor:not-allowed;'" : ""}>
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    <button class="card-action-btn" data-action="duplicate-block" data-block-index="${index}" title="Duplicate" type="button">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="card-action-btn" data-action="edit-block" data-block-index="${index}" title="Edit" type="button">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="card-action-btn" data-action="delete-block" data-block-index="${index}" title="Delete" style="color:var(--danger);" type="button">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            </div>
            <div class="block-body-info">
                <p style="color: var(--muted); font-size: 13px;">${escapeHtml(blockSummary(block))}</p>
            </div>
        </article>
    `).join("")}</div>`;
}

function PartEditor() {
    const part = selectedPart();
    return `<div class="card">
        <header class="part-editor-header">
            <h2>${escapeHtml(part.title)}</h2>
            <p>Configure part audio, instructions, and question blocks.</p>
        </header>

        <div class="part-meta-fields">
            <div class="form-group">
                <label>Part Title</label>
                <input data-part-field="title" type="text" value="${escapeHtml(part.title)}">
            </div>
            <div class="form-group">
                <label>Question Range</label>
                <input data-part-field="questionRange" type="text" value="${escapeHtml(part.questionRange)}">
            </div>
        </div>

        <div class="form-group" style="margin-bottom: 20px;">
            <label>Part Instruction</label>
            <textarea data-part-field="instruction" style="height: 80px;">${escapeHtml(part.instruction || "")}</textarea>
        </div>

        <div class="form-group" style="margin-bottom: 24px;">
            <label class="answer-key-label">Answer Key for this Part</label>
            <textarea class="answer-key-textarea" data-part-field="answerText" placeholder="1 | library&#10;2 | computers">${escapeHtml(part.answerText || "")}</textarea>
            <small style="color: var(--muted); font-size: 11px; display: block; margin-top: 4px;">
                Format: <code>[Number] | [Answer]</code>. One per line. Multiple valid options separated by /. E.g. <code>1 | library / room</code>.
            </small>
        </div>

        <div style="margin-bottom: 28px;">
            ${AudioUpload(part)}
        </div>

        <div style="border-top: 1px solid var(--border); padding-top: 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                <h3 style="font-size: 16px; font-weight: 700; color: var(--dark);">Question Blocks</h3>
            </div>
            ${QuestionBlockList(part)}
            <div class="add-block-container">
                <button class="btn-add-block" data-action="add-block" type="button">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Add Question Block
                </button>
            </div>
        </div>
    </div>`;
}

function ListeningTestBuilder() {
    testTitleInput.value = builderState.title || "";
    if (fixedDurationLabel) {
        fixedDurationLabel.textContent = saveScope === "full"
            ? "Full test: 40 minutes"
            : `Part ${savePartNumber}: 10 minutes`;
    }
    testScopeRoot.innerHTML = SaveScopeSelector();
    partSidebarRoot.innerHTML = PartSidebar();
    partEditorRoot.innerHTML = PartEditor();
}

function AddQuestionBlockMenu() {
    return BLOCK_TYPES.map((item) => `<button class="block-type-btn" data-block-type="${item.type}" type="button">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.description)}</span>
    </button>`).join("");
}

// Block Fields Editors inside dialog popup modal
function commonEditorFields(block) {
    return `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div class="form-group">
            <label>Block Title / Summary</label>
            <input data-block-field="title" type="text" value="${escapeHtml(block.title || "")}">
        </div>
        <div class="form-group">
            <label>Question Range</label>
            <input data-block-field="questionRange" type="text" value="${escapeHtml(block.questionRange || "")}">
        </div>
    </div>
    <div class="form-group" style="margin-bottom: 20px;">
        <label>Instruction</label>
        <textarea data-block-field="instruction" style="height: 80px;">${escapeHtml(block.instruction || "")}</textarea>
    </div>`;
}

function valueDetails(value) {
    const result = { type: value?.type || "text", text: "", questionNumber: "", prefix: "", suffix: "" };
    if (result.type === "text") result.text = value?.text || "";
    if (result.type === "input") result.questionNumber = value?.questionNumber || "";
    if (result.type === "mixed") {
        const parts = value?.parts || [];
        const inputIndex = parts.findIndex((part) => part.type === "input");
        result.questionNumber = parts[inputIndex]?.questionNumber || "";
        result.prefix = parts.slice(0, inputIndex).map((part) => part.text || "").join("");
        result.suffix = parts.slice(inputIndex + 1).map((part) => part.text || "").join("");
    }
    return result;
}

function formRowEditor(row, index) {
    const value = valueDetails(row.value);
    return `<div class="form-row-editor" data-form-row="${index}">
        <label>
            Left Label
            <input data-row-field="label" value="${escapeHtml(row.label || "")}" placeholder="e.g. Venue:">
        </label>
        <label>
            Right Value Type
            <select data-row-field="valueType">
                <option value="text" ${value.type === "text" ? "selected" : ""}>Text</option>
                <option value="input" ${value.type === "input" ? "selected" : ""}>Input (Blank)</option>
                <option value="mixed" ${value.type === "mixed" ? "selected" : ""}>Mixed text + blank</option>
            </select>
        </label>
        <div class="row-actions">
            <button class="row-action" data-row-action="delete" data-row-index="${index}" type="button">Delete</button>
        </div>
        <div class="row-value-fields">
            <div class="form-group" style="margin-bottom:0;">
                <label>Text value</label>
                <input data-row-field="text" value="${escapeHtml(value.text)}" placeholder="Text only">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Question #</label>
                <input data-row-field="questionNumber" type="number" min="1" max="40" value="${escapeHtml(value.questionNumber)}" placeholder="e.g. 1">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Prefix text</label>
                <input data-row-field="prefix" value="${escapeHtml(value.prefix)}" placeholder="Before blank">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Suffix text</label>
                <input data-row-field="suffix" value="${escapeHtml(value.suffix)}" placeholder="After blank">
            </div>
        </div>
    </div>`;
}

function FormCompletionEditor(block) {
    return `${commonEditorFields(block)}
        <section class="editor-section">
            <div class="editor-section-head">
                <h3>Form Rows</h3>
                <button class="btn btn-secondary" data-editor-action="add-form-row" type="button">Add Row</button>
            </div>
            <div class="editor-row-list">${(block.rows || []).map(formRowEditor).join("")}</div>
        </section>`;
}

function optionEditor(option, index) {
    return `<div class="option-editor" data-option-row="${index}">
        <label>
            Letter
            <input data-option-field="letter" value="${escapeHtml(option.letter || "")}" placeholder="e.g. A">
        </label>
        <label>
            Option Text
            <input data-option-field="text" value="${escapeHtml(option.text || "")}" placeholder="e.g. Library">
        </label>
        <div class="row-actions">
            <button class="row-action" data-option-action="delete" data-option-index="${index}" type="button">Delete</button>
        </div>
    </div>`;
}

function choicesEditor(block, multiple) {
    return `${commonEditorFields(block)}
        <div style="display: grid; grid-template-columns: ${multiple ? "1fr 1fr" : "1fr"}; gap: 16px; margin-bottom: 16px;">
            <div class="form-group">
                <label>Question Number</label>
                <input data-block-field="questionNumber" type="number" min="1" max="40" value="${Number(block.questionNumber) || ""}">
            </div>
            ${multiple ? `
            <div class="form-group">
                <label>Maximum Selections</label>
                <input data-block-field="maxSelections" type="number" min="1" max="10" value="${Number(block.maxSelections) || 2}">
            </div>` : ""}
        </div>
        <div class="form-group" style="margin-bottom: 20px;">
            <label>Question Text</label>
            <textarea data-block-field="question" style="height: 80px;">${escapeHtml(block.question || "")}</textarea>
        </div>
        <section class="editor-section">
            <div class="editor-section-head">
                <h3>Lettered Options</h3>
                <button class="btn btn-secondary" data-editor-action="add-option" type="button">Add Option</button>
            </div>
            <div class="editor-row-list">${(block.options || []).map(optionEditor).join("")}</div>
        </section>`;
}

function MultipleSelectEditor(block) {
    return choicesEditor(block, true);
}

function MultipleChoiceEditor(block) {
    return choicesEditor(block, false);
}

function SentenceCompletionInlineEditor(block) {
    const content = Array.isArray(block.content) ? block.content.join("\n\n") : block.content || "";
    return `${commonEditorFields(block)}
        <div class="form-group editor-section">
            <label>Sentences with {{number}} placeholders</label>
            <textarea data-block-field="content" style="height: 200px;">${escapeHtml(content)}</textarea>
        </div>`;
}

function NoteCompletionEditor(block) {
    const content = Array.isArray(block.content) ? block.content.join("\n") : block.content || "";
    return `${commonEditorFields(block)}
        <div class="form-group editor-section">
            <label>Note content. Use "- " for bullets and {{number}} for blanks.</label>
            <textarea data-block-field="content" style="height: 220px;">${escapeHtml(content)}</textarea>
        </div>`;
}

function valueToTemplate(value) {
    if (typeof value === "string") return value;
    if (!value || value.type === "text") return value?.text || "";
    if (value.type === "input") return `{{${value.questionNumber}}}`;
    if (value.type === "mixed") {
        return (value.parts || []).map((part) => part.type === "input" ? `{{${part.questionNumber}}}` : part.text || "").join("");
    }
    return "";
}

function TableCompletionEditor(block) {
    const rows = (block.rows || []).map((row) => (Array.isArray(row) ? row : row.cells || []).map(valueToTemplate).join(" | ")).join("\n");
    return `${commonEditorFields(block)}
        <div class="editor-section" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="form-group">
                <label>Column headings, separated with |</label>
                <input data-block-field="columns" type="text" value="${escapeHtml((block.columns || []).join(" | "))}">
            </div>
            <div class="form-group">
                <label>Table rows, one per line. Separate cells with | and use {{number}} for blanks.</label>
                <textarea data-block-field="rows" style="height: 180px;">${escapeHtml(rows)}</textarea>
            </div>
        </div>`;
}

function MatchingEditor(block) {
    const options = (block.options || []).map((option) => `${option.letter} | ${option.text}`).join("\n");
    const questions = (block.questions || []).map((question) => `${question.questionNumber} | ${question.text}`).join("\n");
    return `${commonEditorFields(block)}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;" class="editor-section">
            <div class="form-group">
                <label>Options, one per line: A | text</label>
                <textarea data-block-field="matchingOptions" style="height: 200px;">${escapeHtml(options)}</textarea>
            </div>
            <div class="form-group">
                <label>Questions, one per line: 21 | text</label>
                <textarea data-block-field="matchingQuestions" style="height: 200px;">${escapeHtml(questions)}</textarea>
            </div>
        </div>`;
}

function markerEditor(label, index) {
    return `<div class="marker-editor" data-marker-row="${index}">
        <label>
            Question #
            <input data-marker-field="questionNumber" type="number" min="1" max="40" value="${Number(label.questionNumber) || ""}">
        </label>
        <label>
            X Position (%)
            <input data-marker-field="x" type="number" min="0" max="100" step="0.1" value="${Number(label.x) || 0}">
        </label>
        <label>
            Y Position (%)
            <input data-marker-field="y" type="number" min="0" max="100" step="0.1" value="${Number(label.y) || 0}">
        </label>
        <div class="row-actions">
            <button class="row-action" data-marker-action="delete" data-marker-index="${index}" type="button">Delete</button>
        </div>
    </div>`;
}

function MapLabellingEditor(block) {
    const markers = (block.labels || []).map((label, index) =>
        `<button class="map-editor-marker" data-marker-index="${index}" style="left:${Number(label.x) || 0}%;top:${Number(label.y) || 0}%" type="button">${Number(label.questionNumber) || "?"}</button>`
    ).join("");

    return `${commonEditorFields(block)}
        <section class="editor-section">
            <div class="editor-section-head">
                <div>
                    <h3>Map Image and Markers</h3>
                    <small style="color: var(--muted);">${escapeHtml(block.imageFileName || "No image uploaded. Acceptable format: JPG, PNG, WEBP")}</small>
                </div>
                <label class="btn btn-secondary" for="mapImageInput" style="margin-bottom:0;">
                    ${block.imageUrl ? "Change image" : "Upload image"}
                </label>
                <input id="mapImageInput" class="upload-input" type="file" style="display: none;" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp">
            </div>
            <div id="mapEditorCanvas" class="map-editor-canvas">${block.imageUrl ? `<img src="${escapeHtml(block.imageUrl)}" alt="Map editor image">${markers}` : '<div class="builder-empty">Upload an image, then click it to add markers.</div>'}</div>
            <p style="font-size: 12px; color: var(--muted); margin: 8px 0 16px 0;">Click the image to place a new marker. Drag markers to reposition them.</p>
            <div class="editor-row-list">${(block.labels || []).map(markerEditor).join("")}</div>
        </section>`;
}

function blockEditorFor(block) {
    const editors = {
        form_completion: FormCompletionEditor,
        multiple_select: MultipleSelectEditor,
        sentence_completion_inline: SentenceCompletionInlineEditor,
        multiple_choice: MultipleChoiceEditor,
        note_completion: NoteCompletionEditor,
        table_completion: TableCompletionEditor,
        matching: MatchingEditor,
        map_labelling: MapLabellingEditor
    };
    return editors[block.type](block);
}

function setupMapMarkerDrag() {
    blockEditorContent.querySelectorAll(".map-editor-marker").forEach((marker) => {
        marker.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const canvas = document.getElementById("mapEditorCanvas");
            const index = Number(marker.dataset.markerIndex);

            function move(moveEvent) {
                const rect = canvas.getBoundingClientRect();
                const x = Math.min(100, Math.max(0, ((moveEvent.clientX - rect.left) / rect.width) * 100));
                const y = Math.min(100, Math.max(0, ((moveEvent.clientY - rect.top) / rect.height) * 100));
                blockDraft.labels[index].x = Number(x.toFixed(2));
                blockDraft.labels[index].y = Number(y.toFixed(2));
                marker.style.left = `${x}%`;
                marker.style.top = `${y}%`;
                const row = blockEditorContent.querySelector(`[data-marker-row="${index}"]`);
                if (row) {
                    row.querySelector('[data-marker-field="x"]').value = x.toFixed(2);
                    row.querySelector('[data-marker-field="y"]').value = y.toFixed(2);
                }
            }

            function stop() {
                document.removeEventListener("pointermove", move);
                document.removeEventListener("pointerup", stop);
            }

            document.addEventListener("pointermove", move);
            document.addEventListener("pointerup", stop);
        });
    });
}

function renderBlockEditor() {
    blockEditorTitle.textContent = blockTypeName(blockDraft.type);
    blockEditorContent.innerHTML = blockEditorFor(blockDraft);
    if (blockDraft.type === "map_labelling") setupMapMarkerDrag();
}

function valueFromTemplate(text) {
    const value = String(text || "").trim();
    const matches = [...value.matchAll(/\{\{(\d{1,2})\}\}/g)];

    if (!matches.length) return { type: "text", text: value };
    if (matches.length === 1 && matches[0][0] === value) {
        return { type: "input", questionNumber: Number(matches[0][1]), answerKey: `q${matches[0][1]}` };
    }

    const parts = [];
    let lastIndex = 0;
    matches.forEach((match) => {
        if (match.index > lastIndex) parts.push({ type: "text", text: value.slice(lastIndex, match.index) });
        parts.push({ type: "input", questionNumber: Number(match[1]), answerKey: `q${match[1]}` });
        lastIndex = match.index + match[0].length;
    });
    if (lastIndex < value.length) parts.push({ type: "text", text: value.slice(lastIndex) });
    return { type: "mixed", parts };
}

function parsePipeLines(value, mapper) {
    return String(value || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => mapper(line.split("|").map((item) => item.trim())));
}

function syncBlockEditorForm() {
    if (!blockDraft) return;

    blockEditorContent.querySelectorAll("[data-block-field]").forEach((field) => {
        const key = field.dataset.blockField;
        const value = field.value;

        if (key === "content") {
            blockDraft.content = blockDraft.type === "sentence_completion_inline"
                ? value.split(/\n\s*\n|\n/).map((line) => line.trim()).filter(Boolean)
                : value.split("\n");
        } else if (key === "columns") {
            blockDraft.columns = value.split("|").map((item) => item.trim()).filter(Boolean);
        } else if (key === "rows") {
            blockDraft.rows = parsePipeLines(value, (cells) => cells.map(valueFromTemplate));
        } else if (key === "matchingOptions") {
            blockDraft.options = parsePipeLines(value, ([letter, ...text]) => ({ letter, text: text.join(" | ") }));
        } else if (key === "matchingQuestions") {
            blockDraft.questions = parsePipeLines(value, ([number, ...text]) => ({ questionNumber: Number(number), text: text.join(" | ") }));
        } else if (["questionNumber", "maxSelections"].includes(key)) {
            blockDraft[key] = Number(value);
        } else {
            blockDraft[key] = value;
        }
    });

    if (blockDraft.type === "form_completion") {
        blockDraft.rows = [...blockEditorContent.querySelectorAll("[data-form-row]")].map((row) => {
            const read = (field) => row.querySelector(`[data-row-field="${field}"]`).value;
            const type = read("valueType");
            const number = Number(read("questionNumber"));
            let val;

            if (type === "input") {
                val = { type, questionNumber: number, answerKey: `q${number}` };
            } else if (type === "mixed") {
                val = {
                    type,
                    parts: [
                        { type: "text", text: read("prefix") },
                        { type: "input", questionNumber: number, answerKey: `q${number}` },
                        { type: "text", text: read("suffix") }
                    ]
                };
            } else {
                val = { type: "text", text: read("text") };
            }

            return { label: read("label"), value: val };
        });
    }

    if (["multiple_select", "multiple_choice"].includes(blockDraft.type)) {
        blockDraft.options = [...blockEditorContent.querySelectorAll("[data-option-row]")].map((row) => ({
            letter: row.querySelector('[data-option-field="letter"]').value,
            text: row.querySelector('[data-option-field="text"]').value
        }));
    }

    if (blockDraft.type === "map_labelling") {
        blockDraft.labels = [...blockEditorContent.querySelectorAll("[data-marker-row]")].map((row) => {
            const read = (field) => Number(row.querySelector(`[data-marker-field="${field}"]`).value);
            const questionNumber = read("questionNumber");
            return { questionNumber, answerKey: `q${questionNumber}`, x: read("x"), y: read("y") };
        });
    }
}

function openBlockEditor(index) {
    editingBlockIndex = index;
    blockDraft = clone(selectedPart().blocks[index]);
    renderBlockEditor();
    blockEditorModal.showModal();
}

function StudentPreviewModal() {
    studentPreviewContent.innerHTML = ListeningTestPage(buildSavePayload());
    bindListeningTest(studentPreviewContent);
    studentPreviewModal.showModal();
}

function createDefaultBlock(type) {
    const number = nextQuestionNumber();
    const base = { id: uniqueId("block"), type, title: `${blockTypeName(type)} Block`, instruction: "Complete the fields.", questionRange: `Question ${number}` };

    const defaultOptions = () => [
        { letter: "A", text: "Option A" },
        { letter: "B", text: "Option B" },
        { letter: "C", text: "Option C" }
    ];

    if (type === "form_completion") {
        return {
            ...base,
            instruction: "Complete the form below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER.",
            rows: [{ label: "Name:", value: { type: "input", questionNumber: number, answerKey: `q${number}` } }]
        };
    }
    if (type === "multiple_select") {
        return {
            ...base,
            questionNumber: number,
            maxSelections: 2,
            question: "Which TWO options represent correct answers?",
            options: defaultOptions()
        };
    }
    if (type === "sentence_completion_inline") {
        return {
            ...base,
            instruction: "Complete the sentences below. Write ONE WORD ONLY.",
            content: [`The library was constructed in the year {{${number}}}.`]
        };
    }
    if (type === "multiple_choice") {
        return {
            ...base,
            questionNumber: number,
            question: "Choose the correct letter, A, B or C.",
            options: defaultOptions()
        };
    }
    if (type === "note_completion") {
        return {
            ...base,
            instruction: "Complete the notes below. Choose ONE WORD ONLY.",
            content: [`- Initial topic study: {{${number}}}`]
        };
    }
    if (type === "table_completion") {
        return {
            ...base,
            columns: ["Topic", "Location", "Time"],
            rows: [[{ type: "text", text: "Discussion" }, { type: "input", questionNumber: number, answerKey: `q${number}` }, { type: "text", text: "10:00 AM" }]]
        };
    }
    if (type === "matching") {
        return {
            ...base,
            instruction: "Match the questions with the letters A-C.",
            options: defaultOptions(),
            questions: [{ questionNumber: number, text: "Match item detail" }]
        };
    }

    return {
        ...base,
        instruction: "Label the map below.",
        imageUrl: "",
        imageFileName: "",
        labels: [{ questionNumber: number, answerKey: `q${number}`, x: 50, y: 50 }]
    };
}

function nextQuestionNumber() {
    let max = 0;
    builderState.parts.forEach((part) => {
        const nums = collectQuestionNumbersFromBlocks(part.blocks || []);
        if (nums.length) max = Math.max(max, ...nums);
    });
    return max >= 40 ? 1 : max + 1;
}

function buildSavePayload() {
    const title = testTitleInput.value.trim();
    const duration = currentDurationMinutes();
    const parts = ensureFourParts(builderState.parts);
    const payload = {
        ...builderState,
        title,
        duration,
        parts
    };

    if (saveScope === "part") {
        const part = parts.find((item) => Number(item.partNumber) === savePartNumber) || parts[savePartNumber - 1];
        return {
            ...payload,
            part: savePartNumber,
            parts: [part]
        };
    }
    return {
        ...payload,
        part: "full",
        parts
    };
}

function collectQuestionNumbersFromBlocks(value) {
    const numbers = new Set();
    function inspect(item, key) {
        if (key === "questionNumber" && Number.isFinite(Number(item))) {
            const number = Number(item);
            if (number >= 1 && number <= 40) numbers.add(number);
        }
        if (typeof item === "string") {
            for (const match of item.matchAll(/\{\{(\d{1,2})\}\}/g)) {
                const number = Number(match[1]);
                if (number >= 1 && number <= 40) numbers.add(number);
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

function parseAnswerNumbers(answerText) {
    const answers = new Set();
    String(answerText || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            const match = line.match(/^(\d{1,2})\s*[\).:\-=\|]\s*(.+)$/);
            if (match && match[2].trim()) {
                answers.add(Number(match[1]));
            }
        });
    return answers;
}

function validateListeningPayload(payload) {
    if (!payload.title) {
        throw new Error("Enter a test title before saving.");
    }
    (payload.parts || []).forEach((part) => {
        const partNumber = Number(part.partNumber) || 1;
        const numbers = collectQuestionNumbersFromBlocks(part.blocks || []);
        const answerNumbers = parseAnswerNumbers(part.answerText || "");

        if (!String(part.audioUrl || "").trim()) {
            throw new Error(`Upload audio for Listening Part ${partNumber}.`);
        }
        if (!numbers.length) {
            throw new Error(`Add at least one question block for Listening Part ${partNumber}.`);
        }
        const missing = numbers.filter((number) => !answerNumbers.has(number));
        if (missing.length) {
            throw new Error(`Add correct answer for Listening Part ${partNumber} question(s): ${missing.join(", ")}.`);
        }
        const extra = [...answerNumbers].filter((number) => !numbers.includes(number));
        if (extra.length) {
            throw new Error(`Answer key for Part ${partNumber} has question(s) not in this part: ${extra.join(", ")}.`);
        }
    });
}

async function saveTest() {
    const payload = buildSavePayload();
    validateListeningPayload(payload);

    showStatus(saveScope === "full" ? "Saving Full Listening test..." : `Saving Listening Part ${savePartNumber}...`);
    const shouldUpdate = editingTestId && loadedSaveKey === saveKey();
    const result = shouldUpdate
        ? await updateListeningTest(editingTestId, payload)
        : await createListeningTest(payload);

    hydrateBuilderState(result.test);
    editingTestId = result.test.id;
    loadedSaveKey = saveKey();
    history.replaceState({}, "", `admin-listening.html?id=${encodeURIComponent(editingTestId)}`);
    ListeningTestBuilder();
    showStatus(saveScope === "full" ? "Full Listening test saved." : `Listening Part ${savePartNumber} saved.`, "success");
}

async function loadTest(id) {
    showStatus("Loading Listening test...");
    const response = await fetch(`/api/listening-tests/${encodeURIComponent(id)}`);
    const data = await readResponse(response);
    hydrateBuilderState(data);
    editingTestId = data.id;
    ListeningTestBuilder();
    showStatus("Saved test loaded.", "success");
}

async function loadSavedTests(openModal = true) {
    savedTestsList.textContent = "Loading...";
    if (openModal && !savedTestsModal.open) savedTestsModal.showModal();
    const tests = await readResponse(await fetch("/api/listening-tests"));

    savedTestsList.innerHTML = tests.length ? tests.map((test) => `<article class="saved-test-row">
        <div><h3>${escapeHtml(test.title)}</h3><p>${Number(test.questionCount) || 0} questions</p></div>
        <div class="audio-upload-actions" style="display: flex; gap: 8px;">
            <a class="btn btn-secondary" href="${escapeHtml(test.openUrl || `/listening/${encodeURIComponent(test.slug || test.title || "test")}`)}" target="_blank">Open student view</a>
            ${test.readOnly ? "" : `<button class="btn btn-primary" data-load-test="${escapeHtml(test.id)}" type="button">Edit</button>`}
            <button class="btn btn-danger" data-delete-test="${escapeHtml(test.id)}" type="button">Delete</button>
        </div>
    </article>`).join("") : '<div class="builder-empty">No saved Listening tests yet.</div>';
}

// Global Event Listeners & Event Delegation
testScopeRoot.addEventListener("click", (event) => {
    const button = event.target.closest("[data-save-scope]");
    if (!button) return;
    applySaveScope(button.dataset.saveScope, button.dataset.savePart || savePartNumber);
    if (editingTestId && loadedSaveKey !== saveKey()) {
        showStatus("This selection will create a new Listening test when you save.");
    }
    ListeningTestBuilder();
});

partSidebarRoot.addEventListener("click", (event) => {
    const button = event.target.closest("[data-part-index]");
    if (!button) return;
    selectedPartIndex = Number(button.dataset.partIndex);
    if (saveScope === "part") {
        savePartNumber = Number(selectedPart().partNumber) || (selectedPartIndex + 1);
        if (editingTestId && loadedSaveKey !== saveKey()) {
            showStatus("This part will be saved as a new Listening test.");
        }
    }
    ListeningTestBuilder();
});

partEditorRoot.addEventListener("input", (event) => {
    const field = event.target.closest("[data-part-field]");
    if (!field) return;
    selectedPart()[field.dataset.partField] = field.value;
});

partEditorRoot.addEventListener("change", async (event) => {
    if (event.target.id !== "audioInput" || !event.target.files.length) return;
    showStatus("Uploading part audio...");
    try {
        const result = await uploadAudio(event.target.files[0]);
        selectedPart().audioUrl = result.audioUrl;
        selectedPart().audioFileName = result.fileName;
        ListeningTestBuilder();
        showStatus("Audio uploaded.", "success");
    } catch (error) {
        showStatus(error.message, "error");
    }
});

partEditorRoot.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const index = Number(button.dataset.blockIndex);
    const blocks = selectedPart().blocks;

    if (action === "add-block") addBlockModal.showModal();
    if (action === "remove-audio") {
        selectedPart().audioUrl = "";
        selectedPart().audioFileName = "";
        ListeningTestBuilder();
    }
    if (action === "edit-block") openBlockEditor(index);
    if (action === "duplicate-block") {
        const copy = clone(blocks[index]);
        copy.id = uniqueId("block");
        blocks.splice(index + 1, 0, copy);
        ListeningTestBuilder();
    }
    if (action === "delete-block" && confirm("Delete this question block?")) {
        blocks.splice(index, 1);
        ListeningTestBuilder();
    }
    if (action === "move-up" && index > 0) {
        [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
        ListeningTestBuilder();
    }
    if (action === "move-down" && index < blocks.length - 1) {
        [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]];
        ListeningTestBuilder();
    }
});

addBlockMenuRoot.innerHTML = AddQuestionBlockMenu();
addBlockMenuRoot.addEventListener("click", (event) => {
    const button = event.target.closest("[data-block-type]");
    if (!button) return;
    const block = createDefaultBlock(button.dataset.blockType);
    selectedPart().blocks.push(block);
    addBlockModal.close();
    ListeningTestBuilder();
    openBlockEditor(selectedPart().blocks.length - 1);
});

blockEditorContent.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-editor-action], [data-row-action], [data-option-action], [data-marker-action]");
    if (actionButton) {
        syncBlockEditorForm();
        if (actionButton.dataset.editorAction === "add-form-row") {
            blockDraft.rows.push({ label: "New row", value: { type: "text", text: "" } });
        }
        if (actionButton.dataset.editorAction === "add-option") {
            blockDraft.options.push({ letter: String.fromCharCode(65 + blockDraft.options.length), text: "New option" });
        }
        if (actionButton.dataset.rowAction === "delete") blockDraft.rows.splice(Number(actionButton.dataset.rowIndex), 1);
        if (actionButton.dataset.optionAction === "delete") blockDraft.options.splice(Number(actionButton.dataset.optionIndex), 1);
        if (actionButton.dataset.markerAction === "delete") blockDraft.labels.splice(Number(actionButton.dataset.markerIndex), 1);
        renderBlockEditor();
        return;
    }

    const canvas = event.target.closest("#mapEditorCanvas");
    if (!canvas || !blockDraft.imageUrl || event.target.closest(".map-editor-marker")) return;
    syncBlockEditorForm();
    const rect = canvas.getBoundingClientRect();
    const x = Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(2));
    const y = Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(2));
    const number = blockDraft.labels.length
        ? Math.max(...blockDraft.labels.map((label) => Number(label.questionNumber) || 0)) + 1
        : nextQuestionNumber();
    blockDraft.labels.push({ questionNumber: number, answerKey: `q${number}`, x, y });
    renderBlockEditor();
});

blockEditorContent.addEventListener("change", async (event) => {
    if (event.target.id !== "mapImageInput" || !event.target.files.length) return;
    syncBlockEditorForm();
    try {
        const result = await uploadImage(event.target.files[0]);
        blockDraft.imageUrl = result.imageUrl;
        blockDraft.imageFileName = result.fileName;
        renderBlockEditor();
    } catch (error) {
        showStatus(error.message, "error");
    }
});

blockEditorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    syncBlockEditorForm();
    selectedPart().blocks[editingBlockIndex] = blockDraft;
    blockEditorModal.close();
    ListeningTestBuilder();
    showStatus("Question block updated.", "success");
});

testTitleInput.addEventListener("input", () => {
    builderState.title = testTitleInput.value;
});

btnNewTest.addEventListener("click", () => {
    if (!confirm("Clear active workspace and create a new Listening test?")) return;
    builderState = createBlankTest();
    editingTestId = null;
    selectedPartIndex = 0;
    saveScope = "full";
    savePartNumber = 1;
    loadedSaveKey = "full";
    history.replaceState({}, "", "admin-listening.html");
    ListeningTestBuilder();
    showStatus("New test builder ready.", "success");
});

document.getElementById("previewBtn").addEventListener("click", StudentPreviewModal);
document.getElementById("saveTestBtn").addEventListener("click", () => saveTest().catch((error) => showStatus(error.message, "error")));
document.getElementById("loadTestsBtn").addEventListener("click", () => loadSavedTests().catch((error) => {
    savedTestsList.textContent = error.message;
}));

savedTestsList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-test]");
    if (deleteButton) {
        deleteListeningTest(deleteButton.dataset.deleteTest).catch((error) => showStatus(error.message, "error"));
        return;
    }
    const button = event.target.closest("[data-load-test]");
    if (!button) return;
    savedTestsModal.close();
    loadTest(button.dataset.loadTest).catch((error) => showStatus(error.message, "error"));
});

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-close-dialog]");
    if (!button) return;
    document.getElementById(button.dataset.closeDialog).close();
});

// App Entry Initialization
ListeningTestBuilder();
const initialId = new URLSearchParams(window.location.search).get("id");
if (initialId) {
    loadTest(initialId).catch((error) => showStatus(error.message, "error"));
}
