function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

async function loadSkillFullTests(skill, grid) {
    const response = await fetch(`/api/full-tests?status=published&skill=${encodeURIComponent(skill)}`);
    if (!response.ok) {
        grid.innerHTML = `<p>Could not load ${escapeHtml(skill)} tests.</p>`;
        return;
    }

    const tests = await response.json();

    if (!tests.length) {
        grid.innerHTML = `<p class="full-test-empty">No published ${escapeHtml(skill)} full tests yet.</p>`;
        return;
    }

    grid.innerHTML = tests.map((test) => `
        <a class="reading-test-card" href="full-test-player.html?id=${encodeURIComponent(test.id)}&skill=${encodeURIComponent(skill)}">
            <h2>${escapeHtml(test.title)}</h2>
            <p>${test.questionCount} questions · ${skill === "reading" ? `${test.passageCount} passages` : `${test.listeningSectionCount} listening parts`}</p>
        </a>
    `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
    const readingGrid = document.getElementById("readingFullTestsGrid");
    const listeningGrid = document.getElementById("listeningFullTestsGrid");

    loadSkillFullTests("reading", readingGrid).catch((error) => {
        readingGrid.textContent = error.message;
    });
    loadSkillFullTests("listening", listeningGrid).catch((error) => {
        listeningGrid.textContent = error.message;
    });
});
