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
const importHtmlBtn = document.getElementById("importHtmlBtn");
const importHtmlModal = document.getElementById("importHtmlModal");
const htmlImportDropZone = document.getElementById("htmlImportDropZone");
const htmlImportFile = document.getElementById("htmlImportFile");
const htmlImportStatus = document.getElementById("htmlImportStatus");
// DOM Selectors and State Extensions
const appWorkspace = document.getElementById("appWorkspace");
const previewBtn = document.getElementById("previewBtn");

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
        audioDuration: null,
        html: "",
        instruction: `Listen and answer Questions ${start}-${end}.`,
        transcriptText: "",
        transcriptSegments: [],
        answerText: "",
        blocks: []
    };
}

function createBlankTest() {
    return {
        title: "",
        fullAudioUrl: "",
        fullAudioFileName: "",
        listeningHtml: "",
        questionsHtml: "",
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

const mockBuilderParams = new URLSearchParams(window.location.search);
const isMockBuilderEmbed = mockBuilderParams.get("mockBuilder") === "1";

if (isMockBuilderEmbed) {
    document.body.classList.add("mock-builder-embed");
}

function notifyMockBuilder(test) {
    if (!isMockBuilderEmbed || window.parent === window || !test) return;
    window.parent.postMessage({
        type: "ieltsx-admin-test-saved",
        section: "listening",
        testId: test.id || test._id,
        test
    }, window.location.origin);
}

// Display Status Log / Toast
function showStatus(message, type = "") {
    builderStatus.textContent = message;
    builderStatus.className = `app-toast ${type ? `is-${type}` : ""}`;
    builderStatus.style.display = "block";
    setTimeout(() => {
        builderStatus.style.display = "none";
    }, 4000);
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

function selectedPart() {
    return builderState.parts[selectedPartIndex];
}

function updateSelectedPartSidebarMeta() {
    const button = partSidebarRoot.querySelector(`[data-part-index="${selectedPartIndex}"]`);
    const part = selectedPart();
    if (!button || !part) return;

    const titleNode = button.querySelector(".part-info-meta strong");
    const rangeNode = button.querySelector(".part-info-meta span");
    if (titleNode) titleNode.textContent = part.title || `Part ${part.partNumber}`;
    if (rangeNode) rangeNode.textContent = part.questionRange || "Questions";
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

function composedPartSaveTitle(baseTitle, part) {
    const globalTitle = String(baseTitle || "").trim();
    const partNumber = Number(part?.partNumber) || savePartNumber || 1;
    const partTitle = String(part?.title || `Part ${partNumber}`).trim();

    if (!globalTitle) return partTitle;
    if (!partTitle) return globalTitle;
    if (globalTitle.toLowerCase().includes(partTitle.toLowerCase())) return globalTitle;
    return `${globalTitle} - ${partTitle}`;
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
            html: matchingSection ? (matchingSection.sectionHtml || matchingSection.html || "") : "",
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

function convertImportedFullTestToBuilder(test) {
    if (!test) return createBlankTest();
    if (test.parts && Array.isArray(test.parts) && test.parts.length) {
        return test;
    }
    const title = test.title || "";
    const listeningData = test.listening || {};
    const sections = listeningData.sections || [];
    const parts = [1, 2, 3, 4].map((partNum) => {
        const section = sections.find((s) => Number(s.number) === partNum) || {};
        const start = (partNum - 1) * 10 + 1;
        const end = start + 9;
        const blocks = [];
        const answers = [];
        (section.questionGroups || []).forEach((group, groupIdx) => {
            const rangeStr = group.instructionTitle || `Questions ${start}-${end}`;
            const instText = group.instructionText || "";
            const gType = group.type || "note_completion";
            const blockId = `block-${partNum}-${groupIdx}-${Date.now()}`;
            (group.questions || []).forEach((q) => {
                if (q.number && q.answer) {
                    const ansVal = Array.isArray(q.answer) ? q.answer.join(" / ") : String(q.answer).replace(/\s*\|\s*/g, " / ");
                    answers.push(`${q.number} | ${ansVal}`);
                }
            });
            if (gType === "form_completion") {
                blocks.push({
                    id: blockId,
                    type: "form_completion",
                    questionRange: rangeStr,
                    title: group.instructionTitle || "Form Completion",
                    instruction: instText,
                    rows: (group.rows || []).map((row) => {
                        let val = row.value;
                        if (val && val.type === "mixed") {
                            val = {
                                type: "mixed",
                                parts: (val.parts || []).map(p => {
                                    if (p.type === "input") {
                                        return { type: "input", questionNumber: Number(p.questionNumber) };
                                    }
                                    return { type: "text", text: p.text || "" };
                                })
                            };
                        } else if (val && val.type === "input") {
                            val = { type: "input", questionNumber: Number(val.questionNumber) };
                        } else {
                            val = { type: "text", text: val?.text || "" };
                        }
                        return { label: row.label || "", value: val };
                    })
                });
            } else if (gType === "table_completion") {
                blocks.push({
                    id: blockId,
                    type: "table_completion",
                    questionRange: rangeStr,
                    title: group.instructionTitle || "Table Completion",
                    instruction: instText,
                    columns: group.columns || [],
                    rows: (group.rows || []).map((row) => {
                        return (row || []).map((cell) => {
                            if (cell && cell.type === "input") {
                                return { type: "input", questionNumber: Number(cell.questionNumber) };
                            }
                            return { type: "text", text: cell?.text || "" };
                        });
                    })
                });
            } else if (gType === "multiple_choice") {
                (group.questions || []).forEach((q, qIdx) => {
                    blocks.push({
                        id: `${blockId}-${qIdx}`,
                        type: "multiple_choice",
                        questionRange: `Question ${q.number}`,
                        questionNumber: Number(q.number),
                        question: q.question || "",
                        options: (q.options || []).map((opt, optIdx) => {
                            if (typeof opt === "object") {
                                return {
                                    letter: opt.letter || opt.value || String.fromCharCode(65 + optIdx),
                                    text: opt.text || opt.html || opt.label || ""
                                };
                            }
                            return {
                                letter: String.fromCharCode(65 + optIdx),
                                text: String(opt)
                            };
                        })
                    });
                });
            } else if (gType === "multi_select" || gType === "multiple_select") {
                const firstQ = group.questions?.[0] || {};
                const qNum = Number(firstQ.number) || start;
                blocks.push({
                    id: blockId,
                    type: "multiple_select",
                    questionRange: rangeStr,
                    questionNumber: qNum,
                    maxSelections: group.questions?.length || 2,
                    question: firstQ.question || "Choose options",
                    options: (firstQ.options || []).map((opt, optIdx) => {
                        if (typeof opt === "object") {
                            return {
                                letter: opt.letter || opt.value || String.fromCharCode(65 + optIdx),
                                text: opt.text || opt.html || opt.label || ""
                            };
                        }
                        return {
                            letter: String.fromCharCode(65 + optIdx),
                            text: String(opt)
                        };
                    })
                });
            } else if (gType === "matching") {
                blocks.push({
                    id: blockId,
                    type: "matching",
                    questionRange: rangeStr,
                    title: group.instructionTitle || "Matching",
                    instruction: instText,
                    options: (group.options || []).map((opt, optIdx) => {
                        if (typeof opt === "object") {
                            return {
                                letter: opt.letter || opt.value || String.fromCharCode(65 + optIdx),
                                text: opt.text || opt.html || opt.label || ""
                            };
                        }
                        const match = String(opt).match(/^([A-Z])\s*\|\s*(.+)$/i);
                        if (match) {
                            return { letter: match[1].toUpperCase(), text: match[2].trim() };
                        }
                        return {
                            letter: String.fromCharCode(65 + optIdx),
                            text: String(opt)
                        };
                    }),
                    questions: (group.questions || []).map((q) => ({
                        questionNumber: Number(q.number),
                        text: q.question || ""
                    }))
                });
            } else if (gType === "map_labelling" || gType === "map_labeling" || gType === "diagram_labelling" || gType === "diagram_labeling") {
                blocks.push({
                    id: blockId,
                    type: "map_labelling",
                    questionRange: rangeStr,
                    title: group.instructionTitle || "Map Labelling",
                    instruction: instText,
                    imageUrl: group.imageUrl || "",
                    imageFileName: group.imageUrl ? String(group.imageUrl).split("/").pop() : "",
                    labels: (group.questions || []).map((q) => {
                        const marker = (group.labels || []).find(l => l.questionNumber === q.number) || {};
                        return {
                            questionNumber: Number(q.number),
                            x: marker.x !== undefined ? Number(marker.x) : 50,
                            y: marker.y !== undefined ? Number(marker.y) : 50
                        };
                    })
                });
            } else {
                const sentenceCompletion = gType === "sentence_completion";
                const blockType = sentenceCompletion ? "sentence_completion_inline" : "note_completion";
                const contentLines = [];
                if (group.content) {
                    if (Array.isArray(group.content)) {
                        contentLines.push(...group.content);
                    } else {
                        contentLines.push(...String(group.content).split("\n"));
                    }
                } else if (group.questions && group.questions.length) {
                    group.questions.forEach((q) => {
                        const questionText = q.question || "";
                        if (sentenceCompletion) {
                            contentLines.push(questionText ? `${questionText} {{${q.number}}}` : `Sentence detail placeholder {{${q.number}}}`);
                        } else {
                            contentLines.push(questionText ? `- ${questionText} {{${q.number}}}` : `- Detail placeholder {{${q.number}}}`);
                        }
                    });
                }
                blocks.push({
                    id: blockId,
                    type: blockType,
                    questionRange: rangeStr,
                    title: group.instructionTitle || (sentenceCompletion ? "Sentence Completion" : "Note Completion"),
                    instruction: instText,
                    content: contentLines
                });
            }
        });
        return {
            partNumber: partNum,
            title: section.title || `Part ${partNum}`,
            questionRange: `Questions ${start}-${end}`,
            audioUrl: section.audio || listeningData.audio || "",
            audioFileName: (section.audio || listeningData.audio) ? String(section.audio || listeningData.audio).split("/").pop() : "",
            html: section.sectionHtml || section.html || "",
            instruction: section.instruction || (section.questionGroups?.[0]?.instructionText) || `Listen and answer Questions ${start}-${end}.`,
            answerText: answers.join("\n"),
            blocks
        };
    });
    return {
        title,
        listeningHtml: test.listeningHtml || test.questionsHtml || "",
        questionsHtml: test.questionsHtml || test.listeningHtml || "",
        parts
    };
}

function hydrateBuilderState(test) {
    if (!test) return;
    let normalized;
    if (test.listening && !test.parts) {
        normalized = convertImportedFullTestToBuilder(test);
    } else {
        normalized = convertLegacyTestToBuilderFormat(test);
    }
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
    return readResponse(await fetch("/api/listening-tests?includeDerived=1", {
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

async function generateTranscript(audioUrl) {
    return readResponse(await fetch("/api/listening-assets/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl })
    }));
}

function transcriptSegmentEditor(part) {
    const segments = Array.isArray(part.transcriptSegments) ? part.transcriptSegments : [];
    if (!segments.length) return '<p class="transcript-segments-empty">No timestamped segments yet. Generate a transcript or keep using the manual transcript editor.</p>';
    return `<div class="transcript-segments" data-transcript-segments>
        ${segments.map((segment, index) => `<article class="transcript-segment-row" data-segment-index="${index}">
            <strong>${escapeHtml(segment.id || `segment-${index + 1}`)}</strong>
            <label>Start <input type="number" min="0" step="0.01" data-segment-field="start" value="${escapeHtml(segment.start ?? 0)}"></label>
            <label>End <input type="number" min="0" step="0.01" data-segment-field="end" value="${escapeHtml(segment.end ?? 0)}"></label>
            <textarea data-segment-field="text" aria-label="Segment text">${escapeHtml(segment.text || "")}</textarea>
            <div class="transcript-segment-actions">
                <button class="btn btn-secondary btn-sm" type="button" data-action="split-segment" data-segment-index="${index}">Split</button>
                <button class="btn btn-secondary btn-sm" type="button" data-action="merge-segment" data-segment-index="${index}" ${index ? "" : "disabled"}>Merge previous</button>
                <button class="btn btn-danger btn-sm" type="button" data-action="delete-segment" data-segment-index="${index}">Delete</button>
            </div>
        </article>`).join("")}
    </div>`;
}

// Elements markup generators
// 0-Error Auto-Numbering Engine
function autoCalculateQuestionRanges() {
    builderState.parts.forEach((part) => {
        const partNumber = Number(part.partNumber) || 1;
        let nextNumber = (partNumber - 1) * 10 + 1; // Part 1 starts at 1, Part 2 at 11, etc.
        
        part.blocks.forEach((block) => {
            const startNum = nextNumber;
            let count = 0;
            
            if (block.type === "multiple_choice") {
                block.questionNumber = startNum;
                block.questionRange = `Question ${startNum}`;
                count = 1;
            } else if (block.type === "multiple_select") {
                block.questionNumber = startNum;
                const maxSel = Number(block.maxSelections) || 2;
                const endNum = startNum + maxSel - 1;
                block.questionRange = `Questions ${startNum}-${endNum}`;
                count = maxSel;
            } else if (block.type === "matching") {
                const qCount = Array.isArray(block.questions) ? block.questions.length : 0;
                if (qCount > 0) {
                    block.questions.forEach((q, idx) => {
                        q.questionNumber = startNum + idx;
                    });
                    const endNum = startNum + qCount - 1;
                    block.questionRange = qCount === 1 ? `Question ${startNum}` : `Questions ${startNum}-${endNum}`;
                    count = qCount;
                } else {
                    block.questionRange = `Questions ${startNum}`;
                    count = 0;
                }
            } else if (block.type === "map_labelling") {
                const labelCount = Array.isArray(block.labels) ? block.labels.length : 0;
                if (labelCount > 0) {
                    block.labels.forEach((lbl, idx) => {
                        lbl.questionNumber = startNum + idx;
                    });
                    const endNum = startNum + labelCount - 1;
                    block.questionRange = labelCount === 1 ? `Question ${startNum}` : `Questions ${startNum}-${endNum}`;
                    count = labelCount;
                } else {
                    block.questionRange = `Questions ${startNum}`;
                    count = 0;
                }
            } else if (block.type === "form_completion") {
                let inputIdx = 0;
                if (Array.isArray(block.rows)) {
                    block.rows.forEach((row) => {
                        if (row.value && (row.value.type === "input" || row.value.type === "mixed")) {
                            row.value.questionNumber = startNum + inputIdx;
                            inputIdx++;
                        }
                    });
                }
                count = inputIdx;
                const endNum = startNum + count - 1;
                block.questionRange = count === 1 ? `Question ${startNum}` : (count > 0 ? `Questions ${startNum}-${endNum}` : `Questions ${startNum}`);
            } else if (block.type === "sentence_completion_inline" || block.type === "note_completion" || block.type === "table_completion") {
                let placeholderCount = 0;
                if (block.type === "table_completion") {
                    if (Array.isArray(block.rows)) {
                        block.rows.forEach((row) => {
                            if (Array.isArray(row)) {
                                row.forEach((cell) => {
                                    if (cell && cell.type === "input") {
                                        cell.questionNumber = startNum + placeholderCount;
                                        placeholderCount++;
                                    }
                                });
                            }
                        });
                    }
                } else {
                    if (Array.isArray(block.content)) {
                        block.content = block.content.map((line) => {
                            let lineResult = line;
                            const matches = [...line.matchAll(/\{{2}(\d+|\?)\}{2}/g)];
                            matches.forEach((match) => {
                                const currentQNum = startNum + placeholderCount;
                                lineResult = lineResult.replace(match[0], `{{${currentQNum}}}`);
                                placeholderCount++;
                            });
                            return lineResult;
                        });
                    }
                }
                count = placeholderCount;
                const endNum = startNum + count - 1;
                block.questionRange = count === 1 ? `Question ${startNum}` : (count > 0 ? `Questions ${startNum}-${endNum}` : `Questions ${startNum}`);
            }
            
            nextNumber = startNum + count;
        });
        
        // Auto-assign part question range label
        const partStart = (partNumber - 1) * 10 + 1;
        const partEnd = partStart + 9;
        const numbers = collectQuestionNumbersFromBlocks(part.blocks);
        if (numbers.length) {
            const first = Math.min(...numbers);
            const last = Math.max(...numbers);
            part.questionRange = first === last ? `Question ${first}` : `Questions ${first}-${last}`;
        } else {
            part.questionRange = `Questions ${partStart}-${partEnd}`;
        }
        
        // Auto-populate Answer Key template
        const answersList = [];
        part.blocks.forEach((block) => {
            if (block.type === "multiple_choice" && block.questionNumber) {
                const ans = parseAnswerKeyForQuestion(part.answerText, block.questionNumber) || "";
                answersList.push(`${block.questionNumber} | ${ans}`);
            } else if (block.type === "multiple_select" && block.questionNumber) {
                const maxSel = Number(block.maxSelections) || 2;
                for (let i = 0; i < maxSel; i++) {
                    const qNum = block.questionNumber + i;
                    const ans = parseAnswerKeyForQuestion(part.answerText, qNum) || "";
                    answersList.push(`${qNum} | ${ans}`);
                }
            } else if (block.type === "matching" && Array.isArray(block.questions)) {
                block.questions.forEach((q) => {
                    const ans = parseAnswerKeyForQuestion(part.answerText, q.questionNumber) || "";
                    answersList.push(`${q.questionNumber} | ${ans}`);
                });
            } else if (block.type === "map_labelling" && Array.isArray(block.labels)) {
                block.labels.forEach((lbl) => {
                    const ans = parseAnswerKeyForQuestion(part.answerText, lbl.questionNumber) || "";
                    answersList.push(`${lbl.questionNumber} | ${ans}`);
                });
            } else if (block.type === "form_completion" && Array.isArray(block.rows)) {
                block.rows.forEach((row) => {
                    if (row.value && (row.value.type === "input" || row.value.type === "mixed")) {
                        const qNum = row.value.questionNumber;
                        const ans = parseAnswerKeyForQuestion(part.answerText, qNum) || "";
                        answersList.push(`${qNum} | ${ans}`);
                    }
                });
            } else if (block.type === "table_completion" && Array.isArray(block.rows)) {
                block.rows.forEach((row) => {
                    if (Array.isArray(row)) {
                        row.forEach((cell) => {
                            if (cell && cell.type === "input" && cell.questionNumber) {
                                const ans = parseAnswerKeyForQuestion(part.answerText, cell.questionNumber) || "";
                                answersList.push(`${cell.questionNumber} | ${ans}`);
                            }
                        });
                    }
                });
            } else if (Array.isArray(block.content)) {
                block.content.forEach((line) => {
                    const matches = [...line.matchAll(/\{{2}(\d+)\}{2}/g)];
                    matches.forEach((match) => {
                        const qNum = Number(match[1]);
                        const ans = parseAnswerKeyForQuestion(part.answerText, qNum) || "";
                        answersList.push(`${qNum} | ${ans}`);
                    });
                });
            }
        });
        
        // Build answer text, retaining manual overrides
        const parsedAnswers = parseAnswerLinesMap(part.answerText);
        const finalAnswers = answersList.map((item) => {
            const [num] = item.split(" | ");
            const originalVal = parsedAnswers.get(Number(num));
            return originalVal ? `${num} | ${originalVal}` : item;
        });
        
        part.answerText = finalAnswers.join("\n");
    });
}

function parseAnswerKeyForQuestion(text, questionNumber) {
    const map = parseAnswerLinesMap(text);
    return map.get(Number(questionNumber)) || "";
}

function parseAnswerLinesMap(text) {
    const map = new Map();
    String(text || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
            const match = line.match(/^(\d{1,2})\s*[\).:\-=\|]\s*(.+)$/);
            if (match) {
                map.set(Number(match[1]), match[2].trim());
            }
        });
    return map;
}

function normalizeBuilderAnswer(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function syncPartAnswersFromQuestionEvidence(block) {
    const part = selectedPart();
    const answers = parseAnswerLinesMap(part.answerText);
    Object.entries(block.questionEvidence || {}).forEach(([number, evidence]) => {
        const correctAnswer = String(evidence.correctAnswer || "").trim();
        if (!correctAnswer) return;
        const acceptedAnswers = [correctAnswer, ...(evidence.acceptedAnswers || [])]
            .map((answer) => String(answer || "").trim())
            .filter(Boolean)
            .filter((answer, index, values) => values.findIndex(
                (candidate) => normalizeBuilderAnswer(candidate) === normalizeBuilderAnswer(answer)
            ) === index);
        answers.set(Number(number), acceptedAnswers.join(" | "));
    });
    part.answerText = [...answers.entries()]
        .sort(([left], [right]) => left - right)
        .map(([number, answer]) => `${number} | ${answer}`)
        .join("\n");
}

// Real-Time Student CBT Preview compiler
function updateRealtimePreview() {
    const previewContainer = document.getElementById("realtimePreviewContainer");
    if (!previewContainer) return;
    
    if (!appWorkspace || !appWorkspace.classList.contains("split-active")) {
        return;
    }
    
    try {
        const payload = buildSavePayload();
        const currentPartData = saveScope === "part"
            ? payload.parts[0]
            : payload.parts[selectedPartIndex];
        
        if (!currentPartData) {
            previewContainer.innerHTML = '<div class="preview-placeholder"><h3>No part loaded</h3></div>';
            return;
        }
        
        const previewTest = {
            id: editingTestId || "preview-id",
            title: payload.title || "Preview Test",
            part: saveScope === "full" ? "full" : String(selectedPartIndex + 1),
            parts: [ {
                ...currentPartData,
                partNumber: 1
            } ]
        };
        
        previewContainer.innerHTML = ListeningTestPage(previewTest);
        bindListeningTest(previewContainer, { isPreview: true });
        
        // Disable interactive controls inside preview
        previewContainer.querySelectorAll("input, select, textarea, button").forEach((el) => {
            if (el.tagName !== "AUDIO" && !el.closest(".lc-audio-custom")) {
                el.disabled = true;
                el.style.pointerEvents = "none";
            }
        });
    } catch (e) {
        previewContainer.innerHTML = `<div style="padding: 24px; color: var(--danger); font-weight: 600;">Unable to compile preview: ${escapeHtml(e.message)}</div>`;
    }
}

// Save Scope Selector UI
function SaveScopeSelector() {
    return `
        <button class="scope-btn ${saveScope === "full" ? "is-active" : ""}" data-save-scope="full" type="button">
            <strong>Full Test</strong>
            <span>Create all 4 parts under a unified Listening test ID.</span>
        </button>
        <button class="scope-btn ${saveScope === "part" ? "is-active" : ""}" data-save-scope="part" data-save-part="${savePartNumber}" type="button">
            <strong>Single Part</strong>
            <span>Save active part separately as an individual listening practice.</span>
        </button>
    `;
}

// Part Sidebar UI with Badges
function PartSidebar() {
    return builderState.parts.map((part, index) => {
        const isActive = index === selectedPartIndex;
        const numbers = collectQuestionNumbersFromBlocks(part.blocks);
        const qCount = numbers.length;
        
        let statusClass = "warning";
        let statusText = "No Questions";
        if (qCount > 0) {
            if (part.audioUrl || builderState.fullAudioUrl) {
                statusClass = "complete";
                statusText = `${qCount} Questions`;
            } else {
                statusText = "No Audio";
            }
        } else if (part.audioUrl) {
            statusText = "No Questions";
        }
        
        return `
            <button class="part-sidebar-button ${isActive ? "is-active" : ""}" data-part-index="${index}" type="button">
                <span class="part-icon-circle">${part.partNumber}</span>
                <div class="part-info-meta">
                    <strong>${escapeHtml(part.title || `Part ${part.partNumber}`)}</strong>
                    <span>${escapeHtml(part.questionRange || "Questions")}</span>
                </div>
                <span class="part-status-badge ${statusClass}">${statusText}</span>
            </button>
        `;
    }).join("");
}

// Part Editor UI
function PartEditor() {
    const part = selectedPart();
    const fullAudioCardHtml = saveScope === "full" ? (builderState.fullAudioUrl ? `
        <div class="card" style="margin-bottom: 24px;">
            <div class="form-group">
                <label>Complete Listening Test Audio <small>(takes priority over part tracks)</small></label>
                <div class="audio-card">
                    <div class="audio-icon-badge">🎵</div>
                    <div class="audio-card-details">
                        <h4>${escapeHtml(builderState.fullAudioFileName || "Attached full test audio")}</h4>
                        <p>Path: ${escapeHtml(builderState.fullAudioUrl)}</p>
                        <audio controls preload="metadata" src="${escapeHtml(builderState.fullAudioUrl)}" style="margin-top: 8px; width: 100%; height: 32px;"></audio>
                    </div>
                    <button class="btn btn-danger btn-sm" data-action="remove-full-audio" type="button">Replace</button>
                </div>
            </div>
        </div>
    ` : `
        <div class="card" style="margin-bottom: 24px;">
            <div class="form-group">
                <label>Complete Listening Test Audio <small>(optional; takes priority over part tracks)</small></label>
                <div class="drop-zone" data-audio-scope="full" onclick="document.getElementById('fullAudioInput').click();">
                    <div class="drop-zone-icon">🎙️</div>
                    <span class="drop-zone__prompt">Drag & drop one complete Listening audio file here or <span class="browse-link">browse</span></span>
                    <input type="file" id="fullAudioInput" accept=".mp3,.wav,.m4a" style="display: none;">
                </div>
            </div>
        </div>
    `) : "";
    const audioCardHtml = part.audioUrl ? `
        <div class="audio-card">
            <div class="audio-icon-badge">🎵</div>
            <div class="audio-card-details">
                <h4>${escapeHtml(part.audioFileName || "Attached audio file")}</h4>
                <p>Path: ${escapeHtml(part.audioUrl)}</p>
                <audio data-admin-evidence-audio controls preload="metadata" src="${escapeHtml(part.audioUrl)}" style="margin-top: 8px; width: 100%; height: 32px;"></audio>
            </div>
            <button class="btn btn-danger btn-sm" data-action="remove-audio" type="button">Replace</button>
        </div>
    ` : `
        <div class="drop-zone" data-audio-scope="part" onclick="document.getElementById('audioInput').click();">
            <div class="drop-zone-icon">🎙️</div>
            <span class="drop-zone__prompt">Drag & drop part audio track (.mp3) here or <span class="browse-link">browse</span></span>
            <input type="file" id="audioInput" accept=".mp3,.wav,.m4a" style="display: none;">
        </div>
    `;
    
    return `
        ${fullAudioCardHtml}
        <div class="card" style="margin-bottom: 24px;">
            <div class="part-settings-grid">
                <div class="form-group">
                    <label for="partTitle">Part Title</label>
                    <input id="partTitle" data-part-field="title" type="text" value="${escapeHtml(part.title || "")}" placeholder="e.g., Part 1 - Conversation">
                </div>
                <div class="form-group">
                    <label for="partQuestionRange">Question Range</label>
                    <input id="partQuestionRange" data-part-field="questionRange" type="text" value="${escapeHtml(part.questionRange || "")}" placeholder="e.g., Questions 1-10">
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 16px;">
                <label>Audio Track</label>
                ${audioCardHtml}
            </div>
            <div class="form-group">
                <label for="partInstruction">Active Part Instructions</label>
                <textarea id="partInstruction" data-part-field="instruction" placeholder="Enter test instructions for this part...">${escapeHtml(part.instruction || "")}</textarea>
            </div>
            <div class="form-group">
                <label for="partTranscript">Transcript (optional, used as review evidence)</label>
                <textarea id="partTranscript" data-part-field="transcriptText" placeholder="Paste the transcript for this part...">${escapeHtml(part.transcriptText || "")}</textarea>
                <div class="transcript-toolbar">
                    <button class="btn btn-secondary btn-sm" data-action="import-transcript" type="button">Upload .txt</button>
                    <input id="transcriptFileInput" type="file" accept=".txt,text/plain" hidden>
                    <button class="btn btn-primary btn-sm" data-action="generate-transcript" type="button" ${part.audioUrl ? "" : "disabled"}>Generate Transcript</button>
                    <span>Generated segments can be corrected before saving.</span>
                </div>
                ${transcriptSegmentEditor(part)}
            </div>
        </div>

        <div class="section-title">
            <span>Question Blocks</span>
        </div>
        
        <div class="blocks-timeline">
            ${PartBlocks(part.blocks)}
            <button class="btn-add-block-dashed" data-action="add-block" type="button">
                <div style="font-size: 20px;">+</div>
                <span>Add Question Block</span>
            </button>
        </div>
        
        <div class="card" style="margin-top: 24px;">
            <div class="form-group">
                <label for="answerText">Part Answer Keys (One question per line)</label>
                <div style="font-size: 11px; color: var(--muted); margin-bottom: 8px;">Format: [Question Number] | [Answer] (e.g., "1 | 25 High Street" or "2 | A")</div>
                <textarea id="answerText" data-part-field="answerText" placeholder="e.g. 1 | A\n2 | B" style="height: 140px; font-family: monospace;">${escapeHtml(part.answerText || "")}</textarea>
            </div>
        </div>
    `;
}

function PartBlocks(blocks = []) {
    if (!blocks.length) {
        return '<div class="card" style="text-align: center; padding: 40px; color: var(--muted); border-style: dashed;">No question blocks added. Add a block to start editing.</div>';
    }
    return blocks.map((block, index) => BlockCard(block, index)).join("");
}

function BlockCard(block, index) {
    const blocks = selectedPart().blocks;
    const isFirst = index === 0;
    const isLast = index === blocks.length - 1;
    
    let previewHtml = "";
    if (block.type === "multiple_choice") {
        previewHtml = `Option choices: ${(block.options || []).length} choices. Question: ${escapeHtml(block.question || "")}`;
    } else if (block.type === "multiple_select") {
        previewHtml = `Checkbox choices: ${(block.options || []).length} options. Max choices allowed: ${block.maxSelections || 2}`;
    } else if (block.type === "matching") {
        previewHtml = `Matching items count: ${(block.questions || []).length} questions matching ${(block.options || []).length} options.`;
    } else if (block.type === "form_completion") {
        previewHtml = `Form structure: ${(block.rows || []).length} rows configured.`;
    } else if (block.type === "table_completion") {
        previewHtml = `Table columns: ${(block.columns || []).join(" | ")}. Rows: ${(block.rows || []).length} rows.`;
    } else if (Array.isArray(block.content)) {
        previewHtml = block.content.map(c => `<div style="margin-bottom: 4px;">${escapeHtml(c)}</div>`).join("");
    }
    
    return `
        <article class="block-card" style="border-left-color: ${getBlockColor(block.type)}">
            <div class="block-card-header">
                <div class="block-title-group">
                    <span class="block-type-tag">${escapeHtml(blockTypeName(block.type))}</span>
                    <h3>${escapeHtml(block.title || "Untitled Block")}</h3>
                </div>
                <span class="block-range-badge">${escapeHtml(block.questionRange || "Questions")}</span>
            </div>
            
            <div class="block-card-body">
                ${previewHtml}
            </div>
            
            <div class="block-card-actions">
                <button class="block-action-btn" data-action="move-up" data-block-index="${index}" title="Move Up" type="button" ${isFirst ? "disabled" : ""}>▲</button>
                <button class="block-action-btn" data-action="move-down" data-block-index="${index}" title="Move Down" type="button" ${isLast ? "disabled" : ""}>▼</button>
                <button class="block-action-btn" data-action="duplicate-block" data-block-index="${index}" title="Duplicate" type="button">❐</button>
                <button class="block-action-btn" data-action="edit-block" data-block-index="${index}" title="Edit block content" type="button">✎</button>
                <button class="block-action-btn delete" data-action="delete-block" data-block-index="${index}" title="Delete block" type="button">✕</button>
            </div>
        </article>
    `;
}

function getBlockColor(type) {
    const colors = {
        form_completion: "#6366f1",
        multiple_choice: "#10b981",
        multiple_select: "#f59e0b",
        matching: "#3b82f6",
        map_labelling: "#ec4899",
        note_completion: "#8b5cf6",
        table_completion: "#06b6d4",
        sentence_completion_inline: "#14b8a6"
    };
    return colors[type] || "#64748b";
}

function blockTypeName(type) {
    const matched = BLOCK_TYPES.find((item) => item.type === type);
    return matched ? matched.name : "Question Block";
}

// Listening Test Builder Root Renderer
function ListeningTestBuilder() {
    autoCalculateQuestionRanges();
    testTitleInput.value = builderState.title || "";
    if (fixedDurationLabel) {
        fixedDurationLabel.textContent = saveScope === "full"
            ? "Full test: 40 minutes"
            : `Part ${savePartNumber}: 10 minutes`;
    }
    testScopeRoot.innerHTML = SaveScopeSelector();
    partSidebarRoot.innerHTML = PartSidebar();
    partEditorRoot.innerHTML = PartEditor();
    updateRealtimePreview();
}

// Toggle preview split panel
previewBtn.addEventListener("click", () => {
    const isActive = appWorkspace.classList.toggle("split-active");
    previewBtn.classList.toggle("is-active", isActive);
    if (isActive) {
        updateRealtimePreview();
    }
});

function AddQuestionBlockMenu() {
    return BLOCK_TYPES.map((item) => `<button class="block-type-btn" data-block-type="${item.type}" type="button">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.description)}</span>
    </button>`).join("");
}

// Block Fields Editors inside dialog popup modal
function commonEditorFields(block) {
    const questionNumbers = collectQuestionNumbersFromBlocks([block]);
    const answerMap = parseAnswerLinesMap(selectedPart().answerText);
    const transcriptSegments = Array.isArray(selectedPart().transcriptSegments) ? selectedPart().transcriptSegments : [];
    const evidenceRows = questionNumbers.map((number) => {
        const evidence = block.questionEvidence?.[String(number)] || {};
        const storedAnswers = String(answerMap.get(Number(number)) || "")
            .split(/\||\s+\/\s+/).map((answer) => answer.trim()).filter(Boolean);
        const correctAnswer = String(evidence.correctAnswer || storedAnswers[0] || "").trim();
        const acceptedAnswers = Array.isArray(evidence.acceptedAnswers)
            ? evidence.acceptedAnswers
            : String(evidence.acceptedAnswers || "").split(/\n|\|/).map((answer) => answer.trim()).filter(Boolean);
        const alternatives = acceptedAnswers.length
            ? acceptedAnswers.filter((answer) => normalizeBuilderAnswer(answer) !== normalizeBuilderAnswer(correctAnswer))
            : storedAnswers.slice(1);
        const selectedSegmentIds = new Set(Array.isArray(evidence.transcriptSegmentIds) ? evidence.transcriptSegmentIds : []);
        const segmentPicker = transcriptSegments.length ? `<fieldset class="evidence-question-fields__wide transcript-segment-picker">
            <legend>Relevant transcript segments</legend>
            <p>Select the exact segment(s); text and playback times update automatically.</p>
            ${transcriptSegments.map((segment) => `<label>
                <input type="checkbox" data-question-transcript-segment="${number}" value="${escapeHtml(segment.id)}" ${selectedSegmentIds.has(segment.id) ? "checked" : ""}>
                <span>${escapeHtml(formatEvidenceTime(segment.start))}–${escapeHtml(formatEvidenceTime(segment.end))} ${escapeHtml(segment.text)}</span>
            </label>`).join("")}
        </fieldset>` : "";
        return `<div class="evidence-question-row" data-question-review-editor="${number}">
            <div class="evidence-question-row__heading">
                <strong>Question ${number}</strong>
                <button class="btn btn-secondary btn-sm" data-evidence-action="question-clear" data-question-number="${number}" type="button">Clear review data</button>
            </div>
            <div class="evidence-question-fields">
                <label>Correct answer
                    <input data-question-evidence="${number}" data-evidence-key="correctAnswer" value="${escapeHtml(correctAnswer)}" placeholder="Correct answer">
                </label>
                <label>Alternative accepted answers
                    <textarea data-question-evidence="${number}" data-evidence-key="acceptedAnswers" placeholder="One alternative per line">${escapeHtml(alternatives.join("\n"))}</textarea>
                </label>
                ${segmentPicker}
                <label class="evidence-question-fields__wide">Relevant transcript text
                    <textarea data-question-evidence="${number}" data-evidence-key="relevantText" placeholder="Exact sentence containing the answer">${escapeHtml(evidence.relevantText || "")}</textarea>
                </label>
                <label class="evidence-question-fields__wide">Explanation
                    <textarea data-question-evidence="${number}" data-evidence-key="explanation" placeholder="Explain the answer and the paraphrase or synonym">${escapeHtml(evidence.explanation || "")}</textarea>
                </label>
                <label>Transcript start time
                    <input data-question-evidence="${number}" data-evidence-key="transcriptStartTime" value="${escapeHtml(formatEvidenceTime(evidence.transcriptStartTime ?? evidence.evidenceStartTime))}" placeholder="00:00">
                </label>
                <label>Transcript end time
                    <input data-question-evidence="${number}" data-evidence-key="transcriptEndTime" value="${escapeHtml(formatEvidenceTime(evidence.transcriptEndTime ?? evidence.evidenceEndTime))}" placeholder="00:00">
                </label>
            </div>
            <div class="evidence-question-actions">
                <button class="btn btn-secondary btn-sm" data-evidence-action="question-start" data-question-number="${number}" type="button">Set start</button>
                <button class="btn btn-secondary btn-sm" data-evidence-action="question-end" data-question-number="${number}" type="button">Set end</button>
            </div>
        </div>`;
    }).join("");
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
    </div>
    <section class="evidence-editor">
        <div class="evidence-editor__heading">
            <div>
                <strong>Audio evidence timestamp</strong>
                <span>Play the part audio, then capture the exact group or question range.</span>
            </div>
            <button class="btn btn-secondary btn-sm" data-evidence-action="clear" type="button">Clear group</button>
        </div>
        ${selectedPart().audioUrl ? `<audio data-evidence-audio controls preload="metadata" src="${escapeHtml(selectedPart().audioUrl)}"></audio>` : '<p class="evidence-empty">Upload the part audio before capturing timestamps.</p>'}
        <div class="evidence-group-row">
            <label>Group start
                <input data-evidence-field="evidenceStartTime" value="${escapeHtml(formatEvidenceTime(block.evidenceStartTime))}" placeholder="00:00">
            </label>
            <button class="btn btn-secondary btn-sm" data-evidence-action="group-start" type="button">Set current</button>
            <label>Group end
                <input data-evidence-field="evidenceEndTime" value="${escapeHtml(formatEvidenceTime(block.evidenceEndTime))}" placeholder="00:00">
            </label>
            <button class="btn btn-secondary btn-sm" data-evidence-action="group-end" type="button">Set current</button>
        </div>
        ${evidenceRows ? `<div class="evidence-question-list">
            <div class="evidence-question-list__heading">Question answer and review data</div>
            ${evidenceRows}
        </div>` : '<p class="evidence-empty">Add question numbers first to set question-level evidence.</p>'}
    </section>`;
}

function parseEvidenceTime(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const parts = raw.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part)) || parts.length > 3) return NaN;
    const seconds = parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
    return seconds >= 0 ? Number(seconds.toFixed(2)) : NaN;
}

function formatEvidenceTime(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "";
    const seconds = Math.max(0, Number(value));
    const minutes = Math.floor(seconds / 60);
    const remainder = (seconds % 60).toFixed(seconds % 1 ? 1 : 0).padStart(2, "0");
    return `${String(minutes).padStart(2, "0")}:${remainder}`;
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
                updateRealtimePreview();
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

    blockEditorContent.querySelectorAll("[data-evidence-field]").forEach((field) => {
        blockDraft[field.dataset.evidenceField] = parseEvidenceTime(field.value);
    });
    blockDraft.questionEvidence = blockDraft.questionEvidence || {};
    blockEditorContent.querySelectorAll("[data-question-evidence]").forEach((field) => {
        const number = String(field.dataset.questionEvidence);
        const key = field.dataset.evidenceKey;
        blockDraft.questionEvidence[number] = blockDraft.questionEvidence[number] || {};
        if (["transcriptStartTime", "transcriptEndTime", "evidenceStartTime", "evidenceEndTime"].includes(key)) {
            blockDraft.questionEvidence[number][key] = parseEvidenceTime(field.value);
        } else if (key === "acceptedAnswers") {
            blockDraft.questionEvidence[number][key] = String(field.value || "")
                .split(/\n|\|/).map((answer) => answer.trim()).filter(Boolean);
        } else {
            blockDraft.questionEvidence[number][key] = String(field.value || "").trim();
        }
    });
    const segmentIdsByQuestion = new Map();
    blockEditorContent.querySelectorAll("[data-question-transcript-segment]:checked").forEach((field) => {
        const number = String(field.dataset.questionTranscriptSegment);
        if (!segmentIdsByQuestion.has(number)) segmentIdsByQuestion.set(number, []);
        segmentIdsByQuestion.get(number).push(String(field.value));
    });
    blockEditorContent.querySelectorAll("[data-question-review-editor]").forEach((row) => {
        const number = String(row.dataset.questionReviewEditor);
        blockDraft.questionEvidence[number] = blockDraft.questionEvidence[number] || {};
        blockDraft.questionEvidence[number].transcriptSegmentIds = segmentIdsByQuestion.get(number) || [];
    });
    Object.values(blockDraft.questionEvidence).forEach((evidence) => {
        const correctAnswer = String(evidence.correctAnswer || "").trim();
        evidence.acceptedAnswers = [correctAnswer, ...(evidence.acceptedAnswers || [])]
            .filter(Boolean)
            .filter((answer, index, values) => values.findIndex(
                (candidate) => normalizeBuilderAnswer(candidate) === normalizeBuilderAnswer(answer)
            ) === index);
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
    updateRealtimePreview();
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
        const partTitle = composedPartSaveTitle(title, part);
        return {
            ...payload,
            title: partTitle,
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
        const validateEvidence = (evidence, label) => {
            const start = evidence?.transcriptStartTime ?? evidence?.evidenceStartTime;
            const end = evidence?.transcriptEndTime ?? evidence?.evidenceEndTime;
            const hasEither = start !== null && start !== undefined && start !== ""
                || end !== null && end !== undefined && end !== "";
            if (hasEither && (!Number.isFinite(Number(start)) || Number(start) < 0
                || !Number.isFinite(Number(end)) || Number(end) <= Number(start))) {
                throw new Error(`Part ${partNumber} ${label}: evidence end must be after a valid start.`);
            }
            if (hasEither && part.audioDuration !== null && part.audioDuration !== undefined
                && part.audioDuration !== "" && Number.isFinite(Number(part.audioDuration))
                && Number(end) > Number(part.audioDuration) + 0.25) {
                throw new Error(`Part ${partNumber} ${label}: evidence cannot exceed the audio duration.`);
            }
        };
        (part.blocks || []).forEach((block) => {
            validateEvidence(block, block.title || "question group");
            Object.entries(block.questionEvidence || {}).forEach(([number, evidence]) => (
                validateEvidence(evidence, `Question ${number}`)
            ));
        });

        const usesFullAudio = payload.part === "full" && String(payload.fullAudioUrl || "").trim();
        if (!usesFullAudio && !String(part.audioUrl || "").trim() && !(part.audioUrls || []).filter(Boolean).length) {
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
    showStatus("Test saved successfully.", "success");
    notifyMockBuilder(result.test);
}

async function loadTest(id) {
    showStatus("Loading Listening test...");
    const response = await fetch(`/api/admin/listening-tests/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store"
    });
    const data = await readResponse(response);
    hydrateBuilderState(data);
    editingTestId = data.id;
    ListeningTestBuilder();
    showStatus("Saved test loaded.", "success");
}

async function loadSavedTests(openModal = true) {
    savedTestsList.textContent = "Loading...";
    if (openModal && !savedTestsModal.open) savedTestsModal.showModal();
    const tests = await readResponse(await fetch("/api/listening-tests?includeDerived=1"));

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
    const segmentField = event.target.closest("[data-segment-field]");
    if (segmentField) {
        const row = segmentField.closest("[data-segment-index]");
        const segment = selectedPart().transcriptSegments?.[Number(row?.dataset.segmentIndex)];
        if (!segment) return;
        segment[segmentField.dataset.segmentField] = segmentField.dataset.segmentField === "text"
            ? segmentField.value
            : Math.max(0, Number(segmentField.value) || 0);
        selectedPart().transcriptText = selectedPart().transcriptSegments.map((item) => item.text).join(" ").trim();
        return;
    }
    const field = event.target.closest("[data-part-field]");
    if (!field) return;
    selectedPart()[field.dataset.partField] = field.value;
    if (["title", "questionRange"].includes(field.dataset.partField)) {
        updateSelectedPartSidebarMeta();
    }
    updateRealtimePreview();
});

partEditorRoot.addEventListener("loadedmetadata", (event) => {
    if (!event.target.matches("[data-admin-evidence-audio]") || !Number.isFinite(event.target.duration)) return;
    selectedPart().audioDuration = Number(event.target.duration.toFixed(2));
}, true);

partEditorRoot.addEventListener("change", async (event) => {
    if (event.target.id === "transcriptFileInput" && event.target.files.length) {
        try {
            selectedPart().transcriptText = await readFileAsText(event.target.files[0]);
            selectedPart().transcriptSegments = [];
            ListeningTestBuilder();
            showStatus("Transcript text imported. Save the test to store it.", "success");
        } catch (error) {
            showStatus(error.message, "error");
        }
        return;
    }
    if (!["audioInput", "fullAudioInput"].includes(event.target.id) || !event.target.files.length) return;
    const isFullAudio = event.target.id === "fullAudioInput";
    showStatus(isFullAudio ? "Uploading complete Listening audio..." : "Uploading part audio...");
    try {
        const result = await uploadAudio(event.target.files[0]);
        if (isFullAudio) {
            builderState.fullAudioUrl = result.audioUrl;
            builderState.fullAudioFileName = result.fileName;
        } else {
            selectedPart().audioUrl = result.audioUrl;
            selectedPart().audioFileName = result.fileName;
        }
        ListeningTestBuilder();
        showStatus(isFullAudio ? "Complete Listening audio uploaded." : "Audio uploaded.", "success");
    } catch (error) {
        showStatus(error.message, "error");
    }
});

partEditorRoot.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const index = Number(button.dataset.blockIndex);
    const blocks = selectedPart().blocks;

    if (action === "add-block") addBlockModal.showModal();
    if (action === "import-transcript") partEditorRoot.querySelector("#transcriptFileInput")?.click();
    if (action === "generate-transcript") {
        if (!selectedPart().audioUrl) return;
        button.disabled = true;
        showStatus("Generating timestamped transcript...");
        try {
            const result = await generateTranscript(selectedPart().audioUrl);
            selectedPart().transcriptText = result.transcriptText || "";
            selectedPart().transcriptSegments = (result.transcriptSegments || []).map((segment, index) => ({
                ...segment,
                id: `part-${selectedPart().partNumber}-segment-${index + 1}`
            }));
            ListeningTestBuilder();
            showStatus("Transcript generated. Review and correct the segments before saving.", "success");
        } catch (error) {
            button.disabled = false;
            showStatus(error.message, "error");
        }
        return;
    }
    if (["split-segment", "merge-segment", "delete-segment"].includes(action)) {
        const segments = selectedPart().transcriptSegments || [];
        const segmentIndex = Number(button.dataset.segmentIndex);
        const segment = segments[segmentIndex];
        if (!segment) return;
        if (action === "split-segment") {
            const words = String(segment.text || "").trim().split(/\s+/);
            const wordIndex = Math.max(1, Math.ceil(words.length / 2));
            const midpoint = Number(((Number(segment.start) + Number(segment.end)) / 2).toFixed(2));
            const newId = `segment-${Date.now().toString(36)}`;
            segments.splice(segmentIndex, 1,
                { ...segment, end: midpoint, text: words.slice(0, wordIndex).join(" ") },
                { id: newId, start: midpoint, end: Number(segment.end), text: words.slice(wordIndex).join(" ") || "New segment" }
            );
        }
        if (action === "merge-segment" && segmentIndex > 0) {
            const previous = segments[segmentIndex - 1];
            previous.end = segment.end;
            previous.text = `${previous.text} ${segment.text}`.trim();
            segments.splice(segmentIndex, 1);
        }
        if (action === "delete-segment") segments.splice(segmentIndex, 1);
        selectedPart().transcriptText = segments.map((item) => item.text).join(" ").trim();
        const validIds = new Set(segments.map((item) => item.id));
        selectedPart().blocks.forEach((block) => Object.values(block.questionEvidence || {}).forEach((evidence) => {
            evidence.transcriptSegmentIds = (evidence.transcriptSegmentIds || []).filter((id) => validIds.has(id));
        }));
        ListeningTestBuilder();
        return;
    }
    if (action === "remove-audio") {
        selectedPart().audioUrl = "";
        selectedPart().audioFileName = "";
        selectedPart().audioDuration = null;
        ListeningTestBuilder();
    }
    if (action === "remove-full-audio") {
        builderState.fullAudioUrl = "";
        builderState.fullAudioFileName = "";
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
    const evidenceButton = event.target.closest("[data-evidence-action]");
    if (evidenceButton) {
        syncBlockEditorForm();
        const action = evidenceButton.dataset.evidenceAction;
        const audio = blockEditorContent.querySelector("[data-evidence-audio]");
        if (action === "clear") {
            blockDraft.evidenceStartTime = null;
            blockDraft.evidenceEndTime = null;
            blockEditorContent.querySelectorAll("[data-evidence-field]").forEach((field) => {
                field.value = "";
            });
            return;
        }
        if (action === "question-clear") {
            const number = String(evidenceButton.dataset.questionNumber);
            delete blockDraft.questionEvidence?.[number];
            blockEditorContent.querySelectorAll(`[data-question-evidence="${number}"]`).forEach((field) => {
                field.value = "";
            });
            return;
        }
        if (!audio || !Number.isFinite(audio.currentTime)) {
            showStatus("Play the part audio before setting evidence time.", "error");
            return;
        }
        const value = Number(audio.currentTime.toFixed(2));
        const isQuestion = action.startsWith("question-");
        const key = isQuestion
            ? (action.endsWith("start") ? "transcriptStartTime" : "transcriptEndTime")
            : (action.endsWith("start") ? "evidenceStartTime" : "evidenceEndTime");
        if (audio.duration && Number.isFinite(audio.duration) && value > audio.duration) {
            showStatus("Timestamp cannot be after the audio duration.", "error");
            return;
        }
        if (isQuestion) {
            const number = String(evidenceButton.dataset.questionNumber);
            blockDraft.questionEvidence = blockDraft.questionEvidence || {};
            blockDraft.questionEvidence[number] = blockDraft.questionEvidence[number] || {};
            blockDraft.questionEvidence[number][key] = value;
            const field = blockEditorContent.querySelector(
                `[data-question-evidence="${number}"][data-evidence-key="${key}"]`
            );
            if (field) field.value = formatEvidenceTime(value);
        } else {
            blockDraft[key] = value;
            const field = blockEditorContent.querySelector(`[data-evidence-field="${key}"]`);
            if (field) field.value = formatEvidenceTime(value);
        }
        showStatus(`${key.endsWith("StartTime") || key === "evidenceStartTime" ? "Start" : "End"} set to ${formatEvidenceTime(value)}.`, "success");
        return;
    }

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
    if (event.target.matches("[data-question-transcript-segment]")) {
        const number = String(event.target.dataset.questionTranscriptSegment);
        const selectedIds = [...blockEditorContent.querySelectorAll(`[data-question-transcript-segment="${number}"]:checked`)]
            .map((field) => String(field.value));
        const selected = (selectedPart().transcriptSegments || []).filter((segment) => selectedIds.includes(String(segment.id)));
        const setField = (key, value) => {
            const field = blockEditorContent.querySelector(`[data-question-evidence="${number}"][data-evidence-key="${key}"]`);
            if (field) field.value = value;
        };
        setField("relevantText", selected.map((segment) => segment.text).join(" "));
        setField("transcriptStartTime", selected.length ? formatEvidenceTime(Math.min(...selected.map((segment) => Number(segment.start) || 0))) : "");
        setField("transcriptEndTime", selected.length ? formatEvidenceTime(Math.max(...selected.map((segment) => Number(segment.end) || 0))) : "");
        syncBlockEditorForm();
        return;
    }
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
    syncPartAnswersFromQuestionEvidence(blockDraft);
    selectedPart().blocks[editingBlockIndex] = blockDraft;
    blockEditorModal.close();
    ListeningTestBuilder();
    showStatus("Question block updated.", "success");
});

testTitleInput.addEventListener("input", () => {
    builderState.title = testTitleInput.value;
    updateRealtimePreview();
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

// Replaced with split screen live preview toggle
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

// Import HTML handlers
importHtmlBtn.addEventListener("click", () => {
    htmlImportStatus.textContent = "";
    htmlImportStatus.className = "status-text";
    htmlImportFile.value = "";
    importHtmlModal.showModal();
});

function makeImportDropZoneInteractive(zone, input, statusEl) {
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
            handleImportFileSelected(e.dataTransfer.files[0], statusEl);
        }
    });

    input.addEventListener("change", () => {
        if (input.files.length) {
            handleImportFileSelected(input.files[0], statusEl);
        }
    });
}

async function handleImportFileSelected(file, statusEl) {
    if (!isSupportedHtmlFile(file)) {
        statusEl.textContent = "HTML upload failed. Please upload a valid .html file.";
        statusEl.className = "status-text error";
        showStatus("HTML upload failed. Please upload a valid .html file.", "error");
        return;
    }

    statusEl.textContent = "Uploading and parsing HTML file...";
    statusEl.className = "status-text";
    
    try {
        const htmlContent = await readFileAsText(file);
        const formData = new FormData();
        formData.append("html", file);
        formData.append("skill", "listening");

        const response = await fetch("/api/full-tests/import", {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Failed to parse HTML file");
        }

        statusEl.textContent = `Successfully imported: ${file.name}`;
        statusEl.className = "status-text success";
        
        // Hydrate builder with the parsed imported test
        hydrateBuilderState(data.test);
        builderState.listeningHtml = htmlContent;
        builderState.questionsHtml = htmlContent;
        ListeningTestBuilder();
        
        statusEl.textContent = "HTML file loaded successfully.";
        showStatus("HTML file loaded successfully.", "success");
        
        setTimeout(() => {
            importHtmlModal.close();
        }, 1500);

    } catch (error) {
        statusEl.textContent = error.message || "HTML upload failed. Please upload a valid .html file.";
        statusEl.className = "status-text error";
        showStatus(statusEl.textContent, "error");
    }
}

makeImportDropZoneInteractive(htmlImportDropZone, htmlImportFile, htmlImportStatus);


// Audio drop-zone drag/drop handlers via event delegation
partEditorRoot.addEventListener("dragover", (e) => {
    const zone = e.target.closest(".drop-zone");
    if (!zone) return;
    e.preventDefault();
    zone.classList.add("drag-over");
});
partEditorRoot.addEventListener("dragleave", (e) => {
    const zone = e.target.closest(".drop-zone");
    if (!zone) return;
    zone.classList.remove("drag-over");
});
partEditorRoot.addEventListener("drop", async (e) => {
    const zone = e.target.closest(".drop-zone");
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove("drag-over");
    if (e.dataTransfer.files.length) {
        const file = e.dataTransfer.files[0];
        if (!file.name.endsWith(".mp3") && !file.name.endsWith(".wav") && !file.name.endsWith(".m4a")) {
            showStatus("Only MP3, WAV, or M4A audio files are allowed.", "error");
            return;
        }
        const isFullAudio = zone.dataset.audioScope === "full";
        showStatus(isFullAudio ? "Uploading complete Listening audio..." : "Uploading part audio...");
        try {
            const result = await uploadAudio(file);
            if (isFullAudio) {
                builderState.fullAudioUrl = result.audioUrl;
                builderState.fullAudioFileName = result.fileName;
            } else {
                selectedPart().audioUrl = result.audioUrl;
                selectedPart().audioFileName = result.fileName;
            }
            ListeningTestBuilder();
            showStatus(isFullAudio ? "Complete Listening audio uploaded." : "Audio uploaded.", "success");
        } catch (error) {
            showStatus(error.message, "error");
        }
    }
});

// App Entry Initialization
ListeningTestBuilder();
const initialId = new URLSearchParams(window.location.search).get("id");
if (initialId) {
    loadTest(initialId).catch((error) => showStatus(error.message, "error"));
}
