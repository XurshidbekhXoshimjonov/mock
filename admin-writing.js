const DEFAULTS = {
    task1: { wordLimit: 150, timeLimit: 20 },
    task2: { wordLimit: 250, timeLimit: 40 },
    full: { timeLimit: 60 }
};

const TYPE_LABELS = {
    task1: "Writing Task 1",
    task2: "Writing Task 2",
    full: "Writing Full Test"
};

const QUESTION_TYPE_LABELS = {
    "agree-disagree": "Agree / Disagree",
    "discuss-both-views": "Discuss both views",
    "advantages-disadvantages": "Advantages / Disadvantages",
    "problem-solution": "Problem / Solution",
    opinion: "Opinion"
};

const state = {
    prompts: [],
    fullTests: [],
    activeFilter: "all",
    sort: "newest",
    search: "",
    editing: null,
    pendingDelete: null,
    toastTimer: null
};

const mockBuilderParams = new URLSearchParams(window.location.search);
const isMockBuilderEmbed = mockBuilderParams.get("mockBuilder") === "1";

function notifyMockBuilder(test, options = {}) {
    if (!isMockBuilderEmbed || window.parent === window || !test) return;
    window.parent.postMessage({
        type: "ieltsx-admin-test-saved",
        section: "writing",
        testId: test._id || test.id,
        test,
        attachable: options.attachable !== false,
        message: options.message || ""
    }, window.location.origin);
}

function openInitialMockBuilderForm() {
    if (!isMockBuilderEmbed) return;
    const type = mockBuilderParams.get("type") || "full";
    openBuilder(TYPE_LABELS[type] ? type : "full");
}

document.addEventListener("DOMContentLoaded", () => {
    if (isMockBuilderEmbed) {
        document.body.classList.add("mock-builder-embed");
    }
    bindPageEvents();
    loadAllData().then(openInitialMockBuilderForm).catch(() => {});
    updateBuilderMode();
    updateLivePreview();
});

function el(id) {
    return document.getElementById(id);
}

function bindPageEvents() {
    el("createWritingTestBtn").addEventListener("click", () => openBuilder("task1"));
    el("emptyCreateBtn").addEventListener("click", () => openBuilder("task1"));
    el("closeBuilderBtn").addEventListener("click", closeBuilder);
    el("cancelBuilderBtn").addEventListener("click", closeBuilder);
    el("closePreviewBtn").addEventListener("click", closePreview);
    el("cancelDeleteBtn").addEventListener("click", closeDeleteConfirm);
    el("confirmDeleteBtn").addEventListener("click", confirmDelete);
    el("writingBuilderForm").addEventListener("submit", saveBuilder);
    el("builderType").addEventListener("change", () => {
        updateBuilderMode();
        updateLivePreview();
    });
    el("writingSearchInput").addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        renderDashboard();
    });
    el("writingSortSelect").addEventListener("change", (event) => {
        state.sort = event.target.value;
        renderDashboard();
    });
    el("writingTabs").addEventListener("click", (event) => {
        const button = event.target.closest("[data-filter]");
        if (!button) return;
        state.activeFilter = button.dataset.filter;
        document.querySelectorAll(".admin-writing-tab").forEach((tab) => {
            tab.classList.toggle("active", tab === button);
        });
        renderDashboard();
    });
    el("writingTestsGrid").addEventListener("click", handleCardAction);
    el("removeImageBtn").addEventListener("click", () => {
        el("promptImageUrl").value = "";
        el("imagePreview").removeAttribute("src");
        el("imagePreviewBox").classList.add("is-hidden");
        updateLivePreview();
    });
    el("imageFile").addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (file) uploadPromptImage(file);
    });
    setupDropZone();

    [
        "builderTitle",
        "builderStatus",
        "task1PromptText",
        "task1Instructions",
        "task1WordLimit",
        "task1TimeLimit",
        "task2PromptText",
        "task2QuestionType",
        "task2WordLimit",
        "task2TimeLimit",
        "fullTask1Select",
        "fullTask2Select",
        "fullTimeLimit"
    ].forEach((id) => {
        const node = el(id);
        if (node) node.addEventListener("input", updateLivePreview);
        if (node) node.addEventListener("change", updateLivePreview);
    });
}

