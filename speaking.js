(function () {
    const app = document.getElementById("speakingApp");
    const speakingParams = new URLSearchParams(window.location.search);
    const isSpeakingMockMode = speakingParams.get("mockMode") === "1" || speakingParams.has("mockTestId");
    const mockSpeakingTestId = String(speakingParams.get("speakingTestId") || speakingParams.get("id") || "").trim();
    const SPEAKING_LOAD_TIMEOUT_MS = 10000;
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
    const FREE_SPEAKING_GREETING = "Hi, I'm your AI speaking partner. Let's practice naturally. You can talk about anything, and I'll help you improve your English.";
    const FREE_VOICE_STATE = {
        IDLE: "idle",
        LISTENING: "listening",
        USER_SPEAKING: "user_speaking",
        PROCESSING: "processing",
        AI_SPEAKING: "ai_speaking"
    };
    const FREE_VOICE_SILENCE_MS = 1000;
    const FREE_VOICE_MIN_SPEECH_MS = 120;
    const FREE_VOICE_LEVEL_THRESHOLD = 0.018;
    const FREE_VOICE_MAX_TURN_MS = 10 * 60 * 1000;
    const FREE_VOICE_RESTART_DELAY_MS = 250;
    const EXAM_VOICE_AUTOSTART_DELAY_MS = 500;
    const EXAM_VOICE_SILENCE_MS = 3600;
    const EXAM_PART2_SILENCE_MS = 6200;
    const EXAM_VOICE_MIN_SPEECH_MS = 220;
    const EXAM_VOICE_LEVEL_THRESHOLD = 0.018;

    function hasActivePremium(user) {
        if (window.IELTSXPremium?.hasPremiumAccess) {
            return window.IELTSXPremium.hasPremiumAccess(user);
        }
        if (!user || user.isPremium !== true) return false;
        const expiresAt = user.premiumExpiresAt || user.subscriptionExpiresAt || user.premiumUntil;
        if (!expiresAt) return true;
        const expiry = new Date(expiresAt);
        return !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now();
    }

    async function canOpenPremiumSpeakingMode() {
        const authClient = window.authClient;
        const cachedUser = authClient?.getAuth?.()?.user;
        if (hasActivePremium(cachedUser)) return true;

        try {
            const session = await authClient?.fetchAuthMe?.();
            return hasActivePremium(session?.data?.user);
        } catch {
            return false;
        }
    }

    function openSpeakingPremiumLock() {
        window.location.href = "/speaking/player?mode=exam";
    }

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
        voiceFlow: null,
        speakingMode: "free",
        startingSpeakingMode: "",
        introError: "",
        feedback: null,
        loading: false,
        hasStarted: false,
        error: ""
    };

    let catalogLoaded = false;

    function isMockSpeakingDebugFlow(flow = state.voiceFlow) {
        return Boolean(isSpeakingMockMode && flow && flow.speakingMode === "exam");
    }

    function currentVoiceQuestionIndex(flow = state.voiceFlow) {
        if (!flow) return -1;
        const explicit = Number(flow.currentQuestionIndex);
        if (Number.isFinite(explicit) && explicit >= 0) return explicit;
        const partNumber = Math.min(3, Math.max(1, Number(flow.part || 1)));
        return Math.max(0, Number(flow.partTurns?.[partNumber] || 0));
    }

    function logMockSpeakingTransition(label, details = {}) {
        const flow = state.voiceFlow;
        if (!isMockSpeakingDebugFlow(flow)) return;
        const currentPart = Math.min(3, Math.max(1, Number(flow.part || 1)));
        const currentQuestionIndex = currentVoiceQuestionIndex(flow);
        const total = Number(flow.currentQuestionTotal || 0) || voiceQuestionTotal(currentPart);
        console.log("[Mock Speaking Debug]", {
            event: label,
            currentPart,
            currentQuestionIndex,
            question: total ? `${Math.min(total, currentQuestionIndex + 1)} of ${total}` : "",
            phase: flow.phase,
            examPhase: flow.examPhase,
            partTurns: { ...(flow.partTurns || {}) },
            ...details
        });
    }

    function setPlayerMode(enabled) {
        document.body.classList.toggle("speaking-player-mode", enabled);
        document.body.classList.toggle("test-list-page", !enabled);
        document.body.classList.toggle("speaking-mock-mode", Boolean(enabled && isSpeakingMockMode));
        if (enabled) {
            document.body.classList.remove("speaking-intro-mode");
        } else {
            document.body.classList.remove("speaking-voice-mode", "speaking-mock-mode");
        }

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

    function notifyMockSpeakingReady() {
        if (!isSpeakingMockMode || window.parent === window) return;

        window.parent.postMessage({
            type: "ieltsx-mock-section-ready",
            section: "speaking",
            testId: getSpeakingTestId()
        }, window.location.origin);
    }

    function notifyMockSpeakingError(error) {
        if (!isSpeakingMockMode || window.parent === window) return;

        window.parent.postMessage({
            type: "ieltsx-mock-section-error",
            section: "speaking",
            testId: getSpeakingTestId(),
            message: error?.message || "Speaking could not be loaded."
        }, window.location.origin);
    }

    function requestMockSpeakingExit() {
        if (!isSpeakingMockMode || window.parent === window) return;
        window.parent.postMessage({ type: "ieltsx-mock-exit-request" }, window.location.origin);
    }

    function applySpeakingMockHeader() {
        if (!isSpeakingMockMode) return;

        const brandTitle = document.getElementById("speakingBrandTitle");
        const brandLogo = document.querySelector("#speakingCbtHeader .cbt-logo");
        const dashboardBtn = document.getElementById("speakingDashboardBtn");
        const exitBtn = document.getElementById("speakingExitMockBtn");
        const submitBtn = document.getElementById("speakingHeaderSubmitBtn");
        const fullscreenBtn = document.querySelector(".cbt-header-actions [data-fullscreen-toggle]");

        if (brandLogo) {
            brandLogo.src = "/logo.png";
            brandLogo.alt = "IELTSX";
        }
        if (brandTitle) brandTitle.textContent = "IELTSX Mock Test - Speaking";
        if (dashboardBtn) dashboardBtn.style.display = "none";
        if (fullscreenBtn) fullscreenBtn.style.display = "none";
        if (submitBtn) submitBtn.style.display = state.voiceFlow ? "none" : "inline-flex";
        if (exitBtn) {
            exitBtn.style.display = "inline-flex";
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
            submitBtn.style.display = isSpeakingMockMode && state.voiceFlow ? "none" : "inline-flex";
            submitBtn.disabled = Boolean(state.loading) || !state.hasStarted;
            submitBtn.textContent = state.loading ? "Evaluating your speaking..." : (isSpeakingMockMode ? "Submit Section" : "Submit");
        }
        applySpeakingMockHeader();
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

    function normalizeSpeakingMode(value) {
        return String(value || "").toLowerCase() === "exam" ? "exam" : "free";
    }

    function getSpeakingModeFromUrl() {
        return normalizeSpeakingMode(new URLSearchParams(window.location.search).get("mode"));
    }

    function parseRoute() {
        const parts = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
        if (parts[0] !== "speaking") return { view: "home" };
        const rawSection = parts[1] || "";
        if (rawSection === "player") {
            return {
                view: "player",
                mode: getSpeakingModeFromUrl(),
                testId: mockSpeakingTestId
            };
        }
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SPEAKING_LOAD_TIMEOUT_MS);
        try {
            const detailParams = new URLSearchParams();
            if (isSpeakingMockMode) {
                const mockTestId = String(speakingParams.get("mockTestId") || speakingParams.get("testId") || "").trim();
                if (mockTestId) {
                    detailParams.set("mockMode", "1");
                    detailParams.set("mockTestId", mockTestId);
                }
            }
            const detailQuery = detailParams.size ? `?${detailParams.toString()}` : "";
            const response = await fetch(`/api/speaking/${encodeURIComponent(sectionKey)}/${encodeURIComponent(testId)}${detailQuery}`, {
                credentials: "include",
                cache: "no-store",
                signal: controller.signal
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
        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("Speaking test could not be loaded. Please check test data or try again.");
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    function resolveMockSpeakingTestId(routeTestId = "") {
        const explicitId = String(mockSpeakingTestId || routeTestId || "").trim();
        if (explicitId) return explicitId;
        const mockId = String(speakingParams.get("mockTestId") || speakingParams.get("testId") || "").trim();
        return mockId ? `mock-speaking-${mockId}` : "";
    }

    function resetSpeakingAttemptState() {
        state.cueRecord = null;
        state.partRecords = {};
        state.fullCurrentPart = 1;
        state.fullRecords = {};
        state.cuePrepStatus = "not_started";
        state.fullPrepStatus = {};
        state.partTimeFinished = {};
        state.recording = null;
        state.feedback = null;
        state.error = "";
    }

    function clearTimer() {
        if (state.timer?.id) clearInterval(state.timer.id);
        state.timer = null;
    }

    function clearHeaderTimer() {
        if (state.headerTimer?.id) clearInterval(state.headerTimer.id);
        state.headerTimer = null;
    }

    function clearVoiceFlowTimers() {
        const flow = state.voiceFlow;
        if (!flow) return;
        ["prepTimer", "answerTimer", "nextTimer", "silenceTimer", "restartTimer", "autoStartTimer"].forEach((key) => {
            if (flow[key]) {
                clearTimeout(flow[key]);
                flow[key] = null;
            }
        });
        if (flow.prepInterval) {
            clearInterval(flow.prepInterval);
            flow.prepInterval = null;
        }
    }

    function clearAllPlayerTimers() {
        clearTimer();
        clearHeaderTimer();
        clearVoiceFlowTimers();
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
        clearTimer();
        if (state.voiceFlow && !isFreeVoiceFlow(state.voiceFlow)) {
            if (state.recording?.scope?.mode === "voice-flow") {
                state.voiceFlow.finishAfterCurrentAnswer = true;
                stopVoiceFlowRecording("section-time-limit");
            } else {
                finishVoiceFlow();
            }
            return;
        }
        if (state.recording) stopRecording();
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
            logMockSpeakingTransition("SpeechRecognition configured", { language: recognition.lang });
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
                if (recording.scope?.mode === "free-conversation" && state.voiceFlow && !state.voiceFlow.cancelled) {
                    state.voiceFlow.latestTranscript = recording.transcript || state.voiceFlow.latestTranscript || "";
                    state.voiceFlow.latestUserMessage = recording.transcript || state.voiceFlow.latestUserMessage || "";
                }
                if (recording.scope?.mode === "voice-flow" && state.voiceFlow && !state.voiceFlow.cancelled) {
                    state.voiceFlow.latestTranscript = recording.transcript || "Listening...";
                }
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

    function iconSizeFor(name, className = "") {
        if (className.includes("speaking-landing__mic-icon")) return 42;
        if (className.includes("speaking-landing__chip-icon")) return 24;
        if (className.includes("speaking-landing__button-icon")) return 25;
        if (className.includes("ai-voice-badge-icon")) return 18;
        if (className.includes("ai-voice-control-icon")) return name === "x" ? 24 : 28;
        if (className.includes("ai-voice-settings-icon")) return 20;
        return 20;
    }

    function lucideIcon(name, className = "") {
        const size = iconSizeFor(name, className);
        const attrs = `class="${className}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;max-width:${size}px;max-height:${size}px;flex:0 0 ${size}px;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
        const paths = {
            mic: `<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path>`,
            sparkles: `<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0Z"></path><path d="M20 3v4"></path><path d="M22 5h-4"></path><path d="M4 17v2"></path><path d="M5 18H3"></path>`,
            boxes: `<path d="m7.5 4.27 4.5 2.6 4.5-2.6"></path><path d="M7.5 19.73v-5.2L3 11.93v5.2Z"></path><path d="M16.5 19.73v-5.2l4.5-2.6v5.2Z"></path><path d="M3 6.73v5.2l4.5 2.6 4.5-2.6v-5.2l-4.5-2.6Z"></path><path d="M12 6.73v5.2l4.5 2.6 4.5-2.6v-5.2l-4.5-2.6Z"></path>`,
            arrowRight: `<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>`,
            sliders: `<path d="M10 6h10"></path><path d="M4 6h2"></path><path d="M6 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"></path><path d="M14 12h6"></path><path d="M4 12h6"></path><path d="M10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"></path><path d="M18 18h2"></path><path d="M4 18h10"></path><path d="M14 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"></path>`,
            rotate: `<path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path>`,
            check: `<path d="m5 12 4 4L19 6"></path>`,
            pause: `<path d="M8 5v14"></path><path d="M16 5v14"></path>`,
            play: `<path d="m7 4 13 8-13 8Z"></path>`,
            x: `<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>`
        };
        return `<svg ${attrs}>${paths[name] || paths.mic}</svg>`;
    }

    function renderSpeakingLanding() {
        const error = state.introError
            ? `<div class="speaking-landing__error">${escapeHtml(state.introError)}</div>`
            : "";
        const freeButtonText = state.loading && state.startingSpeakingMode === "free" ? "Opening practice..." : "Speaking Practice";
        const examButtonText = state.loading && state.startingSpeakingMode === "exam" ? "Opening simulation..." : "IELTS Exam Simulation";
        return `
            <section class="speaking-landing" aria-labelledby="speakingLandingTitle">
                <div class="speaking-landing__card">
                    <div class="speaking-landing__visual" aria-hidden="true">
                        <div class="speaking-landing__mic-halo">
                            <div class="speaking-landing__mic-core">
                                ${lucideIcon("mic", "speaking-landing__mic-icon")}
                            </div>
                        </div>
                    </div>
                    <div class="speaking-landing__content">
                        <span class="speaking-landing__badge">AI VOICE PRACTICE &#10024;</span>
                        <h1 id="speakingLandingTitle">Speaking Practice</h1>
                        <p>Choose a natural AI voice conversation or a structured IELTS Speaking exam simulation.</p>
                        <div class="speaking-landing__chips" aria-label="Speaking practice features">
                            <div class="speaking-landing__chip">
                                ${lucideIcon("mic", "speaking-landing__chip-icon")}
                                <span><strong>Voice Practice</strong><small>Premium mode</small></span>
                            </div>
                            <div class="speaking-landing__chip">
                                ${lucideIcon("sparkles", "speaking-landing__chip-icon")}
                                <span><strong>Soft Corrections</strong><small>As you speak</small></span>
                            </div>
                            <div class="speaking-landing__chip">
                                ${lucideIcon("boxes", "speaking-landing__chip-icon")}
                                <span><strong>Exam Mode</strong><small>Parts 1-3</small></span>
                            </div>
                        </div>
                        <div class="speaking-landing__actions">
                            <button class="speaking-landing__button speaking-landing__button--primary" type="button" data-action="select-speaking-mode" data-mode="free" ${state.loading ? "disabled" : ""}>
                                <span>${escapeHtml(freeButtonText)}</span>
                                ${lucideIcon("arrowRight", "speaking-landing__button-icon")}
                            </button>
                            <button class="speaking-landing__button speaking-landing__button--secondary" type="button" data-action="select-speaking-mode" data-mode="exam" ${state.loading ? "disabled" : ""}>
                                <span>${escapeHtml(examButtonText)}</span>
                                ${lucideIcon("arrowRight", "speaking-landing__button-icon")}
                            </button>
                        </div>
                        ${error}
                    </div>
                </div>
            </section>
        `;
    }

    async function startSpeakingFromIntro(mode = "free") {
        if (state.loading) return;
        const nextMode = normalizeSpeakingMode(mode);
        if (!(await canOpenPremiumSpeakingMode())) {
            openSpeakingPremiumLock();
            return;
        }
        state.loading = true;
        state.startingSpeakingMode = nextMode;
        state.introError = "";
        renderHome();

        try {
            await loadPublishedCatalog();
            prepareSpeakingPlayerState(nextMode);
            const nextPath = `/speaking/player?mode=${encodeURIComponent(nextMode)}`;
            if (`${window.location.pathname}${window.location.search}` !== nextPath) {
                window.history.pushState({}, "", nextPath);
            }
            renderCurrentTest();
        } catch (error) {
            state.loading = false;
            state.startingSpeakingMode = "";
            state.introError = error.message || "Could not open Speaking practice. Please try again.";
            renderHome();
        }
    }

    function renderHome() {
        clearAllPlayerTimers();
        setPlayerMode(false);
        document.body.classList.add("speaking-intro-mode");
        document.title = "Speaking Practice - IELTSX";
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        state.section = null;
        state.test = null;
        state.error = "";
        state.feedback = null;
        state.hasStarted = false;
        state.voiceFlow = null;
        if (!state.loading) {
            state.speakingMode = "free";
            state.startingSpeakingMode = "";
        }
        app.innerHTML = renderSpeakingLanding();
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
        document.body.classList.remove("speaking-intro-mode");
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
        if (state.loading) return `<div class="speaking-status">Evaluating your speaking...</div>`;
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
        try {
            let test = findTest(sectionKey, testId);
            if (!test && isSpeakingMockMode && sectionKey === "full" && testId) {
                test = await loadSpeakingTestDetail(sectionKey, testId);
            }
            if (!test) {
                if (isSpeakingMockMode) {
                    throw new Error("Speaking mock test data was not found.");
                }
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
            state.voiceFlow = null;
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
            notifyMockSpeakingReady();
        } catch (error) {
            console.error("[Mock Speaking] load failed:", error);
            notifyMockSpeakingError(error);
            app.innerHTML = `
                <section class="speaking-player-screen speaking-player-screen--full" aria-label="Speaking load error">
                    <main class="speaking-player-stage">
                        <div class="speaking-error">${escapeHtml(error.message || "Speaking could not be loaded.")}</div>
                        <div class="speaking-player-actions">
                            <button class="speaking-record-btn" type="button" onclick="window.location.reload()">Retry</button>
                            <a class="speaking-record-btn speaking-record-btn--secondary" href="/dashboard">Dashboard</a>
                        </div>
                    </main>
                </section>
            `;
        }
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

    function getSubmitTestMode() {
        return state.section === "full" ? "full" : "part";
    }

    function getActiveSubmitPartNumber() {
        if (state.section === "full") return Number(activeFullPart()?.part || state.fullCurrentPart || 1);
        return getStandalonePartNumber();
    }

    function getSpeakingTestId() {
        return String(state.test?.id || state.test?._id || state.test?.testId || "").trim();
    }

    function questionTextFromPart(part) {
        const lines = [
            part?.prompt || "",
            ...(Array.isArray(part?.questions) ? part.questions : []),
            ...(Array.isArray(part?.bullets) ? part.bullets : [])
        ].map((item) => String(item || "").trim()).filter(Boolean);
        return lines.join("\n");
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

    function defaultFullSpeakingTest() {
        const bundled = Array.isArray(catalog.full) && catalog.full.length ? catalog.full[0] : null;
        if (bundled?.parts?.length) return bundled;
        const fallback = {
            id: "ai-speaking-default",
            title: "IELTS Speaking Test",
            topic: "General IELTS Speaking practice",
            parts: [
                {
                    part: 1,
                    title: "Part 1: Introduction and Interview",
                    prompt: "Answer short interview questions naturally.",
                    questions: PLAYER_DEFAULTS.part1.questions
                },
                {
                    part: 2,
                    title: "Part 2: Cue Card",
                    prompt: PLAYER_DEFAULTS.part2.topic,
                    questions: PLAYER_DEFAULTS.part2.bullets
                },
                {
                    part: 3,
                    title: "Part 3: Discussion",
                    prompt: "Answer follow-up discussion questions with reasons and examples.",
                    questions: PLAYER_DEFAULTS.part3.questions
                }
            ]
        };
        return bundled ? { ...fallback, ...bundled, parts: fallback.parts } : fallback;
    }

    function generatedSpeakingTestToPlayer(data = {}) {
        const topics = Array.isArray(data.part1?.topics) ? data.part1.topics : [];
        const generatedPart1Questions = topics.flatMap((item) => Array.isArray(item?.questions) ? item.questions : []).map(normalizePromptText).filter(Boolean);
        const part1Questions = ["Good morning. My name is Alex. Can you tell me your full name, please?", ...generatedPart1Questions];
        const cueTopic = normalizePromptText(data.part2?.topic) || PLAYER_DEFAULTS.part2.topic;
        const cueBullets = (Array.isArray(data.part2?.bulletPoints) ? data.part2.bulletPoints : []).map(normalizePromptText).filter(Boolean);
        const part3Questions = (Array.isArray(data.part3?.questions) ? data.part3.questions : []).map(normalizePromptText).filter(Boolean);
        if (part1Questions.length < 6 || cueBullets.length !== 4 || part3Questions.length < 5) {
            throw new Error("Generated Speaking test is incomplete.");
        }
        return {
            id: `generated-speaking-${Date.now()}`,
            title: "IELTS Speaking Test",
            topic: cueTopic,
            generatedSource: data.source || "fallback",
            part1Topics: topics,
            parts: [
                { part: 1, title: "Part 1: Introduction and Interview", prompt: "Answer short interview questions naturally.", questions: part1Questions },
                { part: 2, title: "Part 2: Cue Card", prompt: cueTopic, questions: cueBullets },
                { part: 3, title: "Part 3: Discussion", prompt: `Discuss broader ideas connected with ${cueTopic}.`, questions: part3Questions }
            ]
        };
    }

    async function requestGeneratedSpeakingTest() {
        const mockTestId = isSpeakingMockMode
            ? String(speakingParams.get("mockTestId") || speakingParams.get("testId") || "").trim()
            : "";
        const response = await fetch("/api/speaking/generate-test", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestedAt: new Date().toISOString(),
                mockMode: isSpeakingMockMode ? "1" : "0",
                mockTestId
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not generate Speaking questions.");
        return generatedSpeakingTestToPlayer(data);
    }

    function prepareSpeakingPlayerState(mode = "free") {
        state.speakingMode = normalizeSpeakingMode(mode);
        state.section = "full";
        state.test = defaultFullSpeakingTest();
        state.error = "";
        state.introError = "";
        state.startingSpeakingMode = "";
        state.feedback = null;
        state.loading = false;
        state.hasStarted = false;
        state.recording = null;
        state.voiceFlow = null;
        state.fullCurrentPart = 1;
        state.fullRecords = {};
        state.partTimeFinished = {};
        clearAllPlayerTimers();
        state.voiceFlow = createVoiceFlow();
    }

    async function prepareMockSpeakingSimulation(routeTestId = "") {
        const mockTestId = String(speakingParams.get("mockTestId") || speakingParams.get("testId") || "").trim();
        if (!mockTestId) throw new Error("Speaking mock test id is missing.");

        state.speakingMode = "exam";
        state.section = "full";
        state.test = null;
        state.loading = true;
        state.hasStarted = false;
        state.startingSpeakingMode = "";
        resetSpeakingAttemptState();
        clearAllPlayerTimers();
        setPlayerMode(true);
        app.innerHTML = `
            <section class="speaking-player-screen speaking-player-screen--full" aria-label="Loading Speaking test">
                <main class="speaking-player-stage">
                    <div class="speaking-status">Loading IELTS Speaking simulation...</div>
                </main>
            </section>
        `;

        let test = defaultFullSpeakingTest();
        const optionalAdminFallbackId = String(speakingParams.get("sourceTestId") || "").trim();
        if (optionalAdminFallbackId) {
            try {
                const adminFallback = await loadSpeakingTestDetail("full", optionalAdminFallbackId);
                if (Array.isArray(adminFallback.parts) && adminFallback.parts.length >= 3) {
                    test = adminFallback;
                }
            } catch (error) {
                console.warn("Optional admin Speaking fallback could not be loaded:", error.message);
            }
        }

        state.test = test;
        state.loading = false;
        state.hasStarted = false;
        state.voiceFlow = createVoiceFlow();
        logMockSpeakingTransition("mock speaking simulation ready for fresh AI questions", {
            part1Total: mockPartQuestions(1).length,
            part3Total: mockPartQuestions(3).length,
            hasAdminFallback: Boolean(optionalAdminFallbackId)
        });
        renderCurrentTest();
        notifyMockSpeakingReady();
    }

    function defaultPartForMode(mode, index) {
        if (mode === "part_1") return 1;
        if (mode === "cue_card") return 2;
        if (mode === "part_3") return 3;
        return index + 1;
    }

    function normalizePromptText(value) {
        if (typeof value === "string") return value.trim();
        if (value && typeof value === "object") return String(value.text || value.question || value.prompt || "").trim();
        return "";
    }

    function getPartQuestions(part, fallbackKey) {
        const rawQuestions = Array.isArray(part?.questions) ? part.questions : [];
        const normalized = rawQuestions.map(normalizePromptText).filter(Boolean);
        return normalized.length ? normalized : PLAYER_DEFAULTS[fallbackKey].questions;
    }

    function getPartBullets(part) {
        const rawBullets = Array.isArray(part?.bullets) && part.bullets.length
            ? part.bullets
            : Array.isArray(part?.questions)
                ? part.questions
                : [];
        const normalized = rawBullets.map(normalizePromptText).filter(Boolean);
        return normalized.length ? normalized : PLAYER_DEFAULTS.part2.bullets;
    }

    function partFromFullTest(partNumber) {
        return activeFullParts().find((part) => Number(part.part) === Number(partNumber)) || null;
    }

    function buildCueDisplay(prompt, bullets) {
        const bulletText = bullets.length ? ` ${bullets.join(" | ")}` : "";
        return `${prompt}${bulletText ? ` - ${bulletText}` : ""}`;
    }

    function getConversationCueCard() {
        const part2 = partFromFullTest(2) || {};
        const topic = normalizePromptText(part2.prompt || part2.topic || part2.description) || PLAYER_DEFAULTS.part2.topic;
        const bullets = getPartBullets(part2);
        return { topic, bullets };
    }

    function cueCardDisplayText(cueCard = {}) {
        const topic = normalizePromptText(cueCard.topic) || PLAYER_DEFAULTS.part2.topic;
        const bullets = Array.isArray(cueCard.bullets) && cueCard.bullets.length
            ? cueCard.bullets.map(normalizePromptText).filter(Boolean)
            : PLAYER_DEFAULTS.part2.bullets;
        return buildCueDisplay(topic, bullets);
    }

    function conversationTestPayload() {
        const fullParts = activeFullParts();
        const part1 = fullParts.find((part) => Number(part.part) === 1) || {};
        const part2 = fullParts.find((part) => Number(part.part) === 2) || {};
        const part3 = fullParts.find((part) => Number(part.part) === 3) || {};
        return {
            id: getSpeakingTestId(),
            title: state.test?.title || "IELTS Speaking Test",
            topic: state.test?.topic || "General IELTS Speaking practice",
            part1Questions: getPartQuestions(part1, "part1"),
            part2CueCard: getConversationCueCard(),
            part3Questions: getPartQuestions(part3, "part3")
        };
    }

    function wordCount(value) {
        return String(value || "").trim().split(/\s+/).filter(Boolean).length;
    }

    function nextPartTurns(flow, answerPart) {
        const partTurns = { ...(flow.partTurns || {}) };
        if (answerPart) partTurns[answerPart] = Number(partTurns[answerPart] || 0) + 1;
        return partTurns;
    }

    function conversationStatePayload(flow, overrides = {}) {
        return {
            speakingMode: flow.speakingMode || state.speakingMode || "free",
            part: flow.part,
            turn: flow.turn,
            phase: flow.phase,
            examPhase: flow.examPhase,
            partTurns: flow.partTurns,
            roundingAsked: flow.roundingAsked,
            cueCard: flow.cueCard,
            currentExaminerMessage: flow.currentExaminerMessage,
            latestQuestion: flow.latestQuestion,
            latestTranscript: flow.latestTranscript,
            history: flow.history.slice(-18),
            test: conversationTestPayload(),
            ...overrides
        };
    }

    function normalizeCueCard(value) {
        const fallback = getConversationCueCard();
        if (!value || typeof value !== "object") return fallback;
        const topic = normalizePromptText(value.topic) || fallback.topic;
        const bullets = Array.isArray(value.bullets)
            ? value.bullets.map(normalizePromptText).filter(Boolean)
            : [];
        return {
            topic,
            bullets: bullets.length ? bullets : fallback.bullets
        };
    }

    function normalizeExaminerResponse(raw, fallback) {
        const safe = raw && typeof raw === "object" ? raw : {};
        const allowedPhases = new Set(["conversation", "question", "prep", "long_turn", "rounding_off", "complete"]);
        let phase = allowedPhases.has(String(safe.phase || "")) ? String(safe.phase) : fallback.phase;
        const isFreeMode = (state.speakingMode || "free") !== "exam";
        let part = Math.min(3, Math.max(1, Number(safe.part || fallback.part || 1)));
        const message = String(safe.examinerMessage || safe.aiMessage || safe.assistantMessage || safe.message || fallback.examinerMessage || "").trim();
        let cueCard = safe.cueCard ? normalizeCueCard(safe.cueCard) : (fallback.cueCard || null);
        let isComplete = Boolean(safe.isComplete) || phase === "complete";
        if (isFreeMode) {
            part = 0;
            cueCard = null;
            isComplete = false;
            if (phase === "complete" || phase === "prep" || phase === "long_turn" || phase === "rounding_off") {
                phase = "conversation";
            }
        }
        return {
            examinerMessage: message || "Thank you. Let's continue.",
            part,
            phase,
            cueCard,
            questionIndex: Number.isFinite(Number(safe.questionIndex)) ? Math.max(0, Number(safe.questionIndex)) : undefined,
            totalQuestions: Number.isFinite(Number(safe.totalQuestions)) ? Math.max(1, Number(safe.totalQuestions)) : undefined,
            shouldRecord: isFreeMode ? true : (safe.shouldRecord === false ? false : !["prep", "complete"].includes(phase)),
            isComplete,
            prepSeconds: Math.max(5, Number(safe.prepSeconds || fallback.prepSeconds || SPEAKING_TIMING.part2Prep)),
            latestTranscript: String(safe.latestTranscript || fallback.latestTranscript || "").trim(),
            audioUrl: String(safe.audioUrl || fallback.audioUrl || "").trim()
        };
    }

    function fallbackExaminerResponse(event, transcript, payload) {
        if ((payload.speakingMode || state.speakingMode || "free") !== "exam") {
            if (event === "start") {
                return {
                    part: 0,
                    phase: "conversation",
                    examinerMessage: FREE_SPEAKING_GREETING,
                    shouldRecord: true,
                    isComplete: false
                };
            }
            const speechWords = wordCount(transcript);
            const replies = speechWords < 8
                ? [
                    "No worries. Say a little more, even with simple words. What happened next?",
                    "That's a good start. Try to add one detail so your idea feels clearer.",
                    "Take your time. You can continue with one example from your own life."
                ]
                : [
                    "That's interesting. You explained the idea clearly. Try adding one specific example to make it stronger.",
                    "I see what you mean. A more natural phrase could be: 'It helped me feel more confident.' Now continue your idea.",
                    "Good. Let's keep talking about this for a moment. What part of that experience mattered most to you?"
                ];
            return {
                part: 0,
                phase: "conversation",
                examinerMessage: replies[Math.min(replies.length - 1, Math.max(0, Number(payload.turn || 1) % replies.length))],
                shouldRecord: true,
                isComplete: false
            };
        }

        if (event === "start") {
            const questions = Array.isArray(payload.test?.part1Questions)
                ? payload.test.part1Questions.map(normalizePromptText).filter(Boolean)
                : [];
            const firstQuestion = questions[0] || "Let's talk about your hometown. Where are you from?";
            return {
                part: 1,
                phase: "question",
                examinerMessage: `Let's begin with Part 1. ${firstQuestion}`,
                shouldRecord: true
            };
        }

        const partTurns = payload.partTurns || {};
        const answeredPart = Number(payload.answeringPart || payload.part || 1);
        const answerWords = wordCount(transcript);
        const cueCard = normalizeCueCard(payload.cueCard || payload.test?.part2CueCard);
        const testPart1Questions = Array.isArray(payload.test?.part1Questions)
            ? payload.test.part1Questions.map(normalizePromptText).filter(Boolean)
            : [];
        const testPart3Questions = Array.isArray(payload.test?.part3Questions)
            ? payload.test.part3Questions.map(normalizePromptText).filter(Boolean)
            : [];

        if (answeredPart === 1) {
            if (answerWords > 0 && answerWords < 8 && Number(partTurns[1] || 0) < 4) {
                return {
                    part: 1,
                    phase: "question",
                    examinerMessage: "Thank you. Could you tell me a little more about that?",
                    shouldRecord: true
                };
            }
            const fallbackQuestions = [
                "Thank you. What do you like most about the place where you live?",
                "Alright. What do you usually do in your free time?",
                "Thank you. Do you prefer spending time alone or with other people?",
                "Alright. Is there anything you would like to change about your daily routine?"
            ];
            const questions = testPart1Questions.length > 1 ? testPart1Questions.slice(1) : fallbackQuestions;
            const maxTurns = Math.min(5, Math.max(4, testPart1Questions.length || fallbackQuestions.length));
            if (Number(partTurns[1] || 0) < maxTurns) {
                return {
                    part: 1,
                    phase: "question",
                    examinerMessage: questions[Math.max(0, Number(partTurns[1] || 1) - 1)] || questions[0],
                    shouldRecord: true
                };
            }
            return {
                part: 2,
                phase: "prep",
                cueCard,
                prepSeconds: SPEAKING_TIMING.part2Prep,
                examinerMessage: `Now I am going to give you a topic. You will have one minute to prepare and then you should speak for up to two minutes. Your topic is: ${cueCard.topic}`,
                shouldRecord: false
            };
        }

        if (answeredPart === 2) {
            return {
                part: 3,
                phase: "question",
                examinerMessage: `Let's move on to Part 3. We'll discuss ideas connected with ${cueCard.topic.toLowerCase()}. Why do people value experiences like this?`,
                shouldRecord: true
            };
        }

        if (Number(partTurns[3] || 0) < 4) {
            const fallbackPart3Questions = [
                "Thank you. How have people's attitudes to this topic changed in recent years?",
                "Alright. Do you think young people and older people see this differently?",
                "Thank you. What role should schools or governments play in this area?",
                "Finally, how do you think this might change in the future?"
            ];
            const part3Questions = testPart3Questions.length ? testPart3Questions : fallbackPart3Questions;
            return {
                part: 3,
                phase: "question",
                examinerMessage: part3Questions[Math.max(0, Number(partTurns[3] || 1) - 1)] || part3Questions[0],
                shouldRecord: true
            };
        }

        return {
            part: 3,
            phase: "complete",
            examinerMessage: "Thank you. That is the end of the speaking test.",
            shouldRecord: false,
            isComplete: true
        };
    }

    function mockPartQuestions(partNumber) {
        const payload = conversationTestPayload();
        if (Number(partNumber) === 1) {
            const questions = Array.isArray(payload.part1Questions)
                ? payload.part1Questions.map(normalizePromptText).filter(Boolean)
                : [];
            return questions.length ? questions : PLAYER_DEFAULTS.part1.questions;
        }
        if (Number(partNumber) === 3) {
            const questions = Array.isArray(payload.part3Questions)
                ? payload.part3Questions.map(normalizePromptText).filter(Boolean)
                : [];
            return questions.length ? questions : PLAYER_DEFAULTS.part3.questions;
        }
        return [cueCardDisplayText(payload.part2CueCard || getConversationCueCard())];
    }

    function mockQuestionResponse(partNumber, questionIndex, messagePrefix = "") {
        const questions = mockPartQuestions(partNumber);
        const totalQuestions = Math.max(1, questions.length);
        const safeIndex = Math.min(totalQuestions - 1, Math.max(0, Number(questionIndex) || 0));
        return {
            part: partNumber,
            phase: "question",
            questionIndex: safeIndex,
            totalQuestions,
            examinerMessage: `${messagePrefix}${questions[safeIndex] || questions[0] || ""}`.trim(),
            shouldRecord: true,
            isComplete: false
        };
    }

    function advanceQuestion(event, transcript, payload = {}) {
        const flow = ensureVoiceFlow();
        const answeringPart = Number(payload.answeringPart || flow.part || 1);
        const partTurns = payload.partTurns || flow.partTurns || {};
        const cueCard = normalizeCueCard(payload.test?.part2CueCard || flow.cueCard || getConversationCueCard());
        logMockSpeakingTransition("advanceQuestion() runs", {
            trigger: event,
            answeringPart,
            transcriptLength: String(transcript || "").length
        });

        if (event === "start") {
            return mockQuestionResponse(1, 0, "Let's begin with Part 1. ");
        }

        if (answeringPart === 1) {
            const part1Questions = mockPartQuestions(1);
            const answeredCount = Math.max(0, Number(partTurns[1] || 0));
            if (answeredCount >= part1Questions.length) {
                logMockSpeakingTransition("Part 1 complete -> Part 2 preparation", {
                    confirmation: `After Part 1 Question ${answeredCount} of ${part1Questions.length}, currentPart becomes 2.`,
                    nextPart: 2,
                    nextPhase: "prep"
                });
                return {
                    part: 2,
                    phase: "prep",
                    questionIndex: 0,
                    totalQuestions: 1,
                    cueCard,
                    prepSeconds: SPEAKING_TIMING.part2Prep,
                    examinerMessage: `Now I am going to give you a topic. You will have one minute to prepare and then you should speak for up to two minutes. Your topic is: ${cueCard.topic}`,
                    shouldRecord: false,
                    isComplete: false
                };
            }
            return mockQuestionResponse(1, answeredCount);
        }

        if (answeringPart === 2) {
            return mockQuestionResponse(3, 0, "Let's move on to Part 3. ");
        }

        const part3Questions = mockPartQuestions(3);
        const answeredPart3Count = Math.max(0, Number(partTurns[3] || 0));
        if (answeredPart3Count >= part3Questions.length) {
            return {
                part: 3,
                phase: "complete",
                questionIndex: Math.max(0, part3Questions.length - 1),
                totalQuestions: Math.max(1, part3Questions.length),
                examinerMessage: "Thank you. That is the end of the speaking test.",
                shouldRecord: false,
                isComplete: true
            };
        }

        return mockQuestionResponse(3, answeredPart3Count);
    }

    function createVoiceFlow() {
        const cueSeed = getConversationCueCard();
        const isFreeMode = state.speakingMode !== "exam";
        const idleMessage = isFreeMode
            ? "Tap the microphone to start Speaking Practice."
            : (isSpeakingMockMode ? "Your IELTS Speaking test is starting." : "Click Start Speaking Test once. The examiner will guide the rest.");
        return {
            answers: [],
            history: [],
            partTurns: { 1: 0, 2: 0, 3: 0 },
            speakingMode: isFreeMode ? "free" : "exam",
            started: false,
            sessionActive: false,
            listenStarting: false,
            listenStartToken: "",
            processingTurnToken: "",
            cancelled: false,
            phase: "idle",
            examPhase: "idle",
            status: idleMessage,
            part: isFreeMode ? 0 : 1,
            currentQuestionIndex: 0,
            currentQuestionTotal: isFreeMode ? 0 : getPartQuestions(partFromFullTest(1) || {}, "part1").length,
            turn: 0,
            currentExaminerMessage: idleMessage,
            latestQuestion: idleMessage,
            latestTranscript: "",
            latestUserMessage: "",
            cueCard: isFreeMode ? null : cueSeed,
            prepRemaining: 0,
            part2Notes: "",
            prepInterval: null,
            answerTimer: null,
            nextTimer: null,
            silenceTimer: null,
            restartTimer: null,
            autoStartTimer: null,
            micStream: null,
            micPermission: "idle",
            audioContext: null,
            analyser: null,
            audioSource: null,
            vadFrame: null,
            vadAvailable: false,
            autoRecord: true,
            latestAnswerSavedAt: "",
            speechToken: null,
            pendingExaminerResponse: null,
            roundingAsked: false,
            feedbackRequested: false,
            paused: false,
            pausedPhase: "",
            isComplete: false
        };
    }

    function ensureVoiceFlow() {
        if (!state.voiceFlow) state.voiceFlow = createVoiceFlow();
        return state.voiceFlow;
    }

    function isFreeVoiceFlow(flow = ensureVoiceFlow()) {
        return flow.speakingMode === "free";
    }

    function freeVoiceStatusFor(phase) {
        if (phase === FREE_VOICE_STATE.LISTENING) return "Listening...";
        if (phase === FREE_VOICE_STATE.USER_SPEAKING) return "Listening to you...";
        if (phase === FREE_VOICE_STATE.PROCESSING) return "Thinking...";
        if (phase === FREE_VOICE_STATE.AI_SPEAKING) return "AI is speaking...";
        return "Tap the microphone to start Speaking Practice.";
    }

    function setFreeVoicePhase(flow, phase, status = "") {
        if (!flow || !isFreeVoiceFlow(flow)) return;
        flow.phase = phase;
        flow.status = status || freeVoiceStatusFor(phase);
    }

    function isFreeVoiceSessionActive(flow = state.voiceFlow) {
        return Boolean(
            flow &&
            isFreeVoiceFlow(flow) &&
            !flow.cancelled &&
            (flow.sessionActive || flow.listenStarting || state.recording?.scope?.mode === "free-conversation")
        );
    }

    function freeVoiceNow() {
        return window.performance?.now ? window.performance.now() : Date.now();
    }

    function clearFreeVoiceSilenceTimer(flow = state.voiceFlow) {
        if (flow?.silenceTimer) {
            clearTimeout(flow.silenceTimer);
            flow.silenceTimer = null;
        }
    }

    function cleanupFreeVoiceAudioGraph(recording) {
        if (!recording) return;
        if (recording.vadFrame) {
            window.cancelAnimationFrame(recording.vadFrame);
            recording.vadFrame = null;
        }
        try {
            recording.audioSource?.disconnect();
        } catch {}
        try {
            recording.analyser?.disconnect();
        } catch {}
        if (recording.audioContext && recording.audioContext.state !== "closed") {
            try {
                const closeResult = recording.audioContext.close();
                if (closeResult?.catch) closeResult.catch(() => {});
            } catch {}
        }
        recording.audioSource = null;
        recording.analyser = null;
        recording.audioContext = null;
    }

    function cleanupFreeVoiceRecording(recording, options = {}) {
        if (!recording) return;
        const closeTracks = options.closeTracks !== false;
        const stopRecognition = options.stopRecognition !== false;
        cleanupFreeVoiceAudioGraph(recording);
        if (stopRecognition) {
            try {
                recording.recognition?.stop();
            } catch {}
        }
        if (closeTracks) stopTracks(recording.stream);
    }

    function isActiveFreeRecording(recording) {
        return Boolean(
            recording &&
            state.recording === recording &&
            recording.scope?.mode === "free-conversation" &&
            !recording.cancelled &&
            state.voiceFlow &&
            isFreeVoiceFlow(state.voiceFlow) &&
            state.voiceFlow.sessionActive &&
            !state.voiceFlow.cancelled
        );
    }

    function markFreeVoiceSpeech(recording) {
        if (!isActiveFreeRecording(recording)) return;
        const flow = state.voiceFlow;
        const wasSpeaking = flow.phase === FREE_VOICE_STATE.USER_SPEAKING;
        recording.hasSpeech = true;
        recording.lastVoiceAt = freeVoiceNow();
        recording.silenceStartedAt = 0;
        clearFreeVoiceSilenceTimer(flow);
        if (!wasSpeaking) {
            flow.latestTranscript = recording.transcript || "";
            flow.latestUserMessage = recording.transcript || "";
            setFreeVoicePhase(flow, FREE_VOICE_STATE.USER_SPEAKING);
            renderCurrentTest();
        }
    }

    function scheduleFreeVoiceSilenceStop(recording) {
        if (!isActiveFreeRecording(recording) || !recording.hasSpeech || recording.stopRequested) return;
        const flow = state.voiceFlow;
        if (flow.silenceTimer) return;
        flow.silenceTimer = window.setTimeout(() => {
            flow.silenceTimer = null;
            if (isActiveFreeRecording(recording)) {
                stopFreeVoiceListening({ reason: "silence" });
            }
        }, FREE_VOICE_SILENCE_MS);
    }

    function startFreeVoiceVad(recording) {
        if (!recording?.analyser) return;
        const buffer = new Uint8Array(recording.analyser.fftSize);
        recording.vadStartedAt = freeVoiceNow();
        recording.noiseFloor = 0.008;

        const tick = () => {
            if (!isActiveFreeRecording(recording)) return;
            recording.analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i += 1) {
                const centered = (buffer[i] - 128) / 128;
                sum += centered * centered;
            }
            const level = Math.sqrt(sum / buffer.length);
            const now = freeVoiceNow();
            const elapsed = now - recording.vadStartedAt;
            if (!recording.hasSpeech && elapsed < 700 && level < 0.035) {
                recording.noiseFloor = recording.noiseFloor * 0.9 + level * 0.1;
            }
            const dynamicThreshold = Math.min(0.06, Math.max(FREE_VOICE_LEVEL_THRESHOLD, recording.noiseFloor * 2.8));
            const isVoice = level >= dynamicThreshold;

            if (isVoice) {
                if (!recording.aboveSpeechSince) recording.aboveSpeechSince = now;
                recording.silenceStartedAt = 0;
                clearFreeVoiceSilenceTimer(state.voiceFlow);
                if (now - recording.aboveSpeechSince >= FREE_VOICE_MIN_SPEECH_MS) {
                    markFreeVoiceSpeech(recording);
                }
            } else {
                recording.aboveSpeechSince = 0;
                if (recording.hasSpeech) {
                    if (!recording.silenceStartedAt) recording.silenceStartedAt = now;
                    if (now - recording.silenceStartedAt >= 150) {
                        scheduleFreeVoiceSilenceStop(recording);
                    }
                }
            }

            recording.vadFrame = window.requestAnimationFrame(tick);
        };

        recording.vadFrame = window.requestAnimationFrame(tick);
    }

    function hasLiveAudioTrack(stream) {
        return Boolean(stream?.getAudioTracks?.().some((track) => track.readyState === "live"));
    }

    function clearVoiceFlowVad(flow = state.voiceFlow) {
        if (!flow) return;
        if (flow.vadFrame) {
            window.cancelAnimationFrame(flow.vadFrame);
            flow.vadFrame = null;
        }
        if (flow.silenceTimer) {
            clearTimeout(flow.silenceTimer);
            flow.silenceTimer = null;
        }
    }

    function cleanupVoiceFlowMic(flow = state.voiceFlow, options = {}) {
        if (!flow || isFreeVoiceFlow(flow)) return;
        const stopMic = options.stopMic !== false;
        clearVoiceFlowVad(flow);
        if (flow.autoStartTimer) {
            clearTimeout(flow.autoStartTimer);
            flow.autoStartTimer = null;
        }
        try {
            flow.audioSource?.disconnect();
        } catch {}
        try {
            flow.analyser?.disconnect();
        } catch {}
        if (flow.audioContext && flow.audioContext.state !== "closed") {
            try {
                const closeResult = flow.audioContext.close();
                if (closeResult?.catch) closeResult.catch(() => {});
            } catch {}
        }
        if (stopMic && flow.micStream) {
            stopTracks(flow.micStream);
        }
        flow.audioContext = null;
        flow.audioSource = null;
        flow.analyser = null;
        flow.vadAvailable = false;
        if (stopMic) {
            flow.micStream = null;
            flow.micPermission = "idle";
        }
    }

    function setupVoiceFlowAudioGraph(flow, stream) {
        if (!flow || isFreeVoiceFlow(flow) || !stream || flow.analyser) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            flow.vadAvailable = false;
            return;
        }
        try {
            flow.audioContext = new AudioContextClass();
            if (flow.audioContext.state === "suspended") {
                flow.audioContext.resume().catch(() => {});
            }
            flow.analyser = flow.audioContext.createAnalyser();
            flow.analyser.fftSize = 2048;
            flow.analyser.smoothingTimeConstant = 0.08;
            flow.audioSource = flow.audioContext.createMediaStreamSource(stream);
            flow.audioSource.connect(flow.analyser);
            flow.vadAvailable = true;
        } catch (error) {
            console.warn("Exam voice VAD unavailable:", error);
            cleanupVoiceFlowMic(flow, { stopMic: false });
            flow.vadAvailable = false;
        }
    }

    async function ensureVoiceFlowMicStream() {
        const flow = ensureVoiceFlow();
        if (isFreeVoiceFlow(flow)) return null;
        if (hasLiveAudioTrack(flow.micStream)) {
            setupVoiceFlowAudioGraph(flow, flow.micStream);
            return flow.micStream;
        }
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            throw new Error("Microphone recording is not available in this browser.");
        }

        flow.micPermission = "requesting";
        flow.phase = "mic-permission";
        flow.status = "Requesting microphone permission...";
        state.error = "";
        logMockSpeakingTransition("transition: requestingMicPermission");
        renderCurrentTest();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!state.voiceFlow || flow.cancelled) {
                stopTracks(stream);
                return null;
            }
            flow.micStream = stream;
            flow.micPermission = "granted";
            setupVoiceFlowAudioGraph(flow, stream);
            logMockSpeakingTransition("microphone permission granted", {
                audioTracks: stream.getAudioTracks?.().length || 0
            });
            return stream;
        } catch (error) {
            flow.micPermission = "denied";
            flow.phase = "failed";
            flow.started = false;
            state.hasStarted = false;
            flow.status = error?.name === "NotAllowedError"
                ? "Microphone permission was denied. Allow microphone access and try again."
                : (error.message || "Could not access your microphone. Check browser permissions and try again.");
            state.error = flow.status;
            logMockSpeakingTransition("microphone permission failed", { error: error?.name || error?.message || "unknown" });
            renderCurrentTest();
            throw error;
        }
    }

    function isActiveVoiceFlowRecording(recording) {
        return Boolean(
            recording &&
            state.recording === recording &&
            recording.scope?.mode === "voice-flow" &&
            state.voiceFlow &&
            !state.voiceFlow.cancelled
        );
    }

    function markVoiceFlowSpeech(recording) {
        if (!isActiveVoiceFlowRecording(recording)) return;
        const flow = state.voiceFlow;
        recording.hasSpeech = true;
        recording.lastVoiceAt = freeVoiceNow();
        recording.silenceStartedAt = 0;
        if (flow.silenceTimer) {
            clearTimeout(flow.silenceTimer);
            flow.silenceTimer = null;
        }
        flow.phase = "listening";
        flow.status = "Recording...";
    }

    function scheduleVoiceFlowSilenceStop(recording) {
        if (!isActiveVoiceFlowRecording(recording) || !recording.hasSpeech || recording.stopRequested) return;
        const flow = state.voiceFlow;
        if (flow.silenceTimer) return;
        const silenceMs = Number(recording.scope?.part) === 2 && recording.scope?.examPhase === "long_turn"
            ? EXAM_PART2_SILENCE_MS
            : EXAM_VOICE_SILENCE_MS;
        flow.silenceTimer = window.setTimeout(() => {
            flow.silenceTimer = null;
            if (isActiveVoiceFlowRecording(recording)) {
                stopVoiceFlowRecording("silence");
            }
        }, silenceMs);
    }

    function startVoiceFlowVad(recording) {
        const flow = ensureVoiceFlow();
        if (!recording || !flow.analyser) return;
        const buffer = new Uint8Array(flow.analyser.fftSize);
        recording.vadStartedAt = freeVoiceNow();
        recording.noiseFloor = 0.008;

        const tick = () => {
            if (!isActiveVoiceFlowRecording(recording)) return;
            flow.analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i += 1) {
                const centered = (buffer[i] - 128) / 128;
                sum += centered * centered;
            }
            const level = Math.sqrt(sum / buffer.length);
            const now = freeVoiceNow();
            const elapsed = now - recording.vadStartedAt;
            if (!recording.hasSpeech && elapsed < 800 && level < 0.035) {
                recording.noiseFloor = recording.noiseFloor * 0.9 + level * 0.1;
            }
            const threshold = Math.min(0.06, Math.max(EXAM_VOICE_LEVEL_THRESHOLD, recording.noiseFloor * 2.8));
            const isVoice = level >= threshold;

            if (isVoice) {
                if (!recording.aboveSpeechSince) recording.aboveSpeechSince = now;
                recording.silenceStartedAt = 0;
                if (flow.silenceTimer) {
                    clearTimeout(flow.silenceTimer);
                    flow.silenceTimer = null;
                }
                if (now - recording.aboveSpeechSince >= EXAM_VOICE_MIN_SPEECH_MS) {
                    markVoiceFlowSpeech(recording);
                }
            } else {
                recording.aboveSpeechSince = 0;
                if (recording.hasSpeech) {
                    if (!recording.silenceStartedAt) recording.silenceStartedAt = now;
                    if (now - recording.silenceStartedAt >= 180) {
                        scheduleVoiceFlowSilenceStop(recording);
                    }
                }
            }

            flow.vadFrame = window.requestAnimationFrame(tick);
        };

        flow.vadFrame = window.requestAnimationFrame(tick);
    }

    async function enterMockSpeakingExamDisplay() {
        if (!isSpeakingMockMode) return;
        try {
            await enterSpeakingFullScreen();
        } catch {}
    }

    function cancelActiveFreeVoiceRecording() {
        const recording = state.recording;
        if (recording?.scope?.mode !== "free-conversation") return false;
        recording.cancelled = true;
        recording.processTurn = false;
        recording.stopRequested = true;
        cleanupFreeVoiceRecording(recording);
        try {
            if (recording.recorder?.state !== "inactive") recording.recorder.stop();
        } catch {}
        state.recording = null;
        return true;
    }

    function resetFreeVoiceFlow(flow) {
        if (!flow || !isFreeVoiceFlow(flow)) return;
        const idleMessage = "Tap the microphone to start Speaking Practice.";
        flow.answers = [];
        flow.history = [];
        flow.started = false;
        flow.sessionActive = false;
        flow.listenStarting = false;
        flow.listenStartToken = "";
        flow.processingTurnToken = "";
        flow.pendingExaminerResponse = null;
        flow.speechToken = null;
        flow.turn = 0;
        flow.currentExaminerMessage = idleMessage;
        flow.latestQuestion = idleMessage;
        flow.latestTranscript = "";
        flow.latestUserMessage = "";
        setFreeVoicePhase(flow, FREE_VOICE_STATE.IDLE, idleMessage);
    }

    async function startFreeVoiceSession() {
        const flow = ensureVoiceFlow();
        if (!isFreeVoiceFlow(flow) || isFreeVoiceSessionActive(flow)) return;
        resetFreeVoiceFlow(flow);
        flow.cancelled = false;
        flow.started = true;
        flow.sessionActive = true;
        state.hasStarted = true;
        state.error = "";
        state.feedback = null;
        state.loading = false;
        flow.currentExaminerMessage = FREE_SPEAKING_GREETING;
        flow.latestQuestion = FREE_SPEAKING_GREETING;
        setFreeVoicePhase(flow, FREE_VOICE_STATE.LISTENING);
        renderCurrentTest();
        await startFreeVoiceListening();
    }

    function stopFreeVoiceSession(options = {}) {
        const flow = state.voiceFlow;
        if (!flow || !isFreeVoiceFlow(flow)) return;
        flow.sessionActive = false;
        flow.listenStarting = false;
        flow.listenStartToken = "";
        flow.processingTurnToken = "";
        flow.speechToken = null;
        clearVoiceFlowTimers();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        cancelActiveFreeVoiceRecording();
        resetFreeVoiceFlow(flow);
        state.error = "";
        state.loading = false;
        if (options.render !== false) renderCurrentTest();
    }

    function speakVoiceText(text, onDone) {
        const done = typeof onDone === "function" ? onDone : () => {};
        const spokenText = String(text || "").trim();
        if (!spokenText || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
            logMockSpeakingTransition("TTS skipped", { reason: "speechSynthesis unavailable or empty text" });
            window.setTimeout(done, 350);
            return;
        }
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(spokenText);
            const estimatedSpeechMs = Math.min(12000, Math.max(1400, spokenText.split(/\s+/).filter(Boolean).length * 430));
            let finished = false;
            let fallbackTimer = null;
            const finish = (reason = "unknown") => {
                if (finished) return;
                finished = true;
                if (fallbackTimer) clearTimeout(fallbackTimer);
                logMockSpeakingTransition("TTS ended", { reason, estimatedSpeechMs });
                done();
            };
            utterance.lang = "en-US";
            utterance.rate = 0.94;
            utterance.pitch = 1;
            utterance.volume = 1;
            utterance.onend = () => finish("onend");
            utterance.onerror = () => finish("onerror");
            logMockSpeakingTransition("TTS started", {
                language: utterance.lang,
                wordCount: spokenText.split(/\s+/).filter(Boolean).length,
                estimatedSpeechMs
            });
            window.speechSynthesis.speak(utterance);
            fallbackTimer = window.setTimeout(() => finish("fallback-timeout"), estimatedSpeechMs);
        } catch {
            logMockSpeakingTransition("TTS failed before start");
            window.setTimeout(done, 350);
        }
    }

    async function requestExaminerTurn(event, recording = null, answer = null) {
        const flow = ensureVoiceFlow();
        const transcript = String(answer?.transcript || recording?.transcript || recording?.finalTranscript || "").trim();
        const answerPart = flow.speakingMode === "free" ? 0 : Number(answer?.part || flow.part || 1);
        const payload = conversationStatePayload(flow, {
            event,
            answeringPart: answer ? answerPart : null,
            partTurns: answer ? nextPartTurns(flow, answerPart) : flow.partTurns
        });
        const fallback = fallbackExaminerResponse(event, transcript, payload);

        if (isMockSpeakingDebugFlow(flow)) {
            return normalizeExaminerResponse(advanceQuestion(event, transcript, payload), {
                ...fallback,
                latestTranscript: transcript
            });
        }

        try {
            const form = new FormData();
            form.append("event", event);
            form.append("state", JSON.stringify(payload));
            form.append("transcript", transcript);
            if (recording?.blob) {
                form.append("audio", new File([recording.blob], `speaking-answer-${Date.now()}.webm`, {
                    type: recording.blob.type || "audio/webm"
                }));
            }

            const response = await fetch("/api/speaking/examiner-next", {
                method: "POST",
                credentials: "include",
                body: form
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "AI examiner could not continue.");
            return normalizeExaminerResponse(data, { ...fallback, latestTranscript: transcript });
        } catch (error) {
            console.warn("AI examiner fallback used:", error);
            return normalizeExaminerResponse(fallback, { ...fallback, latestTranscript: transcript });
        }
    }

    async function requestFreeConversationTurn(recording, transcript) {
        const flow = ensureVoiceFlow();
        const cleanTranscript = String(transcript || recording?.transcript || recording?.finalTranscript || "").trim();
        const payload = conversationStatePayload(flow, {
            event: "message",
            answeringPart: null,
            part: 0,
            examPhase: "conversation",
            latestTranscript: cleanTranscript,
            latestUserMessage: cleanTranscript
        });
        const fallback = fallbackExaminerResponse("message", cleanTranscript, payload);

        try {
            const form = new FormData();
            form.append("event", "message");
            form.append("state", JSON.stringify(payload));
            form.append("transcript", cleanTranscript);
            if (recording?.blob) {
                form.append("audio", new File([recording.blob], `free-speaking-${Date.now()}.webm`, {
                    type: recording.blob.type || "audio/webm"
                }));
            }

            const response = await fetch("/api/speaking/conversation-turn", {
                method: "POST",
                credentials: "include",
                body: form
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "AI speaking partner could not respond.");
            return normalizeExaminerResponse(data, { ...fallback, latestTranscript: cleanTranscript });
        } catch (error) {
            console.warn("AI speaking partner fallback used:", error);
            return normalizeExaminerResponse(fallback, { ...fallback, latestTranscript: cleanTranscript });
        }
    }

    function addExaminerHistory(response) {
        const flow = ensureVoiceFlow();
        const text = String(response.examinerMessage || "").trim();
        if (!text) return;
        const role = flow.speakingMode === "free" ? "assistant" : "examiner";
        flow.history.push({ role, text, part: response.part, phase: response.phase });
        flow.history = flow.history.slice(-24);
    }

    function addUserHistory(answer) {
        const flow = ensureVoiceFlow();
        const text = String(answer.transcript || "").trim();
        if (!text) return;
        flow.history.push({ role: "user", text, part: answer.part, phase: answer.examPhase });
        flow.history = flow.history.slice(-24);
    }

    function part3TransitionResponse(response, answer) {
        return response;
    }

    function handleExaminerSpeechDone(response) {
        const flow = ensureVoiceFlow();
        if (flow.cancelled) return;
        flow.speechToken = null;
        flow.pendingExaminerResponse = null;

        if (response.isComplete || response.phase === "complete") {
            flow.phase = "completed";
            flow.status = "Speaking test completed";
            flow.isComplete = true;
            flow.currentQuestionIndex = Number.isFinite(Number(response.questionIndex)) ? Number(response.questionIndex) : currentVoiceQuestionIndex(flow);
            flow.currentQuestionTotal = Number(response.totalQuestions || flow.currentQuestionTotal || voiceQuestionTotal(flow.part));
            logMockSpeakingTransition("transition: speakingCompleted");
            renderCurrentTest();
            finishVoiceFlow();
            return;
        }

        if (response.phase === "prep") {
            logMockSpeakingTransition("transition: part2Preparation");
            startVoicePreparation(response);
            return;
        }

        flow.phase = "answer-starting";
        flow.status = "You may answer now";
        logMockSpeakingTransition("transition: examinerSpeaking -> recordingAnswer pending");
        renderCurrentTest();
        flow.autoStartTimer = window.setTimeout(() => {
            flow.autoStartTimer = null;
            if (!state.voiceFlow || flow.cancelled || flow.phase !== "answer-starting") return;
            startVoiceFlowRecording();
        }, EXAM_VOICE_AUTOSTART_DELAY_MS);
    }

    function speakExaminerResponse(response) {
        const flow = ensureVoiceFlow();
        if (flow.cancelled) return;
        clearVoiceFlowTimers();
        if (window.speechSynthesis) window.speechSynthesis.cancel();

        flow.part = response.part;
        flow.examPhase = response.phase;
        flow.currentQuestionIndex = Number.isFinite(Number(response.questionIndex))
            ? Number(response.questionIndex)
            : (response.phase === "prep" || response.phase === "long_turn" ? 0 : Math.max(0, Number(flow.partTurns?.[response.part] || 0)));
        flow.currentQuestionTotal = Number(response.totalQuestions || (response.part === 2 ? 1 : mockPartQuestions(response.part).length));
        flow.turn += 1;
        flow.currentExaminerMessage = response.examinerMessage;
        flow.latestQuestion = response.phase === "prep" && response.cueCard
            ? cueCardDisplayText(response.cueCard)
            : response.examinerMessage;
        if (!isFreeVoiceFlow(flow)) {
            flow.latestTranscript = "";
            flow.latestUserMessage = "";
        }
        if (response.cueCard) flow.cueCard = response.cueCard;
        if (response.phase === "rounding_off") flow.roundingAsked = true;
        flow.phase = "examiner-speaking";
        flow.status = "Examiner speaking...";
        flow.pendingExaminerResponse = response;
        addExaminerHistory(response);
        logMockSpeakingTransition("transition: examinerSpeaking", {
            responsePart: response.part,
            responsePhase: response.phase
        });
        renderCurrentTest();

        const token = `${Date.now()}-${Math.random()}`;
        flow.speechToken = token;
        speakVoiceText(response.examinerMessage, () => {
            const activeFlow = state.voiceFlow;
            if (!activeFlow || activeFlow.speechToken !== token) return;
            handleExaminerSpeechDone(response);
        });
    }

    function speakFreeConversationResponse(response) {
        const flow = ensureVoiceFlow();
        if (flow.cancelled || !flow.sessionActive) return;
        clearVoiceFlowTimers();
        if (window.speechSynthesis) window.speechSynthesis.cancel();

        flow.part = 0;
        flow.examPhase = "conversation";
        flow.turn += 1;
        flow.currentExaminerMessage = response.examinerMessage;
        flow.latestQuestion = response.examinerMessage;
        setFreeVoicePhase(flow, FREE_VOICE_STATE.AI_SPEAKING);
        flow.pendingExaminerResponse = response;
        addExaminerHistory({ ...response, part: 0, phase: "conversation" });
        renderCurrentTest();

        const token = `${Date.now()}-${Math.random()}`;
        flow.speechToken = token;
        speakVoiceText(response.examinerMessage, () => {
            const activeFlow = state.voiceFlow;
            if (!activeFlow || activeFlow.speechToken !== token) return;
            activeFlow.speechToken = null;
            activeFlow.pendingExaminerResponse = null;
            if (!activeFlow.sessionActive || activeFlow.cancelled) return;
            setFreeVoicePhase(activeFlow, FREE_VOICE_STATE.LISTENING);
            renderCurrentTest();
            activeFlow.restartTimer = window.setTimeout(() => {
                activeFlow.restartTimer = null;
                startFreeVoiceListening();
            }, FREE_VOICE_RESTART_DELAY_MS);
        });
    }

    function finishExaminerSpeechEarly() {
        const flow = ensureVoiceFlow();
        const pending = flow.pendingExaminerResponse;
        if (!pending) return;
        flow.speechToken = null;
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        handleExaminerSpeechDone(pending);
    }

    function repeatCurrentQuestion() {
        const flow = ensureVoiceFlow();
        if (flow.cancelled || flow.paused || state.recording || flow.phase === "preparing") return;
        const text = flow.currentExaminerMessage || flow.latestQuestion;
        if (!text) return;
        if (flow.autoStartTimer) {
            clearTimeout(flow.autoStartTimer);
            flow.autoStartTimer = null;
        }
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        const response = {
            part: flow.part,
            phase: flow.examPhase || "question",
            examinerMessage: text,
            shouldRecord: true,
            isComplete: false,
            cueCard: flow.cueCard
        };
        flow.phase = "examiner-speaking";
        flow.status = "Repeating question...";
        renderCurrentTest();
        speakVoiceText(text, () => handleExaminerSpeechDone(response));
    }

    function finishCurrentAnswer() {
        if (state.recording?.scope?.mode === "voice-flow") stopVoiceFlowRecording("manual-finish");
        else if (state.recording?.scope?.mode === "free-conversation") stopFreeVoiceListening({ reason: "manual-finish" });
    }

    function pauseVoiceFlow() {
        const flow = ensureVoiceFlow();
        if (flow.paused || flow.cancelled || flow.isComplete) return;
        flow.paused = true;
        flow.pausedPhase = flow.phase;
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (flow.prepInterval) {
            clearInterval(flow.prepInterval);
            flow.prepInterval = null;
        }
        if (flow.autoStartTimer) {
            clearTimeout(flow.autoStartTimer);
            flow.autoStartTimer = null;
        }
        if (state.recording?.recorder?.state === "recording") {
            if (flow.answerTimer) {
                clearTimeout(flow.answerTimer);
                flow.answerTimer = null;
                const part = Number(state.recording.scope?.part || flow.part || 1);
                const maxMs = (part === 2 ? SPEAKING_TIMING.part2Speaking : part === 3 ? 60 : 45) * 1000;
                state.recording.remainingMs = Math.max(1000, maxMs - (Date.now() - state.recording.startedAt));
            }
            state.recording.recorder.pause();
            clearVoiceFlowVad(flow);
        }
        flow.phase = "paused";
        flow.status = "Test paused";
        renderCurrentTest();
    }

    function resumeVoiceFlow() {
        const flow = ensureVoiceFlow();
        if (!flow.paused || flow.cancelled) return;
        const previous = flow.pausedPhase || "answer-starting";
        flow.paused = false;
        flow.pausedPhase = "";
        if (state.recording?.recorder?.state === "paused") {
            state.recording.recorder.resume();
            flow.phase = "listening";
            flow.status = "Recording...";
            startVoiceFlowVad(state.recording);
            flow.answerTimer = window.setTimeout(() => {
                if (state.recording) stopVoiceFlowRecording("time-limit");
            }, Math.max(1000, Number(state.recording.remainingMs || 1000)));
            renderCurrentTest();
            return;
        }
        if (previous === "preparing") {
            startVoicePreparation({ cueCard: flow.cueCard, prepSeconds: Math.max(1, flow.prepRemaining), phase: "prep" });
            return;
        }
        flow.phase = previous === "examiner-speaking" ? "answer-starting" : previous;
        flow.status = "Test resumed";
        renderCurrentTest();
        if (previous === "examiner-speaking") repeatCurrentQuestion();
    }

    function startVoicePreparation(response) {
        const flow = ensureVoiceFlow();
        clearVoiceFlowTimers();
        const seconds = Math.max(5, Number(response.prepSeconds || SPEAKING_TIMING.part2Prep));
        flow.part = 2;
        flow.examPhase = "prep";
        flow.phase = "preparing";
        flow.status = "Preparation time";
        flow.currentQuestionIndex = 0;
        flow.currentQuestionTotal = 1;
        flow.prepRemaining = seconds;
        if (response.cueCard) flow.cueCard = response.cueCard;
        flow.latestQuestion = cueCardDisplayText(flow.cueCard);
        logMockSpeakingTransition("transition: part2Preparation started", { seconds });
        renderCurrentTest();

        flow.prepInterval = window.setInterval(() => {
            if (!state.voiceFlow || flow.cancelled) return;
            flow.prepRemaining = Math.max(0, Number(flow.prepRemaining || 0) - 1);
            if (flow.prepRemaining <= 0) {
                clearVoiceFlowTimers();
                logMockSpeakingTransition("transition: part2Preparation ended");
                beginPart2LongTurn();
                return;
            }
            // Keep the Part 2 scroll position stable while the preparation
            // countdown is running. Re-rendering the whole player here used
            // to replace the scroll container every second and jump it back
            // to the top before users could reach the cue-card notes.
            const prepTimer = app.querySelector(".ai-prep-timer");
            if (prepTimer) {
                prepTimer.textContent = formatDuration(flow.prepRemaining);
            } else {
                renderCurrentTest();
            }
        }, 1000);
    }

    function beginPart2LongTurn() {
        const flow = ensureVoiceFlow();
        if (flow.cancelled) return;
        speakExaminerResponse({
            part: 2,
            phase: "long_turn",
            questionIndex: 0,
            totalQuestions: 1,
            examinerMessage: "Now you may start speaking.",
            shouldRecord: true,
            isComplete: false,
            cueCard: flow.cueCard
        });
    }

    async function startVoiceFlow() {
        if (!state.test) state.test = defaultFullSpeakingTest();
        state.hasStarted = true;
        state.feedback = null;
        state.error = "";
        state.loading = false;
        state.voiceFlow = createVoiceFlow();
        const flow = state.voiceFlow;
        flow.started = true;
        if (isSpeakingMockMode) {
            await enterMockSpeakingExamDisplay();
        }
        logMockSpeakingTransition("transition: idle -> requestingMicPermission");
        if (flow.speakingMode === "free") {
            startFreeVoiceSession();
            return;
        }
        try {
            await ensureVoiceFlowMicStream();
        } catch {
            return;
        }
        flow.phase = "generating-questions";
        flow.status = "Generating a fresh IELTS Speaking test...";
        renderCurrentTest();
        try {
            state.test = await requestGeneratedSpeakingTest();
        } catch (error) {
            console.warn("Generated Speaking test unavailable; using bundled fallback:", error);
            state.test = defaultFullSpeakingTest();
            state.error = "Fresh questions were unavailable, so a fallback IELTS test was loaded.";
        }
        flow.cueCard = getConversationCueCard();
        flow.currentQuestionTotal = mockPartQuestions(1).length;
        startHeaderTimer(getHeaderTotalSeconds());
        flow.phase = "thinking";
        flow.status = "Thinking...";
        logMockSpeakingTransition("transition: requestingMicPermission -> movingNext start");
        renderCurrentTest();
        const response = await requestExaminerTurn("start");
        if (flow.cancelled) return;
        speakExaminerResponse(response);
    }

    async function startFreeVoiceListening() {
        const flow = ensureVoiceFlow();
        if (!isFreeVoiceFlow(flow) || flow.cancelled || !flow.sessionActive) return;
        if (state.recording?.scope?.mode === "free-conversation" || flow.listenStarting) return;
        if (flow.phase === FREE_VOICE_STATE.PROCESSING || flow.phase === FREE_VOICE_STATE.AI_SPEAKING) return;
        state.hasStarted = true;
        state.error = "";
        const listenToken = `${Date.now()}-${Math.random()}`;
        flow.listenStarting = true;
        flow.listenStartToken = listenToken;
        setFreeVoicePhase(flow, FREE_VOICE_STATE.LISTENING);
        renderCurrentTest();
        let stream = null;
        try {
            if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
                throw new Error("Microphone recording is not available in this browser.");
            }
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const activeFlow = state.voiceFlow;
            if (!activeFlow || activeFlow.cancelled || !activeFlow.sessionActive || activeFlow.listenStartToken !== listenToken) {
                stopTracks(stream);
                return;
            }
            const recorder = new MediaRecorder(stream);
            const recording = {
                scope: {
                    mode: "free-conversation",
                    part: 0,
                    questionText: "",
                    examPhase: "conversation"
                },
                stream,
                recorder,
                chunks: [],
                startedAt: Date.now(),
                transcript: "",
                finalTranscript: "",
                processTurn: true,
                hasSpeech: false,
                vadAvailable: false,
                stopRequested: false,
                turnToken: listenToken
            };

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                try {
                    recording.audioContext = new AudioContextClass();
                    if (recording.audioContext.state === "suspended") {
                        recording.audioContext.resume().catch(() => {});
                    }
                    recording.analyser = recording.audioContext.createAnalyser();
                    recording.analyser.fftSize = 2048;
                    recording.analyser.smoothingTimeConstant = 0.08;
                    recording.audioSource = recording.audioContext.createMediaStreamSource(stream);
                    recording.audioSource.connect(recording.analyser);
                    recording.vadAvailable = true;
                } catch (error) {
                    console.warn("Free voice VAD unavailable:", error);
                    cleanupFreeVoiceAudioGraph(recording);
                }
            }

            recorder.ondataavailable = (event) => {
                if (event.data?.size) recording.chunks.push(event.data);
            };
            recorder.onstop = () => {
                cleanupFreeVoiceRecording(recording);
                clearFreeVoiceSilenceTimer(activeFlow);
                if (activeFlow?.answerTimer) {
                    clearTimeout(activeFlow.answerTimer);
                    activeFlow.answerTimer = null;
                }
                if (state.recording === recording) state.recording = null;
                if (recording.cancelled) return;
                recording.blob = new Blob(recording.chunks, { type: recorder.mimeType || "audio/webm" });
                recording.audioUrl = URL.createObjectURL(recording.blob);
                const transcript = String(recording.transcript || recording.finalTranscript || "").trim();
                const hasAudioPayload = recording.hasSpeech || Boolean(transcript) || (!recording.vadAvailable && recording.chunks.some((chunk) => chunk.size > 1024));
                if (!recording.processTurn || !activeFlow || activeFlow.cancelled || !activeFlow.sessionActive) return;
                if (!hasAudioPayload) {
                    setFreeVoicePhase(activeFlow, FREE_VOICE_STATE.LISTENING);
                    renderCurrentTest();
                    startFreeVoiceListening();
                    return;
                }
                completeFreeConversationTurn(recording);
            };

            recording.recognition = startRecognition(recording);
            if (recording.recognition) {
                recording.recognition.onspeechstart = () => markFreeVoiceSpeech(recording);
                recording.recognition.onsoundstart = () => markFreeVoiceSpeech(recording);
                recording.recognition.onspeechend = () => {
                    scheduleFreeVoiceSilenceStop(recording);
                };
            }

            state.recording = recording;
            flow.listenStarting = false;
            setFreeVoicePhase(flow, FREE_VOICE_STATE.LISTENING);
            recorder.start(250);
            startFreeVoiceVad(recording);
            flow.answerTimer = window.setTimeout(() => {
                if (state.recording === recording) {
                    stopFreeVoiceListening({ reason: "max-turn" });
                }
            }, FREE_VOICE_MAX_TURN_MS);
            renderCurrentTest();
        } catch (error) {
            if (stream) stopTracks(stream);
            flow.sessionActive = false;
            flow.started = false;
            flow.listenStarting = false;
            state.error = error.name === "NotAllowedError"
                ? "Microphone permission was denied. Allow microphone access and try again."
                : (error.message || "Could not access your microphone. Check browser permissions and try again.");
            setFreeVoicePhase(flow, FREE_VOICE_STATE.IDLE, "Connection failed. Please try again.");
            renderCurrentTest();
        } finally {
            if (state.voiceFlow?.listenStartToken === listenToken) {
                state.voiceFlow.listenStarting = false;
            }
        }
    }

    async function startVoiceFlowRecording() {
        const flow = ensureVoiceFlow();
        if (isFreeVoiceFlow(flow)) {
            await startFreeVoiceListening();
            return;
        }
        if (state.recording || flow.cancelled || !["answer-starting", "user-turn"].includes(flow.phase)) return;
        try {
            const stream = await ensureVoiceFlowMicStream();
            if (!stream) return;
            if (flow.audioContext?.state === "suspended") {
                flow.audioContext.resume().catch(() => {});
            }
            const recorder = new MediaRecorder(stream);
            const part = flow.speakingMode === "free" ? 0 : Number(flow.part || 1);
            const recording = {
                scope: {
                    mode: "voice-flow",
                    part,
                    questionIndex: currentVoiceQuestionIndex(flow),
                    questionTotal: Number(flow.currentQuestionTotal || voiceQuestionTotal(part)),
                    questionText: flow.latestQuestion || flow.currentExaminerMessage || "",
                    examPhase: flow.examPhase
                },
                stream,
                recorder,
                chunks: [],
                startedAt: Date.now(),
                transcript: "",
                finalTranscript: "",
                hasSpeech: false,
                vadAvailable: Boolean(flow.analyser),
                stopReason: "",
                stopRequested: false,
                timestamp: new Date().toISOString()
            };

            recorder.ondataavailable = (event) => {
                if (event.data?.size) recording.chunks.push(event.data);
            };
            recorder.onstop = () => {
                if (recording.cancelled) return;
                recording.blob = new Blob(recording.chunks, { type: recorder.mimeType || "audio/webm" });
                recording.audioUrl = URL.createObjectURL(recording.blob);
                logMockSpeakingTransition("recording stopped", {
                    stopReason: recording.stopReason || "unknown",
                    durationSeconds: Math.round((Date.now() - recording.startedAt) / 1000),
                    chunks: recording.chunks.length
                });
                try {
                    recording.recognition?.stop();
                } catch {}
                state.recording = null;
                clearVoiceFlowVad(flow);
                if (flow.answerTimer) {
                    clearTimeout(flow.answerTimer);
                    flow.answerTimer = null;
                }
                if (state.voiceFlow?.cancelled) return;
                flow.phase = "answer-saved";
                flow.status = "Answer saved";
                flow.latestTranscript = String(recording.transcript || recording.finalTranscript || "").trim() || "Audio answer saved.";
                logMockSpeakingTransition("transition: transcribing/savingAnswer complete");
                renderCurrentTest();
                flow.nextTimer = window.setTimeout(() => {
                    flow.nextTimer = null;
                    if (!state.voiceFlow?.cancelled) completeVoiceFlowAnswer(recording);
                }, 450);
            };

            recording.recognition = startRecognition(recording);
            const recognitionSupported = Boolean(recording.recognition);
            if (recording.recognition) {
                recording.recognition.onspeechstart = () => markVoiceFlowSpeech(recording);
                recording.recognition.onsoundstart = () => markVoiceFlowSpeech(recording);
                recording.recognition.onspeechend = () => {
                    scheduleVoiceFlowSilenceStop(recording);
                };
            }

            state.recording = recording;
            flow.phase = "listening";
            flow.status = "Recording...";
            flow.latestTranscript = recognitionSupported
                ? "Listening..."
                : "Speech recognition is not supported in this browser. Your audio is still being recorded.";
            recorder.start(250);
            logMockSpeakingTransition("recording started", {
                part,
                examPhase: recording.scope.examPhase,
                speechRecognitionLanguage: recording.recognition?.lang || "unavailable"
            });
            startVoiceFlowVad(recording);
            const maxSeconds = part === 2 ? SPEAKING_TIMING.part2Speaking : part === 3 ? 60 : 45;
            flow.answerTimer = window.setTimeout(() => {
                if (state.recording === recording) stopVoiceFlowRecording("time-limit");
            }, maxSeconds * 1000);
            renderCurrentTest();
        } catch (error) {
            state.error = error.name === "NotAllowedError"
                ? "Microphone permission was denied. Allow microphone access and try again."
                : (error.message || "Could not access your microphone. Check browser permissions and try again.");
            flow.phase = "failed";
            flow.status = "Connection failed. Please try again.";
            renderCurrentTest();
        }
    }

    function stopVoiceFlowRecording(reason = "manual") {
        if (state.recording?.scope?.mode !== "voice-flow") return false;
        state.recording.stopReason = reason;
        state.recording.stopRequested = true;
        logMockSpeakingTransition("recording stop requested", { reason });
        clearVoiceFlowVad(state.voiceFlow);
        if (state.recording.recorder.state !== "inactive") {
            state.recording.recorder.stop();
        }
        return true;
    }

    function stopFreeVoiceListening(options = {}) {
        const recording = state.recording;
        if (recording?.scope?.mode !== "free-conversation") return false;
        if (recording.stopRequested) return false;
        recording.stopRequested = true;
        recording.processTurn = options.processTurn !== false;
        cleanupFreeVoiceAudioGraph(recording);
        clearFreeVoiceSilenceTimer(state.voiceFlow);
        if (state.voiceFlow?.answerTimer) {
            clearTimeout(state.voiceFlow.answerTimer);
            state.voiceFlow.answerTimer = null;
        }
        if (recording.recorder.state !== "inactive") {
            recording.recorder.stop();
        }
        return true;
    }

    async function completeFreeConversationTurn(recording) {
        const flow = ensureVoiceFlow();
        if (!isFreeVoiceFlow(flow) || flow.cancelled || !flow.sessionActive || recording.completed) return;
        const turnToken = recording.turnToken || `${Date.now()}-${Math.random()}`;
        if (flow.processingTurnToken) return;
        recording.completed = true;
        flow.processingTurnToken = turnToken;
        const transcript = String(recording.transcript || recording.finalTranscript || "").trim();

        setFreeVoicePhase(flow, FREE_VOICE_STATE.PROCESSING);
        flow.latestTranscript = transcript || "Transcribing what you said...";
        flow.latestUserMessage = transcript;
        renderCurrentTest();

        const response = await requestFreeConversationTurn(recording, transcript);
        if (flow.cancelled || !flow.sessionActive || flow.processingTurnToken !== turnToken) return;
        flow.processingTurnToken = "";

        const finalTranscript = String(response.latestTranscript || transcript || "").trim();
        flow.latestTranscript = finalTranscript || "Transcript unavailable. Let's keep talking.";
        flow.latestUserMessage = finalTranscript;
        addUserHistory({
            transcript: finalTranscript,
            part: 0,
            examPhase: "conversation"
        });
        speakFreeConversationResponse(response);
    }

    async function completeVoiceFlowAnswer(recording) {
        const flow = ensureVoiceFlow();
        if (isFreeVoiceFlow(flow)) {
            await completeFreeConversationTurn(recording);
            return;
        }
        const transcript = String(recording.transcript || recording.finalTranscript || "").trim();
        const duration = Math.round((Date.now() - recording.startedAt) / 1000);
        const answer = {
            blob: recording.blob,
            audioUrl: recording.audioUrl,
            transcript,
            durationSeconds: duration,
            duration,
            timestamp: recording.timestamp || new Date(recording.startedAt).toISOString(),
            savedAt: new Date().toISOString(),
            stopReason: recording.stopReason || "unknown",
            part: flow.speakingMode === "free" ? 0 : Number(recording.scope.part || flow.part || 1),
            questionIndex: Number(recording.scope.questionIndex || 0),
            questionTotal: Number(recording.scope.questionTotal || 0),
            title: flow.speakingMode === "free" ? "Speaking Practice" : `Part ${Number(recording.scope.part || flow.part || 1)}`,
            topic: Number(recording.scope.part || flow.part || 1) === 1
                ? (state.test?.part1Topics || []).find((item) => (item.questions || []).includes(recording.scope.questionText))?.topic || "Introduction and interview"
                : (state.test?.topic || flow.cueCard?.topic || "IELTS Speaking"),
            questionText: recording.scope.questionText || flow.latestQuestion || flow.currentExaminerMessage || "",
            prompt: recording.scope.questionText || flow.latestQuestion || flow.currentExaminerMessage || "",
            examPhase: recording.scope.examPhase || flow.examPhase
        };

        flow.phase = "moving";
        flow.status = "Moving to next question...";
        flow.latestTranscript = transcript || "Transcribing your answer...";
        logMockSpeakingTransition("transition: movingNext", {
            answeredPart: answer.part,
            answeredQuestionIndex: recording.scope?.questionIndex ?? currentVoiceQuestionIndex(flow),
            transcriptLength: transcript.length
        });
        renderCurrentTest();

        if (flow.finishAfterCurrentAnswer) {
            flow.latestTranscript = transcript || "Transcript unavailable. Your audio was recorded.";
            flow.partTurns = nextPartTurns(flow, answer.part);
            flow.answers.push(answer);
            addUserHistory(answer);
            await finishVoiceFlow();
            return;
        }

        let response = await requestExaminerTurn("answer", recording, answer);
        if (flow.cancelled) return;
        response = part3TransitionResponse(response, answer);

        const finalTranscript = response.latestTranscript || transcript;
        answer.transcript = finalTranscript;
        if (response.audioUrl) answer.audioUrl = response.audioUrl;
        flow.latestTranscript = finalTranscript || "Transcript unavailable. Your audio was recorded.";
        flow.partTurns = nextPartTurns(flow, answer.part);
        flow.answers.push(answer);
        addUserHistory(answer);
        logMockSpeakingTransition("answer saved", {
            savedPart: answer.part,
            savedAnswers: flow.answers.length,
            nextPart: response.part,
            nextPhase: response.phase
        });
        speakExaminerResponse(response);
    }

    function skipVoicePreparation() {
        const flow = ensureVoiceFlow();
        if (flow.phase !== "preparing") return;
        clearVoiceFlowTimers();
        beginPart2LongTurn();
    }

    async function finishVoiceFlow() {
        const flow = ensureVoiceFlow();
        if (isFreeVoiceFlow(flow)) return;
        if (flow.feedbackRequested) return;
        flow.feedbackRequested = true;
        flow.phase = "feedback";
        flow.status = "Speaking test completed";
        flow.isComplete = true;
        logMockSpeakingTransition("transition: speakingCompleted -> feedback", {
            totalAnswers: flow.answers.length
        });
        cleanupVoiceFlowMic(flow);
        renderCurrentTest();

        if (!flow.answers.length) {
            if (isSpeakingMockMode) {
                clearAllPlayerTimers();
                notifyMockSpeakingComplete({
                    testId: state.test?.id || "",
                    autoSubmit: true,
                    band: 0,
                    result: {
                        overallBand: 0,
                        status: "incomplete"
                    },
                    parts: [],
                    answers: {}
                });
            }
            return;
        }

        const mode = state.section === "full" ? "full_test" : sectionMeta[state.section]?.submitMode || "full_test";
        const testMode = state.section === "full" ? "full" : "part";
        const submittedParts = flow.answers.map((answer, index) => ({
            part: answer.part || defaultPartForMode(mode, index),
            questionIndex: Number(answer.questionIndex || 0),
            title: answer.title || `Part ${answer.part || index + 1}`,
            topic: answer.topic || state.test?.topic || "",
            prompt: answer.prompt || answer.questionText || "",
            questionText: answer.questionText || answer.prompt || "",
            transcript: answer.transcript || "",
            userAnswer: answer.transcript || "",
            audioUrl: answer.audioUrl || "",
            durationSeconds: answer.durationSeconds || 0,
            duration: answer.duration || answer.durationSeconds || 0,
            timestamp: answer.timestamp || "",
            savedAt: answer.savedAt || "",
            stopReason: answer.stopReason || ""
        }));
        await submitAttempt({
            mode,
            testMode,
            partNumber: submittedParts[submittedParts.length - 1]?.part || getActiveSubmitPartNumber(),
            title: `${state.test?.title || "IELTS Speaking Test"} - AI Voice Interview`,
            topic: state.test?.topic || "IELTS Speaking Test",
            prompt: {
                ...(state.test || {}),
                conversation: flow.history,
                cueCard: flow.cueCard
            },
            records: flow.answers,
            parts: submittedParts
        });
    }

    function endVoiceFlow() {
        if (isSpeakingMockMode) {
            requestMockSpeakingExit();
            return;
        }
        const flow = ensureVoiceFlow();
        if (isFreeVoiceFlow(flow)) {
            stopFreeVoiceSession({ render: false });
            flow.cancelled = true;
            state.error = "";
            state.loading = false;
            state.feedback = null;
            state.hasStarted = false;
            state.voiceFlow = null;
            if (window.location.pathname !== "/speaking") {
                window.history.pushState({}, "", "/speaking");
            }
            renderHome();
            return;
        }
        flow.cancelled = true;
        clearVoiceFlowTimers();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (state.recording?.scope?.mode === "voice-flow") {
            const activeRecording = state.recording;
            activeRecording.cancelled = true;
            stopTracks(activeRecording.stream);
            try {
                activeRecording.recognition?.stop();
            } catch {}
            try {
                if (activeRecording.recorder.state !== "inactive") activeRecording.recorder.stop();
            } catch {}
            state.recording = null;
        }
        if (state.recording?.scope?.mode === "free-conversation") {
            const activeRecording = state.recording;
            activeRecording.cancelled = true;
            stopTracks(activeRecording.stream);
            try {
                activeRecording.recognition?.stop();
            } catch {}
            try {
                if (activeRecording.recorder.state !== "inactive") activeRecording.recorder.stop();
            } catch {}
            state.recording = null;
        }
        cleanupVoiceFlowMic(flow);
        state.error = "";
        state.loading = false;
        state.feedback = null;
        state.hasStarted = false;
        state.voiceFlow = null;
        if (window.location.pathname !== "/speaking") {
            window.history.pushState({}, "", "/speaking");
        }
        renderHome();
    }

    function handleVoiceMicAction() {
        const flow = ensureVoiceFlow();
        if (isFreeVoiceFlow(flow)) {
            handleFreeVoiceMicAction(flow);
            return;
        }
        if (state.loading || flow.phase === "thinking" || flow.phase === "feedback") return;
        if (!flow.started || flow.phase === "idle" || flow.phase === "failed" || flow.phase === "completed") {
            startVoiceFlow();
            return;
        }
        if (flow.phase === "preparing") {
            skipVoicePreparation();
            return;
        }
        if (flow.phase === "examiner-speaking") {
            finishExaminerSpeechEarly();
            return;
        }
        if (flow.phase === "answer-starting" || flow.phase === "user-turn") {
            startVoiceFlowRecording();
            return;
        }
        if (flow.phase === "listening") {
            stopVoiceFlowRecording("manual");
        }
    }

    function handleFreeVoiceMicAction(flow = ensureVoiceFlow()) {
        if (isFreeVoiceSessionActive(flow)) {
            stopFreeVoiceSession();
            return;
        }
        startFreeVoiceSession();
    }

    function voiceStatusText() {
        const flow = ensureVoiceFlow();
        if (isFreeVoiceFlow(flow)) {
            if (state.error) return state.error;
            if (flow.phase === FREE_VOICE_STATE.AI_SPEAKING) return "AI is speaking...";
            if (flow.phase === FREE_VOICE_STATE.PROCESSING) return "Thinking...";
            if (flow.phase === FREE_VOICE_STATE.USER_SPEAKING) return "Listening to you...";
            if (flow.phase === FREE_VOICE_STATE.LISTENING || flow.listenStarting) return "Listening...";
            if (flow.phase === "failed") return flow.status || "Connection failed. Please try again.";
            return flow.status || "Tap the microphone to start Speaking Practice.";
        }
        if (state.feedback) return isFreeVoiceFlow(flow) ? "Ready" : "Speaking test completed";
        if (state.error) return state.error;
        if (state.loading && (flow.phase === "feedback" || flow.phase === "completed")) return "Speaking test completed";
        if (state.loading) return "Thinking...";
        if (isSpeakingMockMode && !isFreeVoiceFlow(flow)) {
            if (flow.phase === "mic-permission") return "Requesting microphone permission...";
            if (flow.phase === "examiner-speaking") return "Listen to the question...";
            if (flow.phase === "answer-starting" || flow.phase === "user-turn") return "Recording will start automatically...";
            if (flow.phase === "listening") return "Recording your answer...";
            if (flow.phase === "answer-saved") return "Transcribing your answer...";
            if (flow.phase === "moving" || flow.phase === "thinking") return "Moving to next question...";
            if (flow.phase === "preparing") return "Preparation time...";
            if (flow.phase === "failed") return flow.status || "Connection failed. Please try again.";
            if (flow.phase === "completed" || flow.phase === "feedback") return "Speaking section completed";
        }
        if (flow.phase === "mic-permission") return "Requesting microphone permission...";
        if (flow.phase === "speaking") return "AI is speaking...";
        if (flow.phase === "examiner-speaking") return isFreeVoiceFlow(flow) ? "AI is speaking..." : "Examiner speaking...";
        if (flow.phase === "answer-starting" || flow.phase === "user-turn") return "You may answer now";
        if (flow.phase === "listening") return "Recording...";
        if (flow.phase === "answer-saved") return "Answer saved";
        if (flow.phase === "moving") return "Moving to next question...";
        if (flow.phase === "thinking") return flow.status || "Thinking...";
        if (flow.phase === "preparing") return "Preparation time";
        if (flow.phase === "failed") return flow.status || "Connection failed. Please try again.";
        if (flow.phase === "completed" || flow.phase === "feedback") return "Speaking test completed";
        return flow.status || "Ready";
    }

    function voiceQuestionTotal(partNumber) {
        const payload = conversationTestPayload();
        if (partNumber === 1) {
            const count = Array.isArray(payload.part1Questions) ? payload.part1Questions.length : 0;
            return count || PLAYER_DEFAULTS.part1.questions.length;
        }
        if (partNumber === 3) {
            const count = Array.isArray(payload.part3Questions) ? payload.part3Questions.length : 0;
            return count || PLAYER_DEFAULTS.part3.questions.length;
        }
        return 1;
    }

    function voiceQuestionProgress(flow) {
        if (!flow || isFreeVoiceFlow(flow)) return null;
        const partNumber = Math.min(3, Math.max(1, Number(flow.part || 1)));
        const total = voiceQuestionTotal(partNumber);
        const answered = Number(flow.partTurns?.[partNumber] || 0);
        const explicitIndex = Number(flow.currentQuestionIndex);
        const currentIndex = Number.isFinite(explicitIndex) && explicitIndex >= 0 ? explicitIndex : answered;
        const current = flow.isComplete || flow.phase === "feedback"
            ? total
            : Math.min(total, Math.max(1, currentIndex + 1));
        let label = partNumber === 2 ? "Cue card" : `Question ${current} of ${total}`;
        if (partNumber === 2 && flow.phase === "preparing") label = "Preparation";
        if (partNumber === 2 && flow.examPhase === "long_turn") label = "Long turn";
        return {
            partNumber,
            current,
            total,
            label
        };
    }

    function renderVoiceProgress(flow) {
        const progress = voiceQuestionProgress(flow);
        if (!progress) return "";
        return `
            <div class="ai-voice-progress" aria-label="Speaking test progress">
                <span>Part ${progress.partNumber}</span>
                <strong>${escapeHtml(progress.label)}</strong>
            </div>
        `;
    }

    function renderCueCardForVoice(flow) {
        if (flow.speakingMode === "free") return "";
        if (!flow.cueCard || (Number(flow.part) !== 2 && flow.examPhase !== "prep" && flow.examPhase !== "long_turn")) return "";
        const cueCard = normalizeCueCard(flow.cueCard);
        return `
            <div class="ai-cue-card" aria-label="Part 2 cue card">
                <span>Part 2 cue card</span>
                <strong>${escapeHtml(cueCard.topic)}</strong>
                <ul>
                    ${cueCard.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
                ${flow.phase === "preparing" ? `<textarea class="ai-cue-notes" data-part2-notes placeholder="Write brief preparation notes..." aria-label="Part 2 preparation notes">${escapeHtml(flow.part2Notes || "")}</textarea>` : ""}
                ${flow.phase === "preparing" ? `<div class="ai-prep-timer">${formatDuration(flow.prepRemaining || 0)}</div>` : ""}
            </div>
        `;
    }

    function renderLatestTranscript(flow) {
        const fallbackTranscript = isSpeakingMockMode && !isFreeVoiceFlow(flow) && flow.phase === "listening" ? "Listening..." : "";
        const transcript = String(flow.latestTranscript || fallbackTranscript).trim();
        const pendingMessages = new Set([
            "Listening...",
            "Transcribing your answer...",
            "Transcribing what you said...",
            "Speech recognition is not supported in this browser. Your audio is still being recorded."
        ]);
        if (!transcript || pendingMessages.has(transcript)) {
            return transcript ? `<p class="ai-transcript-pending">${escapeHtml(transcript)}</p>` : "";
        }
        const isFreeMode = flow.speakingMode === "free";
        const label = isFreeMode ? "You said" : "Your latest answer";
        const ariaLabel = isFreeMode ? "Latest user speech transcript" : "Latest user answer transcript";
        return `
            <div class="ai-latest-transcript" aria-label="${escapeHtml(ariaLabel)}">
                <span>${escapeHtml(label)}</span>
                <p>${escapeHtml(transcript)}</p>
            </div>
        `;
    }

    function renderVoiceFeedback() {
        if (!state.feedback) return "";
        const feedback = state.feedback;
        const overall = Number(feedback.overallBand || 0).toFixed(1);
        const advice = Array.isArray(feedback.howToImprove) && feedback.howToImprove.length
            ? feedback.howToImprove[0]
            : (feedback.detailedFeedback || "Your speaking feedback is ready.");
        const criteria = [
            ["Fluency & Coherence", feedback.fluencyCoherence],
            ["Lexical Resource", feedback.lexicalResource],
            ["Grammar Range & Accuracy", feedback.grammaticalRangeAccuracy],
            ["Pronunciation", feedback.pronunciation]
        ];
        return `
            <div class="ai-voice-feedback" role="status">
                <span>Estimated IELTS band</span>
                <strong>${escapeHtml(overall)}</strong>
                <div class="ai-feedback-grid">
                    ${criteria.map(([label, value]) => `
                        <div>
                            <small>${escapeHtml(label)}</small>
                            <b>${escapeHtml(Number(value || 0).toFixed(1))}</b>
                        </div>
                    `).join("")}
                </div>
                <p>${escapeHtml(advice)}</p>
                <div class="ai-feedback-actions">
                    <a class="speaking-record-btn speaking-record-btn--primary" href="/dashboard">View result</a>
                    <a class="speaking-record-btn speaking-record-btn--secondary" href="/speaking">Speaking dashboard</a>
                </div>
            </div>
        `;
    }

    function renderVoicePartTracker(flow) {
        if (!flow || isFreeVoiceFlow(flow)) return "";
        const currentPart = Math.min(3, Math.max(1, Number(flow.part || 1)));
        const answeredParts = new Set((flow.answers || []).map((answer) => Number(answer.part || 0)).filter(Boolean));
        return `
            <div class="ai-voice-part-tracker" aria-label="IELTS Speaking parts">
                ${[1, 2, 3].map((partNumber) => {
                    const isActive = currentPart === partNumber && !flow.isComplete;
                    const isComplete = flow.isComplete || (answeredParts.has(partNumber) && partNumber < currentPart);
                    return `
                        <span class="${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""}">
                            <small>Part ${partNumber}</small>
                            <strong>${escapeHtml(PLAYER_TITLES[partNumber].replace(/^Part\s+\d+:\s*/i, ""))}</strong>
                        </span>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderMockVoiceTopbar(isPart2 = false) {
        return `
            <header class="ai-voice-topbar ai-voice-topbar--exam ${isPart2 ? "speaking-part2-header" : ""}">
                <div class="ai-voice-badge">
                    ${lucideIcon("mic", "ai-voice-badge-icon")}
                    <span>IELTS Speaking Test</span>
                </div>
                <button class="ai-voice-settings" type="button" aria-label="Settings" title="Settings">
                    ${lucideIcon("sliders", "ai-voice-settings-icon")}
                </button>
            </header>
        `;
    }

    function renderMockSpeakingIntro(flow) {
        const statusText = state.error || flow.status || "The test will start soon";
        return `
            <section class="ai-speaking-screen ai-speaking-screen--mock ai-speaking-screen--intro" data-ai-phase="idle" aria-label="IELTS Speaking Test intro">
                <div class="ai-speaking-bg" aria-hidden="true"></div>
                ${renderMockVoiceTopbar()}
                <main class="ai-voice-main ai-voice-main--intro" aria-live="polite">
                    <div class="ai-intro-copy">
                        <span>IELTS Speaking Test</span>
                        <h1>The test will start soon</h1>
                        <p>${escapeHtml(statusText)}</p>
                    </div>
                    <div class="ai-orb-stage" aria-hidden="true">
                        <span class="ai-orbit ai-orbit-outer"></span>
                        <span class="ai-orbit ai-orbit-middle"><span class="ai-orbit-dot"></span></span>
                        <span class="ai-orbit ai-orbit-inner"></span>
                        <div class="ai-orb"></div>
                    </div>
                    <button class="ai-start-speaking-btn" type="button" data-action="voice-mic">
                        ${lucideIcon("mic", "ai-voice-control-icon")}
                        <span>Start Speaking Test</span>
                    </button>
                    <p class="ai-intro-note">Microphone permission will be requested once. The examiner will guide the rest automatically.</p>
                </main>
                <div class="ai-voice-controls ai-voice-controls--intro" aria-label="Speaking controls">
                    <div class="ai-voice-control-stack">
                        <button class="ai-voice-end-button ai-voice-end-button--mock" type="button" data-action="voice-end" aria-label="Stop Test" title="Stop Test">
                            ${lucideIcon("x", "ai-voice-control-icon")}
                        </button>
                        <span>Stop Test</span>
                    </div>
                </div>
            </section>
        `;
    }

    function renderVoiceFlowPlayer() {
        setPlayerMode(true);
        document.body.classList.add("speaking-voice-mode");
        const cbtHeader = document.getElementById("speakingCbtHeader");
        if (cbtHeader) cbtHeader.style.display = "none";
        if (isSpeakingMockMode) updatePlayerHeader();
        const flow = ensureVoiceFlow();
        if (isSpeakingMockMode && !flow.started) {
            app.innerHTML = renderMockSpeakingIntro(flow);
            return;
        }
        const isRecording = state.recording?.scope?.mode === "voice-flow" || state.recording?.scope?.mode === "free-conversation";
        const isFreeMode = flow.speakingMode === "free";
        const visualPhase = isFreeMode
            ? (flow.phase === FREE_VOICE_STATE.AI_SPEAKING
                ? "speaking"
                : flow.phase === FREE_VOICE_STATE.PROCESSING
                    ? "thinking"
                    : flow.phase)
            : (flow.phase === "examiner-speaking" ? "speaking" : (state.loading ? "thinking" : flow.phase));
        const message = !isFreeMode && Number(flow.part) === 2 && (flow.phase === "preparing" || flow.examPhase === "prep")
            ? "Prepare your cue card answer."
            : (flow.latestQuestion || flow.currentExaminerMessage || "Tap the microphone to begin.");
        const playerBadge = flow.speakingMode === "free" ? "Speaking Practice" : (isSpeakingMockMode ? "IELTSX Mock Test Speaking" : "IELTS Speaking Test");
        const freeSessionActive = isFreeVoiceSessionActive(flow);
        const feedbackRetryAvailable = !isFreeMode && flow.phase === "feedback-failed";
        const micDisabled = isFreeMode
            ? false
            : (state.loading || ["mic-permission", "thinking", "feedback", "answer-saved", "moving", "preparing", "examiner-speaking", "paused", "generating-questions"].includes(flow.phase));
        const micLabel = isFreeMode
            ? (freeSessionActive ? "Stop voice session" : "Start voice session")
            : (!flow.started || flow.phase === "idle" || flow.phase === "failed" || flow.phase === "completed"
                ? "Start Speaking Test"
                : flow.phase === "listening"
                    ? "Recording"
                    : flow.phase === "preparing"
                        ? "Please wait"
                        : flow.phase === "examiner-speaking"
                            ? "Mic active"
                            : flow.phase === "answer-starting" || flow.phase === "user-turn"
                                ? "Mic active"
                                : "Please wait");
        const micIcon = (flow.phase === "failed" || feedbackRetryAvailable)
            ? lucideIcon("rotate", "ai-voice-control-icon")
            : lucideIcon("mic", "ai-voice-control-icon");
        const micAction = feedbackRetryAvailable ? "voice-retry-feedback" : "voice-mic";
        const resolvedMicLabel = feedbackRetryAvailable ? "Retry AI Check" : micLabel;
        const endLabel = isFreeMode ? "End session" : "Stop Test";
        const partNumber = Math.min(3, Math.max(1, Number(flow.part || 1)));
        const isPart2 = partNumber === 2;
        const topbarMarkup = isSpeakingMockMode
            ? renderMockVoiceTopbar(isPart2)
            : `
                <header class="ai-voice-topbar ${isPart2 ? "speaking-part2-header" : ""}">
                    <div class="ai-voice-badge">
                        ${lucideIcon("mic", "ai-voice-badge-icon")}
                        <span>${escapeHtml(playerBadge)}</span>
                    </div>
                    <button class="ai-voice-settings" type="button" aria-label="Settings">
                        ${lucideIcon("sliders", "ai-voice-settings-icon")}
                    </button>
                </header>
            `;

        app.innerHTML = `
            <section class="ai-speaking-screen ${isSpeakingMockMode ? "ai-speaking-screen--mock" : ""} ${isPart2 ? "speaking-part2-fullscreen" : ""}" data-ai-phase="${escapeHtml(visualPhase)}" aria-label="${escapeHtml(playerBadge)}">
                <div class="ai-speaking-bg" aria-hidden="true"></div>
                ${topbarMarkup}
                <main class="ai-voice-main ${isPart2 ? "speaking-part2-content" : ""}" aria-live="polite">
                    ${isSpeakingMockMode ? renderVoicePartTracker(flow) : ""}
                    ${renderVoiceProgress(flow)}
                    <p class="ai-voice-status">${escapeHtml(voiceStatusText())}</p>
                    <div class="ai-orb-stage ${isRecording ? "is-recording" : ""}">
                        <span class="ai-orbit ai-orbit-outer" aria-hidden="true"></span>
                        <span class="ai-orbit ai-orbit-middle" aria-hidden="true"><span class="ai-orbit-dot" aria-hidden="true"></span></span>
                        <span class="ai-orbit ai-orbit-inner" aria-hidden="true"></span>
                        <div class="ai-orb" aria-hidden="true"></div>
                    </div>
                    <div class="ai-question-wrap">
                        <p class="ai-current-question">${escapeHtml(message)}</p>
                        ${renderCueCardForVoice(flow)}
                        ${renderLatestTranscript(flow)}
                    </div>
                    ${renderVoiceFeedback()}
                </main>
                <div class="ai-voice-controls ${isPart2 ? "speaking-part2-footer" : ""}" aria-label="Speaking controls">
                    ${!isFreeMode ? `
                    <div class="ai-voice-control-stack">
                        <button class="ai-voice-mic-button" type="button" data-action="voice-repeat" aria-label="Repeat Question" title="Repeat Question" ${isRecording || flow.phase === "preparing" ? "disabled" : ""}>
                            ${lucideIcon("rotate", "ai-voice-control-icon")}
                        </button>
                        <span>Repeat</span>
                    </div>
                    <div class="ai-voice-control-stack">
                        <button class="ai-voice-mic-button" type="button" data-action="voice-finish-answer" aria-label="Finish Answer" title="Finish Answer" ${isRecording ? "" : "disabled"}>
                            ${lucideIcon("check", "ai-voice-control-icon")}
                        </button>
                        <span>Finish Answer</span>
                    </div>
                    <div class="ai-voice-control-stack">
                        <button class="ai-voice-mic-button" type="button" data-action="${flow.paused ? "voice-resume" : "voice-pause"}" aria-label="${flow.paused ? "Resume Test" : "Pause Test"}" title="${flow.paused ? "Resume Test" : "Pause Test"}">
                            ${lucideIcon(flow.paused ? "play" : "pause", "ai-voice-control-icon")}
                        </button>
                        <span>${flow.paused ? "Resume" : "Pause"}</span>
                    </div>` : ""}
                    <div class="ai-voice-control-stack">
                        <button class="ai-voice-mic-button ${isRecording ? "is-recording" : ""}" type="button" data-action="${micAction}" aria-label="${escapeHtml(resolvedMicLabel)}" title="${escapeHtml(resolvedMicLabel)}" ${micDisabled ? "disabled" : ""}>
                            ${micIcon}
                        </button>
                        <span>${escapeHtml(resolvedMicLabel)}</span>
                    </div>
                    <div class="ai-voice-control-stack">
                        <button class="ai-voice-end-button ${isSpeakingMockMode ? "ai-voice-end-button--mock" : ""}" type="button" data-action="voice-end" aria-label="${escapeHtml(endLabel)}" title="${escapeHtml(endLabel)}">
                            ${lucideIcon("x", "ai-voice-control-icon")}
                        </button>
                        <span>${escapeHtml(endLabel)}</span>
                    </div>
                </div>
            </section>
        `;
    }

    function renderSpeakingPlayer() {
        if (state.voiceFlow) {
            renderVoiceFlowPlayer();
            return;
        }
        document.body.classList.remove("speaking-voice-mode");
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

        if (state.feedback) {
            app.innerHTML = `
                <section class="speaking-player-screen speaking-player-screen--result" aria-label="Speaking test result">
                    <main class="speaking-result-stage">
                        ${renderFeedback()}
                    </main>
                </section>
            `;
            return;
        }

        app.innerHTML = `
            <section class="speaking-player-screen ${state.section === "full" ? "speaking-player-screen--full" : "speaking-player-screen--single"}" aria-label="Speaking test player">
                <main class="speaking-player-stage">
                    ${renderSpeakingQuestionPanel(part)}
                    ${renderSpeakingResponsePanel(part, record, isRecording)}
                    ${renderSpeakingInfoPanel(part, recordingStatus)}
                </main>
                ${renderSpeakingBottomTabs(part.part)}
            </section>
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
                    ${state.loading ? renderStatus() : ""}
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
        const submitMode = getSubmitTestMode();
        const partNumber = getActiveSubmitPartNumber();
        console.log("Speaking submit clicked");
        console.log("Mode:", submitMode);
        console.log("Part:", partNumber);
        if (!state.hasStarted) return;
        if (state.loading) return;
        if (state.section === "full") submitFullProgressOrFinal(partNumber);
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
            ["Overall band", feedback.overallBand],
            ["Fluency and Coherence", feedback.fluencyCoherence],
            ["Lexical Resource", feedback.lexicalResource],
            ["Grammar Range and Accuracy", feedback.grammaticalRangeAccuracy],
            ["Pronunciation", feedback.pronunciation]
        ];
        return `
            <section class="speaking-feedback-card">
                <div class="speaking-card-head">
                    <div>
                        <span class="speaking-section-kicker">AI Feedback</span>
                        <h3>Speaking Band Estimate</h3>
                        <p>${escapeHtml("Review your Speaking feedback below.")}</p>
                    </div>
                    <a class="speaking-secondary speaking-header-back" href="${sectionMeta[state.section].route}">&lt;- Back</a>
                </div>
                <div class="speaking-band-row">
                    ${bands.map(([label, value]) => `<div class="speaking-band-card"><span>${escapeHtml(label)}</span><strong>${Number(value || 0).toFixed(1)}</strong></div>`).join("")}
                </div>
                <div class="speaking-feedback-grid">
                    ${renderFeedbackText("Feedback", feedback.detailedFeedback)}
                    ${renderFeedbackList("Strengths", feedback.strengths)}
                    ${renderFeedbackList("Problems", feedback.problems)}
                    ${renderFeedbackList("Improvement tips", feedback.howToImprove)}
                    ${renderFeedbackList("Suggested improved answers", feedback.improvedAnswers)}
                    ${renderFeedbackList("Practical tips", feedback.practicalTips)}
                </div>
            </section>
        `;
    }

    function renderFeedbackText(title, text) {
        const value = String(text || "").trim();
        return `
            <section class="speaking-feedback-section">
                <h4>${escapeHtml(title)}</h4>
                <p class="speaking-muted">${escapeHtml(value || "No detailed feedback returned for this attempt.")}</p>
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
        if (state.loading) return;
        const meta = sectionMeta[state.section];
        const record = state.partRecords[state.section];
        if (!record?.blob) {
            setError("Record your answer before submitting.");
            return;
        }
        const questionText = `${state.test.topic || state.test.description || meta.categoryTitle}\n${(state.test.questions || []).join("\n")}`.trim();
        const userAnswer = record.transcript || "";
        const part = {
            part: meta.part,
            title: meta.categoryTitle,
            prompt: questionText,
            questionText,
            transcript: userAnswer,
            userAnswer,
            audioUrl: record.audioUrl || ""
        };
        await submitAttempt({
            mode: meta.submitMode,
            testMode: "part",
            partNumber: meta.part,
            title: `${meta.categoryTitle} - ${state.test.title}`,
            topic: state.test.topic || state.test.description || meta.categoryTitle,
            prompt: state.test,
            records: [record],
            parts: [part]
        });
    }

    async function submitCue() {
        if (state.loading) return;
        if (!state.cueRecord?.blob) {
            setError("Record your Cue Card answer before submitting.");
            return;
        }
        const questionText = `${state.test.topic || state.test.description || "Cue Card"}\n${(state.test.bullets || []).join("\n")}`.trim();
        const userAnswer = state.cueRecord.transcript || "";
        const part = {
            part: 2,
            title: "Cue Card",
            prompt: questionText,
            questionText,
            transcript: userAnswer,
            userAnswer,
            audioUrl: state.cueRecord.audioUrl || ""
        };
        await submitAttempt({
            mode: "cue_card",
            testMode: "part",
            partNumber: 2,
            title: `Cue Card Practice - ${state.test.title}`,
            topic: state.test.topic,
            prompt: state.test,
            records: [state.cueRecord],
            parts: [part]
        });
    }

    function submitFullProgressOrFinal(partNumber = getActiveSubmitPartNumber()) {
        if (state.loading) return;
        const record = state.fullRecords[partNumber];
        if (!record?.blob) {
            if (isSpeakingMockMode && partNumber === 3) {
                submitFull();
                return;
            }
            setError(`Record Part ${partNumber} before ${partNumber === 3 ? "submitting" : "moving to the next part"}.`);
            return;
        }
        if (partNumber < 3) {
            moveToFullPart(partNumber + 1);
            return;
        }
        submitFull();
    }

    async function submitFull() {
        if (state.loading) return;
        const parts = activeFullParts();
        const records = parts.map((part) => state.fullRecords[part.part]);
        if (records.some((record) => !record?.blob)) {
            if (isSpeakingMockMode) {
                const submittedParts = parts.map((part) => {
                    const record = state.fullRecords[part.part] || {};
                    const questionText = questionTextFromPart(part);
                    const userAnswer = record.transcript || "";
                    return {
                        part: part.part,
                        title: part.title,
                        prompt: questionText,
                        questionText,
                        transcript: userAnswer,
                        userAnswer,
                        audioUrl: record.audioUrl || ""
                    };
                });
                clearAllPlayerTimers();
                notifyMockSpeakingComplete({
                    testId: state.test?.id || "",
                    autoSubmit: true,
                    band: 0,
                    result: {
                        overallBand: 0,
                        status: "incomplete"
                    },
                    parts: submittedParts,
                    answers: Object.fromEntries(submittedParts.map((part) => [
                        `part${part.part}`,
                        part.transcript || ""
                    ]))
                });
                return;
            }
            setError("Record all three parts before submitting the full test.");
            return;
        }
        const submittedParts = parts.map((part) => {
            const record = state.fullRecords[part.part];
            const questionText = questionTextFromPart(part);
            const userAnswer = record?.transcript || "";
            return {
                part: part.part,
                title: part.title,
                prompt: questionText,
                questionText,
                transcript: userAnswer,
                userAnswer,
                audioUrl: record?.audioUrl || ""
            };
        });
        await submitAttempt({
            mode: "full_test",
            testMode: "full",
            partNumber: 3,
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

    function aggregateSpeakingPartsForMock(parts = []) {
        const grouped = new Map();
        (Array.isArray(parts) ? parts : []).forEach((part, index) => {
            const partNumber = Math.min(3, Math.max(1, Number(part?.part || defaultPartForMode("full_test", index) || 1)));
            if (!grouped.has(partNumber)) {
                grouped.set(partNumber, {
                    part: partNumber,
                    title: PLAYER_TITLES[partNumber] || `Part ${partNumber}`,
                    prompt: "",
                    questionText: "",
                    transcript: "",
                    userAnswer: "",
                    audioUrl: "",
                    answers: []
                });
            }
            const entry = grouped.get(partNumber);
            const prompt = String(part?.questionText || part?.prompt || "").trim();
            const transcript = String(part?.transcript || part?.userAnswer || "").trim();
            if (prompt) {
                entry.questionText = entry.questionText ? `${entry.questionText}\n\n${prompt}` : prompt;
                entry.prompt = entry.questionText;
            }
            if (transcript) {
                entry.transcript = entry.transcript ? `${entry.transcript}\n\n${transcript}` : transcript;
                entry.userAnswer = entry.transcript;
            }
            if (!entry.audioUrl && part?.audioUrl) entry.audioUrl = part.audioUrl;
            entry.answers.push({
                        part: partNumber,
                        title: part?.title || `Part ${partNumber}`,
                        questionIndex: Number(part?.questionIndex || 0),
                        prompt,
                        questionText: prompt,
                        transcript,
                        userAnswer: transcript,
                        audioUrl: part?.audioUrl || "",
                        durationSeconds: Number(part?.durationSeconds || part?.duration) || 0,
                        duration: Number(part?.duration || part?.durationSeconds) || 0,
                        timestamp: part?.timestamp || "",
                        savedAt: part?.savedAt || "",
                        stopReason: part?.stopReason || ""
                    });
        });

        return [1, 2, 3]
            .map((partNumber) => grouped.get(partNumber))
            .filter(Boolean);
    }

    function speakingAnswersObject(parts = []) {
        return Object.fromEntries(aggregateSpeakingPartsForMock(parts).map((part) => [
            `part${part.part}`,
            part.transcript || ""
        ]));
    }

    async function submitAttempt({ mode, testMode, partNumber, title, topic, prompt, records, parts }) {
        if (state.loading) return;
        const resolvedTestMode = testMode || (mode === "full_test" ? "full" : "part");
        const resolvedPartNumber = Number(partNumber || parts?.[0]?.part || getActiveSubmitPartNumber());
        const testId = getSpeakingTestId();
        const questionText = (parts || []).map((part) => part.questionText || part.prompt || "").filter(Boolean).join("\n\n");
        const userAnswer = (parts || []).map((part) => part.userAnswer || part.transcript || "").filter(Boolean).join("\n\n");
        state.loading = true;
        state.error = "";
        state.feedback = null;
        renderCurrentTest();
        try {
            const form = new FormData();
            form.append("testId", testId);
            form.append("part", String(resolvedPartNumber || ""));
            form.append("testMode", resolvedTestMode);
            form.append("mode", mode);
            form.append("title", title);
            form.append("topic", topic);
            form.append("prompt", JSON.stringify(prompt));
            form.append("parts", JSON.stringify(parts));
            form.append("questionText", questionText);
            form.append("userAnswer", userAnswer);
            form.append("transcript", userAnswer);
            form.append("audioUrls", JSON.stringify((records || []).map((record) => record?.audioUrl || "")));
            const recordsToUpload = mode === "full_test"
                ? []
                : (records || []).filter((record) => record?.blob);
            recordsToUpload.forEach((record, index) => {
                form.append("audio", new File([record.blob], `${mode}-${index + 1}.webm`, { type: record.blob.type || "audio/webm" }));
            });

            console.log("Sending speaking evaluation request", {
                testId,
                mode: resolvedTestMode,
                part: resolvedPartNumber,
                apiMode: mode,
                parts: (parts || []).map((part) => ({
                    part: part.part,
                    questionText: part.questionText || part.prompt || "",
                    hasTranscript: Boolean(part.userAnswer || part.transcript),
                    audioUrl: part.audioUrl || ""
                }))
            });

            const response = await fetch("/api/evaluate-speaking", {
                method: "POST",
                credentials: "include",
                body: form
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || data.error || "AI feedback failed. Please try again.");
            console.log("Speaking evaluation result", data);
            state.feedback = data.feedback;
            state.lastSpeakingAttempt = data.attempt || null;
            applyServerTranscripts(mode, data.attempt?.parts);
            clearAllPlayerTimers();
            if (mode === "full_test") {
                const submittedParts = data.attempt?.parts || parts;
                const mockParts = isSpeakingMockMode ? aggregateSpeakingPartsForMock(submittedParts) : submittedParts;
                notifyMockSpeakingComplete({
                    testId: state.test?.id || "",
                    band: Number(data.feedback?.overallBand) || 0,
                    result: data.feedback,
                    parts: mockParts,
                    answerDetails: isSpeakingMockMode ? submittedParts : undefined,
                    answers: isSpeakingMockMode
                        ? speakingAnswersObject(submittedParts)
                        : Object.fromEntries((submittedParts || []).map((part) => [
                            `part${part.part}`,
                            part.transcript || ""
                        ]))
                });
            }
        } catch (error) {
            console.error("[Mock Speaking] evaluation failed:", error);
            state.error = error.message || "AI feedback failed. Please try again.";
            if (state.voiceFlow && mode === "full_test") {
                state.voiceFlow.feedbackRequested = false;
                state.voiceFlow.phase = "feedback-failed";
                state.voiceFlow.status = state.error;
            }
            if (isSpeakingMockMode && mode === "full_test") {
                const submittedParts = parts || [];
                const mockParts = aggregateSpeakingPartsForMock(submittedParts);
                clearAllPlayerTimers();
                notifyMockSpeakingComplete({
                    testId: state.test?.id || "",
                    autoSubmit: false,
                    band: 0,
                    result: {
                        overallBand: 0,
                        status: "evaluation_failed",
                        error: state.error
                    },
                    parts: mockParts,
                    answerDetails: submittedParts,
                    answers: speakingAnswersObject(submittedParts)
                });
            }
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
        if (route.view === "player") {
            if (isSpeakingMockMode && route.mode === "exam") {
                await prepareMockSpeakingSimulation(route.testId);
            } else {
                prepareSpeakingPlayerState(route.mode);
                renderCurrentTest();
            }
        } else if (route.view === "listing") renderListing(route.sectionKey);
        else if (route.view === "test") await renderTest(route.sectionKey, route.testId);
        else {
            renderHome();
        }
    }

    function cleanupSpeakingResources() {
        clearAllPlayerTimers();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        const recording = state.recording;
        if (recording) {
            recording.cancelled = true;
            try { recording.recognition?.stop(); } catch {}
            try { if (recording.recorder?.state !== "inactive") recording.recorder.stop(); } catch {}
            stopTracks(recording.stream);
            state.recording = null;
        }
        if (state.voiceFlow && !isFreeVoiceFlow(state.voiceFlow)) cleanupVoiceFlowMic(state.voiceFlow);
    }

    window.addEventListener("beforeunload", (event) => {
        if (!state.voiceFlow?.started || state.voiceFlow?.isComplete) return;
        event.preventDefault();
        event.returnValue = "";
    });
    window.addEventListener("pagehide", cleanupSpeakingResources, { once: true });

    app.addEventListener("input", (event) => {
        if (event.target.matches("[data-part2-notes]")) {
            ensureVoiceFlow().part2Notes = event.target.value;
            return;
        }
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
        if (action === "select-speaking-mode") startSpeakingFromIntro(target.dataset.mode || "free");
        else if (action === "voice-mic") handleVoiceMicAction();
        else if (action === "voice-retry-feedback") finishVoiceFlow();
        else if (action === "voice-end") endVoiceFlow();
        else if (action === "voice-repeat") repeatCurrentQuestion();
        else if (action === "voice-finish-answer") finishCurrentAnswer();
        else if (action === "voice-pause") pauseVoiceFlow();
        else if (action === "voice-resume") resumeVoiceFlow();
        else if (action === "start-single-recording") startRecording({ mode: "single" });
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
            submitFullProgressOrFinal();
        }
    });

    document.addEventListener("click", (event) => {
        if (event.target.closest("[data-mock-exit]")) {
            event.preventDefault();
            requestMockSpeakingExit();
            return;
        }
        if (!event.target.closest("[data-speaking-header-submit]")) return;
        submitActiveAttempt();
    });

    boot().catch((error) => {
        console.error("[Mock Speaking] boot failed:", error);
        notifyMockSpeakingError(error);
        app.innerHTML = `
            <section class="speaking-player-screen speaking-player-screen--full" aria-label="Speaking load error">
                <main class="speaking-player-stage">
                    <div class="speaking-error">${escapeHtml(error.message || "Speaking could not be loaded.")}</div>
                    <div class="speaking-player-actions">
                        <button class="speaking-record-btn" type="button" onclick="window.location.reload()">Retry</button>
                        <a class="speaking-record-btn speaking-record-btn--secondary" href="/dashboard">Dashboard</a>
                    </div>
                </main>
            </section>
        `;
    });
}());
