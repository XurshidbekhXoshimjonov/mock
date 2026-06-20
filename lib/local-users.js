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

    function getNextMemberId(isAdmin = false) {
        if (isAdmin) {
            return { memberIdNumber: 1, memberId: "001" };
        }
        const users = readUsers();
        let maxNum = 0;
        for (const u of users) {
            if (u.memberIdNumber && u.memberIdNumber > maxNum) {
                maxNum = u.memberIdNumber;
            }
        }
        const nextNum = maxNum < 1 ? 2 : maxNum + 1;
        return {
            memberIdNumber: nextNum,
            memberId: String(nextNum).padStart(3, "0")
        };
    }

    function createUser({ username, name, email, passwordHash, role = "user" }) {
        const users = readUsers();
        const normalizedEmail = String(email || "").trim().toLowerCase();

        if (users.some((user) => user.email === normalizedEmail)) {
            const error = new Error("This email is already registered");
            error.statusCode = 409;
            throw error;
        }

        const isAdmin = role === "admin";
        const { memberIdNumber, memberId } = getNextMemberId(isAdmin);

        const user = {
            id: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
            memberIdNumber,
            memberId,
            username: String(username || "").trim(),
            name: String(name || username || "").trim(),
            email: normalizedEmail,
            password: passwordHash,
            role,
            plan: "free",
            isPremium: false,
            premiumUntil: null,
            createdAt: new Date().toISOString(),
            lastLogin: null
        };

        users.push(user);
        writeUsers(users);
        return user;
    }

    function updateUser(id, updates) {
        const users = readUsers();
        const userIndex = users.findIndex((user) => user.id === id);

        if (userIndex === -1) {
            return null;
        }

        users[userIndex] = { ...users[userIndex], ...updates };
        writeUsers(users);
        return users[userIndex];
    }

    function getAllUsers() {
        return readUsers();
    }

    function countUsers() {
        return readUsers().length;
    }

    return {
        findByEmail,
        findById,
        createUser,
        countUsers,
        updateUser,
        getAllUsers
    };
}

module.exports = {
    createLocalUsersStore
};
