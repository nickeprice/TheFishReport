/**
 * src/shared/forms.js - shared line / field form helpers used by BOTH
 * the Gear Sim and the Catch Log (keep the two in sync when adding a field).
 * public: syncSelect(), setFieldValue(), LB_OPTIONS, updateLbOptions(),
 *         onLineMatChange()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
function syncSelect(baseId, fromLog) {
    var a = document.getElementById(baseId);
    var b = document.getElementById(baseId + '-log');
    if (!a || !b) return;
    if (fromLog) a.value = b.value; else b.value = a.value;
    logDebug("Synced Field: " + baseId, "STATE");
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
