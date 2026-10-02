/**
 * src/features/gear-sim/terminal.js — Hook + corky/yarn equilibrium.
 *
 * Terminal tackle equilibrium: the hook hangs below the corky/yarn combination
 * under net vertical force. VIV (vortex-induced vibration) model for flutter.
 *
 * public: terminalEquilibrium(), vivAmplitude(), vivFrequency()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */

var G_TERM = 9.81;             // m/s² — @provenance: standard
var STROUHAL = 0.21;           // dimensionless — circular cylinder Re 10³-10⁴
var EQUILIBRIUM_THRESHOLD_N = 0.005;  // N — @provenance: informed_estimate
var VIV_AMP_RATIO = 0.1;       // dimensionless — amplitude / diameter

/**
 * Compute the net vertical force on the terminal tackle.
 *
 *     netForce = (corkyNetBuoyancyN + yarnNetBuoyancyN) - hookWeightN
 *
 * All forces in N. Positive = upward.
 * Returns { netForceN: number, isEquilibrium: bool, corkyUpN: number,
 *           yarnUpN: number, hookDownN: number }.
 * @provenance: derived — Archimedes net buoyancy minus hook mass.
 */
function terminalEquilibrium(corkyNetBuoyancyN, yarnNetBuoyancyN, hookMassKg) {
    var cUp = corkyNetBuoyancyN || 0;
    var yUp = yarnNetBuoyancyN || 0;
    var hDown = (hookMassKg || 0) * G_TERM;
    var net = cUp + yUp - hDown;
    return {
        netForceN: net,
        isEquilibrium: Math.abs(net) < EQUILIBRIUM_THRESHOLD_N,
        corkyUpN: cUp,
        yarnUpN: yUp,
        hookDownN: hDown
    };
}

/**
 * Vortex-induced vibration frequency for a cylinder in crossflow.
 *
 *     f_viv = St · v / D
 *
 * v: flow velocity (m/s)
 * D: cylinder diameter (m) — typically hook shank or yarn diameter
 *
 * Returns frequency in Hz. 0 when v ≤ 0 or D ≤ 0.
 * @provenance: literature — Strouhal number for circular cylinders, Blevins 1990.
 * @error: ±15% — St varies with Re number.
 */
function vivFrequency(v, D) {
    if (!v || v <= 0 || !D || D <= 0) return 0;
    return STROUHAL * v / D;
}

/**
 * Vortex-induced vibration peak amplitude (peak-to-peak).
 *
 *     amp = VIV_AMP_RATIO · D
 *
 * D: cylinder diameter (m)
 *
 * Returns amplitude in m.
 * @provenance: literature — typical max amplitude ~0.1·D for circular cylinders.
 * @error: ±50% — amplitude depends on Re and mass-damping.
 */
function vivAmplitude(D) {
    if (!D || D <= 0) return 0;
    return VIV_AMP_RATIO * D;
}