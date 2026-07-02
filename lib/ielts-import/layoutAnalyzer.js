function detectLayout(html) {
    const hasCambridgeIds = /id=["']passage-text-1["']/i.test(html) && /id=["']questions-1["']/i.test(html);
    const hasModernReading = /class=["'][^"']*modern-layout/i.test(html) || /class=["'][^"']*modern-passage/i.test(html);
    const hasScriptedReading = /const\s+PASSAGES\s*=/i.test(html) && /const\s+QUESTIONS\s*=/i.test(html);
    const hasQuestionBlocks = /class=["'][^"']*question-block/i.test(html);
    const hasPaneReading = /class=["'][^"']*passage-section/i.test(html)
        && /class=["'][^"']*questions-section/i.test(html);
    const hasListeningPage = /class=["'][^"']*listening-page/i.test(html) || /class=["'][^"']*listening-answer/i.test(html);
    const hasListeningSections = /listening\s+section\s+[1-4]/i.test(html)
        || /id=["'](?:listening-section|questions-section)-[1-4]["']/i.test(html)
        || /<h2[^>]*>\s*part\s*[1-4][\s\S]{0,80}questions?\s+\d/i.test(html);
    const hasAudio = /<audio\b/i.test(html);
    const hasCorrectAnswers = /correctAnswers\s*=/i.test(html);
    const hasSplitPane = /passage-panel|questions-panel|reading-container/i.test(html);
    const hasListeningTaskChrome = /form-box|map-box|flow-?chart/i.test(html);

    const readingScore = [
        hasCambridgeIds ? 3 : 0,
        hasModernReading ? 2 : 0,
        hasScriptedReading ? 3 : 0,
        hasPaneReading ? 3 : 0,
        hasQuestionBlocks ? 2 : 0,
        hasSplitPane ? 1 : 0,
        /reading\s+passage/i.test(html) ? 1 : 0
    ].reduce((a, b) => a + b, 0);

    const listeningScore = [
        hasListeningPage ? 3 : 0,
        hasListeningSections ? 2 : 0,
        hasAudio ? 1 : 0,
        hasListeningTaskChrome ? 2 : 0
    ].reduce((a, b) => a + b, 0);

    const hasReading = readingScore >= 2 || /id=["']passage-text-/i.test(html);
    const hasListening = hasListeningPage
        || hasListeningSections
        || hasAudio
        || (!hasReading && listeningScore >= 2)
        || /<section[^>]*class=["'][^"']*audio-bar/i.test(html)
        || hasAudio;

    let format = "generic";
    if (hasCambridgeIds) format = "cambridge";
    else if (hasScriptedReading) format = "scripted-reading";
    else if (hasPaneReading) format = "pane-reading";
    else if (hasModernReading || hasQuestionBlocks) format = "modern";
    if (hasListeningSections && !hasReading) format = "scripted-listening";
    if (hasListeningPage) format = `${format}-listening`;

    return {
        format,
        hasReading,
        hasListening,
        hasCorrectAnswers,
        readingScore,
        listeningScore
    };
}

function extractSkillBlocks(html) {
    const readingMarkers = [
        { pattern: /<!--\s*READING\s*START\s*-->/i, key: "reading" },
        { pattern: /<div[^>]*id=["']reading-test["']/i, key: "reading" },
        { pattern: /id=["']passage-text-1["']/i, key: "reading" },
        { pattern: /class=["'][^"']*modern-layout/i, key: "reading" },
        { pattern: /class=["'][^"']*passage-section/i, key: "reading" },
        { pattern: /academic\s+reading/i, key: "reading" }
    ];
    const listeningMarkers = [
        { pattern: /<!--\s*LISTENING\s*START\s*-->/i, key: "listening" },
        { pattern: /<section[^>]*class=["'][^"']*audio-bar/i, key: "listening" },
        { pattern: /class=["'][^"']*listening-page/i, key: "listening" },
        { pattern: /ielts\s+listening/i, key: "listening" }
    ];

    let readingHtml = html;
    let listeningHtml = "";

    for (const marker of listeningMarkers) {
        const match = marker.pattern.exec(html);
        if (match) {
            readingHtml = html.slice(0, match.index);
            listeningHtml = html.slice(match.index);
            break;
        }
    }

    if (!listeningHtml && /passage-text-1/i.test(html)) {
        const listenSplit = html.search(/listening\s+test|listening\s+section\s+1/i);
        if (listenSplit > 500) {
            readingHtml = html.slice(0, listenSplit);
            listeningHtml = html.slice(listenSplit);
        }
    }

    if (!listeningHtml) {
        const audioIndex = html.search(/<audio\b/i);
        if (audioIndex > 0 && audioIndex < html.length * 0.7) {
            const before = html.slice(0, audioIndex);
            if (/passage|reading/i.test(before)) {
                readingHtml = before;
                listeningHtml = html.slice(audioIndex);
            }
        }
    }

    return { readingHtml, listeningHtml };
}

module.exports = {
    detectLayout,
    extractSkillBlocks
};
