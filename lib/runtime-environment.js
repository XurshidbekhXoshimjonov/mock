const path = require("path");

function runtimeNamespace(env = process.env) {
    const nodeEnvironment = String(env.NODE_ENV || "").trim().toLowerCase();
    if (nodeEnvironment === "production" || nodeEnvironment === "prod") {
        return "production";
    }

    const value = String(
        env.IELTSX_ENV ||
        env.APP_ENV ||
        nodeEnvironment ||
        "production"
    ).trim().toLowerCase();

    if (value === "production" || value === "prod") return "production";
    if (value === "test" || value === "testing") return "test";
    return "local";
}

function resolveRuntimeDataDir(rootDir, env = process.env) {
    const configured = String(env.IELTSX_RUNTIME_DATA_DIR || "").trim();
    return configured
        ? path.resolve(configured)
        : path.join(rootDir, ".runtime-data", runtimeNamespace(env));
}

function resolveMongoDbName(env = process.env) {
    const namespace = runtimeNamespace(env);
    const baseName = String(env.MONGO_DB_NAME || "ieltsmock").trim() || "ieltsmock";

    if (namespace === "production") return baseName;

    const explicitName = namespace === "test"
        ? env.MONGO_TEST_DB_NAME
        : env.MONGO_LOCAL_DB_NAME;

    return String(explicitName || `${baseName}_${namespace}`).trim();
}

module.exports = {
    runtimeNamespace,
    resolveRuntimeDataDir,
    resolveMongoDbName
};
