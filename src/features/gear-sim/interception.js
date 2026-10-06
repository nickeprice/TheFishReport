/**
 * src/features/gear-sim/interception.js — Flossing interception state machine.
 *
 * 4-phase Monte-Carlo simulation: DRIFT_STABILIZE → SWEEP → COLLISION → SEAT.
 * Randomises salmon position + breathing phase per run.
 *
 * public: interceptionRun(), interceptionProbability(), HOOK_SET_FORCE_N
 * ES module.
 */

var HOOK_SET_FORCE_N = 8.0;    // N — @provenance: informed_estimate (salmon jaw cartilage)
var SEAT_DISTANCE_M = 0.008;   // m — hook gap geometry @provenance: informed_estimate
var MC_RUNS = 100;             // Monte-Carlo sample count
// Hook penetration force threshold: F_pen = σ_ult·A_point ≈ 2-5 MPa · 1.3e-7 m² ≈ 0.26-0.65 N.
// Conservative value 2.0 N accounts for cartilage resistance.
// @provenance: derived — momentum-threshold sigmoid (KE = ½·m·v² exceeds work to penetrate tissue)
var HOOK_PEN_FORCE_N = 2.0;    // N

/**
 * One interception simulation run.
 *
 * Randomises the salmon's holding depth and breathing phase, then steps
 * through the 4-phase model:
 *
 *   1. DRIFT_STABILIZE   — gear settles to equilibrium below corky
 *   2. SWEEP             — gear passes through the salmon's holding zone
 *   3. COLLISION         — hook contacts the salmon (mouth open/closed)
 *   4. SEAT              — hook seats if force > HOOK_SET_FORCE_N
 *
 * hookDepthM: depth of the hook below the surface (m)
 * salmonZ: salmon holding depth (m) — if null, randomised
 * mouthOpen: whether the salmon's mouth is open — if null, randomised
 * flowMs: water velocity at the holding depth (m/s)
 * gearMassKg: effective gear mass for hook-seat momentum (kg), default 0.030
 *
 * Returns {
 *   phases: [string],         — the phases reached (up to 4)
 *   hooked: bool,              — true if the hook seated
 *   salmonZ: number,           — the holding depth used
 *   mouthOpenAtSweep: bool,    — mouth state during sweep
 *   sweepQuality: number       — 0-1 how centred the pass was
 * }.
 * @provenance: standard — geometric state machine + force threshold.
 */
export function interceptionRun(hookDepthM, salmonZ, mouthOpen, flowMs, gearMassKg) {
    if (gearMassKg === undefined) gearMassKg = 0.030;
    var phases = [];
    var hooked = false;
    var sZ = salmonZ || salmonPositionZ(0.15, 0.60);
    var t = Math.random() * 2;                     // randomise simulation time
    var phase = Math.random() * 2 * Math.PI;       // randomise breathing phase
    var mouthState = (mouthOpen !== null && mouthOpen !== undefined)
        ? mouthOpen : salmonState(t, 1.0, 0.35, phase).mouthOpen;
    var sweepQuality = 0;

    // Phase 1: Drift stabilize — hook must be near the holding depth
    if (Math.abs(hookDepthM - sZ) < 0.3) {
        phases.push('DRIFT_STABILIZE');
    } else {
        return { phases: phases, hooked: false, salmonZ: sZ,
            mouthOpenAtSweep: mouthState, sweepQuality: 0 };
    }

    // Phase 2: Sweep — gear passes through the salmon's zone
    // sweepQuality = 1 - |hookDepth - salmonZ| / maxGap
    var maxGap = 0.3;
    sweepQuality = Math.max(0, 1 - Math.abs(hookDepthM - sZ) / maxGap);
    phases.push('SWEEP');

    // Phase 3: Collision — hook enters the mouth (must be open)
    if (mouthState) {
        phases.push('COLLISION');
    } else {
        return { phases: phases, hooked: false, salmonZ: sZ,
            mouthOpenAtSweep: mouthState, sweepQuality: sweepQuality };
    }

    // Phase 4: Seat — momentum-threshold sigmoid
    // Hook seats when kinetic energy ½·m·v² exceeds work to penetrate tissue.
    // Threshold velocity v₅₀ = √(2·F_pen·d_stop / m_gear)
    // For m=0.030 kg (1 oz default), F_pen≈2 N, d_stop=0.008 m → v₅₀ ≈ 1.03 m/s
    // gearMassKg parameter overrides default; passed from weight submerged mass.
    // @provenance: derived — momentum-threshold sigmoid
    var relV = flowMs || 1.0;
    var v50 = Math.sqrt(2 * HOOK_PEN_FORCE_N * SEAT_DISTANCE_M / gearMassKg);
    var seatProb = 1 / (1 + Math.exp(-5 * (relV - v50)));
    var seats = Math.random() < seatProb;
    if (seats) {
        phases.push('SEAT');
        hooked = true;
    } else {
        phases.push('SEAT_FAILED');
    }

    return { phases: phases, hooked: hooked, salmonZ: sZ,
        mouthOpenAtSweep: mouthState, sweepQuality: sweepQuality };
}

/**
 * Run N Monte-Carlo interception simulations and return aggregate probability.
 *
 * hookDepthM: the hook depth from the cable/terminal simulation
 * flowMs: water velocity at the holding zone (m/s)
 * gearMassKg: effective gear mass for hook-seat momentum (kg), default 0.030
 *
 * Returns {
 *   probability: number,   — 0 to 1
 *   totalSweeps: number,
 *   totalCollisions: number,
 *   totalHooked: number,
 *   avgSweepQuality: number
 * }.
 * @provenance: standard — Monte-Carlo sampling.
 */
window.interceptionProbability = interceptionProbability;
export function interceptionProbability(hookDepthM, flowMs, gearMassKg) {
    if (gearMassKg === undefined) gearMassKg = 0.030;
    var sweeps = 0, collisions = 0, hooked = 0;
    var qualitySum = 0;
    for (var i = 0; i < MC_RUNS; i++) {
        var r = interceptionRun(hookDepthM, null, null, flowMs, gearMassKg);
        if (r.phases.indexOf('SWEEP') >= 0) {
            sweeps++;
            qualitySum += r.sweepQuality;
        }
        if (r.phases.indexOf('COLLISION') >= 0) collisions++;
        if (r.hooked) hooked++;
    }
    return {
        probability: sweeps > 0 ? hooked / MC_RUNS : 0,
        totalSweeps: sweeps,
        totalCollisions: collisions,
        totalHooked: hooked,
        avgSweepQuality: sweeps > 0 ? qualitySum / sweeps : 0
    };
}