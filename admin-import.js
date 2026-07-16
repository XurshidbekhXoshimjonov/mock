// State Management
let activeMode = "import"; // "import" | "combine"
let activeSkill = "reading"; // "reading" | "listening" (legacy combine tab)
let availableTests = { reading: null, listening: null };
let draftTest = null;

// DOM Elements - Navigation & Core
const modeImportTab = document.getElementById("modeImportTab");
const modeCombineTab = document.getElementById("modeCombineTab");
const importForm = document.getElementById("importForm");
const combineForm = document.getElementById("combineForm");
const importStatus = document.getElementById("importStatus");
const resultPanel = document.getElementById("resultPanel");
const resultMeta = document.getElementById("resultMeta");
const openPlayerLink = document.getElementById("openPlayerLink");
const guideImportMode = document.getElementById("guideImportMode");
const guideCombineMode = document.getElementById("guideCombineMode");

// DOM Elements - Import Mode
const htmlDropZone = document.getElementById("htmlDropZone");
const htmlFile = document.getElementById("htmlFile");
const htmlUploadStatus = document.getElementById("htmlUploadStatus");
const importMetaSection = document.getElementById("importMetaSection");
const importTestTitle = document.getElementById("importTestTitle");
const importTestSkill = document.getElementById("importTestSkill");
const importAudioSection = document.getElementById("importAudioSection");
const audioDropZone = document.getElementById("audioDropZone");
const audioFile = document.getElementById("audioFile");
const audioUploadStatus = document.getElementById("audioUploadStatus");
const importActions = document.getElementById("importActions");
const resetImportBtn = document.getElementById("resetImportBtn");
const publishImportBtn = document.getElementById("publishImportBtn");

// DOM Elements - Live Preview
const livePreviewPanel = document.getElementById("livePreviewPanel");
const previewStats = document.getElementById("previewStats");
const structureNav = document.getElementById("structureNav");
const previewImages = document.getElementById("previewImages");
const editorContent = document.getElementById("editorContent");

// DOM Elements - Combine Mode (Legacy)
const fullTestTitle = document.getElementById("fullTestTitle");
const partsHeading = document.getElementById("partsHeading");
const readingParts = document.getElementById("readingParts");
const listeningParts = document.getElementById("listeningParts");
const combineBtn = document.getElementById("combineBtn");
const guideResult = document.getElementById("guideResult");

// Auth Headers Utility
function authHeaders() {
    return {};
}

// Status Display Helper
function setStatus(message, type = "") {
    importStatus.textContent = message;
    importStatus.className = `import-status ${type}`.trim();
}

// Setup Dropzones
function makeDropZoneInteractive(zone, input, onFileSelected) {
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
            onFileSelected(e.dataTransfer.files[0]);
        }
    });

    input.addEventListener("change", () => {
        if (input.files.length) {
            onFileSelected(input.files[0]);
        }
    });
}

// Mode Selector Toggle
modeImportTab.addEventListener("click", () => setMode("import"));
modeCombineTab.addEventListener("click", () => setMode("combine"));

function setMode(mode) {
    activeMode = mode;
    const isImport = activeMode === "import";

    modeImportTab.classList.toggle("is-active", isImport);
    modeCombineTab.classList.toggle("is-active", !isImport);

    importForm.classList.toggle("hidden", !isImport);
    guideImportMode.classList.toggle("hidden", !isImport);

    combineForm.classList.toggle("hidden", isImport);
    guideCombineMode.classList.toggle("hidden", isImport);

    resultPanel.classList.add("hidden");
    setStatus("");

    if (!isImport) {
        setSkill(activeSkill).catch((err) => setStatus(err.message, "error"));
    }
}

// ==========================================
// IMPORT MODE FUNCTIONALITY
// ==========================================

