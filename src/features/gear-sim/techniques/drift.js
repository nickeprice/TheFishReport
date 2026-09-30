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
        // The picked weight TYPE. Drives the leader drag through the weight's measured
        // area, so shape/density finally matter (a slinky parachutes, tungsten cuts).
        var weightShape = rig.weightShape;
        var mlMat = rig.mlMat, mlLb = rig.mlLb, hook = rig.hook, yarn = rig.yarn;
        var foam = rig.foam, foam2 = rig.foam2, bdMat = rig.bdMat, bdSz = rig.bdSz;
        // The PICKED lines' real diameters. 0 means "no brand-specific pick", and the
        // physics then resolves material+lb to the generic library row itself.
        var ldDia = rig.ldDia || 0, mlDia = rig.mlDia || 0;

        // 2. Fluid dynamics (LOCKED: drag coefficient is always 1.0) -------------------
        // Every component counts: leader diameter (sqrt lb x material), coupled
        // mainline, bead sphere + material sink, hook mass/gap, yarn skirt.
        var velocity = hydraulicVelocity(flow, env.siteId);
        var dragPerFt = totalDragPerFt(velocity.bottom, ldLb, ldMat, mlLb, mlMat, weightOz, hook, yarn, bdMat, bdSz, ldDia, mlDia, weightShape);
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

        return {
            velocity: velocity, dragPerFt: dragPerFt, lift: lift, hgt: hgt, blownOut: blownOut,
            sonar: sonar, zone: zone, score: score, suggestions: suggestions,
            whereToFish: where, outlook: outlook, rigChanges: precise, rigChangesPlain: plainChanges
        };
    }
};
