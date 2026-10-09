/**
 * src/features/gear-sim/drift-model.js — drift force model replacing the old
 * catenary physics and chain solver with Manning depth fallback, slip-speed
 * drag, and 3-state bottom contact.
 *
 * public: driftDepth(), driftEnvironment(), driftSlipSpeed(),
 *         driftLeaderCatenary(), driftLeaderShape(), driftBottomState(),
 *         detectWaterType(), driftCoverageScore(),
 *         flowVsNormal()
 * ES module.
 */
import { spotDepthFt, spotNearestWidth, gaugeWidthFt, velocityAtSpot } from './continuity.js';
import { weightTerminalVelocity } from './inputs-readers.js';
import { CFS_TO_MS } from './physics.js';
import { ROUGHNESS_COBBLE } from './hydro.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const KAPPA = 0.41;                    // von Kármán — standard fluid dynamics
const MANNING_N = 0.035;              // gravel-cobble roughness — textbook
const G = 9.80665;                    // m/s²
const SECONDS_PER_HOUR = 3600;
const RHO = 998;                      // kg/m³ fresh water
const FT_TO_M = 0.3048;
const M_TO_FT = 1 / FT_TO_M;

/**
 * Get the current flow (cfs) from the app's global state.
 * Replicates getCurrentFlow() without importing it to avoid circular deps.
 */
function _currentFlow() {
    try { return Number(document.getElementById('current-flow')?.innerText?.replace(/[^0-9.]/g, '') || '0'); }
    catch (e) { return 0; }
}

// ── Manning depth fallback ────────────────────────────────────────────────────

/**
 * Estimate depth at the angler's spot using Manning's equation.
 * Falls back through 3 tiers: measured spot depth → Manning → continuity → null.
 *
 * @param {number} flow — discharge in cfs (use getCurrentFlow())
 * @param {string} siteId — USGS gauge site ID
 * @param {object|null} nhdData — NHDPlus reach data (State.nhdData)
 * @returns {{ valueFt: number|null, source: string|null, uncertainty: number|null, note: string }}
 */
export function driftDepth(flow, siteId, nhdData) {
    // Tier 1: measured spot depth from USGS field data
    const spotDepth = (typeof spotDepthFt === 'function')
        ? spotDepthFt(flow, siteId) : null;
    if (spotDepth && spotDepth.value && spotDepth.value > 0 && spotDepth.source === 'measured') {
        return {
            valueFt: spotDepth.value,
            source: 'measured',
            uncertainty: 0.10,
            note: 'USGS field measurement'
        };
    }

    const Q = (flow && flow > 0) ? flow : 1040;  // reference fallback

    // Tier 2: Manning equation  d_ft = ( n * Q / ( w * sqrt(S) ) )^(3/5)
    const w = (typeof spotNearestWidth === 'function')
        ? spotNearestWidth(siteId) : null;
    const wettedFt = (w && w.point && w.point.wetted_ft > 0) ? w.point.wetted_ft : null;
    const S = (nhdData && nhdData.slope && nhdData.slope > 0) ? nhdData.slope : null;

    if (wettedFt && S && S > 0) {
        const dFt = Math.pow(MANNING_N * Q / (wettedFt * Math.sqrt(S)), 3.0 / 5.0);
        if (dFt > 0 && isFinite(dFt)) {
            return {
                valueFt: dFt,
                source: 'manning',
                uncertainty: 0.30,
                note: 'Manning equation via spot width + NHDPlus slope'
            };
        }
    }

    // Tier 3: continuity estimate  d_ft = Q / ( w * va_MM * 0.3048 * 3600 )
    if (wettedFt && nhdData) {
        const vaKeys = ['va_MA', 'va_' + String(new Date().getMonth() + 1).padStart(2, '0')];
        let va = null;
        for (const k of vaKeys) {
            if (nhdData[k] && nhdData[k] > 0) { va = Number(nhdData[k]); break; }
        }
        if (va && va > 0) {
            const dFt = Q / (wettedFt * va * FT_TO_M * SECONDS_PER_HOUR);
            if (dFt > 0 && isFinite(dFt)) {
                return {
                    valueFt: dFt,
                    source: 'continuity_estimate',
                    uncertainty: 0.40,
                    note: 'Q / (w * va) via NHDPlus mean monthly velocity'
                };
            }
        }
    }

    // All fallbacks exhausted
    return {
        valueFt: null,
        source: null,
        uncertainty: null,
        note: 'no depth data — NHDPlus or spot width unavailable'
    };
}

