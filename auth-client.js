(function () {
    const AUTH_STORAGE_KEY = "ieltsmock.auth";
    const AUTH_COOKIE = "ieltsmockAuthToken";
    const TOKEN_DAYS = 7;
    const SESSION_VERIFY_TIMEOUT = 3000; // 3 second timeout for session verification

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getInitial(user) {
        return String(user?.username || user?.email || "User")
            .trim()
            .charAt(0)
            .toUpperCase() || "U";
    }

    function readStorage() {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem("ieltsAuth");
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function writeStorage(auth) {
        try {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
            localStorage.setItem("ieltsAuth", JSON.stringify(auth));
        } catch {}
    }

    function removeStorage() {
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            localStorage.removeItem("ieltsAuth");
        } catch {}
    }

    function setAuthCookie(token) {
        const maxAge = TOKEN_DAYS * 24 * 60 * 60;
        document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
    }

    function clearAuthCookie() {
        document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; samesite=lax`;
    }

    function getAuth() {
        const auth = readStorage();
        if (!auth?.token || !auth?.user) {
            return null;
        }
        return auth;
    }

    function saveAuth(auth) {
        if (!auth?.token || !auth?.user) {
            return null;
        }

        const saved = {
            token: auth.token,
            user: auth.user,
            savedAt: new Date().toISOString()
        };

        writeStorage(saved);
        setAuthCookie(saved.token);
        renderGlobalNavbar();
        return saved;
    }

    function clearAuth() {
        removeStorage();
        clearAuthCookie();
    }

    async function apiFetch(url, options = {}) {
        const auth = getAuth();
        const headers = {
            ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        };

        if (auth?.token) {
            headers.Authorization = `Bearer ${auth.token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};

        if (!response.ok) {
            throw new Error(data.error || data.message || "Request failed");
        }

        return data;
    }

    async function verifyStoredSession() {
        const auth = getAuth();
        if (!auth?.token) {
            return null;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), SESSION_VERIFY_TIMEOUT);

            const data = await apiFetch("/api/auth/me", { signal: controller.signal });
            clearTimeout(timeoutId);

            const nextAuth = {
                ...auth,
                user: data.user
            };

            writeStorage(nextAuth);
            setAuthCookie(nextAuth.token);
            renderGlobalNavbar();
            return data.user;
        } catch (error) {
            // Session verification failed or timed out - treat as logged out
            clearAuth();
            renderGlobalNavbar();
            return null;
        }
    }

    function redirectIfAuthenticated(target = "profile.html") {
        if (getAuth()?.token) {
            window.location.href = target;
        }
    }

    async function getUserProgress() {
        return apiFetch("/api/profile/progress");
    }

    function getUserStats() {
        return {};
    }

    async function recordTestResult(result) {
        const auth = getAuth();
        if (!auth?.token) {
            return null;
        }

        return apiFetch("/api/profile/results", {
            method: "POST",
            body: JSON.stringify(result || {})
        });
    }

    async function updateProfilePreferences(preferences) {
        return apiFetch("/api/profile/preferences", {
            method: "PUT",
            body: JSON.stringify(preferences || {})
        });
    }

    function currentPageName() {
        const path = String(window.location.pathname || "").toLowerCase();
        const params = new URLSearchParams(window.location.search || "");
        const testType = String(params.get("type") || "").toLowerCase();
        if (testType === "listening") return "listening";
        if (testType === "reading") return "reading";
        if (path.includes("listening")) return "listening";
        if (path.includes("reading") || path.includes("part") || path.endsWith("/fulltest.html") || path.endsWith("fulltest.html")) return "reading";
        if (path.includes("profile")) return "profile";
        return "home";
    }

    function scheduleSiteReady() {
        window.requestAnimationFrame(() => {
            document.body.classList.add("site-ready");
        });
    }

    function findNavbarHost() {
        return document.querySelector("[data-global-navbar]")
            || document.getElementById("globalNavbar")
            || document.querySelector(".ielts-navbar");
    }

    function replaceLegacyNavbarHost() {
        const legacyHeader = document.querySelector("header.r-header, header.reading-list-header");

        if (!legacyHeader || findNavbarHost()) {
            return;
        }

        const host = document.createElement("header");
        host.id = "globalNavbar";
        host.setAttribute("data-global-navbar", "true");
        legacyHeader.replaceWith(host);
    }

    function ensureNavbarHost() {
        let host = findNavbarHost();

        if (!host) {
            host = document.createElement("header");
            document.body.insertBefore(host, document.body.firstChild);
        }

        host.className = "ielts-navbar";
        host.id = host.id || "globalNavbar";
        host.setAttribute("data-global-navbar", "true");
        return host;
    }

    function ensureNavbarStyles() {
        if (document.getElementById("ieltsNavbarStyles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "ieltsNavbarStyles";
        style.textContent = `
        @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap");

        .ielts-navbar {
            position: sticky;
            top: 0;
            z-index: 100;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
            align-items: center;
            gap: 28px;
            width: 100%;
            box-sizing: border-box;
            min-height: 90px;
            padding: 0 52px;
            border-bottom: 1px solid #e5e7eb;
            background: #ffffff;
            box-shadow: 0 10px 30px rgba(7, 21, 71, 0.05);
            font-family: "Plus Jakarta Sans", sans-serif;
        }

        .ielts-navbar * {
            box-sizing: border-box;
        }

        .ielts-navbar__brand {
            display: inline-flex;
            align-items: center;
            justify-self: start;
            color: #071547;
            text-decoration: none;
        }

        .ielts-navbar__logo {
            display: block;
            width: 168px;
            height: auto;
        }

        .ielts-navbar__wordmark {
            display: inline-flex;
            align-items: baseline;
            color: #dc1431;
            font-size: 27px;
            font-weight: 700;
            letter-spacing: -1.7px;
        }

        .ielts-navbar__wordmark-x {
            color: #071547;
            font-size: 31px;
        }

        .ielts-navbar__wordmark small {
            margin-left: 2px;
            color: #64748b;
            font-size: 13px;
            letter-spacing: -0.4px;
        }

        .ielts-navbar__links {
            display: flex;
            align-items: center;
            justify-content: center;
            justify-self: center;
            gap: 18px;
            margin: 0;
        }

        .ielts-navbar__links a {
            border-radius: 999px;
            color: #475569;
            padding: 9px 13px;
            font-size: 16px;
            font-weight: 600;
            text-decoration: none;
            transition: background 160ms ease, color 160ms ease;
        }

        .ielts-navbar__menu-toggle {
            display: none;
            align-items: center;
            justify-content: center;
            justify-self: end;
            width: 42px;
            height: 42px;
            border: 1px solid #dbe3ef;
            border-radius: 14px;
            background: #ffffff;
            color: #071547;
            cursor: pointer;
            transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .ielts-navbar__menu-toggle:hover {
            border-color: #bfdbfe;
            background: #f8fbff;
            box-shadow: 0 10px 22px rgba(7, 21, 71, 0.08);
        }

        .ielts-navbar__menu-toggle-lines,
        .ielts-navbar__menu-toggle-lines::before,
        .ielts-navbar__menu-toggle-lines::after {
            display: block;
            width: 18px;
            height: 2px;
            border-radius: 999px;
            background: currentColor;
            content: "";
            transition: transform 180ms ease, opacity 180ms ease;
        }

        .ielts-navbar__menu-toggle-lines {
            position: relative;
        }

        .ielts-navbar__menu-toggle-lines::before,
        .ielts-navbar__menu-toggle-lines::after {
            position: absolute;
            left: 0;
        }

        .ielts-navbar__menu-toggle-lines::before {
            top: -6px;
        }

        .ielts-navbar__menu-toggle-lines::after {
            top: 6px;
        }

        .ielts-navbar.is-menu-open .ielts-navbar__menu-toggle-lines {
            background: transparent;
        }

        .ielts-navbar.is-menu-open .ielts-navbar__menu-toggle-lines::before {
            transform: translateY(6px) rotate(45deg);
        }

        .ielts-navbar.is-menu-open .ielts-navbar__menu-toggle-lines::after {
            transform: translateY(-6px) rotate(-45deg);
        }

        .ielts-navbar__links a:hover,
        .ielts-navbar__links a.is-active {
            background: #eff6ff;
            color: #0b5fff;
        }

        .ielts-navbar__auth {
            justify-self: end;
            min-width: 0;
        }

        .ielts-navbar__button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            border-radius: 999px;
            padding: 0 18px;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
        }

        .ielts-navbar__button--login {
            color: #071547;
        }

        .ielts-navbar__button--signup {
            background: #dc1431;
            color: #fff;
            box-shadow: 0 10px 24px rgba(220, 20, 49, 0.22);
        }

        .ielts-account {
            position: relative;
        }

        .ielts-account__trigger {
            display: grid;
            grid-template-columns: 46px minmax(92px, 136px) 12px;
            align-items: center;
            gap: 11px;
            min-height: 52px;
            width: auto;
            border: 0;
            border-radius: 999px;
            background: linear-gradient(135deg, #f8fbff 0%, #eef5ff 100%);
            color: #071547;
            cursor: pointer;
            padding: 4px 14px 4px 5px;
            box-shadow: 0 12px 30px rgba(7, 21, 71, 0.08);
        }

        .ielts-account__trigger:hover {
            background: linear-gradient(135deg, #f8fbff 0%, #eef5ff 100%);
            opacity: 1;
        }

        .ielts-account__name {
            grid-column: 2;
            overflow: hidden;
            font-size: 14px;
            font-weight: 600;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .ielts-account__avatar {
            grid-column: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 46px;
            height: 46px;
            border-radius: 999px;
            background: #071547;
            color: #fff;
            font-weight: 700;
            box-shadow: 0 10px 20px rgba(7, 21, 71, 0.20);
            transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .ielts-account__trigger:hover .ielts-account__avatar,
        .ielts-account.is-open .ielts-account__avatar {
            transform: translateY(-1px) scale(1.03);
            box-shadow: 0 14px 28px rgba(7, 21, 71, 0.24);
        }

        .ielts-account__chevron {
            grid-column: 3;
            color: #64748b;
            font-size: 12px;
            transition: transform 180ms ease;
        }

        .ielts-account.is-open .ielts-account__chevron {
            transform: rotate(180deg);
        }

        .ielts-account__dropdown {
            position: absolute;
            top: calc(100% + 12px);
            right: 0;
            width: min(218px, calc(100vw - 28px));
            padding: 10px;
            border: 1px solid #e5e7eb;
            border-radius: 20px;
            background: white;
            box-shadow: 0 22px 48px rgba(7, 21, 71, 0.16);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(10px) scale(0.98);
            transform-origin: top right;
            transition: opacity 180ms ease, visibility 180ms ease, transform 180ms ease;
        }

        .ielts-account.is-open .ielts-account__dropdown {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: translateY(0) scale(1);
        }

        .ielts-account__link,
        .ielts-account__logout {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 13px;
            min-height: 46px;
            border: 0;
            border-radius: 14px;
            background: transparent;
            color: #111827;
            cursor: pointer;
            padding: 0 10px;
            text-align: left;
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            transition: background 180ms ease, color 180ms ease, transform 180ms ease;
        }

        .ielts-account__link:hover,
        .ielts-account__link.is-active,
        .ielts-account__logout:hover {
            transform: translateX(2px);
            background: #f8fafc;
            color: #071547;
        }

        .ielts-account__link.is-active {
            background: #f6f8fc;
            color: #071547;
        }

        .ielts-account__logout {
            margin-top: 6px;
            color: #dc1431;
        }

        .ielts-account__icon {
            width: 32px;
            height: 32px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 32px;
            border: 1px solid transparent;
            border-radius: 11px;
            font-size: 14px;
            color: currentColor;
            text-align: center;
            transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }

        .ielts-account__icon svg {
            width: 17px;
            height: 17px;
            display: block;
            flex: 0 0 17px;
        }

        .ielts-account__link:hover .ielts-account__icon,
        .ielts-account__link.is-active .ielts-account__icon,
        .ielts-account__logout:hover .ielts-account__icon {
            transform: translateX(-1px);
        }

        .ielts-account__icon--admin {
            border-color: #bfdbfe;
            background: #eff6ff;
            color: #2563eb;
        }

        .ielts-account__icon--profile {
            border-color: #ddd6fe;
            background: #f3efff;
            color: #4f46e5;
        }

        .ielts-account__icon--results {
            border-color: #bbf7d0;
            background: #dcfce7;
            color: #16a34a;
        }

        .ielts-account__icon--settings {
            border-color: #fed7aa;
            background: #fff7ed;
            color: #ea580c;
        }

        .ielts-account__icon--logout {
            border-color: #fecdd3;
            background: #fff1f2;
            color: #dc1431;
        }

        body.has-global-navbar > #profileRoot,
        body.has-global-navbar > main:first-of-type {
            scroll-margin-top: 82px;
        }

        @media (max-width: 1023px) and (min-width: 768px) {
            .ielts-navbar {
                grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
                gap: 16px;
                min-height: 84px;
                padding-inline: 24px;
            }

            .ielts-navbar__logo {
                width: 150px;
            }

            .ielts-navbar__links {
                gap: 10px;
            }

            .ielts-navbar__links a {
                padding: 8px 10px;
                font-size: 15px;
            }

            .ielts-account__trigger {
                grid-template-columns: 44px minmax(74px, 108px) 10px;
                gap: 9px;
                min-height: 50px;
            }

            .ielts-account__avatar {
                width: 44px;
                height: 44px;
            }
        }

        @media (max-width: 767px) {
            .ielts-navbar {
                grid-template-columns: auto minmax(0, 1fr) auto;
                gap: 10px;
                min-height: 72px;
                padding-inline: 14px;
            }

            .ielts-navbar__brand {
                grid-column: 1;
            }

            .ielts-navbar__logo {
                width: 132px;
            }

            .ielts-navbar__menu-toggle {
                display: inline-flex;
                grid-column: 2;
            }

            .ielts-navbar__auth {
                grid-column: 3;
            }

            .ielts-navbar__links {
                position: absolute;
                top: calc(100% + 8px);
                right: 14px;
                left: 14px;
                z-index: 110;
                display: grid;
                grid-template-columns: 1fr;
                gap: 6px;
                width: auto;
                margin: 0;
                padding: 10px;
                border: 1px solid #e5e7eb;
                border-radius: 18px;
                background: #ffffff;
                box-shadow: 0 22px 48px rgba(7, 21, 71, 0.16);
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                transform: translateY(-6px);
                transition: opacity 180ms ease, visibility 180ms ease, transform 180ms ease;
            }

            .ielts-navbar.is-menu-open .ielts-navbar__links {
                opacity: 1;
                visibility: visible;
                pointer-events: auto;
                transform: translateY(0);
            }

            .ielts-navbar__links a {
                width: 100%;
                padding: 12px 14px;
                text-align: center;
            }

            .ielts-account__trigger {
                grid-template-columns: 42px;
                min-width: 0;
                padding: 0;
                background: transparent;
                box-shadow: none;
            }

            .ielts-account__avatar {
                width: 42px;
                height: 42px;
                font-size: 14px;
            }

            .ielts-account__name,
            .ielts-account__chevron {
                display: none;
            }

            .ielts-account__dropdown {
                right: -2px;
                width: min(214px, calc(100vw - 28px));
            }
        }`;

        document.head.appendChild(style);
    }

    function renderLoggedOutAuth() {
        return "";
    }

    const MENU_ICONS = {
        admin: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="2.5" width="17" height="19" rx="2"/><path d="M16.5 2.5v4"/><path d="M7.5 2.5v4"/><path d="M3.5 9.5h17"/></svg>`,
        profile: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20c0-4.4183 2.6863-8 6-8s6 3.5817 6 8"/></svg>`,
        results: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2.5h17v19h-17z"/><path d="M7 10l3 3 6-6"/></svg>`,
        settings: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v4m10.5-8.5h-6m-6 0h-6M19.07 4.93l-4.24 4.24m-5.66 5.66l-4.24 4.24M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24"/></svg>`,
        logout: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 0h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4m-7-4l6-6m-6 6l6-6" transform="translate(-3, 0)"/></svg>`
    };

    function renderLoggedInAuth(auth) {
        const user = auth.user || {};
        const initial = getInitial(user);
        const username = escapeHtml(user.username || "User");
        const path = String(window.location.pathname || "").toLowerCase();
        const hash = String(window.location.hash || "").toLowerCase();
        const profileActive = path.includes("profile.html") && hash !== "#results";
        const resultsActive = path.includes("profile.html") && hash === "#results";
        const settingsActive = path.includes("profile-settings");
        const adminLink = user.role === "admin"
            ? `<a class="ielts-account__link ielts-account__admin" href="/admin"><span class="ielts-account__icon ielts-account__icon--admin">${MENU_ICONS.admin}</span>Admin Panel</a>`
            : "";

        return `
            <div class="ielts-account" id="ieltsAccount">
                <button class="ielts-account__trigger" id="ieltsAccountTrigger" type="button" aria-expanded="false" aria-controls="ieltsAccountDropdown" aria-label="${username} profile menu">
                    <span class="ielts-account__avatar" aria-hidden="true">${initial}</span>
                    <span class="ielts-account__name">${username}</span>
                    <span class="ielts-account__chevron" aria-hidden="true">⌄</span>
                </button>
                <div class="ielts-account__dropdown" id="ieltsAccountDropdown">
                    ${adminLink}
                    <a class="ielts-account__link ${profileActive ? "is-active" : ""}" href="/profile.html"><span class="ielts-account__icon ielts-account__icon--profile">${MENU_ICONS.profile}</span>Profile</a>
                    <a class="ielts-account__link ${resultsActive ? "is-active" : ""}" href="/profile.html#results"><span class="ielts-account__icon ielts-account__icon--results">${MENU_ICONS.results}</span>Results</a>
                    <a class="ielts-account__link ${settingsActive ? "is-active" : ""}" href="/profile-settings.html"><span class="ielts-account__icon ielts-account__icon--settings">${MENU_ICONS.settings}</span>Settings</a>
                    <button class="ielts-account__logout" type="button" id="logoutBtn"><span class="ielts-account__icon ielts-account__icon--logout">${MENU_ICONS.logout}</span>Logout</button>
                </div>
            </div>
        `;
    }

    function bindDropdown(host) {
        const account = host.querySelector("#ieltsAccount");
        const trigger = host.querySelector("#ieltsAccountTrigger");
        const logoutBtn = host.querySelector("#logoutBtn");

        if (trigger && account) {
            trigger.addEventListener("click", (event) => {
                event.stopPropagation();
                const isOpen = account.classList.toggle("is-open");
                trigger.setAttribute("aria-expanded", String(isOpen));
            });

            account.addEventListener("click", (event) => {
                event.stopPropagation();
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener("click", async () => {
                try {
                    await apiFetch("/api/auth/logout", { method: "POST" });
                } catch {}
                clearAuth();
                window.location.href = "/";
            });
        }
    }

    function bindMobileMenu(host) {
        const toggle = host.querySelector("#ieltsNavbarMenuToggle");
        const links = host.querySelector("#ieltsNavbarLinks");

        if (!toggle || !links) {
            return;
        }

        const setOpen = (isOpen) => {
            host.classList.toggle("is-menu-open", isOpen);
            toggle.setAttribute("aria-expanded", String(isOpen));

            if (isOpen && window.innerWidth < 768) {
                links.style.opacity = "1";
                links.style.visibility = "visible";
                links.style.pointerEvents = "auto";
                links.style.transform = "translateY(0)";
            } else {
                links.style.removeProperty("opacity");
                links.style.removeProperty("visibility");
                links.style.removeProperty("pointer-events");
                links.style.removeProperty("transform");
            }
        };

        toggle.addEventListener("click", (event) => {
            event.stopPropagation();
            setOpen(!host.classList.contains("is-menu-open"));
        });

        links.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => setOpen(false));
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth >= 768) {
                setOpen(false);
            }
        });
    }

    function closeOpenMenus() {
        document.querySelectorAll(".ielts-navbar.is-menu-open").forEach((navbar) => {
            navbar.classList.remove("is-menu-open");
            navbar.querySelector(".ielts-navbar__menu-toggle")?.setAttribute("aria-expanded", "false");
        });
    }

    function closeOpenDropdowns() {
        document.querySelectorAll(".ielts-account.is-open").forEach((account) => {
            account.classList.remove("is-open");
            account.querySelector(".ielts-account__trigger")?.setAttribute("aria-expanded", "false");
        });
    }

    function renderGlobalNavbar() {
        if (!document.body || document.body.hasAttribute("data-skip-global-navbar")) {
            ensureNavbarStyles();
            return;
        }

        ensureNavbarStyles();
        replaceLegacyNavbarHost();

        const host = ensureNavbarHost();
        const auth = getAuth();
        const active = currentPageName();

        host.innerHTML = `
            <a class="ielts-navbar__brand" href="/" aria-label="IELTS Prep home">
                <span class="ielts-navbar__logo" alt="IELTSX.org">IELTSX</span>
            </a>
            <button class="ielts-navbar__menu-toggle" id="ieltsNavbarMenuToggle" type="button" aria-expanded="false" aria-controls="ieltsNavbarLinks" aria-label="Open navigation menu">
                <span class="ielts-navbar__menu-toggle-lines" aria-hidden="true"></span>
            </button>
            <nav class="ielts-navbar__links" id="ieltsNavbarLinks" aria-label="Main navigation">
                <a class="${active === "home" ? "is-active" : ""}" href="/">Home</a>
                <a class="${active === "listening" ? "is-active" : ""}" href="/listening.html">Listening</a>
                <a class="${active === "reading" ? "is-active" : ""}" href="/reading.html">Reading</a>
            </nav>
            <div class="ielts-navbar__auth">
                ${auth?.token ? renderLoggedInAuth(auth) : renderLoggedOutAuth()}
            </div>
        `;

        bindDropdown(host);
        bindMobileMenu(host);
        document.body.classList.add("has-global-navbar");
        scheduleSiteReady();
    }

    window.authClient = {
        getAuth,
        saveAuth,
        clearAuth,
        redirectIfAuthenticated,
        verifyStoredSession,
        getUserProgress,
        getUserStats,
        recordTestResult,
        updateProfilePreferences,
        renderGlobalNavbar
    };
    document.documentElement.setAttribute("data-auth-client-ready", "true");

    document.addEventListener("click", () => {
        closeOpenDropdowns();
        closeOpenMenus();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeOpenDropdowns();
            closeOpenMenus();
        }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            renderGlobalNavbar();
            // Verify session, but don't block showing content if it fails
            verifyStoredSession().catch(() => {
                // Silently fail - user is already logged out
            });
        });
    } else {
        renderGlobalNavbar();
        // Verify session, but don't block showing content if it fails
        verifyStoredSession().catch(() => {
            // Silently fail - user is already logged out
        });
    }
}());
