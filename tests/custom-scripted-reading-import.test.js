"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseScriptedReadingHtml } = require("../lib/ielts-import/scriptedReadingParser");
const { parseFullTestHtml } = require("../lib/ielts-import");

test("imports lowercase scripted full Reading HTML", () => {
    const html = `
        <title>07-08 — IELTS Full Reading Test</title>
        <script>
        const passages = [{ id: 1, title: "Passage One", paras: [["A", "First paragraph."]], start: 1, end: 2 }, { id: 2, title: "Passage Two", paras: [["A", "Second paragraph."]], start: 3, end: 3 }, { id: 3, title: "Passage Three", paras: [["A", "Third paragraph."]], start: 4, end: 4 }];
        const answerKey = { "1": ["TRUE"], "2": ["two words", "alternative"], "3": ["ii"], "4": ["summary answer"] };
        const state = { answers: {} };
        const esc = s => String(s);
        function sel(q, options) { return \`<select data-q="\${q}">\${options.map(o => \`<option value="\${o}">\${o}</option>\`).join("")}</select>\`; }
        function inp(q) { return \`<input data-q="\${q}">\`; }
        function renderP1() { return \`<div class="section"><h3>Questions 1–1</h3><div class="instr">TRUE, FALSE, NOT GIVEN</div><div class="qrow"><span class="qnum">1</span><span class="qtext">A statement</span>\${sel(1, ["TRUE", "FALSE", "NOT GIVEN"])}</div></div><div class="section"><h3>Question 2</h3><div class="instr">Complete the notes.<br>Choose <b>ONE WORD</b> from the passage.</div><div class="summary"><div class="note-title">Notes</div><div class="note-title">• Heritage</div>◦ Answer: 2 \${inp(2)}</div></div>\`; }
        function renderP2() { return \`<div class="section"><h3>Question 3 — Matching Headings</h3><div class="instr">Reading Passage 2 has one paragraph, A.<br>Choose the correct heading for the paragraph from the list below.<br>Write the correct number, <b>i–ii</b>.</div><div class="listbox"><div><b>i.</b> First heading</div><div><b>ii.</b> Second heading</div></div><div class="qrow"><span class="qnum">3</span><span class="qtext">Paragraph A</span>\${sel(3, ["i", "ii"])}</div></div>\`; }
        function renderP3() { return \`<div class="section"><h3>Question 4 — Summary Completion</h3><div class="instr">Complete the summary below.<br>Choose <b>NO MORE THAN TWO WORDS</b> from the passage.</div><div class="summary"><div class="note-title">Summary Title</div>Answer: 4 \${inp(4)}</div></div>\`; }
        function renderQuestions() {}
        </script>
    `;

    const passages = parseScriptedReadingHtml(html);
    const questions = passages.flatMap((passage) => passage.questionGroups.flatMap((group) => group.questions));

    assert.equal(passages.length, 3);
    assert.equal(passages[0].title, "Passage One");
    assert.equal(questions.length, 4);
    assert.equal(questions[0].question, "A statement");
    assert.equal(questions[0].answer, "TRUE");
    assert.deepEqual(questions[0].options.map((option) => option.value), ["TRUE", "FALSE", "NOT GIVEN"]);
    assert.equal(questions[1].answer, "two words|alternative");
    assert.equal(passages[0].questionGroups[1].instructionText, "Complete the notes.");
    assert.equal(passages[0].questionGroups[1].rule, "Choose ONE WORD from the passage.");
    assert.match(passages[0].questionGroups[1].instructionHtml.bodyHtml, /Complete the notes\./);
    assert.match(passages[0].questionGroups[1].instructionHtml.rulesHtml, /Choose <b>ONE WORD<\/b>/);
    assert.doesNotMatch(passages[0].questionGroups[1].contentHtml, /class="instr"/);
    assert.equal(passages[0].questionGroups[1].contentTitle, "Notes");
    assert.match(passages[0].questionGroups[1].contentHtml, /class="note-title"/);
    assert.match(passages[0].questionGroups[1].contentHtml, /<strong>Heritage:<\/strong>/);
    assert.match(passages[0].questionGroups[1].contentHtml, /<strong>•<\/strong>/);
    assert.doesNotMatch(passages[0].questionGroups[1].contentHtml, /◦/);
    assert.doesNotMatch(passages[0].questionGroups[1].contentHtml, /•\s*Heritage/);
    assert.doesNotMatch(passages[0].questionGroups[1].contentHtml, /ielts-import-notes/);
    assert.doesNotMatch(passages[0].questionGroups[1].contentHtml, /Answer:\s*2\s*<span/);
    assert.equal(passages[1].questionGroups[0].instructionTitle, "Question 3");
    assert.equal(passages[1].questionGroups[0].optionsTitle, "List of Headings");
    assert.deepEqual(
        passages[1].questionGroups[0].options.map((option) => [option.value, option.label]),
        [["i", "i. First heading"], ["ii", "ii. Second heading"]]
    );
    assert.equal(passages[1].questionGroups[0].questions[0].question, "Paragraph A");
    assert.equal(passages[1].questionGroups[0].rule, "Write the correct number, i–ii.");
    assert.equal(passages[2].questionGroups[0].instructionTitle, "Question 4");
    assert.equal(passages[2].questionGroups[0].instructionText, "Complete the summary below.");
    assert.equal(passages[2].questionGroups[0].rule, "Choose NO MORE THAN TWO WORDS from the passage.");
    assert.equal(passages[2].questionGroups[0].contentTitle, "Summary Title");
    assert.doesNotMatch(passages[2].questionGroups[0].contentHtml, /class="instr"|Summary Title/);
    assert.doesNotMatch(passages[2].questionGroups[0].contentHtml, /Answer:\s*4\s*<span/);

    const fullTest = parseFullTestHtml(html, {
        fileName: "07-08.html",
        testId: "custom-scripted-reading-test",
        uploadsRoot: "uploads"
    });
    assert.equal(fullTest.layout, "scripted-reading");
    assert.equal(fullTest.reading.passages.length, 3);
    assert.equal(fullTest.parseReport.answerKeyCount, 4);
});
