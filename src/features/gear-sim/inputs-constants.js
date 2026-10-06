/**
 * src/features/gear-sim/inputs-constants.js - gear sim constants + form readers.
 * Splintered from inputs.js. ES module.
 */
import { logDebug } from "../../shared/debug.js";
import { State } from "../../shared/state.js";
import { updateActiveDateUI } from "../telemetry/daynav.js";
import { GEAR_OPTIONS } from "../../shared/gear-options.js";
// Physics is pure math:  F = 0.5 * rho * Cd * A * v^2. No tuned constants, no
// reference flow, no calibration anchors. Community catches never bend
// the physics - they act as sonar that shifts WHERE the fish are (the zone).
export var currentStats = null;
window.currentStats = currentStats;

export var BASE_ZONE_MIN = 4.0;     // inches - baseline strike zone floor
window.BASE_ZONE_MIN = BASE_ZONE_MIN;
export var BASE_ZONE_MAX = 12.0;    // inches - baseline strike zone ceiling
window.BASE_ZONE_MAX = BASE_ZONE_MAX;

export function getNum(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var val = parseFloat(el.value);
    return isNaN(val) ? 0 : val;
}
window.getNum = getNum;
export function getStr(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
}
window.getStr = getStr;

export function getGPS() {
    if("geolocation" in navigator) {
        logDebug("Requesting GPS...", "SYS");
        navigator.geolocation.getCurrentPosition(function(pos){
            // GPS is captured SILENTLY (no visible field on the form) but still
            // stored so logData() can include it in the private catch row.
            State.userGPSCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            logDebug("GPS Lock acquired (coords held privately for the catch row)", "SYS");
            updateActiveDateUI();
        }, function(err){
            State.userGPSCoords = null;
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
export var FOAM_PICKER_MAP = GEAR_OPTIONS.foamMap;
window.FOAM_PICKER_MAP = FOAM_PICKER_MAP;

/**
 * Resolve a foam picker value to its tackle.json data.
 * Returns {key, size, buoyancy_g, mass_g, net_buoyancy_g, label, areaCm2, cd}
 * net_buoyancy_g = buoyancy_g - mass_g  (Archimedes net, used in computeLiftGf)
 * Falls back to {key:'0',...} for None/empty input.
 * @provenance: derived — buoyancy_g and mass_g from tackle.json
 */
export function parseFoam(rawValue) {
    var key = (rawValue === undefined || rawValue === null) ? '0' : String(rawValue);
    if (key === '0' || key === '') {
        return { key: '0', size: 0, buoyancy_g: 0, mass_g: 0, net_buoyancy_g: 0, label: 'None', areaCm2: 0, cd: 1.0 };
    }
    var tid = FOAM_PICKER_MAP[key];
    var item = tid ? (typeof tackleById === 'function' ? tackleById(tid) : null) : null;
    if (item) {
        var size = parseFloat(key);
        if (isNaN(size)) size = 0;
        var rawBuoy = item.buoyancy_g || 0;
        return {
            key: key, size: size,
            buoyancy_g: rawBuoy,
            mass_g: 0,  // PU/EPS foam mass is negligible per ASTM marine standard
            net_buoyancy_g: rawBuoy,  // no mass subtract — foam mass << water displacement
            label: item.label || ('Corky - Size ' + key),
            areaCm2: item.area_cm2 || 0,
            cd: item.cd || 0.47
        };
    }
    return { key: key, size: parseFloat(key) || 0, buoyancy_g: 0, mass_g: 0, net_buoyancy_g: 0,
        label: 'Corky - Size ' + key, areaCm2: 0, cd: 0.47 };
}

// Backwards compatible with records that only stored a numeric `corky` value.
export function foamLabelFromRecord(row) {
    if (!row) return '--';
    var raw = (row.foam !== undefined && row.foam !== null) ? row.foam : row.corky;
    return parseFoam(raw).label;
}

export function hookLabel(hook) {
    if (!hook) return '--';
    var MAP = GEAR_OPTIONS.hookIdMap;
    var tid = MAP[String(hook)];
    if (!tid) return '--';
    var item = (typeof tackleById === 'function') ? tackleById(tid) : null;
    return item ? item.label : '--';
}

// ====== TACKLE DATA LOOKUPS (from tackle.json) ======

/**
 * Resolve hook picker value to tackle.json row.
 * Returns {mass_g, areaCm2, cd} or null.
 */
export function tackleHookData(hookVal) {
    var MAP = GEAR_OPTIONS.hookIdMap;
    var key = String(hookVal);
    var tid = MAP[key];
    if (!tid) {
        var LEGACY = { '2': 'gam-oct-2', '1': 'gam-oct-1', '0': 'gam-oct-1-0', '-1': 'gam-oct-2-0' };
        tid = MAP[LEGACY[key]];
    }
    if (!tid) return null;
    var item = (typeof tackleById === 'function') ? tackleById(tid) : null;
    if (!item) return null;
    var massG = item.mass_g || 0;
    var buoyG = item.buoyancy_g || (massG / 7.85);
    return { mass_g: massG, buoyancy_g: buoyG, areaCm2: item.area_cm2 || 0, cd: item.cd || 1.05 };
}

/**
 * Resolve bead material+size to tackle.json row.
 * Returns {mass_g, buoyancy_g, areaCm2, cd, netSinkG} or null.
 * netSinkG = max(0, mass_g - buoyancy_g) - positive means bead sinks.
 */
export function tackleBeadData(bdSz) {
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

// ==================================================================================
// WATER TYPES (Phase 1.6) — local hydraulic habitat the angler is fishing.
// Each type adjusts depth and velocity relative to the gauge/spot measurement.
