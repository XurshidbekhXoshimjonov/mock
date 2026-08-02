"use strict";

function finiteTime(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function normalizeTranscriptSegments(value, { maxSegments = 5000 } = {}) {
    if (!Array.isArray(value)) return [];
    const usedIds = new Set();
    return value.slice(0, maxSegments).map((segment, index) => {
        let id = String(segment?.id || `segment-${index + 1}`).trim().slice(0, 100) || `segment-${index + 1}`;
        while (usedIds.has(id)) id = `${id}-${index + 1}`;
        usedIds.add(id);
        const start = finiteTime(segment?.start) ?? 0;
        const candidateEnd = finiteTime(segment?.end);
        return {
            id,
            start,
            end: candidateEnd !== null && candidateEnd >= start ? candidateEnd : start,
            text: String(segment?.text || "").trim().slice(0, 10000)
        };
    }).filter((segment) => segment.text);
}

function normalizeTranscriptSegmentIds(value) {
    const values = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
    return [...new Set(values.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 100);
}

function normalizeEvidenceText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function automaticallyLinkedSegments(segments, overrides = {}) {
    const start = finiteTime(overrides.transcriptStartTime);
    const end = finiteTime(overrides.transcriptEndTime);
    if (start !== null) {
        const rangeEnd = end !== null && end >= start ? end : start + 0.01;
        const timed = segments.filter((segment) => segment.end >= start && segment.start <= rangeEnd);
        if (timed.length) return timed;
    }

    const relevantText = normalizeEvidenceText(overrides.relevantText);
    if (!relevantText) return [];
    return segments.filter((segment) => {
        const segmentText = normalizeEvidenceText(segment.text);
        return segmentText && (
            segmentText.includes(relevantText)
            || relevantText.includes(segmentText)
        );
    });
}

function transcriptEvidence(segments, segmentIds, overrides = {}) {
    const normalizedSegments = normalizeTranscriptSegments(segments);
    let ids = normalizeTranscriptSegmentIds(segmentIds);
    const byId = new Map(normalizedSegments.map((segment) => [segment.id, segment]));
    let selected = ids.map((id) => byId.get(id)).filter(Boolean);
    if (!selected.length) {
        selected = automaticallyLinkedSegments(normalizedSegments, overrides);
        ids = selected.map((segment) => segment.id);
    }
    const automaticText = selected.map((segment) => segment.text).join(" ").trim();
    const manualText = String(overrides.relevantText || "").trim();
    const manualStart = finiteTime(overrides.transcriptStartTime);
    const manualEnd = finiteTime(overrides.transcriptEndTime);
    return {
        transcriptSegmentIds: ids,
        relevantText: manualText || automaticText,
        transcriptStartTime: manualStart ?? (selected.length ? Math.min(...selected.map((segment) => segment.start)) : null),
        transcriptEndTime: manualEnd ?? (selected.length ? Math.max(...selected.map((segment) => segment.end)) : null)
    };
}

module.exports = {
    finiteTime,
    normalizeTranscriptSegments,
    normalizeTranscriptSegmentIds,
    automaticallyLinkedSegments,
    transcriptEvidence
};