// ── Environment builder ───────────────────────────────────────────────────────

/**
 * Build the drift environment object for the current flow and location.
 *
 * @param {number} flow — discharge in cfs
 * @param {string} siteId — USGS gauge site ID
 * @param {object|null} nhdData — NHDPlus reach data
 * @returns {{ depthM: number|null, uSurface: number, uStar: number, z0: number,
 *            waterType: string, vBedMs: number, vSurfaceMs: number, nhdData: object|null }}
 */
export function driftEnvironment(flow, siteId, nhdData) {
    const depthResult = driftDepth(flow, siteId, nhdData);
    const depthM = depthResult.valueFt ? depthResult.valueFt * FT_TO_M : null;

    // Surface velocity: spot velocity when available
    let vSurfaceMs = 1.0;
    let vBedMs = 0.5;
    try {
        const spotV = (typeof velocityAtSpot === 'function')
            ? velocityAtSpot(flow, siteId) : null;
        if (spotV && spotV.mean && spotV.mean > 0) {
            vSurfaceMs = spotV.mean * CFS_TO_MS;
            vBedMs = spotV.bottom ? spotV.bottom * CFS_TO_MS : vSurfaceMs * 0.4;
        }
    } catch (e) { /* fall back to defaults */ }

    // uStar from surface velocity and depth
    const z0 = ROUGHNESS_COBBLE;
    let uStar = null;
    if (depthM && depthM > 0 && vSurfaceMs > 0) {
        const lnArg = depthM / z0;
        if (lnArg > 1) {
            uStar = vSurfaceMs * KAPPA / Math.log(lnArg);
        }
    }
    if (!uStar || uStar <= 0) {
        uStar = vSurfaceMs * 0.06;
    }

    return {
        depthM: depthM,
        uSurface: vSurfaceMs,
        uStar: uStar,
        z0: z0,
        waterType: 'run',
        vBedMs: vBedMs,
        vSurfaceMs: vSurfaceMs,
        nhdData: nhdData,
        depthSource: depthResult.source,
        depthUncertainty: depthResult.uncertainty
    };
}
// ── Slip speed ─────────────────────────────────────────────────────────────────

/**
 * Water velocity at the weight's height above bed minus the drift speed.
 * The rig drifts downstream at roughly the water speed at the weight depth.
 *
 * @param {number} z — height above bed (m)
 * @param {object} env — environment from driftEnvironment()
 * @param {number} driftSpeedMs — boat/gear downstream drift speed (m/s), default 0
 * @returns {number} slip speed in m/s (>= 0)
 */
export function driftSlipSpeed(z, env, driftSpeedMs) {
    if (!env || !env.uStar || env.uStar <= 0) return 0;
    if (!z || z <= 0 || !env.z0 || env.z0 <= 0) return 0;
    if (z <= env.z0) return 0;

    const waterVelMs = (env.uStar / KAPPA) * Math.log(z / env.z0);
    if (waterVelMs <= 0) return 0;

    const drift = (driftSpeedMs && driftSpeedMs > 0) ? driftSpeedMs : 0;
    const slip = waterVelMs - drift;
    return Math.max(0, slip);
}

// ── Iterative α-corrected catenary solver ──────────────────────────────────────