async function loadAllData() {
    el("writingListSummary").textContent = "Loading writing tests...";
    try {
        const [prompts, fullTests] = await Promise.all([
            requestJson("/api/admin/writing/prompts"),
            requestJson("/api/admin/writing/full-tests")
        ]);
        state.prompts = listItems(prompts);
        state.fullTests = listItems(fullTests);
        populateFullSelects();
        renderDashboard();
    } catch (error) {
        console.error("Error loading writing admin data:", error);
        state.prompts = [];
        state.fullTests = [];
        renderDashboard();
        el("writingListSummary").textContent = "Could not load Writing tests. Please log in as admin.";
        showToast("Could not load Writing tests. Please log in as admin.");
    }
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    let body = null;
    try {
        body = await response.json();
    } catch (error) {
        body = null;
    }
    if (!response.ok) {
        throw new Error(body?.error || body?.message || `Request failed: ${response.status}`);
    }
    return body;
}

function listItems(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.tests)) return data.tests;
    return [];
}

async function fetchWritingItemDetail(item) {
    if (!item) return null;
    const endpoint = item.type === "full"
        ? `/api/admin/writing/full-tests/${encodeURIComponent(item.id)}`
        : `/api/admin/writing/prompts/${encodeURIComponent(item.id)}`;
    const detail = await requestJson(endpoint);
    if (item.type === "full") {
        const index = state.fullTests.findIndex((test) => test._id === item.id);
        if (index >= 0) state.fullTests[index] = detail;
        return normalizeFullTestItem(detail);
    }
    const index = state.prompts.findIndex((prompt) => prompt._id === item.id);
    if (index >= 0) state.prompts[index] = detail;
    return normalizePromptItem(detail);
}

function renderDashboard() {
    const allItems = getSortedItems().map((item, index) => ({
        ...item,
        displayNumber: index + 1
    }));
    const visibleItems = allItems.filter(matchesActiveFilter).filter(matchesSearch);

    renderStats(allItems);
    renderCards(visibleItems);

    const summary = visibleItems.length === 1 ? "1 writing test shown" : `${visibleItems.length} writing tests shown`;
    el("writingListSummary").textContent = `${summary} from ${allItems.length} total`;
    el("writingEmptyState").classList.toggle("is-hidden", visibleItems.length > 0);
}

function renderStats(items) {
    const task1 = items.filter((item) => item.type === "task1").length;
    const task2 = items.filter((item) => item.type === "task2").length;
    const full = items.filter((item) => item.type === "full").length;
    const published = items.filter((item) => item.status === "published").length;
    const draft = items.filter((item) => item.status !== "published").length;

    el("statTotal").textContent = String(items.length);
    el("statTask1").textContent = String(task1);
    el("statTask2").textContent = String(task2);
    el("statFull").textContent = String(full);
    el("statPublished").textContent = String(published);
    el("statDraft").textContent = String(draft);
}

function renderCards(items) {
    const grid = el("writingTestsGrid");
    grid.innerHTML = items.map(renderTestCard).join("");
}

