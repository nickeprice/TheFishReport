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
        flow: getCurrentFlow(),                 // derived from the live water report
        weightOz: getNum('weight'),
        ldLen: getNum('ld-len'),
        ldMat: getStr('ld-mat'),
        ldLb: getNum('ld-lb') || REF_LB_TEST,
        ldDia: pickedLineDiameter('ld-line'),
        mlMat: getStr('ml-mat'),
        mlLb: getNum('ml-lb'),
        mlDia: pickedLineDiameter('ml-line'),
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
    var hgt = out.hgt, zone = out.zone, suggestions = out.suggestions, velocity = out.velocity;

    // LEFT panel: the strike zone, its trend colour and ONE BULLET PER REASON it moved off the
    // 4"-12" base - plus the solved "where to fish" row. Same painter as the live preview, so
    // the panel is whole (paintZoneHud is in zone.js).
    paintZoneHud(zone, out.whereToFish);

    // RIGHT panel: the angler's line height, colour-graded toward the zone MIDDLE in
    // 0.1" steps (green = dead centre, yellow = halfway, red = at/beyond the edge), with
    // the exact rig changes to get into the zone listed beneath it.
    var eHgt = document.getElementById('hud-hgt');
    eHgt.innerText = hgt.toFixed(1) + '"';
    eHgt.style.color = zoneColor(hgt, zone);

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
    var shownBottom = (typeof velocity.trueBottom === 'number') ? velocity.trueBottom : velocity.bottom;
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
        (out.whereToFish ? ' | ' + out.whereToFish : ''), 'SIM');
}
