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
            return User.findById(id).select("username memberIdNumber memberId name email password role plan isPremium premiumUntil createdAt lastLogin");
        }

        return localUsers.findById(id);
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
        if (isMongoReady()) {
            const isAdmin = role === "admin";
            const { memberIdNumber, memberId } = await getNextMemberId(isAdmin);
            return User.create({
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
                lastLogin: null
            });
        }

        return localUsers.createUser({ username, name, email, passwordHash, role, googleId, avatar, authProviders });
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
                    .select("username memberIdNumber memberId name email role plan isPremium premiumUntil createdAt lastLogin")
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
        createUser,
        countUsers,
        updateUser,
        getAllUsers,
        listUsers
    };
}

module.exports = {
    createUserStore
};
