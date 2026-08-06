function getPageConfig() {
    const pathLower = window.location.pathname.toLowerCase();
    const page = pathLower.split("/").pop().replace(".html", "") || "index";
    const isListeningRoute = pathLower.startsWith("/listening/") || pathLower.startsWith("/listening.");

    const configs = {
        "part1": { type: isListeningRoute ? "listening" : "reading", part: "1" },
        "part2": { type: isListeningRoute ? "listening" : "reading", part: "2" },
        "part3": { type: isListeningRoute ? "listening" : "reading", part: "3" },
        "part4": { type: "listening", part: "4" },
        "fulltest": { type: isListeningRoute ? "listening" : "reading", part: "full" },
        "listeningpart1": { type: "listening", part: "1" },
        "listeningpart2": { type: "listening", part: "2" },
        "listeningpart3": { type: "listening", part: "3" },
        "listeningpart4": { type: "listening", part: "4" },
        "listeningfulltest": { type: "listening", part: "full" }
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

function slugify(value) {
    return String(value || "test")
        .trim()
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-") || "test";
}

function cleanTestUrl(config, test) {
    const skill = config.type === "listening" ? "listening" : "reading";
    return `/${skill}/${slugify(test.slug || test.title)}`;
}

function cardMetaText(config) {
    if (config.part === "full") {
        return config.type === "listening"
            ? "Listening full test"
            : "Reading full test";
    }

    return config.type === "listening"
        ? `Listening Part ${config.part}`
        : "Academic Reading Practice";
}

function displayTitle(config, number, fallbackTitle = "") {
    return config.part === "full"
        ? `Test ${number}`
        : (fallbackTitle || `Test ${number}`);
}

function defaultQuestionCount(config) {
    if (config.part === "full") return 40;
    if (config.type === "listening") return 10;
    return config.part === "3" ? 14 : 13;
}

function estimatedTime(config, test) {
    const duration = Number(test?.duration);
    if (Number.isFinite(duration) && duration > 0) {
        return `${duration} min`;
    }

    if (config.part === "full") {
        return config.type === "listening" ? "40 min" : "60 min";
    }

    if (config.type === "listening") {
        return "10 min";
    }

    return "20 min";
}

function difficultyLabel(config) {
    return "Free";
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

function renderCardContent({ title, description, questionCount, config, test }) {
    return `
        <div class="test-card-top">
            <span class="test-card-icon">${iconSvg(config)}</span>
            <span class="test-card-badge test-card-badge--free">${difficultyLabel(config)}</span>
        </div>
        <div class="test-card-content">
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(description)}</p>
        </div>
        <div class="test-card-stats">
            <span><strong>${escapeHtml(questionCount)}</strong> Questions</span>
            <span><strong>${escapeHtml(estimatedTime(config, test))}</strong> Estimated time</span>
        </div>
        <span class="test-card-button">Start Test <span>-></span></span>
    `;
}

function makeCard({ href, title, description, questionCount, config, test }) {
    const card = document.createElement("a");
    card.className = "reading-test-card";
    card.href = href;
    card.dataset.createdAt = String(test?.createdAt || "");
    card.innerHTML = renderCardContent({ title, description, questionCount, config, test });
    return card;
}

function makeUploadedCard(test, part, config, number) {
    return makeCard({
        href: `/test-viewer.html?id=${encodeURIComponent(test.id)}&part=${encodeURIComponent(part)}&type=${encodeURIComponent(config.type)}`,
        title: displayTitle(config, number, test.title),
        description: cardMetaText(config),
        questionCount: questionCountForTest(test, config),
        config,
        test
    });
}

function setManualCardContent(card, test, config, number) {
    card.href = test.openUrl || cleanTestUrl(config, test);

    card.innerHTML = renderCardContent({
        title: displayTitle(config, number, test.title),
        description: cardMetaText(config),
        questionCount: questionCountForTest(test, config),
        config,
        test
    });
}

function addManualCard(grid, test, config) {
    const card = document.createElement("a");
    const number = nextCardNumber(grid);
    card.className = "reading-test-card";
    grid.appendChild(card);
    setManualCardContent(card, test, config, number);
}

function nextCardNumber(grid) {
    return grid.querySelectorAll(".reading-test-card").length + 1;
}

async function loadFullTestCards(config, grid) {
    if (config.part !== "full") {
        return new Set();
    }

    const response = await fetch(`/api/full-tests?status=published&skill=${encodeURIComponent(config.type)}`);
    if (!response.ok) {
        return new Set();
    }

    const tests = await response.json();
    const skipManualIds = new Set();

    tests.forEach((test) => {
        const href = test.openUrl || cleanTestUrl(config, test);
        const number = nextCardNumber(grid);

        if (config.type === "listening" && test.manualListeningTestId) {
            skipManualIds.add(test.manualListeningTestId);
        } else if (config.type === "reading") {
            skipManualIds.add(`${test.id}-reading-full`);
        }

        grid.appendChild(makeCard({
            href,
            title: displayTitle(config, number, test.title || partLabel(config)),
            description: cardMetaText(config),
            questionCount: questionCountForTest(test, config),
            config,
            test
        }));
    });

    return skipManualIds;
}

async function loadManualTests(config, grid, skipIds = new Set()) {
    const endpoint = config.type === "listening" ? "/api/listening-tests" : "/api/reading-tests";
    const response = await fetch(`${endpoint}?part=${encodeURIComponent(config.part)}`);

    if (!response.ok) {
        return;
    }

    const tests = await response.json();

    tests
        .slice()
        .filter((test) => !skipIds.has(test.id))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
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

function renumberFullTestCards(grid, config) {
    if (config.part !== "full") return;

    grid.querySelectorAll(".reading-test-card").forEach((card, index) => {
        const title = card.querySelector(".test-card-content h2");
        if (title) title.textContent = `Test ${index + 1}`;
    });
}

function sortFullTestCardsByNewest(grid, config) {
    if (config.part !== "full") return;

    [...grid.querySelectorAll(".reading-test-card")]
        .sort((left, right) => {
            const leftTime = Date.parse(left.dataset.createdAt || "") || 0;
            const rightTime = Date.parse(right.dataset.createdAt || "") || 0;
            return rightTime - leftTime;
        })
        .forEach((card) => grid.appendChild(card));
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
    const storedFullTestCards = document.createElement("div");
    const skipManualIds = await loadFullTestCards(config, storedFullTestCards);

    if (config.part === "full") {
        while (storedFullTestCards.firstChild) {
            grid.appendChild(storedFullTestCards.firstChild);
        }
    }

    await loadManualTests(config, grid, skipManualIds);

    if (config.part !== "full") {
        while (storedFullTestCards.firstChild) {
            grid.appendChild(storedFullTestCards.firstChild);
        }
    }

    const response = await fetch(`/api/tests?type=${config.type}&part=${config.part}`);

    if (response.ok) {
        const tests = await response.json();
        const uploaded = tests.filter((test) => (
            config.part === "full" ||
            (Array.isArray(test.parts) && test.parts.some((part) => String(part.number) === String(config.part)))
        ));

        uploaded.forEach((test) => {
            const number = nextCardNumber(grid);
            grid.appendChild(makeUploadedCard(test, config.part, config, number));
        });
    }

    sortFullTestCardsByNewest(grid, config);
    renumberFullTestCards(grid, config);
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
