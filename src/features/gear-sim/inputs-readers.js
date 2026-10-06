/**
 * src/features/gear-sim/inputs-readers.js - gear sim physics helpers + water types.
 * Splintered from inputs.js. ES module.
 */
import { parseFoam, currentStats, BASE_ZONE_MIN, BASE_ZONE_MAX, getNum, getStr } from "./inputs-constants.js";
import { logDebug } from "../../shared/debug.js";
import { State } from "../../shared/state.js";
import { GEAR_OPTIONS } from "../../shared/gear-options.js";
// tackle.js imports from inputs.js (circular) — deferred lazy import
var _tackleMod = null;
import('../../shared/tackle.js').then(function(m) { _tackleMod = m; });
// Default (Run) applies 1.0 multipliers — no change from the continuity calculation.
// ==================================================================================
export var WATER_TYPES = [
    { id: 'pool',   label: 'Pool',   depthMul: 1.2, velMul: 0.7,
      desc: 'Deep, slow water — fish hold deep and near cover.' },
    { id: 'riffle', label: 'Riffle', depthMul: 0.7, velMul: 1.3,
      desc: 'Shallow, fast water — fish hold in pockets and seams.' },
    { id: 'run',    label: 'Run',    depthMul: 1.0, velMul: 1.0,
      desc: 'Moderate depth and current — fish spread across the channel.' },
    { id: 'glide',  label: 'Glide',  depthMul: 0.9, velMul: 0.9,
      desc: 'Smooth, even flow — fish hold in tailouts and edges.' }
];
window.WATER_TYPES = WATER_TYPES;

export var DEFAULT_WATER_TYPE = 'run';
window.DEFAULT_WATER_TYPE = DEFAULT_WATER_TYPE;

export function tackleYarnBuoyancyG(inches) {
window.tackleYarnBuoyancyG = tackleYarnBuoyancyG;
    if (!inches || inches <= 0) return 0;
    var yb = -0.012;
    if (_tackleMod && typeof _tackleMod.tackleItems === 'function') {
        var yarns = _tackleMod.tackleItems('yarn');
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
export function tackleYarnDragData() {
window.tackleYarnDragData = tackleYarnDragData;
    var dflt = { areaCm2: 1.8, cd: 0.8 };
    if (!_tackleMod || typeof _tackleMod.tackleItems !== 'function') return dflt;
    var yarns = _tackleMod.tackleItems('yarn');
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
export var WATER_DENSITY_G_CM3 = 1.0; // g/cm³, fresh water — @provenance: standard
window.WATER_DENSITY_G_CM3 = WATER_DENSITY_G_CM3;
export function tackleWeightPhysicsData(shapeLabel, oz) {
window.tackleWeightPhysicsData = tackleWeightPhysicsData;
    if (!shapeLabel || !oz) return null;
    if (!_tackleMod || typeof _tackleMod.tackleWeightRow !== 'function') return null;
    var row = _tackleMod.tackleWeightRow(shapeLabel, Number(oz));
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
export var SHAPE_MIN = 0.2, SHAPE_MAX = 5.0;   // damp wild extrapolation outside the record
window.SHAPE_MIN = SHAPE_MIN;
window.SHAPE_MAX = SHAPE_MAX;

// The station the sim is currently solving for (set by the station picker).
export function getActiveStationId() {
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
export function measuredFit(siteId) {
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
export function measuredVelocity(siteId, flow) {
    var fit = measuredFit(siteId);
    if (!fit) return null;
    return fit.a * Math.pow(Math.max(flow, 1), fit.b);
}

export function hydraulicVelocity(flow, siteId) {
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
export var THERMAL_BANDS = [
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
window.THERMAL_BANDS = THERMAL_BANDS;

export function thermalOptimum(tempF) {
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

