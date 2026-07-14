(function () {
    const root = document.getElementById("premiumRoot");
    const premium = window.IELTSXPremium;
    const manualPaymentConfig = premium.manualPaymentConfig;
    const comparison = premium.subscriptionComparisonRows || [];
    let manualModal = null;

    function escapeHtml(value) {
        return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    }

    const planDisplayContent = {
        monthly: {
            name: "Starter",
            description: "A simple way to begin",
            duration: "30 days",
            badge: null,
            buttonLabel: "Choose Starter"
        },
        threeMonths: {
            name: "Accelerator",
            description: "Build faster IELTS progress",
            duration: "90 days",
            badge: "Most Popular",
            buttonLabel: "Choose Accelerator"
        },
        annual: {
            name: "Mastery",
            description: "Long-term access for serious preparation",
            duration: "365 days",
            badge: "Best Value",
            buttonLabel: "Choose Mastery"
        }
    };

    function planDisplay(plan) {
        const display = planDisplayContent[plan?.id] || {};
        return {
            name: display.name || plan?.name || "",
            description: display.description || plan?.billing || "",
            duration: display.duration || `${plan?.durationDays || ""} days`.trim(),
            badge: display.badge || null,
            buttonLabel: display.buttonLabel || "Select Plan"
        };
    }

    function authToken() {
        return window.authClient?.getAuth?.()?.token || "";
    }

    function currentUser() {
        return window.authClient?.getAuth?.()?.user || window.authClient?.getAuthState?.()?.user || null;
    }

    async function latestCurrentUser() {
        const auth = window.authClient?.getAuth?.();
        if (!window.authClient?.fetchAuthMe) return null;
        try {
            const result = await window.authClient.fetchAuthMe();
            const user = result?.data?.user || null;
            if (result?.ok && user) {
                if (auth?.token) {
                    window.authClient?.saveAuth?.({ token: auth.token, user });
                }
                return user;
            }
        } catch {
            // Do not use stale cached Premium data to mark a plan as current.
        }
        return null;
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

    function formatCardNumber(value) {
        return String(value || "").replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
    }

    function telegramIcon() {
        return `<img class="manual-payment__telegram-icon" src="/premium-icons/telegram-logo.webp?v=20260713-plan-current-v1" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
    }

    function closeIcon() {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
    }

    function pricingCard(plan, currentPlanId = "") {
        const hasActiveSubscription = Boolean(currentPlanId);
        const isCurrentPlan = currentPlanId === plan.id;
        const isLockedPlan = hasActiveSubscription && !isCurrentPlan;
        const display = planDisplay(plan);
        return `<article class="pricing-card${plan.bestValue ? " pricing-card--featured" : ""}${isCurrentPlan ? " pricing-card--current" : ""}" ${isCurrentPlan ? 'aria-current="true"' : ""}>
            ${display.badge && !isCurrentPlan ? `<span class="pricing-card__best">${escapeHtml(display.badge)}</span>` : ""}
            ${isCurrentPlan ? '<span class="pricing-card__current">Your plan</span>' : ""}
            <div class="pricing-card__head"><h2>${escapeHtml(display.name)}</h2><p>${escapeHtml(display.duration)}</p></div>
            <div class="pricing-card__price"><strong>${escapeHtml(premium.formatPrice(plan.price))}</strong><span>${escapeHtml(display.description)}</span></div>
            <ul>${premium.premiumFeatures.map((feature) => `<li><span aria-hidden="true">✓</span>${escapeHtml(feature)}</li>`).join("")}</ul>
            <button class="premium-button${isCurrentPlan ? " premium-button--current" : ""}${isLockedPlan ? " premium-button--locked" : ""}" type="button" ${hasActiveSubscription ? "disabled" : `data-plan="${escapeHtml(plan.id)}"`}>${isCurrentPlan ? "Your plan" : isLockedPlan ? "Subscription active" : escapeHtml(display.buttonLabel)}</button>
        </article>`;
    }

    function comparisonIcon(isAvailable) {
        return `<span class="${isAvailable ? "comparison-check" : "comparison-minus"}" aria-hidden="true">${isAvailable ? "✓" : "−"}</span>`;
    }

    function comparisonCell(label, isAvailable) {
        return `${comparisonIcon(isAvailable)}${escapeHtml(label)}`;
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

    function paymentDetails(plan, user) {
        const accountId = user?.memberId || user?.testTakerId || user?.id || "Not available";
        const display = planDisplay(plan);
        return [
            "Hello, I paid for IELTSX Premium.",
            "",
            `Plan: ${display.name}`,
            `Price: ${premium.formatPrice(plan.price)}`,
            `Account email: ${user?.email || "Not available"}`,
            `Account name: ${user?.name || user?.username || "Not available"}`,
            `Account ID: ${accountId}`,
            "",
            "I will send the payment receipt below."
        ].join("\n");
    }

    async function createManualPaymentRequest(plan) {
        const response = await fetch("/api/premium/manual-payment-requests", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {})
            },
            body: JSON.stringify({ planId: plan.id })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not create manual payment request");
        return data;
    }

    function ManualPaymentModal() {
        let selectedPlan = null;
        let selectedUser = null;
        let lastTrigger = null;
        let statusTimer = null;

        function rootEl() { return document.getElementById("manualPaymentModal"); }
        function dialogEl() { return rootEl()?.querySelector(".manual-payment__dialog"); }
        function statusEl() { return document.getElementById("manualPaymentStatus"); }

        function setStatus(message, type = "success") {
            const element = statusEl();
            if (!element) return;
            window.clearTimeout(statusTimer);
            element.hidden = !message;
            element.textContent = message || "";
            element.className = `manual-payment__status manual-payment__status--${type}`;
            if (message && type === "success") {
                statusTimer = window.setTimeout(() => setStatus(""), 2200);
            }
        }

        function focusableElements() {
            return [...dialogEl().querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
                .filter((element) => element.offsetParent !== null);
        }

        function update() {
            if (!selectedPlan) return;
            const planPrice = premium.formatPrice(selectedPlan.price);
            const display = planDisplay(selectedPlan);
            document.getElementById("manualPaymentPlanName").textContent = display.name;
            document.getElementById("manualPaymentPlanDuration").textContent = display.duration;
            document.getElementById("manualPaymentPlanPrice").textContent = planPrice;
            document.getElementById("manualPaymentSummaryPlan").textContent = display.name;
            document.getElementById("manualPaymentSummaryPrice").textContent = planPrice;
            document.getElementById("manualPaymentCardType").textContent = manualPaymentConfig.cardType;
            document.getElementById("manualPaymentCardNumber").textContent = formatCardNumber(manualPaymentConfig.cardNumber);
            document.getElementById("manualPaymentCardholder").textContent = manualPaymentConfig.cardholder;
            document.getElementById("manualPaymentTelegramLink").href = `https://t.me/${manualPaymentConfig.telegramUsername}`;
            document.getElementById("manualPaymentTelegramLink").innerHTML = `${telegramIcon()}<span>Continue on Telegram @${escapeHtml(manualPaymentConfig.telegramUsername)}</span>`;
            setStatus("");
        }

        function open(plan, user, trigger) {
            selectedPlan = plan;
            selectedUser = user;
            lastTrigger = trigger || null;
            const modal = rootEl();
            modal.hidden = false;
            update();
            document.body.classList.add("premium-modal-open");
            window.requestAnimationFrame(() => modal.classList.add("is-visible"));
            modal.querySelector("[data-close-modal]").focus();
        }

        function close() {
            const modal = rootEl();
            if (!modal || modal.hidden) return;
            modal.classList.remove("is-visible");
            document.body.classList.remove("premium-modal-open");
            window.setTimeout(() => {
                modal.hidden = true;
                selectedPlan = null;
                selectedUser = null;
                setStatus("");
                lastTrigger?.focus();
                lastTrigger = null;
            }, 140);
        }

        function bind() {
            const modal = rootEl();
            modal.addEventListener("click", async (event) => {
                if (event.target.closest("[data-close-modal]")) {
                    close();
                    return;
                }

                const copyCard = event.target.closest("[data-copy-card]");
                if (copyCard) {
                    await copyText(manualPaymentConfig.cardNumber);
                    setStatus("Card number copied");
                    return;
                }

                const copyDetails = event.target.closest("[data-copy-payment-details]");
                if (copyDetails && selectedPlan) {
                    await copyText(paymentDetails(selectedPlan, selectedUser));
                    setStatus("Payment details copied");
                    return;
                }

                const telegramLink = event.target.closest("#manualPaymentTelegramLink");
                if (telegramLink && selectedPlan) {
                    event.preventDefault();
                    if (!authToken()) {
                        loginForPlan(selectedPlan.id);
                        return;
                    }
                    try {
                        setStatus("Creating payment request...", "info");
                        await createManualPaymentRequest(selectedPlan);
                        setStatus("Payment request created. Opening Telegram...", "success");
                        window.open(telegramLink.href, "_blank", "noopener,noreferrer");
                    } catch (error) {
                        setStatus(error.message || "Could not create payment request", "error");
                    }
                }
            });

            document.addEventListener("keydown", (event) => {
                const modal = rootEl();
                if (!modal || modal.hidden) return;
                if (event.key === "Escape") {
                    close();
                    return;
                }
                if (event.key !== "Tab") return;
                const focusable = focusableElements();
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (!first || !last) return;
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            });
        }

        return { bind, open, close };
    }

    function manualPaymentModalMarkup() {
        return `<div class="premium-modal manual-payment" id="manualPaymentModal" hidden>
            <div class="premium-modal__backdrop manual-payment__backdrop" data-close-modal></div>
            <section class="manual-payment__dialog" role="dialog" aria-modal="true" aria-labelledby="manualPaymentTitle">
                <button type="button" class="premium-modal__close manual-payment__close" data-close-modal aria-label="Close">${closeIcon()}</button>
                <span class="premium-eyebrow">PAY WITH A LOCAL CARD</span>
                <h2 id="manualPaymentTitle">Pay by card, then send the receipt</h2>
                <p class="manual-payment__description">Pay the amount below to this UZCARD / HUMO card, then send the payment receipt to our Telegram administrator. Your Premium plan will be activated manually after payment verification.</p>
                <div class="manual-payment__selected" aria-label="Selected Premium plan">
                    <div><strong id="manualPaymentPlanName"></strong><span id="manualPaymentPlanDuration"></span></div>
                    <strong id="manualPaymentPlanPrice"></strong>
                </div>
                <div class="manual-payment__card">
                    <div class="manual-payment__card-row"><span>Card type</span><strong id="manualPaymentCardType">UZCARD / HUMO</strong></div>
                    <div class="manual-payment__card-row manual-payment__card-row--number">
                        <span>Card number</span>
                        <button type="button" class="manual-payment__copy-card" data-copy-card aria-label="Copy card number"><strong id="manualPaymentCardNumber">5614 6810 7600 0011</strong><span>Copy</span></button>
                    </div>
                    <div class="manual-payment__card-row"><span>Cardholder</span><strong id="manualPaymentCardholder">XOSHIMJONOV XURSHIDBEK</strong></div>
                    <div class="manual-payment__summary"><span id="manualPaymentSummaryPlan"></span><strong id="manualPaymentSummaryPrice"></strong></div>
                </div>
                <ol class="manual-payment__steps">
                    <li>Transfer the exact amount to the card.</li>
                    <li>Save the payment receipt or screenshot.</li>
                    <li>Send the receipt to @ieltsxuz_admin.</li>
                    <li>Premium will be activated after administrator verification.</li>
                </ol>
                <p class="manual-payment__manual-note">Payment verification is performed manually.</p>
                <p id="manualPaymentStatus" class="manual-payment__status" hidden aria-live="polite"></p>
                <div class="manual-payment__actions">
                    <a id="manualPaymentTelegramLink" class="premium-button manual-payment__telegram" href="https://t.me/ieltsxuz_admin" target="_blank" rel="noopener noreferrer">${telegramIcon()}<span>Continue on Telegram @ieltsxuz_admin</span></a>
                    <button class="manual-payment__secondary" type="button" data-copy-payment-details>Copy payment details</button>
                </div>
            </section>
        </div>`;
    }

    function render(currentPlanId = "") {
        root.innerHTML = `
            <section class="premium-hero"><span class="premium-eyebrow">IELTSX PREMIUM</span><h1>Go Premium</h1><h2>Unlimited practice. Stronger results.</h2><p>Get full, unrestricted access to every IELTSX Premium feature.</p></section>
            <section class="pricing-grid" aria-label="Premium pricing plans">${Object.values(premium.premiumPlans).map((plan) => pricingCard(plan, currentPlanId)).join("")}</section>
            <section class="comparison-section"><div class="section-heading"><span>PLAN COMPARISON</span><h2>Free and Premium features</h2></div>
                <div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th>Feature</th><th>Free</th><th>Premium</th></tr></thead><tbody>${comparison.map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${comparisonCell(row.free, row.freeAvailable)}</td><td>${comparisonCell(row.premium, row.premiumAvailable)}</td></tr>`).join("")}</tbody></table></div>
                <div class="comparison-cards">${comparison.map((row) => `<article><h3>${escapeHtml(row.label)}</h3><p class="${row.freeAvailable ? "is-available" : ""}"><strong>Free</strong>${comparisonCell(row.free, row.freeAvailable)}</p><p class="is-premium"><strong>Premium</strong>${comparisonCell(row.premium, row.premiumAvailable)}</p></article>`).join("")}</div>
            </section>
            ${manualPaymentModalMarkup()}`;
    }

    function renderPage(currentPlanId = "") {
        render(currentPlanId);
        manualModal = ManualPaymentModal();
        manualModal.bind();
    }

    async function openPlan(planId, trigger = null) {
        const plan = premium.premiumPlans[planId];
        if (!plan) return;

        const user = await latestCurrentUser() || currentUser();
        const currentPlanId = activePlanId(user);
        if (currentPlanId) {
            renderPage(currentPlanId);
            return;
        }

        if (!user) {
            loginForPlan(plan.id);
            return;
        }
        manualModal.open(plan, user, trigger);
    }

    async function init() {
        const user = await latestCurrentUser();
        renderPage(activePlanId(user));

        root.addEventListener("click", (event) => {
            const planButton = event.target.closest("[data-plan]");
            if (!planButton) return;
            openPlan(planButton.dataset.plan, planButton);
        });

        window.setTimeout(() => {
            const planId = new URLSearchParams(window.location.search).get("plan");
            if (planId && premium.premiumPlans[planId] && authToken() && activePlanId(currentUser()) !== planId) {
                openPlan(planId);
            }
        }, 450);
    }

    init();
}());
