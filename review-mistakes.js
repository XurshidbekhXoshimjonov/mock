(() => {
    const list = document.getElementById("mistakesList");
    const status = document.getElementById("mistakesStatus");
    const sort = document.getElementById("mistakeSort");
    const modal = document.getElementById("deleteMistakeModal");
    const confirmDelete = document.getElementById("confirmDeleteMistake");
    const initialSkill = new URLSearchParams(location.search).get("skill");
    let activeFilter = ["listening", "reading"].includes(initialSkill) ? initialSkill : "all";
    let deleteId = "";
    const sharedAudio = new Audio();
    let activeAudioCard = null;
    let evidenceEnd = null;
    let lastFocusedBeforeModal = null;
    const focusableSelector = [
        "button:not([disabled])",
        "a[href]",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", {
            day: "2-digit", month: "short", year: "numeric"
        });
    }

    function answerText(value) {
        if (Array.isArray(value)) return value.join(", ");
        return String(value ?? "").trim() || "No answer";
    }

    function optionValue(option) {
        return String(option?.value ?? option?.letter ?? option?.label ?? option?.text ?? option ?? "").trim();
    }

    function optionLabel(option) {
        return String(option?.label ?? option?.text ?? option?.value ?? option?.letter ?? option ?? "").trim();
    }

    function answerTextForItem(item, value) {
        const raw = answerText(value);
        if (!/matching.?headings/i.test(item.questionType || "")) return raw;
        const match = (item.options || []).find((option) => (
            optionValue(option).toLocaleLowerCase() === String(value ?? "").trim().toLocaleLowerCase()
        ));
        const label = match ? optionLabel(match) : "";
        if (!label || label.toLocaleLowerCase() === raw.toLocaleLowerCase()) return raw;
        if (label.toLocaleLowerCase().startsWith(raw.toLocaleLowerCase())) return label;
        return `${raw} — ${label}`;
    }

    function readingEvidence(item) {
        const rawContext = String(item.context || "").trim();
        const headingMatch = String(item.questionText || "").match(/\b(?:paragraph|section)\s+([A-Z])\b/i);
        if (/matching.?headings/i.test(item.questionType || "") && rawContext && headingMatch) {
            const target = headingMatch[1].toUpperCase();
            const paragraphs = rawContext.split(/\n\s*\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
            let paragraph = paragraphs.find((candidate) => (
                new RegExp(`^(?:paragraph\\s+)?${target}(?=\\s|[A-Z])`, "i").test(candidate)
            ));

            if (!paragraph) {
                const next = String.fromCharCode(target.charCodeAt(0) + 1);
                const match = rawContext.match(new RegExp(
                    `(?:^|\\n)\\s*((?:paragraph\\s+)?${target}(?=\\s|[A-Z])[\\s\\S]*?)(?=\\n\\s*(?:paragraph\\s+)?${next}(?=\\s|[A-Z])|$)`,
                    "i"
                ));
                paragraph = match?.[1]?.trim() || "";
            }

            if (paragraph) {
                const marker = paragraph.match(new RegExp(`^(?:paragraph\\s+)?${target}`, "i"))?.[0] || target;
                return {
                    html: `<mark>${escapeHtml(marker)}</mark>${escapeHtml(paragraph.slice(marker.length))}`,
                    exact: true,
                    label: `PARAGRAPH ${target} — MATCHING HEADING EVIDENCE`
                };
            }
        }

        const context = rawContext.replace(/\s+/g, " ").trim();
        if (!context) return null;

        const candidates = [
            ...(Array.isArray(item.acceptedAnswers) ? item.acceptedAnswers : []),
            ...(Array.isArray(item.correctAnswer) ? item.correctAnswer : [item.correctAnswer])
        ]
            .map((answer) => String(answer || "").trim())
            .filter((answer) => answer.length > 1)
            .sort((a, b) => b.length - a.length);
        const lowerContext = context.toLocaleLowerCase();
        const match = candidates
            .map((answer) => ({ answer, index: lowerContext.indexOf(answer.toLocaleLowerCase()) }))
            .find((entry) => entry.index >= 0);

        if (!match) {
            const correctValues = candidates.map((value) => value.toLocaleLowerCase());
            const selectedOption = (Array.isArray(item.options) ? item.options : [])
                .map((option) => ({
                    value: String(option?.value ?? option?.letter ?? option ?? "").trim(),
                    label: String(option?.label ?? option?.text ?? option ?? "").trim()
                }))
                .find((option) => {
                    const value = option.value.toLocaleLowerCase();
                    return correctValues.some((correct) => (
                        value === correct ||
                        value.startsWith(`${correct} `) ||
                        value.startsWith(`${correct} —`) ||
                        value.startsWith(`${correct} –`) ||
                        value.startsWith(`${correct}:`) ||
                        value.startsWith(`${correct} -`)
                    ));
                });
            const stopWords = new Set([
                "about", "after", "again", "answer", "before", "below", "between", "choose",
                "correct", "could", "does", "during", "following", "given", "have", "information",
                "into", "mentioned", "most", "only", "other", "passage", "question", "should",
                "statement", "that", "their", "there", "these", "they", "this", "which", "with",
                "would", "write"
            ]);
            const query = `${item.questionText || ""} ${selectedOption?.label || ""}`.toLocaleLowerCase();
            const keywords = [...new Set(query.match(/[a-z0-9]{4,}/g) || [])]
                .filter((word) => !stopWords.has(word));
            const sentences = context.match(/[^.!?]+(?:[.!?]+|$)/g) || [context];
            const ranked = sentences
                .map((sentence, index) => {
                    const normalized = sentence.toLocaleLowerCase();
                    const matched = keywords.filter((word) => normalized.includes(word));
                    return { sentence: sentence.trim(), index, matched, score: matched.length };
                })
                .sort((a, b) => b.score - a.score || b.matched.join("").length - a.matched.join("").length);
            const best = ranked[0];
            if (best?.score >= 2) {
                const from = Math.max(0, best.index - 1);
                const to = Math.min(sentences.length, best.index + 2);
                const excerpt = sentences.slice(from, to).join(" ").trim();
                const terms = best.matched
                    .sort((a, b) => b.length - a.length)
                    .slice(0, 6)
                    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                const highlighted = terms.length
                    ? escapeHtml(excerpt).replace(new RegExp(`\\b(${terms.join("|")})\\b`, "gi"), "<mark>$1</mark>")
                    : escapeHtml(excerpt);
                return {
                    html: `${from > 0 ? "… " : ""}${highlighted}${to < sentences.length ? " …" : ""}`,
                    exact: false
                };
            }
            return {
                html: escapeHtml(context.length > 720 ? `${context.slice(0, 720).trim()}…` : context),
                exact: false
            };
        }

        const radius = 320;
        let start = Math.max(0, match.index - radius);
        let end = Math.min(context.length, match.index + match.answer.length + radius);
        if (start > 0) {
            const boundary = context.indexOf(" ", start);
            if (boundary > -1 && boundary < match.index) start = boundary + 1;
        }
        if (end < context.length) {
            const boundary = context.lastIndexOf(" ", end);
            if (boundary > match.index + match.answer.length) end = boundary;
        }
        const before = context.slice(start, match.index);
        const highlighted = context.slice(match.index, match.index + match.answer.length);
        const after = context.slice(match.index + match.answer.length, end);

        return {
            html: `${start > 0 ? "… " : ""}${escapeHtml(before)}<mark>${escapeHtml(highlighted)}</mark>${escapeHtml(after)}${end < context.length ? " …" : ""}`,
            exact: true
        };
    }

    function sectionText(item) {
        if (!item.sectionNumber) return "";
        return `${item.skill === "reading" ? "Passage" : "Part"} ${item.sectionNumber}`;
    }

    function timeText(seconds) {
        const value = Math.max(0, Number(seconds) || 0);
        return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            credentials: "include",
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {})
            }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Request failed");
        return data;
    }

    function updateSummary(summary = {}) {
        ["toReview", "learning", "mastered"].forEach((key) => {
            const element = document.querySelector(`[data-summary="${key}"]`);
            if (element) element.textContent = Number(summary[key]) || 0;
        });
    }

    function retryInput(item) {
        const options = Array.isArray(item.options) ? item.options.filter(Boolean) : [];
        if (options.length) {
            const multiple = /multiple.?select|checkbox/i.test(item.questionType || "");
            const matching = /matching|map|plan|diagram/i.test(item.questionType || "");
            if (matching) {
                return `<select data-retry-answer aria-label="Select your answer">
                    <option value="">Select answer</option>
                    ${options.map((option) => `
                        <option value="${escapeHtml(option?.value ?? option?.letter ?? option?.label ?? option?.text ?? option)}">
                            ${escapeHtml(option?.label ?? option?.text ?? option?.value ?? option?.letter ?? option)}
                        </option>
                    `).join("")}
                </select>`;
            }
            return `<div class="retry-options">${options.map((option, index) => `
                <label class="retry-option">
                    <input type="${multiple ? "checkbox" : "radio"}" name="retry-${escapeHtml(item.id)}" value="${escapeHtml(option?.value ?? option?.letter ?? option?.label ?? option?.text ?? option)}">
                    <span>${escapeHtml(option?.label ?? option?.text ?? option?.value ?? option?.letter ?? option)}</span>
                </label>
            `).join("")}</div>`;
        }
        return `<input type="text" data-retry-answer autocomplete="off" aria-label="Your retry answer" placeholder="Type your answer">`;
    }

    function retryQuestion(item) {
        const number = Number(item.questionNumber) || "";
        const options = Array.isArray(item.options) ? item.options.filter(Boolean) : [];
        const question = escapeHtml(item.questionText || `Question ${number}`);

        if (options.length) {
            return `<div class="retry-test-row">
                <span class="retry-test-number">${number}</span>
                <div class="retry-test-content">
                    <p>${question}</p>
                    ${retryInput(item)}
                </div>
            </div>`;
        }

        const inlineAnswer = `<span class="retry-inline-answer"><strong>${number}</strong>${retryInput(item)}</span>`;
        const numberedBlank = new RegExp(`\\b${number}\\s*(?:\\.{2,}|…+)`);
        let questionWithInput = question;
        if (number && numberedBlank.test(questionWithInput)) {
            questionWithInput = questionWithInput.replace(numberedBlank, inlineAnswer);
        } else if (/_{3,}/.test(questionWithInput)) {
            questionWithInput = questionWithInput.replace(/_{3,}/, inlineAnswer);
        } else {
            questionWithInput = `${questionWithInput} ${inlineAnswer}`;
        }

        return `<div class="retry-test-row retry-test-row--inline">
            <div class="retry-test-content"><p>${questionWithInput}</p></div>
        </div>`;
    }

    function originalOptions(item) {
        const options = Array.isArray(item.options) ? item.options.filter(Boolean) : [];
        if (!options.length) return "";
        const isMatchingHeadings = /matching.?headings/i.test(item.questionType || "");
        if (isMatchingHeadings) return "";
        return `<div class="question-options" aria-label="Original options">${options.map((option) => `
            <span><strong>${escapeHtml(option?.value ?? option?.letter ?? "")}</strong>${escapeHtml(optionLabel(option))}</span>
        `).join("")}</div>`;
    }

    function audioEvidence(item) {
        if (item.skill !== "listening") return "";
        if (!item.audioUrl) {
            return `<section class="audio-evidence audio-evidence--missing">
                <strong>Audio evidence unavailable</strong>
                <span>This older attempt has no saved audio reference.</span>
            </section>`;
        }
        const hasRange = Number.isFinite(Number(item.evidenceStartTime))
            && Number.isFinite(Number(item.evidenceEndTime))
            && Number(item.evidenceEndTime) > Number(item.evidenceStartTime);
        const start = hasRange ? Math.max(0, Number(item.evidenceStartTime) - 3) : 0;
        const end = hasRange ? Number(item.evidenceEndTime) : "";
        return `<section class="audio-evidence" data-audio-evidence
            data-src="${escapeHtml(item.audioUrl)}" data-start="${start}" data-end="${end}">
            <div class="audio-evidence__head">
                <div><strong>Audio evidence</strong>
                    <span>${hasRange
                        ? `${timeText(item.evidenceStartTime)}–${timeText(item.evidenceEndTime)} · includes 3s lead-in`
                        : "Precise audio evidence is not available for this question. Listen to the relevant Part and retry the answer."}</span>
                </div>
                <span class="audio-evidence__time" data-audio-time>00:00 / ${hasRange ? timeText(Number(end) - start) : "--:--"}</span>
            </div>
            <div class="audio-evidence__timeline">
                <span>${timeText(start)}</span>
                <input type="range" data-audio-seek min="${start}" max="${hasRange ? end : start}" value="${start}" step="0.1"
                    aria-label="Choose audio position">
                <span data-audio-timeline-end>${hasRange ? timeText(end) : "--:--"}</span>
            </div>
            <div class="audio-evidence__controls">
                <button type="button" data-audio-action="play">▶ Play evidence</button>
                <button type="button" data-audio-action="pause">Ⅱ Pause</button>
                <button type="button" data-audio-action="replay">↺ Replay</button>
                <button type="button" data-audio-action="back">−5s</button>
                <button type="button" data-audio-action="forward">+5s</button>
                <button type="button" data-audio-action="speed">1×</button>
            </div>
            <p class="audio-evidence__error" data-audio-error hidden></p>
        </section>`;
    }

    function card(item) {
        const section = sectionText(item);
        const evidence = item.skill === "reading" ? readingEvidence(item) : null;
        const context = item.skill === "reading" && item.context ? `
            <details class="mistake-context">
                <summary>Show where this appears in the passage</summary>
                <span class="context-label">${escapeHtml(evidence?.label || (evidence?.exact ? "ANSWER IN THE PASSAGE" : "RELEVANT PASSAGE CONTEXT"))}</span>
                <p>${evidence?.html || escapeHtml(item.context)}</p>
            </details>
        ` : "";
        const transcript = item.skill === "listening" && (item.transcriptText || item.context) ? `
            <details class="mistake-context transcript-evidence" data-transcript-evidence hidden>
                <summary>Show transcript evidence</summary>
                <span class="context-label">LISTENING TRANSCRIPT</span>
                <p>${escapeHtml(item.transcriptText || item.context)}</p>
            </details>` : "";
        return `
            <article class="mistake-card" data-mistake-id="${escapeHtml(item.id)}" data-skill="${escapeHtml(item.skill)}">
                <div class="mistake-card__body">
                    <div class="mistake-meta">
                        <span class="skill-pill skill-pill--${escapeHtml(item.skill)}">${escapeHtml(item.skill)}</span>
                        <span>${escapeHtml(item.testTitle)}</span>
                        ${section ? `<span>·</span><span>${escapeHtml(section)}</span>` : ""}
                        <span>·</span><span>Question ${Number(item.questionNumber)}</span>
                        ${item.questionType ? `<span>·</span><span>${escapeHtml(item.questionType)}</span>` : ""}
                        <span>·</span><span>${escapeHtml(formatDate(item.createdAt))}</span>
                        <span class="status-pill status-pill--${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
                    </div>
                    ${item.instructions ? `<p class="mistake-instructions">${escapeHtml(item.instructions)}</p>` : ""}
                    <h2 class="mistake-question">${escapeHtml(item.questionText || `Question ${item.questionNumber}`)}</h2>
                    ${originalOptions(item)}
                    ${item.imageUrl ? `<img class="mistake-question-image" src="${escapeHtml(item.imageUrl)}" alt="Question diagram or map" loading="lazy">` : ""}
                    <div class="answer-grid">
                        <div class="answer-box answer-box--wrong"><span>Your answer ✕</span><strong>${escapeHtml(answerTextForItem(item, item.userAnswer))}</strong></div>
                        <div class="answer-box answer-box--correct"><span>Correct answer ✓</span><strong>${escapeHtml(answerTextForItem(item, item.correctAnswer))}</strong></div>
                    </div>
                    ${audioEvidence(item)}
                    ${context}
                    ${transcript}
                    <div class="retry-panel" hidden>
                        <span class="retry-panel__eyebrow">Try the question again</span>
                        ${retryQuestion(item)}
                        <div class="retry-actions">
                            <button class="button button--primary" type="button" data-check-retry>Check Answer</button>
                            <button class="button button--secondary" type="button" data-cancel-retry>Cancel</button>
                            <span class="retry-feedback" role="status"></span>
                        </div>
                    </div>
                </div>
                <div class="mistake-card__actions">
                    <button class="button button--primary" type="button" data-open-retry>Retry Question</button>
                    ${item.status !== "mastered" ? `<button class="button button--secondary" type="button" data-master>Mark as Mastered</button>` : ""}
                    <button class="button button--ghost" type="button" data-delete>Delete from Review</button>
                </div>
            </article>
        `;
    }

    function emptyState(filtered) {
        return `<div class="empty-state">
            <span class="empty-state__icon">!</span>
            <h2>${filtered ? "No matching mistakes" : "No mistakes to review"}</h2>
            <p>${filtered
                ? "Try a different filter to see the rest of your review list."
                : "Complete a Listening or Reading test and your incorrect answers will appear here automatically."}</p>
            ${filtered
                ? `<button class="button button--secondary" type="button" data-clear-filter>Show all mistakes</button>`
                : `<a class="button button--primary" href="/dashboard#results">Go to My Tests</a>`}
        </div>`;
    }

    async function load() {
        stopAudio();
        status.hidden = false;
        status.textContent = "Loading your mistakes…";
        list.innerHTML = "";
        const params = new URLSearchParams({ sort: sort.value });
        if (["listening", "reading"].includes(activeFilter)) params.set("skill", activeFilter);
        if (["new", "learning", "mastered"].includes(activeFilter)) params.set("status", activeFilter);
        const attemptId = new URLSearchParams(location.search).get("attemptId");
        if (attemptId) params.set("attemptId", attemptId);
        try {
            const data = await api(`/api/review-mistakes?${params}`);
            updateSummary(data.summary);
            status.hidden = true;
            list.innerHTML = data.items.length
                ? data.items.map(card).join("")
                : emptyState(activeFilter !== "all" || Boolean(attemptId));
        } catch (error) {
            status.hidden = false;
            status.textContent = error.message || "Could not load your mistakes.";
        }
    }

    async function mutate(button, request) {
        button.disabled = true;
        try {
            const data = await request();
            updateSummary(data.summary);
            window.dispatchEvent(new CustomEvent("ieltsx:mistakes-changed"));
            await load();
        } catch (error) {
            window.alert(error.message);
        } finally {
            button.disabled = false;
        }
    }

    function updateFilterButtons() {
        document.querySelectorAll("[data-filter]").forEach((button) => {
            const isActive = button.dataset.filter === activeFilter;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
    }

    function openDeleteModal(id) {
        deleteId = id;
        lastFocusedBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        modal.hidden = false;
        confirmDelete.focus({ preventScroll: true });
    }

    function closeDeleteModal({ restoreFocus = true } = {}) {
        modal.hidden = true;
        deleteId = "";
        if (restoreFocus) {
            lastFocusedBeforeModal?.focus?.({ preventScroll: true });
        }
        lastFocusedBeforeModal = null;
    }

    function trapModalFocus(event) {
        if (modal.hidden || event.key !== "Tab") return;
        const focusable = [...modal.querySelectorAll(focusableSelector)]
            .filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    const filterButtons = document.querySelectorAll("[data-filter]");
    updateFilterButtons();
    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            activeFilter = button.dataset.filter;
            updateFilterButtons();
            const url = new URL(location.href);
            url.searchParams.delete("attemptId");
            url.searchParams.delete("skill");
            history.replaceState(null, "", url);
            load();
        });
    });
    sort.addEventListener("change", load);

    list.addEventListener("click", async (event) => {
        const cardElement = event.target.closest("[data-mistake-id]");
        const id = cardElement?.dataset.mistakeId;
        if (event.target.closest("[data-clear-filter]")) {
            document.querySelector('[data-filter="all"]')?.click();
            return;
        }
        if (!id) return;
        const panel = cardElement.querySelector(".retry-panel");
        if (event.target.closest("[data-open-retry]")) {
            panel.hidden = false;
            cardElement.classList.add("is-retrying");
        }
        if (event.target.closest("[data-cancel-retry]")) {
            panel.hidden = true;
            cardElement.classList.remove("is-retrying");
            if (activeAudioCard === cardElement) stopAudio();
        }
        if (event.target.closest("[data-delete]")) {
            openDeleteModal(id);
        }
        if (event.target.closest("[data-master]")) {
            const button = event.target.closest("button");
            mutate(button, () => api(`/api/review-mistakes/${encodeURIComponent(id)}`, {
                method: "PATCH", body: JSON.stringify({ status: "mastered" })
            }));
        }
        if (event.target.closest("[data-check-retry]")) {
            const button = event.target.closest("button");
            const selectedValues = [...panel.querySelectorAll("input[type=radio]:checked, input[type=checkbox]:checked")]
                .map((input) => input.value);
            const textInput = panel.querySelector("[data-retry-answer]");
            const answer = selectedValues.length > 1 ? selectedValues : (selectedValues[0] ?? textInput?.value ?? "");
            const feedback = panel.querySelector(".retry-feedback");
            if (!String(answer).trim()) {
                feedback.textContent = "Enter or select an answer first.";
                feedback.className = "retry-feedback is-wrong";
                return;
            }
            button.disabled = true;
            try {
                const data = await api(`/api/review-mistakes/${encodeURIComponent(id)}/retry`, {
                    method: "POST", body: JSON.stringify({ answer })
                });
                feedback.textContent = data.correct
                    ? "Correct — nice work. Your review progress was updated."
                    : `Not quite. Correct answer: ${answerText(data.correctAnswer)}`;
                feedback.className = `retry-feedback ${data.correct ? "is-correct" : "is-wrong"}`;
                cardElement.classList.remove("is-retrying");
                cardElement.querySelector("[data-transcript-evidence]")?.removeAttribute("hidden");
                updateSummary(data.summary);
                window.dispatchEvent(new CustomEvent("ieltsx:mistakes-changed"));
                setTimeout(load, 1200);
            } catch (error) {
                feedback.textContent = error.message;
                feedback.className = "retry-feedback is-wrong";
            } finally {
                button.disabled = false;
            }
        }
        const audioButton = event.target.closest("[data-audio-action]");
        if (audioButton) {
            handleAudioAction(audioButton, cardElement);
        }
    });

    list.addEventListener("input", (event) => {
        const slider = event.target.closest("[data-audio-seek]");
        if (!slider) return;
        const cardElement = slider.closest("[data-mistake-id]");
        const evidenceElement = slider.closest("[data-audio-evidence]");
        if (!cardElement || !evidenceElement) return;

        const src = new URL(evidenceElement.dataset.src, location.href).href;
        const start = Number(evidenceElement.dataset.start) || 0;
        const end = Number(evidenceElement.dataset.end);
        if (activeAudioCard !== cardElement || sharedAudio.src !== src) {
            stopAudio();
            activeAudioCard = cardElement;
            sharedAudio.src = src;
            sharedAudio.playbackRate = 1;
            evidenceEnd = Number.isFinite(end) && end > start ? end : null;
        }
        sharedAudio.currentTime = Number(slider.value) || start;
        updateAudioDisplay();
    });

    list.addEventListener("pointerdown", (event) => {
        const slider = event.target.closest("[data-audio-seek]");
        if (!slider) return;
        const cardElement = slider.closest("[data-mistake-id]");
        const evidenceElement = slider.closest("[data-audio-evidence]");
        if (!cardElement || !evidenceElement) return;
        const src = new URL(evidenceElement.dataset.src, location.href).href;
        if (activeAudioCard === cardElement && sharedAudio.src === src) return;

        const start = Number(evidenceElement.dataset.start) || 0;
        const end = Number(evidenceElement.dataset.end);
        stopAudio();
        activeAudioCard = cardElement;
        sharedAudio.preload = "metadata";
        sharedAudio.src = src;
        sharedAudio.currentTime = start;
        sharedAudio.playbackRate = 1;
        evidenceEnd = Number.isFinite(end) && end > start ? end : null;
    });

    function activeEvidenceElement() {
        return activeAudioCard?.querySelector("[data-audio-evidence]") || null;
    }

    function updateAudioDisplay() {
        const evidenceElement = activeEvidenceElement();
        if (!evidenceElement) return;
        const duration = evidenceEnd ?? (Number.isFinite(sharedAudio.duration) ? sharedAudio.duration : null);
        const start = Number(evidenceElement.dataset.start) || 0;
        const output = evidenceElement.querySelector("[data-audio-time]");
        const slider = evidenceElement.querySelector("[data-audio-seek]");
        if (slider) slider.value = String(sharedAudio.currentTime);
        if (output) output.textContent = `${timeText(Math.max(0, sharedAudio.currentTime - start))} / ${duration === null ? "--:--" : timeText(Math.max(0, duration - start))}`;
    }

    function stopAudio() {
        sharedAudio.pause();
        activeAudioCard?.classList.remove("is-audio-playing");
        activeAudioCard = null;
        evidenceEnd = null;
    }

    function handleAudioAction(button, cardElement) {
        const evidenceElement = button.closest("[data-audio-evidence]");
        if (!evidenceElement) return;
        const action = button.dataset.audioAction;
        const src = new URL(evidenceElement.dataset.src, location.href).href;
        const start = Number(evidenceElement.dataset.start) || 0;
        const end = Number(evidenceElement.dataset.end);
        const error = evidenceElement.querySelector("[data-audio-error]");
        if (error) error.hidden = true;

        if (activeAudioCard !== cardElement || sharedAudio.src !== src) {
            stopAudio();
            activeAudioCard = cardElement;
            sharedAudio.src = src;
            sharedAudio.currentTime = start;
            sharedAudio.playbackRate = 1;
            evidenceEnd = Number.isFinite(end) && end > start ? end : null;
        }
        if (action === "pause") {
            sharedAudio.pause();
            cardElement.classList.remove("is-audio-playing");
            return;
        }
        if (action === "back" || action === "forward") {
            const delta = action === "back" ? -5 : 5;
            sharedAudio.currentTime = Math.max(0, Math.min(
                sharedAudio.currentTime + delta,
                evidenceEnd ?? (Number.isFinite(sharedAudio.duration) ? sharedAudio.duration : Infinity)
            ));
            updateAudioDisplay();
            return;
        }
        if (action === "speed") {
            const speeds = [1, 1.25, 0.75];
            sharedAudio.playbackRate = speeds[(speeds.indexOf(sharedAudio.playbackRate) + 1) % speeds.length];
            button.textContent = `${sharedAudio.playbackRate}×`;
            return;
        }
        if (action === "replay" || sharedAudio.ended
            || sharedAudio.currentTime < start || (evidenceEnd !== null && sharedAudio.currentTime >= evidenceEnd)) {
            sharedAudio.currentTime = start;
        }
        sharedAudio.play().then(() => cardElement.classList.add("is-audio-playing")).catch(() => {
            if (error) {
                error.textContent = "Audio could not be loaded. Check the saved audio file and try again.";
                error.hidden = false;
            }
        });
    }

    sharedAudio.addEventListener("timeupdate", () => {
        if (evidenceEnd !== null && sharedAudio.currentTime >= evidenceEnd) {
            sharedAudio.pause();
            sharedAudio.currentTime = evidenceEnd;
            activeAudioCard?.classList.remove("is-audio-playing");
        }
        updateAudioDisplay();
    });
    sharedAudio.addEventListener("ended", () => activeAudioCard?.classList.remove("is-audio-playing"));
    sharedAudio.addEventListener("loadedmetadata", () => {
        const evidenceElement = activeEvidenceElement();
        if (!evidenceElement || !Number.isFinite(sharedAudio.duration)) return;
        const slider = evidenceElement.querySelector("[data-audio-seek]");
        const timelineEnd = evidenceElement.querySelector("[data-audio-timeline-end]");
        const end = evidenceEnd ?? sharedAudio.duration;
        if (slider) slider.max = String(end);
        if (timelineEnd) timelineEnd.textContent = timeText(end);
        updateAudioDisplay();
    });
    sharedAudio.addEventListener("error", () => {
        const error = activeEvidenceElement()?.querySelector("[data-audio-error]");
        if (error) {
            error.textContent = "Audio evidence is unavailable for this attempt.";
            error.hidden = false;
        }
    });
    window.addEventListener("beforeunload", stopAudio);

    document.querySelectorAll("[data-close-delete]").forEach((button) => {
        button.addEventListener("click", () => closeDeleteModal());
    });
    modal.addEventListener("keydown", trapModalFocus);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !modal.hidden) {
            closeDeleteModal();
        }
    });
    confirmDelete.addEventListener("click", () => {
        if (!deleteId) return;
        mutate(confirmDelete, () => api(`/api/review-mistakes/${encodeURIComponent(deleteId)}`, { method: "DELETE" }))
            .finally(() => {
                closeDeleteModal({ restoreFocus: false });
            });
    });

    load();
})();
