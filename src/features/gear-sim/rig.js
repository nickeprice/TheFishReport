/**
 * src/features/gear-sim/rig.js - per-device rig memory (last-used inputs).
 * public: RIG_STORE_KEY, saveRig(), restoreRig()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- RIG PRESET PERSISTENCE ---
var RIG_STORE_KEY = 'puyallup_last_rig';

function saveRig() {
    try {
        var rig = {
            mlLine: getStr('ml-line'),
            ldLine: getStr('ld-line'),
            ldLen: getStr('ld-len'),
            weight: getStr('weight'),
            weightShape: getStr('weight-shape'),
            hook: getStr('hook'),
            yarn: getStr('yarn'),
            foam: getStr('foam'),
            foam2: getStr('foam2'),
            bdMat: getStr('bd-mat'),
            bdSz: getStr('bd-sz')
        };
        localStorage.setItem(RIG_STORE_KEY, JSON.stringify(rig));
    } catch (e) {}
}

function restoreRig() {
    var raw = null;
    try { raw = localStorage.getItem(RIG_STORE_KEY); } catch (e) { return; }
    if (!raw) return;
    var rig = null;
    try { rig = JSON.parse(raw); } catch (e) { return; }
    if (!rig) return;

    // Pre-fill from the angler's OWN last-used values. Anything they have never
    // entered stays blank (the set() guard skips empty strings) and is required.
    function set(id, val) {
        var el = document.getElementById(id);
        if (el && val !== undefined && val !== null && val !== '') el.value = String(val);
    }
    set('ml-line', rig.mlLine); set('ld-line', rig.ldLine);
    set('ld-len', rig.ldLen);
    set('weight', rig.weight); set('weight-shape', rig.weightShape);
    set('hook', rig.hook); set('yarn', rig.yarn);
    set('foam', rig.foam); set('foam2', rig.foam2);
    set('bd-mat', rig.bdMat); set('bd-sz', rig.bdSz);
    // Mirror to the Catch Log duplicated controls.
    set('ml-line-log', rig.mlLine); set('ld-line-log', rig.ldLine);
    set('ld-len-log', rig.ldLen);
    set('weight-log', rig.weight); set('weight-shape-log', rig.weightShape);
    set('hook-log', rig.hook); set('yarn-log', rig.yarn);
    set('foam-log', rig.foam); set('foam2-log', rig.foam2);
    set('bd-mat-log', rig.bdMat); set('bd-sz-log', rig.bdSz);

    // A rig saved BEFORE the pickers existed carries material+lb only, so resolve
    // the matching line id and let the picker show the angler's own line again.
    if (!rig.mlLine && rig.mlMat) {
        var ml = tackleLineByMatLb(rig.mlMat, rig.mlLb);
        if (ml) { set('ml-line', ml.id); set('ml-line-log', ml.id); }
    }
    if (!rig.ldLine && rig.ldMat) {
        var ld = tackleLineByMatLb(rig.ldMat, rig.ldLb);
        if (ld) { set('ld-line', ld.id); set('ld-line-log', ld.id); }
    }
    // The pickers only CHOOSE: the hidden canonical mat/lb fields are what the
    // solver, the catch row and the DB read, so derive them from the picks.
    resolveLineFields('mainline');
    resolveLineFields('leader');
}
