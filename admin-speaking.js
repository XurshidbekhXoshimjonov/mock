const SECTION_LABELS = {
    part1: "Admin Speaking Part 1",
    part2: "Admin Speaking Part 2",
    part3: "Admin Speaking Part 3",
    full: "Admin Full Speaking Test"
};

const SECTION_BADGES = {
    part1: "Speaking Part 1",
    part2: "Speaking Part 2",
    part3: "Speaking Part 3",
    full: "Full Speaking Test"
};

const DEFAULTS = {
    part1: { prepTime: "No prep", speakingTime: "5 min" },
    part2: { prepTime: "1 min", speakingTime: "2 min" },
    part3: { prepTime: "No prep", speakingTime: "5 min" },
    full: { estimatedTime: "11-14 min", aiFeedback: true }
};

const state = {
    part1: [],
    part2: [],
    part3: [],
    full: [],
    activeSection: "part1",
    sort: "newest",
    search: "",
    editing: null,
    pendingDelete: null,
    builderItems: {
        questions: [],
        bulletPoints: []
    },
    dragging: null,
    toastTimer: null
};

const mockBuilderParams = new URLSearchParams(window.location.search);
const isMockBuilderEmbed = mockBuilderParams.get("mockBuilder") === "1";

function notifyMockBuilder(test, options = {}) {
    if (!isMockBuilderEmbed || window.parent === window || !test) return;
    window.parent.postMessage({
        type: "ieltsx-admin-test-saved",
        section: "speaking",
        testId: test._id || test.id,
        test,
        attachable: options.attachable !== false,
        message: options.message || ""
    }, window.location.origin);
}

function openInitialMockBuilderForm() {
    if (!isMockBuilderEmbed) return;
    const section = mockBuilderParams.get("section") || sectionFromPath() || "full";
    openBuilder(SECTION_LABELS[section] ? section : "full");
}

document.addEventListener("DOMContentLoaded", () => {
    if (isMockBuilderEmbed) {
        document.body.classList.add("mock-builder-embed");
    }
    state.activeSection = sectionFromPath() || "part1";
    bindEvents();
    syncTabs();
    updateBuilderMode();
    loadAllData().then(openInitialMockBuilderForm).catch(() => {});
});

function el(id) {
    return document.getElementById(id);
}

function sectionFromPath() {
    const tail = window.location.pathname.split("/").filter(Boolean).pop();
    return SECTION_LABELS[tail] ? tail : "";
}

function bindEvents() {
    el("createSpeakingTestBtn").addEventListener("click", () => openBuilder(state.activeSection));
    el("emptyCreateSpeakingBtn").addEventListener("click", () => openBuilder(state.activeSection));
    el("refreshSpeakingBtn").addEventListener("click", loadAllData);
    el("closeBuilderBtn").addEventListener("click", closeBuilder);
    el("cancelBuilderBtn").addEventListener("click", closeBuilder);
    el("closePreviewBtn").addEventListener("click", closePreview);
    el("cancelDeleteBtn").addEventListener("click", closeDeleteConfirm);
    el("confirmDeleteBtn").addEventListener("click", confirmDelete);
    el("speakingBuilderForm").addEventListener("submit", saveBuilder);
    el("builderSection").addEventListener("change", () => {
        updateBuilderMode();
        updateLivePreview();
    });
    el("speakingSearchInput").addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        renderDashboard();
    });
    el("speakingSortSelect").addEventListener("change", (event) => {
        state.sort = event.target.value;
        renderDashboard();
    });
    el("speakingTabs").addEventListener("click", (event) => {
        const button = event.target.closest("[data-section]");
        if (!button) return;
        state.activeSection = button.dataset.section;
        syncTabs();
        renderDashboard();
        history.replaceState(null, "", `/admin-speaking/${state.activeSection}`);
    });
    el("speakingTestsBody").addEventListener("click", handleTableAction);
    document.querySelectorAll("[data-add-item]").forEach((button) => {
        button.addEventListener("click", () => addBuilderItem(button.dataset.addItem));
    });
    ["questionsList", "part3QuestionsList", "bulletPointsList"].forEach((id) => {
        const list = el(id);
        list.addEventListener("input", handleListInput);
        list.addEventListener("click", handleListClick);
        list.addEventListener("dragstart", handleDragStart);
        list.addEventListener("dragover", handleDragOver);
        list.addEventListener("drop", handleDrop);
        list.addEventListener("dragend", handleDragEnd);
    });
    [
        "builderTitle",
        "builderStatus",
        "part1Description",
        "part1PrepTime",
        "part1SpeakingTime",
        "part2Instruction",
        "part2PrepTime",
        "part2SpeakingTime",
        "part3Description",
        "part3PrepTime",
        "part3SpeakingTime",
        "fullPart1Select",
        "fullPart2Select",
        "fullPart3Select",
        "fullEstimatedTime",
        "fullAiFeedback"
    ].forEach((id) => {
        const node = el(id);
        if (!node) return;
        node.addEventListener("input", updateLivePreview);
        node.addEventListener("change", updateLivePreview);
    });
}

