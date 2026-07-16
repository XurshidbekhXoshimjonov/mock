(function () {
    let allUsers = [];
    let manualPayments = [];
    let currentFilter = "all";
    let searchQuery = "";
    let managedUser = null;
    const premium = window.IELTSXPremium;
    const byId = (id) => document.getElementById(id);
    const tableBody = byId("usersTableBody");
    const modal = byId("subscriptionAdminModal");
    const form = byId("manageSubscriptionForm");

    function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function formatDate(value, includeTime = true) {
        if (!value) return "—";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";
        return includeTime ? date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : date.toISOString().slice(0, 10);
    }
    function authHeaders(json = false) {
        return json ? { "Content-Type": "application/json" } : {};
    }
    function refreshCurrentAuthUser(updatedUser) {
        if (!updatedUser) return;
        const auth = window.authClient?.getAuth?.();
        if (String(auth?.user?.id || "") !== String(updatedUser.id || "")) return;
        window.authClient.saveAuth({ user: updatedUser });
    }
    function setStatus(message, type = "") {
        const el = byId("usersStatus"); el.hidden = !message; el.textContent = message || ""; el.className = `status-text${type ? ` ${type}` : ""}`;
    }
    function setManualPaymentsStatus(message, type = "") {
        const el = byId("manualPaymentsStatus"); el.hidden = !message; el.textContent = message || ""; el.className = `status-text${type ? ` ${type}` : ""}`;
    }
    function checkAuth() {
        const user = window.authClient?.getAuth()?.user;
        if (!user) { window.location.replace("/login"); return false; }
        if (user.role !== "admin") { window.location.replace("/dashboard"); return false; }
        return true;
    }
    async function loadStats() {
        const response = await fetch("/api/admin/stats/users", { headers: authHeaders(), credentials: "include" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load statistics");
        byId("statUsers").textContent = data.totalUsers ?? 0; byId("statTodayUsers").textContent = data.todayUsers ?? 0;
        byId("statPremiumUsers").textContent = data.premiumUsers ?? 0; byId("statFreeUsers").textContent = data.freeUsers ?? 0;
    }
    async function loadUsers() {
        try {
            setStatus("");
            const response = await fetch("/api/admin/users?limit=100", { headers: authHeaders(), credentials: "include", cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to fetch user list");
            allUsers = Array.isArray(data) ? data : [];
            renderTable();
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="10" class="table-loading">${escapeHtml(error.message)}</td></tr>`;
            setStatus(error.message, "error");
        }
    }
    async function loadManualPayments() {
        const table = byId("manualPaymentsTableBody");
        try {
            setManualPaymentsStatus("");
            const response = await fetch("/api/admin/manual-payments", { headers: authHeaders(), credentials: "include", cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to fetch manual payments");
            manualPayments = Array.isArray(data) ? data : [];
            renderManualPayments();
        } catch (error) {
            table.innerHTML = `<tr><td colspan="8" class="table-loading">${escapeHtml(error.message)}</td></tr>`;
            setManualPaymentsStatus(error.message, "error");
        }
    }
    function userStatus(user) { return premium.getSubscriptionDisplayStatus(user); }
    function renderTable() {
        const filtered = allUsers.filter((user) => {
            const subscription = userStatus(user);
            if (currentFilter === "free" && subscription.status !== "free") return false;
            if (currentFilter === "active" && subscription.status !== "active") return false;
            if (currentFilter === "expired" && subscription.status !== "expired") return false;
            if (!searchQuery) return true;
            return [user.username, user.name, user.email, user.memberId].some((value) => String(value || "").toLowerCase().includes(searchQuery));
        });
        if (!filtered.length) { tableBody.innerHTML = '<tr><td colspan="10" class="table-empty">No users found.</td></tr>'; return; }
        tableBody.innerHTML = filtered.map((user) => {
            const subscription = userStatus(user);
            const role = user.role === "admin" ? "admin" : "user";
            return `<tr>
                <td><strong class="user-id-text">${escapeHtml(user.memberId || "—")}</strong></td>
                <td><div class="user-identity"><span class="user-username">${escapeHtml(user.username)}</span><span class="user-fullname">${escapeHtml(user.name || user.username)}</span></div></td>
                <td><span class="user-email-text">${escapeHtml(user.email)}</span></td>
                <td><span class="badge badge--${role}">${role}</span></td>
                <td><span class="badge ${subscription.isPremium ? "badge--premium" : "badge--free"}">${escapeHtml(subscription.planName)}</span></td>
                <td>${premium.subscriptionStatusBadge(subscription.status)}</td>
                <td>${formatDate(subscription.expiresAt, false)}</td><td>${formatDate(user.createdAt)}</td><td>${formatDate(user.lastLogin)}</td>
                <td><button class="btn-action" type="button" data-manage-user="${escapeHtml(user.id)}">Manage</button></td>
            </tr>`;
        }).join("");
    }
    function renderManualPayments() {
        const table = byId("manualPaymentsTableBody");
        if (!manualPayments.length) {
            table.innerHTML = '<tr><td colspan="8" class="table-empty">No manual payment requests yet.</td></tr>';
            return;
        }
        table.innerHTML = manualPayments.map((request) => {
            const disabled = request.status !== "pending" ? "disabled" : "";
            return `<tr>
                <td><strong>${escapeHtml(request.userName || "—")}</strong></td>
                <td><span class="user-email-text">${escapeHtml(request.userEmail || "—")}</span></td>
                <td><span class="badge badge--premium">${escapeHtml(request.planName)}</span></td>
                <td><strong>${escapeHtml(premium.formatPrice(request.amount))}</strong></td>
                <td>${formatDate(request.createdAt)}</td>
                <td>${premium.subscriptionStatusBadge(request.status)}</td>
                <td><input class="manual-payment-note" data-payment-note="${escapeHtml(request.id)}" type="text" maxlength="500" placeholder="Optional note" value="${escapeHtml(request.adminNote || "")}" ${disabled}></td>
                <td><div class="manual-payment-actions"><button class="btn-action btn-action--primary" type="button" data-verify-payment="${escapeHtml(request.id)}" ${disabled}>Verify</button><button class="btn-action" type="button" data-reject-payment="${escapeHtml(request.id)}" ${disabled}>Reject</button></div></td>
            </tr>`;
        }).join("");
    }
    function calculateExpiry() {
        const plan = premium.premiumPlans[byId("managePlan").value];
        const start = new Date(`${byId("manageStartDate").value}T00:00:00`);
        if (plan && !Number.isNaN(start.getTime())) byId("manageExpiryDate").value = new Date(start.getTime() + plan.durationDays * 86400000).toISOString().slice(0, 10);
    }
    function openManage(user) {
        managedUser = user;
        const details = userStatus(user);
        byId("manageUserId").value = user.id; byId("manageSubscriptionUser").textContent = `${user.name || user.username} · ${user.email}`;
        byId("manageCurrentPlan").value = `${details.planName} — ${details.statusLabel}`;
        byId("managePlan").innerHTML = Object.values(premium.premiumPlans).map((plan) => `<option value="${plan.id}">${escapeHtml(plan.name)} — ${plan.durationDays} days</option>`).join("");
        byId("managePlan").value = details.planId !== "free" && premium.premiumPlans[details.planId] ? details.planId : "monthly";
        byId("manageStartDate").value = details.startedAt ? formatDate(details.startedAt, false) : new Date().toISOString().slice(0, 10);
        byId("manageNote").value = user.subscriptionAdminNote || ""; calculateExpiry();
        byId("manageSubscriptionStatus").hidden = true; modal.hidden = false; document.body.classList.add("manage-modal-open");
    }
    function closeManage() { modal.hidden = true; document.body.classList.remove("manage-modal-open"); managedUser = null; }
    async function saveSubscription(status = "active") {
        if (!managedUser) return;
        const statusEl = byId("manageSubscriptionStatus"); statusEl.hidden = false; statusEl.textContent = "Saving…";
        const response = await fetch(`/api/admin/users/${encodeURIComponent(managedUser.id)}/subscription`, {
            method: "PUT", credentials: "include", headers: authHeaders(true), body: JSON.stringify({ planId: byId("managePlan").value, status, startDate: byId("manageStartDate").value, expiryDate: byId("manageExpiryDate").value, note: byId("manageNote").value })
        });
        const data = await response.json();
        if (!response.ok) { statusEl.textContent = data.error || "Could not update subscription"; statusEl.className = "status-text error"; return; }
        refreshCurrentAuthUser(data.user);
        closeManage(); await Promise.all([loadUsers(), loadStats()]); setStatus(status === "cancelled" ? "Subscription cancelled." : "Premium access granted.", "success");
    }
    async function updateManualPayment(id, action) {
        const note = byId("manualPaymentsTableBody").querySelector(`[data-payment-note="${CSS.escape(id)}"]`)?.value || "";
        setManualPaymentsStatus(action === "verify" ? "Verifying manual payment..." : "Rejecting manual payment...");
        const response = await fetch(`/api/admin/manual-payments/${encodeURIComponent(id)}/${action}`, {
            method: "PUT",
            credentials: "include",
            headers: authHeaders(true),
            body: JSON.stringify({ adminNote: note })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not update manual payment");
        refreshCurrentAuthUser(data.user);
        await Promise.all([loadManualPayments(), loadUsers(), loadStats()]);
        setManualPaymentsStatus(action === "verify" ? "Payment verified and Premium activated." : "Payment request rejected.", "success");
    }
    byId("searchInput").addEventListener("input", (event) => { searchQuery = event.target.value.trim().toLowerCase(); renderTable(); });
    document.querySelectorAll(".filter-btn").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll(".filter-btn").forEach((item) => item.classList.remove("active")); button.classList.add("active"); currentFilter = button.dataset.filter; renderTable(); }));
    tableBody.addEventListener("click", (event) => { const button = event.target.closest("[data-manage-user]"); if (button) { const user = allUsers.find((item) => String(item.id) === button.dataset.manageUser); if (user) openManage(user); } });
    byId("manualPaymentsTableBody").addEventListener("click", (event) => {
        const verifyButton = event.target.closest("[data-verify-payment]");
        const rejectButton = event.target.closest("[data-reject-payment]");
        const id = verifyButton?.dataset.verifyPayment || rejectButton?.dataset.rejectPayment;
        if (!id) return;
        updateManualPayment(id, verifyButton ? "verify" : "reject").catch((error) => setManualPaymentsStatus(error.message, "error"));
    });
    byId("refreshManualPayments").addEventListener("click", () => loadManualPayments().catch((error) => setManualPaymentsStatus(error.message, "error")));
    modal.addEventListener("click", (event) => { if (event.target.closest("[data-manage-close]")) closeManage(); if (event.target.closest("[data-manage-cancel]")) saveSubscription("cancelled"); });
    form.addEventListener("submit", (event) => { event.preventDefault(); saveSubscription("active"); });
    byId("managePlan").addEventListener("change", calculateExpiry); byId("manageStartDate").addEventListener("change", calculateExpiry);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) closeManage(); });
    if (checkAuth()) Promise.all([loadStats(), loadUsers(), loadManualPayments()]).catch((error) => setStatus(error.message, "error"));
}());
