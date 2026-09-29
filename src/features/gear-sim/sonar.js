/**
 * src/features/gear-sim/sonar.js - community sonar (env-matched logged catches)
 * used to shift WHERE the fish hold. Never changes how water works.
 * public: envMatchWeight(), communitySonar(), getActiveReport(),
 *         getCurrentFlow()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- COMMUNITY SONAR ENVIRONMENT MATCH WEIGHTING ---
// Each logged catch records the water temp / wind / moon at hookup time. When the
// current live conditions resemble a catch's conditions, that catch is a better
// predictor of where fish are RIGHT NOW, so it should pull the zone harder.
function envMatchWeight(row, rep) {
    var score = 0, dims = 0;

    // Water temperature: within 5F of today's is a strong match.
    var nowTemp = (typeof getWaterTempF === 'function') ? getWaterTempF() : null;
    var rowTemp = (row.waterTempF !== undefined && row.waterTempF !== null) ? Number(row.waterTempF) : null;
    if (nowTemp !== null && rowTemp !== null) {
        dims++;
        var diff = Math.abs(nowTemp - rowTemp);
        if (diff <= 5) { score += 1; }
        else if (diff <= 10) { score += 0.5; }
    }

    // Wind speed: within 5 mph of today's is a match.
    var nowWind = (typeof window.currentWindMph !== 'undefined' && window.currentWindMph != null) ? Number(window.currentWindMph) : null;
    var rowWind = (row.windSpeedMph !== undefined && row.windSpeedMph !== null) ? Number(row.windSpeedMph) : null;
    if (nowWind !== null && rowWind !== null) {
        dims++;
        var wdiff = Math.abs(nowWind - rowWind);
        if (wdiff <= 5) { score += 1; }
        else if (wdiff <= 10) { score += 0.5; }
    }

    // Moon phase: same phase bucket is a match (new/small waxing/first-quarter/gibbous/full...).
    var nowMoon = (rep && rep.lunar_icon) ? String(rep.lunar_icon).trim() : '';
    var rowMoon = (row.moonPhase !== undefined && row.moonPhase !== null) ? String(row.moonPhase).trim() : '';
    if (nowMoon && rowMoon) {
        dims++;
        if (nowMoon === rowMoon) { score += 1; }
        else {
            // Fuzzy: both contain a shared meaningful token (e.g. "Full", "New", "Waxing").
            var nowTokens = nowMoon.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
            var rowTokens = rowMoon.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
            var shared = nowTokens.some(function (t) { return rowTokens.indexOf(t) !== -1; });
            if (shared) score += 0.5;
        }
    }

    if (dims === 0) return 1;   // no env data on either side: don't penalise legacy rows
    return 0.25 + ((score / dims) * 0.75);   // 0.25 (poor) .. 1.0 (exact)
}

function communitySonar(dbArray, flow, species, siteId) {
    if (!dbArray || !dbArray.length) return { center: null, samples: 0, note: 'no community data yet' };
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
    for (var i = 0; i < sorted.length && heights.length < 8; i++) {
        var row = sorted[i];
        if (!row || row.loc !== 'Fair') continue;                     // mouth-hooked fish only
        if (species && row.spc && row.spc !== species) continue;
        if (!row.flow || Math.abs(row.flow - flow) > 300) continue;    // same river stage
        if (!row.ldLen) continue;
        // Pure physics snapshot of where THIS fish was feeding: coeff locked at 1.0.
        // Full component model: line diameters, mainline coupling, bead sphere +
        // material sink, hook gap/mass, yarn skirt. Missing fields fall back to the
        // reference defaults so legacy rows still solve.
        var foam = parseFoam(row.foam !== undefined ? row.foam : row.corky);
        // Second corky: honour foam_2 from the row when present (two-corky rigs).
        var foam2 = parseFoam(row.foam_2 !== undefined ? row.foam_2 : row.foam2);
        var bdMat = (row.bdMat !== undefined) ? row.bdMat : row.bead_material;
        var bdSzRaw = (row.bdSz !== undefined && row.bdSz !== null) ? row.bdSz : row.bead_size;
        // RPC returns hook_size as text ("2","0","-1"); hookSink uses strict
        // equality, so coerce to a number or cloud rows misread the hook.
        var hookNum = (row.hook !== undefined && row.hook !== null && row.hook !== '') ? Number(row.hook) : 2;
        if (isNaN(hookNum)) hookNum = 2;
        var lift = rigLift(foam.lift + foam2.lift, row.yarn || 0, hookNum, bdMat, bdSzRaw);
        var bedVel = hydraulicVelocity(row.flow, siteId).bottom;
        // P4b: prefer the BRAND the angler picked (its id owns the measured diameter, so the
        // replay runs the real line) and fall back to material + lb for a row logged before
        // the pickers existed, or written by an older installed client. tackleRowLine()
        // returns null when neither resolves, which keeps the old defaults below.
        var ldLine = (typeof tackleRowLine === 'function') ? tackleRowLine(row, 'leader') : null;
        var mlLine = (typeof tackleRowLine === 'function') ? tackleRowLine(row, 'mainline') : null;
        var lb = (ldLine && ldLine.lb_test) ? ldLine.lb_test : (row.ldLb || row.leader_lb || REF_LB_TEST);
        var ldMat = (ldLine && ldLine.material) ? ldLine.material : (row.ldMat || row.leader_material || 'copoly');
        var wt = (row.weight !== undefined && row.weight !== null) ? row.weight : 0.5;
        var mlLb = (mlLine && mlLine.lb_test) ? mlLine.lb_test : (row.mlLb || row.mainline_lb || 0);
        var mlMat = (mlLine && mlLine.material) ? mlLine.material : (row.mlMat || row.mainline_mat || 'braid');
        // 0 means "no explicit diameter" -> lineDiameterScale() falls back to generic/by-lb.
        var ldDia = (ldLine && ldLine.diameter_mm) ? ldLine.diameter_mm : 0;
        var mlDia = (mlLine && mlLine.diameter_mm) ? mlLine.diameter_mm : 0;
        var drag = totalDragPerFt(bedVel, lb, ldMat, mlLb, mlMat, wt, hookNum, row.yarn || 0, bdMat, bdSzRaw, ldDia, mlDia);
        var h = presentationHeightInches(lift, row.ldLen, drag);
        if (isFinite(h) && h > 0) {
            heights.push(h);
            weights.push(envMatchWeight(row, rep));
        }
    }
    if (heights.length < 2) return { center: null, samples: heights.length, note: 'community sample too thin to shift the zone' };
    var sum = 0, wsum = 0, matched = 0;
    for (var k = 0; k < heights.length; k++) {
        sum += heights[k] * weights[k];
        wsum += weights[k];
        if (weights[k] >= 0.75) matched++;
    }
    var center = sum / wsum;
    var matchNote = (matched >= 2)
        ? matched + ' of ' + heights.length + ' matches today\u2019s conditions'
        : heights.length + ' recent catches, few matching today\u2019s conditions';
    return { center: center, samples: heights.length, matched: matched, note: matchNote };
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