/**
 * Scientific drift leader height via iterative angle-corrected catenary.
 *
 * The simple catenary formula h = (F/w)·asinh(w·L/F) assumes the leader is
 * perpendicular to the flow (sin³(α)=1). In a drift rig the leader streams
 * nearly parallel to the current. The effective drag is:
 *
 *     w_eff = w_raw · sin³(α) · (v_slip / v_bed)²
 *
 * where:
 *   α = atan(height / leaderLen)  — mean leader angle from horizontal
 *   v_slip = u(z_mid) - v_drift   — relative water velocity at mid-height
 *   w_raw = totalDragPerFt at full v_bed  — raw overestimated drag
 *
 * @param {number} liftGf — net upward buoyancy at corky (gf)
 * @param {number} rawDragGfPerFt — totalDragPerFt computed at full bedVel (gf/ft)
 * @param {number} ldLenFt — leader length (ft)
 * @param {object} env — environment from driftEnvironment()
 * @returns {number} height in inches (floored at 0, capped at leader)
 */
export function driftLeaderCatenary(liftGf, rawDragGfPerFt, ldLenFt, env) {
    if (!liftGf || liftGf <= 0.001 || !rawDragGfPerFt || rawDragGfPerFt <= 0.001 || !ldLenFt || ldLenFt <= 0) {
        return 0;  // no buoyancy → leader lies flat
    }
    const vBedMs = (env && env.vBedMs && env.vBedMs > 0) ? env.vBedMs : 0.5;
    let hFt = ldLenFt * 0.5;  // initial guess: half the leader

    for (let i = 0; i < 15; i++) {
        // 1. Mean leader angle α
        const alpha = Math.atan2(hFt, ldLenFt);
        const sinAlpha = Math.sin(alpha);
        const angleFactor = Math.pow(sinAlpha, 3);  // sin³(α) drag correction

        // 2. Slip speed at mid-height (z ≈ h/2 above bed)
        const zMidM = Math.max(env.z0 * 2, hFt * 0.3048 * 0.5);
        // v_drift ≈ 70% of bed velocity when weight drags on bottom
        const vDriftMs = vBedMs * 0.7;
        const vSlipMs = driftSlipSpeed(zMidM, env, vDriftMs);

        // 3. Velocity scaling factor: drag ∝ v²
        const velFactor = (vBedMs > 0.01 && vSlipMs > 0)
            ? Math.pow(vSlipMs / vBedMs, 2)
            : 0.01;

        // 4. Effective corrected drag
        const wEff = Math.max(0.001, rawDragGfPerFt * angleFactor * velFactor);

        // 5. New height via catenary formula
        const x = wEff * ldLenFt / Math.max(0.01, liftGf);
        const hNew = (liftGf / wEff) * Math.asinh(x);

        if (Math.abs(hNew - hFt) < 0.002) break;  // converged to ~1/40"
        hFt = Math.max(0.001, Math.min(ldLenFt, hNew));
    }
    return Math.min(hFt * 12, ldLenFt * 12);  // feet → inches, capped at leader
}

// ── Leader shape (quasi-static) ────────────────────────────────────────────────

/**
 * Quasi-static leader equilibrium shape, solved via iterative α-corrected
 * catenary (driftLeaderCatenary) that accounts for leader angle relative
 * to the flow and slip-speed velocity.
 *
 * At sweepAngle != 0 the rig is assumed fishing across current (45° left
 * or right). The effective drag area increases and the leader sweeps wider.
 *
 * @param {object} rig — rig setup (weightOz, weightShape, ldLen, ldDia, etc.)
 * @param {object} env — environment from driftEnvironment()
 * @param {number} sweepAngle — degrees from straight downstream (-45 to +45)
 * @returns {{ hookDepthM: number|null, hookZM: number|null,
 *             leaderPoints: Array, converged: boolean }}
 */
