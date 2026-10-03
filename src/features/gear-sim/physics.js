/**
 * src/features/gear-sim/physics.js - pure-math drag/lift physics.
 *
 * Drag:  F = 0.5 * rho * Cd * A * v^2
 * Lift:  F = buoyancy_g - mass_g  (from tackle.json measured/estimated values)
 *
 * No tuned constants, no reference rig, no calibration anchors.
 * Every value comes from tackle.json or standard physics constants.
 *
 * public: lineDragPerFt(), lineNetBuoyancyPerFt(), pointDragGf(), totalDragPerFt(), computeLiftGf(),
 *         presentationHeightInches()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */

// Physical constants (standard fluid properties, never tuned)
var RHO_WATER = 998;       // kg/m^3, fresh water at 20degC
var G = 9.81;              // m/s^2
var N_TO_GF = 101.97;      // 1 N = 101.97 grams-force
var CFS_TO_MS = 0.3048;    // ft/s -> m/s

// Drag coefficient for a smooth cylinder in crossflow at Re ~ 200-1000
// (the regime of fishing line in a river). Flat at ~1.0 across this range.
var CD_LINE = 1.0;


// ====== DRAG ======

/**
 * Drag of a 1-foot segment of leader line at broadside to the flow.
 *   w_gf_per_ft = 0.5 * RHO_WATER * CD_LINE * (diam_m * 0.3048) * v_m/s^2 * N_TO_GF
 * Returns grams-force per foot of leader.
 * Floored at 0.001 gf/ft to prevent degenerate catenary behaviour.
 */
function lineDragPerFt(diameterMm, velocityFtS) {
    if (!diameterMm || diameterMm <= 0 || !velocityFtS || velocityFtS <= 0) return 0.001;
    var dM = diameterMm * 0.001;               // mm -> m
    var areaPerFtM2 = dM * 0.3048;             // m^2 - 1 ft broadside projection
    var vMs = velocityFtS * CFS_TO_MS;          // ft/s -> m/s
    var forceN = 0.5 * RHO_WATER * CD_LINE * areaPerFtM2 * vMs * vMs;
    return Math.max(0.001, forceN * N_TO_GF);
}

/**
 * Net buoyancy (Archimedes lift) of a 1-foot segment of line.
 *   F_gf_per_ft = (rho_water - rho_line) * g * volume_per_ft * N_TO_GF
 * Positive = line floats (braid ≈ 0). Negative = line sinks (mono, fluoro).
 * density_g_cm3: the line's density (tackle.json density_g_cm3), e.g. 1.15 for mono
 * diameterMm: the line's measured diameter in mm
 * Returns grams-force per foot. Negative value means the line sinks.
 * @provenance: derived — Archimedes net buoyancy = displaced water weight - line weight per ft
 */
function lineNetBuoyancyPerFt(density_g_cm3, diameterMm) {
    if (!diameterMm || diameterMm <= 0 || !density_g_cm3 || density_g_cm3 <= 0) return 0;
    var dM = diameterMm * 0.001;                 // mm -> m
    var volPerFtM3 = Math.PI * (dM / 2) * (dM / 2) * 0.3048;  // m^3 per foot
    var rhoLine = density_g_cm3 * 1000;          // g/cm^3 -> kg/m^3
    var netForceN = (RHO_WATER - rhoLine) * G * volPerFtM3;
    return netForceN * N_TO_GF;                  // gf per ft (positive = buoyant)
}

/**
 * Drag of any point object (weight, bead, corky, hook, yarn) in grams-force.
 *   F_gf = 0.5 * RHO_WATER * cd * area_m^2 * v_m/s^2 * N_TO_GF
 * areaCm2: projected (broadside) area in cm^2
 * cd: drag coefficient (from tackle.json or standard value)
 * velocityFtS: water velocity in ft/s
 */
function pointDragGf(areaCm2, cd, velocityFtS) {
    if (!areaCm2 || areaCm2 <= 0 || !cd || cd <= 0 || !velocityFtS || velocityFtS <= 0) return 0;
    var areaM2 = areaCm2 * 1e-4;               // cm^2 -> m^2
    var vMs = velocityFtS * CFS_TO_MS;
    return 0.5 * RHO_WATER * cd * areaM2 * vMs * vMs * N_TO_GF;
}

/**
 * Total equivalent distributed drag per foot for the catenary equation.
 * The leader line produces distributed drag (lineDragPerFt).
 * Point objects (weight, corky/foam, bead, hook, yarn) produce concentrated drag
 * that is converted to an equivalent distributed term by dividing by leader length.
 *
 * velocityFtS: water velocity at the bed in ft/s
 * leaderDiaMm: leader line diameter in mm
 * leaderLenFt: leader length in ft
 * Objects: each {areaCm2: number, cd: number} - omit or null/0 to skip
 */
function totalDragPerFt(velocityFtS, leaderDiaMm, leaderLenFt,
                        weight, corky1, corky2, bead, hook, yarn) {
    if (!leaderLenFt || leaderLenFt <= 0) return 0.001;
    var w = lineDragPerFt(leaderDiaMm, velocityFtS);
    function spread(obj) {
        if (!obj || !obj.areaCm2 || obj.areaCm2 <= 0) return;
        w += pointDragGf(obj.areaCm2, obj.cd || 1.0, velocityFtS) / leaderLenFt;
    }
    spread(weight);
    spread(corky1);
    spread(corky2);
    spread(bead);
    spread(hook);
    spread(yarn);
    return Math.max(0.001, w);
}


// ====== LIFT ======

/**
 * Net upward lift in grams-force.
 *   lift = corky1_net + corky2_net + yarn_net
 *          - hook_mass - bead_net_sink
 * All values from tackle.json.
 * corky1/2 NET = buoyancy_g - mass_g  (raw buoyancy minus corky mass)
 * beadNetSinkG: max(0, bead.mass_g - bead.buoyancy_g) - positive = sink force
 * @provenance: derived — Archimedes net buoyancy = ρ·V − m per item in tackle.json
 * Floored at 0.01 gf to prevent degenerate catenary behaviour.
 */
function computeLiftGf(corky1NetG, corky2NetG, hookMassG, beadNetSinkG, yarnBuoyancyG) {
    return Math.max(0.01,
        (corky1NetG || 0) + (corky2NetG || 0) + (yarnBuoyancyG || 0)
        - (hookMassG || 0) - (beadNetSinkG || 0));
}


// ====== CATENARY ======

/**
 * Catenary rise of a flexible leader:
 *   h = (F / w) * asinh(w * L / F)
 *
 * F = point lift at the corky tag end (grams-force)
 * w = uniform distributed drag per unit length (gf/ft)
 * L = leader length (ft)
 *
 * Limits:
 *   w -> inf  =>  h -> 0      (leader swept flat)
 *   w -> 0    =>  h -> L      (leader stands straight up)
 *   h never exceeds leader length
 *
 * Returns height in inches.
 */
function presentationHeightInches(liftGf, dragGfPerFt, leaderFt) {
    if (leaderFt <= 0 || dragGfPerFt <= 0) return 0;
    var l = Math.max(0.01, liftGf);   // prevent /0
    var x = (dragGfPerFt * leaderFt) / l;
    var riseFt = (l / dragGfPerFt) * Math.asinh(x);
    if (!isFinite(riseFt) || riseFt < 0) return 0;
    return Math.min(riseFt * 12, leaderFt * 12);
}
