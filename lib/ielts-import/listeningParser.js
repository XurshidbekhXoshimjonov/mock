const {
    loadDom,
    sanitizeHtml,
    extractQuestionGroup,
    findQuestionGroups,
    outerHtml
} = require("./domParser");
const { splitListeningSections } = require("./sectionSplitter");

function extractAudioSrc(html) {
    const match = html.match(/<audio\b[^>]*>[\s\S]*?<source\b[^>]*\bsrc=["']([^"']+)["']/i)
        || html.match(/<audio\b[^>]*\bsrc=["']([^"']+)["']/i);
    return match ? match[1] : "";
}

function parseListeningSection(sectionBlock, answers) {
    const $ = loadDom(sectionBlock.sectionHtml || "");
    const container = $.root();
    const groups = findQuestionGroups($, container);

    let questionGroups = groups.map((groupEl) => extractQuestionGroup($, groupEl, answers, "listening"));

    if (!questionGroups.length) {
        questionGroups = [extractQuestionGroup($, container, answers, "listening")];
    }

    return {
        number: sectionBlock.number,
        title: sectionBlock.title || `Section ${sectionBlock.number}`,
        sectionHtml: sanitizeHtml(sectionBlock.sectionHtml || ""),
        questionGroups
    };
}

function parseListeningHtml(html, answers = {}) {
    const sections = splitListeningSections(html).map((block) => parseListeningSection(block, answers));
    const audio = extractAudioSrc(html);

    return { audio, sections };
}

module.exports = {
    parseListeningHtml,
    extractAudioSrc,
    parseListeningSection
};
