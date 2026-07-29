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

    mockTestsList.innerHTML = tests.map((test) => {
        const isPremium = test.isPremium === true || String(test.access || "").toLowerCase() === "premium";
        const startUrl = escapeHtml(mockIntroUrl(test.openUrl));
        return `
        <article class="test-card mock-test-card">
            <div class="test-card-top">
                <div class="mock-card-icon-wrap" aria-hidden="true">
                    <span class="test-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 6h11"></path>
                            <path d="M5 11h9"></path>
                            <path d="M5 16h6"></path>
                            <path d="m15 16 2.3 2.3L22 12.8"></path>
                        </svg>
                    </span>
                    <span class="mock-card-dots"></span>
                </div>
                <span class="mock-access-pill ${isPremium ? "premium" : "free"}">${isPremium ? "PREMIUM" : "FREE"}</span>
            </div>
            <div class="test-card-content">
                <h2>${escapeHtml(test.title)}</h2>
            </div>
            <div class="mock-card-details">
                <div class="mock-detail-row">
                    <span class="mock-detail-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 14v-2a8 8 0 0 1 16 0v2"></path>
                            <path d="M18 19h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-1v7Z"></path>
                            <path d="M6 19H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1v7Z"></path>
                        </svg>
                    </span>
                    <span class="mock-detail-text">${escapeHtml(test.sections)}</span>
                </div>
                <div class="mock-detail-row">
                    <span class="mock-detail-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="9"></circle>
                            <path d="M12 7v5l3 2"></path>
                        </svg>
                    </span>
                    <span class="mock-detail-text">Estimated time: ${escapeHtml(test.estimatedTime)}</span>
                </div>
            </div>
            <a class="test-card-button" href="${startUrl}" aria-label="Start Mock Test">
                <span class="test-card-button-label">Start Mock Test</span>
                <svg class="test-card-button-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 12h14"></path>
                    <path d="m14 7 5 5-5 5"></path>
                </svg>
            </a>
        </article>
    `;
    }).join("");
}

loadMockTests().catch((error) => {
    mockTestsList.innerHTML = `<div class="test-list-empty">${escapeHtml(error.message)}</div>`;
});
