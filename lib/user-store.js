const mongoose = require("mongoose");
const { createLocalUsersStore } = require("./local-users");

function createUserStore({ User, usersFile }) {
    const localUsers = createLocalUsersStore(usersFile);

    function isMongoReady() {
        return mongoose.connection.readyState === 1;
    }

    function getStorageMode() {
        return isMongoReady() ? "mongodb" : "local";
    }

    async function findUserByEmail(email) {
        const normalized = String(email || "").trim().toLowerCase();

        if (isMongoReady()) {
            return User.findOne({ email: normalized });
        }

        return localUsers.findByEmail(normalized);
    }

    async function findUserById(id) {
        if (isMongoReady() && mongoose.Types.ObjectId.isValid(id)) {
            return User.findById(id);
        }

        const localUser = localUsers.findById(id);

        // Existing browser sessions can still contain a legacy local user ID
        // after that account has been migrated to MongoDB. Resolve the
        // canonical MongoDB account by email so Premium and profile state do
        // not fall back to the stale local duplicate.
        if (isMongoReady() && localUser?.email) {
            const mongoUser = await User.findOne({
                email: String(localUser.email).trim().toLowerCase()
            });

            if (mongoUser) return mongoUser;
        }

        return localUser;
    }

    async function findUserByLemonSqueezySubscriptionId(subscriptionId) {
        const normalized = String(subscriptionId || "").trim();
        if (!normalized) return null;
        if (isMongoReady()) {
            return User.findOne({ lemonSqueezySubscriptionId: normalized });
        }
        return localUsers.getAllUsers().find((user) => (
            String(user.lemonSqueezySubscriptionId || "").trim() === normalized
        )) || null;
    }

    async function findUserByWebhookIdentifier(identifier) {
        const normalized = String(identifier || "").trim();
        if (!normalized) return null;

        if (isMongoReady()) {
            if (mongoose.Types.ObjectId.isValid(normalized)) {
                const mongoIdUser = await User.findById(normalized);
                if (mongoIdUser) return mongoIdUser;
            }

            const publicIdQueries = [{ memberId: normalized }];
            if (/^\d+$/.test(normalized)) {
                publicIdQueries.push({ memberIdNumber: Number(normalized) });
            }
            return User.findOne({ $or: publicIdQueries });
        }

        return localUsers.getAllUsers().find((user) => (
            String(user.id || "") === normalized
            || String(user.memberId || "") === normalized
            || (/^\d+$/.test(normalized) && Number(user.memberIdNumber) === Number(normalized))
        )) || null;
    }

    async function getNextTestTakerId() {
        if (isMongoReady()) {
            const highestUser = await User.findOne({ testTakerId: /^[0-9]+$/ }).sort("-testTakerId").select("testTakerId");
            let nextNum = 1;
            if (highestUser && highestUser.testTakerId) {
                const num = parseInt(highestUser.testTakerId, 10);
                if (!isNaN(num)) {
                    nextNum = num + 1;
                }
            }
            return String(nextNum).padStart(3, "0");
        } else {
            const users = localUsers.getAllUsers ? localUsers.getAllUsers() : [];
            let max = 0;
            users.forEach((u) => {
                if (u.testTakerId && /^[0-9]+$/.test(u.testTakerId)) {
                    const num = parseInt(u.testTakerId, 10);
                    if (num > max) max = num;
                }
            });
            return String(max + 1).padStart(3, "0");
        }
    }

    async function getNextMemberId(isAdmin = false) {
        if (isAdmin) {
            return { memberIdNumber: 1, memberId: "001" };
        }
        const highestUser = await User.findOne({}).sort("-memberIdNumber").select("memberIdNumber");
        let nextNum = highestUser && highestUser.memberIdNumber ? highestUser.memberIdNumber + 1 : 2;
        if (nextNum < 2) {
            nextNum = 2;
        }
        return {
            memberIdNumber: nextNum,
            memberId: String(nextNum).padStart(3, "0")
        };
    }

    async function createUser({ username, name, email, passwordHash, role = "user", googleId = null, avatar = "", authProviders = [] }) {
        const testTakerId = await getNextTestTakerId();
        if (isMongoReady()) {
            const isAdmin = role === "admin";
            const { memberIdNumber, memberId } = await getNextMemberId(isAdmin);
            const userDocument = {
                username,
                memberIdNumber,
                memberId,
                name: name || username,
                email: String(email || "").trim().toLowerCase(),
                password: passwordHash,
                role,
                avatar,
                googleId,
                authProviders,
                plan: "free",
                isPremium: false,
                premiumUntil: null,
                createdAt: new Date(),
                lastLogin: null,
                testTakerId
            };

            if (googleId) {
                userDocument.googleId = googleId;
            }

            return User.create(userDocument);
        }

        const newUserLocal = localUsers.createUser({ username, name, email, passwordHash, role, googleId, avatar, authProviders });
        newUserLocal.testTakerId = testTakerId;
        localUsers.updateUser(newUserLocal.id, { testTakerId });
        return newUserLocal;
    }

    async function updateUser(id, updates) {
        if (isMongoReady() && mongoose.Types.ObjectId.isValid(id)) {
            return User.findByIdAndUpdate(id, { $set: updates }, { new: true });
        }

        return localUsers.updateUser(id, updates);
    }

    async function getAllUsers() {
        if (isMongoReady()) {
            return User.find({});
        }

        return localUsers.getAllUsers();
    }

    async function listUsers(options = {}) {
        const page = Math.max(Number(options.page) || 1, 1);
        const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
        const skip = (page - 1) * limit;

        if (isMongoReady()) {
            const query = {};
            if (options.role && options.role !== "all") query.role = options.role;
            const [items, total] = await Promise.all([
                User.find(query)
                    .select("username memberIdNumber memberId name email role plan isPremium premiumActivatedAt premiumExpiresAt premiumCancelledAt premiumUntil subscriptionPlan subscriptionStatus subscriptionStartedAt subscriptionExpiresAt subscriptionRenewsAt subscriptionEndsAt subscriptionAdminNote lemonSqueezySubscriptionId lemonSqueezyCustomerId lemonSqueezyVariantId lemonSqueezyActivatedAt manualPremiumActive manualPremiumPlan manualPremiumStartsAt manualPremiumEndsAt manualPremiumNote createdAt lastLogin")
                    .sort({ memberIdNumber: 1, createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                User.countDocuments(query)
            ]);
            return { items, total, page, limit };
        }

        let users = await localUsers.getAllUsers();
        if (options.role && options.role !== "all") {
            users = users.filter((user) => user.role === options.role);
        }
        users = users.sort((a, b) => (a.memberIdNumber || 99999) - (b.memberIdNumber || 99999));
        return {
            items: users.slice(skip, skip + limit),
            total: users.length,
            page,
            limit
        };
    }

    async function countUsers() {
        if (isMongoReady()) {
            return User.countDocuments();
        }

        return localUsers.countUsers();
    }

    return {
        getStorageMode,
        isMongoReady,
        findUserByEmail,
        findUserById,
        findUserByLemonSqueezySubscriptionId,
        findUserByWebhookIdentifier,
        createUser,
        countUsers,
        updateUser,
        getAllUsers,
        listUsers,
        getNextTestTakerId
    };
}

module.exports = {
    createUserStore
};
