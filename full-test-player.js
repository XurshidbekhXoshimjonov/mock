const params = new URLSearchParams(window.location.search);
const testId = params.get("id");

let fullTest = null;
let activeSkill = "reading";
let activePassage = 0;
let activeSection = 0;
let timerSeconds = 60 * 60;

const els = {
    title: document.getElementById("testTitle"),
    timer: document.getElementById("timer"),
    passagePanel: document.getElementById("passagePanel"),
    questionsPanel: document.getElementById("questionsPanel"),
    audioBar: document.getElementById("audioBar"),
    testAudio: document.getElementById("testAudio"),
    testBody: document.getElementById("testBody"),
    resultBar: document.getElementById("resultBar"),
    submitBtn: document.getElementById("submitBtn")
};

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function normalizeAnswer(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function acceptedAnswers(answer) {
    return String(answer || "").split("|").map(normalizeAnswer).filter(Boolean);
}

function isCorrect(userAnswer, answer) {
    const normalized = normalizeAnswer(userAnswer);
    if (!normalized) return false;
    return acceptedAnswers(answer).includes(normalized);
}

function renderPassage(passage) {
    const paragraphs = String(passage.passageText || "")
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);

    els.passagePanel.innerHTML = `
        <span class="ielts-passage-label">PASSAGE ${passage.number}</span>
        <h2>${escapeHtml(passage.title || `Passage ${passage.number}`)}</h2>
        ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
    `;
}

function imagesForGroup(group) {
    return (group.imageIds || [])
        .map((id) => fullTest.images.find((img) => img.id === id))
        .filter(Boolean);
}

function renderRadioOptions(question) {
    const name = `q${question.number}`;
    return `<div class="ielts-option-list">
        ${(question.options || []).map((option) => {
            const value = String(option).match(/^([A-Za-z]+)/)?.[1] || option;
            return `<label><input type="radio" name="${name}" value="${escapeHtml(value)}"><span>${escapeHtml(option)}</span></label>`;
        }).join("")}
    </div>`;
}

function renderQuestionInput(question) {
    const type = question.type || "";

    if (["true_false_not_given", "yes_no_not_given", "multiple_choice"].includes(type)) {
        return renderRadioOptions(question);
    }

    if (type === "matching_headings" || type === "matching") {
        return `<select class="ielts-completion-input" id="q${question.number}">
            <option value="">—</option>
            ${(question.options || []).map((opt) => {
                const value = String(opt).match(/^([A-Za-z0-9]+)/)?.[1] || opt;
                return `<option value="${escapeHtml(value)}">${escapeHtml(opt)}</option>`;
            }).join("")}
        </select>`;
    }

    const blank = question.question && question.question.includes("____")
        ? escapeHtml(question.question).replace("____", `<input class="ielts-completion-input" id="q${question.number}" type="text" autocomplete="off">`)
        : "";

    if (blank.includes("ielts-completion-input")) {
        return `<p class="ielts-question-line">${blank}</p>`;
    }

    return `<input class="ielts-completion-input" id="q${question.number}" type="text" autocomplete="off">`;
}

function groupStartNumber(group) {
    const numbers = (group.questionNumbers || [])
        .map(Number)
        .filter(Number.isFinite);

    if (numbers.length) {
        return Math.min(...numbers);
    }

    const questionList = group.questions || [];
    if (questionList.length) {
        return Math.min(...questionList.map((q) => q.number).filter(Number.isFinite));
    }

    const title = group.instructionTitle || group.title || "";
    const rangeMatch = title.match(/(?:questions?|boxes?)\s*(\d{1,2})\s*[-–]/i);
    if (rangeMatch) {
        return Number(rangeMatch[1]);
    }

    const singleMatch = title.match(/(?:questions?|boxes?)\s*(\d{1,2})\b/i);
    if (singleMatch) {
        return Number(singleMatch[1]);
    }

    const fallback = title.match(/\b(\d{1,2})\b/);
    return fallback ? Number(fallback[1]) : Number.MAX_SAFE_INTEGER;
}

function sortQuestionGroups(groups) {
    return [...(groups || [])].sort((a, b) => groupStartNumber(a) - groupStartNumber(b));
}

function renderQuestionGroup(group) {
    const images = imagesForGroup(group);
    const imageHtml = images.length
        ? `<div class="ielts-group-images">${images.map((img) => `<img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt || "")}">`).join("")}</div>`
        : "";

    const layoutHtml = group.layoutHtml && !images.length
        ? `<div class="ielts-layout-html">${group.layoutHtml}</div>`
        : "";

    const questionsHtml = (group.questions || []).map((question) => `
        <article class="ielts-question" data-number="${question.number}">
            <div class="ielts-question-line">
                <span class="ielts-q-num">${question.number}.</span>
                <span>${escapeHtml(question.question || "")}</span>
            </div>
            ${renderQuestionInput(question)}
        </article>
    `).join("");

    return `
        <section class="ielts-group">
            ${imageHtml}
            <h3>${escapeHtml(group.instructionTitle || "")}</h3>
            ${group.instructionText ? `<p class="ielts-instruction">${escapeHtml(group.instructionText)}</p>` : ""}
            ${group.rule ? `<p class="ielts-rule">${escapeHtml(group.rule)}</p>` : ""}
            ${layoutHtml}
            ${questionsHtml}
        </section>
    `;
}

