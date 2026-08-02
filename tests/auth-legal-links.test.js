const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const loginHtml = fs.readFileSync(path.join(root, "login.html"), "utf8");
const signupHtml = fs.readFileSync(path.join(root, "signup.html"), "utf8");
const signupJs = fs.readFileSync(path.join(root, "signup.js"), "utf8");

test("login includes public legal links without a consent checkbox", () => {
    assert.match(loginHtml, /By continuing, you agree to the IELTSX/);
    assert.match(loginHtml, /href="\/terms">Terms of Service<\/a>/);
    assert.match(loginHtml, /href="\/privacy">Privacy Policy<\/a>/);
    assert.doesNotMatch(loginHtml, /id="legalAcceptance"/);
    assert.doesNotMatch(loginHtml, /target=/);
});

test("signup includes required legal consent without duplicate supporting copy", () => {
    assert.doesNotMatch(signupHtml, /By creating an account, you agree to the IELTSX/);
    assert.match(signupHtml, /type="checkbox" id="legalAcceptance" required/);
    assert.match(signupHtml, /id="signupBtn" disabled>Create Account<\/button>/);
    assert.match(signupHtml, /I agree to the <a href="\/terms">Terms of Service<\/a>/);
    assert.match(signupHtml, /href="\/privacy">Privacy Policy<\/a>/);
    assert.doesNotMatch(signupHtml, /target=/);
});

test("signup client gates account creation on legal acceptance", () => {
    assert.match(signupJs, /signupBtn\.disabled = !legalAcceptance\.checked/);
    assert.match(signupJs, /if \(!legalAcceptance\.checked\) \{/);
    assert.match(signupJs, /showLegalAcceptanceError\(\)/);
    assert.match(signupJs, /legalAcceptance\.focus\(\)/);
});
