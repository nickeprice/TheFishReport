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
// The line PICKERS carry a brand-specific id; resolve it to the real measured diameter
// so the drag term uses the angler's actual line, not just its material+lb class.
function pickedLineDiameter(pickId) {
    var line = (typeof tackleLineById === 'function') ? tackleLineById(getStr(pickId)) : null;
    return (line && line.diameter_mm) ? line.diameter_mm : 0;   // 0 -> generic lookup
}

function readRigFromForm() {
    var hookRaw = parseFloat(getStr('hook'));
    return {
        flow: getCurrentFlow(),
        weightOz: getNum('weight'),
        weightShape: getStr('weight-shape'),
        weightSetup: getStr('weight-setup') || 'sliding',
        ldLen: getNum('ld-len'),
        ldMat: getStr('ld-mat'),
        ldLb: getNum('ld-lb') || 12,
        ldDia: pickedLineDiameter('ld-line'),
        mlMat: getStr('ml-mat'),
        mlLb: getNum('ml-lb'),
        mlDia: pickedLineDiameter('ml-line'),
        hook: isNaN(hookRaw) ? 2 : hookRaw,
        yarn: getNum('yarn'),
        foam: parseFoam(getStr('foam')),        // Foam 1
        foam2: parseFoam(getStr('foam2')),      // Foam 2
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
        weightShape: rig.weightShape,
        weightSetup: rig.weightSetup,
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
        blownOut: out.blownOut,
        hookDepthM: out.hookDepthM || null,
        interceptionProb: out.interceptionProb || 0,
        sweepQuality: out.sweepQuality || 0,
        salmonDepthM: out.salmonDepthM || null
    };
}

function paintSimHud(rig, out, stats) {
    var hgt = out.hgt, zone = out.zone, suggestions = out.suggestions, velocity = out.velocity;

    // BANNERS + SUMMARY: the strike-zone banner (gradient colour) and the ONE cohesive
    // "where the fish are" paragraph, printed under both banners. Same painter as the live
    // preview, so the two can never disagree (paintZoneHud is in zone.js).
    paintZoneHud(zone, out.outlook);

    // The line-height banner keeps its own grade: colour-graded toward the zone MIDDLE in
    // 0.1" steps (green = dead centre, yellow = halfway, red = at/beyond the edge).
    var eHgt = document.getElementById('hud-hgt');
    eHgt.innerText = hgt.toFixed(1) + '"';
    eHgt.style.color = zoneColor(hgt, zone);

    // Rig changes ONLY when off target (an on-target rig has no suggestions: the summary
    // already states the line is in the band).
    var ul = document.getElementById('hud-changes');
    if (ul) {
        ul.innerHTML = '';
        suggestions.forEach(function (s) {
            var li = document.createElement('li');
            li.textContent = s;
            ul.appendChild(li);
        });
    }

    var simBtn = document.getElementById('btn-sim');
    if (simBtn) { simBtn.innerText = 'RUN SIMULATION'; simBtn.disabled = false; }
    // Continuity record: log the gauge value WITH the (currently unmeasured) spot ratio, so
    // the trail shows exactly what was assumed instead of an unexplained single number.
    var shownBottom = velocity.bottom;
    var near = (typeof velocityAtSpot === 'function')
        ? velocityAtSpot(rig.flow, velocity.station || null) : null;
    var spotDepth = (typeof spotDepthFt === 'function')
        ? spotDepthFt(rig.flow, velocity.station || null) : null;
    logDebug('Sim: height ' + hgt.toFixed(2) + '", bed velocity ' + shownBottom.toFixed(2) +
        ' ft/s (' + velocity.source + (typeof velocity.trueBottom === 'number'
            ? ', true ft/s' : ', calibration scale') + ')' +
        (near ? '; spot x' + near.ratio + ' measured=' + near.ratioMeasured +
            ' \u00b1' + Math.round(near.uncertainty * 100) + '%' : '') +
        (spotDepth && spotDepth.value ? '; gauge depth ' + spotDepth.value.toFixed(2) + ' ft' +
            ' \u00b1' + Math.round(spotDepth.uncertainty * 100) + '%' : '') +
        ', zone ' + zone.min.toFixed(1) + '-' + zone.max.toFixed(1) +
        '", line ' + hgt.toFixed(1) + '" ' + zoneColor(hgt, zone) +
        (out.hookDepthM ? '; hook depth ' + out.hookDepthM.toFixed(2) + ' m' : '') +
        (out.interceptionProb ? '; P(intercept)=' + out.interceptionProb.toFixed(3) : '') +
        (out.sweepQuality ? '; sweepQ=' + out.sweepQuality.toFixed(2) : '') +
        // The per-term reasons are NOT on the HUD any more (the summary replaced them), so the
        // debug trail is where they survive in full - including the community-sonar note.
        (zone.notes && zone.notes.length ? ' | zone reasons: ' + zone.notes.join(' | ') : '') +
        (out.rigChanges && out.rigChanges.length ? ' | precise rig changes: ' + out.rigChanges.join(', ') +
            ' -> ' + hgt.toFixed(1) + '"' : '') +
        (out.whereToFish ? ' | ' + out.whereToFish : ''), 'SIM');

    // THE NOTEBOOK (debug trail only): the model's own error over the catches it used -
    // residual = where the fish actually were minus where the model predicted. Both sides of
    // every residual are stored on the catch, so it can be re-derived later. A persistent
    // direction is the signal to fix the math, add a missing variable, or re-measure.
    var nbRows = (out.sonar && out.sonar.residuals) ? out.sonar.residuals : [];
    if (nbRows.length) {
        var nbSum = 0;
        for (var bi = 0; bi < nbRows.length; bi++) nbSum += nbRows[bi];
        logDebug('Notebook: model residual ' + (nbSum / nbRows.length).toFixed(2) +
            '" over ' + nbRows.length + ' catch(es) (actual - predicted)', 'SIM');
    }
}
