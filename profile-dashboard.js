(function () {
    const e = React.createElement;
    const root = document.getElementById("root");
    const page = window.location.pathname.includes("profile-settings") ? "settings" : "dashboard";

    const emptyProgress = {
        listeningTests: 0,
        readingTests: 0,
        listeningBand: 0,
        readingBand: 0,
        listeningScores: [],
        readingScores: [],
        lastPracticeDate: null
    };

    function Icons() {
        return {
            user: [e("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", key: 1 }), e("circle", { cx: "12", cy: "7", r: "4", key: 2 })],
            check: [e("path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14", key: 1 }), e("path", { d: "M22 4L12 14.01l-3-3", key: 2 })],
            headphones: [e("path", { d: "M3 14v-2a9 9 0 0 1 18 0v2", key: 1 }), e("path", { d: "M5 14h3v6H5zM16 14h3v6h-3z", key: 2 })],
            arrow: [e("path", { d: "M5 12h14M13 6l6 6-6 6", key: 1 })]
        };
    }

    function getAuthUser() {
        const auth = window.authClient && window.authClient.getAuth();
        return auth && auth.token ? auth.user : null;
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
        return "/";
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
                e("circle", { cx: "66", cy: "66", r: "60", fill: "none", stroke: "#e2e8f0", strokeWidth: "2" }),
                e("circle", {
                    cx: "66",
                    cy: "66",
                    r: "60",
                    fill: "none",
                    stroke: accent,
                    strokeWidth: "3",
                    strokeDasharray: circumference,
                    strokeDashoffset: circumference - progress,
                    transform: "rotate(-90 66 66)",
                    style: { transition: "stroke-dashoffset 600ms cubic-bezier(0.4,0,0.2,1)" }
                })
            ),
            e("div", { className: "absolute flex flex-col items-center justify-center" },
                e("strong", { className: "text-3xl font-black text-slate-950" }, formatBand(score)),
                e("span", { className: "text-xs font-bold uppercase text-slate-500" }, label)
            )
        );
    }

    function Dashboard({ user, stats }) {
        const [tests, setTests] = React.useState([]);
        const [expandedTestId, setExpandedTestId] = React.useState(null);

        React.useEffect(() => {
            window.authClient?.getUserProgress()
                .then((progress) => {
                    if (progress?.results) {
                        setTests(progress.results);
                    }
                })
                .catch((error) => console.error(error));
        }, []);

        return e("div", { className: "grid gap-5" },
            e("header", { className: "mb-5" },
                e("div", { className: "flex flex-col gap-3" },
                    e("p", { className: "text-xs font-black uppercase tracking-[0.16em] text-blue-600" }, "Welcome"),
                    e("h1", { className: "text-3xl font-black text-slate-950" }, `Hello, ${user.username || "Student"}`),
                    e("p", { className: "text-sm font-medium text-slate-600" }, "Track your IELTS practice progress and band score growth.")
                )
            ),
            e(Card, null,
                e(SectionTitle, { eyebrow: "Progress", title: "Your band scores" }),
                e("div", { className: "grid gap-4 sm:grid-cols-2" },
                    e("div", { className: "flex flex-col items-center justify-center" },
                        e(BandRing, { score: stats.listeningBand || 0, label: "Listening", accent: "#2563eb" })
                    ),
                    e("div", { className: "flex flex-col items-center justify-center" },
                        e(BandRing, { score: stats.readingBand || 0, label: "Reading", accent: "#16a34a" })
                    )
                )
            ),
            e(Card, null,
                e("div", { className: "grid gap-4 sm:grid-cols-3" },
                    e("div", null,
                        e("p", { className: "text-xs font-bold uppercase tracking-wider text-slate-500" }, "Listening Tests"),
                        e("strong", { className: "mt-2 block text-2xl font-black text-slate-950" }, stats.listeningTests || 0)
                    ),
                    e("div", null,
                        e("p", { className: "text-xs font-bold uppercase tracking-wider text-slate-500" }, "Reading Tests"),
                        e("strong", { className: "mt-2 block text-2xl font-black text-slate-950" }, stats.readingTests || 0)
                    ),
                    e("div", null,
                        e("p", { className: "text-xs font-bold uppercase tracking-wider text-slate-500" }, "Last Practice"),
                        e("strong", { className: "mt-2 block text-sm font-black text-slate-600" }, formatDate(stats.lastPracticeDate))
                    )
                )
            ),
            e(Card, null,
                e(SectionTitle, {
                    eyebrow: "Recent",
                    title: "Test results",
                    description: tests.length ? null : "No test results yet. Start practicing to see your scores here."
                }),
                tests.length ? e("div", { className: "space-y-2" },
                    tests.slice(0, 5).map((test) =>
                        e("div", { key: test.id, className: "rounded-xl border border-slate-200 p-4 transition hover:bg-slate-50" },
                            e("div", { className: "flex items-center justify-between" },
                                e("div", null,
                                    e("strong", { className: "block text-sm text-slate-950" }, test.title),
                                    e("p", { className: "text-xs text-slate-500" }, formatDate(test.completedAt))
                                ),
                                e("div", { className: "text-right" },
                                    e("strong", { className: "block text-lg font-black text-slate-950" }, `${test.correct}/${test.total}`),
                                    e("p", { className: "text-xs text-slate-500" }, test.type)
                                )
                            )
                        )
                    )
                ) : null
            )
        );
    }

    function SettingsPage({ user, stats }) {
        const [targetBand, setTargetBand] = React.useState("");
        const [saving, setSaving] = React.useState(false);
        const [message, setMessage] = React.useState("");

        async function savePreferences(event) {
            event.preventDefault();
            setSaving(true);
            setMessage("");

            try {
                await window.authClient?.updateProfilePreferences({ targetBand: Number(targetBand) || null });
                setMessage("Preferences saved successfully!");
                setTimeout(() => setMessage(""), 3000);
            } catch (error) {
                setMessage(error.message || "Failed to save preferences");
            } finally {
                setSaving(false);
            }
        }

        return e("div", { className: "grid gap-5" },
            e("header", { className: "mb-5" },
                e("div", { className: "flex flex-col gap-3" },
                    e("p", { className: "text-xs font-black uppercase tracking-[0.16em] text-blue-600" }, "Settings"),
                    e("h1", { className: "text-3xl font-black text-slate-950" }, "Profile settings"),
                    e("p", { className: "text-sm font-medium text-slate-600" }, "Manage your account preferences and practice goals.")
                )
            ),
            e(Card, null,
                e(SectionTitle, { eyebrow: "Account", title: "Profile information" }),
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

    async function boot() {
        let user = getAuthUser();

        if (!user) {
            window.location.href = "login.html";
            return;
        }

        try {
            user = await window.authClient.verifyStoredSession();
        } catch {
            user = getAuthUser();
        }

        if (!user) {
            window.location.href = "login.html";
            return;
        }

        let stats = { ...emptyProgress, ...(window.authClient.getUserStats ? window.authClient.getUserStats() : {}) };

        try {
            stats = { ...emptyProgress, ...(await window.authClient.getUserProgress()) };
        } catch (error) {
            console.error(error);
        }

        ReactDOM.createRoot(root).render(page === "settings"
            ? e(SettingsPage, { user, stats })
            : e(Dashboard, { user, stats }));
    }

    boot();
}());
