import { logDebug } from '../../../shared/debug.js';
import { State } from '../../../shared/state.js';
import { hydraulicVelocity, tackleHookData, tackleBeadData, tackleYarnBuoyancyG, tackleWeightPhysicsData, tackleYarnDragData, weightTerminalVelocity } from '../inputs.js';
import { velocityAtSpot } from '../continuity.js';
import { waterTypeMultiplier } from '../water-types.js';
import { computeLiftGf, totalDragPerFt, lineDragPerFt, presentationHeightInches, CFS_TO_MS } from '../physics.js';
import { communitySonar } from '../sonar.js';
import { computeStrikeZone, whereToFish, fishOutlook } from '../zone-core.js';
import { bestZoneRig, rigChangeList, rigChangePlain, joinPlain } from '../zone-best.js';
import { driftDepth, driftEnvironment, driftLeaderShape, driftBottomState, driftCoverageScore, flowVsNormal, z0FromWaterType, detectWaterType } from '../drift-model.js';
import { chainSolve } from '../chain.js';
/**
 * src/features/gear-sim/techniques/drift.js - the DRIFT technique.
 *
 * Dead-drift presentation: cast upstream and let the rig ride the bottom on a
 * leader + lead + corky/yarn. FLOSSING IS A *STYLE* OF DRIFT (a leader-length /
 * weight-to-depth tuning), not a separate technique - same physics, same solver.
 *
 * public: DRIFT_TECHNIQUE  { id, label, waterbody_types, compute(rig, env) }
 *   env = { flow, species, dbArray, siteId }
 *   returns { velocity, dragPerFt, lift, hgt, blownOut, sonar, zone, score, suggestions }
 *
 * Determinism: drag coefficient stays LOCKED at 1.0, so identical rig + env always
 * produce identical numbers. `sanity_pass.js` pins these values as a frozen baseline.
 *
 * Classic script (global scope). Loaded BEFORE src/features/gear-sim/registry.js.
 */
