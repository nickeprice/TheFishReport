/**
 * src/features/gear-sim/rig.js - per-device rig memory (last-used inputs).
 * public: RIG_STORE_KEY, saveRig(), restoreRig()
 * ES module.
 */
// --- RIG PRESET PERSISTENCE ---
export var RIG_STORE_KEY = 'puyallup_last_rig';
window.RIG_STORE_KEY = RIG_STORE_KEY;

export function saveRig() {
    try {
        var rig = {
            // The line CASCADE, part by part, saved alongside the resolved id so a
            // restore can rebuild the three visible picks instead of guessing them.
            mlMat: getStr('ml-mat'), mlBrand: getStr('ml-brand'), mlLb: getStr('ml-lb'),
            ldMat: getStr('ld-mat'), ldBrand: getStr('ld-brand'), ldLb: getStr('ld-lb'),
            mlLine: getStr('ml-line'),
            ldLine: getStr('ld-line'),
            ldLen: getStr('ld-len'),
            weightSetup: getStr('weight-setup'),
            weight: getStr('weight'),
            weightShape: getStr('weight-shape'),
            hook: getStr('hook'),
            yarn: getStr('yarn'),
            foam: getStr('foam'),
            foam2: getStr('foam2'),
            bdSz: getStr('foam3')
        };
        localStorage.setItem(RIG_STORE_KEY, JSON.stringify(rig));
    } catch (e) {}
}

export function restoreRig() {
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
    // Every VISIBLE control exists twice (Gear Sim + Catch Log mirror); the hidden
    // ml-line / ld-line ids exist once, so they use set() alone.
    function setBoth(id, val) { set(id, val); set(id + '-log', val); }

    // A rig saved before the cascade (or by an older installed client) has no brand:
    // recover the brand + lb test from the saved line id, and material+lb as the last
    // resort — that is the pre-picker contract, so an old rig still restores.
    ['ml', 'ld'].forEach(function (pre) {
        var line = rig[pre + 'Line'] ? tackleLineById(rig[pre + 'Line']) : null;
        if (!line && rig[pre + 'Mat']) line = tackleLineByMatLb(rig[pre + 'Mat'], rig[pre + 'Lb']);
        if (!line) return;
        if (!rig[pre + 'Mat']) rig[pre + 'Mat'] = line.material;
        if (!rig[pre + 'Brand']) rig[pre + 'Brand'] = String(line.brand || '');
        if (!rig[pre + 'Lb']) rig[pre + 'Lb'] = String(line.lb_test);
    });

    // Parents BEFORE children: the cascade has to BUILD an option list before a value
    // can land in it, so each parent is applied and cascaded before its child is set.
    setBoth('ml-mat', rig.mlMat); setBoth('ld-mat', rig.ldMat);
    cascadeLine('mainline'); cascadeLine('leader');
    setBoth('ml-brand', rig.mlBrand); setBoth('ld-brand', rig.ldBrand);
    cascadeLine('mainline'); cascadeLine('leader');
    setBoth('ml-lb', rig.mlLb); setBoth('ld-lb', rig.ldLb);
    // The picks only CHOOSE: the hidden ids are what the solver, the catch row and the
    // DB read, so derive them from the restored picks.
    resolveLineId('mainline'); resolveLineId('leader');

    setBoth('weight-shape', rig.weightShape);
    if (rig.weightShape) onWeightShapeChange('weight-shape');   // amounts for that type
    setBoth('weight-setup', rig.weightSetup || 'sliding');
    setBoth('weight', rig.weight);
    setBoth('ld-len', rig.ldLen);
    setBoth('hook', rig.hook); setBoth('yarn', rig.yarn);
    setBoth('foam', rig.foam); setBoth('foam2', rig.foam2);
    setBoth('foam3', rig.bdSz);
}
