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
            mlMat: getStr('ml-mat'),
            mlLb: getStr('ml-lb'),
            ldLen: getStr('ld-len'),
            ldMat: getStr('ld-mat'),
            ldLb: getStr('ld-lb'),
            weight: getStr('weight'),
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
    set('ml-mat', rig.mlMat); set('ml-lb', rig.mlLb);
    set('ld-len', rig.ldLen); set('ld-mat', rig.ldMat); set('ld-lb', rig.ldLb);
    set('weight', rig.weight); set('hook', rig.hook); set('yarn', rig.yarn);
    set('foam', rig.foam); set('foam2', rig.foam2);
    set('bd-mat', rig.bdMat); set('bd-sz', rig.bdSz);
    // Mirror to the Catch Log duplicated controls.
    set('ml-mat-log', rig.mlMat); set('ml-lb-log', rig.mlLb);
    set('ld-len-log', rig.ldLen); set('ld-mat-log', rig.ldMat); set('ld-lb-log', rig.ldLb);
    set('weight-log', rig.weight); set('hook-log', rig.hook); set('yarn-log', rig.yarn);
    set('foam-log', rig.foam); set('foam2-log', rig.foam2);
    set('bd-mat-log', rig.bdMat); set('bd-sz-log', rig.bdSz);
}