export function driftLeaderShape(rig, env, liftGf, dragGfPerFt, sweepAngle) {
    // Uses the iterative α-corrected catenary solver which accounts for
    // the leader angle relative to the flow (sin³ drag correction) and
    // slip-speed velocity (weight drifts with current, not stationary).
    const sweepRad = (sweepAngle || 0) * Math.PI / 180;
    const sinSweep = Math.sin(sweepRad);
    const ldLenFt = rig.ldLen;
    const depthM = (env && env.depthM) ? env.depthM : 2.0;

    const hInches = (typeof driftLeaderCatenary === 'function')
        ? driftLeaderCatenary(liftGf, dragGfPerFt, ldLenFt, env)
        : 12.0;  // safe fallback

    const hookZM = hInches * 0.0254;
    const hookDepthM = Math.max(0, depthM - hookZM);

    const hookZM = hInches * 0.0254;  // inches → metres
    const hookDepthM = Math.max(0, depthM - hookZM);

    const leaderPoints = [
        { x: 0, z: 0 },
        { x: ldLenFt * FT_TO_M * sinSweep, z: hookZM }
    ];

    return {
        hookDepthM: hookDepthM,
        hookZM: hookZM,
        leaderPoints: leaderPoints,
        converged: isFinite(hInches) && hInches > 0
    };
}

// ── Bottom contact state ───────────────────────────────────────────────────────

/**
 * 3-state bottom contact: dragging, bouncing, or suspended.
 * Compares the weight's terminal fall velocity against the bed-zone velocity.
 *
 * @param {object} rig — rig setup
 * @param {object} env — environment from driftEnvironment()
 * @returns {{ state: string, terminalVelMs: number|null, bedVelMs: number, note: string }}
 */
export function driftBottomState(rig, env) {
    const terminalMs = (typeof weightTerminalVelocity === 'function')
        ? weightTerminalVelocity(rig.weightOz, rig.weightShape) : null;
    const bedVelMs = (env && env.vBedMs) ? env.vBedMs : 0;

    if (!terminalMs || terminalMs <= 0) {
        return {
            state: 'suspended',
            terminalVelMs: null,
            bedVelMs: bedVelMs,
            note: 'unknown weight — cannot assess bottom contact'
        };
    }

    const ratio = terminalMs / Math.max(0.01, bedVelMs);
    let state, note;
    if (ratio > 3.0) {
        state = 'dragging';
        note = 'weight reaches and drags along the bottom (v_term >> v_bed)';
    } else if (ratio > 1.5) {
        state = 'bouncing';
        note = 'weight intermittently bounces along the bottom (v_term ~1.5-3x v_bed)';
    } else {
        state = 'suspended';
        note = 'weight suspends above the bottom (v_term too low to overcome bed velocity)';
    }

    return {
        state: state,
        terminalVelMs: terminalMs,
        bedVelMs: bedVelMs,
        note: note
    };
}

// ── Water type auto-detection ───────────────────────────────────────────────────

/**
 * Auto-detect water type from NHDPlus slope and stream order.
 * Falls back to 'run' when data is unavailable.
 *
 * @param {number|null} slope — NHDPlus channel slope
 * @param {number|null} streamorder — NHDPlus stream order
 * @returns {string} 'pool'|'riffle'|'glide'|'run'
 */
export function detectWaterType(slope, streamorder) {
    if (slope == null) return 'run';
    if (slope < 0.0008 && streamorder != null && streamorder >= 5) return 'pool';
    if (slope > 0.008) return 'riffle';
    if (slope < 0.001) return 'glide';
    return 'run';
}

// ── Sweep + coverage score ─────────────────────────────────────────────────────

/**
 * Sweep angles and their position weights (center = 3, mid = 2, edge = 1).
 */
const SWEEP_ANGLES = [-45, -22.5, 0, 22.5, 45];
const SWEEP_WEIGHTS = [1, 2, 3, 2, 1];  // edge/mid/center/mid/edge

/**
 * Run 5 quasi-static snapshots of the leader at sweep angles -45° to +45°
 * and compute the weighted coverage score.
 *
 * At each angle:
 *   1. Solve leader shape at that sweep position
 *   2. Check if hook is inside the strike zone
 *   3. Check if water type matches fish-holding position
 *
 * The score is the fraction of snapshots where the hook is in the strike zone,
 * weighted by the time spent at each position (more time at center).
 *
 * @param {object} rig — rig setup
 * @param {object} env — environment from driftEnvironment()
 * @param {object} zone — strike zone { min, max } in inches
 * @returns {{ score: number, snapshots: Array<{angle: number, inZone: bool, hookZM: number}>,
 *             waterMatch: boolean, note: string }}
 */
