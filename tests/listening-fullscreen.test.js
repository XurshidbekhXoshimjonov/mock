const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const projectRoot = path.join(__dirname, "..");
const templateScript = fs.readFileSync(path.join(projectRoot, "listening-template.js"), "utf8");
const componentsScript = fs.readFileSync(path.join(projectRoot, "listening-test-components.js"), "utf8");
const templateHtml = fs.readFileSync(path.join(projectRoot, "listening-template.html"), "utf8");

test("full Listening tests render and bind the fullscreen control", () => {
    assert.match(componentsScript, /data-fullscreen-toggle/);
    assert.match(templateScript, /function bindListeningFullScreenEvents\(\)/);
    assert.match(templateScript, /bindListeningFullScreenEvents\(\);/);
    assert.match(templateScript, /requestFullscreen/);
    assert.match(templateScript, /fullscreen-fallback/);
    assert.match(templateHtml, /listening-template\.js\?v=20260826-fullscreen-fix-v1/);
});
