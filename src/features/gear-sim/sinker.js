/**
 * src/features/gear-sim/sinker.js — Bouncing sinker dynamics.
 *
 * Single-point-mass sinker with gravity, buoyancy, form drag, Coulomb
 * friction, and bed contact bouncing.
 *
 * public: sinkerForceBalance(), sinkerBounceStep(), SINKER_DENSITY_LEAD
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */

var G_SINKER = 9.81;           // m/s² — @provenance: standard
var RHO_SINKER = 1000;         // kg/m³ — @provenance: standard (matching hydro.js)
var SINKER_DENSITY_LEAD = 11340;  // kg/m³ — @provenance: literature
var CD_SINKER = 1.0;           // dimensionless — cylinder at Re≈8000 @provenance: literature

/**
 * Solve for the terminal sinker velocity from the force balance:
 *
 *     F_net = weight − buoyancy − drag_sign · ½·ρ·Cd·A·v²
 *
 * The drag force brackets v so the equilibrium is:
 *     v_term = sign(F_net) · √(2 · |F_net| / (ρ · Cd · A))
 *
 * massKg: sinker mass (kg)
 * areaM2: projected area (m²)
 * cd: drag coefficient (use CD_SINKER if unknown)
 * vWater: ambient water velocity (m/s) — positive downstream
 * F_bed: net vertical bed contact force (N, positive upward) — 0 when free
 *
 * Returns { vTermMS: number, netForceN: number, Re: number }.
 * vTermMS = 0 when no net driving force.
 * @provenance: standard — force balance, quadratic drag.
 */
function sinkerForceBalance(massKg, areaM2, cd, vWater, F_bed) {
    if (!massKg || massKg <= 0) return { vTermMS: 0, netForceN: 0, Re: 0 };
    cd = (cd && cd > 0) ? cd : CD_SINKER;
    var vol = massKg / SINKER_DENSITY_LEAD;
    var buoyancyN = RHO_SINKER * G_SINKER * vol;
    var weightN = massKg * G_SINKER;
    var netN = weightN - buoyancyN - (F_bed || 0);  // positive = downward
    if (Math.abs(netN) < 1e-12) return { vTermMS: 0, netForceN: 0, Re: 0 };

    var halfDrag = 0.5 * RHO_SINKER * cd * (areaM2 > 0 ? areaM2 : 1e-6);
    var vSq = Math.abs(netN) / halfDrag;
    var vTerm = Math.sqrt(vSq);

    // The sinker moves in the direction of net force; drag acts opposite to motion.
    // Relative to water: v_sink_rel = v_term in direction of netN
    // If netN > 0 (sinking), v_term is downward; if netN < 0 (buoyant), v_term is upward.
    vTerm = (netN > 0) ? vTerm : -vTerm;
    vTerm += vWater;  // add ambient water velocity

    // Reynolds number based on equivalent sphere diameter
    var equivDiam = Math.pow(6 * vol / Math.PI, 1/3);
    var vRel = Math.abs(vTerm - vWater);
    var Re = (vRel * equivDiam) / 1e-6;

    return { vTermMS: vTerm, netForceN: netN, Re: Re };
}

/**
 * One time step of a bouncing sinker on the riverbed.
 *
 * Integrates the sinker's vertical motion with bed collision.
 * When z <= z_bed + r_cobble, apply contact force and restitution.
 *
 * z, vz: current vertical position (m) and velocity (m/s)
 * massKg: sinker mass (kg)
 * areaM2: projected area (m²)
 * cd: drag coefficient
 * dt: time step (s)
 * vWater: water velocity (m/s) at the sinker height
 * z_bed: bed elevation (m)
 * r_cobble: cobble radius (m) — defaults to 0.05
 *
 * Returns { z: number, vz: number, onBed: bool }.
 * @provenance: standard — Euler integration with Hertz/bouncing.
 */
function sinkerBounceStep(z, vz, massKg, areaM2, cd, dt, vWater, z_bed, r_cobble) {
    if (!massKg || massKg <= 0 || !dt || dt <= 0) return { z: z, vz: 0, onBed: false };
    var r_c = r_cobble || 0.05;
    var bedTop = z_bed + r_c;

    // Force balance at current state
    var fb = sinkerForceBalance(massKg, areaM2, cd, vWater, 0);
    var accel = fb.netForceN / massKg;  // m/s²

    // Integrate
    var zNew = z + vz * dt + 0.5 * accel * dt * dt;
    var vzNew = vz + accel * dt;

    // Bed collision
    if (zNew <= bedTop) {
        // Penalty-based contact: push sinker above bed + bounce
        var overlap = bedTop - zNew;
        zNew = bedTop + overlap * 0.5;  // push back
        vzNew = -vzNew * RESTITUTION;   // bounce (RESTITUTION from riverbed.js)
        return { z: zNew, vz: vzNew, onBed: true };
    }

    return { z: zNew, vz: vzNew, onBed: false };
}