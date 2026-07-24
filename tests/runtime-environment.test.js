const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
    runtimeNamespace,
    resolveRuntimeDataDir,
    resolveMongoDbName
} = require("../lib/runtime-environment");

test("localhost uses isolated runtime storage and Mongo database", () => {
    const env = { IELTSX_ENV: "local", MONGO_DB_NAME: "ieltsmock" };

    assert.equal(runtimeNamespace(env), "local");
    assert.equal(resolveMongoDbName(env), "ieltsmock_local");
    assert.equal(
        resolveRuntimeDataDir("D:\\mock", env),
        path.join("D:\\mock", ".runtime-data", "local")
    );
});

test("an unspecified deployment environment fails safe to production", () => {
    assert.equal(runtimeNamespace({}), "production");
    assert.equal(resolveMongoDbName({ MONGO_DB_NAME: "ieltsmock" }), "ieltsmock");
});

test("NODE_ENV production cannot be overridden by a bundled local setting", () => {
    const env = {
        NODE_ENV: "production",
        IELTSX_ENV: "local",
        MONGO_DB_NAME: "ieltsmock"
    };

    assert.equal(runtimeNamespace(env), "production");
    assert.equal(resolveMongoDbName(env), "ieltsmock");
});

test("production keeps the production Mongo database and separate runtime storage", () => {
    const env = { NODE_ENV: "production", MONGO_DB_NAME: "ieltsmock" };

    assert.equal(runtimeNamespace(env), "production");
    assert.equal(resolveMongoDbName(env), "ieltsmock");
    assert.equal(
        resolveRuntimeDataDir("/app", env),
        path.join("/app", ".runtime-data", "production")
    );
});

test("explicit local database and runtime directory overrides are supported", () => {
    const env = {
        IELTSX_ENV: "development",
        MONGO_DB_NAME: "ieltsmock",
        MONGO_LOCAL_DB_NAME: "ieltsx_dev",
        IELTSX_RUNTIME_DATA_DIR: "D:\\ieltsx-runtime"
    };

    assert.equal(resolveMongoDbName(env), "ieltsx_dev");
    assert.equal(resolveRuntimeDataDir("D:\\mock", env), path.resolve("D:\\ieltsx-runtime"));
});
