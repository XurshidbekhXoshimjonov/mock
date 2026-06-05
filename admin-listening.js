const {
    escapeHtml,
    clone,
    uniqueId,
    sampleListeningTest,
    ListeningTestPage,
    bindListeningTest
} = window.ListeningComponents;

const partSidebarRoot = document.getElementById("partSidebar");
const partEditorRoot = document.getElementById("partEditor");
const testScopeRoot = document.getElementById("testScope");
const testTitleInput = document.getElementById("testTitle");
const testDurationInput = document.getElementById("testDuration");
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

const BLOCK_TYPES = [
    { type: "form_completion", name: "Form Completion", description: "Build a full form with text rows and answer blanks." },
    { type: "multiple_select", name: "Multiple Select", description: "Checkbox task with a maximum number of choices." },
    { type: "sentence_completion_inline", name: "Inline Sentence Completion", description: "Turn {{number}} placeholders into inline inputs." },
    { type: "multiple_choice", name: "Multiple Choice", description: "One radio-button answer from lettered options." },
    { type: "note_completion", name: "Note Completion", description: "Notes and bullet points with inline placeholders." },
    { type: "table_completion", name: "Table Completion", description: "Rows and columns with blank placeholders in cells." },
    { type: "matching", name: "Matching", description: "Option bank with a dropdown for every question row." },
    { type: "map_labelling", name: "Map / Diagram Labelling", description: "Upload an image and place percentage-based markers." }
];

let builderState = sampleListeningTest();
let selectedPartIndex = 0;
let editingTestId = null;
let saveScope = "full";
let savePartNumber = 1;
let loadedSaveKey = "full";
let editingBlockIndex = null;
let blockDraft = null;

const LISTENING_PART_NUMBERS = [1, 2, 3, 4];

function showStatus(message, type = "") {
    builderStatus.textContent = message;
    builderStatus.className = `builder-status ${type ? `is-${type}` : ""}`;
}

function selectedPart() {
    return builderState.parts[selectedPartIndex];
}

