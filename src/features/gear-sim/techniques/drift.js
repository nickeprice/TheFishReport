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
        var mlMat = rig.mlMat, mlLb = rig.mlLb, hook = rig.hook, yarn = rig.yarn;
        var foam = rig.foam, foam2 = rig.foam2, bdMat = rig.bdMat, bdSz = rig.bdSz;
        // The PICKED lines' real diameters. 0 means "no brand-specific pick", and the
        // physics then resolves material+lb to the generic library row itself.
        var ldDia = rig.ldDia || 0, mlDia = rig.mlDia || 0;

        // 2. Fluid dynamics (LOCKED: drag coefficient is always 1.0) -------------------
        // Every component counts: leader diameter (sqrt lb x material), coupled
        // mainline, bead sphere + material sink, hook mass/gap, yarn skirt.
        var velocity = hydraulicVelocity(flow, env.siteId);
        var dragPerFt = totalDragPerFt(velocity.bottom, ldLb, ldMat, mlLb, mlMat, weightOz, hook, yarn, bdMat, bdSz, ldDia, mlDia);
        // Foam 1 + Foam 2 both contribute buoyancy (two corkies lift more).
        var lift = rigLift(foam.lift + foam2.lift, yarn, hook, bdMat, bdSz);
        var hgt = presentationHeightInches(lift, ldLen, dragPerFt);
        var blownOut = (velocity.bottom > 3.5 && weightOz < 0.5);

        // 3. Where the fish are today, then score the presentation --------------------
        var sonar = communitySonar(dbArray, flow, species, env.siteId);
        var zone = computeStrikeZone(sonar);
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
        // Only "what the zone is doing to you" + "what to change": no calibration
        // meta-talk, no re-statement of the form (the community data already moved the
        // zone above). An ON-TARGET rig gets a single "On target" row - a paragraph of
        // explanation is noise when there is nothing to change.
        var suggestions = [];
        var best = bestZoneRig(zone, velocity.bottom, ldLb, ldMat, mlLb, mlMat, foam.key, weightOz, ldLen, yarn, hook, bdMat, bdSz, foam2.lift);

        if (blownOut) {
            // Report the true measured ft/s when we have it, matching the HUD (the solver's
            // own scale is internal calibration units, not something to quote at an angler).
            var shownBed = (typeof velocity.trueBottom === 'number') ? velocity.trueBottom : velocity.bottom;
            suggestions.push('BLOWN OUT: bed running ' + shownBed.toFixed(1) + ' ft/s at ' + weightOz + ' oz - step up to 3/4 or 1 oz, or fish a slower seam.');
        } else if (hgt < zone.min) {
            suggestions.push('Too low at ' + hgt.toFixed(1) + '" (zone ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '") - add lift: bigger corky, more yarn, or a longer leader.');
        } else if (hgt > zone.max) {
            suggestions.push('Too high at ' + hgt.toFixed(1) + '" (zone ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '") - cut lift: smaller corky, less yarn, heavier lead, or a shorter leader.');
        } else {
            suggestions.push('On target');
        }

        if (best && !blownOut && score < 5.0) {
            suggestions.push('Try this: ' + best.foam.label + ' + ' + best.leader + ' ft leader + ' + best.weight + ' oz lead -> projects ' + best.hgt.toFixed(1) + '" of line height.');
        }

        return {
            velocity: velocity, dragPerFt: dragPerFt, lift: lift, hgt: hgt, blownOut: blownOut,
            sonar: sonar, zone: zone, score: score, suggestions: suggestions
        };
    }
};
