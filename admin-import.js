const combineForm = document.getElementById("combineForm");
const fullTestTitle = document.getElementById("fullTestTitle");
const importStatus = document.getElementById("importStatus");
const resultPanel = document.getElementById("resultPanel");
const resultMeta = document.getElementById("resultMeta");
const openPlayerLink = document.getElementById("openPlayerLink");
const partsHeading = document.getElementById("partsHeading");
const readingParts = document.getElementById("readingParts");
const listeningParts = document.getElementById("listeningParts");
const combineBtn = document.getElementById("combineBtn");
const guideResult = document.getElementById("guideResult");
let activeSkill = "reading";
let availableTests = { reading: null, listening: null };

function authHeaders() {
    const token = localStorage.getItem("ieltsmockToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function setStatus(message, type = "") {
    importStatus.textContent = message;
    importStatus.className = `import-status ${type}`.trim();
}

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
    const endpoint = skill === "listening" ? "/api/listening-tests" : "/api/reading-tests";
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
        openPlayerLink.href = `full-test-player.html?id=${encodeURIComponent(data.test.id)}&skill=${encodeURIComponent(activeSkill)}`;
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

setSkill("reading").catch((error) => {
    setStatus(error.message, "error");
});
