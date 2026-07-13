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

    function currentUser() {
        return window.authClient?.getAuth?.()?.user || window.authClient?.getAuthState?.()?.user || null;
    }

    function hasPremiumAccess() {
        const user = currentUser();
        if (window.IELTSXPremium?.hasPremiumAccess) {
            return window.IELTSXPremium.hasPremiumAccess(user);
        }
        if (!user || user.isPremium !== true) return false;
        const expiresAt = user.premiumExpiresAt || user.subscriptionExpiresAt || user.premiumUntil;
        if (!expiresAt) return true;
        const expiry = new Date(expiresAt);
        return !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now();
    }

    function absoluteReturnPath(href) {
        try {
            const target = new URL(href || window.location.href, window.location.href);
            return `${target.pathname}${target.search}${target.hash}`;
        } catch {
            return `${window.location.pathname}${window.location.search}`;
        }
    }

    function premiumLockedHref(href) {
        const returnPath = absoluteReturnPath(href);
        return `/premium-locked.html?type=writing&return=${encodeURIComponent(returnPath)}`;
    }

    function hrefForAccess(href, isPremium) {
        return isPremium && !hasPremiumAccess() ? premiumLockedHref(href) : href;
    }

    function render(options) {
        const task = options?.task === "task2" ? "task2" : "task1";
        const meta = TASK_META[task];
        const index = Number.isFinite(options?.index) ? options.index : 0;
        const title = options?.title || `Test ${index + 1}`;
        const href = options?.href || "#";
        const isPremium = options?.isPremium === true;
        const finalHref = hrefForAccess(href, isPremium);
        const accessLabel = isPremium ? "PREMIUM" : "FREE";

        return `
            <a class="writing-test-card" href="${escapeHtml(finalHref)}" data-requires-premium="${isPremium ? "true" : "false"}">
                <div class="test-card-top">
                    <span class="test-card-icon" aria-hidden="true">
                        ${documentIcon()}
                    </span>
                    <span class="test-card-badge ${isPremium ? "test-card-badge--premium" : "test-card-badge--free"}">${accessLabel}</span>
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
        render,
        hasPremiumAccess,
        hrefForAccess,
        premiumLockedHref
    };
}());
