const statUsers = document.getElementById("statUsers");
const statTodayUsers = document.getElementById("statTodayUsers");
const statPremiumUsers = document.getElementById("statPremiumUsers");
const statFreeUsers = document.getElementById("statFreeUsers");
const statReading = document.getElementById("statReading");
const statListening = document.getElementById("statListening");
const recentTests = document.getElementById("recentTests");
const refreshRecent = document.getElementById("refreshRecent");
const dashboardStatus = document.getElementById("dashboardStatus");

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showStatus(message, type = "") {
    if (!message) {
        dashboardStatus.hidden = true;
        dashboardStatus.textContent = "";
        dashboardStatus.className = "status-text";
        return;
    }

    dashboardStatus.hidden = false;
    dashboardStatus.textContent = message;
    dashboardStatus.className = `status-text${type ? ` ${type}` : ""}`;
}

function markActiveNav() {
    const path = window.location.pathname.toLowerCase();

    document.querySelectorAll(".admin-nav a").forEach((link) => {
        const href = (link.getAttribute("href") || "").toLowerCase();
        
        let isActive = false;
        if (href === "/admin") {
            isActive = path.endsWith("/admin") || path.endsWith("/admin.html");
        } else if (href.includes("listening")) {
            isActive = path.includes("listening");
        } else if (href.includes("reading")) {
            isActive = path.includes("reading");
        } else if (href.includes("users")) {
            isActive = path.includes("users");
        }

        link.classList.toggle("is-active", isActive);
    });
}

function renderStats(data) {
    if (statUsers) statUsers.textContent = data.totalUsers ?? data.users ?? 0;
    if (statTodayUsers) statTodayUsers.textContent = data.todayUsers ?? 0;
    if (statPremiumUsers) statPremiumUsers.textContent = data.premiumUsers ?? 0;
    if (statFreeUsers) statFreeUsers.textContent = data.freeUsers ?? 0;
    if (statReading) statReading.textContent = data.readingTests ?? 0;
    if (statListening) statListening.textContent = data.listeningTests ?? 0;
}

function renderRecent(tests) {
    if (!tests.length) {
        recentTests.className = "recent-list empty-state";
        recentTests.textContent =
            "No tests yet. Create a reading or listening test to get started.";
        return;
    }

    recentTests.className = "recent-list";
    recentTests.innerHTML = tests.map((test) => {
        const when = new Date(test.createdAt).toLocaleString();
        const partLabel = test.part ? `Part ${test.part}` : "";
        const meta = [partLabel, test.questionCount != null ? `${test.questionCount} questions` : ""]
            .filter(Boolean)
            .join(" · ");

        return `
            <article class="recent-row">
                <div class="recent-row__main">
                    <span class="type-badge type-badge--${escapeHtml(test.type)}">${escapeHtml(test.type)}</span>
                    <h3>${escapeHtml(test.title)}</h3>
                    <p class="recent-row__meta">${escapeHtml(when)}${meta ? ` · ${escapeHtml(meta)}` : ""}</p>
                </div>
                <div class="recent-row__actions">
                    <a href="${escapeHtml(test.openUrl)}">Open</a>
                    <a href="${escapeHtml(test.editUrl)}">Edit</a>
                </div>
            </article>
        `;
    }).join("");
}

async function readJson(response) {
    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            "Server returned an invalid response. Restart the server with: node server.js"
        );
    }
}

async function loadStats() {
    const [statsResponse, userStatsResponse] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/stats/users")
    ]);

    const statsData = await readJson(statsResponse);
    const userStatsData = await readJson(userStatsResponse);

    if (!statsResponse.ok) {
        throw new Error(statsData.error || "Could not load stats");
    }
    if (!userStatsResponse.ok) {
        throw new Error(userStatsData.error || "Could not load user stats");
    }

    const data = { ...statsData, ...userStatsData };
    renderStats(data);
    return data;
}

async function loadRecent() {
    const [readingResponse, listeningResponse] = await Promise.all([
        fetch("/api/reading-tests"),
        fetch("/api/listening-tests")
    ]);

    const readingData = await readJson(readingResponse);
    const listeningData = await readJson(listeningResponse);

    if (!readingResponse.ok) {
        throw new Error(readingData.error || "Could not load reading tests");
    }

    if (!listeningResponse.ok) {
        throw new Error(listeningData.error || "Could not load listening tests");
    }

    const tests = [
        ...readingData.map((test) => ({
            id: test.id,
            title: test.title,
            type: "reading",
            part: test.part,
            questionCount: test.questionCount,
            createdAt: test.createdAt,
            openUrl: test.openUrl || `/reading/${encodeURIComponent(test.slug || test.title || "test")}`,
            editUrl: "admin-reading.html"
        })),
        ...listeningData.map((test) => ({
            id: test.id,
            title: test.title,
            type: "listening",
            part: test.part,
            questionCount: test.questionCount,
            createdAt: test.createdAt,
            openUrl: test.openUrl || `/listening/${encodeURIComponent(test.slug || test.title || "test")}`,
            editUrl: `admin-listening.html?id=${encodeURIComponent(test.id)}`
        }))
    ]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10);

    renderRecent(tests);
    return tests;
}

async function refreshDashboard() {
    showStatus("");
    await Promise.all([loadStats(), loadRecent()]);
}

refreshRecent.addEventListener("click", () => {
    refreshDashboard().catch((error) => {
        showStatus(error.message, "error");
    });
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        refreshDashboard().catch(() => {});
    }
});

setInterval(() => {
    refreshDashboard().catch(() => {});
}, 30000);

markActiveNav();

refreshDashboard().catch((error) => {
    recentTests.className = "recent-list empty-state";
    recentTests.textContent = error.message;
    showStatus(error.message, "error");
});
