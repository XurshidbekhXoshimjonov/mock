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

    function initSignupForm() {
        const signupForm = document.getElementById("signupForm");
        const authMessage = document.getElementById("authMessage");
        const signupBtn = document.getElementById("signupBtn");
        const usernameInput = document.getElementById("username");
        const emailInput = document.getElementById("email");
        const passwordInput = document.getElementById("password");

        if (!signupForm || !authMessage || !signupBtn || !usernameInput || !emailInput || !passwordInput) {
            return;
        }

        const originalButtonText = signupBtn.textContent || "Create Account";

        function showMessage(message, type) {
            authMessage.hidden = false;
            authMessage.textContent = message;
            authMessage.className = `auth-message ${type || ""}`;
        }

        function resetButton() {
            signupBtn.disabled = false;
            signupBtn.textContent = originalButtonText;
        }

        if (window.authClient?.verifyStoredSession) {
            window.authClient.verifyStoredSession().then((user) => {
                if (!user) return;
                const fallback = user.role === "admin" ? "/admin" : "/dashboard";
                const target = safeRedirectTarget(new URLSearchParams(window.location.search).get("redirect"), fallback);
                window.location.assign(target);
            }).catch(() => {});
        }

        signupForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const username = usernameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!username || !email || !password) {
                showMessage("Username, email, and password are required.", "error");
                return;
            }

            if (password.length < 6) {
                showMessage("Password must be at least 6 characters.", "error");
                return;
            }

            signupBtn.disabled = true;
            signupBtn.textContent = "Creating account...";
            authMessage.hidden = true;

            try {
                const response = await fetch("/signup", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    cache: "no-store",
                    body: JSON.stringify({ username, email, password })
                });

                let data = {};
                try {
                    data = await response.json();
                } catch {
                    data = {};
                }

                if (!response.ok || !data.success) {
                    throw new Error(data.message || "Signup failed");
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
                    throw new Error(meData.message || "Account created, but the browser did not save the session. Please log in.");
                }

                window.authClient?.saveAuth?.({
                    user: meData.user
                });

                const fallback = meData.user.role === "admin" ? "/admin" : "/dashboard";
                const target = safeRedirectTarget(new URLSearchParams(window.location.search).get("redirect"), fallback);
                window.location.assign(target);
            } catch (error) {
                showMessage(error.message || "Signup failed", "error");
                resetButton();
            }
        });

        const params = new URLSearchParams(window.location.search);
        if (params.has("redirect")) {
            showMessage("Please log in or create an account to continue.", "info");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initSignupForm, { once: true });
    } else {
        initSignupForm();
    }
})();
