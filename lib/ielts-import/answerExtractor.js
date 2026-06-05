const { vm } = require("./utils");

function parseCorrectAnswersObject(html) {
    const match = html.match(/const\s+correctAnswers\s*=\s*(\{[\s\S]*?\n\s*\});/);
    if (!match) return {};

    try {
        return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
    } catch (error) {
        return {};
    }
}

function parseAnswerKeySection(html) {
    const answers = {};
    const keyBlock = html.match(/(?:answer\s*key|answers?)\s*[:<][\s\S]{0,8000}/i);
    const source = keyBlock ? keyBlock[0] : html;

    [...source.matchAll(/(?:^|\n|\s)(\d{1,2})\s*[\).:\-=\|]\s*([^\n<]+)/g)].forEach((match) => {
        answers[match[1]] = match[2].trim();
    });

    [...source.matchAll(/["']?(\d{1,2})["']?\s*:\s*["']([^"']+)["']/g)].forEach((match) => {
        answers[match[1]] = match[2].trim();
    });

    return answers;
}

function normalizeAnswerValue(value) {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.map(String).join(" | ");
    return String(value).trim();
}

function mergeAnswers(html) {
    const fromScript = parseCorrectAnswersObject(html);
    const fromText = parseAnswerKeySection(html);
    const merged = { ...fromText };

    Object.entries(fromScript).forEach(([key, value]) => {
        merged[key] = normalizeAnswerValue(value);
    });

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
    normalizeAnswerValue
};
