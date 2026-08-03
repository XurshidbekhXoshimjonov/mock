(function () {
    const root = document.getElementById("premiumRoot");
    const premium = window.IELTSXPremium;
    const comparison = premium.subscriptionComparisonRows || [];
    const planIds = ["monthly", "threeMonths", "annual"];
    const planContent = {
        monthly: { name: "Starter", description: "A simple way to begin", duration: "30 days", renewal: "Renews automatically every month" },
        threeMonths: { name: "Accelerator", description: "Build faster IELTS progress", duration: "90 days", renewal: "Renews automatically every three months", badge: "Most Popular" },
        annual: { name: "Mastery", description: "Long-term access for serious preparation", duration: "365 days", renewal: "Renews automatically every year" }
    };

    let loggedInUser = null;
    let currentPlanId = "";
    let selectedPaymentPlanId = "";
    let selectedManualPlanId = "";
    let selectedCurrency = localStorage.getItem("ieltsx-pricing-currency") === "UZS" ? "UZS" : "USD";

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    }

    function currentUser() {
        return window.authClient?.getAuth?.()?.user || window.authClient?.getAuthState?.()?.user || null;
    }

    async function latestCurrentUser() {
        if (!window.authClient?.fetchAuthMe) return currentUser();
        try {
            const result = await window.authClient.fetchAuthMe();
            const user = result?.data?.user || null;
            if (result?.ok && user) {
                window.authClient?.saveAuth?.({ user });
                return user;
            }
        } catch {
            // The authenticated page route will send signed-out visitors to login.
        }
        return currentUser();
    }

    function formatCardNumber(value) {
        return String(value || "").replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
    }

    async function copyText(value) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return;
        }
        const textArea = document.createElement("textarea");
        textArea.value = value;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
    }

    function activePlanId(user) {
        if (!premium.hasPremiumAccess?.(user)) return "";
        const planId = String(premium.inferSubscriptionPlanId?.(user) || user?.subscriptionPlan || "").trim();
        return premium.premiumPlans?.[planId] ? planId : "";
    }

    function loginForPlan(planId) {
        const redirect = encodeURIComponent(`/premium?plan=${encodeURIComponent(planId)}`);
        window.location.href = `/login?redirect=${redirect}`;
    }

    function formatManualPrice(amount) {
        return `${Number(amount || 0).toLocaleString("en-US")} UZS`;
    }

    function displayedPlanPrice(planId) {
        if (selectedCurrency === "UZS") {
            return formatManualPrice(premium.manualPaymentConfig?.planAmounts?.[planId]);
        }
        return premium.checkoutPrices?.[planId] || "USD";
    }

    function currencyToggleMarkup() {
        return `<div class="pricing-controls">
            <div class="currency-switch" role="group" aria-label="Display currency">
                <button type="button" data-currency="USD" aria-pressed="${selectedCurrency === "USD"}"><img src="/premium-icons/currency-earth.png" alt="" aria-hidden="true"> USD</button>
                <button type="button" data-currency="UZS" aria-pressed="${selectedCurrency === "UZS"}"><img src="/premium-icons/currency-uzs.png" alt="" aria-hidden="true"> UZS</button>
            </div>
        </div>`;
    }

    function buttonLabel(planId) {
        const name = planContent[planId].name;
        if (!currentPlanId) return `Choose ${name}`;
        if (currentPlanId === planId) return "Your plan";
        const currentRank = premium.premiumPlans[currentPlanId]?.rank ?? 0;
        const selectedRank = premium.premiumPlans[planId]?.rank ?? 0;
        return selectedRank > currentRank ? `Upgrade to ${name}` : `Switch to ${name}`;
    }

    function pricingCard(plan) {
        const display = planContent[plan.id];
        const isCurrentPlan = currentPlanId === plan.id;
        const formattedPrice = displayedPlanPrice(plan.id);
        return `<article class="pricing-card${plan.bestValue ? " pricing-card--featured" : ""}${isCurrentPlan ? " pricing-card--current" : ""}" ${isCurrentPlan ? 'aria-current="true"' : ""}>
            ${display.badge ? `<span class="pricing-card__best">${escapeHtml(display.badge)}</span>` : ""}
            ${isCurrentPlan ? '<span class="pricing-card__current">YOUR PLAN</span>' : ""}
            <div class="pricing-card__head"><h2>${escapeHtml(display.name)}</h2><p>${escapeHtml(display.duration)}</p></div>
            <div class="pricing-card__price"><strong>${escapeHtml(formattedPrice)}</strong><span>${escapeHtml(display.description)} · ${selectedCurrency}</span><small>${escapeHtml(display.renewal)} · Cancel before renewal</small></div>
            <ul>${premium.premiumFeatures.map((feature) => `<li><span aria-hidden="true">✓</span>${escapeHtml(feature)}</li>`).join("")}</ul>
            <button class="premium-button${isCurrentPlan ? " premium-button--current" : ""}" type="button" data-plan="${escapeHtml(plan.id)}" ${isCurrentPlan ? "disabled" : ""}>${escapeHtml(buttonLabel(plan.id))}</button>
            <p class="pricing-card__consent">By subscribing, you agree to the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</p>
        </article>`;
    }

    function comparisonIcon(isAvailable) {
        return `<span class="${isAvailable ? "comparison-check" : "comparison-minus"}" aria-hidden="true">${isAvailable ? "✓" : "−"}</span>`;
    }

    function comparisonCell(label, isAvailable) {
        return `${comparisonIcon(isAvailable)}${escapeHtml(label)}`;
    }

    function closeIcon() {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
    }

    function globalPaymentIcon() {
        return `<span class="payment-method__global-mark"><img src="/premium-icons/currency-earth.png" alt="" aria-hidden="true"><strong>GLOBAL</strong></span>`;
    }

    function cardTransferIcon() {
        return `<span class="payment-method__card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="5" width="18" height="14" rx="2.5"></rect><path d="M3 10h18M7 15h4"></path></svg></span>`;
    }

    function paymentMethodModalMarkup() {
        return `<div class="premium-modal payment-method-modal" id="paymentMethodModal" hidden>
            <div class="premium-modal__backdrop" data-close-payment-method></div>
            <section class="payment-method__dialog" role="dialog" aria-modal="true" aria-labelledby="paymentMethodTitle">
                <button class="premium-modal__close" type="button" data-close-payment-method aria-label="Close payment methods">${closeIcon()}</button>
                <span class="premium-eyebrow">SELECT PAYMENT</span>
                <h2 id="paymentMethodTitle">Payment Method</h2>
                <p class="payment-method__intro">Choose how you would like to pay for <strong id="paymentMethodPlanName">your plan</strong>.</p>
                <div class="payment-method__options">
                    <a class="payment-method__option payment-method__option--global" id="globalPaymentLink" href="" data-payment-method="global">
                        <span class="payment-method__copy"><strong>Global Payment System</strong><span>Pay securely with an international card via Visa/Mastercard</span><small><span aria-hidden="true">⚡</span> Secure checkout · <b id="globalPaymentAmount"></b></small></span>
                        ${globalPaymentIcon()}
                    </a>
                    <button class="payment-method__option" type="button" data-payment-method="manual">
                        <span class="payment-method__copy"><strong>Transfer to Credit Card</strong><span>Transfer directly to the local card and send the receipt via Telegram</span><small class="payment-method__manual"><span aria-hidden="true">↗</span> Manual activation · <b id="manualPaymentAmount"></b></small></span>
                        ${cardTransferIcon()}
                    </button>
                </div>
            </section>
        </div>`;
    }

    function manualPaymentModalMarkup() {
        return `<div class="premium-modal manual-payment" id="manualPaymentModal" hidden>
            <div class="premium-modal__backdrop manual-payment__backdrop" data-close-manual-payment></div>
            <section class="manual-payment__dialog" role="dialog" aria-modal="true" aria-labelledby="manualPaymentTitle">
                <button class="premium-modal__close" type="button" data-close-manual-payment aria-label="Close manual payment">${closeIcon()}</button>
                <span class="premium-eyebrow">PAY WITH A LOCAL CARD</span>
                <h2 id="manualPaymentTitle">Pay by card, then send the receipt</h2>
                <p class="manual-payment__description">Pay the amount below to the local UZCARD / HUMO card, then send the payment receipt to IELTSX Support on Telegram. Your Premium plan will be activated manually after payment verification.</p>
                <div class="manual-payment__selected">
                    <div><strong id="manualPaymentPlanName"></strong><span id="manualPaymentPlanDuration"></span></div>
                    <strong id="manualPaymentPlanPrice"></strong>
                </div>
                <div class="manual-payment__card">
                    <div class="manual-payment__card-row"><span>Card type</span><strong id="manualPaymentCardType"></strong></div>
                    <div class="manual-payment__card-row"><span>Card number</span><button class="manual-payment__copy-card" type="button" data-copy-card><strong id="manualPaymentCardNumber"></strong><span>Copy</span></button></div>
                    <div class="manual-payment__summary"><span id="manualPaymentSummaryPlan"></span><strong id="manualPaymentSummaryPrice"></strong></div>
                </div>
                <ol class="manual-payment__steps">
                    <li>Transfer the exact amount to the card.</li>
                    <li>Save the payment receipt or screenshot.</li>
                    <li>Send the receipt to IELTSX Support on Telegram.</li>
                    <li>Premium will be activated after payment verification.</li>
                </ol>
                <p class="manual-payment__manual-note">Payment verification is performed manually.</p>
                <p class="manual-payment__status" id="manualPaymentStatus" hidden aria-live="polite"></p>
                <div class="manual-payment__actions">
                    <a class="premium-button manual-payment__telegram" id="manualPaymentTelegramLink" href="https://t.me/ieltsxuz_admin" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">➤</span><span>Continue on Telegram</span></a>
                    <button class="manual-payment__secondary" type="button" data-copy-payment-details>Copy payment details</button>
                </div>
            </section>
        </div>`;
    }

    function openPaymentMethodModal(planId) {
        selectedPaymentPlanId = planId;
        const modal = document.getElementById("paymentMethodModal");
        const planName = document.getElementById("paymentMethodPlanName");
        if (!modal || !planName) return;
        planName.textContent = planContent[planId].name;
        const globalAmount = document.getElementById("globalPaymentAmount");
        const manualAmount = document.getElementById("manualPaymentAmount");
        const globalPaymentLink = document.getElementById("globalPaymentLink");
        if (globalAmount) globalAmount.textContent = premium.checkoutPrices?.[planId] || "USD";
        if (manualAmount) manualAmount.textContent = formatManualPrice(premium.manualPaymentConfig?.planAmounts?.[planId]);
        if (globalPaymentLink instanceof HTMLAnchorElement) globalPaymentLink.href = premium.checkoutUrls?.[planId] || "/premium";
        modal.hidden = false;
        document.body.classList.add("premium-modal-open");
        window.requestAnimationFrame(() => {
            modal.classList.add("is-visible");
            const firstPaymentMethod = modal.querySelector("[data-payment-method]");
            if (firstPaymentMethod instanceof HTMLElement) firstPaymentMethod.focus();
        });
    }

    function closePaymentMethodModal() {
        const modal = document.getElementById("paymentMethodModal");
        if (!modal || modal.hidden) return;
        modal.classList.remove("is-visible");
        document.body.classList.remove("premium-modal-open");
        window.setTimeout(() => {
            modal.hidden = true;
            selectedPaymentPlanId = "";
        }, 160);
    }

    function manualPaymentDetails(planId) {
        const display = planContent[planId];
        const manual = premium.manualPaymentConfig;
        const price = formatManualPrice(manual.planAmounts[planId]);
        return [
            "Hello IELTSX Support, I paid for IELTSX Premium.",
            "",
            `Plan: ${display.name}`,
            `Price: ${price}`,
            `Account email: ${loggedInUser?.email || "Not available"}`,
            `Account ID: ${loggedInUser?.id || "Not available"}`,
            "",
            "I will send the payment receipt below."
        ].join("\n");
    }

    function setManualPaymentStatus(message) {
        const status = document.getElementById("manualPaymentStatus");
        if (!status) return;
        status.hidden = !message;
        status.textContent = message;
        status.className = "manual-payment__status manual-payment__status--success";
    }

    function openManualPaymentModal(planId) {
        const modal = document.getElementById("manualPaymentModal");
        const manual = premium.manualPaymentConfig;
        if (!modal || !manual) return;
        selectedManualPlanId = planId;
        const display = planContent[planId];
        const price = formatManualPrice(manual.planAmounts[planId]);
        document.getElementById("manualPaymentPlanName").textContent = display.name;
        document.getElementById("manualPaymentPlanDuration").textContent = display.duration;
        document.getElementById("manualPaymentPlanPrice").textContent = price;
        document.getElementById("manualPaymentSummaryPlan").textContent = display.name;
        document.getElementById("manualPaymentSummaryPrice").textContent = price;
        document.getElementById("manualPaymentCardType").textContent = manual.cardType;
        document.getElementById("manualPaymentCardNumber").textContent = formatCardNumber(manual.cardNumber);
        const telegramLink = document.getElementById("manualPaymentTelegramLink");
        if (telegramLink instanceof HTMLAnchorElement) telegramLink.href = `https://t.me/${manual.telegramUsername}`;
        setManualPaymentStatus("");
        modal.hidden = false;
        document.body.classList.add("premium-modal-open");
        window.requestAnimationFrame(() => modal.classList.add("is-visible"));
    }

    function closeManualPaymentModal() {
        const modal = document.getElementById("manualPaymentModal");
        if (!modal || modal.hidden) return;
        modal.classList.remove("is-visible");
        document.body.classList.remove("premium-modal-open");
        window.setTimeout(() => {
            modal.hidden = true;
            selectedManualPlanId = "";
            setManualPaymentStatus("");
        }, 160);
    }

    function render() {
        root.innerHTML = `
            <section class="premium-hero"><span class="premium-eyebrow">IELTSX PREMIUM</span><h1>Go Premium</h1><h2>Unlimited practice. Stronger results.</h2><p>Get full, unrestricted access to every IELTSX Premium feature.</p></section>
            <div class="pricing-stage">
                ${currencyToggleMarkup()}
                <section class="pricing-grid" aria-label="Premium pricing plans">${planIds.map((planId) => pricingCard(premium.premiumPlans[planId])).join("")}</section>
            </div>
            <section class="comparison-section"><div class="section-heading"><span>PLAN COMPARISON</span><h2>Free and Premium features</h2></div>
                <div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th>Feature</th><th>Free</th><th>Premium</th></tr></thead><tbody>${comparison.map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${comparisonCell(row.free, row.freeAvailable)}</td><td>${comparisonCell(row.premium, row.premiumAvailable)}</td></tr>`).join("")}</tbody></table></div>
                <div class="comparison-cards">${comparison.map((row) => `<article><h3>${escapeHtml(row.label)}</h3><p class="${row.freeAvailable ? "is-available" : ""}"><strong>Free</strong>${comparisonCell(row.free, row.freeAvailable)}</p><p class="is-premium"><strong>Premium</strong>${comparisonCell(row.premium, row.premiumAvailable)}</p></article>`).join("")}</div>
            </section>
            ${paymentMethodModalMarkup()}
            ${manualPaymentModalMarkup()}`;
    }

    async function choosePlan(planId) {
        const selectedPlan = premium.premiumPlans[planId];
        if (!selectedPlan || currentPlanId === planId) return;
        loggedInUser = await latestCurrentUser();
        if (!loggedInUser) {
            loginForPlan(planId);
            return;
        }
        openPaymentMethodModal(planId);
    }

    async function init() {
        root.addEventListener("click", (event) => {
            if (!(event.target instanceof Element)) return;
            const currencyButton = event.target.closest("[data-currency]");
            if (currencyButton instanceof HTMLButtonElement) {
                selectedCurrency = currencyButton.dataset.currency === "UZS" ? "UZS" : "USD";
                localStorage.setItem("ieltsx-pricing-currency", selectedCurrency);
                render();
                return;
            }
            const button = event.target.closest("[data-plan]");
            if (button instanceof HTMLButtonElement && !button.disabled) {
                choosePlan(button.dataset.plan).catch(() => {});
                return;
            }

            if (event.target.closest("[data-close-payment-method]")) {
                closePaymentMethodModal();
                return;
            }

            if (event.target.closest("[data-close-manual-payment]")) {
                closeManualPaymentModal();
                return;
            }

            if (event.target.closest("[data-copy-card]")) {
                copyText(premium.manualPaymentConfig.cardNumber).then(() => setManualPaymentStatus("Card number copied."));
                return;
            }

            if (event.target.closest("[data-copy-payment-details]") && selectedManualPlanId) {
                copyText(manualPaymentDetails(selectedManualPlanId)).then(() => setManualPaymentStatus("Payment details copied."));
                return;
            }

            const paymentMethod = event.target.closest('[data-payment-method="manual"]');
            if (!(paymentMethod instanceof HTMLButtonElement) || !selectedPaymentPlanId) return;
            const planId = selectedPaymentPlanId;
            closePaymentMethodModal();
            window.setTimeout(() => openManualPaymentModal(planId), 170);
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closePaymentMethodModal();
                closeManualPaymentModal();
            }
        });

        loggedInUser = await latestCurrentUser();
        currentPlanId = activePlanId(loggedInUser);
        render();

        const requestedPlanId = new URLSearchParams(window.location.search).get("plan");
        if (requestedPlanId && planIds.includes(requestedPlanId) && loggedInUser && currentPlanId !== requestedPlanId) {
            choosePlan(requestedPlanId).catch(() => {});
        }
    }

    init();
}());
