/**
 * src/features/gear-sim/physics.js - component drag/sink model + presentation
 * height. Drag coefficient is LOCKED at 1.0: dragCoeff stays 1.0 by default.
 * Every output is a pure function of its arguments (deterministic physics).
 * public: lineDiameterScale, beadDrag/beadSink, hookDrag, yarnDrag,
 *         mainlineDragPerFt, leaderDragPerFt, totalDragPerFt,
 *         presentationHeightInches
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- COMPONENT PHYSICS: every tackle item maps to area (drag) and volume (lift/sink).
// Line diameter grows with the square root of lb test (strength ~ cross-section
// area, diameter ~ sqrt(area)), times a material factor: fluoro runs thinner than
// mono/copoly at the same lb test, braid far thinner still. So 15lb fluoro drags
// slightly MORE than 12lb mono (thicker in absolute terms), exactly as on the water.
// Line diameter: the MEASURED diameter from the tackle library when it is loaded
// (src/data/tackle.json, 110 lines), normalised against the reference line so the
// scale stays dimensionless and anchored at exactly 1.0 for the locked reference
// rig. Falls back to the old sqrt(lb)/material-factor proxy for a line the library
// does not cover, or before the library has loaded (offline first run).
var LINE_DIA_FACTOR = { mono: 1.0, copoly: 0.95, fluoro: 0.88, braid: 0.50 };

function lineDiameterScale(lbTest, mat) {
    if (typeof tackleLineByMatLb === 'function') {
        var line = tackleLineByMatLb(mat || 'mono', lbTest);
        if (line && line.diameter_mm) return line.diameter_mm / REF_DIAMETER_MM;
    }
    var f = LINE_DIA_FACTOR[mat] || 1.0;             // proxy fallback
    return Math.sqrt(Math.max(lbTest, 1) / REF_LB_TEST) * f;
}

// Bead: a sphere. Cross-section (drag) scales with radius^2, volume (sink) with
// radius^3 times material density. Calibrated so a 4mm hard bead matches the
// legacy 0.08 drag units; an 8mm then pulls ~4x harder, as a sphere must.
// bdMat comes straight from the #bd-mat dropdown: 'hard' (plastic) or 'soft'.
// Soft (lower density) sinks less but its skirt wobbles and catches more water.
var BEAD_DENSITY = { hard: 1.0, soft: 0.55 };

function beadDrag(bdMat, bdSz) {
    if (!bdMat || bdMat === 'none' || !bdSz) return 0;
    var flexFactor = (bdMat === 'soft') ? 1.15 : 1.0;
    return 0.005 * bdSz * bdSz * flexFactor;
}

function beadSink(bdMat, bdSz) {
    if (!bdMat || bdMat === 'none' || !bdSz) return 0;
    var density = BEAD_DENSITY[bdMat] || 1.0;
    return 0.0004 * bdSz * bdSz * bdSz * density;
}

// Hook: solid wire, so mass (sink) dominates; the gap/eye adds a small point drag.
// hookSink() above already orders mass 2/0 > 1/0 > 1 > 2.
var HOOK_DRAG = { '2': 0.02, '1': 0.03, '0': 0.04, '-1': 0.05 };

function hookDrag(hook) {
    return HOOK_DRAG[String(hook)] || 0.02;
}

// Yarn skirt: mostly lift, but the fibers catch water too.
function yarnDrag(yarnInches) {
    return Math.max(0, yarnInches) * 0.02;
}

// Mainline rides upstream of the sliding weight; only a fraction of its drag
// couples through into the leader system. Braid cuts water, mono sails.
var MAINLINE_COUPLING = 0.25;

function mainlineDragPerFt(bottomVelocity, mlLb, mlMat) {
    if (!mlLb) return 0;
    // Drag goes as v^2 (F = 1/2 rho Cd A v^2), not linearly. Anchored so the scale is
    // exactly 1 at the reference flow, so the reference rig is unchanged and only the
    // RESPONSE to discharge moves.
    var velocityScale = Math.pow(bottomVelocity / REF_VELOCITY, 2);
    return DRAG_REF * velocityScale * lineDiameterScale(mlLb, mlMat || 'braid') * MAINLINE_COUPLING;
}

// Hydrodynamic drag per foot of leader. Scales with bed velocity, true line
// diameter (sqrt of lb test x material factor) and how hard the lead pins the
// leader down. Heavier lead sweeps the leader flatter, so height falls.
function leaderDragPerFt(bottomVelocity, lbTest, weightOz, dragCoeff, ldMat) {
    var velocityScale = Math.pow(bottomVelocity / REF_VELOCITY, 2);   // v^2, see mainlineDragPerFt
    var diameterScale = lineDiameterScale(lbTest, ldMat || 'copoly');
    var anchorScale = 0.7 + (0.6 * weightOz);   // heavier lead sweeps the leader flatter
    var drag = DRAG_REF * velocityScale * diameterScale * anchorScale * dragCoeff;
    return Math.max(0.05, drag);
}

// Total system drag in equivalent per-foot units: leader + coupled mainline +
// bead sphere + hook gap + yarn skirt. Used by runSim, the solver, and sonar
// alike so all three always agree.
function totalDragPerFt(bottomVelocity, ldLb, ldMat, mlLb, mlMat, weightOz, hook, yarnInches, bdMat, bdSz) {
    return leaderDragPerFt(bottomVelocity, ldLb, weightOz, 1.0, ldMat)
        + mainlineDragPerFt(bottomVelocity, mlLb, mlMat)
        + beadDrag(bdMat, bdSz) + hookDrag(hook) + yarnDrag(yarnInches);
}

// Catenary rise of a flexible leader: uniform downstream drag (w per ft) acting on a
// line that carries a point lift (F) at the tag end.
//   h = (F / w) * asinh(w * L / F)
// Limits check out: h -> 0 as drag dominates, h -> L as drag vanishes, and h <= L always.
function presentationHeightInches(lift, leaderFt, dragPerFt) {
    if (leaderFt <= 0 || lift <= 0 || dragPerFt <= 0) return 0;
    var x = (dragPerFt * leaderFt) / lift;
    var riseFt = (lift / dragPerFt) * Math.asinh(x);
    if (!isFinite(riseFt) || riseFt < 0) return 0;
    return Math.min(riseFt * 12, leaderFt * 12);
}

// ==================================================================================
// COMMUNITY SONAR - physics stays LOCKED at drag coefficient 1.0; community catches
// shift WHERE the fish are (the strike zone), never how water works. Each logged
// catch is run through the pure physics engine to find the line height that fish
// bit at; the average becomes the community center, blended with the weather zone.
// ==================================================================================