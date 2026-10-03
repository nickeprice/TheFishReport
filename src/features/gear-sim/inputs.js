/**
 * src/features/gear-sim/inputs.js - Gear Sim constants, form readers and
 * kinematic primitives (hydraulic velocity in true ft/s).
 * public: currentStats, BASE_ZONE_MIN/MAX, getNum/getStr/getGPS,
 *         parseFoam/hookLabel, hydraulicVelocity(), getActiveStationId(),
 *         measuredFit(), measuredVelocity(),
 *         tackleFoamById, tackleHookData, tackleBeadData, tackleYarnBuoyancyG,
 *         tackleWeightPhysicsData,
 *         WATER_DENSITY_G_CM3,
 *         THERMAL_BANDS, thermalOptimum(tempF)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- GEAR SIM: DETERMINISTIC FLUID DYNAMICS ENGINE ---
// Pure boundary-layer physics. Every output is a pure function of the form inputs plus
// the stored catch log, so identical inputs always return identical numbers.
// Physics is pure math:  F = 0.5 * rho * Cd * A * v^2. No tuned constants, no
// reference flow, no calibration anchors. Community catches never bend
// the physics - they act as sonar that shifts WHERE the fish are (the zone).
var currentStats = null;

var BASE_ZONE_MIN = 4.0;     // inches - baseline strike zone floor
var BASE_ZONE_MAX = 12.0;    // inches - baseline strike zone ceiling

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
// Picker value -> tackle.json id mapping for foam types.
var FOAM_PICKER_MAP = GEAR_OPTIONS.foamMap;

/**
 * Resolve a foam picker value to its tackle.json data.
 * Returns {key, size, buoyancy_g, mass_g, net_buoyancy_g, label, areaCm2, cd}
 * net_buoyancy_g = buoyancy_g - mass_g  (Archimedes net, used in computeLiftGf)
 * Falls back to {key:'0',...} for None/empty input.
 * @provenance: derived — buoyancy_g and mass_g from tackle.json
 */