async function loadAllData() {
    el("speakingListSummary").textContent = "Loading Speaking tests...";
    try {
        const [part1, part2, part3, full] = await Promise.all([
            requestJson("/api/admin/speaking/part1"),
            requestJson("/api/admin/speaking/part2"),
            requestJson("/api/admin/speaking/part3"),
            requestJson("/api/admin/speaking/full")
        ]);
        state.part1 = Array.isArray(part1) ? part1 : [];
        state.part2 = Array.isArray(part2) ? part2 : [];
        state.part3 = Array.isArray(part3) ? part3 : [];
        state.full = Array.isArray(full) ? full : [];
        populateFullSelects();
        renderDashboard();
        updateLivePreview();
    } catch (error) {
        console.error("Error loading Speaking admin data:", error);
        renderDashboard();
        el("speakingListSummary").textContent = "Could not load Speaking tests. Please log in as admin.";
        showToast(error.message || "Could not load Speaking tests.");
    }
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    if (!response.ok) {
        throw new Error(body?.error || body?.message || `Request failed: ${response.status}`);
    }
    return body;
}

function syncTabs() {
    document.querySelectorAll(".admin-speaking-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.section === state.activeSection);
    });
    el("sectionTitle").textContent = SECTION_LABELS[state.activeSection] || SECTION_LABELS.part1;
}

function renderDashboard() {
    renderStats();
    const allItems = getSortedItems(state.activeSection).map((item, index) => ({
        ...item,
        displayNumber: index + 1
    }));
    const visibleItems = allItems.filter(matchesSearch);
    renderTable(visibleItems);
    el("speakingListSummary").textContent = `${visibleItems.length} shown from ${allItems.length} ${SECTION_BADGES[state.activeSection]} tests`;
    el("speakingEmptyState").classList.toggle("is-hidden", visibleItems.length > 0);
}

function renderStats() {
    const allItems = [...state.part1, ...state.part2, ...state.part3, ...state.full];
    el("statPart1").textContent = String(state.part1.length);
    el("statPart2").textContent = String(state.part2.length);
    el("statPart3").textContent = String(state.part3.length);
    el("statFull").textContent = String(state.full.length);
    el("statPublished").textContent = String(allItems.filter((item) => item.status === "published").length);
    el("statDraft").textContent = String(allItems.filter((item) => item.status !== "published").length);
}

