const READING_TYPES = {
    true_false_not_given: [/true\s*,?\s*false\s*,?\s*not\s+given/i, /\btfn\b/i, /class=["'][^"']*tf-question/i],
    yes_no_not_given: [/yes\s*,?\s*no\s*,?\s*not\s+given/i],
    matching_headings: [/matching\s+headings/i, /choose\s+the\s+correct\s+heading/i, /drag-item|drop-zone/i],
    matching_information: [/matching\s+information/i, /which\s+paragraph\s+contains/i],
    matching_features: [/matching\s+features/i, /match\s+each\s+statement\s+with\s+the\s+correct/i],
    matching_sentence_endings: [/matching\s+sentence\s+endings/i, /sentence\s+endings/i],
    multiple_choice: [/multiple\s+choice/i, /choose\s+the\s+correct\s+letter/i, /multi-choice-question/i],
    notes_completion: [/notes?\s+completion/i, /complete\s+the\s+notes/i],
    flowchart_completion: [/flow-?chart/i, /flowchart/i],
    sentence_completion: [/complete\s+the\s+sentences?/i, /answer-input|completion-input/i],
    summary_completion: [/summary\s+completion/i, /summary-text/i],
    table_completion: [/table\s+completion/i, /matching-table/i],
    diagram_labeling: [/diagram\s+label/i, /label\s+the\s+diagram/i],
    short_answer: [/short\s+answer/i, /answer\s+the\s+questions?\s+below/i]
};

const LISTENING_TYPES = {
    form_completion: [/form\s+completion/i, /class=["'][^"']*form-box/i, /complete\s+the\s+form/i],
    notes_completion: [/notes?\s+completion/i, /complete\s+the\s+notes/i],
    table_completion: [/table\s+completion/i, /<table\b/i],
    flowchart_completion: [/flow-?chart/i, /flowchart/i],
    map_labeling: [/map\s+label/i, /label\s+the\s+map/i, /map-box/i],
    plan_labeling: [/plan\s+label/i, /label\s+the\s+plan/i],
    multiple_choice: [/multiple\s+choice/i, /choose\s+the\s+correct\s+letter/i],
    matching: [/matching/i, /match\s+each/i],
    sentence_completion: [/sentence\s+completion/i, /complete\s+the\s+sentences?/i]
};

function detectFromHtml(html, skill = "reading") {
    const map = skill === "listening" ? LISTENING_TYPES : READING_TYPES;
    const haystack = String(html || "");

    for (const [type, patterns] of Object.entries(map)) {
        if (patterns.some((pattern) => pattern.test(haystack))) {
            return type;
        }
    }

    if (/<input\b[^>]*\btype=["']text["']/i.test(haystack) && skill === "listening") {
        return "form_completion";
    }
    if (/<input\b/i.test(haystack) || /\[\[q\d+\]\]/i.test(haystack)) {
        return "sentence_completion";
    }
    if (/<input\b[^>]*\btype=["']radio["']/i.test(haystack)) {
        return "multiple_choice";
    }

    return skill === "listening" ? "sentence_completion" : "sentence_completion";
}

function normalizeType(type, skill = "reading") {
    const allowedReading = Object.keys(READING_TYPES);
    const allowedListening = Object.keys(LISTENING_TYPES);
    const allowed = skill === "listening" ? allowedListening : allowedReading;
    const value = String(type || "").trim().toLowerCase().replace(/\s+/g, "_");

    if (allowed.includes(value)) return value;
    if (value === "heading_matching" || value === "matching_headings") return "matching_headings";
    if (value === "matching") return skill === "listening" ? "matching" : "matching_information";
    if (value === "notes_completion") return "notes_completion";
    return detectFromHtml("", skill);
}

module.exports = {
    detectFromHtml,
    normalizeType,
    READING_TYPES,
    LISTENING_TYPES
};
