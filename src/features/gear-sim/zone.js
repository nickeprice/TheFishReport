/**
 * src/features/gear-sim/zone.js - rig requirements (no defaults), the strike
 * zone, and the best-rig search that moves the presentation into the zone.
 * public: RIG_REQUIRED, missingRigFields(), getWaterTempF(),
 *         computeStrikeZone(), gradeColor(), zoneColor(), zoneTrend(), zoneNotes(),
 *         paintZoneHud(), refreshZonePreview(), bestZoneRig()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// Required gear fields — no defaults, so anything the angler has never entered
// stays blank and blocks the sim/log with a precise "fill in X" message.
// The LINE is a 3-part cascade (material → brand → lb test) and every part is
// required: the triple is what resolves to ONE measured line, and a partial pick
// deliberately resolves to no id at all (see src/shared/tackle.js).
// Foam 2 is required too (pick "None" for a single-corky rig).
var RIG_REQUIRED = [
    { id: 'ml-mat',   label: 'Mainline material' },
    { id: 'ml-brand', label: 'Mainline brand' },
    { id: 'ml-lb',    label: 'Mainline lb test' },
    { id: 'weight',   label: 'Weight' },
    { id: 'ld-len',   label: 'Leader length (ft)' },
    { id: 'ld-mat',   label: 'Leader material' },
    { id: 'ld-brand', label: 'Leader brand' },
    { id: 'ld-lb',    label: 'Leader lb test' },
    { id: 'hook',     label: 'Hook size' },
    { id: 'yarn',     label: 'Yarn' },
    { id: 'foam',     label: 'Foam 1' },
    { id: 'foam2',    label: 'Foam 2' },
    { id: 'bd-mat',   label: 'Bead material' },
    { id: 'bd-sz',    label: 'Bead size' }
];

function missingRigFields() {
    var missing = [];
    for (var i = 0; i < RIG_REQUIRED.length; i++) {
        if (getStr(RIG_REQUIRED[i].id) === '') missing.push(RIG_REQUIRED[i].label);
    }
    return missing;
}

function getWaterTempF() {
    if (window.waterTempF !== undefined && window.waterTempF !== null && !isNaN(window.waterTempF)) {
        return Number(window.waterTempF);
    }
    var el = document.querySelector('.water-temp');
    if (el) {
        var parsed = parseFloat(String(el.innerText).replace(/[^0-9.\-]/g, ''));
        if (!isNaN(parsed) && parsed > 25 && parsed < 90) return parsed;
    }
    return null;
}

function computeStrikeZone(sonar) {
    // sonar (optional): { center, samples } from communitySonar(). Weather sets the
    // baseline expectation; community catches act as live sonar that pulls the zone
    // toward where fish are actually feeding. Omitting sonar gives the weather-only
    // preview used by refreshZonePreview().
    var zone = { min: BASE_ZONE_MIN, max: BASE_ZONE_MAX, shift: 0, sonarShift: 0, notes: [], report: null, sonar: null };
    var rep = getActiveReport();
    if (!rep) {
        zone.notes.push('No water report loaded: using the baseline 4.0" - 12.0" strike zone.');
    } else {
    zone.report = rep;

    // Barometric trend drives the swim bladder: falling = suspend, rising = pin down.
    var pressureDelta = Number(rep.press_delta);
    if (!isNaN(pressureDelta)) {
        if (pressureDelta <= -0.03) {
            zone.shift += 3.5;
            zone.notes.push('Barometer falling ' + pressureDelta.toFixed(2) + ' inHg: bladders expand, fish ride higher.');
        } else if (pressureDelta >= 0.03) {
            zone.shift -= 3.0;
            zone.notes.push('Barometer rising ' + pressureDelta.toFixed(2) + ' inHg: fish pin down (lockjaw).');
        }
    }

    // Cloud cover = light penetration: bright sun sends them deep, overcast lifts them.
    var cloud = Number(rep.cloud_pct);
    if (!isNaN(cloud)) {
        if (cloud >= 70) {
            zone.shift += 1.5;
            zone.notes.push('Heavy cloud cover (' + cloud + '%): fish feel safe riding higher.');
        } else if (cloud <= 30) {
            zone.shift -= 1.5;
            zone.notes.push('Bright sun (' + cloud + '% cloud): fish hold deep and tight.');
        }
    }

    // Rain = colour and flow: bigger profile works, and it usually lifts the zone.
    var rain = Number(rep.rain);
    if (!isNaN(rain) && rain > 0.25) {
        zone.shift += 1.0;
        zone.notes.push('Rain freshet (' + rain.toFixed(2) + '"): coloured water, run a bigger profile.');
    }

    // Water temperature = metabolism: cold fish sulk on the bottom, warm fish rise.
    var temp = getWaterTempF();
    if (temp !== null) {
        if (temp < 46) {
            zone.shift -= 1.0;
            zone.notes.push('Cold water (' + temp.toFixed(0) + 'F): lethargic fish sit tight to the bottom.');
        } else if (temp >= 55) {
            zone.shift += 1.0;
            zone.notes.push('Warm water (' + temp.toFixed(0) + 'F): active fish, willing to rise.');
        }
    }

    } // end else (water report loaded) - sonar below runs with or without a report

    var zMin = BASE_ZONE_MIN + zone.shift;
    var zMax = BASE_ZONE_MAX + zone.shift;
    // Community sonar: pull the weather zone toward where fish are actually biting.
    // Weight grows with sample count (2 catches = 25% pull, 8+ catches = 50% pull),
    // so a single lucky catch can't yank the zone but a real pattern moves it.
    // Samples that match today's environmental conditions (water temp / wind / moon)
    // pull harder than stale ones, so the zone reacts to conditions, not just history.
    if (sonar && sonar.center !== null && sonar.center !== undefined && isFinite(sonar.center) && sonar.samples >= 2) {
        var weatherCenter = (zMin + zMax) / 2;
        var halfWidth = (zMax - zMin) / 2;
        var effective = (sonar.matched && sonar.matched >= 2) ? sonar.matched : sonar.samples;
        var pull = Math.min(0.5, 0.125 + (effective * 0.046875));  // 2->~0.22, 8->0.5
        var blended = weatherCenter + ((sonar.center - weatherCenter) * pull);
        zone.sonarShift = blended - weatherCenter;
        zMin = blended - halfWidth;
        zMax = blended + halfWidth;
        zone.sonar = sonar;
        zone.notes.push('Recent community catches holding near ' + sonar.center.toFixed(1) + '" (' +
            (sonar.matched && sonar.matched >= 2 ? sonar.matched + ' env-matched' : sonar.samples) + ' fish): zone pulled ' +
            (zone.sonarShift >= 0 ? '+' : '') + zone.sonarShift.toFixed(1) + '" toward feeding fish. ' +
            sonar.note);
    }
    if (zMin < 1.0) zMin = 1.0;
    if (zMax > 24.0) zMax = 24.0;
    if (zMax - zMin < 4.0) zMax = zMin + 4.0;
    zone.min = zMin;
    zone.max = zMax;
    zone.notes.unshift('Strike zone shifted ' + (zone.shift >= 0 ? '+' : '') + zone.shift.toFixed(1) +
        '" to ' + zMin.toFixed(1) + '" - ' + zMax.toFixed(1) + '".');
    return zone;
}

// The HUD's left-panel bullets: ONE ROW PER REASON the zone moved off the 4"-12" base, in
// the order the rules fired, so the panel reads as a list instead of one wrapped sentence.
// Two notes are deliberately NOT shown: the "Strike zone shifted ..." summary (the panel
// already prints the resulting range) and the community-catch note - the sonar still pulls
// the zone in computeStrikeZone(), we simply don't display it.
// Nothing is shifting the zone -> a single "On target" row, no explanation.
var ZONE_NOTE_HIDDEN = /^(Strike zone shifted|Recent community catches holding)/;

function zoneNotes(zone) {
    var notes = (zone && zone.notes) ? zone.notes.filter(function (n) {
        return !ZONE_NOTE_HIDDEN.test(String(n));
    }) : [];
    return notes.length ? notes : ['On target'];
}

// THE shared colour grade: d = 0 (best / on target) -> 1 (worst / furthest from the target).
// Green (hue 140) at the target, yellow (52) at the halfway point, red (0) at the edge and
// beyond. BOTH HUD panels use it - the line height grades the distance to the zone MIDDLE,
// the strike-zone trend grades the distance from the 4"-12" BASE - so "green is good" can
// never mean two different things.
function gradeColor(d) {
    if (!(d > 0)) d = 0;
    if (d > 1) d = 1;
    var t = d * 2;                                    // 0..2
    var hue = (t <= 1) ? (140 - 88 * t) : (52 - 52 * (t - 1));
    return 'hsl(' + Math.round(hue) + ', 72%, 46%)';
}

// Line-height colour. Purely geometric, in 0.1" micro-steps so the colour and the printed
// number always agree: a rig can be "in the zone" and still only amber at its edge.
function zoneColor(hgt, zone) {
    var center = (zone.min + zone.max) / 2;
    var half = Math.max(0.5, (zone.max - zone.min) / 2);
    var q = Math.round(hgt * 10) / 10;               // 0.1" micro-step
    return gradeColor(Math.abs(q - center) / half);
}

// The strike-zone ESTIMATE GRADIENT: how far today's zone sits from the 4.0"-12.0" base, used to
// colour the estimate number itself (green at the base -> yellow at half scale -> red at full).
// FULL_SCALE is the largest stack the weather rules in computeStrikeZone() can build - falling
// 3.5 + cloud 1.5 + rain 1.0 + warm 1.0 = 7.0" deeper, rising 3.0 + sun 1.5 + cold 1.0 = 5.5"
// shallower. The offset is quantised to 0.1" so the colour and the printed range agree. A
// community pull can saturate the scale (it is not bounded by the weather rules), hence the clamp.
var ZONE_TREND_FULL_SCALE = 7.0;

function zoneTrend(zone) {
    var baseMid = (BASE_ZONE_MIN + BASE_ZONE_MAX) / 2;
    var offset = Math.round((((zone.min + zone.max) / 2) - baseMid) * 10) / 10;
    var ratio = Math.abs(offset) / ZONE_TREND_FULL_SCALE;
    if (ratio > 1) ratio = 1;
    return { offset: offset, ratio: ratio, color: gradeColor(ratio) };
}

// Paint the WHOLE left panel from a zone: the estimate (coloured by the gradient) and ONE
// BULLET PER REASON. Shared by the live preview below and by runSim()'s paintSimHud(), so the
// panel can never be half-updated.
function paintZoneHud(zone) {
    var trend = zoneTrend(zone);
    var range = document.getElementById('hud-zone');
    if (range) {
        range.innerText = zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"';
        range.style.color = trend.color;          // the gradient IS the estimate's colour
    }
    var ul = document.getElementById('hud-zone-notes');
    if (ul) {
        ul.innerHTML = '';
        zoneNotes(zone).forEach(function (n) {
            var li = document.createElement('li');   // plain li: same bullets as the line-height panel
            li.textContent = n;                    // data text -> textContent, never innerHTML
            ul.appendChild(li);
        });
    }
}

// Keeps the HUD strike-zone panel live: fires on date switches and when the water report
// lands, so the zone is correct before the angler presses RUN SIMULATION. This is the
// WEATHER-ONLY preview (no community pull); runSim() repaints it with the sonar zone.
function refreshZonePreview() {
    paintZoneHud(computeStrikeZone());
}

// ==================================================================================
// GEAR SOLVER - deterministic sweep of the tackle box for the rig that lands closest
// to the middle of today's zone. Ties favour the rig the angler already has tied on.
// ==================================================================================
var WEIGHT_OPTIONS = [0.25, 0.375, 0.5, 0.625, 0.75, 1];
var LEADER_LENGTH_OPTIONS = [6, 7, 8, 9, 10, 11, 12];
var FOAM_KEYS = ['0', '14', '12', 'c12', '10'];

function bestZoneRig(zone, bottomVelocity, lbTest, ldMat, mlLb, mlMat, foamKey, weightOz, leaderFt, yarnInches, hook, bdMat, bdSz, extraLift) {
    // Physics is locked: drag coefficient is always 1.0. Full component model,
    // same as runSim: bead/hook/yarn/line materials all count.
    var target = (zone.min + zone.max) / 2;
    var best = null;
    for (var f = 0; f < FOAM_KEYS.length; f++) {
        var foam = parseFoam(FOAM_KEYS[f]);
        // extraLift carries Foam 2's buoyancy so the sweep honours a two-corky rig.
        var lift = rigLift(foam.lift + (extraLift || 0), yarnInches, hook, bdMat, bdSz);
        for (var w = 0; w < WEIGHT_OPTIONS.length; w++) {
            var wt = WEIGHT_OPTIONS[w];
            var drag = totalDragPerFt(bottomVelocity, lbTest, ldMat, mlLb, mlMat, wt, hook, yarnInches, bdMat, bdSz);
            for (var l = 0; l < LEADER_LENGTH_OPTIONS.length; l++) {
                var len = LEADER_LENGTH_OPTIONS[l];
                var h = presentationHeightInches(lift, len, drag);
                var cost = Math.abs(h - target);
                if (wt !== weightOz) cost += 0.06;      // prefer minimal change to the current rig
                if (len !== leaderFt) cost += 0.06;
                if (FOAM_KEYS[f] !== foamKey) cost += 0.03;
                if (!best || cost < best.cost) {
                    best = { cost: cost, foam: foam, weight: wt, leader: len, hgt: h };
                }
            }
        }
    }
    return best;
}
