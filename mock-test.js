(function () {
    const root = document.getElementById("mockPlayerRoot");
    const sections = ["listening", "reading", "writing", "speaking"];
    const mockTransitions = {
        listening: "reading",
        reading: "writing",
        writing: "break_before_speaking",
        break_before_speaking: "speaking",
        speaking: "completed"
    };
    const sectionStatuses = new Set(sections);
    const sectionLabels = {
        listening: "Listening",
        reading: "Reading",
        writing: "Writing",
        speaking: "Speaking"
    };
    const missingDataMessage = "Mock test data not found. Please add Listening, Reading, Writing and Speaking sections in admin panel.";
    const speakingPrepSeconds = 15 * 60;
    const loadingTimeoutMs = 10000;

    let mockTest = null;
    let loading = false;
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
    let mockStatus = "not_started";
    let exitModal = null;
    let sectionLoadTimer = null;
    let mockWritingEvaluationController = null;
    let mockUserProfile = {
        name: "Xurshidbek",
        testTakerId: "001"
    };

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function cleanId(value) {
        const resolved = decodeURIComponent(String(value || "")).trim();
        return resolved === "undefined" || resolved === "null" ? "" : resolved;
    }

    function mockIdFromPath() {
        const parts = window.location.pathname.split("/").filter(Boolean);
        const pathId = parts[0] === "mock-test" ? parts[1] || "" : "";
        const params = new URLSearchParams(window.location.search);
        return cleanId(pathId)
            || cleanId(params.get("mockTestId"))
            || cleanId(params.get("testId"))
            || cleanId(params.get("mockId"))
            || cleanId(params.get("id"));
    }

    function shouldShowIntroFirst() {
        const params = new URLSearchParams(window.location.search);
        return params.get("intro") === "1" || params.has("intro");
    }

    function storageKey() {
        return `ieltsx-mock-test:${mockTest?.id || mockIdFromPath() || "latest"}:flow`;
    }

    function saveLocal() {
        try {
            localStorage.setItem(storageKey(), JSON.stringify({
                activeIndex,
                mockStatus,
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
            if (isValidMockStatus(parsed.mockStatus)) {
                mockStatus = parsed.mockStatus;
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

    function isValidMockStatus(value) {
        return ["loading", "ready", "listening", "reading", "writing", "break_before_speaking", "speaking", "completed", "error"].includes(String(value || ""));
    }

    function setMockStatus(status) {
        mockStatus = isValidMockStatus(status) ? status : "loading";
        if (sectionStatuses.has(mockStatus)) {
            activeIndex = sections.indexOf(mockStatus);
        }
        saveLocal();
    }

    function sectionObjectId(value) {
        if (!value) return "";
        if (typeof value === "string") return cleanId(value);
        if (typeof value !== "object") return "";
        return cleanId(value.testId || value.id || value._id || value.sourceTestId || value.fullTestId);
    }

    function sectionFromArray(test, section) {
        const list = Array.isArray(test?.sections) ? test.sections : [];
        return list.find((item) => {
            const key = String(item?.section || item?.skill || item?.type || item?.name || "").toLowerCase();
            return key === section || key === `${section}-full` || key === `full-${section}`;
        });
    }

    function sectionTestId(test, section) {
        return cleanId(test?.[`${section}TestId`])
            || sectionObjectId(test?.sections?.[section])
            || sectionObjectId(sectionFromArray(test, section))
            || sectionObjectId(test?.[section]);
    }

    function normalizeMockTestPayload(payload) {
        const raw = payload?.test || payload?.mockTest || payload;
        if (!raw || typeof raw !== "object") return raw;

        const normalized = {
            ...raw,
            id: cleanId(raw.id || raw._id || raw.mockTestId || raw.testId)
        };

        sections.forEach((section) => {
            normalized[`${section}TestId`] = sectionTestId(normalized, section);
        });

        return normalized;
    }

    function sectionDiagnostics(test) {
        const availableSections = sections.filter((section) => sectionTestId(test, section));
        const missingSections = sections.filter((section) => !sectionTestId(test, section));

        return { availableSections, missingSections };
    }

    function formatSectionList(list) {
        const labels = list.map((section) => sectionLabels[section] || section);
        if (labels.length <= 1) return labels.join("");
        if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
        return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    }

    function validateMockSetup(test) {
        if (!test || typeof test !== "object") {
            throw new Error(missingDataMessage);
        }

        const diagnostics = sectionDiagnostics(test);

        if (diagnostics.missingSections.length) {
            const missing = formatSectionList(diagnostics.missingSections);
            throw new Error(`${missingDataMessage} Missing sections: ${missing}.`);
        }

        return diagnostics;
    }

    function compactText(value) {
        return String(value || "").trim();
    }

    function profileName(user = {}) {
        const name = compactText(user.name || user.fullName || user.displayName || user.username || mockTest?.candidateName);
        if (name) return name;

        const email = compactText(user.email);
        return email ? email.split("@")[0] : "Xurshidbek";
    }

    function profileTestTakerId(user = {}) {
        return compactText(
            user.memberId ||
            user.testTakerId ||
            user.candidateId ||
            user.studentId ||
            mockTest?.testTakerId ||
            mockTest?.candidateId
        ) || "001";
    }

    function storedAuthUser() {
        return window.authClient?.getAuthState?.()?.user || window.authClient?.getAuth?.()?.user || null;
    }

    async function loadMockUserProfile() {
        const storedUser = storedAuthUser();
        if (storedUser) {
            return {
                name: profileName(storedUser),
                testTakerId: profileTestTakerId(storedUser)
            };
        }

        try {
            const response = await fetch("/api/auth/me", {
                credentials: "include",
                cache: "no-store"
            });
            const data = await response.json().catch(() => ({}));
            const user = data?.user || {};
            return {
                name: profileName(user),
                testTakerId: profileTestTakerId(user)
            };
        } catch {
            return {
                name: "Xurshidbek",
                testTakerId: "001"
            };
        }
    }

    function renderIntroHeader() {
        return `
            <header class="mock-intro-header">
                <div class="mock-intro-brand">
                    <img src="/IELTS-logo.png" alt="IELTS">
                </div>
                <strong class="mock-intro-candidate">${escapeHtml(mockUserProfile.name)}</strong>
                <span class="mock-intro-taker-id">Test taker ID: ${escapeHtml(mockUserProfile.testTakerId)}</span>
            </header>
        `;
    }

    function playerSource(section) {
        const mockId = cleanId(mockTest?.id || mockIdFromPath());
        if (!mockId) {
            throw new Error("Mock test id is missing. Please open the test from Mock Test Home.");
        }

        const params = new URLSearchParams({
            mockMode: "1",
            mockTestId: mockId,
            testId: mockId,
            mockSection: section
        });
        const sourceTestId = sectionTestId(mockTest, section);
        if (sourceTestId) {
            params.set("sourceTestId", sourceTestId);
        }

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

        params.set("mode", "exam");
        params.set("id", `mock-speaking-${mockId}`);
        params.set("speakingTestId", `mock-speaking-${mockId}`);
        return `/speaking/player?${params.toString()}`;
    }

    function renderLoading(message = "Loading mock test instructions...") {
        document.body.classList.add("mock-intro-active");
        root.innerHTML = `
            ${renderIntroHeader()}
            <main class="mock-intro-wrap">
                <section class="mock-intro-card">
                    <div class="mock-intro-section">
                        <h1>IELTS Mock Test</h1>
                        <p>${escapeHtml(message)}</p>
                    </div>
                </section>
            </main>
        `;
    }

    function clearSectionLoadTimer() {
        if (sectionLoadTimer) clearTimeout(sectionLoadTimer);
        sectionLoadTimer = null;
    }

    function startSectionLoadTimer(section) {
        clearSectionLoadTimer();
        sectionLoadTimer = setTimeout(() => {
            showFatalError(new Error(`${sectionLabels[section] || "Mock test"} could not be loaded. Please check test data or try again.`));
        }, loadingTimeoutMs);
    }

    function setLoading(value, message) {
        loading = Boolean(value);
        if (loading) {
            mockStatus = "loading";
            renderLoading(message);
        }
    }

    function renderEmpty(message) {
        clearSpeakingPrepTimer();
        clearSectionLoadTimer();
        setMockStatus("error");
        document.body.classList.remove("mock-intro-active");
        root.innerHTML = `
            <main class="mock-start-wrap">
                <section class="mock-start-panel">
                    <h1>No active mock test</h1>
                    <p>${escapeHtml(message || missingDataMessage)}</p>
                    <button class="mock-btn" type="button" data-retry-mock-test>Retry</button>
                    <a class="mock-btn secondary" href="/dashboard">Dashboard</a>
                </section>
            </main>
        `;
    }

    function renderStart() {
        clearSpeakingPrepTimer();
        document.body.classList.add("mock-intro-active");
        root.innerHTML = `
            ${renderIntroHeader()}
            <main class="mock-intro-wrap">
                <section class="mock-intro-card" aria-labelledby="mockIntroTitle">
                    <div class="mock-intro-section">
                        <h1 id="mockIntroTitle">IELTS Mock Test</h1>
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
                        <button id="startMockTest" class="mock-intro-primary" type="button">Start Mock Test</button>
                        <a class="mock-intro-secondary" href="/mock-tests">Back to Mock Tests</a>
                    </div>
                </section>
            </main>
        `;
    }

    function renderPlayer(section) {
        clearSpeakingPrepTimer();
        clearSectionLoadTimer();
        document.body.classList.remove("mock-intro-active");
        setMockStatus(section);
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
            </main>
        `;
        startSectionLoadTimer(section);
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
                timeSpent: Number(data.timeSpent) || 0,
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

    async function handleSectionComplete(section, data) {
        if (isFinalSubmitRunning) return;
        if (finishedSections.has(section)) return;
        if (section !== currentSection()) return;

        clearSectionLoadTimer();
        const payload = normalizeSectionPayload(section, data || {});
        sectionPayloads[section] = payload;
        finishedSections.add(section);
        saveLocal();
        await saveSectionProgress(section, payload);

        goToNextSection(section);
    }

    function goToNextSection(current) {
        const next = mockTransitions[current];

        if (next === "reading" || next === "writing" || next === "speaking") {
            renderPlayer(next);
            return;
        }

        if (next === "break_before_speaking") {
            renderSpeakingPreparation();
            return;
        }

        if (next === "completed") {
            setMockStatus("completed");
            submitMockTest().catch(showFatalError);
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
        clearSectionLoadTimer();
        document.body.classList.remove("mock-intro-active");
        setMockStatus("break_before_speaking");
        speakingPrepLeft = speakingPrepSeconds;
        activeIndex = sections.indexOf("speaking");
        saveLocal();

        root.innerHTML = `
            <main class="mock-prep-wrap">
                <section class="mock-prep-panel">
                    <span>Before Speaking</span>
                    <h1>Break before Speaking</h1>
                    <p>Your Speaking test will start automatically after the break.</p>
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

    function startSpeakingSection() {
        clearSpeakingPrepTimer();
        goToNextSection("break_before_speaking");
    }

    async function enterMockFullscreen() {
        if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
        await document.documentElement.requestFullscreen();
    }

    async function exitMockFullscreen() {
        try {
            if (document.fullscreenElement && document.exitFullscreen) {
                await document.exitFullscreen();
            }
        } catch {}
    }

    async function submitMockTest() {
        if (isFinalSubmitRunning) return;
        isFinalSubmitRunning = true;
        setLoading(true, "Preparing your final result...");

        try {
            try {
                await evaluateWritingForFinalSubmit();
            } catch (error) {
                console.warn("[Full Mock Test] Writing evaluation failed:", error?.name || "Error");
                throw new Error("We could not complete the assessment. Your essay has been saved. Please try again.");
            }

            const response = await fetch(`/api/mock-tests/${encodeURIComponent(mockTest.id)}/submit`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sections: sectionPayloads,
                    completedAt: new Date().toISOString()
                })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not submit mock test");
            }

            localStorage.removeItem(storageKey());
            await exitMockFullscreen();

            if (data.result?.id) {
                window.location.href = `/mock-test-result/${encodeURIComponent(data.result.id)}`;
                return;
            }

            renderMockResult(data.result || {});
        } finally {
            isFinalSubmitRunning = false;
            setLoading(false);
        }
    }

    function renderMockResult(result) {
        document.body.classList.add("mock-intro-active");
        
        function formatBand(value) {
            return Number(value || 0).toFixed(1);
        }

        root.innerHTML = `
            <main class="mock-intro-wrap">
                <section class="mock-result-panel" style="width: 100%; max-width: 800px; background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                    <div class="mock-result-head" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eef2f6; padding-bottom: 20px; margin-bottom: 30px;">
                        <div>
                            <span class="test-list-eyebrow" style="color: #64748b; font-size: 14px; font-weight: 600; text-transform: uppercase;">IELTSX Mock Test Result</span>
                            <h1 style="font-size: 28px; margin: 8px 0 0 0; color: #0f172a;">${escapeHtml(result.title || mockTest?.title || "Mock Test")}</h1>
                        </div>
                        <div class="mock-band-badge" style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 24px; border-radius: 8px; text-align: center;">
                            <span style="display: block; font-size: 12px; color: #1e3a8a; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Overall Band</span>
                            <strong style="display: block; font-size: 32px; color: #2563eb; font-weight: 800; line-height: 1;">${formatBand(result.overallBand)}</strong>
                        </div>
                    </div>

                    <div class="mock-result-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px;">
                        <article class="mock-result-card" style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; text-align: center; background: #fff;">
                            <span style="display: block; font-size: 14px; color: #64748b; margin-bottom: 8px;">Listening band</span>
                            <strong style="font-size: 24px; color: #0f172a;">${formatBand(result.listening?.band)}</strong>
                        </article>
                        <article class="mock-result-card" style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; text-align: center; background: #fff;">
                            <span style="display: block; font-size: 14px; color: #64748b; margin-bottom: 8px;">Reading band</span>
                            <strong style="font-size: 24px; color: #0f172a;">${formatBand(result.reading?.band)}</strong>
                        </article>
                        <article class="mock-result-card" style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; text-align: center; background: #fff;">
                            <span style="display: block; font-size: 14px; color: #64748b; margin-bottom: 8px;">Writing band</span>
                            <strong style="font-size: 24px; color: #0f172a;">${formatBand(result.writing?.band)}</strong>
                        </article>
                        <article class="mock-result-card" style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; text-align: center; background: #fff;">
                            <span style="display: block; font-size: 14px; color: #64748b; margin-bottom: 8px;">Speaking band</span>
                            <strong style="font-size: 24px; color: #0f172a;">${formatBand(result.speaking?.band)}</strong>
                        </article>
                    </div>

                    <div class="mock-result-actions" style="display: flex; justify-content: center; border-top: 1px solid #eef2f6; padding-top: 30px;">
                        <button id="exitResultMock" class="mock-intro-primary" type="button" style="padding: 12px 32px; font-size: 16px; cursor: pointer; border: none; border-radius: 6px; background: #2563eb; color: #fff; font-weight: 600;">Back to Dashboard</button>
                    </div>
                </section>
            </main>
        `;
    }

    async function evaluateWritingForFinalSubmit() {
        const writingPayload = sectionPayloads.writing || {};
        const answers = writingPayload.answers || {};
        const task1Response = String(answers.task1 || "").trim();
        const task2Response = String(answers.task2 || "").trim();

        if (Number(writingPayload.band) > 0 || Number(writingPayload.result?.overallBand) > 0) return;
        if (!task1Response || !task2Response) return;

        mockWritingEvaluationController = new AbortController();
        let response;
        try {
            response = await fetch("/api/writing/evaluate-full", {
                method: "POST",
                credentials: "include",
                signal: mockWritingEvaluationController.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    evaluationRequestId: window.crypto?.randomUUID?.()
                        || `writing_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    fullTestId: `mock-writing-${mockTest.id}`,
                    task1Response,
                    task2Response,
                    testType: "academic-writing-full",
                    timeSpent: Number(writingPayload.timeSpent) || 0
                })
            });
        } finally {
            mockWritingEvaluationController = null;
        }
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

    window.addEventListener("beforeunload", () => mockWritingEvaluationController?.abort());

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
        mockStatus = "not_started";
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
        await exitMockFullscreen();
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

        await enterMockFullscreen().catch((error) => {
            console.warn("[Full Mock Test] Fullscreen request failed:", error.message);
        });

        clearSpeakingPrepTimer();
        clearMockExamProgress();
        clearServerMockProgress().catch(() => {});
        
        activeIndex = 0;
        setMockStatus("listening");
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
        console.error("[Full Mock Test] load error:", error);
        clearSpeakingPrepTimer();
        clearSectionLoadTimer();
        setMockStatus("error");
        document.body.classList.remove("mock-intro-active");
        root.innerHTML = `
            <main class="mock-start-wrap">
                <section class="mock-start-panel">
                    <h1>Mock test unavailable</h1>
                    <p>${escapeHtml(error.message || "Mock test could not be loaded.")}</p>
                    <button class="mock-btn" type="button" data-retry-mock-test>Retry</button>
                    <a class="mock-btn secondary" href="/dashboard">Dashboard</a>
                </section>
            </main>
        `;
    }

    async function fetchMockTest(signal) {
        const mockId = mockIdFromPath();
        const endpoint = mockId
            ? `/api/mock-tests/${encodeURIComponent(mockId)}`
            : "/api/mock-tests/latest";

        console.log("[Full Mock Test] mockId", mockId || "(latest active)");

        const response = await fetch(endpoint, {
            credentials: "include",
            cache: "no-store",
            signal
        });
        const data = await response.json().catch(() => ({}));
        const fetchedTest = normalizeMockTestPayload(data);
        const diagnostics = sectionDiagnostics(fetchedTest);

        console.log("[Full Mock Test] fetched mock test data", fetchedTest);
        console.log("[Full Mock Test] available sections", diagnostics.availableSections);
        console.log("[Full Mock Test] missing sections", diagnostics.missingSections);

        if (!response.ok) {
            if (data?.error === "premium_required" || data?.code === "PREMIUM_REQUIRED") {
                sessionStorage.setItem("premiumReturnPath", window.location.pathname + window.location.search);
                window.location.href = `/premium-locked.html?type=mock&return=${encodeURIComponent(window.location.pathname + window.location.search)}`;
                return new Promise(() => {});
            }
            const error = new Error(data.error || missingDataMessage);
            error.statusCode = response.status;
            throw error;
        }

        return fetchedTest;
    }

    async function boot() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        setLoading(true, "Loading mock test instructions...");

        try {
            mockTest = await fetchMockTest(controller.signal);
            validateMockSetup(mockTest);

            loadLocal();
            mockUserProfile = await loadMockUserProfile();

            if (shouldShowIntroFirst()) {
                activeIndex = 0;
                setMockStatus("ready");
                renderStart();
                return;
            }

            if (mockStatus === "break_before_speaking") {
                renderSpeakingPreparation();
                return;
            }

            if (sectionStatuses.has(mockStatus) && !finishedSections.has(mockStatus)) {
                renderPlayer(mockStatus);
                return;
            }

            setMockStatus("ready");
            renderStart();
        } catch (error) {
            console.error("[Full Mock Test] boot failed:", error);
            const message = error.name === "AbortError"
                ? "Mock test could not be loaded. Please check test data or try again."
                : error.message;

            if (error.statusCode === 404 && !mockIdFromPath()) {
                renderEmpty(message);
            } else {
                showFatalError(new Error(message));
            }
        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
        }
    }

    root.addEventListener("click", (event) => {
        const startButton = event.target.closest("#startMockTest");
        if (startButton) {
            startMockTestFromIntro(startButton).catch(showFatalError);
        }

        if (event.target.closest("[data-retry-mock-test]")) {
            window.location.reload();
            return;
        }

        if (event.target.closest("#startSpeakingNow")) {
            startSpeakingSection();
        }

        if (event.target.closest("[data-exit-mock-exam]")) {
            openExitModal();
        }

        if (event.target.closest("#exitResultMock")) {
            exitMockFullscreen().then(() => {
                window.location.href = "/dashboard";
            });
        }
    });

    window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data || {};
        if (data.type === "ieltsx-mock-exit-request") {
            openExitModal();
            return;
        }
        if (data.type === "ieltsx-mock-section-ready") {
            const section = String(data.section || "").toLowerCase();
            if (section === currentSection()) clearSectionLoadTimer();
            return;
        }
        if (data.type === "ieltsx-mock-section-error") {
            const section = String(data.section || currentSection()).toLowerCase();
            const label = sectionLabels[section] || "Mock test";
            showFatalError(new Error(data.message || `${label} could not be loaded.`));
            return;
        }
        if (data.type !== "ieltsx-mock-section-complete") return;
        const section = String(data.section || "").toLowerCase();
        if (!sections.includes(section)) return;
        handleSectionComplete(section, data).catch(showFatalError);
    });

    boot().catch(showFatalError);
}());
