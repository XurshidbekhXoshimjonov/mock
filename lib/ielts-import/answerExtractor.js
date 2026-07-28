const { vm } = require("./utils");

function parseCorrectAnswersObject(html) {
    const match = html.match(/const\s+(?:correctAnswers|answerKey|CORRECT)\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (!match) return {};

    try {
        return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
    } catch (error) {
        return {};
    }
}

function parsePairedAnswersObject(html) {
    const match = html.match(/const\s+pairKeys\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (!match) return {};

    try {
        const pairs = vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
        const answers = {};

        Object.entries(pairs || {}).forEach(([start, values]) => {
            const first = Number(start);
            if (!Number.isFinite(first) || !Array.isArray(values)) return;
            values.forEach((value, index) => {
                answers[String(first + index)] = normalizeAnswerValue(value);
            });
        });

        return answers;
    } catch (error) {
        return {};
    }
}

function parseAnswerKeySection(html) {
    const answers = {};
    const keyBlock = html.match(/(?:answer\s*key|answers?)\s*[:<][\s\S]{0,8000}/i);
    const source = keyBlock ? keyBlock[0] : html;

    [...source.matchAll(/(?:^|\n|\s)(\d{1,2})\s*[\).:\-=\|]\s*([^\n<]+)/g)].forEach((match) => {
        const key = normalizeAnswerKey(match[1]);
        if (key) answers[key] = match[2].trim();
    });

    [...source.matchAll(/["']?(\d{1,2})["']?\s*:\s*["']([^"']+)["']/g)].forEach((match) => {
        const key = normalizeAnswerKey(match[1]);
        if (key) answers[key] = match[2].trim();
    });

    return answers;
}

function normalizeAnswerKey(value) {
    const match = String(value || "").match(/(?:^|q)(\d{1,2})$/i);
    if (!match) return "";

    const number = Number(match[1]);
    return number >= 1 && number <= 40 ? String(number) : "";
}

function normalizeAnswerValue(value) {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.map(String).join(" | ");
    return String(value).trim();
}

function mergeAnswers(html) {
    const fromScript = parseCorrectAnswersObject(html);
    const fromText = parseAnswerKeySection(html);
    const fromPairs = parsePairedAnswersObject(html);
    const merged = { ...fromText, ...fromPairs };

    Object.entries(fromScript).forEach(([key, value]) => {
        const parts = key.split(/[-_]/);
        if (parts.length > 1) {
            parts.forEach(part => {
                const normalizedKey = normalizeAnswerKey(part);
                if (normalizedKey) merged[normalizedKey] = normalizeAnswerValue(value);
            });
        } else {
            const normalizedKey = normalizeAnswerKey(key);
            if (normalizedKey) merged[normalizedKey] = normalizeAnswerValue(value);
        }
    });

    // Copy multi-select answers to the paired question in the group if missing
    if (merged["17"] && merged["17"].includes("|") && !merged["18"]) {
        merged["18"] = merged["17"];
    }
    if (merged["19"] && merged["19"].includes("|") && !merged["20"]) {
        merged["20"] = merged["19"];
    }

    return merged;
}

function attachAnswersToQuestions(questions, answers) {
    return questions.map((question) => ({
        ...question,
        answer: question.answer || normalizeAnswerValue(answers[String(question.number)])
    }));
}

module.exports = {
    parseCorrectAnswersObject,
    parseAnswerKeySection,
    mergeAnswers,
    attachAnswersToQuestions,
    normalizeAnswerValue,
    normalizeAnswerKey
};
