const cheerio = require("cheerio");
const {
    loadDom,
    sanitizeHtml,
    extractPassageLabel,
    extractPassageTitle,
    extractParagraphs,
    extractQuestionGroup,
    findQuestionGroups
} = require("./domParser");
const { splitCambridgePassages, splitModernReadingPassages } = require("./sectionSplitter");
const { parseScriptedReadingHtml } = require("./scriptedReadingParser");

function parsePassageFromHtml(passageHtmlRaw) {
    const $ = loadDom(passageHtmlRaw);
    const root = $.root().children().first().length ? $.root() : $("body");

    const passageLabel = extractPassageLabel($, root);
    const passageTitle = extractPassageTitle($, root);
    const paragraphs = extractParagraphs($, root);
    const passageHtml = sanitizeHtml(passageHtmlRaw);

    const passageText = paragraphs.map((p) => p.text).filter(Boolean).join("\n\n");

    return {
        passageLabel,
        passageTitle,
        title: passageTitle,
        paragraphs,
        passageHtml,
        passageText
    };
}

function parseQuestionsFromHtml(questionsHtml, passageHtml, answers) {
    const $ = loadDom(questionsHtml);
    const container = $.root();
    const groups = findQuestionGroups($, container);

    return groups.map((groupEl) => extractQuestionGroup($, groupEl, answers, "reading"));
}

function parseReadingSection(passageBlock, answers) {
    const passage = parsePassageFromHtml(passageBlock.passageHtml || "");
    const questionGroups = parseQuestionsFromHtml(
        passageBlock.questionsHtml || "",
        passage.passageHtml,
        answers
    );

    return {
        number: passageBlock.number,
        title: passage.passageTitle || passageBlock.title || `Passage ${passageBlock.number}`,
        passageLabel: passage.passageLabel,
        passageTitle: passage.passageTitle,
        paragraphs: passage.paragraphs,
        passageText: passage.passageText,
        passageHtml: passage.passageHtml,
        questionGroups
    };
}

function parseReadingHtml(html, answers = {}) {
    const scriptedPassages = parseScriptedReadingHtml(html, answers);
    if (scriptedPassages.length) {
        return scriptedPassages;
    }

    let passageBlocks = splitCambridgePassages(html);

    if (!passageBlocks.length || passageBlocks.every((block) => !String(block.passageHtml || "").trim())) {
        passageBlocks = splitModernReadingPassages(html);
    }

    if (!passageBlocks.length) {
        const $ = loadDom(html);
        const $passage = $("#passage-text-1, .modern-passage").first();
        const $questions = $("#questions-1, .question-block").parent();

        passageBlocks = [{
            number: 1,
            passageHtml: $passage.length ? $.html($passage) : html,
            questionsHtml: $questions.length ? $.html($questions) : html
        }];
    }

    return passageBlocks.map((block) => parseReadingSection(block, answers));
}

module.exports = {
    parseReadingHtml,
    parsePassageFromHtml,
    parseQuestionsFromHtml
};
