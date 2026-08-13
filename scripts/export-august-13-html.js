"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "full-tests", "jasurbek-full-listening-test-10.json"), "utf8"));
const output = path.join(ROOT, "August 13 Listening.html");

const audio = [
    "https://uploads.strikinglycdn.com/files/50ac366b-c9f1-4713-8cc0-c61e0abf2a73/pharmacy.mp3?t=1740311156&amp;id=4244540",
    "https://audio.jukehost.co.uk/019e9813-bf7d-70e3-a99b-295d58b8430f",
    "https://audio.jukehost.co.uk/019fdcf7-f339-72a5-88eb-cc3645ce5ad1",
    "https://uploads.strikinglycdn.com/files/29a444c4-1d79-480e-8a79-a80626da3c7a/h4.mp3?t=1752892796&amp;id=4299866"
];
const answers = source.answers;

function input(number) {
    return `<input class="answer" id="q${number}" data-question="${number}" autocomplete="off" placeholder="${number}" aria-label="Answer ${number}">`;
}

function radioQuestion(number, prompt, options) {
    return `<div class="question" id="question-${number}">
        <p><b>${number}.</b> ${prompt}</p>
        <div class="choices">${options.map(([letter, text]) => `<label><input type="radio" name="q${number}" value="${letter}"> <b>${letter}.</b> ${text}</label>`).join("")}</div>
    </div>`;
}

function selectQuestion(number, prompt, letters) {
    return `<div class="match-row" id="question-${number}"><b>${number}.</b><span>${prompt}</span><select id="q${number}" data-question="${number}"><option value="">—</option>${letters.map((letter) => `<option>${letter}</option>`).join("")}</select></div>`;
}

const part1 = `
<section class="part" id="part-1">
  <header><h2>Part 1</h2><p>Questions 1–10</p><audio controls preload="metadata" src="${audio[0]}"></audio></header>
  <div class="instructions"><b>Questions 1–10</b><br>Complete the form below.<br>Write <b>ONE WORD ONLY</b> for each answer.</div>
  <div class="notes-card">
    <h3>Greenfield Pharmacy - New Employee Details</h3>
    <ul><li>Name of manager: John Field</li><li>John’s phone number: ${input(1)}</li></ul>
    <h4>Working hours</h4>
    <ul><li>Shift starts at ${input(2)} a.m.</li><li>Late night opening is on ${input(3)}</li><li>Start date: ${input(4)}</li></ul>
    <h4>Things to do</h4>
    <ul><li>Speak to Barbara about the ${input(5)}</li><li>John will email more information about ${input(6)}</li></ul>
    <h4>Services</h4>
    <ul><li>When using the ${input(7)} machine, customers should be aware of the weight limit.</li><li>If there are any health concerns, speak to the ${input(8)} on duty.</li><li>Be careful when lifting heavy boxes to avoid hurting your ${input(9)}.</li><li>The new pharmacy bags are now available in ${input(10)}.</li></ul>
  </div>
</section>`;

const part2 = `
<section class="part" id="part-2">
  <header><h2>Part 2</h2><p>Questions 11–20</p><audio controls preload="metadata" src="${audio[1]}"></audio></header>
  <h3>An Electronic Toy Company</h3>
  <div class="instructions"><b>Questions 11–15</b><br>Choose the correct answer, <b>A, B</b> or <b>C</b>.</div>
  ${radioQuestion(11, "What point is made about the history of the company?", [["A", "It was quickly established."], ["B", "It took a long time to establish."], ["C", "It was set up by a relative."]])}
  ${radioQuestion(12, "Why should the company recruit more temporary staff?", [["A", "It plans to develop new products."], ["B", "The old staff are having an illness."], ["C", "It aims to meet the new demands of customers."]])}
  ${radioQuestion(13, "How long will the employees work in the company?", [["A", "a few weeks"], ["B", "half a year"], ["C", "indefinitely"]])}
  ${radioQuestion(14, "The largest number of positions are in the department of", [["A", "administration."], ["B", "production."], ["C", "package delivery."]])}
  ${radioQuestion(15, "What’s the current problem with the company?", [["A", "outdated machines"], ["B", "inadequate skills"], ["C", "late payment"]])}
  <div class="instructions"><b>Questions 16–20</b><br>What is the responsibility of each temporary staff member?<br>Choose <b>FIVE</b> answers from the box and write the correct letter, <b>A–F</b>.</div>
  <div class="option-box"><h4>Responsibilities</h4><p><b>A.</b> computer</p><p><b>B.</b> wage</p><p><b>C.</b> production</p><p><b>D.</b> maintenance</p><p><b>E.</b> research and development</p><p><b>F.</b> maintaining customer relationship</p></div>
  <div class="matching">${["1st person", "2nd person", "3rd person", "4th person", "5th person"].map((text, index) => selectQuestion(index + 16, text, ["A", "B", "C", "D", "E", "F"])).join("")}</div>
</section>`;

