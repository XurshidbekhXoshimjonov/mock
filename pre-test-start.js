(function () {
    const DEFAULT_MESSAGE = "Click here to start the test";

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function messageParts(message = DEFAULT_MESSAGE) {
        const text = String(message || DEFAULT_MESSAGE);
        const index = text.toLowerCase().indexOf("here");
        if (index === -1) return { before: text, here: "", after: "" };
        return {
            before: text.slice(0, index),
            here: text.slice(index, index + 4),
            after: text.slice(index + 4)
        };
    }

    function markup(options = {}) {
        const parts = messageParts(options.message);
        const compact = options.compact ? " ieltsx-prestart-stage--compact" : "";
        return `
            <section class="ieltsx-prestart-stage${compact}" aria-label="Start test">
                <button class="ieltsx-prestart-card" type="button" data-pretest-start>
                    <span class="ieltsx-prestart-text">
                        ${escapeHtml(parts.before)}${parts.here ? `<span class="ieltsx-prestart-link">${escapeHtml(parts.here)}</span>${escapeHtml(parts.after)}` : ""}
                    </span>
                </button>
            </section>
        `;
    }

    function mount(target, onStart, options = {}) {
        if (!target) return null;
        target.innerHTML = markup(options);
        const button = target.querySelector("[data-pretest-start]");
        button?.addEventListener("click", () => {
            if (typeof onStart === "function") onStart();
        });
        return button;
    }

    function renderReact(h, options = {}) {
        const parts = messageParts(options.message);
        const compact = options.compact ? " ieltsx-prestart-stage--compact" : "";
        return h("section", { className: `ieltsx-prestart-stage${compact}`, "aria-label": "Start test" },
            h("button", {
                className: "ieltsx-prestart-card",
                type: "button",
                onClick: options.onStart,
                "data-pretest-start": true
            },
                h("span", { className: "ieltsx-prestart-text" },
                    parts.before,
                    parts.here ? h("span", { className: "ieltsx-prestart-link" }, parts.here) : null,
                    parts.after
                )
            )
        );
    }

    window.PreTestStartScreen = {
        DEFAULT_MESSAGE,
        markup,
        mount,
        renderReact
    };
})();