function renderTestCard(item) {
    const status = item.status === "published" ? "published" : "draft";
    const nextStatus = status === "published" ? "Unpublish" : "Publish";
    const wordLimit = getWordLimitLabel(item);
    const updatedDate = item.updatedAt ? formatDate(item.updatedAt) : "Not updated";

    return `
        <article class="admin-writing-test-card">
            <div class="admin-writing-card-top">
                <span class="admin-writing-card-icon">${getTypeIcon(item.type)}</span>
                <div class="admin-writing-badges">
                    <span class="admin-writing-badge type">${escapeHtml(TYPE_LABELS[item.type])}</span>
                    <span class="admin-writing-badge ${status}">${escapeHtml(status)}</span>
                </div>
            </div>
            <h3>Test ${item.displayNumber}</h3>
            <p class="admin-writing-card-subtitle">${escapeHtml(getCardSubtitle(item))}</p>
            <div class="admin-writing-card-stats">
                <div class="admin-writing-card-stat">
                    <span>Time</span>
                    <strong>${escapeHtml(getTimeLabel(item))}</strong>
                </div>
                <div class="admin-writing-card-stat">
                    <span>Word limit</span>
                    <strong>${escapeHtml(wordLimit)}</strong>
                </div>
                <div class="admin-writing-card-stat">
                    <span>Created</span>
                    <strong>${escapeHtml(formatDate(item.createdAt))}</strong>
                </div>
                <div class="admin-writing-card-stat">
                    <span>Updated</span>
                    <strong>${escapeHtml(updatedDate)}</strong>
                </div>
            </div>
            <div class="admin-writing-card-actions">
                <button class="admin-writing-card-action" type="button" data-action="preview" data-id="${escapeHtml(item.id)}" data-type="${item.type}">Preview</button>
                <button class="admin-writing-card-action" type="button" data-action="edit" data-id="${escapeHtml(item.id)}" data-type="${item.type}">Edit</button>
                <button class="admin-writing-card-action" type="button" data-action="duplicate" data-id="${escapeHtml(item.id)}" data-type="${item.type}">Duplicate</button>
                <button class="admin-writing-card-action" type="button" data-action="publish" data-id="${escapeHtml(item.id)}" data-type="${item.type}">${nextStatus}</button>
                <button class="admin-writing-card-action danger" type="button" data-action="delete" data-id="${escapeHtml(item.id)}" data-type="${item.type}">Delete</button>
            </div>
        </article>
    `;
}

function getSortedItems() {
    const items = [
        ...state.prompts.map((prompt) => normalizePromptItem(prompt)),
        ...state.fullTests.map((test) => normalizeFullTestItem(test))
    ];

    return items.sort((a, b) => {
        if (state.sort === "oldest") return dateValue(a.createdAt) - dateValue(b.createdAt);
        if (state.sort === "published") return statusRank(a.status) - statusRank(b.status) || dateValue(b.createdAt) - dateValue(a.createdAt);
        if (state.sort === "draft") return statusRank(b.status) - statusRank(a.status) || dateValue(b.createdAt) - dateValue(a.createdAt);
        if (state.sort === "type") return typeRank(a.type) - typeRank(b.type) || dateValue(b.createdAt) - dateValue(a.createdAt);
        return dateValue(b.createdAt) - dateValue(a.createdAt);
    });
}

function normalizePromptItem(prompt) {
    const type = prompt.taskType === "task2" ? "task2" : "task1";
    return {
        id: prompt._id,
        type,
        status: prompt.status || "draft",
        title: prompt.title || "",
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
        source: prompt
    };
}

function normalizeFullTestItem(test) {
    return {
        id: test._id,
        type: "full",
        status: test.status || "draft",
        title: test.title || "",
        createdAt: test.createdAt,
        updatedAt: test.updatedAt,
        source: test
    };
}

function matchesActiveFilter(item) {
    if (state.activeFilter === "all") return true;
    if (state.activeFilter === "draft") return item.status !== "published";
    if (state.activeFilter === "published") return item.status === "published";
    return item.type === state.activeFilter;
}

function matchesSearch(item) {
    if (!state.search) return true;
    const haystack = [
        `test ${item.displayNumber}`,
        item.title,
        TYPE_LABELS[item.type],
        item.status
    ].join(" ").toLowerCase();
    return haystack.includes(state.search);
}

async function handleCardAction(event) {
    try {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        let item = findItem(button.dataset.id, button.dataset.type);
        if (!item) return;

        if (["preview", "edit", "duplicate"].includes(button.dataset.action)) {
            item = await fetchWritingItemDetail(item);
        }

        if (button.dataset.action === "preview") openPreview(item);
        if (button.dataset.action === "edit") openBuilder(item.type, item);
        if (button.dataset.action === "duplicate") duplicateItem(item);
        if (button.dataset.action === "publish") togglePublish(item);
        if (button.dataset.action === "delete") openDeleteConfirm(item);
    } catch (error) {
        showToast(error.message || "Could not load Writing test details.");
    }
}

