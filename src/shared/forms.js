/**
 * src/shared/forms.js - shared rod / line / field form helpers used by BOTH
 * the Gear Sim and the Catch Log (keep the two in sync when adding a field).
 * public: syncSelect(), getRodLengthFt(), formatRodLength(), onRodChange(),
 *         setFieldValue(), LB_OPTIONS, updateLbOptions(), onLineMatChange()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
function syncSelect(baseId, fromLog) {
    var a = document.getElementById(baseId);
    var b = document.getElementById(baseId + '-log');
    if (!a || !b) return;
    if (fromLog) a.value = b.value; else b.value = a.value;
    logDebug("Synced Field: " + baseId, "STATE");
}

// Rod length is entered as two boxes (feet + inches) so 9'8" works.
function getRodLengthFt() {
    var ft = getNum('rod-ft');
    var inch = getNum('rod-in');
    if (ft <= 0 && inch <= 0) return 9.0;
    return ft + (inch / 12);
}

function formatRodLength(totalFt) {
    var whole = Math.floor(totalFt + 0.0001);
    var inch = Math.round((totalFt - whole) * 12);
    if (inch === 12) { whole += 1; inch = 0; }
    return whole + "'" + inch + '"';
}

// Rod change mirrors the ft/in boxes between the two tabs. There is no leader
// auto-fill any more — leader length is a free input the angler controls.
function onRodChange(fromLog) {
    if (fromLog) {
        setFieldValue('rod-ft', getStr('rod-ft-log'));
        setFieldValue('rod-in', getStr('rod-in-log'));
    } else {
        setFieldValue('rod-ft-log', getStr('rod-ft'));
        setFieldValue('rod-in-log', getStr('rod-in'));
    }
    logDebug('Rod length: ' + formatRodLength(getRodLengthFt()), 'STATE');
}

function setFieldValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value;
}

// Lb test ranges are fixed per material: braid is 20/30/40, mono & copoly are 10/12,
// fluoro leaders are 10/12/15/17. Fluoro is not offered as a mainline, braid not as a leader.
var LB_OPTIONS = {
    mainline: { braid: [20, 30, 40], mono: [10, 12], copoly: [10, 12] },
    leader: { mono: [10, 12], copoly: [10, 12], fluoro: [10, 12, 15, 17] }
};

function updateLbOptions(matId, lbId, isLeader) {
    var table = isLeader ? LB_OPTIONS.leader : LB_OPTIONS.mainline;
    var mat = getStr(matId);
    var list = table[mat] || [];          // no defaults: blank material -> blank lb
    var sel = document.getElementById(lbId);
    if (!sel) return;
    var previous = sel.value;
    sel.innerHTML = '';
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '\u2014';
    sel.appendChild(blank);
    for (var i = 0; i < list.length; i++) {
        var opt = document.createElement('option');
        opt.value = String(list[i]);
        opt.textContent = list[i] + 'lb';
        sel.appendChild(opt);
    }
    // Keep the previous choice only if it is still valid for this material.
    var keepPrevious = false;
    for (var j = 0; j < list.length; j++) {
        if (String(list[j]) === previous) keepPrevious = true;
    }
    sel.value = keepPrevious ? previous : '';
}

function onLineMatChange(baseId, fromLog) {
    var isLeader = (baseId === 'ld-mat');
    var lbBase = isLeader ? 'ld-lb' : 'ml-lb';
    syncSelect(baseId, fromLog);
    updateLbOptions(baseId, lbBase, isLeader);
    updateLbOptions(baseId + '-log', lbBase + '-log', isLeader);
    if (fromLog) setFieldValue(lbBase, getStr(lbBase + '-log'));
    else setFieldValue(lbBase + '-log', getStr(lbBase));
    logDebug("Material: " + getStr(baseId) + " -> " + getStr(lbBase) + "lb", "STATE");
}