function createBlankPart(partNumber) {
    const template = sampleListeningTest().parts.find((part) => Number(part.partNumber) === Number(partNumber)) || {};
    const start = ((Number(partNumber) || 1) - 1) * 10 + 1;
    const end = start + 9;

    return {
        partNumber: Number(partNumber),
        title: template.title || `Part ${partNumber}`,
        questionRange: template.questionRange || `Questions ${start}-${end}`,
        audioUrl: "",
        audioFileName: "",
        instruction: template.instruction || `Listen and answer Questions ${start}-${end}.`,
        answerText: "",
        blocks: []
    };
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

function hydrateBuilderState(test) {
    const base = sampleListeningTest();
    const part = test?.part === "full" ? "full" : normalizePartNumber(test?.part);
    const nextParts = ensureFourParts(Array.isArray(test?.parts) ? test.parts : base.parts);

    builderState = {
        ...base,
        ...(test || {}),
        parts: nextParts
    };
    applySaveScope(part === "full" ? "full" : "part", part === "full" ? 1 : part);
    selectedPartIndex = saveScope === "part" ? savePartNumber - 1 : 0;
    loadedSaveKey = saveKey();
}

function normalizePartNumber(value) {
    const number = Number(value);
    return LISTENING_PART_NUMBERS.includes(number) ? number : 1;
}

function blockTypeName(type) {
    return BLOCK_TYPES.find((item) => item.type === type)?.name || type;
}

function blockSummary(block) {
    return block.title || block.question || block.questionRange || "Untitled block";
}

function nextQuestionNumber(part = selectedPart()) {
    const matches = JSON.stringify(part.blocks || []).match(/\d{1,2}/g) || [];
    const numbers = matches.map(Number).filter((number) => number >= 1 && number <= 40);
    const partStart = ((Number(part.partNumber) || 1) - 1) * 10 + 1;
    return numbers.length ? Math.max(...numbers) + 1 : partStart;
}

function defaultOptions() {
    return [
        { letter: "A", text: "Option A" },
        { letter: "B", text: "Option B" },
        { letter: "C", text: "Option C" },
        { letter: "D", text: "Option D" }
    ];
}

function createDefaultBlock(type) {
    const number = nextQuestionNumber();
    const base = {
        id: uniqueId("block"),
        type,
        title: "",
        questionRange: `Question ${number}`,
        instruction: ""
    };

    if (type === "form_completion") {
        return {
            ...base,
            title: "FORM TITLE",
            rows: [
                { label: "First field", value: { type: "input", questionNumber: number, answerKey: `q${number}` } },
                { label: "Information row", value: { type: "text", text: "Visible information" } }
            ]
        };
    }

    if (type === "multiple_select") {
        return { ...base, questionNumber: number, instruction: "Mark TWO letters that represent the correct answer.", maxSelections: 2, question: "Enter the question.", options: defaultOptions() };
    }

    if (type === "sentence_completion_inline") {
        return { ...base, title: `Question ${number}`, instruction: "Fill in the blank.", content: [`Write the sentence with an inline blank here {{${number}}}.`] };
    }

    if (type === "multiple_choice") {
        return { ...base, questionNumber: number, instruction: "Choose the correct letter.", question: "Enter the question.", options: defaultOptions() };
    }

    if (type === "note_completion") {
        return { ...base, title: "NOTES", instruction: "Complete the notes.", content: [`- Note item {{${number}}}`, "- Visible note item"] };
    }

    if (type === "table_completion") {
        return { ...base, title: "TABLE TITLE", instruction: "Complete the table.", columns: ["Category", "Details"], rows: [["First row", `{{${number}}}`], ["Visible row", "Visible value"]] };
    }

    if (type === "matching") {
        return {
            ...base,
            instruction: "Match each question with the correct option.",
            options: defaultOptions(),
            questions: [{ questionNumber: number, text: "Question to match" }]
        };
    }

    return {
        ...base,
        title: `Question ${number}`,
        instruction: "Label the map below.",
        imageUrl: "",
        imageFileName: "",
        labels: [{ questionNumber: number, answerKey: `q${number}`, x: 50, y: 50 }]
    };
}

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
        builderState = sampleListeningTest();
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

window.createListeningTest = createListeningTest;
window.updateListeningTest = updateListeningTest;
window.uploadAudio = uploadAudio;
window.uploadImage = uploadImage;

function SaveScopeSelector() {
    return `<section class="builder-save-scope">
        <div class="builder-save-scope__text">
            <span>Create as</span>
            <strong>${saveScope === "full" ? "Full Listening Test" : `Listening Part ${savePartNumber}`}</strong>
            <p>${saveScope === "full"
                ? "Save all four parts together. Part tests are published automatically."
                : `Only Part ${savePartNumber} will be saved as an individual Listening test.`}</p>
        </div>
        <div class="builder-save-scope__actions">
            <button class="${saveScope === "full" ? "is-active" : ""}" data-save-scope="full" type="button">Full Test</button>
            ${LISTENING_PART_NUMBERS.map((number) => `<button class="${saveScope === "part" && savePartNumber === number ? "is-active" : ""}" data-save-scope="part" data-save-part="${number}" type="button">Part ${number}</button>`).join("")}
        </div>
    </section>`;
}

function PartSidebar() {
    return `<div class="part-sidebar-list">${builderState.parts.map((part, index) => `
        <button class="part-sidebar-button ${index === selectedPartIndex ? "is-active" : ""} ${saveScope === "part" && Number(part.partNumber) === savePartNumber ? "is-save-target" : ""}" data-part-index="${index}" type="button">
            <strong>${escapeHtml(part.title)}</strong>
            <span>${escapeHtml(part.questionRange)}</span>
            <small>${(part.blocks || []).length} question blocks${saveScope === "part" && Number(part.partNumber) === savePartNumber ? " · will save" : ""}</small>
        </button>
    `).join("")}</div>`;
}

function AudioUpload(part) {
    return `<section class="audio-upload-card">
        <div class="audio-upload-head">
            <div>
                <h3>Part audio</h3>
                <p>${part.audioFileName ? escapeHtml(part.audioFileName) : "Accepted formats: mp3, wav, m4a"}</p>
            </div>
            <div class="audio-upload-actions">
                <label class="builder-button builder-button--light" for="audioInput">${part.audioUrl ? "Change audio" : "Upload audio"}</label>
                <input id="audioInput" class="upload-input" type="file" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4">
                ${part.audioUrl ? '<button data-action="remove-audio" type="button">Remove audio</button>' : ""}
            </div>
        </div>
        ${part.audioUrl ? `<audio controls preload="metadata" src="${escapeHtml(part.audioUrl)}"></audio>` : ""}
    </section>`;
}

function QuestionBlockList(part) {
    if (!(part.blocks || []).length) {
        return '<div class="builder-empty">No blocks in this part yet. Add the first IELTS-style question block.</div>';
    }

    return `<div class="question-blocks-list">${part.blocks.map((block, index) => `
        <article class="question-block-card">
            <div class="question-block-head">
                <div>
                    <span class="block-type-label">${escapeHtml(blockTypeName(block.type))}</span>
                    <h4>${escapeHtml(block.questionRange || "Questions")}</h4>
                    <p>${escapeHtml(blockSummary(block))}</p>
                </div>
                <div class="block-actions">
                    <button data-action="move-up" data-block-index="${index}" type="button" ${index === 0 ? "disabled" : ""}>Up</button>
                    <button data-action="move-down" data-block-index="${index}" type="button" ${index === part.blocks.length - 1 ? "disabled" : ""}>Down</button>
                    <button data-action="duplicate-block" data-block-index="${index}" type="button">Duplicate</button>
                    <button data-action="edit-block" data-block-index="${index}" type="button">Edit</button>
                    <button data-action="delete-block" data-block-index="${index}" type="button">Delete</button>
                </div>
            </div>
        </article>
    `).join("")}</div>`;
}

function PartEditor() {
    const part = selectedPart();
    return `<section class="part-editor-card">
        <div class="part-editor-head">
            <div>
                <h2>${escapeHtml(part.title)}</h2>
                <p>Edit audio, instructions, and structured question blocks for this part.</p>
            </div>
        </div>
        <div class="part-fields">
            <label>
                Part title
                <input data-part-field="title" type="text" value="${escapeHtml(part.title)}">
            </label>
            <label>
                Question range
                <input data-part-field="questionRange" type="text" value="${escapeHtml(part.questionRange)}">
            </label>
            <label class="part-instruction-field">
                Part instruction
                <textarea data-part-field="instruction">${escapeHtml(part.instruction || "")}</textarea>
            </label>
            <label class="part-instruction-field">
                Answer key for this part
                <textarea data-part-field="answerText" placeholder="1 | answer&#10;2 | answer">${escapeHtml(part.answerText || "")}</textarea>
                <small>These answers stay with the part and are inherited automatically by Full Listening tests.</small>
            </label>
        </div>
        ${AudioUpload(part)}
        <div class="question-blocks-head">
            <h3>Question blocks</h3>
            <button class="builder-button builder-button--primary" data-action="add-block" type="button">Add Question Block</button>
        </div>
        ${QuestionBlockList(part)}
    </section>`;
}

function ListeningTestBuilder() {
    testTitleInput.value = builderState.title || "";
    testDurationInput.value = Number(builderState.duration) || 30;
    testScopeRoot.innerHTML = SaveScopeSelector();
    partSidebarRoot.innerHTML = PartSidebar();
    partEditorRoot.innerHTML = PartEditor();
}

function AddQuestionBlockMenu() {
    return BLOCK_TYPES.map((item) => `<button class="block-type-button" data-block-type="${item.type}" type="button">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.description)}</span>
    </button>`).join("");
}

function commonEditorFields(block) {
    return `<div class="editor-grid">
        <label class="editor-field">
            Block title / summary
            <input data-block-field="title" type="text" value="${escapeHtml(block.title || "")}">
        </label>
        <label class="editor-field">
            Question range
            <input data-block-field="questionRange" type="text" value="${escapeHtml(block.questionRange || "")}">
        </label>
        <label class="editor-field editor-field--wide">
            Instruction
            <textarea data-block-field="instruction">${escapeHtml(block.instruction || "")}</textarea>
        </label>
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
        <label class="editor-field row-label">Left label<input data-row-field="label" value="${escapeHtml(row.label || "")}"></label>
        <label class="editor-field row-type">Right value type<select data-row-field="valueType">
            <option value="text" ${value.type === "text" ? "selected" : ""}>Text</option>
            <option value="input" ${value.type === "input" ? "selected" : ""}>Input</option>
            <option value="mixed" ${value.type === "mixed" ? "selected" : ""}>Mixed text + input</option>
        </select></label>
        <div class="row-value-fields">
            <label class="editor-field">Text<input data-row-field="text" value="${escapeHtml(value.text)}"></label>
            <label class="editor-field">Question #<input data-row-field="questionNumber" type="number" min="1" max="40" value="${escapeHtml(value.questionNumber)}"></label>
            <label class="editor-field">Prefix<input data-row-field="prefix" value="${escapeHtml(value.prefix)}"></label>
            <label class="editor-field">Suffix<input data-row-field="suffix" value="${escapeHtml(value.suffix)}"></label>
        </div>
        <div class="row-actions"><button class="row-action" data-row-action="delete" data-row-index="${index}" type="button">Delete</button></div>
    </div>`;
}

function FormCompletionEditor(block) {
    return `${commonEditorFields(block)}
        <section class="editor-section">
            <div class="editor-section-head"><h3>Form rows</h3><button class="builder-button builder-button--light" data-editor-action="add-form-row" type="button">Add row</button></div>
            <div class="editor-row-list">${(block.rows || []).map(formRowEditor).join("")}</div>
        </section>`;
}

function optionEditor(option, index) {
    return `<div class="option-editor" data-option-row="${index}">
        <label class="editor-field option-letter">Letter<input data-option-field="letter" value="${escapeHtml(option.letter || "")}"></label>
        <label class="editor-field option-text">Option text<input data-option-field="text" value="${escapeHtml(option.text || "")}"></label>
        <div class="row-actions"><button class="row-action" data-option-action="delete" data-option-index="${index}" type="button">Delete</button></div>
    </div>`;
}

function choicesEditor(block, multiple) {
    return `${commonEditorFields(block)}
        <div class="editor-grid">
            <label class="editor-field">
                Question number
                <input data-block-field="questionNumber" type="number" min="1" max="40" value="${Number(block.questionNumber) || ""}">
            </label>
            ${multiple ? `<label class="editor-field">Maximum selections<input data-block-field="maxSelections" type="number" min="1" max="10" value="${Number(block.maxSelections) || 2}"></label>` : ""}
            <label class="editor-field editor-field--wide">Question text<textarea data-block-field="question">${escapeHtml(block.question || "")}</textarea></label>
        </div>
        <section class="editor-section">
            <div class="editor-section-head"><h3>Lettered options</h3><button class="builder-button builder-button--light" data-editor-action="add-option" type="button">Add option</button></div>
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
        <label class="editor-field editor-section">Sentences with {{number}} placeholders
            <textarea data-block-field="content" rows="10">${escapeHtml(content)}</textarea>
        </label>`;
}

function NoteCompletionEditor(block) {
    const content = Array.isArray(block.content) ? block.content.join("\n") : block.content || "";
    return `${commonEditorFields(block)}
        <label class="editor-field editor-section">Note content. Use "- " for bullets and {{number}} for blanks.
            <textarea data-block-field="content" rows="11">${escapeHtml(content)}</textarea>
        </label>`;
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
        <div class="editor-grid editor-section">
            <label class="editor-field editor-field--wide">Column headings, separated with |
                <input data-block-field="columns" value="${escapeHtml((block.columns || []).join(" | "))}">
            </label>
            <label class="editor-field editor-field--wide">Table rows, one per line. Separate cells with | and use {{number}} for blanks.
                <textarea data-block-field="rows" rows="10">${escapeHtml(rows)}</textarea>
            </label>
        </div>`;
}

function MatchingEditor(block) {
    const options = (block.options || []).map((option) => `${option.letter} | ${option.text}`).join("\n");
    const questions = (block.questions || []).map((question) => `${question.questionNumber} | ${question.text}`).join("\n");
    return `${commonEditorFields(block)}
        <div class="editor-grid editor-section">
            <label class="editor-field">Options, one per line: A | text
                <textarea data-block-field="matchingOptions" rows="10">${escapeHtml(options)}</textarea>
            </label>
            <label class="editor-field">Questions, one per line: 21 | text
                <textarea data-block-field="matchingQuestions" rows="10">${escapeHtml(questions)}</textarea>
            </label>
        </div>`;
}

function markerEditor(label, index) {
    return `<div class="marker-editor" data-marker-row="${index}">
        <label class="editor-field marker-question">Question #<input data-marker-field="questionNumber" type="number" min="1" max="40" value="${Number(label.questionNumber) || ""}"></label>
        <label class="editor-field marker-x">X %<input data-marker-field="x" type="number" min="0" max="100" step="0.1" value="${Number(label.x) || 0}"></label>
        <label class="editor-field marker-y">Y %<input data-marker-field="y" type="number" min="0" max="100" step="0.1" value="${Number(label.y) || 0}"></label>
        <div class="row-actions"><button class="row-action" data-marker-action="delete" data-marker-index="${index}" type="button">Delete marker</button></div>
    </div>`;
}

function MapLabellingEditor(block) {
    const markers = (block.labels || []).map((label, index) =>
        `<button class="map-editor-marker" data-marker-index="${index}" style="left:${Number(label.x) || 0}%;top:${Number(label.y) || 0}%" type="button">${Number(label.questionNumber) || "?"}</button>`
    ).join("");

    return `${commonEditorFields(block)}
        <section class="editor-section">
            <div class="editor-section-head">
                <div><h3>Map image and markers</h3><small>${escapeHtml(block.imageFileName || "jpg, jpeg, png, webp")}</small></div>
                <label class="builder-button builder-button--light" for="mapImageInput">${block.imageUrl ? "Change image" : "Upload image"}</label>
                <input id="mapImageInput" class="upload-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp">
            </div>
            <div id="mapEditorCanvas" class="map-editor-canvas">${block.imageUrl ? `<img src="${escapeHtml(block.imageUrl)}" alt="Map editor image">${markers}` : '<div class="builder-empty">Upload an image, then click it to add markers.</div>'}</div>
            <p class="builder-status">Click the image to add a marker. Drag a blue marker to reposition it.</p>
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
                row.querySelector('[data-marker-field="x"]').value = x.toFixed(2);
                row.querySelector('[data-marker-field="y"]').value = y.toFixed(2);
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
            let value;

            if (type === "input") {
                value = { type, questionNumber: number, answerKey: `q${number}` };
            } else if (type === "mixed") {
                value = {
                    type,
                    parts: [
                        { type: "text", text: read("prefix") },
                        { type: "input", questionNumber: number, answerKey: `q${number}` },
                        { type: "text", text: read("suffix") }
                    ]
                };
            } else {
                value = { type: "text", text: read("text") };
            }

            return { label: read("label"), value };
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

function buildSavePayload() {
    const title = testTitleInput.value.trim();
    const duration = Number(testDurationInput.value) || 30;
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

async function saveTest() {
    const payload = buildSavePayload();
    if (!payload.title) throw new Error("Enter a test title before saving.");

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
    hydrateBuilderState(Array.isArray(data.parts) ? data : sampleListeningTest());
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
        <div class="audio-upload-actions">
            <a class="builder-button builder-button--light" href="${escapeHtml(test.openUrl || `listening-template.html?id=${encodeURIComponent(test.id)}`)}" target="_blank">Open student view</a>
            ${test.readOnly ? "" : `<button class="builder-button builder-button--primary" data-load-test="${escapeHtml(test.id)}" type="button">Edit</button>`}
            <button class="builder-button builder-button--danger" data-delete-test="${escapeHtml(test.id)}" type="button">Delete</button>
        </div>
    </article>`).join("") : '<div class="builder-empty">No saved Listening tests yet.</div>';
}

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

testDurationInput.addEventListener("input", () => {
    builderState.duration = Number(testDurationInput.value) || 30;
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

ListeningTestBuilder();

const initialId = new URLSearchParams(window.location.search).get("id");
if (initialId) {
    loadTest(initialId).catch((error) => showStatus(error.message, "error"));
}
