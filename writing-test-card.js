(function () {
    const TASK_META = {
        task1: {
            badge: "Writing Task 1",
            taskType: "Writing Task 1",
            timeAllowed: "20 minutes",
            wordLimit: "At least 150 words"
        },
        task2: {
            badge: "Writing Task 2",
            taskType: "Writing Task 2",
            timeAllowed: "40 minutes",
            wordLimit: "At least 250 words"
        }
    };

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function documentIcon() {
        return `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path>
            </svg>
        `;
    }

    function render(options) {
        const task = options?.task === "task2" ? "task2" : "task1";
        const meta = TASK_META[task];
        const index = Number.isFinite(options?.index) ? options.index : 0;
        const title = options?.title || `Test ${index + 1}`;
        const href = options?.href || "#";

        return `
            <a class="writing-test-card" href="${escapeHtml(href)}">
                <div class="test-card-top">
                    <span class="test-card-icon" aria-hidden="true">
                        ${documentIcon()}
                    </span>
                    <span class="test-card-badge">${escapeHtml(meta.badge)}</span>
                </div>
                <div class="test-card-content">
                    <h2>${escapeHtml(title)}</h2>
                    <p>${escapeHtml(meta.taskType)}</p>
                </div>
                <div class="test-card-stats">
                    <span><strong>${escapeHtml(meta.timeAllowed)}</strong> Time allowed</span>
                    <span><strong>${escapeHtml(meta.wordLimit)}</strong> Word limit</span>
                </div>
                <div class="test-card-button">Start Test <span>-&gt;</span></div>
            </a>
        `;
    }

    window.WritingTestCard = {
        render
    };
}());
