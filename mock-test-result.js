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

    function pathParts() {
        return window.location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    }

    function mockIdFromPath() {
        const parts = pathParts();
        return parts[1] || "";
    }

    function resultIdFromPath() {
        const parts = pathParts();
        if (parts[0] === "mock-test-result") return parts[1] || "";
        return "";
    }

    function resultApiUrl() {
        const resultId = resultIdFromPath();
        if (resultId) return `/api/mock-test-results/${encodeURIComponent(resultId)}`;
        const parts = window.location.pathname.split("/").filter(Boolean);
        return `/api/mock-tests/${encodeURIComponent(decodeURIComponent(parts[1] || ""))}/latest-result`;
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
                    </div>
                    <div class="mock-band-badge">
                        <span>Overall Band</span>
                        <strong>${formatBand(result.overallBand)}</strong>
                    </div>
                </div>

                <div class="mock-result-grid">
                    <article class="mock-result-card">
                        <span>Listening band</span>
                        <strong>${formatBand(result.listening?.band)}</strong>
                    </article>
                    <article class="mock-result-card">
                        <span>Reading band</span>
                        <strong>${formatBand(result.reading?.band)}</strong>
                    </article>
                    <article class="mock-result-card">
                        <span>Writing band</span>
                        <strong>${formatBand(result.writing?.band)}</strong>
                    </article>
                    <article class="mock-result-card">
                        <span>Speaking band</span>
                        <strong>${formatBand(result.speaking?.band)}</strong>
                    </article>
                </div>

                <div class="mock-result-actions">
                    <a class="mock-intro-primary" href="/dashboard">Dashboard</a>
                </div>
            </section>
        `;
    }

    async function boot() {
        const response = await fetch(resultApiUrl(), {
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
            </section>
        `;
    });
}());
