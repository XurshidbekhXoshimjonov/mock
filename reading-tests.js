const readingTestsList = document.getElementById("readingTestsList");

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

async function loadReadingTests() {
    const response = await fetch("/api/reading-tests");
    const tests = await response.json();

    if (!tests.length) {
        readingTestsList.textContent = "No Reading tests have been created yet.";
        return;
    }

    readingTestsList.innerHTML = tests.map((test) => `
        <article class="reading-test-list-card">
            <div>
                <p>${escapeHtml(partLabel(test.part))}</p>
                <h2>${escapeHtml(test.title)}</h2>
                <span>${test.questionCount} questions</span>
            </div>
            <a href="reading-template.html?id=${encodeURIComponent(test.id)}">Start</a>
        </article>
    `).join("");
}

loadReadingTests().catch((error) => {
    readingTestsList.textContent = error.message;
});
