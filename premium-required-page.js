(function (root) {
    "use strict";

    const icons = Object.freeze({
        BookOpenText: `
            <path d="M12 7v14"></path>
            <path d="M16 12h2"></path>
            <path d="M16 8h2"></path>
            <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3Z"></path>
            <path d="M21 18a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-5a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3Z"></path>`,
        BookmarkPlus: `
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"></path>
            <path d="M12 7v6"></path>
            <path d="M9 10h6"></path>`,
        Languages: `
            <path d="m5 8 6 6"></path>
            <path d="m4 14 6-6 2-3"></path>
            <path d="M2 5h12"></path>
            <path d="M7 2h1"></path>
            <path d="m22 22-5-10-5 10"></path>
            <path d="M14 18h6"></path>`,
        Brain: `
            <path d="M9.5 4A2.5 2.5 0 0 0 7 6.5v.3A3 3 0 0 0 5.5 12 3 3 0 0 0 7 17.2v.3A2.5 2.5 0 0 0 9.5 20c1 0 1.8-.5 2.5-1.2V5.2C11.3 4.5 10.5 4 9.5 4Z"></path>
            <path d="M14.5 4A2.5 2.5 0 0 1 17 6.5v.3a3 3 0 0 1 1.5 5.2 3 3 0 0 1-1.5 5.2v.3a2.5 2.5 0 0 1-2.5 2.5c-1 0-1.8-.5-2.5-1.2V5.2c.7-.7 1.5-1.2 2.5-1.2Z"></path>
            <path d="M7 9.5h2.5"></path>
            <path d="M14.5 14.5H17"></path>`,
        ChartNoAxesCombined: `
            <path d="M4 18v3"></path>
            <path d="M8 14v7"></path>
            <path d="M12 16v5"></path>
            <path d="M16 12v9"></path>
            <path d="M20 8v13"></path>
            <path d="m2 15 6-6 4 4L22 3"></path>`
        ,CalendarCheck2: `
            <path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path><path d="m9 16 2 2 4-4"></path>`
        ,Target: `
            <circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>`
        ,BrainCircuit: `
            <path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5.24V14a3 3 0 0 0 3 3h2"></path><path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5.24V14a3 3 0 0 1-3 3h-2"></path><path d="M9 8h6"></path><path d="M9 12h6"></path><path d="M12 17v4"></path><path d="M9 21h6"></path>`
        ,CalendarDays: `
            <path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path>`
        ,TrendingUp: `
            <path d="M3 3v18h18"></path><path d="m7 16 4-4 4 4 5-6"></path><path d="M16 10h4v4"></path>`
    });

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function safePath(value, fallback) {
        const path = String(value || "");
        return /^\/(?!\/)[^\s]*$/.test(path) ? path : fallback;
    }

    function icon(name) {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || icons.BookOpenText}</svg>`;
    }

    function featureIcon(feature) {
        const imagePath = safePath(feature?.image, "");
        if (imagePath) {
            const nativeClass = feature?.native ? " premium-locked-benefit-img--native" : "";
            const tintClass = feature?.tint ? " premium-locked-benefit-img--tint" : "";
            return `<img class="premium-locked-benefit-img premium-locked-benefit-img--png${nativeClass}${tintClass}" src="${imagePath}" alt="">`;
        }
        return icon(feature?.icon);
    }

    function render(target, options) {
        if (!target) return;
        const config = options || {};
        const features = Array.isArray(config.features) ? config.features.slice(0, 4) : [];
        const title = escapeHtml(config.title || "");
        const subtitle = escapeHtml(config.subtitle || "");
        const upgradePath = safePath(config.upgradePath, "/premium");
        const backPath = safePath(config.backPath, "/profile");
        const topImage = safePath(config.topImage, "");
        const titleMarkup = subtitle ? `${title}<br>${subtitle}` : title;
        const featureClass = features.length === 4 ? " premium-locked-benefits--four" : "";
        const descriptionMarkup = config.secondaryDescription
            ? `<div class="premium-required-description">
                    <p>${escapeHtml(config.description || "")}</p>
                    <p>${escapeHtml(config.secondaryDescription)}</p>
                </div>`
            : `<p>${escapeHtml(config.description || "")}</p>`;

        target.innerHTML = `
            <section class="premium-locked-card" aria-labelledby="premiumLockedTitle">
                <div class="premium-locked-icon-wrap" aria-hidden="true">
                    <span class="premium-locked-sparkle premium-locked-sparkle--left">
                        <svg viewBox="0 0 24 24" focusable="false"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"></path></svg>
                    </span>
                    <span class="premium-locked-icon">${topImage
                        ? `<img class="premium-locked-top-img" src="${topImage}" alt="">`
                        : icon(config.icon)}</span>
                    <span class="premium-locked-sparkle premium-locked-sparkle--right">
                        <svg viewBox="0 0 24 24" focusable="false"><path d="M12 3l1.5 5.2L19 10l-5.5 1.8L12 17l-1.5-5.2L5 10l5.5-1.8L12 3Z"></path></svg>
                    </span>
                </div>
                <span class="premium-locked-eyebrow">${escapeHtml(config.badge || "PREMIUM REQUIRED")}</span>
                <h1 id="premiumLockedTitle">${titleMarkup}</h1>
                ${descriptionMarkup}
                <div class="premium-locked-benefits${featureClass}" aria-label="${title} Premium benefits">
                    ${features.map((feature) => `
                        <div class="premium-locked-benefit">
                            <span class="premium-locked-benefit-icon" aria-hidden="true">${featureIcon(feature)}</span>
                            <span>${escapeHtml(feature.title)}</span>
                        </div>`).join("")}
                </div>
                <div class="premium-locked-actions">
                    <a class="premium-locked-primary" href="${upgradePath}" aria-label="${escapeHtml(config.upgradeLabel || "Upgrade to Premium")}">
                        ${escapeHtml(config.upgradeLabel || "Upgrade to Premium")} <span aria-hidden="true">→</span>
                    </a>
                    <a class="premium-locked-secondary" href="${backPath}">${escapeHtml(config.backLabel || "Back")}</a>
                </div>
                <p class="premium-locked-note">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 10V8a6 6 0 1 1 12 0v2"></path><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M12 15v2"></path></svg>
                    <span>${escapeHtml(config.footerText || "")}</span>
                </p>
            </section>`;

        target.setAttribute("aria-busy", "false");
    }

    root.PremiumRequiredPage = Object.freeze({ render });
}(window));
