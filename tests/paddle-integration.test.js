"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const client = fs.readFileSync(path.join(root, "premium.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const config = require("../premium-config");

test("Premium plans use Paddle pricing instead of hard-coded UZS amounts", () => {
    assert.deepEqual(Object.values(config.premiumPlans).map(({ name, durationDays }) => ({ name, durationDays })), [
        { name: "Starter", durationDays: 30 },
        { name: "Accelerator", durationDays: 90 },
        { name: "Mastery", durationDays: 365 }
    ]);
    assert.doesNotMatch(client, /50,000|120,000|500,000|Subscription active/);
});

test("localized pricing uses Paddle formatted totals without client-side formatting", () => {
    assert.match(client, /paddle\.PricePreview\(params\)/);
    assert.match(client, /currencyCode: "USD"/);
    assert.match(client, /item\.formattedTotals\.total/);
    assert.doesNotMatch(client, /Intl\.NumberFormat/);
});

test("pricing can switch between Paddle USD and configured local-card UZS", () => {
    assert.match(client, /data-currency="USD"/);
    assert.match(client, /data-currency="UZS"/);
    assert.match(client, /ieltsx-pricing-currency/);
    assert.match(client, /paddleConfig\?\.manualPayment\?\.planAmounts/);
    assert.doesNotMatch(client, /DISPLAY CURRENCY|USD via Paddle · UZS via local card/);
    assert.match(client, /id="globalPaymentAmount"/);
    assert.match(client, /id="manualPaymentAmount"/);
    assert.match(client, /\/premium-icons\/currency-earth\.png/);
    assert.match(client, /\/premium-icons\/currency-uzs\.png/);
    assert.equal(fs.existsSync(path.join(root, "premium-icons", "currency-earth.png")), true);
    assert.equal(fs.existsSync(path.join(root, "premium-icons", "currency-uzs.png")), true);
});

test("currency switch aligns to the top-right of the Mastery column while the hero stays centered", () => {
    const styles = fs.readFileSync(path.join(root, "premium.css"), "utf8");
    assert.match(styles, /\.premium-hero \{ position:relative; top:14px; width:100%; max-width:760px; margin:0 auto 12px; text-align:center;/);
    assert.match(client, /<div class="pricing-stage">[\s\S]*currencyToggleMarkup\(\)[\s\S]*<section class="pricing-grid"/);
    assert.match(styles, /\.pricing-stage \{ position:relative; padding-top:54px;/);
    assert.match(styles, /\.pricing-controls \{ position:absolute; top:0; right:0;/);
});

test("checkout opens one sandbox price with the required overlay settings and trusted metadata", () => {
    assert.match(client, /items: \[\{ priceId, quantity: 1 \}\]/);
    assert.match(client, /displayMode: "overlay"/);
    assert.match(client, /variant: "one-page"/);
    assert.match(client, /successUrl: `\$\{window\.location\.origin\}\/welcome`/);
    assert.match(client, /customer: \{ email: loggedInUser\.email \}/);
    assert.match(client, /userId: loggedInUser\.id/);
    assert.match(client, /plan: selectedPlan\.name\.toLowerCase\(\)/);
});

test("plan buttons open a payment-method chooser before Paddle checkout", () => {
    assert.match(client, /Payment Method/);
    assert.match(client, /Global Payment System/);
    assert.doesNotMatch(client, />Payme<|>Uzum</);
    assert.match(client, /data-payment-method="global"/);
    assert.match(client, /data-payment-method="manual"/);
    assert.match(client, /openPaymentMethodModal\(planId\)/);
    assert.match(client, /openPaddleCheckout\(planId\)/);
});

test("credit-card transfer opens the detailed manual payment dialog", () => {
    assert.match(client, /Pay by card, then send the receipt/);
    assert.match(client, /UZCARD \/ HUMO/);
    assert.match(client, /data-copy-card/);
    assert.match(client, /data-copy-payment-details/);
    assert.match(client, /Continue on Telegram/);
    assert.match(client, /openManualPaymentModal\(planId\)/);
    assert.match(server, /MANUAL_PAYMENT_STARTER_UZS/);
    assert.match(server, /MANUAL_PAYMENT_ACCELERATOR_UZS/);
    assert.match(server, /MANUAL_PAYMENT_MASTERY_UZS/);
});

test("server rejects missing or non-sandbox Paddle configuration and validates country headers", () => {
    assert.match(server, /NEXT_PUBLIC_PADDLE_ENV must be sandbox/);
    assert.match(server, /NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is required/);
    assert.match(server, /clientToken\.startsWith\("test_"\)/);
    assert.match(server, /req\.get\("x-vercel-ip-country"\)/);
    assert.match(server, /\^\[A-Z\]\{2\}\$/);
    assert.doesNotMatch(server, /PADDLE_SANDBOX_API_KEY/);
});
