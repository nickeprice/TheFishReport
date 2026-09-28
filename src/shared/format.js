/**
 * src/shared/format.js - feed-row normalisation + time formatting.
 * public: normalizeFeedRow(row), formatCatchTime(value)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
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
