const listeningTestsList = document.getElementById("listeningTestsList");

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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

async function loadListeningTests() {
    const response = await fetch("/api/listening-tests?includeDerived=1");
    const tests = await response.json();

    if (!tests.length) {
        listeningTestsList.innerHTML = '<div class="test-list-empty">No Listening tests have been created yet.</div>';
        return;
    }

    const testCount = document.getElementById("listeningTestCount");
    const questionCount = document.getElementById("listeningQuestionCount");

    if (testCount) {
        testCount.textContent = String(tests.length);
    }

    if (questionCount) {
        questionCount.textContent = String(tests.reduce((total, test) => total + (Number(test.questionCount) || 0), 0));
    }

    listeningTestsList.innerHTML = tests.map((test) => {
        const duration = Number(test.duration) || (test.part === "full" ? 40 : 10);
        const partLabel = test.part === "full" ? "Full test" : `Part ${test.part}`;
        const href = test.openUrl || `/listening/${slugify(test.slug || test.title)}`;

        return `
        <a class="listening-test-list-card" href="${escapeHtml(href)}">
            <div class="test-card-top">
                <span class="test-card-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 14v-2a9 9 0 0 1 18 0v2"></path>
                        <path d="M5 14h3v6H5z"></path>
                        <path d="M16 14h3v6h-3z"></path>
                    </svg>
                </span>
                <span class="test-card-badge">${escapeHtml(partLabel)}</span>
            </div>
            <div class="test-card-content">
                <h2>${escapeHtml(test.title)}</h2>
                <p>${escapeHtml(test.subtitle || (test.part === "full" ? "Listening full test" : "Academic Listening practice"))}</p>
            </div>
            <div class="test-card-stats">
                <span><strong>${escapeHtml(test.questionCount || 0)}</strong> Questions</span>
                <span><strong>${duration} min</strong> Timer</span>
            </div>
            <div class="test-card-button">Start Test <span>-></span></div>
        </a>
    `;
    }).join("");
}

loadListeningTests().catch((error) => {
    listeningTestsList.textContent = error.message;
});
