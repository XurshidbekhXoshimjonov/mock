const path = require("path");
const fs = require("fs");
const { loadHtml, extractTitle, extractMetadataFromFileName } = require("./htmlParser");
const { detectLayout, extractSkillBlocks } = require("./layoutAnalyzer");
const { mergeAnswers } = require("./answerExtractor");
const { parseReadingHtml } = require("./readingParser");
const { parseListeningHtml } = require("./listeningParser");
const { extractAndSaveImages, linkImagesToGroups, replaceImagesInHtml } = require("./imageExtractor");
const { slugify, ensureDir } = require("./utils");

function collectAllQuestions(fullTest) {
    const questions = [];

    (fullTest.reading.passages || []).forEach((passage) => {
        (passage.questionGroups || []).forEach((group) => {
            (group.questions || []).forEach((q) => questions.push(q));
        });
    });

    (fullTest.listening.sections || []).forEach((section) => {
        (section.questionGroups || []).forEach((group) => {
            (group.questions || []).forEach((q) => questions.push(q));
        });
    });

    return questions;
}

function buildAnswersMap(questions) {
    const answers = {};
    questions.forEach((q) => {
        if (q.answer) answers[String(q.number)] = q.answer;
    });
    return answers;
}

function attachImagesToTest(fullTest, images) {
    const imageList = images || [];

    fullTest.reading.passages.forEach((passage) => {
        passage.questionGroups.forEach((group, groupIndex) => {
            group.imageIds = linkImagesToGroups(imageList, group.layoutHtml || "", groupIndex);
            group.layoutHtml = replaceImagesInHtml(group.layoutHtml || "", imageList);
        });
    });

    fullTest.listening.sections.forEach((section) => {
        section.questionGroups.forEach((group, groupIndex) => {
            group.imageIds = linkImagesToGroups(imageList, group.layoutHtml || "", groupIndex);
            group.layoutHtml = replaceImagesInHtml(group.layoutHtml || "", imageList);
            group.imageIds.forEach((imageId) => {
                const image = imageList.find((item) => item.id === imageId);
                if (image) {
                    image.section = "listening";
                    image.sectionNumber = section.number;
                }
            });
        });
    });

    fullTest.images = imageList.map((image) => ({
        id: image.id,
        src: image.src,
        alt: image.alt,
        section: image.section || "reading",
        sectionNumber: image.sectionNumber || null,
        questionGroupIndex: image.questionGroupIndex || null
    }));
}

function parseFullTestHtml(htmlInput, options = {}) {
    const html = loadHtml(htmlInput);
    const layout = detectLayout(html);
    const { readingHtml, listeningHtml } = extractSkillBlocks(html);
    const answers = mergeAnswers(html);
    const fileName = options.fileName || "import.html";
    const testId = options.testId || `${Date.now()}-${slugify(extractTitle(html))}`;
    const imageDir = options.imageDir || path.join(options.uploadsRoot || "uploads", "ielts-import", testId);
    const publicBase = `/uploads/ielts-import/${testId}`;

    ensureDir(imageDir);

    const readingPassages = layout.hasReading
        ? parseReadingHtml(readingHtml || html, answers)
        : [];

    const listening = layout.hasListening
        ? parseListeningHtml(listeningHtml || html, answers)
        : { audio: "", sections: [] };

    if (!listening.sections.length && layout.hasListening) {
        listening.sections = parseListeningHtml(html, answers).sections;
    }

    const allImages = [
        ...extractAndSaveImages(readingHtml || html, { destDir: imageDir, publicBase }),
        ...extractAndSaveImages(listeningHtml || "", { destDir: imageDir, publicBase })
    ].map((image, index) => ({
        ...image,
        src: image.src.startsWith("/") ? image.src : `${publicBase}/${path.basename(image.src || image.fileName || `image-${index + 1}.png`)}`
    }));

    const meta = extractMetadataFromFileName(fileName);
    const title = options.title || meta.label || extractTitle(html);

    const fullTest = {
        id: testId,
        title,
        sourceFile: fileName,
        status: "draft",
        layout: layout.format,
        metadata: meta,
        reading: { passages: readingPassages },
        listening: {
            audio: listening.audio,
            transcript: options.transcript || "",
            sections: listening.sections
        },
        answers: {},
        images: [],
        parseReport: {
            hasReading: layout.hasReading,
            hasListening: layout.hasListening,
            passageCount: readingPassages.length,
            listeningSectionCount: listening.sections.length,
            imageCount: allImages.length,
            answerKeyCount: Object.keys(answers).length
        },
        createdAt: new Date().toISOString(),
        publishedAt: null
    };

    attachImagesToTest(fullTest, allImages);
    fullTest.answers = buildAnswersMap(collectAllQuestions(fullTest));

    if (options.htmlPath && fs.existsSync(options.htmlPath)) {
        const baseDir = path.dirname(options.htmlPath);
        allImages.forEach((image) => {
            if (image.originalSrc && !image.originalSrc.startsWith("data:") && !image.originalSrc.startsWith("http")) {
                const localPath = path.resolve(baseDir, image.originalSrc);
                if (fs.existsSync(localPath)) {
                    const dest = path.join(imageDir, path.basename(localPath));
                    fs.copyFileSync(localPath, dest);
                    image.src = `${publicBase}/${path.basename(localPath)}`;
                }
            }
        });
        attachImagesToTest(fullTest, allImages);
    }

    return fullTest;
}

module.exports = {
    parseFullTestHtml,
    collectAllQuestions,
    buildAnswersMap,
    attachImagesToTest
};
