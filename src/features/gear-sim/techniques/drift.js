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
        // Only "what the zone is doing to you" and "what to change", and ONLY when the rig is
        // off target (an on-target rig gets no rows: the summary above the list already says
        // the line is in the band). No calibration meta-talk, no re-statement of the form.
        var suggestions = [];
        // WS-8b (a2/c/d follow-up): the search now proposes what an angler actually changes -
        // corky, second corky, hook, yarn, bead - and falls back to leader/lead only when no
        // tackle swap can reach the zone (see bestZoneRig() in zone.js).
        var best = bestZoneRig(zone, rig, velocity);

        if (blownOut) {
            // Report the true measured ft/s when we have it, matching the HUD (the solver's
            // own scale is internal calibration units, not something to quote at an angler).
            var shownBed = (typeof velocity.trueBottom === 'number') ? velocity.trueBottom : velocity.bottom;
            suggestions.push('BLOWN OUT: bed running ' + shownBed.toFixed(1) + ' ft/s at ' + weightOz + ' oz - step up to 3/4 or 1 oz, or fish a slower seam.');
        } else if (hgt < zone.min) {
            suggestions.push('Too low at ' + hgt.toFixed(1) + '" (zone ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '") - change the corky first: bigger corky, or a second corky, then more yarn, a smaller bead, a smaller hook - or a longer leader / less lead.');
        } else if (hgt > zone.max) {
            suggestions.push('Too high at ' + hgt.toFixed(1) + '" (zone ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '") - change the corky first: smaller corky, or drop the second corky, then less yarn, a bigger bead, a bigger hook - or a shorter leader / more lead.');
        }
        // ON TARGET -> NO suggestion rows at all (direct user ask, 2026-09-29): the summary
        // above the list already says the line is in the band, so an "On target" row is noise.

        if (best && !blownOut && score < 5.0) {
            // Name ONLY what changes, in the order the angler would make the changes.
            var changes = (typeof rigChangeList === 'function') ? rigChangeList(best, rig) : [];
            if (changes.length) {
                suggestions.push('Try this: ' + changes.join(', ') + ' -> projects ' + best.hgt.toFixed(1) + '" of line height.');
            }
        }

        // 5. The "where to fish" row (WS-8a) and the cohesive SUMMARY (restructured
        // 2026-09-29): `whereToFish` is the provenance-heavy detail for the log/return,
        // `outlook` is the one paragraph the HUD prints under the two banners. Neither is
        // pushed into `suggestions` - where the FISH are is not "what to change" - which
        // keeps the frozen suggestion baseline untouched.
        var where = (typeof whereToFish === 'function') ? whereToFish(zone, hgt) : null;
        var outlook = (typeof fishOutlook === 'function') ? fishOutlook(zone, hgt) : null;

        return {
            velocity: velocity, dragPerFt: dragPerFt, lift: lift, hgt: hgt, blownOut: blownOut,
            sonar: sonar, zone: zone, score: score, suggestions: suggestions,
            whereToFish: where, outlook: outlook
        };
    }
};
