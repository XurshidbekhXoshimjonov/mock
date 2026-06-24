(function () {
    const root = document.getElementById("mockPlayerRoot");
    const sections = ["listening", "reading", "writing", "speaking"];
    const sectionLabels = {
        listening: "Listening",
        reading: "Reading",
        writing: "Writing",
        speaking: "Speaking"
    };
    const speakingPrepSeconds = 15 * 60;

    let mockTest = null;
    let activeIndex = 0;
    let finishedSections = new Set();
    let sectionPayloads = {
        listening: null,
        reading: null,
        writing: null,
        speaking: null
    };
    let speakingPrepTimer = null;
    let speakingPrepLeft = speakingPrepSeconds;
    let isFinalSubmitRunning = false;
    let exitModal = null;
    let mockUserEmail = "";

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function mockIdFromPath() {
        const parts = window.location.pathname.split("/").filter(Boolean);
        return decodeURIComponent(parts[1] || "");
    }

    function storageKey() {
        return `ieltsx-mock-test:${mockTest?.id || mockIdFromPath()}:flow`;
    }

    function saveLocal() {
        try {
            localStorage.setItem(storageKey(), JSON.stringify({
                activeIndex,
                finishedSections: Array.from(finishedSections),
                sectionPayloads
            }));
        } catch {}
    }

    function loadLocal() {
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey()) || "{}");
            if (Array.isArray(parsed.finishedSections)) {
                finishedSections = new Set(parsed.finishedSections.filter((section) => sections.includes(section)));
            }
            if (parsed.sectionPayloads && typeof parsed.sectionPayloads === "object") {
                sectionPayloads = { ...sectionPayloads, ...parsed.sectionPayloads };
            }
            if (Number.isFinite(Number(parsed.activeIndex))) {
                activeIndex = Math.min(Math.max(Number(parsed.activeIndex), 0), sections.length - 1);
            }
        } catch {}
    }

    function formatTime(totalSeconds) {
        const safe = Math.max(0, Number(totalSeconds) || 0);
        const minutes = Math.floor(safe / 60);
        const seconds = safe % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function currentSection() {
        return sections[activeIndex] || "listening";
    }

    function nextIncompleteSection() {
        return sections.find((section) => !finishedSections.has(section)) || "speaking";
    }

    function getStoredUserEmail() {
        const authUser = window.authClient?.getAuthState?.()?.user;
        return String(authUser?.email || "").trim();
    }

    async function loadMockUserEmail() {
        const storedEmail = getStoredUserEmail();
        if (storedEmail) return storedEmail;

        try {
            const response = await fetch("/api/auth/me", {
                credentials: "include",
                cache: "no-store"
            });
            const data = await response.json().catch(() => ({}));
            return String(data?.user?.email || "").trim();
        } catch {
            return "";
        }
    }

    function playerSource(section) {
        const mockId = mockTest.id;
        const params = new URLSearchParams({
            mockMode: "1",
            mockTestId: mockId,
            mockSection: section
        });

        if (section === "listening") {
            params.set("id", `mock-listening-${mockId}`);
            return `/listening-template.html?${params.toString()}`;
        }

        if (section === "reading") {
            params.set("id", `mock-reading-${mockId}`);
            return `/reading-template.html?${params.toString()}`;
        }

        if (section === "writing") {
            params.set("id", `mock-writing-${mockId}`);
            return `/full-writing-test.html?${params.toString()}`;
        }

        return `/speaking/full-test/${encodeURIComponent(`mock-speaking-${mockId}`)}?${params.toString()}`;
    }

    function renderStart() {
        clearSpeakingPrepTimer();
        document.body.classList.add("mock-intro-active");
        root.innerHTML = `
            <header class="mock-intro-header">
                <div class="mock-intro-brand">
                    <img src="/IELTS-logo.png" alt="IELTSX">
                    <strong>IELTSX</strong>
                </div>
                <span>Test taker ID: ${escapeHtml(mockUserEmail || "Not available")}</span>
            </header>
            <main class="mock-intro-wrap">
                <section class="mock-intro-card" aria-labelledby="mockIntroTitle">
                    <div class="mock-intro-section">
                        <h1 id="mockIntroTitle">IELTSX Full Mock Test</h1>
                        <p class="mock-intro-time">Time: approximately 2 hours 55 minutes</p>
                    </div>

                    <section class="mock-intro-section mock-intro-sections" aria-labelledby="mockIntroSectionsTitle">
                        <h2 id="mockIntroSectionsTitle">Test sections</h2>
                        <div class="mock-intro-section-cards">
                            <article class="mock-intro-section-card">
                                <span>Section 1</span>
                                <strong>Listening</strong>
                                <p>40 minutes</p>
                            </article>
                            <article class="mock-intro-section-card">
                                <span>Section 2</span>
                                <strong>Reading</strong>
                                <p>60 minutes</p>
                            </article>
                            <article class="mock-intro-section-card">
                                <span>Section 3</span>
                                <strong>Writing</strong>
                                <p>60 minutes</p>
                            </article>
                            <article class="mock-intro-section-card">
                                <span>Section 4</span>
                                <strong>Speaking</strong>
                                <p>11–14 minutes</p>
                            </article>
                        </div>
                    </section>

                    <div class="mock-intro-grid">
                        <section class="mock-intro-section">
                            <h2>Instructions to candidates</h2>
                            <ul>
                                <li>Answer all sections.</li>
                                <li>You can change your answers during each section before submitting that section.</li>
                                <li>Click "Submit Section" to move to the next section.</li>
                                <li>Your answers will not be checked after each section.</li>
                                <li>Final checking and evaluation will happen only after the Speaking section.</li>
                                <li>Do not refresh or close the page during the mock test.</li>
                            </ul>
                        </section>

                        <section class="mock-intro-section">
                            <h2>Information for candidates</h2>
                            <ul>
                                <li>Listening, Reading, Writing, and Speaking are included in this mock test.</li>
                                <li>The timer will show the remaining time for each section.</li>
                                <li>After submitting a section, you cannot return to that section.</li>
                                <li>If you exit the mock exam, your progress will be cancelled.</li>
                                <li>You will receive your final mock test result after completing Speaking.</li>
                            </ul>
                        </section>
                    </div>

                    <p class="mock-intro-warning"><span aria-hidden="true">!</span>If your details are not correct, please inform the administrator.</p>

                    <div class="mock-intro-actions">
                        <button id="startMockTest" class="mock-intro-primary" type="button">Start Test</button>
                        <a class="mock-intro-secondary" href="/mock-tests">Back to Mock Tests</a>
                    </div>
                </section>
            </main>
        `;
    }

    function renderPlayer(section) {
        clearSpeakingPrepTimer();
        document.body.classList.remove("mock-intro-active");
        activeIndex = sections.indexOf(section);
        if (activeIndex < 0) activeIndex = 0;
        saveLocal();

        root.innerHTML = `
            <main class="mock-player-frame-shell">
                <iframe
                    class="mock-player-frame"
                    title="${escapeHtml(`${sectionLabels[section]} player`)}"
                    src="${escapeHtml(playerSource(section))}"
                    allow="microphone; autoplay; fullscreen"
                ></iframe>
                <section id="mockTransitionPanel" class="mock-transition-panel hidden" aria-live="polite"></section>
            </main>
        `;
    }

    function answersFromQuestionResults(result) {
        return Object.fromEntries((result?.questionResults || []).map((item) => [
            String(item.number),
            item.userAnswer || ""
        ]));
    }

    function normalizeSectionPayload(section, data) {
        if (section === "listening" || section === "reading") {
            return {
                answers: data.answers || answersFromQuestionResults(data.result),
                result: data.result || {},
                band: Number(data.result?.band) || 0,
                completedAt: new Date().toISOString()
            };
        }

        if (section === "writing") {
            return {
                answers: data.answers || {},
                result: data.result || {},
                band: Number(data.band || data.result?.overallBand) || 0,
                completedAt: new Date().toISOString()
            };
        }

        return {
            answers: data.answers || Object.fromEntries((data.parts || []).map((part) => [
                `part${part.part}`,
                part.transcript || ""
            ])),
            parts: data.parts || [],
            result: data.result || {},
            band: Number(data.band || data.result?.overallBand) || 0,
            completedAt: new Date().toISOString()
        };
    }

    async function saveSectionProgress(section, payload) {
        await fetch(`/api/mock-tests/${encodeURIComponent(mockTest.id)}/progress`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                section,
                completed: true,
                answers: payload.answers || {},
                result: payload.result || {},
                band: payload.band || 0
            })
        }).catch(() => {});
    }

    function transitionButtonLabel(section) {
        if (section === "listening") return "Continue to Reading";
        if (section === "reading") return "Continue to Writing";
        return "Continue";
    }

    function showSectionTransition(section) {
        const panel = document.getElementById("mockTransitionPanel");
        if (!panel) return;

        panel.classList.remove("hidden");
        panel.innerHTML = `
            <div class="mock-transition-card">
                <span>${escapeHtml(sectionLabels[section])} saved</span>
                <h2>${escapeHtml(sectionLabels[section])} section finished.</h2>
                <p>Your answers have been saved for this Mock Test.</p>
                <button id="continueSection" class="mock-btn" type="button">${transitionButtonLabel(section)}</button>
            </div>
        `;
    }

    async function handleSectionComplete(section, data) {
        if (isFinalSubmitRunning) return;
        if (section !== currentSection()) return;

        const payload = normalizeSectionPayload(section, data || {});
        sectionPayloads[section] = payload;
        finishedSections.add(section);
        saveLocal();
        if (!data?.deferred) {
            await saveSectionProgress(section, payload);
        }

        if (section === "speaking") {
            submitMockTest().catch(showFatalError);
            return;
        }

        if (section === "listening") {
            renderPlayer("reading");
            return;
        }

        if (section === "reading") {
            renderPlayer("writing");
            return;
        }

        if (section === "writing") {
            renderSpeakingPreparation();
        }
    }

    function clearSpeakingPrepTimer() {
        if (speakingPrepTimer) clearInterval(speakingPrepTimer);
        speakingPrepTimer = null;
    }

    function updateSpeakingPrepTimer() {
        const timer = document.getElementById("speakingPrepTimer");
        if (timer) timer.textContent = formatTime(speakingPrepLeft);
    }

    function renderSpeakingPreparation() {
        clearSpeakingPrepTimer();
        document.body.classList.remove("mock-intro-active");
        speakingPrepLeft = speakingPrepSeconds;
        activeIndex = sections.indexOf("speaking");
        saveLocal();

        root.innerHTML = `
            <main class="mock-prep-wrap">
                <section class="mock-prep-panel">
                    <span>Before Speaking</span>
                    <h1>Speaking will start soon</h1>
                    <p>You have 15 minutes before the Speaking section begins.</p>
                    <strong id="speakingPrepTimer" class="mock-prep-timer">15:00</strong>
                    <div class="mock-prep-actions">
                        <button id="startSpeakingNow" class="mock-btn" type="button">Start Speaking</button>
                        <button class="mock-btn secondary" type="button" data-exit-mock-exam>Exit Mock Exam</button>
                    </div>
                </section>
            </main>
        `;

        speakingPrepTimer = setInterval(() => {
            speakingPrepLeft -= 1;
            updateSpeakingPrepTimer();
            if (speakingPrepLeft <= 0) {
                startSpeakingSection();
            }
        }, 1000);
    }

    function continueSection() {
        const section = currentSection();
        if (section === "listening") {
            renderPlayer("reading");
            return;
        }
        if (section === "reading") {
            renderPlayer("writing");
        }
    }

    function startSpeakingSection() {
        clearSpeakingPrepTimer();
        renderPlayer("speaking");
    }

    async function submitMockTest() {
        if (isFinalSubmitRunning) return;
        isFinalSubmitRunning = true;
        root.innerHTML = `
            <main class="mock-section-done">
                <h2>Saving Mock Test result...</h2>
                <p>Please wait while IELTSX prepares your final result.</p>
            </main>
        `;

        await evaluateWritingForFinalSubmit();

        const response = await fetch(`/api/mock-tests/${encodeURIComponent(mockTest.id)}/submit`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sections: {
                    listening: sectionPayloads.listening || {},
                    reading: sectionPayloads.reading || {},
                    writing: sectionPayloads.writing || {},
                    speaking: sectionPayloads.speaking || {}
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Could not submit mock test");
        }

        localStorage.removeItem(storageKey());
        window.location.href = `/mock-test/${encodeURIComponent(mockTest.id)}/result`;
    }

    async function evaluateWritingForFinalSubmit() {
        const writingPayload = sectionPayloads.writing || {};
        const answers = writingPayload.answers || {};
        const task1Response = String(answers.task1 || "").trim();
        const task2Response = String(answers.task2 || "").trim();

        if (Number(writingPayload.band) > 0 || Number(writingPayload.result?.overallBand) > 0) return;
        if (!task1Response || !task2Response) return;

        const response = await fetch("/api/writing/evaluate-full", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fullTestId: `mock-writing-${mockTest.id}`,
                task1Response,
                task2Response,
                testType: "academic-writing-full",
                timeSpent: Number(writingPayload.timeSpent) || 0
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || result.message || "Could not evaluate Writing section");
        }

        sectionPayloads.writing = {
            ...writingPayload,
            result,
            band: Number(result.overallBand) || 0,
            completedAt: writingPayload.completedAt || new Date().toISOString()
        };
        saveLocal();
    }

    function ensureExitModal() {
        if (exitModal) return exitModal;

        exitModal = document.createElement("div");
        exitModal.className = "mock-exit-modal hidden";
        exitModal.innerHTML = `
            <section class="mock-exit-dialog" role="dialog" aria-modal="true" aria-labelledby="mockExitTitle">
                <h2 id="mockExitTitle">Exit Mock Exam</h2>
                <p>If you exit now, your exam will be cancelled. You won’t be able to continue from where you left off.</p>
                <strong>Are you sure?</strong>
                <div class="mock-exit-actions">
                    <button class="mock-btn mock-btn-danger" type="button" data-confirm-exit-mock>Yes</button>
                    <button class="mock-btn secondary" type="button" data-cancel-exit-mock>No</button>
                </div>
            </section>
        `;
        document.body.appendChild(exitModal);

        exitModal.addEventListener("click", (event) => {
            if (event.target === exitModal || event.target.closest("[data-cancel-exit-mock]")) {
                closeExitModal();
                return;
            }

            if (event.target.closest("[data-confirm-exit-mock]")) {
                confirmExitMockExam();
            }
        });

        return exitModal;
    }

    function openExitModal() {
        ensureExitModal().classList.remove("hidden");
    }

    function closeExitModal() {
        if (exitModal) exitModal.classList.add("hidden");
    }

    function clearMatchingStorage(storage, matchers) {
        if (!storage) return;
        try {
            Object.keys(storage).forEach((key) => {
                if (matchers.some((matcher) => matcher(key))) {
                    storage.removeItem(key);
                }
            });
        } catch {}
    }

    function clearMockExamProgress() {
        const mockId = mockTest?.id || mockIdFromPath();
        const adapterIds = sections.map((section) => `mock-${section}-${mockId}`);
        const exactKeys = new Set([
            storageKey(),
            `ieltsx-mock-test:${mockId}:flow`
        ]);
        const containsValues = adapterIds.concat([
            `ieltsx-mock-test:${mockId}`
        ]);

        const matchers = [
            (key) => exactKeys.has(key),
            (key) => containsValues.some((value) => key.includes(value))
        ];

        clearMatchingStorage(localStorage, matchers);
        clearMatchingStorage(sessionStorage, matchers);
        activeIndex = 0;
        finishedSections = new Set();
        sectionPayloads = {
            listening: null,
            reading: null,
            writing: null,
            speaking: null
        };
    }

    async function confirmExitMockExam() {
        const button = exitModal?.querySelector("[data-confirm-exit-mock]");
        if (button) {
            button.disabled = true;
            button.textContent = "Cancelling...";
        }

        clearSpeakingPrepTimer();
        clearMockExamProgress();

        if (mockTest?.id) {
            await fetch(`/api/mock-tests/${encodeURIComponent(mockTest.id)}/progress`, {
                method: "DELETE",
                credentials: "include"
            }).catch(() => {});
        }

        window.location.href = "/mock-tests";
    }

    async function clearServerMockProgress() {
        if (!mockTest?.id) return;
        await fetch(`/api/mock-tests/${encodeURIComponent(mockTest.id)}/progress`, {
            method: "DELETE",
            credentials: "include"
        }).catch(() => {});
    }

    async function startMockTestFromIntro(button) {
        if (button) {
            button.disabled = true;
            button.textContent = "Starting...";
        }

        clearSpeakingPrepTimer();
        clearMockExamProgress();
        await clearServerMockProgress();
        activeIndex = 0;
        finishedSections = new Set();
        sectionPayloads = {
            listening: null,
            reading: null,
            writing: null,
            speaking: null
        };
        renderPlayer("listening");
    }

    function showFatalError(error) {
        clearSpeakingPrepTimer();
        document.body.classList.remove("mock-intro-active");
        root.innerHTML = `
            <main class="mock-start-wrap">
                <section class="mock-start-panel">
                    <h1>Mock test unavailable</h1>
                    <p>${escapeHtml(error.message || "Something went wrong.")}</p>
                    <a class="mock-btn" href="/mock-tests">Back to Mock Tests</a>
                </section>
            </main>
        `;
    }

    async function boot() {
        const response = await fetch(`/api/mock-tests/${encodeURIComponent(mockIdFromPath())}`, {
            credentials: "include",
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "Mock test not found");
        }

        mockTest = data;
        mockUserEmail = await loadMockUserEmail();
        renderStart();
    }

    root.addEventListener("click", (event) => {
        const startButton = event.target.closest("#startMockTest");
        if (startButton) {
            startMockTestFromIntro(startButton).catch(showFatalError);
        }

        if (event.target.closest("#continueSection")) {
            continueSection();
        }

        if (event.target.closest("#startSpeakingNow")) {
            startSpeakingSection();
        }

        if (event.target.closest("[data-exit-mock-exam]")) {
            openExitModal();
        }
    });

    window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data || {};
        if (data.type === "ieltsx-mock-exit-request") {
            openExitModal();
            return;
        }
        if (data.type !== "ieltsx-mock-section-complete") return;
        const section = String(data.section || "").toLowerCase();
        if (!sections.includes(section)) return;
        handleSectionComplete(section, data).catch(showFatalError);
    });

    boot().catch(showFatalError);
}());
