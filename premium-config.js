(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.IELTSXPremium = api;
}(typeof window !== "undefined" ? window : null, function () {
    const premiumPlans = Object.freeze({
        monthly: Object.freeze({ id: "monthly", name: "Starter", durationDays: 30, billing: "30 days of Premium access", rank: 0 }),
        threeMonths: Object.freeze({ id: "threeMonths", name: "Accelerator", durationDays: 90, billing: "90 days of Premium access", rank: 1, bestValue: true }),
        annual: Object.freeze({ id: "annual", name: "Mastery", durationDays: 365, billing: "365 days of Premium access", rank: 2 })
    });

    const checkoutUrls = Object.freeze({
        monthly: "https://ieltsxorg.lemonsqueezy.com/checkout/buy/a36fb9e7-a6f4-42de-af5c-d58fbd9a7131",
        threeMonths: "https://ieltsxorg.lemonsqueezy.com/checkout/buy/f58d698f-65ad-4b35-98c8-6d2730e0f4a5",
        annual: "https://ieltsxorg.lemonsqueezy.com/checkout/buy/fd29752d-b721-469b-94ff-790de892757a"
    });

    const checkoutPrices = Object.freeze({
        monthly: "$5.99",
        threeMonths: "$15",
        annual: "$59.99"
    });

    const subscriptionFeatures = Object.freeze({
        listening: Object.freeze({ free: true, premium: true }),
        reading: Object.freeze({ free: true, premium: true }),
        speaking: Object.freeze({ free: false, premium: true }),
        writing: Object.freeze({ free: false, premium: true }),
        fullMockTest: Object.freeze({ free: false, premium: true }),
        detailedBandFeedback: Object.freeze({ free: false, premium: true }),
        pdfResults: Object.freeze({ free: false, premium: true }),
        reviewMistakes: Object.freeze({ free: false, premium: true }),
        vocabulary: Object.freeze({ free: false, premium: true }),
        studyPlan: Object.freeze({ free: false, premium: true }),
        aiCoach: Object.freeze({ free: false, premium: true }),
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
        Object.freeze({ key: "reviewMistakes", label: "Review Mistakes", free: "Not available", premium: "Available", freeAvailable: false, premiumAvailable: true }),
        Object.freeze({ key: "vocabulary", label: "Vocabulary & AI Translate", free: "Not available", premium: "Available", freeAvailable: false, premiumAvailable: true }),
        Object.freeze({ key: "studyPlan", label: "AI Study Plan", free: "Not available", premium: "Available", freeAvailable: false, premiumAvailable: true }),
        Object.freeze({ key: "aiCoach", label: "IELTSX AI Coach", free: "Not available", premium: "Unlimited", freeAvailable: false, premiumAvailable: true }),
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
        "Review Mistakes",
        "Vocabulary and AI Translate",
        "AI-powered Study Plan",
        "Unlimited IELTSX AI Coach",
        "Full result history",
        "Progress statistics"
    ]);

    const manualPaymentConfig = Object.freeze({
        cardType: "UZCARD / HUMO",
        cardNumber: "5614681076000011",
        telegramUsername: "ieltsxuz_admin",
        currency: "UZS",
        planAmounts: Object.freeze({ monthly: 50000, threeMonths: 120000, annual: 500000 })
    });

    function safeDate(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function inferSubscriptionPlanId(user) {
        const source = user || {};
        const explicitPlanAliases = { three_months: "threeMonths", yearly: "annual" };
        const rawPlanId = String(source.subscriptionPlan || source.manualPremiumPlan || "").trim();
        const explicitPlanId = explicitPlanAliases[rawPlanId] || rawPlanId;
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
        const manualEndsAt = safeDate(source.manualPremiumEndsAt);
        if (source.manualPremiumActive === true && (!manualEndsAt || manualEndsAt.getTime() > Date.now())) return true;
        if (source.isPremium !== true) return false;
        const status = String(source.subscriptionStatus || "").trim().toLowerCase();
        if (status === "expired") return false;
        if (["cancelled", "canceled"].includes(status)) {
            const endsAt = safeDate(source.subscriptionEndsAt || source.subscriptionExpiresAt || source.premiumExpiresAt || source.premiumUntil);
            return !endsAt || endsAt.getTime() > Date.now();
        }

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
        if (!["free", "active", "trialing", "past_due", "paused", "canceled", "cancelled", "expired"].includes(status)) status = hasAccess ? "active" : "free";
        const remainingDays = status === "active" && expiresAt
            ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000))
            : null;
        const inferredPlanId = inferSubscriptionPlanId(source);
        const planId = inferredPlanId || "free";
        const plan = premiumPlans[planId] || null;
        return {
            isPremium: hasAccess,
            status,
            statusLabel: status === "free" ? "Free" : status.replace("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
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
        const normalized = ["free", "active", "trialing", "past_due", "paused", "canceled", "cancelled", "expired"].includes(status) ? status : "free";
        const label = normalized === "free" ? "Free" : normalized.replace("_", " ").replace(/^./, (letter) => letter.toUpperCase());
        return `<span class="subscription-status subscription-status--${normalized}">${label}</span>`;
    }

    return { premiumPlans, checkoutUrls, checkoutPrices, premiumFeatures, subscriptionFeatures, subscriptionComparisonRows, manualPaymentConfig, hasPremiumAccess, inferSubscriptionPlanId, getSubscriptionDisplayStatus, isPremiumUser, canAccessSubscriptionFeature, formatPrice, premiumBadge, subscriptionStatusBadge };
}));
