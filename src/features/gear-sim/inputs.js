/**
 * src/features/gear-sim/inputs.js - Gear Sim constants, form readers and the
 * kinematic primitives (hydraulic velocity + rig lift).
 * public: currentStats, BASE_ZONE_MIN/MAX, getNum/getStr/getGPS, FOAM_TABLE,
 *         parseFoam/hookLabel/hookSink, hydraulicVelocity(), rigLift(),
 *         getActiveStationId(), measuredFit(), measuredVelocity(),
 *         THERMAL_BANDS, thermalOptimum(tempF)
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
var REF_FLOW = 1040;         // reference discharge (CFS) the calibration is anchored to
var REF_LB_TEST = 12;        // reference leader diameter for those conditions
// Reference diameter for the MEASURED line library: generic mono 12 lb. The old
// sqrt(lb/12) proxy returned exactly 1.0 for this line, so anchoring the real
// diameters here keeps the locked reference rig where it was and only moves rigs
// whose real diameter differs from the proxy. See docs/CONTRACT_TACKLE.md.
var REF_DIAMETER_MM = 0.34;
var REF_MEAN_VELOCITY = 0.25 * Math.pow(REF_FLOW, 0.4);               // 4.024883779
var REF_BOTTOM_VELOCITY = REF_MEAN_VELOCITY * Math.pow(0.05, 1 / 6);  // 2.442952438
// Drag denominator. Taken from the SAME expression as the reference bed velocity rather than
// the old rounded 2.45, so velocityScale is exactly 1 at 1040 CFS. (Correcting that rounding
// moves the 1040 reference by +0.28%; the v^2 change itself does not move it at all.)
var REF_VELOCITY = REF_BOTTOM_VELOCITY;

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

// Buoyant lift by foam type. Bigger corky = more lift; the cheater's measured lift sits
// between the Corky 12 and the Corky 10. (The float is named "Cheater 10" for the angler -
// the picker and this label agree - while docs/tackle_measurements.csv keeps its own
// measurement row `cheater-12` with the measured egg dimensions.)
var FOAM_TABLE = {
    '0':   { lift: 0.00, label: 'None' },
    '14':  { lift: 0.30, label: 'Corky - Size 14 (6mm)' },
    '12':  { lift: 0.60, label: 'Corky - Size 12 (8mm)' },
    '10':  { lift: 0.90, label: 'Corky - Size 10 (10mm)' },
    'c12': { lift: 0.70, label: 'Cheater - Size 10' }
};

function parseFoam(rawValue) {
    var key = (rawValue === undefined || rawValue === null) ? '0' : String(rawValue);
    if (key === 'c12') return { key: 'c12', size: 10, lift: FOAM_TABLE.c12.lift, label: FOAM_TABLE.c12.label };
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
//
// MEASURED GAUGE VELOCITY (USGS field measurements)
// The 0.25 * Q^0.4 fit above is ONE coefficient for every river, and it overstates
// the Puyallup's mean velocity by ~2.3x. USGS crews already measure discharge,
// width, area and mean velocity at each gauge several times a year and publish it
// (scripts/fetch_channel_measurements.py -> src/data/channel_measurements.js).
// Fitting their measurements gives v = a * Q^b with b ~0.47 at EVERY gauge but `a`
// differing 3.4x between rivers: the SHAPE is near-universal, the LEVEL is per-river.
//
// So we take the measured SHAPE for the active gauge and ANCHOR it to the locked
// reference, which leaves DRAG_REF and the strike-zone calibration intact:
//     shape(Q) = v_measured(Q) / v_measured(REF_FLOW)      shape(REF_FLOW) === 1
// Only the RESPONSE to discharge changes. Values stay in the model's calibration
// units (they are NOT raw ft/s), so the reference rig is byte-identical.
// No measured curve for a station -> the estimate above, exactly as before.
var SHAPE_MIN = 0.2, SHAPE_MAX = 5.0;   // damp wild extrapolation outside the record

// The station the sim is currently solving for (set by the station picker).
function getActiveStationId() {
    try {
        var raw = localStorage.getItem('active_station');
        if (raw) {
            var st = JSON.parse(raw);
            if (st && st.id) return String(st.id);
        }
    } catch (e) {}
    return null;
}

// Published hydraulic-geometry curve for a gauge: {a, b} or null when unmeasured.
function measuredFit(siteId) {
    if (!siteId || typeof window === 'undefined') return null;
    var all = window.CHANNEL_MEASUREMENTS;
    if (!all || !all.sites) return null;
    var site = all.sites[String(siteId)];
    if (!site || !site.fit) return null;
    var a = Number(site.fit.a), b = Number(site.fit.b);
    return (a > 0 && b > 0)
        ? { a: a, b: b, n: site.n || 0, thin: !!site.thin_recent }
        : null;
}

// v = a * Q^b (ft/s) measured at that gauge, or null.
function measuredVelocity(siteId, flow) {
    var fit = measuredFit(siteId);
    if (!fit) return null;
    return fit.a * Math.pow(Math.max(flow, 1), fit.b);
}

function hydraulicVelocity(flow, siteId) {
    var meanVelocity = 0.25 * Math.pow(Math.max(flow, 1), 0.4);      // ft/s
    var bottomVelocity = meanVelocity * Math.pow(0.05, 1 / 6);       // 1/6th power law
    var out = { mean: meanVelocity, bottom: bottomVelocity, source: 'estimate' };

    var here = measuredVelocity(siteId, flow);
    var ref = measuredVelocity(siteId, REF_FLOW);
    var fit = measuredFit(siteId);
    if (here && ref && fit) {
        var shape = here / ref;
        if (shape >= SHAPE_MIN && shape <= SHAPE_MAX) {
            // Internal (calibration) scale: the drag/strike-zone math reads these, anchored
            // so the reference rig is unchanged. NOT raw ft/s.
            out.mean = REF_MEAN_VELOCITY * shape;
            out.bottom = REF_BOTTOM_VELOCITY * shape;
            out.source = 'measured';
            out.station = String(siteId);
            out.samples = fit.n;
            out.thinRecent = fit.thin;
            // TRUE measured velocity at the gauge (ft/s). Display-only: honest numbers for
            // the angler, kept separate from the calibration scale above so showing truth
            // can never silently move the physics.
            out.trueMean = here;
            out.trueBottom = here * Math.pow(0.05, 1 / 6);
        }
    }
    return out;
}

// Net upward lift = foam buoyancy + yarn buoyancy - hook anchor weight - bead sink.
// beadSink is subtracted because every bead has mass; denser materials sink more.
function rigLift(foamLift, yarnInches, hook, bdMat, bdSz) {
    return Math.max(0.02, foamLift + (yarnInches * 0.15) - hookSink(hook) - beadSink(bdMat, bdSz));
}

// ==================================================================================
// THERMAL OPTIMUM (WS-8a)
// Water temperature sets metabolism, and metabolism sets how high a salmonid will
// hold. The old rule was ONE line - ">= 55F and they rise" - and it had the physics
// backwards once past the comfort band: a fish above its optimum does not climb, it
// slides DEEPER looking for the coldest, most oxygenated water it can find (which is
// why warm-water fish stack in the deep tail of a pool). This is the published
// comfort band for Oncorhynchus/steelhead reduced to the ONE number the zone model
// needs: a shift in inches. Pure function of temperature - no report, no DOM.
// Bands (deg F): <45 torpid | 45-50 cool | 50-60 optimal | 60-65 warming | >65 stress.
// 65 itself reads as WARMING; stress starts above it.
// ==================================================================================
var THERMAL_BANDS = [
    { band: 'torpid',  range: 'under 45', shift: -1.50, label: 'below the feed window',
      note: 'fish sit tight to the bottom and rarely move.' },
    { band: 'cool',    range: '45-50',    shift: -0.75, label: 'cold but feeding',
      note: 'fish hold low and feed slowly.' },
    { band: 'optimal', range: '50-60',    shift:  0.75, label: 'prime metabolic range',
      note: 'fish hold and feed up in the column.' },
    { band: 'warming', range: '60-65',    shift: -1.00, label: 'above the optimum',
      note: 'fish slide to the coolest, fastest water - riffle tailouts and deep pool tails.' },
    { band: 'stress',  range: 'over 65',  shift: -2.00, label: 'thermal stress',
      note: 'fish stack in the deepest, most oxygenated pockets.' }
];

function thermalOptimum(tempF) {
    if (tempF === null || tempF === undefined || isNaN(tempF)) return null;
    var t = Number(tempF);
    var b;
    if (t < 45) b = THERMAL_BANDS[0];
    else if (t < 50) b = THERMAL_BANDS[1];
    else if (t < 60) b = THERMAL_BANDS[2];
    else if (t <= 65) b = THERMAL_BANDS[3];
    else b = THERMAL_BANDS[4];
    return { band: b.band, range: b.range, shift: b.shift, label: b.label, note: b.note, tempF: t };
}
