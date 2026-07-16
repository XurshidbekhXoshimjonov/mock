const ListeningComponents = (() => {
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

    function highlightInstruction(value) {
        return window.IeltsInstructionHighlighter
            ? window.IeltsInstructionHighlighter.highlightText(value, { preserveLineBreaks: true })
            : escapeHtml(value).replace(/\n/g, "<br>");
    }

    function answerInput(questionNumber, options = [], className = "") {
        const number = Number(questionNumber);
        
        // If className is passed as second arg (compatibility helper)
        if (typeof options === "string") {
            className = options;
            options = [];
        }

        if (Array.isArray(options) && options.length > 0) {
            const optionTags = options.map((opt) => {
                const letter = opt.letter || opt.value || "";
                const text = opt.text || opt.html || letter;
                const cleanText = text === letter ? "" : ` - ${text}`;
                return `<option value="${escapeHtml(letter)}">${escapeHtml(letter)}${escapeHtml(cleanText)}</option>`;
            }).join("");

            return `<span class="lc-answer-inline ${className}" id="question-${number}" data-question="${number}">
                <select class="lc-inline-select" id="q${number}" name="q${number}" aria-label="Answer ${number}">
                    <option value="">Select</option>
                    ${optionTags}
                </select>
                <span class="lc-question-badge">${number}</span>
            </span>`;
        }

        return `<span class="lc-answer-inline ${className}" id="question-${number}" data-question="${number}"><span class="lc-question-badge">${number}</span><input class="lc-answer-input" id="q${number}" name="q${number}" type="text" autocomplete="off" aria-label="Answer ${number}"></span>`;
    }

    function renderPlaceholderText(value, options = []) {
        let text = String(value || "");
        
        // Unescape common HTML entities first to avoid double-escaping bugs
        text = text
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");

        const parts = [];
        let lastIndex = 0;

        for (const match of text.matchAll(/\{\{(\d{1,2})\}\}/g)) {
            parts.push(escapeHtml(text.slice(lastIndex, match.index)));
            parts.push(answerInput(match[1], options));
            lastIndex = match.index + match[0].length;
        }

        parts.push(escapeHtml(text.slice(lastIndex)));
        return parts.join("")
            .replace(/&lt;strong&gt;/gi, "<strong>")
            .replace(/&lt;\/strong&gt;/gi, "</strong>")
            .replace(/&lt;b&gt;/gi, "<strong>")
            .replace(/&lt;\/b&gt;/gi, "</strong>")
            .replace(/&lt;u&gt;/gi, "<u>")
            .replace(/&lt;\/u&gt;/gi, "</u>")
            .replace(/&lt;i&gt;/gi, "<em>")
            .replace(/&lt;\/i&gt;/gi, "</em>")
            .replace(/&lt;em&gt;/gi, "<em>")
            .replace(/&lt;\/em&gt;/gi, "</em>")
            .replace(/&lt;ul&gt;/gi, "<ul>")
            .replace(/&lt;\/ul&gt;/gi, "</ul>")
            .replace(/&lt;li&gt;/gi, "<li>")
            .replace(/&lt;\/li&gt;/gi, "</li>")
            .replace(/&lt;br\s*\/?\s*(?:&gt;|>)/gi, "<br>")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&amp;/g, "&")
            .replace(/\n/g, "<br>");
    }

    function renderMixedParts(parts, options = []) {
        return (parts || []).map((part) => {
            if (part.type === "input") {
                return answerInput(part.questionNumber, options);
            }

            return renderPlaceholderText(part.text || "", options);
        }).join("");
    }

    function renderValue(value, options = []) {
        if (typeof value === "string") {
            return renderPlaceholderText(value, options);
        }

        if (!value || value.type === "text") {
            return renderPlaceholderText(value?.text || "", options);
        }

        if (value.type === "input") {
            return answerInput(value.questionNumber, options);
        }

        if (value.type === "mixed") {
            return renderMixedParts(value.parts, options);
        }

        return "";
    }

    function blockHeading(block) {
        return `<div class="lc-block-heading">
            <h3>${escapeHtml(block.questionRange || block.title || "Questions")}</h3>
            ${block.instruction ? `<p class="lc-instruction">${highlightInstruction(block.instruction)}</p>` : ""}
        </div>`;
    }

    function blockImage(block) {
        if (!block.imageUrl) return "";
        return `<div class="lc-block-image-container" style="margin-bottom: 20px; text-align: center;">
            <img loading="lazy" decoding="async" src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.title || "Question image")}" style="max-width: 100%; height: auto; border-radius: 8px;">
        </div>`;
    }

    function blockCard(block, content, extraClass = "") {
        const showImg = block.imageUrl && !extraClass.includes("lc-matching-block") && !extraClass.includes("lc-map-labelling");
        return `<section class="lc-question-card ${extraClass}" data-block-id="${escapeHtml(block.id || "")}">
            ${blockHeading(block)}
            ${showImg ? blockImage(block) : ""}
            ${content}
        </section>`;
    }

    function splitMultipleSelectInstruction(instruction, questionText) {
        const rawInstruction = String(instruction || "").trim();
        const rawQuestion = String(questionText || "").trim();

        if (!rawInstruction) {
            return { instruction: "", question: rawQuestion };
        }

        const rangePattern = /\b\d{1,2}\s*[-–—]\s*\d{1,2}\b/;
        const rangeMatch = rawInstruction.match(rangePattern);

        if (rawQuestion && rawInstruction.includes(rawQuestion)) {
            const beforeQuestion = rawInstruction
                .slice(0, rawInstruction.indexOf(rawQuestion))
                .replace(rangePattern, "")
                .trim()
                .replace(/\s*[.,:;]+\s*$/, ".");

            return {
                instruction: beforeQuestion,
                question: rawQuestion
            };
        }

        if (rangeMatch) {
            const instructionOnly = rawInstruction
                .slice(0, rangeMatch.index)
                .trim()
                .replace(/\s*[.,:;]+\s*$/, ".");
            const questionOnly = rawInstruction
                .slice(rangeMatch.index + rangeMatch[0].length)
                .trim();

            return {
                instruction: instructionOnly,
                question: rawQuestion || questionOnly
            };
        }

        return {
            instruction: rawInstruction,
            question: rawQuestion
        };
    }

    function plainText(value) {
        return String(value || "").replace(/<[^>]+>/g, "").trim();
    }

    function looksLikeInstructionTitle(value) {
        const text = plainText(value);
        return /^(complete|write|choose|listen|answer|read|look|label|match)\b/i.test(text)
            || /\b(for each answer|correct answers?|answer sheet)\b/i.test(text);
    }

    function canUseAsNoteTitle(value) {
        const text = plainText(value);
        return text
            && !looksLikeInstructionTitle(text)
            && !/^\s*[-*]\s+/.test(String(value || ""))
            && !/\{\{\d{1,2}\}\}/.test(String(value || ""))
            && !/^<strong>[\s\S]*<\/strong>$/i.test(String(value || "").trim());
    }

    function cleanOptionText(value) {
        return String(value || "").replace(/^[-–—]\s*/, "").trim();
    }

    function isFlowChartMatchingBlock(block) {
        return /flow\s*-\s*chart|flowchart/i.test(block.instruction || "")
            || (block.content || []).some((line) => /\{\{\d{1,2}\}\}/.test(String(line || "")));
    }

    function flowchartAnswerInput(questionNumber, options = []) {
        const number = Number(questionNumber);
        const optionTags = (options || []).map((option) => {
            const letter = escapeHtml(option.letter || "");
            const text = escapeHtml(cleanOptionText(option.text || ""));
            return `<option value="${letter}">${letter}${text ? ` - ${text}` : ""}</option>`;
        }).join("");

        return `<span class="lc-flowchart-answer" id="question-${number}" data-question="${number}">
            <select class="lc-flowchart-select" id="q${number}" name="q${number}" aria-label="Answer ${number}">
                <option value="">Select</option>
                ${optionTags}
            </select>
            <span class="lc-question-badge">${number}</span>
        </span>`;
    }

    function renderFlowchartText(value, options = []) {
        let text = String(value || "");
        
        // Unescape common HTML entities first to avoid double-escaping bugs
        text = text
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");

        const parts = [];
        let lastIndex = 0;

        for (const match of text.matchAll(/\{\{(\d{1,2})\}\}/g)) {
            parts.push(escapeHtml(text.slice(lastIndex, match.index)));
            parts.push(flowchartAnswerInput(match[1], options));
            lastIndex = match.index + match[0].length;
        }

        parts.push(escapeHtml(text.slice(lastIndex)));
        return parts.join("")
            .replace(/&lt;strong&gt;/gi, "<strong>")
            .replace(/&lt;\/strong&gt;/gi, "</strong>")
            .replace(/&lt;b&gt;/gi, "<strong>")
            .replace(/&lt;\/b&gt;/gi, "</strong>")
            .replace(/&lt;u&gt;/gi, "<u>")
            .replace(/&lt;\/u&gt;/gi, "</u>")
            .replace(/&lt;i&gt;/gi, "<em>")
            .replace(/&lt;\/i&gt;/gi, "</em>")
            .replace(/&lt;em&gt;/gi, "<em>")
            .replace(/&lt;\/em&gt;/gi, "</em>")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&amp;/g, "&")
            .replace(/\n/g, "<br>");
    }

    function flowchartLineFromQuestion(question) {
        const number = Number(question.questionNumber || question.number);
        const text = String(question.text || question.question || "").trim();
        const placeholder = `{{${number}}}`;

        if (/top on a world map/i.test(text)) {
            return text.replace(/\btop\s+on\b/i, `top ${placeholder} on`);
        }
        if (/different$/i.test(text)) {
            return `${text} ${placeholder}`;
        }
        if (/\bpossible\s+to\b/i.test(text)) {
            return text.replace(/\bpossible\s+to\b/i, `possible ${placeholder} to`);
        }
        if (/\ba\s+about\b/i.test(text)) {
            return text.replace(/\ba\s+about\b/i, `a ${placeholder} about`);
        }
        if (/\bthe\s+of\b/i.test(text)) {
            return text.replace(/\bthe\s+of\b/i, `the ${placeholder} of`);
        }
        return `${text} ${placeholder}`.trim();
    }

    function flowchartInstructionText(instruction) {
        return String(instruction || "")
            .replace(/\s+Options\b[\s\S]*$/i, "")
            .replace(/\.\s+(Choose\b)/i, ".\n$1")
            .trim();
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
        const splitInstruction = splitMultipleSelectInstruction(block.instruction, block.question);
        const instruction = splitInstruction.instruction;
        const questionText = splitInstruction.question;
        
        const groupName = `multi-${escapeHtml(block.id || block.questionNumber || "")}`;
        const questionNumbers = [
            Number(block.questionNumber),
            ...(block.answerQuestions || []).map((question) => Number(question.questionNumber))
        ].filter((number, index, numbers) => number && numbers.indexOf(number) === index);
        
        const rangeNumbers = questionNumbers.length > 1
            ? `${questionNumbers[0]}-${questionNumbers[questionNumbers.length - 1]}`
            : String(questionNumbers[0] || "");
            
        const formattedQuestion = `<p class="lc-question-text lc-question-text--large">
            <span class="lc-question-badge-range">${rangeNumbers}</span>
            ${questionText ? `<span>${escapeHtml(questionText)}</span>` : ""}
        </p>`;

        const options = (block.options || []).map((option) => `<label class="lc-choice-row">
            <span class="lc-letter-badge">${escapeHtml(option.letter || "")}</span>
            <input type="checkbox" name="${groupName}" value="${escapeHtml(option.letter || "")}">
            <span>${escapeHtml(option.text || "")}</span>
        </label>`).join("");

        const blockClone = {
            ...block,
            instruction: instruction
        };

        return blockCard(blockClone, `
            ${formattedQuestion}
            <div class="lc-choice-list lc-multiple-select" data-max-selections="${Number(block.maxSelections) || 2}" data-question-numbers="${questionNumbers.join(",")}">
                ${options}
            </div>
            <p class="lc-selection-message" aria-live="polite"></p>
        `, "lc-multiple-select-block");
    }

    function SentenceCompletionInlineBlock(block) {
        let sentences = [];
        if (Array.isArray(block.content) && block.content.length) {
            sentences = block.content;
        } else if (Array.isArray(block.questions) && block.questions.length) {
            sentences = block.questions.map((q) => q.question || q.text || "");
        } else {
            sentences = String(block.content || "").split(/\n+/).filter(Boolean);
        }
        const content = sentences.map((sentence) =>
            `<p class="lc-inline-sentence">${renderPlaceholderText(sentence, block.options)}</p>`
        ).join("");

        return blockCard(block, `<div class="lc-sentence-list">${content}</div>`, "lc-sentence-completion");
    }

    function MultipleChoiceBlock(block) {
        if (Array.isArray(block.questions) && block.questions.length) {
            const firstQ = block.questions[0];
            const hasSameShortOptions = block.questions.every((q) => {
                const qOpts = q.options || block.options || [];
                const firstOpts = firstQ.options || block.options || [];
                if (!qOpts.length || qOpts.length !== firstOpts.length) return false;
                return qOpts.every((opt, i) => {
                    const firstOpt = firstOpts[i];
                    const cleanText = String(opt.text || "").trim();
                    return opt.letter === firstOpt.letter && (cleanText === "" || cleanText === opt.letter || cleanText.length <= 1);
                });
            });

            if (hasSameShortOptions && block.questions.length > 1) {
                let cleanInstruction = block.instruction || "";
                let optionsBoxHtml = "";

                // Detect option list in instruction (e.g. "Types of accommodation A the flat B the house C the hostel")
                const listRegex = /(Types of\s+([A-Za-z0-9\s]+?))?\s*\b(A\b\s+.*?)(?=\s*\bB\b|$)\s*\b(B\b\s+.*?)(?=\s*\bC\b|$)\s*\b(C\b\s+.*?)(?=\s*\bD\b|$)(?:\s*\b(D\b\s+.*?)(?=\s*\bE\b|$))?(?:\s*\b(E\b\s+.*?)(?=\s*\bF\b|$))?(?:\s*\b(F\b\s+.*?)(?=$))?$/i;
                const match = cleanInstruction.match(listRegex);
                if (match) {
                    const matchedText = match[0];
                    cleanInstruction = cleanInstruction.replace(matchedText, "").trim().replace(/\s*[.,:;]+\s*$/, ".");
                    
                    const title = match[2] ? `Types of ${match[2].trim()}` : "Options";
                    const optionsList = [];
                    for (let i = 3; i <= 9; i++) {
                        if (match[i]) {
                            const optionStr = match[i].trim();
                            // Split letter prefix if formatted like "A the flat"
                            const letterMatch = optionStr.match(/^([A-F])\b\s*(.+)$/i);
                            if (letterMatch) {
                                optionsList.push(`<li><span class="lc-letter-badge">${letterMatch[1]}</span><span>${escapeHtml(letterMatch[2])}</span></li>`);
                            } else {
                                optionsList.push(`<li>${escapeHtml(optionStr)}</li>`);
                            }
                        }
                    }

                    optionsBoxHtml = `
                        <div class="lc-mcq-grid-options-box">
                            <h4>${escapeHtml(title)}</h4>
                            <ul class="lc-mcq-grid-options-list">
                                ${optionsList.join("")}
                            </ul>
                        </div>
                    `;
                }

                const firstOpts = firstQ.options || block.options || [];
                const colHeaders = firstOpts.map((opt) => `<th>${escapeHtml(opt.letter)}</th>`).join("");
                const rows = block.questions.map((q) => {
                    const qNum = Number(q.questionNumber || q.number);
                    const name = `q${qNum}`;
                    const qOpts = q.options || block.options || [];
                    const radioCells = qOpts.map((opt) => {
                        return `<td>
                            <label class="lc-choice-row lc-choice-row--grid">
                                <input type="radio" name="${name}" value="${escapeHtml(opt.letter)}">
                            </label>
                        </td>`;
                    }).join("");

                    return `<tr id="question-${qNum}">
                        <td><span class="lc-question-badge">${qNum}</span> ${escapeHtml(q.question || q.text || "")}</td>
                        ${radioCells}
                    </tr>`;
                }).join("");

                const blockClone = {
                    ...block,
                    instruction: cleanInstruction
                };

                const tableHtml = `
                    ${optionsBoxHtml}
                    <div class="lc-table-scroll">
                        <table class="lc-mcq-grid-table">
                            <thead>
                                <tr>
                                    <th>Features</th>
                                    ${colHeaders}
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                `;
                return blockCard(blockClone, tableHtml, "lc-multiple-choice-grid-block");
            }


            const html = block.questions.map((q) => {
                const qNum = Number(q.questionNumber || q.number);
                const name = `q${qNum}`;
                const options = (q.options || block.options || []).map((option) => `<label class="lc-choice-row">
                    <span class="lc-letter-badge">${escapeHtml(option.letter || "")}</span>
                    <input type="radio" name="${name}" value="${escapeHtml(option.letter || "")}">
                    <span>${escapeHtml(option.text || "")}</span>
                </label>`).join("");

                return `
                    <div class="lc-mcq-item" id="question-${qNum}" style="margin-bottom: 24px;">
                        <p class="lc-question-text"><span class="lc-question-badge">${qNum}</span>${escapeHtml(q.question || "")}</p>
                        <div class="lc-choice-list">${options}</div>
                    </div>
                `;
            }).join("");
            return blockCard(block, html, "lc-multiple-choice-block");
        }

        const name = `q${Number(block.questionNumber)}`;
        const options = (block.options || []).map((option) => `<label class="lc-choice-row">
            <span class="lc-letter-badge">${escapeHtml(option.letter || "")}</span>
            <input type="radio" name="${name}" value="${escapeHtml(option.letter || "")}">
            <span>${escapeHtml(option.text || "")}</span>
        </label>`).join("");

        return blockCard(block, `
            <p class="lc-question-text" id="question-${Number(block.questionNumber)}"><span class="lc-question-badge">${Number(block.questionNumber)}</span>${escapeHtml(block.question || "")}</p>
            <div class="lc-choice-list">${options}</div>
        `, "lc-multiple-choice-block");
    }


    function NoteCompletionBlock(block) {
        let lines = [];
        if (Array.isArray(block.content) && block.content.length) {
            lines = block.content;
        } else if (Array.isArray(block.questions) && block.questions.length) {
            lines = block.questions.map((q) => q.question || q.text || "");
        } else {
            lines = String(block.content || "").split("\n");
        }
        const noteLines = [...lines];
        const blockTitle = String(block.title || "").trim();
        let displayTitle = looksLikeInstructionTitle(blockTitle) ? "" : blockTitle;
        const isBoxedFlow = block.noteStyle === "boxed-flow";

        if (!displayTitle && canUseAsNoteTitle(noteLines[0])) {
            displayTitle = String(noteLines.shift()).trim();
        }

        if (isBoxedFlow && displayTitle && noteLines.length) {
            const normalizedTitle = plainText(displayTitle).replace(/\s+/g, " ").trim().toLowerCase();
            const normalizedFirstLine = plainText(noteLines[0]).replace(/\s+/g, " ").trim().toLowerCase();
            if (normalizedTitle && normalizedTitle === normalizedFirstLine) {
                noteLines.shift();
            }
        }

        function noteLabelMatch(line) {
            return String(line).trim().match(/^<strong>([\s\S]*?)<\/strong>\s*([\s\S]*)$/i);
        }

        function isBulletLine(line) {
            return /^\s*[-*•]\s+/.test(String(line || ""));
        }

        function shouldRenderNoteTable(lines) {
            const meaningfulLines = (lines || [])
                .map((line) => String(line).trim())
                .filter(Boolean);
            const nonBulletLines = meaningfulLines.filter((line) => !isBulletLine(line));
            const labelLines = nonBulletLines.filter(noteLabelMatch);

            return labelLines.length >= 4 && labelLines.length / Math.max(nonBulletLines.length, 1) >= 0.65;
        }

        function renderNoteTable(lines) {
            const rows = [];

            for (let index = 0; index < lines.length; index += 1) {
                const trimmed = String(lines[index]).trim();
                if (!trimmed) continue;

                const match = noteLabelMatch(trimmed);
                if (!match) {
                    rows.push(`<tr class="lc-note-table-row--plain"><td colspan="2">${renderNoteLine(trimmed)}</td></tr>`);
                    continue;
                }

                const label = plainText(match[1]);
                const valueParts = [];
                let hasListItems = false;
                const inlineValue = String(match[2] || "").trim();
                if (inlineValue) {
                    valueParts.push(renderPlaceholderText(inlineValue, block.options));
                }

                while (index + 1 < lines.length) {
                    const nextLine = String(lines[index + 1]).trim();
                    if (!isBulletLine(nextLine)) break;
                    valueParts.push(`<span class="lc-note-table-list-item">${renderPlaceholderText(nextLine.replace(/^\s*[-*•]\s+/, ""), block.options)}</span>`);
                    hasListItems = true;
                    index += 1;
                }

                const value = valueParts.length
                    ? `<div class="lc-note-table-value ${hasListItems ? "lc-note-table-value--stacked" : ""}">${valueParts.join("")}</div>`
                    : "";

                rows.push(`<tr>
                    <th scope="row">${escapeHtml(label)}</th>
                    <td>${value}</td>
                </tr>`);
            }

            return `<table class="lc-note-table"><tbody>${rows.join("")}</tbody></table>`;
        }

        function renderNoteLine(line) {
            const trimmed = String(line).trim();
            if (!trimmed) return "<br>";

            if (isBulletLine(trimmed)) {
                return `<li class="lc-note-list-item">${renderPlaceholderText(trimmed.replace(/^\s*[-*•]\s+/, ""), block.options)}</li>`;
            }

            const strongOnly = /^<strong>[\s\S]*<\/strong>$/i.test(trimmed);
            const labelOnly = strongOnly && /:\s*$/i.test(plainText(trimmed));
            const plain = plainText(trimmed);
            const plainSubLine = /^Consumer attitudes$/i.test(plain);
            const plainSectionHeading = !strongOnly
                && !plainSubLine
                && !/\{\{\d{1,2}\}\}/.test(trimmed)
                && !/^\d{1,2}\b/.test(plain)
                && !/:/.test(plain);
            const className = (strongOnly && !labelOnly) || plainSectionHeading ? "lc-note-section-title" : "lc-note-line";
            return `<p class="${className}">${renderPlaceholderText(trimmed, block.options)}</p>`;
        }

        function listItem(line) {
            const match = String(line || "").match(/^(\s*)([-*•])\s+([\s\S]*)$/);
            if (!match) return null;

            const indent = match[1].replace(/\t/g, "  ").length;
            return {
                level: indent >= 2 ? 1 : 0,
                text: match[3]
            };
        }

        function renderNoteFlow(lines) {
            const html = [];
            let listOpen = false;
            let nestedOpen = false;
            let topItemOpen = false;

            function closeNested() {
                if (nestedOpen) {
                    html.push("</ul>");
                    nestedOpen = false;
                }
            }

            function closeTopItem() {
                if (topItemOpen) {
                    closeNested();
                    html.push("</li>");
                    topItemOpen = false;
                }
            }

            function closeList() {
                closeTopItem();
                if (listOpen) {
                    html.push("</ul>");
                    listOpen = false;
                }
            }

            lines.forEach((line) => {
                const item = listItem(line);
                if (!item) {
                    closeList();
                    html.push(renderNoteLine(line));
                    return;
                }

                if (!listOpen) {
                    html.push('<ul class="lc-note-list">');
                    listOpen = true;
                }

                if (item.level > 0) {
                    if (!topItemOpen) {
                        html.push('<li class="lc-note-list-item lc-note-list-item--empty">');
                        topItemOpen = true;
                    }
                    if (!nestedOpen) {
                        html.push('<ul class="lc-note-nested-list">');
                        nestedOpen = true;
                    }
                    html.push(`<li class="lc-note-list-item lc-note-list-item--nested">${renderPlaceholderText(item.text, block.options)}</li>`);
                    return;
                }

                closeTopItem();
                html.push(`<li class="lc-note-list-item">${renderPlaceholderText(item.text, block.options)}`);
                topItemOpen = true;
            });

            closeList();
            return html.join("");
        }

        function renderJobDetailsInput(questionNumber) {
            const number = Number(questionNumber);
            return `<input class="lc-answer-input lc-job-answer-input" id="q${number}" name="q${number}" type="text" autocomplete="off" aria-label="Answer ${number}" placeholder="${number}">`;
        }

        function renderJobDetailsLine(line) {
            let text = String(line || "")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'");

            const parts = [];
            let lastIndex = 0;
            for (const match of text.matchAll(/\{\{(\d{1,2})\}\}/g)) {
                parts.push(escapeHtml(text.slice(lastIndex, match.index)));
                parts.push(renderJobDetailsInput(match[1]));
                lastIndex = match.index + match[0].length;
            }
            parts.push(escapeHtml(text.slice(lastIndex)));

            return parts.join("")
                .replace(/&lt;strong&gt;/gi, "<strong>")
                .replace(/&lt;\/strong&gt;/gi, "</strong>")
                .replace(/&lt;b&gt;/gi, "<strong>")
                .replace(/&lt;\/b&gt;/gi, "</strong>");
        }

        function renderJobDetailsForm(lines, title) {
            const body = (lines || [])
                .map((line) => String(line || "").trim())
                .filter(Boolean)
                .map((line) => {
                    if (/^<strong>Example:\s*<\/strong>/i.test(line)) {
                        return `<div class="lc-job-example">${renderJobDetailsLine(line)}</div>`;
                    }
                    if (/^<strong>[\s\S]*<\/strong>$/i.test(line)) {
                        return `<p class="lc-job-section-title">${renderJobDetailsLine(line)}</p>`;
                    }
                    return `<p class="lc-job-line">${renderJobDetailsLine(line)}</p>`;
                })
                .join("");

            return `
                <h4 class="lc-job-title">${escapeHtml(title || "Job Details")}</h4>
                <div class="lc-job-details-form">${body}</div>
            `;
        }

        if (block.noteStyle === "job-details-form") {
            return blockCard(block, renderJobDetailsForm(noteLines, displayTitle || block.title), "lc-note-completion lc-note-completion--job-details-form");
        }

        const isSpiritBear = isBoxedFlow && /^the spirit bear$/i.test(plainText(displayTitle));
        const noteStyleClass = [
            isBoxedFlow ? "lc-note-completion--boxed-flow" : "",
            isSpiritBear ? "lc-note-completion--spirit-bear" : ""
        ].filter(Boolean).join(" ");
        const items = renderNoteFlow(noteLines);
        const tableItems = shouldRenderNoteTable(noteLines) ? renderNoteTable(noteLines) : "";
        const titleHtml = displayTitle ? `<h4 class="${isBoxedFlow ? "lc-boxed-flow-title" : "lc-form-title"}">${renderPlaceholderText(displayTitle, block.options)}</h4>` : "";

        const exampleBox = block.example ? `
            <div class="lc-notes-example">
                <span class="lc-example-badge">Example</span>
                <div class="lc-example-content">${escapeHtml(block.example.replace(/^Example\s*[-–—:\s]*/i, ""))}</div>
            </div>
        ` : "";

        return blockCard(block, `
            ${!isSpiritBear ? titleHtml : ""}
            ${exampleBox}
            <div class="lc-notes ${tableItems ? "lc-notes--table" : ""}">${isSpiritBear ? titleHtml : ""}${tableItems || items}</div>
        `, `lc-note-completion ${noteStyleClass}`);
    }

    function renderTableHeaderCell(value) {
        return escapeHtml(value).replace(/&lt;br\s*\/?\s*(?:&gt;|>)/gi, "<br>");
    }

    function normalizedTableCell(value) {
        return plainText(String(value || "")
            .replace(/&lt;br\s*\/?\s*&gt;/gi, " ")
            .replace(/<br\s*\/?>/gi, " "))
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function rowCells(row) {
        return Array.isArray(row) ? row : row.cells || [];
    }

    function isRepeatedTableHeaderRow(row, columns) {
        const cells = rowCells(row);
        if (!columns.length || cells.length !== columns.length) return false;
        return cells.every((cell, index) => normalizedTableCell(cell) === normalizedTableCell(columns[index]));
    }

    function TableCompletionBlock(block) {
        const rawColumns = block.columns || [];
        const hasRowHeaders = rawColumns.length > 0 && !normalizedTableCell(rawColumns[0]);
        const columns = rawColumns.map((column) => `<th scope="col">${renderTableHeaderCell(column)}</th>`).join("");
        const bodyRows = (block.rows || []).filter((row, index) => index !== 0 || !isRepeatedTableHeaderRow(row, rawColumns));
        const rows = bodyRows.map((row) => {
            const cells = Array.isArray(row) ? row : row.cells || [];
            return `<tr>${cells.map((cell, cellIndex) => {
                const content = renderValue(cell, block.options);
                return hasRowHeaders && cellIndex === 0
                    ? `<th scope="row">${content}</th>`
                    : `<td>${content}</td>`;
            }).join("")}</tr>`;
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
        if (isFlowChartMatchingBlock(block)) {
            const optionItems = (block.options || []).map((option) =>
                `<div class="lc-flowchart-option"><strong>${escapeHtml(option.letter || "")}</strong> ${escapeHtml(cleanOptionText(option.text || ""))}</div>`
            ).join("");
            const lines = Array.isArray(block.content) && block.content.length
                ? block.content
                : (block.questions || []).map(flowchartLineFromQuestion);
            const lineItems = lines.map((line) => {
                const className = /\{\{\d{1,2}\}\}/.test(String(line || ""))
                    ? "lc-flowchart-line"
                    : "lc-flowchart-intro";
                return `<p class="${className}">${renderFlowchartText(line, block.options)}</p>`;
            }).join("");
            const flowchartTitle = block.title
                ? `<h4 class="lc-flowchart-title">${escapeHtml(block.title)}</h4>`
                : "";
            const blockClone = {
                ...block,
                instruction: flowchartInstructionText(block.instruction)
            };

            return blockCard(blockClone, `
                <div class="lc-flowchart-options-box">
                    <h4>Options</h4>
                    <div class="lc-flowchart-options-grid">${optionItems}</div>
                </div>
                <div class="lc-flowchart-panel">
                    ${flowchartTitle}
                    ${lineItems}
                </div>
            `, "lc-matching-block lc-flowchart-block");
        }

        const image = block.imageUrl
            ? `<div class="lc-map-stage lc-matching-image">
                <img loading="lazy" decoding="async" src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.title || "Listening question image")}">
            </div>`
            : "";
        const hasImage = Boolean(block.imageUrl);
        const options = (block.options || []).map((option) => {
            const optionText = cleanOptionText(option.text || "");
            return `<div class="lc-matching-option"><span class="lc-letter-badge">${escapeHtml(option.letter || "")}</span>${optionText ? escapeHtml(optionText) : ""}</div>`;
        }).join("");
        const optionTags = (block.options || []).map((option) => {
            const optionText = cleanOptionText(option.text || "");
            const optionLabel = optionText ? `${option.letter || ""} - ${optionText}` : (option.letter || "");
            return `<option value="${escapeHtml(option.letter || "")}">${escapeHtml(optionLabel)}</option>`;
        }).join("");
        const rows = (block.questions || []).map((question) => {
            const questionNumber = Number(question.questionNumber);
            const rawText = String(question.text || "").trim();
            const isPlaceholder = new RegExp(`^label\\s+${questionNumber}$`, "i").test(rawText);
            const text = rawText && !isPlaceholder
                ? `<span class="lc-matching-question-text">${escapeHtml(rawText)}</span>`
                : "";

            return `<div class="lc-matching-row ${text ? "" : "lc-matching-row--compact"}">
            <span class="lc-question-badge">${questionNumber}${hasImage ? "" : "."}</span>
            ${text}
            <select name="q${Number(question.questionNumber)}" aria-label="Answer ${Number(question.questionNumber)}">
                <option value="">${hasImage ? "Select" : "&ndash;"}</option>
                ${optionTags}
            </select>
        </div>`;
        }).join("");
        const optionsHeading = block.optionsTitle || (hasImage ? "Categories" : "Main theme");
        const optionsTitle = options ? `<h4 class="lc-matching-options-title">${escapeHtml(optionsHeading)}</h4>` : "";
        const content = hasImage
            ? `<div class="lc-matching-map-layout">
                ${image}
                <div class="lc-matching-answer-panel">
                    ${optionsTitle}
                    <div class="lc-matching-options">${options}</div>
                    <div class="lc-matching-rows">${rows}</div>
                </div>
            </div>`
            : `${image}
            <div class="lc-matching-options">${optionsTitle}${options}</div>
            <div class="lc-matching-rows">${rows}</div>`;

        const blockClone = {
            ...block,
            instruction: block.instruction
                ? block.instruction
                    .split(/\bCategories\b/i)[0]
                    .trim()
                    .replace(/([?.!])\s*(Choose\b)/i, "$1\n$2")
                : ""
        };

        return blockCard(blockClone, content, `lc-matching-block ${hasImage ? "lc-matching-block--image" : "lc-matching-block--list"}`);
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
                <img loading="lazy" decoding="async" src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.title || "Listening map")}">
                ${labels}
            </div>`
            : `<div class="lc-map-placeholder">Map image has not been uploaded yet.</div>`;

        return blockCard(block, `${image}<div class="lc-map-fallback">${fallback}</div>`, "lc-map-labelling");
    }

    function RichContentBlock(block) {
        return blockCard(block, `
            <div class="lc-rich-content">${block.html || ""}</div>
        `, "lc-rich-content-block");
    }

    const blockRenderers = {
        rich_content: RichContentBlock,
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

    function isFullListeningTest(test) {
        return test.part === "full" || (test.parts || []).length > 1;
    }

    function listeningDuration(test) {
        return isFullListeningTest(test) ? 40 : 10;
    }

    function ListeningHeader(test) {
        const duration = listeningDuration(test);
        const isFull = isFullListeningTest(test);
        const params = new URLSearchParams(window.location.search);
        const isMockMode = params.get("mockMode") === "1" || params.has("mockTestId") || String(params.get("id") || "").includes("mock");
        const dashboardHref = test.dashboardHref || (isFull
            ? "/listeningfulltest.html"
            : `/listeningpart${Number(test.part || test.parts?.[0]?.partNumber) || 1}.html`);
        const headerTitle = isMockMode ? "Listening" : (test.headerTitle || "Academic Listening");
        const dashboardControl = isMockMode
            ? `<button class="lc-dashboard-button cbt-button cbt-button--exit lc-mock-exit-button" type="button" data-mock-exit>Exit Exam</button><span class="lc-dashboard-button cbt-button cbt-button--secondary" data-notes-anchor style="display:none;"></span>`
            : `<a class="lc-dashboard-button cbt-button cbt-button--secondary" href="${dashboardHref}"><span class="lc-grid-icon cbt-grid-icon"></span>Dashboard</a>`;
        const submitLabel = isMockMode ? "Submit Section" : "Submit";
        return `<header class="lc-header cbt-header">
            <div class="lc-brand-group cbt-brand">
                <img class="lc-logo cbt-logo" src="/IELTS-logo.png" alt="IELTS">
                <span class="lc-brand-divider cbt-brand-divider"></span>
                <strong class="cbt-brand-title">${escapeHtml(headerTitle)}</strong>
            </div>
            <div class="lc-timer" data-duration="${duration * 60}" data-reset-on-part-change="${isFull ? "false" : "true"}">
                <span class="lc-clock-icon"></span>
                <span><strong>${String(duration).padStart(2, "0")}:00</strong><small>TIME LEFT</small></span>
            </div>
            <div class="lc-header-actions cbt-header-actions">
                ${dashboardControl}
                ${isFull && !isMockMode ? `<button class="lc-fullscreen-button cbt-button cbt-button--fullscreen fullscreen-toggle-btn" data-fullscreen-toggle type="button" aria-pressed="false">Full Screen</button>` : ""}
                <button class="lc-submit-button cbt-button cbt-button--submit" type="button" disabled>${submitLabel}</button>
            </div>
        </header>`;
    }

    function ListeningTestTitle(test) {
        const isFull = isFullListeningTest(test);
        const partNumber = Number(test.part || test.parts?.[0]?.partNumber) || 1;

        return `<section class="lc-test-title">
            <h1>${escapeHtml(test.title || "Test")}</h1>
            <p>${isFull ? "Listening full test" : `Listening Part ${partNumber}`}</p>
        </section>`;
    }

    function AudioPlayerCard(part) {
        const playlist = Array.isArray(part.audioUrls)
            ? part.audioUrls.map((item) => String(item || "").trim()).filter(Boolean)
            : [];
        const audioUrl = playlist[0] || part.audioUrl || "";
        const hasAudio = Boolean(audioUrl);
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
                <audio preload="metadata" src="${escapeHtml(audioUrl)}" data-audio-playlist="${escapeHtml(JSON.stringify(playlist))}"></audio>
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

    function c10Blank(number, extraClass = "") {
        return `<span class="c10-answer ${extraClass}" id="question-${number}" data-question="${number}">
            <span class="c10-qnum">${number}</span>
            <input class="lc-answer-input c10-input" id="q${number}" name="q${number}" type="text" autocomplete="off" aria-label="Answer ${number}">
        </span>`;
    }

    function c10Choice(name, value, text, type = "radio", extraAttrs = "") {
        return `<label class="c10-choice">
            <input type="${type}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${extraAttrs}>
            <span class="c10-choice-letter">${escapeHtml(value)}</span>
            <span>${escapeHtml(text)}</span>
        </label>`;
    }

    function c10MultipleSelect() {
        const options = [
            ["A", "the gym"],
            ["B", "the tracks"],
            ["C", "the indoor pool"],
            ["D", "the outdoor pool"],
            ["E", "the sports training for children"]
        ].map(([letter, text]) => c10Choice("c10-q11-12", letter, text, "checkbox", 'data-sync="q11-q12"')).join("");

        return `<div class="lc-multiple-select c10-choice-list" data-max-selections="2" data-question-numbers="11,12">
            <input type="hidden" name="q11">
            <input type="hidden" name="q12">
            ${options}
        </div>
        <p class="lc-selection-message c10-selection-message" aria-live="polite"></p>`;
    }

    function renderCambridge10PaperPart(part) {
        const partNumber = Number(part.partNumber) || 1;

        if (partNumber === 1) {
            return `
                <div class="c10-listening-label">LISTENING</div>
                <div class="c10-section-heading">
                    <h2>SECTION 1</h2>
                    <p>Questions 1–10</p>
                </div>

                <div class="c10-instructions">
                    <p><em>Questions 1–6</em></p>
                    <p><em>Complete the notes below.</em></p>
                    <p><em>Write <strong>ONE WORD</strong> for each answer.</em></p>
                </div>

                <section class="c10-box c10-self-drive">
                    <h3>SELF-DRIVE TOURS IN THE USA</h3>
                    <div class="c10-form-row c10-example-row"><span><em>Example</em></span><span></span></div>
                    <div class="c10-form-row"><strong>Name:</strong><span><strong>Andrea</strong> <span class="c10-example-line">Brown</span></span></div>
                    <div class="c10-form-row"><strong>Address:</strong><span>24 ${c10Blank(1)} Road</span></div>
                    <div class="c10-form-row"><strong>Postcode:</strong><span>BH5 2OP</span></div>
                    <div class="c10-form-row"><strong>Phone:</strong><span>(mobile) 077 8664 3091</span></div>
                    <div class="c10-form-row"><strong>Heard about company from:</strong><span>${c10Blank(2)}</span></div>
                    <div class="c10-form-wide"><strong>Possible self-drive tours</strong></div>
                    <div class="c10-form-wide">
                        <p>Trip One:</p>
                        <ul>
                            <li>Los Angeles: customer wants to visit some ${c10Blank(3)} parks with her children</li>
                            <li>Yosemite Park: customer wants to stay in a lodge, not a ${c10Blank(4)}</li>
                        </ul>
                        <p>Trip Two:</p>
                        <ul>
                            <li>Customer wants to see the ${c10Blank(5)} on the way to Cambria</li>
                            <li>At Santa Monica: not interested in shopping</li>
                            <li>At San Diego, wants to spend time on the ${c10Blank(6)}</li>
                        </ul>
                    </div>
                </section>

                <div class="c10-instructions c10-after-box">
                    <p><em>Questions 7–10</em></p>
                    <p><em>Complete the table below.</em></p>
                    <p><em>Write <strong>ONE WORD AND/OR A NUMBER</strong> for each answer.</em></p>
                </div>

                <div class="c10-table-wrap">
                    <table class="c10-table">
                        <thead>
                            <tr><th></th><th>Number<br>of days</th><th>Total distance</th><th>Price<br>(per person)</th><th>Includes</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th>Trip One</th>
                                <td>12 days</td>
                                <td>${c10Blank(7)} km</td>
                                <td>£525</td>
                                <td><ul><li>accommodation</li><li>car</li><li>one ${c10Blank(8)}</li></ul></td>
                            </tr>
                            <tr>
                                <th>Trip Two</th>
                                <td>9 days</td>
                                <td>980 km</td>
                                <td>£ ${c10Blank(9)}</td>
                                <td><ul><li>accommodation</li><li>car</li><li>${c10Blank(10)}</li></ul></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (partNumber === 2) {
            return `
                <div class="c10-section-heading">
                    <h2>SECTION 2</h2>
                    <p>Questions 11–20</p>
                </div>
                <div class="c10-instructions">
                    <p><em>Questions 11–12</em></p>
                    <p><em>Choose <strong>TWO</strong> letters <strong>A–E</strong>.</em></p>
                </div>
                <section class="c10-question-block">
                    <p>Which <strong>TWO</strong> facilities at the leisure club have recently been improved?</p>
                    ${c10MultipleSelect()}
                </section>
                <div class="c10-instructions c10-after-box">
                    <p><em>Complete the notes below.</em></p>
                    <p><em>Write <strong>NO MORE THAN TWO WORDS</strong> for each answer.</em></p>
                </div>
                <section class="c10-notes">
                    <h3>Joining the leisure club</h3>
                    <p><em>Personal Assessment</em></p>
                    <ul>
                        <li>New members should describe any ${c10Blank(13)}.</li>
                        <li>The ${c10Blank(14)} will be explained to you before you use the equipment.</li>
                        <li>You will be given a six-week ${c10Blank(15)}.</li>
                    </ul>
                    <p><em>Types of membership</em></p>
                    <ul>
                        <li>There is a compulsory £90 ${c10Blank(16)} fee for members.</li>
                        <li>Gold members are given ${c10Blank(17)} to all the LP clubs.</li>
                        <li>Premier members are given priority during ${c10Blank(18)} hours.</li>
                        <li>Premier members can bring some ${c10Blank(19)} every month.</li>
                        <li>Members should always take their ${c10Blank(20)} with them.</li>
                    </ul>
                </section>
            `;
        }

        if (partNumber === 3) {
            const questions = [
                [21, "Students entering the design competition have to", [["A", "produce an energy-efficient design."], ["B", "adapt an existing energy-saving appliance."], ["C", "develop a new use for current technology."]]],
                [22, "John chose a dishwasher because he wanted to make dishwashers", [["A", "more appealing."], ["B", "more common."], ["C", "more economical."]]],
                [23, "The stone in John’s ‘Rockpool’ design is used", [["A", "for decoration."], ["B", "to switch it on."], ["C", "to stop water escaping."]]],
                [24, "In the holding chamber, the carbon dioxide", [["A", "changes back to a gas."], ["B", "dries the dishes."], ["C", "is allowed to cool."]]],
                [25, "At the end of the cleaning process, the carbon dioxide", [["A", "is released into the air."], ["B", "is disposed of with the waste."], ["C", "is collected ready to be re-used."]]]
            ].map(([number, question, options]) => `
                <div class="c10-mcq" id="question-${number}">
                    <p><strong>${number}</strong> <span>${escapeHtml(question)}</span></p>
                    <div class="c10-choice-list">
                        ${options.map(([letter, text]) => c10Choice(`q${number}`, letter, text)).join("")}
                    </div>
                </div>
            `).join("");

            return `
                <div class="c10-section-heading">
                    <h2>SECTION 3</h2>
                    <p>Questions 21–30</p>
                </div>
                <div class="c10-instructions">
                    <p><em>Questions 21–25</em></p>
                    <p><em>Choose the correct letter, <strong>A</strong>, <strong>B</strong> or <strong>C</strong>.</em></p>
                </div>
                <section class="c10-mcq-block">
                    <h3>Global Design Competition</h3>
                    ${questions}
                </section>
                <div class="c10-instructions c10-after-box">
                    <p><em>Questions 26–30</em></p>
                    <p><em>Complete the notes below.</em></p>
                    <p><em>Write <strong>ONE WORD ONLY</strong> for each answer.</em></p>
                </div>
                <section class="c10-box c10-simple-box">
                    <ul>
                        <li>John needs help preparing for his ${c10Blank(26)}.</li>
                        <li>The professor advises John to make a ${c10Blank(27)} of his design.</li>
                        <li>John’s main problem is getting good quality ${c10Blank(28)}.</li>
                        <li>The professor suggests John apply for a ${c10Blank(29)}.</li>
                        <li>The professor will check the ${c10Blank(30)} information in John’s written report.</li>
                    </ul>
                </section>
            `;
        }

        return `
            <div class="c10-section-heading">
                <h2>SECTION 4</h2>
                <p>Questions 31–40</p>
            </div>
            <div class="c10-instructions">
                <p><em>Complete the notes below.</em></p>
                <p><em>Write <strong>ONE WORD ONLY</strong> for each answer.</em></p>
            </div>
            <section class="c10-box c10-spirit-bear">
                <h3>THE SPIRIT BEAR</h3>
                <p><strong>General facts</strong></p>
                <ul>
                    <li>It is a white bear belonging to the black bear family.</li>
                    <li>Its colour comes from an uncommon ${c10Blank(31)}.</li>
                    <li>Local people believe that it has unusual ${c10Blank(32)}.</li>
                    <li>They protect the bear from ${c10Blank(33)}.</li>
                </ul>
                <p><strong>Habitat</strong></p>
                <ul>
                    <li>The bear’s relationship with the forest is complex.</li>
                    <li>Tree roots stop ${c10Blank(34)} along salmon streams.</li>
                    <li>The bears’ feeding habits provide nutrients for forest vegetation.</li>
                    <li>It is currently found on a small number of ${c10Blank(35)}.</li>
                </ul>
                <p><strong>Threats</strong></p>
                <ul>
                    <li>Habitat is being lost due to deforestation and construction of ${c10Blank(36)} by logging companies.</li>
                    <li>Unrestricted ${c10Blank(37)} is also affecting the salmon supply.</li>
                    <li>The bears’ existence is also threatened by their low rate of ${c10Blank(38)}.</li>
                </ul>
                <p><strong>Going forward</strong></p>
                <ul>
                    <li>Interested parties are working together.</li>
                    <li>Logging companies must improve their ${c10Blank(39)} of logging.</li>
                    <li>Maintenance and ${c10Blank(40)} of the spirit bears’ territory is needed.</li>
                </ul>
            </section>
        `;
    }

    function isCambridge10PaperPart(part) {
        return false;
    }

    function ListeningPart(part) {
        if (isCambridge10PaperPart(part)) {
            return `<section class="lc-part lc-c10-paper lc-c10-part-${Number(part.partNumber) || 1}" data-part-number="${Number(part.partNumber) || 1}">
                ${renderCambridge10PaperPart(part)}
            </section>`;
        }

        const importedHtml = part.html || part.listeningHtml || part.questionsHtml || "";
        const importedHtmlBlock = importedHtml
            ? `<section class="lc-question-card lc-imported-html-block">
                <div class="lc-rich-content">${importedHtml}</div>
            </section>`
            : "";

        return `<section class="lc-part" data-part-number="${Number(part.partNumber) || 1}">
            <div class="lc-part-heading">
                <h2>${escapeHtml(part.title || `Part ${part.partNumber}`)}</h2>
                <p>${escapeHtml(part.questionRange || "")}</p>
                ${part.instruction ? `<p class="lc-part-instruction">${highlightInstruction(part.instruction)}</p>` : ""}
            </div>
            <div class="lc-question-stack">${importedHtmlBlock}${(part.blocks || []).map(renderBlock).join("")}</div>
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
                    options: (question.options || []).map((item, optionIndex) => {
                        if (item && typeof item === "object") {
                            const letter = item.letter || item.value || String.fromCharCode(65 + optionIndex);
                            const text = item.text || item.html || item.label || "";
                            return { letter, text };
                        }
                        return {
                            letter: String.fromCharCode(65 + optionIndex),
                            text: String(item)
                        };
                    })
                };
            }

            if (question.type === "multiple_select" || question.type === "multi_select") {
                return {
                    id: `legacy-${index}`,
                    type: "multiple_select",
                    questionRange: `Question ${question.number}`,
                    questionNumber: question.number,
                    question: question.question,
                    options: (question.options || []).map((item, optionIndex) => {
                        if (item && typeof item === "object") {
                            const letter = item.letter || item.value || String.fromCharCode(65 + optionIndex);
                            const text = item.text || item.html || item.label || "";
                            return { letter, text };
                        }
                        return {
                            letter: String.fromCharCode(65 + optionIndex),
                            text: String(item)
                        };
                    })
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

    function ListeningBottomBar(parts, activePartNumber, hidden = true) {
        return "";
    }

    function hasListeningPartContent(part) {
        return Boolean(
            (part.blocks || []).length ||
            (part.questions || []).length ||
            part.html ||
            part.listeningHtml ||
            part.questionsHtml ||
            part.audioUrl
        );
    }

    function ListeningTestPage(rawTest) {
        const test = normalizeLegacyTest(rawTest || {});
        window.ListeningComponents._activeTest = test;
        const parts = (test.parts || []).filter(hasListeningPartContent);
        const activePartNumber = Number(parts[0]?.partNumber) || 1;
        const params = new URLSearchParams(window.location.search);
        const isMockMode = params.get("mockMode") === "1" || params.has("mockTestId") || String(params.get("id") || "").includes("mock");

        const preStartMarkup = isMockMode
            ? ""
            : (window.PreTestStartScreen?.markup
                ? window.PreTestStartScreen.markup()
                : `<section class="ieltsx-prestart-stage ieltsx-prestart-stage--compact" aria-label="Start test"><button class="ieltsx-prestart-card" type="button" data-pretest-start><span class="ieltsx-prestart-text">Click <span class="ieltsx-prestart-link">here</span> to start the test</span></button></section>`);

        return `<div class="lc-page ${isFullListeningTest(test) ? "full-test-shell full-test-player" : ""}">
            ${ListeningHeader(test)}
            <main class="lc-main">
                <div data-listening-prestart ${isMockMode ? "hidden" : ""}>${preStartMarkup}</div>
                <div class="lc-test-content" data-listening-test-content ${isMockMode ? "" : "hidden"}>
                    ${ListeningTestTitle(test)}
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
                </div>
            </main>
            <div class="lc-question-nav-container hidden" data-listening-question-nav></div>
            ${ListeningBottomBar(parts, activePartNumber, !isMockMode)}
            <div class="lc-modal-backdrop hidden" data-listening-result-modal>
                <section class="lc-result-modal" role="dialog" aria-modal="true">
                    <button class="lc-modal-close" type="button" aria-label="Close" data-listening-result-close>&times;</button>
                    <span class="lc-result-eyebrow">IELTS Listening result</span>
                    <p class="lc-auto-submit-notice hidden" role="alert" data-auto-submit-message></p>
                    <h2 data-listening-result-score>0 / 40</h2>
                    <p class="lc-band" data-listening-result-band>Estimated band: 0</p>
                    <div class="lc-result-stats">
                        <span data-listening-result-correct>0 correct answers</span>
                        <span data-listening-result-incorrect>0 incorrect answers</span>
                        <span data-listening-result-unanswered>40 unanswered questions.</span>
                    </div>
                    <div class="lc-result-actions">
                        <button class="lc-start-button" type="button" data-listening-review>Review answers</button>
                        <button class="lc-secondary-button" type="button" data-listening-result-close>Close</button>
                    </div>
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
        const startPanel = card.querySelector(".lc-audio-start-panel");
        const current = card.querySelector(".lc-current-time");
        const total = card.querySelector(".lc-total-time");
        const progressTrack = card.querySelector(".lc-progress-track");
        const progress = progressTrack.querySelector("span");
        const volume = card.querySelector(".lc-volume");
        const audioParams = new URLSearchParams(window.location.search);
        const isMockMode = audioParams.get("mockMode") === "1" || audioParams.has("mockTestId") || String(audioParams.get("id") || "").includes("mock");
        let started = false;
        let ended = false;
        let draggingProgress = false;
        let segmentIndex = 0;
        let playlist = [];

        try {
            playlist = JSON.parse(audio.dataset.audioPlaylist || "[]")
                .map((item) => String(item || "").trim())
                .filter(Boolean);
        } catch {
            playlist = [];
        }
        if (!playlist.length && audio.getAttribute("src")) {
            playlist = [audio.getAttribute("src")];
        }

        function loadSegment(index, autoplay = false) {
            if (!playlist[index]) return false;
            segmentIndex = index;
            audio.src = playlist[index];
            audio.load();
            ended = false;
            play.disabled = !started;
            play.textContent = "Play";
            current.textContent = "00:00";
            total.textContent = "--:--";
            progress.style.width = "0%";
            if (autoplay) {
                audio.play().catch(() => {
                    play.textContent = "Play";
                });
            }
            return true;
        }

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
            if (segmentIndex < playlist.length - 1) {
                loadSegment(segmentIndex + 1, started);
                return;
            }
            ended = true;
            play.disabled = true;
            play.textContent = "Ended";
        });
        async function startAudioPlayback() {
            if (started || !audio.src) return;
            started = true;
            start.disabled = true;
            start.textContent = "Listening Test Started";
            play.disabled = false;

            try {
                await audio.play();
            } catch {
                if (!isMockMode) {
                    started = false;
                    start.disabled = false;
                    start.textContent = "Start Listening Test";
                    play.disabled = true;
                }
            }
        }

        card._startListeningAudio = startAudioPlayback;

        if (isMockMode) {
            if (startPanel) {
                startPanel.hidden = true;
                startPanel.style.setProperty("display", "none", "important");
            }
            card.style.gridTemplateColumns = "1fr";
            if (play) play.disabled = false;
        }

        start.addEventListener("click", startAudioPlayback);
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

    function bindListeningQuestionNav(root, test) {
        const navContainer = root.querySelector("[data-listening-question-nav]");
        if (!navContainer) return;

        // Inject navigation styles
        if (!document.getElementById("ieltsmock-question-nav-styles")) {
            const style = document.createElement("style");
            style.id = "ieltsmock-question-nav-styles";
            style.textContent = `
                .lc-question-nav-container {
                    width: 100%;
                }
                .lc-question-nav-container.hidden {
                    display: none !important;
                }
                .lc-main {
                    padding-bottom: 20px !important;
                }
                .question-nav {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 48px;
                    padding: 0 24px;
                    background: #ffffff;
                    border-top: 1px solid #e2e8f0;
                    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
                    overflow-x: auto;
                    width: 100%;
                    height: 68px;
                    box-sizing: border-box;
                }
                .question-nav-part {
                    display: flex;
                    align-items: center;
                    white-space: nowrap;
                    flex-shrink: 0;
                }
                .question-nav-part.active {
                    gap: 20px;
                }
                .question-nav-part.inactive {
                    gap: 12px;
                }
                .question-nav-title {
                    font-weight: 700;
                    color: #000000;
                    font-size: 15px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .question-nav-progress {
                    font-size: 14px;
                    color: #64748b;
                    font-weight: 400;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .question-nav-buttons {
                    display: flex;
                    gap: 8px;
                    flex-wrap: nowrap;
                }
                .question-number-btn {
                    width: 32px;
                    height: 32px;
                    min-width: 32px;
                    border: 1px solid #cbd5e1;
                    background: #ffffff;
                    color: #1f2937;
                    border-radius: 4px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 150ms ease;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .question-number-btn:hover {
                    border-color: #3b82f6;
                    background: #f8fafc;
                }
                .question-number-btn.active {
                    background: #2563eb;
                    color: #ffffff !important;
                    border-color: #2563eb !important;
                }
                .flash {
                    animation: flash 1s ease-out;
                }
                @keyframes flash {
                    0% { background-color: rgba(59, 130, 246, 0.25); }
                    100% { background-color: transparent; }
                }
            `;
            document.head.appendChild(style);
        }

        // Build partsConfig
        const partsConfig = [];
        const parts = ((test && test.parts) || []).filter((part) => part && hasListeningPartContent(part));
        parts.forEach((part, pIdx) => {
            if (!part) return;
            const partNumber = Number(part.partNumber) || pIdx + 1;
            const questionNumbers = [];
            (part.blocks || []).forEach((block) => {
                if (!block) return;
                if (Array.isArray(block.questions)) {
                    block.questions.forEach((q) => {
                        if (!q) return;
                        const qNum = Number(q.questionNumber || q.number);
                        if (qNum && !questionNumbers.includes(qNum)) {
                            questionNumbers.push(qNum);
                        }
                    });
                } else if (block.questionNumber) {
                    const qNum = Number(block.questionNumber);
                    if (qNum && !questionNumbers.includes(qNum)) {
                        questionNumbers.push(qNum);
                    }
                }
                if (Array.isArray(block.questionNumbers)) {
                    block.questionNumbers.forEach((qNum) => {
                        const num = Number(qNum);
                        if (num && !questionNumbers.includes(num)) {
                            questionNumbers.push(num);
                        }
                    });
                }
            });
            questionNumbers.sort((a, b) => a - b);
            partsConfig.push({
                partNumber,
                questions: questionNumbers
            });
        });

        // Fallback to standard segments
        if (partsConfig.length === 0 || partsConfig.every((p) => !p.questions || p.questions.length === 0)) {
            partsConfig.length = 0;
            partsConfig.push({ partNumber: 1, questions: Array.from({ length: 10 }, (_, i) => i + 1) });
            partsConfig.push({ partNumber: 2, questions: Array.from({ length: 10 }, (_, i) => i + 11) });
            partsConfig.push({ partNumber: 3, questions: Array.from({ length: 10 }, (_, i) => i + 21) });
            partsConfig.push({ partNumber: 4, questions: Array.from({ length: 10 }, (_, i) => i + 31) });
        }

        // Track active question
        let activeQNum = 1;

        function isQuestionAnswered(qNum) {
            const input = root.querySelector(`input[name="q${qNum}"], select[name="q${qNum}"], input#q${qNum}, select#q${qNum}, textarea#q${qNum}`);
            if (!input) return false;
            if (input.type === 'radio' || input.type === 'checkbox') {
                return root.querySelector(`[name="q${qNum}"]:checked`) !== null;
            }
            return (input.value || "").trim().length > 0;
        }

        function renderNav() {
            const activeConfig = partsConfig.find(config => config.questions.includes(activeQNum)) || partsConfig[0];
            const activePartNumber = activeConfig ? activeConfig.partNumber : 1;

            const navHtml = partsConfig.map((config) => {
                const isActivePart = config.partNumber === activePartNumber;
                const partQs = config.questions;
                
                // Calculate progress
                let answeredCount = 0;
                partQs.forEach((qNum) => {
                    if (isQuestionAnswered(qNum)) answeredCount++;
                });

                if (isActivePart) {
                    const buttonsHtml = partQs.map((qNum) => {
                        const isActiveQ = activeQNum === qNum;
                        return `<button class="question-number-btn${isActiveQ ? " active" : ""}" type="button" data-nav-q="${qNum}" data-nav-part="${config.partNumber}">${qNum}</button>`;
                    }).join("");

                    return `
                        <div class="question-nav-part active" data-part="${config.partNumber}">
                            <span class="question-nav-title">Part ${config.partNumber}</span>
                            <div class="question-nav-buttons">${buttonsHtml}</div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="question-nav-part inactive" data-part="${config.partNumber}" style="cursor: pointer;">
                            <span class="question-nav-title">Part ${config.partNumber}</span>
                            <span class="question-nav-progress">${answeredCount} of ${partQs.length}</span>
                        </div>
                    `;
                }
            }).join("");

            navContainer.innerHTML = `<div class="question-nav">${navHtml}</div>`;
        }

        function scrollToListeningQuestion(qNum) {
            let target = root.querySelector(`#question-${qNum}`);
            if (!target) {
                target = [...root.querySelectorAll('[data-question-numbers]')].find(el => {
                    const nums = el.dataset.questionNumbers.split(',');
                    return nums.includes(String(qNum));
                });
            }
            if (!target) {
                const input = root.querySelector(`#q${qNum}, [name="q${qNum}"]`);
                if (input) {
                    target = input.closest('.lc-question-card') || input.closest('.lc-part') || input;
                }
            }
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.add('flash');
                setTimeout(() => {
                    target.classList.remove('flash');
                }, 1000);
            }
        }

        // Click handler to scroll to question or switch active part
        navContainer.addEventListener("click", (event) => {
            const btn = event.target.closest("[data-nav-q]");
            if (btn) {
                const qNum = Number(btn.dataset.navQ);
                const partNum = Number(btn.dataset.navPart);

                // Dispatch event to switch part
                root.dispatchEvent(new CustomEvent("switch-listening-part", { detail: { partNumber: partNum } }));

                activeQNum = qNum;
                renderNav();

                // Scroll to element
                setTimeout(() => {
                    scrollToListeningQuestion(qNum);
                }, 150);
                return;
            }

            const partEl = event.target.closest(".question-nav-part.inactive");
            if (partEl) {
                const partNum = Number(partEl.dataset.part);
                const config = partsConfig.find(c => c.partNumber === partNum);
                if (config && config.questions.length > 0) {
                    const firstQ = config.questions[0];
                    root.dispatchEvent(new CustomEvent("switch-listening-part", { detail: { partNumber: partNum } }));
                    activeQNum = firstQ;
                    renderNav();
                    setTimeout(() => {
                        scrollToListeningQuestion(firstQ);
                    }, 150);
                }
            }
        });

        // Watch for changes to update answered states
        root.addEventListener("input", renderNav);
        root.addEventListener("change", renderNav);

        // Scroll observer for active question highlighting
        const scrollContainer = root.querySelector(".lc-main");
        if (scrollContainer) {
            scrollContainer.addEventListener("scroll", () => {
                const containerRect = scrollContainer.getBoundingClientRect();
                const containerCenter = containerRect.top + containerRect.height / 2;

                const visibleSection = [...root.querySelectorAll(".lc-listening-section")].find((s) => !s.classList.contains("hidden"));
                if (!visibleSection) return;

                const questionElements = [
                    ...visibleSection.querySelectorAll('[id^="question-"]'),
                    ...visibleSection.querySelectorAll('[data-question]')
                ];
                if (!questionElements.length) return;

                let closestQNum = null;
                let minDistance = Infinity;

                questionElements.forEach((el) => {
                    const rect = el.getBoundingClientRect();
                    const elementCenter = rect.top + rect.height / 2;
                    const distance = Math.abs(elementCenter - containerCenter);
                    if (distance < minDistance) {
                        minDistance = distance;
                        const qNum = Number(el.id?.replace('question-', '') || el.dataset.question);
                        if (qNum) closestQNum = qNum;
                    }
                });

                if (closestQNum && closestQNum !== activeQNum) {
                    activeQNum = closestQNum;
                    renderNav();
                }
            }, { passive: true });
        }

        // Initialize state
        renderNav();
    }

    function bindListeningTest(root, test) {
        root.querySelectorAll("[data-audio-card]").forEach(bindAudioCard);
        const listeningParams = new URLSearchParams(window.location.search);
        const isMockMode = listeningParams.get("mockMode") === "1" || listeningParams.has("mockTestId") || String(listeningParams.get("id") || "").includes("mock");
        root.querySelector("[data-mock-exit]")?.addEventListener("click", () => {
            if (window.parent !== window) {
                window.parent.postMessage({ type: "ieltsx-mock-exit-request" }, window.location.origin);
            }
        });

        root.addEventListener("switch-listening-part", (event) => {
            showListeningPart(event.detail.partNumber);
        });

        const sections = [...root.querySelectorAll(".lc-listening-section")];
        const partTabs = [...root.querySelectorAll("[data-listening-part-select]")];
        const previousButton = root.querySelector("[data-listening-part-prev]");
        const nextButton = root.querySelector("[data-listening-part-next]");
        const submitButton = root.querySelector(".lc-submit-button");
        const preStartShell = root.querySelector("[data-listening-prestart]");
        const testContent = root.querySelector("[data-listening-test-content]");
        const bottomBar = root.querySelector("[data-listening-bottom-bar]");
        const autoSubmitMessage = window.IeltsResultUtils?.AUTO_SUBMIT_MESSAGE || "Time is over. Your test has been submitted automatically.";
        let isSubmitted = false;
        let hasStarted = false;
        let resetListeningTimer = () => {};
        let shouldResetListeningTimer = false;
        let timerInterval = null;

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
            if (previousButton) {
                previousButton.classList.toggle("lc-button--placeholder", nextIndex === 0);
                previousButton.setAttribute("aria-hidden", nextIndex === 0 ? "true" : "false");
                if (nextIndex === 0) {
                    previousButton.setAttribute("tabindex", "-1");
                } else {
                    previousButton.removeAttribute("tabindex");
                }
            }
            if (nextButton) nextButton.disabled = nextIndex === sections.length - 1;
            root.querySelector(".lc-listening-stage")?.setAttribute("data-active-part", String(partNumber));
            root.querySelector(".lc-main")?.scrollTo({ top: 0, behavior: "smooth" });
            if (hasStarted && shouldResetListeningTimer) {
                resetListeningTimer();
            }
            if (isMockMode) {
                const activeSection = sections[nextIndex];
                if (activeSection) {
                    activeSection.querySelectorAll("[data-audio-card]").forEach((card) => {
                        card._startListeningAudio?.();
                    });
                }
            }
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

        root.querySelectorAll("input[data-sync]").forEach((field) => {
            field.addEventListener("change", () => {
                const groupName = String(field.dataset.sync || "");
                const numbers = groupName.match(/\d{1,2}/g) || [];
                const selected = [...root.querySelectorAll("input[data-sync]:checked")]
                    .filter((input) => String(input.dataset.sync || "") === groupName)
                    .map((input) => input.value)
                    .filter(Boolean);

                numbers.forEach((number, index) => {
                    const target = root.querySelector(`[name="q${number}"]`);
                    if (target) target.value = selected[index] || "";
                });
            });
        });

        const timer = root.querySelector(".lc-timer");
        let remaining = timer ? Number(timer.dataset.duration) || 600 : 0;
        const output = timer?.querySelector("strong");
        if (timer) {
            shouldResetListeningTimer = timer.dataset.resetOnPartChange === "true";
            const resetTimer = () => {
                if (isSubmitted) return;
                remaining = Number(timer.dataset.duration) || 600;
                if (output) output.textContent = formatTime(remaining);
            };
            resetListeningTimer = resetTimer;
            resetTimer();
            clearInterval(root._listeningTimer);
        }

        function startListeningTimer() {
            if (!timer) return;
            clearInterval(timerInterval);
            clearInterval(root._listeningTimer);
            timerInterval = setInterval(() => {
                remaining = Math.max(0, remaining - 1);
                if (output) output.textContent = formatTime(remaining);
                if (remaining <= 0) {
                    handleTimeExpired();
                }
            }, 1000);
            root._listeningTimer = timerInterval;
        }

        function startListeningAttempt() {
            if (hasStarted || isSubmitted) return;
            hasStarted = true;
            if (preStartShell) preStartShell.hidden = true;
            if (testContent) testContent.hidden = false;
            if (bottomBar) bottomBar.hidden = false;
            if (submitButton) submitButton.disabled = false;
            
            const navContainer = root.querySelector("[data-listening-question-nav]");
            if (navContainer) navContainer.classList.remove("hidden");

            resetListeningTimer();
            startListeningTimer();

            if (isMockMode) {
                const activeSection = root.querySelector(".lc-listening-section:not(.hidden)") || root;
                activeSection.querySelectorAll("[data-audio-card]").forEach((card) => {
                    card._startListeningAudio?.();
                });
            }
        }

        root.querySelector("[data-pretest-start]")?.addEventListener("click", startListeningAttempt);

        function stopListeningTimer() {
            if (timerInterval) {
                clearInterval(timerInterval);
            }
            if (root._listeningTimer) {
                clearInterval(root._listeningTimer);
            }
            root._listeningTimer = null;
            if (timer) {
                const output = timer.querySelector("strong");
                if (output) output.textContent = formatTime(0);
            }
        }

        function handleTimeExpired() {
            autoSubmitTest();
        }

        function autoSubmitTest() {
            submitListeningTest({ auto: true });
        }

        function submitListeningTest(options = {}) {
            const isAutoSubmit = Boolean(options.auto);
            if (isSubmitted) return;
            isSubmitted = true;

            stopListeningTimer();
            window.IeltsResultUtils?.stopAudioPlayers?.(root);
            window.IeltsResultUtils?.disableAnswerInputs?.(root);
            root.querySelector(".lc-submit-button")?.setAttribute("disabled", "true");

            const status = root.querySelector(".lc-submit-status");
            if (status) {
                status.textContent = isMockMode
                    ? (isAutoSubmit ? autoSubmitMessage : "Moving to the next section...")
                    : (isAutoSubmit ? autoSubmitMessage : "Your Listening test has been submitted.");
            }
            root.dispatchEvent(new CustomEvent("listening-submit", {
                bubbles: true,
                detail: { autoSubmit: isAutoSubmit }
            }));
        }

        root.querySelector(".lc-submit-button")?.addEventListener("click", () => {
            if (!hasStarted) return;
            submitListeningTest();
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
        root.querySelector("[data-listening-review]")?.addEventListener("click", () => {
            root.querySelector("[data-listening-result-modal]")?.classList.add("hidden");
            root.dispatchEvent(new CustomEvent("listening-review", { bubbles: true }));
        });

        // Initialize Question Navigation
        const activeTest = test || window.ListeningComponents._activeTest || {};
        bindListeningQuestionNav(root, activeTest);

        if (isMockMode) {
            startListeningAttempt();
        }
    }

    function sampleListeningTest() {
        return clone({
            title: "IELTS Listening Test 1",
            duration: 40,
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
