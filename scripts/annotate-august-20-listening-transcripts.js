const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "data", "full-tests", "listening-august-20-20260820.json");
const sectionPaths = [1, 2, 3, 4].map((part) => path.join(
    root,
    "data",
    "listening-tests",
    `listening-august-20-20260820-listening-s${part}.json`
));

const highlights = {
    1: [
        [1, "weight"], [2, "back"], [3, "beginners"], [4, "mat"], [5, "jumps"],
        [6, "competition"], [7, "snack"], [8, "work", "recommend she come before work"], [9, "heart"], [10, "reception"]
    ],
    2: [
        [11, "corn was once cultivated in the area"],
        [12, "plants and fish have trouble surviving there"],
        [13, "several families lived together"],
        [14, "All members of the families helped to build a house and contributed to the daily work, including children"],
        [15, "make a traditional sweet food"],
        [16, "pick produce"],
        [17, "live animal show"],
        [18, "take a walk at night"],
        [19, "carvings of endangered species"],
        [20, "follow winter trails"]
    ],
    3: [
        [21, "flower"], [22, "hive"], [23, "honey", "It uses the honey to cover its own smell"], [24, "blood"], [25, "virus"],
        [26, "spread weeds to new areas"], [27, "not much is known about it yet"],
        [28, "aggressive"], [29, "very sensitive to temperature"], [30, "very limited numbers"]
    ],
    4: [
        [31, "army"], [32, "safety"], [33, "learning"], [34, "reasons"], [35, "trust"],
        [36, "writing"], [37, "open"], [38, "leaders"], [39, "training"], [40, "time", "keep a constant eye on the time"]
    ]
};

function phraseIndex(text, phrase, anchor = "") {
    const lower = text.toLocaleLowerCase("en");
    const needle = phrase.toLocaleLowerCase("en");
    const anchorStart = anchor ? lower.indexOf(anchor.toLocaleLowerCase("en")) : 0;
    if (anchor && anchorStart < 0) return -1;
    const limit = anchor ? anchorStart + anchor.length : text.length;
    let index = lower.indexOf(needle, anchorStart);
    while (index >= 0 && index < limit) {
        const before = text[index - 1] || "";
        const after = text[index + phrase.length] || "";
        if (!/[A-Za-z0-9]/.test(before) && !/[A-Za-z0-9]/.test(after)) return index;
        index = lower.indexOf(needle, index + 1);
    }
    return -1;
}

function annotate(text, entries) {
    let result = String(text || "").replace(/\[\[Q\d{1,2}\|([\s\S]*?)\]\]/g, "$1");
    entries.forEach(([number, phrase, anchor]) => {
        const index = phraseIndex(result, phrase, anchor);
        if (index < 0) throw new Error(`Could not find Q${number} phrase: ${phrase}`);
        const original = result.slice(index, index + phrase.length);
        result = `${result.slice(0, index)}[[Q${number}|${original}]]${result.slice(index + phrase.length)}`;
    });
    return result;
}

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
source.listening.sections.forEach((section, index) => {
    section.transcriptText = annotate(section.transcriptText, highlights[index + 1]);
});
fs.writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`);

sectionPaths.forEach((filePath, index) => {
    const part = index + 1;
    const test = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const transcript = annotate(test.transcript || test.parts?.[0]?.transcriptText, highlights[part]);
    test.transcript = transcript;
    if (test.parts?.[0]) test.parts[0].transcriptText = transcript;
    fs.writeFileSync(filePath, `${JSON.stringify(test, null, 2)}\n`);
});

console.log("Annotated August 20 Listening Part 1–4 transcripts (Q1–Q40).");