function renderReading() {
    const passages = fullTest.reading.passages || [];
    const passage = passages[activePassage] || passages[0];

    if (!passage) {
        els.passagePanel.innerHTML = "<p>No reading content.</p>";
        els.questionsPanel.innerHTML = "";
        return;
    }

    renderPassage(passage);
    els.questionsPanel.innerHTML = sortQuestionGroups(passage.questionGroups || [])
        .map(renderQuestionGroup)
        .join("");

    if (passages.length > 1) {
        const nav = document.createElement("div");
        nav.style.marginTop = "16px";
        nav.innerHTML = passages.map((p, index) =>
            `<button type="button" data-passage="${index}" style="margin-right:8px;padding:6px 10px;${index === activePassage ? "font-weight:700" : ""}">Passage ${p.number}</button>`
        ).join("");
        nav.querySelectorAll("button").forEach((btn) => {
            btn.addEventListener("click", () => {
                activePassage = Number(btn.dataset.passage);
                renderReading();
            });
        });
        els.passagePanel.appendChild(nav);
    }
}

function renderListening() {
    const sections = fullTest.listening.sections || [];
    const section = sections[activeSection] || sections[0];

    els.passagePanel.innerHTML = section
        ? `<span class="ielts-passage-label">LISTENING</span><h2>Section ${section.number}</h2><p class="ielts-instruction">Listen and answer the questions.</p>`
        : "<p>No listening content.</p>";

    els.questionsPanel.innerHTML = section
        ? sortQuestionGroups(section.questionGroups || []).map(renderQuestionGroup).join("")
        : "";

    if (sections.length > 1) {
        const nav = document.createElement("div");
        nav.style.marginTop = "16px";
        nav.innerHTML = sections.map((s, index) =>
            `<button type="button" data-section="${index}" style="margin-right:8px;padding:6px 10px;${index === activeSection ? "font-weight:700" : ""}">Section ${s.number}</button>`
        ).join("");
        nav.querySelectorAll("button").forEach((btn) => {
            btn.addEventListener("click", () => {
                activeSection = Number(btn.dataset.section);
                renderListening();
            });
        });
        els.passagePanel.appendChild(nav);
    }
}

function switchSkill(skill) {
    activeSkill = skill;
    document.querySelectorAll(".ielts-skill-tabs button").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.skill === skill);
    });

    const isListening = skill === "listening";
    els.testBody.classList.toggle("listening-mode", isListening);
    els.audioBar.classList.toggle("hidden", !isListening || !fullTest.listening.audio);

    if (isListening) {
        renderListening();
    } else {
        renderReading();
    }
}

function collectAnswers() {
    const answers = {};
    document.querySelectorAll("[id^='q']").forEach((el) => {
        const number = el.id.replace(/^q/, "");
        if (el.type === "radio") {
            const selected = document.querySelector(`input[name='q${number}']:checked`);
            if (selected) answers[number] = selected.value;
        } else {
            answers[number] = el.value;
        }
    });
    return answers;
}

function getUserAnswer(number) {
    const radio = document.querySelector(`input[name='q${number}']:checked`);
    if (radio) return radio.value;
    const input = document.getElementById(`q${number}`);
    return input ? input.value : "";
}

function scoreLocally() {
    const questions = [];
    (fullTest.reading.passages || []).forEach((p) => {
        (p.questionGroups || []).forEach((g) => questions.push(...(g.questions || [])));
    });
    (fullTest.listening.sections || []).forEach((s) => {
        (s.questionGroups || []).forEach((g) => questions.push(...(g.questions || [])));
    });

    let correct = 0;
    questions.forEach((q) => {
        if (isCorrect(getUserAnswer(q.number), q.answer)) correct++;
    });

    const total = questions.length;
    const band = activeSkill === "listening"
        ? listeningBand(correct)
        : readingBand(correct);

    els.resultBar.classList.remove("hidden");
    els.resultBar.textContent = `Score: ${correct} / ${total} — Estimated band: ${band}`;
}

function readingBand(correct) {
    const table = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [0, 0]];
    return table.find(([min]) => correct >= min)?.[1] || 0;
}

function listeningBand(correct) {
    const table = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [0, 0]];
    return table.find(([min]) => correct >= min)?.[1] || 0;
}

async function loadTest() {
    const response = await fetch(`/api/full-tests/${encodeURIComponent(testId)}`);
    if (!response.ok) {
        els.title.textContent = "Test not found";
        return;
    }

    fullTest = await response.json();
    els.title.textContent = fullTest.title;

    if (fullTest.listening.audio) {
        els.testAudio.src = fullTest.listening.audio;
    }

    switchSkill("reading");
}

document.querySelectorAll(".ielts-skill-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => switchSkill(btn.dataset.skill));
});

els.submitBtn.addEventListener("click", scoreLocally);

setInterval(() => {
    if (timerSeconds <= 0) return;
    timerSeconds--;
    const m = Math.floor(timerSeconds / 60);
    const s = String(timerSeconds % 60).padStart(2, "0");
    els.timer.textContent = `${m}:${s}`;
}, 1000);

if (testId) {
    loadTest().then(() => {
        const skill = params.get("skill");
        if (skill === "listening" || skill === "reading") {
            switchSkill(skill);
        }
    });
} else {
    els.title.textContent = "Missing test id";
}
