function validDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function isManualPremiumActive(user, now = new Date()) {
    if (user?.manualPremiumActive !== true) return false;
    const endsAt = validDate(user.manualPremiumEndsAt);
    return !endsAt || endsAt.getTime() > now.getTime();
}

function isLemonSqueezyPremiumActive(user, now = new Date()) {
    if (!user?.lemonSqueezySubscriptionId) return false;
    const status = String(user.subscriptionStatus || "").trim().toLowerCase();
    if (status === "expired") return false;
    if (status === "cancelled" || status === "canceled") {
        const endsAt = validDate(user.subscriptionEndsAt || user.subscriptionExpiresAt);
        return !endsAt || endsAt.getTime() > now.getTime();
    }
    return true;
}

function hasEffectivePremiumAccess(user, now = new Date()) {
    return isManualPremiumActive(user, now) || isLemonSqueezyPremiumActive(user, now);
}

function effectivePremiumDates(user, now = new Date()) {
    const starts = [];
    const activeSources = [];
    if (isManualPremiumActive(user, now)) {
        starts.push(validDate(user.manualPremiumStartsAt));
        activeSources.push(validDate(user.manualPremiumEndsAt));
    }
    if (isLemonSqueezyPremiumActive(user, now)) {
        starts.push(validDate(user.lemonSqueezyActivatedAt));
        activeSources.push(validDate(user.subscriptionEndsAt));
    }
    const validStarts = starts.filter(Boolean).sort((a, b) => a.getTime() - b.getTime());
    const finiteEnds = activeSources.filter(Boolean).sort((a, b) => b.getTime() - a.getTime());
    return {
        activatedAt: validStarts[0] || null,
        expiresAt: activeSources.some((value) => value === null) ? null : (finiteEnds[0] || null)
    };
}

module.exports = {
    validDate,
    isManualPremiumActive,
    isLemonSqueezyPremiumActive,
    hasEffectivePremiumAccess,
    effectivePremiumDates
};