function getSortedItems(section) {
    return [...(state[section] || [])].sort((a, b) => {
        if (state.sort === "oldest") return dateValue(a.createdAt) - dateValue(b.createdAt);
        if (state.sort === "published") return statusRank(a.status) - statusRank(b.status) || dateValue(b.createdAt) - dateValue(a.createdAt);
        if (state.sort === "draft") return statusRank(b.status) - statusRank(a.status) || dateValue(b.createdAt) - dateValue(a.createdAt);
        if (state.sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
        return dateValue(b.createdAt) - dateValue(a.createdAt);
    });
}

function matchesSearch(item) {
    if (!state.search) return true;
    const haystack = [
        item._id,
        item.title,
        item.description,
        item.instruction,
        item.status,
        SECTION_BADGES[state.activeSection]
    ].join(" ").toLowerCase();
    return haystack.includes(state.search);
}

function renderTable(items) {
    el("speakingTestsBody").innerHTML = items.map((item) => renderTableRow(item)).join("");
}

function renderTableRow(item) {
    const status = item.status === "published" ? "published" : "draft";
    const nextStatus = status === "published" ? "Unpublish" : "Publish";
    return `
        <tr>
            <td><span class="admin-speaking-id">${escapeHtml(shortId(item._id))}</span></td>
            <td><strong>Test ${item.displayNumber}</strong></td>
            <td>
                <div class="admin-speaking-table-title">
                    <strong>${escapeHtml(item.title || "Untitled Speaking test")}</strong>
                    <span>${escapeHtml(getItemSubtitle(item, state.activeSection))}</span>
                </div>
            </td>
            <td>${escapeHtml(getItemCount(item, state.activeSection))}</td>
            <td>${escapeHtml(getTimeLabel(item, state.activeSection))}</td>
            <td><span class="admin-speaking-badge ${status}">${escapeHtml(status)}</span></td>
            <td>${escapeHtml(formatDate(item.createdAt))}</td>
            <td>
                <div class="admin-speaking-actions">
                    <button class="admin-speaking-table-action" type="button" data-action="preview" data-id="${escapeHtml(item._id)}">Preview</button>
                    <button class="admin-speaking-table-action" type="button" data-action="edit" data-id="${escapeHtml(item._id)}">Edit</button>
                    <button class="admin-speaking-table-action" type="button" data-action="publish" data-id="${escapeHtml(item._id)}">${nextStatus}</button>
                    <button class="admin-speaking-table-action danger" type="button" data-action="delete" data-id="${escapeHtml(item._id)}">Delete</button>
                </div>
            </td>
        </tr>
    `;
}

function handleTableAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const item = findItem(button.dataset.id, state.activeSection);
    if (!item) return;
    if (button.dataset.action === "preview") openPreview(item, state.activeSection);
    if (button.dataset.action === "edit") openBuilder(state.activeSection, item);
    if (button.dataset.action === "publish") togglePublish(item, state.activeSection);
    if (button.dataset.action === "delete") openDeleteConfirm(item, state.activeSection);
}

function findItem(id, section) {
    return (state[section] || []).find((item) => item._id === id) || null;
}

function openBuilder(section = "part1", item = null) {
    state.editing = item ? { section, id: item._id } : null;
    el("speakingBuilderForm").reset();
    el("builderId").value = item?._id || "";
    el("builderSection").value = section;
    el("builderSection").disabled = Boolean(item);
    el("builderStatus").value = item?.status || "draft";
    el("builderTitle").value = item?.title || "";
    el("builderModalTitle").textContent = item ? "Edit Speaking Test" : "Create Speaking Test";
    fillBuilder(section, item);
    populateFullSelects(item);
    updateBuilderMode();
    updateLivePreview();
    showModal("builderModal");
}