export var DRIFT_TECHNIQUE = {
    id: 'drift',
    label: 'Drift',
    kind: 'river-moving-water',
    waterbody_types: ['river'],

    compute: function (rig, env) {
        const flow = env.flow;
        const dbArray = env.dbArray || [];
        const species = env.species;
        const weightOz = rig.weightOz, ldLen = rig.ldLen;
        const weightShape = rig.weightShape;
        const hook = rig.hook, yarn = rig.yarn;
        const foam = rig.foam, foam2 = rig.foam2, bdSz = rig.bdSz;
        const ldDia = rig.ldDia || 0, mlDia = rig.mlDia || 0;

        // 2. Pure-math fluid dynamics (no tuned constants) --------------------------
        let velocity = hydraulicVelocity(flow, env.siteId);
        // Use spot velocity when available (continuity-adjusts for river width at the
        // angler's location vs the gauge). Falls back to gauge velocity.
        const spotVel = (typeof velocityAtSpot === 'function')
            ? velocityAtSpot(flow, velocity.station || null) : null;
        if (spotVel && spotVel.bottom && spotVel.bottom > 0) {
            velocity = { mean: spotVel.mean, bottom: spotVel.bottom, source: velocity.source,
                station: velocity.station, spotRatio: spotVel.ratio };
        }
        let bedVel = velocity.bottom;

        // Apply water type multipliers (Phase 1.6): local hydraulic habitat adjusts
        // the Manning/continuity-corrected velocity and depth.
        const wtMultiplier = (typeof waterTypeMultiplier === 'function')
            ? waterTypeMultiplier(rig.waterType) : null;
        if (wtMultiplier && wtMultiplier.velMul !== 1.0) {
            velocity = {
                mean: velocity.mean * wtMultiplier.velMul,
                bottom: velocity.bottom * wtMultiplier.velMul,
                source: velocity.source,
                station: velocity.station,
                spotRatio: velocity.spotRatio || null
            };
            bedVel = velocity.bottom;
        }

        // Bottom contact check (Phase D2): does the weight reach the bed?
        let bottomContact = null;
        if (typeof assessBottomContact === 'function') {
            bottomContact = assessBottomContact(rig, velocity);
        }

        // Lift: read NET values from tackle.json (buoyancy_g - mass_g)
        const f1G = foam.net_buoyancy_g;
        const f2G = foam2.net_buoyancy_g;
        const hData = (typeof tackleHookData === 'function') ? tackleHookData(hook) : null;
        const hookMassG = hData ? (hData.mass_g - hData.buoyancy_g) : 0;
        const bData = (typeof tackleBeadData === 'function') ? tackleBeadData(bdSz) : null;
        const beadNetSink = bData ? bData.netSinkG : 0;
        const yG = (typeof tackleYarnBuoyancyG === 'function') ? tackleYarnBuoyancyG(yarn) : 0;
        const liftGf = computeLiftGf(f1G, f2G, hookMassG, beadNetSink, yG);

        // Drag: line + point objects (weight, corky, bead, hook, yarn, mainline)
        const wData = (typeof tackleWeightPhysicsData === 'function')
            ? tackleWeightPhysicsData(weightShape, weightOz) : null;
        const weightObj = wData ? { areaCm2: wData.areaCm2, cd: wData.cd } : null;
        const corky1Obj = { areaCm2: foam.areaCm2, cd: foam.cd };
        const corky2Obj = { areaCm2: foam2.areaCm2, cd: foam2.cd };
        const beadObj = bData ? { areaCm2: bData.areaCm2, cd: bData.cd } : null;
        const hookObj = hData ? { areaCm2: hData.areaCm2, cd: hData.cd } : null;
        // @provenance: informed_estimate — porous cylinder (5mm × 50mm), Cd=0.8
        const yarnDrag = (typeof tackleYarnDragData === 'function') ? tackleYarnDragData() : null;
        const yarnObj = yarnDrag ? { areaCm2: yarnDrag.areaCm2, cd: yarnDrag.cd } : null;

        let dragGfPerFt = totalDragPerFt(bedVel, ldDia, ldLen,
            weightObj, corky1Obj, corky2Obj, beadObj, hookObj, yarnObj);
        // @provenance: derived — mainline distributed drag (mlDia from form, mean velocity)
        if (mlDia > 0) {
            dragGfPerFt += lineDragPerFt(mlDia, velocity.mean);
        }
        let hgt = presentationHeightInches(liftGf, dragGfPerFt, ldLen);
        const fallbackHgt = hgt;  // preserve for when chain solver does not converge
        const blownOut = (bedVel > 3.5 && weightOz < 0.5);

        // 3. Where the fish are today, then score the presentation --------------------
        const sonar = communitySonar(dbArray, flow, species, env.siteId);
        const zone = computeStrikeZone(null);  // sonar paused until physics is validated
        let score = 5.0;
        if (blownOut) {
            score = 0.0;
        } else {
            if (hgt < zone.min) score -= Math.min(3.0, (zone.min - hgt) * 0.45);
            if (hgt > zone.max) score -= Math.min(3.0, (hgt - zone.max) * 0.45);
        }
        if (score < 0) score = 0;
        if (score > 5) score = 5;

        // 4. Build the suggestions: SHORT rows, one per bullet -------------------------
        // Only "what the zone is doing to you" and "what to change", and ONLY when the rig is
        // off target (an on-target rig gets no rows: the summary above the list already says
        // the line is in the band). No calibration meta-talk, no re-statement of the form.
        const suggestions = [];
        // WS-8b (a2/c/d follow-up): the search now proposes what an angler actually changes -
        // corky, second corky, hook, yarn, bead - and falls back to leader/lead only when no
        // tackle swap can reach the zone (see bestZoneRig() in zone.js).
        const best = bestZoneRig(zone, rig, velocity);

        if (blownOut) {
            // Plain words: what to DO, not what the numbers are (the ft/s and the oz still go to
            // the debug trail via solver.js).
            suggestions.push('The water is running too fast for your rig \u2014 add more weight, or fish a slower spot.');
        } else if (hgt < zone.min) {
            suggestions.push('Your rig is running low \u2014 raise it: a bigger corky, a second corky, or more yarn \u2014 or a longer leader.');
        } else if (hgt > zone.max) {
            suggestions.push('Your rig is running high \u2014 lower it: a smaller corky, drop the second corky, or less yarn \u2014 or a shorter leader.');
        }
        // ON TARGET -> NO suggestion rows at all (direct user ask, 2026-09-29): the summary
        // above the list already says the rig is where the fish are, so an "On target" row is noise.

        let plainChanges = [];
        if (best && !blownOut && score < 5.0) {
            // Plain directions only, in the order the angler would make the changes, and only
            // what actually changes. The precise list (brands, sizes, projected height) rides
            // out on `out.rigChanges` for the debug trail.
            plainChanges = (typeof rigChangePlain === 'function') ? rigChangePlain(best, rig) : [];
            if (plainChanges.length) {
                // A beginner can act on TWO changes, not five. When the full solution needs more,
                // say "closer" - the projection belongs to the WHOLE set, so claiming it for a
                // partial list would be a lie. (The full list is on out.rigChangesPlain.)
                const shown = plainChanges.slice(0, 2);
                const capped = plainChanges.length > shown.length;
                suggestions.push('Try this: ' + joinPlain(shown) + ' \u2014 ' + (capped
                    ? 'that should get you much closer.'
                    : 'that should put your rig ' + (hgt < zone.min ? 'up' : 'down') + ' where the fish are.'));
            }
        }

        // 5. The "where to fish" row (WS-8a) and the cohesive SUMMARY (restructured
        // 2026-09-29): `whereToFish` is the provenance-heavy detail for the log/return,
        // `outlook` is the plain 2-sentence summary the HUD prints under the two banners.
        // Neither is pushed into `suggestions` - where the FISH are is not "what to change" -
        // which keeps the frozen suggestion baseline untouched. `rigChanges` is the PRECISE
        // version of the plain advice (brands, sizes, projected height) for the debug trail.
        const where = (typeof whereToFish === 'function') ? whereToFish(zone, hgt) : null;
        const outlook = (typeof fishOutlook === 'function') ? fishOutlook(zone, hgt) : null;
        const precise = (best && typeof rigChangeList === 'function') ? rigChangeList(best, rig) : [];

        // ====== NEW PIPELINE (Phase 1): drift-model ======
        // Replaces the old chain solver with Manning depth fallback, slip-speed
        // drag, and 3-state bottom contact from drift-model.js.
        // Dynamic spot depth: pull from continuity.js or driftDepth().
        const siteId = env.siteId;
        const nhdData = State.nhdData;
        const depthResult = driftDepth(env.flow, siteId, nhdData);
        const driftEnv = driftEnvironment(env.flow, siteId, nhdData);

        // Apply water type depth multiplier
        let depthFt = depthResult.valueFt !== null ? depthResult.valueFt : 6.0;
        if (wtMultiplier && wtMultiplier.depthMul !== 1.0 && depthFt > 0) {
            depthFt *= wtMultiplier.depthMul;
        }
        const H = depthFt * 0.3048;

        // Override depth on driftEnv so downstream functions use corrected depth
        driftEnv.depthM = H;
        driftEnv.waterType = rig.waterType || 'run';
        if (wtMultiplier && wtMultiplier.velMul !== 1.0) {
            driftEnv.vSurfaceMs *= wtMultiplier.velMul;
            driftEnv.vBedMs *= wtMultiplier.velMul;
            driftEnv.uSurface = driftEnv.vSurfaceMs;
            // Recompute uStar with corrected velocity
            if (H > 0 && driftEnv.vSurfaceMs > 0) {
                const lnArg = H / driftEnv.z0;
                if (lnArg > 1) {
                    driftEnv.uStar = driftEnv.vSurfaceMs * 0.41 / Math.log(lnArg);
                }
            }
        }

        // Dynamic z₀ from water type (Nikora 1992: z₀ = 0.033 × 2.5 × D₅₀)
        // Prefer NHDPlus auto-detect when API data is available, fall back to
        // the user's form selection when offline or unsupported.
        const waterType = (nhdData && typeof detectWaterType === 'function')
            ? (detectWaterType(nhdData.slope, nhdData.streamorder) || rig.waterType || 'run')
            : (rig.waterType || 'run');
        const z0 = z0FromWaterType(waterType);
        driftEnv.z0 = z0;

        let hookDepthM = null, chainResult = null, chainEnv = null;
        try {
            // Use the unified chain solver (RK4 + shooting + air catenary)
            // which integrates element-by-element with the log-law velocity
            // profile — the correct physics for a leader in boundary-layer flow.
            const bedVelMs = bedVel * CFS_TO_MS;
            const meanVelMs = velocity.mean * CFS_TO_MS;
            chainEnv = {
                depthM: H,
                uMax: Math.max(meanVelMs * 1.2, bedVelMs * 1.5),
                z0: z0,
                rodHeightM: 1.5
            };
            chainResult = (typeof chainSolve === 'function')
                ? chainSolve(rig, chainEnv) : null;
            hookDepthM = chainResult && chainResult.converged ? chainResult.hookDepthM : null;
        } catch (e) {
            logDebug('Chain solver: ' + String(e.message).split('\n')[0], 'SIM');
        }
        // Override presentation height with chain solver result when converged
        if (chainResult && chainResult.converged) {
            hgt = chainResult.hookZ * 39.37;  // m → inches above bottom
        } else {
            hgt = fallbackHgt;
        }
        // Use drift-model bottom state (3-state)
        const driftContact = driftBottomState(rig, driftEnv);
        // Coverage score: 5-angle sweep weighted by position dwell time
        let coverageScore = null;
        try {
            if (typeof driftCoverageScore === 'function' && zone) {
                coverageScore = driftCoverageScore(rig, driftEnv, liftGf, dragGfPerFt, zone);
            }
        } catch (e) {
            logDebug('Coverage score: ' + String(e.message).split('\n')[0], 'SIM');
        }
        // Flow-adjusted recommendation
        let flowRec = null;
        try {
            if (typeof flowVsNormal === 'function') {
                flowRec = flowVsNormal(env.flow, nhdData);
            }
        } catch (e) {
            logDebug('Flow rec: ' + String(e.message).split('\n')[0], 'SIM');
        }
        // ====== END NEW PIPELINE ======

        return {
            velocity: velocity, dragPerFt: dragGfPerFt, lift: liftGf, hgt: hgt, blownOut: blownOut,
            sonar: sonar, zone: zone, score: score, suggestions: suggestions,
            whereToFish: where, outlook: outlook, rigChanges: precise, rigChangesPlain: plainChanges,
            hookDepthM: hookDepthM,
            chainResult: chainResult, chainEnv: chainEnv,
            driftEnv: driftEnv, driftContact: driftContact,
            depthResult: depthResult,
            coverageScore: coverageScore,
            flowRec: flowRec
        };
    }
};
