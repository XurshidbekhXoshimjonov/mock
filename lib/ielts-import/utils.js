const fs = require("fs");
const path = require("path");
const vm = require("vm");

function decodeHtml(value) {
    return String(value || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#039;/gi, "'")
        .replace(/&#39;/gi, "'")
        .replace(/&rsquo;/gi, "'")
        .replace(/&lsquo;/gi, "'")
        .replace(/&rdquo;/gi, '"')
        .replace(/&ldquo;/gi, '"')
        .replace(/&ndash;/gi, "-")
        .replace(/&mdash;/gi, "-");
}

function normalizeText(value) {
    return decodeHtml(value)
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function stripTags(html) {
    return normalizeText(
        String(html || "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<\/div>/gi, "\n")
            .replace(/<\/li>/gi, "\n")
            .replace(/<\/tr>/gi, "\n")
            .replace(/<\/h[1-6]>/gi, "\n")
            .replace(/<[^>]+>/g, "")
    );
}

function getAttr(tag, name) {
    const pattern = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
    const match = String(tag || "").match(pattern);
    return match ? decodeHtml(match[1]) : "";
}

function findStartTagById(html, id) {
    const pattern = new RegExp(`<([a-z0-9]+)\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, "i");
    const match = pattern.exec(html);
    if (!match) return null;
    return {
        tagName: match[1].toLowerCase(),
        tag: match[0],
        index: match.index,
        end: match.index + match[0].length
    };
}

function extractBalancedElementAt(html, startInfo) {
    const tagName = startInfo.tagName;
    const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
    tokenPattern.lastIndex = startInfo.index;
    let depth = 0;
    let token;

    while ((token = tokenPattern.exec(html)) !== null) {
        if (token[0].startsWith("</")) {
            depth--;
        } else if (!token[0].endsWith("/>")) {
            depth++;
        }
        if (depth === 0) {
            return {
                outerHTML: html.slice(startInfo.index, tokenPattern.lastIndex),
                innerHTML: html.slice(startInfo.end, token.index),
                startIndex: startInfo.index,
                endIndex: tokenPattern.lastIndex,
                startTag: startInfo.tag
            };
        }
    }
    return null;
}

function extractElementById(html, id) {
    const startInfo = findStartTagById(html, id);
    return startInfo ? extractBalancedElementAt(html, startInfo) : null;
}

function extractElementsByClass(html, className, tagName = "div") {
    const items = [];
    const pattern = new RegExp(
        `<${tagName}\\b(?=[^>]*\\bclass=["'][^"']*\\b${className}\\b)[^>]*>`,
        "gi"
    );
    let match;

    while ((match = pattern.exec(html)) !== null) {
        const startInfo = {
            tagName,
            tag: match[0],
            index: match.index,
            end: match.index + match[0].length
        };
        const element = extractBalancedElementAt(html, startInfo);
        if (element) {
            items.push(element);
            pattern.lastIndex = element.endIndex;
        }
    }
    return items;
}

function extractElementsByClassAnyTag(html, className) {
    const items = [];
    const pattern = new RegExp(
        `<([a-z0-9]+)\\b(?=[^>]*\\bclass=["'][^"']*\\b${className}\\b)[^>]*>`,
        "gi"
    );
    let match;

    while ((match = pattern.exec(html)) !== null) {
        const startInfo = {
            tagName: match[1].toLowerCase(),
            tag: match[0],
            index: match.index,
            end: match.index + match[0].length
        };
        const element = extractBalancedElementAt(html, startInfo);
        if (element) {
            items.push(element);
            pattern.lastIndex = element.endIndex;
        }
    }
    return items;
}

function parseQuestionRange(text) {
    const match = String(text || "").match(
        /questions?\s+(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})|questions?\s+(\d{1,2})|question\s+(\d{1,2})/i
    );
    if (!match) return null;
    if (match[1] && match[2]) {
        return { start: Number(match[1]), end: Number(match[2]) };
    }
    const single = Number(match[3] || match[4]);
    return { start: single, end: single };
}

function rangeTitle(start, end) {
    return start === end ? `Question ${start}` : `Questions ${start}–${end}`;
}

function slugify(value) {
    return String(value || "test")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "test";
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = {
    decodeHtml,
    normalizeText,
    stripTags,
    getAttr,
    findStartTagById,
    extractBalancedElementAt,
    extractElementById,
    extractElementsByClass,
    extractElementsByClassAnyTag,
    parseQuestionRange,
    rangeTitle,
    slugify,
    ensureDir,
    writeJson,
    readJson,
    vm
};
