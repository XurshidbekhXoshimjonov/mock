const path = require("path");

function flattenReadingQuestions(passages) {
    const questions = [];

    (passages || []).forEach((passage) => {
        (passage.questionGroups || []).forEach((group) => {
            (group.questions || []).forEach((question) => {
                questions.push({
                    number: question.number,
                    type: question.type,
                    question: question.question,
                    options: question.options || [],
                    answer: question.answer
                });
            });
        });
    });

    return questions.sort((a, b) => a.number - b.number);
}

function flattenListeningData(listening) {
    const questions = [];
    const sections = [];

    (listening.sections || []).forEach((section) => {
        (section.questionGroups || []).forEach((group) => {
            const numbers = (group.questions || []).map((q) => q.number);
            sections.push({
                title: group.instructionTitle || section.title,
                instruction: group.instructionText || "",
                rule: group.rule || "",
                questionNumbers: numbers
            });
            (group.questions || []).forEach((question) => {
                questions.push({
                    number: question.number,
                    type: question.type,
                    question: question.question,
                    options: question.options || [],
                    answer: question.answer
                });
            });
        });
    });

    return {
        sections,
        questions: questions.sort((a, b) => a.number - b.number)
    };
}

function buildPublishedTests(fullTest, makeId) {
    const baseId = fullTest.id;
    const readingTests = (fullTest.reading.passages || []).map((passage) => ({
        id: `${baseId}-reading-p${passage.number}`,
        title: `${fullTest.title} — Reading Passage ${passage.number}`,
        part: passage.number,
        passage: passage.passageText,
        passageHtml: passage.passageHtml,
        paragraphs: passage.paragraphs,
        passageLabel: passage.passageLabel,
        questionGroups: passage.questionGroups,
        questions: flattenReadingQuestions([passage]),
        sourceFullTestId: baseId,
        createdAt: fullTest.createdAt
    }));

    const listeningFlat = flattenListeningData(fullTest.listening);

    const listeningBySection = (fullTest.listening.sections || []).map((section) => {
        const questions = [];
        (section.questionGroups || []).forEach((group) => {
            (group.questions || []).forEach((q) => questions.push(q));
        });

        return {
            id: `${baseId}-listening-s${section.number}`,
            title: `${fullTest.title} — Listening Section ${section.number}`,
            part: section.number,
            audio: fullTest.listening.audio || "",
            transcript: fullTest.listening.transcript || "",
            sections: section.questionGroups.map((group) => ({
                title: group.instructionTitle,
                instruction: group.instructionText,
                rule: group.rule,
                questionNumbers: (group.questions || []).map((q) => q.number)
            })),
            questions: questions.sort((a, b) => a.number - b.number),
            images: (fullTest.images || []).filter((img) => img.section === "listening" && img.sectionNumber === section.number),
            sourceFullTestId: baseId,
            createdAt: fullTest.createdAt
        };
    });

    const readingFull = {
        id: `${baseId}-reading-full`,
        title: fullTest.title,
        subtitle: "Reading full test",
        part: "full",
        passage: (fullTest.reading.passages || []).map((p) => p.passageText).join("\n\n---\n\n"),
        questionGroups: (fullTest.reading.passages || []).flatMap((p) => p.questionGroups),
        questions: flattenReadingQuestions(fullTest.reading.passages),
        sourceFullTestId: baseId,
        createdAt: fullTest.createdAt
    };

    const listeningFull = {
        id: `${baseId}-listening-full`,
        title: fullTest.title,
        subtitle: "Listening full test",
        part: "full",
        audio: fullTest.listening.audio || "",
        transcript: fullTest.listening.transcript || "",
        sections: listeningFlat.sections,
        questions: listeningFlat.questions,
        images: (fullTest.images || []).filter((img) => img.section === "listening"),
        sourceFullTestId: baseId,
        createdAt: fullTest.createdAt
    };

    return {
        readingTests: [...readingTests, readingFull],
        listeningTests: [...listeningBySection, listeningFull]
    };
}

module.exports = {
    flattenReadingQuestions,
    flattenListeningData,
    buildPublishedTests
};
