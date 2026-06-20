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

    async function createUser({ username, name, email, passwordHash, role = "user" }) {
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
                plan: "free",
                isPremium: false,
                premiumUntil: null,
                createdAt: new Date(),
                lastLogin: null
            });
        }

        return localUsers.createUser({ username, name, email, passwordHash, role });
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
        getAllUsers
    };
}

module.exports = {
    createUserStore
};
