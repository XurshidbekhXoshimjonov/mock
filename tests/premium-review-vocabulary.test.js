const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const premium = require("../premium-config");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const reviewLock = fs.readFileSync(path.join(__dirname, "..", "review-mistakes-premium-locked.html"), "utf8");
const vocabularyLock = fs.readFileSync(path.join(__dirname, "..", "vocabulary-premium-locked.html"), "utf8");
const premiumRequiredPage = fs.readFileSync(path.join(__dirname, "..", "premium-required-page.js"), "utf8");
const genericPremiumLock = fs.readFileSync(path.join(__dirname, "..", "premium-locked.js"), "utf8");

test("Review Mistakes and Vocabulary are Premium-only subscription features", () => {
    assert.equal(premium.canAccessSubscriptionFeature({ isPremium: false }, "reviewMistakes"), false);
    assert.equal(premium.canAccessSubscriptionFeature({ isPremium: false }, "vocabulary"), false);
    assert.equal(premium.canAccessSubscriptionFeature({ isPremium: true }, "reviewMistakes"), true);
    assert.equal(premium.canAccessSubscriptionFeature({ isPremium: true }, "vocabulary"), true);
    assert.equal(premium.canAccessSubscriptionFeature({ isPremium: true, subscriptionStatus: "cancelled", subscriptionEndsAt: "2999-01-01T00:00:00.000Z" }, "reviewMistakes"), true);
    assert.equal(premium.canAccessSubscriptionFeature({ isPremium: true, subscriptionStatus: "expired" }, "reviewMistakes"), false);
    assert.equal(premium.canAccessSubscriptionFeature({ isPremium: true, premiumExpiresAt: "2020-01-01T00:00:00.000Z" }, "reviewMistakes"), false);
});

test("Review Mistakes and Vocabulary pages require Premium after authentication", () => {
    assert.match(server, /app\.get\("\/review-mistakes", requirePageAuth, requireReviewMistakesPremiumPage/);
    assert.match(server, /app\.get\("\/vocabulary", requirePageAuth, requireVocabularyPremiumPage/);
});

test("Vocabulary uses the reusable Premium Required screen and privileged backend gate", () => {
    assert.match(server, /isAdminUser\(user\) \|\| canAccessSubscriptionFeature\(user, "vocabulary"\)/);
    assert.match(server, /vocabulary-premium-locked\.html/);
    assert.match(vocabularyLock, /PremiumRequiredPage\.render/);
    assert.match(vocabularyLock, /Save unfamiliar words from Reading and Listening/);
    assert.match(vocabularyLock, /Back to Home/);
    assert.match(vocabularyLock, /Premium access • AI-powered vocabulary learning/);
    assert.match(vocabularyLock, /writing-ai-evaluation\.png/);
    ["BookOpenText", "BookmarkPlus", "Languages", "Brain", "ChartNoAxesCombined"].forEach((icon) => {
        assert.match(vocabularyLock + premiumRequiredPage, new RegExp(icon));
    });
    assert.doesNotMatch(vocabularyLock, /\b\d+\s+(?:words?|reviews?|flashcards?)\b/i);
});

test("Generic Premium lock does not leave Vocabulary requests on the mock-test screen", () => {
    assert.match(genericPremiumLock, /requestedType === "vocabulary"/);
    assert.match(genericPremiumLock, /window\.location\.replace\(target\)/);
});

test("Review Mistakes and durable Vocabulary APIs enforce Premium access", () => {
    const reviewRoutes = server.match(/app\.(?:get|post|patch|delete)\("\/api\/review-mistakes[^"]*", requireUser, requireReviewMistakesPremiumApi/g) || [];
    const vocabularyRoutes = server.match(/app\.(?:get|post|patch|delete)\("\/api\/vocabulary(?:\/(?:translate|review\/due|:id(?:\/(?:regenerate|review))?))?", requireUser, requireVocabularyPremiumApi/g) || [];

    assert.equal(reviewRoutes.length, 5);
    assert.equal(vocabularyRoutes.length, 9);
});

test("Review Mistakes uses its dedicated accessible Premium lock screen", () => {
    assert.match(server, /review-mistakes-premium-locked\.html/);
    assert.match(server, /isAdminUser\(user\) \|\| canAccessSubscriptionFeature\(user, "reviewMistakes"\)/);
    assert.match(reviewLock, /Review Mistakes<br>requires Premium/);
    assert.match(reviewLock, /original Reading passage or Listening transcript/);
    assert.match(reviewLock, /Upgrade to Premium to turn every mistake into progress/);
    assert.match(reviewLock, /href="\/premium"/);
    assert.match(reviewLock, /href="\/">Back to Home/);
    assert.match(reviewLock, /Premium access • AI-powered mistake analysis/);
    [
        "review-correct-answers.png",
        "review-source-evidence.png",
        "review-ai-explanations.png",
        "review-track-improvement.png"
    ].forEach((icon) => assert.match(reviewLock, new RegExp(icon.replace(".", "\\."))));
    assert.equal((reviewLock.match(/class="premium-locked-benefit"/g) || []).length, 4);
    assert.doesNotMatch(reviewLock, /\b\d+\s+(?:mistakes?|answers?|attempts?)\b/i);
});
