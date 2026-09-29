/**
 * src/features/gear-sim/solver.js - the impure halves of the Gear Sim that a
 * technique's pure compute() cannot own: reading the form, loading the community
 * sonar, and painting the HUD.
 *
 * public: readRigFromForm(), loadCalibrationData(flow, species),
 *         buildSimStats(rig, out), paintSimHud(rig, out, stats)
 *
 * Split out of sim.js in UPDATE 3.0 Phase 1.4 so runSim() is a short orchestrator.
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
function readRigFromForm() {
    var hookRaw = parseFloat(getStr('hook'));
    return {
        flow: getCurrentFlow(),                 // derived from the live water report
        weightOz: getNum('weight'),
        ldLen: getNum('ld-len'),
        ldMat: getStr('ld-mat'),
        ldLb: getNum('ld-lb') || REF_LB_TEST,
        mlMat: getStr('ml-mat'),
        mlLb: getNum('ml-lb'),
        hook: isNaN(hookRaw) ? 2 : hookRaw,     // 0 = 1/0, -1 = 2/0
        yarn: getNum('yarn'),
        foam: parseFoam(getStr('foam')),        // Foam 1
        foam2: parseFoam(getStr('foam2')),      // Foam 2 (second corky)
        bdMat: getStr('bd-mat'),
        bdSz: getNum('bd-sz'),
        species: getStr('species')
    };
}

// Community sonar: anonymised full tackle telemetry from every angler who has
// logged a catch at this flow and species. Physics stays locked - this data only
// moves the strike zone toward where fish are actually feeding. Falls back to the
// local buffer offline.
async function loadCalibrationData(flow, species) {
    var dbArray = [];
    if (typeof Supa !== 'undefined') {
        try { dbArray = await Supa.fetchGlobalCalibration(flow, species); } catch (e) { dbArray = []; }
    }
    if (!dbArray.length) {
        // Offline fallback: the durable outbox (in-memory mirror, loaded at boot).
        dbArray = (typeof outboxAll === 'function') ? outboxAll() : [];
    }
    return dbArray;
}

// The private row enrichment written by logData() when the angler logs a catch.
function buildSimStats(rig, out) {
    return {
        flow: rig.flow,
        weight: rig.weightOz,
        ldLen: rig.ldLen,
        ldMat: rig.ldMat,
        ldLb: rig.ldLb,
        mlMat: rig.mlMat,
        mlLb: rig.mlLb,
        hook: rig.hook,
        yarn: rig.yarn,
        foam: rig.foam.key,
        foam2: rig.foam2.key,
        bdMat: rig.bdMat,
        bdSz: rig.bdSz,
        hgt: out.hgt,
        zoneMin: out.zone.min,
        zoneMax: out.zone.max,
        score: out.score,
        bottomVelocity: out.velocity.bottom,
        meanVelocity: out.velocity.mean,
        dragCoeff: 1.0,
        blownOut: out.blownOut
    };
}

function paintSimHud(rig, out, stats) {
    var hgt = out.hgt, velocity = out.velocity, zone = out.zone;
    var score = out.score, blownOut = out.blownOut, suggestions = out.suggestions;

    var color = 'var(--accent-green)';
    if (score < 4.0) color = 'var(--accent-yellow)';
    if (score < 2.5) color = 'var(--accent-red)';

    var eHgt = document.getElementById('hud-hgt');
    eHgt.innerText = hgt.toFixed(1) + '"';
    eHgt.style.color = color;

    // BOTTOM CURRENT shows the TRUE measured ft/s when the gauge has USGS field
    // measurements. The solver keeps its own anchored calibration scale internally
    // (velocity.bottom), so displaying truth can never move the physics.
    var shownBottom = (typeof velocity.trueBottom === 'number') ? velocity.trueBottom : velocity.bottom;
    var eVel = document.getElementById('hud-vel');
    eVel.innerText = shownBottom.toFixed(1);
    eVel.style.color = blownOut ? 'var(--accent-red)' : color;

    // Provenance, honest limits, and the continuity caveat: this is the GAUGE's velocity
    // applied to the angler's reach (no spot-width source exists yet), so it is labelled as
    // the gauge value plus the gauge's measured channel width - not a fabricated spot number.
    var velNote;
    if (velocity.source === 'measured') {
        velNote = velocity.thinRecent ? 'USGS curve - thin recent data' : 'USGS-measured ft/s';
        if (velocity.station) {
            var wFt = gaugeWidthFt(velocity.station);
            if (wFt) velNote += ' \u2022 ' + Math.round(wFt) + ' ft channel';
        }
    } else {
        velNote = 'estimated ft/s';
    }
    document.getElementById('target-hgt').innerText = 'Zone: ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"';
    document.getElementById('vel-target').innerText = blownOut ? 'BLOWN OUT' : velNote;

    var msg = blownOut ? 'BLOWN OUT - no presentation control'
        : ((hgt >= zone.min && hgt <= zone.max) ? 'Inside the strike zone' : 'Outside the strike zone');
    document.getElementById('hud-msg').innerText = msg + '  \u2022  Score ' + score.toFixed(1) + ' / 5.0';

    // Logging is decoupled from the Gear Sim - the catch-log button keeps its
    // own label/state (set by applyAuthState) and is never gated on the sim.

    var sugBox = document.getElementById('suggestions');
    sugBox.style.display = 'block';
    sugBox.innerHTML = '<span class="sug-head">Rig Adjustments</span>- ' + suggestions.join('<br>- ') +
        '<div class="sug-cond">' + zone.notes.join('<br>') + '</div>';

    var simBtn = document.getElementById('btn-sim');
    if (simBtn) { simBtn.innerText = 'RUN SIMULATION'; simBtn.disabled = false; }
    // Continuity record: log the gauge value WITH the (currently unmeasured) spot ratio, so
    // the trail shows exactly what was assumed instead of an unexplained single number.
    var near = (typeof velocityAtSpot === 'function')
        ? velocityAtSpot(rig.flow, velocity.station || null) : null;
    logDebug('Sim: height ' + hgt.toFixed(2) + '", bed velocity ' + shownBottom.toFixed(2) +
        ' ft/s (' + velocity.source + (typeof velocity.trueBottom === 'number'
            ? ', true ft/s' : ', calibration scale') + ')' +
        (near ? '; spot x' + near.ratio + ' measured=' + near.ratioMeasured +
            ' \u00b1' + Math.round(near.uncertainty * 100) + '%' : '') +
        ', zone ' + zone.min.toFixed(1) + '-' + zone.max.toFixed(1) +
        '", score ' + score.toFixed(2), 'SIM');
}
