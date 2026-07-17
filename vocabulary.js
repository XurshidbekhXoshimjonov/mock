(() => {
    const grid = document.getElementById("vocabGrid");
    const status = document.getElementById("vocabStatus");
    const search = document.getElementById("vocabSearch");
    const sort = document.getElementById("vocabSort");
    const wordModal = document.getElementById("wordModal");
    const wordModalContent = document.getElementById("wordModalContent");
    const reviewModal = document.getElementById("reviewModal");
    const reviewContent = document.getElementById("reviewContent");
    const practiceModal = document.getElementById("practiceModal");
    const practiceContent = document.getElementById("practiceContent");
    const translator = document.getElementById("aiTranslator");
    const translatorForm = document.getElementById("translatorForm");
    const translatorInput = document.getElementById("translatorInput");
    const translatorOutput = document.getElementById("translatorOutput");
    const translatorSubmit = document.getElementById("translatorSubmit");
    const translatorCopy = document.getElementById("translatorCopy");
    const translatorStatus = document.getElementById("translatorStatus");
    const translatorCount = document.getElementById("translatorCount");
    const startTranslate = document.getElementById("startTranslate");
    let items = [];
    let activeFilter = "all";
    let reviewQueue = [];
    let reviewIndex = 0;
    let translationResult = "";

    const escapeHtml = (value) => String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    const normalized = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const formatDate = (value) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    };
    const sourceLabel = (source = {}) => [
        source.testTitle || "Reading",
        source.passageNumber ? `Passage ${source.passageNumber}` : "",
        source.questionNumber ? `Question ${source.questionNumber}` : ""
    ].filter(Boolean).join(" · ");
    const primarySource = (item) => item.sources?.[item.sources.length - 1] || {};
    const contextText = (source) => source.contextSentence || "";

    async function api(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            credentials: "include",
            headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Request failed");
        return data;
    }

    async function savePendingVocabularyWord() {
        let payload = null;
        try {
            payload = JSON.parse(sessionStorage.getItem("pendingVocabularyWord") || "null");
        } catch {
            sessionStorage.removeItem("pendingVocabularyWord");
        }
        if (!payload?.word) return;

        status.hidden = false;
        status.textContent = `Saving “${payload.word}” to your Vocabulary…`;
        try {
            const result = await api("/api/vocabulary", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            sessionStorage.removeItem("pendingVocabularyWord");
            status.textContent = result.message || `“${payload.word}” was saved to your Vocabulary.`;
        } catch (error) {
            status.textContent = error.message;
        }
    }

    function highlightedContext(item, source) {
        const text = contextText(source);
        if (!text) return "";
        const index = text.toLowerCase().indexOf(String(item.word || "").toLowerCase());
        if (index < 0) return escapeHtml(text);
        return `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(text.slice(index, index + item.word.length))}</mark>${escapeHtml(text.slice(index + item.word.length))}`;
    }

    function updateStats(summary = {}) {
        ["total", "new", "learning", "mastered", "due"].forEach((key) => {
            const element = document.querySelector(`[data-stat="${key}"]`);
            if (element) element.textContent = Number(summary[key]) || 0;
        });
    }

    function card(item) {
        const source = primarySource(item);
        const context = contextText(source);
        return `<article class="vocab-card" data-word-id="${escapeHtml(item.id)}">
            <div class="vocab-card__body">
                <div class="vocab-card__top">
                    <div><h2 class="vocab-word">${escapeHtml(item.word)}</h2>
                    <p class="vocab-pronunciation">${escapeHtml([item.partOfSpeech, item.pronunciation].filter(Boolean).join(" · "))}</p></div>
                    <button class="vocab-speak" type="button" data-speak="${escapeHtml(item.word)}" aria-label="Pronounce ${escapeHtml(item.word)}">🔊</button>
                </div>
                <div class="vocab-tags">
                    <span class="vocab-tag vocab-tag--${escapeHtml(item.reviewStatus)}">${escapeHtml(item.reviewStatus)}</span>
                    ${source.sourceType ? `<span class="vocab-tag">${escapeHtml(source.sourceType)}</span>` : ""}
                </div>
                <p class="vocab-definition">${escapeHtml(item.definition || "Definition can be generated later.")}</p>
                <p class="vocab-uzbek">Uzbek: ${escapeHtml(item.uzbekTranslation || "Translation not available yet.")}</p>
                ${context ? `<p class="vocab-context">${highlightedContext(item, source)}</p>` : ""}
                ${source.testTitle || source.testId ? `<p class="vocab-source">${escapeHtml(sourceLabel(source))}</p>` : ""}
            </div>
            <div class="vocab-card__actions">
                <button class="button button--primary" type="button" data-review-word>Review</button>
                <button class="button button--secondary" type="button" data-open-word>Details</button>
                <button class="button button--secondary" type="button" data-edit-word>Edit</button>
                <button class="button button--danger" type="button" data-delete-word>Delete</button>
            </div>
        </article>`;
    }

    function emptyState(filtered) {
        return `<div class="vocab-empty">
            <img src="/premium-icons/vocabulary.png" alt="">
            <h2>${filtered ? "No matching words" : "Your vocabulary list is empty."}</h2>
            <p>${filtered
                ? "Try another search or filter."
                : "Select unfamiliar words while completing Reading tests and add them here."}</p>
            <div><a class="button button--primary" href="/reading">Start Reading</a></div>
        </div>`;
    }

    async function load() {
        status.hidden = false;
        status.textContent = "Loading vocabulary…";
        const params = new URLSearchParams({ sort: sort.value });
        if (search.value.trim()) params.set("search", search.value.trim());
        params.set("sourceType", "reading");
        if (["new", "learning", "mastered"].includes(activeFilter)) params.set("status", activeFilter);
        if (activeFilter === "due") params.set("due", "1");
        try {
            const data = await api(`/api/vocabulary?${params}`);
            items = data.items || [];
            updateStats(data.summary);
            status.hidden = true;
            grid.innerHTML = items.length ? items.map(card).join("") : emptyState(activeFilter !== "all" || Boolean(search.value.trim()));
        } catch (error) {
            status.hidden = false;
            status.textContent = error.message;
        }
    }

    function sourceList(item) {
        return (item.sources || []).map((source) => `<li>
            <strong>${escapeHtml(sourceLabel(source) || source.sourceType)}</strong>
            ${contextText(source) ? `<div>${highlightedContext(item, source)}</div>` : ""}
        </li>`).join("");
    }

    function openDetails(item) {
        wordModalContent.innerHTML = `<article class="word-detail" data-modal-word-id="${escapeHtml(item.id)}">
            <h2 id="wordModalTitle">${escapeHtml(item.word)}</h2>
            <p class="word-detail__meta">${escapeHtml([item.partOfSpeech, item.pronunciation].filter(Boolean).join(" · "))}</p>
            <section class="detail-section"><h3>Meaning</h3><p>${escapeHtml(item.definition || "Not available yet.")}</p>
            <p><strong>Uzbek:</strong> ${escapeHtml(item.uzbekTranslation || "Not available yet.")}</p></section>
            ${item.simpleExample ? `<section class="detail-section"><h3>Simple example</h3><p>${escapeHtml(item.simpleExample)}</p></section>` : ""}
            ${(item.synonyms || []).length ? `<section class="detail-section"><h3>Synonyms</h3><p>${escapeHtml(item.synonyms.join(", "))}</p></section>` : ""}
            ${(item.antonyms || []).length ? `<section class="detail-section"><h3>Antonyms</h3><p>${escapeHtml(item.antonyms.join(", "))}</p></section>` : ""}
            <section class="detail-section"><h3>Saved sources</h3><ul class="source-list">${sourceList(item) || "<li>No source details.</li>"}</ul></section>
            <section class="detail-section"><h3>Review history</h3><p>Added ${escapeHtml(formatDate(item.createdAt))} · Reviewed ${Number(item.reviewCount) || 0} times · Correct ${Number(item.correctCount) || 0} times</p></section>
            <div class="review-actions"><button class="button button--secondary" data-regenerate-word type="button">Regenerate AI details</button><span data-regenerate-message></span></div>
        </article>`;
        wordModal.hidden = false;
    }

    function openEdit(item) {
        wordModalContent.innerHTML = `<form class="word-edit" data-edit-form data-word-id="${escapeHtml(item.id)}">
            <h2 id="wordModalTitle">Edit ${escapeHtml(item.word)}</h2>
            <label>Word<input name="word" value="${escapeHtml(item.word)}" required></label>
            <label>Pronunciation<input name="pronunciation" value="${escapeHtml(item.pronunciation || "")}"></label>
            <label>Part of speech<input name="partOfSpeech" value="${escapeHtml(item.partOfSpeech || "")}"></label>
            <label>English definition<textarea name="definition">${escapeHtml(item.definition || "")}</textarea></label>
            <label>Uzbek translation<textarea name="uzbekTranslation">${escapeHtml(item.uzbekTranslation || "")}</textarea></label>
            <label>Simple example<textarea name="simpleExample">${escapeHtml(item.simpleExample || "")}</textarea></label>
            <label>Synonyms (comma separated)<input name="synonyms" value="${escapeHtml((item.synonyms || []).join(", "))}"></label>
            <label>Antonyms (comma separated)<input name="antonyms" value="${escapeHtml((item.antonyms || []).join(", "))}"></label>
            <button class="button button--primary" type="submit">Save changes</button>
            <p data-edit-message role="status"></p>
        </form>`;
        wordModal.hidden = false;
    }

    function startSingleReview(item) {
        reviewQueue = [item];
        reviewIndex = 0;
        reviewModal.hidden = false;
        renderReview();
    }

    function renderReview() {
        const item = reviewQueue[reviewIndex];
        if (!item) {
            reviewContent.innerHTML = `<div class="review-card"><h2 id="reviewWord">Review complete</h2><p>You reviewed ${reviewQueue.length} word${reviewQueue.length === 1 ? "" : "s"}.</p><div class="review-actions"><button class="button button--primary" data-close-review type="button">Done</button></div></div>`;
            return;
        }
        const source = primarySource(item);
        reviewContent.innerHTML = `<div class="review-progress">Word ${reviewIndex + 1} of ${reviewQueue.length}</div>
            <article class="review-card" data-review-id="${escapeHtml(item.id)}">
                <div class="review-card__front"><h2 id="reviewWord">${escapeHtml(item.word)}</h2>
                <p>${escapeHtml(item.pronunciation || "What does this word mean?")}</p></div>
                <div class="review-card__back" data-review-back hidden>
                    <p><strong>${escapeHtml(item.partOfSpeech || "Word")}</strong></p>
                    <p>${escapeHtml(item.definition || "Definition not available.")}</p>
                    <p><strong>Uzbek:</strong> ${escapeHtml(item.uzbekTranslation || "Not available.")}</p>
                    ${contextText(source) ? `<p>${highlightedContext(item, source)}</p>` : ""}
                    ${item.simpleExample ? `<p><strong>Example:</strong> ${escapeHtml(item.simpleExample)}</p>` : ""}
                </div>
                <div class="review-actions"><button class="button button--primary" data-reveal-review type="button">Reveal answer</button></div>
                <div class="difficulty-actions" data-difficulty-actions hidden>
                    <button class="button" data-difficulty="again" type="button">Again</button>
                    <button class="button" data-difficulty="hard" type="button">Hard</button>
                    <button class="button" data-difficulty="good" type="button">Good</button>
                    <button class="button" data-difficulty="easy" type="button">Easy</button>
                </div>
            </article>`;
    }

    function shuffled(values) {
        return [...values].sort(() => Math.random() - .5);
    }

    function distractors(item, field) {
        const sameType = items.filter((other) => other.id !== item.id && (!item.partOfSpeech || other.partOfSpeech === item.partOfSpeech));
        const pool = (sameType.length >= 3 ? sameType : items.filter((other) => other.id !== item.id))
            .map((other) => ({ value: other[field] || other.word, id: other.id })).filter((entry) => entry.value);
        return shuffled(pool).slice(0, 3);
    }

    function practiceHome() {
        practiceContent.innerHTML = `<div><h2 id="practiceTitle">Vocabulary Practice</h2><p>Choose a practice mode.</p>
            <div class="practice-modes">
                <button data-practice-mode="word-uzbek">1. English word → choose Uzbek meaning</button>
                <button data-practice-mode="uzbek-word">2. Uzbek meaning → choose English word</button>
                <button data-practice-mode="context">3. Fill in the missing word from context</button>
                <button data-practice-mode="definition">4. Type the word from its definition</button>
            </div></div>`;
    }

    function startPracticeMode(mode) {
        const pool = items;
        if (!pool.length) {
            practiceContent.innerHTML = `<div class="practice-question"><h2 id="practiceTitle">No suitable words yet</h2><p>Add more vocabulary for this practice mode.</p><button class="button button--secondary" data-practice-home type="button">Back</button></div>`;
            return;
        }
        const item = pool[Math.floor(Math.random() * pool.length)];
        const source = primarySource(item);
        let prompt = item.word;
        let answer = item.uzbekTranslation;
        let input = false;
        if (mode === "uzbek-word") { prompt = item.uzbekTranslation; answer = item.word; }
        if (mode === "context") {
            const text = contextText(source);
            prompt = text ? text.replace(new RegExp(item.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "_____") : item.definition;
            answer = item.word; input = true;
        }
        if (mode === "definition") { prompt = item.definition; answer = item.word; input = true; }
        const field = mode === "word-uzbek" ? "uzbekTranslation" : "word";
        const options = input ? [] : shuffled([{ value: answer, id: item.id }, ...distractors(item, field)]);
        practiceContent.innerHTML = `<div class="practice-question" data-practice-question data-item-id="${escapeHtml(item.id)}" data-answer="${escapeHtml(answer)}" data-mode="${escapeHtml(mode)}">
            <span class="vocab-eyebrow">${escapeHtml(mode.replace("-", " "))}</span>
            <h2 id="practiceTitle">${escapeHtml(prompt || "Vocabulary question")}</h2>
            ${input
                ? `<input class="practice-input" data-practice-input autocomplete="off" placeholder="Type your answer"><button class="button button--primary" data-check-practice type="button">Check</button>`
                : `<div class="practice-options">${options.map((option) => `<button data-practice-answer="${escapeHtml(option.value)}" type="button">${escapeHtml(option.value)}</button>`).join("")}</div>`}
            <p class="practice-feedback" data-practice-feedback></p>
            <button class="button button--secondary" data-practice-home type="button">Change mode</button>
        </div>`;
    }

    document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach((entry) => entry.classList.toggle("is-active", entry === button));
        load();
    }));
    let searchTimer;
    search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(load, 250);
    });
    sort.addEventListener("change", load);

    grid.addEventListener("click", async (event) => {
        const cardElement = event.target.closest("[data-word-id]");
        const item = items.find((entry) => entry.id === cardElement?.dataset.wordId);
        if (event.target.closest("[data-speak]")) {
            speechSynthesis.cancel();
            speechSynthesis.speak(new SpeechSynthesisUtterance(event.target.closest("[data-speak]").dataset.speak));
            return;
        }
        if (!item) return;
        if (event.target.closest("[data-open-word]")) openDetails(item);
        if (event.target.closest("[data-edit-word]")) openEdit(item);
        if (event.target.closest("[data-review-word]")) startSingleReview(item);
        if (event.target.closest("[data-delete-word]") && confirm(`Delete "${item.word}" from Vocabulary?`)) {
            await api(`/api/vocabulary/${encodeURIComponent(item.id)}`, { method: "DELETE" });
            await load();
        }
    });

    wordModal.addEventListener("click", (event) => {
        if (event.target.closest("[data-close-modal]")) wordModal.hidden = true;
        const regenerateButton = event.target.closest("[data-regenerate-word]");
        if (regenerateButton) {
            const host = wordModalContent.querySelector("[data-modal-word-id]");
            const message = wordModalContent.querySelector("[data-regenerate-message]");
            regenerateButton.disabled = true;
            api(`/api/vocabulary/${encodeURIComponent(host.dataset.modalWordId)}/regenerate`, { method: "POST", body: "{}" })
                .then(async (data) => {
                    if (message) message.textContent = data.message;
                    await load();
                    openDetails(data.item);
                })
                .catch((error) => { if (message) message.textContent = error.message; })
                .finally(() => { regenerateButton.disabled = false; });
        }
    });
    wordModalContent.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-edit-form]");
        if (!form) return;
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        data.synonyms = data.synonyms.split(",").map((value) => value.trim()).filter(Boolean);
        data.antonyms = data.antonyms.split(",").map((value) => value.trim()).filter(Boolean);
        const message = form.querySelector("[data-edit-message]");
        try {
            await api(`/api/vocabulary/${encodeURIComponent(form.dataset.wordId)}`, { method: "PATCH", body: JSON.stringify(data) });
            message.textContent = "Saved.";
            await load();
            setTimeout(() => { wordModal.hidden = true; }, 500);
        } catch (error) { message.textContent = error.message; }
    });
    document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => { wordModal.hidden = true; }));

    reviewModal.addEventListener("click", async (event) => {
        if (event.target.closest("[data-close-review]")) { reviewModal.hidden = true; await load(); return; }
        if (event.target.closest("[data-reveal-review]")) {
            reviewContent.querySelector("[data-review-back]").hidden = false;
            reviewContent.querySelector("[data-reveal-review]").hidden = true;
            reviewContent.querySelector("[data-difficulty-actions]").hidden = false;
        }
        const difficulty = event.target.closest("[data-difficulty]")?.dataset.difficulty;
        if (difficulty) {
            const item = reviewQueue[reviewIndex];
            await api(`/api/vocabulary/${encodeURIComponent(item.id)}/review`, { method: "POST", body: JSON.stringify({ difficulty }) });
            reviewIndex += 1;
            renderReview();
        }
    });

    document.getElementById("startPractice").addEventListener("click", () => {
        practiceModal.hidden = false;
        practiceHome();
    });
    practiceModal.addEventListener("click", async (event) => {
        if (event.target.closest("[data-close-practice]")) { practiceModal.hidden = true; return; }
        const mode = event.target.closest("[data-practice-mode]")?.dataset.practiceMode;
        if (mode) startPracticeMode(mode);
        if (event.target.closest("[data-practice-home]")) practiceHome();
        const host = event.target.closest("[data-practice-question]");
        let submitted = event.target.closest("[data-practice-answer]")?.dataset.practiceAnswer;
        if (event.target.closest("[data-check-practice]")) submitted = host?.querySelector("[data-practice-input]")?.value || "";
        if (submitted !== undefined && host) {
            const correct = normalized(submitted) === normalized(host.dataset.answer);
            const feedback = host.querySelector("[data-practice-feedback]");
            feedback.textContent = correct ? "Correct!" : `Correct answer: ${host.dataset.answer}`;
            feedback.className = `practice-feedback ${correct ? "is-correct" : "is-wrong"}`;
            host.querySelectorAll("button[data-practice-answer], [data-check-practice]").forEach((button) => { button.disabled = true; });
            await api(`/api/vocabulary/${encodeURIComponent(host.dataset.itemId)}/review`, {
                method: "POST", body: JSON.stringify({ difficulty: correct ? "good" : "again" })
            });
        }
    });

    function translationLanguages() {
        return translator.dataset.direction === "uz-en"
            ? { sourceLanguage: "uz", targetLanguage: "en", sourceLabel: "Uzbek", targetLabel: "English" }
            : { sourceLanguage: "en", targetLanguage: "uz", sourceLabel: "English", targetLabel: "Uzbek" };
    }

    startTranslate.addEventListener("click", () => {
        const willOpen = translator.hidden;
        translator.hidden = !willOpen;
        startTranslate.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) {
            translator.scrollIntoView({ behavior: "smooth", block: "start" });
            setTimeout(() => translatorInput.focus(), 250);
        }
    });

    function clearTranslationResult(message = "Translation will appear here.") {
        translationResult = "";
        translatorOutput.textContent = message;
        translatorOutput.parentElement.classList.add("is-placeholder");
        translatorCopy.disabled = true;
    }

    function setTranslationDirection(direction, preserveInput = true) {
        translator.dataset.direction = direction === "uz-en" ? "uz-en" : "en-uz";
        const languages = translationLanguages();
        document.getElementById("translatorSourceLabel").textContent = languages.sourceLabel;
        document.getElementById("translatorTargetLabel").textContent = languages.targetLabel;
        translatorInput.placeholder = `Enter ${languages.sourceLabel} text`;
        document.querySelectorAll("[data-translate-direction]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.translateDirection === translator.dataset.direction);
        });
        if (!preserveInput) translatorInput.value = "";
        translatorCount.textContent = translatorInput.value.length;
        clearTranslationResult();
        translatorStatus.textContent = "";
        translatorStatus.classList.remove("is-error");
    }

    document.querySelectorAll("[data-translate-direction]").forEach((button) => {
        button.addEventListener("click", () => setTranslationDirection(button.dataset.translateDirection));
    });
    translatorInput.addEventListener("input", () => {
        translatorCount.textContent = translatorInput.value.length;
    });
    translatorInput.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            translatorForm.requestSubmit();
        }
    });
    document.getElementById("translatorSwap").addEventListener("click", () => {
        const nextDirection = translator.dataset.direction === "en-uz" ? "uz-en" : "en-uz";
        const previousResult = translationResult;
        setTranslationDirection(nextDirection);
        if (previousResult) {
            translatorInput.value = previousResult.slice(0, 5000);
            translatorCount.textContent = translatorInput.value.length;
        }
        translatorInput.focus();
    });
    document.getElementById("translatorClear").addEventListener("click", () => {
        translatorInput.value = "";
        translatorCount.textContent = "0";
        clearTranslationResult();
        translatorStatus.textContent = "";
        translatorStatus.classList.remove("is-error");
        translatorInput.focus();
    });
    translatorCopy.addEventListener("click", async () => {
        if (!translationResult) return;
        try {
            await navigator.clipboard.writeText(translationResult);
            translatorStatus.textContent = "Copied.";
            translatorStatus.classList.remove("is-error");
        } catch {
            translatorStatus.textContent = "Could not copy automatically.";
            translatorStatus.classList.add("is-error");
        }
    });
    translatorForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = translatorInput.value.trim();
        if (!text) {
            translatorStatus.textContent = "Enter text to translate.";
            translatorStatus.classList.add("is-error");
            translatorInput.focus();
            return;
        }

        const languages = translationLanguages();
        translatorSubmit.disabled = true;
        translatorSubmit.textContent = "Translating...";
        translatorStatus.textContent = "AI is translating your text...";
        translatorStatus.classList.remove("is-error");
        clearTranslationResult("Translating...");
        try {
            const data = await api("/api/vocabulary/translate", {
                method: "POST",
                body: JSON.stringify({
                    text,
                    sourceLanguage: languages.sourceLanguage,
                    targetLanguage: languages.targetLanguage
                })
            });
            translationResult = String(data.translation || "");
            translatorOutput.textContent = translationResult;
            translatorOutput.parentElement.classList.remove("is-placeholder");
            translatorCopy.disabled = !translationResult;
            translatorStatus.textContent = "Translation complete.";
        } catch (error) {
            clearTranslationResult("Translation is unavailable.");
            translatorStatus.textContent = error.message;
            translatorStatus.classList.add("is-error");
        } finally {
            translatorSubmit.disabled = false;
            translatorSubmit.textContent = "Translate with AI";
        }
    });

    savePendingVocabularyWord().finally(load);
})();
