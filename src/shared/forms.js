/**
 * src/shared/forms.js - shared line / field form helpers used by BOTH
 * the Gear Sim and the Catch Log (keep the two in sync when adding a field).
 * public: syncSelect(), setFieldValue()
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

// Line selection is now ONE brand-specific picker per line role, populated from
// src/data/tackle.json (see src/shared/tackle.js). The old per-material lb cascade
// (LB_OPTIONS / updateLbOptions / onLineMatChange) is gone with the material+lb
// pair of dropdowns: a pick resolves straight into the hidden mat/lb fields.

