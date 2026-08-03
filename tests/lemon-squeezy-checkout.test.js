"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const client = fs.readFileSync(path.join(root, "premium.js"), "utf8");
const config = require("../premium-config");

test("Global Payment uses the selected plan's centralized Lemon Squeezy checkout URL", () => {
    assert.deepEqual(config.checkoutUrls, {
        monthly: "https://ieltsxorg.lemonsqueezy.com/checkout/buy/a36fb9e7-a6f4-42de-af5c-d58fbd9a7131",
        threeMonths: "https://ieltsxorg.lemonsqueezy.com/checkout/buy/f58d698f-65ad-4b35-98c8-6d2730e0f4a5",
        annual: "https://ieltsxorg.lemonsqueezy.com/checkout/buy/fd29752d-b721-469b-94ff-790de892757a"
    });
    assert.deepEqual(config.checkoutPrices, { monthly: "$5.99", threeMonths: "$15", annual: "$59.99" });
    assert.match(client, /<a class="payment-method__option payment-method__option--global" id="globalPaymentLink" href=""/);
    assert.match(client, /const userId = String\(user\?\._id \|\| user\?\.id \|\| user\?\.userId/);
    assert.match(client, /const checkoutUrl = identifiedCheckoutUrl\(planId, loggedInUser\)/);
    assert.match(client, /loggedInUser = await authenticatedCheckoutUser\(\)/);
    assert.match(client, /window\.location\.href = checkoutUrl/);
    assert.match(client, /event\.preventDefault\(\)/);
    assert.match(client, /url\.searchParams\.set\("checkout\[email\]"/);
    assert.match(client, /url\.searchParams\.set\("checkout\[custom\]\[user_id\]"/);
    assert.match(client, /url\.searchParams\.set\("checkout\[custom\]\[plan\]"/);
    assert.match(client, /threeMonths: "three_months"/);
    assert.match(client, /annual: "yearly"/);
    assert.match(client, /Pay securely with an international card via Visa\/Mastercard/);
    assert.doesNotMatch(client, /via Lemon Squeezy/);
});
