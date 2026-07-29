const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("mock Listening uses one hidden parent-owned audio element and starts it from the intro click", () => {
    const source = read("mock-test.js");
    const startFlow = source.slice(
        source.indexOf("async function startMockTestFromIntro"),
        source.indexOf("function showFatalError")
    );

    assert.match(source, /document\.createElement\("audio"\)/);
    assert.match(source, /audio\.controls = false/);
    assert.match(source, /className = "mock-listening-audio-internal"/);
    assert.ok(startFlow.indexOf("playMockListeningAudio") < startFlow.indexOf("await enterMockFullscreen"));
    assert.match(source, /Audio could not start automatically\. Click Continue to begin the Listening test\./);
});

test("full audio has priority while part tracks advance, preload, and synchronize parts", () => {
    const source = read("mock-test.js");

    assert.match(source, /const fullAudioUrl = listeningAudioUrl\(test\.fullAudioUrl\)/);
    assert.match(source, /mockListeningAudioMode = "full"/);
    assert.match(source, /mockListeningAudioMode = "parts"/);
    assert.match(source, /audio\.addEventListener\("ended", onEnded\)/);
    assert.match(source, /link\.rel = "preload"/);
    assert.match(source, /type: "ieltsx-mock-listening-audio-part"/);
});

test("mock Listening iframe renders no player and locks separate-audio navigation to the playing part", () => {
    const source = read("listening-test-components.js");

    assert.match(source, /if \(isMockMode\) \{\s*return `<div class="lc-mock-audio-anchor"/);
    assert.match(source, /mockAudioMode === "parts" && !options\.fromAudio/);
    assert.match(source, /type: "ieltsx-mock-listening-stop-audio"/);
    assert.match(source, /showListeningPart\(mockAudioPartNumber, \{ fromAudio: true \}\)/);
});

test("Listening builder and server preserve the optional complete-test audio", () => {
    const server = read("server.js");
    const admin = read("admin-listening.js");

    assert.match(server, /const fullAudioUrl = String\(source\.fullAudioUrl/);
    assert.match(server, /allowMissingAudio: requestedPart === "full" && Boolean\(fullAudioUrl\)/);
    assert.match(server, /audio: fullAudioUrl \|\| savedParts\[0\]\?\.audioUrl/);
    assert.match(admin, /Complete Listening Test Audio/);
    assert.match(admin, /builderState\.fullAudioUrl = result\.audioUrl/);
    assert.match(admin, /takes priority over part tracks/);
});

test("mock Listening audio is cleaned up on submit, exit, section change, and page leave", () => {
    const source = read("mock-test.js");

    assert.match(source, /if \(section !== "listening"\) cleanupMockListeningAudio\(\)/);
    assert.match(source, /if \(section === "listening"\) cleanupMockListeningAudio\(\)/);
    assert.match(source, /window\.addEventListener\("pagehide", cleanupMockListeningAudio\)/);
    assert.match(source, /window\.addEventListener\("beforeunload", cleanupMockListeningAudio\)/);
    assert.match(source, /mockListeningAudio\.removeAttribute\("src"\)/);
});
