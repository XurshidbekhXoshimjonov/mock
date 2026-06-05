const params = new URLSearchParams(window.location.search);
const testId = params.get("id");

const testTitle = document.getElementById("testTitle");
const testPartLabel = document.getElementById("testPartLabel");
const passageContent = document.getElementById("passageContent");
const questionsContent = document.getElementById("questionsContent");
const submitAnswers = document.getElementById("submitAnswers");
const scoreText = document.getElementById("scoreText");
const testsLink = document.getElementById("testsLink");
const resultModal = document.getElementById("resultModal");
const modalScoreText = document.getElementById("modalScoreText");
const closeModal = document.getElementById("closeModal");
const timer = document.getElementById("timer");

let activeTest = null;
let time = 20 * 60;

setInterval(() => {
    const minutes = Math.floor(time / 60);
    const seconds = String(time % 60).padStart(2, "0");
    timer.textContent = `⏱ ${minutes}:${seconds}`;

    if (time > 0) {
        time--;
    }
}, 1000);

function partLabel(part) {
    return part === "full" ? "Full Test" : `Part ${part}`;
}

function partPage(part) {
    return part === "full" ? "fulltest.html" : `part${part}.html`;
}

submitAnswers.addEventListener("click", () => {
    if (!activeTest) {
        return;
    }

    const { correct, total } = window.IeltsRenderer.scoreQuestions(activeTest.questions);
    const resultText = `Your score is ${correct}/${total}`;

    window.authClient?.recordTestResult({
        type: "Reading",
        title: activeTest.title || `Reading Part ${activeTest.part}`,
        correct,
        total
    });

    scoreText.textContent = resultText;
    modalScoreText.textContent = resultText;
    resultModal.style.display = "flex";
});

closeModal.addEventListener("click", () => {
    const destination = activeTest ? partPage(activeTest.part) : "part1.html";
    window.location.href = destination;
});

async function loadTest() {
    if (!testId) {
        throw new Error("Missing test id");
    }

    const response = await fetch(`/api/reading-tests/${encodeURIComponent(testId)}`);
    const test = await response.json();

    if (!response.ok) {
        throw new Error(test.error || "Could not load test");
    }

    activeTest = test;
    testTitle.textContent = test.title;
    testPartLabel.textContent = partLabel(test.part);
    testsLink.href = partPage(test.part);

    const layout = window.IeltsRenderer.renderReadingTest(test);
    const parser = new DOMParser();
    const doc = parser.parseFromString(layout, "text/html");
    passageContent.innerHTML = doc.querySelector(".ielts-passage-panel")?.innerHTML || "";
    questionsContent.innerHTML = doc.querySelector(".ielts-questions-panel")?.innerHTML || "";
}

loadTest().catch((error) => {
    testTitle.textContent = "Could not load test";
    passageContent.textContent = error.message;
    questionsContent.textContent = "";
});
