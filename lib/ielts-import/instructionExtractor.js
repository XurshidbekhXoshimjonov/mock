const { stripTags, parseQuestionRange, rangeTitle } = require("./utils");

const RULE_PATTERNS = [
    /write\s+no\s+more\s+than[\s\S]{0,120}/i,
    /choose\s+(?:the\s+)?(?:correct\s+)?(?:letter|letters)[\s\S]{0,80}/i,
    /choose\s+two\s+letters/i,
    /in\s+boxes?\s+on\s+your\s+answer\s+sheet/i,
    /true\s+if\s+the\s+statement\s+agrees/i,
    /yes\s+if\s+the\s+statement\s+agrees/i
];

function extractInstructionsFromBlock(blockHtml) {
    const text = stripTags(blockHtml);
    const range = parseQuestionRange(text);
    const titleMatch = text.match(/questions?\s+\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}|questions?\s+\d{1,2}|question\s+\d{1,2}/i);
    const instructionTitle = titleMatch ? titleMatch[0] : (range ? rangeTitle(range.start, range.end) : "");

    let instructionText = "";
    let rule = "";

    const promptMatch = blockHtml.match(/class=["'][^"']*question-prompt[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p)>/i)
        || blockHtml.match(/class=["'][^"']*question-info[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)
        || blockHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);

    if (promptMatch) {
        instructionText = stripTags(promptMatch[1]);
    }

    const instructionMatch = blockHtml.match(/class=["'][^"']*instruction[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/gi);
    if (instructionMatch) {
        const parts = instructionMatch.map((item) => stripTags(item)).filter(Boolean);
        if (!instructionText && parts[0]) instructionText = parts[0];
        if (parts.length > 1) rule = parts.slice(1).join(" ");
    }

    const rulesBlock = blockHtml.match(/class=["'][^"']*rules[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (rulesBlock) {
        rule = stripTags(rulesBlock[1]);
    }

    for (const pattern of RULE_PATTERNS) {
        const match = text.match(pattern);
        if (match && !rule.includes(match[0])) {
            rule = rule ? `${rule} ${match[0]}` : match[0];
        }
    }

    if (!instructionText) {
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        instructionText = lines.find((line) => /complete|choose|do the following|write|match|label/i.test(line)) || lines[1] || "";
    }

    return {
        instructionTitle,
        instructionText: instructionText.trim(),
        rule: rule.trim(),
        questionRange: range ? [range.start, range.end] : []
    };
}

module.exports = {
    extractInstructionsFromBlock,
    RULE_PATTERNS
};
