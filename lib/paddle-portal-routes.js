const mongoose = require("mongoose");
const PaddleCustomer = require("../models/PaddleCustomer");
const PaddleSubscription = require("../models/PaddleSubscription");
const { getPaddleInstance } = require("./paddle-client");

function registerPaddlePortalRoutes(app, requireUser) {
    app.post("/api/paddle/customer-portal", requireUser, async (req, res) => {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(503).json({ error: "Billing data is temporarily unavailable" });
            }

            const authenticatedUserId = String(req.user?.id || req.account?._id || "").trim();
            const authenticatedEmail = String(req.user?.email || req.account?.email || "").trim().toLowerCase();
            if (!authenticatedUserId && !authenticatedEmail) {
                return res.status(401).json({ error: "Not authenticated" });
            }
            const customer = await PaddleCustomer.findOne({
                $or: [
                    ...(authenticatedUserId ? [{ userId: authenticatedUserId }] : []),
                    ...(authenticatedEmail ? [{ email: authenticatedEmail }] : [])
                ]
            }).lean();

            if (!customer?.customerId) {
                return res.status(404).json({ error: "No Paddle customer is linked to this account yet" });
            }

            const subscriptions = await PaddleSubscription.find({
                customerId: customer.customerId,
                status: { $in: ["active", "trialing", "past_due", "paused"] }
            })
                .select("subscriptionId -_id")
                .lean();
            const subscriptionIds = subscriptions.map((item) => item.subscriptionId).filter(Boolean);
            const session = await getPaddleInstance().customerPortalSessions.create(
                customer.customerId,
                subscriptionIds
            );
            const url = session?.urls?.general?.overview;
            if (!url) throw new Error("Paddle did not return a customer portal URL");

            res.setHeader("Cache-Control", "no-store, private");
            return res.json({ url });
        } catch (error) {
            console.error("Paddle customer portal error:", error?.message || error);
            return res.status(500).json({ error: "Could not open the billing portal" });
        }
    });
}

module.exports = { registerPaddlePortalRoutes };
