const mockBuilderForm = document.getElementById("mockBuilderForm");
const mockTitleInput = document.getElementById("mockTitle");
const mockNumberInput = document.getElementById("mockNumber");
const mockStatusInput = document.getElementById("mockStatus");
const sectionGrid = document.getElementById("sectionGrid");
const mockAdminStatus = document.getElementById("mockAdminStatus");
const newMockBtn = document.getElementById("newMockBtn");
const deleteMockBtn = document.getElementById("deleteMockBtn");
const testFormModal = document.getElementById("testFormModal");
const formIframe = document.getElementById("formIframe");
const modalTitle = document.getElementById("modalTitle");
const modalKicker = document.getElementById("modalKicker");
const closeModalBtn = document.getElementById("closeModalBtn");
const refreshCatalogBtn = document.getElementById("refreshCatalogBtn");
const deleteMockModal = document.getElementById("deleteMockModal");
const cancelDeleteMock = document.getElementById("cancelDeleteMock");
const confirmDeleteMock = document.getElementById("confirmDeleteMock");

const SECTION_CONFIG = {
    listening: {
        label: "Listening",
        idField: "listeningTestId",
        endpoint: "/api/listening-tests?includeDerived=1",
        adminUrl: "/admin-listening?mockBuilder=1&section=listening",
        createLabel: "Create Listening Test",
        description: "Upload audio, build all four parts, transcripts, questions, and answer keys.",
        accent: "blue",
        icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14v-2a9 9 0 0 1 18 0v2"></path><path d="M5 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z"></path><path d="M16 14h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3v-6Z"></path></svg>`
    },
    reading: {
        label: "Reading",
        idField: "readingTestId",
        endpoint: "/api/reading-tests",
        adminUrl: "/admin-reading?mockBuilder=1&section=reading",
        createLabel: "Create or Upload Reading Test",
        description: "Use passage text, HTML upload, question groups, answers, and vocabulary tools.",
        accent: "indigo",
        icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path></svg>`
    },
    writing: {
        label: "Writing",
        idField: "writingTestId",
        endpoint: "/api/admin/writing/full-tests",
        adminUrl: "/admin-writing?mockBuilder=1&type=full&section=writing",
        createLabel: "Create Writing Test",
        description: "Create Task 1, Task 2, then combine them into a Full Writing Test.",
        accent: "violet",
        icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>`
    },
    speaking: {
        label: "Speaking",
        idField: "speakingTestId",
        endpoint: "/api/admin/speaking/full",
        adminUrl: "/admin-speaking/full?mockBuilder=1&section=full",
        createLabel: "Create Speaking Test",
        description: "Create Part 1, cue-card Part 2, Part 3, and publish a Full Speaking Test.",
        accent: "purple",
        icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path></svg>`
    }
};

const sectionOrder = Object.keys(SECTION_CONFIG);

let summaries = [];
let activeTest = blankMockTest();
let pendingDeleteId = "";
let activeModalSection = "";
let catalog = sectionOrder.reduce((items, section) => {
    items[section] = [];
    return items;
}, {});

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setStatus(message, type = "") {
    mockAdminStatus.textContent = message || "";
    mockAdminStatus.dataset.type = type;
}

async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || data.message || "Request failed");
    }
    return data;
}

function optionId(item) {
    return String(item?._id || item?.id || "");
}

function getItemStatus(item) {
    return String(item?.status || item?.state || "").trim();
}

function normalizePartLabel(part) {
    const raw = String(part || "").trim();
    if (!raw || raw === "full") return "Full test";
    return /^part\s+/i.test(raw) ? raw : `Part ${raw}`;
}

function optionTitle(item, fallback) {
    return String(item?.title || item?.name || fallback || "Untitled test").trim();
}

function optionMeta(item, section) {
    const meta = [];
    const status = getItemStatus(item);
    if (section === "reading" || section === "listening") {
        meta.push(normalizePartLabel(item?.part));
    } else {
        meta.push("Full test");
    }
    if (status) meta.push(status);
    const count = Number(item?.questionCount || item?.questionsCount || item?.answersCount);
    if (Number.isFinite(count) && count > 0) meta.push(`${count} questions`);
    return meta.filter(Boolean).join(" | ");
}

function uniqueById(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter((item) => {
        const id = optionId(item);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function hasAllSectionIds(test) {
    return sectionOrder.every((section) => String(test?.[SECTION_CONFIG[section].idField] || "").trim());
}

function nextMockNumber() {
    return summaries.reduce((max, test) => Math.max(max, Number(test.testNumber || test.number) || 0), 0) + 1;
}

function blankMockTest() {
    return {
        id: "",
        title: "",
        testNumber: 1,
        number: 1,
        status: "draft",
        listeningTestId: "",
        readingTestId: "",
        writingTestId: "",
        speakingTestId: ""
    };
}

function sectionValue(section) {
    return String(activeTest?.[SECTION_CONFIG[section].idField] || "");
}

function selectedCatalogItem(section) {
    const id = sectionValue(section);
    return (catalog[section] || []).find((item) => optionId(item) === id) || null;
}

function selectedCount() {
    return sectionOrder.filter((section) => sectionValue(section)).length;
}

function applyTestToForm(test) {
    const normalized = {
        ...blankMockTest(),
        ...test,
        testNumber: Number(test?.testNumber || test?.number) || nextMockNumber(),
        number: Number(test?.testNumber || test?.number) || nextMockNumber(),
        status: test?.status === "active" ? "active" : "draft"
    };
    activeTest = normalized;
    mockTitleInput.value = normalized.title || "";
    mockNumberInput.value = normalized.testNumber || normalized.number || nextMockNumber();
    mockStatusInput.value = normalized.status;
    deleteMockBtn.classList.toggle("is-hidden", !normalized.id);
    renderSectionCards();
}

function updateActiveFromForm() {
    activeTest = {
        ...activeTest,
        title: mockTitleInput.value.trim(),
        testNumber: Number(mockNumberInput.value) || 1,
        number: Number(mockNumberInput.value) || 1,
        status: mockStatusInput.value === "active" ? "active" : "draft"
    };
}

function renderSectionCards() {
    sectionGrid.innerHTML = sectionOrder.map((section) => {
        const config = SECTION_CONFIG[section];
        const selected = sectionValue(section);
        const items = catalog[section] || [];
        const options = items.map((item) => {
            const id = optionId(item);
            const meta = optionMeta(item, section);
            const label = meta ? `${optionTitle(item, config.label)} - ${meta}` : optionTitle(item, config.label);
            return `<option value="${escapeHtml(id)}" ${selected === id ? "selected" : ""}>${escapeHtml(label)}</option>`;
        }).join("");
        const preview = renderPreview(section);

        return `
            <article class="mock-section-card mock-section-card--${escapeHtml(config.accent)}">
                <div class="mock-section-card__top">
                    <span class="mock-section-icon">${config.icon}</span>
                    <div>
                        <h3>${escapeHtml(config.label)}</h3>
                        <p>${escapeHtml(config.description)}</p>
                    </div>
                </div>
                <label class="mock-field">
                    <span>Select existing test</span>
                    <select data-section-select="${escapeHtml(section)}">
                        <option value="">Select ${escapeHtml(config.label)} test</option>
                        ${options}
                    </select>
                </label>
                <button class="mock-btn mock-btn--light mock-create-btn" type="button" data-create-section="${escapeHtml(section)}">
                    ${escapeHtml(config.createLabel)}
                </button>
                <div class="mock-selected-preview" id="${escapeHtml(section)}Preview">${preview}</div>
            </article>
        `;
    }).join("");
}

function renderPreview(section) {
    const config = SECTION_CONFIG[section];
    const item = selectedCatalogItem(section);
    if (!item) {
        return `
            <div class="mock-preview-empty">
                <strong>No ${escapeHtml(config.label)} test selected</strong>
                <span>Create a new test or choose one from the dropdown.</span>
            </div>
        `;
    }

    const meta = optionMeta(item, section);
    const openUrl = item.openUrl || "";
    const editUrl = section === "listening"
        ? `/admin-listening?id=${encodeURIComponent(optionId(item))}`
        : section === "reading"
            ? "/admin-reading"
            : section === "writing"
                ? "/admin-writing"
                : "/admin-speaking/full";

    return `
        <div class="mock-preview-selected">
            <span>Selected ${escapeHtml(config.label)}</span>
            <strong>${escapeHtml(optionTitle(item, config.label))}</strong>
            ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
            <div class="mock-preview-links">
                ${openUrl ? `<a href="${escapeHtml(openUrl)}" target="_blank" rel="noreferrer">Open</a>` : ""}
                <a href="${escapeHtml(editUrl)}" target="_blank" rel="noreferrer">Edit</a>
            </div>
        </div>
    `;
}

async function loadCatalog(section) {
    const config = SECTION_CONFIG[section];
    const items = await readJson(await fetch(config.endpoint, { cache: "no-store" }));
    catalog[section] = uniqueById(items);
}

async function loadCatalogs() {
    await Promise.all(sectionOrder.map(loadCatalog));
}

async function loadMockTests() {
    const data = await readJson(await fetch("/api/admin/mock-tests", { cache: "no-store" }));
    summaries = Array.isArray(data.tests) ? data.tests : [];
}

async function loadCurrentMockTest() {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
        const draft = blankMockTest();
        draft.testNumber = nextMockNumber();
        draft.number = draft.testNumber;
        applyTestToForm(draft);
        return;
    }

    const data = await readJson(await fetch(`/api/admin/mock-tests/${encodeURIComponent(id)}`, { cache: "no-store" }));
    applyTestToForm(data.test);
}

function validatePayload(payload) {
    if (!payload.title) {
        setStatus("Mock Test title is required.", "error");
        return false;
    }
    if (!Number.isFinite(Number(payload.number)) || Number(payload.number) <= 0) {
        setStatus("Mock Test number is required.", "error");
        return false;
    }
    if (payload.status === "active" && !hasAllSectionIds(payload)) {
        setStatus("Active Mock Test requires Listening, Reading, Writing, and Speaking tests.", "error");
        return false;
    }
    return true;
}

function collectPayload() {
    updateActiveFromForm();
    return {
        title: activeTest.title,
        number: activeTest.number,
        testNumber: activeTest.testNumber,
        status: activeTest.status,
        listeningTestId: activeTest.listeningTestId || "",
        readingTestId: activeTest.readingTestId || "",
        writingTestId: activeTest.writingTestId || "",
        speakingTestId: activeTest.speakingTestId || ""
    };
}

async function saveMockTest() {
    const payload = collectPayload();
    if (!validatePayload(payload)) return;

    setStatus("Saving Mock Test...");
    const url = activeTest.id
        ? `/api/admin/mock-tests/${encodeURIComponent(activeTest.id)}`
        : "/api/admin/mock-tests";
    const data = await readJson(await fetch(url, {
        method: activeTest.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }));

    await loadMockTests();
    applyTestToForm(data.test);
    const savedUrl = new URL(window.location.href);
    savedUrl.searchParams.set("id", data.test.id);
    history.replaceState({}, "", savedUrl.toString());
    setStatus(`Mock Test saved. ${selectedCount()} of 4 sections selected.`, "success");
}

function openCreateModal(section) {
    const config = SECTION_CONFIG[section];
    activeModalSection = section;
    modalKicker.textContent = `${config.label} section`;
    modalTitle.textContent = config.createLabel;
    formIframe.src = config.adminUrl;
    if (!testFormModal.open) testFormModal.showModal();
}

function closeCreateModal() {
    formIframe.src = "about:blank";
    activeModalSection = "";
    testFormModal.close();
}

function findNewestItem(section) {
    return (catalog[section] || [])
        .slice()
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0] || null;
}

async function refreshAndAttach(section = activeModalSection, preferredId = "") {
    if (!section) return;
    await loadCatalog(section);
    const selected = preferredId
        ? (catalog[section] || []).find((item) => optionId(item) === String(preferredId))
        : findNewestItem(section);

    if (selected) {
        activeTest[SECTION_CONFIG[section].idField] = optionId(selected);
        renderSectionCards();
        setStatus(`${SECTION_CONFIG[section].label} test attached to this Mock Test.`, "success");
    } else {
        renderSectionCards();
        setStatus(`No ${SECTION_CONFIG[section].label} test found yet.`, "error");
    }
}

function handleBuilderMessage(event) {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.type !== "ieltsx-admin-test-saved") return;

    const section = data.section === "full" ? activeModalSection : data.section;
    if (!section || !SECTION_CONFIG[section]) return;

    if (data.attachable === false) {
        loadCatalog(section)
            .then(() => {
                renderSectionCards();
                setStatus(data.message || `${SECTION_CONFIG[section].label} item saved. Create or save a full test to attach it to this Mock Test.`, "success");
            })
            .catch((error) => setStatus(error.message, "error"));
        return;
    }

    const testId = data.testId || data.id || data.test?._id || data.test?.id || "";
    refreshAndAttach(section, testId).then(() => {
        if (testFormModal.open) {
            closeCreateModal();
        }
    }).catch((error) => setStatus(error.message, "error"));
}

async function deleteCurrentMockTest() {
    if (!pendingDeleteId) return;
    setStatus("Deleting Mock Test...");
    await readJson(await fetch(`/api/admin/mock-tests/${encodeURIComponent(pendingDeleteId)}`, {
        method: "DELETE"
    }));
    pendingDeleteId = "";
    deleteMockModal.close();
    await loadMockTests();
    const draft = blankMockTest();
    draft.testNumber = nextMockNumber();
    draft.number = draft.testNumber;
    applyTestToForm(draft);
    history.replaceState({}, "", "/admin-mock-tests");
    setStatus("Mock Test deleted.", "success");
}

function resetBuilder() {
    const draft = blankMockTest();
    draft.testNumber = nextMockNumber();
    draft.number = draft.testNumber;
    applyTestToForm(draft);
    history.replaceState({}, "", "/admin-mock-tests");
    setStatus("New draft ready.", "success");
}

sectionGrid.addEventListener("change", (event) => {
    const select = event.target.closest("[data-section-select]");
    if (!select) return;
    const section = select.dataset.sectionSelect;
    activeTest[SECTION_CONFIG[section].idField] = select.value;
    renderSectionCards();
});

sectionGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-create-section]");
    if (!button) return;
    openCreateModal(button.dataset.createSection);
});

mockBuilderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveMockTest().catch((error) => setStatus(error.message || "Failed to save Mock Test.", "error"));
});

[mockTitleInput, mockNumberInput, mockStatusInput].forEach((field) => {
    field.addEventListener("input", updateActiveFromForm);
    field.addEventListener("change", updateActiveFromForm);
});

newMockBtn.addEventListener("click", resetBuilder);

deleteMockBtn.addEventListener("click", () => {
    if (!activeTest.id) return;
    pendingDeleteId = activeTest.id;
    deleteMockModal.showModal();
});

cancelDeleteMock.addEventListener("click", () => {
    pendingDeleteId = "";
    deleteMockModal.close();
});

confirmDeleteMock.addEventListener("click", () => {
    deleteCurrentMockTest().catch((error) => setStatus(error.message || "Failed to delete Mock Test.", "error"));
});

closeModalBtn.addEventListener("click", () => {
    closeCreateModal();
});

refreshCatalogBtn.addEventListener("click", () => {
    refreshAndAttach().catch((error) => setStatus(error.message, "error"));
});

testFormModal.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModalBtn.click();
});

window.addEventListener("message", handleBuilderMessage);

(async function initMockBuilder() {
    try {
        setStatus("Loading Mock Test Builder...");
        await Promise.all([loadMockTests(), loadCatalogs()]);
        await loadCurrentMockTest();
        setStatus("Builder ready.", "success");
    } catch (error) {
        console.error("Failed to load Mock Test Builder:", error);
        setStatus(error.message || "Could not load Mock Test Builder.", "error");
        renderSectionCards();
    }
})();
