(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.IELTSXPremium = api;
}(typeof window !== "undefined" ? window : null, function () {
    const premiumPlans = Object.freeze({
        monthly: Object.freeze({ id: "monthly", name: "Monthly Premium", durationDays: 30, price: 50000, billing: "30 days of Premium access" }),
        threeMonths: Object.freeze({ id: "threeMonths", name: "Three-Month Premium", durationDays: 90, price: 120000, billing: "90 days of Premium access" }),
        annual: Object.freeze({ id: "annual", name: "Annual Premium", durationDays: 365, price: 500000, billing: "365 days of Premium access", bestValue: true })
    });

    const subscriptionFeatures = Object.freeze({
        listening: Object.freeze({ free: true, premium: true }),
        reading: Object.freeze({ free: true, premium: true }),
        speaking: Object.freeze({ free: false, premium: true }),
        writing: Object.freeze({ free: false, premium: true }),
        fullMockTest: Object.freeze({ free: false, premium: true }),
        detailedBandFeedback: Object.freeze({ free: false, premium: true }),
        pdfResults: Object.freeze({ free: false, premium: true }),
        resultHistory: Object.freeze({ free: "limited", premium: true }),
        progressStatistics: Object.freeze({ free: false, premium: true })
    });

    const subscriptionComparisonRows = Object.freeze([
        Object.freeze({ key: "listening", label: "Listening practice", free: "Available", premium: "All tests", freeAvailable: true, premiumAvailable: true }),
        Object.freeze({ key: "reading", label: "Reading practice", free: "Available", premium: "All tests", freeAvailable: true, premiumAvailable: true }),
        Object.freeze({ key: "speaking", label: "Speaking practice & AI evaluation", free: "Not available", premium: "Unlimited", freeAvailable: false, premiumAvailable: true }),
        Object.freeze({ key: "writing", label: "Writing practice & AI evaluation", free: "Not available", premium: "Unlimited", freeAvailable: false, premiumAvailable: true }),
        Object.freeze({ key: "fullMockTest", label: "Full IELTS Mock Tests", free: "Not available", premium: "Available", freeAvailable: false, premiumAvailable: true }),
        Object.freeze({ key: "detailedBandFeedback", label: "Detailed band feedback", free: "Not available", premium: "Detailed", freeAvailable: false, premiumAvailable: true }),
        Object.freeze({ key: "pdfResults", label: "PDF result", free: "Not available", premium: "Available", freeAvailable: false, premiumAvailable: true }),
        Object.freeze({ key: "resultHistory", label: "Result history", free: "Limited", premium: "Full", freeAvailable: false, premiumAvailable: true }),
        Object.freeze({ key: "progressStatistics", label: "Progress statistics", free: "Not available", premium: "Available", freeAvailable: false, premiumAvailable: true })
    ]);

    const premiumFeatures = Object.freeze([
        "All Listening tests",
        "All Reading tests",
        "Unlimited Speaking practice and AI evaluation",
        "Unlimited Writing practice and AI evaluation",
        "Complete IELTS Mock Tests",
        "Detailed IELTS band feedback",
        "PDF result downloads",
        "Full result history",
        "Progress statistics"
    ]);

    const manualPaymentConfig = Object.freeze({
        cardType: "UZCARD / HUMO",
        cardNumber: "5614681076000011",
        cardholder: "XOSHIMJONOV XURSHIDBEK",
        telegramUsername: "ieltsxuz_admin",
        currency: "UZS"
    });

    function safeDate(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function inferSubscriptionPlanId(user) {
        const source = user || {};
        const explicitPlanId = String(source.subscriptionPlan || "").trim();
        if (premiumPlans[explicitPlanId]) {
            const startedAt = safeDate(source.premiumActivatedAt || source.subscriptionStartedAt);
            const expiresAt = safeDate(source.premiumExpiresAt || source.subscriptionExpiresAt || source.premiumUntil);
            if (startedAt && expiresAt) {
                const durationDays = Math.round((expiresAt.getTime() - startedAt.getTime()) / 86400000);
                if (durationDays >= 330) return "annual";
                if (durationDays >= 80) return "threeMonths";
            }
            return explicitPlanId;
        }

        const startedAt = safeDate(source.premiumActivatedAt || source.subscriptionStartedAt);
        const expiresAt = safeDate(source.premiumExpiresAt || source.subscriptionExpiresAt || source.premiumUntil);
        if (startedAt && expiresAt) {
            const durationDays = Math.round((expiresAt.getTime() - startedAt.getTime()) / 86400000);
            if (durationDays >= 330) return "annual";
            if (durationDays >= 80) return "threeMonths";
            if (durationDays > 0) return "monthly";
        }

        return "";
    }

    function hasPremiumAccess(user) {
        const source = user || {};
        if (source.isPremium !== true) return false;
        const status = String(source.subscriptionStatus || "").trim().toLowerCase();
        if (status === "cancelled" || status === "free" || status === "expired") return false;

        const expiresAt = safeDate(source.premiumExpiresAt || source.subscriptionExpiresAt || source.premiumUntil);
        if (!expiresAt) return true;
        return expiresAt.getTime() > Date.now();
    }

    function getSubscriptionDisplayStatus(user) {
        const source = user || {};
        const expiresAt = safeDate(source.premiumExpiresAt || source.subscriptionExpiresAt || source.premiumUntil);
        const startedAt = safeDate(source.premiumActivatedAt || source.subscriptionStartedAt);
        const rawStatus = String(source.subscriptionStatus || "").toLowerCase();
        const markedPremium = source.isPremium === true;
        const hasAccess = hasPremiumAccess(source);
        let status = hasAccess ? "active" : (markedPremium && expiresAt && expiresAt.getTime() <= Date.now() ? "expired" : rawStatus || "free");
        if (!["free", "active", "expired", "cancelled"].includes(status)) status = hasAccess ? "active" : "free";
        const remainingDays = status === "active" && expiresAt
            ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000))
            : null;
        const inferredPlanId = inferSubscriptionPlanId(source);
        const planId = inferredPlanId || "free";
        const plan = premiumPlans[planId] || null;
        return {
            isPremium: hasAccess,
            status,
            statusLabel: status === "free" ? "Free" : status.charAt(0).toUpperCase() + status.slice(1),
            planId,
            planName: plan ? plan.name : (hasAccess ? "Premium" : "Free"),
            startedAt,
            expiresAt,
            remainingDays
        };
    }

    function isPremiumUser(user) {
        return hasPremiumAccess(user);
    }

    function canAccessSubscriptionFeature(user, featureKey) {
        const feature = subscriptionFeatures[featureKey];
        if (!feature) return false;
        return isPremiumUser(user) ? Boolean(feature.premium) : feature.free === true;
    }

    function formatPrice(value) {
        return new Intl.NumberFormat("en-US").format(Number(value || 0)) + " UZS";
    }

    function premiumBadge(user) {
        return getSubscriptionDisplayStatus(user).isPremium
            ? '<span class="premium-badge">Premium</span>'
            : "";
    }

    function subscriptionStatusBadge(status) {
        const normalized = ["free", "active", "expired", "cancelled"].includes(status) ? status : "free";
        const label = normalized === "free" ? "Free" : normalized.charAt(0).toUpperCase() + normalized.slice(1);
        return `<span class="subscription-status subscription-status--${normalized}">${label}</span>`;
    }

    return { premiumPlans, premiumFeatures, subscriptionFeatures, subscriptionComparisonRows, manualPaymentConfig, hasPremiumAccess, inferSubscriptionPlanId, getSubscriptionDisplayStatus, isPremiumUser, canAccessSubscriptionFeature, formatPrice, premiumBadge, subscriptionStatusBadge };
}));