function findItem(id, type) {
    if (type === "full") {
        const test = state.fullTests.find((item) => item._id === id);
        return test ? normalizeFullTestItem(test) : null;
    }

    const prompt = state.prompts.find((item) => item._id === id);
    return prompt ? normalizePromptItem(prompt) : null;
}

function openBuilder(type = "task1", item = null) {
    state.editing = item;
    el("writingBuilderForm").reset();
    el("builderId").value = item?.id || "";
    el("builderType").value = item?.type || type;
    el("builderType").disabled = Boolean(item);
    el("builderStatus").value = item?.status || "draft";
    el("builderTitle").value = item?.source?.title || "";
    el("builderModalTitle").textContent = item ? "Edit Writing Test" : "Create Writing Test";

    clearImagePreview();
    populateFullSelects();
    fillBuilderFromItem(item);
    updateBuilderMode();
    updateLivePreview();
    showModal("builderModal");
}

function fillBuilderFromItem(item) {
    if (!item) {
        el("task1WordLimit").value = DEFAULTS.task1.wordLimit;
        el("task1TimeLimit").value = DEFAULTS.task1.timeLimit;
        el("task2WordLimit").value = DEFAULTS.task2.wordLimit;
        el("task2TimeLimit").value = DEFAULTS.task2.timeLimit;
        el("fullTimeLimit").value = DEFAULTS.full.timeLimit;
        return;
    }

    if (item.type === "task1") {
        const prompt = item.source;
        el("task1PromptText").value = prompt.promptText || "";
        el("task1Instructions").value = prompt.instructions || "";
        el("task1WordLimit").value = prompt.wordLimit || DEFAULTS.task1.wordLimit;
        el("task1TimeLimit").value = prompt.timeLimit || DEFAULTS.task1.timeLimit;
        setImagePreview(prompt.imageUrl || "");
    }

    if (item.type === "task2") {
        const prompt = item.source;
        el("task2PromptText").value = prompt.promptText || "";
        el("task2QuestionType").value = prompt.questionType || "opinion";
        el("task2WordLimit").value = prompt.wordLimit || DEFAULTS.task2.wordLimit;
        el("task2TimeLimit").value = prompt.timeLimit || DEFAULTS.task2.timeLimit;
    }

    if (item.type === "full") {
        const test = item.source;
        el("fullTask1Select").value = getRefId(test.task1PromptId);
        el("fullTask2Select").value = getRefId(test.task2PromptId);
        el("fullTimeLimit").value = test.timeLimit || DEFAULTS.full.timeLimit;
    }
}

function closeBuilder() {
    state.editing = null;
    el("builderType").disabled = false;
    hideModal("builderModal");
}

function updateBuilderMode() {
    const type = el("builderType").value;
    el("task1Fields").classList.toggle("is-hidden", type !== "task1");
    el("task2Fields").classList.toggle("is-hidden", type !== "task2");
    el("fullFields").classList.toggle("is-hidden", type !== "full");
}

async function saveBuilder(event) {
    event.preventDefault();
    const type = el("builderType").value;
    const id = el("builderId").value;

    try {
        let savedTest = null;
        if (type === "task1" || type === "task2") {
            savedTest = await savePrompt(type, id);
        } else {
            savedTest = await saveFullTest(id);
        }

        closeBuilder();
        await loadAllData();
        showToast("Writing test saved.");
        if (type === "full") {
            notifyMockBuilder(savedTest);
        } else {
            notifyMockBuilder(savedTest, {
                attachable: false,
                message: "Writing prompt saved. Create or save a Full Writing Test to attach it to this Mock Test."
            });
        }
    } catch (error) {
        console.error("Failed to save Writing test:", error);
        showToast(error.message || "Failed to save Writing test.");
    }
}

