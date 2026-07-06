(function () {
    const root = document.getElementById("mockResultRoot");
    let activeResult = null;

    const ICONS = {
        user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
        id: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 9h5"></path><path d="M7 13h3"></path><circle cx="16.5" cy="12" r="2"></circle></svg>`,
        calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 11h18"></path><path d="M8 15h.01"></path><path d="M12 15h.01"></path><path d="M16 15h.01"></path></svg>`,
        headphones: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"></path><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`,
        book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H21"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H21v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path></svg>`,
        pen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>`,
        mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path></svg>`,
        dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.6"></rect><rect x="14" y="3" width="7" height="7" rx="1.6"></rect><rect x="3" y="14" width="7" height="7" rx="1.6"></rect><rect x="14" y="14" width="7" height="7" rx="1.6"></rect></svg>`,
        download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path></svg>`
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function pathParts() {
        return window.location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    }

    function resultIdFromPath() {
        const parts = pathParts();
        if (parts[0] === "mock-test-result") return parts[1] || "";
        return "";
    }

    function resultApiUrl() {
        const resultId = resultIdFromPath();
        if (resultId) return `/api/mock-test-results/${encodeURIComponent(resultId)}`;
        const parts = pathParts();
        return `/api/mock-tests/${encodeURIComponent(parts[1] || "")}/latest-result`;
    }

    function authUser() {
        try {
            return window.authClient?.getAuth?.()?.user || null;
        } catch {
            return null;
        }
    }

    function firstNonEmpty(...values) {
        return values
            .map((value) => String(value ?? "").trim())
            .find(Boolean) || "";
    }

    function candidateName(result) {
        const user = authUser();
        const composedName = [result.firstName, result.familyName].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
        return firstNonEmpty(
            result.fullName,
            composedName,
            result.name,
            user?.fullName,
            user?.name,
            user?.username,
            result.email,
            user?.email,
            "Candidate"
        );
    }

    function testTakerId(result) {
        const user = authUser();
        return firstNonEmpty(result.testTakerId, user?.testTakerId, user?.memberId, result.memberId, "Not assigned");
    }

    function formatBand(value) {
        const numeric = Number.parseFloat(value);
        if (!Number.isFinite(numeric)) return "0.0";
        return numeric.toFixed(1);
    }

    function formatTestDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Not available";
        return date.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric"
        });
    }

    function rawText(value) {
        return String(value ?? "").trim();
    }

    function hasValue(value) {
        return rawText(value) !== "";
    }

    function hasBandValue(value) {
        return value !== undefined && value !== null && rawText(value) !== "";
    }

    function fieldValue(value, fallback = "Not provided") {
        const text = rawText(value);
        return text || fallback;
    }

    function candidateNumber(result) {
        return firstNonEmpty(
            result.candidateNumber,
            result.candidateNo,
            result.candidateId,
            result.candidateID,
            result.registrationNumber
        );
    }

    function testCenter(result) {
        return firstNonEmpty(
            result.testCenter,
            result.testCentre,
            result.center,
            result.centre,
            result.testVenue,
            result.venue
        );
    }

    function cefrLevel(result) {
        return firstNonEmpty(result.cefrLevel, result.cefr, result.CEFR);
    }

    function scoreMeta(section) {
        const correct = Number(section?.correct);
        const total = Number(section?.total);
        if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) {
            return `${correct}/${total} correct`;
        }

        return firstNonEmpty(section?.status, section?.result?.status, "Band score");
    }

    function requireResultData(result) {
        if (!result || typeof result !== "object") {
            throw new Error("Result data is missing.");
        }

        const missing = [];
        if (!hasValue(result.id)) missing.push("result ID");
        if (!hasBandValue(result.overallBand)) missing.push("overall band");
        if (!hasBandValue(result.listening?.band)) missing.push("Listening score");
        if (!hasBandValue(result.reading?.band)) missing.push("Reading score");
        if (!hasBandValue(result.writing?.band)) missing.push("Writing score");
        if (!hasBandValue(result.speaking?.band)) missing.push("Speaking score");
        if (!hasValue(result.testDate || result.completedAt || result.createdAt)) missing.push("test date");

        if (missing.length) {
            throw new Error(`Cannot generate PDF. Missing ${missing.join(", ")}.`);
        }
    }

    function scoreCard(label, score, icon) {
        return `
            <article class="band-score-card">
                <div class="band-score-icon">${ICONS[icon]}</div>
                <div class="band-score-content">
                    <div class="band-score-label">${escapeHtml(label)}</div>
                    <div class="band-score-value">${formatBand(score)}</div>
                </div>
            </article>
        `;
    }

    function pdfDetail(label, value, options = {}) {
        if (options.optional && !hasValue(value)) return "";

        return `
            <div class="mock-pdf-detail">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(fieldValue(value))}</strong>
            </div>
        `;
    }

    function pdfScore(label, section, icon) {
        return `
            <article class="mock-pdf-score-card">
                <div class="mock-pdf-score-icon">${ICONS[icon]}</div>
                <span>${escapeHtml(label)}</span>
                <strong>${formatBand(section?.band)}</strong>
                <small>${escapeHtml(scoreMeta(section))}</small>
            </article>
        `;
    }

    function renderPdfCertificate(result) {
        const title = firstNonEmpty(result.title, result.testNumber ? `Mock Test ${result.testNumber}` : "", "Mock Test");
        const candidate = candidateName(result);
        const takerId = testTakerId(result);
        const number = candidateNumber(result);
        const center = testCenter(result);
        const testDate = formatTestDate(result.testDate || result.completedAt || result.createdAt);
        const generatedAt = formatTestDate(new Date().toISOString());
        const cefr = cefrLevel(result);
        const nationality = firstNonEmpty(result.nationality, result.countryOfNationality, result.countryOfOrigin);

        return `
            <article id="mockResultPdfCertificate" class="mock-result-pdf-certificate" data-result-id="${escapeHtml(result.id || "")}">
                <header class="mock-pdf-header">
                    <div class="mock-pdf-brand" aria-label="IELTSX">
                        <img src="/logo.png" alt="IELTSX.ORG">
                    </div>
                    <div class="mock-pdf-title">
                        <span>IELTSX Mock Test Result</span>
                        <h2>${escapeHtml(title)}</h2>
                    </div>
                </header>

                <section class="mock-pdf-hero">
                    <div>
                        <span class="mock-pdf-section-label">Candidate Details</span>
                        <h1>${escapeHtml(candidate)}</h1>
                        <p>This IELTSX mock test result is generated from the submitted test attempt and profile data.</p>
                    </div>
                    <aside class="mock-pdf-overall">
                        <span>Overall Band</span>
                        <strong>${formatBand(result.overallBand)}</strong>
                        <small>${escapeHtml(cefr ? `CEFR ${cefr}` : "CEFR not available")}</small>
                    </aside>
                </section>

                <section class="mock-pdf-detail-grid" aria-label="Candidate and test information">
                    ${pdfDetail("Candidate / Test Taker", candidate)}
                    ${pdfDetail("Test Taker ID", takerId)}
                    ${pdfDetail("Candidate Number", number, { optional: true })}
                    ${pdfDetail("Test Date", testDate)}
                    ${pdfDetail("Test Center", center, { optional: true })}
                    ${pdfDetail("CEFR Level", cefr, { optional: true })}
                    ${pdfDetail("Email", result.email, { optional: true })}
                    ${pdfDetail("Date of Birth", result.dateOfBirth, { optional: true })}
                    ${pdfDetail("Candidate Type", result.candidateType, { optional: true })}
                    ${pdfDetail("Nationality / Country", nationality, { optional: true })}
                    ${pdfDetail("First Language", result.firstLanguage, { optional: true })}
                    ${pdfDetail("Result ID", result.id)}
                </section>

                <section class="mock-pdf-scores" aria-label="Band scores">
                    ${pdfScore("Listening", result.listening, "headphones")}
                    ${pdfScore("Reading", result.reading, "book")}
                    ${pdfScore("Writing", result.writing, "pen")}
                    ${pdfScore("Speaking", result.speaking, "mic")}
                </section>

                <section class="mock-pdf-summary">
                    <div>
                        <span>Overall Band Score</span>
                        <strong>${formatBand(result.overallBand)}</strong>
                    </div>
                    <div>
                        <span>Completed Sections</span>
                        <strong>${escapeHtml(Array.isArray(result.completedSections) && result.completedSections.length ? result.completedSections.join(", ") : "Listening, Reading, Writing, Speaking")}</strong>
                    </div>
                    <div>
                        <span>Generated On</span>
                        <strong>${escapeHtml(generatedAt)}</strong>
                    </div>
                </section>

                <section class="mock-pdf-note">
                    <strong>Important note</strong>
                    <p>This is an IELTSX Mock Test result. It is not an official IELTS Test Report Form. This result is for practice and self-assessment purposes only.</p>
                </section>

                <footer class="mock-pdf-footer">
                    <span>www.ieltsx.org</span>
                    <span>support@ieltsx.org</span>
                    <span>IELTSX-Mock-Test-Result.pdf</span>
                </footer>
            </article>
        `;
    }

    function render(result) {
        activeResult = result;
        const title = firstNonEmpty(result.title, result.testNumber ? `Mock Test ${result.testNumber}` : "", "Mock Test");
        const candidate = candidateName(result);
        const takerId = testTakerId(result);
        const testDate = formatTestDate(result.testDate || result.completedAt || result.createdAt);

        root.innerHTML = `
            <section class="mock-result-panel" aria-labelledby="mockResultTitle">
                <div class="mock-result-hero">
                    <div class="mock-result-main">
                        <span class="mock-result-eyebrow">IELTSX MOCK TEST RESULT</span>
                        <h1 id="mockResultTitle">${escapeHtml(title)}</h1>

                        <div class="mock-candidate-panel" aria-label="Candidate information">
                            <div class="mock-info-item">
                                <span class="mock-info-icon">${ICONS.user}</span>
                                <span class="mock-info-copy">
                                    <span>Candidate</span>
                                    <strong>${escapeHtml(candidate)}</strong>
                                </span>
                            </div>
                            <div class="mock-info-item">
                                <span class="mock-info-icon">${ICONS.id}</span>
                                <span class="mock-info-copy">
                                    <span>Test Taker ID</span>
                                    <strong>${escapeHtml(takerId)}</strong>
                                </span>
                            </div>
                            <div class="mock-info-item">
                                <span class="mock-info-icon">${ICONS.calendar}</span>
                                <span class="mock-info-copy">
                                    <span>Test Date</span>
                                    <strong>${escapeHtml(testDate)}</strong>
                                </span>
                            </div>
                        </div>
                    </div>

                    <aside class="overall-band-card" aria-label="Overall band">
                        <span class="mock-overall-label">OVERALL BAND</span>
                        <strong class="mock-overall-score">${formatBand(result.overallBand)}</strong>
                        <span class="mock-overall-caption">Mock Test Score</span>
                    </aside>
                </div>

                <div class="mock-result-divider" aria-hidden="true"></div>

                <div class="band-score-grid" aria-label="Section band scores">
                    ${scoreCard("Listening Band", result.listening?.band, "headphones")}
                    ${scoreCard("Reading Band", result.reading?.band, "book")}
                    ${scoreCard("Writing Band", result.writing?.band, "pen")}
                    ${scoreCard("Speaking Band", result.speaking?.band, "mic")}
                </div>

                <div class="mock-result-divider" aria-hidden="true"></div>

                <div class="mock-result-actions">
                    <a class="mock-result-button mock-result-button--secondary" href="/mock-tests">
                        <span>${ICONS.dashboard}</span>
                        Dashboard
                    </a>
                    <button class="mock-result-button mock-result-button--primary" type="button" id="downloadResultBtn">
                        <span>${ICONS.download}</span>
                        Download Result
                    </button>
                </div>
            </section>

            <div id="mockResultPdfMount" class="mock-result-pdf-mount" aria-hidden="true">
                ${renderPdfCertificate(result)}
            </div>
        `;

        document.getElementById("downloadResultBtn")?.addEventListener("click", () => {
            downloadResultPdf(activeResult);
        });
    }

    function nextFrame() {
        return new Promise((resolve) => {
            window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
        });
    }

    async function waitForResultRender() {
        if (document.fonts?.ready) {
            await document.fonts.ready.catch(() => {});
        }
        const element = getPdfElement();
        const images = Array.from(element?.querySelectorAll("img") || []);
        await Promise.all(images.map((image) => {
            if (image.complete && image.naturalWidth > 0) return Promise.resolve();
            return new Promise((resolve, reject) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", () => reject(new Error(`Could not load PDF image: ${image.getAttribute("src") || "unknown"}`)), { once: true });
            });
        }));
        await nextFrame();
    }

    function ensurePdfLibraries() {
        if (typeof window.html2canvas !== "function") {
            throw new Error("PDF renderer is not ready. html2canvas did not load.");
        }
        if (!window.jspdf?.jsPDF) {
            throw new Error("PDF renderer is not ready. jsPDF did not load.");
        }
    }

    function getPdfElement() {
        return document.getElementById("mockResultPdfCertificate");
    }

    function validatePdfElement(element) {
        console.log("[Mock Result PDF] PDF element found:", Boolean(element));

        if (!element) {
            throw new Error("Cannot generate PDF. The PDF result container was not found.");
        }

        const style = window.getComputedStyle(element);
        if (style.display === "none") {
            throw new Error("Cannot generate PDF. The PDF result container is not rendered.");
        }

        const rect = element.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        console.log("[Mock Result PDF] Element dimensions:", JSON.stringify({ width, height }));

        if (width <= 0 || height <= 0) {
            throw new Error("Cannot generate PDF. The PDF result container has no visible size.");
        }

        return { width, height };
    }

    async function capturePdfCanvas(element, dimensions) {
        const canvas = await window.html2canvas(element, {
            backgroundColor: "#ffffff",
            scale: Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2),
            useCORS: true,
            allowTaint: false,
            logging: false,
            width: dimensions.width,
            height: dimensions.height,
            windowWidth: dimensions.width,
            windowHeight: dimensions.height,
            scrollX: 0,
            scrollY: 0
        });

        console.log("[Mock Result PDF] Canvas dimensions:", JSON.stringify({
            width: canvas?.width || 0,
            height: canvas?.height || 0
        }));

        if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
            throw new Error("Cannot generate PDF. The rendered canvas is empty.");
        }

        return canvas;
    }

    async function saveCanvasAsPdf(canvas) {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imageData = canvas.toDataURL("image/png", 1.0);

        if (!imageData || imageData.length < 1000) {
            throw new Error("Cannot generate PDF. The rendered image data is empty.");
        }

        const imageHeight = (canvas.height * pageWidth) / canvas.width;
        let remainingHeight = imageHeight;
        let position = 0;

        pdf.addImage(imageData, "PNG", 0, position, pageWidth, imageHeight, undefined, "FAST");
        remainingHeight -= pageHeight;

        while (remainingHeight > 0) {
            position = remainingHeight - imageHeight;
            pdf.addPage();
            pdf.addImage(imageData, "PNG", 0, position, pageWidth, imageHeight, undefined, "FAST");
            remainingHeight -= pageHeight;
        }

        await Promise.resolve(pdf.save("IELTSX-Mock-Test-Result.pdf"));
        console.log("[Mock Result PDF] Save requested: IELTSX-Mock-Test-Result.pdf");
    }

    async function downloadResultPdf(result) {
        const resultForPdf = result || activeResult;

        const button = document.getElementById("downloadResultBtn");
        const originalHtml = button?.innerHTML || "";
        if (button) {
            button.disabled = true;
            button.classList.add("is-loading");
            button.innerHTML = `<span>${ICONS.download}</span>Preparing PDF`;
        }

        try {
            console.log("[Mock Result PDF] Result data before generation:", resultForPdf);
            requireResultData(resultForPdf);
            ensurePdfLibraries();
            await waitForResultRender();

            const element = getPdfElement();
            const dimensions = validatePdfElement(element);
            const canvas = await capturePdfCanvas(element, dimensions);
            await saveCanvasAsPdf(canvas);
        } catch (error) {
            console.error("Failed to download mock result PDF:", error);
            window.alert(error.message || "Could not generate PDF");
        } finally {
            if (button) {
                button.disabled = false;
                button.classList.remove("is-loading");
                button.innerHTML = originalHtml;
            }
        }
    }

    async function boot() {
        const response = await fetch(resultApiUrl(), {
            credentials: "include",
            cache: "no-store"
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "No result found");
        }

        render(data.result || {});
    }

    boot().catch((error) => {
        root.innerHTML = `
            <section class="mock-result-panel mock-result-state">
                <span class="mock-result-eyebrow">IELTSX MOCK TEST RESULT</span>
                <h1>No mock result found</h1>
                <p>${escapeHtml(error.message)}</p>
                <a class="mock-result-button mock-result-button--secondary" href="/mock-tests">
                    <span>${ICONS.dashboard}</span>
                    Dashboard
                </a>
            </section>
        `;
    });
}());
