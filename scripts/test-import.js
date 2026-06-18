const fs = require("fs");
const path = require("path");
const { parseFullTestHtml } = require("../lib/ielts-import");

const samples = [
    "cambridge-sample.html",
    "../test1.html"
];

async function run() {
    for (const sample of samples) {
        const filePath = path.resolve(__dirname, "../data/samples", sample);
        const altPath = path.resolve(__dirname, "..", sample.replace("../", ""));
        const target = fs.existsSync(filePath) ? filePath : altPath;
        if (!fs.existsSync(target)) {
            console.warn("Skip missing:", sample);
            continue;
        }
        const html = fs.readFileSync(target, "utf8");
        const test = parseFullTestHtml(html, {
            fileName: path.basename(target),
            testId: `test-${path.basename(target, ".html")}`,
            uploadsRoot: path.join(__dirname, "../uploads")
        });
        const p = test.reading.passages[0];
        const g = p?.questionGroups?.[0];
        console.info("\n===", path.basename(target), "===");
        console.info({
            paragraphs: p?.paragraphs?.length,
            firstParaHtml: p?.paragraphs?.[0]?.html?.slice(0, 80),
            groups: p?.questionGroups?.length,
            instructionHtml: g?.instructionHtml,
            questions: g?.questions?.length,
            firstStemHtml: g?.questions?.[0]?.stemHtml?.slice(0, 80),
            options: g?.questions?.[0]?.options
        });
    }
}

run().catch(console.error);
