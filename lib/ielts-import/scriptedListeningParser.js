const cheerio = require("cheerio");
const { normalizeText, stripTags } = require("./utils");
const { normalizeAnswerValue } = require("./answerExtractor");
const { sanitizeHtml } = require("./htmlSanitizer");

function clean(value) {
    return normalizeText(String(value || "").replace(/^[•\-\s]+/, ""));
}

function questionFieldSelector(number) {
    return [
        `input[id='q${number}']`,
        `input[id='inp${number}']`,
        `input[name='q${number}']`,
        `[data-q='${number}']`,
        `[data-question='${number}']`,
        `[data-question*='_${number}']`,
        `[data-question*='${number}_']`
    ].join(", ");
}

function keepAllowedInlineTags(html) {
    if (!html) return "";
    const $ = cheerio.load(`<div>${html}</div>`, { decodeEntities: false });
    $("*").each((_, el) => {
        const tagName = el.name.toLowerCase();
        if (["strong", "b", "u", "i", "em"].includes(tagName)) {
            el.attribs = {};
        } else {
            $(el).replaceWith($(el).html() || "");
        }
    });
    return $("div").first().html() || "";
}

function questionNumberFromField($field) {
    const value = $field.attr("id") || $field.attr("name") || "";
    const match = value.match(/(?:q|inp)(\d{1,2})/i);
    return match ? Number(match[1]) : null;
}

function extractQuestionText($, $field) {
    const container = $field.closest(".form-row, .question, li, p");
    const clone = container.length ? container.clone() : $field.parent().clone();
    clone.find("input, select, textarea").replaceWith("...");
    return clean(clone.text()).replace(/\s+([.,;:?])/g, "$1");
}

function extractQuestionTextClean($, $field, number) {
    const container = $field.parent().closest(".form-row, .question, li, p, div");
    const clone = container.length ? container.clone() : $field.parent().clone();
    
    // Replace inputs, selects, textareas, drop-zones with dots "..."
    clone.find("input, select, textarea, .drop-zone").replaceWith("...");
    
    // Remove label tags, and question number badges
    clone.find(".question-number, label, .lc-letter-badge").remove();
    
    let text = clean(clone.text()).replace(/\s+/g, " ").trim();
    
    // Remove leading question number e.g. "15." or "15 "
    text = text.replace(new RegExp(`^${number}[\\s.:]+`), "").trim();
    
    return text.replace(/\s+([.,;:?])/g, "$1");
}

function extractInstructionText($, $heading, $firstInput) {
    if (!$heading || !$firstInput || !$heading.length || !$firstInput.length) return "";
    
    // Find the ancestor of $firstInput that is a sibling of $heading
    let $firstInputAncestor = $firstInput;
    while ($firstInputAncestor.length && !$firstInputAncestor.parent().is($heading.parent())) {
        $firstInputAncestor = $firstInputAncestor.parent();
    }
    
    if (!$firstInputAncestor.length) return "";
    
    let textParts = [];
    let current = $heading.next();
    while (current.length && !current.is($firstInputAncestor)) {
        textParts.push(clean(current.text()));
        current = current.next();
    }
    
    return textParts.filter(Boolean).join(" ");
}

function extractTableCompletionContent($, $section, range) {
    let $table = null;
    $section("table").each((_, el) => {
        let hasInputInRange = false;
        for (let number = range.start; number <= range.end; number++) {
            if ($(el).find(questionFieldSelector(number)).length) {
                hasInputInRange = true;
                break;
            }
        }
        if (hasInputInRange) {
            $table = $(el);
        }
    });

    if (!$table || !$table.length) return null;

    const columns = [];
    $table.find("thead tr th, thead tr td").each((_, th) => {
        columns.push(clean($(th).html() || ""));
    });
    if (columns.length === 0) {
        $table.find("tr").first().find("td, th").each((_, th) => {
            columns.push(clean($(th).html() || ""));
        });
    }

    const rows = [];
    const startRowIdx = $table.find("thead").length ? 0 : 1;
    
    $table.find("tbody tr, tr").each((idx, tr) => {
        if (startRowIdx === 1 && idx === 0) return;
        
        const rowCells = [];
        $(tr).find("td, th").each((_, td) => {
            const $cellClone = $(td).clone();
            
            for (let number = range.start; number <= range.end; number++) {
                const $inputs = $cellClone.find(questionFieldSelector(number));
                $inputs.each((_, el) => {
                    $(el).replaceWith(`{{${number}}}`);
                });
            }
            
            $cellClone.find(".blank-wrap").each((_, wrap) => {
                const $wrap = $(wrap);
                $wrap.find(".qnum").remove();
                $wrap.replaceWith($wrap.html() || "");
            });
            
            let htmlText = $cellClone.html() || "";
            htmlText = htmlText.replace(/\s+/g, " ").trim();
            rowCells.push(htmlText);
        });
        
        if (rowCells.length > 0) {
            rows.push(rowCells);
        }
    });

    let groupTitle = "";
    let $titleEl = $table.prev();
    while ($titleEl.length) {
        const text = clean($titleEl.text());
        if (text && text.length < 100) {
            if ($titleEl.hasClass("centered-title") || $titleEl.is("h1, h2, h3, h4, h5, h6, strong")) {
                groupTitle = text;
                break;
            }
        }
        $titleEl = $titleEl.prev();
    }

    return { columns, rows, title: groupTitle };
}