async function savePrompt(type, id) {
    const isTask1 = type === "task1";
    const body = {
        taskType: type,
        title: el("builderTitle").value.trim(),
        promptText: isTask1 ? el("task1PromptText").value.trim() : el("task2PromptText").value.trim(),
        instructions: isTask1 ? el("task1Instructions").value.trim() : "",
        questionType: isTask1 ? "" : el("task2QuestionType").value,
        imageUrl: isTask1 ? el("promptImageUrl").value.trim() : "",
        wordLimit: Number(isTask1 ? el("task1WordLimit").value : el("task2WordLimit").value),
        timeLimit: Number(isTask1 ? el("task1TimeLimit").value : el("task2TimeLimit").value),
        status: el("builderStatus").value
    };

    if (!body.title || !body.promptText) {
        throw new Error("Title and prompt are required.");
    }

    return requestJson(id ? `/api/admin/writing/prompts/${id}` : "/api/admin/writing/prompts", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

async function saveFullTest(id) {
    const body = {
        title: el("builderTitle").value.trim(),
        task1PromptId: el("fullTask1Select").value,
        task2PromptId: el("fullTask2Select").value,
        timeLimit: Number(el("fullTimeLimit").value),
        status: el("builderStatus").value
    };

    if (!body.title || !body.task1PromptId || !body.task2PromptId) {
        throw new Error("Full Writing Test requires a title, Task 1, and Task 2.");
    }

    return requestJson(id ? `/api/admin/writing/full-tests/${id}` : "/api/admin/writing/full-tests", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

async function duplicateItem(item) {
    try {
        if (item.type === "full") {
            const source = item.source;
            await requestJson("/api/admin/writing/full-tests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: `${source.title || "Full Writing Test"} Copy`,
                    task1PromptId: getRefId(source.task1PromptId),
                    task2PromptId: getRefId(source.task2PromptId),
                    timeLimit: source.timeLimit || DEFAULTS.full.timeLimit,
                    status: "draft"
                })
            });
        } else {
            const source = item.source;
            await requestJson("/api/admin/writing/prompts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    taskType: source.taskType,
                    title: `${source.title || "Writing Prompt"} Copy`,
                    promptText: source.promptText || "",
                    instructions: source.instructions || "",
                    questionType: source.questionType || "",
                    imageUrl: source.imageUrl || "",
                    wordLimit: source.wordLimit || (source.taskType === "task2" ? DEFAULTS.task2.wordLimit : DEFAULTS.task1.wordLimit),
                    timeLimit: source.timeLimit || (source.taskType === "task2" ? DEFAULTS.task2.timeLimit : DEFAULTS.task1.timeLimit),
                    status: "draft"
                })
            });
        }
        await loadAllData();
        showToast("Writing test duplicated as draft.");
    } catch (error) {
        console.error("Duplicate failed:", error);
        showToast(error.message || "Could not duplicate Writing test.");
    }
}

async function togglePublish(item) {
    const nextStatus = item.status === "published" ? "draft" : "published";
    try {
        if (item.type === "full") {
            await requestJson(`/api/admin/writing/full-tests/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus })
            });
        } else {
            await requestJson(`/api/admin/writing/prompts/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus })
            });
        }
        await loadAllData();
        showToast(nextStatus === "published" ? "Writing test published." : "Writing test moved to draft.");
    } catch (error) {
        console.error("Publish update failed:", error);
        showToast(error.message || "Could not update publish status.");
    }
}

function openDeleteConfirm(item) {
    state.pendingDelete = item;
    showModal("deleteModal");
}

function closeDeleteConfirm() {
    state.pendingDelete = null;
    hideModal("deleteModal");
}

async function confirmDelete() {
    const item = state.pendingDelete;
    if (!item) return;

    try {
        await requestJson(item.type === "full" ? `/api/admin/writing/full-tests/${item.id}` : `/api/admin/writing/prompts/${item.id}`, {
            method: "DELETE"
        });
        closeDeleteConfirm();
        await loadAllData();
        showToast("Writing test deleted.");
    } catch (error) {
        console.error("Delete failed:", error);
        showToast(error.message || "Could not delete Writing test.");
    }
}

function openPreview(item) {
    el("previewModalTitle").textContent = `Test Preview`;
    el("previewModalContent").innerHTML = renderPreviewMarkup(item);
    showModal("previewModal");
}

function closePreview() {
    hideModal("previewModal");
}

function updateLivePreview() {
    const item = buildPreviewItemFromForm();
    el("livePreviewPanel").innerHTML = renderPreviewMarkup(item);
}