// Handle HTML file parsing
makeDropZoneInteractive(htmlDropZone, htmlFile, async (file) => {
    htmlUploadStatus.textContent = "Parsing HTML file...";
    htmlUploadStatus.className = "status-text";
    importMetaSection.classList.add("hidden");
    importAudioSection.classList.add("hidden");
    importActions.classList.add("hidden");
    livePreviewPanel.classList.add("hidden");
    draftTest = null;

    try {
        const formData = new FormData();
        formData.append("html", file);
        formData.append("skill", importTestSkill.value);

        const response = await fetch("/api/full-tests/import", {
            method: "POST",
            headers: authHeaders(),
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Failed to parse HTML file");
        }

        draftTest = data.test;
        htmlUploadStatus.textContent = `Successfully parsed: ${file.name}`;
        htmlUploadStatus.className = "status-text success";

        // Prefill title and skill fields
        importTestTitle.value = draftTest.title;
        importTestSkill.value = draftTest.skill;

        // Show configuration sections
        importMetaSection.classList.remove("hidden");
        importActions.classList.remove("hidden");

        // Sync Audio section visibility
        updateAudioSectionVisibility();

        // Render Live Preview
        renderLivePreview();

    } catch (error) {
        htmlUploadStatus.textContent = error.message;
        htmlUploadStatus.className = "status-text error";
    }
});

// Handle Audio file attachment
makeDropZoneInteractive(audioDropZone, audioFile, async (file) => {
    if (!draftTest) {
        audioUploadStatus.textContent = "Error: Import the HTML file first.";
        audioUploadStatus.className = "status-text error";
        return;
    }

    audioUploadStatus.textContent = "Uploading audio file...";
    audioUploadStatus.className = "status-text";

    try {
        const formData = new FormData();
        formData.append("audio", file);

        const response = await fetch(`/api/full-tests/${draftTest.id}/audio`, {
            method: "POST",
            headers: authHeaders(),
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Failed to upload audio file");
        }

        draftTest.listening.audio = data.audio;
        audioUploadStatus.textContent = "Audio uploaded and attached successfully!";
        audioUploadStatus.className = "status-text success";

        // Refresh preview to show audio player if visible
        const activeBtn = structureNav.querySelector("button.active");
        if (activeBtn) activeBtn.click();

    } catch (error) {
        audioUploadStatus.textContent = error.message;
        audioUploadStatus.className = "status-text error";
    }
});

// Update audio section visibility based on selected skill
function updateAudioSectionVisibility() {
    const skill = importTestSkill.value;
    const showAudio = (skill === "listening" || skill === "combined");
    importAudioSection.classList.toggle("hidden", !showAudio);
}

// Update draft metadata (Title/Skill) on field changes
async function updateDraftMetadata() {
    if (!draftTest) return;

    try {
        const title = importTestTitle.value.trim();
        const skill = importTestSkill.value;

        const response = await fetch(`/api/full-tests/${draftTest.id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders()
            },
            body: JSON.stringify({ title, skill })
        });

        const data = await response.json();
        if (response.ok) {
            draftTest.title = title;
            draftTest.skill = skill;
            updateAudioSectionVisibility();
        }
    } catch (error) {
        console.error("Failed to update draft metadata:", error);
    }
}

importTestTitle.addEventListener("change", updateDraftMetadata);
importTestSkill.addEventListener("change", async () => {
    await updateDraftMetadata();
    // Re-render preview to adjust structure
    renderLivePreview();
});

// Reset Import Form
resetImportBtn.addEventListener("click", () => {
    draftTest = null;
    htmlFile.value = "";
    audioFile.value = "";
    htmlUploadStatus.textContent = "";
    audioUploadStatus.textContent = "";
    importMetaSection.classList.add("hidden");
    importAudioSection.classList.add("hidden");
    importActions.classList.add("hidden");
    livePreviewPanel.classList.add("hidden");
});

// Render Live Preview Grid and Sidebar Navigation
function renderLivePreview() {
    if (!draftTest) return;

    livePreviewPanel.classList.remove("hidden");
    structureNav.innerHTML = "";
    previewImages.innerHTML = "";

    const passages = draftTest.reading?.passages || [];
    const sections = draftTest.listening?.sections || [];
    const skill = importTestSkill.value;

    let totalQuestions = 0;

    // Render Reading Passage structure buttons
    if (skill !== "listening") {
        passages.forEach((passage, idx) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "structure-btn";
            btn.textContent = `Reading Passage ${passage.number || idx + 1}`;
            btn.addEventListener("click", () => {
                structureNav.querySelectorAll("button").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                if (window.renderImportPreview) {
                    window.renderImportPreview(draftTest, "reading", idx, null);
                }
            });
            structureNav.appendChild(btn);

            const qCount = (passage.questionGroups || []).reduce((sum, g) => sum + (g.questions || []).length, 0);
            totalQuestions += qCount;
        });
    }

    // Render Listening Section structure buttons
    if (skill !== "reading") {
        sections.forEach((section, idx) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "structure-btn";
            btn.textContent = `Listening Section ${section.number || idx + 1}`;
            btn.addEventListener("click", () => {
                structureNav.querySelectorAll("button").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                if (window.renderImportPreview) {
                    window.renderImportPreview(draftTest, "listening", null, idx);
                }
            });
            structureNav.appendChild(btn);

            const qCount = (section.questionGroups || []).reduce((sum, g) => sum + (g.questions || []).length, 0);
            totalQuestions += qCount;
        });
    }

    // Display Media Images
    const images = draftTest.images || [];
    if (images.length) {
        images.forEach((img) => {
            const wrapper = document.createElement("div");
            wrapper.className = "preview-image-wrapper";
            const element = document.createElement("img");
            element.src = img.src;
            element.alt = img.alt || "imported image";
            const label = document.createElement("small");
            label.textContent = `${img.section || "reading"} (${img.id})`;
            wrapper.appendChild(element);
            wrapper.appendChild(label);
            previewImages.appendChild(wrapper);
        });
    } else {
        previewImages.textContent = "No images found.";
    }

    // Update Stats Display
    let statText = "";
    if (skill === "reading") {
        statText = `${passages.length} Passages · ${totalQuestions} Questions`;
    } else if (skill === "listening") {
        statText = `${sections.length} Sections · ${totalQuestions} Questions`;
    } else {
        statText = `${passages.length} Passages, ${sections.length} Sections · ${totalQuestions} Questions`;
    }
    previewStats.textContent = statText;

    // Automatically click first structure navigation button if any exist
    const firstBtn = structureNav.querySelector("button");
    if (firstBtn) firstBtn.click();
}

// Publish Draft Test
importForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!draftTest) return;

    setStatus("Publishing test and splitting parts...");
    try {
        const response = await fetch(`/api/full-tests/${draftTest.id}/publish`, {
            method: "POST",
            headers: authHeaders()
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Publish failed");
        }

        setStatus("Test published successfully!", "success");
        resultPanel.classList.remove("hidden");
        livePreviewPanel.classList.add("hidden");
        importMetaSection.classList.add("hidden");
        importAudioSection.classList.add("hidden");
        importActions.classList.add("hidden");

        const skill = draftTest.skill;
        const summary = data.summary || {};
        resultMeta.textContent = `${draftTest.title} — status: published`;
        openPlayerLink.href = summary.openUrl || `/${skill === "listening" ? "listening" : "reading"}/${encodeURIComponent(summary.slug || draftTest.title || "test")}`;

        draftTest = null;
        htmlFile.value = "";
        audioFile.value = "";

    } catch (error) {
        setStatus(error.message, "error");
    }
});

// ==========================================
// COMBINE MODE FUNCTIONALITY (LEGACY)
// ==========================================

function optionLabel(test) {
    const part = test.part ? `Part ${test.part}` : "";
    const count = test.questionCount ? `${test.questionCount} Q` : "";
    return `${test.title} (${[part, count].filter(Boolean).join(" · ")})`;
}

function renderPartOptions(skill) {
    document.querySelectorAll(`[data-part-select="${skill}"]`).forEach((select) => {
        const part = Number(select.dataset.part);
        const tests = availableTests[skill].filter((test) => Number(test.part) === part);
        select.innerHTML = tests.length
            ? `<option value="">Select Part ${part}…</option>${tests.map((test) =>
                `<option value="${test.id}">${optionLabel(test)}</option>`
            ).join("")}`
            : `<option value="">No Part ${part} tests available</option>`;
    });
}

async function loadSkillTests(skill) {
    if (Array.isArray(availableTests[skill])) {
        renderPartOptions(skill);
        return;
    }

    setStatus(`Loading ${skill} parts…`);
    const endpoint = skill === "listening" ? "/api/listening-tests?includeDerived=1" : "/api/reading-tests";
    const response = await fetch(endpoint);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `Could not load ${skill} parts`);
    }

    availableTests[skill] = data;
    renderPartOptions(skill);
    setStatus("");
}

async function setSkill(skill) {
    activeSkill = skill === "listening" ? "listening" : "reading";
    const isReading = activeSkill === "reading";

    readingParts.classList.toggle("hidden", !isReading);
    listeningParts.classList.toggle("hidden", isReading);
    partsHeading.textContent = `Select ${isReading ? "Reading" : "Listening"} Parts`;
    combineBtn.textContent = `Create Full ${isReading ? "Reading" : "Listening"} Test`;
    guideResult.textContent = `One complete ${isReading ? "Reading test with 3 parts" : "Listening test with 4 parts"}.`;

    document.querySelectorAll("[data-part-select]").forEach((select) => {
        select.required = select.dataset.partSelect === activeSkill;
    });
    document.querySelectorAll("[data-skill-tab]").forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.skillTab === activeSkill);
    });
    resultPanel.classList.add("hidden");
    await loadSkillTests(activeSkill);
}

combineForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(`Combining ${activeSkill} parts…`);

    try {
        const partIds = [...document.querySelectorAll(`[data-part-select="${activeSkill}"]`)]
            .map((select) => select.value);
        const response = await fetch("/api/full-tests/combine", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders()
            },
            body: JSON.stringify({
                title: fullTestTitle.value.trim(),
                skill: activeSkill,
                partIds
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Combine failed");
        }

        const summary = data.summary || {};
        setStatus("Full test created.", "success");
        resultPanel.classList.remove("hidden");
        resultMeta.textContent =
            `${data.test.title} — ${summary.questionCount || 0} questions · status: ${data.test.status}`;
        openPlayerLink.href = summary.openUrl || `/${activeSkill === "listening" ? "listening" : "reading"}/${encodeURIComponent(summary.slug || data.test.title || "test")}`;
    } catch (error) {
        setStatus(error.message, "error");
        resultPanel.classList.add("hidden");
    }
});

document.querySelectorAll("[data-skill-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
        setSkill(tab.dataset.skillTab).catch((error) => setStatus(error.message, "error"));
    });
});

// Initialize to Import Mode on load
setMode("import");