function fillBuilder(section, item) {
    state.builderItems.questions = [];
    state.builderItems.bulletPoints = [];
    el("part1Description").value = "";
    el("part1PrepTime").value = DEFAULTS.part1.prepTime;
    el("part1SpeakingTime").value = DEFAULTS.part1.speakingTime;
    el("part2Instruction").value = "";
    el("part2PrepTime").value = DEFAULTS.part2.prepTime;
    el("part2SpeakingTime").value = DEFAULTS.part2.speakingTime;
    el("part3Description").value = "";
    el("part3PrepTime").value = DEFAULTS.part3.prepTime;
    el("part3SpeakingTime").value = DEFAULTS.part3.speakingTime;
    el("fullEstimatedTime").value = DEFAULTS.full.estimatedTime;
    el("fullAiFeedback").checked = true;

    if (section === "part1") {
        el("part1Description").value = item?.description || "";
        el("part1PrepTime").value = item?.prepTime || DEFAULTS.part1.prepTime;
        el("part1SpeakingTime").value = item?.speakingTime || DEFAULTS.part1.speakingTime;
        state.builderItems.questions = normalizeTextItems(item?.questions);
        if (!state.builderItems.questions.length) state.builderItems.questions = ["", "", "", ""];
    }

    if (section === "part2") {
        el("part2Instruction").value = item?.instruction || "";
        el("part2PrepTime").value = item?.prepTime || DEFAULTS.part2.prepTime;
        el("part2SpeakingTime").value = item?.speakingTime || DEFAULTS.part2.speakingTime;
        state.builderItems.bulletPoints = normalizeTextItems(item?.bulletPoints);
        if (!state.builderItems.bulletPoints.length) state.builderItems.bulletPoints = ["", "", ""];
    }

    if (section === "part3") {
        el("part3Description").value = item?.description || "";
        el("part3PrepTime").value = item?.prepTime || DEFAULTS.part3.prepTime;
        el("part3SpeakingTime").value = item?.speakingTime || DEFAULTS.part3.speakingTime;
        state.builderItems.questions = normalizeTextItems(item?.questions);
        if (!state.builderItems.questions.length) state.builderItems.questions = ["", "", "", ""];
    }

    if (section === "full") {
        el("fullEstimatedTime").value = item?.estimatedTime || DEFAULTS.full.estimatedTime;
        el("fullAiFeedback").checked = item?.aiFeedback !== false;
        el("fullPart1Select").value = getRefId(item?.part1Id);
        el("fullPart2Select").value = getRefId(item?.part2Id);
        el("fullPart3Select").value = getRefId(item?.part3Id);
    }

    renderSortableLists();
}

function closeBuilder() {
    state.editing = null;
    el("builderSection").disabled = false;
    hideModal("builderModal");
}

function updateBuilderMode() {
    const section = el("builderSection").value;
    el("part1Fields").classList.toggle("is-hidden", section !== "part1");
    el("part2Fields").classList.toggle("is-hidden", section !== "part2");
    el("part3Fields").classList.toggle("is-hidden", section !== "part3");
    el("fullFields").classList.toggle("is-hidden", section !== "full");
    renderSortableLists();
}

function addBuilderItem(kind) {
    const section = el("builderSection").value;
    if (kind === "questions" && (section === "part1" || section === "part3")) {
        state.builderItems.questions.push("");
    }
    if (kind === "bulletPoints" && section === "part2") {
        state.builderItems.bulletPoints.push("");
    }
    renderSortableLists();
    updateLivePreview();
}

function renderSortableLists() {
    const section = el("builderSection").value;
    el("questionsList").innerHTML = section === "part1" ? renderSortableItems("questions", "Question") : "";
    el("part3QuestionsList").innerHTML = section === "part3" ? renderSortableItems("questions", "Question") : "";
    el("bulletPointsList").innerHTML = section === "part2" ? renderSortableItems("bulletPoints", "Bullet point") : "";
}

function renderSortableItems(kind, label) {
    const items = state.builderItems[kind] || [];
    return items.map((text, index) => `
        <div class="admin-speaking-sortable-item" draggable="true" data-kind="${kind}" data-index="${index}">
            <span class="admin-speaking-drag-handle" title="Drag to reorder">::</span>
            <input type="text" value="${escapeAttribute(text)}" data-kind="${kind}" data-index="${index}" placeholder="${escapeAttribute(`${label} ${index + 1}`)}">
            <button class="admin-speaking-table-action danger" type="button" data-delete-item="${kind}" data-index="${index}">Delete</button>
        </div>
    `).join("");
}

function handleListInput(event) {
    const input = event.target.closest("input[data-kind]");
    if (!input) return;
    const list = state.builderItems[input.dataset.kind];
    list[Number(input.dataset.index)] = input.value;
    updateLivePreview();
}

