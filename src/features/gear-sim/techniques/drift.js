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
var DRIFT_TECHNIQUE = {
    id: 'drift',
    label: 'Drift',
    kind: 'river-moving-water',
    waterbody_types: ['river'],

    compute: function (rig, env) {
        var flow = env.flow;
        var dbArray = env.dbArray || [];
        var species = env.species;
        var weightOz = rig.weightOz, ldLen = rig.ldLen, ldMat = rig.ldMat, ldLb = rig.ldLb;
        var weightShape = rig.weightShape;
        var mlMat = rig.mlMat, mlLb = rig.mlLb, hook = rig.hook, yarn = rig.yarn;
        var foam = rig.foam, foam2 = rig.foam2, bdSz = rig.bdSz;
        var ldDia = rig.ldDia || 0, mlDia = rig.mlDia || 0;

        // 2. Pure-math fluid dynamics (no tuned constants) --------------------------
        var velocity = hydraulicVelocity(flow, env.siteId);
        // Use spot velocity when available (continuity-adjusts for river width at the
        // angler's location vs the gauge). Falls back to gauge velocity.
        var spotVel = (typeof velocityAtSpot === 'function')
            ? velocityAtSpot(flow, velocity.station || null) : null;
        if (spotVel && spotVel.bottom && spotVel.bottom > 0) {
            velocity = { mean: spotVel.mean, bottom: spotVel.bottom, source: velocity.source,
                station: velocity.station, spotRatio: spotVel.ratio };
        }
        var bedVel = velocity.bottom;

        // Lift: read NET values from tackle.json (buoyancy_g - mass_g)
        var f1G = foam.net_buoyancy_g;
        var f2G = foam2.net_buoyancy_g;
        var hData = (typeof tackleHookData === 'function') ? tackleHookData(hook) : null;
        var hookMassG = hData ? (hData.mass_g - hData.buoyancy_g) : 0;
        var bData = (typeof tackleBeadData === 'function') ? tackleBeadData(bdSz) : null;
        var beadNetSink = bData ? bData.netSinkG : 0;
        var yG = (typeof tackleYarnBuoyancyG === 'function') ? tackleYarnBuoyancyG(yarn) : 0;
        var liftGf = computeLiftGf(f1G, f2G, hookMassG, beadNetSink, yG);

        // Drag: line + point objects (weight, corky, bead, hook, yarn, mainline)
        var wData = (typeof tackleWeightPhysicsData === 'function')
            ? tackleWeightPhysicsData(weightShape, weightOz) : null;
        var weightObj = wData ? { areaCm2: wData.areaCm2, cd: wData.cd } : null;
        // Gear mass (submerged) for hook-seat momentum calculation in kg
        var gearMassKg = wData ? wData.submerged_mass_g / 1000 : 0.030;
        var corky1Obj = { areaCm2: foam.areaCm2, cd: foam.cd };
        var corky2Obj = { areaCm2: foam2.areaCm2, cd: foam2.cd };
        var beadObj = bData ? { areaCm2: bData.areaCm2, cd: bData.cd } : null;
        var hookObj = hData ? { areaCm2: hData.areaCm2, cd: hData.cd } : null;
        // @provenance: informed_estimate — porous cylinder (5mm × 50mm), Cd=0.8
        var yarnDrag = (typeof tackleYarnDragData === 'function') ? tackleYarnDragData() : null;
        var yarnObj = yarnDrag ? { areaCm2: yarnDrag.areaCm2, cd: yarnDrag.cd } : null;

        var dragGfPerFt = totalDragPerFt(bedVel, ldDia, ldLen,
            weightObj, corky1Obj, corky2Obj, beadObj, hookObj, yarnObj);
        // @provenance: derived — mainline distributed drag (mlDia from form, mean velocity)
        if (mlDia > 0) {
            dragGfPerFt += lineDragPerFt(mlDia, velocity.mean);
        }
        var hgt = presentationHeightInches(liftGf, dragGfPerFt, ldLen);
        var blownOut = (bedVel > 3.5 && weightOz < 0.5);

        // 3. Where the fish are today, then score the presentation --------------------
        var sonar = communitySonar(dbArray, flow, species, env.siteId);
        var zone = computeStrikeZone(null);  // sonar paused until physics is validated
        var score = 5.0;
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
        var suggestions = [];
        // WS-8b (a2/c/d follow-up): the search now proposes what an angler actually changes -
        // corky, second corky, hook, yarn, bead - and falls back to leader/lead only when no
        // tackle swap can reach the zone (see bestZoneRig() in zone.js).
        var best = bestZoneRig(zone, rig, velocity);

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

        var plainChanges = [];
        if (best && !blownOut && score < 5.0) {
            // Plain directions only, in the order the angler would make the changes, and only
            // what actually changes. The precise list (brands, sizes, projected height) rides
            // out on `out.rigChanges` for the debug trail.
            plainChanges = (typeof rigChangePlain === 'function') ? rigChangePlain(best, rig) : [];
            if (plainChanges.length) {
                // A beginner can act on TWO changes, not five. When the full solution needs more,
                // say "closer" - the projection belongs to the WHOLE set, so claiming it for a
                // partial list would be a lie. (The full list is on out.rigChangesPlain.)
                var shown = plainChanges.slice(0, 2);
                var capped = plainChanges.length > shown.length;
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
        var where = (typeof whereToFish === 'function') ? whereToFish(zone, hgt) : null;
        var outlook = (typeof fishOutlook === 'function') ? fishOutlook(zone, hgt) : null;
        var precise = (best && typeof rigChangeList === 'function') ? rigChangeList(best, rig) : [];

        // ====== NEW PIPELINE (Phase 8): chain solver ======
        // Use the unified chain solver (RK4 + shooting + air catenary)
        // which replaces cable.js, terminal.js, and sinker.js with one ODE.
        var hookDepthM = null, interceptionProb = 0, sweepQuality = 0, salmonDepthM = null;
        try {
            if (typeof chainSolve === 'function') {
                var bedVelMs = bedVel * CFS_TO_MS;
                var meanVelMs = velocity.mean * CFS_TO_MS;
                var chainEnv = {
                    depthM: 2.0,
                    uMax: Math.max(meanVelMs * 1.2, bedVelMs * 1.5),
                    z0: ROUGHNESS_COBBLE,
                    rodHeightM: 1.5
                };
                var chainResult = chainSolve(rig, chainEnv);
                hookDepthM = chainResult.hookDepthM;

                if (typeof interceptionProbability === 'function') {
                    var ip = interceptionProbability(hookDepthM, bedVelMs, gearMassKg);
                    interceptionProb = ip.probability;
                    sweepQuality = ip.avgSweepQuality;
                }
                if (typeof salmonPositionZ === 'function')
                    salmonDepthM = salmonPositionZ();
            }
        } catch (e) {
            if (typeof logDebug === 'function')
                logDebug('Chain solver: ' + String(e.message).split('\n')[0], 'SIM');
        }
        // ====== END NEW PIPELINE ======

        return {
            velocity: velocity, dragPerFt: dragGfPerFt, lift: liftGf, hgt: hgt, blownOut: blownOut,
            sonar: sonar, zone: zone, score: score, suggestions: suggestions,
            whereToFish: where, outlook: outlook, rigChanges: precise, rigChangesPlain: plainChanges,
            hookDepthM: hookDepthM, interceptionProb: interceptionProb,
            sweepQuality: sweepQuality, salmonDepthM: salmonDepthM
        };
    }
};
