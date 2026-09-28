/**
 * src/features/gear-sim/inputs.js - Gear Sim constants, form readers and the
 * kinematic primitives (hydraulic velocity + rig lift).
 * public: currentStats, BASE_ZONE_MIN/MAX, getNum/getStr/getGPS, FOAM_TABLE,
 *         parseFoam/hookLabel/hookSink, hydraulicVelocity(), rigLift()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- GEAR SIM: DETERMINISTIC FLUID DYNAMICS ENGINE ---
// Pure boundary-layer physics. Every output is a pure function of the form inputs plus
// the stored catch log, so identical inputs always return identical numbers.
// The old KNN loop (processAiStrikeZone) and calcHistoricHeight() drift model are gone.
var currentStats = null;

var BASE_ZONE_MIN = 4.0;     // inches - baseline strike zone floor
var BASE_ZONE_MAX = 12.0;    // inches - baseline strike zone ceiling

// Calibration constants. Tuned so a reference rig (1040 CFS, 12 lb leader, 1/2 oz lead,
// 10 ft leader, Corky 10 + 1" yarn) lands in the middle of the baseline zone.
// Physics is LOCKED: drag coefficient is always 1.0. Community catches never bend
// the physics - they act as sonar that shifts WHERE the fish are (the zone).
var DRAG_REF = 7.5;          // drag units per foot of leader at the reference conditions
var REF_VELOCITY = 2.45;     // ft/s bed velocity produced by 1040 CFS
var REF_LB_TEST = 12;        // reference leader diameter for those conditions

function getNum(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var val = parseFloat(el.value);
    return isNaN(val) ? 0 : val;
}
function getStr(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
}

function getGPS() {
    if("geolocation" in navigator) {
        logDebug("Requesting GPS...", "SYS");
        navigator.geolocation.getCurrentPosition(function(pos){
            // GPS is captured SILENTLY (no visible field on the form) but still
            // stored so logData() can include it in the private catch row.
            window.userGPSCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            logDebug("GPS Lock acquired (coords held privately for the catch row)", "SYS");
            updateActiveDateUI();
        }, function(err){
            window.userGPSCoords = null;
            logDebug("GPS Error: " + err.message, "ERR");
            updateActiveDateUI();
        });
    }
}

// ==================================================================================
// PURE FLUID DYNAMICS CORE - every helper below is a deterministic pure function
// ==================================================================================

// Buoyant lift by foam type. Bigger corky = more lift; cheater sits between 12 and 10.
var FOAM_TABLE = {
    '0':   { lift: 0.00, label: 'None' },
    '14':  { lift: 0.30, label: 'Corky - Size 14 (6mm)' },
    '12':  { lift: 0.60, label: 'Corky - Size 12 (8mm)' },
    '10':  { lift: 0.90, label: 'Corky - Size 10 (10mm)' },
    'c12': { lift: 0.70, label: 'Cheater - Size 12' }
};

function parseFoam(rawValue) {
    var key = (rawValue === undefined || rawValue === null) ? '0' : String(rawValue);
    if (key === 'c12') return { key: 'c12', size: 12, lift: FOAM_TABLE.c12.lift, label: FOAM_TABLE.c12.label };
    var size = parseFloat(key);
    if (!size) return { key: '0', size: 0, lift: 0, label: 'None' };
    var entry = FOAM_TABLE[String(size)] || { lift: 0.6 };
    return { key: String(size), size: size, lift: entry.lift, label: entry.label || ('Corky - Size ' + size) };
}

// Backwards compatible with records that only stored a numeric `corky` value.
function foamLabelFromRecord(row) {
    if (!row) return '--';
    var raw = (row.foam !== undefined && row.foam !== null) ? row.foam : row.corky;
    return parseFoam(raw).label;
}

function hookLabel(hook) {
    if (hook === -1) return '2/0';
    if (hook === 0) return '1/0';
    if (hook === 2) return 'Size 2';
    if (hook === 1) return 'Size 1';
    return 'Sz ' + hook;
}

// Heavier hooks are more anchor weight, so they subtract from the net lift.
function hookSink(hook) {
    if (hook === -1) return 0.35;   // 2/0
    if (hook === 0) return 0.28;    // 1/0
    if (hook === 1) return 0.20;    // size 1
    return 0.12;                    // size 2 (and legacy size 3)
}

// Hydraulic geometry for a PNW gravel-bed river. We only know discharge (CFS), so
// estimate mean velocity, then step down to the bed with the 1/6th power law.
function hydraulicVelocity(flow) {
    var meanVelocity = 0.25 * Math.pow(Math.max(flow, 1), 0.4);      // ft/s
    var bottomVelocity = meanVelocity * Math.pow(0.05, 1 / 6);       // 1/6th power law
    return { mean: meanVelocity, bottom: bottomVelocity };
}

// Net upward lift = foam buoyancy + yarn buoyancy - hook anchor weight - bead sink.
// beadSink is subtracted because every bead has mass; denser materials sink more.
function rigLift(foamLift, yarnInches, hook, bdMat, bdSz) {
    return Math.max(0.02, foamLift + (yarnInches * 0.15) - hookSink(hook) - beadSink(bdMat, bdSz));
}
