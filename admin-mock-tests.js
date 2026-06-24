const mockTestList = document.getElementById("mockTestList");
const mockTestEditor = document.getElementById("mockTestEditor");
const createMockTest = document.getElementById("createMockTest");
const mockAdminStatus = document.getElementById("mockAdminStatus");
const deleteMockModal = document.getElementById("deleteMockModal");
const cancelDeleteMock = document.getElementById("cancelDeleteMock");
const confirmDeleteMock = document.getElementById("confirmDeleteMock");

const REQUIRED_SELECTION_MESSAGE = "Please select Listening, Reading, Writing, and Speaking tests.";
const SAVE_FAILED_MESSAGE = "Failed to save mock test.";

let summaries = [];
let activeTest = null;
let pendingDeleteId = "";
let catalog = {
    listening: [],
    reading: [],
    writing: [],
    speaking: []
};

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showStatus(message, type = "") {
    mockAdminStatus.textContent = message || "";
    mockAdminStatus.style.color = type === "error" ? "#dc2626" : "";
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

function optionTitle(item, fallback) {
    const parts = [
        item?.title || fallback,
        item?.part && item.part !== "full" ? `Part ${item.part}` : "",
        item?.status ? item.status : ""
    ].filter(Boolean);
    return parts.join(" - ");
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

function nextMockNumber() {
    return summaries.reduce((max, test) => Math.max(max, Number(test.testNumber || test.number) || 0), 0) + 1;
}

function blankMockTest() {
    const number = nextMockNumber();
    return {
        id: "",
        title: "",
        testNumber: number,
        number,
        description: "",
        status: "active",
        listeningTestId: "",
        readingTestId: "",
        writingTestId: "",
        speakingTestId: ""
    };
}

async function loadCatalogs() {
    const [listening, reading, writing, speaking] = await Promise.all([
        readJson(await fetch("/api/listening-tests?includeDerived=1", { cache: "no-store" })),
        readJson(await fetch("/api/reading-tests", { cache: "no-store" })),
        readJson(await fetch("/api/admin/writing/full-tests", { cache: "no-store" })),
        readJson(await fetch("/api/admin/speaking/full", { cache: "no-store" }))
    ]);

    catalog = {
        listening: uniqueById(listening),
        reading: uniqueById(reading),
        writing: uniqueById(writing),
        speaking: uniqueById(speaking)
    };
}

async function loadMockTests(selectId = "") {
    const data = await readJson(await fetch("/api/admin/mock-tests", { cache: "no-store" }));
    summaries = Array.isArray(data.tests) ? data.tests : [];
    renderList();

    if (selectId) {
        await selectMockTest(selectId);
        return;
    }

    if (activeTest?.id && summaries.some((test) => test.id === activeTest.id)) {
        await selectMockTest(activeTest.id);
        return;
    }

    activeTest = summaries.length ? { ...summaries[0] } : null;
    if (activeTest?.id) {
        await selectMockTest(activeTest.id);
    } else {
        renderEditor();
    }
}

async function selectMockTest(id) {
    if (!id) {
        activeTest = null;
        renderList();
        renderEditor();
        return;
    }

    const data = await readJson(await fetch(`/api/admin/mock-tests/${encodeURIComponent(id)}`, { cache: "no-store" }));
    activeTest = data.test;
    renderList();
    renderEditor();
}

function statusLabel(status) {
    return status === "active" ? "Active" : "Inactive";
}

function renderList() {
    if (!summaries.length) {
        mockTestList.innerHTML = '<div class="empty-state">No mock tests available yet.</div>';
        return;
    }

    mockTestList.innerHTML = summaries.map((test) => `
        <button class="mock-admin-row ${activeTest?.id === test.id ? "is-active" : ""}" type="button" data-select-test="${escapeHtml(test.id)}">
            <strong>${escapeHtml(test.title)}</strong>
            <span>Mock Test ${escapeHtml(test.testNumber || test.number || "")} - ${escapeHtml(statusLabel(test.status))}</span>
        </button>
    `).join("");
}

function catalogSelect(section, label, selectedValue) {
    const items = catalog[section] || [];
    const disabled = items.length ? "" : " disabled";
    const options = items.map((item) => {
        const id = optionId(item);
        return `<option value="${escapeHtml(id)}" ${String(selectedValue || "") === id ? "selected" : ""}>${escapeHtml(optionTitle(item, label))}</option>`;
    }).join("");
    const warning = items.length
        ? ""
        : `<p class="mock-field-warning">No ${escapeHtml(label)} tests found. Please create a ${escapeHtml(label)} test first.</p>`;

    return `
        <label class="mock-field">
            <span>${escapeHtml(label)} test</span>
            <select data-field="${section}TestId"${disabled}>
                <option value="">Select ${escapeHtml(label)} test</option>
                ${options}
            </select>
            ${warning}
        </label>
    `;
}

function renderEditor() {
    if (!activeTest) {
        mockTestEditor.innerHTML = `
            <div class="mock-editor-empty">
                <h2>No mock test selected</h2>
                <p class="admin-help">Create a mock test, then choose existing Listening, Reading, Writing, and Speaking tests.</p>
            </div>
        `;
        return;
    }

    const isSaved = Boolean(activeTest.id);
    mockTestEditor.innerHTML = `
        <form id="mockTestForm" class="mock-create-panel">
            <div class="mock-editor-head">
                <div class="mock-editor-title">
                    <strong>${escapeHtml(isSaved ? activeTest.title : "New Mock Test")}</strong>
                    <span class="admin-help">Mock tests reference existing section tests. Content is managed in each section admin page.</span>
                </div>
                <div class="mock-admin-actions">
                    <button class="secondary-action" type="button" data-action="new">New</button>
                    ${isSaved ? '<button class="danger-action" type="button" data-action="delete">Delete</button>' : ""}
                    <button class="primary-action" type="submit">Save</button>
                </div>
            </div>

            <div class="mock-form-grid mock-meta-grid">
                <label class="mock-field">
                    <span>Mock Test title</span>
                    <input data-field="title" type="text" value="${escapeHtml(activeTest.title)}" required>
                </label>
                <label class="mock-field">
                    <span>Mock Test number</span>
                    <input data-field="testNumber" type="number" min="1" step="1" value="${escapeHtml(activeTest.testNumber || activeTest.number || 1)}" required>
                </label>
                <label class="mock-field">
                    <span>Status</span>
                    <select data-field="status">
                        <option value="active" ${activeTest.status === "active" ? "selected" : ""}>Active</option>
                        <option value="inactive" ${activeTest.status !== "active" ? "selected" : ""}>Inactive</option>
                    </select>
                </label>
                <label class="mock-field full">
                    <span>Description</span>
                    <textarea data-field="description" rows="4" placeholder="Optional description">${escapeHtml(activeTest.description || "")}</textarea>
                </label>
                ${catalogSelect("listening", "Listening", activeTest.listeningTestId)}
                ${catalogSelect("reading", "Reading", activeTest.readingTestId)}
                ${catalogSelect("writing", "Writing", activeTest.writingTestId)}
                ${catalogSelect("speaking", "Speaking", activeTest.speakingTestId)}
            </div>
        </form>
    `;
}

function collectPayload() {
    const payload = {
        title: "",
        testNumber: 1,
        description: "",
        status: "active",
        listeningTestId: "",
        readingTestId: "",
        writingTestId: "",
        speakingTestId: ""
    };

    mockTestEditor.querySelectorAll("[data-field]").forEach((field) => {
        const key = field.dataset.field;
        payload[key] = key === "testNumber" ? Number(field.value) : field.value.trim();
    });

    return payload;
}

function validatePayload(payload) {
    if (!payload.title) {
        showStatus("Mock Test title is required.", "error");
        return false;
    }

    if (!Number.isFinite(Number(payload.testNumber)) || Number(payload.testNumber) <= 0) {
        showStatus("Mock Test number is required.", "error");
        return false;
    }

    if (!payload.listeningTestId || !payload.readingTestId || !payload.writingTestId || !payload.speakingTestId) {
        showStatus(REQUIRED_SELECTION_MESSAGE, "error");
        return false;
    }

    return true;
}

async function saveActiveTest() {
    if (!activeTest) return;

    const payload = collectPayload();
    if (!validatePayload(payload)) return;

    const isUpdate = Boolean(activeTest.id);
    const response = await fetch(isUpdate ? `/api/admin/mock-tests/${encodeURIComponent(activeTest.id)}` : "/api/admin/mock-tests", {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await readJson(response);
    const savedTest = data.test || {};
    showStatus(data.message || (isUpdate ? "Mock test updated successfully." : "Mock test created successfully."));
    await loadMockTests(savedTest.id);
}

function openDeleteModal() {
    if (!activeTest?.id) return;
    pendingDeleteId = activeTest.id;
    if (deleteMockModal?.showModal) {
        deleteMockModal.showModal();
    } else if (deleteMockModal) {
        deleteMockModal.classList.add("is-open");
    }
}

function closeDeleteModal() {
    pendingDeleteId = "";
    if (deleteMockModal?.close) {
        deleteMockModal.close();
    } else if (deleteMockModal) {
        deleteMockModal.classList.remove("is-open");
    }
}

async function deleteActiveTest() {
    if (!pendingDeleteId) return;
    const response = await fetch(`/api/admin/mock-tests/${encodeURIComponent(pendingDeleteId)}`, {
        method: "DELETE"
    });
    const data = await readJson(response);
    closeDeleteModal();
    showStatus(data.message || "Mock test deleted successfully.");
    activeTest = null;
    await loadMockTests();
}

mockTestList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-test]");
    if (!button) return;
    selectMockTest(button.dataset.selectTest).catch((error) => showStatus(error.message, "error"));
});

mockTestEditor.addEventListener("input", (event) => {
    const field = event.target.closest("[data-field]");
    if (!field || !activeTest) return;
    const key = field.dataset.field;
    activeTest[key] = key === "testNumber" ? Number(field.value) : field.value;
});

mockTestEditor.addEventListener("change", (event) => {
    const field = event.target.closest("[data-field]");
    if (!field || !activeTest) return;
    const key = field.dataset.field;
    activeTest[key] = key === "testNumber" ? Number(field.value) : field.value;
});

mockTestEditor.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "new") {
        activeTest = blankMockTest();
        renderList();
        renderEditor();
        showStatus("");
        return;
    }

    if (action === "delete") {
        openDeleteModal();
    }
});

