const { normalizeText, decodeHtml } = require("./utils");

function loadHtml(input) {
    const html = typeof input === "string" ? input : String(input || "");
    return normalizeText(html.replace(/^\uFEFF/, ""));
}

function extractTitle(html) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
        return decodeHtml(titleMatch[1]).trim();
    }
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    return h1Match ? decodeHtml(h1Match[1]).replace(/<[^>]+>/g, "").trim() : "IELTS Test";
}

function extractMetadataFromFileName(fileName) {
    const base = String(fileName || "").replace(/\.html?$/i, "");
    const cambridge = base.match(/cambridge\s*ielts\s*(\d+)\s*test\s*(\d+)/i);
    if (cambridge) {
        return {
            book: `Cambridge IELTS ${cambridge[1]}`,
            testNumber: Number(cambridge[2]),
            label: base
        };
    }
    return { book: "", testNumber: null, label: base };
}

function splitByMarkers(html, markers) {
    const sections = [];
    let cursor = 0;

    markers.forEach((marker, index) => {
        const position = html.indexOf(marker.pattern, cursor);
        if (position === -1) return;
        if (index > 0 && cursor < position) {
            sections[sections.length - 1].html = html.slice(cursor, position);
        }
        sections.push({
            key: marker.key,
            label: marker.label,
            start: position,
            html: ""
        });
        cursor = position + marker.pattern.length;
    });

    if (sections.length) {
        sections[sections.length - 1].html = html.slice(cursor);
    }

    return sections;
}

module.exports = {
    loadHtml,
    extractTitle,
    extractMetadataFromFileName,
    splitByMarkers
};
