const crypto = require("crypto");

const AUTH_SECRET = process.env.AUTH_SECRET || "ielts-mock-dev-secret";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ADMIN_EMAIL = "hoshimjonov08@gmail.com";

function getUserId(user) {
    return String(user._id || user.id);
}

function createAuthToken(user) {
    const publicProfile = publicUser(user);
    const payload = {
        id: getUserId(user),
        email: publicProfile.email,
        username: publicProfile.username,
        role: publicProfile.role,
        exp: Date.now() + TOKEN_TTL_MS
    };
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
        .createHmac("sha256", AUTH_SECRET)
        .update(data)
        .digest("base64url");

    return `${data}.${signature}`;
}

function verifyAuthToken(token) {
    if (!token || typeof token !== "string") {
        return null;
    }

    const [data, signature] = token.split(".");

    if (!data || !signature) {
        return null;
    }

    const expected = crypto
        .createHmac("sha256", AUTH_SECRET)
        .update(data)
        .digest("base64url");

    if (signature !== expected) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));

        if (!payload.exp || payload.exp < Date.now()) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

function publicUser(user) {
    const email = String(user.email || "").trim().toLowerCase();
    const adminEmails = getAdminEmails();
    const isAdmin = adminEmails.includes(email);

    return {
        id: getUserId(user),
        username: user.username,
        email: user.email,
        role: isAdmin ? "admin" : "student"
    };
}

function getAdminEmails() {
    const configured = String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    return configured.length ? configured : [DEFAULT_ADMIN_EMAIL];
}

function isAdminEmail(email) {
    return getAdminEmails().includes(String(email || "").trim().toLowerCase());
}

module.exports = {
    createAuthToken,
    verifyAuthToken,
    publicUser,
    getAdminEmails,
    isAdminEmail
};