mockTestEditor.addEventListener("submit", (event) => {
    event.preventDefault();
    saveActiveTest().catch((error) => {
        const message = error.message && error.message.includes(REQUIRED_SELECTION_MESSAGE)
            ? REQUIRED_SELECTION_MESSAGE
            : SAVE_FAILED_MESSAGE;
        showStatus(message, "error");
    });
});

createMockTest.addEventListener("click", () => {
    activeTest = blankMockTest();
    renderList();
    renderEditor();
    showStatus("");
});

cancelDeleteMock?.addEventListener("click", closeDeleteModal);
deleteMockModal?.addEventListener("cancel", closeDeleteModal);
confirmDeleteMock?.addEventListener("click", () => {
    deleteActiveTest().catch((error) => showStatus(error.message || "Could not delete mock test.", "error"));
});

(async function boot() {
    try {
        mockTestList.textContent = "Loading mock tests...";
        mockTestEditor.innerHTML = '<p class="admin-help">Loading Mock Test admin...</p>';
        await loadCatalogs();
        await loadMockTests();
    } catch (error) {
        mockTestList.innerHTML = '<div class="empty-state">Could not load mock tests.</div>';
        mockTestEditor.innerHTML = '<p class="admin-help">Please sign in as an admin and make sure the section test pages are available.</p>';
        showStatus(error.message || "Failed to save mock test.", "error");
    }
}());
