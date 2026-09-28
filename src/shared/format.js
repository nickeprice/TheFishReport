/**
 * src/shared/format.js - feed-row normalisation, time formatting + text escaping.
 * public: normalizeFeedRow(row), formatCatchTime(value),
 *         escapeHtml(value), escapeJsString(value)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// Third-party text (USGS station names, WDFW strings) must never be interpolated into
// an HTML string raw — AGENTS.md forbids unsanitised HTML interpolation.
function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Escape text for a JS string literal inside an HTML attribute (e.g. onclick="...").
// Also neutralises "</script>"-style breakouts and newlines.
function escapeJsString(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
        .replace(/</g, '\\x3c').replace(/\r?\n/g, ' ');
}
// Accepts either Supabase (angler_name/catch_time/river/species) or local buffer
// (name/time/river/spc) shapes so the offline fallback renders identically.
function normalizeFeedRow(row) {
    if (!row) return null;
    return {
        name: (row.angler_name !== undefined) ? row.angler_name : row.name,
        time: (row.catch_time !== undefined) ? row.catch_time : row.time,
        river: (row.river !== undefined && row.river !== null && row.river !== '') ? row.river : '--',
        spc: (row.species !== undefined) ? row.species : row.spc
    };
}

function formatCatchTime(value) {
    if (!value) return '--';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value).slice(0, 16).replace('T', ' ');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var h = d.getHours();
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    var mins = d.getMinutes(); if (mins < 10) mins = '0' + mins;
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + h12 + ':' + mins + ' ' + suffix;
}
