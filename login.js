const loginForm = document.getElementById("loginForm");
const authMessage = document.getElementById("authMessage");
const loginBtn = document.getElementById("loginBtn");

function showMessage(message, type) {
    authMessage.hidden = false;
    authMessage.textContent = message;
    authMessage.className = `auth-message ${type || ""}`;
}

if (window.authClient) {
    window.authClient.redirectIfAuthenticated("profile.html");
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";
    authMessage.hidden = true;

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Login failed");
        }

        window.authClient.saveAuth({
            token: data.token,
            user: data.user
        });

        window.location.href = "profile.html";
    } catch (error) {
        showMessage(error.message, "error");
        loginBtn.disabled = false;
        loginBtn.textContent = "Login";
    }
});
