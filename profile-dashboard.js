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
            arrow: [e("path", { d: "M5 12h14M13 6l6 6-6 6", key: 1 })]
        };
        return e("svg", common, paths[name] || paths.user);
    }

    function getAuthUser() {
        const authState = window.authClient && window.authClient.getAuthState();
        return authState?.isAuthenticated ? authState.user : null;
    }

    function initials(name) {
        return String(name || "User")
            .split(/[\s._-]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0].toUpperCase())
            .join("") || "U";
    }

    function formatBand(value) {
        return Number(value || 0).toFixed(1);
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

    function BandRing({ score, label, accent = "#2563eb" }) {
        const radius = 48;
        const circumference = 2 * Math.PI * radius;
        const progress = Math.min(Number(score || 0) / 9, 1) * circumference;

        return e("div", { className: "relative flex flex-col items-center justify-center" },
            e("svg", { width: 138, height: 138, viewBox: "0 0 132 132", className: "drop-shadow-sm" },
                e("circle", { cx: 66, cy: 66, r: radius, fill: "none", stroke: "#e8edf5", strokeWidth: 11 }),
                e("circle", {
                    cx: 66,
                    cy: 66,
                    r: radius,
                    fill: "none",
                    stroke: accent,
                    strokeWidth: 11,
                    strokeLinecap: "round",
                    strokeDasharray: `${progress} ${circumference}`,
                    transform: "rotate(-90 66 66)"
                }),
                e("text", { x: 66, y: 64, textAnchor: "middle", className: "fill-slate-950 text-3xl font-black" }, formatBand(score)),
                e("text", { x: 66, y: 84, textAnchor: "middle", className: "fill-slate-400 text-[10px] font-bold uppercase" }, "Band")
            ),
            e("p", { className: "mt-1 text-sm font-bold text-slate-600" }, label)
        );
    }

    function Hero({ user, stats }) {
        const target = stats.targetBand === null ? "Not set" : formatBand(stats.targetBand);

        return e("section", { className: "profile-hero overflow-hidden rounded-[2rem] p-5 text-white shadow-card md:p-7" },
            e("div", { className: "relative z-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center" },
                e("div", { className: "flex items-center gap-4 md:gap-5" },
                    e("div", { className: "flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.5rem] border border-white/20 bg-white/15 text-2xl font-black shadow-2xl backdrop-blur" }, initials(user.username)),
                    e("div", { className: "min-w-0" },
                        e("p", { className: "text-xs font-bold uppercase tracking-[0.18em] text-blue-100" }, "IELTSX Performance Center"),
                        e("h1", { className: "mt-2 break-words text-2xl font-black tracking-tight md:text-4xl" }, user.username),
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
        return e(Card, null,
            e(SectionTitle, {
                eyebrow: "Account",
                title: "Student Profile",
                description: "Your IELTSX learning account"
            }),
            e("div", { className: "flex items-center gap-4 rounded-2xl bg-slate-50 p-4" },
                e("div", { className: "flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-lg font-black text-white" }, initials(user.username)),
                e("div", { className: "min-w-0" },
                    e("p", { className: "truncate font-black text-slate-950" }, user.username),
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

    function PerformanceCard({ stats }) {
        return e(Card, { className: "lg:col-span-2", id: "results" },
            e(SectionTitle, {
                eyebrow: "Live analytics",
                title: "IELTS Performance",
                description: "Band estimates calculated only from completed Reading and Listening tests."
            }),
            e("div", { className: "grid gap-5 sm:grid-cols-3" },
                e(BandRing, { score: stats.overallBand, label: "Overall Band", accent: "#071547" }),
                e(BandRing, { score: stats.readingBand, label: "Reading Band", accent: "#2563eb" }),
                e(BandRing, { score: stats.listeningBand, label: "Listening Band", accent: "#7c3aed" })
            ),
            stats.testsCompleted
                ? e("div", { className: "mt-5 rounded-2xl bg-slate-50 p-4" },
                    e("div", { className: "flex items-center justify-between text-sm font-bold" },
                        e("span", { className: "text-slate-500" }, "Overall progress toward Band 9"),
                        e("span", { className: "text-slate-950" }, `${Math.round((stats.overallBand / 9) * 100)}%`)
                    ),
                    e("div", { className: "mt-3 h-2 overflow-hidden rounded-full bg-slate-200" },
                        e("span", { className: "block h-full rounded-full bg-gradient-to-r from-blue-700 via-blue-500 to-violet-500", style: { width: `${Math.min((stats.overallBand / 9) * 100, 100)}%` } })
                    )
                )
                : e("p", { className: "mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500" }, "Complete a Reading or Listening test to calculate your IELTS performance.")
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

    function LineChart({ data, valueKey, maxValue, color, suffix }) {
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

        return e("div", null,
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
                    strokeLinejoin: "round"
                }),
                points.map((point) => e("g", { key: point.item.id || point.item.completedAt },
                    e("circle", { cx: point.x, cy: point.y, r: 5, fill: "white", stroke: color, strokeWidth: 3 }),
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
            ["Band Score Trend", "Estimated band across recent tests", e(LineChart, { data: charts.bandTrend, valueKey: "value", maxValue: 9, color: "#071547" })],
            ["Reading Progress", "Accuracy across completed Reading tests", e(LineChart, { data: charts.readingProgress, valueKey: "accuracy", maxValue: 100, color: "#2563eb", suffix: "%" })],
            ["Listening Progress", "Accuracy across completed Listening tests", e(LineChart, { data: charts.listeningProgress, valueKey: "accuracy", maxValue: 100, color: "#7c3aed", suffix: "%" })]
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
        return e("main", { className: "mx-auto max-w-7xl space-y-7 px-5 py-7 lg:px-8" },
            e(Hero, { user, stats }),
            e("div", { className: "grid gap-5 lg:grid-cols-3" },
                e(ProfileCard, { user, stats }),
                e(PerformanceCard, { stats })
            ),
            e(StatsSection, { stats }),
            e(ProgressCharts, { stats }),
            e("div", { className: "grid gap-5 lg:grid-cols-3" },
                e(TestHistory, { stats }),
                e(RecentActivity, { stats })
            )
        );
    }

    function SettingsPage({ user, stats }) {
        const [targetBand, setTargetBand] = useState(stats.targetBand === null ? "" : String(stats.targetBand));
        const [message, setMessage] = useState("");
        const [saving, setSaving] = useState(false);

        async function savePreferences(event) {
            event.preventDefault();
            setSaving(true);
            setMessage("");

            try {
                await window.authClient.updateProfilePreferences({
                    targetBand: targetBand === "" ? null : Number(targetBand)
                });
                setMessage("Profile preferences saved.");
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
                    e("div", { className: "flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-xl font-black text-white" }, initials(user.username)),
                    e("div", null,
                        e("p", { className: "text-sm font-black uppercase tracking-[0.16em] text-blue-700" }, "Profile Settings"),
                        e("h1", { className: "text-3xl font-black tracking-tight text-slate-950" }, "Learning preferences")
                    )
                ),
                e("form", { className: "grid gap-5 md:grid-cols-2", onSubmit: savePreferences },
                    e("label", { className: "space-y-2 text-sm font-bold text-slate-700" }, "Name", e("input", { className: "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-500", value: user.username, readOnly: true })),
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
        let user = getAuthUser();

        if (!user) {
            window.location.href = "/login.html";
            return;
        }

        try {
            user = await window.authClient.verifyStoredSession();
        } catch {
            user = getAuthUser();
        }

        if (!user) {
            window.location.href = "/login.html";
            return;
        }

        let stats = { ...emptyProgress, ...(window.authClient.getUserStats ? window.authClient.getUserStats() : {}) };

        try {
            stats = { ...emptyProgress, ...(await window.authClient.getUserProgress()) };
        } catch {}

        ReactDOM.createRoot(root).render(page === "settings"
            ? e(SettingsPage, { user, stats })
            : e(Dashboard, { user, stats }));
        scrollToHashTarget();
    }

    window.addEventListener("hashchange", scrollToHashTarget);
    boot();
}());
