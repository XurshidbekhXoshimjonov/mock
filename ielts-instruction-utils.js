(function () {
    const LIMIT_CLASS = "ielts-instruction-limit";
    const LIMIT_PATTERN_SOURCE = [
        "NO MORE THAN\\s+THREE\\s+WORDS\\s+AND\\s*\\/\\s*OR\\s+NUMBERS?",
        "NO MORE THAN\\s+TWO\\s+WORDS\\s+AND\\s*\\/\\s*OR\\s+NUMBERS?",
        "NO MORE THAN\\s+ONE\\s+WORD\\s+AND\\s*\\/\\s*OR\\s+NUMBERS?",
        "NO MORE THAN\\s+THREE\\s+WORDS\\s+AND\\s*\\/\\s*OR\\s+A\\s+NUMBER",
        "NO MORE THAN\\s+TWO\\s+WORDS\\s+AND\\s*\\/\\s*OR\\s+A\\s+NUMBER",
        "NO MORE THAN\\s+ONE\\s+WORD\\s+AND\\s*\\/\\s*OR\\s+A\\s+NUMBER",
        "ONE\\s+WORD\\s+AND\\s*\\/\\s*OR\\s+A\\s+NUMBER",
        "ONE\\s+WORD\\s+AND\\s+A\\s+NUMBER",
        "NO MORE THAN\\s+THREE\\s+WORDS",
        "NO MORE THAN\\s+TWO\\s+WORDS",
        "NO MORE THAN\\s+ONE\\s+WORD",
        "ONE\\s+WORD\\s+ONLY",
        "ONE\\s+WORD",
        "CHOOSE\\s+TWO\\s+LETTERS?",
        "CHOOSE\\s+FIVE\\s+ANSWERS?",
        "A\\s+NUMBER",
        "[A-Z]\\s*[\\u2013\\u2014-]\\s*[A-Z]"
    ].join("|");

    function limitPattern() {
        return new RegExp(`\\b(${LIMIT_PATTERN_SOURCE})\\b`, "gi");
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function highlightEscapedHtml(value) {
        return String(value || "").replace(limitPattern(), (match) =>
            `<span class="${LIMIT_CLASS}">${match}</span>`
        );
    }

    function highlightText(value, options = {}) {
        const html = highlightEscapedHtml(escapeHtml(value));
        return options.preserveLineBreaks ? html.replace(/\n/g, "<br>") : html;
    }

    function highlightedTextFragment(documentRef, text) {
        const fragment = documentRef.createDocumentFragment();
        const matches = [...String(text || "").matchAll(limitPattern())];
        let cursor = 0;

        if (!matches.length) {
            fragment.appendChild(documentRef.createTextNode(text));
            return fragment;
        }

        matches.forEach((match) => {
            if (match.index > cursor) {
                fragment.appendChild(documentRef.createTextNode(text.slice(cursor, match.index)));
            }

            const span = documentRef.createElement("span");
            span.className = LIMIT_CLASS;
            span.textContent = match[0];
            fragment.appendChild(span);
            cursor = match.index + match[0].length;
        });

        if (cursor < text.length) {
            fragment.appendChild(documentRef.createTextNode(text.slice(cursor)));
        }

        return fragment;
    }

    function shouldSkipElement(element) {
        return ["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION"].includes(element.tagName)
            || element.classList?.contains(LIMIT_CLASS);
    }

    function highlightTextNodes(root, documentRef) {
        [...root.childNodes].forEach((node) => {
            if (node.nodeType === 3) {
                if (limitPattern().test(node.nodeValue || "")) {
                    node.replaceWith(highlightedTextFragment(documentRef, node.nodeValue || ""));
                }
                return;
            }

            if (node.nodeType === 1 && !shouldSkipElement(node)) {
                highlightTextNodes(node, documentRef);
            }
        });
    }

    function highlightHtml(html) {
        if (!html || typeof document === "undefined") {
            return highlightEscapedHtml(html);
        }

        const template = document.createElement("template");
        template.innerHTML = String(html);
        highlightTextNodes(template.content, document);
        return template.innerHTML;
    }

    window.IeltsInstructionHighlighter = {
        className: LIMIT_CLASS,
        highlightText,
        highlightHtml
    };
}());
