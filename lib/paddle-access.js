const ACCESS_GRANTING_STATUSES = new Set(["active", "trialing"]);

function subscriptionGrantsPaidAccess(subscription) {
    if (!subscription) return false;
    return ACCESS_GRANTING_STATUSES.has(String(subscription.status || "").trim().toLowerCase());
}

module.exports = {
    ACCESS_GRANTING_STATUSES,
    subscriptionGrantsPaidAccess
};
