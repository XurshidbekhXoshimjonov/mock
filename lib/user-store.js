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
            return User.findById(id).select("username email password role");
        }

        return localUsers.findById(id);
    }

    async function createUser({ username, email, passwordHash, role = "student" }) {
        if (isMongoReady()) {
            return User.create({
                username,
                email: String(email || "").trim().toLowerCase(),
                password: passwordHash,
                role
            });
        }

        return localUsers.createUser({ username, email, passwordHash, role });
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
        countUsers
    };
}

module.exports = {
    createUserStore
};
