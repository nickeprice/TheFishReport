/**
 * src/shared/tackle.js - measured tackle library loader (docs/CONTRACT_TACKLE.md ->
 * src/data/tackle.json). Populates the data-driven line + weight pickers so the
 * options can never drift from the CSV, which is the single source of truth.
 *
 * The pickers CHOOSE; the rig model underneath stays material+lb, because
 * solver.js, log.js (the catch row) and the DB all read `ml-mat`/`ml-lb`/`ld-mat`/
 * `ld-lb`. So a pick resolves into those fields and nothing downstream changes.
 *
 * public: TACKLE, tackleLoad(), tackleItems(), tackleLineById(), tackleLineByMatLb(),
 *         populateTacklePickers(), onLinePickChange(), onWeightShapeChange()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
var TACKLE = null;

// Which line materials each picker offers: braid is mainline-only, fluoro is
// leader-only, mono and copoly are fished as either.
var TACKLE_LINE_ROLES = {
    mainline: ['braid', 'mono', 'copoly'],
    leader: ['mono', 'copoly', 'fluoro']
};
var TACKLE_MAT_LABELS = {
    braid: 'Braid', mono: 'Mono', copoly: 'Copoly', fluoro: 'Fluorocarbon'
};

function tackleItems(type) {
    if (!TACKLE || !TACKLE.items) return [];
    return TACKLE.items.filter(function (i) { return i.type === type; });
}

function tackleLineById(id) {
    if (!id) return null;
    var lines = tackleItems('line');
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].id === id) return lines[i];
    }
    return null;
}

// Fallback for a plain material+lb pair (a community catch row, or a rig saved
// before the pickers existed): prefer the `generic` average row for that size.
function tackleLineByMatLb(mat, lb) {
    var lines = tackleItems('line');
    var first = null;
    for (var i = 0; i < lines.length; i++) {
        var it = lines[i];
        if (it.material !== mat || Number(it.lb_test) !== Number(lb)) continue;
        if (it.brand === 'generic') return it;
        if (!first) first = it;
    }
    return first;
}

// Write the resolved material + lb for one role into its hidden canonical fields.
function resolveLineFields(role) {
    var isLeader = (role === 'leader');
    var line = tackleLineById(getStr(isLeader ? 'ld-line' : 'ml-line'));
    setFieldValue(isLeader ? 'ld-mat' : 'ml-mat', line ? line.material : '');
    setFieldValue(isLeader ? 'ld-lb' : 'ml-lb', line ? String(line.lb_test) : '');
}

// The Gear Sim and the Catch Log hold the same picker; keep them mirroring.
function syncLinePicker(baseId, fromLog) {
    var a = document.getElementById(baseId);
    var b = document.getElementById(baseId + '-log');
    if (!a || !b) return;
    if (fromLog) a.value = b.value; else b.value = a.value;
}

function onLinePickChange(baseId, fromLog) {
    var isLeader = (baseId.indexOf('ld') === 0);
    syncLinePicker(baseId, fromLog);
    resolveLineFields(isLeader ? 'leader' : 'mainline');
    var line = tackleLineById(getStr(isLeader ? 'ld-line' : 'ml-line'));
    logDebug('Line picked: ' + (line ? line.label : '--'), 'STATE');
}

// The weight shape is its own control; mirror it the same way.
function onWeightShapeChange(baseId, fromLog) {
    var a = document.getElementById(baseId);
    var b = document.getElementById(baseId + '-log');
    if (!a || !b) return;
    if (fromLog) a.value = b.value; else b.value = a.value;
    logDebug('Weight shape: ' + getStr(baseId), 'STATE');
}

function fillSelect(sel, entries) {
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

function populateTacklePickers() {
    if (!TACKLE) return;
    // Lines: one picker per role, one <optgroup> per material, ordered by lb then brand.
    [['ml-line', 'mainline'], ['ld-line', 'leader']].forEach(function (pair) {
        var sel = document.getElementById(pair[0]);
        if (!sel) return;
        var entries = [];
        TACKLE_LINE_ROLES[pair[1]].forEach(function (mat) {
            var rows = tackleItems('line').filter(function (i) { return i.material === mat; });
            if (!rows.length) return;
            rows.sort(function (a, b) {
                return (Number(a.lb_test) - Number(b.lb_test)) ||
                       String(a.brand).localeCompare(String(b.brand));
            });
            entries.push({ group: TACKLE_MAT_LABELS[mat] || mat, rows: rows });
        });
        var previous = sel.value;
        var frag = document.createDocumentFragment();
        var blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '\u2014';
        frag.appendChild(blank);
        entries.forEach(function (grp) {
            var og = document.createElement('optgroup');
            og.label = grp.group;
            grp.rows.forEach(function (it) {
                var opt = document.createElement('option');
                opt.value = it.id;
                opt.textContent = it.label || it.id;
                og.appendChild(opt);
            });
            frag.appendChild(og);
        });
        sel.innerHTML = '';
        sel.appendChild(frag);
        sel.value = previous;
        var mirror = document.getElementById(pair[0] + '-log');
        if (mirror) { mirror.innerHTML = sel.innerHTML; mirror.value = sel.value; }
    });

    // Weight shapes: every distinct shape_label in the weight rows. Paired with the
    // oz dropdown that identifies exactly one weight row (metal + sleeve included).
    var shapeSel = document.getElementById('weight-shape');
    if (shapeSel) {
        var seen = {};
        var shapes = [];
        tackleItems('weight').forEach(function (it) {
            if (!it.shape_label || seen[it.shape_label]) return;
            seen[it.shape_label] = true;
            shapes.push({ value: it.shape_label, text: it.shape_label });
        });
        shapes.sort(function (a, b) { return a.text.localeCompare(b.text); });
        fillSelect(shapeSel, shapes);
        var shapeMirror = document.getElementById('weight-shape-log');
        if (shapeMirror) {
            shapeMirror.innerHTML = shapeSel.innerHTML;
            shapeMirror.value = shapeSel.value;
        }
    }
}

// Load once at boot. A failure (offline first run, or a deploy without the file)
// leaves the bare pickers in place; restoreRig() then simply finds nothing to pick.
function tackleLoad() {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch('/src/data/tackle.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (!data || !data.items || !data.items.length) return null;
            TACKLE = data;
            populateTacklePickers();
            return data;
        })
        .catch(function () { return null; });
}