function extractFormCompletionContent($, $section, range) {
    let $table = null;
    $section("table").each((_, el) => {
        let hasInputInRange = false;
        for (let number = range.start; number <= range.end; number++) {
            if ($(el).find(questionFieldSelector(number)).length) {
                hasInputInRange = true;
                break;
            }
        }
        if (hasInputInRange) {
            $table = $(el);
        }
    });

    if (!$table || !$table.length) return null;

    const rows = [];
    $table.find("tr").each((_, tr) => {
        const $tds = $(tr).find("td, th");
        if ($tds.length === 2) {
            const labelText = clean($($tds[0]).text());
            
            // Clone value td and replace inputs with placeholders
            const $valueClone = $($tds[1]).clone();
            for (let number = range.start; number <= range.end; number++) {
                const $inputs = $valueClone.find(questionFieldSelector(number));
                $inputs.each((_, el) => {
                    $(el).replaceWith(`{{${number}}}`);
                });
            }
            
            // Remove <br> and clean text
            $valueClone.find("br").replaceWith(" ");
            const valueText = clean($valueClone.text()).replace(/\s+/g, " ").trim();
            
            rows.push({
                label: labelText,
                value: valueText
            });
        }
    });

    if (rows.length === 0) return null;

    // Get group title (e.g. from preceding centered-title or strong header)
    let groupTitle = "";
    let $titleEl = $table.prev();
    while ($titleEl.length) {
        const text = clean($titleEl.text());
        if (text && text.length < 100) {
            if ($titleEl.hasClass("centered-title") || $titleEl.is("h1, h2, h3, h4, h5, h6, strong")) {
                groupTitle = text;
                break;
            }
        }
        $titleEl = $titleEl.prev();
    }

    return { rows, title: groupTitle };
}

