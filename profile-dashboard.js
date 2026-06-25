(function () {
    const e = React.createElement;
    const { useState } = React;
    const root = document.getElementById("profileRoot");
    const page = document.body.dataset.profilePage || "dashboard";

    const emptyProgress = {
        targetBand: null,
        overallBand: 0,
        readingBand: 0,
        listeningBand: 0,
        testsCompleted: 0,
        accuracy: 0,
        bestScore: null,
        bestAccuracy: 0,
        totalQuestions: 0,
        averageReadingScore: null,
        averageListeningScore: null,
        lastPracticeDate: null,
        testHistory: [],
        activities: [],
        charts: {
            weeklyActivity: [],
            readingProgress: [],
            listeningProgress: [],
            bandTrend: []
        }
    };
    const emptyWriting = {
        summary: {
            totalAttempts: 0,
            task1Attempts: 0,
            task2Attempts: 0,
            fullAttempts: 0,
            averageBand: 0,
            bestBand: 0,
            latestBand: 0
        },
        recent: []
    };
    const emptySpeaking = {
        summary: {
            totalAttempts: 0,
            part1Attempts: 0,
            cueCardAttempts: 0,
            part3Attempts: 0,
            fullAttempts: 0,
            averageBand: 0,
            bestBand: 0,
            latestBand: 0
        },
        recent: []
    };
    const emptyMockTests = {
        completedMockTests: 0,
        bestOverallBand: 0,
        lastResult: null,
        breakdown: {
            listening: 0,
            reading: 0,
            writing: 0,
            speaking: 0
        },
        chart: [],
        recent: []
    };

    function Icon({ name, className }) {
        const common = {
            className: className || "h-5 w-5",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeLinejoin: "round"
        };
        const paths = {
            user: [e("path", { d: "M20 21a8 8 0 0 0-16 0", key: 1 }), e("circle", { cx: 12, cy: 7, r: 4, key: 2 })],
            chart: [e("path", { d: "M3 3v18h18", key: 1 }), e("path", { d: "M7 15l4-4 3 3 5-7", key: 2 })],
            book: [e("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20", key: 1 }), e("path", { d: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z", key: 2 })],
            clock: [e("circle", { cx: 12, cy: 12, r: 9, key: 1 }), e("path", { d: "M12 7v5l3 2", key: 2 })],
            award: [e("circle", { cx: 12, cy: 8, r: 5, key: 1 }), e("path", { d: "M8.5 12.5 7 22l5-3 5 3-1.5-9.5", key: 2 })],
            settings: [e("circle", { cx: 12, cy: 12, r: 3, key: 1 }), e("path", { d: "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4L14 21h-4l-1-1.6a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15L3 14v-4l1.6-1a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6L10 3h4l1 1.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9L21 10v4z", key: 2 })],
            target: [e("circle", { cx: 12, cy: 12, r: 9, key: 1 }), e("circle", { cx: 12, cy: 12, r: 4, key: 2 }), e("path", { d: "M12 3v3M21 12h-3", key: 3 })],
            calendar: [e("rect", { x: 3, y: 5, width: 18, height: 16, rx: 2, key: 1 }), e("path", { d: "M16 3v4M8 3v4M3 10h18", key: 2 })],
            headphones: [e("path", { d: "M3 14v-2a9 9 0 0 1 18 0v2", key: 1 }), e("path", { d: "M5 14h3v6H5zM16 14h3v6h-3z", key: 2 })],
            pen: [e("path", { d: "M12 20h9", key: 1 }), e("path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z", key: 2 })],
            mic: [e("path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z", key: 1 }), e("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2", key: 2 }), e("path", { d: "M12 19v3", key: 3 }), e("path", { d: "M8 22h8", key: 4 })],
            arrow: [e("path", { d: "M5 12h14M13 6l6 6-6 6", key: 1 })]
        };
        return e("svg", common, paths[name] || paths.user);
    }

    function getAuthUser() {
        const authState = window.authClient && window.authClient.getAuthState();
        return authState?.isAuthenticated ? authState.user : null;
    }

    async function fetchProfileAttemptDetail(kind, attempt) {
        if (!attempt?.id) return attempt;
        try {
            const response = await fetch(`/api/profile/${kind}/${encodeURIComponent(attempt.id)}`, {
                method: "GET",
                credentials: "include",
                cache: "no-store"
            });
            if (!response.ok) throw new Error(`Could not load ${kind} feedback`);
            return await response.json();
        } catch (error) {
            console.error(`Profile ${kind} feedback fetch error:`, error);
            return attempt;
        }
    }

    function initials(name) {
        return String(name || "User")
            .split(/[\s._-]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0].toUpperCase())
            .join("") || "U";
    }

    function memberIdLabel(user) {
        const isAdmin = user?.role === "admin";
        const memberId = user?.memberId || (user?.memberIdNumber ? String(user.memberIdNumber).padStart(3, "0") : (isAdmin ? "001" : ""));
        return memberId ? `ID: ${memberId}` : "";
    }

    function formatBand(value) {
        return Number(value || 0).toFixed(1);
    }

    function roundHalfBand(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return Math.round(numeric * 2) / 2;
    }

    function formatDate(value, fallback = "No practice yet") {
        if (!value) return fallback;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return fallback;
        return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }

    function practiceHref(test) {
        if (test?.practiceUrl) return test.practiceUrl;
        if (test?.skill === "listening") return "listening.html";
        if (test?.skill === "reading") return "reading.html";
        return "ieltsmock.html";
    }

    function averageValue(items) {
        const values = items.map(Number).filter(Number.isFinite);
        if (!values.length) return 0;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function sortedByDate(items, dateKey) {
        return (Array.isArray(items) ? items : [])
            .slice()
            .sort((a, b) => new Date(b?.[dateKey] || 0) - new Date(a?.[dateKey] || 0));
    }

    function skillAttempts(stats, skill) {
        return sortedByDate((stats.testHistory || []).filter((test) => test.skill === skill), "completedAt");
    }

    function summarizeObjectiveSkill(stats, skill) {
        const attempts = skillAttempts(stats, skill);
        const bands = attempts.map((attempt) => Number(attempt.band)).filter(Number.isFinite);
        const latest = attempts[0] || null;

        return {
            attempts,
            totalAttempts: attempts.length,
            averageBand: bands.length ? averageValue(bands) : 0,
            bestBand: bands.length ? Math.max(...bands) : 0,
            latestBand: latest ? Number(latest.band || 0) : 0,
            latestResult: latest ? `Band ${formatBand(latest.band)}` : "No result",
            lastActivityDate: latest?.completedAt || null,
            averageScore: attempts.length ? Math.round(averageValue(attempts.map((attempt) => attempt.accuracy))) : null
        };
    }

    function writingOverview(writing) {
        const data = writing || emptyWriting;
        const summary = { ...emptyWriting.summary, ...(data.summary || {}) };
        const recent = sortedByDate(Array.isArray(data.recent) ? data.recent : [], "createdAt");
        const latest = recent[0] || null;

        return {
            summary,
            recent,
            totalAttempts: summary.totalAttempts || 0,
            averageBand: Number(summary.averageBand || 0),
            bestBand: Number(summary.bestBand || 0),
            latestBand: Number(summary.latestBand || 0),
            latestResult: summary.totalAttempts ? `Band ${formatBand(summary.latestBand)}` : "No result",
            lastActivityDate: latest?.createdAt || null
        };
    }

    function speakingOverview(stats) {
        const payload = stats.speaking || emptySpeaking;
        const explicitRecent = Array.isArray(payload.recent) ? payload.recent : [];
        const historyRecent = (stats.testHistory || []).filter((test) => test.skill === "speaking");
        const recent = sortedByDate(explicitRecent.length ? explicitRecent : historyRecent, explicitRecent.length ? "createdAt" : "completedAt");
        const summary = { ...emptySpeaking.summary, ...(payload.summary || {}) };
        const cueCardAttempts = summary.cueCardAttempts || recent.filter((attempt) => {
            const type = String(attempt.testType || attempt.type || attempt.title || "").toLowerCase();
            return type.includes("cue") || type.includes("part 2") || type.includes("part2");
        }).length;
        const fullAttempts = summary.fullAttempts || recent.filter((attempt) => {
            const type = String(attempt.testType || attempt.type || attempt.title || "").toLowerCase();
            return type.includes("full");
        }).length;
        const bands = recent
            .map((attempt) => Number(attempt.overallBand ?? attempt.band ?? attempt.estimatedBand))
            .filter(Number.isFinite);
        const latest = recent[0] || null;
        const latestBand = Number(summary.latestBand || latest?.overallBand || latest?.band || latest?.estimatedBand || 0);

        return {
            summary: {
                ...summary,
                totalAttempts: summary.totalAttempts || recent.length,
                cueCardAttempts,
                fullAttempts,
                averageBand: summary.averageBand || (bands.length ? averageValue(bands) : 0),
                bestBand: summary.bestBand || (bands.length ? Math.max(...bands) : 0),
                latestBand
            },
            recent,
            totalAttempts: summary.totalAttempts || recent.length,
            averageBand: summary.averageBand || (bands.length ? averageValue(bands) : 0),
            bestBand: summary.bestBand || (bands.length ? Math.max(...bands) : 0),
            latestBand,
            latestResult: (summary.totalAttempts || recent.length) ? `Band ${formatBand(latestBand)}` : "No result",
            lastActivityDate: latest?.createdAt || latest?.completedAt || null
        };
    }

    function speakingTypeLabel(type) {
        const normalized = String(type || "").toLowerCase();
        if (normalized === "part_1" || normalized.includes("part 1")) return "Speaking Part 1";
        if (normalized === "cue_card" || normalized.includes("cue") || normalized.includes("part 2")) return "Cue Card";
        if (normalized === "part_3" || normalized.includes("part 3")) return "Speaking Part 3";
        if (normalized === "full_test" || normalized.includes("full")) return "Full Speaking Test";
        return "Speaking";
    }

    function Card({ children, className, id }) {
        return e("section", {
            id,
            className: "rounded-[1.6rem] border border-slate-200/80 bg-white p-5 shadow-card transition duration-300 hover:border-blue-100 hover:shadow-xl " + (className || "")
        }, children);
    }

    function SectionTitle({ eyebrow, title, description, action }) {
        return e("div", { className: "mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" },
            e("div", null,
                eyebrow ? e("p", { className: "text-xs font-black uppercase tracking-[0.16em] text-blue-600" }, eyebrow) : null,
                e("h2", { className: "mt-1 text-xl font-black tracking-tight text-slate-950" }, title),
                description ? e("p", { className: "mt-1 text-sm leading-6 text-slate-500" }, description) : null
            ),
            action || null
        );
    }

    function BandRing({ score, label, accent = "#2563eb", ringClass, onClick, attempted = true, size = "standard" }) {
        const radius = 48;
        const circumference = 2 * Math.PI * radius;
        const progress = Math.min(Number(score || 0) / 9, 1) * circumference;
        const content = [
            e("svg", { key: "svg", width: 138, height: 138, viewBox: "0 0 132 132", className: "drop-shadow-sm" },
                e("circle", { cx: 66, cy: 66, r: radius, fill: "none", stroke: "#e8edf5", strokeWidth: 11, className: "band-ring-track" }),
                e("circle", {
                    cx: 66,
                    cy: 66,
                    r: radius,
                    fill: "none",
                    stroke: accent,
                    strokeWidth: 11,
                    strokeLinecap: "round",
                    strokeDasharray: `${progress} ${circumference}`,
                    transform: "rotate(-90 66 66)",
                    className: "band-ring-progress"
                }),
                e("text", { x: 66, y: 64, textAnchor: "middle", className: "fill-slate-950 text-3xl font-black band-ring-score" }, formatBand(score)),
                e("text", { x: 66, y: 84, textAnchor: "middle", className: "fill-slate-400 text-[10px] font-bold uppercase band-ring-text" }, "Band")
            ),
            e("p", { key: "label", className: "mt-1 text-sm font-bold text-slate-600 band-ring-label" }, label)
        ];

        return e(onClick ? "button" : "div", {
            type: onClick ? "button" : undefined,
            className: `relative flex flex-col items-center justify-center band-ring ${onClick ? "band-ring-button" : ""} ${size === "large" ? "band-ring-large" : ""} ${ringClass || ""}`,
            onClick,
            "aria-label": onClick ? `Open ${label}` : undefined
        }, content);
    }

    function Hero({ user, stats }) {
        const target = stats.targetBand === null ? "Not set" : formatBand(stats.targetBand);

        return e("section", { className: "profile-hero overflow-hidden rounded-[2rem] p-5 text-white shadow-card md:p-7" },
            e("div", { className: "relative z-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center" },
                e("div", { className: "flex items-center gap-4 md:gap-5" },
                    user.avatar
                        ? e("img", { src: user.avatar, alt: user.name || user.username, className: "flex h-20 w-20 shrink-0 rounded-[1.5rem] border border-white/20 object-cover shadow-2xl" })
                        : e("div", { className: "flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.5rem] border border-white/20 bg-white/15 text-2xl font-black shadow-2xl backdrop-blur" }, initials(user.name || user.username)),
                    e("div", { className: "min-w-0" },
                        e("p", { className: "text-xs font-bold uppercase tracking-[0.18em] text-blue-100" }, `IELTSX Performance Center | ${user.role || "user"}`),
                        e("h1", { className: "mt-2 break-words text-2xl font-black tracking-tight md:text-4xl" }, user.name || user.username),
                        e("p", { className: "mt-2 max-w-xl text-sm leading-6 text-blue-100" }, "Your completed tests, estimated bands, and study momentum in one place.")
                    )
                ),
                e("div", { className: "grid grid-cols-3 gap-2 rounded-[1.5rem] border border-white/15 bg-white/10 p-3 backdrop-blur" },
                    [
                        ["Estimated", formatBand(stats.overallBand)],
                        ["Target", target],
                        ["Completed", stats.testsCompleted || 0]
                    ].map(([label, value]) => e("div", { key: label, className: "rounded-2xl bg-white/10 px-3 py-4 text-center" },
                        e("p", { className: "text-[11px] font-bold uppercase tracking-wide text-blue-100" }, label),
                        e("p", { className: "mt-1 text-xl font-black md:text-2xl" }, value)
                    ))
                )
            )
        );
    }

    function ProfileCard({ user, stats }) {
        const idLabel = memberIdLabel(user);

        return e(Card, null,
            e(SectionTitle, {
                eyebrow: "Account",
                title: "Student Profile",
                description: "Your IELTSX learning account"
            }),
            e("div", { className: "flex items-center gap-4 rounded-2xl bg-slate-50 p-4" },
                user.avatar
                    ? e("img", { src: user.avatar, alt: user.name || user.username, className: "flex h-14 w-14 shrink-0 rounded-2xl object-cover shadow-sm" })
                    : e("div", { className: "flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-lg font-black text-white" }, initials(user.name || user.username)),
                e("div", { className: "min-w-0 flex-1" },
                    idLabel && e("p", { className: "mb-0.5 text-xs font-black uppercase tracking-wide text-blue-600" }, idLabel),
                    e("p", { className: "truncate font-black text-slate-950" }, user.name || user.username),
                    e("p", { className: "truncate text-[11px] font-bold uppercase tracking-wider text-slate-400" }, user.role || "user"),
                    e("p", { className: "truncate text-sm text-slate-500" }, user.email || "Email not provided")
                )
            ),
            e("div", { className: "mt-5 grid gap-3 text-sm" },
                e("div", { className: "flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3" }, e("span", { className: "text-slate-500" }, "Target band"), e("strong", null, stats.targetBand === null ? "Not set" : formatBand(stats.targetBand))),
                e("div", { className: "flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3" }, e("span", { className: "text-slate-500" }, "Last practice"), e("strong", { className: "text-right" }, formatDate(stats.lastPracticeDate)))
            ),
            e("a", { href: "profile-settings.html", className: "mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-blue-700" },
                e(Icon, { name: "settings", className: "h-4 w-4" }),
                "Profile settings"
            )
        );
    }

    function analyticsBands(stats) {
        const reading = summarizeObjectiveSkill(stats, "reading");
        const listening = summarizeObjectiveSkill(stats, "listening");
        const writing = writingOverview(stats.writing);
        const speaking = speakingOverview(stats);
        const availableBands = [
            listening.totalAttempts ? listening.averageBand : null,
            reading.totalAttempts ? reading.averageBand : null,
            writing.totalAttempts ? writing.averageBand : null,
            speaking.totalAttempts ? speaking.averageBand : null
        ].filter((value) => Number.isFinite(Number(value)));
        const overallBand = availableBands.length ? roundHalfBand(averageValue(availableBands)) : 0;

        return {
            overall: {
                key: "center",
                label: "Overall Band",
                score: overallBand,
                attempted: availableBands.length > 0,
                accent: "#071547",
                ringClass: "band-ring-overall"
            },
            skills: [
                {
                    key: "listening",
                    label: "Listening Band",
                    score: listening.totalAttempts ? listening.averageBand : 0,
                    attempted: listening.totalAttempts > 0,
                    accent: "#7c3aed",
                    ringClass: "band-ring-listening"
                },
                {
                    key: "reading",
                    label: "Reading Band",
                    score: reading.totalAttempts ? reading.averageBand : 0,
                    attempted: reading.totalAttempts > 0,
                    accent: "#2563eb",
                    ringClass: "band-ring-reading"
                },
                {
                    key: "writing",
                    label: "Writing Band",
                    score: writing.totalAttempts ? writing.averageBand : 0,
                    attempted: writing.totalAttempts > 0,
                    accent: "#e11d48",
                    ringClass: "band-ring-writing"
                },
                {
                    key: "speaking",
                    label: "Speaking Band",
                    score: speaking.totalAttempts ? speaking.averageBand : 0,
                    attempted: speaking.totalAttempts > 0,
                    accent: "#0ea5e9",
                    ringClass: "band-ring-speaking"
                }
            ]
        };
    }

    function PerformanceCard({ stats, onOpen }) {
        const bands = analyticsBands(stats);
        const progress = Math.round((bands.overall.score / 9) * 100);

        return e(Card, { className: "ielts-performance-card", id: "results" },
            e(SectionTitle, {
                eyebrow: "Live analytics",
                title: "IELTS Performance",
                description: "Band estimates calculated from completed Listening, Reading, Writing, and Speaking tests."
            }),
            e("div", { className: "performance-analytics-layout" },
                e("div", { className: "performance-overall-ring" },
                    e(BandRing, {
                        score: bands.overall.score,
                        label: bands.overall.label,
                        accent: bands.overall.accent,
                        ringClass: bands.overall.ringClass,
                        attempted: bands.overall.attempted,
                        size: "large",
                        onClick: () => onOpen?.(bands.overall.key)
                    })
                ),
                e("div", { className: "performance-skill-rings" },
                    bands.skills.map((band) => e(BandRing, {
                        key: band.key,
                        score: band.score,
                        label: band.label,
                        accent: band.accent,
                        ringClass: band.ringClass,
                        attempted: band.attempted,
                        onClick: () => onOpen?.(band.key)
                    }))
                )
            ),
            bands.overall.attempted
                ? e("div", { className: "mt-5 rounded-2xl bg-slate-50 p-4" },
                    e("div", { className: "flex items-center justify-between text-sm font-bold" },
                        e("span", { className: "text-slate-500" }, "Overall progress toward Band 9"),
                        e("span", { className: "text-slate-950" }, `${progress}%`)
                    ),
                    e("div", { className: "mt-3 h-2 overflow-hidden rounded-full bg-slate-200" },
                        e("span", { className: "block h-full rounded-full bg-gradient-to-r from-blue-700 via-blue-500 to-violet-500", style: { width: `${Math.min(progress, 100)}%` } })
                    )
                )
                : e("p", { className: "mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500" }, "Complete a Listening, Reading, Writing, or Speaking test to calculate your IELTS performance.")
        );
    }

    function StatsSection({ stats }) {
        const items = [
            ["Tests Completed", stats.testsCompleted || 0, "book", "All submitted practices"],
            ["Accuracy", `${stats.accuracy || 0}%`, "chart", "Across answered questions"],
            ["Best Score", stats.bestScore || "No result", "award", stats.bestScore ? `${stats.bestAccuracy}% accuracy` : "Complete a test"],
            ["Questions Answered", stats.totalQuestions || 0, "clock", "From completed tests"],
            ["Average Reading", stats.averageReadingScore === null ? "No result" : `${stats.averageReadingScore}%`, "book", "Completed Reading tests"],
            ["Average Listening", stats.averageListeningScore === null ? "No result" : `${stats.averageListeningScore}%`, "headphones", "Completed Listening tests"],
            ["Last Practice", formatDate(stats.lastPracticeDate), "calendar", "Most recent completion"]
        ];

        return e("section", null,
            e(SectionTitle, {
                eyebrow: "Measured outcomes",
                title: "Your Statistics",
                description: "Every value below is generated from submitted tests."
            }),
            e("div", { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" },
                items.map(([label, value, icon, note], index) => e("article", {
                    key: label,
                    className: "rounded-[1.4rem] border border-slate-200/80 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-xl " + (index === items.length - 1 ? "sm:col-span-2 xl:col-span-2" : "")
                },
                e("div", { className: "mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700" }, e(Icon, { name: icon })),
                e("p", { className: "text-sm font-semibold text-slate-500" }, label),
                e("p", { className: "mt-1 truncate text-2xl font-black tracking-tight text-slate-950" }, value),
                e("p", { className: "mt-2 text-xs text-slate-400" }, note)
                ))
            )
        );
    }

    function EmptyChart({ text }) {
        return e("div", { className: "flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-sm text-slate-500" }, text);
    }

    function LineChart({ data, valueKey, maxValue, color, suffix, chartClass }) {
        if (!data?.length) return e(EmptyChart, { text: "Complete tests to see this progress chart." });
        const width = 360;
        const height = 130;
        const padding = 16;
        const usableWidth = width - padding * 2;
        const usableHeight = height - padding * 2;
        const maximum = maxValue || Math.max(...data.map((item) => Number(item[valueKey] || 0)), 1);
        const points = data.map((item, index) => {
            const x = padding + (data.length === 1 ? usableWidth / 2 : (index / (data.length - 1)) * usableWidth);
            const y = height - padding - (Number(item[valueKey] || 0) / maximum) * usableHeight;
            return { x, y, item };
        });

        return e("div", { className: chartClass || "" },
            e("svg", { viewBox: `0 0 ${width} ${height}`, className: "h-36 w-full overflow-visible", role: "img" },
                [0, 1, 2, 3].map((line) => e("line", {
                    key: line,
                    x1: padding,
                    x2: width - padding,
                    y1: padding + (line * usableHeight / 3),
                    y2: padding + (line * usableHeight / 3),
                    stroke: "#e8edf5",
                    strokeWidth: 1
                })),
                e("polyline", {
                    points: points.map((point) => `${point.x},${point.y}`).join(" "),
                    fill: "none",
                    stroke: color,
                    strokeWidth: 4,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    className: "line-chart-path"
                }),
                points.map((point) => e("g", { key: point.item.id || point.item.completedAt },
                    e("circle", { cx: point.x, cy: point.y, r: 5, fill: "white", stroke: color, strokeWidth: 3, className: "line-chart-node" }),
                    e("title", null, `${point.item.label}: ${point.item[valueKey]}${suffix || ""}`)
                ))
            ),
            e("div", { className: "mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400" },
                e("span", null, data[0]?.label),
                e("span", null, data[data.length - 1]?.label)
            )
        );
    }

    function WeeklyChart({ data }) {
        const max = Math.max(...(data || []).map((item) => item.count), 1);

        return e("div", { className: "flex min-h-40 items-end gap-2" },
            (data || []).map((item) => e("div", { key: item.date, className: "flex flex-1 flex-col items-center gap-2" },
                e("span", { className: "text-xs font-black text-slate-700" }, item.count),
                e("div", { className: "flex h-24 w-full items-end overflow-hidden rounded-xl bg-slate-100" },
                    e("span", {
                        className: "block w-full rounded-xl bg-gradient-to-t from-blue-700 to-blue-400",
                        style: { height: `${item.count ? Math.max((item.count / max) * 100, 12) : 0}%` }
                    })
                ),
                e("span", { className: "text-[10px] font-bold uppercase text-slate-400" }, item.label)
            ))
        );
    }

    function ProgressCharts({ stats }) {
        const charts = stats.charts || emptyProgress.charts;
        const chartCards = [
            ["Weekly Activity", "Tests completed over the last seven days", e(WeeklyChart, { data: charts.weeklyActivity })],
            ["Band Score Trend", "Estimated band across recent tests", e(LineChart, { data: charts.bandTrend, valueKey: "value", maxValue: 9, color: "#071547", chartClass: "chart-band-trend" })],
            ["Reading Progress", "Accuracy across completed Reading tests", e(LineChart, { data: charts.readingProgress, valueKey: "accuracy", maxValue: 100, color: "#2563eb", suffix: "%", chartClass: "chart-reading-progress" })],
            ["Listening Progress", "Accuracy across completed Listening tests", e(LineChart, { data: charts.listeningProgress, valueKey: "accuracy", maxValue: 100, color: "#7c3aed", suffix: "%", chartClass: "chart-listening-progress" })]
        ];

        return e("section", null,
            e(SectionTitle, {
                eyebrow: "Progress tracking",
                title: "Learning Trends",
                description: "Charts update automatically after every completed test."
            }),
            e("div", { className: "grid gap-5 lg:grid-cols-2" },
                chartCards.map(([title, description, chart]) => e(Card, { key: title },
                    e("h3", { className: "font-black text-slate-950" }, title),
                    e("p", { className: "mt-1 text-sm text-slate-500" }, description),
                    e("div", { className: "mt-5" }, chart)
                ))
            )
        );
    }

    function AnswerReviewList({ title, items, tone }) {
        if (!items?.length) return null;
        const toneClass = tone === "correct"
            ? "border-emerald-100 bg-emerald-50 text-emerald-900"
            : "border-rose-100 bg-rose-50 text-rose-900";

        return e("div", { className: `rounded-xl border p-3 ${toneClass}` },
            e("p", { className: "text-xs font-black uppercase tracking-wide" }, title),
            e("div", { className: "mt-2 max-h-48 space-y-2 overflow-auto pr-1" },
                items.slice(0, 40).map((item) => e("p", { key: `${title}-${item.number}`, className: "text-xs leading-5" },
                    e("strong", null, `Q${item.number}: `),
                    tone === "correct"
                        ? `${item.correctAnswer || item.userAnswer}`
                        : `Your answer: ${item.userAnswer || "Unanswered"} | Correct answer: ${item.correctAnswer || "-"}`
                ))
            )
        );
    }

    function writingTypeLabel(type) {
        if (type === "task1") return "Task 1";
        if (type === "task2") return "Task 2";
        return "Full Test";
    }

    function criteriaLabel(key) {
        const labels = {
            taskAchievement: "Task Achievement",
            taskResponse: "Task Response",
            coherenceCohesion: "Coherence & Cohesion",
            lexicalResource: "Lexical Resource",
            grammarRangeAccuracy: "Grammatical Range & Accuracy",
            grammar: "Grammatical Range & Accuracy"
        };
        return labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
    }

    function WritingMetricCard({ label, value, note }) {
        return e("article", { className: "writing-metric-card" },
            e("span", { className: "writing-metric-label" }, label),
            e("strong", null, value),
            note ? e("span", { className: "writing-metric-note" }, note) : null
        );
    }

    function WritingListBlock({ title, items }) {
        const list = Array.isArray(items) ? items.filter(Boolean) : [];
        return e("section", { className: "writing-feedback-list" },
            e("h4", null, title),
            list.length
                ? e("ul", null, list.map((item, index) => e("li", { key: `${title}-${index}` }, item)))
                : e("p", null, "No saved notes for this section.")
        );
    }

    function CriteriaGrid({ attempt }) {
        const scores = attempt?.criteriaScores || {};
        const isFull = attempt?.testType === "full";
        const groups = isFull
            ? [
                ["Task 1 Criteria", scores.task1 || {}],
                ["Task 2 Criteria", scores.task2 || {}]
            ]
            : [["Criteria", scores]];

        return e("div", { className: "writing-criteria-groups" },
            groups.map(([title, group]) => e("section", { key: title, className: "writing-criteria-group" },
                e("h4", null, title),
                Object.keys(group || {}).length
                    ? e("div", { className: "writing-criteria-grid" },
                        Object.entries(group).map(([key, value]) => e("div", { key, className: "writing-criteria-row" },
                            e("span", null, criteriaLabel(key)),
                            e("strong", null, formatBand(value))
                        ))
                    )
                    : e("p", { className: "writing-muted" }, "Criteria scores were not saved for this attempt.")
            ))
        );
    }

    function WritingFeedbackModal({ attempt, onClose }) {
        if (!attempt) return null;

        const isFull = attempt.testType === "full";
        return e("div", { className: "writing-feedback-modal-shell", role: "presentation", onClick: onClose },
            e("section", {
                className: "writing-feedback-modal",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "writingFeedbackTitle",
                onClick: (event) => event.stopPropagation()
            },
                e("div", { className: "writing-feedback-modal-head" },
                    e("div", null,
                        e("p", { className: "text-xs font-black uppercase tracking-[0.16em] text-blue-600" }, writingTypeLabel(attempt.testType)),
                        e("h3", { id: "writingFeedbackTitle" }, attempt.taskTitle || "Writing attempt"),
                        e("p", null, formatDate(attempt.createdAt))
                    ),
                    e("button", { type: "button", className: "writing-modal-close", onClick: onClose, "aria-label": "Close feedback" }, "Close")
                ),
                e("div", { className: "writing-feedback-band-row" },
                    e("div", null, e("span", null, "Overall Band"), e("strong", null, formatBand(attempt.overallBand))),
                    isFull ? e("div", null, e("span", null, "Task 1 Band"), e("strong", null, formatBand(attempt.task1Band))) : null,
                    isFull ? e("div", null, e("span", null, "Task 2 Band"), e("strong", null, formatBand(attempt.task2Band))) : null
                ),
                e(CriteriaGrid, { attempt }),
                e("section", { className: "writing-response-section" },
                    e("h4", null, "User Response"),
                    isFull
                        ? e("div", { className: "writing-response-grid" },
                            e("div", null, e("strong", null, "Task 1"), e("p", null, attempt.task1Response || "No Task 1 response saved.")),
                            e("div", null, e("strong", null, "Task 2"), e("p", null, attempt.task2Response || "No Task 2 response saved."))
                        )
                        : e("p", null, attempt.userResponse || "No response saved.")
                ),
                e("div", { className: "writing-feedback-three" },
                    e(WritingListBlock, { title: "Strengths", items: attempt.strengths }),
                    e(WritingListBlock, { title: "Areas of Improvement", items: attempt.areasForImprovement }),
                    e(WritingListBlock, { title: "Suggestions", items: attempt.suggestions })
                )
            )
        );
    }

    function WritingDashboard({ writing, onViewFeedback }) {
        const data = writing || emptyWriting;
        const summary = { ...emptyWriting.summary, ...(data.summary || {}) };
        const recent = Array.isArray(data.recent) ? data.recent : [];
        const metrics = [
            ["Total Writing attempts", summary.totalAttempts || 0, "All AI-scored submissions"],
            ["Task 1 attempts", summary.task1Attempts || 0, "Report writing"],
            ["Task 2 attempts", summary.task2Attempts || 0, "Essay writing"],
            ["Full Writing Test attempts", summary.fullAttempts || 0, "60-minute mocks"],
            ["Average Writing Band", formatBand(summary.averageBand), "Across attempts"],
            ["Best Writing Band", formatBand(summary.bestBand), "Highest saved band"],
            ["Latest Writing Band", formatBand(summary.latestBand), "Most recent attempt"]
        ];

        return e(Card, { className: "writing-dashboard-card" },
            e(SectionTitle, {
                eyebrow: "Writing",
                title: "Writing Performance",
                description: "Track AI-evaluated Task 1, Task 2, and Full Writing Test attempts.",
                action: e("div", { className: "writing-quick-actions" },
                    e("a", { href: "/writing/task-1" }, "Practice Task 1"),
                    e("a", { href: "/writing/task-2" }, "Practice Task 2"),
                    e("a", { href: "/writing/full-test" }, "Start Full Writing Test")
                )
            }),
            e("div", { className: "writing-metrics-grid" },
                metrics.map(([label, value, note]) => e(WritingMetricCard, { key: label, label, value, note }))
            ),
            recent.length
                ? e("div", { className: "writing-results-wrap" },
                    e("div", { className: "writing-results-head" },
                        e("h3", null, "Recent Writing Results"),
                        e("p", null, "Open an attempt to review your saved AI feedback.")
                    ),
                    e("div", { className: "writing-results-table-scroll" },
                        e("table", { className: "writing-results-table" },
                            e("thead", null,
                                e("tr", null,
                                    ["Test type", "Test title", "Date", "Band score", "Action"].map((heading) => e("th", { key: heading }, heading))
                                )
                            ),
                            e("tbody", null,
                                recent.slice(0, 8).map((attempt, index) => e("tr", { key: attempt.id || index },
                                    e("td", null, e("span", { className: `writing-type-badge ${attempt.testType || "task1"}` }, writingTypeLabel(attempt.testType))),
                                    e("td", null, e("strong", null, attempt.taskTitle || `Writing Test ${index + 1}`)),
                                    e("td", null, formatDate(attempt.createdAt)),
                                    e("td", null, e("span", { className: "writing-band-pill" }, `Band ${formatBand(attempt.overallBand)}`)),
                                    e("td", null, e("button", { type: "button", className: "writing-feedback-btn", onClick: () => onViewFeedback(attempt) }, "View Feedback"))
                                ))
                            )
                        )
                    )
                )
                : e("div", { className: "writing-empty-state" },
                    e("div", { className: "writing-empty-icon" }, e(Icon, { name: "pen", className: "h-6 w-6" })),
                    e("h3", null, "No Writing attempts yet"),
                    e("p", null, "Start your first Writing practice and get AI feedback."),
                    e("a", { href: "/writing", className: "writing-empty-action" }, "Start Writing Practice")
                )
        );
    }

    function PerformanceCenterHeader({ user }) {
        return e("header", { className: "performance-center-header" },
            e("div", null,
                e("p", { className: "performance-center-kicker" }, "IELTSX Performance Center"),
                e("h1", null, "Your IELTS Performance"),
                e("p", null, "Choose a skill to review attempts, band scores, and saved feedback.")
            ),
            e("a", { href: "profile-settings.html", className: "performance-settings-link" },
                e(Icon, { name: "settings", className: "h-4 w-4" }),
                e("span", null, "Profile settings")
            )
        );
    }

    function performanceCards(stats) {
        const listening = summarizeObjectiveSkill(stats, "listening");
        const reading = summarizeObjectiveSkill(stats, "reading");
        const writing = writingOverview(stats.writing);
        const speaking = speakingOverview(stats);

        return [
            {
                key: "listening",
                title: "Listening Performance",
                description: "Bands and answer accuracy from completed Listening tests.",
                icon: "headphones",
                tone: "listening",
                stats: [
                    ["Total attempts", listening.totalAttempts || 0],
                    ["Average band", listening.totalAttempts ? formatBand(listening.averageBand) : "No result"],
                    ["Best band", listening.totalAttempts ? formatBand(listening.bestBand) : "No result"],
                    ["Latest result", listening.latestResult],
                    ["Last activity", formatDate(listening.lastActivityDate)]
                ]
            },
            {
                key: "reading",
                title: "Reading Performance",
                description: "Reading attempts, passage results, and correct-answer review.",
                icon: "book",
                tone: "reading",
                stats: [
                    ["Total attempts", reading.totalAttempts || 0],
                    ["Average band", reading.totalAttempts ? formatBand(reading.averageBand) : "No result"],
                    ["Best band", reading.totalAttempts ? formatBand(reading.bestBand) : "No result"],
                    ["Latest result", reading.latestResult],
                    ["Last activity", formatDate(reading.lastActivityDate)]
                ]
            },
            {
                key: "writing",
                title: "Writing Performance",
                description: "AI-scored Task 1, Task 2, and Full Writing Test feedback.",
                icon: "pen",
                tone: "writing",
                stats: [
                    ["Total attempts", writing.totalAttempts || 0],
                    ["Average band", writing.totalAttempts ? formatBand(writing.averageBand) : "No result"],
                    ["Best band", writing.totalAttempts ? formatBand(writing.bestBand) : "No result"],
                    ["Latest result", writing.latestResult],
                    ["Last activity", formatDate(writing.lastActivityDate)]
                ]
            },
            {
                key: "speaking",
                title: "Speaking Performance",
                description: "Speaking practice, cue cards, and saved feedback when available.",
                icon: "mic",
                tone: "speaking",
                stats: [
                    ["Total attempts", speaking.totalAttempts || 0],
                    ["Average band", speaking.totalAttempts ? formatBand(speaking.averageBand) : "No result"],
                    ["Best band", speaking.totalAttempts ? formatBand(speaking.bestBand) : "No result"],
                    ["Latest result", speaking.latestResult],
                    ["Last activity", formatDate(speaking.lastActivityDate)]
                ]
            }
        ];
    }

    function PerformanceSkillCard({ card, onOpen }) {
        return e("button", {
            type: "button",
            className: `performance-skill-card ${card.tone}`,
            onClick: () => onOpen(card.key)
        },
            e("span", { className: "performance-skill-card-top" },
                e("span", { className: "performance-skill-icon" }, e(Icon, { name: card.icon, className: "h-5 w-5" })),
                e("span", { className: "performance-skill-arrow" }, e(Icon, { name: "arrow", className: "h-4 w-4" }))
            ),
            e("span", { className: "performance-skill-title" }, card.title),
            e("span", { className: "performance-skill-description" }, card.description),
            e("span", { className: "performance-skill-stats" },
                card.stats.map(([label, value]) => e("span", { className: "performance-skill-stat", key: label },
                    e("span", null, label),
                    e("strong", null, value)
                ))
            )
        );
    }

    function PerformanceCardGrid({ stats, onOpen }) {
        return e("section", { className: "performance-card-grid", "aria-label": "IELTS skill performance" },
            performanceCards(stats).map((card) => e(PerformanceSkillCard, { key: card.key, card, onOpen }))
        );
    }

    function BackToPerformanceCenter({ onBack, label = "Back to dashboard" }) {
        return e("button", { type: "button", className: "performance-back-btn", onClick: onBack },
            e(Icon, { name: "arrow", className: "h-4 w-4 rotate-180" }),
            e("span", null, label)
        );
    }

    function ResultReviewPanel({ result, skill }) {
        if (!result) return null;

        return e("section", { className: "performance-result-panel" },
            e("div", { className: "performance-result-panel-head" },
                e("div", null,
                    e("p", null, skill === "listening" ? "Listening Result" : "Reading Result"),
                    e("h3", null, result.title || "Completed test")
                ),
                e("span", { className: "writing-band-pill" }, `Band ${formatBand(result.band)}`)
            ),
            e("div", { className: "performance-result-summary" },
                [["Correct answers", `${result.correct || 0}/${result.total || 0}`], ["Accuracy", `${result.accuracy || 0}%`], ["Date", formatDate(result.completedAt)], ["Part", result.part || "Practice"]].map(([label, value]) =>
                    e("div", { key: label },
                        e("span", null, label),
                        e("strong", null, value)
                    )
                )
            ),
            (result.correctAnswers?.length || result.wrongAnswers?.length)
                ? e("div", { className: "performance-answer-review" },
                    e(AnswerReviewList, { title: "Correct answers", items: result.correctAnswers || [], tone: "correct" }),
                    e(AnswerReviewList, { title: "Wrong or unanswered", items: result.wrongAnswers || [], tone: "wrong" })
                )
                : e("p", { className: "writing-muted" }, "Answer-by-answer review was not saved for this attempt.")
        );
    }

    function ObjectiveSkillDetail({ skill, stats }) {
        const [selectedResult, setSelectedResult] = useState(null);
        const data = summarizeObjectiveSkill(stats, skill);
        const isListening = skill === "listening";
        const title = isListening ? "Listening Performance" : "Reading Performance";
        const titleColumn = isListening ? "Test title" : "Passage/Test title";
        const practiceUrl = isListening ? "/listening" : "/reading";
        const metricPrefix = isListening ? "Listening" : "Reading";
        const recent = data.attempts;
        const metrics = [
            [`Total ${metricPrefix} attempts`, data.totalAttempts || 0, "Submitted tests"],
            [`Average ${metricPrefix} band`, data.totalAttempts ? formatBand(data.averageBand) : "No result", "Across attempts"],
            [`Best ${metricPrefix} band`, data.totalAttempts ? formatBand(data.bestBand) : "No result", "Highest saved band"],
            [`Latest ${metricPrefix} band`, data.totalAttempts ? formatBand(data.latestBand) : "No result", "Most recent attempt"],
            ["Last activity date", formatDate(data.lastActivityDate), "Most recent completion"]
        ];

        return e(Card, { className: `performance-detail-card writing-dashboard-card ${skill}` },
            e(SectionTitle, {
                eyebrow: metricPrefix,
                title,
                description: isListening
                    ? "Review Listening attempts, band scores, and answer accuracy."
                    : "Review Reading attempts, passage results, and answer accuracy.",
                action: e("div", { className: "writing-quick-actions" }, e("a", { href: practiceUrl }, isListening ? "Practice Listening" : "Practice Reading"))
            }),
            e("div", { className: "writing-metrics-grid skill-detail-metrics" },
                metrics.map(([label, value, note]) => e(WritingMetricCard, { key: label, label, value, note }))
            ),
            e("div", { className: "writing-results-wrap" },
                e("div", { className: "writing-results-head" },
                    e("h3", null, `Recent ${metricPrefix} Results`),
                    e("p", null, "Open a completed attempt to inspect the saved result.")
                ),
                recent.length
                    ? e("div", { className: "writing-results-table-scroll" },
                        e("table", { className: "writing-results-table" },
                            e("thead", null,
                                e("tr", null,
                                    [titleColumn, "Date", "Band score", "Correct answers", "Action"].map((heading) => e("th", { key: heading }, heading))
                                )
                            ),
                            e("tbody", null,
                                recent.map((result) => e("tr", { key: result.id },
                                    e("td", null, e("strong", null, result.title || "Completed test")),
                                    e("td", null, formatDate(result.completedAt)),
                                    e("td", null, e("span", { className: "writing-band-pill" }, `Band ${formatBand(result.band)}`)),
                                    e("td", null, `${result.correct || 0}/${result.total || 0}`),
                                    e("td", null, e("button", { type: "button", className: "writing-feedback-btn", onClick: () => setSelectedResult(result) }, "View Result"))
                                ))
                            )
                        )
                    )
                    : e("div", { className: "writing-empty-state" },
                        e("div", { className: "writing-empty-icon" }, e(Icon, { name: isListening ? "headphones" : "book", className: "h-6 w-6" })),
                        e("h3", null, `No ${metricPrefix} attempts yet`),
                        e("p", null, `Complete a ${metricPrefix} test to see your results here.`),
                        e("a", { href: practiceUrl, className: "writing-empty-action" }, isListening ? "Start Listening Practice" : "Start Reading Practice")
                    )
            ),
            e(ResultReviewPanel, { result: selectedResult, skill })
        );
    }

    function SpeakingFeedbackPanel({ attempt }) {
        if (!attempt) return null;

        const feedback = attempt.feedback || attempt.aiFeedback || attempt.notes || "";
        const criteria = feedback && typeof feedback === "object"
            ? [
                ["Fluency and Coherence", feedback.fluencyCoherence],
                ["Lexical Resource", feedback.lexicalResource],
                ["Grammar", feedback.grammaticalRangeAccuracy],
                ["Pronunciation", feedback.pronunciation]
            ]
            : [];
        const feedbackList = (title, items) => e("section", { className: "writing-feedback-list" },
            e("h4", null, title),
            Array.isArray(items) && items.length
                ? e("ul", null, items.map((item, index) => e("li", { key: `${title}-${index}` }, item)))
                : e("p", null, "No saved notes for this section.")
        );

        return e("section", { className: "performance-result-panel" },
            e("div", { className: "performance-result-panel-head" },
                e("div", null,
                    e("p", null, "Speaking Feedback"),
                    e("h3", null, attempt.title || attempt.taskTitle || "Speaking attempt")
                ),
                e("span", { className: "writing-band-pill" }, `Band ${formatBand(attempt.overallBand ?? attempt.band ?? attempt.estimatedBand)}`)
            ),
            feedback && typeof feedback === "object"
                ? e("div", null,
                    e("div", { className: "performance-result-summary" },
                        criteria.map(([label, value]) => e("div", { key: label },
                            e("span", null, label),
                            e("strong", null, formatBand(value))
                        ))
                    ),
                    feedback.detailedFeedback ? e("p", { className: "performance-feedback-copy" }, feedback.detailedFeedback) : null,
                    e("div", { className: "writing-feedback-three" },
                        feedbackList("Strengths", feedback.strengths),
                        feedbackList("Problems", feedback.problems),
                        feedbackList("How to improve", feedback.howToImprove)
                    ),
                    e("div", { className: "writing-feedback-three" },
                        feedbackList("Suggested improved answers", feedback.improvedAnswers),
                        feedbackList("Practical tips", feedback.practicalTips)
                    )
                )
                : feedback
                    ? e("p", { className: "performance-feedback-copy" }, String(feedback))
                    : e("p", { className: "writing-muted" }, "Detailed feedback was not saved for this speaking attempt.")
        );
    }

    function SpeakingDashboard({ stats }) {
        const [selectedAttempt, setSelectedAttempt] = useState(null);
        const data = speakingOverview(stats);

        async function openSpeakingFeedback(attempt) {
            setSelectedAttempt(await fetchProfileAttemptDetail("speaking", attempt));
        }
        const summary = data.summary;
        const metrics = [
            ["Speaking attempts", summary.totalAttempts || 0, "All saved speaking practice"],
            ["Cue Card attempts", summary.cueCardAttempts || 0, "Part 2 practice"],
            ["Full Speaking Test attempts", summary.fullAttempts || 0, "Full mocks"],
            ["Average Speaking Band", summary.totalAttempts ? formatBand(summary.averageBand) : "No result", "Across attempts"],
            ["Best Speaking Band", summary.totalAttempts ? formatBand(summary.bestBand) : "No result", "Highest saved band"],
            ["Latest Speaking Band", summary.totalAttempts ? formatBand(summary.latestBand) : "No result", "Most recent attempt"]
        ];

        return e(Card, { className: "performance-detail-card writing-dashboard-card speaking" },
            e(SectionTitle, {
                eyebrow: "Speaking",
                title: "Speaking Performance",
                description: "Track cue-card and full Speaking Test attempts when feedback is saved.",
                action: e("div", { className: "writing-quick-actions" }, e("a", { href: "/speaking" }, "Practice Speaking"))
            }),
            e("div", { className: "writing-metrics-grid skill-detail-metrics speaking-detail-metrics" },
                metrics.map(([label, value, note]) => e(WritingMetricCard, { key: label, label, value, note }))
            ),
            data.recent.length
                ? e("div", { className: "writing-results-wrap" },
                    e("div", { className: "writing-results-head" },
                        e("h3", null, "Recent Speaking Results"),
                        e("p", null, "Open an attempt to review saved feedback.")
                    ),
                    e("div", { className: "writing-results-table-scroll" },
                        e("table", { className: "writing-results-table" },
                            e("thead", null,
                                e("tr", null,
                                    ["Attempt type", "Title", "Date", "Band score", "Action"].map((heading) => e("th", { key: heading }, heading))
                                )
                            ),
                            e("tbody", null,
                                data.recent.map((attempt, index) => e("tr", { key: attempt.id || index },
                                    e("td", null, speakingTypeLabel(attempt.testType || attempt.type)),
                                    e("td", null, e("strong", null, attempt.title || attempt.taskTitle || `Speaking attempt ${index + 1}`)),
                                    e("td", null, formatDate(attempt.createdAt || attempt.completedAt)),
                                    e("td", null, e("span", { className: "writing-band-pill" }, `Band ${formatBand(attempt.overallBand ?? attempt.band ?? attempt.estimatedBand)}`)),
                                    e("td", null, e("button", { type: "button", className: "writing-feedback-btn", onClick: () => openSpeakingFeedback(attempt) }, "View Feedback"))
                                ))
                            )
                        )
                    ),
                    e(SpeakingFeedbackPanel, { attempt: selectedAttempt })
                )
                : e("div", { className: "writing-empty-state" },
                    e("div", { className: "writing-empty-icon" }, e(Icon, { name: "mic", className: "h-6 w-6" })),
                    e("h3", null, "No Speaking attempts yet"),
                    e("p", null, "Saved Speaking feedback will appear here after practice."),
                    e("a", { href: "/speaking", className: "writing-empty-action" }, "Start Speaking Practice")
                )
        );
    }

    function MockTestDashboard({ mockTests }) {
        const data = { ...emptyMockTests, ...(mockTests || {}) };
        const breakdown = { ...emptyMockTests.breakdown, ...(data.breakdown || {}) };
        const last = data.lastResult || null;
        const metrics = [
            ["Completed mock tests", data.completedMockTests || 0, "Full IELTS simulations"],
            ["Best overall band", data.completedMockTests ? formatBand(data.bestOverallBand) : "No result", "Highest saved mock score"],
            ["Last mock result", last ? `Band ${formatBand(last.overallBand)}` : "No result", last ? formatDate(last.completedAt) : "Start a mock test"]
        ];

        return e(Card, { className: "writing-dashboard-card mock-test-dashboard-card" },
            e(SectionTitle, {
                eyebrow: "Mock Test",
                title: "Mock Test Performance",
                description: "Track complete IELTS mock tests separately from standalone practice.",
                action: e("div", { className: "writing-quick-actions" }, e("a", { href: "/mock-tests" }, "Start Mock Test"))
            }),
            e("div", { className: "mock-test-metrics-grid" },
                metrics.map(([label, value, note]) => e(WritingMetricCard, { key: label, label, value, note }))
            ),
            e("div", { className: "mock-test-breakdown-grid" },
                [
                    ["Listening", breakdown.listening],
                    ["Reading", breakdown.reading],
                    ["Writing", breakdown.writing],
                    ["Speaking", breakdown.speaking]
                ].map(([label, value]) => e("div", { key: label, className: "mock-test-breakdown-card" },
                    e("p", null, label),
                    e("strong", null, data.completedMockTests ? formatBand(value) : "0.0")
                ))
            ),
            data.chart?.length
                ? e("div", { className: "mock-test-chart-wrap" },
                    e(LineChart, { data: data.chart, valueKey: "value", maxValue: 9, color: "#d91532", chartClass: "chart-mock-progress" })
                )
                : e("p", { className: "mock-test-empty" }, "Completed mock test results will appear here.")
        );
    }

    function PerformanceDetailView({ skill, stats, onBack, onViewWritingFeedback }) {
        return e("section", { className: "performance-detail-shell" },
            e(BackToPerformanceCenter, { onBack }),
            skill === "writing"
                ? e("div", { className: "writing-dashboard-wrap" }, e(WritingDashboard, { writing: stats.writing, onViewFeedback: onViewWritingFeedback }))
                : skill === "speaking"
                    ? e("div", { className: "writing-dashboard-wrap" }, e(SpeakingDashboard, { stats }))
                    : e("div", { className: "writing-dashboard-wrap" }, e(ObjectiveSkillDetail, { skill, stats }))
        );
    }

    function TestHistory({ stats }) {
        const tests = stats.testHistory || [];

        return e(Card, { className: "lg:col-span-2" },
            e(SectionTitle, {
                eyebrow: "Completed tests",
                title: "Test History",
                description: "Review scores or return to the same practice."
            }),
            tests.length === 0
                ? e("div", { className: "rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-7 text-center" },
                    e("p", { className: "font-black text-slate-950" }, "No completed tests yet"),
                    e("p", { className: "mt-2 text-sm text-slate-500" }, "Submitted Reading and Listening results will appear here.")
                )
                : e("div", { className: "space-y-3" },
                    tests.slice(0, 12).map((test) => e("article", { key: test.id, className: "rounded-2xl border border-slate-200/80 p-4 transition hover:border-blue-200 hover:bg-slate-50" },
                        e("div", { className: "flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between" },
                            e("div", { className: "min-w-0" },
                                e("span", { className: `inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${test.skill === "listening" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}` }, test.skill || test.type),
                                e("h3", { className: "mt-2 truncate font-black text-slate-950" }, test.title),
                                e("p", { className: "mt-1 text-sm text-slate-500" }, formatDate(test.completedAt))
                            ),
                            e("div", { className: "flex flex-wrap items-center gap-2" },
                                e("span", { className: "rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-800" }, `${test.correct}/${test.total} correct`),
                                e("span", { className: "rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white" }, `Band ${formatBand(test.band)}`),
                                e("a", { href: practiceHref(test), className: "rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white transition hover:bg-blue-700" }, "Practice Again")
                            )
                        ),
                        e("details", { className: "result-details mt-3" },
                            e("summary", { className: "cursor-pointer text-sm font-black text-blue-700" }, "View Results"),
                            e("div", { className: "mt-3 grid gap-3 rounded-xl bg-white p-3 text-sm sm:grid-cols-4" },
                                [["Correct", `${test.correct}/${test.total}`], ["Accuracy", `${test.accuracy}%`], ["Band", formatBand(test.band)], ["Part", test.part || "Practice"]].map(([label, value]) =>
                                    e("div", { key: label }, e("p", { className: "text-xs font-bold uppercase text-slate-400" }, label), e("p", { className: "mt-1 font-black text-slate-900" }, value))
                                )
                            ),
                            (test.correctAnswers?.length || test.wrongAnswers?.length)
                                ? e("div", { className: "mt-3 grid gap-3 md:grid-cols-2" },
                                    e(AnswerReviewList, { title: "Correct answers", items: test.correctAnswers || [], tone: "correct" }),
                                    e(AnswerReviewList, { title: "Wrong or unanswered", items: test.wrongAnswers || [], tone: "wrong" })
                                )
                                : null
                        )
                    ))
                )
        );
    }

    function RecentActivity({ stats }) {
        const activities = stats.activities || [];

        return e(Card, null,
            e(SectionTitle, {
                eyebrow: "Activity feed",
                title: "Recent Activity",
                description: "Completed tests, band updates, and account activity."
            }),
            activities.length
                ? e("div", { className: "space-y-4" },
                    activities.slice(0, 10).map((item) => e("div", { key: item.id, className: "flex gap-3" },
                        e("div", { className: `mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.type === "listening" ? "bg-violet-50 text-violet-700" : item.type === "reading" ? "bg-blue-50 text-blue-700" : item.type === "band" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}` },
                            e(Icon, { name: item.type === "listening" ? "headphones" : item.type === "reading" ? "book" : item.type === "band" ? "award" : "user", className: "h-4 w-4" })
                        ),
                        e("div", { className: "min-w-0" },
                            e("p", { className: "text-sm font-black leading-5 text-slate-800" }, item.title),
                            e("p", { className: "mt-1 text-xs leading-5 text-slate-500" }, `${item.detail || ""}${item.occurredAt ? ` | ${formatDate(item.occurredAt)}` : ""}`)
                        )
                    ))
                )
                : e("div", { className: "rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500" }, "Your account and completed-test activity will appear here.")
        );
    }

    function Dashboard({ user, stats }) {
        const [selectedWritingAttempt, setSelectedWritingAttempt] = useState(null);
        const [selectedSkill, setSelectedSkill] = useState(null);

        async function openWritingFeedback(attempt) {
            setSelectedWritingAttempt(await fetchProfileAttemptDetail("writing", attempt));
        }

        function openSkill(skill) {
            if (skill === "center") {
                setSelectedSkill(null);
                window.requestAnimationFrame(() => {
                    document.querySelector(".performance-center-shell")?.scrollIntoView({ block: "start" });
                });
                return;
            }

            setSelectedSkill(skill);
            window.requestAnimationFrame(() => {
                document.querySelector(".performance-detail-shell")?.scrollIntoView({ block: "start" });
            });
        }

        return e("main", { className: "profile-dashboard-main space-y-7" },
            e(Hero, { user, stats }),
            e("div", { className: "dashboard-overview-grid" },
                e(ProfileCard, { user, stats }),
                e(PerformanceCard, { stats, onOpen: openSkill })
            ),
            selectedSkill
                ? e(PerformanceDetailView, {
                    skill: selectedSkill,
                    stats,
                    onBack: () => setSelectedSkill(null),
                    onViewWritingFeedback: openWritingFeedback
                })
                : e("section", { className: "performance-center-shell" },
                    e(PerformanceCardGrid, { stats, onOpen: openSkill })
                ),
            e(MockTestDashboard, { mockTests: stats.mockTests }),
            e(WritingFeedbackModal, { attempt: selectedWritingAttempt, onClose: () => setSelectedWritingAttempt(null) })
        );
    }

    function SettingsPage({ user, stats }) {
        const [name, setName] = useState(user.name || user.username || "");
        const [targetBand, setTargetBand] = useState(stats.targetBand === null ? "" : String(stats.targetBand));
        const [message, setMessage] = useState("");
        const [saving, setSaving] = useState(false);

        async function savePreferences(event) {
            event.preventDefault();
            setSaving(true);
            setMessage("");

            try {
                await window.authClient.updateProfile({
                    name: name
                });
                await window.authClient.updateProfilePreferences({
                    targetBand: targetBand === "" ? null : Number(targetBand)
                });
                setMessage("Profile settings saved successfully.");
            } catch (error) {
                setMessage(error.message);
            } finally {
                setSaving(false);
            }
        }

        return e("main", { className: "mx-auto max-w-4xl px-5 py-8 lg:px-8" },
            e("a", { href: "profile.html", className: "mb-6 inline-flex items-center gap-2 text-sm font-black text-blue-700 hover:text-slate-950" }, e(Icon, { name: "arrow", className: "h-4 w-4 rotate-180" }), "Back to dashboard"),
            e("section", { className: "rounded-[2rem] border border-slate-200 bg-white p-6 shadow-card md:p-8" },
                e("div", { className: "mb-8 flex items-center gap-4" },
                    user.avatar
                        ? e("img", { src: user.avatar, alt: name, className: "flex h-16 w-16 shrink-0 rounded-3xl object-cover shadow-md" })
                        : e("div", { className: "flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-xl font-black text-white" }, initials(name)),
                    e("div", null,
                        e("p", { className: "text-sm font-black uppercase tracking-[0.16em] text-blue-700" }, `Profile Settings | ${user.role || "user"}`),
                        e("h1", { className: "text-3xl font-black tracking-tight text-slate-950" }, "Learning preferences")
                    )
                ),
                e("form", { className: "grid gap-5 md:grid-cols-2", onSubmit: savePreferences },
                    e("label", { className: "space-y-2 text-sm font-bold text-slate-700" }, "Name", 
                        e("input", {
                            className: "w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50",
                            value: name,
                            onChange: (e) => setName(e.target.value),
                            placeholder: "Enter your display name"
                        })
                    ),
                    e("label", { className: "space-y-2 text-sm font-bold text-slate-700" }, "Email", e("input", { className: "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-500", value: user.email || "", readOnly: true })),
                    e("label", { className: "space-y-2 text-sm font-bold text-slate-700 md:col-span-2" }, "Target band",
                        e("select", {
                            className: "w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50",
                            value: targetBand,
                            onChange: (event) => setTargetBand(event.target.value)
                        },
                        e("option", { value: "" }, "Not set"),
                        ["5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0", "8.5", "9.0"].map((band) => e("option", { key: band, value: band }, `Band ${band}`))
                        )
                    ),
                    message ? e("p", { className: "text-sm font-bold text-blue-700 md:col-span-2" }, message) : null,
                    e("div", { className: "flex flex-col gap-3 md:col-span-2 sm:flex-row" },
                        e("button", { type: "submit", disabled: saving, className: "rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:opacity-60" }, saving ? "Saving..." : "Save preferences"),
                        e("a", { href: "profile.html", className: "rounded-2xl border border-slate-200 px-6 py-3 text-center text-sm font-black text-slate-700 transition hover:bg-slate-50" }, "Cancel")
                    )
                )
            )
        );
    }

    function scrollToHashTarget() {
        const hash = String(window.location.hash || "");

        if (hash !== "#results") {
            return;
        }

        window.requestAnimationFrame(() => {
            document.getElementById("results")?.scrollIntoView({ block: "start" });
        });
    }

    async function boot() {
        let user = null;
        try {
            const authResult = window.authClient?.fetchAuthMe
                ? await window.authClient.fetchAuthMe()
                : await fetch("/api/auth/me", {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store"
                }).then(async (response) => ({
                    status: response.status,
                    ok: response.ok,
                    data: await response.json().catch(() => ({}))
                }));

            console.log("PROFILE_ME_STATUS:", authResult.status);

            if (authResult.status === 401) {
                console.log("PROFILE_ME_RESPONSE: Unauthorized");
                window.location.href = "/login";
                return;
            }

            const data = authResult.data || {};
            console.log("PROFILE_ME_RESPONSE:", data);

            if (authResult.ok && data.success && data.user) {
                user = data.user;
                const auth = window.authClient && window.authClient.getAuth();
                if (auth) {
                    auth.user = user;
                    window.authClient.saveAuth(auth);
                }
            } else {
                window.location.href = "/login";
                return;
            }
        } catch (error) {
            console.error("Profile boot fetch error:", error);
            window.location.href = "/login";
            return;
        }

        if (!user) {
            window.location.href = "/login";
            return;
        }

        let stats = { ...emptyProgress, ...(window.authClient.getUserStats ? window.authClient.getUserStats() : {}) };

        try {
            stats = { ...emptyProgress, ...(await window.authClient.getUserProgress()) };
        } catch {}

        try {
            const writingResponse = await fetch("/api/profile/writing?limit=8", {
                method: "GET",
                credentials: "include",
                cache: "no-store"
            });
            if (writingResponse.ok) {
                stats.writing = { ...emptyWriting, ...(await writingResponse.json()) };
            } else {
                stats.writing = emptyWriting;
            }
        } catch (error) {
            console.error("Writing dashboard fetch error:", error);
            stats.writing = emptyWriting;
        }

        try {
            const speakingResponse = await fetch("/api/profile/speaking?limit=8", {
                method: "GET",
                credentials: "include",
                cache: "no-store"
            });
            if (speakingResponse.ok) {
                stats.speaking = { ...emptySpeaking, ...(await speakingResponse.json()) };
            } else {
                stats.speaking = emptySpeaking;
            }
        } catch (error) {
            console.error("Speaking dashboard fetch error:", error);
            stats.speaking = emptySpeaking;
        }

        try {
            const mockResponse = await fetch("/api/profile/mock-tests", {
                method: "GET",
                credentials: "include",
                cache: "no-store"
            });
            if (mockResponse.ok) {
                stats.mockTests = { ...emptyMockTests, ...(await mockResponse.json()) };
            } else {
                stats.mockTests = emptyMockTests;
            }
        } catch (error) {
            console.error("Mock test dashboard fetch error:", error);
            stats.mockTests = emptyMockTests;
        }

        ReactDOM.createRoot(root).render(page === "settings"
            ? e(SettingsPage, { user, stats })
            : e(Dashboard, { user, stats }));
        scrollToHashTarget();
    }

    window.addEventListener("hashchange", scrollToHashTarget);
    boot();
}());
