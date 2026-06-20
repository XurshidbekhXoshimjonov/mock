const signupForm = document.getElementById("signupForm");
const authMessage = document.getElementById("authMessage");
const signupBtn = document.getElementById("signupBtn");

function showMessage(message, type) {
    authMessage.hidden = false;
    authMessage.textContent = message;
    authMessage.className = `auth-message ${type || ""}`;
}

if (window.authClient) {
    window.authClient.redirectIfAuthenticated("/profile.html");
}

signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    signupBtn.disabled = true;
    signupBtn.textContent = "Creating account...";
    authMessage.hidden = true;

    try {
        const response = await fetch("/signup", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Signup failed");
        }

        window.authClient.saveAuth({
            token: data.token,
            user: data.user
        });

        window.location.href = "/profile.html";
    } catch (error) {
        showMessage(error.message, "error");
        signupBtn.disabled = false;
        signupBtn.textContent = "Create Account";
    }
});
