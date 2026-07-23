(() => {
    "use strict";

    const state = {
        context: null,
        conversations: [],
        memories: [],
        activeConversationId: null,
        messages: [],
        generating: false,
        searchTimer: null,
        conversationPagination: { hasMore: false, nextCursor: null },
        messagesPagination: { hasMore: false, nextCursor: null },
        conversationRequest: null,
        messageRequest: null,
        searchRequest: null,
        attachment: null
    };

    const $ = (selector) => document.querySelector(selector);
    const els = {
        sidebar: $("#coachSidebar"),
        backdrop: $("#drawerBackdrop"),
        mobileMenu: $("#mobileMenu"),
        sidebarClose: $("#sidebarClose"),
        newChat: $("#newChatButton"),
        search: $("#historySearch"),
        groups: $("#conversationGroups"),
        welcome: $("#welcomeState"),
        messages: $("#messageList"),
        scroll: $("#messagesScroll"),
        typing: $("#typingCard"),
        composer: $("#composer"),
        input: $("#messageInput"),
        send: $("#sendButton"),
        attach: $("#attachImageButton"),
        attachmentInput: $("#imageAttachmentInput"),
        attachmentBox: $("#imageAttachment"),
        attachmentPreview: $("#imageAttachmentPreview"),
        attachmentName: $("#imageAttachmentName"),
        attachmentRemove: $("#removeImageAttachment"),
        optionsButton: $("#chatOptions"),
        optionsMenu: $("#optionsMenu"),
        memoryButton: $("#memoryButton"),
        memoryDialog: $("#memoryDialog"),
        memoryClose: $("#memoryClose"),
        memoryList: $("#memoryList"),
        toast: $("#toast")
    };

    function icon(name) {
        const paths = {
            sparkles: '<path d="m12 3-1.7 4.3L6 9l4.3 1.7L12 15l1.7-4.3L18 9l-4.3-1.7L12 3Z"></path><path d="m5 15-.8 2.2L2 18l2.2.8L5 21l.8-2.2L8 18l-2.2-.8L5 15Z"></path>',
            calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
            rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path>',
            book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"></path>',
            chart: '<path d="M3 3v18h18"></path><path d="m7 16 4-5 3 3 5-7"></path>'
        };
        return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
    }

    document.querySelectorAll("[data-icon]").forEach((node) => {
        node.innerHTML = icon(node.dataset.icon);
    });

    async function api(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            credentials: "include",
            cache: "no-store",
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {})
            }
        });
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
        if (!response.ok) {
            const error = new Error(data.message || data.error || "Request failed.");
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    function showToast(message) {
        els.toast.textContent = message;
        els.toast.hidden = false;
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => { els.toast.hidden = true; }, 3200);
    }

    function displayName(user) {
        return user?.name || user?.fullName || [user?.firstName, user?.familyName].filter(Boolean).join(" ") || user?.username || "IELTSX Student";
    }

    function groupLabel(dateValue) {
        const date = new Date(dateValue);
        const today = new Date();
        const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const days = Math.round((startToday - startDate) / 86400000);
        if (days <= 0) return "Today";
        if (days === 1) return "Yesterday";
        if (days <= 7) return "This week";
        return "Earlier";
    }

    const examples = {
        Today: ["Analyse my progress", "Create today’s plan"],
        Yesterday: ["Review my mistakes", "Vocabulary suggestions"],
        "This week": ["Speaking feedback", "Target band update"]
    };

    let historyContextMenu = null;

    function closeHistoryContextMenu() {
        historyContextMenu?.remove();
        historyContextMenu = null;
    }

    function openHistoryContextMenu(event, conversation) {
        event.preventDefault();
        event.stopPropagation();
        closeHistoryContextMenu();
        const menu = document.createElement("div");
        menu.className = "history-context-menu";
        menu.setAttribute("role", "menu");
        const remove = document.createElement("button");
        remove.type = "button";
        remove.setAttribute("role", "menuitem");
        remove.textContent = "Delete chat";
        remove.addEventListener("click", () => {
            closeHistoryContextMenu();
            deleteConversation(conversation.id);
        });
        menu.append(remove);
        document.body.append(menu);
        const bounds = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8))}px`;
        historyContextMenu = menu;
        remove.focus();
    }

    function renderConversations() {
        els.groups.replaceChildren();
        if (state.context?.access?.premium !== true) {
            const locked = document.createElement("div");
            locked.className = "history-premium-lock";
            locked.innerHTML = `${icon("sparkles")}<strong>Premium chats</strong><span>Upgrade to create, search, and continue AI Coach conversations.</span><a href="/premium">View Premium</a>`;
            els.groups.append(locked);
            return;
        }
        const grouped = new Map();
        state.conversations.forEach((conversation) => {
            const label = groupLabel(conversation.lastMessageAt || conversation.createdAt);
            if (!grouped.has(label)) grouped.set(label, []);
            grouped.get(label).push(conversation);
        });
        const labels = ["Today", "Yesterday", "This week", "Earlier"];
        const hasSearch = Boolean(els.search.value.trim());
        labels.forEach((label) => {
            const items = grouped.get(label) || [];
            const exampleItems = !state.conversations.length && !hasSearch ? (examples[label] || []) : [];
            if (!items.length && !exampleItems.length) return;
            const section = document.createElement("section");
            section.className = "history-group";
            const heading = document.createElement("h3");
            heading.textContent = label;
            section.append(heading);
            items.forEach((conversation) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = `history-item${state.activeConversationId === conversation.id ? " is-active" : ""}`;
                button.textContent = conversation.title;
                button.title = conversation.title;
                button.addEventListener("click", () => selectConversation(conversation.id));
                button.addEventListener("contextmenu", (event) => openHistoryContextMenu(event, conversation));
                section.append(button);
            });
            exampleItems.forEach((text) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "history-item";
                button.textContent = text;
                button.addEventListener("click", () => sendPrompt(text));
                section.append(button);
            });
            els.groups.append(section);
        });
        if (!els.groups.children.length) {
            const empty = document.createElement("p");
            empty.className = "history-empty";
            empty.textContent = hasSearch ? "No matching conversations." : "Start a new conversation with your AI Coach.";
            els.groups.append(empty);
        }
        if (state.conversationPagination.hasMore && !hasSearch) {
            const more = document.createElement("button");
            more.type = "button";
            more.className = "history-load-more";
            more.textContent = "Load older chats";
            more.addEventListener("click", loadOlderConversations);
            els.groups.append(more);
        }
    }

    function renderHistorySkeleton() {
        els.groups.innerHTML = `
            <div class="history-skeleton" aria-label="Loading conversations">
                <span></span><span></span><span></span><span></span>
            </div>
        `;
    }

    function renderMessageSkeleton() {
        els.welcome.hidden = true;
        els.messages.innerHTML = `
            <div class="message-skeleton" aria-label="Loading messages">
                <span></span><span></span><span></span>
            </div>
        `;
    }

    function renderContext() {
        const dashboard = state.context.dashboard;
        if (!dashboard) return;
        document.querySelectorAll(".context-card.is-loading").forEach((card) => card.classList.remove("is-loading"));
        $("#overallBand").textContent = dashboard.overallBand == null ? "—" : dashboard.overallBand.toFixed(1);
        $("#testsTaken").textContent = dashboard.testsTaken;
        $("#improvement").textContent = dashboard.averageImprovement == null ? "—" : `${dashboard.averageImprovement > 0 ? "+" : ""}${dashboard.averageImprovement}`;
        $("#studyStreak").textContent = dashboard.studyPlan.streak || 0;
        $("#progressEmpty").hidden = dashboard.hasProgress;
        const chart = $("#miniChart");
        chart.replaceChildren();
        if (dashboard.chart.length) {
            dashboard.chart.forEach((point) => {
                const bar = document.createElement("span");
                bar.className = "mini-bar";
                bar.style.height = `${Math.max(8, (Number(point.value) / 9) * 100)}%`;
                bar.title = `${point.label}: Band ${Number(point.value).toFixed(1)}`;
                chart.append(bar);
            });
        }
        const plan = dashboard.studyPlan;
        const percent = plan.totalTasks ? Math.round(plan.completedTasks / plan.totalTasks * 100) : 0;
        $("#planPercent").textContent = `${percent}%`;
        $("#planCount").textContent = `${plan.completedTasks || 0} of ${plan.totalTasks || 0} completed`;
        $("#planProgress").style.width = `${percent}%`;
        const tasks = $("#todayTasks");
        tasks.replaceChildren();
        if (!plan.today.length) {
            const empty = document.createElement("p");
            empty.textContent = "No tasks scheduled for today.";
            tasks.append(empty);
        } else {
            plan.today.slice(0, 4).forEach((task) => {
                const row = document.createElement("div");
                row.className = `today-task${task.status === "completed" ? " is-complete" : ""}`;
                const dot = document.createElement("i");
                const title = document.createElement("b");
                title.textContent = task.title;
                const duration = document.createElement("span");
                duration.textContent = `${task.durationMinutes} min`;
                row.append(dot, title, duration);
                tasks.append(row);
            });
        }
    }

    function renderAccess() {
        const old = $(".premium-access-card");
        if (old) old.remove();
        const access = state.context.access;
        const gatedControls = [
            els.newChat,
            els.search,
            els.input,
            els.optionsButton,
            els.memoryButton,
            ...document.querySelectorAll("#quickPrompts button, #quickActions button, .composer button")
        ];
        gatedControls.forEach((control) => { control.disabled = !access.premium; });
        if (access.premium) {
            els.input.placeholder = "Message IELTSX AI Coach…";
            resizeInput();
            return;
        }
        els.input.placeholder = "AI Coach requires Premium";
        els.send.disabled = true;
        const card = document.createElement("section");
        card.className = "premium-access-card";
        card.style.cssText = "width:100%;margin:18px 0 0;padding:14px 16px;border:1px solid #bfdbfe;border-radius:13px;background:#eff6ff;text-align:left;color:#1e40af;font-size:10.5px;line-height:1.55";
        card.innerHTML = '<strong style="display:block;margin-bottom:3px;font-size:11.5px">AI Coach is a Premium feature</strong><span>Upgrade to unlock unlimited conversations and IELTSX learning actions.</span> <a href="/premium" style="color:#1d4ed8;font-weight:800">View Premium</a>';
        els.welcome.querySelector(".quick-prompts").before(card);
    }

    function setUser() {
        const user = state.context.user;
        const name = displayName(user);
        $("#userName").textContent = name;
        $("#userAvatar").textContent = name.trim().charAt(0).toUpperCase() || "U";
        $("#userStatus").textContent = state.context.access.premium ? "Premium member" : "Free plan";
    }

    function timeLabel(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function createScoreCards(card) {
        const wrap = document.createElement("div");
        if (card.empty) {
            const notice = document.createElement("p");
            notice.className = "data-notice";
            notice.textContent = card.notice;
            wrap.append(notice);
            return wrap;
        }
        wrap.className = "score-grid";
        card.skills.forEach((skill) => {
            const item = document.createElement("div");
            item.className = "score-card";
            const label = document.createElement("span");
            label.textContent = skill.label;
            const value = document.createElement("strong");
            value.textContent = skill.value == null ? "—" : skill.value.toFixed(1);
            item.append(label, value);
            wrap.append(item);
        });
        return wrap;
    }

    function createTaskCard(card) {
        const wrap = document.createElement("section");
        wrap.className = "task-card";
        const title = document.createElement("h4");
        title.textContent = card.title || "Study plan";
        const list = document.createElement("div");
        list.className = "task-list";
        (card.tasks || []).forEach((task, index) => {
            const row = document.createElement("div");
            row.className = "task-row";
            const number = document.createElement("span");
            number.className = "task-index";
            number.textContent = index + 1;
            const copy = document.createElement("div");
            const strong = document.createElement("strong");
            strong.textContent = task.title;
            const small = document.createElement("small");
            small.textContent = `${task.durationMinutes} minutes`;
            copy.append(strong, small);
            row.append(number, copy);
            list.append(row);
        });
        wrap.append(title, list);
        return wrap;
    }

    function createMistakeCard(card) {
        const wrap = document.createElement("div");
        wrap.className = "mistake-list";
        if (!(card.items || []).length) {
            const notice = document.createElement("p");
            notice.className = "data-notice";
            notice.textContent = "No saved mistakes are available yet.";
            wrap.append(notice);
            return wrap;
        }
        card.items.forEach((mistake) => {
            const item = document.createElement("div");
            item.className = "mistake-item";
            item.textContent = `${mistake.skill ? `${mistake.skill[0].toUpperCase()}${mistake.skill.slice(1)} · ` : ""}${mistake.type}${mistake.questionNumber ? ` · Q${mistake.questionNumber}` : ""}`;
            wrap.append(item);
        });
        return wrap;
    }

    function createActions(payload) {
        const actions = [...(payload.actions || []), ...(payload.links || [])];
        if (!actions.length) return null;
        const wrap = document.createElement("div");
        wrap.className = "message-actions";
        actions.forEach((action, index) => {
            if (action.href) {
                const link = document.createElement("a");
                link.href = action.href;
                link.textContent = action.label;
                wrap.append(link);
                return;
            }
            const button = document.createElement("button");
            button.type = "button";
            button.className = index === 0 ? "primary" : "";
            button.textContent = action.label;
            button.addEventListener("click", () => confirmAction(action, button));
            wrap.append(button);
        });
        return wrap;
    }

    function renderRichText(value) {
        const fragment = document.createDocumentFragment();
        const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
        let index = 0;

        function appendTextBlock(tag, text, className = "") {
            const node = document.createElement(tag);
            if (className) node.className = className;
            node.textContent = text;
            fragment.append(node);
        }

        while (index < lines.length) {
            const line = lines[index];
            if (!line.trim()) {
                index += 1;
                continue;
            }
            if (line.trim().startsWith("```")) {
                const language = line.trim().slice(3).trim();
                const codeLines = [];
                index += 1;
                while (index < lines.length && !lines[index].trim().startsWith("```")) {
                    codeLines.push(lines[index]);
                    index += 1;
                }
                index += 1;
                const pre = document.createElement("pre");
                const code = document.createElement("code");
                if (language) code.dataset.language = language;
                code.textContent = codeLines.join("\n");
                pre.append(code);
                fragment.append(pre);
                continue;
            }
            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            if (heading) {
                appendTextBlock(`h${Math.min(heading[1].length + 2, 5)}`, heading[2]);
                index += 1;
                continue;
            }
            if (/^>\s?/.test(line)) {
                const quoteLines = [];
                while (index < lines.length && /^>\s?/.test(lines[index])) {
                    quoteLines.push(lines[index].replace(/^>\s?/, ""));
                    index += 1;
                }
                appendTextBlock("blockquote", quoteLines.join("\n"));
                continue;
            }
            if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
                const ordered = /^\s*\d+[.)]\s+/.test(line);
                const list = document.createElement(ordered ? "ol" : "ul");
                const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
                while (index < lines.length && pattern.test(lines[index])) {
                    const item = document.createElement("li");
                    item.textContent = lines[index].replace(pattern, "");
                    list.append(item);
                    index += 1;
                }
                fragment.append(list);
                continue;
            }
            const nextLine = lines[index + 1] || "";
            if (line.includes("|") && /^\s*\|?[\s:-]+(?:\|[\s:-]+)+\|?\s*$/.test(nextLine)) {
                const table = document.createElement("table");
                const head = document.createElement("thead");
                const headRow = document.createElement("tr");
                const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
                cells.forEach((cell) => {
                    const th = document.createElement("th");
                    th.textContent = cell;
                    headRow.append(th);
                });
                head.append(headRow);
                table.append(head);
                index += 2;
                const body = document.createElement("tbody");
                while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
                    const row = document.createElement("tr");
                    lines[index].split("|").map((cell) => cell.trim()).filter(Boolean).forEach((cell) => {
                        const td = document.createElement("td");
                        td.textContent = cell;
                        row.append(td);
                    });
                    body.append(row);
                    index += 1;
                }
                table.append(body);
                fragment.append(table);
                continue;
            }
            const paragraphLines = [line.trim()];
            index += 1;
            while (
                index < lines.length
                && lines[index].trim()
                && !/^(#{1,3})\s+|^>\s?|^\s*[-*]\s+|^\s*\d+[.)]\s+|^```/.test(lines[index])
            ) {
                paragraphLines.push(lines[index].trim());
                index += 1;
            }
            appendTextBlock("p", paragraphLines.join(" "));
        }
        return fragment;
    }

    function renderMessage(message) {
        const row = document.createElement("article");
        row.className = `message-row ${message.role}`;
        if (message.role === "assistant") {
            const avatar = document.createElement("div");
            avatar.className = "ai-avatar";
            avatar.textContent = "AI";
            row.append(avatar);
        }
        const content = document.createElement("div");
        content.className = "message-content";
        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        const attachment = message.payload?.attachment;
        if (attachment?.type === "image" && attachment.dataUrl) {
            const image = document.createElement("img");
            image.className = "message-attachment";
            image.src = attachment.dataUrl;
            image.alt = attachment.name || "Attached image";
            bubble.append(image);
        }
        if (message.role === "assistant") bubble.append(renderRichText(message.content));
        else bubble.append(document.createTextNode(message.content));
        content.append(bubble);
        const payload = message.payload || {};
        if ((payload.cards || []).length) {
            const cards = document.createElement("div");
            cards.className = "message-cards";
            payload.cards.forEach((card) => {
                if (card.type === "progress") cards.append(createScoreCards(card));
                else if (card.type === "taskPlan") cards.append(createTaskCard(card));
                else if (card.type === "mistakes") cards.append(createMistakeCard(card));
            });
            content.append(cards);
        }
        const actions = createActions(payload);
        if (actions) content.append(actions);
        if (payload.retryable) {
            const retryWrap = document.createElement("div");
            retryWrap.className = "message-actions";
            const retry = document.createElement("button");
            retry.type = "button";
            retry.textContent = "Retry";
            retry.addEventListener("click", () => {
                const messageIndex = state.messages.findIndex((item) => item.id === message.id);
                const previousUserMessage = state.messages.slice(0, messageIndex).reverse().find((item) => item.role === "user");
                if (previousUserMessage) sendPrompt(previousUserMessage.content, previousUserMessage.payload?.attachment || null);
            });
            retryWrap.append(retry);
            content.append(retryWrap);
        }
        const time = document.createElement("time");
        time.className = "message-time";
        time.dateTime = message.createdAt || "";
        time.textContent = timeLabel(message.createdAt);
        content.append(time);
        row.append(content);
        els.messages.append(row);
    }

    function renderMessages() {
        els.messages.replaceChildren();
        if (state.messagesPagination.hasMore) {
            const older = document.createElement("button");
            older.type = "button";
            older.className = "messages-load-older";
            older.textContent = "Load older messages";
            older.addEventListener("click", loadOlderMessages);
            els.messages.append(older);
        }
        state.messages.forEach(renderMessage);
        els.welcome.hidden = state.messages.length > 0;
        requestAnimationFrame(scrollLatest);
    }

    function scrollLatest() {
        els.scroll.scrollTop = els.scroll.scrollHeight;
    }

    async function selectConversation(id) {
        state.messageRequest?.abort();
        const controller = new AbortController();
        state.messageRequest = controller;
        try {
            renderMessageSkeleton();
            const data = await api(`/api/ai-coach/conversations/${encodeURIComponent(id)}/messages?limit=30`, { signal: controller.signal });
            if (controller.signal.aborted) return;
            state.activeConversationId = id;
            state.messages = data.messages || [];
            state.messagesPagination = data.pagination || { hasMore: false, nextCursor: null };
            renderConversations();
            renderMessages();
            closeDrawer();
        } catch (error) {
            if (error.name === "AbortError") return;
            showToast(error.message);
        } finally {
            if (state.messageRequest === controller) state.messageRequest = null;
        }
    }

    async function loadOlderMessages() {
        if (!state.activeConversationId || !state.messagesPagination.hasMore || !state.messagesPagination.nextCursor) return;
        const data = await api(
            `/api/ai-coach/conversations/${encodeURIComponent(state.activeConversationId)}/messages?limit=30&before=${encodeURIComponent(state.messagesPagination.nextCursor)}`
        );
        state.messages = [...(data.messages || []), ...state.messages];
        state.messagesPagination = data.pagination || { hasMore: false, nextCursor: null };
        renderMessages();
    }

    async function loadOlderConversations() {
        if (!state.conversationPagination.hasMore || !state.conversationPagination.nextCursor) return;
        const data = await api(`/api/ai-coach/conversations?limit=15&before=${encodeURIComponent(state.conversationPagination.nextCursor)}`);
        const known = new Set(state.conversations.map((item) => item.id));
        state.conversations.push(...(data.conversations || []).filter((item) => !known.has(item.id)));
        state.conversationPagination = data.pagination || { hasMore: false, nextCursor: null };
        renderConversations();
    }

    async function createConversation() {
        const data = await api("/api/ai-coach/conversations", { method: "POST", body: "{}" });
        state.conversations.unshift(data.conversation);
        state.activeConversationId = data.conversation.id;
        state.messages = [];
        state.messagesPagination = { hasMore: false, nextCursor: null };
        renderConversations();
        renderMessages();
        closeDrawer();
        els.input.focus();
        return data.conversation;
    }

    async function ensureConversation() {
        if (state.activeConversationId) return state.activeConversationId;
        return (await createConversation()).id;
    }

    function setGenerating(value) {
        state.generating = value;
        const premium = state.context?.access?.premium === true;
        els.input.disabled = value || !premium;
        els.attach.disabled = value || !premium;
        els.attachmentRemove.disabled = value;
        els.send.disabled = value || !premium || (!els.input.value.trim() && !state.attachment);
        els.typing.hidden = !value;
        if (value) requestAnimationFrame(scrollLatest);
    }

    async function sendPrompt(text, suppliedAttachment = state.attachment) {
        if (state.generating || (!String(text).trim() && !suppliedAttachment)) return;
        if (state.context?.access?.premium !== true) {
            showToast("AI Coach requires Premium.");
            return;
        }
        const message = String(text).trim();
        const attachment = suppliedAttachment;
        els.input.value = "";
        resizeInput();
        try {
            const conversationId = await ensureConversation();
            const optimistic = {
                id: `temp-${Date.now()}`,
                role: "user",
                content: message || `Image: ${attachment.name || "image"}`,
                payload: attachment ? { attachment } : {},
                createdAt: new Date().toISOString()
            };
            state.messages.push(optimistic);
            renderMessages();
            setGenerating(true);
            const data = await api(`/api/ai-coach/conversations/${encodeURIComponent(conversationId)}/messages`, {
                method: "POST",
                body: JSON.stringify({ message, image: attachment })
            });
            state.messages[state.messages.length - 1] = data.userMessage;
            state.messages.push(data.assistantMessage);
            state.context.access = data.access;
            if (data.conversation) {
                state.conversations = [
                    data.conversation,
                    ...state.conversations.filter((item) => item.id !== data.conversation.id)
                ];
            }
            renderMessages();
            renderAccess();
            renderConversations();
            if (attachment === state.attachment) clearAttachment();
        } catch (error) {
            const index = state.messages.findIndex((item) => String(item.id).startsWith("temp-"));
            if (index >= 0) state.messages.splice(index, 1);
            renderMessages();
            if (!els.input.value) els.input.value = message;
            resizeInput();
            if (error.data?.code === "AI_COACH_DEMO_LIMIT") {
                showToast("Your 3-message demo is complete. Upgrade to Premium for unlimited AI Coach access.");
            } else {
                showToast(error.message);
            }
        } finally {
            setGenerating(false);
            els.input.focus();
        }
    }

    async function confirmAction(action, button) {
        if (!action.id || state.generating) return;
        const confirmed = window.confirm(`${action.label} will update your IELTSX data. Continue?`);
        if (!confirmed) return;
        button.disabled = true;
        const oldText = button.textContent;
        button.textContent = "Saving…";
        try {
            const data = await api(`/api/ai-coach/actions/${encodeURIComponent(action.id)}/confirm`, { method: "POST", body: "{}" });
            button.textContent = "Saved";
            const dashboardData = await api("/api/ai-coach/dashboard");
            state.context.dashboard = dashboardData.dashboard;
            renderContext();
            showToast(data.result?.addedTasks ? `${data.result.addedTasks} tasks added to Study Plan.` : "IELTSX data updated.");
        } catch (error) {
            button.disabled = false;
            button.textContent = oldText;
            showToast(error.message);
        }
    }

    function resizeInput() {
        els.input.style.height = "auto";
        els.input.style.height = `${Math.min(els.input.scrollHeight, 120)}px`;
        els.send.disabled = state.generating || state.context?.access?.premium !== true || (!els.input.value.trim() && !state.attachment);
    }

    function clearAttachment() {
        state.attachment = null;
        els.attachmentInput.value = "";
        els.attachmentPreview.removeAttribute("src");
        els.attachmentName.textContent = "";
        els.attachmentBox.hidden = true;
        resizeInput();
    }

    function selectAttachment(file) {
        if (!file) return;
        const allowed = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
        if (!allowed.has(file.type)) {
            showToast("Please choose a PNG, JPEG, GIF, or WebP image.");
            els.attachmentInput.value = "";
            return;
        }
        if (file.size > 3 * 1024 * 1024) {
            showToast("The image must be 3 MB or smaller.");
            els.attachmentInput.value = "";
            return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            state.attachment = {
                type: "image",
                name: file.name || "image",
                mimeType: file.type,
                size: file.size,
                dataUrl: String(reader.result || "")
            };
            els.attachmentPreview.src = state.attachment.dataUrl;
            els.attachmentName.textContent = `${state.attachment.name} · ${(file.size / 1024).toFixed(0)} KB`;
            els.attachmentBox.hidden = false;
            resizeInput();
        });
        reader.addEventListener("error", () => showToast("The image could not be read."));
        reader.readAsDataURL(file);
    }

    function openDrawer() {
        els.sidebar.classList.add("is-open");
        els.backdrop.hidden = false;
    }

    function closeDrawer() {
        els.sidebar.classList.remove("is-open");
        els.backdrop.hidden = true;
    }

    function renderMemories() {
        els.memoryList.replaceChildren();
        const labels = {
            preferredStudyTime: "Preferred study time",
            examDate: "Exam date",
            weakestSkill: "Weakest skill",
            dailyAvailableMinutes: "Daily available study time"
        };
        if (!state.memories.length) {
            const empty = document.createElement("div");
            empty.className = "memory-empty";
            empty.textContent = "No learning preferences have been saved. Conversations are not memorized automatically.";
            els.memoryList.append(empty);
            return;
        }
        state.memories.forEach((memory) => {
            const item = document.createElement("div");
            item.className = "memory-item";
            const copy = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = labels[memory.key] || memory.key;
            const value = document.createElement("span");
            value.textContent = String(memory.value);
            copy.append(title, value);
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Delete";
            remove.addEventListener("click", async () => {
                if (!window.confirm("Delete this saved AI memory?")) return;
                try {
                    await api(`/api/ai-coach/memories/${encodeURIComponent(memory.id)}`, { method: "DELETE" });
                    state.memories = state.memories.filter((itemMemory) => itemMemory.id !== memory.id);
                    renderMemories();
                } catch (error) { showToast(error.message); }
            });
            item.append(copy, remove);
            els.memoryList.append(item);
        });
    }

    async function renameConversation() {
        if (!state.activeConversationId) return;
        const current = state.conversations.find((item) => item.id === state.activeConversationId);
        const title = window.prompt("Conversation name", current?.title || "");
        if (!title?.trim()) return;
        try {
            const data = await api(`/api/ai-coach/conversations/${encodeURIComponent(state.activeConversationId)}`, {
                method: "PATCH", body: JSON.stringify({ title: title.trim() })
            });
            state.conversations = state.conversations.map((item) => item.id === data.conversation.id ? data.conversation : item);
            renderConversations();
        } catch (error) { showToast(error.message); }
    }

    async function deleteConversation(conversationId = state.activeConversationId) {
        if (!conversationId || !window.confirm("Delete this conversation and all of its messages?")) return;
        try {
            await api(`/api/ai-coach/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
            state.conversations = state.conversations.filter((item) => item.id !== conversationId);
            if (state.activeConversationId === conversationId) {
                state.activeConversationId = null;
                state.messages = [];
                state.messagesPagination = { hasMore: false, nextCursor: null };
            }
            renderConversations();
            renderMessages();
        } catch (error) { showToast(error.message); }
    }

    async function init() {
        try {
            document.querySelectorAll(".context-card").forEach((card) => card.classList.add("is-loading"));
            renderHistorySkeleton();
            const bootstrap = await api("/api/ai-coach/bootstrap");
            state.context = { ...bootstrap, dashboard: null };
            setUser();
            renderAccess();
            renderConversations();
            if (bootstrap.access.premium) {
                const [dashboardData, conversationData] = await Promise.all([
                    api("/api/ai-coach/dashboard"),
                    api("/api/ai-coach/conversations?limit=15")
                ]);
                state.context.dashboard = dashboardData.dashboard;
                state.conversations = conversationData.conversations || [];
                state.conversationPagination = conversationData.pagination || { hasMore: false, nextCursor: null };
                renderContext();
                renderConversations();
            } else {
                document.querySelectorAll(".context-card").forEach((card) => card.classList.remove("is-loading"));
            }
        } catch (error) {
            if (error.status === 401) {
                window.location.href = `/login?redirect=${encodeURIComponent("/ai-coach")}`;
                return;
            }
            showToast(error.message);
        }
    }

    els.newChat.addEventListener("click", () => createConversation().catch((error) => showToast(error.message)));
    els.composer.addEventListener("submit", (event) => {
        event.preventDefault();
        sendPrompt(els.input.value);
    });
    els.attach.addEventListener("click", () => els.attachmentInput.click());
    els.attachmentInput.addEventListener("change", () => selectAttachment(els.attachmentInput.files?.[0]));
    els.attachmentRemove.addEventListener("click", clearAttachment);
    els.input.addEventListener("input", resizeInput);
    els.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!els.send.disabled) els.composer.requestSubmit();
        }
    });
    $("#quickPrompts").addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (button) sendPrompt(button.textContent);
    });
    $("#quickActions").addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (button) sendPrompt(button.textContent);
    });
    els.search.addEventListener("input", () => {
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(async () => {
            state.searchRequest?.abort();
            const controller = new AbortController();
            state.searchRequest = controller;
            try {
                const data = await api(`/api/ai-coach/conversations?limit=15&search=${encodeURIComponent(els.search.value.trim())}`, { signal: controller.signal });
                if (controller.signal.aborted) return;
                state.conversations = data.conversations;
                state.conversationPagination = data.pagination || { hasMore: false, nextCursor: null };
                renderConversations();
            } catch (error) {
                if (error.name !== "AbortError") showToast(error.message);
            }
        }, 220);
    });
    els.mobileMenu.addEventListener("click", openDrawer);
    els.sidebarClose.addEventListener("click", closeDrawer);
    els.backdrop.addEventListener("click", closeDrawer);
    els.optionsButton.addEventListener("click", (event) => {
        event.stopPropagation();
        els.optionsMenu.hidden = !els.optionsMenu.hidden;
    });
    els.optionsMenu.addEventListener("click", (event) => {
        const action = event.target.closest("button")?.dataset.action;
        els.optionsMenu.hidden = true;
        if (action === "rename") renameConversation();
        if (action === "delete") deleteConversation();
    });
    document.addEventListener("click", () => {
        els.optionsMenu.hidden = true;
        closeHistoryContextMenu();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeHistoryContextMenu();
    });
    window.addEventListener("blur", closeHistoryContextMenu);
    els.memoryButton.addEventListener("click", async () => {
        try {
            const data = await api("/api/ai-coach/memories");
            state.memories = data.memories || [];
        } catch (error) {
            showToast(error.message);
        }
        renderMemories();
        els.memoryDialog.showModal();
    });
    els.memoryClose.addEventListener("click", () => els.memoryDialog.close());
    els.memoryDialog.addEventListener("click", (event) => {
        if (event.target === els.memoryDialog) els.memoryDialog.close();
    });
    window.visualViewport?.addEventListener("resize", () => {
        document.documentElement.style.setProperty("--viewport-height", `${window.visualViewport.height}px`);
        requestAnimationFrame(scrollLatest);
    });

    resizeInput();
    init();
})();
