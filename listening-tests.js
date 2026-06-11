const listeningTestsList = document.getElementById("listeningTestsList");

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function loadListeningTests() {
    const response = await fetch("/api/listening-tests");
    const tests = await response.json();

    if (!tests.length) {
        listeningTestsList.textContent = "No Listening tests have been created yet.";
        return;
    }

    listeningTestsList.innerHTML = tests.map((test) => {
        const duration = Number(test.duration) || (test.part === "full" ? 40 : 10);

        return `
        <article class="listening-test-list-card">
            <div>
                <p>Part ${test.part}</p>
                <h2>${escapeHtml(test.title)}</h2>
                <span>${test.questionCount} questions</span>
                <span>${duration} min</span>
            </div>
            <a href="listening-template.html?id=${encodeURIComponent(test.id)}">Start</a>
        </article>
    `;
    }).join("");
}

loadListeningTests().catch((error) => {
    listeningTestsList.textContent = error.message;
});