function extractInlineCompletionContent($, $section, range) {
    const groupInputs = [];
    for (let number = range.start; number <= range.end; number++) {
        const $input = $section(questionFieldSelector(number)).first();
        if ($input.length) {
            groupInputs.push($input);
        }
    }
    
    if (groupInputs.length === 0) return null;
    
    // Find Lowest Common Ancestor
    let $lca = null;
    if (groupInputs.length === 1) {
        $lca = groupInputs[0].parent();
    } else {
        let current = groupInputs[0].parent();
        while (current.length) {
            let allDescendants = true;
            for (let i = 1; i < groupInputs.length; i++) {
                if (current.find(groupInputs[i]).length === 0) {
                    allDescendants = false;
                    break;
                }
            }
            if (allDescendants) {
                $lca = current;
                break;
            }
            current = current.parent();
        }
    }
    
    if (!$lca || !$lca.length) return null;
    
    // Guard: ensure LCA does not contain inputs from other questions
    let containsOtherQuestions = false;
    $lca.find("input, select, textarea, .drop-zone, [data-question], [data-question-number]").each((_, el) => {
        const id = $(el).attr("id") || "";
        const name = $(el).attr("name") || "";
        const dataQ = $(el).attr("data-question") || $(el).attr("data-question-number") || "";
        
        let qNum = null;
        if (dataQ) {
            const num = Number(dataQ.split(/[-_]/)[0]);
            if (!isNaN(num)) qNum = num;
        }
        if (!qNum) {
            const matchId = id.match(/q(\d{1,2})/i);
            if (matchId) qNum = Number(matchId[1]);
        }
        if (!qNum) {
            const matchName = name.match(/q(\d{1,2})/i);
            if (matchName) qNum = Number(matchName[1]);
        }
        
        if (qNum && (qNum < range.start || qNum > range.end)) {
            containsOtherQuestions = true;
        }
    });
    
    if (containsOtherQuestions) return null;
    
    // Extract title and example if present in parent/grandparent siblings
    let groupTitle = "";
    let exampleText = "";
    let $sibling = $lca.prev();
    while ($sibling.length) {
        const text = clean($sibling.text());
        if (text && text.length < 150 && !$sibling.find("input, select, textarea, .drop-zone").length) {
            const isExample = text.toLowerCase().includes("example");
            if (isExample) {
                const htmlText = $sibling.html() || "";
                exampleText = clean(htmlText.replace(/<br\s*\/?>/gi, " - "));
            } else if ($sibling.is("h1, h2, h3, h4, h5, h6, strong") || 
                $sibling.attr("style")?.includes("font-weight: bold") || 
                $sibling.attr("style")?.includes("text-align: center") ||
                $sibling.css("text-align") === "center" ||
                $sibling.css("font-weight") === "bold") {
                groupTitle = text;
                break;
            }
        }
        $sibling = $sibling.prev();
    }

    if (!groupTitle) {
        let $parentSibling = $lca.parent().prev();
        while ($parentSibling.length) {
            const text = clean($parentSibling.text());
            if (text && text.length < 150 && !$parentSibling.find("input, select, textarea, .drop-zone").length) {
                const isExample = text.toLowerCase().includes("example");
                if (isExample) {
                    const htmlText = $parentSibling.html() || "";
                    exampleText = clean(htmlText.replace(/<br\s*\/?>/gi, " - "));
                } else if ($parentSibling.is("h1, h2, h3, h4, h5, h6, strong") || 
                    $parentSibling.attr("style")?.includes("font-weight: bold") || 
                    $parentSibling.attr("style")?.includes("text-align: center") ||
                    $parentSibling.css("text-align") === "center" ||
                    $parentSibling.css("font-weight") === "bold") {
                    groupTitle = text;
                    break;
                }
            }
            $parentSibling = $parentSibling.prev();
        }
    }

    // Clone and replace inputs with placeholders
    const $clone = $lca.clone();
    for (let number = range.start; number <= range.end; number++) {
        const $inputs = $clone.find(questionFieldSelector(number));
        $inputs.each((_, el) => {
            $(el).replaceWith(`{{${number}}}`);
        });
    }
    
    // Clean up .blank-wrap and .qnum elements
    $clone.find(".blank-wrap").each((_, wrap) => {
        const $wrap = $(wrap);
        $wrap.find(".qnum").remove();
        $wrap.replaceWith($wrap.html() || "");
    });
    
    // Combine .paper-row label and content side-by-side
    $clone.find(".paper-row").each((_, row) => {
        const $row = $(row);
        const label = $row.find(".paper-label").first();
        const content = $row.find(".paper-content").first();
        if (label.length && content.length) {
            const combinedHtml = `${label.html()} ${content.html()}`;
            $row.html(combinedHtml);
        }
    });

    // Remove source-rendered question badges. The normalized renderer adds its
    // own badge beside each {{N}} placeholder, so keeping these duplicates the
    // number in the student view.
    $clone.find(".question-number, .qn, .qnum").remove();
    
    // Replace <br> elements with a space to avoid text concatenation issues
    $clone.find("br").replaceWith(" ");
    
    // Extract lines recursively
    const lines = [];
    function traverse(node) {
        if (node.type === "text") {
            const text = clean($(node).text());
            if (text) {
                lines.push(text);
            }
            return;
        }
        
        if (node.type === "tag") {
            const tagName = node.name.toLowerCase();
            if (tagName === "br") {
                lines.push("");
                return;
            }
            
            const isBlock = ["div", "p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "ol", "ul", "strong", "span"].includes(tagName);
            if (isBlock) {
                const hasBlockChildren = $(node).children().toArray().some(child => 
                    ["div", "p", "li", "h1", "h2", "h3", "h4", "h5", "h6"].includes(child.name.toLowerCase())
                );
                
                if (!hasBlockChildren) {
                    let lineText = clean(keepAllowedInlineTags($(node).html()));
                    lineText = lineText.replace(/\s+/g, " ").trim();
                    if (lineText) {
                        const placeholderNumber = lineText.match(/\{\{(\d{1,2})\}\}/)?.[1];
                        if (placeholderNumber) {
                            lineText = lineText
                                .replace(new RegExp(`^${placeholderNumber}[\\s.:)\\]-]+`), "")
                                .trim();
                        }
                        lineText = lineText.replace(/\s+([.,;:?])/g, "$1");
                        if (tagName === "li") {
                            const rawHtml = String($(node).html() || "").trim();
                            const rawText = String($(node).text() || "").trim();
                            const hasManualBullet = rawHtml.startsWith("&bull;") || 
                                                    rawHtml.startsWith("•") || 
                                                    rawText.startsWith("•") ||
                                                    rawText.startsWith("*") ||
                                                    rawText.startsWith("-");
                            
                            const $li = $(node);
                            const $parent = $li.closest("ul, ol");
                            const parentStyle = String($parent.attr("style") || "").toLowerCase();
                            const liStyle = String($li.attr("style") || "").toLowerCase();
                            const hasNoBulletStyle = parentStyle.replace(/\s+/g, "").includes("list-style-type:none") ||
                                                     parentStyle.replace(/\s+/g, "").includes("list-style:none") ||
                                                     liStyle.replace(/\s+/g, "").includes("list-style-type:none") ||
                                                     liStyle.replace(/\s+/g, "").includes("list-style:none");
                            
                            const shouldHaveBullet = hasManualBullet || !hasNoBulletStyle;
                            if (shouldHaveBullet) {
                                lines.push(`• ${lineText}`);
                            } else {
                                lines.push(lineText);
                            }
                        } else {
                            lines.push(lineText);
                        }
                    }
                } else {
                    $(node).contents().each((_, child) => {
                        traverse(child);
                    });
                }
            } else {
                $(node).contents().each((_, child) => {
                    traverse(child);
                });
            }
        }
    }
    
    traverse($clone[0]);
    
    let noteStyle = "";
    if ($lca && $lca.length) {
        const style = String($lca.attr("style") || "").toLowerCase();
        const parentStyle = String($lca.parent().attr("style") || "").toLowerCase();
        const hasBorderClass = $lca.hasClass("note-box") || 
                               $lca.parent().hasClass("note-box") || 
                               $lca.closest(".notes-box, .note-box, .boxed-flow").length > 0;
        if (style.includes("border") || parentStyle.includes("border") || hasBorderClass) {
            noteStyle = "boxed-flow";
        }
    }
    
    const finalLines = lines.filter(line => line.trim().length > 0);
    return finalLines.length > 0 ? { lines: finalLines, title: groupTitle, example: exampleText, noteStyle } : null;
}

function optionsFromLabels($, labels) {
    return labels.map((label) => {
        const $label = $(label);
        const input = $label.find("input[type='radio'], input[type='checkbox']").first();
        const value = String(input.attr("value") || "").trim().toUpperCase();
        
        const $clone = $label.clone();
        $clone.find("input").remove();
        $clone.find(".letter").remove();
        
        const labelText = clean($clone.text());
        const text = value
            ? labelText.replace(new RegExp(`^${value}[\\).:\\s-]*`, "i"), "").trim()
            : labelText;

        return {
            value,
            label: text || labelText,
            html: text || labelText
        };
    }).filter((option) => option.value);
}

function rangeFromText(value) {
    const match = String(value || "").match(/questions?\s+(\d{1,2})\s*[–—-]\s*(\d{1,2})/i);
    return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
}

function parseQuestionTypesObject(html) {
    const match = String(html || "").match(/(?:const|let|var)?\s*questionTypes\s*=\s*(\{[\s\S]*?\});/);
    if (!match) return {};

    try {
        const { vm } = require("./utils");
        return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
    } catch (error) {
        return {};
    }
}

function parseInstructionText(content) {
    const textStr = stripTags(content);
    const titleMatch = textStr.match(/questions?\s+\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}|question\s+\d{1,2}/i);
    const title = titleMatch ? titleMatch[0] : "";
    const text = textStr
        .replace(title, "")
        .replace(/\s+/g, " ")
        .trim();

    return { title, text };
}

