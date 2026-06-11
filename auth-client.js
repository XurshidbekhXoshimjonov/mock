(function () {
    const AUTH_STORAGE_KEY = "ieltsmock.auth";
    const AUTH_COOKIE = "ieltsmockAuthToken";
    const TOKEN_DAYS = 7;

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

    function decodeTokenPayload(token) {
        if (!token || typeof token !== "string") {
            return null;
        }

        const [payload] = token.split(".");

        if (!payload) {
            return null;
        }

        try {
            const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
            const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), "=");
            return JSON.parse(atob(padded));
        } catch {
            return null;
        }
    }

    function normalizeStoredAuth(auth) {
        const token = typeof auth?.token === "string" ? auth.token.trim() : "";
        const user = auth?.user && typeof auth.user === "object" ? auth.user : null;

        if (!token || !user) {
            return null;
        }

        const payload = decodeTokenPayload(token);

        if (!payload?.exp || Number(payload.exp) <= Date.now()) {
            return null;
        }

        const payloadUserId = String(payload.id || "");
        const storedUserId = String(user.id || user._id || "");

        if (payloadUserId && storedUserId && payloadUserId !== storedUserId) {
            return null;
        }

        return {
            token,
            user,
            savedAt: auth.savedAt
        };
    }

    function setAuthCookie(token) {
        const maxAge = TOKEN_DAYS * 24 * 60 * 60;
        document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
    }

    function clearAuthCookie() {
        document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; samesite=lax`;
    }

    function getAuthState() {
        const auth = normalizeStoredAuth(readStorage());

        if (!auth) {
            removeStorage();
            clearAuthCookie();
            return {
                isAuthenticated: false,
                auth: null,
                user: null
            };
        }

        return {
            isAuthenticated: true,
            auth,
            user: auth.user
        };
    }

    function getAuth() {
        return getAuthState().auth;
    }

    function saveAuth(auth) {
        const saved = normalizeStoredAuth({
            token: auth?.token,
            user: auth?.user,
            savedAt: new Date().toISOString()
        });

        if (!saved) {
            clearAuth();
            return null;
        }

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
            const data = await apiFetch("/api/auth/me");
            const nextAuth = {
                ...auth,
                user: data.user
            };

            writeStorage(nextAuth);
            setAuthCookie(nextAuth.token);
            renderGlobalNavbar();
            return data.user;
        } catch (error) {
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
        if (path.includes("speaking")) return "speaking";
        if (path.includes("writing")) return "writing";
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
            color: #0057ff;
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
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 12px;
            justify-self: end;
            min-width: 0;
        }

        .ielts-navbar__button {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            border-radius: 999px;
            padding: 0 20px;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            outline: none;
            transition:
                background 180ms ease,
                box-shadow 220ms ease,
                color 180ms ease,
                transform 220ms ease;
        }

        .ielts-navbar__button--login {
            color: #172554;
            overflow: hidden;
            padding-inline: 16px;
        }

        .ielts-navbar__button--login::after {
            position: absolute;
            right: 16px;
            bottom: 7px;
            left: 16px;
            height: 2px;
            border-radius: 999px;
            background: linear-gradient(135deg, #0057ff, #7c3aed);
            content: "";
            opacity: 0;
            transform: scaleX(0.45);
            transform-origin: center;
            transition: opacity 180ms ease, transform 220ms ease;
        }

        .ielts-navbar__button--login:hover {
            background: #eef2ff;
            color: #0057ff;
        }

        .ielts-navbar__button--login:hover::after,
        .ielts-navbar__button--login:focus-visible::after {
            opacity: 1;
            transform: scaleX(1);
        }

        .ielts-navbar__button--signup {
            background: linear-gradient(135deg, #0057ff 0%, #252c8f 100%);
            color: #fff;
            box-shadow:
                0 12px 28px rgba(0, 87, 255, 0.24),
                inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }

        .ielts-navbar__button--signup:hover {
            box-shadow:
                0 16px 34px rgba(0, 87, 255, 0.34),
                inset 0 1px 0 rgba(255, 255, 255, 0.22);
            transform: translateY(-2px);
        }

        .ielts-navbar__button--login:focus-visible,
        .ielts-navbar__button--signup:focus-visible {
            box-shadow:
                0 0 0 3px rgba(255, 255, 255, 0.95),
                0 0 0 5px rgba(0, 87, 255, 0.48);
        }

        .ielts-navbar__button--signup:focus-visible {
            transform: translateY(-1px);
        }

        .ielts-navbar__button:active {
            transform: translateY(0);
        }

        .ielts-navbar__button--signup:active {
            box-shadow:
                0 8px 18px rgba(0, 87, 255, 0.24),
                inset 0 2px 5px rgba(15, 23, 42, 0.24);
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
            color: #252c8f;
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
            border-color: #dde3f5;
            background: #eef2ff;
            color: #252c8f;
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
                gap: 8px;
            }

            .ielts-navbar__button {
                min-height: 38px;
                padding-inline: 12px;
                font-size: 13px;
            }

            .ielts-navbar__button--login {
                padding-inline: 10px;
            }

            .ielts-navbar__button--login::after {
                right: 10px;
                bottom: 6px;
                left: 10px;
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
        return `
            <a class="ielts-navbar__button ielts-navbar__button--login" href="login.html">Login</a>
            <a class="ielts-navbar__button ielts-navbar__button--signup" href="signup.html">Sign Up</a>
        `;
    }

    const MENU_ICONS = {
        admin: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"></rect><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"></rect><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"></rect><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"></rect></svg>`,
        profile: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.7"></circle><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"></path></svg>`,
        results: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5h17"></path><path d="M5.5 17.5v-5"></path><path d="M10.5 17.5v-9"></path><path d="M15.5 17.5v-4"></path><path d="M19.5 17.5V6.5"></path></svg>`,
        settings: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 21v-6.5"></path><path d="M4.5 10.5V3"></path><path d="M12 21v-9"></path><path d="M12 8V3"></path><path d="M19.5 21v-5.5"></path><path d="M19.5 11.5V3"></path><path d="M2.5 14.5h4"></path><path d="M10 8h4"></path><path d="M17.5 15.5h4"></path></svg>`,
        logout: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 20.5h-4a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h4"></path><path d="M16 16.5 20.5 12 16 7.5"></path><path d="M20.5 12h-11"></path></svg>`
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
                    <a class="ielts-account__link ${profileActive ? "is-active" : ""}" href="profile.html"><span class="ielts-account__icon ielts-account__icon--profile">${MENU_ICONS.profile}</span>My Profile</a>
                    <a class="ielts-account__link ${resultsActive ? "is-active" : ""}" href="profile.html#results"><span class="ielts-account__icon ielts-account__icon--results">${MENU_ICONS.results}</span>My Results</a>
                    <a class="ielts-account__link ${settingsActive ? "is-active" : ""}" href="profile-settings.html"><span class="ielts-account__icon ielts-account__icon--settings">${MENU_ICONS.settings}</span>Settings</a>
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
                window.location.href = "ieltsmock.html";
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
        const authState = getAuthState();
        const active = currentPageName();

        host.innerHTML = `
            <a class="ielts-navbar__brand" href="ieltsmock.html" aria-label="IELTS Prep home">
                <img class="ielts-navbar__logo" src="Rasm-logo.png" alt="IELTSX.org">
            </a>
            <button class="ielts-navbar__menu-toggle" id="ieltsNavbarMenuToggle" type="button" aria-expanded="false" aria-controls="ieltsNavbarLinks" aria-label="Open navigation menu">
                <span class="ielts-navbar__menu-toggle-lines" aria-hidden="true"></span>
            </button>
            <nav class="ielts-navbar__links" id="ieltsNavbarLinks" aria-label="Main navigation">
                <a class="${active === "home" ? "is-active" : ""}" href="ieltsmock.html">Home</a>
                <a class="${active === "listening" ? "is-active" : ""}" href="listening.html">Listening</a>
                <a class="${active === "reading" ? "is-active" : ""}" href="reading.html">Reading</a>
                <a class="${active === "speaking" ? "is-active" : ""}" href="speaking.html">Speaking</a>
                <a class="${active === "writing" ? "is-active" : ""}" href="writing.html">Writing</a>
            </nav>
            <div class="ielts-navbar__auth">
                ${authState.isAuthenticated ? renderLoggedInAuth(authState.auth) : renderLoggedOutAuth()}
            </div>
        `;

        bindDropdown(host);
        bindMobileMenu(host);
        document.body.classList.add("has-global-navbar");
        scheduleSiteReady();
    }

    window.authClient = {
        getAuth,
        getAuthState,
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
        document.addEventListener("DOMContentLoaded", renderGlobalNavbar);
    } else {
        renderGlobalNavbar();
    }
}());
