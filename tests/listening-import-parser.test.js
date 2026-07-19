const test = require("node:test");
const assert = require("node:assert/strict");
const { parseStandaloneListeningHtml } = require("../lib/ielts-import/scriptedListeningParser");

test("standalone Listening imports preserve adjacent MCQ and select-matching ranges", () => {
    const radios = [11, 12, 13, 14].map((number) => `
        <div class="mcqq" id="q${number}">
            <div class="qt"><span class="qnum">${number}.</span> Prompt ${number}</div>
            <label><input type="radio" name="q${number}" value="A"> A. First</label>
            <label><input type="radio" name="q${number}" value="B"> B. Second</label>
        </div>
    `).join("");
    const matching = [15, 16, 17, 18, 19, 20].map((number) => `
        <div class="match-row">
            <span class="qnum">${number}</span> Item ${number}
            <select data-q="${number}">
                <option value=""></option>
                <option value="A">A — Alpha</option>
                <option value="B">B — Beta</option>
            </select>
        </div>
    `).join("");
    const html = `
        <div class="part-section" id="part2">
            <div class="stitle">Questions 11–14</div>
            <p class="instr">Choose the correct letter.</p>
            ${radios}
            <div class="stitle">Questions 15–20</div>
            <p class="instr">Choose answers from the box.</p>
            ${matching}
        </div>
    `;

    const [section] = parseStandaloneListeningHtml(html, {});
    const questions = section.questionGroups.flatMap((group) => group.questions);

    assert.deepEqual(questions.map((question) => question.number), [
        11, 12, 13, 14, 15, 16, 17, 18, 19, 20
    ]);
    assert.deepEqual(
        section.questionGroups.map((group) => group.type),
        ["multiple_choice", "matching"]
    );
    assert.equal(questions.find((question) => question.number === 15).options.length, 2);
    assert.match(questions.find((question) => question.number === 15).question, /Item 15/);
});

test("standalone Listening imports recognize inp-number completion fields", () => {
    const fields = Array.from({ length: 10 }, (_, index) => {
        const number = index + 1;
        return `<p>${number} Detail ${number}: <span class="qn">${number}</span><input id="inp${number}" type="text" placeholder="word"></p>`;
    }).join("");
    const html = `
        <div class="part-section" id="part1">
            <div class="stitle">Questions 1–10</div>
            <p class="instr">Complete the notes below.</p>
            <div class="notes">${fields}</div>
        </div>
    `;

    const [section] = parseStandaloneListeningHtml(html, {});
    const [group] = section.questionGroups;

    assert.equal(group.type, "note_completion");
    assert.deepEqual(group.questions.map((question) => question.number), [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    ]);
    assert.match(group.content.join("\n"), /\{\{10\}\}/);
    assert.doesNotMatch(group.content.join("\n"), /<span class="qn">|^1 Detail/m);
});
