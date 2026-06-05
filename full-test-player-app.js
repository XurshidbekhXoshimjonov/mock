/* global React, ReactDOM, IeltsTestComponents */
const { createPortal } = ReactDOM;
const { PassageRenderer, QuestionsPanel } = IeltsTestComponents;

const TestContext = React.createContext(null);

function TestProvider({ children }) {
    const params = new URLSearchParams(window.location.search);
    const testId = params.get("id");

    const [test, setTest] = React.useState(null);
    const [skill, setSkill] = React.useState(params.get("skill") === "listening" ? "listening" : "reading");
    const [passageIndex, setPassageIndex] = React.useState(0);
    const [sectionIndex, setSectionIndex] = React.useState(0);
    const [timerSeconds, setTimerSeconds] = React.useState(60 * 60);

    React.useEffect(() => {
        if (!testId) return;
        fetch(`/api/full-tests/${encodeURIComponent(testId)}`)
            .then((r) => r.json())
            .then((data) => {
                setTest(data);
                window.__ieltsTest = data;
                document.getElementById("testTitle").textContent = data.title || "IELTS Test";
                if (data.listening?.audio) {
                    document.getElementById("testAudio").src = data.listening.audio;
                    document.getElementById("audioBar").classList.remove("hidden");
                }
            });
    }, [testId]);

    React.useEffect(() => {
        const id = setInterval(() => setTimerSeconds((t) => Math.max(0, t - 1)), 1000);
        return () => clearInterval(id);
    }, []);

    React.useEffect(() => {
        const m = Math.floor(timerSeconds / 60);
        const s = String(timerSeconds % 60).padStart(2, "0");
        const el = document.getElementById("timer");
        if (el) el.textContent = `${m}:${s}`;
    }, [timerSeconds]);

    React.useEffect(() => {
        document.getElementById("testBody").classList.toggle("listening-mode", skill === "listening");
        document.querySelectorAll(".ielts-skill-tabs button").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.skill === skill);
            btn.onclick = () => setSkill(btn.dataset.skill);
        });
    }, [skill]);

    React.useEffect(() => {
        document.getElementById("submitBtn").onclick = () => {
            if (!test) return;
            const questions = [];
            (test.reading?.passages || []).forEach((p) => {
                (p.questionGroups || []).forEach((g) => questions.push(...(g.questions || [])));
            });
            (test.listening?.sections || []).forEach((s) => {
                (s.questionGroups || []).forEach((g) => questions.push(...(g.questions || [])));
            });
            let correct = 0;
            questions.forEach((q) => {
                const radio = document.querySelector(`input[name='q${q.number}']:checked`);
                const input = document.getElementById(`q${q.number}`);
                const ua = radio ? radio.value : (input ? input.value : "");
                const ok = String(q.answer || "").split("|")
                    .map((a) => a.trim().toLowerCase())
                    .includes(String(ua).trim().toLowerCase());
                if (ok) correct++;
            });
            const table = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [10, 4], [0, 0]];
            const band = table.find(([min]) => correct >= min)?.[1] || 0;
            const bar = document.getElementById("resultBar");
            bar.textContent = `Score: ${correct} / ${questions.length} — Estimated band: ${band}`;
            bar.classList.remove("hidden");
        };
    }, [test]);

    return React.createElement(
        TestContext.Provider,
        { value: { test, skill, setSkill, passageIndex, setPassageIndex, sectionIndex, setSectionIndex } },
        children
    );
}

function useTest() {
    return React.useContext(TestContext);
}

function PartNav({ items, activeIndex, onSelect, labelFn }) {
    if (!items || items.length <= 1) return null;
    return React.createElement("nav", { className: "ielts-part-nav" },
        items.map((item, index) =>
            React.createElement("button", {
                key: item.number || index,
                type: "button",
                className: index === activeIndex ? "active" : "",
                onClick: () => onSelect(index)
            }, labelFn(item))
        )
    );
}

function PassagePanel() {
    const { test, skill, passageIndex, setPassageIndex, sectionIndex, setSectionIndex } = useTest();

    if (!test) {
        return React.createElement("p", { className: "ielts-loading" }, "Loading passage…");
    }

    if (skill === "listening") {
        const sections = test.listening?.sections || [];
        const section = sections[sectionIndex] || sections[0];
        return React.createElement(React.Fragment, null,
            React.createElement(PartNav, {
                items: sections,
                activeIndex: sectionIndex,
                onSelect: setSectionIndex,
                labelFn: (s) => `Section ${s.number}`
            }),
            React.createElement("div", { className: "ielts-passage ielts-passage--listening" },
                React.createElement("span", { className: "ielts-passage-label" }, "LISTENING"),
                React.createElement("h2", { className: "ielts-passage-title" }, section?.title || `Section ${section?.number || 1}`),
                section?.sectionHtml
                    ? React.createElement(IeltsTestComponents.SafeHtml, {
                        html: section.sectionHtml,
                        className: "ielts-listening-intro"
                    })
                    : React.createElement("p", { className: "ielts-instruction-body" }, "Listen and answer the questions.")
            )
        );
    }

    const passages = test.reading?.passages || [];
    const passage = passages[passageIndex] || passages[0];

    return React.createElement(React.Fragment, null,
        React.createElement(PartNav, {
            items: passages,
            activeIndex: passageIndex,
            onSelect: setPassageIndex,
            labelFn: (p) => `Passage ${p.number}`
        }),
        React.createElement(PassageRenderer, { passage })
    );
}

function QuestionsPanelMount() {
    const { test, skill, passageIndex, sectionIndex } = useTest();

    if (!test) {
        return React.createElement("p", { className: "ielts-loading" }, "Loading questions…");
    }

    const groups = skill === "listening"
        ? (test.listening?.sections?.[sectionIndex]?.questionGroups || [])
        : (test.reading?.passages?.[passageIndex]?.questionGroups || []);

    return React.createElement(QuestionsPanel, { groups, images: test.images || [] });
}

function App({ passageEl, questionsEl }) {
    return React.createElement(TestProvider, null,
        createPortal(React.createElement(PassagePanel), passageEl),
        createPortal(React.createElement(QuestionsPanelMount), questionsEl)
    );
}

document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("id")) {
        document.getElementById("testTitle").textContent = "Missing test id";
        return;
    }

    const passageEl = document.getElementById("passagePanel");
    const questionsEl = document.getElementById("questionsPanel");
    const host = document.createElement("div");
    host.id = "reactHost";
    host.style.display = "none";
    document.body.appendChild(host);

    ReactDOM.createRoot(host).render(
        React.createElement(App, { passageEl, questionsEl })
    );
});
