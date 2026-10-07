/**
 * src/shared/format.js - feed-row normalisation, time formatting + text escaping.
 * public: normalizeFeedRow(row), formatCatchTime(value), provVal(x),
 *         escapeHtml(value), escapeJsString(value), newUuid()
 * ES module.
 */
// Phase 2.3 provenance unwrap: data producers emit { value, source, uncertainty }
// envelopes; every UI / gear-sim consumer reads the scalar via provVal(). A raw
// primitive (old cached payload) is tolerated so a stale SW cache or snapshot
// degrades to the same number instead of silently reading undefined.
export function provVal(x) {
    if (x === null || x === undefined) return x;
    if (typeof x === 'object' && Object.prototype.hasOwnProperty.call(x, 'value')) {
        return x.value;
    }
    return x;
}
window.provVal = provVal;
// Client-generated id for a logged catch. Sending it makes the write IDEMPOTENT: a
// retry after a lost response conflicts on the primary key and is ignored rather than
// inserting a second copy of the same fish.
export function newUuid() {
window.newUuid = newUuid;
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    // RFC 4122 v4 fallback for older WebViews without crypto.randomUUID.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : ((r & 0x3) | 0x8);
        return v.toString(16);
    });
}
// Third-party text (USGS station names, WDFW strings) must never be interpolated into
// an HTML string raw — AGENTS.md forbids unsanitised HTML interpolation.
export function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// Escape text for a JS string literal inside an HTML attribute (e.g. onclick="...").
// Also neutralises "</script>"-style breakouts and newlines.
export function escapeJsString(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
        .replace(/</g, '\\x3c').replace(/\r?\n/g, ' ');
}
window.escapeJsString = escapeJsString;
// Accepts either Supabase (angler_name/catch_time/river/species) or local buffer
// (name/time/river/spc) shapes so the offline fallback renders identically.
export function normalizeFeedRow(row) {
    if (!row) return null;
    return {
        name: (row.angler_name !== undefined) ? row.angler_name : row.name,
        time: (row.catch_time !== undefined) ? row.catch_time : row.time,
        river: (row.river !== undefined && row.river !== null && row.river !== '') ? row.river : '--',
        spc: (row.species !== undefined) ? row.species : row.spc
    };
}
window.normalizeFeedRow = normalizeFeedRow;

export function formatCatchTime(value) {
    if (!value) return '--';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value).slice(0, 16).replace('T', ' ');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const h = d.getHours();
    const suffix = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    let mins = d.getMinutes(); if (mins < 10) mins = '0' + mins;
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + h12 + ':' + mins + ' ' + suffix;
}
window.formatCatchTime = formatCatchTime;
