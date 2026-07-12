(function () {
    const WORD_CLASS = "translatable-word";
    const ANONYMOUS_SESSION_KEY = "ieltsx.anonymousSessionId.v1";
    const CACHE_PREFIX = "readingVocabulary";
    const ERROR_MESSAGE = "Translation is unavailable right now. Please try again.";
    const TRANSLATE_API_ENDPOINT = "/api/translate";
    const WORD_PATTERN = /[A-Za-z0-9]+(?:[\u2019'\-][A-Za-z0-9]+)*/g;
    const PASSAGE_SELECTORS = [
        ".reading-passage",
        ".passage-content",
        ".passage-text",
        ".article-content",
        "[data-passage]",
        ".cbt-passage-copy",
        ".cbt-passage",
        ".modern-passage",
        ".ielts-passage-panel",
        "#passageContent",
        "[id^='passage-text-']"
    ];
    const SKIP_SELECTOR = [
        "input",
        "textarea",
        "button",
        "select",
        "option",
        "audio",
        "video",
        "script",
        "style",
        "svg",
        "canvas",
        "nav",
        "footer",
        ".ielts-navbar",
        ".cbt-questions-panel",
        ".questions-panel",
        ".question-panel",
        ".question-nav",
        ".answer-options",
        ".answer-option",
        ".answer-label",
        ".cbt-question",
        ".question",
        ".form-box",
        ".bottombar",
        ".statusbar",
        ".part-tabs",
        ".annotation-toolbar",
        ".cbt-vocab-popover",
        ".reading-translation-popover",
        `.${WORD_CLASS}`
    ].join(",");

    let observer = null;
    let scheduled = false;
    const memoryCache = new Map();

    function normalizeWord(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[\u2019]/g, "'")
            .replace(/^[\s.,:;()[\]{}"'\u201c\u201d\u2018\u2019!?]+|[\s.,:;()[\]{}"'\u201c\u201d\u2018\u2019!?]+$/g, "")
            .replace(/'s$/i, "")
            .replace(/[^a-z0-9'-]/g, "");
    }

    function compactText(value, maxLength = 500) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, maxLength);
    }

    function shortUzbekPhrase(value, maxWords = 8) {
        let text = compactText(value, 260)
            .replace(/^[\s"'`]+|[\s"'`]+$/g, "");

        [
            /^(?:bu\s+)?(?:yerda\s+)?(?:ushbu\s+)?(?:kontekst(?:da|dagi)?\s+)?(?:so['\u2019`]?z(?:ning)?|ibora(?:ning)?|tanlangan\s+matn(?:ning)?)?\s*(?:ma['\u2019`]?nosi|mazmuni|tarjimasi)\s*[,:;\-]?\s*/i,
            /^(?:bu\s+)?(?:kontekst(?:da|dagi)?|yerda)\s*(?:u\s+)?(?:degani|anglatadi|bildiradi)\s*[,:;\-]?\s*/i,
            /^(?:ya['\u2019`]?ni|demak)\s*[,:;\-]?\s*/i
        ].forEach((pattern) => {
            text = text.replace(pattern, "");
        });

        text = text
            .replace(/\s+(?:ya['\u2019`]?ni|degani|anglatadi|bildiradi)\b[\s\S]*$/i, "")
            .replace(/[.!?]\s*[\s\S]*$/, "")
            .trim();

        const words = text.split(/\s+/).filter(Boolean);
        return (words.length > maxWords ? words.slice(0, maxWords).join(" ") : text).trim();
    }

    function simpleHash(value) {
        const text = String(value || "");
        let hash = 5381;

        for (let index = 0; index < text.length; index += 1) {
            hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
        }

        return hash.toString(36);
    }

    function translationCacheEntryKey(selectedText, sentence) {
        return [
            simpleHash(compactText(selectedText, 180).toLowerCase()),
            simpleHash(compactText(sentence, 760).toLowerCase())
        ].join(":");
    }

    function safeStoragePart(value, fallback = "unknown") {
        const cleaned = String(value || "")
            .trim()
            .replace(/[^a-zA-Z0-9_.:-]/g, "-")
            .slice(0, 160);
        return cleaned || fallback;
    }

    function readStoredAuthUser() {
        try {
            if (window.authClient?.getAuthState) {
                return window.authClient.getAuthState()?.user || null;
            }

            const raw = localStorage.getItem("ieltsmock.auth") || localStorage.getItem("ieltsAuth");
            const auth = raw ? JSON.parse(raw) : null;
            return auth?.user || null;
        } catch {
            return null;
        }
    }

    function getAnonymousSessionId() {
        try {
            let sessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
            if (!sessionId) {
                sessionId = `anon-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
                localStorage.setItem(ANONYMOUS_SESSION_KEY, sessionId);
            }
            return safeStoragePart(sessionId, "anonymous");
        } catch {
            return "anonymous";
        }
    }

    function getReadingOwnerScope() {
        const user = readStoredAuthUser();
        const userId = safeStoragePart(user?.id || user?._id || user?.memberId || "");

        if (userId !== "unknown") {
            return {
                ownerType: "user",
                ownerId: userId,
                ownerKey: `user:${userId}`
            };
        }

        const sessionId = getAnonymousSessionId();
        return {
            ownerType: "session",
            ownerId: sessionId,
            ownerKey: `session:${sessionId}`
        };
    }

    function getReadingTestId() {
        const params = new URLSearchParams(window.location.search);
        const pathParts = window.location.pathname.split("/").filter(Boolean);
        return params.get("id")
            || params.get("testId")
            || params.get("mockTestId")
            || (pathParts[0] === "reading" ? pathParts[1] : "")
            || "practice";
    }

    function readingVocabularyStorageKey(testId, passageId) {
        const owner = getReadingOwnerScope();
        return `${CACHE_PREFIX}:${owner.ownerKey}:${safeStoragePart(testId || "practice")}:${safeStoragePart(passageId || "passage")}`;
    }

    function getScopedAttemptId(testId) {
        const owner = getReadingOwnerScope();
        const key = `ieltsx-reading-translation-attempt:${owner.ownerKey}:${safeStoragePart(testId || "practice")}`;
        try {
            let attemptId = sessionStorage.getItem(key);
            if (!attemptId) {
                attemptId = `reading-translation-${safeStoragePart(owner.ownerKey)}-${safeStoragePart(testId || "practice")}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
                sessionStorage.setItem(key, attemptId);
            }
            return attemptId;
        } catch {
            return `reading-translation-${safeStoragePart(owner.ownerKey)}-${safeStoragePart(testId || "practice")}`;
        }
    }

    function isReadingPage() {
        const path = window.location.pathname.toLowerCase();
        return document.body?.classList.contains("cbt-body")
            || document.body?.dataset.practiceSkill === "reading"
            || path.includes("reading")
            || path.includes("part1")
            || path.includes("part2")
            || path.includes("part3")
            || path.includes("full-test-player")
            || Boolean(document.querySelector(".modern-passage, .cbt-passage, .reading-passage, [data-passage]"));
    }

    function isInsideSkippedArea(node) {
        const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        if (!element) return true;
        return Boolean(element.closest(SKIP_SELECTOR));
    }

    function validContainer(container) {
        if (!container || isInsideSkippedArea(container)) return false;
        const textLength = String(container.textContent || "").trim().length;
        if (textLength < 80) return false;
        if (container.matches(".cbt-questions-panel, .questions-panel, nav, footer, header, form")) return false;
        return true;
    }

    function findPassageContainers(root = document) {
        const found = new Set();

        PASSAGE_SELECTORS.forEach((selector) => {
            root.querySelectorAll?.(selector).forEach((container) => {
                if (validContainer(container)) found.add(container);
            });
        });

        if (found.size) {
            return [...found];
        }

        const candidates = [...document.querySelectorAll("article, section, main, div")]
            .filter((element) => validContainer(element))
            .filter((element) => !element.querySelector("input, textarea, select, button, .answer-option, .cbt-question"))
            .map((element) => ({
                element,
                length: String(element.textContent || "").trim().length
            }))
            .sort((a, b) => b.length - a.length);

        return candidates[0] ? [candidates[0].element] : [];
    }

    function enhanceExistingWords(container) {
        container.querySelectorAll("[data-vocab-word], .cbt-vocab-word").forEach((element) => {
            const raw = element.dataset.vocabWord || element.textContent || "";
            const normalized = normalizeWord(element.dataset.vocabNormalized || raw);
            if (!normalized) return;
            element.classList.add(WORD_CLASS);
            element.dataset.word = normalized;
        });
    }

    function wrapTextNode(node) {
        const text = node.nodeValue || "";
        if (!WORD_PATTERN.test(text)) {
            WORD_PATTERN.lastIndex = 0;
            return;
        }
        WORD_PATTERN.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;

        while ((match = WORD_PATTERN.exec(text)) !== null) {
            const [rawWord] = match;
            const normalized = normalizeWord(rawWord);

            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            if (normalized) {
                const span = document.createElement("span");
                span.className = WORD_CLASS;
                span.dataset.word = normalized;
                span.textContent = rawWord;
                fragment.appendChild(span);
            } else {
                fragment.appendChild(document.createTextNode(rawWord));
            }

            lastIndex = match.index + rawWord.length;
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        node.parentNode.replaceChild(fragment, node);
    }

    function wrapWords(container) {
        enhanceExistingWords(container);

        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    if (isInsideSkippedArea(node)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(wrapTextNode);
    }

    function getCache(storageKey) {
        try {
            return JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
        } catch {
            return {};
        }
    }

    function setCache(entryKey, value, testId, passageId) {
        const storageKey = readingVocabularyStorageKey(testId, passageId);
        const memoryKey = `${storageKey}:${entryKey}`;
        memoryCache.set(memoryKey, value);
        try {
            const cache = getCache(storageKey);
            cache[entryKey] = { ...value, cachedAt: new Date().toISOString() };
            localStorage.setItem(storageKey, JSON.stringify(cache));
        } catch {}
    }

    function getCached(entryKey, testId, passageId) {
        const storageKey = readingVocabularyStorageKey(testId, passageId);
        const memoryKey = `${storageKey}:${entryKey}`;
        if (memoryCache.has(memoryKey)) return memoryCache.get(memoryKey);
        const cached = getCache(storageKey)[entryKey];
        if (cached) {
            memoryCache.set(memoryKey, cached);
        }
        return cached || null;
    }

    function ensurePopup() {
        let popup = document.getElementById("readingTranslationPopup");
        if (popup) return popup;

        popup = document.createElement("aside");
        popup.id = "readingTranslationPopup";
        popup.className = "reading-translation-popover";
        popup.innerHTML = `
            <button class="reading-translation-popover__close" type="button" aria-label="Close translation">x</button>
            <span class="reading-translation-popover__eyebrow">Selected text</span>
            <h2></h2>
            <div class="reading-translation-popover__body"></div>
        `;
        document.body.appendChild(popup);
        popup.querySelector("button")?.addEventListener("click", hidePopup);
        return popup;
    }

    function ensureStyles() {
        if (document.getElementById("readingTranslationStyles")) return;
        const style = document.createElement("style");
        style.id = "readingTranslationStyles";
        style.textContent = `
            .translatable-word {
                border-radius: 4px;
                cursor: pointer;
                padding: 0 1px;
                transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
            }
            .translatable-word:hover {
                background: rgba(0, 87, 255, 0.08);
                color: #0057ff;
            }
            .reading-translation-popover {
                position: fixed;
                z-index: 5000;
                width: 300px;
                max-width: calc(100vw - 28px);
                border: 1px solid rgba(226, 232, 240, 0.96);
                border-radius: 16px;
                background: #fff;
                padding: 18px 20px;
                color: #0f172a;
                box-shadow: 0 18px 45px rgba(15, 23, 42, 0.16);
                opacity: 0;
                pointer-events: none;
                transform: translateY(4px);
                transition: opacity 140ms ease, transform 140ms ease;
            }
            .reading-translation-popover.is-open {
                opacity: 1;
                pointer-events: auto;
                transform: translateY(0);
            }
            .reading-translation-popover__close {
                position: absolute;
                top: 12px;
                right: 12px;
                width: 24px;
                height: 24px;
                border: 0;
                border-radius: 999px;
                background: #f1f5f9;
                color: #475569;
                cursor: pointer;
                line-height: 1;
            }
            .reading-translation-popover__eyebrow {
                display: block;
                color: #0057ff;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: .12em;
                text-transform: uppercase;
            }
            .reading-translation-popover h2 {
                margin: 7px 28px 12px 0;
                font-size: 22px;
                line-height: 1.15;
            }
            .reading-translation-popover__body {
                display: grid;
                gap: 10px;
                font-size: 14px;
                line-height: 1.45;
            }
            .reading-translation-popover__body dl {
                display: grid;
                gap: 10px;
                margin: 0;
            }
            .reading-translation-popover__body dt {
                color: #64748b;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
            }
            .reading-translation-popover__body dd {
                margin: 3px 0 0;
                color: #0f172a;
                font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }

    function positionPopup(popup, target) {
        const rect = target.getBoundingClientRect();
        const width = 300;
        const gap = 8;
        let left = rect.left + rect.width / 2 - width / 2;
        left = Math.min(Math.max(14, left), window.innerWidth - width - 14);
        let top = rect.bottom + gap;
        if (top + popup.offsetHeight > window.innerHeight - 14) {
            top = Math.max(14, rect.top - popup.offsetHeight - gap);
        }
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    }

    function showPopup(target, word, html, loading = false) {
        ensureStyles();
        const popup = ensurePopup();
        popup.querySelector("h2").textContent = word;
        popup.querySelector(".reading-translation-popover__eyebrow").textContent = loading ? "Translating" : "Selected text";
        popup.querySelector(".reading-translation-popover__body").innerHTML = html;
        popup.classList.add("is-open");
        positionPopup(popup, target);
    }

    function hidePopup() {
        document.getElementById("readingTranslationPopup")?.classList.remove("is-open");
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function nearestContextElement(target) {
        return target?.closest?.([
            ".cbt-passage-paragraph",
            ".cbt-paragraph-html",
            "p",
            "li",
            "blockquote",
            ".cbt-passage-copy",
            ".reading-passage",
            ".passage-content",
            ".passage-text",
            ".article-content",
            ".modern-passage",
            ".ielts-passage-panel",
            "[data-passage]",
            ".cbt-passage"
        ].join(","));
    }

    function extractSentence(paragraph, selectedText) {
        const text = compactText(paragraph, 1800);
        const selected = compactText(selectedText, 180);

        if (!text) {
            return selected;
        }

        const lowerText = text.toLowerCase();
        const lowerSelected = selected.toLowerCase();
        const selectedIndex = lowerSelected ? lowerText.indexOf(lowerSelected) : -1;

        if (selectedIndex === -1) {
            const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
            const fallback = sentences.find((sentence) =>
                sentence.toLowerCase().includes(lowerSelected)
            );
            return compactText(fallback || text, 700);
        }

        const before = text.slice(0, selectedIndex);
        const sentenceStartMark = Math.max(before.lastIndexOf("."), before.lastIndexOf("?"), before.lastIndexOf("!"));
        const start = sentenceStartMark === -1 ? 0 : sentenceStartMark + 1;
        const afterStart = selectedIndex + selected.length;
        const after = text.slice(afterStart);
        const endMatch = after.search(/[.!?](?:\s|$)/);
        const end = endMatch === -1
            ? Math.min(text.length, afterStart + 260)
            : afterStart + endMatch + 1;

        return compactText(text.slice(start, end), 700) || selected;
    }

    function contextForTarget(target, selectedText) {
        const contextElement = nearestContextElement(target);
        const passageElement = target?.closest?.("[data-passage-id], [data-passage], .cbt-passage, .reading-passage, .passage-content, .passage-text, .article-content, .modern-passage");
        const paragraph = compactText(contextElement?.textContent || passageElement?.textContent || selectedText, 1800);

        return {
            sentence: extractSentence(paragraph, selectedText),
            paragraph: paragraph || compactText(selectedText, 180)
        };
    }

    function normalizeTranslationRecord(data, fallback) {
        const selectedText = compactText(data?.selectedText || data?.word || fallback.selectedText, 180);
        const meaningInEnglish = compactText(data?.meaningInEnglish || data?.english_definition || data?.definition, 420);
        const uzbekTranslation = shortUzbekPhrase(data?.uzbekTranslation || data?.uzbek_translation || data?.translation);
        const contextualMeaningUzbek = shortUzbekPhrase(data?.contextualMeaningUzbek || "");
        const sentenceTranslationUzbek = compactText(data?.sentenceTranslationUzbek || "", 620);

        return {
            ...data,
            selectedText,
            meaningInEnglish,
            uzbekTranslation,
            contextualMeaningUzbek,
            sentenceTranslationUzbek,
            example: compactText(data?.example || data?.example_sentence || "", 260),
            partOfSpeech: compactText(data?.partOfSpeech || data?.part_of_speech || "", 80),
            definition: meaningInEnglish,
            english_definition: meaningInEnglish,
            translation: contextualMeaningUzbek || uzbekTranslation,
            uzbek_translation: contextualMeaningUzbek || uzbekTranslation
        };
    }

    function renderRecord(record) {
        const definition = record.meaningInEnglish || record.english_definition || record.definition || "";
        const translation = shortUzbekPhrase(record.contextualMeaningUzbek || record.uzbek_translation || record.uzbekTranslation || record.translation || "");
        const natural = shortUzbekPhrase(record.uzbekTranslation || record.translation || translation || "");
        const partOfSpeech = record.partOfSpeech || record.part_of_speech || "";
        const wordType = partOfSpeech || (String(record.selectedText || "").includes(" ") ? "phrase" : "word");
        return `
            <dl>
                <div>
                    <dt>Word type</dt>
                    <dd>${escapeHtml(wordType)}</dd>
                </div>
                <div>
                    <dt>Contextual Uzbek</dt>
                    <dd>${escapeHtml(translation || ERROR_MESSAGE)}</dd>
                </div>
                <div>
                    <dt>Natural Uzbek</dt>
                    <dd>${escapeHtml(natural || translation || ERROR_MESSAGE)}</dd>
                </div>
                <div>
                    <dt>Simple English</dt>
                    <dd>${escapeHtml(definition || ERROR_MESSAGE)}</dd>
                </div>
            </dl>
        `;
    }

    function passageIdFor(target) {
        const container = target.closest("[data-passage-id], [data-passage], .cbt-passage, .reading-passage, .passage-content, .passage-text, .article-content, .modern-passage");
        return container?.dataset?.passageId || container?.id || "reading-passage";
    }

    async function fetchTranslation(selectedText, target) {
        const testId = getReadingTestId();
        const passageId = passageIdFor(target);
        const owner = getReadingOwnerScope();
        const context = contextForTarget(target, selectedText);
        const entryKey = translationCacheEntryKey(selectedText, context.sentence);
        const cached = getCached(entryKey, testId, passageId);
        if (cached) return cached;

        const response = await fetch(TRANSLATE_API_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                selectedText,
                sentence: context.sentence,
                paragraph: context.paragraph,
                passageId,
                testId,
                attemptId: getScopedAttemptId(testId),
                ownerType: owner.ownerType,
                sessionId: owner.ownerType === "session" ? owner.ownerId : ""
            })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(data.error || "Translation lookup failed");
            error.status = response.status;
            error.endpoint = TRANSLATE_API_ENDPOINT;
            error.errorCode = data.errorCode || "";
            error.requestId = data.requestId || "";
            throw error;
        }

        const record = normalizeTranslationRecord(data, { selectedText });
        console.log("Context translation API response received", record);

        const definition = record.meaningInEnglish || record.definition || "";
        const translation = record.contextualMeaningUzbek || record.uzbekTranslation || record.translation || "";
        const noResult = !definition && !translation;

        if (noResult) {
            throw new Error("No translation result returned");
        }

        setCache(entryKey, record, testId, passageId);
        return record;
    }

    async function handleWordClick(event) {
        const target = event.target?.closest?.(`.${WORD_CLASS}, mark.ieltsx-highlight, .reading-highlight, .highlighted-word`);
        const isHighlightTarget = target?.matches?.("mark.ieltsx-highlight, .reading-highlight, .highlighted-word");
        if (!target) return;
        if (isHighlightTarget && !target.closest(PASSAGE_SELECTORS.join(","))) return;
        if (!isHighlightTarget && isInsideSkippedArea(target.parentElement)) return;

        if (target.matches(".cbt-vocab-word[data-vocab-word]") && target.closest(".cbt-passage.has-vocabulary")) {
            return;
        }

        const selectedText = compactText(target.textContent || target.dataset.word || "", 180);
        const word = normalizeWord(target.dataset.word || selectedText);
        if (!selectedText || !word) return;

        console.log(`Word clicked: ${word}`);
        showPopup(target, selectedText, "<p>Translating selected text...</p>", true);

        try {
            const record = await fetchTranslation(selectedText, target);
            showPopup(target, selectedText, renderRecord(record), false);
        } catch (error) {
            console.error("Reading translation failed", {
                message: error?.message || String(error),
                endpoint: error?.endpoint || TRANSLATE_API_ENDPOINT,
                status: error?.status || null,
                errorCode: error?.errorCode || "",
                requestId: error?.requestId || "",
                selectedText
            });
            showPopup(target, selectedText, `<p>${ERROR_MESSAGE}</p>`, false);
        }
    }

    function initializeReadingTranslation(root = document) {
        if (!isReadingPage()) return;
        if (document.body && (document.body.dataset.testMode === "full" || document.body.getAttribute("data-test-mode") === "full")) {
            console.log("Reading translation is disabled in full test mode");
            return;
        }

        ensureStyles();
        console.log("Reading translation initialized");

        const containers = findPassageContainers(root);
        containers.forEach((container) => {
            console.log("Passage container found", container);
            wrapWords(container);
        });

        if (!document.documentElement.dataset.readingTranslationClickBound) {
            document.documentElement.dataset.readingTranslationClickBound = "true";
            document.addEventListener("click", handleWordClick);
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") hidePopup();
                if ((event.key === "Enter" || event.key === " ") && event.target?.classList?.contains(WORD_CLASS)) {
                    event.preventDefault();
                    handleWordClick(event);
                }
            });
            window.addEventListener("resize", hidePopup);
            document.addEventListener("scroll", hidePopup, true);
        }

        if (!observer) {
            observer = new MutationObserver((mutations) => {
                const shouldProcess = mutations.some((mutation) => {
                    const target = mutation.target?.nodeType === Node.ELEMENT_NODE
                        ? mutation.target
                        : mutation.target?.parentElement;
                    return target && !target.closest("#readingTranslationPopup, #readingTranslationStyles");
                });
                if (!shouldProcess) return;
                if (scheduled) return;
                scheduled = true;
                window.requestAnimationFrame(() => {
                    scheduled = false;
                    initializeReadingTranslation(document);
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    window.initializeReadingTranslation = initializeReadingTranslation;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => initializeReadingTranslation());
    } else {
        initializeReadingTranslation();
    }
}());
