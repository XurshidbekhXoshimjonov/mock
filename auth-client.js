(function () {
    // Check and apply theme immediately to prevent FOUC
    const storedTheme = localStorage.getItem("ielts-theme") || "light";
    const path = window.location.pathname.toLowerCase();
    const isTestPage = path.includes("test1.html") || 
                       path.includes("reading-template.html") ||
                       path.includes("listening-template.html") ||
                       path.includes("full-test-player") ||
                       path.includes("listening-test1.html") ||
                       path.includes("full-listening-cdi.html");

    if (storedTheme === "dark" && !isTestPage) {
        if (document.body && document.body.hasAttribute("data-skip-global-navbar")) {
            document.documentElement.classList.remove("dark-theme");
        } else {
            document.documentElement.classList.add("dark-theme");
            if (document.body) {
                document.body.classList.add("dark-theme");
            } else {
                document.addEventListener("DOMContentLoaded", () => {
                    if (!document.body.hasAttribute("data-skip-global-navbar")) {
                        document.body.classList.add("dark-theme");
                    } else {
                        document.documentElement.classList.remove("dark-theme");
                    }
                });
            }
        }
    } else {
        document.documentElement.classList.remove("dark-theme");
        if (document.body) {
            document.body.classList.remove("dark-theme");
        } else {
            document.addEventListener("DOMContentLoaded", () => {
                document.body.classList.remove("dark-theme");
            });
        }
    }

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

    function getDisplayName(user) {
        return String(user?.name || user?.username || user?.email || "User").trim() || "User";
    }

    function getInitial(user) {
        return getDisplayName(user)
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
            const data = await apiFetch("/api/auth/me", {
                credentials: "include",
                cache: "no-store"
            });
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

    function redirectIfAuthenticated(target = "/dashboard") {
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

    async function updateProfile(data) {
        const response = await apiFetch("/api/profile", {
            method: "PUT",
            body: JSON.stringify(data || {})
        });

        if (response && response.user) {
            saveAuth({
                token: getAuth()?.token,
                user: response.user
            });
        }

        return response;
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
        if (path.includes("profile") || path.includes("dashboard")) return "profile";
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
            filter: brightness(0) saturate(100%) invert(35%) sepia(94%) saturate(2250%) hue-rotate(218deg) brightness(96%) contrast(97%);
            transition: filter 280ms ease, opacity 280ms ease;
        }

        .ielts-navbar__logo:hover {
            filter: brightness(0) saturate(100%) invert(24%) sepia(92%) saturate(2745%) hue-rotate(219deg) brightness(95%) contrast(101%);
            opacity: 0.95;
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
            gap: 10px;
            justify-self: end;
            min-width: 0;
        }

        .ielts-navbar__button {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            border: 1px solid #0b5fff;
            border-radius: 10px;
            padding: 0 18px;
            font-size: 14px;
            font-weight: 700;
            text-decoration: none;
            outline: none;
            transition:
                background 180ms ease,
                border-color 180ms ease,
                box-shadow 220ms ease,
                color 180ms ease;
        }

        .ielts-navbar__button--login {
            background: transparent;
            color: #0b5fff;
        }

        .ielts-navbar__button--login:hover {
            background: #0b5fff;
            color: #ffffff;
        }

        .ielts-navbar__button--signup {
            background: #0b5fff;
            color: #ffffff;
            box-shadow: 0 10px 22px rgba(11, 95, 255, 0.22);
        }

        .ielts-navbar__button--signup:hover {
            background: #0046d8;
            border-color: #0046d8;
            box-shadow: 0 12px 26px rgba(11, 95, 255, 0.28);
        }

        .ielts-navbar__button--login:focus-visible,
        .ielts-navbar__button--signup:focus-visible {
            box-shadow:
                0 0 0 3px rgba(255, 255, 255, 0.95),
                0 0 0 5px rgba(0, 87, 255, 0.48);
        }

        .ielts-navbar__button--signup:active {
            background: #003bb8;
            border-color: #003bb8;
            box-shadow: 0 8px 18px rgba(11, 95, 255, 0.24);
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
        }

            /* Theme toggle button styling (smaller, to the left of profile/auth buttons) */
            .ielts-theme-toggle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 38px;
                height: 38px;
                border: 1px solid #dbe3ef;
                border-radius: 12px;
                background: #ffffff;
                color: #071547;
                cursor: pointer;
                transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
                padding: 0;
                margin-right: 12px;
                flex-shrink: 0;
            }
            .ielts-theme-toggle:hover {
                border-color: #bfdbfe;
                background: #f8fbff;
                transform: scale(1.05);
            }
            .ielts-theme-toggle:active {
                transform: scale(0.95);
            }
            .ielts-theme-toggle svg {
                width: 18px;
                height: 18px;
                transition: transform 300ms ease;
            }
            .ielts-theme-toggle:hover svg {
                transform: rotate(20deg);
            }

            /* Dark Theme Navbar Overrides */
            body.dark-theme .ielts-navbar {
                background: #08081b;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            }
            body.dark-theme .ielts-navbar__brand {
                color: #ffffff;
            }

            body.dark-theme .ielts-navbar__links a {
                color: #94a3b8;
            }
            body.dark-theme .ielts-navbar__links a:hover,
            body.dark-theme .ielts-navbar__links a.is-active {
                background: rgba(59, 130, 246, 0.15);
                color: #60a5fa;
            }
            body.dark-theme .ielts-navbar__menu-toggle {
                border-color: rgba(255, 255, 255, 0.15);
                background: #0a0a24;
                color: #f1f5f9;
            }
            body.dark-theme .ielts-navbar__menu-toggle:hover {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.25);
            }
            body.dark-theme .ielts-navbar__button--login {
                color: #60a5fa;
                border-color: #3b82f6;
            }
            body.dark-theme .ielts-navbar__button--login:hover {
                background: #3b82f6;
                color: #ffffff;
            }
            body.dark-theme .ielts-navbar__button--signup {
                background: #3b82f6;
                border-color: #3b82f6;
                color: #ffffff;
            }
            body.dark-theme .ielts-navbar__button--signup:hover {
                background: #2563eb;
                border-color: #2563eb;
            }
            body.dark-theme .ielts-theme-toggle {
                border-color: rgba(255, 255, 255, 0.15);
                background: #0a0a24;
                color: #f1f5f9;
            }
            body.dark-theme .ielts-theme-toggle:hover {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.25);
            }
            body.dark-theme .ielts-account__trigger {
                background: linear-gradient(135deg, #0a0a24 0%, #0d0d30 100%);
                color: #f1f5f9;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
            }
            body.dark-theme .ielts-account__avatar {
                background: #3b82f6;
                color: #ffffff;
            }
            body.dark-theme .ielts-account__dropdown {
                border-color: rgba(255, 255, 255, 0.08);
                background: #08081b;
                box-shadow: 0 22px 48px rgba(0, 0, 0, 0.4);
            }
            body.dark-theme .ielts-account__link,
            body.dark-theme .ielts-account__logout {
                color: #f1f5f9;
            }
            body.dark-theme .ielts-account__link:hover,
            body.dark-theme .ielts-account__logout:hover {
                background: rgba(255, 255, 255, 0.05);
            }
            body.dark-theme .ielts-account__link.is-active {
                background: rgba(59, 130, 246, 0.15);
                color: #60a5fa;
            }
        }`;

        document.head.appendChild(style);
    }

    function renderLoggedOutAuth() {
        return `
            <a class="ielts-navbar__button ielts-navbar__button--login" href="/login">Login</a>
            <a class="ielts-navbar__button ielts-navbar__button--signup" href="/signup">Sign Up</a>
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
        const displayName = escapeHtml(getDisplayName(user));
        const path = String(window.location.pathname || "").toLowerCase();
        const hash = String(window.location.hash || "").toLowerCase();
        const profileActive = (path.includes("profile.html") || path.includes("/dashboard")) && hash !== "#results";
        const resultsActive = (path.includes("profile.html") || path.includes("/dashboard")) && hash === "#results";
        const settingsActive = path.includes("profile-settings");
        const adminLink = user.role === "admin"
            ? `<a class="ielts-account__link ielts-account__admin" href="/admin"><span class="ielts-account__icon ielts-account__icon--admin">${MENU_ICONS.admin}</span>Admin Panel</a>`
            : "";

        const avatarHtml = user.avatar
            ? `<img class="ielts-account__avatar-img" src="${escapeHtml(user.avatar)}" alt="${displayName}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;" />`
            : initial;

        return `
            <div class="ielts-account" id="ieltsAccount">
                <button class="ielts-account__trigger" id="ieltsAccountTrigger" type="button" aria-expanded="false" aria-controls="ieltsAccountDropdown" aria-label="${displayName} profile menu">
                    <span class="ielts-account__avatar" aria-hidden="true" style="overflow:hidden;">${avatarHtml}</span>
                    <span class="ielts-account__name">${displayName}</span>
                    <span class="ielts-account__chevron" aria-hidden="true">⌄</span>
                </button>
                <div class="ielts-account__dropdown" id="ieltsAccountDropdown">
                    ${adminLink}
                    <a class="ielts-account__link ${profileActive ? "is-active" : ""}" href="/dashboard"><span class="ielts-account__icon ielts-account__icon--profile">${MENU_ICONS.profile}</span>My Profile</a>
                    <a class="ielts-account__link ${resultsActive ? "is-active" : ""}" href="/dashboard#results"><span class="ielts-account__icon ielts-account__icon--results">${MENU_ICONS.results}</span>My Results</a>
                    <a class="ielts-account__link ${settingsActive ? "is-active" : ""}" href="/profile-settings"><span class="ielts-account__icon ielts-account__icon--settings">${MENU_ICONS.settings}</span>Settings</a>
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

    function bindThemeToggle(host) {
        const toggleBtn = host.querySelector("#ieltsThemeToggle");
        if (!toggleBtn) return;

        toggleBtn.addEventListener("click", () => {
            const currentTheme = localStorage.getItem("ielts-theme") || "light";
            const newTheme = currentTheme === "dark" ? "light" : "dark";

            localStorage.setItem("ielts-theme", newTheme);

            if (newTheme === "dark") {
                document.documentElement.classList.add("dark-theme");
                document.body.classList.add("dark-theme");
            } else {
                document.documentElement.classList.remove("dark-theme");
                document.body.classList.remove("dark-theme");
            }

            // Re-render navbar to update theme icon
            renderGlobalNavbar();
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

    let isFetchingAuthMe = false;

    function runNavbarAuthCheck() {
        if (isFetchingAuthMe) return;
        isFetchingAuthMe = true;

        console.log("NAVBAR_AUTH_CHECK_STARTED");

        fetch("/api/auth/me", {
            credentials: "include",
            cache: "no-store"
        })
        .then(response => {
            console.log("NAVBAR_ME_STATUS:", response.status);
            if (response.status === 401) {
                console.log("NAVBAR_RENDER_GUEST");
                clearAuth();
                updateNavbarAuthState(false, null);
                isFetchingAuthMe = false;
                return null;
            }
            if (!response.ok) {
                throw new Error("HTTP error " + response.status);
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            console.log("NAVBAR_ME_RESPONSE:", data);
            if (data.success && data.user) {
                console.log("NAVBAR_RENDER_USER", data.user);
                
                // Sync to localStorage
                const auth = getAuth() || {};
                const nextAuth = {
                    token: auth.token || "",
                    user: data.user,
                    savedAt: new Date().toISOString()
                };
                writeStorage(nextAuth);

                updateNavbarAuthState(true, nextAuth);
            } else {
                console.log("NAVBAR_RENDER_GUEST");
                clearAuth();
                updateNavbarAuthState(false, null);
            }
            isFetchingAuthMe = false;
        })
        .catch(err => {
            console.error("Error in navbar auth check:", err);
            console.log("NAVBAR_RENDER_GUEST");
            clearAuth();
            updateNavbarAuthState(false, null);
            isFetchingAuthMe = false;
        });
    }

    function updateNavbarAuthState(isAuthenticated, authData) {
        const authContainer = document.querySelector(".ielts-navbar__auth");
        if (!authContainer) return;

        const currentTheme = localStorage.getItem("ielts-theme") || "light";
        const isDark = currentTheme === "dark";
        const toggleHtml = `
            <button class="ielts-theme-toggle" id="ieltsThemeToggle" type="button" aria-label="Toggle theme">
                ${isDark ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="4"></circle>
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
                    </svg>
                ` : `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                    </svg>
                `}
            </button>
        `;

        authContainer.innerHTML = `
            ${toggleHtml}
            ${isAuthenticated ? renderLoggedInAuth(authData) : renderLoggedOutAuth()}
        `;

        const host = ensureNavbarHost();
        bindDropdown(host);
        bindThemeToggle(host);
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

        const currentTheme = localStorage.getItem("ielts-theme") || "light";
        const isDark = currentTheme === "dark";
        const toggleHtml = `
            <button class="ielts-theme-toggle" id="ieltsThemeToggle" type="button" aria-label="Toggle theme">
                ${isDark ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="4"></circle>
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
                    </svg>
                ` : `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                    </svg>
                `}
            </button>
        `;

        host.innerHTML = `
            <a class="ielts-navbar__brand" href="/" aria-label="IELTSX home">
                <svg class="ielts-navbar__logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 979 324" role="img" aria-label="ieltsx.org logo">
                    <path d="M 818 194 L 816 196 L 816 200 L 821 203 L 825 200 L 824 195 Z M 887 157 L 887 202 L 897 202 L 897 191 L 899 189 L 905 189 L 909 193 L 914 202 L 924 202 L 924 200 L 917 190 L 917 188 L 923 182 L 925 177 L 925 170 L 922 163 L 914 158 L 909 157 Z M 897 167 L 899 165 L 909 165 L 914 169 L 915 176 L 910 181 L 897 180 Z M 948 157 L 941 160 L 933 170 L 931 178 L 933 190 L 938 197 L 950 203 L 960 203 L 971 199 L 972 180 L 963 180 L 963 192 L 961 194 L 955 195 L 949 193 L 944 189 L 942 185 L 942 174 L 949 166 L 959 165 L 968 169 L 972 165 L 972 163 L 969 160 L 958 156 Z M 843 159 L 835 166 L 831 177 L 831 184 L 835 194 L 842 200 L 850 203 L 859 203 L 866 201 L 873 196 L 878 186 L 878 173 L 875 167 L 871 162 L 861 157 L 855 156 Z M 851 165 L 861 166 L 868 175 L 867 187 L 863 192 L 857 195 L 848 193 L 844 189 L 841 182 L 843 172 Z M 698 157 L 734 202 L 806 202 L 736 118 L 725 126 L 711 140 Z M 296 49 L 296 83 L 335 84 L 335 204 L 373 204 L 374 83 L 406 82 L 412 83 L 413 49 Z M 207 49 L 207 204 L 309 204 L 309 171 L 245 170 L 245 49 Z M 71 49 L 71 204 L 186 204 L 185 171 L 108 170 L 109 143 L 169 142 L 169 110 L 108 108 L 108 84 L 110 82 L 184 82 L 184 49 Z M 6 49 L 6 204 L 44 204 L 44 49 Z M 476 46 L 458 51 L 450 55 L 442 61 L 436 68 L 431 77 L 428 90 L 430 108 L 436 120 L 449 131 L 472 140 L 492 145 L 502 150 L 507 156 L 508 159 L 507 165 L 503 170 L 496 173 L 476 174 L 459 170 L 440 160 L 424 187 L 434 195 L 446 201 L 458 205 L 479 208 L 499 207 L 514 203 L 524 198 L 534 190 L 539 183 L 544 171 L 545 164 L 544 148 L 536 132 L 527 124 L 509 115 L 489 110 L 471 103 L 466 97 L 466 90 L 467 87 L 471 83 L 480 79 L 502 80 L 514 84 L 524 90 L 527 89 L 540 62 L 533 57 L 515 49 L 501 46 Z M 727 97 L 719 89 L 713 89 L 710 87 L 649 21 L 566 20 L 573 28 L 650 99 L 654 99 L 662 102 L 668 106 L 673 112 L 652 127 L 630 146 L 564 211 L 523 248 L 476 285 L 426 318 L 461 306 L 508 284 L 547 262 L 593 231 L 624 207 L 641 192 L 676 157 Z M 846 9 L 844 7 L 839 6 L 824 9 L 816 13 L 798 28 L 756 28 L 743 38 L 769 45 L 773 48 L 752 66 L 724 66 L 718 71 L 719 73 L 730 79 L 742 88 L 771 75 L 784 65 L 792 61 L 795 66 L 796 74 L 801 90 L 811 83 L 811 75 L 815 55 L 816 42 L 840 22 L 846 13 Z" fill="#000000" fill-rule="evenodd"/>
                </svg>
            </a>
            <button class="ielts-navbar__menu-toggle" id="ieltsNavbarMenuToggle" type="button" aria-expanded="false" aria-controls="ieltsNavbarLinks" aria-label="Open navigation menu">
                <span class="ielts-navbar__menu-toggle-lines" aria-hidden="true"></span>
            </button>
            <nav class="ielts-navbar__links" id="ieltsNavbarLinks" aria-label="Main navigation">
                <a class="${active === "home" ? "is-active" : ""}" href="/">Home</a>
                <a class="${active === "listening" ? "is-active" : ""}" href="/listening">Listening</a>
                <a class="${active === "reading" ? "is-active" : ""}" href="/reading">Reading</a>
                <a class="${active === "speaking" ? "is-active" : ""}" href="/speaking">Speaking</a>
                <a class="${active === "writing" ? "is-active" : ""}" href="/writing">Writing</a>
            </nav>
            <div class="ielts-navbar__auth">
                ${toggleHtml}
                ${authState.isAuthenticated ? renderLoggedInAuth(authState.auth) : renderLoggedOutAuth()}
            </div>
        `;

        bindDropdown(host);
        bindMobileMenu(host);
        bindThemeToggle(host);
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
        updateProfile,
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
    window.addEventListener("hashchange", renderGlobalNavbar);

    // Email click-to-copy handler
    document.addEventListener("click", (event) => {
        const mailtoLink = event.target.closest('a[href^="mailto:"]');
        if (mailtoLink) {
            const email = mailtoLink.getAttribute('href').replace('mailto:', '');
            navigator.clipboard.writeText(email).then(() => {
                showCopiedTooltip(mailtoLink);
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        }
    });

    function showCopiedTooltip(element) {
        if (element.querySelector('.copied-tooltip')) return;

        const tooltip = document.createElement('span');
        tooltip.className = 'copied-tooltip';
        tooltip.textContent = 'Copied!';
        tooltip.style.position = 'absolute';
        tooltip.style.background = 'rgba(0, 87, 255, 0.95)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '4px 8px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.fontWeight = '600';
        tooltip.style.left = '50%';
        tooltip.style.bottom = '100%';
        tooltip.style.transform = 'translate(-50%, -8px)';
        tooltip.style.opacity = '0';
        tooltip.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.zIndex = '1000';
        tooltip.style.boxShadow = '0 4px 12px rgba(0, 87, 255, 0.25)';

        const originalPosition = window.getComputedStyle(element).position;
        if (originalPosition === 'static') {
            element.style.position = 'relative';
        }

        element.appendChild(tooltip);

        requestAnimationFrame(() => {
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translate(-50%, -12px)';
        });

        setTimeout(() => {
            tooltip.style.opacity = '0';
            tooltip.style.transform = 'translate(-50%, -8px)';
            setTimeout(() => {
                tooltip.remove();
                if (originalPosition === 'static') {
                    element.style.position = '';
                }
            }, 200);
        }, 1800);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            renderGlobalNavbar();
            runNavbarAuthCheck();
        });
    } else {
        renderGlobalNavbar();
        runNavbarAuthCheck();
    }
}());
