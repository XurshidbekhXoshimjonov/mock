const net = require("node:net");

const PADDLE_IPS_URL = "https://api.paddle.com/ips";
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache = { expiresAt: 0, addresses: new Set() };

function normalizeIp(value) {
    const candidate = String(value || "").trim().replace(/^::ffff:/, "");
    return net.isIP(candidate) ? candidate : "";
}

function requestIp(req) {
    const trustForwarded = String(process.env.TRUST_PROXY_HEADERS || "").trim().toLowerCase() === "true";
    const forwarded = trustForwarded
        ? String(req.get("x-forwarded-for") || "").split(",").map(normalizeIp).find(Boolean)
        : "";
    return forwarded || normalizeIp(req.get("x-real-ip")) || normalizeIp(req.socket?.remoteAddress);
}

async function paddleWebhookAddresses() {
    if (cache.expiresAt > Date.now() && cache.addresses.size) return cache.addresses;
    const response = await fetch(PADDLE_IPS_URL, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Paddle IP list returned HTTP ${response.status}`);
    const payload = await response.json();
    const addresses = new Set((payload?.data?.ipv4_cidrs || [])
        .map((cidr) => String(cidr).replace(/\/32$/, ""))
        .map(normalizeIp)
        .filter(Boolean));
    if (!addresses.size) throw new Error("Paddle IP list was empty");
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, addresses };
    return addresses;
}

async function requirePaddleWebhookIp(req, res, next) {
    const environment = String(process.env.PADDLE_ENV || process.env.NEXT_PUBLIC_PADDLE_ENV || "sandbox").toLowerCase();
    if (environment !== "production") return next();
    try {
        const allowed = await paddleWebhookAddresses();
        if (!allowed.has(requestIp(req))) {
            return res.status(403).json({ error: "Webhook source is not allowlisted" });
        }
        return next();
    } catch (error) {
        console.error("Paddle webhook IP verification failed:", error?.message || error);
        return res.status(503).json({ error: "Webhook source verification unavailable" });
    }
}

module.exports = { normalizeIp, requestIp, paddleWebhookAddresses, requirePaddleWebhookIp };
