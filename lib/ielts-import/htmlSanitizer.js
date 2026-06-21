const cheerio = require("cheerio");

const ALLOWED_TAGS = new Set([
    "p", "div", "span", "strong", "em", "b", "i", "u",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "br", "hr",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "img", "sup", "sub", "blockquote", "pre", "code", "label"
]);

const GLOBAL_ATTRS = new Set(["class", "id", "data-q-start", "data-q-end", "data-value", "data-blank"]);
const IMG_ATTRS = new Set(["src", "alt", "width", "height"]);

function sanitizeHtml(html) {
    if (!html || !String(html).trim()) return "";

    const $ = cheerio.load(`<div id="sanitize-root">${html}</div>`, {
        xml: false,
        decodeEntities: false
    }, false);

    const root = $("#sanitize-root");

    function cleanNode(el) {
        if (!el || el.type === "text") return;
        if (el.type !== "tag") {
            $(el).remove();
            return;
        }

        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
            $(el).replaceWith($(el).html() || "");
            return;
        }

        const attribs = { ...el.attribs };
        Object.keys(attribs).forEach((name) => {
            const lower = name.toLowerCase();
            if (lower.startsWith("on")) {
                $(el).removeAttr(name);
                return;
            }
            if (tag === "img") {
                if (!IMG_ATTRS.has(lower) && !GLOBAL_ATTRS.has(lower)) $(el).removeAttr(name);
                return;
            }
            if (lower === "href" || lower === "src") {
                const value = attribs[name] || "";
                if (/^\s*javascript:/i.test(value)) $(el).removeAttr(name);
                return;
            }
            if (!GLOBAL_ATTRS.has(lower)) $(el).removeAttr(name);
        });
    }

    root.find("*").each((_, el) => cleanNode(el));
    root.contents().each((_, el) => cleanNode(el));

    return root.html() || "";
}

function replaceInputsWithBlankMarkers(html) {
    if (!html) return { html: "", blanks: [] };
    const blanks = [];
    let output = String(html);

    output = output.replace(/<input\b[^>]*\bid=["']q(\d{1,2})["'][^>]*\/?>/gi, (_, num) => {
        blanks.push(Number(num));
        return `<span class="ielts-blank" data-blank="${num}">______</span>`;
    });

    output = output.replace(/<input\b[^>]*\/?>/gi, () => `<span class="ielts-blank">______</span>`);

    return { html: sanitizeHtml(output), blanks };
}

module.exports = {
    sanitizeHtml,
    replaceInputsWithBlankMarkers
};
