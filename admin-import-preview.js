/* global IeltsTestComponents, React, ReactDOM */
const { PassageRenderer, QuestionsPanel } = IeltsTestComponents;

function renderPreviewPanel(test, skill, passageIndex, sectionIndex) {
    const host = document.getElementById("editorContent");
    if (!host || !test || !window.React || !IeltsTestComponents) return;

    const passage = test.reading?.passages?.[passageIndex];
    const section = test.listening?.sections?.[sectionIndex];
    const groups = skill === "listening"
        ? (section?.questionGroups || [])
        : (passage?.questionGroups || []);

    const wrap = document.createElement("div");
    wrap.className = "import-preview-render";
    host.querySelectorAll(".import-preview-render").forEach((el) => el.remove());
    host.prepend(wrap);

    if (skill === "reading" && passage) {
        ReactDOM.createRoot(wrap).render(
            React.createElement(React.Fragment, null,
                React.createElement(PassageRenderer, { passage }),
                React.createElement("hr", { className: "preview-divider" }),
                React.createElement(QuestionsPanel, { groups, images: test.images || [] })
            )
        );
        return;
    }

    if (skill === "listening" && section) {
        const audioSrc = section.audio || test.listening?.audio || "";
        ReactDOM.createRoot(wrap).render(
            React.createElement(React.Fragment, null,
                audioSrc ? React.createElement("audio", {
                    src: audioSrc,
                    controls: true,
                    style: { width: "100%", marginBottom: "16px", borderRadius: "8px" }
                }) : null,
                React.createElement(QuestionsPanel, { groups, images: test.images || [] })
            )
        );
    }
}

window.renderImportPreview = renderPreviewPanel;
