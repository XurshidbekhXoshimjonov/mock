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

function mapQuestionGroupsToBlocks(groups, sectionNumber) {
    return (groups || []).map((group) => {
        const groupQs = (group.questions || []).map((q) => q.number);
        const rangeStr = groupQs.length ? `Questions ${groupQs[0]}-${groupQs[groupQs.length - 1]}` : "";
        
        const baseBlock = {
            id: group.id || `group-${sectionNumber}-${groupQs[0] || Date.now()}`,
            type: group.type,
            questionRange: group.instructionTitle || rangeStr,
            title: group.title || "",
            optionsTitle: group.optionsTitle || "",
            example: group.example || "",
            instruction: group.instructionText || "",
            options: group.options || [],
            rows: group.rows || [],
            columns: group.columns || [],
            labels: group.labels || [],
            imageUrl: group.imageUrl || "",
            content: group.content || [],
            noteStyle: group.noteStyle || "",
            questions: (group.questions || []).map((q) => {
                return {
                    number: q.number,
                    questionNumber: q.number,
                    question: q.question || "",
                    text: q.question || "",
                    options: q.options || [],
                    type: q.type || group.type,
                    answer: q.answer
                };
            })
        };

        // If it's a multiple select type, format it specifically for MultipleSelectBlock
        if (group.type === "multi_select" || group.type === "multiple_select") {
            const firstQ = group.questions[0];
            const otherQs = group.questions.slice(1);
            
            let maxSelections = group.questions.length;
            const matchSelections = String(group.instructionText || "").match(/choose\s+(\w+|[1-9])\b/i);
            if (matchSelections) {
                const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
                const word = matchSelections[1].toLowerCase();
                maxSelections = wordMap[word] || parseInt(word, 10) || maxSelections;
            }

            const rawOptions = firstQ?.options || group.options || [];
            const formattedOptions = rawOptions.map((opt, optIdx) => ({
                letter: opt.letter || opt.value || String.fromCharCode(65 + optIdx),
                text: opt.text || opt.html || opt.label || ""
            }));

            let mainQuestion = group.question || group.title || group.instructionText || "";
            if (!group.question && !group.title) {
                mainQuestion = mainQuestion.replace(/Choose\s+\w+\s+correct\s+answers\.\s+\d+-\d+\s*/i, "").trim();
            }

            return {
                ...baseBlock,
                type: "multiple_select",
                questionNumber: firstQ?.number,
                answerQuestions: otherQs.map((q) => ({ questionNumber: q.number })),
                maxSelections: maxSelections,
                question: mainQuestion,
                options: formattedOptions
            };
        }

        // If it's multiple choice, format options for each question
        if (group.type === "multiple_choice" || group.type === "mcq") {
            return {
                ...baseBlock,
                type: "multiple_choice",
                questions: (group.questions || []).map((q) => {
                    const rawOpts = q.options || group.options || [];
                    const formattedOpts = rawOpts.map((opt, optIdx) => ({
                        letter: opt.letter || opt.value || String.fromCharCode(65 + optIdx),
                        text: opt.text || opt.html || opt.label || ""
                    }));
                    return {
                        number: q.number,
                        questionNumber: q.number,
                        question: q.question || "",
                        text: q.question || "",
                        options: formattedOpts,
                        type: "multiple_choice",
                        answer: q.answer
                    };
                })
            };
        }

        // If it's matching, format options
        if (group.type === "matching") {
            const rawOptions = group.options || (group.questions && group.questions[0]?.options) || [];
            const formattedOptions = rawOptions.map((opt, optIdx) => ({
                letter: opt.letter || opt.value || String.fromCharCode(65 + optIdx),
                text: opt.text || opt.html || opt.label || ""
            }));

            return {
                ...baseBlock,
                type: "matching",
                options: formattedOptions,
                questions: (group.questions || []).map((q) => ({
                    number: q.number,
                    questionNumber: q.number,
                    question: q.question || "",
                    text: q.question || "",
                    answer: q.answer
                }))
            };
        }

        return baseBlock;
    });
}

function buildPublishedTests(fullTest, makeId) {
    const baseId = fullTest.id;
    const readingTests = (fullTest.reading.passages || []).map((passage) => ({
        id: `${baseId}-reading-p${passage.number}`,
        slug: `${baseId}-reading-p${passage.number}`,
        title: passage.title || passage.passageTitle || `${fullTest.title} — Reading Passage ${passage.number}`,
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
        const sortedQs = questions.sort((a, b) => a.number - b.number);
        const partRange = sortedQs.length ? `Questions ${sortedQs[0].number}-${sortedQs[sortedQs.length - 1].number}` : "";

        return {
            id: `${baseId}-listening-s${section.number}`,
            slug: `${baseId}-listening-s${section.number}`,
            title: `${fullTest.title} — Listening Section ${section.number}`,
            part: section.number,
            audio: section.audio || fullTest.listening.audio || "",
            transcript: fullTest.listening.transcript || "",
            sections: section.questionGroups.map((group) => ({
                title: group.instructionTitle,
                instruction: group.instructionText,
                rule: group.rule,
                questionNumbers: (group.questions || []).map((q) => q.number)
            })),
            questions: sortedQs,
            images: (fullTest.images || []).filter((img) => img.section === "listening" && img.sectionNumber === section.number),
            sourceFullTestId: baseId,
            createdAt: fullTest.createdAt,
            parts: [{
                partNumber: Number(section.number),
                title: section.title || `Part ${section.number}`,
                questionRange: partRange,
                audioUrl: section.audio || fullTest.listening.audio || "",
                instruction: section.instruction || "",
                answerText: sortedQs.map((q) => `${q.number}: ${Array.isArray(q.answer) ? q.answer.join(" | ") : q.answer || ""}`).join("\n"),
                blocks: mapQuestionGroupsToBlocks(section.questionGroups, section.number)
            }]
        };
    });

    const readingFull = {
        id: `${baseId}-reading-full`,
        slug: `${baseId}-reading-full`,
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
        slug: `${baseId}-listening-full`,
        title: fullTest.title,
        subtitle: "Listening full test",
        part: "full",
        audio: fullTest.listening.audio || "",
        transcript: fullTest.listening.transcript || "",
        sections: listeningFlat.sections,
        questions: listeningFlat.questions,
        images: (fullTest.images || []).filter((img) => img.section === "listening"),
        sourceFullTestId: baseId,
        openUrl: `/full-test-player?id=${baseId}&skill=listening`,
        createdAt: fullTest.createdAt,
        parts: (fullTest.listening.sections || []).map((section) => {
            const sectionQs = [];
            (section.questionGroups || []).forEach((group) => {
                (group.questions || []).forEach((q) => sectionQs.push(q));
            });
            const sortedSectionQs = sectionQs.sort((a, b) => a.number - b.number);
            const sectionRange = sortedSectionQs.length ? `Questions ${sortedSectionQs[0].number}-${sortedSectionQs[sortedSectionQs.length - 1].number}` : "";

            return {
                partNumber: Number(section.number),
                title: section.title || `Part ${section.number}`,
                questionRange: sectionRange,
                audioUrl: section.audio || fullTest.listening.audio || "",
                instruction: section.instruction || "",
                answerText: sortedSectionQs.map((q) => `${q.number}: ${Array.isArray(q.answer) ? q.answer.join(" | ") : q.answer || ""}`).join("\n"),
                blocks: mapQuestionGroupsToBlocks(section.questionGroups, section.number)
            };
        })
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
