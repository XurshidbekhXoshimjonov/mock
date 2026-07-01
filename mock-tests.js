const mockTestsList = document.getElementById("mockTestsList");
const mockTestCount = document.getElementById("mockTestCount");

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function mockIntroUrl(value) {
    const url = String(value || "/mock-test").trim();
    return `${url}${url.includes("?") ? "&" : "?"}intro=1`;
}

async function loadMockTests() {
    const response = await fetch("/api/mock-tests", { cache: "no-store" });
    const tests = await response.json();

    if (!response.ok) {
        throw new Error(tests.error || "Could not load mock tests");
    }

    if (mockTestCount) {
        mockTestCount.textContent = String(tests.length);
    }

    if (!tests.length) {
        mockTestsList.innerHTML = '<div class="test-list-empty">No mock tests available yet.</div>';
        return;
    }

    mockTestsList.innerHTML = tests.map((test) => `
        <a class="test-card mock-test-card" href="${escapeHtml(mockIntroUrl(test.openUrl))}">
            <div class="test-card-top">
                <span class="test-card-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 6h16"></path>
                        <path d="M4 12h16"></path>
                        <path d="M4 18h11"></path>
                        <path d="M18 16l2 2 3-4"></path>
                    </svg>
                </span>
                <span class="mock-access-pill free">FREE</span>
            </div>
            <div class="test-card-content">
                <h2>${escapeHtml(test.title)}</h2>
            </div>
            <div class="mock-card-lines">
                <span>${escapeHtml(test.sections)}</span>
                <span>Estimated time: ${escapeHtml(test.estimatedTime)}</span>
            </div>
            <div class="test-card-button">Start Mock Test <span>&rarr;</span></div>
        </a>
    `).join("");
}

loadMockTests().catch((error) => {
    mockTestsList.innerHTML = `<div class="test-list-empty">${escapeHtml(error.message)}</div>`;
});
