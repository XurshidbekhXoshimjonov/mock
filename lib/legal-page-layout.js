"use strict";

const SITE_URL = "https://ieltsx.org";

function renderSiteLogo() {
    return `<svg class="legal-brand__logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 979 324" role="img" aria-label="ieltsx.org logo"><path d="M 818 194 L 816 196 L 816 200 L 821 203 L 825 200 L 824 195 Z M 887 157 L 887 202 L 897 202 L 897 191 L 899 189 L 905 189 L 909 193 L 914 202 L 924 202 L 924 200 L 917 190 L 917 188 L 923 182 L 925 177 L 925 170 L 922 163 L 914 158 L 909 157 Z M 897 167 L 899 165 L 909 165 L 914 169 L 915 176 L 910 181 L 897 180 Z M 948 157 L 941 160 L 933 170 L 931 178 L 933 190 L 938 197 L 950 203 L 960 203 L 971 199 L 972 180 L 963 180 L 963 192 L 961 194 L 955 195 L 949 193 L 944 189 L 942 185 L 942 174 L 949 166 L 959 165 L 968 169 L 972 165 L 972 163 L 969 160 L 958 156 Z M 843 159 L 835 166 L 831 177 L 831 184 L 835 194 L 842 200 L 850 203 L 859 203 L 866 201 L 873 196 L 878 186 L 878 173 L 875 167 L 871 162 L 861 157 L 855 156 Z M 851 165 L 861 166 L 868 175 L 867 187 L 863 192 L 857 195 L 848 193 L 844 189 L 841 182 L 843 172 Z M 698 157 L 734 202 L 806 202 L 736 118 L 725 126 L 711 140 Z M 296 49 L 296 83 L 335 84 L 335 204 L 373 204 L 374 83 L 406 82 L 412 83 L 413 49 Z M 207 49 L 207 204 L 309 204 L 309 171 L 245 170 L 245 49 Z M 71 49 L 71 204 L 186 204 L 185 171 L 108 170 L 109 143 L 169 142 L 169 110 L 108 108 L 108 84 L 110 82 L 184 82 L 184 49 Z M 6 49 L 6 204 L 44 204 L 44 49 Z M 476 46 L 458 51 L 450 55 L 442 61 L 436 68 L 431 77 L 428 90 L 430 108 L 436 120 L 449 131 L 472 140 L 492 145 L 502 150 L 507 156 L 508 159 L 507 165 L 503 170 L 496 173 L 476 174 L 459 170 L 440 160 L 424 187 L 434 195 L 446 201 L 458 205 L 479 208 L 499 207 L 514 203 L 524 198 L 534 190 L 539 183 L 544 171 L 545 164 L 544 148 L 536 132 L 527 124 L 509 115 L 489 110 L 471 103 L 466 97 L 466 90 L 467 87 L 471 83 L 480 79 L 502 80 L 514 84 L 524 90 L 527 89 L 540 62 L 533 57 L 515 49 L 501 46 Z M 727 97 L 719 89 L 713 89 L 710 87 L 649 21 L 566 20 L 573 28 L 650 99 L 654 99 L 662 102 L 668 106 L 673 112 L 652 127 L 630 146 L 564 211 L 523 248 L 476 285 L 426 318 L 461 306 L 508 284 L 547 262 L 593 231 L 624 207 L 641 192 L 676 157 Z M 846 9 L 844 7 L 839 6 L 824 9 L 816 13 L 798 28 L 756 28 L 743 38 L 769 45 L 773 48 L 752 66 L 724 66 L 718 71 L 719 73 L 730 79 L 742 88 L 771 75 L 784 65 L 792 61 L 795 66 L 796 74 L 801 90 L 811 83 L 811 75 L 815 55 L 816 42 L 840 22 L 846 13 Z" fill="#000000" fill-rule="evenodd"/></svg>`;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

function renderBlock(block) {
    if (typeof block === "string") return `<p>${block}</p>`;
    if (block.type === "html") return block.html;
    if (block.type === "notice") return `<aside class="legal-notice">${block.html}</aside>`;
    if (block.type === "list") return `<ul>${block.items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
    return "";
}

function renderLegalPage(page) {
    const canonical = `${SITE_URL}/${page.slug}`;
    const navigation = page.sections.map((section, index) =>
        `<a href="#section-${index + 1}"><span>${index + 1}</span>${escapeHtml(section.title)}</a>`
    ).join("");
    const content = page.sections.map((section, index) => `
        <section class="legal-section" id="section-${index + 1}">
            <h2>${index + 1}. ${escapeHtml(section.title)}</h2>
            ${section.blocks.map(renderBlock).join("\n")}
        </section>`).join("\n");

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(page.title)} | IELTSX</title>
    <meta name="description" content="${escapeHtml(page.description)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonical}">
    <script>if (localStorage.getItem("ielts-theme") === "dark") document.documentElement.classList.add("dark-theme");</script>
    <link rel="stylesheet" href="/legal.css?v=20260803-typography-v9">
</head>
<body>
    <header class="legal-header">
        <a class="legal-brand" href="/" aria-label="IELTSX home">${renderSiteLogo()}</a>
        <a class="legal-back" href="/"><span class="legal-back__icon"><img src="/legal-icons/left-arrow.png" alt="" aria-hidden="true"></span><span>Back to Home</span></a>
    </header>
    <main class="legal-shell">
        <header class="legal-hero">
            <p class="legal-eyebrow">IELTSX LEGAL</p>
            <h1>${escapeHtml(page.title)}</h1>
            <p>${escapeHtml(page.description)}</p>
            <dl><div><dt>Effective</dt><dd>August 3, 2026</dd></div><div><dt>Last updated</dt><dd>August 3, 2026</dd></div></dl>
        </header>
        <div class="legal-layout">
            <aside class="legal-toc" aria-label="On this page"><strong>On this page</strong><nav>${navigation}</nav></aside>
            <article class="legal-content">${content}</article>
        </div>
    </main>
    <footer class="legal-footer">
        <div><a class="legal-brand" href="/" aria-label="IELTSX home">${renderSiteLogo()}</a><p>Independent IELTS preparation for focused learners.</p></div>
        <nav aria-label="Legal"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a><a href="/refund-policy">Refund Policy</a><a href="mailto:support@ieltsx.org">Contact Support</a></nav>
        <p>© 2026 ieltsx.org. All rights reserved.</p>
    </footer>
    <script>
        document.querySelector(".legal-back")?.addEventListener("click", function (event) {
            if (window.history.length > 1) {
                event.preventDefault();
                window.history.back();
                return;
            }

            if (document.referrer) {
                event.preventDefault();
                window.location.assign(document.referrer);
            }
        });
    </script>
</body>
</html>`;
}

module.exports = { renderLegalPage };
