/**
 * src/features/gear-sim/sim.js - runSim(): solve the rig against the live report.
 * Reads the form, pulls community sonar, runs the locked-Cd physics, scores the
 * presentation against the strike zone, and writes currentStats for the catch log.
 * public: runSim()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 * NOTE: still ~155 lines (one large function) — split further in a follow-up.
 */
async function runSim() {
    var simBtn = document.getElementById('btn-sim');

    // No defaults: every gear field must be chosen before the solver can run.
    var missing = missingRigFields();
    if (missing.length) {
        showToast('Fill in: ' + missing.join(', '), 'warn', 6000);
        return;
    }

    if (simBtn) { simBtn.innerText = 'CALCULATING...'; simBtn.disabled = true; }

    // 1. Read the rig off the form -------------------------------------------------
    var flow = getCurrentFlow();          // derived from the live water report
    var weightOz = getNum('weight');
    var rodFt = getRodLengthFt();
    var ldLen = getNum('ld-len');
    var ldMat = getStr('ld-mat');
    var ldLb = getNum('ld-lb') || REF_LB_TEST;
    var mlMat = getStr('ml-mat');
    var mlLb = getNum('ml-lb');
    var hookRaw = parseFloat(getStr('hook'));
    var hook = isNaN(hookRaw) ? 2 : hookRaw;        // 0 = 1/0, -1 = 2/0
    var yarn = getNum('yarn');
    var foam = parseFoam(getStr('foam'));           // Foam 1
    var foam2 = parseFoam(getStr('foam2'));         // Foam 2 (second corky)
    var bdMat = getStr('bd-mat');
    var bdSz = getNum('bd-sz');
    var species = getStr('species');

    // Community sonar: anonymised full tackle telemetry from every angler who has
    // logged a catch at this flow and species. Physics stays locked - this data only
    // moves the strike zone toward where fish are actually feeding. Falls back to
    // the local buffer offline.
    var dbArray = [];
    if (typeof Supa !== 'undefined') {
        try { dbArray = await Supa.fetchGlobalCalibration(flow, species); } catch (e) { dbArray = []; }
    }
    if (!dbArray.length) {
        try {
            var jStr = localStorage.getItem('catch_db');
            dbArray = jStr ? JSON.parse(jStr) : [];
        } catch (e) { dbArray = []; }
    }

    // 2. Fluid dynamics (LOCKED: drag coefficient is always 1.0) -----------------------
    // Every component counts: leader diameter (sqrt lb x material), coupled
    // mainline, bead sphere + material sink, hook mass/gap, yarn skirt.
    var velocity = hydraulicVelocity(flow);
    var dragPerFt = totalDragPerFt(velocity.bottom, ldLb, ldMat, mlLb, mlMat, weightOz, hook, yarn, bdMat, bdSz);
    // Foam 1 + Foam 2 both contribute buoyancy (two corkies lift more).
    var lift = rigLift(foam.lift + foam2.lift, yarn, hook, bdMat, bdSz);
    var hgt = presentationHeightInches(lift, ldLen, dragPerFt);
    var blownOut = (velocity.bottom > 3.5 && weightOz < 0.5);

    // 3. Where the fish are today, then score the presentation ------------------------
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

    // 4. Build the suggestions: what to change to get into the zone -------------------
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
// 5. Paint the HUD ---------------------------------------------------------------
    currentStats = {
        flow: flow,
        rodFt: rodFt,
        weight: weightOz,
        ldLen: ldLen,
        ldMat: ldMat,
        ldLb: ldLb,
        mlMat: mlMat,
        mlLb: mlLb,
        hook: hook,
        yarn: yarn,
        foam: foam.key,
        foam2: foam2.key,
        bdMat: bdMat,
        bdSz: bdSz,
        hgt: hgt,
        zoneMin: zone.min,
        zoneMax: zone.max,
        score: score,
        bottomVelocity: velocity.bottom,
        meanVelocity: velocity.mean,
        dragCoeff: 1.0,
        blownOut: blownOut
    };
    saveRig();

    var color = 'var(--accent-green)';
    if (score < 4.0) color = 'var(--accent-yellow)';
    if (score < 2.5) color = 'var(--accent-red)';

    var eHgt = document.getElementById('hud-hgt');
    eHgt.innerText = hgt.toFixed(1) + '"';
    eHgt.style.color = color;

    var eVel = document.getElementById('hud-vel');
    eVel.innerText = velocity.bottom.toFixed(1);
    eVel.style.color = blownOut ? 'var(--accent-red)' : color;

    document.getElementById('target-hgt').innerText = 'Zone: ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"';
    document.getElementById('vel-target').innerText = blownOut ? 'BLOWN OUT' : 'Target: < 3.5 ft/s';

    var msg = blownOut ? 'BLOWN OUT - no presentation control'
        : ((hgt >= zone.min && hgt <= zone.max) ? 'Inside the strike zone' : 'Outside the strike zone');
    document.getElementById('hud-msg').innerText = msg + '  \u2022  Score ' + score.toFixed(1) + ' / 5.0';

    // Logging is decoupled from the Gear Sim — the catch-log button keeps its
    // own label/state (set by applyAuthState) and is never gated on the sim.

    var sugBox = document.getElementById('suggestions');
    sugBox.style.display = 'block';
    sugBox.innerHTML = '<span class="sug-head">Rig Adjustments</span>- ' + suggestions.join('<br>- ') +
        '<div class="sug-cond">' + zone.notes.join('<br>') + '</div>';

    if (simBtn) { simBtn.innerText = 'RUN SIMULATION'; simBtn.disabled = false; }
    logDebug('Sim: height ' + hgt.toFixed(2) + '", bed velocity ' + velocity.bottom.toFixed(2) +
        ' ft/s, zone ' + zone.min.toFixed(1) + '-' + zone.max.toFixed(1) + '", score ' + score.toFixed(2), 'SIM');
}
