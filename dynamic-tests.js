function getPageConfig() {
    const page = window.location.pathname.split("/").pop().toLowerCase() || "index.html";
    const configs = {
        "part1.html": { type: "reading", part: "1" },
        "part2.html": { type: "reading", part: "2" },
        "part3.html": { type: "reading", part: "3" },
        "fulltest.html": { type: "reading", part: "full" },
        "listeningpart1.html": { type: "listening", part: "1" },
        "listeningpart2.html": { type: "listening", part: "2" },
        "listeningpart3.html": { type: "listening", part: "3" },
        "listeningpart4.html": { type: "listening", part: "4" },
        "listeningfulltest.html": { type: "listening", part: "full" }
    };

    return configs[page] || null;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function cardMetaText(config) {
    return config.type === "listening"
        ? "IELTS Listening Practice"
        : "Academic Reading Practice";
}

function defaultQuestionCount(config) {
    if (config.part === "full") return 40;
    if (config.type === "listening") return 10;
    return config.part === "3" ? 14 : 13;
}

function estimatedTime(config) {
    if (config.part === "full") {
        return config.type === "listening" ? "30 min" : "60 min";
    }

    if (config.type === "listening") {
        return config.part === "4" ? "10 min" : "8 min";
    }

    return "20 min";
}

function difficultyLabel(config) {
    if (config.part === "1") return "Easy";
    if (config.part === "2") return "Medium";
    return "Hard";
}

function partLabel(config) {
    if (config.part === "full") {
        return config.type === "listening" ? "Full Listening Test" : "Full Reading Test";
    }

    return `${config.type === "listening" ? "Listening" : "Reading"} Part ${config.part}`;
}

function questionCountForTest(test, config) {
    if (Number.isFinite(Number(test?.questionCount)) && Number(test.questionCount) > 0) {
        return Number(test.questionCount);
    }

    if (config.part === "full" && Array.isArray(test?.parts)) {
        const total = test.parts.reduce((sum, part) => sum + (part.questions?.length || 0), 0);
        return total || defaultQuestionCount(config);
    }

    if (Array.isArray(test?.parts)) {
        const selectedPart = test.parts.find((part) => String(part.number) === String(config.part));
        return selectedPart?.questions?.length || defaultQuestionCount(config);
    }

    return defaultQuestionCount(config);
}

function iconSvg(config) {
    if (config.type === "listening") {
        return `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 14v-2a9 9 0 0 1 18 0v2"></path>
                <path d="M5 14h3v6H5z"></path>
                <path d="M16 14h3v6h-3z"></path>
            </svg>
        `;
    }

    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path>
        </svg>
    `;
}

function renderCardContent({ title, description, questionCount, config }) {
    return `
        <div class="test-card-top">
            <span class="test-card-icon">${iconSvg(config)}</span>
            <span class="test-card-badge">${difficultyLabel(config)}</span>
        </div>
        <div class="test-card-content">
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(description)}</p>
        </div>
        <div class="test-card-stats">
            <span><strong>${escapeHtml(questionCount)}</strong> Questions</span>
            <span><strong>${escapeHtml(estimatedTime(config))}</strong> Estimated time</span>
        </div>
        <span class="test-card-button">Start Test <span>-></span></span>
    `;
}

function makeCard({ href, title, description, questionCount, config }) {
    const card = document.createElement("a");
    card.className = "reading-test-card";
    card.href = href;
    card.innerHTML = renderCardContent({ title, description, questionCount, config });
    return card;
}

function makeUploadedCard(test, part, config, number) {
    return makeCard({
        href: `test-viewer.html?id=${encodeURIComponent(test.id)}&part=${encodeURIComponent(part)}&type=${encodeURIComponent(config.type)}`,
        title: test.title || `Test ${number}`,
        description: cardMetaText(config),
        questionCount: questionCountForTest(test, config),
        config
    });
}

function setManualCardContent(card, test, config, number) {
    card.href = test.openUrl || (config.type === "listening"
        ? `listening-template.html?id=${encodeURIComponent(test.id)}`
        : `reading-template.html?id=${encodeURIComponent(test.id)}`);

    card.innerHTML = renderCardContent({
        title: test.title || `Test ${number}`,
        description: cardMetaText(config),
        questionCount: questionCountForTest(test, config),
        config
    });
}

function addManualCard(grid, test, config) {
    const card = document.createElement("a");
    card.className = "reading-test-card";
    grid.appendChild(card);
    setManualCardContent(card, test, config, grid.querySelectorAll(".reading-test-card").length);
}

async function loadFullTestCards(config, grid) {
    if (config.part !== "full") {
        return;
    }

    const response = await fetch(`/api/full-tests?status=published&skill=${encodeURIComponent(config.type)}`);
    if (!response.ok) {
        return;
    }

    const tests = await response.json();
    tests.forEach((test) => {
        grid.appendChild(makeCard({
            href: `full-test-player.html?id=${encodeURIComponent(test.id)}&skill=${encodeURIComponent(config.type)}`,
            title: test.title || partLabel(config),
            description: "Full imported test",
            questionCount: questionCountForTest(test, config),
            config
        }));
    });
}

async function loadManualTests(config, grid) {
    const endpoint = config.type === "listening" ? "/api/listening-tests" : "/api/reading-tests";
    const response = await fetch(`${endpoint}?part=${encodeURIComponent(config.part)}`);

    if (!response.ok) {
        return;
    }

    const tests = await response.json();

    tests
        .slice()
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .forEach((test) => {
            addManualCard(grid, test, config);
        });
}

function updatePageCount(grid) {
    const countTarget = document.getElementById("pageTestCount");
    if (countTarget) {
        countTarget.textContent = String(grid.querySelectorAll(".reading-test-card").length);
    }
}

function showEmptyState(grid, config) {
    if (grid.querySelector(".reading-test-card")) {
        return;
    }

    const empty = document.createElement("div");
    empty.className = "test-list-empty";
    empty.textContent = `No ${partLabel(config)} tests have been created yet.`;
    grid.appendChild(empty);
}

async function loadDynamicTests() {
    const config = getPageConfig();

    if (!config) {
        return;
    }

    const grid = document.querySelector(".tests-grid");

    if (!grid) {
        return;
    }

    grid.innerHTML = "";
    await loadFullTestCards(config, grid);
    await loadManualTests(config, grid);

    const response = await fetch(`/api/tests?type=${config.type}&part=${config.part}`);

    if (response.ok) {
        const tests = await response.json();
        const uploaded = tests.filter((test) => (
            config.part === "full" ||
            (Array.isArray(test.parts) && test.parts.some((part) => String(part.number) === String(config.part)))
        ));

        uploaded.forEach((test) => {
            const number = grid.querySelectorAll(".reading-test-card").length + 1;
            grid.appendChild(makeUploadedCard(test, config.part, config, number));
        });
    }

    showEmptyState(grid, config);
    updatePageCount(grid);
}

document.addEventListener("DOMContentLoaded", () => {
    loadDynamicTests().catch((error) => {
        const grid = document.querySelector(".tests-grid");
        if (grid) {
            grid.innerHTML = `<div class="test-list-empty">${escapeHtml(error.message)}</div>`;
        }
    });
});
