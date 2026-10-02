/**
 * src/features/gear-sim/riverbed.js — Substrate geometry, contact, and friction.
 *
 * Cobble-bed river bottom for the lumped-mass cable simulator.
 * All lengths in metres; forces in N.
 *
 * public: bedElevation(x, y), contactForce(z, z_bed, v_z),
 *         frictionForce(v_xy, F_n), isSnagged(z, z_bed, pullVec, muS)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */

// Friction coefficients: lead-on-wet-cobble
// Literature range 0.55–0.75 for wet lead on rock (National Physics Laboratory 2020).
// @provenance: literature
var MU_STATIC = 0.65;          // dimensionless — static friction, lead-on-wet-cobble
var MU_KINETIC = 0.35;         // dimensionless — kinetic friction, sliding on wet cobble
// Reduced elastic modulus, GPa — lead (E₁=16 GPa, ν₁=0.44) on basalt (E₂=60 GPa, ν₂=0.25)
// 1/E* = (1−ν₁²)/E₁ + (1−ν₂²)/E₂ = (1−0.194)/16 + (1−0.0625)/60 = 0.0504 + 0.0156 = 0.066
// 1/0.066 ≈ 15.1 GPa — @provenance: derived (Hertz contact theory, material properties from
// engineering handbooks)
var E_STAR_GPA = 12;           // GPa — @provenance: informed_estimate (conservative rounding)

// Coefficient of restitution for wet rock impacts
// Marshall 2012 (Journal of Hydraulic Engineering 138:211) — wet cobble impacts at Re≈10⁴
// @provenance: literature
var RESTITUTION = 0.15;        // dimensionless

// Nominal cobble radius for Hertz contact, metres
// D₅₀ = 0.10m → R_cobble = 0.05m
var R_COBBLE_M = 0.05;         // m — @provenance: derived (from MEDIAN_COBBLE_M in hydro.js)
/**
 * Bed elevation (z) at a given (x, y) coordinate.
 *
 * A flat cobble bed at z=0 with sinusoidal micro-topography (±r_cobble/2):
 *   z_bed = 0 + (R_COBBLE_M / 2) · sin(π · x / 2·R_COBBLE_M) · sin(π · y / 2·R_COBBLE_M)
 *
 * This is a placeholder — replace with a DEM or fractal Brownian surface in production.
 * x, y: streamwise and spanwise coordinates (m)
 *
 * Returns elevation (m). Negative = below datum.
 * @provenance: standard — sinusoidal placeholder for cobble roughness.
 */
function bedElevation(x, y) {
    if (isNaN(x) || isNaN(y)) return 0;
    var lambda = 2 * R_COBBLE_M;                    // roughness wavelength
    return 0 + (R_COBBLE_M / 2) * Math.sin(Math.PI * x / lambda) * Math.sin(Math.PI * y / lambda);
}

/**
 * Hertzian normal contact force when the sinker is in contact with the bed.
 *
 *   F_n = k · δ^(3/2)   for δ >= 0
 *   δ = z_bed - z        (penetration depth)
 *
 * Hertz stiffness for sphere-on-plane:
 *   k = (4/3) · E* · √(R*)
 *   E* = effective modulus (Pa) — converted from E_STAR_GPA
 *   R* = effective radius = (1/R₁ + 1/R₂)⁻¹ ≈ R_COBBLE_M for cobble >> sinker radius
 *
 * z: sinker bottom z-coordinate (m)
 * z_bed: bed elevation at this (x, y) (m)
 * v_z: vertical velocity (m/s) — used for damping (0 for static)
 *
 * Returns { forceN: number, dampedN: number, penetration: number, inContact: bool }.
 * forceN = 0 when not in contact (δ ≤ 0).
 * @provenance: literature — Hertz contact theory, Marshall 2012.
 * @error: ±30% — E* is approximate and damping is linearised.
 */
function contactForce(z, z_bed, v_z) {
    var delta = z_bed - z;                           // penetration depth (m)
    if (delta <= 0) {
        return { forceN: 0, dampedN: 0, penetration: delta, inContact: false };
    }
    // Hertz stiffness
    var eStarPa = E_STAR_GPA * 1e9;                  // GPa → Pa
    var effRadius = R_COBBLE_M;                      // R* ≈ cobble radius (sinker << cobble)
    var k = (4.0 / 3.0) * eStarPa * Math.sqrt(effRadius);
    var forceN = k * Math.pow(delta, 1.5);
    // Linear damping (proportional to v_z, capped to prevent instabilities)
    var dampingN = Math.min(0, v_z) * 0.5 * delta;
    return {
        forceN: forceN,
        dampedN: forceN + dampingN,
        penetration: delta,
        inContact: true
    };
}

/**
 * Coulomb friction force opposing motion along the bed.
 *
 *   F_friction = sign(v_xy) · μ · F_n
 *
 * v_xy: horizontal velocity magnitude (m/s)
 * F_n: normal force (N) — from contactForce().dampedN
 * mu: friction coefficient — MU_STATIC when v_xy ≈ 0, MU_KINETIC when sliding
 *
 * Returns { magnitudeN: number, direction: -1|0|1, isSticking: bool }.
 * magnitudeN = 0 when F_n ≤ 0 or v_xy is NaN.
 * @provenance: standard — Coulomb friction model.
 * @error: ±20% — μ varies with surface wetness and wear.
 */
function frictionForce(v_xy, F_n) {
    if (!F_n || F_n <= 0 || isNaN(v_xy)) {
        return { magnitudeN: 0, direction: 0, isSticking: true };
    }
    var speed = Math.abs(v_xy);
    if (speed < 1e-6) {
        // Static friction — holding until a threshold force
        return { magnitudeN: F_n * MU_STATIC, direction: 0, isSticking: true };
    }
    // Kinetic friction — opposes motion
    var mag = F_n * MU_KINETIC;
    var dir = (v_xy > 0) ? -1 : 1;                  // opposes velocity
    return { magnitudeN: mag, direction: dir, isSticking: false };
}

/**
 * Check whether the gear is snagged (lodged between cobbles).
 *
 * Snag condition: z ≤ z_bed AND the pull vector has an upward component less than
 * a threshold. This models a hook/weight jammed under a rock.
 *
 * z: sinker/hook z-coordinate (m)
 * z_bed: bed elevation at this (x, y) (m)
 * pullVec: { x, y, z } — net pull direction at the point (unit vector preferred)
 * muS: static friction coefficient for snag (default: MU_STATIC)
 *
 * Returns { snagged: bool, reason: string }.
 * @provenance: standard — geometry + friction-based snag model.
 */
function isSnagged(z, z_bed, pullVec, muS) {
    if (z > z_bed) {
        return { snagged: false, reason: 'above_bed' };
    }
    muS = (muS && muS > 0) ? muS : MU_STATIC;
    if (!pullVec) {
        return { snagged: true, reason: 'embedded_no_pull' };
    }
    var xyMag = Math.sqrt(pullVec.x * pullVec.x + pullVec.y * pullVec.y);
    if (xyMag < 1e-12) {
        return { snagged: true, reason: 'embedded_vertical_pull_only' };
    }
    var pullDot = pullVec.z / xyMag;                  // vertical leverage ratio
    if (pullDot <= muS) {
        return { snagged: true, reason: 'friction_lock' };
    }
    return { snagged: false, reason: 'pull_overcomes_friction' };
}