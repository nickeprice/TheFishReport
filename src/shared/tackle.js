/**
 * src/shared/tackle.js - measured tackle library loader (docs/CONTRACT_TACKLE.md ->
 * src/data/tackle.json) plus the CASCADING pickers that read it.
 *
 * The cascade (WS-3): Material -> Brand -> LB Test (mainline + leader), Weight Type ->
 * Amount, Bead Material -> Size. A pick only CHOOSES: the three visible line parts
 * resolve into the HIDDEN ml-line / ld-line id, which is what solver.js (measured
 * diameter), log.js (the catch row) and the DB read, so nothing downstream of the form
 * changed.
 *
 * public: TACKLE, tackleLoad(), tackleItems(), tackleLineById(), tackleLineByMatLb(),
 *         tackleRowLine(), isGenericBrand(), brandLabel(), brandOrder(),
 *         populateTacklePickers(), cascadeLine(role), resolveLineId(role),
 *         onLinePartChange(fieldId, fromLog), onWeightShapeChange(baseId, fromLog),
 *         onBeadMatChange(fieldId, fromLog), tackleLineBrands(mat, role),
 *         tackleLineLbs(mat, brand, role), tackleLineFind(mat, brand, lb),
 *         tackleWeightOz(shape), tackleWeightRow(shapeLabel, oz),
 *         tackleWeightArea(shapeLabel, oz), tackleBeadSizes(mat)
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
// Generic lookup by id across ALL tackle types (not just lines).
function tackleById(id) {
    if (!id || !TACKLE || !TACKLE.items) return null;
    for (var i = 0; i < TACKLE.items.length; i++) {
        if (TACKLE.items[i].id === id) return TACKLE.items[i];
    }
    return null;
}

// Fallback for a plain material+lb pair (a community catch row, or a rig saved
// before the pickers existed): prefer the `generic` average row for that size.
// NOTE the brand TEXT is "Generic average" (a display string), so match on it
// case-insensitively rather than on an exact slug.
// "Generic average" is the library's averaged fallback row, matched case-insensitively
// because the brand is a display string, not a slug.
function isGenericBrand(brand) {
    return /^generic/i.test(String(brand || ''));
}

function isGenericLine(it) {
    return isGenericBrand(it && it.brand);
}

// The brand picker shows the library's own spelling, EXCEPT the synthetic fallback row:
// the CSV calls it "Generic average", the angler should read "Generic". DISPLAY ONLY - the
// <option> VALUE stays the library string, because that value is what (material, brand, lb)
// matching, a restored rig and tackleLineFind() all round-trip through.
function brandLabel(brand) {
    return isGenericBrand(brand) ? 'Generic' : String(brand);
}

// Generic FIRST - it is the averaged row for that size, i.e. the honest default when the
// angler's own line is not in the library. Everything else stays A-Z.
function brandOrder(a, b) {
    var ga = isGenericBrand(a), gb = isGenericBrand(b);
    if (ga !== gb) return ga ? -1 : 1;
    return String(a).localeCompare(String(b));
}

function tackleLineByMatLb(mat, lb) {
    var lines = tackleItems('line');
    var first = null;
    for (var i = 0; i < lines.length; i++) {
        var it = lines[i];
        if (it.material !== mat || Number(it.lb_test) !== Number(lb)) continue;
        if (isGenericLine(it)) return it;
        if (!first) first = it;
    }
    return first;
}

// Resolve the LINE a catch row (or a cloud calibration row) refers to. The PICKED brand id
// wins when the row carries one — it owns the measured diameter, so the replay uses the
// angler's actual line — and material + lb is the fallback for a row logged before the
// pickers existed or written by an older installed client. Returns null when neither
// resolves (library not loaded, or the row predates both fields).
function tackleRowLine(row, role) {
    if (!row) return null;
    var isLeader = (role === 'leader');
    var byId = tackleLineById(isLeader ? (row.ldLine || row.leader_line_id)
                                      : (row.mlLine || row.mainline_line_id));
    if (byId) return byId;
    return tackleLineByMatLb(
        isLeader ? (row.ldMat || row.leader_material) : (row.mlMat || row.mainline_mat),
        isLeader ? (row.ldLb || row.leader_lb) : (row.mlLb || row.mainline_lb));
}

// --- THE CASCADE (WS-3) ------------------------------------------------------------
// ONE rule for lines, weights and beads: a child list holds exactly the values its
// parent allows, and a BLANK parent offers the UNION across everything that parent
// could be (the role's materials / every weight type / every bead material). So no
// control is ever dead, no value is ever invented, and the short static <option> lists
// in index.html are that same union (sanity asserts it) - which is the form an angler
// gets when tackle.json never loads. Every list is filled into BOTH tabs at once, so
// the Gear Sim and the Catch Log can never disagree about what is on offer.
//
// The line identity (material, brand, lb test) is exactly one measured row, which is
// what lets the cascade resolve a real diameter. A PARTIAL pick resolves to nothing
// rather than to a guessed brand; missingRigFields() is what blocks the sim/log then.
function tackleLineFind(mat, brand, lb) {
    if (!mat || !brand || !lb) return null;
    var lines = tackleItems('line');
    for (var i = 0; i < lines.length; i++) {
        var it = lines[i];
        if (it.material === mat && String(it.brand) === brand &&
            Number(it.lb_test) === Number(lb)) return it;
    }
    return null;
}

// Brands on offer for a material (blank material -> every brand the role allows).
function tackleLineBrands(mat, role) {
    var ok = mat ? [mat] : (TACKLE_LINE_ROLES[role] || []);
    var seen = {}, out = [];
    tackleItems('line').forEach(function (it) {
        if (ok.indexOf(it.material) === -1 || !it.brand || seen[it.brand]) return;
        seen[it.brand] = true;
        out.push(String(it.brand));
    });
    return out.sort(brandOrder);
}

// LB tests on offer for a (material, brand) pair (blank parent -> the union).
function tackleLineLbs(mat, brand, role) {
    var ok = mat ? [mat] : (TACKLE_LINE_ROLES[role] || []);
    var seen = {}, out = [];
    tackleItems('line').forEach(function (it) {
        if (ok.indexOf(it.material) === -1) return;
        if (brand && String(it.brand) !== brand) return;
        var lb = Number(it.lb_test);
        if (!lb || seen[lb]) return;
        seen[lb] = true;
        out.push(lb);
    });
    return out.sort(function (a, b) { return a - b; });
}

// The visible line fields, by role: ml-mat / ld-mat etc.
function lineField(role, part) {
    return (role === 'leader' ? 'ld-' : 'ml-') + part;
}

// Fill a control AND its -log twin with the same entries, then mirror the value across.
// This is the ONLY way an option list is written, which is what keeps the two tabs in
// lockstep; a stale value that fell out of its parent's list is cleared by the same
// browser rule on both sides (assigning an absent value leaves the select empty).
function fillBothSelects(baseId, entries) {
    var base = document.getElementById(baseId);
    var twin = document.getElementById(baseId + '-log');
    if (base) fillSelect(base, entries);
    if (twin) fillSelect(twin, entries);
    if (base && twin) twin.value = base.value;
}

function mirrorValue(baseId) {
    var base = document.getElementById(baseId);
    var twin = document.getElementById(baseId + '-log');
    if (base && twin) twin.value = base.value;
}

// Rebuild BRAND + LB from the material/brand picks, then refresh the hidden id.
function cascadeLine(role) {
    var mat = getStr(lineField(role, 'mat'));
    fillBothSelects(lineField(role, 'brand'),
        tackleLineBrands(mat, role).map(function (b) { return { value: b, text: brandLabel(b) }; }));
    fillBothSelects(lineField(role, 'lb'),
        tackleLineLbs(mat, getStr(lineField(role, 'brand')), role)
            .map(function (lb) { return { value: String(lb), text: lb + ' lb' }; }));
    return resolveLineId(role);
}

// Resolve the HIDDEN line id from the three visible picks (incomplete pick -> no id).
function resolveLineId(role) {
    var line = tackleLineFind(getStr(lineField(role, 'mat')),
                              getStr(lineField(role, 'brand')),
                              getStr(lineField(role, 'lb')));
    setFieldValue(lineField(role, 'line'), line ? line.id : '');
    return line;
}

// Any of the six line controls changed. Copy the twin's value in first when the change
// came from the Catch Log, then re-cascade: a brand the new material does not offer is
// dropped here, so a stale pick can never resolve a wrong diameter or a wrong id.
function onLinePartChange(fieldId, fromLog) {
    var base = String(fieldId).replace(/-log$/, '');
    if (fromLog) setFieldValue(base, getStr(fieldId));
    var role = (base.indexOf('ld-') === 0) ? 'leader' : 'mainline';
    var line = cascadeLine(role);
    mirrorValue(base);
    logDebug('Line ' + role + ': ' + (line ? line.label : '--'), 'STATE');
}

// The weight TYPE is its own control; mirror it and rebuild the amount list from the
// rows that carry that type.
function onWeightShapeChange(baseId, fromLog) {
    var base = String(baseId).replace(/-log$/, '');
    if (fromLog) setFieldValue(base, getStr(baseId));
    fillBothSelects('weight', tackleWeightOz(getStr(base)));
    mirrorValue(base);
    logDebug('Weight type: ' + getStr(base), 'STATE');
}

// Foam 3 (bead) change — populates size list.
function onFoam3Change(fieldId, fromLog) {
    var base = String(fieldId).replace(/-log$/, '');
    if (fromLog) setFieldValue(base, getStr(fieldId));
    mirrorValue(base);
    logDebug('Foam 3 (bead): ' + getStr(base), 'STATE');
}

// Weight amount: the nominal oz of a weight row, read from the trailing "<n>/<d> oz" of
// its own label (the CSV's wording), so the picker and the library cannot drift. The
// rubber-sleeve rows weigh MORE than their nominal oz, so mass is deliberately NOT the
// source of this list. Blank type -> the union of every type.
var OZ_LABEL_RE = /(\d+)(?:\/(\d+))?\s*oz\s*$/i;

function tackleWeightOz(shape) {
    var seen = {}, out = [];
    tackleItems('weight').forEach(function (it) {
        if (shape && it.shape_label !== shape) return;
        var m = String(it.label || '').match(OZ_LABEL_RE);
        if (!m) return;
        var oz = Number(m[1]) / (m[2] ? Number(m[2]) : 1);
        if (!oz || seen[oz]) return;
        seen[oz] = true;
        out.push({ value: String(oz), text: m[0].replace(/\s+/g, ' ').trim() });
    });
    return out.sort(function (a, b) { return Number(a.value) - Number(b.value); });
}

// Resolve the ONE measured weight row a picker pair names: (shape_label, nominal oz).
// That pair is exactly the identity CONTRACT_TACKLE.md guarantees is unique - every
// shape_label exists at every oz - which is why a rubber-sleeve variant and its bare
// metal sibling stay separate rows without `shape` having to do a second job.
//
// Match on the NOMINAL oz parsed from the label (the same OZ_LABEL_RE the picker list
// uses), never on mass_g: a sleeved row weighs MORE than its nominal oz, so mass would
// pick the wrong sibling. Returns null when the pair names no row (library not loaded,
// no shape picked, or a legacy rig) - callers must treat null as "no information", not
// as a zero.
function tackleWeightRow(shapeLabel, oz) {
    if (!shapeLabel || !oz) return null;
    var found = null;
    tackleItems('weight').forEach(function (it) {
        if (it.shape_label !== shapeLabel) return;
        var m = String(it.label || '').match(OZ_LABEL_RE);
        if (!m) return;
        var nominal = Number(m[1]) / (m[2] ? Number(m[2]) : 1);
        if (Math.abs(nominal - Number(oz)) < 1e-9) found = it;
    });
    return found;
}

// Projected (broadside) area in cm2 of the picked weight, or null. Kept separate from
// tackleWeightRow() so the physics module never has to know the library's field names.
function tackleWeightArea(shapeLabel, oz) {
    var row = tackleWeightRow(shapeLabel, oz);
    var area = row ? Number(row.area_cm2) : 0;
    return area > 0 ? area : null;
}

// Bead size: the bead rows the material owns. "None" is the ABSENCE of a bead, so its 0
// is supplied here rather than invented from the library; a blank material lists every
// size the library has.
function tackleBeadSizes() {
    var out = [{ value: '0', text: 'None' }];
    tackleItems('bead').forEach(function (it) {
        var mm = Number(it.diameter_mm);
        if (!mm || out.some(function (o) { return o.value === String(mm); })) return;
        var label = (it.label || (mm + 'mm')).replace(/^Bead\s+/i, '');
        out.push({ value: String(mm), text: label });
    });
    return out.sort(function (a, b) { return Number(a.value) - Number(b.value); });
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

// Boot: fill every list from the library before anything is picked. The material select
// holds the library's OWN materials for that role; every child list is built for a blank
// parent (= the union), so the form is usable top-down and the static index.html options
// are provably the same union. A missing library leaves the static lists in place.
function populateTacklePickers() {
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