function buildPreviewItemFromForm() {
    const type = el("builderType").value;
    const status = el("builderStatus").value;
    const title = el("builderTitle").value.trim();

    if (type === "task1") {
        return normalizePromptItem({
            _id: "preview-task1",
            taskType: "task1",
            status,
            title,
            promptText: el("task1PromptText").value.trim(),
            instructions: el("task1Instructions").value.trim(),
            imageUrl: el("promptImageUrl").value.trim(),
            wordLimit: Number(el("task1WordLimit").value) || DEFAULTS.task1.wordLimit,
            timeLimit: Number(el("task1TimeLimit").value) || DEFAULTS.task1.timeLimit
        });
    }

    if (type === "task2") {
        return normalizePromptItem({
            _id: "preview-task2",
            taskType: "task2",
            status,
            title,
            promptText: el("task2PromptText").value.trim(),
            questionType: el("task2QuestionType").value,
            wordLimit: Number(el("task2WordLimit").value) || DEFAULTS.task2.wordLimit,
            timeLimit: Number(el("task2TimeLimit").value) || DEFAULTS.task2.timeLimit
        });
    }

    return normalizeFullTestItem({
        _id: "preview-full",
        status,
        title,
        task1PromptId: findPromptById(el("fullTask1Select").value),
        task2PromptId: findPromptById(el("fullTask2Select").value),
        timeLimit: Number(el("fullTimeLimit").value) || DEFAULTS.full.timeLimit
    });
}

function renderPreviewMarkup(item) {
    if (item.type === "full") {
        const task1 = getPromptObject(item.source.task1PromptId);
        const task2 = getPromptObject(item.source.task2PromptId);
        const fullTimeLimit = item.source.timeLimit || DEFAULTS.full.timeLimit;
        return `
            <div class="admin-writing-preview-stack">
                <section class="admin-writing-preview-card">
                    <h3>Full Writing Test</h3>
                    <div class="admin-writing-preview-meta">
                        <span>${fullTimeLimit} minutes</span>
                        <span>Task 1 + Task 2</span>
                        <span>${escapeHtml(item.status || "draft")}</span>
                    </div>
                </section>
                ${task1 ? renderPromptPreview(task1, "Task 1") : "<p>Select a Task 1 prompt to preview it here.</p>"}
                ${task2 ? renderPromptPreview(task2, "Task 2") : "<p>Select a Task 2 prompt to preview it here.</p>"}
            </div>
        `;
    }

    return renderPromptPreview(item.source, TYPE_LABELS[item.type]);
}

function renderPromptPreview(prompt, label) {
    const type = prompt.taskType === "task2" ? "task2" : "task1";
    const wordLimit = prompt.wordLimit || (type === "task2" ? DEFAULTS.task2.wordLimit : DEFAULTS.task1.wordLimit);
    const timeLimit = prompt.timeLimit || (type === "task2" ? DEFAULTS.task2.timeLimit : DEFAULTS.task1.timeLimit);
    const questionType = prompt.questionType ? `<span>${escapeHtml(QUESTION_TYPE_LABELS[prompt.questionType] || prompt.questionType)}</span>` : "";
    const instructions = prompt.instructions ? `<p>${escapeHtml(prompt.instructions)}</p>` : "";
    const image = type === "task1" && prompt.imageUrl
        ? `<img loading="lazy" decoding="async" src="${escapeHtml(prompt.imageUrl)}" alt="Task 1 visual preview">`
        : "";

    return `
        <section class="admin-writing-preview-card">
            <h3>${escapeHtml(label)}</h3>
            <div class="admin-writing-preview-meta">
                <span>${timeLimit} minutes</span>
                <span>At least ${wordLimit} words</span>
                ${questionType}
            </div>
            ${instructions}
            ${image}
            <p>${escapeHtml(prompt.promptText || "The Writing prompt will appear here.")}</p>
        </section>
    `;
}

