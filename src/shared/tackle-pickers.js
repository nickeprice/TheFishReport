/**
 * src/shared/tackle-pickers.js - cascade pickers + tackleLoad.
 * Splintered from tackle.js. ES module.
 */
import { TACKLE, tackleItems, cascadeLine, resolveLineId, onLinePartChange, onWeightShapeChange, tackleWeightOz, tackleBeadSizes, fillBothSelects, mirrorValue } from "./tackle-data.js";
import { getStr } from "../features/gear-sim/inputs.js";
import { setFieldValue } from "./forms.js";
import { logDebug } from "./debug.js";
export function fillSelect(sel, entries) {
    var previous = sel.value;
    var frag = document.createDocumentFragment();
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '\u2014';
    frag.appendChild(blank);
    entries.forEach(function (e) {
        var opt = document.createElement('option');
        opt.value = e.value;
        opt.textContent = e.text;
        frag.appendChild(opt);
    });
    sel.innerHTML = '';
    sel.appendChild(frag);
    sel.value = previous;                       // keep a valid pick across a repopulate
}

// Boot: fill every list from the library before anything is picked. The material select
// holds the library's OWN materials for that role; every child list is built for a blank
// parent (= the union), so the form is usable top-down and the static index.html options
// are provably the same union. A missing library leaves the static lists in place.
export function populateTacklePickers() {
    if (!TACKLE) return;
    [['ml', 'mainline'], ['ld', 'leader']].forEach(function (pair) {
        var mats = TACKLE_LINE_ROLES[pair[1]].filter(function (mat) {
            return tackleItems('line').some(function (it) { return it.material === mat; });
        });
        fillBothSelects(pair[0] + '-mat', mats.map(function (mat) {
            return { value: mat, text: TACKLE_MAT_LABELS[mat] || mat };
        }));
        cascadeLine(pair[1]);
    });

    // Weight TYPES: every distinct shape_label in the weight rows (the pair
    // shape_label + oz identifies exactly one weight row, metal + sleeve included).
    var seen = {}, shapes = [];
    tackleItems('weight').forEach(function (it) {
        if (!it.shape_label || seen[it.shape_label]) return;
        seen[it.shape_label] = true;
        shapes.push({ value: it.shape_label, text: it.shape_label });
    });
    shapes.sort(function (a, b) { return a.text.localeCompare(b.text); });
    fillBothSelects('weight-shape', shapes);
    fillBothSelects('weight', tackleWeightOz(getStr('weight-shape')));
    fillBothSelects('foam3', tackleBeadSizes());
}

// Load once at boot. A failure (offline first run, or a deploy without the file)
// leaves the bare pickers in place; restoreRig() then simply finds nothing to pick.
export function tackleLoad() {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch('/src/data/tackle.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (!data || !data.items || !data.items.length) return null;
            window.TACKLE = data;
            populateTacklePickers();
            return data;
        })
        .catch(function () { return null; });
}


