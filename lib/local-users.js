const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function createLocalUsersStore(filePath) {
    const usersFile = filePath;

    function ensureFile() {
        const dir = path.dirname(usersFile);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (!fs.existsSync(usersFile)) {
            fs.writeFileSync(usersFile, "[]", "utf8");
        }
    }

    function readUsers() {
        ensureFile();

        try {
            return JSON.parse(fs.readFileSync(usersFile, "utf8"));
        } catch {
            return [];
        }
    }

    function writeUsers(users) {
        ensureFile();
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), "utf8");
    }

    function findByEmail(email) {
        const normalized = String(email || "").trim().toLowerCase();
        return readUsers().find((user) => user.email === normalized) || null;
    }

    function findById(id) {
        return readUsers().find((user) => user.id === id) || null;
    }

    function createUser({ username, email, passwordHash, role = "student" }) {
        const users = readUsers();
        const normalizedEmail = String(email || "").trim().toLowerCase();

        if (users.some((user) => user.email === normalizedEmail)) {
            const error = new Error("This email is already registered");
            error.statusCode = 409;
            throw error;
        }

        const user = {
            id: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
            username: String(username || "").trim(),
            email: normalizedEmail,
            password: passwordHash,
            role,
            createdAt: new Date().toISOString()
        };

        users.push(user);
        writeUsers(users);
        return user;
    }

    function countUsers() {
        return readUsers().length;
    }

    return {
        findByEmail,
        findById,
        createUser,
        countUsers
    };
}

module.exports = {
    createLocalUsersStore
};
