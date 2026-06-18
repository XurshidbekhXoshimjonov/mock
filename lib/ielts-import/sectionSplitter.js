const cheerio = require("cheerio");
const { extractElementById, parseQuestionRange } = require("./utils");

function splitCambridgePassages(html) {
    const passages = [];

    for (let part = 1; part <= 3; part++) {
        const passageElement = extractElementById(html, `passage-text-${part}`);
        const questionElement = extractElementById(html, `questions-${part}`);

        if (!passageElement && !questionElement) continue;

        passages.push({
            number: part,
            passageHtml: passageElement ? passageElement.innerHTML : "",
            questionsHtml: questionElement ? questionElement.innerHTML : ""
        });
    }

    return passages;
}

function splitModernReadingPassages(html) {
    const $ = cheerio.load(html);
    const passages = [];

    const layout = $(".modern-layout").first();
    if (layout.length) {
        const passageEl = layout.find(".modern-passage").first();
        const questionBlocks = layout.find(".question-block").toArray();

        if (passageEl.length) {
            passages.push({
                number: 1,
                passageHtml: $.html(passageEl),
                questionsHtml: questionBlocks.map((el) => $.html($(el))).join("")
            });
            return passages;
        }
    }

    $(".modern-passage").each((index, el) => {
        const $passage = $(el);
        const $block = $passage.nextAll(".question-block").first();
        passages.push({
            number: index + 1,
            passageHtml: $.html($passage),
            questionsHtml: $block.length ? $.html($block) : ""
        });
    });

    if (passages.length) return passages;

    const passagePattern = /<span[^>]*class=["'][^"']*passage-label[^"']*["'][^>]*>[\s\S]*?(?=<span[^>]*class=["'][^"']*passage-label|$)/gi;
    const blocks = html.match(passagePattern);
    if (blocks && blocks.length) {
        blocks.forEach((block, index) => {
            passages.push({
                number: index + 1,
                passageHtml: block,
                questionsHtml: ""
            });
        });
    }

    return passages;
}

function splitListeningSections(html) {
    const sections = [];
    const $ = cheerio.load(html);

    for (let part = 1; part <= 4; part++) {
        const byId = extractElementById(html, `listening-section-${part}`)
            || extractElementById(html, `section-${part}`)
            || extractElementById(html, `questions-section-${part}`)
            || extractElementById(html, `part-${part}`);

        if (byId) {
            sections.push({ number: part, sectionHtml: byId.innerHTML });
        } else {
            const el = $(`.listening-section-${part}, .section-${part}, .questions-section-${part}, .part-${part}, #part-${part}, #section-${part}`).first();
            if (el.length) {
                sections.push({ number: part, sectionHtml: $.html(el) });
            }
        }
    }

    if (sections.length) return sections;

    // Try finding by question-part/section class name
    const partElements = $(".question-part, .listening-part, .test-part, .section, div.section").toArray();
    if (partElements.length >= 4) {
        partElements.slice(0, 4).forEach((el, index) => {
            sections.push({
                number: index + 1,
                sectionHtml: $.html($(el))
            });
        });
        return sections;
    }

    const listeningPage = $(".listening-page").first();
    if (listeningPage.length) {
        sections.push({ number: 1, sectionHtml: listeningPage.html() || "" });
        return sections;
    }

    const sectionHeaders = [...html.matchAll(/<h1[^>]*>\s*questions?\s+(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/gi)];
    if (sectionHeaders.length) {
        sectionHeaders.forEach((header, index) => {
            const start = header.index;
            const end = sectionHeaders[index + 1] ? sectionHeaders[index + 1].index : html.length;
            const range = parseQuestionRange(header[0]);
            sections.push({
                number: index + 1,
                sectionHtml: html.slice(start, end),
                questionRange: range ? [range.start, range.end] : []
            });
        });
        return sections;
    }

    if (!sections.length) {
        sections.push({ number: 1, sectionHtml: html });
    }

    return sections.slice(0, 4);
}

module.exports = {
    splitCambridgePassages,
    splitModernReadingPassages,
    splitListeningSections
};