const part3 = `
<section class="part" id="part-3">
  <header><h2>Part 3</h2><p>Questions 21–30</p><audio controls preload="metadata" src="${audio[2]}"></audio></header>
  <div class="instructions"><b>Questions 21–23</b><br>Choose the correct answer, <b>A, B</b> or <b>C</b>.</div>
  ${radioQuestion(21, "Aya chose interviewing as her main research method because", [["A", "it was easier to use than other methods."], ["B", "it enabled her to explore points of interest in detail."], ["C", "it was different from methods used by other research groups."]])}
  ${radioQuestion(22, "On what basis did Aya choose her research participants?", [["A", "They were available in large numbers."], ["B", "They had asked to be involved in the project."], ["C", "They all had very similar attitudes to maths."]])}
  ${radioQuestion(23, "What surprised Aya most about her findings?", [["A", "that so few people had thought about their maths ability before"], ["B", "that there were such distinct differences between the genders"], ["C", "that people had such strong feelings about the subject"]])}
  <div class="instructions"><b>Questions 24–30</b><br>Complete the tables below.<br>Write <b>ONE WORD ONLY</b> for each answer.</div>
  <h3>Why do people have a negative attitude to maths?</h3><p>Research method: interview</p>
  <div class="table-scroll"><table><thead><tr><th></th><th>Females</th><th>Males</th></tr></thead><tbody>
    <tr><th>First-level importance</th><td>Poor ${input(24)}</td><td>Fear of ${input(25)}</td></tr>
    <tr><th>Second-level importance</th><td>No obvious ${input(26)}</td><td>Belief that you need a ${input(27)} for maths</td></tr>
    <tr><th>Third-level importance</th><td colspan="2">Low awareness of alternative strategies to solve maths problems</td></tr>
  </tbody></table></div>
  <h3 class="second-title">How do people solve maths questions?</h3><p>Research method: ${input(28)} of people’s strategies</p>
  <div class="table-scroll"><table><thead><tr><th></th><th>successful</th><th>unsuccessful</th></tr></thead><tbody>
    <tr><th>Most common strategy</th><td>Understanding the question as a ${input(29)}</td><td>Applying a solution learned previously</td></tr>
    <tr><th>Second most common strategy</th><td>Using visualisation</td><td>Giving up after first ${input(30)} of the problem</td></tr>
  </tbody></table></div>
</section>`;

