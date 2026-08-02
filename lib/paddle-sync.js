const mongoose = require("mongoose");
const User = require("../models/User");
const PaddleCustomer = require("../models/PaddleCustomer");
const PaddleSubscription = require("../models/PaddleSubscription");
const PaddleTransaction = require("../models/PaddleTransaction");
const { subscriptionGrantsPaidAccess } = require("./paddle-access");

function requireMongo() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error("MongoDB is unavailable; Paddle webhook state was not persisted");
    }
}

function asDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function eventDate(event) {
    return asDate(event.occurredAt) || new Date();
}

async function upsertLatest(Model, key, keyValue, occurredAt, values) {
    const latestFilter = {
        [key]: keyValue,
        $or: [
            { lastEventOccurredAt: null },
            { lastEventOccurredAt: { $exists: false } },
            { lastEventOccurredAt: { $lte: occurredAt } }
        ]
    };
    const update = { $set: { ...values, lastEventOccurredAt: occurredAt } };
    let document = await Model.findOneAndUpdate(latestFilter, update, { new: true, runValidators: true });
    if (document) return { document, applied: true };

    const existing = await Model.findOne({ [key]: keyValue });
    if (existing) return { document: existing, applied: false };

    try {
        document = await Model.create({ [key]: keyValue, ...values, lastEventOccurredAt: occurredAt });
        return { document, applied: true };
    } catch (error) {
        if (error?.code !== 11000) throw error;
        document = await Model.findOneAndUpdate(latestFilter, update, { new: true, runValidators: true });
        if (document) return { document, applied: true };
        return { document: await Model.findOne({ [key]: keyValue }), applied: false };
    }
}

function planIdForPrice(priceId) {
    const mapping = [
        [process.env.NEXT_PUBLIC_PADDLE_STARTER_PRICE_ID, "monthly"],
        [process.env.NEXT_PUBLIC_PADDLE_ACCELERATOR_PRICE_ID, "threeMonths"],
        [process.env.NEXT_PUBLIC_PADDLE_MASTERY_PRICE_ID, "annual"]
    ];
    return mapping.find(([configured]) => configured && configured === priceId)?.[1] || null;
}

