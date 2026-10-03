/**
 * src/features/gear-sim/sonar.js - community sonar (env-matched logged catches)
 * used to shift WHERE the fish hold. Never changes how water works. The env match uses the
 * SAME variable set the sim itself uses (envSignature() in zone.js) - temperature, light /
 * cloud, turbidity, tide, barometric trend, rain - with weights that mirror how hard each
 * term moves the zone. Wind and moon are deliberately not part of it.
 * public: envMatchWeight(), envCloseness(), communitySonar(), getActiveReport(),
 *         getCurrentFlow()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- COMMUNITY SONAR ENVIRONMENT MATCH WEIGHTING ---
// A catch is a better predictor of where fish are RIGHT NOW when the conditions it was logged
// in resemble today's. The variables are EXACTLY the ones the sim itself uses to place the zone
// (see envSignature() in zone.js) - temperature, light/cloud, turbidity, tide, barometric trend,
// rain - so the sim and the sonar can never disagree about what matters. Each variable's weight
// mirrors how much its term MOVES the zone in computeStrikeZone(): temperature leads, then
// light/cloud, then colour and tide, then barometer and rain. Wind and moon are deliberately
// ABSENT: they move surface conditions and activity timing, not the depth at which a river fish
// holds, so the sim ignores them and so does this. DECLARED constants, not fitted - the same
// honesty rule the sim's own terms follow. (A later level can re-fit these from real catch data.)
// Temperature leading is corroborated by Burke et al. 2013 (PLoS ONE 8:e54134): across 31 marine
// indicators, SST was the highest-weighted predictor of adult salmon returns - a different
// question than ours, but the same "temperature drives salmon" first-order result.
var ENV_MATCH_WEIGHTS = {
    tempF:          0.30,
    lightCloud:     0.20,
    turbidityFnu:   0.15,
    tideStage:      0.15,
    barometerDelta: 0.10,
    rainIn:         0.10
};

// 1.0 when identical, 0.0 once they differ by `span` (or more); null when either side is
// missing (an absent input is not a match and not a mismatch - it is simply not compared).
function envCloseness(a, b, span) {
    if (a === null || a === undefined || b === null || b === undefined) return null;
    var d = Math.abs(Number(a) - Number(b));
    if (!isFinite(d)) return null;
    if (!(span > 0)) return d === 0 ? 1 : 0;
    return Math.max(0, 1 - (d / span));
}

function envMatchWeight(row, rep) {
    var now = (typeof envSignature === 'function') ? envSignature(rep) : null;
    if (!now || !row) return 1;                 // no live signature -> don't penalise legacy rows

    var sum = 0, wsum = 0;
    function add(key, closeness) {
        if (closeness === null) return;
        sum += ENV_MATCH_WEIGHTS[key] * closeness;
        wsum += ENV_MATCH_WEIGHTS[key];
    }

    add('tempF', envCloseness(row.waterTempF, now.tempF, 10));      // ~5F strong, 10F weak
    // Light & cloud are two views of the same thing: average them when both exist.
    var lightC = envCloseness(row.lightShift, now.lightShift, 1.5);
    var cloudC = envCloseness(row.cloudPct, now.cloudPct, 60);
    if (lightC !== null && cloudC !== null) add('lightCloud', (lightC + cloudC) / 2);
    else if (lightC !== null) add('lightCloud', lightC);
    else if (cloudC !== null) add('lightCloud', cloudC);
    add('turbidityFnu', envCloseness(row.turbidityFnu, now.turbidityFnu, 30));
    add('tideStage', envCloseness(row.tideStage, now.tideStage, 6));
    add('barometerDelta', envCloseness(row.barometerDelta, now.barometerDelta, 0.2));
    add('rainIn', envCloseness(row.rainIn, now.rainIn, 0.5));

    if (wsum === 0) return 1;                   // nothing comparable on either side: neutral
    // Floor so a poor-but-real match still counts a little (0.20 .. 1.0).
    return 0.20 + (0.80 * (sum / wsum));
}

// ==================================================================================
// THE NOTEBOOK (residual tracking)
//
// The residual for one catch = where the fish ACTUALLY was (the replayed presentation
// height) minus the centre of the zone the model PREDICTED at that moment. Both sides are
// stored (line_height_in, zone_min_in/zone_max_in) and the residual is DERIVED, never stored.
//
// HONEST SCOPE: the "actual" is itself computed with the locked rig physics, so the residual
// measures the error in the WHERE-FISH-HOLD model GIVEN the rig physics is correct - it can
// NOT validate the rig physics (that would be circular; the ruler cannot measure itself).
// A persistent direction here tells us whether to fix the math, add a missing variable, or
// re-measure - privately, over time.
// ==================================================================================
function catchPredictedCenter(row) {
    var lo = (row && row.zoneMinIn !== undefined && row.zoneMinIn !== null) ? Number(row.zoneMinIn) : NaN;
    var hi = (row && row.zoneMaxIn !== undefined && row.zoneMaxIn !== null) ? Number(row.zoneMaxIn) : NaN;
    if (!isFinite(lo) || !isFinite(hi)) return null;     // no prediction stored (older client)
    return (lo + hi) / 2;
}

function catchResidual(row) {
    var c = catchPredictedCenter(row);
    if (c === null) return null;
    var actual = (row && row.lineHeightIn !== undefined && row.lineHeightIn !== null) ? Number(row.lineHeightIn) : NaN;
    if (!isFinite(actual)) return null;                   // missing actual is not a zero residual
    return actual - c;
}

function communitySonar(dbArray, flow, species, siteId) {
    // No "not enough data" state: a single eligible catch contributes, and the ZONE-side
    // pull is what keeps one catch from moving the zone far. Empty -> centre null, which
    // simply means the physics zone stands alone.
    if (!dbArray || !dbArray.length) return { center: null, samples: 0, matched: 0, note: '', residuals: [] };
    var rep = getActiveReport();
    // Deterministic: newest catches first, so the 8-sample window is stable
    // run-to-run regardless of Supabase/localStorage return order.
    var sorted = dbArray.slice().sort(function(a, b) {
        var ta = 0, tb = 0;
        try {
            if (a && a.time) ta = new Date(a.time).getTime() || 0;
            else if (a && a.catch_time) ta = new Date(a.catch_time).getTime() || 0;
            if (b && b.time) tb = new Date(b.time).getTime() || 0;
            else if (b && b.catch_time) tb = new Date(b.catch_time).getTime() || 0;
        } catch (e) {}
        return tb - ta;
    });
    var heights = [];
    var weights = [];
    var residuals = [];
    for (var i = 0; i < sorted.length && heights.length < 8; i++) {
        var row = sorted[i];
        // No mouth-hook filter: hooking location is not recorded on a catch, so a row is
        // used on its flow / species / rig alone. (The zone-side pull keeps that honest.)
        if (!row) continue;
        if (species && row.spc && row.spc !== species) continue;
        if (!row.flow || Math.abs(row.flow - flow) > 300) continue;    // same river stage
        if (!row.ldLen) continue;
        // Pure physics snapshot of where THIS fish was feeding: coeff locked at 1.0.
        // Full component model: line diameters, mainline coupling, bead sphere +
        // material sink, hook gap/mass, yarn skirt. Missing fields fall back to the
        // reference defaults so legacy rows still solve.
        var foam = parseFoam(row.foam !== undefined ? row.foam : row.corky);
        var foam2 = parseFoam(row.foam_2 !== undefined ? row.foam_2 : row.foam2);
        var bdMat = (row.bdMat !== undefined) ? row.bdMat : row.bead_material;
        var bdSzRaw = (row.bdSz !== undefined && row.bdSz !== null) ? row.bdSz : row.bead_size;
        var hookNum = (row.hook !== undefined && row.hook !== null && row.hook !== '') ? Number(row.hook) : 2;
        if (isNaN(hookNum)) hookNum = 2;
        // Lift from tackle.json
        var hData = (typeof tackleHookData === 'function') ? tackleHookData(hookNum) : null;
        var bData = (typeof tackleBeadData === 'function') ? tackleBeadData(bdMat, bdSzRaw) : null;
        var yG = (typeof tackleYarnBuoyancyG === 'function') ? tackleYarnBuoyancyG(row.yarn || 0) : 0;
        var hookMassG = hData ? (hData.mass_g - hData.buoyancy_g) : 0;
        var beadNetSink = bData ? bData.netSinkG : 0;
        var liftGf = computeLiftGf(foam.net_buoyancy_g, foam2.net_buoyancy_g, hookMassG, beadNetSink, yG);
        var bedVel = hydraulicVelocity(row.flow, siteId).bottom;
        // P4b: prefer the BRAND the angler picked (its id owns the measured diameter, so the
        // replay runs the real line) and fall back to material + lb for a row logged before
        // the pickers existed, or written by an older installed client. tackleRowLine()
        // returns null when neither resolves, which keeps the old defaults below.
        var ldLine = (typeof tackleRowLine === 'function') ? tackleRowLine(row, 'leader') : null;
        var mlLine = (typeof tackleRowLine === 'function') ? tackleRowLine(row, 'mainline') : null;
        var lb = (ldLine && ldLine.lb_test) ? ldLine.lb_test : (row.ldLb || row.leader_lb || 12);
        var ldMat = (ldLine && ldLine.material) ? ldLine.material : (row.ldMat || row.leader_material || 'copoly');
        var wt = (row.weight !== undefined && row.weight !== null) ? row.weight : 0.5;
        // The weight TYPE (shape_label). A cloud calibration row does not carry one yet -
        // get_global_calibration has no weight-shape column - so an absent value degrades
        // the anchor term to exactly the old mass-only formula, i.e. the pre-P3 behaviour
        // for every existing cloud row. A LOCAL outbox catch DOES carry it, so a replayed
        // offline catch keeps its real shape.
        var wtShape = (row.weightShape !== undefined && row.weightShape !== null && row.weightShape !== '')
            ? String(row.weightShape) : null;
        var mlLb = (mlLine && mlLine.lb_test) ? mlLine.lb_test : (row.mlLb || row.mainline_lb || 0);
        var mlMat = (mlLine && mlLine.material) ? mlLine.material : (row.mlMat || row.mainline_mat || 'braid');
        // 0 means "no explicit diameter" -> lineDiameterScale() falls back to generic/by-lb.
        var ldDia = (ldLine && ldLine.diameter_mm) ? ldLine.diameter_mm : 0;
        var mlDia = (mlLine && mlLine.diameter_mm) ? mlLine.diameter_mm : 0;
        // New drag: use the pure-math model
        var wData = (typeof tackleWeightPhysicsData === 'function')
            ? tackleWeightPhysicsData(wtShape, wt) : null;
        var wObj = wData ? { areaCm2: wData.areaCm2, cd: wData.cd } : null;
        var ck1Obj = { areaCm2: foam.areaCm2, cd: foam.cd };
        var ck2Obj = { areaCm2: foam2.areaCm2, cd: foam2.cd };
        var bObj = bData ? { areaCm2: bData.areaCm2, cd: bData.cd } : null;
        var hObj = hData ? { areaCm2: hData.areaCm2, cd: hData.cd } : null;
        var yarnDrag = (typeof tackleYarnDragData === 'function') ? tackleYarnDragData() : null;
        var yObj = yarnDrag ? { areaCm2: yarnDrag.areaCm2, cd: yarnDrag.cd } : null;
        var drag = totalDragPerFt(bedVel, ldDia, row.ldLen || 10,
            wObj, ck1Obj, ck2Obj, bObj, hObj, yObj);
        if (mlDia > 0) {
            drag += lineDragPerFt(mlDia, hydraulicVelocity(row.flow, siteId).mean);
        }
        var h = presentationHeightInches(liftGf, drag, row.ldLen);
        if (isFinite(h) && h > 0) {
            heights.push(h);
            weights.push(envMatchWeight(row, rep));
            var nb = catchResidual(row);
            if (nb !== null) residuals.push(nb);
        }
    }
    if (heights.length < 1) return { center: null, samples: 0, matched: 0, note: '', residuals: residuals };
    var sum = 0, wsum = 0, matched = 0;
    for (var k = 0; k < heights.length; k++) {
        sum += heights[k] * weights[k];
        wsum += weights[k];
        if (weights[k] >= 0.75) matched++;
    }
    var center = sum / wsum;
    // `samples`/`matched` ride along for the caller's pull and for the notebook/residual,
    // but are never printed to the angler (no count / confidence / "not enough data" text).
    return { center: center, samples: heights.length, matched: matched, note: '', residuals: residuals };
}

// ==================================================================================
// ENVIRONMENT - where the fish are holding today
// Today's water report shifts the 4"-12" baseline into the zone the fish are using.
// ==================================================================================
function getActiveReport() {
    if (typeof reportsData !== 'undefined' && typeof activeDateOffset !== 'undefined' &&
        activeDateOffset >= 0 && activeDateOffset < reportsData.length) {
        return reportsData[activeDateOffset];
    }
    return null;
}

// Live discharge for the Gear Sim + Catch Log. There is NO user-facing flow
// input any more: the value comes from the current water report, falls back to
// the last reading we saw this session, and finally to the 1040 CFS reference so
// the solver always has a number to work with. It is still RECORDED on a catch.
var lastKnownFlow = null;

function getCurrentFlow() {
    var rep = getActiveReport();
    if (rep && rep.cfs !== null && rep.cfs !== undefined && !rep.api_offline) {
        lastKnownFlow = rep.cfs;
        return rep.cfs;
    }
    if (lastKnownFlow !== null) return lastKnownFlow;
    return 1040;
}