function handleListClick(event) {
    const button = event.target.closest("[data-delete-item]");
    if (!button) return;
    const list = state.builderItems[button.dataset.deleteItem];
    list.splice(Number(button.dataset.index), 1);
    renderSortableLists();
    updateLivePreview();
}

function handleDragStart(event) {
    const item = event.target.closest(".admin-speaking-sortable-item");
    if (!item) return;
    state.dragging = {
        kind: item.dataset.kind,
        index: Number(item.dataset.index)
    };
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
}

function handleDragOver(event) {
    if (state.dragging) event.preventDefault();
}

function handleDrop(event) {
    event.preventDefault();
    const target = event.target.closest(".admin-speaking-sortable-item");
    if (!target || !state.dragging || target.dataset.kind !== state.dragging.kind) return;
    const from = state.dragging.index;
    const to = Number(target.dataset.index);
    if (from === to) return;
    const list = state.builderItems[state.dragging.kind];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    renderSortableLists();
    updateLivePreview();
}

function handleDragEnd() {
    state.dragging = null;
    document.querySelectorAll(".admin-speaking-sortable-item.is-dragging").forEach((item) => {
        item.classList.remove("is-dragging");
    });
}

async function saveBuilder(event) {
    event.preventDefault();
    const section = el("builderSection").value;
    const id = el("builderId").value;
    try {
        const body = buildPayload(section);
        await validatePayload(section, body);
        const savedTest = await requestJson(id ? `/api/admin/speaking/${section}/${id}` : `/api/admin/speaking/${section}`, {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        closeBuilder();
        await loadAllData();
        state.activeSection = section;
        syncTabs();
        renderDashboard();
        showToast("Speaking test saved.");
        if (section === "full") {
            notifyMockBuilder(savedTest);
        } else {
            notifyMockBuilder(savedTest, {
                attachable: false,
                message: "Speaking part saved. Create or save a Full Speaking Test to attach it to this Mock Test."
            });
        }
    } catch (error) {
        console.error("Failed to save Speaking test:", error);
        showToast(error.message || "Failed to save Speaking test.");
    }
}

function buildPayload(section) {
    const title = el("builderTitle").value.trim();
    const status = el("builderStatus").value;
    if (section === "part1") {
        return {
            title,
            description: el("part1Description").value.trim(),
            questions: state.builderItems.questions.map((text) => ({ text: String(text || "").trim() })).filter((item) => item.text),
            prepTime: el("part1PrepTime").value.trim() || DEFAULTS.part1.prepTime,
            speakingTime: el("part1SpeakingTime").value.trim() || DEFAULTS.part1.speakingTime,
            status
        };
    }
    if (section === "part2") {
        return {
            title,
            instruction: el("part2Instruction").value.trim(),
            bulletPoints: state.builderItems.bulletPoints.map((text) => ({ text: String(text || "").trim() })).filter((item) => item.text),
            prepTime: el("part2PrepTime").value.trim() || DEFAULTS.part2.prepTime,
            speakingTime: el("part2SpeakingTime").value.trim() || DEFAULTS.part2.speakingTime,
            status
        };
    }
    if (section === "part3") {
        return {
            title,
            description: el("part3Description").value.trim(),
            questions: state.builderItems.questions.map((text) => ({ text: String(text || "").trim() })).filter((item) => item.text),
            prepTime: el("part3PrepTime").value.trim() || DEFAULTS.part3.prepTime,
            speakingTime: el("part3SpeakingTime").value.trim() || DEFAULTS.part3.speakingTime,
            status
        };
    }
    return {
        title,
        part1Id: el("fullPart1Select").value,
        part2Id: el("fullPart2Select").value,
        part3Id: el("fullPart3Select").value,
        estimatedTime: el("fullEstimatedTime").value.trim() || DEFAULTS.full.estimatedTime,
        aiFeedback: el("fullAiFeedback").checked,
        status
    };
}

async function validatePayload(section, body) {
    if (!body.title) throw new Error("Title is required.");
    if (body.status !== "published") return;
    if (section === "part1" && body.questions.length < 4) throw new Error("Part 1 must have at least 4 questions before publishing.");
    if (section === "part2" && (!body.instruction || body.bulletPoints.length < 3)) throw new Error("Part 2 needs an instruction and at least 3 bullet points before publishing.");
    if (section === "part3" && body.questions.length < 4) throw new Error("Part 3 must have at least 4 questions before publishing.");
    if (section === "full" && (!body.part1Id || !body.part2Id || !body.part3Id)) throw new Error("Full Speaking Test must include Part 1, Part 2, and Part 3.");
}

async function togglePublish(item, section) {
    const nextStatus = item.status === "published" ? "draft" : "published";
    try {
        await requestJson(`/api/admin/speaking/${section}/${item._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus })
        });
        await loadAllData();
        showToast(nextStatus === "published" ? "Speaking test published." : "Speaking test moved to draft.");
    } catch (error) {
        console.error("Publish update failed:", error);
        showToast(error.message || "Could not update publish status.");
    }
}

function openDeleteConfirm(item, section) {
    state.pendingDelete = { item, section };
    showModal("deleteModal");
}

function closeDeleteConfirm() {
    state.pendingDelete = null;
    hideModal("deleteModal");
}

async function confirmDelete() {
    const pending = state.pendingDelete;
    if (!pending) return;
    try {
        await requestJson(`/api/admin/speaking/${pending.section}/${pending.item._id}`, {
            method: "DELETE"
        });
        closeDeleteConfirm();
        await loadAllData();
        showToast("Speaking test deleted.");
    } catch (error) {
        console.error("Delete failed:", error);
        showToast(error.message || "Could not delete Speaking test.");
    }
}

function openPreview(item, section) {
    el("previewModalTitle").textContent = `${SECTION_BADGES[section]} Preview`;
    el("previewModalContent").innerHTML = renderPreviewMarkup(item, section);
    showModal("previewModal");
}

function closePreview() {
    hideModal("previewModal");
}

function updateLivePreview() {
    const section = el("builderSection").value;
    if (!section) return;
    let item = null;
    try {
        item = buildPayload(section);
    } catch {
        item = { title: "", status: "draft" };
    }
    el("livePreviewPanel").innerHTML = renderPreviewMarkup(item, section);
}

function renderPreviewMarkup(item, section) {
    if (section === "full") {
        const part1 = getPartRef(item.part1Id, "part1");
        const part2 = getPartRef(item.part2Id, "part2");
        const part3 = getPartRef(item.part3Id, "part3");
        return `
            <div class="admin-speaking-preview-stack">
                <section class="admin-speaking-preview-card">
                    <h3>${escapeHtml(item.title || "Full Speaking Test")}</h3>
                    <div class="admin-speaking-preview-meta">
                        <span>${escapeHtml(item.estimatedTime || DEFAULTS.full.estimatedTime)}</span>
                        <span>${item.aiFeedback === false ? "AI feedback off" : "AI feedback included"}</span>
                        <span>${escapeHtml(item.status || "draft")}</span>
                    </div>
                    <p>The user card will show only Test 1, Test 2, etc. Topics appear inside the player.</p>
                </section>
                ${part1 ? renderPreviewMarkup(part1, "part1") : renderMissingPart("Part 1")}
                ${part2 ? renderPreviewMarkup(part2, "part2") : renderMissingPart("Part 2")}
                ${part3 ? renderPreviewMarkup(part3, "part3") : renderMissingPart("Part 3")}
            </div>
        `;
    }

    if (section === "part2") {
        const bullets = normalizeTextItems(item.bulletPoints);
        return `
            <section class="admin-speaking-preview-card">
                <h3>${escapeHtml(item.title || "Speaking Part 2 Cue Card")}</h3>
                <div class="admin-speaking-preview-meta">
                    <span>${escapeHtml(item.prepTime || DEFAULTS.part2.prepTime)} prep</span>
                    <span>${escapeHtml(item.speakingTime || DEFAULTS.part2.speakingTime)} speaking</span>
                    <span>${escapeHtml(item.status || "draft")}</span>
                </div>
                <p>${escapeHtml(item.instruction || "Cue card instruction will appear here.")}</p>
                <ul>${bullets.length ? bullets.map((text) => `<li>${escapeHtml(text)}</li>`).join("") : "<li>Add bullet points for the candidate task card.</li>"}</ul>
            </section>
        `;
    }

    const questions = normalizeTextItems(item.questions);
    const defaults = section === "part3" ? DEFAULTS.part3 : DEFAULTS.part1;
    return `
        <section class="admin-speaking-preview-card">
            <h3>${escapeHtml(item.title || SECTION_BADGES[section])}</h3>
            <div class="admin-speaking-preview-meta">
                <span>${escapeHtml(item.prepTime || defaults.prepTime)}</span>
                <span>${escapeHtml(item.speakingTime || defaults.speakingTime)}</span>
                <span>${escapeHtml(item.status || "draft")}</span>
            </div>
            <p>${escapeHtml(item.description || "Speaking instruction will appear here.")}</p>
            <ol>${questions.length ? questions.map((text) => `<li>${escapeHtml(text)}</li>`).join("") : "<li>Add questions for this test.</li>"}</ol>
        </section>
    `;
}

function renderMissingPart(label) {
    return `<section class="admin-speaking-preview-card"><h3>${escapeHtml(label)}</h3><p>Select a published ${escapeHtml(label)} test to preview it here.</p></section>`;
}

function populateFullSelects(editingItem = null) {
    fillPartSelect("fullPart1Select", "part1", "Select Part 1", editingItem?.part1Id);
    fillPartSelect("fullPart2Select", "part2", "Select Part 2", editingItem?.part2Id);
    fillPartSelect("fullPart3Select", "part3", "Select Part 3", editingItem?.part3Id);
}

function fillPartSelect(id, section, placeholder, selectedRef) {
    const selectedId = getRefId(selectedRef);
    const published = (state[section] || []).filter((item) => item.status === "published" || item._id === selectedId);
    el(id).innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${published.map((item, index) => {
        return `<option value="${escapeAttribute(item._id)}">Test ${index + 1} - ${escapeHtml(item.title || SECTION_BADGES[section])}</option>`;
    }).join("")}`;
    if (selectedId) el(id).value = selectedId;
}

function getPartRef(ref, section) {
    if (!ref) return null;
    if (typeof ref === "object" && ref._id) return ref;
    return (state[section] || []).find((item) => item._id === ref) || null;
}

function getRefId(ref) {
    if (!ref) return "";
    if (typeof ref === "object") return ref._id || "";
    return String(ref);
}

function getItemSubtitle(item, section) {
    if (section === "full") return "Combined Speaking test";
    if (section === "part2") return item.instruction || "Cue card";
    return item.description || "Question set";
}

function getItemCount(item, section) {
    if (section === "full") return "3 parts";
    if (section === "part2") return `${normalizeTextItems(item.bulletPoints).length} bullets`;
    return `${normalizeTextItems(item.questions).length} questions`;
}

function getTimeLabel(item, section) {
    if (section === "full") return item.estimatedTime || DEFAULTS.full.estimatedTime;
    const fallback = DEFAULTS[section] || DEFAULTS.part1;
    return `${item.prepTime || fallback.prepTime} / ${item.speakingTime || fallback.speakingTime}`;
}

function normalizeTextItems(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => typeof item === "string" ? item : item?.text || "")
        .map((text) => String(text || "").trim())
        .filter(Boolean);
}

function statusRank(status) {
    return status === "published" ? 0 : 1;
}

function dateValue(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

function formatDate(value) {
    if (!value) return "Not saved";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not saved";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function shortId(value) {
    const id = String(value || "");
    return id.length > 8 ? id.slice(-8) : id || "new";
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
    const toast = el("toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 3200);
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
}
