/**
 * src/features/gear-sim/solver.js - the impure halves of the Gear Sim that a
 * technique's pure compute() cannot own: reading the form, loading the community
 * sonar, and painting the HUD.
 *
 * public: readRigFromForm(), loadCalibrationData(flow, species),
 *         buildSimStats(rig, out), paintSimHud(rig, out, stats),
 *         openWaterTypeGuide(), closeWaterTypeGuide(),
 *         waterTypeMultiplier(typeId)
 *
 * Split out of sim.js in UPDATE 3.0 Phase 1.4 so runSim() is a short orchestrator.
 * ES module.
 */
// The line PICKERS carry a brand-specific id; resolve it to the real measured diameter
// so the drag term uses the angler's actual line, not just its material+lb class.
export function pickedLineDiameter(pickId) {
    const line = (typeof tackleLineById === 'function') ? tackleLineById(getStr(pickId)) : null;
    return (line && line.diameter_mm) ? line.diameter_mm : 0;   // 0 -> generic lookup
}

export function readRigFromForm() {
    const hookRaw = getStr('hook');
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
        hook: hookRaw,
        yarn: getNum('yarn'),
        foam: parseFoam(getStr('foam')),        // Foam 1
        foam2: parseFoam(getStr('foam2')),      // Foam 2
        bdSz: getNum('foam3'),
        species: getStr('species'),
        waterType: getStr('water-type') || 'run'
    };
}

// Community sonar: anonymised full tackle telemetry from every angler who has
// logged a catch at this flow and species. Physics stays locked - this data only
// moves the strike zone toward where fish are actually feeding. Falls back to the
// local buffer offline.
import { logDebug } from '../../shared/debug.js';
import { Supa } from '../../services/supabase.js';
import { getStr, getNum, parseFoam } from './inputs.js';
import { getCurrentFlow } from './report-state.js';
import { tackleLineById } from '../../shared/tackle.js';
import { snapshotLoad, outboxAll } from '../catch-log/outbox.js';
import { velocityAtSpot, spotDepthFt } from './continuity.js';
import { zoneColor, paintZoneHud } from './zone-core.js';
export async function loadCalibrationData(flow, species) {
    let dbArray = [];
    try { dbArray = await Supa.fetchGlobalCalibration(flow, species); } catch (e) { dbArray = []; }
    if (!dbArray.length) {
        // Offline fallback: the durable calibration snapshot first (exact match
        // to the same flow/species is not guaranteed here — the snapshot is a
        // per-call capture), then the durable outbox.
        const snap = (typeof snapshotLoad === 'function') ? await snapshotLoad('calibration_snapshot') : null;
        if (Array.isArray(snap) && snap.length) {
            dbArray = snap;
        } else {
            dbArray = (typeof outboxAll === 'function') ? outboxAll() : [];
        }
    }
    return dbArray;
}

// The private row enrichment written by logData() when the angler logs a catch.
export function buildSimStats(rig, out) {
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

export function paintSimHud(rig, out, stats) {
    const hgt = out.hgt, zone = out.zone, suggestions = out.suggestions, velocity = out.velocity;

    // BANNERS + SUMMARY: the strike-zone banner (gradient colour) and the ONE cohesive
    // "where the fish are" paragraph, printed under both banners. Same painter as the live
    // preview, so the two can never disagree (paintZoneHud is in zone.js).
    paintZoneHud(zone, out.outlook);

    // The line-height banner keeps its own grade: colour-graded toward the zone MIDDLE in
    // 0.1" steps (green = dead centre, yellow = halfway, red = at/beyond the edge).
    const eHgt = document.getElementById('hud-hgt');
    eHgt.innerText = hgt.toFixed(1) + '"';
    eHgt.style.color = zoneColor(hgt, zone);

    // Rig changes ONLY when off target (an on-target rig has no suggestions: the summary
    // already states the line is in the band).
    const ul = document.getElementById('hud-changes');
    if (ul) {
        ul.innerHTML = '';
        suggestions.forEach(function (s) {
            const li = document.createElement('li');
            li.textContent = s;
            ul.appendChild(li);
        });
    }

    const simBtn = document.getElementById('btn-sim');
    if (simBtn) { simBtn.innerText = 'RUN SIMULATION'; simBtn.disabled = false; }
    // Continuity record: log the gauge value WITH the (currently unmeasured) spot ratio, so
    // the trail shows exactly what was assumed instead of an unexplained single number.
    // Log the rig inputs alongside the sim output so the debug trail shows what was entered
    logDebug('Rig: weight ' + rig.weightOz.toFixed(2) + 'oz ' + (rig.weightShape || '?') +
        ' (' + (rig.weightSetup || 'sliding') + '), leader ' + rig.ldLen + 'ft ' + rig.ldMat +
        ' ' + rig.ldLb + 'lb, main ' + rig.mlMat + ' ' + rig.mlLb + 'lb' +
        (rig.ldDia ? ', ldDia=' + rig.ldDia + 'mm' : '') +
        ', hook ' + (rig.hook || '?') + (rig.yarn ? ', yarn ' + rig.yarn + '"' : '') +
        ', foam ' + (rig.foam ? rig.foam.label || rig.foam.key || '?' : '?') +
        (rig.foam2 && rig.foam2.key !== '0' ? ' + ' + (rig.foam2.label || rig.foam2.key) : '') +
        ', bead ' + (rig.bdSz || '0') + 'mm' +
        ', species ' + (rig.species || 'default') +
        ', flow ' + rig.flow + ' cfs', 'RIG');

    const shownBottom = velocity.bottom;
    const near = (typeof velocityAtSpot === 'function')
        ? velocityAtSpot(rig.flow, velocity.station || null) : null;
    const spotDepth = (typeof spotDepthFt === 'function')
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
        (out.hookDepthM ? '; hook depth ' + out.hookDepthM.toFixed(2) + ' m' : '; hook depth (chain not converged)') +
        (out.interceptionProb ? '; P(intercept)=' + out.interceptionProb.toFixed(3) : '; P(intercept)=0') +
        (out.sweepQuality ? '; sweepQ=' + out.sweepQuality.toFixed(2) : '') +
        // Chain solver detail
        (out.chainResult ? '; chain={' + (out.chainResult.converged ? 'converged' : 'converged=' + out.chainResult.converged) +
            ' hD=' + out.chainResult.hookDepthM.toFixed(3) + 'm' +
            (out.chainResult.iterations ? ' iter=' + out.chainResult.iterations : '') +
            (out.chainResult.detail ? ' ' + out.chainResult.detail : '') + '}' : '') +
        // Chain env
        (out.chainEnv ? '; env={H=' + out.chainEnv.depthM.toFixed(2) + 'm uMax=' + out.chainEnv.uMax.toFixed(3) +
            ' z0=' + out.chainEnv.z0 + ' rodH=' + out.chainEnv.rodHeightM + '}' : '') +
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
    const nbRows = (out.sonar && out.sonar.residuals) ? out.sonar.residuals : [];
    if (nbRows.length) {
        let nbSum = 0;
        for (let bi = 0; bi < nbRows.length; bi++) nbSum += nbRows[bi];
        logDebug('Notebook: model residual ' + (nbSum / nbRows.length).toFixed(2) +
            '" over ' + nbRows.length + ' catch(es) (actual - predicted)', 'SIM');
}
}

