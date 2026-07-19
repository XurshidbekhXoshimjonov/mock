const {
    loadDom,
    sanitizeHtml,
    extractQuestionGroup,
    findQuestionGroups,
    outerHtml
} = require("./domParser");
const { splitListeningSections } = require("./sectionSplitter");
const { parseStandaloneListeningHtml } = require("./scriptedListeningParser");

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
    const scriptedSections = parseStandaloneListeningHtml(html, answers);
    const sections = splitListeningSections(html).map((block) => parseListeningSection(block, answers));
    const audio = extractAudioSrc(html);
    const questionCount = (section) => (section?.questionGroups || []).reduce(
        (sum, group) => sum + (group.questions || []).length,
        0
    );
    const sectionNumbers = new Set([
        ...sections.map((section) => section.number),
        ...scriptedSections.map((section) => section.number)
    ]);
    const bestSections = [...sectionNumbers].sort((a, b) => a - b).map((number) => {
        const generic = sections.find((section) => section.number === number);
        const scripted = scriptedSections.find((section) => section.number === number);
        return questionCount(scripted) >= questionCount(generic) ? scripted : generic;
    }).filter(Boolean);

    return {
        audio,
        sections: bestSections
    };
}

module.exports = {
    parseListeningHtml,
    extractAudioSrc,
    parseListeningSection
};
