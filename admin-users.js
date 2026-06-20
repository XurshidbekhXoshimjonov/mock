(function () {
    let allUsers = [];
    let currentFilter = "all";
    let searchQuery = "";

    // DOM Elements
    const statUsers = document.getElementById("statUsers");
    const statTodayUsers = document.getElementById("statTodayUsers");
    const statPremiumUsers = document.getElementById("statPremiumUsers");
    const statFreeUsers = document.getElementById("statFreeUsers");
    const usersTableBody = document.getElementById("usersTableBody");
    const searchInput = document.getElementById("searchInput");
    const filterBtns = document.querySelectorAll(".filter-btn");
    const usersStatus = document.getElementById("usersStatus");

    // Client-side authentication check
    function checkAuth() {
        const auth = window.authClient?.getAuth();
        if (!auth || !auth.user || auth.user.role !== "admin") {
            window.location.replace("/login.html");
            return false;
        }
        return true;
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatDate(dateString) {
        if (!dateString) return "Never";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return "Never";
            
            // Format to YYYY-MM-DD HH:MM
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, "0");
            const dd = String(date.getDate()).padStart(2, "0");
            const hh = String(date.getHours()).padStart(2, "0");
            const min = String(date.getMinutes()).padStart(2, "0");
            
            return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
        } catch {
            return "Never";
        }
    }

    function showStatus(message, type = "") {
        if (!message) {
            usersStatus.hidden = true;
            usersStatus.textContent = "";
            usersStatus.className = "status-text";
            return;
        }

        usersStatus.hidden = false;
        usersStatus.textContent = message;
        usersStatus.className = `status-text${type ? ` ${type}` : ""}`;
    }

    async function loadStats() {
        try {
            const response = await fetch("/api/admin/stats/users");
            const text = await response.text();
            
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error("Invalid stats response from server.");
            }

            if (!response.ok) {
                throw new Error(data.error || "Failed to load statistics.");
            }

            statUsers.textContent = data.totalUsers ?? 0;
            statTodayUsers.textContent = data.todayUsers ?? 0;
            statPremiumUsers.textContent = data.premiumUsers ?? 0;
            statFreeUsers.textContent = data.freeUsers ?? 0;
        } catch (error) {
            console.error("Stats load error:", error);
        }
    }

    async function loadUsers() {
        try {
            showStatus("");
            const response = await fetch("/api/admin/users");
            const text = await response.text();
            
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error("Invalid user list response from server.");
            }

            if (!response.ok) {
                throw new Error(data.error || "Failed to fetch user list.");
            }

            allUsers = data;
            renderTable();
        } catch (error) {
            console.error("Users load error:", error);
            usersTableBody.innerHTML = `<tr><td colspan="8" class="table-loading" style="color: #ef4444;">Error: ${escapeHtml(error.message)}</td></tr>`;
            showStatus(error.message, "error");
        }
    }

    function renderTable() {
        const filtered = allUsers.filter((user) => {
            // Apply Plan/Role Filter
            if (currentFilter === "free" && user.plan !== "free") return false;
            if (currentFilter === "premium" && user.plan !== "premium") return false;
            if (currentFilter === "admin" && user.role !== "admin") return false;

            // Apply Search Query
            if (searchQuery) {
                const search = searchQuery.toLowerCase();
                const uName = (user.username || "").toLowerCase();
                const fName = (user.name || "").toLowerCase();
                const email = (user.email || "").toLowerCase();
                return uName.includes(search) || fName.includes(search) || email.includes(search);
            }

            return true;
        });

        if (filtered.length === 0) {
            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="table-empty">
                        No users found matching the current search criteria.
                    </td>
                </tr>
            `;
            return;
        }

        usersTableBody.innerHTML = filtered.map((user, index) => {
            const displayIndex = index + 1;
            const uRole = user.role === "admin" ? "admin" : "user";
            const roleBadgeClass = uRole === "admin" ? "badge--admin" : "badge--user";
            const planBadgeClass = user.plan === "premium" ? "badge--premium" : "badge--free";
            const planLabel = user.plan === "premium" ? "Premium" : "Free";

            return `
                <tr>
                    <td><strong class="user-id-text">${escapeHtml(user.memberId || "—")}</strong></td>
                    <td>
                        <div class="user-identity">
                            <span class="user-username">${escapeHtml(user.username)}</span>
                            <span class="user-fullname">${escapeHtml(user.name || user.username)}</span>
                        </div>
                    </td>
                    <td><span class="user-email-text">${escapeHtml(user.email)}</span></td>
                    <td><span class="badge ${roleBadgeClass}">${uRole}</span></td>
                    <td><span class="badge ${planBadgeClass}">${planLabel}</span></td>
                    <td>${formatDate(user.createdAt)}</td>
                    <td>${formatDate(user.lastLogin)}</td>
                    <td>
                        <button class="btn-action" onclick="alert('User: ${escapeHtml(user.username)}\\nEmail: ${escapeHtml(user.email)}\\nPlan: ${escapeHtml(planLabel)}\\nRole: ${escapeHtml(uRole)}')">
                            View Details
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // Event Listeners
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.trim();
        renderTable();
    });

    filterBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            filterBtns.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            currentFilter = btn.getAttribute("data-filter");
            renderTable();
        });
    });

    // Initialize
    if (checkAuth()) {
        loadStats().catch(() => {});
        loadUsers().catch(() => {});
        
        // Refresh every 30s
        setInterval(() => {
            loadStats().catch(() => {});
            loadUsers().catch(() => {});
        }, 30000);
    }
})();
