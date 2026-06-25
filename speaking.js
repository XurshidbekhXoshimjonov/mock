(function () {
    const app = document.getElementById("speakingApp");
    const speakingParams = new URLSearchParams(window.location.search);
    const isSpeakingMockMode = speakingParams.get("mockMode") === "1" || speakingParams.has("mockTestId");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    const SPEAKING_TIMING = {
        part1: 5 * 60,
        part2Prep: 60,
        part2Speaking: 2 * 60,
        part2Total: 3 * 60,
        part3: 5 * 60,
        fullTotal: 13 * 60
    };
    const PLAYER_TITLES = {
        1: "Part 1: Introduction and Interview",
        2: "Part 2: Cue Card",
        3: "Part 3: Discussion"
    };
    const PLAYER_DEFAULTS = {
        part1: {
            questions: [
                "Do you work or study?",
                "What do you like about your studies?",
                "Do you prefer studying alone or with others?"
            ]
        },
        part2: {
            topic: "Describe a place you visited recently.",
            bullets: [
                "where it was",
                "when you went there",
                "who you went with",
                "and explain why you liked it"
            ]
        },
        part3: {
            questions: [
                "Why do people enjoy visiting new places?",
                "How has travel changed in recent years?",
                "Should people learn about a place before they visit it?"
            ]
        }
    };
    const PLAYER_TIPS = [
        "Speak clearly and naturally",
        "Give full answers",
        "Use examples where possible",
        "Do not memorize answers",
        "Keep your response relevant"
    ];

    const sectionMeta = {
        part1: {
            route: "/speaking/part1",
            mode: "part1",
            submitMode: "part_1",
            part: 1,
            badge: "Speaking Part 1",
            categoryBadge: "Foundation",
            categoryTitle: "Speaking Part 1",
            categoryDescription: "Short personal questions practice. Practice common introduction and interview questions.",
            listingTitle: "Speaking Part 1 Practices",
            listingSubtitle: "Select an introduction and interview practice set to begin.",
            testKicker: "Speaking Part 1",
            defaultDuration: 300,
            button: "Start Test",
            stats: [
                ["10", "Questions"],
                ["4-5 min", "Estimated time"]
            ]
        },
        part2: {
            route: "/speaking/part2",
            mode: "cue",
            submitMode: "cue_card",
            part: 2,
            badge: "Speaking Part 2",
            categoryBadge: "Core",
            categoryTitle: "Speaking Part 2",
            categoryDescription: "Cue Card Practice. Practice one cue card with 1-minute preparation and 2-minute speaking.",
            listingTitle: "Cue Card Practices",
            listingSubtitle: "Select a cue card prompt and start practicing.",
            testKicker: "Speaking Part 2",
            defaultDuration: 120,
            button: "Start Test",
            stats: [
                ["1", "Cue Card"],
                ["1 min", "Prep"],
                ["2 min", "Speaking"]
            ]
        },
        part3: {
            route: "/speaking/part3",
            mode: "part3",
            submitMode: "part_3",
            part: 3,
            badge: "Speaking Part 3",
            categoryBadge: "Advanced",
            categoryTitle: "Speaking Part 3",
            categoryDescription: "Follow-up Discussion. Answer deeper discussion questions linked to the cue card topic.",
            listingTitle: "Speaking Part 3 Practices",
            listingSubtitle: "Select a follow-up discussion set and begin.",
            testKicker: "Speaking Part 3",
            defaultDuration: 300,
            button: "Start Test",
            stats: [
                ["4-6", "Questions"],
                ["4-5 min", "Estimated time"]
            ]
        },
        full: {
            route: "/speaking/full-test",
            mode: "full",
            submitMode: "full_test",
            badge: "Full Speaking Test",
            categoryBadge: "Exam Mode",
            categoryTitle: "Full Speaking Test",
            categoryDescription: "Complete Parts 1, 2, and 3 in one full AI-evaluated test.",
            listingTitle: "Full Speaking Test Practices",
            listingSubtitle: "Choose a full IELTS Speaking test with Parts 1, 2, and 3.",
            testKicker: "Full Speaking Test",
            defaultDuration: 720,
            button: "Start Full Test",
            stats: [
                ["3", "Parts"],
                ["11-14 min", "Estimated time"],
                ["AI", "Feedback included"]
            ]
        }
    };

    const catalog = {
        part1: [
            {
                id: "test-1",
                title: "Test 1",
                description: "Introduction, hometown, study, work, and daily life questions.",
                questions: [
                    "Do you work or are you a student?",
                    "What do you enjoy about your studies or job?",
                    "Where is your hometown?",
                    "What do you like about your hometown?",
                    "How do you usually spend your evenings?",
                    "Do you prefer spending time alone or with friends?",
                    "What kind of weather do you like?",
                    "How often do you use public transport?",
                    "Do you like reading books?",
                    "What would you like to learn in the future?"
                ]
            },
            {
                id: "test-2",
                title: "Test 2",
                description: "Family, food, hobbies, technology, and weekend routines.",
                questions: [
                    "Do you live with your family?",
                    "Who do you spend the most time with?",
                    "What food do you usually eat at home?",
                    "Do you enjoy cooking?",
                    "What hobbies are popular in your country?",
                    "How often do you use your phone?",
                    "Do you prefer texting or calling people?",
                    "What do you usually do on weekends?",
                    "Do you like shopping online?",
                    "What makes a good day for you?"
                ]
            },
            {
                id: "test-3",
                title: "Test 3",
                description: "Travel, clothes, music, friends, and personal preferences.",
                questions: [
                    "Do you like travelling?",
                    "Which place would you like to visit next?",
                    "What clothes do you usually wear?",
                    "Do you think fashion is important?",
                    "What kind of music do you like?",
                    "Do you prefer listening to music alone or with others?",
                    "How often do you meet your friends?",
                    "What activities do you do with friends?",
                    "Do you like taking photos?",
                    "What is something you want to improve about yourself?"
                ]
            },
            {
                id: "topic-31-websites",
                title: "Topic 31: Websites",
                description: "Websites, online habits, popular sites, and changes in browsing routines.",
                topic: "Websites",
                questions: [
                    "What kinds of websites do you often visit?",
                    "What kinds of websites are popular in your country?",
                    "What is your favourite website?",
                    "Are there any changes to the websites you often visit?"
                ]
            }
        ],
        part2: [
            {
                id: "test-1",
                title: "Test 1",
                description: "Describe a person who has inspired you.",
                topic: "Describe a person who has inspired you",
                bullets: [
                    "Who this person is",
                    "How you know this person",
                    "What this person has done",
                    "Explain why this person inspired you"
                ]
            },
            {
                id: "test-2",
                title: "Test 2",
                description: "Describe a useful website you often visit.",
                topic: "Describe a useful website you often visit",
                bullets: [
                    "What the website is",
                    "How often you use it",
                    "What you use it for",
                    "Explain why it is useful for you"
                ]
            },
            {
                id: "test-3",
                title: "Test 3",
                description: "Describe a difficult decision you made.",
                topic: "Describe a difficult decision you made",
                bullets: [
                    "What the decision was",
                    "When you made it",
                    "Why it was difficult",
                    "Explain how you felt after making it"
                ]
            },
            {
                id: "topic-1-trees",
                title: "Topic 1: Place with a lot of trees",
                description: "Describe a place with a lot of trees that you would like to visit.",
                topic: "Describe a place with a lot of trees that you would like to visit",
                bullets: [
                    "What park it is and where it is",
                    "How you know about it",
                    "Why you want to go there",
                    "What it is like"
                ]
            }
        ],
        part3: [
            {
                id: "test-1",
                title: "Test 1",
                description: "Follow-up discussion about learning, education, and practical skills.",
                topic: "Learning and skills",
                questions: [
                    "Why do people need to keep learning new skills?",
                    "Do schools teach enough practical skills?",
                    "How has technology changed the way people learn?",
                    "Is it better to learn from a teacher or by yourself?",
                    "Should governments support adult education?"
                ]
            },
            {
                id: "test-2",
                title: "Test 2",
                description: "Follow-up discussion about work, success, and motivation.",
                topic: "Work and success",
                questions: [
                    "What makes a person successful at work?",
                    "Do people work harder when they are young or older?",
                    "How important is motivation in achieving goals?",
                    "Should companies train employees more often?",
                    "Is job satisfaction more important than salary?"
                ]
            },
            {
                id: "test-3",
                title: "Test 3",
                description: "Follow-up discussion about technology, society, and communication.",
                topic: "Technology and communication",
                questions: [
                    "How has technology changed communication?",
                    "Do people rely too much on smartphones?",
                    "Is face-to-face communication still important?",
                    "How can technology help older people?",
                    "What problems can social media create?"
                ]
            },
            {
                id: "topic-1-parks-nature",
                title: "Topic 1: Parks, Nature",
                description: "Follow-up discussion about parks, forests, and nature.",
                topic: "Parks, Nature",
                questions: [
                    "Why do people like visiting places with trees or forests?",
                    "Why is it important to have parks in the city?",
                    "What benefits can a park bring to a city?",
                    "Are natural views better than city views?",
                    "Do all people need some nature?",
                    "Are people hard-wired to protect the environment?"
                ]
            }
        ],
        full: [
            {
                id: "test-1",
                title: "Test 1",
                description: "A complete Speaking test covering daily life, a future skill, and learning discussion.",
                topic: "Learning and personal development",
                parts: [
                    {
                        part: 1,
                        title: "Part 1: Introduction and general questions",
                        duration: 300,
                        prompt: "Answer general questions about your work or studies, hometown, daily routine, and hobbies.",
                        questions: [
                            "Do you work or are you a student?",
                            "What do you like about your hometown?",
                            "How do you usually spend your weekends?",
                            "Do you prefer studying alone or with other people?",
                            "What kind of weather do you like?"
                        ]
                    },
                    {
                        part: 2,
                        title: "Part 2: Cue Card",
                        duration: 120,
                        preparation: 60,
                        prompt: "Describe a skill you would like to learn in the future.",
                        questions: [
                            "What the skill is",
                            "Why you want to learn it",
                            "How you would learn it",
                            "Explain how this skill would help you"
                        ]
                    },
                    {
                        part: 3,
                        title: "Part 3: Follow-up discussion questions",
                        duration: 300,
                        prompt: "Discuss learning, skills, education, and how people improve over time.",
                        questions: [
                            "Why do people need to keep learning new skills?",
                            "Do schools teach enough practical skills?",
                            "How has technology changed the way people learn?",
                            "Is it better to learn from a teacher or by yourself?"
                        ]
                    }
                ]
            },
            {
                id: "test-2",
                title: "Test 2",
                description: "A complete Speaking test covering habits, a memorable journey, and travel discussion.",
                topic: "Travel and habits",
                parts: [
                    {
                        part: 1,
                        title: "Part 1: Introduction and general questions",
                        duration: 300,
                        prompt: "Answer general questions about habits, free time, and transport.",
                        questions: [
                            "What do you usually do in your free time?",
                            "Do you prefer mornings or evenings?",
                            "How often do you use public transport?",
                            "Do you enjoy trying new food?",
                            "What do you do to relax?"
                        ]
                    },
                    {
                        part: 2,
                        title: "Part 2: Cue Card",
                        duration: 120,
                        preparation: 60,
                        prompt: "Describe a memorable journey you have taken.",
                        questions: [
                            "Where you went",
                            "Who you went with",
                            "What happened during the journey",
                            "Explain why it was memorable"
                        ]
                    },
                    {
                        part: 3,
                        title: "Part 3: Follow-up discussion questions",
                        duration: 300,
                        prompt: "Discuss travel, transport, tourism, and how people choose destinations.",
                        questions: [
                            "Why do people like travelling?",
                            "How has tourism changed in recent years?",
                            "Is public transport important in large cities?",
                            "Should people travel more inside their own country?"
                        ]
                    }
                ]
            },
            {
                id: "test-3",
                title: "Test 3",
                description: "A complete Speaking test covering communication, a useful app, and technology discussion.",
                topic: "Technology and communication",
                parts: [
                    {
                        part: 1,
                        title: "Part 1: Introduction and general questions",
                        duration: 300,
                        prompt: "Answer general questions about technology, communication, and daily routines.",
                        questions: [
                            "How often do you use your phone?",
                            "Do you prefer texting or calling?",
                            "What apps do you use every day?",
                            "Do you like taking photos?",
                            "How do you usually keep in touch with friends?"
                        ]
                    },
                    {
                        part: 2,
                        title: "Part 2: Cue Card",
                        duration: 120,
                        preparation: 60,
                        prompt: "Describe an app or website that is useful to you.",
                        questions: [
                            "What it is",
                            "How often you use it",
                            "What you use it for",
                            "Explain why it is useful"
                        ]
                    },
                    {
                        part: 3,
                        title: "Part 3: Follow-up discussion questions",
                        duration: 300,
                        prompt: "Discuss technology, online communication, and digital habits.",
                        questions: [
                            "How has technology changed communication?",
                            "Do people spend too much time online?",
                            "Can technology make education better?",
                            "What problems can social media create?"
                        ]
                    }
                ]
            },
            {
                id: "topic-31-websites-parks-nature",
                title: "Topic 31: Websites + Parks, Nature",
                description: "A complete Speaking test with Websites in Part 1, a tree-filled place cue card, and Parks/Nature discussion.",
                topic: "Websites, trees, parks, and nature",
                parts: [
                    {
                        part: 1,
                        title: "Part 1: Websites",
                        duration: 300,
                        prompt: "Answer general questions about websites, online habits, popular websites, and changes in browsing routines.",
                        questions: [
                            "What kinds of websites do you often visit?",
                            "What kinds of websites are popular in your country?",
                            "What is your favourite website?",
                            "Are there any changes to the websites you often visit?"
                        ]
                    },
                    {
                        part: 2,
                        title: "Part 2: Place with a lot of trees",
                        duration: 120,
                        preparation: 60,
                        prompt: "Describe a place with a lot of trees that you would like to visit.",
                        questions: [
                            "What park it is and where it is",
                            "How you know about it",
                            "Why you want to go there",
                            "What it is like"
                        ]
                    },
                    {
                        part: 3,
                        title: "Part 3: Parks, Nature",
                        duration: 300,
                        prompt: "Discuss parks, forests, natural views, and people's relationship with nature.",
                        questions: [
                            "Why do people like visiting places with trees or forests?",
                            "Why is it important to have parks in the city?",
                            "What benefits can a park bring to a city?",
                            "Are natural views better than city views?",
                            "Do all people need some nature?",
                            "Are people hard-wired to protect the environment?"
                        ]
                    }
                ]
            }
        ]
    };

    const state = {
        section: null,
        test: null,
        cueRecord: null,
        partRecords: {},
        fullCurrentPart: 1,
        fullRecords: {},
        cuePrepStatus: "not_started",
        fullPrepStatus: {},
        partTimeFinished: {},
        recording: null,
        headerTimer: null,
        timer: null,
        feedback: null,
        loading: false,
        hasStarted: false,
        error: ""
    };

    let catalogLoaded = false;

    function setPlayerMode(enabled) {
        document.body.classList.toggle("speaking-player-mode", enabled);
        document.body.classList.toggle("test-list-page", !enabled);

        const cbtHeader = document.getElementById("speakingCbtHeader");
        const globalNavbar = document.getElementById("globalNavbar");
        const playerFooter = document.querySelector(".speaking-part-footer");

        if (cbtHeader) cbtHeader.style.display = enabled ? "grid" : "none";
        if (globalNavbar) globalNavbar.style.display = enabled ? "none" : "";
        if (playerFooter) playerFooter.style.display = enabled ? "none" : "";

        updatePlayerHeader();
        applySpeakingMockHeader();
    }

    function notifyMockSpeakingComplete(payload) {
        if (!isSpeakingMockMode || window.parent === window) return;

        window.parent.postMessage({
            type: "ieltsx-mock-section-complete",
            section: "speaking",
            ...payload
        }, window.location.origin);
    }

    function requestMockSpeakingExit() {
        if (!isSpeakingMockMode || window.parent === window) return;
        window.parent.postMessage({ type: "ieltsx-mock-exit-request" }, window.location.origin);
    }

    function applySpeakingMockHeader() {
        if (!isSpeakingMockMode) return;

        const brandTitle = document.getElementById("speakingBrandTitle");
        const dashboardBtn = document.getElementById("speakingDashboardBtn");
        const dashboardLabel = document.getElementById("speakingDashboardLabel");

        if (brandTitle) brandTitle.textContent = "Mock Exam";
        if (dashboardLabel) dashboardLabel.textContent = "Exit Mock Exam";
        if (dashboardBtn && dashboardBtn.dataset.mockExitBound !== "true") {
            dashboardBtn.dataset.mockExitBound = "true";
            dashboardBtn.removeAttribute("href");
            dashboardBtn.setAttribute("role", "button");
            dashboardBtn.setAttribute("tabindex", "0");
            dashboardBtn.addEventListener("click", (event) => {
                event.preventDefault();
                requestMockSpeakingExit();
            });
            dashboardBtn.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    requestMockSpeakingExit();
                }
            });
        }
    }

    function getHeaderSeconds() {
        if (state.headerTimer) return state.headerTimer.remaining;
        return getHeaderTotalSeconds();
    }

    function getHeaderTotalSeconds() {
        if (state.section === "full") return SPEAKING_TIMING.fullTotal;
        if (state.section === "part2") return SPEAKING_TIMING.part2Total;
        if (state.section === "part1") return SPEAKING_TIMING.part1;
        if (state.section === "part3") return SPEAKING_TIMING.part3;
        return SPEAKING_TIMING.fullTotal;
    }

    function updatePlayerHeader() {
        const timerVal = document.getElementById("speakingTimerVal");
        const timerBox = document.getElementById("speakingTimerDisplay");
        const submitBtn = document.getElementById("speakingHeaderSubmitBtn");
        const seconds = getHeaderSeconds();

        if (timerVal) timerVal.textContent = formatTime(seconds);
        if (timerBox) timerBox.classList.toggle("warning", seconds <= 60);
        if (submitBtn) {
            submitBtn.disabled = Boolean(state.loading) || !state.hasStarted;
            submitBtn.textContent = state.loading ? "Submitting..." : "Submit";
        }
    }

    function isSpeakingFullScreenActive() {
        return Boolean(document.fullscreenElement) || document.body.classList.contains("fullscreen-fallback");
    }

    function updateSpeakingFullScreenUI() {
        const active = isSpeakingFullScreenActive();
        document.body.classList.toggle("exam-fullscreen-active", active);
        document.querySelectorAll("[data-fullscreen-toggle]").forEach((button) => {
            button.textContent = active ? "Exit Full Screen" : "Full Screen";
            button.setAttribute("aria-pressed", active ? "true" : "false");
            button.setAttribute("title", active ? "Exit Full Screen" : "Full Screen");
        });
    }

    async function enterSpeakingFullScreen() {
        try {
            if (!document.documentElement.requestFullscreen) throw new Error("Fullscreen API is not available.");
            await document.documentElement.requestFullscreen();
            document.body.classList.remove("fullscreen-fallback");
        } catch {
            document.body.classList.add("fullscreen-fallback");
        }
        updateSpeakingFullScreenUI();
    }

    async function exitSpeakingFullScreen() {
        try {
            if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
        } catch {}
        document.body.classList.remove("exam-fullscreen-active", "fullscreen-fallback");
        updateSpeakingFullScreenUI();
    }

    function bindSpeakingFullScreen() {
        document.querySelectorAll("[data-fullscreen-toggle]").forEach((button) => {
            if (button.dataset.fullscreenBound === "true") return;
            button.dataset.fullscreenBound = "true";
            button.addEventListener("click", () => {
                if (isSpeakingFullScreenActive()) exitSpeakingFullScreen();
                else enterSpeakingFullScreen();
            });
        });

        if (!document.documentElement.dataset.speakingFullscreenEventsBound) {
            document.documentElement.dataset.speakingFullscreenEventsBound = "true";
            document.addEventListener("fullscreenchange", updateSpeakingFullScreenUI);
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape" && document.body.classList.contains("fullscreen-fallback")) {
                    exitSpeakingFullScreen();
                }
            });
        }

        updateSpeakingFullScreenUI();
    }

    async function requestPublishedSpeakingTests(sectionKey) {
        const response = await fetch(`/api/speaking/${sectionKey}`, {
            credentials: "include"
        });
        const data = await response.json().catch(() => []);
        if (!response.ok) {
            throw new Error(data.error || "Could not load Speaking tests.");
        }
        return Array.isArray(data) ? data : [];
    }

    async function loadPublishedCatalog() {
        if (catalogLoaded) return;
        catalogLoaded = true;

        try {
            const [part1, part2, part3, full] = await Promise.all([
                requestPublishedSpeakingTests("part1"),
                requestPublishedSpeakingTests("part2"),
                requestPublishedSpeakingTests("part3"),
                requestPublishedSpeakingTests("full")
            ]);

            if (part1.length) catalog.part1 = part1;
            if (part2.length) catalog.part2 = part2;
            if (part3.length) catalog.part3 = part3;
            if (full.length) catalog.full = full;
        } catch (error) {
            console.warn("Using bundled Speaking practice catalog:", error.message);
        }
    }

    function sectionIcon(sectionKey) {
        if (sectionKey === "part1") {
            return `<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>`;
        }
        if (sectionKey === "part3") {
            return `<path d="M8 6h11"></path><path d="M8 12h11"></path><path d="M8 18h11"></path><path d="M4 6h.01"></path><path d="M4 12h.01"></path><path d="M4 18h.01"></path>`;
        }
        if (sectionKey === "full") {
            return `<path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>`;
        }
        return `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path>`;
    }

    function parseRoute() {
        const parts = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
        if (parts[0] !== "speaking") return { view: "home" };
        const rawSection = parts[1] || "";
        const sectionKey = rawSection === "part1" || rawSection === "part-1"
            ? "part1"
            : rawSection === "part2" || rawSection === "part-2" || rawSection === "cue-card"
                ? "part2"
                : rawSection === "part3" || rawSection === "part-3"
                    ? "part3"
                    : rawSection === "full-test" || rawSection === "fulltest"
                        ? "full"
                        : "";

        if (!sectionKey) return { view: "home" };
        if (!parts[2]) return { view: "listing", sectionKey };
        return { view: "test", sectionKey, testId: parts[2] };
    }

    function formatTime(seconds) {
        const safe = Math.max(0, Number(seconds) || 0);
        const mins = String(Math.floor(safe / 60)).padStart(2, "0");
        const secs = safe % 60;
        return `${mins}:${String(secs).padStart(2, "0")}`;
    }

    function findTest(sectionKey, testId) {
        const tests = catalog[sectionKey] || [];
        return tests.find((item) => item.id === testId) || tests[0] || null;
    }

    async function loadSpeakingTestDetail(sectionKey, testId) {
        const response = await fetch(`/api/speaking/${encodeURIComponent(sectionKey)}/${encodeURIComponent(testId)}`, {
            credentials: "include"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Could not load Speaking test.");
        }
        const tests = catalog[sectionKey] || [];
        const index = tests.findIndex((item) => item.id === data.id);
        if (index >= 0) tests[index] = data;
        else tests.unshift(data);
        return data;
    }

    function clearTimer() {
        if (state.timer?.id) clearInterval(state.timer.id);
        state.timer = null;
    }

    function clearHeaderTimer() {
        if (state.headerTimer?.id) clearInterval(state.headerTimer.id);
        state.headerTimer = null;
    }

    function clearAllPlayerTimers() {
        clearTimer();
        clearHeaderTimer();
    }

    function startHeaderTimer(seconds) {
        clearHeaderTimer();
        state.headerTimer = { remaining: seconds, id: null };
        updatePlayerHeader();
        state.headerTimer.id = setInterval(() => {
            if (!state.headerTimer) return;
            state.headerTimer.remaining -= 1;
            if (state.headerTimer.remaining <= 0) {
                clearHeaderTimer();
                handleHeaderTimerDone();
                return;
            }
            updatePlayerHeader();
        }, 1000);
    }

    function startTimer(label, seconds, onDone, partNumber = null, phase = "") {
        clearTimer();
        state.timer = { label, remaining: seconds, id: null, partNumber, phase };
        state.timer.id = setInterval(() => {
            if (!state.timer) return;
            state.timer.remaining -= 1;
            if (state.timer.remaining <= 0) {
                const done = onDone;
                clearTimer();
                if (typeof done === "function") done();
            }
            renderCurrentTest();
        }, 1000);
        renderCurrentTest();
    }

    function handleHeaderTimerDone() {
        if (state.recording) stopRecording();
        clearTimer();
        if (state.section === "full") {
            submitFull();
        } else {
            renderCurrentTest();
        }
    }

    function stopTracks(stream) {
        if (stream) stream.getTracks().forEach((track) => track.stop());
    }

    function startRecognition(recording) {
        if (!SpeechRecognition) return null;
        try {
            const recognition = new SpeechRecognition();
            recognition.lang = "en-US";
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.onresult = (event) => {
                let finalText = recording.finalTranscript || "";
                let interim = "";
                for (let i = event.resultIndex; i < event.results.length; i += 1) {
                    const transcript = event.results[i][0]?.transcript || "";
                    if (event.results[i].isFinal) finalText += `${transcript} `;
                    else interim += transcript;
                }
                recording.finalTranscript = finalText;
                recording.transcript = `${finalText}${interim}`.trim();
                renderCurrentTest();
            };
            recognition.onerror = () => {};
            recognition.start();
            return recognition;
        } catch {
            return null;
        }
    }

    function activeFullParts() {
        return Array.isArray(state.test?.parts) ? state.test.parts : [];
    }

    function activeFullPart() {
        return activeFullParts().find((part) => part.part === state.fullCurrentPart) || activeFullParts()[0] || null;
    }

    function durationForScope(scope) {
        if (scope.mode === "cue") return SPEAKING_TIMING.part2Speaking;
        if (scope.mode === "full") {
            const partNumber = Number(scope.part) || activeFullPart()?.part || 1;
            return getPartSpeakingSeconds(partNumber);
        }
        return getPartSpeakingSeconds(getStandalonePartNumber());
    }

    function getPartSpeakingSeconds(partNumber) {
        if (partNumber === 2) return SPEAKING_TIMING.part2Speaking;
        if (partNumber === 3) return SPEAKING_TIMING.part3;
        return SPEAKING_TIMING.part1;
    }

    function startActivePartTimer() {
        const part = getActivePlayerPart();
        clearTimer();
        if (part.part === 2) return;
        state.partTimeFinished[part.part] = false;
        startTimer("Speaking time", getPartSpeakingSeconds(part.part), () => {
            handleSpeakingTimerDone(part.part);
        }, part.part, "speaking");
    }

    function moveToFullPart(partNumber) {
        clearTimer();
        state.fullCurrentPart = partNumber;
        setError("");
        if (partNumber !== 2) startActivePartTimer();
        else renderCurrentTest();
    }

    function handleSpeakingTimerDone(partNumber) {
        state.partTimeFinished[partNumber] = true;
        if (isRecordingPart(partNumber)) stopRecording();
        if (state.section !== "full") {
            renderCurrentTest();
            return;
        }
        if (partNumber === 1) moveToFullPart(2);
        else if (partNumber === 2) moveToFullPart(3);
        else if (partNumber === 3) submitFull();
    }

    async function startRecording(scope) {
        if (!state.hasStarted) return;
        if (state.recording) return;
        const partNumber = scope.mode === "cue"
            ? 2
            : scope.mode === "full"
                ? Number(scope.part) || 1
                : getStandalonePartNumber();
        if (partNumber === 2 && getPrepStatus(partNumber) !== "finished" && !getRecordForPart(partNumber)?.blob) {
            setError("Start and finish preparation time before recording.");
            return;
        }
        setError("");
        try {
            if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
                throw new Error("unsupported");
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const recording = {
                scope,
                stream,
                recorder,
                chunks: [],
                blob: null,
                audioUrl: "",
                transcript: "",
                finalTranscript: "",
                startedAt: Date.now()
            };

            recorder.ondataavailable = (event) => {
                if (event.data?.size) recording.chunks.push(event.data);
            };
            recorder.onstop = () => {
                recording.blob = new Blob(recording.chunks, { type: recorder.mimeType || "audio/webm" });
                recording.audioUrl = URL.createObjectURL(recording.blob);
                stopTracks(stream);
                try {
                    recording.recognition?.stop();
                } catch {}
                saveRecording(recording);
                state.recording = null;
                const recordedPartNumber = recording.scope.mode === "cue"
                    ? 2
                    : recording.scope.mode === "full"
                        ? Number(recording.scope.part) || 1
                        : getStandalonePartNumber();
                if (state.timer?.partNumber === recordedPartNumber) {
                    clearTimer();
                }
                renderCurrentTest();
            };

            recording.recognition = startRecognition(recording);
            state.recording = recording;
            recorder.start();
            if (partNumber === 2) {
                state.partTimeFinished[partNumber] = false;
                startTimer("Speaking time", durationForScope(scope), () => {
                    handleSpeakingTimerDone(partNumber);
                }, partNumber, "speaking");
            }
        } catch (error) {
            setError(error?.name === "NotAllowedError"
                ? "Microphone permission was denied. Allow microphone access and try again."
                : "Could not access your microphone. Check browser permissions and try again.");
        }
    }

    function stopRecording() {
        if (!state.recording) return;
        if (state.recording.recorder.state !== "inactive") {
            state.recording.recorder.stop();
        }
    }

    function saveRecording(recording) {
        const saved = {
            blob: recording.blob,
            audioUrl: recording.audioUrl,
            transcript: recording.transcript || recording.finalTranscript || "",
            durationSeconds: Math.round((Date.now() - recording.startedAt) / 1000)
        };
        if (recording.scope.mode === "cue") state.cueRecord = saved;
        else if (recording.scope.mode === "full") state.fullRecords[recording.scope.part] = saved;
        else state.partRecords[state.section] = saved;
    }

    function updateTranscript(scope, value) {
        if (scope === "cue" && state.cueRecord) state.cueRecord.transcript = value;
        else if (scope === "single" && state.partRecords[state.section]) state.partRecords[state.section].transcript = value;
        else if (state.fullRecords[scope]) state.fullRecords[scope].transcript = value;
    }

    function setError(message) {
        state.error = message || "";
        renderCurrentTest();
    }

    function renderHero({ title, subtitle, meta = true, centered = false }) {
        return `
            <section class="speaking-hero ${centered ? "speaking-hero--centered" : ""}" aria-labelledby="speakingPageTitle">
                <div>
                    <span class="test-list-eyebrow">IELTS Speaking</span>
                    <h1 id="speakingPageTitle">${escapeHtml(title)}</h1>
                    <div class="speaking-hero-rule" aria-hidden="true"></div>
                    <p>${escapeHtml(subtitle)}</p>
                </div>
                ${meta ? `
                    <div class="test-list-meta speaking-hero-meta" aria-label="Speaking practice metadata">
                        <span><strong>3</strong> Parts</span>
                        <span><strong>AI</strong> Feedback</span>
                        <span><strong>11-14 min</strong> Full test</span>
                    </div>
                ` : ""}
            </section>
        `;
    }

    function renderHome() {
        clearAllPlayerTimers();
        setPlayerMode(false);
        document.title = "Speaking Practice - IELTSX";
        app.innerHTML = `
            ${renderHero({
                title: "Speaking Practice",
                subtitle: "Choose a speaking route or take a full speaking test with AI feedback and band estimation."
            })}
            <section class="speaking-route-grid" aria-label="Speaking practice routes">
                ${Object.entries(sectionMeta).map(([sectionKey, meta]) => renderCategoryCard(sectionKey, meta)).join("")}
            </section>
        `;
    }

    function renderCategoryCard(sectionKey, meta) {
        return `
            <a class="test-list-card speaking-route-card" href="${meta.route}">
                <div class="test-card-top">
                    <span class="test-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            ${sectionIcon(sectionKey)}
                        </svg>
                    </span>
                    <span class="test-card-badge">${escapeHtml(meta.categoryBadge)}</span>
                </div>
                <div class="test-card-content">
                    <h2>${escapeHtml(meta.categoryTitle)}</h2>
                    <p>${escapeHtml(meta.categoryDescription)}</p>
                </div>
                <div class="test-card-stats">
                    ${meta.stats.slice(0, 2).map(([value, label]) => `<span><strong>${escapeHtml(value)}</strong> ${escapeHtml(label)}</span>`).join("")}
                </div>
                <div class="test-card-button">Open Section <span>-&gt;</span></div>
            </a>
        `;
    }

    function renderListing(sectionKey) {
        clearAllPlayerTimers();
        setPlayerMode(false);
        const meta = sectionMeta[sectionKey];
        const tests = catalog[sectionKey] || [];
        document.title = `${meta.listingTitle} - IELTSX`;
        app.innerHTML = `
            ${renderHero({
                title: meta.listingTitle,
                subtitle: meta.listingSubtitle,
                meta: false,
                centered: true
            })}
            <section class="test-list-grid test-list-grid--manual writing-test-grid speaking-test-grid" aria-label="${escapeHtml(meta.listingTitle)}">
                ${tests.length ? tests.map((test, index) => renderTestCard(sectionKey, test, index)).join("") : `<div class="test-list-empty">No Speaking tests found.</div>`}
            </section>
        `;
    }

    function renderTestCard(sectionKey, test, index) {
        const meta = sectionMeta[sectionKey];
        const displayTitle = `Test ${index + 1}`;
        const formatCueTime = (value, fallback) => String(value || fallback).trim().replace(/^(\d+)\s*min$/i, "$1 min");
        const stats = sectionKey === "part2"
            ? [["1", "Cue Card"], [formatCueTime(test.prepTime, "1 min"), "Prep"], [formatCueTime(test.speakingTime, "2 min"), "Speaking"]]
            : sectionKey === "full"
                ? [["3", "Parts"], [test.estimatedTime || "11-14 min", "Estimated time"], ["AI", "Feedback included"]]
                : [[String(test.questions?.length || meta.stats[0][0]), "Questions"], [test.speakingTime || meta.stats[1][0], "Estimated time"]];
        const statsClass = [
            stats.length > 2 ? "speaking-card-stats--three" : "",
            sectionKey === "part2" ? "speaking-card-stats--cue meta-grid" : ""
        ].filter(Boolean).join(" ");
        return `
            <a class="writing-test-card speaking-test-card speaking-test-card--sealed" href="${meta.route}/${encodeURIComponent(test.id)}" aria-label="${escapeHtml(`${meta.badge} ${displayTitle}`)}">
                <div class="test-card-top">
                    <span class="test-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            ${sectionIcon(sectionKey)}
                        </svg>
                    </span>
                    <span class="test-card-badge">${escapeHtml(meta.badge)}</span>
                </div>
                <div class="test-card-content">
                    <h2>${escapeHtml(displayTitle)}</h2>
                </div>
                <div class="test-card-stats ${statsClass}">
                    ${stats.map(([value, label]) => sectionKey === "part2"
                        ? `<span class="speaking-meta-box meta-box"><strong class="speaking-meta-value meta-value">${escapeHtml(value)}</strong><small class="speaking-meta-label meta-label">${escapeHtml(label)}</small></span>`
                        : `<span><strong>${escapeHtml(value)}</strong> ${escapeHtml(label)}</span>`).join("")}
                </div>
                <div class="test-card-button">${escapeHtml(meta.button)} <span>-&gt;</span></div>
            </a>
        `;
    }

    function renderTimerBox(label, seconds) {
        return `
            <div class="speaking-timer-box">
                <span>${escapeHtml(label)}</span>
                <strong>${formatTime(seconds)}</strong>
            </div>
        `;
    }

    function renderStatus() {
        if (state.loading) return `<div class="speaking-status">AI is checking your speaking...</div>`;
        if (state.recording) return `<div class="speaking-status recording">Recording: ${state.timer ? formatTime(state.timer.remaining) : "live"}</div>`;
        if (state.timer) return `<div class="speaking-status">${escapeHtml(state.timer.label)}: ${formatTime(state.timer.remaining)}</div>`;
        return `<div class="speaking-status">Ready</div>`;
    }

    function renderAudioPreview(record, transcriptId) {
        if (!record?.audioUrl) return "";
        return `
            <div class="speaking-audio-preview">
                <strong>Audio preview</strong>
                <audio controls preload="metadata" src="${record.audioUrl}"></audio>
            </div>
            <div class="speaking-transcript-box">
                <strong>Transcript</strong>
                <p class="speaking-muted">The browser transcript is optional. The server will also try to transcribe your audio before AI feedback.</p>
                <textarea data-transcript="${transcriptId}" placeholder="Transcript will appear here if your browser supports speech recognition. You can also edit it before submitting.">${escapeHtml(record.transcript || "")}</textarea>
            </div>
        `;
    }

    function renderCurrentTest() {
        if (!state.section || !state.test) return;
        if (state.section === "full") renderFullPractice();
        else if (state.section === "part2") renderCuePractice();
        else renderSinglePractice();
    }

    async function renderTest(sectionKey, testId) {
        let test = findTest(sectionKey, testId);
        if (!test) {
            renderListing(sectionKey);
            return;
        }
        if (!test.questions?.length && !test.bullets?.length && !test.parts?.length) {
            test = await loadSpeakingTestDetail(sectionKey, test.id || testId);
        }
        state.section = sectionKey;
        state.test = test;
        state.error = "";
        state.feedback = null;
        state.cuePrepStatus = "not_started";
        state.fullPrepStatus = {};
        state.partTimeFinished = {};
        state.fullCurrentPart = 1;
        state.recording = null;
        state.hasStarted = isSpeakingMockMode;
        clearAllPlayerTimers();
        setPlayerMode(true);
        document.title = `${test.title} - ${sectionMeta[sectionKey].listingTitle} - IELTSX`;
        if (isSpeakingMockMode) {
            startHeaderTimer(getHeaderTotalSeconds());
            if (state.section !== "part2") {
                startActivePartTimer();
            }
        }
        renderCurrentTest();
    }

    function beginSpeakingTest() {
        if (state.hasStarted || state.loading || !state.test) return;
        state.hasStarted = true;
        startHeaderTimer(getHeaderTotalSeconds());
        if (state.section !== "part2") {
            startActivePartTimer();
        } else {
            renderCurrentTest();
        }
    }

    function renderSinglePractice() {
        renderSpeakingPlayer();
    }

    function renderCuePractice() {
        renderSpeakingPlayer();
    }

    function renderFullPractice() {
        renderSpeakingPlayer();
    }

    function getPartKey(partNumber) {
        if (partNumber === 2) return "part2";
        if (partNumber === 3) return "part3";
        return "part1";
    }

    function getStandalonePartNumber() {
        if (state.section === "part2") return 2;
        if (state.section === "part3") return 3;
        return 1;
    }

    function getSpeakingWindow(partNumber) {
        return partNumber === 2 ? "2 minutes" : "5 minutes";
    }

    function getTimeAllowedLabel(part) {
        if (state.section === "full") return "13 minutes";
        if (part.part === 2) return "3 minutes";
        return "5 minutes";
    }

    function getActivePlayerPart() {
        if (state.section === "full") {
            const fullPart = activeFullPart() || {};
            const partNumber = Number(fullPart.part) || 1;
            const partKey = getPartKey(partNumber);
            return {
                part: partNumber,
                title: PLAYER_TITLES[partNumber] || fullPart.title || "Speaking Test",
                testType: `Speaking Part ${partNumber}`,
                prompt: fullPart.prompt || (partNumber === 2 ? PLAYER_DEFAULTS.part2.topic : state.test?.topic || ""),
                questions: partNumber === 2 ? [] : (fullPart.questions?.length ? fullPart.questions : PLAYER_DEFAULTS[partKey].questions),
                bullets: partNumber === 2 ? (fullPart.questions?.length ? fullPart.questions : PLAYER_DEFAULTS.part2.bullets) : [],
                referenceHtml: fullPart.referenceHtml || "",
                prepSeconds: partNumber === 2 ? SPEAKING_TIMING.part2Prep : 0,
                durationSeconds: getPartSpeakingSeconds(partNumber),
                isFullTest: true
            };
        }

        const partNumber = getStandalonePartNumber();
        const partKey = getPartKey(partNumber);
        return {
            part: partNumber,
            title: PLAYER_TITLES[partNumber],
            testType: `Speaking Part ${partNumber}`,
            prompt: partNumber === 2
                ? (state.test?.topic || state.test?.description || PLAYER_DEFAULTS.part2.topic)
                : (state.test?.topic || state.test?.description || ""),
            questions: partNumber === 2 ? [] : (state.test?.questions?.length ? state.test.questions : PLAYER_DEFAULTS[partKey].questions),
            bullets: partNumber === 2 ? (state.test?.bullets?.length ? state.test.bullets : PLAYER_DEFAULTS.part2.bullets) : [],
            prepSeconds: partNumber === 2 ? SPEAKING_TIMING.part2Prep : 0,
            durationSeconds: getPartSpeakingSeconds(partNumber),
            isFullTest: false
        };
    }

    function getRecordForPart(partNumber) {
        if (state.section === "full") return state.fullRecords[partNumber];
        if (state.section === "part2") return state.cueRecord;
        return state.partRecords[state.section];
    }

    function isRecordingPart(partNumber) {
        if (!state.recording) return false;
        if (state.section === "full") {
            return state.recording.scope?.mode === "full" && state.recording.scope?.part === partNumber;
        }
        if (state.section === "part2") return state.recording.scope?.mode === "cue";
        return state.recording.scope?.mode === "single";
    }

    function getPrepStatus(partNumber) {
        if (partNumber !== 2) return "not_needed";
        if (state.section === "full") return state.fullPrepStatus[partNumber] || "not_started";
        if (state.section === "part2") return state.cuePrepStatus || "not_started";
        return "not_needed";
    }

    function setPrepStatus(partNumber, status) {
        if (partNumber !== 2) return;
        if (state.section === "full") state.fullPrepStatus[partNumber] = status;
        else if (state.section === "part2") state.cuePrepStatus = status;
    }

    function isPrepTimerActive() {
        return state.timer?.label === "Preparation time";
    }

    function getPrepRemaining(part) {
        const status = getPrepStatus(part.part);
        if (status === "running" && isPrepTimerActive()) return state.timer.remaining;
        if (status === "finished") return 0;
        return part.prepSeconds || SPEAKING_TIMING.part2Prep;
    }

    function startPreparationForActivePart() {
        if (!state.hasStarted) return;
        const part = getActivePlayerPart();
        if (part.part !== 2 || state.recording || state.loading) return;
        setError("");
        setPrepStatus(part.part, "running");
        startTimer("Preparation time", part.prepSeconds || SPEAKING_TIMING.part2Prep, () => {
            setPrepStatus(part.part, "finished");
            renderCurrentTest();
        }, part.part, "preparation");
    }

    function getRecordingStatusText(partNumber) {
        if (isRecordingPart(partNumber)) return "Recording";
        return getRecordForPart(partNumber)?.blob ? "Recorded" : "Not started";
    }

    function getRecordingSeconds(partNumber) {
        if (state.timer?.phase === "speaking" && state.timer.partNumber === partNumber) {
            return state.timer.remaining;
        }
        if (state.partTimeFinished[partNumber]) return 0;
        if (partNumber === 2 && getPrepStatus(partNumber) === "finished") return SPEAKING_TIMING.part2Speaking;
        if (partNumber === 1 || partNumber === 3) return getPartSpeakingSeconds(partNumber);
        const record = getRecordForPart(partNumber);
        return record?.durationSeconds || 0;
    }

    function formatDuration(seconds) {
        const safe = Math.max(0, Number(seconds) || 0);
        const mins = String(Math.floor(safe / 60)).padStart(2, "0");
        const secs = String(safe % 60).padStart(2, "0");
        return `${mins}:${secs}`;
    }

    function getStartAction() {
        if (state.section === "full") return "start-full-recording";
        if (state.section === "part2") return "start-cue-recording";
        return "start-single-recording";
    }

    function renderSpeakingPlayer() {
        setPlayerMode(true);
        if (!state.hasStarted) {
            updatePlayerHeader();
            const preStartMarkup = window.PreTestStartScreen?.markup
                ? window.PreTestStartScreen.markup(isSpeakingMockMode ? { message: "Start Test" } : {})
                : `<section class="ieltsx-prestart-stage ieltsx-prestart-stage--compact" aria-label="Start test"><button class="ieltsx-prestart-card" type="button" data-pretest-start><span class="ieltsx-prestart-text">${isSpeakingMockMode ? "Start Test" : "Click <span class=\"ieltsx-prestart-link\">here</span> to start the test"}</span></button></section>`;
            app.innerHTML = `
                <section class="speaking-player-screen ${state.section === "full" ? "speaking-player-screen--full" : "speaking-player-screen--single"}" aria-label="Speaking test player">
                    <main class="speaking-player-stage speaking-player-stage--prestart">
                        ${preStartMarkup}
                    </main>
                </section>
            `;
            return;
        }
        const part = getActivePlayerPart();
        const record = getRecordForPart(part.part);
        const isRecording = isRecordingPart(part.part);
        const recordingStatus = getRecordingStatusText(part.part);
        updatePlayerHeader();

        app.innerHTML = `
            <section class="speaking-player-screen ${state.section === "full" ? "speaking-player-screen--full" : "speaking-player-screen--single"}" aria-label="Speaking test player">
                <main class="speaking-player-stage">
                    ${renderSpeakingQuestionPanel(part)}
                    ${renderSpeakingResponsePanel(part, record, isRecording)}
                    ${renderSpeakingInfoPanel(part, recordingStatus)}
                </main>
                ${renderSpeakingBottomTabs(part.part)}
            </section>
            ${renderFeedback()}
        `;
    }

    function renderSpeakingQuestionPanel(part) {
        return `
            <div class="player-panel prompt-panel-card speaking-task-card">
                <div class="prompt-card-header speaking-player-card-header">
                    <svg class="panel-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                    <h2 class="panel-header-title">${escapeHtml(part.title)}</h2>
                </div>
                <div class="info-alert-box">
                    <span class="info-alert-icon">!</span>
                    <div class="info-alert-content">You should answer the questions clearly and naturally.</div>
                </div>
                ${part.part === 2 ? renderCueCardPrompt(part) : renderQuestionList(part)}
                ${part.prepSeconds ? `
                    <div class="speaking-time-row">
                        <span>Preparation time:</span>
                        <strong>1 minute</strong>
                    </div>
                ` : ""}
                <div class="speaking-time-row">
                    <span>Speaking time:</span>
                    <strong>${getSpeakingWindow(part.part)}</strong>
                </div>
            </div>
        `;
    }

    function renderQuestionList(part) {
        const questions = part.questions?.length ? part.questions : PLAYER_DEFAULTS[getPartKey(part.part)].questions;
        return `
            ${part.referenceHtml ? `<div class="speaking-html-reference">${part.referenceHtml}</div>` : ""}
            <ol class="speaking-player-question-list">
                ${questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ol>
        `;
    }

    function renderCueCardPrompt(part) {
        const bullets = part.bullets?.length ? part.bullets : PLAYER_DEFAULTS.part2.bullets;
        return `
            ${part.referenceHtml ? `<div class="speaking-html-reference">${part.referenceHtml}</div>` : ""}
            <div class="speaking-cue-card-box">
                <h3>${escapeHtml(part.prompt || PLAYER_DEFAULTS.part2.topic)}</h3>
                <ul>
                    ${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
            </div>
        `;
    }

    function renderSpeakingResponsePanel(part, record, isRecording) {
        const requiresPrep = part.part === 2 && !record?.blob;
        const prepStatus = getPrepStatus(part.part);
        const prepFinished = !requiresPrep || prepStatus === "finished";
        const prepRunning = requiresPrep && prepStatus === "running";
        const canStart = !state.recording && !state.loading && prepFinished && !state.partTimeFinished[part.part];
        const canPlay = Boolean(record?.audioUrl);
        return `
            <div class="player-panel editor-panel-card speaking-response-card">
                <h2 class="editor-panel-title">Your Response</h2>
                <div class="speaking-recording-wrapper">
                    ${renderPreparationPanel(part, requiresPrep, prepStatus)}
                    <div class="speaking-recording-panel">
                        <div class="speaking-mic-circle ${isRecording ? "is-recording" : ""}" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 18.5a5.5 5.5 0 0 0 5.5-5.5V7a5.5 5.5 0 0 0-11 0v6a5.5 5.5 0 0 0 5.5 5.5Z"></path>
                                <path d="M5 12.5a7 7 0 0 0 14 0"></path>
                                <path d="M12 19v3"></path>
                            </svg>
                        </div>
                        <span class="speaking-recording-timer">${formatDuration(getRecordingSeconds(part.part))}</span>
                        <div class="speaking-waveform" aria-hidden="true">
                            ${Array.from({ length: 18 }, (_, index) => `<span class="${isRecording && index % 3 === 0 ? "is-hot" : ""}"></span>`).join("")}
                        </div>
                    </div>
                    <div class="speaking-recorder-actions ${requiresPrep && !prepFinished ? "speaking-recorder-actions--prep" : ""}">
                        ${requiresPrep && !prepFinished ? `
                            <button class="speaking-record-btn speaking-record-btn--primary" type="button" data-action="start-preparation" ${prepRunning ? "disabled" : ""}>Start Preparation</button>
                            <button class="speaking-record-btn speaking-record-btn--secondary" type="button" disabled>Start Recording</button>
                        ` : `
                            <button class="speaking-record-btn speaking-record-btn--primary" type="button" data-action="${getStartAction()}" ${canStart ? "" : "disabled"}>Start Recording</button>
                            <button class="speaking-record-btn speaking-record-btn--secondary" type="button" data-action="stop-recording" ${state.recording ? "" : "disabled"}>Stop Recording</button>
                            <button class="speaking-record-btn speaking-record-btn--secondary" type="button" data-action="play-recording" ${canPlay ? "" : "disabled"}>Play Recording</button>
                        `}
                    </div>
                    ${state.error ? `<div class="speaking-error">${escapeHtml(state.error)}</div>` : ""}
                </div>
            </div>
        `;
    }

    function renderPreparationPanel(part, requiresPrep, prepStatus) {
        if (!requiresPrep) return "";
        const seconds = getPrepRemaining(part);
        const message = prepStatus === "running"
            ? "Prepare your answer. You can make notes mentally."
            : prepStatus === "finished"
                ? "Preparation finished"
                : "Start the one-minute preparation time before recording.";

        return `
            <div class="speaking-prep-panel ${prepStatus === "running" ? "is-running" : ""} ${prepStatus === "finished" ? "is-finished" : ""}">
                <span>Preparation Time</span>
                <strong>${formatDuration(seconds)}</strong>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
    }

    function renderSpeakingInfoPanel(part, recordingStatus) {
        return `
            <aside class="player-sidebar speaking-player-sidebar" aria-label="Speaking information">
                <div class="sidebar-card">
                    <h3 class="sidebar-card-title">Test Information</h3>
                    <div class="sidebar-info-group">
                        <div class="info-label">Test Type</div>
                        <div class="info-value red-text">${escapeHtml(part.testType)}</div>
                    </div>
                    <div class="sidebar-info-group">
                        <div class="info-label">Time Allowed</div>
                        <div class="info-value red-text">${escapeHtml(getTimeAllowedLabel(part))}</div>
                    </div>
                    <div class="sidebar-info-group">
                        <div class="info-label">Current Part</div>
                        <div class="info-value red-text">Part ${part.part}</div>
                    </div>
                    <div class="sidebar-info-group">
                        <div class="info-label">Recording Status</div>
                        <div class="info-value red-text">${escapeHtml(recordingStatus)}</div>
                    </div>
                </div>
                <div class="sidebar-card">
                    <h3 class="sidebar-card-title speaking-tips-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path>
                            <line x1="9" y1="18" x2="15" y2="18"></line>
                            <line x1="10" y1="22" x2="14" y2="22"></line>
                        </svg>
                        Tips
                    </h3>
                    <ul class="tips-list">
                        ${PLAYER_TIPS.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}
                    </ul>
                </div>
            </aside>
        `;
    }

    function renderSpeakingBottomTabs(activePart) {
        if (state.section !== "full") return "";

        const tabs = [1, 2, 3];
        return `
            <nav class="speaking-task-tabs-shell" aria-label="Speaking parts">
                <div class="cbt-part-tabs">
                    ${tabs.map((partNumber) => `
                        <button class="${activePart === partNumber ? "active" : ""}" type="button" data-action="select-part" data-part="${partNumber}" aria-pressed="${activePart === partNumber ? "true" : "false"}">
                            Part ${partNumber}
                        </button>
                    `).join("")}
                </div>
            </nav>
        `;
    }

    function submitActiveAttempt() {
        if (!state.hasStarted) return;
        if (state.section === "full") submitFull();
        else if (state.section === "part2") submitCue();
        else submitSingle();
    }

    function playActiveRecording() {
        const part = getActivePlayerPart();
        const record = getRecordForPart(part.part);
        if (!record?.audioUrl) return;
        const audio = new Audio(record.audioUrl);
        audio.play().catch(() => {
            setError("Could not play the saved recording. Try recording again.");
        });
    }

    function renderFeedback() {
        if (!state.feedback) return "";
        const feedback = state.feedback;
        const bands = [
            ["Overall", feedback.overallBand],
            ["Fluency and Coherence", feedback.fluencyCoherence],
            ["Lexical Resource", feedback.lexicalResource],
            ["Grammar", feedback.grammaticalRangeAccuracy],
            ["Pronunciation", feedback.pronunciation]
        ];
        return `
            <section class="speaking-feedback-card">
                <div class="speaking-card-head">
                    <div>
                        <span class="speaking-section-kicker">AI Feedback</span>
                        <h3>Speaking Band Estimate</h3>
                        <p>${escapeHtml(feedback.detailedFeedback || "Review your Speaking feedback below.")}</p>
                    </div>
                    <a class="speaking-secondary speaking-header-back" href="${sectionMeta[state.section].route}">&lt;- Back</a>
                </div>
                <div class="speaking-band-row">
                    ${bands.map(([label, value]) => `<div class="speaking-band-card"><span>${escapeHtml(label)}</span><strong>${Number(value || 0).toFixed(1)}</strong></div>`).join("")}
                </div>
                <div class="speaking-feedback-grid">
                    ${renderFeedbackList("Strengths", feedback.strengths)}
                    ${renderFeedbackList("Problems", feedback.problems)}
                    ${renderFeedbackList("How to improve", feedback.howToImprove)}
                    ${renderFeedbackList("Suggested improved answers", feedback.improvedAnswers)}
                    ${renderFeedbackList("Practical tips", feedback.practicalTips)}
                </div>
            </section>
        `;
    }

    function renderFeedbackList(title, items) {
        const list = Array.isArray(items) ? items.filter(Boolean) : [];
        return `
            <section class="speaking-feedback-section">
                <h4>${escapeHtml(title)}</h4>
                ${list.length
                    ? `<ul class="speaking-feedback-list">${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                    : `<p class="speaking-muted">No notes saved for this section.</p>`}
            </section>
        `;
    }

    async function submitSingle() {
        const meta = sectionMeta[state.section];
        const record = state.partRecords[state.section];
        if (!record?.blob) {
            setError("Record your answer before submitting.");
            return;
        }
        const part = {
            part: meta.part,
            title: meta.categoryTitle,
            prompt: `${state.test.topic || state.test.description || meta.categoryTitle}\n${(state.test.questions || []).join("\n")}`,
            transcript: record.transcript || ""
        };
        await submitAttempt({
            mode: meta.submitMode,
            title: `${meta.categoryTitle} - ${state.test.title}`,
            topic: state.test.topic || state.test.description || meta.categoryTitle,
            prompt: state.test,
            records: [record],
            parts: [part]
        });
    }

    async function submitCue() {
        if (!state.cueRecord?.blob) {
            setError("Record your Cue Card answer before submitting.");
            return;
        }
        const part = {
            part: 2,
            title: "Cue Card",
            prompt: `${state.test.topic || state.test.description || "Cue Card"}\n${(state.test.bullets || []).join("\n")}`,
            transcript: state.cueRecord.transcript || ""
        };
        await submitAttempt({
            mode: "cue_card",
            title: `Cue Card Practice - ${state.test.title}`,
            topic: state.test.topic,
            prompt: state.test,
            records: [state.cueRecord],
            parts: [part]
        });
    }

    async function submitFull() {
        const parts = activeFullParts();
        const records = parts.map((part) => state.fullRecords[part.part]);
        if (records.some((record) => !record?.blob)) {
            setError("Record all three parts before submitting the full test.");
            return;
        }
        const submittedParts = parts.map((part) => ({
            part: part.part,
            title: part.title,
            prompt: `${part.prompt || ""}\n${(part.questions || []).join("\n")}`,
            transcript: state.fullRecords[part.part]?.transcript || ""
        }));
        await submitAttempt({
            mode: "full_test",
            title: `Full Speaking Test - ${state.test.title}`,
            topic: state.test.topic || "Full IELTS Speaking Test",
            prompt: state.test,
            records,
            parts: submittedParts
        });
    }

    function applyServerTranscripts(mode, parts) {
        if (!Array.isArray(parts)) return;
        if (mode === "cue_card" && state.cueRecord && parts[0]?.transcript) {
            state.cueRecord.transcript = parts[0].transcript;
        } else if ((mode === "part_1" || mode === "part_3") && state.partRecords[state.section] && parts[0]?.transcript) {
            state.partRecords[state.section].transcript = parts[0].transcript;
        } else if (mode === "full_test") {
            parts.forEach((part) => {
                if (state.fullRecords[part.part] && part.transcript) {
                    state.fullRecords[part.part].transcript = part.transcript;
                }
            });
        }
    }

    async function submitAttempt({ mode, title, topic, prompt, records, parts }) {
        state.loading = true;
        state.error = "";
        state.feedback = null;
        renderCurrentTest();
        try {
            const form = new FormData();
            form.append("mode", mode);
            form.append("title", title);
            form.append("topic", topic);
            form.append("prompt", JSON.stringify(prompt));
            form.append("parts", JSON.stringify(parts));
            form.append("transcript", parts.map((part) => part.transcript || "").filter(Boolean).join("\n\n"));
            records.forEach((record, index) => {
                form.append("audio", new File([record.blob], `${mode}-${index + 1}.webm`, { type: record.blob.type || "audio/webm" }));
            });

            const response = await fetch("/api/speaking/submit", {
                method: "POST",
                credentials: "include",
                body: form
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "AI feedback failed. Please try again.");
            state.feedback = data.feedback;
            applyServerTranscripts(mode, data.attempt?.parts);
            if (mode === "full_test") {
                const submittedParts = data.attempt?.parts || parts;
                notifyMockSpeakingComplete({
                    testId: state.test?.id || "",
                    band: Number(data.feedback?.overallBand) || 0,
                    result: data.feedback,
                    parts: submittedParts,
                    answers: Object.fromEntries((submittedParts || []).map((part) => [
                        `part${part.part}`,
                        part.transcript || ""
                    ]))
                });
            }
        } catch (error) {
            state.error = error.message || "AI feedback failed. Please try again.";
        } finally {
            state.loading = false;
            renderCurrentTest();
        }
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    async function boot() {
        bindSpeakingFullScreen();
        const route = parseRoute();
        if (route.view !== "home") {
            await loadPublishedCatalog();
        }
        if (route.view === "listing") renderListing(route.sectionKey);
        else if (route.view === "test") await renderTest(route.sectionKey, route.testId);
        else {
            renderHome();
        }
    }

    app.addEventListener("input", (event) => {
        const key = event.target.dataset.transcript;
        if (!key) return;
        updateTranscript(key === "single" || key === "cue" ? key : Number(key), event.target.value);
    });

    app.addEventListener("click", (event) => {
        if (event.target.closest("[data-pretest-start]")) {
            beginSpeakingTest();
            return;
        }
        const target = event.target.closest("[data-action]");
        if (!target) return;
        const action = target.dataset.action;
        if (action === "start-single-recording") startRecording({ mode: "single" });
        else if (action === "start-preparation" || action === "start-prep") startPreparationForActivePart();
        else if (action === "start-cue-recording") startRecording({ mode: "cue" });
        else if (action === "stop-recording") stopRecording();
        else if (action === "play-recording") playActiveRecording();
        else if (action === "submit-single") submitSingle();
        else if (action === "submit-cue") submitCue();
        else if (action === "select-part") {
            if (state.recording || isPrepTimerActive()) return;
            moveToFullPart(Number(target.dataset.part) || 1);
        } else if (action === "start-full-prep") {
            startPreparationForActivePart();
        } else if (action === "start-full-recording") {
            const part = activeFullPart();
            if (part) startRecording({ mode: "full", part: part.part });
        } else if (action === "next-part") {
            state.fullCurrentPart = Math.min(3, state.fullCurrentPart + 1);
            setError("");
        } else if (action === "submit-full") {
            submitFull();
        }
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest("[data-speaking-header-submit]")) return;
        submitActiveAttempt();
    });

    boot();
}());
