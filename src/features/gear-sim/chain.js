/**
 * chain.js — Unified chain solver (RK4 + shooting + air catenary).
 *
 * Single physics model for the entire drift-fishing rig from hook to rod tip.
 * Replaces cable.js, terminal.js, sinker.js with one ODE-based shooting solver.
 *
 * public: chainSolve()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */

// ── Physical constants (SI) ──────────────────────────────────────────────────
var RHO_C = 1000;          // kg/m³  — water density @ 20°C
var G_C = 9.81;            // m/s²   — standard gravity
var KAPPA_C = 0.41;        // — von Kármán constant
var CD_N_C = 1.0;          // — smooth cylinder normal drag
var CD_T_C = 0.02;         // — smooth cylinder tangential drag
var N2GF_C = 101.97;       // N → grams-force
var GF2N_C = 1 / N2GF_C;   // grams-force → N

// ── Solver tuning ───────────────────────────────────────────────────────────
var RK4_STEPS = 40;        // integration sub-steps per segment call
var SHOOT_MAX = 30;        // shooting method bisection limit
var SHOOT_TOL = 0.02;      // m — convergence tolerance on rod tip z
var SURF_EPS = 0.001;      // m — tolerance for detecting water surface

// ── Density default table (g/cm³) — fallback when tackle.json not loaded ────
var LINE_DENSITY_C = {
    braid: 1.0, mono: 1.15, copoly: 1.15, fluoro: 1.78
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a line's density in kg/m³ from the rig material + tackle library. */
function _chainLineDensity(mat, lb) {
    if (typeof tackleLineByMatLb === 'function') {
        var row = tackleLineByMatLb(mat, lb);
        if (row && row.density_g_cm3) return Number(row.density_g_cm3) * 1000;
    }
    return (LINE_DENSITY_C[mat] || 1.15) * 1000;
}

/** Resolve measured line diameter in metres. */
function _chainLineDiaM(mat, lb, dia) {
    if (dia && dia > 0) return dia * 0.001;
    if (typeof tackleLineByMatLb === 'function') {
        var row = tackleLineByMatLb(mat, lb || 12);
        if (row && row.diameter_mm) return row.diameter_mm * 0.001;
    }
    var defs = { braid: 0.32, mono: 0.33, copoly: 0.33, fluoro: 0.30 };
    return (defs[mat] || 0.33) * 0.001;
}

/** Log-law velocity at height z above bottom. z in m, returns m/s. */
function _chainVelAt(z, H, uMax, z0) {
    if (z <= 0 || z <= z0 || !uMax || uMax <= 0) return 0;
    var uStar = uMax * KAPPA_C / Math.log(H / z0);
    if (uStar <= 0) return 0;
    return (uStar / KAPPA_C) * Math.log(z / z0);
}

// ── Point element data (no closures, just static properties) ────────────────

/** Return plain element descriptor { s, label, areaM2, cd, massKg, buoyancyN }. */
function _chainElemData(rig) {
    var out = [];

    // 1. Hook at s = 0
    var hData = (typeof tackleHookData === 'function') ? tackleHookData(rig.hook) : null;
    out.push({
        s: 0, label: 'hook',
        areaM2: (hData ? hData.areaCm2 : 0.1) * 1e-4,
        cd: (hData ? hData.cd : 0.47),
        massKg: (hData ? hData.mass_g : 0.15) * 0.001,
        buoyancyN: 0
    });

    // 2. Yarn at +1 cm
    var yInches = Math.max(0, rig.yarn || 0);
    if (yInches > 0) {
        var yBuoyG = (typeof tackleYarnBuoyancyG === 'function') ? tackleYarnBuoyancyG(yInches) : 0;
        var yd = (typeof tackleYarnDragData === 'function') ? tackleYarnDragData() : { areaCm2: 1.8, cd: 0.8 };
        out.push({
            s: 0.01, label: 'yarn',
            areaM2: yd.areaCm2 * 1e-4, cd: yd.cd,
            massKg: 0, buoyancyN: yBuoyG * GF2N_C * G_C
        });
    }

    // 3. Bead at +3 cm
    var bData = (typeof tackleBeadData === 'function') ? tackleBeadData(rig.bdMat, rig.bdSz) : null;
    if (bData && rig.bdMat && rig.bdMat !== 'none' && rig.bdSz && rig.bdSz > 0) {
        out.push({
            s: 0.03, label: 'bead',
            areaM2: bData.areaCm2 * 1e-4, cd: bData.cd || 0.47,
            massKg: bData.mass_g * 0.001, buoyancyN: bData.buoyancy_g * 0.001 * G_C
        });
    }

    // 4. Corky 1 at +6 cm
    if (rig.foam && rig.foam.key && rig.foam.key !== '0') {
        var f = rig.foam;
        out.push({
            s: 0.06, label: 'corky1',
            areaM2: (f.areaCm2 || 0) * 1e-4, cd: f.cd || 0.47,
            massKg: (f.mass_g || 0) * 0.001, buoyancyN: f.net_buoyancy_g * GF2N_C * G_C
        });
    }

    // 5. Corky 2 at +10 cm
    if (rig.foam2 && rig.foam2.key && rig.foam2.key !== '0') {
        var f2 = rig.foam2;
        out.push({
            s: 0.10, label: 'corky2',
            areaM2: (f2.areaCm2 || 0) * 1e-4, cd: f2.cd || 0.47,
            massKg: (f2.mass_g || 0) * 0.001, buoyancyN: f2.net_buoyancy_g * GF2N_C * G_C
        });
    }

    // 6. Weight — placed at end of leader (sliding weight on mainline)
    var wData = (typeof tackleWeightPhysicsData === 'function')
        ? tackleWeightPhysicsData(rig.weightShape, rig.weightOz) : null;
    if (wData && rig.weightOz > 0) {
        out.push({
            s: rig.ldLen * 0.3048 + 0.05,   // just above swivel on mainline
            label: 'weight',
            areaM2: wData.areaCm2 * 1e-4, cd: wData.cd || 1.0,
            massKg: wData.submerged_mass_g * 0.001, // already Archimedes-corrected
            buoyancyN: 0
        });
    }

    out.sort(function(a, b) { return a.s - b.s; });
    return out;
}

// ── RK4 ODE system ──────────────────────────────────────────────────────────

/**
 * ODE right-hand side for an underwater line segment.
 * state = [Tx(N), Tz(N), x(m), z(m)] — z is height above river bottom.
 * Returns [dTx_ds, dTz_ds, dx_ds, dz_ds].
 */
function _chainODEs(state, dM, rhoLine, velFn) {
    var Tx = state[0], Tz = state[1];
    var z = state[3];
    var T = Math.sqrt(Tx * Tx + Tz * Tz);
    if (T < 1e-12) { T = 1e-12; Tx = T; Tz = 0; }
    var ct = Tx / T;   // cos(θ)
    var st = Tz / T;   // sin(θ)

    var V = velFn(z);
    var vr_x = V, vr_z = 0;
    var vDot = vr_x * ct + vr_z * st;
    var vn_x = vr_x - vDot * ct;
    var vn_z = vr_z - vDot * st;
    var vnMag = Math.sqrt(vn_x * vn_x + vn_z * vn_z);

    var fdT = 0.5 * RHO_C * CD_T_C * Math.PI * dM * Math.abs(vDot);
    var fdN = 0.5 * RHO_C * CD_N_C * dM * vnMag;
    var area = Math.PI * dM * dM / 4;
    var netBuo = G_C * (RHO_C - rhoLine) * area;

    var fdTx = fdT * ct + (vnMag > 1e-12 ? fdN * vn_x / vnMag : 0);
    var fdTz = fdT * st + (vnMag > 1e-12 ? fdN * vn_z / vnMag : 0);

    return [ -fdTx, -fdTz + netBuo, ct, st ];
}

/** Single RK4 step of size ds. */
function _rk4Step(state, ds, dM, rhoLine, velFn) {
    var s0 = state;
    var k1 = _chainODEs(s0, dM, rhoLine, velFn);
    var s2 = [s0[0] + 0.5*ds*k1[0], s0[1] + 0.5*ds*k1[1], s0[2] + 0.5*ds*k1[2], s0[3] + 0.5*ds*k1[3]];
    var k2 = _chainODEs(s2, dM, rhoLine, velFn);
    var s3 = [s0[0] + 0.5*ds*k2[0], s0[1] + 0.5*ds*k2[1], s0[2] + 0.5*ds*k2[2], s0[3] + 0.5*ds*k2[3]];
    var k3 = _chainODEs(s3, dM, rhoLine, velFn);
    var s4 = [s0[0] + ds*k3[0], s0[1] + ds*k3[1], s0[2] + ds*k3[2], s0[3] + ds*k3[3]];
    var k4 = _chainODEs(s4, dM, rhoLine, velFn);

    return [
        s0[0] + (ds/6)*(k1[0] + 2*k2[0] + 2*k3[0] + k4[0]),
        s0[1] + (ds/6)*(k1[1] + 2*k2[1] + 2*k3[1] + k4[1]),
        s0[2] + (ds/6)*(k1[2] + 2*k2[2] + 2*k3[2] + k4[2]),
        s0[3] + (ds/6)*(k1[3] + 2*k2[3] + 2*k3[3] + k4[3])
    ];
}

/**
 * Integrate a segment of length segLenM, sub-divided into RK4_STEPS equal steps.
 * Returns { state, arcLenUsed, surfaced }.
 * If the surface (z >= H) is crossed, state is interpolated exactly to z=H.
 */
function _integrateSeg(state0, segLenM, dM, rhoLine, velFn, H) {
    var ds = segLenM / RK4_STEPS;
    var st = state0.slice();
    var used = 0;

    for (var i = 0; i < RK4_STEPS; i++) {
        if (st[3] >= H - SURF_EPS) {
            return { state: st, arcLenUsed: used, surfaced: true };
        }
        var stNext = _rk4Step(st, ds, dM, rhoLine, velFn);
        used += ds;

        if (stNext[3] >= H) {
            var frac = (H - st[3]) / (stNext[3] - st[3]);
            if (frac > 0 && frac <= 1) {
                st = [
                    st[0] + frac * (stNext[0] - st[0]),
                    st[1] + frac * (stNext[1] - st[1]),
                    st[2] + frac * (stNext[2] - st[2]),
                    H
                ];
                used = used - ds + frac * ds;
                return { state: st, arcLenUsed: used, surfaced: true };
            }
        }
        st = stNext;
    }
    return { state: st, arcLenUsed: segLenM, surfaced: st[3] >= H - SURF_EPS };
}

// ── Air catenary ────────────────────────────────────────────────────────────

/**
 * Closed-form air catenary from water surface to rod tip.
 *
 * @param {number} Tx — horizontal tension at surface (N), constant in air
 * @param {number} Tz — vertical tension at surface (N)
 * @param {number} x0 — horizontal position at surface (m)
 * @param {number} H — water depth (m) — surface at z=H
 * @param {number} rodH — rod tip height above surface (m)
 * @param {number} dM — line diameter for air weight (m)
 * @param {number} rhoLine — line density (kg/m³)
 * @param {number} L_air — length of air segment to use (m)
 * @returns {{ xTip: number, zTip: number, ok: bool }}
 */
function _airCatenary(Tx, Tz, x0, H, rodH, dM, rhoLine, L_air) {
    var area = Math.PI * dM * dM / 4;
    var w_z = -rhoLine * G_C * area;   // N/m, negative = downward (weight in air, no buoyancy)
    if (Math.abs(w_z) < 1e-12) {
        return { xTip: x0, zTip: H + L_air, ok: true };
    }
    var absW = Math.abs(w_z);
    var absTx = Math.max(Math.abs(Tx), 1e-12);

    var arg0 = Tz / absTx;
    var arg1 = (Tz - w_z * L_air) / absTx;
    var clamp0 = Math.max(-1e6, Math.min(1e6, arg0));
    var clamp1 = Math.max(-1e6, Math.min(1e6, arg1));

    var ash0 = Math.log(clamp0 + Math.sqrt(clamp0 * clamp0 + 1));
    var ash1 = Math.log(clamp1 + Math.sqrt(clamp1 * clamp1 + 1));

    var xTip = x0 + (Tx / absW) * (ash1 - ash0);
    var sqrt0 = Math.sqrt(Tx * Tx + Tz * Tz);
    var sqrt1 = Math.sqrt(Tx * Tx + Math.pow(Tz - w_z * L_air, 2));
    var zTip = H + (1 / w_z) * (sqrt0 - sqrt1);

    return { xTip: xTip, zTip: zTip, ok: isFinite(xTip) && isFinite(zTip) };
}

// ── Element force helper ────────────────────────────────────────────────────

/** Compute drag force (N) on a point element at height z (above bottom). */
function _elemDrag(el, z, velFn) {
    var v = velFn(z);
    if (v <= 0 || el.areaM2 <= 0) return 0;
    return 0.5 * RHO_C * el.cd * el.areaM2 * v * v;
}

/** Compute net vertical force (N, positive = upward) on a point element. */
function _elemVert(el) {
    return el.buoyancyN - el.massKg * G_C;
}

// ── Main solver ─────────────────────────────────────────────────────────────

/**
 * Solve the full rig chain from hook to rod tip using a shooting method.
 *
 * @param {object} rig — from readRigFromForm()
 *   Required: ldLen, ldMat, ldLb, ldDia, mlMat, mlLb, mlDia, hook, yarn,
 *             foam, foam2, bdMat, bdSz, weightOz, weightShape
 * @param {object} env — environment
 *   depthM: water depth (m), default 2.0
 *   uMax: surface velocity (m/s), default 1.0
 *   z0: roughness length (m), default ROUGHNESS_COBBLE from hydro.js
 *   rodHeightM: rod tip above water surface (m), default 1.5
 *
 * @returns {object} {
 *   hookDepthM: number,  — hook depth below water surface (m)
 *   converged: bool,
 *   iterations: number,
 *   hookZ: number,       — hook height above bottom (m)
 *   detail: string
 * }
 */
function chainSolve(rig, env) {
    // ── 1. Rig geometry ────────────────────────────────────────────
    var ldLenM = (rig.ldLen || 4) * 0.3048;
    var mlLenM = 35;
    var totalLenM = ldLenM + mlLenM;

    // ── 2. Line properties ─────────────────────────────────────────
    var ldDiaM = _chainLineDiaM(rig.ldMat, rig.ldLb, rig.ldDia);
    var mlDiaM = _chainLineDiaM(rig.mlMat, rig.mlLb, rig.mlDia);
    var ldRho = _chainLineDensity(rig.ldMat, rig.ldLb);
    var mlRho = _chainLineDensity(rig.mlMat, rig.mlLb);

    // ── 3. Environment ─────────────────────────────────────────────
    var H = env.depthM || 2.0;
    var uMax = env.uMax || 1.0;
    var z0 = env.z0 || 0.008;
    var rodH = env.rodHeightM || 1.5;

    function velFn(z) { return _chainVelAt(z, H, uMax, z0); }

    // ── 4. Point elements ──────────────────────────────────────────
    var elems = _chainElemData(rig);
    var elemIdx = 0;

    function applyElements(state, sUsed) {
        var applied = 0;
        while (elemIdx < elems.length && sUsed >= elems[elemIdx].s - SURF_EPS) {
            var el = elems[elemIdx];
            var drag = _elemDrag(el, state[3], velFn);
            var vert = _elemVert(el);
            state[0] = state[0] - drag;
            state[1] = state[1] - vert;
            elemIdx++;
            applied++;
        }
        return applied;
    }

    // ── 5. Shooting: bisection on hook depth ───────────────────────
    var zLo = 0.01, zHi = H + 3.0;
    var best = null, bestErr = 1e9;
    var converged = false;

    for (var iter = 0; iter < SHOOT_MAX; iter++) {
        var h = (zLo + zHi) / 2;
        var hookZ = Math.max(0.01, H - h);

        // 5a. Initial tension from hook point element
        var el0 = elems[0];
        var fHookX = _elemDrag(el0, hookZ, velFn);
        var fHookZ = _elemVert(el0);
        var state = [ -fHookX, -fHookZ, 0, hookZ ];
        var sUsed = 0;
        elemIdx = 1;

        // 5b. Integration step loop
        var stepDs = 0.05;
        var surfState = null;

        while (sUsed < totalLenM - SURF_EPS) {
            var isLeader = sUsed < ldLenM;
            var dM = isLeader ? ldDiaM : mlDiaM;
            var rho = isLeader ? ldRho : mlRho;

            // Distance to next event
            var nextEvent = totalLenM;
            if (elemIdx < elems.length && elems[elemIdx].s > sUsed)
                nextEvent = Math.min(nextEvent, elems[elemIdx].s);
            if (sUsed < ldLenM)
                nextEvent = Math.min(nextEvent, ldLenM);

            var step = Math.min(stepDs, nextEvent - sUsed, totalLenM - sUsed);
            if (step <= SURF_EPS) { sUsed = nextEvent; continue; }

            var seg = _integrateSeg(state, step, dM, rho, velFn, H);
            state = seg.state;
            sUsed += seg.arcLenUsed;

            if (seg.surfaced) {
                surfState = { Tx: state[0], Tz: state[1], x: state[2], z: state[3] };
                break;
            }

            applyElements(state, sUsed);
        }

        // 5c. If never surfaced — hook too deep
        if (!surfState) { zHi = h; continue; }

        // 5d. Air catenary with remaining length
        var L_under = sUsed;
        var L_air = totalLenM - L_under;
        if (L_air <= 0.01) { zHi = h; continue; }

        var cat = _airCatenary(
            surfState.Tx, surfState.Tz, surfState.x,
            H, rodH, mlDiaM, mlRho, L_air
        );
        if (!cat.ok) { zLo = h; continue; }

        // 5e. Error: how far from target rod tip
        var err = Math.abs(cat.zTip - (H + rodH)) + 0.3 * Math.abs(cat.xTip);

        if (err < bestErr) {
            bestErr = err;
            best = {
                hookDepthM: h, hookZ: hookZ,
                converged: err < SHOOT_TOL,
                iterations: iter + 1,
                detail: 'zTip=' + cat.zTip.toFixed(2) + ' xTip=' + cat.xTip.toFixed(2) +
                    ' L_air=' + L_air.toFixed(2) + ' err=' + err.toFixed(4)
            };
        }

        if (cat.zTip < H + rodH - 0.01) zHi = h;
        else if (cat.zTip > H + rodH + 0.01) zLo = h;
        else { converged = true; break; }

        if (err < SHOOT_TOL) { converged = true; break; }
    }

    if (best) { best.converged = converged || best.converged; return best; }

    return {
        hookDepthM: H * 0.5, hookZ: H * 0.5,
        converged: false, iterations: SHOOT_MAX,
        detail: 'chain solver did not converge'
    };
}