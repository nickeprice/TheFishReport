/**
 * src/features/gear-sim/chain-shooting.js - chain solver shooting method + chainSolve.
 * Splintered from chain.js. ES module.
 */
import { _chainLineDensity, _chainLineDiaM, _chainVelAt, _chainElemData, _integrateSeg, _airCatenary, RHO_C, G_C, SURF_EPS, SHOOT_MAX } from "./chain-helpers.js";
export function _elemDrag(el, z, velFn) {
    const v = velFn(z);
    if (v <= 0 || el.areaM2 <= 0) return 0;
    return 0.5 * RHO_C * el.cd * el.areaM2 * v * v;
}

/** Compute net vertical force (N, positive = upward) on a point element. */
export function _elemVert(el) {
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
window.chainSolve = chainSolve;
export function chainSolve(rig, env) {
    // ── 1. Rig geometry ────────────────────────────────────────────
    const ldLenM = (rig.ldLen || 4) * 0.3048;
    const mlLenM = 35;             // mainline for surface-to-rod-tip connection (negligible drag)
    const totalLenM = ldLenM + mlLenM;

    // ── 2. Line properties ─────────────────────────────────────────
    const ldDiaM = _chainLineDiaM(rig.ldMat, rig.ldLb, rig.ldDia);
    const mlDiaM = _chainLineDiaM(rig.mlMat, rig.mlLb, rig.mlDia);
    const ldRho = _chainLineDensity(rig.ldMat, rig.ldLb);
    const mlRho = _chainLineDensity(rig.mlMat, rig.mlLb);

    // ── 3. Environment ─────────────────────────────────────────────
    const H = env.depthM || 2.0;
    const uMax = env.uMax || 1.0;
    const z0 = env.z0 || 0.008;
    const rodH = env.rodHeightM || 1.5;
    const zBed = 0.03;                          // roughness plane bed floor
    const shootTol = Math.max(0.02, 0.01 * H);  // depth-scaled convergence

    function velFn(z) { return _chainVelAt(z, H, uMax, z0); }

    // ── 4. Point elements ──────────────────────────────────────────
    const elems = _chainElemData(rig);
    let elemIdx = 0;

    function applyElements(state, sUsed) {
        let applied = 0;
        while (elemIdx < elems.length && sUsed >= elems[elemIdx].s - SURF_EPS) {
            const el = elems[elemIdx];
            const drag = _elemDrag(el, state[3], velFn);
            const vert = _elemVert(el);
            state[0] = state[0] - drag - (el.bottomFrictionN || 0);
            state[1] = state[1] - vert;
            elemIdx++;
            applied++;
        }
        return applied;
    }

    // ── 5. Shooting: bisection on hook depth ───────────────────────
    let zLo = Math.max(zBed, 0.01), zHi = Math.max(H - 0.05, zLo + 0.1);
    let best = null, bestErr = 1e9;
    let converged = false;

    for (let iter = 0; iter < SHOOT_MAX; iter++) {
        const h = (zLo + zHi) / 2;
        const hookZ = Math.max(Math.max(zBed, 0.01), H - h);

        // 5a. Initial tension from hook point element
        const el0 = elems[0];
        const fHookX = _elemDrag(el0, hookZ, velFn);
        const fHookZ = _elemVert(el0);
        let state = [ -fHookX, -fHookZ, 0, hookZ ];
        let sUsed = 0;
        elemIdx = 1;

        // 5b. Integration step loop
        const stepDs = 0.05;
        let surfState = null;

        while (sUsed < totalLenM - SURF_EPS) {
            const isLeader = sUsed < ldLenM;
            const dM = isLeader ? ldDiaM : mlDiaM;
            const rho = isLeader ? ldRho : mlRho;

            // Distance to next event
            let nextEvent = totalLenM;
            if (elemIdx < elems.length && elems[elemIdx].s > sUsed)
                nextEvent = Math.min(nextEvent, elems[elemIdx].s);
            if (sUsed < ldLenM)
                nextEvent = Math.min(nextEvent, ldLenM);

            const step = Math.min(stepDs, nextEvent - sUsed, totalLenM - sUsed);
            if (step <= SURF_EPS) { sUsed = nextEvent; continue; }

            const seg = _integrateSeg(state, step, dM, rho, velFn, H);
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
        const L_under = sUsed;
        const L_air = totalLenM - L_under;
        if (L_air <= 0.01) { zHi = h; continue; }

        // Minimum tension floor: even at zero flow, the rod tip and line weight
        // provide a small amount of tension (~0.01 N ≈ 1 gf) that prevents
        // the air catenary from sagging unrealistically.
        const T_surf = Math.sqrt(surfState.Tx * surfState.Tx + surfState.Tz * surfState.Tz);
        if (T_surf < 0.1) {
            const scale = 0.1 / Math.max(T_surf, 1e-12);
            surfState.Tx *= scale;
            surfState.Tz *= scale;
        }

        const cat = _airCatenary(
            surfState.Tx, surfState.Tz, surfState.x,
            H, rodH, mlDiaM, mlRho, L_air
        );
        if (!cat.ok) { zLo = h; continue; }

        // 5e. Error: how far from target rod tip
        const err = Math.abs(cat.zTip - (H + rodH)) + 0.3 * Math.abs(cat.xTip);

        if (err < bestErr) {
            bestErr = err;
            best = {
                hookDepthM: h, hookZ: hookZ,
                converged: err < shootTol,
                iterations: iter + 1,
                detail: 'zTip=' + cat.zTip.toFixed(2) + ' xTip=' + cat.xTip.toFixed(2) +
                    ' L_air=' + L_air.toFixed(2) + ' err=' + err.toFixed(4)
            };
        }

        if (cat.zTip < H + rodH - 0.01) zHi = h;
        else if (cat.zTip > H + rodH + 0.01) zLo = h;
        else { converged = true; break; }

        if (err < shootTol) { converged = true; break; }
    }

    if (best) { best.converged = converged || best.converged; return best; }

    return {
        hookDepthM: H * 0.5, hookZ: Math.max(zBed, H * 0.5),
        converged: false, iterations: SHOOT_MAX,
        detail: 'chain solver did not converge'
    };
}
