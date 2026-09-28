/**
 * src/features/gear-sim/debounce.js - trailing debounce for the numeric gear
 * inputs so the solver runs once per settled value, not per keystroke.
 * public: initGearSimInputDebounce()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- GEAR SIM INPUT DEBOUNCING ---
// The numeric gear inputs feed the deterministic physics engine. Recomputing on
// every keystroke would run the solver for each partial value ("1", "10", "104",
// "1040"), so the live zone preview is debounced to a single trailing pass.
// Selects and the rod boxes keep their existing synchronous onchange sync.
function initGearSimInputDebounce() {
    var ids = ['flow', 'distance', 'rod-ft', 'rod-in'];
    var debounced = debounce(function () {
        if (typeof refreshZonePreview === 'function') refreshZonePreview();
    }, 250);

    ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', debounced);
    });
    logDebug('Gear Sim inputs debounced (' + ids.length + ' fields, 250ms trailing)', 'UI');
}
