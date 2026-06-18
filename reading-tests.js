const readingTestsList = document.getElementById("readingTestsList");
const readingTestCount = document.getElementById("readingTestCount");
const readingQuestionCount = document.getElementById("readingQuestionCount");

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function partLabel(part) {
    return part === "full" ? "Full Test" : `Part ${part}`;
}

function slugify(value) {
    return String(value || "test")
        .trim()
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-") || "test";
}

async function loadReadingTests() {
    const response = await fetch("/api/reading-tests");
    const tests = await response.json();

    if (!tests.length) {
        readingTestsList.innerHTML = '<div class="test-list-empty">No Reading tests have been created yet.</div>';
        return;
    }

    if (readingTestCount) {
        readingTestCount.textContent = String(tests.length);
    }

    if (readingQuestionCount) {
        readingQuestionCount.textContent = String(tests.reduce((total, test) => total + (Number(test.questionCount) || 0), 0));
    }

    readingTestsList.innerHTML = tests.map((test) => `
        <a class="reading-test-list-card" href="${escapeHtml(test.openUrl || `/reading/${slugify(test.slug || test.title)}`)}">
            <div class="test-card-top">
                <span class="test-card-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path>
                    </svg>
                </span>
                <span class="test-card-badge">${escapeHtml(partLabel(test.part))}</span>
            </div>
            <div class="test-card-content">
                <h2>${escapeHtml(test.title)}</h2>
                <p>${escapeHtml(test.subtitle || (test.part === "full" ? "Reading full test" : "Academic Reading practice"))}</p>
            </div>
            <div class="test-card-stats">
                <span><strong>${escapeHtml(test.questionCount || 0)}</strong> Questions</span>
                <span><strong>${test.part === "full" ? "40 min" : "20 min"}</strong> Timer</span>
            </div>
            <div class="test-card-button">Start Test <span>-></span></div>
        </a>
    `).join("");
}

loadReadingTests().catch((error) => {
    readingTestsList.textContent = error.message;
});
