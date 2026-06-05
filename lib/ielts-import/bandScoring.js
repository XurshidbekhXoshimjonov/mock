const READING_BAND_TABLE = [
    { min: 39, band: 9 },
    { min: 37, band: 8.5 },
    { min: 35, band: 8 },
    { min: 33, band: 7.5 },
    { min: 30, band: 7 },
    { min: 27, band: 6.5 },
    { min: 23, band: 6 },
    { min: 19, band: 5.5 },
    { min: 15, band: 5 },
    { min: 13, band: 4.5 },
    { min: 10, band: 4 },
    { min: 8, band: 3.5 },
    { min: 6, band: 3 },
    { min: 4, band: 2.5 },
    { min: 0, band: 0 }
];

const LISTENING_BAND_TABLE = [
    { min: 39, band: 9 },
    { min: 37, band: 8.5 },
    { min: 35, band: 8 },
    { min: 32, band: 7.5 },
    { min: 30, band: 7 },
    { min: 26, band: 6.5 },
    { min: 23, band: 6 },
    { min: 18, band: 5.5 },
    { min: 16, band: 5 },
    { min: 13, band: 4.5 },
    { min: 10, band: 4 },
    { min: 8, band: 3.5 },
    { min: 6, band: 3 },
    { min: 4, band: 2.5 },
    { min: 0, band: 0 }
];

function bandFromTable(correct, table) {
    const row = table.find((item) => correct >= item.min);
    return row ? row.band : 0;
}

function calculateReadingBand(correct, total = 40) {
    return bandFromTable(correct, READING_BAND_TABLE);
}

function calculateListeningBand(correct, total = 40) {
    return bandFromTable(correct, LISTENING_BAND_TABLE);
}

function normalizeAnswer(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function acceptedAnswers(answer) {
    return String(answer || "")
        .split("|")
        .map(normalizeAnswer)
        .filter(Boolean);
}

function isAnswerCorrect(userAnswer, correctAnswer) {
    const normalized = normalizeAnswer(userAnswer);
    if (!normalized) return false;
    return acceptedAnswers(correctAnswer).includes(normalized);
}

function scoreSkill(questions, userAnswers) {
    let correct = 0;
    const results = questions.map((question) => {
        const userAnswer = userAnswers[String(question.number)] || "";
        const ok = isAnswerCorrect(userAnswer, question.answer);
        if (ok) correct++;
        return {
            number: question.number,
            correct: ok,
            userAnswer,
            answer: question.answer
        };
    });

    return { correct, total: questions.length, results };
}

module.exports = {
    calculateReadingBand,
    calculateListeningBand,
    isAnswerCorrect,
    scoreSkill,
    acceptedAnswers
};
