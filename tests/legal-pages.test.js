"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { legalPages } = require("../lib/legal-pages");
const { renderLegalPage } = require("../lib/legal-page-layout");

const root = path.resolve(__dirname, "..");

test("all legal pages render complete indexable documents", () => {
    for (const [slug, page] of Object.entries(legalPages)) {
        const html = renderLegalPage(page);
        assert.match(html, /<!doctype html>/i);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://ieltsx\\.org/${slug}">`));
        assert.match(html, /<meta name="robots" content="index, follow">/);
        assert.match(html, /August 3, 2026/g);
        assert.match(html, /support@ieltsx\.org/);
        assert.match(html, /class="legal-brand__logo"/);
        assert.match(html, /viewBox="0 0 979 324"/);
        assert.match(html, /<img src="\/legal-icons\/left-arrow\.png" alt="" aria-hidden="true">/);
        assert.match(html, />Back to Home<\/span>/);
        assert.match(html, /window\.history\.length > 1/);
        assert.match(html, /window\.history\.back\(\)/);
        assert.match(html, /window\.location\.assign\(document\.referrer\)/);
        assert.doesNotMatch(html, /\b(?:TODO|lorem ipsum)\b/i);
        assert.ok(page.sections.length >= 13, `${slug} needs complete sections`);
    }
});

test("terms use the required pricing and independent-platform language", () => {
    const html = renderLegalPage(legalPages.terms);
    assert.match(html, /These Terms of Service govern your access to and use of IELTSX, including its website, user accounts/);
    assert.match(html, /Contact IELTSX/);
    assert.match(html, /not affiliated with, endorsed by, sponsored by, or operated by the British Council/);
    assert.match(html, /Starter: USD \$5, billed every month/);
    assert.match(html, /Accelerator: USD \$12, billed every three months/);
    assert.match(html, /Mastery: USD \$50, billed every year/);
    assert.match(html, /Subscriptions automatically renew until canceled/);
});

test("privacy uses provider-neutral wording except for Paddle payments", () => {
    const html = renderLegalPage(legalPages.privacy);
    assert.match(html, /This Privacy Policy explains how IELTSX collects, uses, stores, and protects personal information when you use the IELTSX website, accounts/);
    assert.match(html, /trusted service providers/);
    assert.match(html, /Paddle processes payments made through Paddle Checkout/);
    for (const provider of ["Google", "Render", "MongoDB", "OpenAI"]) {
        assert.ok(!html.includes(provider), `privacy unexpectedly names ${provider}`);
    }
});

test("legal content contains no private-identity wording or placeholders", () => {
    const html = Object.values(legalPages).map(renderLegalPage).join("\n");
    for (const fragment of ["sole " + "proprietor", "sole " + "proprietorship", "legal " + "representative", "data " + "controller", "[Legal " + "Name]", "[Owner " + "Name]", "[Address]"]) {
        assert.ok(!html.toLowerCase().includes(fragment.toLowerCase()), `legal pages contain prohibited fragment: ${fragment}`);
    }
});

test("public route registrations return rendered HTML without auth middleware", () => {
    const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
    assert.match(server, /for \(const \[slug, page\] of Object\.entries\(legalPages\)\)/);
    assert.match(server, /app\.get\(`\/\$\{slug\}`,[\s\S]*?res\.status\(200\)\.type\("html"\)/);
    assert.match(server, /app\.get\(`\/\$\{slug\}`,[\s\S]*?Cache-Control", "no-store, no-cache, must-revalidate"/);
    assert.match(server, /app\.get\("\/sitemap\.xml"/);
    for (const route of ["/terms", "/privacy", "/refund-policy"]) assert.ok(server.includes(`"${route}"`));
});

test("site footers and Premium consent expose legal links", () => {
    const pages = ["ieltsmock.html", "reading.html", "reading-tests.html", "listening.html", "listening-tests.html", "mock-tests.html", "premium.html", "profile.html", "speaking.html", "writing.html"];
    for (const file of pages) {
        const html = fs.readFileSync(path.join(root, file), "utf8");
        for (const href of ["/terms", "/privacy", "/refund-policy", "mailto:support@ieltsx.org"]) {
            assert.ok(html.includes(`href="${href}"`), `${file} is missing ${href}`);
        }
    }
    const premium = fs.readFileSync(path.join(root, "premium.js"), "utf8");
    assert.match(premium, /By subscribing, you agree to the/);
    assert.match(premium, /Renews automatically every month/);
    assert.match(premium, /Renews automatically every three months/);
    assert.match(premium, /Renews automatically every year/);
    assert.match(premium, /Cancel before renewal/);
});

test("legal pages share the IELTSX typography system and responsive content width", () => {
    const styles = fs.readFileSync(path.join(root, "legal.css"), "utf8");
    assert.match(styles, /--legal-font: "Plus Jakarta Sans", sans-serif/);
    assert.match(styles, /\.legal-layout \{ width: min\(100%, 820px\); margin: 0 auto;/);
    assert.match(styles, /font-size: clamp\(40px, 5vw, 46px\)/);
    assert.match(styles, /font-size: 16\.5px; font-weight: 400; line-height: 1\.8/);
    assert.match(styles, /@media \(max-width: 420px\)/);
    assert.match(styles, /html\.dark-theme/);
});