function parseStandaloneListeningHtml(html, answers = {}) {
    const $ = cheerio.load(String(html || ""), { decodeEntities: false });
    
    // Extract questionTypes from script
    const questionTypes = parseQuestionTypesObject(html);

    // Split by sections using splitListeningSections
    const { splitListeningSections } = require("./sectionSplitter");
    const sections = splitListeningSections(html);

    return sections.map((sectionBlock, index) => {
        const partNumber = sectionBlock.number || index + 1;
        const sectionHtml = sectionBlock.sectionHtml || "";
        const $section = cheerio.load(sectionHtml, { decodeEntities: false });
        
        // Find all question inputs and elements in the section html
        const questionNumbersSet = new Set();
        $section("input, select, textarea, .drop-zone, [data-q], [data-question], [data-question-number]").each((_, el) => {
            const $el = $section(el);
            const id = $el.attr("id") || "";
            const name = $el.attr("name") || "";
            const dataQ = $el.attr("data-q") || $el.attr("data-question") || $el.attr("data-question-number") || "";
            
            if (dataQ) {
                const parts = dataQ.split(/[-_]/);
                parts.forEach(part => {
                    const num = Number(part);
                    if (!isNaN(num) && num >= 1 && num <= 40) {
                        questionNumbersSet.add(num);
                    }
                });
            }
            
            const matchId = id.match(/(?:q|inp)(\d{1,2})/i);
            if (matchId) questionNumbersSet.add(Number(matchId[1]));
            
            const matchName = name.match(/q(\d{1,2})/i);
            if (matchName) questionNumbersSet.add(Number(matchName[1]));
        });
        const questionNumbers = [...questionNumbersSet].sort((a, b) => a - b);

        if (questionNumbers.length === 0) {
            return {
                number: partNumber,
                title: `Part ${partNumber}`,
                sectionHtml: sanitizeHtml(sectionHtml),
                questionGroups: []
            };
        }

        // Find all potential range headers in the section
        const headings = [];
        $section(".question-prompt, .part-header, .instruction, .instr, .questions-title, .scenario-title, .part-title, .stitle, h1, h2, h3, h4, h5, h6, p, div, strong").each((_, el) => {
            const text = clean($section(el).text());
            const range = rangeFromText(text);
            if (range) {
                headings.push({
                    element: $section(el),
                    text,
                    range
                });
            }
        });

        // Filter headings to get unique ranges, choosing the element with the shortest text to avoid large container divs
        const headingsByRange = {};
        for (const h of headings) {
            const key = `${h.range.start}-${h.range.end}`;
            if (!headingsByRange[key]) {
                headingsByRange[key] = [];
            }
            headingsByRange[key].push(h);
        }

        const uniqueHeadings = Object.values(headingsByRange).map((list) => {
            return list.reduce((best, current) => {
                return current.text.length < best.text.length ? current : best;
            }, list[0]);
        });

        // Filter out ranges that are proper supersets of other ranges (e.g. discard 21-30 in favor of 21-22, 23-27, 28-30)
        const nonCoveringHeadings = [];
        for (const h of uniqueHeadings) {
            const isCovering = uniqueHeadings.some(other => {
                if (other === h) return false;
                return other.range.start >= h.range.start && other.range.end <= h.range.end &&
                       (other.range.start !== h.range.start || other.range.end !== h.range.end);
            });
            if (!isCovering) {
                nonCoveringHeadings.push(h);
            }
        }

        nonCoveringHeadings.sort((a, b) => a.range.start - b.range.start);

        // If no headings found, default to one group spanning all question numbers
        if (nonCoveringHeadings.length === 0) {
            nonCoveringHeadings.push({
                text: `Questions ${questionNumbers[0]}-${questionNumbers[questionNumbers.length - 1]}`,
                range: { start: questionNumbers[0], end: questionNumbers[questionNumbers.length - 1] }
            });
        }

        // Build question groups
        const questionGroups = nonCoveringHeadings.map((heading) => {
            const range = heading.range;
            
            let headingText = heading.text;
            let headingElement = heading.element;
            if (headingElement && headingElement.length) {
                const container = headingElement.closest(".question-prompt, .part-header, .instruction, .questions-title, .scenario-title");
                if (container.length) {
                    headingElement = container;
                    headingText = clean(container.text());
                }
            }
            
            const parsedInstr = parseInstructionText(headingText);
            const groupQuestions = [];

            for (let number = range.start; number <= range.end; number++) {
                // Determine type
                let type = "sentence_completion";
                const $input = $section(questionFieldSelector(number)).first();
                const scriptType = questionTypes[`q${number}`] || questionTypes[String(number)];
                
                if ($input.length) {
                    const inputType = $input.attr("type");
                    if ($input.is("select")) {
                        type = "matching";
                    } else if (inputType === "radio") {
                        type = "multiple_choice";
                    } else if (inputType === "checkbox") {
                        type = "multi_select";
                    } else if ($input.hasClass("drop-zone") || $input.closest(".drop-zone").length) {
                        type = "matching";
                    } else if (inputType === "text") {
                        type = "sentence_completion";
                    } else {
                        if (scriptType === "mcq") {
                            type = "multiple_choice";
                        } else if (scriptType === "checkbox") {
                            type = "multi_select";
                        } else if (scriptType === "dragdrop" || scriptType === "matching") {
                            type = "matching";
                        }
                    }
                } else {
                    if (scriptType === "mcq") {
                        type = "multiple_choice";
                    } else if (scriptType === "checkbox") {
                        type = "multi_select";
                    } else if (scriptType === "dragdrop" || scriptType === "matching") {
                        type = "matching";
                    }
                }

                if (!questionNumbers.includes(number) && type !== "multi_select" && !answers[String(number)]) {
                    continue;
                }

                // Correct answer
                let answerVal = answers[String(number)];
                if (!answerVal) {
                    answerVal = answers[`q${number}`];
                }
                const answer = normalizeAnswerValue(answerVal);

                const qObj = {
                    number,
                    type,
                    question: "",
                    options: [],
                    answer
                };

                // Extract details based on type
                if (type === "multiple_choice") {
                    const radioInputs = $section(`input[type='radio'][name='q${number}']`).toArray();
                    const labels = radioInputs.map(input => $section(input).closest("label")).filter(l => l.length);
                    if (labels.length) {
                        qObj.options = optionsFromLabels($section, labels);
                    } else {
                        // Fallback for table-based MCQ options (using column headers and lookup)
                        const $table = $section(`input[name='q${number}']`).closest("table");
                        if ($table.length) {
                            const headers = [];
                            $table.find("thead th").each((idx, th) => {
                                if (idx > 0) headers.push(clean($(th).text()).toUpperCase());
                            });
                            if (headers.length) {
                                qObj.options = headers.map(letter => {
                                    let description = "";
                                    $section("p, div, td, li, strong").each((_, el) => {
                                        const text = clean($section(el).text());
                                        const match = text.match(new RegExp(`^${letter}\\b[\\s.:\\u2013\\u2014-—]+(.+)$`));
                                        if (match && match[1].trim().length > 1) {
                                            description = match[1].trim();
                                        }
                                    });
                                    return {
                                        value: letter,
                                        label: description ? `${letter} - ${description}` : letter,
                                        html: description || letter
                                    };
                                });
                            }
                        }
                    }

                    // Extract question text
                    let qText = "";
                    const $tr = $section(`input[name='q${number}']`).closest("tr");
                    if ($tr.length) {
                        const $firstTd = $tr.find("td").first().clone();
                        $firstTd.find(".question-number, strong, span.sr-only").remove();
                        let tdText = clean($firstTd.text());
                        tdText = tdText.replace(new RegExp(`^${number}[\\s.:]*`), "").trim();
                        if (tdText) {
                            qText = tdText.replace(/\s+([.,;:?])/g, "$1");
                        }
                    }

                    if (!qText) {
                        const $input = $section(`input[name='q${number}']`).first();
                        let $badge = $section(`.question-number`).filter((_, el) => clean($(el).text()) === String(number)).first();
                        const $targetField = $input.length ? $input : $badge;
                        if ($targetField.length) {
                            qText = extractQuestionTextClean($, $targetField, number);
                        }
                    }
                    if (!qText) {
                        $section("p, div, td, li, strong").each((_, el) => {
                            const txt = clean($section(el).text());
                            if (txt.startsWith(`${number}.`) || txt.startsWith(`${number} `)) {
                                qText = txt.replace(new RegExp(`^${number}[\\s.:]+`), "").trim();
                            }
                        });
                    }
                    qObj.question = qText;

                    if (!qObj.question) {
                        const container = $section(`input[name='q${number}']`).closest(".multi-choice-question, .question, p, div");
                        if (container.length) {
                            const clone = container.clone();
                            clone.find("label, input, br, .lc-letter-badge, .question-number").remove();
                            qObj.question = clean(clone.text().replace(new RegExp(`^${number}\\.?\\s*`), ""));
                        }
                        if (!qObj.question && container.length) {
                            qObj.question = clean(container.find(".question-prompt").text().replace(new RegExp(`^${number}\\.?\\s*`), ""));
                        }
                    }
                } else if (type === "multi_select") {
                    const checkboxInputs = $section("input[type='checkbox']").toArray().filter(cb => {
                        const $cb = $section(cb);
                        const name = $cb.attr("name") || "";
                        const dataQ = $cb.attr("data-question") || "";
                        return name.includes(`q${number}`) || 
                               name.includes(`_${number}`) || 
                               name.includes(`${number}_`) || 
                               dataQ.split(/[-_]/).includes(String(number));
                    });
                    const labels = checkboxInputs.map(input => $section(input).closest("label")).filter(l => l.length);
                    if (labels.length) {
                        qObj.options = optionsFromLabels($section, labels);
                    }

                    const headingEl = checkboxInputs.length ? $section(checkboxInputs[0]).closest(".question").find(".question-prompt, h2, h3, h4, p").first() : null;
                    if (headingEl && headingEl.length) {
                        const clone = headingEl.clone();
                        clone.find("strong, span.sr-only").remove();
                        qObj.question = clean(clone.text().replace(new RegExp(`^Questions?\\s+\\d+.*$`, "i"), ""));
                    }
                    if (!qObj.question) {
                        qObj.question = parsedInstr.text;
                    }
                } else if (type === "matching") {
                    const $select = $section(`select[data-q='${number}'], select[name='q${number}'], select[id='q${number}']`).first();
                    if ($select.length) {
                        qObj.options = $select.find("option").toArray().map(option => {
                            const $option = $section(option);
                            const value = clean($option.attr("value") || "");
                            const label = clean($option.text());
                            return {
                                value,
                                label: label || value,
                                html: label.replace(new RegExp(`^${value}[\\s.:\\u2013\\u2014-—]*`), "").trim()
                            };
                        }).filter(option => option.value);

                        const $matchRows = $select.closest(".match-rows, .matching-rows");
                        const $matchBox = $matchRows.prevAll(".match-box, .matching-options-box").first();
                        const boxOptions = $matchBox.find(".match-opts > *, .matching-options > *").toArray().map(option => {
                            const text = clean($section(option).text());
                            const match = text.match(/^([A-Z])\b[\s.:\u2013\u2014-—]*(.+)$/);
                            if (!match) return null;
                            return {
                                value: match[1],
                                label: `${match[1]} - ${match[2].trim()}`,
                                html: match[2].trim()
                            };
                        }).filter(Boolean);
                        if (boxOptions.length) {
                            qObj.options = boxOptions;
                        }
                    }

                    const dragItems = $section(".drag-item").toArray();
                    if (!qObj.options.length && dragItems.length) {
                        qObj.options = dragItems.map(item => {
                            const text = clean($section(item).text());
                            const letter = text.match(/^([A-Z])\b/)?.[1] || "";
                            const html = text.replace(new RegExp(`^${letter}\\s*`), "").trim();
                            return { value: letter, label: text, html };
                        }).filter(o => o.value);
                    }

                    // Try to enrich option descriptions from the section text
                    if (qObj.options && qObj.options.length) {
                        qObj.options = qObj.options.map(opt => {
                            let description = opt.html || "";
                            description = description.replace(/^[\s.:\u2013\u2014-—]+/, "").trim();
                            
                            if (!description) {
                                $section("p, div, td, li, strong").each((_, el) => {
                                    const text = clean($section(el).text());
                                    const match = text.match(new RegExp(`^${opt.value}\\b[\\s.:\\u2013\\u2014-—]+(.+)$`));
                                    if (match && match[1].trim().length > 1) {
                                        description = match[1].trim();
                                    }
                                });
                            }
                            
                            description = description.replace(/^[\s.:\u2013\u2014-—]+/, "").trim();
                            
                            return {
                                value: opt.value,
                                label: description ? `${opt.value} - ${description}` : opt.value,
                                html: description
                            };
                        });
                    } else {
                        const detectedOptions = [];
                        const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
                        for (const letter of letters) {
                            let description = "";
                            $section("p, div, td, li, strong").each((_, el) => {
                                const text = clean($section(el).text());
                                const match = text.match(new RegExp(`^${letter}\\b[\\s.:\\u2013\\u2014-—]+(.+)$`));
                                if (match && match[1].trim().length > 1) {
                                    description = match[1].trim();
                                }
                            });
                            if (description) {
                                detectedOptions.push({
                                    value: letter,
                                    label: `${letter} - ${description}`,
                                    html: description
                                });
                            }
                        }
                        if (detectedOptions.length > 0) {
                            qObj.options = detectedOptions;
                        }
                    }

                    let qText = "";
                    if ($select.length) {
                        const $row = $select.closest(".match-row, .matching-row, tr, li, p").clone();
                        $row.find("select, option, .ml, .qnum, .q-num, .question-number").remove();
                        qText = clean($row.text().replace(new RegExp(`^${number}[\\s.:]*`), ""));
                    }
                    const $input = $section(questionFieldSelector(number)).first();
                    let $badge = $section(`.question-number`).filter((_, el) => clean($(el).text()) === String(number)).first();
                    const $targetField = $input.length ? $input : $badge;
                    if (!qText && $targetField.length) {
                        qText = extractQuestionTextClean($, $targetField, number);
                    }
                    if (!qText && $select.length) {
                        const $row = $select.closest(".match-row, .matching-row, tr, li, p, div").clone();
                        $row.find("select, option, .ml, .qnum, .q-num, .question-number").remove();
                        qText = clean($row.text().replace(new RegExp(`^${number}[\\s.:]*`), ""));
                    }
                    if (!qText) {
                        $section("p, div, td, li, strong").each((_, el) => {
                            const txt = clean($section(el).text());
                            if (txt.startsWith(`${number}.`) || txt.startsWith(`${number} `)) {
                                qText = txt.replace(new RegExp(`^${number}[\\s.:]+`), "").trim();
                            }
                        });
                    }
                    qObj.question = qText;
                } else {
                    const $input = $section(questionFieldSelector(number)).first();
                    if ($input.length) {
                        qObj.question = extractQuestionText($, $input);
                    }
                }

                groupQuestions.push(qObj);
            }

            // Extract sibling instruction text if possible
            const $firstInput = $section(questionFieldSelector(range.start)).first();
            let siblingInstrText = "";
            if (headingElement && $firstInput.length) {
                siblingInstrText = extractInstructionText($, headingElement, $firstInput);
            }
            let instructionText = (parsedInstr.text + " " + siblingInstrText).replace(/\s+/g, " ").trim();

            let groupType = groupQuestions[0]?.type || "sentence_completion";
            let content = null;
            let groupTitle = "";
            let exampleText = "";
            let formRows = null;
            let noteStyleText = "";
            let tableColumns = null;
            let tableRows = null;

            if (groupType === "matching" && headingElement && headingElement.length) {
                const $matchingInstruction = headingElement.nextAll(".instr, .instruction").first();
                if ($matchingInstruction.length) {
                    instructionText = clean($matchingInstruction.text());
                }
            }
 
            if (groupType === "sentence_completion") {
                const tableData = extractTableCompletionContent($, $section, range);
                if (tableData) {
                    groupType = "table_completion";
                    tableColumns = tableData.columns;
                    tableRows = tableData.rows;
                    if (tableData.title) {
                        groupTitle = tableData.title;
                    }
                } else {
                    const formData = extractFormCompletionContent($, $section, range);
                    if (formData) {
                        groupType = "form_completion";
                        formRows = formData.rows;
                        if (formData.title) {
                            groupTitle = formData.title;
                        }
                    } else {
                        const inlineData = extractInlineCompletionContent($, $section, range);
                        if (inlineData) {
                            groupType = "note_completion";
                            content = inlineData.lines;
                            if (inlineData.title) {
                                groupTitle = inlineData.title;
                            }
                            if (inlineData.example) {
                                exampleText = inlineData.example;
                            }
                            if (inlineData.noteStyle) {
                                noteStyleText = inlineData.noteStyle;
                            }
                        }
                    }
                }
            }
 
            let imageUrl = "";
            if (headingElement && headingElement.length) {
                let current = headingElement.next();
                const nextHeadingIndex = nonCoveringHeadings.indexOf(heading) + 1;
                const nextHeading = nonCoveringHeadings[nextHeadingIndex];
                const $nextHeadingEl = nextHeading ? nextHeading.element : null;
                
                while (current.length && (!$nextHeadingEl || !current.is($nextHeadingEl))) {
                    const img = current.find("img").first();
                    if (img.length) {
                        imageUrl = img.attr("src") || "";
                        break;
                    }
                    if (current.is("img")) {
                        imageUrl = current.attr("src") || "";
                        break;
                    }
                    current = current.next();
                }
            }
            if (!imageUrl) {
                const imgs = $section("img");
                if (imgs.length === 1) {
                    imageUrl = imgs.first().attr("src") || "";
                }
            }

            const detectedOptions = extractOptionRangeFromInstruction(instructionText);
            const groupObj = {
                type: groupType,
                instructionTitle: parsedInstr.title || heading.text,
                instructionText: instructionText || "",
                questions: groupQuestions
            };

            if (detectedOptions && detectedOptions.length > 0 && (!groupObj.options || groupObj.options.length === 0)) {
                groupObj.options = detectedOptions;
            }

            if (groupType === "matching") {
                const $firstSelect = $section(
                    `select[data-q='${range.start}'], select[name='q${range.start}'], select[id='q${range.start}']`
                ).first();
                const $matchRows = $firstSelect.closest(".match-rows, .matching-rows");
                const $matchBox = $matchRows.prevAll(".match-box, .matching-options-box").first();
                const optionsTitle = clean($matchBox.find(".match-box-title, .matching-options-title").first().text());
                if (optionsTitle) {
                    groupObj.optionsTitle = optionsTitle;
                }
                if (groupQuestions[0]?.options?.length) {
                    groupObj.options = groupQuestions[0].options;
                }
            }

            if (imageUrl) {
                groupObj.imageUrl = imageUrl;
            }
 
            if (content) {
                groupObj.content = content;
            }
            if (formRows) {
                groupObj.rows = formRows;
            }
            if (tableColumns) {
                groupObj.columns = tableColumns;
            }
            if (tableRows) {
                groupObj.rows = tableRows;
            }
            if (groupTitle) {
                groupObj.title = groupTitle;
            }
            if (exampleText) {
                groupObj.example = exampleText;
            }
            if (noteStyleText) {
                groupObj.noteStyle = noteStyleText;
            }
 
            return groupObj;
        }).filter(group => group.questions.length > 0);

        return {
            number: partNumber,
            title: `Part ${partNumber}`,
            sectionHtml: sanitizeHtml(sectionHtml),
            questionGroups
        };
    });
}

function extractOptionRangeFromInstruction(instruction) {
    if (!instruction) return [];
    
    const match = instruction.match(/\b([A-Z])\s*(?:-|–|—|to)\s*([A-Z])\b/);
    if (match) {
        const startChar = match[1].toUpperCase().charCodeAt(0);
        const endChar = match[2].toUpperCase().charCodeAt(0);
        
        if (startChar < endChar && (endChar - startChar) <= 25) {
            const options = [];
            for (let code = startChar; code <= endChar; code++) {
                const letter = String.fromCharCode(code);
                options.push({ letter, text: letter });
            }
            return options;
        }
    }
    return [];
}

module.exports = {
    parseStandaloneListeningHtml
};
