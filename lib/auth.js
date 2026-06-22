const crypto = require("crypto");

const AUTH_SECRET = process.env.AUTH_SECRET || "ielts-mock-dev-secret";
const JWT_SECRET = process.env.JWT_SECRET || AUTH_SECRET;
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

    // Create standard 3-part HS256 JWT
    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
        .createHmac("sha256", JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest("base64url");

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyAuthToken(token) {
    if (!token || typeof token !== "string") {
        return null;
    }

    const parts = token.split(".");
    if (parts.length === 3) {
        // Standard JWT verification
        const [header, payload, signature] = parts;
        const expectedSignature = crypto
            .createHmac("sha256", JWT_SECRET)
            .update(`${header}.${payload}`)
            .digest("base64url");

        if (signature !== expectedSignature) {
            // Check fallback to legacy secret if JWT_SECRET differs
            if (process.env.AUTH_SECRET && JWT_SECRET !== process.env.AUTH_SECRET) {
                const expectedSignatureLegacy = crypto
                    .createHmac("sha256", process.env.AUTH_SECRET)
                    .update(`${header}.${payload}`)
                    .digest("base64url");
                if (signature !== expectedSignatureLegacy) return null;
            } else {
                return null;
            }
        }

        try {
            const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
            if (!decoded.exp || decoded.exp < Date.now()) {
                return null;
            }
            return decoded;
        } catch {
            return null;
        }
    } else if (parts.length === 2) {
        // Legacy 2-part token verification
        const [data, signature] = parts;
        const secret = process.env.AUTH_SECRET || "ielts-mock-dev-secret";
        const expected = crypto
            .createHmac("sha256", secret)
            .update(data)
            .digest("base64url");

        if (signature !== expected) {
            if (JWT_SECRET !== secret) {
                const expectedJwtSec = crypto
                    .createHmac("sha256", JWT_SECRET)
                    .update(data)
                    .digest("base64url");
                if (signature !== expectedJwtSec) return null;
            } else {
                return null;
            }
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

    return null;
}

function publicUser(user) {
    const email = String(user.email || "").trim().toLowerCase();
    const adminEmails = getAdminEmails();
    const isAdmin = adminEmails.includes(email);
    const memberIdNumber = user.memberIdNumber || (isAdmin ? 1 : null);
    const memberId = user.memberId || (memberIdNumber ? String(memberIdNumber).padStart(3, "0") : null);

    return {
        id: getUserId(user),
        memberIdNumber,
        memberId,
        username: user.username,
        name: user.name || user.username || "",
        email: user.email,
        avatar: user.avatar || "",
        googleId: user.googleId || null,
        role: isAdmin ? "admin" : (user.role === "student" ? "user" : (user.role || "user")),
        plan: user.plan || "free",
        isPremium: !!user.isPremium,
        premiumUntil: user.premiumUntil || null,
        createdAt: user.createdAt || null,
        lastLogin: user.lastLogin || null
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
