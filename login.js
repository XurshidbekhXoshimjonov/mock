const loginForm = document.getElementById("loginForm");
const authMessage = document.getElementById("authMessage");
const loginBtn = document.getElementById("loginBtn");

function showMessage(message, type) {
    authMessage.hidden = false;
    authMessage.textContent = message;
    authMessage.className = `auth-message ${type || ""}`;
}

if (window.authClient) {
    window.authClient.redirectIfAuthenticated("/profile.html");
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

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
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        console.log("LOGIN_RESPONSE_STATUS:", response.status);
        console.log("LOGIN_RESPONSE_BODY:", data);

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Login failed");
        }

        const meResponse = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "include"
        });

        let meData = null;
        try {
            meData = await meResponse.json();
        } catch (e) {
            console.error("Failed to parse /api/auth/me response", e);
        }

        console.log("ME_RESPONSE_STATUS:", meResponse.status);
        console.log("ME_RESPONSE_BODY:", meData);

        if (meResponse.status === 401) {
            showMessage("Login succeeded but session was not saved.", "error");
            loginBtn.disabled = false;
            loginBtn.textContent = "Login";
            return;
        }

        if (!meResponse.ok || !meData || !meData.success) {
            throw new Error(meData?.message || "Failed to fetch user session");
        }

        window.authClient.saveAuth({
            token: data.token,
            user: meData.user
        });

        const targetPath = meData.user.role === "admin" ? "/admin" : "/dashboard";
        console.log("REDIRECT_TARGET:", targetPath);

        window.location.href = targetPath;
    } catch (error) {
        showMessage(error.message, "error");
        loginBtn.disabled = false;
        loginBtn.textContent = "Login";
    }
});
