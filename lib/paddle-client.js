const { Environment, LogLevel, Paddle } = require("@paddle/paddle-node-sdk");

let paddleInstance = null;

function getPaddleEnvironment() {
    const configured = String(process.env.PADDLE_ENV || process.env.NEXT_PUBLIC_PADDLE_ENV || "sandbox")
        .trim()
        .toLowerCase();
    if (!["sandbox", "production"].includes(configured)) {
        throw new Error("PADDLE_ENV must be sandbox or production");
    }
    return configured;
}

function getPaddleInstance() {
    if (paddleInstance) return paddleInstance;
    const apiKey = String(process.env.PADDLE_API_KEY || "").trim();
    if (!apiKey) throw new Error("PADDLE_API_KEY is not set");
    const environment = getPaddleEnvironment();
    if (environment === "sandbox" && !apiKey.startsWith("pdl_sdbx_")) {
        throw new Error("PADDLE_API_KEY must be a Paddle sandbox API key when PADDLE_ENV=sandbox");
    }
    if (environment === "production" && apiKey.startsWith("pdl_sdbx_")) {
        throw new Error("PADDLE_API_KEY must be a live Paddle API key when PADDLE_ENV=production");
    }

    paddleInstance = new Paddle(apiKey, {
        environment: environment === "production" ? Environment.production : Environment.sandbox,
        logLevel: LogLevel.error
    });
    return paddleInstance;
}

module.exports = { getPaddleEnvironment, getPaddleInstance };
