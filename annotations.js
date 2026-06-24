(function() {
    // Prevent double initialization
    if (window.ieltsxAnnotationsInitialized) return;
    window.ieltsxAnnotationsInitialized = true;

    // Stable selectors for containers
    const STABLE_SELECTORS = [
        '.cbt-passage-paragraph',
        '.cbt-paragraph-html',
        '.cbt-passage-title',
        '.cbt-question-copy',
        '.cbt-instruction-copy',
        '.cbt-rule-box',
        '.cbt-option-card',
        '.cbt-choice-instructions',
        '.cbt-choice-instructions-prompt',
        '.lc-instruction',
        '.lc-part-instruction',
        '.lc-question-text',
        '.lc-question-card',
        '.lc-choice-row',
        '.lc-matching-question-text',
        '.lc-matching-options',
        '.lc-map-fallback-row',
        '.lc-part-heading',
        'table',
        'p',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'li',
        'td',
        'th'
    ];

    // State Variables
    let currentConfig = null;
    let annotationsData = { highlights: [], notes: [] };
    let activeSelectionRange = null;
    let activeSelectedText = "";
    let activeContainerSelector = "";
    let activeStartOffset = 0;
    let activeEndOffset = 0;
    let editingNoteId = null;
    let isToolbarClicking = false;
    let domObserver = null;
    let mutationTimeout = null;

    // Helper functions to suspend and resume the mutation observer
    function suspendObserver() {
        if (domObserver) {
            domObserver.disconnect();
        }
    }

    function resumeObserver() {
        if (domObserver) {
            const targetNodes = [
                document.getElementById('readingAppRoot'),
                document.getElementById('listeningTestRoot')
            ].filter(Boolean);

            if (targetNodes.length === 0) {
                targetNodes.push(document.body);
            }

            targetNodes.forEach(node => {
                domObserver.observe(node, { childList: true, subtree: true });
            });
        }
    }

    // DOM Elements
    let toolbarEl = null;
    let drawerOverlayEl = null;
    let drawerEl = null;
    let modalOverlayEl = null;
    let toggleBtnEl = null;

    // --- Core Initialization ---
    function init() {
        // Find test config (skill, testId, attemptId)
        currentConfig = getTestConfig();
        loadAnnotations();

        // Inject HTML elements
        createToolbar();
        createDrawer();
        createModal();
        createToggleBtn();
        insertNotesButton();

        // Bind global event listeners
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchend', handleMouseUp);
        document.addEventListener('selectionchange', handleSelectionChange);

        document.addEventListener('mouseup', () => {
            setTimeout(() => {
                isToolbarClicking = false;
            }, 50);
        });

        // Listen for clicks on the documents to close popovers/modals/toolbar
        document.addEventListener('mousedown', handleGlobalMouseDown);

        // Setup MutationObserver to watch for DOM rebuilding (e.g. React passage switching)
        setupMutationObserver();

        // Initial restore
        setTimeout(() => {
            restoreAllAnnotations();
            insertNotesButton();
        }, 500);
    }

    // --- Config & Storage Helpers ---
    function getTestConfig() {
        const params = new URLSearchParams(window.location.search);
        const pathParts = window.location.pathname.split("/").filter(Boolean);
        const pathname = window.location.pathname.toLowerCase();
        const title = document.title.toLowerCase();
        
        let skill = 'reading';
        if (pathname.includes('writing') || params.get('skill') === 'writing' || document.body.dataset.practiceSkill === 'writing' || title.includes('writing')) {
            skill = 'writing';
        } else if (pathParts.includes('listening') || params.get('skill') === 'listening') {
            skill = 'listening';
        } else if (document.body.dataset.practiceSkill === 'listening' || title.includes('listening') || document.getElementById('listeningTestRoot')) {
            skill = 'listening';
        }
        
        let testId = params.get('id') || '';
        if (!testId) {
            if (pathParts.length >= 2 && (pathParts[0] === 'reading' || pathParts[0] === 'listening')) {
                testId = pathParts[1];
            }
        }
        if (!testId) {
            testId = 'practice';
        }

        if (skill === 'writing') {
            const taskNumber = getWritingTaskNumber();
            return {
                skill,
                testId,
                taskNumber,
                attemptId: `writing-${testId}-${taskNumber}`
            };
        }
        
        const attemptKey = `ieltsx_current_attempt_${skill}_${testId}`;
        let attemptId = sessionStorage.getItem(attemptKey);
        if (!attemptId) {
            // Check if there is an existing global attempt id on the page (for Reading React player)
            attemptId = window.readingAttemptId || `attempt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
            sessionStorage.setItem(attemptKey, attemptId);
        }
        
        return { skill, testId, attemptId };
    }

    function getWritingTaskNumber() {
        const explicitTask = window.IELTSX_WRITING_TASK_NUMBER || document.body.dataset.writingTaskNumber;
        if (explicitTask === 'task1' || explicitTask === 'task2') {
            return explicitTask;
        }

        const pathname = window.location.pathname.toLowerCase();
        if (pathname.includes('task-2') || pathname.includes('writing-task2')) {
            return 'task2';
        }

        const task2Stage = document.getElementById('stageTask2');
        if (task2Stage && window.getComputedStyle(task2Stage).display !== 'none') {
            return 'task2';
        }

        return 'task1';
    }

    function getStorageKey() {
        if (currentConfig.skill === 'writing') {
            return `writing_highlights_${currentConfig.testId}_${currentConfig.taskNumber}`;
        }
        return `ieltsx_annotations_${currentConfig.skill}_${currentConfig.testId}_${currentConfig.attemptId}`;
    }

    function sameConfig(a, b) {
        return Boolean(a && b)
            && a.skill === b.skill
            && a.testId === b.testId
            && a.attemptId === b.attemptId
            && (a.taskNumber || '') === (b.taskNumber || '');
    }

    function reloadAnnotationsForConfig() {
        const nextConfig = getTestConfig();
        if (sameConfig(nextConfig, currentConfig)) {
            return;
        }

        currentConfig = nextConfig;
        loadAnnotations();
        restoreAllAnnotations();
        updateToggleBtnBadge();
        insertNotesButton();
    }

    function setWritingTask(taskNumber) {
        if (taskNumber !== 'task1' && taskNumber !== 'task2') {
            return;
        }

        window.IELTSX_WRITING_TASK_NUMBER = taskNumber;
        reloadAnnotationsForConfig();
    }

    function clearWritingStorage(testId, taskNumber) {
        if (!testId || (taskNumber !== 'task1' && taskNumber !== 'task2')) {
            return;
        }

        localStorage.removeItem(`writing_highlights_${testId}_${taskNumber}`);

        if (currentConfig?.skill === 'writing'
            && currentConfig.testId === testId
            && currentConfig.taskNumber === taskNumber) {
            annotationsData = { highlights: [], notes: [] };
            restoreAllAnnotations();
            updateToggleBtnBadge();
            renderDrawerNotes();
        }
    }

    function loadAnnotations() {
        try {
            const stored = localStorage.getItem(getStorageKey());
            if (stored) {
                annotationsData = JSON.parse(stored);
                if (!annotationsData.highlights) annotationsData.highlights = [];
                if (!annotationsData.notes) annotationsData.notes = [];
            } else {
                annotationsData = { highlights: [], notes: [] };
            }
        } catch (e) {
            console.error("Failed to load annotations from localStorage", e);
            annotationsData = { highlights: [], notes: [] };
        }
    }

    function saveAnnotations() {
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(annotationsData));
            updateToggleBtnBadge();
            renderDrawerNotes();
        } catch (e) {
            console.error("Failed to save annotations to localStorage", e);
        }
    }

    // --- DOM Injection Creators ---
    function createToolbar() {
        toolbarEl = document.createElement('div');
        toolbarEl.className = 'ieltsx-toolbar';
        toolbarEl.style.display = 'none';
        toolbarEl.innerHTML = `
            <button class="ieltsx-toolbar-btn highlight-yellow" type="button">
                <span>🎨</span> Highlight
            </button>
            <div class="ieltsx-toolbar-divider"></div>
            <button class="ieltsx-toolbar-btn note-btn" type="button">
                <span>📝</span> Add Note
            </button>
            <div class="ieltsx-toolbar-divider remove-divider" style="display:none;"></div>
            <button class="ieltsx-toolbar-btn remove-btn" type="button" style="display:none;">
                <span>❌</span> Remove
            </button>
        `;
        document.body.appendChild(toolbarEl);

        // Bind button actions
        toolbarEl.querySelector('.highlight-yellow').addEventListener('click', () => applyHighlight('#fdba74'));
        toolbarEl.querySelector('.note-btn').addEventListener('click', () => openNoteModal());
        toolbarEl.querySelector('.remove-btn').addEventListener('click', () => removeSelectedHighlight());

        // Prevent selection collapsing on toolbar clicks
        toolbarEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
    }

    function createDrawer() {
        // Drawer Overlay
        drawerOverlayEl = document.createElement('div');
        drawerOverlayEl.className = 'ieltsx-drawer-overlay';
        document.body.appendChild(drawerOverlayEl);

        // Drawer Panel
        drawerEl = document.createElement('div');
        drawerEl.className = 'ieltsx-drawer';
        drawerEl.innerHTML = `
            <div class="ieltsx-drawer-header">
                <h2>📋 My Notes</h2>
                <button class="ieltsx-drawer-close" type="button">&times;</button>
            </div>
            <div class="ieltsx-drawer-content"></div>
            <div class="ieltsx-drawer-footer">
                <button class="ieltsx-btn ieltsx-btn-clear-all" type="button">🧹 Clear Notes & Highlights</button>
            </div>
        `;
        document.body.appendChild(drawerEl);

        // Close drawer actions
        drawerEl.querySelector('.ieltsx-drawer-close').addEventListener('click', closeDrawer);
        drawerOverlayEl.addEventListener('click', closeDrawer);

        // Clear all action
        drawerEl.querySelector('.ieltsx-btn-clear-all').addEventListener('click', clearAllAnnotations);
    }

    function createModal() {
        modalOverlayEl = document.createElement('div');
        modalOverlayEl.className = 'ieltsx-modal-overlay';
        modalOverlayEl.style.display = 'none';
        modalOverlayEl.innerHTML = `
            <div class="ieltsx-note-modal">
                <h3 class="ieltsx-modal-title">📝 Add Note</h3>
                <p class="ieltsx-modal-preview"></p>
                <textarea class="ieltsx-modal-textarea" placeholder="Type your note here..."></textarea>
                <div class="ieltsx-modal-actions">
                    <button class="ieltsx-btn ieltsx-btn-delete" type="button" style="display:none;">🗑️ Delete</button>
                    <button class="ieltsx-btn ieltsx-btn-cancel" type="button">Cancel</button>
                    <button class="ieltsx-btn ieltsx-btn-save" type="button">Save Note</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlayEl);

        // Bind modal actions
        modalOverlayEl.querySelector('.ieltsx-btn-cancel').addEventListener('click', closeNoteModal);
        modalOverlayEl.querySelector('.ieltsx-btn-save').addEventListener('click', saveNoteFromModal);
        modalOverlayEl.querySelector('.ieltsx-btn-delete').addEventListener('click', deleteNoteFromModal);
        
        // Prevent click inside modal from closing it
        modalOverlayEl.querySelector('.ieltsx-note-modal').addEventListener('mousedown', (e) => e.stopPropagation());
    }

    function createToggleBtn() {
        toggleBtnEl = document.createElement('button');
        toggleBtnEl.className = 'ieltsx-notes-toggle-btn';
        toggleBtnEl.type = 'button';
        toggleBtnEl.innerHTML = `
            <span>📋 Notes</span>
            <span class="ieltsx-notes-toggle-count">0</span>
        `;
        document.body.appendChild(toggleBtnEl);

        toggleBtnEl.addEventListener('click', openDrawer);
        updateToggleBtnBadge();
    }

    function insertNotesButton() {
        if (!toggleBtnEl) return;
        const dashboardBtn = document.querySelector('.cbt-header-actions [data-notes-anchor], .lc-header-actions [data-notes-anchor], .cbt-header-actions a, .lc-header-actions a, #viewerBack');
        if (!dashboardBtn) {
            if (toggleBtnEl.parentNode !== document.body) {
                document.body.appendChild(toggleBtnEl);
            }
            toggleBtnEl.className = 'ieltsx-notes-toggle-btn floating';
            toggleBtnEl.style.position = '';
            toggleBtnEl.style.top = '';
            toggleBtnEl.style.right = '';
            toggleBtnEl.style.margin = '';
            return;
        }

        const parent = dashboardBtn.parentNode;
        if (toggleBtnEl.parentNode !== parent) {
            parent.insertBefore(toggleBtnEl, dashboardBtn.nextSibling);
        }
        
        if (dashboardBtn.classList.contains('cbt-button')) {
            toggleBtnEl.className = 'cbt-button cbt-button--secondary ieltsx-notes-toggle-btn header-btn';
        } else if (dashboardBtn.classList.contains('lc-dashboard-button')) {
            toggleBtnEl.className = 'lc-dashboard-button ieltsx-notes-toggle-btn header-btn';
        } else {
            toggleBtnEl.className = 'ieltsx-notes-toggle-btn header-btn';
        }
        toggleBtnEl.style.position = 'static';
        toggleBtnEl.style.margin = '0 4px';
    }

    function updateToggleBtnBadge() {
        if (!toggleBtnEl) return;
        const count = annotationsData.notes.length;
        toggleBtnEl.querySelector('.ieltsx-notes-toggle-count').textContent = count;
        toggleBtnEl.style.display = 'flex';
        insertNotesButton();
    }

    // --- Drawer Operations ---
    function openDrawer() {
        renderDrawerNotes();
        drawerOverlayEl.style.display = 'block';
        setTimeout(() => drawerEl.classList.add('open'), 10);
    }

    function closeDrawer() {
        drawerEl.classList.remove('open');
        setTimeout(() => drawerOverlayEl.style.display = 'none', 300);
    }

    function renderDrawerNotes() {
        const contentEl = drawerEl.querySelector('.ieltsx-drawer-content');
        contentEl.innerHTML = "";

        if (annotationsData.notes.length === 0) {
            contentEl.innerHTML = `
                <div class="ieltsx-drawer-empty">
                    <span class="ieltsx-drawer-empty-icon">📝</span>
                    <p>No notes saved yet.</p>
                    <p style="font-size:12px; color:#64748b;">Select text in the passage or questions, and click "Add Note".</p>
                </div>
            `;
            return;
        }

        // Group notes by Part / Passage
        const groups = {};
        annotationsData.notes.forEach(note => {
            const partName = currentConfig.skill === 'reading' ? `Passage ${note.part || 1}` : `Part ${note.part || 1}`;
            if (!groups[partName]) groups[partName] = [];
            groups[partName].push(note);
        });

        // Render each group
        Object.keys(groups).sort().forEach(groupName => {
            const groupSection = document.createElement('div');
            groupSection.className = 'ieltsx-group-section';
            groupSection.innerHTML = `<h3 class="ieltsx-group-title">${groupName}</h3>`;

            const notesList = groups[groupName];
            notesList.sort((a, b) => (a.questionNumber || 99) - (b.questionNumber || 99) || (a.createdAt || '').localeCompare(b.createdAt || ''));

            notesList.forEach(note => {
                const noteItem = document.createElement('div');
                noteItem.className = 'ieltsx-note-item';
                noteItem.dataset.noteId = note.id;
                noteItem.innerHTML = `
                    <div class="ieltsx-note-item-meta">
                        ${note.questionNumber ? `<span class="ieltsx-note-item-q">Question ${note.questionNumber}</span>` : '<span>Text Note</span>'}
                        <span>${new Date(note.updatedAt || note.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p class="ieltsx-note-item-text">"${escapeHtml(note.selectedText)}"</p>
                    <p class="ieltsx-note-item-comment">${escapeHtml(note.note)}</p>
                    <div class="ieltsx-note-item-actions">
                        <button class="ieltsx-note-item-btn edit-btn" type="button">Edit</button>
                        <button class="ieltsx-note-item-btn delete-btn" type="button">Delete</button>
                    </div>
                `;

                // Scroll target into view on click
                noteItem.addEventListener('click', (e) => {
                    if (e.target.closest('.ieltsx-note-item-btn')) return; // ignore buttons
                    scrollToAnnotation(note);
                });

                // Bind note actions inside drawer
                noteItem.querySelector('.edit-btn').addEventListener('click', () => {
                    openNoteModal(note.id);
                });
                noteItem.querySelector('.delete-btn').addEventListener('click', () => {
                    deleteNote(note.id);
                });

                groupSection.appendChild(noteItem);
            });

            contentEl.appendChild(groupSection);
        });
    }

    function scrollToAnnotation(note) {
        if (!note.containerSelector) return;
        const container = document.querySelector(note.containerSelector);
        if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Temporary glow effect
            container.style.transition = 'outline 0.3s ease';
            container.style.outline = '2px dashed #6366f1';
            setTimeout(() => {
                container.style.outline = '';
            }, 1500);
        }
    }

    // --- Selection and Toolbar Event Handlers ---
    function handleMouseUp(e) {
        try {
            // If clicking inside toolbar or modal, do not re-evaluate selection
            if (e.target.closest('.ieltsx-toolbar') || e.target.closest('.ieltsx-modal-overlay') || e.target.closest('.ieltsx-drawer')) {
                return;
            }

            setTimeout(() => {
                const selection = window.getSelection();
                if (!selection || selection.isCollapsed) {
                    hideToolbar();
                    return;
                }

                const range = selection.getRangeAt(0);
                const selectedText = selection.toString().trim();

                if (!selectedText) {
                    hideToolbar();
                    return;
                }

                // Check if start and end are inside allowed areas and not in excluded nodes
                const startAllowed = isNodeAllowed(range.startContainer);
                const endAllowed = isNodeAllowed(range.endContainer);

                if (!startAllowed || !endAllowed) {
                    hideToolbar();
                    return;
                }

                // Capture selection details
                activeSelectionRange = range.cloneRange();
                activeSelectedText = selectedText;

                // Find stable container
                const stableContainer = getStableContainer(range.commonAncestorContainer);
                activeContainerSelector = getUniqueSelector(stableContainer);
                
                const offsets = getSelectionOffsets(stableContainer, range);
                activeStartOffset = offsets.startOffset;
                activeEndOffset = offsets.endOffset;

                // Position toolbar
                const rect = range.getBoundingClientRect();
                positionToolbar(rect);

                // Check if selection contains any highlighted element to show "Remove" option
                let hasHighlight = false;
                let checkNode = range.commonAncestorContainer;
                if (checkNode.nodeType === Node.TEXT_NODE) checkNode = checkNode.parentNode;
                
                if (checkNode.closest && checkNode.closest('mark.ieltsx-highlight')) {
                    hasHighlight = true;
                } else {
                    // Check child nodes of range
                    const textNodes = getTextNodesInRange(range);
                    hasHighlight = textNodes.some(node => node.parentNode && node.parentNode.closest && node.parentNode.closest('mark.ieltsx-highlight'));
                }

                const removeBtn = toolbarEl.querySelector('.remove-btn');
                const removeDivider = toolbarEl.querySelector('.remove-divider');
                if (hasHighlight) {
                    removeBtn.style.display = 'inline-flex';
                    removeDivider.style.display = 'block';
                } else {
                    removeBtn.style.display = 'none';
                    removeDivider.style.display = 'none';
                }
            }, 10);
        } catch (err) {
            console.error("Mouseup handler failed:", err);
        }
    }

    function handleSelectionChange() {
        if (isToolbarClicking) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            hideToolbar();
        }
    }

    function handleGlobalMouseDown(e) {
        // If clicking outside toolbar and not text selection, hide toolbar
        if (!e.target.closest('.ieltsx-toolbar') && !e.target.closest('.ieltsx-note-modal')) {
            // Do not immediately hide if selecting text
        }
    }

    function isNodeAllowed(node) {
        if (!node) return false;
        
        let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
        if (!el || el.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }
        
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'AUDIO') {
            return false;
        }
        
        // Excluded panels (navbar, timer, input panels, admin controls, toolbar/modal/drawer)
        if (el.closest && (
            el.closest('#globalNavbar') || 
            el.closest('.cbt-vocab-popover') || 
            el.closest('.lc-audio-start-panel') || 
            el.closest('.lc-timer') || 
            el.closest('.lc-audio-player') ||
            el.closest('.admin-controls') ||
            el.closest('.viewer-top') ||
            el.closest('.viewer-tabs') ||
            el.closest('.answer-panel') ||
            el.closest('.lc-review-summary') ||
            el.closest('.ieltsx-toolbar') || 
            el.closest('.ieltsx-modal-overlay') ||
            el.closest('.ieltsx-drawer') ||
            el.closest('button') ||
            el.closest('input') ||
            el.closest('textarea') ||
            el.closest('select')
        )) {
            return false;
        }
        
        return true;
    }

    function getStableContainer(node) {
        let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
        while (el) {
            if (el.tagName === 'MARK' && el.classList.contains('ieltsx-highlight')) {
                el = el.parentNode;
                continue;
            }
            
            for (const selector of STABLE_SELECTORS) {
                if (el.matches && el.matches(selector)) {
                    return el;
                }
            }
            
            if (el.id === 'readingAppRoot' || el.id === 'listeningTestRoot' || el.classList?.contains('cbt-shell')) {
                return el;
            }
            
            el = el.parentNode;
        }
        return document.body;
    }

    function getUniqueSelector(element) {
        if (element.id) {
            return '#' + element.id;
        }
        const path = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let selector = element.nodeName.toLowerCase();
            if (element.id) {
                selector += '#' + element.id;
                path.unshift(selector);
                break;
            } else {
                let sibCount = 0;
                let sibIndex = 0;
                for (let sib = element.previousSibling; sib; sib = sib.previousSibling) {
                    if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === element.nodeName) {
                        sibIndex++;
                    }
                }
                for (let sib = element.nextSibling; sib; sib = sib.nextSibling) {
                    if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === element.nodeName) {
                        sibCount++;
                    }
                }
                if (sibIndex > 0 || sibCount > 0) {
                    selector += `:nth-of-type(${sibIndex + 1})`;
                }
            }
            path.unshift(selector);
            element = element.parentNode;
        }
        return path.join(' > ');
    }

    function getTextNodeAndOffset(node, offset) {
        if (node.nodeType === Node.TEXT_NODE) {
            return { node, offset };
        }
        if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length > 0) {
            if (offset >= node.childNodes.length) {
                const lastChild = node.childNodes[node.childNodes.length - 1];
                return getLastTextNode(lastChild);
            } else {
                const child = node.childNodes[offset];
                return getFirstTextNode(child);
            }
        }
        return { node, offset };
    }

    function getFirstTextNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return { node, offset: 0 };
        }
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        if (walker.nextNode()) {
            return { node: walker.currentNode, offset: 0 };
        }
        return { node, offset: 0 };
    }

    function getLastTextNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return { node, offset: node.textContent.length };
        }
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        let lastNode = null;
        while (walker.nextNode()) {
            lastNode = walker.currentNode;
        }
        if (lastNode) {
            return { node: lastNode, offset: lastNode.textContent.length };
        }
        return { node, offset: 0 };
    }

    function getSelectionOffsets(stableContainer, range) {
        const start = getTextNodeAndOffset(range.startContainer, range.startOffset);
        const end = getTextNodeAndOffset(range.endContainer, range.endOffset);
        
        let startOffset = 0;
        let endOffset = 0;
        let charCount = 0;
        let foundStart = false;
        let foundEnd = false;
        
        const treeWalker = document.createTreeWalker(stableContainer, NodeFilter.SHOW_TEXT, null);
        
        while (treeWalker.nextNode()) {
            const node = treeWalker.currentNode;
            
            if (node === start.node) {
                startOffset = charCount + start.offset;
                foundStart = true;
            }
            
            if (node === end.node) {
                endOffset = charCount + end.offset;
                foundEnd = true;
            }
            
            if (foundStart && foundEnd) {
                break;
            }
            
            charCount += node.textContent.length;
        }
        
        if (!foundStart) startOffset = 0;
        if (!foundEnd) endOffset = charCount;
        
        return { startOffset, endOffset };
    }

    function positionToolbar(rect) {
        toolbarEl.style.display = 'flex';
        const tbWidth = toolbarEl.offsetWidth;
        const tbHeight = toolbarEl.offsetHeight;

        let left = rect.left + (rect.width / 2) - (tbWidth / 2) + window.scrollX;
        let top = rect.top - tbHeight - 10 + window.scrollY;

        // Keep inside screen viewport bounds
        if (left < 10) left = 10;
        if (left + tbWidth > window.innerWidth - 10) left = window.innerWidth - tbWidth - 10;
        if (top < 10) top = rect.bottom + 10 + window.scrollY;

        toolbarEl.style.left = `${left}px`;
        toolbarEl.style.top = `${top}px`;
    }

    function hideToolbar() {
        if (toolbarEl) toolbarEl.style.display = 'none';
    }

    // --- Highlighting Engine ---
    function getTextNodesInRange(range) {
        const container = range.commonAncestorContainer;
        const allTextNodes = [];
        
        function collectTextNodes(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.trim()) {
                    allTextNodes.push(node);
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Skip our own indicators/badges and hidden elements
                if (node.classList.contains('ieltsx-note-indicator') || 
                    node.classList.contains('ieltsx-q-note-badge') || 
                    node.classList.contains('ieltsx-toolbar') || 
                    node.classList.contains('ieltsx-note-modal') ||
                    node.classList.contains('ieltsx-drawer')) {
                    return;
                }
                for (let child = node.firstChild; child; child = child.nextSibling) {
                    collectTextNodes(child);
                }
            }
        }
        
        collectTextNodes(container.nodeType === Node.TEXT_NODE ? container.parentNode : container);
        
        return allTextNodes.filter(node => {
            if (node === range.startContainer && range.startOffset === node.textContent.length) {
                return false;
            }
            if (node === range.endContainer && range.endOffset === 0) {
                return false;
            }
            
            try {
                return range.intersectsNode(node);
            } catch (e) {
                const startComp = range.startContainer.compareDocumentPosition(node);
                const endComp = range.endContainer.compareDocumentPosition(node);
                const afterStart = (startComp & Node.DOCUMENT_POSITION_FOLLOWING) || (node === range.startContainer);
                const beforeEnd = (endComp & Node.DOCUMENT_POSITION_PRECEDING) || (node === range.endContainer);
                return afterStart && beforeEnd;
            }
        });
    }

    function highlightRange(range, highlightId, color) {
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;
        const textNodes = getTextNodesInRange(range);
        const marks = [];

        textNodes.forEach(node => {
            let nodeToWrap = node;
            
            if (node === startContainer && node === endContainer) {
                let targetNode = node;
                if (range.endOffset < node.textContent.length) {
                    targetNode.splitText(range.endOffset);
                }
                if (range.startOffset > 0) {
                    targetNode = targetNode.splitText(range.startOffset);
                }
                nodeToWrap = targetNode;
            } else if (node === startContainer) {
                let targetNode = node;
                if (range.startOffset > 0) {
                    targetNode = targetNode.splitText(range.startOffset);
                }
                nodeToWrap = targetNode;
            } else if (node === endContainer) {
                let targetNode = node;
                if (range.endOffset < node.textContent.length) {
                    targetNode.splitText(range.endOffset);
                }
                nodeToWrap = targetNode;
            }
            
            // Create mark wrapper
            const mark = document.createElement('mark');
            mark.className = 'ieltsx-highlight';
            mark.style.setProperty('background-color', color || 'rgba(251, 146, 60, 0.45)', 'important');
            mark.dataset.highlightId = highlightId;
            
            nodeToWrap.parentNode.insertBefore(mark, nodeToWrap);
            mark.appendChild(nodeToWrap);
            marks.push(mark);
        });
        
        return marks;
    }

    function applyHighlight(color) {
        try {
            if (!activeSelectionRange) return;

            const highlightId = 'h-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
            const part = getCurrentPart(activeSelectionRange.startContainer);
            const questionNumber = getClosestQuestionNumber(activeSelectionRange.startContainer);

            // Highlight DOM
            suspendObserver();
            try {
                highlightRange(activeSelectionRange, highlightId, color);
            } finally {
                resumeObserver();
            }

            // Save Highlight Data
            const highlightObj = {
                id: highlightId,
                skill: currentConfig.skill,
                testId: currentConfig.testId,
                attemptId: currentConfig.attemptId,
                taskNumber: currentConfig.taskNumber || null,
                part,
                questionNumber,
                selectedText: activeSelectedText,
                color,
                createdAt: new Date().toISOString(),
                // Extra serialization attributes for restoring
                containerSelector: activeContainerSelector,
                startOffset: activeStartOffset,
                endOffset: activeEndOffset
            };

            annotationsData.highlights.push(highlightObj);
            saveAnnotations();

            // Clear Selection
            window.getSelection().removeAllRanges();
            hideToolbar();
        } catch (err) {
            console.error("Highlighting action failed:", err);
            alert("Oops! Highlighting failed: " + err.message);
        }
    }

    function removeSelectedHighlight() {
        if (!activeSelectionRange) return;

        const textNodes = getTextNodesInRange(activeSelectionRange);
        const removedIds = new Set();

        textNodes.forEach(node => {
            const mark = node.parentNode.closest('mark.ieltsx-highlight');
            if (mark && mark.dataset.highlightId) {
                removedIds.add(mark.dataset.highlightId);
            }
        });

        if (removedIds.size > 0) {
            removedIds.forEach(id => removeHighlightById(id));
            saveAnnotations();
        }

        window.getSelection().removeAllRanges();
        hideToolbar();
    }

    function removeHighlightById(id) {
        suspendObserver();
        try {
            // 1. Remove from DOM
            const marks = document.querySelectorAll(`mark.ieltsx-highlight[data-highlight-id="${id}"]`);
            const parentsToNormalize = new Set();
            marks.forEach(mark => {
                const parent = mark.parentNode;
                if (!parent) return;
                parentsToNormalize.add(parent);
                while (mark.firstChild) {
                    parent.insertBefore(mark.firstChild, mark);
                }
                parent.removeChild(mark);
            });
            parentsToNormalize.forEach(parent => parent.normalize());

            // 2. Remove note indicators attached to it
            document.querySelectorAll(`.ieltsx-note-indicator[data-highlight-id="${id}"]`).forEach(ind => ind.remove());
        } finally {
            resumeObserver();
        }

        // 3. Remove from storage data
        annotationsData.highlights = annotationsData.highlights.filter(h => h.id !== id);
        
        // Also remove note associated with it if any
        annotationsData.notes = annotationsData.notes.filter(n => n.id !== id);
    }

    // --- Notes Operations & Popover Modal ---
    function openNoteModal(noteId = null) {
        editingNoteId = noteId;
        const modal = modalOverlayEl.querySelector('.ieltsx-note-modal');
        const previewEl = modalOverlayEl.querySelector('.ieltsx-modal-preview');
        const textareaEl = modalOverlayEl.querySelector('.ieltsx-modal-textarea');
        const titleEl = modalOverlayEl.querySelector('.ieltsx-modal-title');
        const deleteBtn = modalOverlayEl.querySelector('.ieltsx-btn-delete');

        if (noteId) {
            // Edit existing note
            const note = annotationsData.notes.find(n => n.id === noteId);
            if (!note) return;

            titleEl.innerHTML = '📝 Edit Note';
            previewEl.textContent = note.selectedText;
            textareaEl.value = note.note;
            deleteBtn.style.display = 'inline-flex';
        } else {
            // Add new note
            titleEl.innerHTML = '📝 Add Note';
            previewEl.textContent = activeSelectedText;
            textareaEl.value = "";
            deleteBtn.style.display = 'none';
        }

        hideToolbar();
        modalOverlayEl.style.display = 'flex';
        textareaEl.focus();
    }

    function closeNoteModal() {
        modalOverlayEl.style.display = 'none';
        editingNoteId = null;
    }

    function saveNoteFromModal() {
        const textareaEl = modalOverlayEl.querySelector('.ieltsx-modal-textarea');
        const noteText = textareaEl.value.trim();

        if (!noteText) {
            alert("Please type a note first.");
            return;
        }

        const now = new Date().toISOString();

        if (editingNoteId) {
            // Update existing
            const note = annotationsData.notes.find(n => n.id === editingNoteId);
            if (note) {
                note.note = noteText;
                note.updatedAt = now;
            }
        } else {
            // Create new Note
            // In order to show note indicators next to selected text, we automatically create a highlight
            // If the text is already highlighted, we can link it to that highlight ID.
            let highlightId = null;
            if (activeSelectionRange) {
                highlightId = 'h-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
                suspendObserver();
                try {
                    highlightRange(activeSelectionRange, highlightId, 'rgba(251, 146, 60, 0.2)'); // very soft orange highlight for notes
                } finally {
                    resumeObserver();
                }
                
                // Save highlight data
                annotationsData.highlights.push({
                    id: highlightId,
                    skill: currentConfig.skill,
                    testId: currentConfig.testId,
                    attemptId: currentConfig.attemptId,
                    taskNumber: currentConfig.taskNumber || null,
                    part: getCurrentPart(activeSelectionRange.startContainer),
                    questionNumber: getClosestQuestionNumber(activeSelectionRange.startContainer),
                    selectedText: activeSelectedText,
                    color: 'rgba(251, 146, 60, 0.2)',
                    createdAt: now,
                    containerSelector: activeContainerSelector,
                    startOffset: activeStartOffset,
                    endOffset: activeEndOffset
                });
            }

            const id = highlightId || ('n-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8));
            const part = activeSelectionRange ? getCurrentPart(activeSelectionRange.startContainer) : 1;
            const questionNumber = activeSelectionRange ? getClosestQuestionNumber(activeSelectionRange.startContainer) : null;

            const noteObj = {
                id,
                skill: currentConfig.skill,
                testId: currentConfig.testId,
                attemptId: currentConfig.attemptId,
                taskNumber: currentConfig.taskNumber || null,
                part,
                questionNumber,
                selectedText: activeSelectedText,
                note: noteText,
                createdAt: now,
                updatedAt: now,
                containerSelector: activeContainerSelector,
                startOffset: activeStartOffset,
                endOffset: activeEndOffset
            };

            annotationsData.notes.push(noteObj);
        }

        saveAnnotations();
        closeNoteModal();
        
        // Re-draw annotations to add/update indicators
        restoreAllAnnotations();

        window.getSelection().removeAllRanges();
    }

    function deleteNoteFromModal() {
        if (editingNoteId) {
            deleteNote(editingNoteId);
            closeNoteModal();
        }
    }

    function deleteNote(id) {
        // Delete note
        annotationsData.notes = annotationsData.notes.filter(n => n.id !== id);
        
        // Also clean up the highlight associated with this note ID if it was soft colored
        const h = annotationsData.highlights.find(x => x.id === id);
        if (h && h.color === 'rgba(253, 224, 71, 0.15)') {
            removeHighlightById(id);
        }

        // Remove indicator from DOM
        document.querySelectorAll(`.ieltsx-note-indicator[data-note-id="${id}"]`).forEach(ind => ind.remove());

        saveAnnotations();
        restoreAllAnnotations();
    }

    // --- Helper UI Fetchers ---
    function getCurrentPart(node) {
        if (node) {
            const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
            if (el && el.closest) {
                const partEl = el.closest('[data-part-number], [data-listening-part], .cbt-passage');
                if (partEl) {
                    if (partEl.dataset.partNumber) {
                        return parseInt(partEl.dataset.partNumber, 10) || 1;
                    }
                    if (partEl.dataset.listeningPart) {
                        return parseInt(partEl.dataset.listeningPart, 10) || 1;
                    }
                    const kicker = partEl.querySelector('.cbt-passage-kicker');
                    if (kicker) {
                        const match = kicker.textContent.match(/\d+/);
                        if (match) return parseInt(match[0], 10);
                    }
                }
            }
        }
        
        const activeReadingTab = document.querySelector('.cbt-part-tabs button.active, .cbt-part-tabs a.active');
        if (activeReadingTab) {
            const buttons = Array.from(activeReadingTab.parentNode.children);
            const idx = buttons.indexOf(activeReadingTab);
            if (idx !== -1) return idx + 1;
        }
        
        const activeListeningTab = document.querySelector('[data-listening-part-select].active, .lc-part-tabs button.active');
        if (activeListeningTab) {
            if (activeListeningTab.dataset.listeningPartSelect) {
                return parseInt(activeListeningTab.dataset.listeningPartSelect, 10) || 1;
            }
            const buttons = Array.from(activeListeningTab.parentNode.children);
            const idx = buttons.indexOf(activeListeningTab);
            if (idx !== -1) return idx + 1;
        }
        
        return 1;
    }

    function getClosestQuestionNumber(node) {
        if (!node) return null;
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
        if (el && el.closest) {
            const questionEl = el.closest('.cbt-question, .lc-question-card, [data-question]');
            if (questionEl) {
                const badge = questionEl.querySelector('.cbt-question-badge, .lc-question-badge, .lc-question-badge-range');
                if (badge) {
                    const num = parseInt(badge.textContent, 10);
                    if (!isNaN(num)) return num;
                }
                if (questionEl.dataset.question) {
                    const num = parseInt(questionEl.dataset.question, 10);
                    if (!isNaN(num)) return num;
                }
            }
        }
        
        const badges = Array.from(document.querySelectorAll('.cbt-question-badge, .lc-question-badge'));
        if (badges.length === 0) return null;
        
        let closestBadge = null;
        let minDistance = Infinity;
        
        const rectNode = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode);
        if (!rectNode.getBoundingClientRect) return null;
        const nodeRect = rectNode.getBoundingClientRect();
        const nodeY = nodeRect.top + nodeRect.height / 2;
        
        badges.forEach(badge => {
            const badgeRect = badge.getBoundingClientRect();
            const badgeY = badgeRect.top + badgeRect.height / 2;
            const dist = Math.abs(nodeY - badgeY);
            if (dist < minDistance) {
                minDistance = dist;
                closestBadge = badge;
            }
        });
        
        if (closestBadge) {
            const num = parseInt(closestBadge.textContent, 10);
            if (!isNaN(num)) return num;
        }
        
        return null;
    }

    // --- Restoration & Rendering Engine ---
    function restoreAllAnnotations() {
        suspendObserver();
        
        try {
            // Clean existing note indicators & badges on reload before rebuilding
            document.querySelectorAll('.ieltsx-note-indicator, .ieltsx-q-note-badge').forEach(el => el.remove());

            // Remove any old highlights in DOM that might be dangling to prevent duplicate layers
            const oldMarks = document.querySelectorAll('mark.ieltsx-highlight');
            const parentsToNormalize = new Set();
            oldMarks.forEach(mark => {
                const parent = mark.parentNode;
                if (!parent) return;
                parentsToNormalize.add(parent);
                while (mark.firstChild) {
                    parent.insertBefore(mark.firstChild, mark);
                }
                parent.removeChild(mark);
            });
            parentsToNormalize.forEach(parent => parent.normalize());

            // 1. Restore Highlights
            annotationsData.highlights.forEach(h => {
                restoreHighlight(h);
            });

            // 2. Restore Note Indicators
            annotationsData.notes.forEach(note => {
                // Append note indicators next to highlights
                const marks = document.querySelectorAll(`mark.ieltsx-highlight[data-highlight-id="${note.id}"]`);
                if (marks.length > 0) {
                    const lastMark = marks[marks.length - 1];
                    const indicator = document.createElement('span');
                    indicator.className = 'ieltsx-note-indicator';
                    indicator.dataset.noteId = note.id;
                    indicator.dataset.highlightId = note.id;
                    indicator.textContent = '📝';
                    indicator.title = note.note;
                    
                    // Open note modal on click
                    indicator.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openNoteModal(note.id);
                    });
                    
                    lastMark.parentNode.insertBefore(indicator, lastMark.nextSibling);
                }

                // Append pink badges next to closest Question Number badge
                if (note.questionNumber) {
                    // Find question badge in page
                    const badges = Array.from(document.querySelectorAll('.cbt-question-badge, .lc-question-badge'));
                    const qBadge = badges.find(b => parseInt(b.textContent, 10) === note.questionNumber);
                    if (qBadge && !qBadge.parentNode.querySelector(`.ieltsx-q-note-badge[data-note-id="${note.id}"]`)) {
                        const badge = document.createElement('span');
                        badge.className = 'ieltsx-q-note-badge';
                        badge.dataset.noteId = note.id;
                        badge.textContent = '✏️';
                        badge.title = `Note on Q${note.questionNumber}`;
                        badge.addEventListener('click', (e) => {
                            e.stopPropagation();
                            openNoteModal(note.id);
                        });
                        qBadge.parentNode.insertBefore(badge, qBadge.nextSibling);
                    }
                }
            });
        } finally {
            resumeObserver();
        }
    }

    function restoreHighlight(h) {
        if (!h.containerSelector) return;
        const container = document.querySelector(h.containerSelector);
        if (!container) return;

        let charIndex = 0;
        let startNode = null;
        let startNodeOffset = 0;
        let endNode = null;
        let endNodeOffset = 0;
        
        const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        
        while (treeWalker.nextNode()) {
            const node = treeWalker.currentNode;
            const nodeLength = node.textContent.length;
            
            if (!startNode && charIndex + nodeLength >= h.startOffset) {
                startNode = node;
                startNodeOffset = h.startOffset - charIndex;
            }
            
            if (startNode && charIndex + nodeLength >= h.endOffset) {
                endNode = node;
                endNodeOffset = h.endOffset - charIndex;
                break;
            }
            
            charIndex += nodeLength;
        }
        
        if (startNode && endNode) {
            try {
                const range = document.createRange();
                range.setStart(startNode, startNodeOffset);
                range.setEnd(endNode, endNodeOffset);
                
                // Draw in DOM
                highlightRange(range, h.id, h.color);
            } catch (e) {
                console.error("Failed to restore range for highlight", h, e);
            }
        }
    }

    function clearAllAnnotations() {
        if (confirm("Are you sure you want to clear all highlights and notes? This will start a fresh attempt session.")) {
            if (currentConfig.skill === 'writing') {
                localStorage.removeItem(getStorageKey());
                annotationsData = { highlights: [], notes: [] };
                restoreAllAnnotations();
                updateToggleBtnBadge();
                closeDrawer();
                return;
            }

            // Delete key from localStorage
            localStorage.removeItem(getStorageKey());
            
            // Reset active attempt ID in sessionStorage to start a completely new session
            const attemptKey = `ieltsx_current_attempt_${currentConfig.skill}_${currentConfig.testId}`;
            const newAttemptId = `attempt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
            sessionStorage.setItem(attemptKey, newAttemptId);
            
            // Reload configuration
            currentConfig.attemptId = newAttemptId;

            // Clear state data
            annotationsData = { highlights: [], notes: [] };

            // Restore/Clear DOM
            restoreAllAnnotations();
            
            // UI updates
            updateToggleBtnBadge();
            closeDrawer();
        }
    }

    // --- DOM Mutation Observer ---
    function setupMutationObserver() {
        const targetNodes = [
            document.getElementById('readingAppRoot'),
            document.getElementById('listeningTestRoot')
        ].filter(Boolean);

        if (targetNodes.length === 0) {
            targetNodes.push(document.body);
        }

        domObserver = new MutationObserver((mutations) => {
            // Check if any mutation is relevant (i.e. not inside header, timer, or audio player, and not our own toolbar/indicators)
            let hasRelevantMutation = false;
            for (const mutation of mutations) {
                const target = mutation.target;
                if (!target) continue;
                
                // Ignore mutations inside header, timer, toolbar, modal, drawer
                if (target.closest && (
                    target.closest('.cbt-header') ||
                    target.closest('.lc-header') ||
                    target.closest('.lc-timer') ||
                    target.closest('.ieltsx-toolbar') ||
                    target.closest('.ieltsx-modal-overlay') ||
                    target.closest('.ieltsx-drawer')
                )) {
                    continue;
                }
                
                // If it's a childList mutation, see if it's just our own elements being added/removed
                if (mutation.type === 'childList') {
                    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
                    const onlyOurs = nodes.every(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            return node.classList.contains('ieltsx-note-indicator') ||
                                   node.classList.contains('ieltsx-q-note-badge') ||
                                   node.classList.contains('ieltsx-highlight');
                        }
                        return false;
                    });
                    if (onlyOurs) {
                        continue;
                    }
                }
                
                hasRelevantMutation = true;
                break;
            }

            if (!hasRelevantMutation) return;

            // Debounce restoration
            if (mutationTimeout) clearTimeout(mutationTimeout);
            mutationTimeout = setTimeout(() => {
                // Check if config changed (e.g. user went to another test)
                const freshConfig = getTestConfig();
                if (!sameConfig(freshConfig, currentConfig)) {
                    currentConfig = freshConfig;
                    loadAnnotations();
                    updateToggleBtnBadge();
                }
                restoreAllAnnotations();
                insertNotesButton();
            }, 150);
        });

        targetNodes.forEach(node => {
            domObserver.observe(node, { childList: true, subtree: true });
        });
    }

    window.IeltsAnnotations = {
        setWritingTask,
        clearWritingStorage,
        refresh: reloadAnnotationsForConfig
    };

    document.addEventListener('ieltsx-writing-task-change', (event) => {
        setWritingTask(event.detail?.taskNumber);
    });

    // Escape HTML helper
    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Start everything on DOM Content Loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
