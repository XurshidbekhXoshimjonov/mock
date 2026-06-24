(function () {
    const root = document.getElementById("mockResultRoot");

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function mockIdFromPath() {
        const parts = window.location.pathname.split("/").filter(Boolean);
        return decodeURIComponent(parts[1] || "");
    }

    function formatBand(value) {
        return Number(value || 0).toFixed(1);
    }

    function formatDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Not available";
        return date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function render(result) {
        root.innerHTML = `
            <section class="mock-result-panel">
                <div class="mock-result-head">
                    <div>
                        <span class="test-list-eyebrow">IELTSX Mock Test Result</span>
                        <h1>${escapeHtml(result.title || "Mock Test")}</h1>
                        <p>Completed sections: ${escapeHtml((result.completedSections || []).map((item) => item[0].toUpperCase() + item.slice(1)).join(", ") || "None")}</p>
                        <p>Date completed: ${escapeHtml(formatDate(result.completedAt))}</p>
                    </div>
                    <div class="mock-band-badge">
                        <span>Overall Band</span>
                        <strong>${formatBand(result.overallBand)}</strong>
                    </div>
                </div>

                <div class="mock-result-grid">
                    <article class="mock-result-card">
                        <span>Listening score</span>
                        <strong>${formatBand(result.listening?.band)}</strong>
                        <p>${Number(result.listening?.correct || 0)}/${Number(result.listening?.total || 0)} correct</p>
                    </article>
                    <article class="mock-result-card">
                        <span>Reading score</span>
                        <strong>${formatBand(result.reading?.band)}</strong>
                        <p>${Number(result.reading?.correct || 0)}/${Number(result.reading?.total || 0)} correct</p>
                    </article>
                    <article class="mock-result-card">
                        <span>Writing score</span>
                        <strong>${formatBand(result.writing?.band)}</strong>
                        <p>${escapeHtml(result.writing?.status || "pending")}</p>
                    </article>
                    <article class="mock-result-card">
                        <span>Speaking score</span>
                        <strong>${formatBand(result.speaking?.band)}</strong>
                        <p>${escapeHtml(result.speaking?.status || "pending")}</p>
                    </article>
                </div>

                <div class="mock-result-actions">
                    <a class="mock-btn" href="/mock-tests">Back to Mock Tests</a>
                    <a class="mock-btn secondary" href="/dashboard#results">View Detailed Performance</a>
                </div>
            </section>
        `;
    }

    async function boot() {
        const response = await fetch(`/api/mock-tests/${encodeURIComponent(mockIdFromPath())}/latest-result`, {
            credentials: "include",
            cache: "no-store"
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "No result found");
        }

        render(data.result);
    }

    boot().catch((error) => {
        root.innerHTML = `
            <section class="mock-result-panel">
                <h1>No mock result found</h1>
                <p>${escapeHtml(error.message)}</p>
                <div class="mock-result-actions">
                    <a class="mock-btn" href="/mock-tests">Back to Mock Tests</a>
                </div>
            </section>
        `;
    });
}());
