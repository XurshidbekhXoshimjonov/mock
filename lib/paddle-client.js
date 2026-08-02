const { Environment, LogLevel, Paddle } = require("@paddle/paddle-node-sdk");

let paddleInstance = null;

function getPaddleEnvironment() {
    const configured = String(process.env.PADDLE_ENV || process.env.NEXT_PUBLIC_PADDLE_ENV || "sandbox")
        .trim()
        .toLowerCase();
    if (configured !== "sandbox") {
        throw new Error("PADDLE_ENV must be sandbox for this integration");
    }
    return configured;
}

function getPaddleInstance() {
    if (paddleInstance) return paddleInstance;
    const apiKey = String(process.env.PADDLE_API_KEY || "").trim();
    if (!apiKey) throw new Error("PADDLE_API_KEY is not set");
    if (!apiKey.startsWith("pdl_sdbx_")) {
        throw new Error("PADDLE_API_KEY must be a Paddle sandbox API key");
    }

    getPaddleEnvironment();
    paddleInstance = new Paddle(apiKey, {
        environment: Environment.sandbox,
        logLevel: LogLevel.error
    });
    return paddleInstance;
}

module.exports = { getPaddleEnvironment, getPaddleInstance };