async function findUser({ customData, customerId, email }) {
    const suppliedUserId = String(customData?.userId || "").trim();
    if (suppliedUserId && mongoose.Types.ObjectId.isValid(suppliedUserId)) {
        const user = await User.findById(suppliedUserId);
        if (user) return user;
    }

    if (customerId) {
        const customer = await PaddleCustomer.findOne({ customerId }).lean();
        if (customer?.userId && mongoose.Types.ObjectId.isValid(customer.userId)) {
            const user = await User.findById(customer.userId);
            if (user) return user;
        }
        email = email || customer?.email;
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    return normalizedEmail ? User.findOne({ email: normalizedEmail }) : null;
}

async function linkCustomerToUser(customerId, user) {
    if (!customerId || !user) return;
    await PaddleCustomer.updateOne(
        { customerId },
        { $set: { userId: String(user._id), email: String(user.email || "").trim().toLowerCase() } }
    );
    await User.updateOne(
        { _id: user._id },
        { $set: { paddleCustomerId: customerId } }
    );
}

async function syncUserAccess(subscription, suppliedUser = null) {
    const user = suppliedUser || await findUser({
        customData: subscription.customData,
        customerId: subscription.customerId
    });
    if (!user) return;

    const grantsAccess = subscriptionGrantsPaidAccess(subscription);
    const planId = planIdForPrice(subscription.priceId) || user.subscriptionPlan || null;
    const status = String(subscription.status || "").toLowerCase();
    const endsAt = subscription.currentBillingPeriodEndsAt || null;
    const startedAt = subscription.startedAt || subscription.paddleCreatedAt || null;
    const canceledAt = subscription.canceledAt || (status === "canceled" ? new Date() : null);

    await User.updateOne({ _id: user._id }, { $set: {
        paddleCustomerId: subscription.customerId,
        paddleSubscriptionId: subscription.subscriptionId,
        plan: grantsAccess ? "premium" : "free",
        isPremium: grantsAccess,
        subscriptionPlan: planId,
        subscriptionStatus: status,
        subscriptionStartedAt: startedAt,
        subscriptionExpiresAt: endsAt,
        premiumActivatedAt: startedAt,
        premiumExpiresAt: endsAt,
        premiumUntil: endsAt,
        premiumCancelledAt: canceledAt,
        subscriptionAdminNote: "Synced from verified Paddle webhook"
    } });

    await linkCustomerToUser(subscription.customerId, user);
    await PaddleSubscription.updateOne(
        { subscriptionId: subscription.subscriptionId },
        { $set: { userId: String(user._id) } }
    );
}

async function syncBestCustomerSubscription(customerId, user) {
    const subscriptions = await PaddleSubscription.find({ customerId })
        .sort({ lastEventOccurredAt: -1, createdAt: -1 });
    const selected = subscriptions.find(subscriptionGrantsPaidAccess) || subscriptions[0];
    if (selected) await syncUserAccess(selected, user);
}

async function handleCustomerEvent(event) {
    requireMongo();
    const customer = event.data;
    const occurredAt = eventDate(event);
    const user = await findUser({ customData: customer.customData, customerId: customer.id, email: customer.email });
    const result = await upsertLatest(PaddleCustomer, "customerId", customer.id, occurredAt, {
        userId: user ? String(user._id) : null,
        email: String(customer.email || "").trim().toLowerCase(),
        name: customer.name || "",
        status: customer.status || "active",
        paddleCreatedAt: asDate(customer.createdAt),
        paddleUpdatedAt: asDate(customer.updatedAt),
        lastEventId: event.eventId
    });
    if (user) {
        await linkCustomerToUser(customer.id, user);
        await syncBestCustomerSubscription(customer.id, user);
    }
    return result;
}

async function handleSubscriptionEvent(event) {
    requireMongo();
    const subscription = event.data;
    const occurredAt = eventDate(event);
    const firstItem = subscription.items?.[0];
    const priceId = firstItem?.price?.id || "unknown";
    const productId = firstItem?.price?.productId || "unknown";
    const user = await findUser({ customData: subscription.customData, customerId: subscription.customerId });

    await PaddleCustomer.updateOne(
        { customerId: subscription.customerId },
        { $setOnInsert: { customerId: subscription.customerId, email: "" } },
        { upsert: true }
    );

    const result = await upsertLatest(PaddleSubscription, "subscriptionId", subscription.id, occurredAt, {
        customerId: subscription.customerId,
        userId: user ? String(user._id) : null,
        status: subscription.status,
        priceId,
        productId,
        items: (subscription.items || []).map((item) => ({
            quantity: item.quantity,
            priceId: item.price?.id || "",
            productId: item.price?.productId || ""
        })),
        scheduledChangeAction: subscription.scheduledChange?.action || null,
        scheduledChangeAt: asDate(subscription.scheduledChange?.effectiveAt),
        currentBillingPeriodStartsAt: asDate(subscription.currentBillingPeriod?.startsAt),
        currentBillingPeriodEndsAt: asDate(subscription.currentBillingPeriod?.endsAt),
        startedAt: asDate(subscription.startedAt),
        pausedAt: asDate(subscription.pausedAt),
        canceledAt: asDate(subscription.canceledAt),
        nextBilledAt: asDate(subscription.nextBilledAt),
        currencyCode: subscription.currencyCode || "",
        customData: subscription.customData || null,
        paddleCreatedAt: asDate(subscription.createdAt),
        paddleUpdatedAt: asDate(subscription.updatedAt),
        lastEventId: event.eventId
    });

    if (result.applied && result.document && user) {
        await linkCustomerToUser(subscription.customerId, user);
        await syncBestCustomerSubscription(subscription.customerId, user);
    }
    return result;
}

async function handleTransactionCompletedEvent(event) {
    requireMongo();
    const transaction = event.data;
    const occurredAt = eventDate(event);
    const embeddedEmail = transaction.customer?.email || "";
    const user = await findUser({
        customData: transaction.customData,
        customerId: transaction.customerId,
        email: embeddedEmail
    });
    const total = transaction.details?.totals?.total || "";
    const result = await upsertLatest(PaddleTransaction, "transactionId", transaction.id, occurredAt, {
        customerId: transaction.customerId,
        subscriptionId: transaction.subscriptionId,
        userId: user ? String(user._id) : null,
        status: transaction.status,
        currencyCode: transaction.currencyCode || "",
        total: String(total || ""),
        priceIds: (transaction.items || []).map((item) => item.price?.id).filter(Boolean),
        customData: transaction.customData || null,
        paddleCreatedAt: asDate(transaction.createdAt),
        paddleUpdatedAt: asDate(transaction.updatedAt),
        completedAt: occurredAt,
        lastEventId: event.eventId
    });
    if (user && transaction.customerId) {
        await PaddleCustomer.updateOne(
            { customerId: transaction.customerId },
            { $set: { userId: String(user._id), email: String(user.email || embeddedEmail).toLowerCase() }, $setOnInsert: { customerId: transaction.customerId } },
            { upsert: true }
        );
        await linkCustomerToUser(transaction.customerId, user);
        await syncBestCustomerSubscription(transaction.customerId, user);
    }
    return result;
}

module.exports = {
    handleCustomerEvent,
    handleSubscriptionEvent,
    handleTransactionCompletedEvent,
    planIdForPrice,
    upsertLatest
};
