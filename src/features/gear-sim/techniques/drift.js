/**
 * src/features/gear-sim/techniques/drift.js - the DRIFT technique.
 *
 * Dead-drift presentation: cast upstream and let the rig ride the bottom on a
 * leader + lead + corky/yarn. FLOSSING IS A *STYLE* OF DRIFT (a leader-length /
 * weight-to-depth tuning), not a separate technique - same physics, same solver.
 *
 * public: DRIFT_TECHNIQUE  { id, label, waterbody_types, compute(rig, env) }
 *   env = { flow, species, dbArray }
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
        var rodFt = rig.rodFt;

        // 2. Fluid dynamics (LOCKED: drag coefficient is always 1.0) -------------------
        // Every component counts: leader diameter (sqrt lb x material), coupled
        // mainline, bead sphere + material sink, hook mass/gap, yarn skirt.
        var velocity = hydraulicVelocity(flow);
        var dragPerFt = totalDragPerFt(velocity.bottom, ldLb, ldMat, mlLb, mlMat, weightOz, hook, yarn, bdMat, bdSz);
        // Foam 1 + Foam 2 both contribute buoyancy (two corkies lift more).
        var lift = rigLift(foam.lift + foam2.lift, yarn, hook, bdMat, bdSz);
        var hgt = presentationHeightInches(lift, ldLen, dragPerFt);
        var blownOut = (velocity.bottom > 3.5 && weightOz < 0.5);

        // 3. Where the fish are today, then score the presentation --------------------
        var sonar = communitySonar(dbArray, flow, species);
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

        // 4. Build the suggestions: what to change to get into the zone ---------------
        // Rig Adjustments only: your current state + the exact gear to tie on. No
        // calibration meta-talk - the community data already moved the zone above.
        var suggestions = [];
        var best = bestZoneRig(zone, velocity.bottom, ldLb, ldMat, mlLb, mlMat, foam.key, weightOz, ldLen, yarn, hook, bdMat, bdSz, foam2.lift);

        if (blownOut) {
            suggestions.push('BLOWN OUT: the bed is running ' + velocity.bottom.toFixed(1) + ' ft/s with only ' + weightOz + ' oz of lead. Step up to 3/4 oz or 1 oz, or fish a slower seam.');
        } else if (hgt < zone.min) {
            var lowWhy = (sonar && sonar.center !== null && sonar.center > (zone.min + zone.max) / 2)
                ? 'Weather and recent catches show fish holding higher in the column'
                : 'Fish are holding off the bottom';
            suggestions.push('Presentation pinned at ' + hgt.toFixed(1) + '" (zone ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"). ' + lowWhy + '. Add buoyancy: bigger Corky, more yarn, or a longer leader.');
        } else if (hgt > zone.max) {
            var highWhy = (sonar && sonar.center !== null && sonar.center < (zone.min + zone.max) / 2)
                ? 'Weather and recent catches show fish pinned tight to the bottom'
                : 'Fish are holding tight to the bottom';
            suggestions.push('Floating over fish at ' + hgt.toFixed(1) + '" (zone ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"). ' + highWhy + '. Cut lift: smaller Corky, less yarn, heavier lead, or a shorter leader.');
        } else {
            suggestions.push('On target: ' + hgt.toFixed(1) + '" sits inside today\'s ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '" strike zone.');
        }

        if (best && !blownOut && score < 5.0) {
            suggestions.push('Try this: ' + best.foam.label + ' + ' + best.leader + ' ft leader + ' + best.weight + ' oz lead -> projects ' + best.hgt.toFixed(1) + '" of line height.');
        }
        if (species && species !== 'None') {
            suggestions.push('Targeting ' + species + ' at ' + flow + ' CFS on a ' + formatRodLength(rodFt) + ' rod with a ' + ldMat + ' ' + ldLb + 'lb leader.');
        }

        return {
            velocity: velocity, dragPerFt: dragPerFt, lift: lift, hgt: hgt, blownOut: blownOut,
            sonar: sonar, zone: zone, score: score, suggestions: suggestions
        };
    }
};
