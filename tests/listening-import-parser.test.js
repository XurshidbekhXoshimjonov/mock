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
            <span class="ml">${number}</span><span class="mt">Item ${number}</span>
            <select data-q="${number}">
                <option value=""></option>
                <option value="A">A</option>
                <option value="B">B</option>
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
            <div class="match-box">
                <div class="match-box-title">Main theme</div>
                <div class="match-opts">
                    <div>A Alpha</div>
                    <div>B Beta</div>
                </div>
            </div>
            <div class="match-rows">${matching}</div>
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
    const matchingGroup = section.questionGroups[1];
    const question15 = questions.find((question) => question.number === 15);
    assert.equal(question15.options.length, 2);
    assert.equal(question15.options[0].html, "Alpha");
    assert.equal(question15.question, "Item 15");
    assert.equal(matchingGroup.optionsTitle, "Main theme");
    assert.equal(matchingGroup.instructionText, "Choose answers from the box.");
    assert.equal(matchingGroup.options[1].html, "Beta");
});

test("standalone Listening imports recognize inp-number completion fields", () => {
    const fields = Array.from({ length: 10 }, (_, index) => {
        const number = index + 1;
        return `<div class="nc-line">${number} Detail ${number}: <span class="qn">${number}</span><input id="inp${number}" type="text" placeholder="word"></div>`;
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

test("standalone Listening imports preserve note-card bullets and indentation", () => {
    const remainingFields = Array.from({ length: 7 }, (_, index) => {
        const number = index + 34;
        return `<div class="nc-sub">- Detail <span class="qn">${number}</span><input id="inp${number}"></div>`;
    }).join("");
    const html = `
        <div class="part-section" id="part4">
            <div class="stitle">Questions 31–40</div>
            <p class="instr">Complete the notes below.</p>
            <div class="card">
                <div class="card-title">Food Safety Standards</div>
                <div class="nc-line"><strong>Risk assessment</strong></div>
                <div class="nc-sub">- the product's <span class="qn">31</span><input id="inp31"></div>
                <div class="nc-sub">Consumer attitudes<br>- growth of the <span class="qn">32</span><input id="inp32"> market</div>
                <div class="nc-sub" style="padding-left:34px;">- concern for <span class="qn">33</span><input id="inp33"></div>
                ${remainingFields}
            </div>
        </div>
    `;

    const [section] = parseStandaloneListeningHtml(html, {});
    const [group] = section.questionGroups;

    assert.equal(group.type, "note_completion");
    assert.equal(group.title, "Food Safety Standards");
    assert.deepEqual(group.content.slice(0, 5), [
        "<strong>Risk assessment</strong>",
        "- the product's {{31}}",
        "Consumer attitudes",
        "- growth of the {{32}} market",
        "  - concern for {{33}}"
    ]);
    assert.doesNotMatch(group.questions[0].question, /\b31\b/);
});