const part4 = `
<section class="part" id="part-4">
  <header><h2>Part 4</h2><p>Questions 31–40</p><audio controls preload="metadata" src="${audio[3]}"></audio></header>
  <div class="instructions"><b>Questions 31–40</b><br>Complete the notes below.<br>Write <b>ONE WORD ONLY</b> for each answer.</div>
  <div class="notes-card large-notes"><h3>Research in the area around the Chembe Bird Sanctuary</h3>
    <h4>The importance of birds of prey to the local communities</h4><ul>
      <li>They destroy ${input(31)} and other rodents.</li><li>They help to prevent farmers from being bitten by ${input(32)}.</li><li>They have been an important part of the local culture for many years.</li><li>They now support the economy by encouraging ${input(33)} in the area.</li>
    </ul>
    <h4>Falling numbers of birds of prey</h4><ul>
      <li>The birds may be accidentally killed:<ul><li>by ${input(34)} when they are hunting or sleeping</li><li>by electrocution from contact with power lines, especially at times when there is a lot of ${input(35)}.</li></ul></li><li>Local farmers may illegally shoot them or ${input(36)} them.</li>
    </ul>
    <h4>Ways of protecting chickens from birds of prey</h4><ul>
      <li>clearly separate vegetation from the areas in which:<ul><li>${input(37)} are kept</li><li>chickens (separately)</li></ul></li><li>frightening birds of prey by:<ul><li>keeping a ${input(38)}</li><li>making a ${input(39)} (e.g. with metal objects)</li></ul></li><li>a ${input(40)} method is usually most effective</li>
    </ul>
  </div>
</section>`;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>August 13 Listening</title>
<style>
:root{--blue:#155eef;--ink:#182230;--muted:#667085;--line:#d0d5dd;--bg:#f5f7fb;--good:#067647;--bad:#b42318}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 Arial,sans-serif}.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 5vw;background:#fff;border-bottom:1px solid var(--line)}.top h1{margin:0;font-size:24px}.nav{display:flex;flex-wrap:wrap;gap:8px}.nav a,.check{border:0;border-radius:8px;background:var(--blue);color:#fff;padding:10px 15px;text-decoration:none;font-weight:700;cursor:pointer}.page{width:min(1100px,94vw);margin:26px auto}.part{margin:0 0 32px;padding:28px;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 4px 14px #1018280d}.part header{display:grid;grid-template-columns:1fr auto;gap:4px 20px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:18px}.part header h2,.part header p{margin:0}.part header audio{grid-column:2;grid-row:1/3;width:min(420px,45vw)}.instructions{margin:22px 0;padding:14px 16px;border-left:4px solid var(--blue);background:#f4f7ff}.notes-card{padding:22px 28px;border:1px solid #344054;border-radius:6px}.notes-card h3{text-align:center;font-size:22px}.notes-card h4{margin:24px 0 8px;font-size:19px}.notes-card li{margin:11px 0}.answer,select{width:175px;height:38px;margin:2px 5px;border:1px solid #98a2b3;border-radius:5px;padding:5px 9px;font-size:16px;text-align:center}.answer::placeholder{font-weight:700}.question{padding:10px 0 18px;border-bottom:1px solid #eaecf0}.choices{display:grid;gap:8px;padding-left:26px}.choices label{cursor:pointer}.option-box{margin:18px 0;padding:16px 20px;border:1px solid var(--line);background:#fafafa}.option-box p{margin:5px 0}.match-row{display:grid;grid-template-columns:44px 1fr 130px;align-items:center;padding:9px 12px;border-bottom:1px solid var(--line)}.match-row select{width:110px}.table-scroll{overflow-x:auto}table{width:100%;min-width:760px;border-collapse:collapse;margin:12px 0 28px}th,td{border:1px solid #475467;padding:14px;vertical-align:middle}thead th{background:#f2f4f7;text-align:center}.second-title{margin-top:30px}.large-notes{font-size:18px}.large-notes li{line-height:1.8}.result{display:none;margin:20px 0;padding:18px;border-radius:8px;background:#ecfdf3;color:var(--good);font-weight:700}.correct{border:2px solid var(--good)!important;background:#ecfdf3}.incorrect{border:2px solid var(--bad)!important;background:#fef3f2}@media(max-width:720px){body{font-size:16px}.top{align-items:flex-start;flex-direction:column}.part{padding:18px}.part header{display:block}.part header audio{width:100%;margin-top:12px}.notes-card{padding:16px}.answer{width:min(170px,48vw)}.match-row{grid-template-columns:35px 1fr 90px}.match-row select{width:80px}.top h1{font-size:21px}}
</style></head><body>
<div class="top"><h1>August 13 — Full Listening</h1><nav class="nav"><a href="#part-1">Part 1</a><a href="#part-2">Part 2</a><a href="#part-3">Part 3</a><a href="#part-4">Part 4</a><button class="check" onclick="checkAnswers()">Check Answers</button></nav></div>
<main class="page">${part1}${part2}${part3}${part4}<div class="result" id="result"></div></main>
<script>
const ANSWERS=${JSON.stringify(answers)};
function normalize(value){return String(value||'').trim().toLowerCase().replace(/[.,]/g,'').replace(/\\s+/g,' ')}
function accepted(value){return String(value||'').split('|').map(normalize)}
function checkAnswers(){let score=0;for(let number=1;number<=40;number++){let field=document.getElementById('q'+number);let value='';let marks=[];if(number>=11&&number<=15||number>=21&&number<=23){marks=[...document.querySelectorAll('input[name="q'+number+'"]')];field=marks.find(item=>item.checked);value=field?field.value:''}else{value=field?field.value:''}const ok=accepted(ANSWERS[number]).includes(normalize(value));if(ok)score++;(marks.length?marks:[field]).filter(Boolean).forEach(item=>{item.classList.remove('correct','incorrect');item.classList.add(ok?'correct':'incorrect')})}const result=document.getElementById('result');result.style.display='block';result.textContent='Score: '+score+' / 40';result.scrollIntoView({behavior:'smooth',block:'center'})}
</script></body></html>`;

fs.writeFileSync(output, html, "utf8");
console.log(output);
