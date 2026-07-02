(() => {
    function safeRedirectTarget(value, fallback) {
        if (!value) return fallback;

        try {
            const decoded = decodeURIComponent(value);
            const target = new URL(decoded, window.location.origin);
            return target.origin === window.location.origin
                ? `${target.pathname}${target.search}${target.hash}`
                : fallback;
        } catch {
            return fallback;
        }
    }

    function initLoginForm() {
        const loginForm = document.getElementById("loginForm");
        const authMessage = document.getElementById("authMessage");
        const loginBtn = document.getElementById("loginBtn");
        const emailInput = document.getElementById("email");
        const passwordInput = document.getElementById("password");

        if (!loginForm || !authMessage || !loginBtn || !emailInput || !passwordInput) {
            return;
        }

        const originalButtonText = loginBtn.textContent || "Login";

        function showMessage(message, type) {
            authMessage.hidden = false;
            authMessage.textContent = message;
            authMessage.className = `auth-message ${type || ""}`;
        }

        function resetButton() {
            loginBtn.disabled = false;
            loginBtn.textContent = originalButtonText;
        }

        if (window.authClient?.verifyStoredSession) {
            window.authClient.verifyStoredSession().then((user) => {
                if (!user) return;
                const fallback = user.role === "admin" ? "/admin" : "/dashboard";
                const target = safeRedirectTarget(new URLSearchParams(window.location.search).get("redirect"), fallback);
                window.location.assign(target);
            }).catch(() => {});
        }

        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                showMessage("Email and password are required.", "error");
                return;
            }

            loginBtn.disabled = true;
            loginBtn.textContent = "Signing in...";
            authMessage.hidden = true;

            try {
                const response = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    cache: "no-store",
                    body: JSON.stringify({ email, password })
                });

                let data = {};
                try {
                    data = await response.json();
                } catch {
                    data = {};
                }

                if (!response.ok || !data.success) {
                    throw new Error(data.message || "Invalid email or password");
                }

                const meResponse = await fetch("/api/auth/me", {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store"
                });

                let meData = {};
                try {
                    meData = await meResponse.json();
                } catch {
                    meData = {};
                }

                if (!meResponse.ok || !meData.success || !meData.user) {
                    throw new Error(meData.message || "Login succeeded, but the browser did not save the session. Please try again.");
                }

                window.authClient?.saveAuth?.({
                    token: data.token,
                    user: meData.user
                });

                const fallback = meData.user.role === "admin" ? "/admin" : "/dashboard";
                const target = safeRedirectTarget(new URLSearchParams(window.location.search).get("redirect"), fallback);
                window.location.assign(target);
            } catch (error) {
                showMessage(error.message || "Login failed", "error");
                resetButton();
            }
        });

        const params = new URLSearchParams(window.location.search);
        if (params.has("redirect")) {
            showMessage("Please log in or create an account to continue.", "info");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initLoginForm, { once: true });
    } else {
        initLoginForm();
    }
})();