function populateFullSelects() {
    const task1Select = el("fullTask1Select");
    const task2Select = el("fullTask2Select");
    if (!task1Select || !task2Select) return;

    const task1Prompts = state.prompts.filter((prompt) => prompt.taskType === "task1");
    const task2Prompts = state.prompts.filter((prompt) => prompt.taskType === "task2");

    task1Select.innerHTML = `<option value="">Select Task 1 prompt</option>${task1Prompts.map((prompt, index) => {
        return `<option value="${escapeHtml(prompt._id)}">Task 1 - Test ${index + 1}</option>`;
    }).join("")}`;

    task2Select.innerHTML = `<option value="">Select Task 2 prompt</option>${task2Prompts.map((prompt, index) => {
        return `<option value="${escapeHtml(prompt._id)}">Task 2 - Test ${index + 1}</option>`;
    }).join("")}`;
}

function setupDropZone() {
    const zone = el("imageDropZone");
    zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => {
        zone.classList.remove("drag-over");
    });
    zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("drag-over");
        const file = event.dataTransfer?.files?.[0];
        if (file) uploadPromptImage(file);
    });
}

async function uploadPromptImage(file) {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    const allowedExtension = /\.(png|jpe?g|webp)$/i.test(file.name || "");
    if (!allowed.includes(file.type) && !allowedExtension) {
        showToast("Please upload PNG, JPG, JPEG, or WEBP.");
        return;
    }

    const formData = new FormData();
    formData.append("image", file);

    try {
        const data = await requestJson("/api/admin/writing/upload-image", {
            method: "POST",
            body: formData
        });
        setImagePreview(data.imageUrl || "");
        updateLivePreview();
        showToast("Image uploaded.");
    } catch (error) {
        console.error("Image upload failed:", error);
        showToast("Image upload failed.");
    }
}

function setImagePreview(imageUrl) {
    el("promptImageUrl").value = imageUrl || "";
    if (!imageUrl) {
        clearImagePreview();
        return;
    }
    el("imagePreview").src = imageUrl;
    el("imagePreviewBox").classList.remove("is-hidden");
}

function clearImagePreview() {
    el("promptImageUrl").value = "";
    el("imagePreview").removeAttribute("src");
    el("imagePreviewBox").classList.add("is-hidden");
}

function getTypeIcon(type) {
    if (type === "task2") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>`;
    }
    if (type === "full") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h5"></path></svg>`;
}

function getCardSubtitle(item) {
    if (item.type === "full") return "Academic Writing Mock Test";
    return item.type === "task2" ? "Essay question" : "Report writing prompt";
}

function getTimeLabel(item) {
    if (item.type === "full") return `${item.source.timeLimit || DEFAULTS.full.timeLimit} min`;
    const fallback = item.type === "task2" ? DEFAULTS.task2.timeLimit : DEFAULTS.task1.timeLimit;
    return `${item.source.timeLimit || fallback} min`;
}

function getWordLimitLabel(item) {
    if (item.type === "full") return "150 + 250 words";
    const fallback = item.type === "task2" ? DEFAULTS.task2.wordLimit : DEFAULTS.task1.wordLimit;
    return `At least ${item.source.wordLimit || fallback} words`;
}

function getPromptObject(ref) {
    if (!ref) return null;
    if (typeof ref === "object" && ref._id) return ref;
    return findPromptById(String(ref));
}

function getRefId(ref) {
    if (!ref) return "";
    if (typeof ref === "object") return ref._id || "";
    return String(ref);
}

function findPromptById(id) {
    return state.prompts.find((prompt) => prompt._id === id) || null;
}

function statusRank(status) {
    return status === "published" ? 0 : 1;
}

function typeRank(type) {
    if (type === "task1") return 1;
    if (type === "task2") return 2;
    return 3;
}

function dateValue(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

function formatDate(value) {
    if (!value) return "Not saved";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not saved";
    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function showModal(id) {
    const modal = el(id);
    modal.classList.remove("is-hidden");
    modal.setAttribute("aria-hidden", "false");
}

function hideModal(id) {
    const modal = el(id);
    modal.classList.add("is-hidden");
    modal.setAttribute("aria-hidden", "true");
}

function showToast(message) {
    const toast = el("writingToast");
    toast.textContent = message;
    toast.classList.remove("is-hidden");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
        toast.classList.add("is-hidden");
    }, 2800);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
