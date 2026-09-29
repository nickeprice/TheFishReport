/**
 * src/features/gear-sim/zone.js - rig requirements (no defaults), the strike
 * zone, and the best-rig search that moves the presentation into the zone.
 * public: RIG_REQUIRED, missingRigFields(), getWaterTempF(), getTurbidityFnu(),
 *         computeStrikeZone(), gradeColor(), zoneColor(), zoneTrend(), zoneNotes(),
 *         whereToFish(), paintZoneHud(), refreshZonePreview(), bestZoneRig()
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

// Own-gauge turbidity (FNU), set by applyOwnGaugeWaterQuality() from the water-report
// payload's 63680 reading. Same contract as getWaterTempF(): the ACTIVE station's own
// gauge or nothing - no proxy, no cross-gauge substitute. null -> the zone model simply
// has no turbidity term.
function getTurbidityFnu() {
    if (window.turbidityFnu !== undefined && window.turbidityFnu !== null && !isNaN(window.turbidityFnu)) {
        return Number(window.turbidityFnu);
    }
    var el = document.querySelector('.turbidity-val');
    if (el) {
        var parsed = parseFloat(String(el.innerText).replace(/[^0-9.\-]/g, ''));
        if (!isNaN(parsed) && parsed >= 0 && parsed < 5000) return parsed;
    }
    return null;
}

// The hour the zone model describes: the report's REFERENCE HOUR block (WS-4) - today
// that is the hour containing now, a later day the hour holding the legal start.
// Deliberately NOT the local clock: a clock fallback would make computeStrikeZone()
// depend on when it was called, which breaks the sim's determinism contract and would
// make the frozen baselines flap between 7 AM and 7 PM. null -> no light term.
function refHourBlock() {
    var rep = getActiveReport();
    var wh = rep && rep.weather_hour;
    if (!wh) return null;
    var m = wh.iso ? /T(\d{2}):/.exec(String(wh.iso)) : null;
    if (!m) return null;
    return { hour: Number(m[1]), label: wh.label || '' };
}

// Turbidity bands (FNU, own gauge). Dirty water hides the fish from above, so they
// move SHALLOWER and tighter to cover; clear water does the opposite. Brackets are the
// angler-facing colour classes, and the shifts stay small - colour is a modifier, not
// the driver (the thermal curve and the barometer lead).
var TURBIDITY_BANDS = [
    { max: 8,        shift: -0.50, label: 'clear' },
    { max: 20,       shift:  0.25, label: 'light stain' },
    { max: 50,       shift:  0.75, label: 'coloured' },
    { max: Infinity, shift:  1.25, label: 'dirty' }
];

function turbidityTerm() {
    var fnu = getTurbidityFnu();
    if (fnu === null) return null;
    for (var i = 0; i < TURBIDITY_BANDS.length; i++) {
        if (fnu < TURBIDITY_BANDS[i].max) {
            var where = (TURBIDITY_BANDS[i].shift > 0)
                ? 'fish move up and closer to cover.'
                : 'fish are spooky - they sit deep and tight.';
            return { shift: TURBIDITY_BANDS[i].shift, label: TURBIDITY_BANDS[i].label, fnu: fnu, note: where };
        }
    }
    return null;
}

// Light term from the reference hour block. Low light (dawn / dusk / dark) lets fish
// feed up in the column; high overhead sun pins them down. The midday window is the
// only "bright" bracket here - the crepuscular CURVE (a real low-light peak around
// sunrise/sunset) is WS-8b and needs its own product confirm, so this stays a
// three-way bracket rather than a fake curve.
var LIGHT_LOW_SHIFT = 1.00;
var LIGHT_BRIGHT_SHIFT = -0.75;

function lightTerm(hour) {
    if (hour === null || hour === undefined || isNaN(hour)) return null;
    var h = Number(hour);
    if (h < 7 || h >= 19) {
        return { shift: LIGHT_LOW_SHIFT, label: 'low light', note: 'fish feed up in the column.' };
    }
    if (h >= 10 && h <= 16) {
        return { shift: LIGHT_BRIGHT_SHIFT, label: 'high sun', note: 'fish hold deep and tight.' };
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
    // WS-8a DEMOTED this from +3.5" / -3.0" (a third of the whole zone) to +/-1.2". It is
    // a real effect but a SECOND-ORDER one: the thermal curve, the light and the water
    // colour lead. Nothing else moved to compensate - the smaller term IS the change.
    var pressureDelta = Number(rep.press_delta);
    if (!isNaN(pressureDelta)) {
        if (pressureDelta <= -0.03) {
            zone.shift += 1.2;
            zone.notes.push('Barometer falling ' + pressureDelta.toFixed(2) + ' inHg: bladders expand, fish ride a little higher.');
        } else if (pressureDelta >= 0.03) {
            zone.shift -= 1.2;
            zone.notes.push('Barometer rising ' + pressureDelta.toFixed(2) + ' inHg: fish pin down a little (lockjaw).');
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

    // Water temperature = metabolism, via the THERMAL OPTIMUM curve (WS-8a). This
    // replaces the old two-line rule ("< 46 -> deep, >= 55 -> rise"), which pointed the
    // wrong way above the comfort band: warm water sends salmonids to the coldest,
    // most oxygenated water, not up. Bands + wording live in inputs.js.
    var temp = getWaterTempF();
    var th = (typeof thermalOptimum === 'function') ? thermalOptimum(temp) : null;
    if (th) {
        zone.shift += th.shift;
        zone.notes.push('Water ' + th.tempF.toFixed(0) + 'F (' + th.range + 'F band): ' + th.note);
    }

    // Colour of the water (own gauge only). No reading -> no term at all: an absent
    // probe is never an estimate.
    var turb = turbidityTerm();
    if (turb) {
        zone.shift += turb.shift;
        zone.notes.push(turb.label.charAt(0).toUpperCase() + turb.label.slice(1) + ' water (' +
            turb.fnu.toFixed(1) + ' FNU): ' + turb.note);
    }

    // Light at the hour the report describes (its REFERENCE HOUR block, see refHourBlock()).
    var block = refHourBlock();
    var light = block ? lightTerm(block.hour) : null;
    if (light) {
        zone.shift += light.shift;
        var when = block.label ? ' (' + block.label + ')' : '';
        zone.notes.push(light.label.charAt(0).toUpperCase() + light.label.slice(1) + when + ': ' + light.note);
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
// FULL_SCALE is the largest stack the report rules in computeStrikeZone() can build. WS-8a
// rebuilt the stack (thermal curve + turbidity + light replaced "warm water = rise") and it now
// peaks at 6.7" deeper - falling 1.2 + cloud 1.5 + rain 1.0 + optimal 0.75 + dirty 1.25 + low
// light 1.0 - and 5.45" shallower (rising 1.2 + sun 1.5 + torpid 1.5 + clear 0.5 + high sun
// 0.75). The constant deliberately stays 7.0: it is still above the true ceiling, so no zone
// can saturate the scale, and keeping it leaves the pinned trend maths untouched.
// The offset is quantised to 0.1" so the colour and the printed range agree. A community pull
// can still saturate the scale (it is not bounded by the report rules), hence the clamp.
var ZONE_TREND_FULL_SCALE = 7.0;

function zoneTrend(zone) {
    var baseMid = (BASE_ZONE_MIN + BASE_ZONE_MAX) / 2;
    var offset = Math.round((((zone.min + zone.max) / 2) - baseMid) * 10) / 10;
    var ratio = Math.abs(offset) / ZONE_TREND_FULL_SCALE;
    if (ratio > 1) ratio = 1;
    return { offset: offset, ratio: ratio, color: gradeColor(ratio) };
}

// ==================================================================================
// WHERE TO FISH (WS-8a)
// The zone says HOW HIGH in the column the fish are holding. This says WHERE that is:
// the depth of water they are sitting in, the piece of water that holds them (the lie),
// and what the light and the colour are doing to them - then, when a rig height is
// supplied, whether the angler's line is in that band. Shown ON and OFF target.
//
// Every clause is measured or omitted. No measured cross-section -> no depth number
// (never a made-up spot depth); no measured velocity curve -> no lie call. The bullets
// stay short single clauses because they ride the same <ul> as the zone reasons.
// ==================================================================================
var LIE_SOFT_FTS = 1.5;     // true ft/s at the gauge: below this the bed is soft
var LIE_FAST_FTS = 3.0;     // above this the bed is pushy

function whereToFish(zone, hgt) {
    var flow = (typeof getCurrentFlow === 'function') ? getCurrentFlow() : null;
    var siteId = (typeof getActiveStationId === 'function') ? getActiveStationId() : null;
    var spot = (typeof spotDepthFt === 'function') ? spotDepthFt(flow, siteId) : null;
    var near = (typeof velocityAtSpot === 'function') ? velocityAtSpot(flow, siteId) : null;
    var parts = [];
    var mid = zone ? (zone.min + zone.max) / 2 : null;

    // 1. Depth of water they are holding in, from the gauge's measured cross-section.
    // The uncertainty is the WORSE of the two honest spreads: the same-reach factor
    // (the spot is not the gauge) and the cross-section's own row-to-row spread. Kept
    // tight - the row has to read inside a half-width HUD panel.
    if (spot && spot.value > 0 && mid !== null) {
        var unc = Math.max(spot.uncertainty || 0, spot.spreadPct || 0);
        parts.push('hold ~' + mid.toFixed(1) + '" up in ~' + spot.value.toFixed(1) + ' ft of water (gauge cross-section, \u00b1' +
            Math.round(unc * 100) + '%)');
    } else {
        parts.push('no measured cross-section at this gauge, so no spot depth');
    }

    // 2. The lie: what the bed velocity says about the water holding them.
    if (near && typeof near.bottom === 'number') {
        var v = near.bottom;
        if (v > LIE_FAST_FTS) {
            parts.push('bed ' + v.toFixed(1) + ' ft/s: the lie is behind boulders, wood and cut banks');
        } else if (v >= LIE_SOFT_FTS) {
            parts.push('bed ' + v.toFixed(1) + ' ft/s: the lie is the seam beside the current tongue');
        } else {
            parts.push('bed ' + v.toFixed(1) + ' ft/s: soft water, fish spread over the flats and riffle lips');
        }
    }

    // 3. Colour + light - only when the own gauge / the report's reference hour carry them.
    var turb = turbidityTerm();
    if (turb) {
        parts.push(turb.label + ' water (' + turb.fnu.toFixed(1) + ' FNU) puts them ' +
            (turb.shift > 0 ? 'shallower, closer to cover' : 'deeper and tighter'));
    }
    var block = refHourBlock();
    var light = block ? lightTerm(block.hour) : null;
    if (light) parts.push(light.label + ' at ' + (block.label || 'this hour') + ' keeps them ' +
        (light.shift > 0 ? 'up' : 'deep'));

    // 4. The angler's line against that band (only when a solved height is supplied).
    if (zone && mid !== null && typeof hgt === 'number' && isFinite(hgt)) {
        if (hgt >= zone.min && hgt <= zone.max) {
            parts.push('your line at ' + hgt.toFixed(1) + '" is in that band');
        } else {
            parts.push('your line at ' + hgt.toFixed(1) + '" is ' + Math.abs(hgt - mid).toFixed(1) + '" ' +
                (hgt < zone.min ? 'below' : 'above') + ' that band');
        }
    }

    return 'Where to fish: ' + parts.join('; ') + '.';
}

// Paint the WHOLE left panel from a zone: the estimate (coloured by the gradient) and ONE
// BULLET PER REASON. Shared by the live preview below and by runSim()'s paintSimHud(), so the
// panel can never be half-updated. `where` (optional) is a precomputed whereToFish() row, so
// the solved HUD line and the preview line can never disagree.
function paintZoneHud(zone, where) {
    var trend = zoneTrend(zone);
    var range = document.getElementById('hud-zone');
    if (range) {
        range.innerText = zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"';
        range.style.color = trend.color;          // the gradient IS the estimate's colour
    }
    var ul = document.getElementById('hud-zone-notes');
    if (ul) {
        ul.innerHTML = '';
        var rows = zoneNotes(zone);
        if (typeof whereToFish === 'function') rows = rows.concat([where || whereToFish(zone)]);
        rows.forEach(function (n) {
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