export function driftCoverageScore(rig, env, liftGf, dragGfPerFt, zone) {
    const snapshots = [];
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < SWEEP_ANGLES.length; i++) {
        const angle = SWEEP_ANGLES[i];
        const weight = SWEEP_WEIGHTS[i];
        const shape = driftLeaderShape(rig, env, liftGf, dragGfPerFt, angle);

        // Hook height above bottom in inches (strike zone is in inches)
        const hookInches = shape.hookZM * 39.37;
        const inZone = zone && zone.min != null && zone.max != null
            ? (hookInches >= zone.min && hookInches <= zone.max)
            : (shape.hookZM > 0);

        snapshots.push({
            angle: angle,
            inZone: inZone,
            hookZM: shape.hookZM,
            hookInches: hookInches,
            converged: shape.converged
        });

        if (inZone) weightedSum += weight;
        totalWeight += weight;
    }

    // Water type match: does the environment's water type match the rig's selected type?
    const waterMatch = env.waterType === rig.waterType || rig.waterType === 'run';

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const pct = Math.round(score * 100);

    return {
        score: score,
        pct: pct,
        snapshots: snapshots,
        waterMatch: waterMatch,
        note: pct + '% coverage' + (waterMatch ? '' : ' — water type mismatch')
    };
}

// ── Flow vs normal ─────────────────────────────────────────────────────────────

/**
 * Compare current flow against the NHDPlus 30-yr monthly normal for the current month.
 * Returns the ratio and a recommendation label.
 *
 * @param {number} currentFlow — discharge in cfs
 * @param {object|null} nhdData — NHDPlus reach data (State.nhdData)
 * @param {number} month — month number 1-12 (default: current month)
 * @returns {{ ratio: number|null, label: string, suggestion: string } | null}
 */
export function flowVsNormal(currentFlow, nhdData, month) {
    if (!currentFlow || currentFlow <= 0 || !nhdData) {
        return {
            ratio: null,
            label: 'unknown',
            suggestion: 'No flow data — use standard rig'
        };
    }
    const m = (month >= 1 && month <= 12) ? month : new Date().getMonth() + 1;
    const key = 'qa_' + String(m).padStart(2, '0');
    const normalFlow = nhdData[key] ? Number(nhdData[key]) : null;
    if (!normalFlow || normalFlow <= 0) {
        return {
            ratio: null,
            label: 'unknown',
            suggestion: 'No NHDPlus monthly normals — use standard rig'
        };
    }

    const ratio = currentFlow / normalFlow;
    let label, suggestion;

    if (ratio < 0.6) {
        label = 'very low';
        suggestion = 'Lighter weight (1 size down), +1-2 ft leader';
    } else if (ratio < 0.8) {
        label = 'low';
        suggestion = 'Consider lighter weight or longer leader';
    } else if (ratio < 1.2) {
        label = 'normal';
        suggestion = 'Standard rig';
    } else if (ratio < 2.0) {
        label = 'high';
        suggestion = 'Heavier weight (1 size up), -1 ft leader';
    } else {
        label = 'very high';
        suggestion = 'Heaviest weight, shortest leader, or wait';
    }

    return {
        ratio: Math.round(ratio * 100) / 100,
        label: label,
        suggestion: suggestion,
        currentFlow: currentFlow,
        normalFlow: normalFlow
    };
}

// ── Window shims for backward compat ───────────────────────────────────────────
window.driftDepth = driftDepth;
window.driftEnvironment = driftEnvironment;
window.driftSlipSpeed = driftSlipSpeed;
window.driftLeaderCatenary = driftLeaderCatenary;
window.driftLeaderShape = driftLeaderShape;
window.driftBottomState = driftBottomState;
window.detectWaterType = detectWaterType;
window.driftCoverageScore = driftCoverageScore;
window.flowVsNormal = flowVsNormal;