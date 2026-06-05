const ListeningComponents = (() => {
    const IMPORTANT_PHRASES = [
        "NO MORE THAN THREE WORDS AND/OR A NUMBER",
        "NO MORE THAN THREE WORDS",
        "NO MORE THAN TWO WORDS AND/OR A NUMBER",
        "NO MORE THAN TWO WORDS",
        "TWO",
        "ONCE"
    ];

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function uniqueId(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    }

    function emphasizeInstruction(value) {
        let html = escapeHtml(value);

        IMPORTANT_PHRASES.forEach((phrase) => {
            html = html.replaceAll(phrase, `<span class="lc-important">${phrase}</span>`);
        });

        return html;
    }

    function answerInput(questionNumber, className = "") {
        const number = Number(questionNumber);
        return `<span class="lc-answer-inline ${className}" data-question="${number}">
            <span class="lc-question-badge">${number}</span>
            <input class="lc-answer-input" id="q${number}" name="q${number}" type="text" autocomplete="off" aria-label="Answer ${number}">
        </span>`;
    }

    function renderPlaceholderText(value) {
        const text = String(value || "");
        const parts = [];
        let lastIndex = 0;

        for (const match of text.matchAll(/\{\{(\d{1,2})\}\}/g)) {
            parts.push(escapeHtml(text.slice(lastIndex, match.index)));
            parts.push(answerInput(match[1]));
            lastIndex = match.index + match[0].length;
        }

        parts.push(escapeHtml(text.slice(lastIndex)));
        return parts.join("").replace(/\n/g, "<br>");
    }

    function renderMixedParts(parts) {
        return (parts || []).map((part) => {
            if (part.type === "input") {
                return answerInput(part.questionNumber);
            }

            return renderPlaceholderText(part.text || "");
        }).join("");
    }

    function renderValue(value) {
        if (typeof value === "string") {
            return renderPlaceholderText(value);
        }

        if (!value || value.type === "text") {
            return renderPlaceholderText(value?.text || "");
        }

        if (value.type === "input") {
            return answerInput(value.questionNumber);
        }

        if (value.type === "mixed") {
            return renderMixedParts(value.parts);
        }

        return "";
    }

    function blockHeading(block) {
        return `<div class="lc-block-heading">
            <h3>${escapeHtml(block.questionRange || block.title || "Questions")}</h3>
            ${block.instruction ? `<p class="lc-instruction">${emphasizeInstruction(block.instruction)}</p>` : ""}
        </div>`;
    }

    function blockCard(block, content, extraClass = "") {
        return `<section class="lc-question-card ${extraClass}" data-block-id="${escapeHtml(block.id || "")}">
            ${blockHeading(block)}
            ${content}
        </section>`;
    }

    function FormCompletionBlock(block) {
        const rows = (block.rows || []).map((row) => `<tr>
            <th scope="row">${escapeHtml(row.label || "")}</th>
            <td>${renderValue(row.value)}</td>
        </tr>`).join("");

        return blockCard(block, `
            ${block.title ? `<h4 class="lc-form-title">${escapeHtml(block.title)}</h4>` : ""}
            <div class="lc-table-scroll">
                <table class="lc-form-table"><tbody>${rows}</tbody></table>
            </div>
        `, "lc-form-completion");
    }

    function MultipleSelectBlock(block) {
        const groupName = `multi-${escapeHtml(block.id || block.questionNumber || "")}`;
        const questionNumbers = [
            Number(block.questionNumber),
            ...(block.answerQuestions || []).map((question) => Number(question.questionNumber))
        ].filter((number, index, numbers) => number && numbers.indexOf(number) === index);
        const options = (block.options || []).map((option) => `<label class="lc-choice-row">
            <span class="lc-letter-badge">${escapeHtml(option.letter || "")}</span>
            <input type="checkbox" name="${groupName}" value="${escapeHtml(option.letter || "")}">
            <span>${escapeHtml(option.text || "")}</span>
        </label>`).join("");

        return blockCard(block, `
            <p class="lc-question-text">${escapeHtml(block.question || "")}</p>
            <div class="lc-choice-list lc-multiple-select" data-max-selections="${Number(block.maxSelections) || 2}" data-question-numbers="${questionNumbers.join(",")}">
                ${options}
            </div>
            <p class="lc-selection-message" aria-live="polite"></p>
        `, "lc-multiple-select-block");
    }

    function SentenceCompletionInlineBlock(block) {
        const sentences = Array.isArray(block.content)
            ? block.content
            : String(block.content || "").split(/\n+/).filter(Boolean);
        const content = sentences.map((sentence) =>
            `<p class="lc-inline-sentence">${renderPlaceholderText(sentence)}</p>`
        ).join("");

        return blockCard(block, `<div class="lc-sentence-list">${content}</div>`, "lc-sentence-completion");
    }

    function MultipleChoiceBlock(block) {
        const name = `q${Number(block.questionNumber)}`;
        const options = (block.options || []).map((option) => `<label class="lc-choice-row">
            <span class="lc-letter-badge">${escapeHtml(option.letter || "")}</span>
            <input type="radio" name="${name}" value="${escapeHtml(option.letter || "")}">
            <span>${escapeHtml(option.text || "")}</span>
        </label>`).join("");

        return blockCard(block, `
            <p class="lc-question-text"><span class="lc-question-badge">${Number(block.questionNumber)}</span>${escapeHtml(block.question || "")}</p>
            <div class="lc-choice-list">${options}</div>
        `, "lc-multiple-choice-block");
    }

    function NoteCompletionBlock(block) {
        const lines = Array.isArray(block.content)
            ? block.content
            : String(block.content || "").split("\n");
        const items = lines.map((line) => {
            const trimmed = String(line).trim();
            if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                return `<li>${renderPlaceholderText(trimmed.slice(2))}</li>`;
            }
            return trimmed ? `<p>${renderPlaceholderText(trimmed)}</p>` : "<br>";
        }).join("");

        return blockCard(block, `
            ${block.title ? `<h4 class="lc-form-title">${escapeHtml(block.title)}</h4>` : ""}
            <div class="lc-notes">${items.includes("<li>") ? `<ul>${items}</ul>` : items}</div>
        `, "lc-note-completion");
    }

    function TableCompletionBlock(block) {
        const columns = (block.columns || []).map((column) => `<th>${escapeHtml(column)}</th>`).join("");
        const rows = (block.rows || []).map((row) => {
            const cells = Array.isArray(row) ? row : row.cells || [];
            return `<tr>${cells.map((cell) => `<td>${renderValue(cell)}</td>`).join("")}</tr>`;
        }).join("");

        return blockCard(block, `
            ${block.title ? `<h4 class="lc-form-title">${escapeHtml(block.title)}</h4>` : ""}
            <div class="lc-table-scroll">
                <table class="lc-data-table">
                    ${columns ? `<thead><tr>${columns}</tr></thead>` : ""}
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `, "lc-table-completion");
    }

    function MatchingBlock(block) {
        const options = (block.options || []).map((option) =>
            `<div class="lc-matching-option"><span class="lc-letter-badge">${escapeHtml(option.letter || "")}</span>${escapeHtml(option.text || "")}</div>`
        ).join("");
        const optionTags = (block.options || []).map((option) =>
            `<option value="${escapeHtml(option.letter || "")}">${escapeHtml(option.letter || "")} - ${escapeHtml(option.text || "")}</option>`
        ).join("");
        const rows = (block.questions || []).map((question) => {
            const questionNumber = Number(question.questionNumber);
            const rawText = String(question.text || "").trim();
            const isPlaceholder = new RegExp(`^label\\s+${questionNumber}$`, "i").test(rawText);
            const text = rawText && !isPlaceholder
                ? `<span class="lc-matching-question-text">${escapeHtml(rawText)}</span>`
                : "";

            return `<div class="lc-matching-row ${text ? "" : "lc-matching-row--compact"}">
            <span class="lc-question-badge">${questionNumber}</span>
            ${text}
            <select name="q${Number(question.questionNumber)}" aria-label="Answer ${Number(question.questionNumber)}">
                <option value="">Select</option>
                ${optionTags}
            </select>
        </div>`;
        }).join("");
        const image = block.imageUrl
            ? `<div class="lc-map-stage lc-matching-image">
                <img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.title || "Listening question image")}">
            </div>`
            : "";
        const hasImage = Boolean(block.imageUrl);
        const content = hasImage
            ? `<div class="lc-matching-map-layout">
                ${image}
                <div class="lc-matching-answer-panel">
                    <div class="lc-matching-options">${options}</div>
                    <div class="lc-matching-rows">${rows}</div>
                </div>
            </div>`
            : `${image}
            <div class="lc-matching-options">${options}</div>
            <div class="lc-matching-rows">${rows}</div>`;

        return blockCard(block, content, `lc-matching-block ${hasImage ? "lc-matching-block--image" : ""}`);
    }

    function MapLabellingBlock(block) {
        const labels = (block.labels || []).map((label) => `<label class="lc-map-marker" style="left:${Number(label.x) || 0}%;top:${Number(label.y) || 0}%">
            ${answerInput(label.questionNumber, "lc-map-answer")}
        </label>`).join("");
        const fallback = (block.labels || []).map((label) =>
            `<div class="lc-map-fallback-row">${answerInput(label.questionNumber)}</div>`
        ).join("");
        const image = block.imageUrl
            ? `<div class="lc-map-stage">
                <img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.title || "Listening map")}">
                ${labels}
            </div>`
            : `<div class="lc-map-placeholder">Map image has not been uploaded yet.</div>`;

        return blockCard(block, `${image}<div class="lc-map-fallback">${fallback}</div>`, "lc-map-labelling");
    }

    const blockRenderers = {
        form_completion: FormCompletionBlock,
        multiple_select: MultipleSelectBlock,
        sentence_completion_inline: SentenceCompletionInlineBlock,
        multiple_choice: MultipleChoiceBlock,
        note_completion: NoteCompletionBlock,
        table_completion: TableCompletionBlock,
        matching: MatchingBlock,
        map_labelling: MapLabellingBlock
    };

    function renderBlock(block) {
        const renderer = blockRenderers[block.type];
        return renderer
            ? renderer(block)
            : blockCard(block, `<p>Unsupported block type: ${escapeHtml(block.type)}</p>`);
    }

    function ListeningHeader(test) {
        const duration = Math.max(1, Number(test.duration) || 30);
        const dashboardHref = test.part === "full" || (test.parts || []).length > 1
            ? "listeningfulltest.html"
            : `listeningpart${Number(test.part || test.parts?.[0]?.partNumber) || 1}.html`;
        return `<header class="lc-header">
            <div class="lc-brand-group">
                <div class="lc-logo">IELTS<sup>TM</sup></div>
                <span class="lc-brand-divider"></span>
                <strong>Academic Listening</strong>
            </div>
            <div class="lc-timer" data-duration="${duration * 60}">
                <span class="lc-clock-icon"></span>
                <span><strong>${String(duration).padStart(2, "0")}:00</strong><small>TIME LEFT</small></span>
            </div>
            <div class="lc-header-actions">
                <a class="lc-dashboard-button" href="${dashboardHref}"><span class="lc-grid-icon"></span>Dashboard</a>
                <button class="lc-submit-button" type="button">Submit</button>
            </div>
        </header>`;
    }

    function AudioPlayerCard(part) {
        const hasAudio = Boolean(part.audioUrl);
        return `<section class="lc-audio-card" data-audio-card data-part-number="${Number(part.partNumber) || 1}">
            <div class="lc-audio-player">
                <div class="lc-audio-title"><span class="lc-headphone-icon"></span><strong>Audio Player</strong></div>
                <div class="lc-audio-controls">
                    <button class="lc-play-button" type="button" disabled aria-label="Play or pause">Play</button>
                    <span class="lc-current-time">00:00</span>
                    <div class="lc-progress-track" role="slider" tabindex="0" aria-label="Audio progress" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><span></span></div>
                    <span class="lc-total-time">--:--</span>
                    <span class="lc-volume-icon">VOL</span>
                    <input class="lc-volume" type="range" min="0" max="1" value="0.75" step="0.05" aria-label="Volume">
                </div>
                <audio preload="metadata" src="${escapeHtml(part.audioUrl || "")}"></audio>
            </div>
            <div class="lc-audio-start-panel">
                <div class="lc-audio-message">
                    <span class="lc-info-badge">i</span>
                    <p>${hasAudio
                        ? `Click "Start Listening Test" to begin.<br>You will hear the recording <span class="lc-important">ONCE</span> only.`
                        : "Audio has not been uploaded for this part."}</p>
                </div>
                <button class="lc-start-button" type="button" ${hasAudio ? "" : "disabled"}>Start Listening Test</button>
            </div>
        </section>`;
    }

    function ListeningPart(part) {
        return `<section class="lc-part" data-part-number="${Number(part.partNumber) || 1}">
            <div class="lc-part-heading">
                <h2>${escapeHtml(part.title || `Part ${part.partNumber}`)}</h2>
                <p>${escapeHtml(part.questionRange || "")}</p>
                ${part.instruction ? `<p class="lc-part-instruction">${emphasizeInstruction(part.instruction)}</p>` : ""}
            </div>
            <div class="lc-question-stack">${(part.blocks || []).map(renderBlock).join("")}</div>
        </section>`;
    }

    function normalizeLegacyTest(test) {
        if (Array.isArray(test.parts)) {
            return test;
        }

        const blocks = (test.questions || []).map((question, index) => {
            if (question.type === "multiple_choice") {
                return {
                    id: `legacy-${index}`,
                    type: "multiple_choice",
                    questionRange: `Question ${question.number}`,
                    questionNumber: question.number,
                    question: question.question,
                    options: (question.options || []).map((text, optionIndex) => ({
                        letter: String.fromCharCode(65 + optionIndex),
                        text
                    }))
                };
            }

            return {
                id: `legacy-${index}`,
                type: "sentence_completion_inline",
                questionRange: `Question ${question.number}`,
                content: [String(question.question || "").replace(/_{2,}/, `{{${question.number}}}`)]
            };
        });

        return {
            ...test,
            duration: test.duration || 30,
            parts: [{
                partNumber: Number(test.part) || 1,
                title: `Part ${Number(test.part) || 1}`,
                questionRange: `Questions 1-${Math.max(1, blocks.length)}`,
                audioUrl: test.audio || "",
                instruction: "",
                blocks
            }]
        };
    }

    function ListeningBottomBar(parts, activePartNumber) {
        if (parts.length <= 1) {
            return "";
        }

        const activeIndex = Math.max(0, parts.findIndex((part) => Number(part.partNumber) === Number(activePartNumber)));
        const tabs = parts.map((part, index) => {
            const partNumber = Number(part.partNumber) || index + 1;
            const active = index === activeIndex;

            return `<button class="${active ? "active" : ""}" type="button" data-listening-part-select="${partNumber}">
                Part ${index + 1}
            </button>`;
        }).join("");

        return `<footer class="lc-bottom-bar">
            <button class="lc-button lc-button--outline" type="button" data-listening-part-prev ${activeIndex === 0 ? "disabled" : ""}>‹ Previous</button>
            <nav class="lc-part-tabs" aria-label="Listening parts">${tabs}</nav>
            <button class="lc-button lc-button--primary" type="button" data-listening-part-next ${activeIndex === parts.length - 1 ? "disabled" : ""}>Next ›</button>
        </footer>`;
    }

    function ListeningTestPage(rawTest) {
        const test = normalizeLegacyTest(rawTest || {});
        const parts = (test.parts || []).filter((part) => (part.blocks || []).length || part.audioUrl);
        const activePartNumber = Number(parts[0]?.partNumber) || 1;

        return `<div class="lc-page">
            ${ListeningHeader(test)}
            <main class="lc-main">
                <div class="lc-listening-stage" data-active-part="${activePartNumber}">
                    ${parts.map((part, index) => {
                        const partNumber = Number(part.partNumber) || index + 1;
                        return `<div class="lc-listening-section ${index === 0 ? "" : "hidden"}" data-listening-part="${partNumber}">
                            ${AudioPlayerCard(part)}
                            ${ListeningPart(part)}
                        </div>`;
                    }).join("")}
                </div>
                <p class="lc-submit-status" aria-live="polite"></p>
            </main>
            ${ListeningBottomBar(parts, activePartNumber)}
            <div class="lc-modal-backdrop hidden" data-listening-result-modal>
                <section class="lc-result-modal" role="dialog" aria-modal="true">
                    <button class="lc-modal-close" type="button" aria-label="Close" data-listening-result-close>&times;</button>
                    <span class="lc-result-eyebrow">IELTS Listening result</span>
                    <h2 data-listening-result-score>0 / 40</h2>
                    <p class="lc-band" data-listening-result-band>Estimated band: 0</p>
                    <p data-listening-result-unanswered>40 unanswered questions.</p>
                    <button class="lc-start-button" type="button" data-listening-result-close>Review answers</button>
                </section>
            </div>
        </div>`;
    }

    function formatTime(value) {
        const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }

    function bindAudioCard(card) {
        const audio = card.querySelector("audio");
        const start = card.querySelector(".lc-start-button");
        const play = card.querySelector(".lc-play-button");
        const current = card.querySelector(".lc-current-time");
        const total = card.querySelector(".lc-total-time");
        const progressTrack = card.querySelector(".lc-progress-track");
        const progress = progressTrack.querySelector("span");
        const volume = card.querySelector(".lc-volume");
        let started = false;
        let ended = false;
        let draggingProgress = false;

        function duration() {
            return Number.isFinite(audio.duration) ? audio.duration : 0;
        }

        function updateProgress() {
            const totalSeconds = duration();
            current.textContent = formatTime(audio.currentTime);
            progress.style.width = totalSeconds ? `${(audio.currentTime / totalSeconds) * 100}%` : "0%";
            progressTrack.setAttribute("aria-valuemax", String(Math.floor(totalSeconds)));
            progressTrack.setAttribute("aria-valuenow", String(Math.floor(audio.currentTime)));
            progressTrack.setAttribute("aria-valuetext", `${formatTime(audio.currentTime)} of ${formatTime(totalSeconds)}`);
        }

        function seekTo(seconds) {
            const totalSeconds = duration();
            if (!totalSeconds) return;

            audio.currentTime = Math.min(totalSeconds, Math.max(0, seconds));
            ended = false;
            if (started) {
                play.disabled = false;
                play.textContent = audio.paused ? "Play" : "Pause";
            }
            updateProgress();
        }

        function seekFromPointer(event) {
            const totalSeconds = duration();
            if (!totalSeconds) return;

            const rect = progressTrack.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            seekTo(ratio * totalSeconds);
        }

        audio.volume = Number(volume.value);
        audio.addEventListener("loadedmetadata", () => {
            total.textContent = formatTime(audio.duration);
            updateProgress();
        });
        audio.addEventListener("timeupdate", updateProgress);
        audio.addEventListener("play", () => {
            play.textContent = "Pause";
        });
        audio.addEventListener("pause", () => {
            if (!ended) play.textContent = "Play";
        });
        audio.addEventListener("ended", () => {
            ended = true;
            play.disabled = true;
            play.textContent = "Ended";
        });
        start.addEventListener("click", async () => {
            if (started || !audio.src) return;
            started = true;
            start.disabled = true;
            start.textContent = "Listening Test Started";
            play.disabled = false;

            try {
                await audio.play();
            } catch {
                started = false;
                start.disabled = false;
                start.textContent = "Start Listening Test";
                play.disabled = true;
            }
        });
        play.addEventListener("click", () => {
            if (!started || ended) return;
            if (audio.paused) audio.play();
            else audio.pause();
        });
        volume.addEventListener("input", () => {
            audio.volume = Number(volume.value);
        });
        progressTrack.addEventListener("pointerdown", (event) => {
            draggingProgress = true;
            progressTrack.setPointerCapture?.(event.pointerId);
            seekFromPointer(event);
        });
        progressTrack.addEventListener("pointermove", (event) => {
            if (draggingProgress) seekFromPointer(event);
        });
        progressTrack.addEventListener("pointerup", (event) => {
            if (!draggingProgress) return;
            draggingProgress = false;
            progressTrack.releasePointerCapture?.(event.pointerId);
            seekFromPointer(event);
        });
        progressTrack.addEventListener("pointercancel", () => {
            draggingProgress = false;
        });
        progressTrack.addEventListener("keydown", (event) => {
            const totalSeconds = duration();
            if (!totalSeconds) return;

            const step = event.shiftKey ? 30 : 5;
            const keyHandlers = {
                ArrowLeft: () => seekTo(audio.currentTime - step),
                ArrowDown: () => seekTo(audio.currentTime - step),
                ArrowRight: () => seekTo(audio.currentTime + step),
                ArrowUp: () => seekTo(audio.currentTime + step),
                Home: () => seekTo(0),
                End: () => seekTo(totalSeconds)
            };

            if (keyHandlers[event.key]) {
                event.preventDefault();
                keyHandlers[event.key]();
            }
        });
    }

    function bindListeningTest(root) {
        root.querySelectorAll("[data-audio-card]").forEach(bindAudioCard);

        const sections = [...root.querySelectorAll(".lc-listening-section")];
        const partTabs = [...root.querySelectorAll("[data-listening-part-select]")];
        const previousButton = root.querySelector("[data-listening-part-prev]");
        const nextButton = root.querySelector("[data-listening-part-next]");

        function activePartIndex() {
            return Math.max(0, sections.findIndex((section) => !section.classList.contains("hidden")));
        }

        function showListeningPart(partNumber) {
            const targetIndex = sections.findIndex((section) => Number(section.dataset.listeningPart) === Number(partNumber));
            const nextIndex = targetIndex >= 0 ? targetIndex : 0;

            sections.forEach((section, index) => {
                const isActive = index === nextIndex;
                section.classList.toggle("hidden", !isActive);
                if (!isActive) {
                    section.querySelectorAll("audio").forEach((audio) => audio.pause());
                }
            });

            partTabs.forEach((button, index) => {
                button.classList.toggle("active", index === nextIndex);
            });

            if (previousButton) previousButton.disabled = nextIndex === 0;
            if (nextButton) nextButton.disabled = nextIndex === sections.length - 1;
            root.querySelector(".lc-listening-stage")?.setAttribute("data-active-part", String(partNumber));
            root.querySelector(".lc-main")?.scrollTo({ top: 0, behavior: "smooth" });
        }

        partTabs.forEach((button) => {
            button.addEventListener("click", () => showListeningPart(button.dataset.listeningPartSelect));
        });
        previousButton?.addEventListener("click", () => {
            const index = activePartIndex();
            if (index > 0) {
                showListeningPart(sections[index - 1].dataset.listeningPart);
            }
        });
        nextButton?.addEventListener("click", () => {
            const index = activePartIndex();
            if (index < sections.length - 1) {
                showListeningPart(sections[index + 1].dataset.listeningPart);
            }
        });

        root.querySelectorAll(".lc-multiple-select").forEach((group) => {
            group.addEventListener("change", (event) => {
                const maximum = Number(group.dataset.maxSelections) || 2;
                const selected = group.querySelectorAll('input[type="checkbox"]:checked');
                const message = group.parentElement.querySelector(".lc-selection-message");

                if (selected.length > maximum) {
                    event.target.checked = false;
                    message.textContent = `Choose no more than ${maximum} answers.`;
                } else {
                    message.textContent = `${selected.length} of ${maximum} selected`;
                }
            });
        });

        const timer = root.querySelector(".lc-timer");
        if (timer) {
            let remaining = Number(timer.dataset.duration) || 1800;
            const output = timer.querySelector("strong");
            clearInterval(root._listeningTimer);
            root._listeningTimer = setInterval(() => {
                if (remaining > 0) remaining -= 1;
                output.textContent = formatTime(remaining);
            }, 1000);
        }

        root.querySelector(".lc-submit-button")?.addEventListener("click", () => {
            const status = root.querySelector(".lc-submit-status");
            status.textContent = "Your Listening test has been submitted.";
            root.dispatchEvent(new CustomEvent("listening-submit", { bubbles: true }));
        });

        root.querySelector("[data-listening-result-modal]")?.addEventListener("click", (event) => {
            if (event.target.matches("[data-listening-result-modal]")) {
                event.currentTarget.classList.add("hidden");
            }
        });
        root.querySelectorAll("[data-listening-result-close]").forEach((button) => {
            button.addEventListener("click", () => {
                root.querySelector("[data-listening-result-modal]")?.classList.add("hidden");
            });
        });
    }

    function sampleListeningTest() {
        return clone({
            title: "IELTS Listening Test 1",
            duration: 30,
            parts: [
                {
                    partNumber: 1,
                    title: "Part 1",
                    questionRange: "Questions 1-10",
                    audioUrl: "/ielts1.mp3",
                    audioFileName: "ielts1.mp3",
                    instruction: "",
                    blocks: [
                        {
                            id: "block-1",
                            type: "form_completion",
                            title: "PERSONAL DETAILS FOR HOMESTAY APPLICATION",
                            questionRange: "Questions 1-5",
                            instruction: "Complete the following form with NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.",
                            rows: [
                                { label: "First name", value: { type: "input", questionNumber: 1, answerKey: "q1" } },
                                { label: "Family name", value: { type: "text", text: "Yuichini" } },
                                { label: "Gender", value: { type: "text", text: "Female" } },
                                { label: "Age", value: { type: "text", text: "28" } },
                                { label: "Passport number", value: { type: "input", questionNumber: 2, answerKey: "q2" } },
                                { label: "Nationality", value: { type: "text", text: "Japanese" } },
                                { label: "Course enrolled", value: { type: "input", questionNumber: 3, answerKey: "q3" } },
                                { label: "Length of the course", value: { type: "input", questionNumber: 4, answerKey: "q4" } },
                                {
                                    label: "Homestay time",
                                    value: {
                                        type: "mixed",
                                        parts: [
                                            { type: "text", text: "approximately " },
                                            { type: "input", questionNumber: 5, answerKey: "q5" },
                                            { type: "text", text: " months" }
                                        ]
                                    }
                                }
                            ]
                        },
                        {
                            id: "block-2",
                            type: "multiple_select",
                            questionNumber: 6,
                            questionRange: "Question 6",
                            instruction: "Mark TWO letters that represent the correct answer.",
                            maxSelections: 2,
                            question: "Which kind of family does the girl prefer?",
                            options: [
                                { letter: "A", text: "A big family with many young children" },
                                { letter: "B", text: "A family without smoker or drinkers" },
                                { letter: "C", text: "A family without any pets" },
                                { letter: "D", text: "A family with many animals or pets" }
                            ]
                        },
                        {
                            id: "block-3",
                            type: "sentence_completion_inline",
                            title: "Questions 7-10",
                            questionRange: "Questions 7-10",
                            instruction: "Fill in the blanks with NO MORE THAN THREE WORDS for each answer.",
                            content: [
                                "Although the girl is not a vegetarian, she doesn't eat a lot of meat. Her favourite food is {{7}}.",
                                "The girl has given up playing handball. Now, she just plays {{8}} with her friends at weekends.",
                                "The girl does not like the bus because they are always late. She would rather {{9}}.",
                                "The girl can get the information about the homestay family that she wants {{10}}."
                            ]
                        }
                    ]
                },
                { partNumber: 2, title: "Part 2", questionRange: "Questions 11-20", audioUrl: "", audioFileName: "", instruction: "Listen and answer Questions 11-20.", blocks: [] },
                { partNumber: 3, title: "Part 3", questionRange: "Questions 21-30", audioUrl: "", audioFileName: "", instruction: "Listen and answer Questions 21-30.", blocks: [] },
                { partNumber: 4, title: "Part 4", questionRange: "Questions 31-40", audioUrl: "", audioFileName: "", instruction: "Listen and answer Questions 31-40.", blocks: [] }
            ]
        });
    }

    return {
        escapeHtml,
        clone,
        uniqueId,
        sampleListeningTest,
        ListeningTestPage,
        ListeningHeader,
        AudioPlayerCard,
        ListeningPart,
        FormCompletionBlock,
        MultipleSelectBlock,
        SentenceCompletionInlineBlock,
        MultipleChoiceBlock,
        NoteCompletionBlock,
        TableCompletionBlock,
        MatchingBlock,
        MapLabellingBlock,
        bindListeningTest
    };
})();

window.ListeningComponents = ListeningComponents;