function parseFoam(rawValue) {
    var key = (rawValue === undefined || rawValue === null) ? '0' : String(rawValue);
    if (key === '0' || key === '') {
        return { key: '0', size: 0, buoyancy_g: 0, mass_g: 0, net_buoyancy_g: 0, label: 'None', areaCm2: 0, cd: 1.0 };
    }
    var tid = FOAM_PICKER_MAP[key];
    var item = tid ? (typeof tackleById === 'function' ? tackleById(tid) : null) : null;
    if (item) {
        var size = (key === 'c12') ? 10 : parseFloat(key);
        var rawBuoy = item.buoyancy_g || 0;
        var mass = item.mass_g || 0;
        return {
            key: key, size: size,
            buoyancy_g: rawBuoy,
            mass_g: mass,
            net_buoyancy_g: Math.max(0, rawBuoy - mass),  // corky's own mass subtracted
            label: item.label || ('Corky - Size ' + key),
            areaCm2: item.area_cm2 || 0,
            cd: item.cd || 0.47
        };
    }
    return { key: key, size: parseFloat(key) || 0, buoyancy_g: 0, mass_g: 0, net_buoyancy_g: 0,
        label: 'Corky - Size ' + key, areaCm2: 0, cd: 0.47 };
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

// ====== TACKLE DATA LOOKUPS (from tackle.json) ======

/**
 * Resolve hook picker value to tackle.json row.
 * Returns {mass_g, areaCm2, cd} or null.
 */
function tackleHookData(hookVal) {
    var MAP = GEAR_OPTIONS.hookIdMap;
    var tid = MAP[String(hookVal)];
    if (!tid) return null;
    var item = (typeof tackleById === 'function') ? tackleById(tid) : null;
    if (!item) return null;
    var massG = item.mass_g || 0;
    return { mass_g: massG, buoyancy_g: massG / 7.85, areaCm2: item.area_cm2 || 0, cd: item.cd || 0.47 };
}

/**
 * Resolve bead material+size to tackle.json row.
 * Returns {mass_g, buoyancy_g, areaCm2, cd, netSinkG} or null.
 * netSinkG = max(0, mass_g - buoyancy_g) - positive means bead sinks.
 */
function tackleBeadData(bdSz) {
    if (!bdSz) return null;
    var beads = (typeof tackleItems === 'function') ? tackleItems('bead') : [];
    for (var i = 0; i < beads.length; i++) {
        if (Math.abs(Number(beads[i].diameter_mm) - Number(bdSz)) < 0.01) {
            var b = beads[i];
            var massG = b.mass_g || 0, buoyG = b.buoyancy_g || 0;
            return { mass_g: massG, buoyancy_g: buoyG, netSinkG: Math.max(0, massG - buoyG),
                areaCm2: b.area_cm2 || 0, cd: b.cd || 0.47 };
        }
    }
    return null;
}

/**
 * Yarn buoyancy in grams-force per inch, from tackle.json.
 * Saturated egg-yarn is slightly NEGATIVE (sinks ~0.012 gf/in).
 * @provenance: informed_estimate — acrylic ρ≈1.17, packing≈15%, tuft d≈5mm, V≈0.50 cm³/in
 * @value: -0.012 gf/in
 * @error: ±0.012 gf/in (±100%)
 * @measure: user soaks 10" yarn 5 min, weighs wet vs dry → saturated_mass_per_inch → replace
 */
function tackleYarnBuoyancyG(inches) {
    if (!inches || inches <= 0) return 0;
    var yb = -0.012;
    if (typeof tackleItems === 'function') {
        var yarns = tackleItems('yarn');
        if (yarns && yarns.length > 0 && yarns[0].buoyancy_per_inch_g !== undefined) {
            yb = Number(yarns[0].buoyancy_per_inch_g);
        }
    }
    return inches * yb;  // negative = sinks
}

/**
 * Yarn form drag data from tackle.json.
 * Returns {areaCm2, cd} or default informed estimate.
 * @provenance: informed_estimate — porous cylinder (5mm × 50mm tuft), effective area ≈0.7×solid
 * @value: area_cm²=1.8, cd=0.8
 * @error: area ±0.5 cm² (±28%), cd ±0.2 (±25%)
 * @measure: caliper tuft diameter at 5 points → mean_d, area_cm² = π × mean_d × length_cm
 */
function tackleYarnDragData() {
    var dflt = { areaCm2: 1.8, cd: 0.8 };
    if (typeof tackleItems !== 'function') return dflt;
    var yarns = tackleItems('yarn');
    if (!yarns || yarns.length === 0) return dflt;
    var y = yarns[0];
    if (y.area_cm2 && y.cd) {
        return { areaCm2: Number(y.area_cm2), cd: Number(y.cd) };
    }
    return dflt;
}

/**
 * Weight physics data from tackle.json.
 * Returns {areaCm2, cd, mass_g, submerged_mass_g} or null.
 * submerged_mass_g is the Archimedes-corrected mass in water (mass_g minus
 * buoyancy from displaced water). Falls back to mass_g when density is
 * unavailable (e.g. PENDING measurement rows).
 * @provenance: derived — Archimedes F_b = rho_water * g * V
 */
var WATER_DENSITY_G_CM3 = 1.0; // g/cm³, fresh water — @provenance: standard
function tackleWeightPhysicsData(shapeLabel, oz) {
    if (!shapeLabel || !oz) return null;
    if (typeof tackleWeightRow !== 'function') return null;
    var row = tackleWeightRow(shapeLabel, Number(oz));
    if (!row) return null;
    var mass_g = Number(row.mass_g) || 0;
    var density = row.density_g_cm3 ? Number(row.density_g_cm3) : 11.34;
    var submerged_mass_g = mass_g;
    if (density > 0) {
        submerged_mass_g = mass_g * (1 - WATER_DENSITY_G_CM3 / density);
        if (submerged_mass_g < 0) submerged_mass_g = 0;
    }
    return { areaCm2: Number(row.area_cm2) || 0, cd: Number(row.cd) || 1.0, mass_g: mass_g, submerged_mass_g: submerged_mass_g, density_g_cm3: density };
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
    var meanEstimate = 0.25 * Math.pow(Math.max(flow, 1), 0.4);      // ft/s power-law estimate
    var bottomEstimate = meanEstimate * Math.pow(0.05, 1 / 6);       // ft/s at bed
    var out = { mean: meanEstimate, bottom: bottomEstimate, source: 'estimate' };

    var here = measuredVelocity(siteId, flow);
    var fit = measuredFit(siteId);
    if (here && here > 0 && fit) {
        out.mean = here;                           // true ft/s from gauge
        out.bottom = here * Math.pow(0.05, 1 / 6); // true ft/s at bed
        out.source = 'measured';
        out.station = String(siteId);
        out.samples = fit.n;
        out.thinRecent = fit.thin;
    }
    return out;
}

// ==================================================================================
// THERMAL OPTIMUM (WS-8a)
// Water temperature sets how active a fish is, and where it will sit. The old rule was ONE
// line - ">= 55F and they rise" - and it had the physics backwards once past the comfort
// band: a fish above its optimum does not climb, it slides DEEPER looking for the coldest,
// most oxygenated water it can find (which is why warm-water fish stack in the deep tail of
// a pool). This is the comfort band for Oncorhynchus/steelhead reduced to the ONE number the
// zone model needs: a shift in inches. Pure function of temperature - no report, no DOM.
//
// WORDING: an adult salmon in the river is NOT feeding - it is staging, and a fly gets taken
// out of reaction/territory. So no band says "feeding"; they say hold/hold high/respond.
// Bands (deg F): <45 torpid | 45-50 cool | 50-64 optimal | 64-68 delay | 68-70 stress |
// 70-71.6 block | over 71.6 lethal. 68 itself reads as DELAY; stress starts above it.
// 68F = 20C is the measured onset of thermal stress, with 18-20C (64-68F) the delay zone -
// Keefer et al. 2018 (PLoS ONE 13:e0204274), Goniea et al. 2006 and Salinger & Anderson 2006
// (both TAFS). The TOP end is the WRIA 9 / King County block: 21-22C (69.8-71.6F) is a
// "temperature related blockage to migration" and 22C+ is lethal (kcr1532 2004, kcr2880 2015;
// docs/LITERATURE.md S8). All three top bands share shift -2.00, so the frozen baselines do
// NOT move - a deeper refuge shift is a deliberate future contract bump, not this change.
// ==================================================================================
var THERMAL_BANDS = [
    { band: 'torpid',  range: 'under 45', shift: -1.50, label: 'too cold to be active',
      note: 'fish sit tight to the bottom and rarely move.' },
    { band: 'cool',    range: '45-50',    shift: -0.75, label: 'cool but catchable',
      note: 'fish hold low and respond slowly.' },
    { band: 'optimal', range: '50-64',    shift:  0.75, label: 'prime range',
      note: 'fish hold high in the column and take a fly.' },
    { band: 'delay',   range: '64-68',    shift: -1.00, label: 'thermal delay',
      note: 'fish slide to the coolest, fastest water - riffle tailouts and deep pool tails.' },
    { band: 'stress',  range: '68-70',    shift: -2.00, label: 'thermal stress',
      note: 'fish stack in the deepest, most oxygenated pockets.' },
    { band: 'block',   range: '70-71.6',  shift: -2.00, label: 'migration block',
      note: 'past the 21C blockage threshold - upstream movement stops and fish hold in refuge.' },
    { band: 'lethal',  range: 'over 71.6', shift: -2.00, label: 'lethal range',
      note: 'at/above 22C - lethal to adults; they sit in the coldest water they can find.' }
];

function thermalOptimum(tempF) {
    if (tempF === null || tempF === undefined || isNaN(tempF)) return null;
    var t = Number(tempF);
    var b;
    if (t < 45) b = THERMAL_BANDS[0];
    else if (t < 50) b = THERMAL_BANDS[1];
    else if (t < 64) b = THERMAL_BANDS[2];
    else if (t <= 68) b = THERMAL_BANDS[3];
    else if (t < 70) b = THERMAL_BANDS[4];
    else if (t < 71.6) b = THERMAL_BANDS[5];
    else b = THERMAL_BANDS[6];
    return { band: b.band, range: b.range, shift: b.shift, label: b.label, note: b.note, tempF: t };
}
