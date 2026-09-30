/**
 * src/features/gear-sim/zone.js - rig requirements (no defaults), the strike
 * zone, and the best-rig search that moves the presentation into the zone.
 * public: RIG_REQUIRED, missingRigFields(), getWaterTempF(), getTurbidityFnu(),
 *         refHourBlock(), lightTerm(), turbidityTerm(), tideAt(), tideTerm(), envSignature(),
 *         computeStrikeZone(), gradeColor(), zoneColor(), zoneTrend(), positionParts(),
 *         whereToFish(), fishOutlook(), paintZoneHud(), refreshZonePreview(), bestZoneRig()
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
    // The date rides along too: the light term needs it for the solar declination (WS-8b b2').
    var d = wh.iso ? /(\d{4})-(\d{2})-(\d{2})/.exec(String(wh.iso)) : null;
    return {
        hour: Number(m[1]),
        label: wh.label || '',
        year: d ? Number(d[1]) : null,
        month: d ? Number(d[2]) : null,
        day: d ? Number(d[3]) : null
    };
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

// Light term from the reference hour block, keyed on the SUN'S REAL ELEVATION.
//
// WS-8b (b2'): b1 replaced fixed clock hours with sunrise/sunset offsets but was still a THREE-STEP
// function (+1.00 / 0 / -0.75), which produced cliffs the light does not have: at 47N in late
// September the 8-9 AM block scored the same +1.00 as a pitch-dark 5-6 AM, and the zone jumped
// 1.75" between consecutive hour blocks. A step function is a lookup table wearing a costume.
//
// Now the term is DERIVED GEOMETRY, not a fitted curve: the sun's elevation comes from the payload's
// OWN sunrise/sunset (which anchor solar noon, so no timezone/DST maths is needed) plus the day's
// declination, and the shift is a monotone ramp on that elevation. The ENDPOINTS are unchanged from
// b1 - a truly dark hour still gets +1.00, a genuinely overhead sun still gets -0.75 - so what
// changed is only the shape BETWEEN them.
//
// WHY THIS IS THE HONEST VERSION: the driver is light level, and solar elevation IS light level (a
// clock offset is only a proxy for it). The thresholds below are CHOSEN, not measured, and they are
// declared here rather than dressed up as a fitted model - we have no catch data to fit. The
// amplitude is unchanged, so nothing got more aggressive; a December noon (a 20 deg sun) now reads
// as the weak light it is instead of being scored like a July midday.
//
// Direction corroborated by Keefer et al. 2013 ("Context-dependent diel behavior of
// upstream-migrating anadromous fishes"): adults migrate more at NIGHT and shift MORE nocturnal
// when warm - i.e. dark -> active/up. The warm x light INTERACTION (fish deeper on warm, bright
// days) is a recorded CANDIDATE in docs/LITERATURE.md, deliberately NOT implemented: the notebook
// residual must show it before a term is added.
var LIGHT_LOW_SHIFT = 1.00;      // sun at/under the horizon edge
var LIGHT_BRIGHT_SHIFT = -0.75;  // sun genuinely high
var LIGHT_SUN_DARK_DEG = 3;      // <= this elevation: full low-light lift
var LIGHT_SUN_NEUTRAL_DEG = 30;  // ramps to neutral here
var LIGHT_SUN_FULL_DEG = 50;     // and to the full high-sun penalty here
var LIGHT_SHIFT_STEP = 0.05;     // quantised: the zone model cannot resolve finer than this
// The app's own default station latitude (same as the map's default centre). Duplicated here
// because zone.js loads BEFORE map.js, and a light term is not worth a load-order dependency.
var LIGHT_DEFAULT_LAT = 47.195;

// Fixed-bracket FALLBACK only (used when a day's payload carries no solar times at all).
var LIGHT_EDGE_MINUTES = 90;
var LIGHT_CORE_MINUTES = 180;

// '6:30 AM' -> 390 (minutes past midnight). null when unparseable.
function parseClockMinutes(text) {
    if (!text) return null;
    var m = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(String(text));
    if (!m) return null;
    var h = Number(m[1]) % 12;
    if (m[3].toUpperCase() === 'PM') h += 12;
    return (h * 60) + Number(m[2]);
}

// Solar declination for a DATE (NOAA approximation). Date only - no clock, no timezone.
function solarDeclinationDeg(year, month, day) {
    if (!year || !month || !day) return null;
    var doy = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000);
    var g = (2 * Math.PI / 365) * (doy - 1 + 0.5);
    return (0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
        0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)) * 180 / Math.PI;
}

// The latitude of the gauge being reported on (the angler's station), or the app default.
function activeStationLat() {
    try {
        var st = JSON.parse(localStorage.getItem('active_station') || 'null');
        if (st && st.lat != null && isFinite(Number(st.lat))) return Number(st.lat);
    } catch (e) {}
    return LIGHT_DEFAULT_LAT;
}

// The sun's elevation for the middle of that hour block, in degrees. null when the day has no
// usable solar times (then lightTerm falls back to the fixed brackets).
function solarElevationDeg(block, rep) {
    if (!block || block.hour === null || block.hour === undefined || isNaN(block.hour)) return null;
    var sunrise = parseClockMinutes(rep && rep.sunrise);
    var sunset = parseClockMinutes(rep && rep.sunset);
    var decl = solarDeclinationDeg(block.year, block.month, block.day);
    if (sunrise === null || sunset === null || sunset <= sunrise || decl === null) return null;
    var lat = activeStationLat();
    // Sunrise/sunset are in the SAME wall-clock frame as the block's hour, so their midpoint IS
    // solar noon for this day - which is why no timezone maths is needed here.
    var solarNoon = (sunrise + sunset) / 2;
    var hourAngle = (15 * (((block.hour + 0.5) * 60) - solarNoon) / 60) * Math.PI / 180;
    var rad = lat * Math.PI / 180, drad = decl * Math.PI / 180;
    var s = Math.sin(rad) * Math.sin(drad) + Math.cos(rad) * Math.cos(drad) * Math.cos(hourAngle);
    return Math.asin(Math.max(-1, Math.min(1, s))) * 180 / Math.PI;
}

// `block` = {hour, label, year, month, day} from refHourBlock(); `rep` = that day's report.
function lightTerm(block, rep) {
    if (!block) return null;
    var elev = solarElevationDeg(block, rep);

    if (elev !== null) {
        var shift;
        if (elev <= LIGHT_SUN_DARK_DEG) {
            shift = LIGHT_LOW_SHIFT;
        } else if (elev <= LIGHT_SUN_NEUTRAL_DEG) {
            shift = LIGHT_LOW_SHIFT * (LIGHT_SUN_NEUTRAL_DEG - elev) / (LIGHT_SUN_NEUTRAL_DEG - LIGHT_SUN_DARK_DEG);
        } else if (elev <= LIGHT_SUN_FULL_DEG) {
            shift = LIGHT_BRIGHT_SHIFT * (elev - LIGHT_SUN_NEUTRAL_DEG) / (LIGHT_SUN_FULL_DEG - LIGHT_SUN_NEUTRAL_DEG);
        } else {
            shift = LIGHT_BRIGHT_SHIFT;
        }
        // Quantise (1/20 = the 0.05 step) so the shift is a clean 2-decimal number, not a
        // float artefact of multiplying by 0.05.
        shift = Math.round(shift * 20) / 20;
        if (shift === 0) return null;                 // exactly neutral: no term, no note
        return {
            shift: shift,
            elevDeg: Math.round(elev * 10) / 10,
            label: shift > 0 ? 'low light' : 'high sun',
            note: shift > 0 ? 'fish hold higher and are quicker to take.' : 'fish hold deep and tight.'
        };
    }

    // No solar times on this day -> the old fixed brackets, so a missing sunrise degrades
    // instead of silently deleting the term.
    if (block.hour === null || block.hour === undefined || isNaN(block.hour)) return null;
    var h = Number(block.hour);
    if (h < 7 || h >= 19) {
        return { shift: LIGHT_LOW_SHIFT, label: 'low light', note: 'fish hold higher and are quicker to take.' };
    }
    if (h >= 10 && h <= 16) {
        return { shift: LIGHT_BRIGHT_SHIFT, label: 'high sun', note: 'fish hold deep and tight.' };
    }
    return null;
}

// ==================================================================================
// TIDE TERM (tidal reaches only)
//
// On a tide-paired station the water pushes and pulls twice a day, and the fish move with it:
// a rising (flood) tide lets them push up into shallower lies; the ebb drops them back into
// deeper holding water. This is a SHIFT of WHERE they hold - it is NOT a change to the gauge's
// measured flow, which stays authoritative. No tide curve for this station -> no term at all
// (never invented). Only the stage and its trend are used; the ~12 ft Puyallup swing is not
// converted into a velocity, because the gauge never measured that.
//
// The direction is corroborated by the tide literature: "selective tidal stream transport" -
// adult salmon ride the FLOOD tide upstream and hold on the EBB (Levy & Cadenhead, Fraser River
// sockeye; Smith et al., river entry peaks on the flood). Our sign convention matches. See
// docs/LITERATURE.md.
// ==================================================================================
var TIDE_RISING_SHIFT = 1.00;    // flood: fish move up with the push
var TIDE_FALLING_SHIFT = -1.00;  // ebb: fish drop back to deeper water

// The tide at the report's reference hour: { heightFt, trend, shift } or null when the day
// carries no hourly tide curve. `trend` comes from the slope of the neighbouring hourly
// points, never from a single extreme (which would flap run-to-run).
function tideAt(block, rep) {
    if (!block || !rep || !rep.tide_points || !rep.tide_points.length) return null;
    var pts = rep.tide_points;
    var target = Number(block.hour);
    if (!isFinite(target)) return null;
    var best = -1, bestDiff = Infinity;
    for (var i = 0; i < pts.length; i++) {
        var mins = parseClockMinutes(pts[i] && pts[i].t);
        if (mins === null) continue;
        var hh = mins / 60;
        var d = Math.abs(hh - target);
        if (d > 12) d = 24 - d;                 // wrapped clock distance
        if (d < bestDiff) { bestDiff = d; best = i; }
    }
    if (best < 0) return null;
    var h = Number(pts[best].h);
    if (!isFinite(h)) return null;
    var prev = (best > 0) ? Number(pts[best - 1].h) : NaN;
    var next = (best < pts.length - 1) ? Number(pts[best + 1].h) : NaN;
    var slope = 0;
    if (isFinite(prev) && isFinite(next)) slope = (next - prev) / 2;
    else if (isFinite(next)) slope = next - h;
    else if (isFinite(prev)) slope = h - prev;
    var trend = (slope > 0.05) ? 'rising' : (slope < -0.05) ? 'falling' : 'slack';
    var shift = (trend === 'rising') ? TIDE_RISING_SHIFT : (trend === 'falling') ? TIDE_FALLING_SHIFT : 0;
    return { heightFt: Math.round(h * 100) / 100, trend: trend, shift: Math.round(shift * 20) / 20 };
}

function tideTerm(block, rep) {
    var t = tideAt(block, rep);
    if (!t || t.shift === 0) return null;       // slack: no term, no note
    return {
        shift: t.shift, trend: t.trend, heightFt: t.heightFt,
        label: t.trend + ' tide',
        note: (t.shift > 0) ? 'fish push up into shallower water with the flood.'
                            : 'fish drop back into deeper holding water on the ebb.'
    };
}

// ==================================================================================
// THE ENVIRONMENT SIGNATURE - the ONE variable set the sim and the sonar share.
//
// The sim builds the zone from these; the sonar matches a catch's stored signature against
// today's. Same list both sides, so they can never disagree about what matters. Wind and
// moon are DELIBERATELY absent: they move surface conditions and activity TIMING, not the
// depth at which a river fish holds, so the sim ignores them and so does this. Every field
// is null-safe: a missing input is null (never 0, never a guess).
// ==================================================================================
function envNum(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
}

function envSignature(rep) {
    var r = rep || getActiveReport();
    if (!r) return null;
    var block = refHourBlock();
    var light = block ? lightTerm(block, r) : null;
    var tide = block ? tideAt(block, r) : null;
    return {
        tempF: getWaterTempF(),
        cloudPct: envNum(r.cloud_pct),
        rainIn: envNum(r.rain),
        turbidityFnu: getTurbidityFnu(),
        barometerDelta: envNum(r.press_delta),
        tideStage: tide ? tide.heightFt : null,
        tideTrend: tide ? tide.trend : null,
        lightShift: light ? light.shift : null
    };
}

function computeStrikeZone(sonar) {
    // sonar (optional): { center, samples } from communitySonar(). Weather sets the
    // baseline expectation; community catches act as live sonar that pulls the zone
    // toward where fish are actually holding. Omitting sonar gives the weather-only
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

    // Cloud cover = light penetration: bright sun sends them down, overcast lifts them.
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

    // Water temperature, via the THERMAL OPTIMUM curve (WS-8a). This replaces the old
    // two-line rule ("< 46 -> deep, >= 55 -> rise"), which pointed the wrong way above the
    // comfort band: warm water sends salmonids to the coldest, most oxygenated water, not up.
    // Bands + wording live in inputs.js (and no band claims the fish are feeding).
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

    // Light at the hour the report describes (its REFERENCE HOUR block, see refHourBlock()),
    // bracketed against THAT day's sunrise/sunset.
    var block = refHourBlock();
    var light = block ? lightTerm(block, rep) : null;
    if (light) {
        zone.shift += light.shift;
        var when = block.label ? ' (' + block.label + ')' : '';
        zone.notes.push(light.label.charAt(0).toUpperCase() + light.label.slice(1) + when + ': ' + light.note);
    }

    // Tide (tidal reaches only): the flood lifts where fish hold, the ebb drops them back.
    // No tide curve for this station -> no term at all.
    var tide = tideTerm(block, rep);
    if (tide) {
        zone.shift += tide.shift;
        zone.notes.push('Tide ' + tide.trend + ' (' + tide.heightFt.toFixed(1) + ' ft): ' + tide.note);
    }

    } // end else (water report loaded) - sonar below runs with or without a report

    var zMin = BASE_ZONE_MIN + zone.shift;
    var zMax = BASE_ZONE_MAX + zone.shift;
    // Community catches: pull the physics zone toward where fish are actually being caught.
    // No minimum sample count - a single catch applies a small nudge, a real pattern moves
    // it - and the pull is CAPPED so the evidence can never override the physics. The
    // adjustment is applied SILENTLY (the angler just sees the zone move); the full
    // provenance goes to the debug trail via zone.notes. No count / confidence / "not
    // enough data" wording is produced anywhere.
    if (sonar && sonar.center !== null && sonar.center !== undefined && isFinite(sonar.center) && sonar.samples >= 1) {
        var weatherCenter = (zMin + zMax) / 2;
        var halfWidth = (zMax - zMin) / 2;
        var effective = (sonar.matched && sonar.matched >= 1) ? sonar.matched : sonar.samples;
        var pull = Math.min(SONAR_PULL_MAX, SONAR_PULL_FLOOR + (effective * SONAR_PULL_STEP));
        var blended = weatherCenter + ((sonar.center - weatherCenter) * pull);
        zone.sonarShift = blended - weatherCenter;
        zMin = blended - halfWidth;
        zMax = blended + halfWidth;
        zone.sonar = sonar;
        zone.notes.push('Recent catches pull the zone ' +
            (zone.sonarShift >= 0 ? '+' : '') + zone.sonarShift.toFixed(1) +
            '" toward where fish are being caught.');
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

// NOTE (upstream, 2026-09-29): `zone.notes` is still produced for EVERY reason the zone
// moved — it is the audit trail paintSimHud() writes to logDebug. It is deliberately NO
// LONGER the display: the HUD prints one cohesive fishOutlook() paragraph instead. The
// "Strike zone shifted ..." summary and the community-catch note therefore need no display
// filter any more (the old `zoneNotes()` + `ZONE_NOTE_HIDDEN` pair was removed with the
// bullet list); the outlook never mentions either.

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
// A tide-paired day adds up to +1.0" (flood) / -1.0" (ebb), which can push a stack to 7.7" -
// above this scale. The constant deliberately STAYS 7.0 (the pinned trend maths is untouched)
// and zoneTrend() clamps the ratio to 1, so the colour saturates instead of overflowing.
var ZONE_TREND_FULL_SCALE = 7.0;

// Community-sonar pull: grows with the number of env-matched catches and is CAPPED so the
// evidence can nudge the physics zone but never override it. 1 catch -> ~0.14, 8+ -> 0.40.
var SONAR_PULL_MAX = 0.40;
var SONAR_PULL_FLOOR = 0.10;
var SONAR_PULL_STEP = 0.0375;

function zoneTrend(zone) {
    var baseMid = (BASE_ZONE_MIN + BASE_ZONE_MAX) / 2;
    var offset = Math.round((((zone.min + zone.max) / 2) - baseMid) * 10) / 10;
    var ratio = Math.abs(offset) / ZONE_TREND_FULL_SCALE;
    if (ratio > 1) ratio = 1;
    return { offset: offset, ratio: ratio, color: gradeColor(ratio) };
}

// ==================================================================================
// WHERE THE FISH ARE (WS-8a, restructured 2026-09-29 on a direct user ask)
//
// The zone says HOW HIGH in the column the fish are holding. `positionParts()` turns that
// into the three plain sentences the angler actually reads: the depth of water they are
// sitting in, the piece of water that holds them (the lie), and how the angler's own line
// sits against that band. `whereToFish()` is the DETAIL string (provenance-heavy, used by
// the debug trail and the technique's return); `fishOutlook()` is the one cohesive
// SUMMARY the HUD prints under the two banners.
//
// Every clause is measured or omitted. No measured cross-section -> no depth number
// (never a made-up spot depth); no measured velocity curve -> no lie call.
// ==================================================================================
var LIE_SOFT_FTS = 1.5;     // true ft/s at the gauge: below this the bed is soft
var LIE_FAST_FTS = 3.0;     // above this the bed is pushy
var DEPTH_BAND_MIN_FT = 0.2;   // a band narrower than this reads as one number, not "3.2-3.2 ft"

// '2.1-4.1 ft' when the gauge's own rows really do span a range, else '3.2 ft'. Never invents
// one: a missing/one-row band collapses to the single measured value.
function depthBandText(spot) {
    if (!spot || !(spot.value > 0)) return null;
    var low = Number(spot.bandLow), high = Number(spot.bandHigh);
    if (isFinite(low) && isFinite(high) && (high - low) >= DEPTH_BAND_MIN_FT && low > 0) {
        return low.toFixed(1) + '-' + high.toFixed(1) + ' ft';
    }
    return spot.value.toFixed(1) + ' ft';
}

function positionParts(zone, hgt) {
    var flow = (typeof getCurrentFlow === 'function') ? getCurrentFlow() : null;
    var siteId = (typeof getActiveStationId === 'function') ? getActiveStationId() : null;
    var spot = (typeof spotDepthFt === 'function') ? spotDepthFt(flow, siteId) : null;
    var near = (typeof velocityAtSpot === 'function') ? velocityAtSpot(flow, siteId) : null;
    var mid = (zone && isFinite(zone.min) && isFinite(zone.max)) ? (zone.min + zone.max) / 2 : null;
    var out = { depth: null, lie: null, liePlain: null, line: null, linePlain: null, depthParts: null, bed: null, unc: null };

    // Depth of water they are holding in, from the gauge's measured cross-section. WS-8b a2:
    // the HUD LEADS WITH THE BAND the gauge's own rows span in this flow window (the honest
    // measurement spread), with the median as the single-value fallback; the +/-20% that stays
    // beside it is the SEPARATE same-reach factor (the angler's spot is not the gauge).
    if (spot && spot.value > 0 && mid !== null) {
        var band = depthBandText(spot);
        out.unc = spot.uncertainty || SAME_REACH_UNCERTAINTY;
        out.depthParts = {
            midIn: mid,
            ft: spot.value,
            band: band,
            bandLow: spot.bandLow,
            bandHigh: spot.bandHigh,
            spreadPct: spot.spreadPct,
            pct: Math.round(out.unc * 100),
            flow: flow
        };
        out.depth = 'hold ~' + mid.toFixed(1) + '" up in ~' + spot.value.toFixed(1) +
            ' ft of water (gauge measurements ' + band + ', \u00b1' + out.depthParts.pct + '%)';
    } else {
        out.depth = 'no measured cross-section at this gauge, so no spot depth';
    }

    // The lie: what the bed velocity says about the water holding them. THREE forms - `lie`
    // carries the number for the detail string, `liePlain` is the beginner phrase the summary
    // prints (no jargon: no "seam", no "riffle lips", no ft/s).
    if (near && typeof near.bottom === 'number') {
        out.bed = near.bottom;
        if (near.bottom > LIE_FAST_FTS) {
            out.lie = 'bed ' + near.bottom.toFixed(1) + ' ft/s: the lie is behind boulders, wood and cut banks';
            out.liePlain = 'the slower pockets behind rocks, logs and cut banks';
        } else if (near.bottom >= LIE_SOFT_FTS) {
            out.lie = 'bed ' + near.bottom.toFixed(1) + ' ft/s: the lie is the seam beside the current tongue';
            out.liePlain = 'the edge where the slow water meets the faster current';
        } else {
            out.lie = 'bed ' + near.bottom.toFixed(1) + ' ft/s: soft water, fish spread over the flats and riffle lips';
            out.liePlain = 'calm, shallow water along the gentle edges and the tail of a pool';
        }
    }

    // The angler's line against that band (only when a solved height is supplied): `line` for
    // the detail string, `linePlain` for the summary.
    if (mid !== null && typeof hgt === 'number' && isFinite(hgt) && zone) {
        if (hgt >= zone.min && hgt <= zone.max) {
            out.line = 'your line at ' + hgt.toFixed(1) + '" is in that band';
            out.linePlain = 'Your rig is right where the fish are.';
        } else {
            out.line = 'your line at ' + hgt.toFixed(1) + '" is ' + Math.abs(hgt - mid).toFixed(1) + '" ' +
                (hgt < zone.min ? 'below' : 'above') + ' that band';
            out.linePlain = 'Your rig is sitting much ' + (hgt < zone.min ? 'lower' : 'higher') +
                ' than the fish, so it is not where they are.';
        }
    }
    return out;
}

// The DETAIL string: every clause with its provenance, for the debug trail and the
// technique's return value. NOT what the HUD prints any more (see fishOutlook).
function whereToFish(zone, hgt) {
    var p = positionParts(zone, hgt);
    var parts = [p.depth];
    if (p.lie) parts.push(p.lie);
    var turb = turbidityTerm();
    if (turb) {
        parts.push(turb.label + ' water (' + turb.fnu.toFixed(1) + ' FNU) puts them ' +
            (turb.shift > 0 ? 'shallower, closer to cover' : 'deeper and tighter'));
    }
    var block = refHourBlock();
    var light = block ? lightTerm(block, getActiveReport()) : null;
    if (light) parts.push(light.label + ' at ' + (block.label || 'this hour') + ' keeps them ' +
        (light.shift > 0 ? 'up' : 'deep'));
    var tide = block ? tideTerm(block, getActiveReport()) : null;
    if (tide) parts.push(tide.label + ' at ' + (block.label || 'this hour') + ' moves them ' +
        (tide.shift > 0 ? 'up' : 'deep'));
    if (p.line) parts.push(p.line);
    return 'Where to fish: ' + parts.join('; ') + '.';
}

// ==================================================================================
// THE SUMMARY (direct user asks: 2026-09-29 restructure, then the beginner rewrite)
//
// TWO sentences, max, written for someone who has never fished: what the fish are likely
// doing and where to look, then whether the angler's rig is where they are.
//
// NO JARGON IN HERE. The reader of this paragraph does not know what an inch of line
// height is, what CFS means, what a gauge is, or what "riffle lips" are. So this text
// carries no numbers except a plainly-worded depth, no "line height", no provenance.
//
// WHAT HAPPENED TO THE PRECISION (deliberate, not lost): the depth band, the flow, the
// gauge and the +/-20% all still exist on `positionParts()`/`whereToFish()`, which the
// debug trail prints. The HUD's job is the plain-English headline; the log's job is the
// numbers. Same data, two audiences.
//
// Also deliberately NOT here: the driver list ("Most of that is the heavy cloud...") and
// any claim that the fish are FEEDING - in-river adults stage, they do not feed, and a fly
// gets taken out of reaction/territory. "More willing to grab" is the hedge for that.
// ==================================================================================
var OUTLOOK_BANDS = [
    { min:  2.0,      tag: 'Fish are likely holding higher in the water and more willing to grab' },
    { min:  0.7,      tag: 'Fish are likely holding a bit higher than usual' },
    { min: -0.7,      tag: 'Fish are about where you would normally expect them' },
    { min: -2.0,      tag: 'Fish are holding deep and staying tight' },
    { min: -Infinity, tag: 'Fish are holding deep and not very active' }
];

// '2-4 feet deep' from the measured band (whole feet: the reader does not need decimals).
function plainDepthText(p) {
    if (!p || !p.depthParts) return null;
    var low = Number(p.depthParts.bandLow), high = Number(p.depthParts.bandHigh);
    var lo = (isFinite(low) && low > 0) ? Math.floor(low) : Math.floor(Number(p.depthParts.ft));
    var hi = (isFinite(high) && high > 0) ? Math.ceil(high) : Math.ceil(Number(p.depthParts.ft));
    if (!isFinite(lo) || !isFinite(hi) || hi <= 0) return null;
    if (hi <= lo) hi = lo + 1;                       // never "3-3 feet deep"
    return lo + '-' + hi + ' feet deep';
}

function fishOutlook(zone, hgt) {
    var z = zone || { min: BASE_ZONE_MIN, max: BASE_ZONE_MAX, shift: 0, report: null };
    var shift = Number(z.shift) || 0;
    var p = positionParts(z, hgt);
    var sentences = [];

    if (!z.report) {
        // No report -> nothing to claim about behaviour. Say what is being shown, plainly.
        sentences.push('No water report loaded yet, so this is just the standard starting estimate.');
    } else {
        var tag = OUTLOOK_BANDS[OUTLOOK_BANDS.length - 1].tag;
        for (var i = 0; i < OUTLOOK_BANDS.length; i++) {
            if (shift >= OUTLOOK_BANDS[i].min) { tag = OUTLOOK_BANDS[i].tag; break; }
        }
        var deep = plainDepthText(p);
        var one = tag;
        if (p.liePlain || deep) {
            one += ' \u2014 look for ' + (p.liePlain || 'the calmer water');
            if (deep) one += ' (about ' + deep + ')';
        }
        sentences.push(one + '.');
    }

    // Sentence 2: is the angler's rig where the fish are? (only once a rig is solved)
    if (p.linePlain) sentences.push(p.linePlain);

    return sentences.join(' ');
}

// Paint the HUD's zone banner (number + gradient colour) and the ONE summary paragraph
// under the banners. Shared by the live preview below and by runSim()'s paintSimHud(), so
// the banner and the summary can never disagree. `outlook` (optional) is a precomputed
// fishOutlook() string so the solved HUD and the preview match exactly.
function paintZoneHud(zone, outlook) {
    var trend = zoneTrend(zone);
    var range = document.getElementById('hud-zone');
    if (range) {
        range.innerText = zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"';
        range.style.color = trend.color;          // the gradient IS the estimate's colour
    }
    var where = document.getElementById('hud-where');
    if (where) {
        var text = outlook || ((typeof fishOutlook === 'function') ? fishOutlook(zone) : '');
        where.textContent = text;                 // data text -> textContent, never innerHTML
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

// ==================================================================================
// THE RIG SEARCH (reworked 2026-09-29 on a direct user ask)
//
// Anglers on the bank change the CORKY first, then add a second corky, then move hook
// size, yarn and beads — and they set leader length and lead weight once and leave them.
// So the search runs in TWO passes:
//
//   PASS 1  leader + lead FIXED: sweep corky x second corky x yarn x hook x bead size.
//           If any of those lands in the zone, that IS the suggestion.
//   PASS 2  leader + lead free as well — run ONLY when pass 1 cannot reach the zone at
//           all, so "change your leader" is the fallback, never the first answer.
//
// Within a pass, cost = distance from the zone middle + a small penalty per component
// changed (cheapest-to-change first), so the suggestion is the smallest edit that works.
// The projection uses the SAME locked physics the sim does (Cd = 1.0). The line diameters
// are deliberately NOT passed, matching the previous behaviour: the angler's lines are
// held FIXED by the search, so only the class-level drag matters here.
// ==================================================================================
var CHANGE_PENALTY = { foam: 0.05, foam2: 0.06, hook: 0.08, yarn: 0.10, bead: 0.12, leader: 0.30, weight: 0.35 };
var YARN_OPTIONS = [0, 0.5, 1, 2, 3];      // inches of yarn on the hook
var HOOK_OPTIONS = [2, 1, 0, -1];          // 2 / 1 = size 2 / 1, 0 = 1/0, -1 = 2/0

// Bead sizes the current material owns (library-driven), always including what is tied on.
function beadSizeOptions(bdMat, bdSz) {
    var opts = [];
    if (typeof tackleBeadSizes === 'function') {
        tackleBeadSizes(bdMat).forEach(function (o) {
            var mm = Number(o.value);
            if (isFinite(mm) && opts.indexOf(mm) === -1) opts.push(mm);
        });
    }
    if (opts.indexOf(Number(bdSz)) === -1) opts.push(Number(bdSz));
    return opts;
}

// 'Corky 12' / 'Cheater 10 float' / 'None' - the picker's own words without the packaging.
function foamShort(foam) {
    var short = String(foam.label || '')
        .replace(' - Size ', ' ')
        .replace(/\s*\(\d+mm\)/, '')
        .replace(' - ', ' ');
    // A Cheater is a float, not a corky - name it honestly in a suggestion list.
    return /cheater/i.test(short) ? short + ' float' : short;
}

// The changes a candidate needs, in the order an angler would actually make them.
function rigChangeList(best, rig) {
    var out = [];
    if (best.foam.key !== rig.foam.key) out.push(foamShort(best.foam));
    if (best.foam2.key !== rig.foam2.key) {
        out.push(best.foam2.key === '0' ? 'drop the second corky' : 'a second ' + foamShort(best.foam2));
    }
    if (Number(best.hook) !== Number(rig.hook)) out.push('hook size ' + hookLabel(Number(best.hook)));
    if (Number(best.yarn) !== Number(rig.yarn)) out.push('yarn at ' + best.yarn + '"');
    if (Number(best.bdSz) !== Number(rig.bdSz)) out.push(best.bdSz + 'mm bead');
    if (Number(best.leader) !== Number(rig.ldLen)) out.push('a ' + best.leader + ' ft leader');
    if (Number(best.weight) !== Number(rig.weightOz)) out.push(best.weight + ' oz lead');
    return out;
}

// THE SAME CHANGES IN PLAIN WORDS, for the HUD (direct user ask: a reader who does not know
// the tackle or the terms should still be able to act). Direction only - no sizes, no brands,
// no numbers: "a bigger corky" says what to do without asking the reader to know what a
// "Cheater 10 float" is. The precise list above still goes to the debug trail.
function rigChangePlain(best, rig) {
    var up = [];
    if (best.foam.key !== rig.foam.key) up.push(best.foam.lift > rig.foam.lift ? 'a bigger corky' : 'a smaller corky');
    if (best.foam2.key !== rig.foam2.key) {
        if (best.foam2.key === '0') up.push('drop the second corky');
        else if (rig.foam2.key === '0') up.push('a second corky');
        else up.push(best.foam2.lift > rig.foam2.lift ? 'a bigger second corky' : 'a smaller second corky');
    }
    if (Number(best.hook) !== Number(rig.hook)) {
        // A lighter hook sinks less, so it lifts the rig: hookSink decreases as the size grows.
        up.push(hookSink(best.hook) < hookSink(rig.hook) ? 'a smaller hook' : 'a bigger hook');
    }
    if (Number(best.yarn) !== Number(rig.yarn)) up.push(Number(best.yarn) > Number(rig.yarn) ? 'more yarn' : 'less yarn');
    if (Number(best.bdSz) !== Number(rig.bdSz)) {
        up.push(beadSink(rig.bdMat, best.bdSz) < beadSink(rig.bdMat, rig.bdSz) ? 'a lighter bead' : 'a heavier bead');
    }
    if (Number(best.leader) !== Number(rig.ldLen)) up.push(Number(best.leader) > Number(rig.ldLen) ? 'a longer leader' : 'a shorter leader');
    if (Number(best.weight) !== Number(rig.weightOz)) up.push(Number(best.weight) > Number(rig.weightOz) ? 'more weight' : 'less weight');
    return up;
}

// 'a, b and c' - a plain-language list.
function joinPlain(items) {
    if (!items || !items.length) return '';
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

function bestZoneRig(zone, rig, vel) {
    var target = (zone.min + zone.max) / 2;
    var bed = vel.bottom;
    var beads = beadSizeOptions(rig.bdMat, rig.bdSz);
    var passes = [
        { weights: [rig.weightOz], leaders: [rig.ldLen] },            // tackle swaps only
        { weights: WEIGHT_OPTIONS, leaders: LEADER_LENGTH_OPTIONS }   // leader / lead allowed
    ];
    var fallback = null;
    for (var p = 0; p < passes.length; p++) {
        var passBest = null;
        for (var f = 0; f < FOAM_KEYS.length; f++) {
            var foam = parseFoam(FOAM_KEYS[f]);
            for (var f2 = 0; f2 < FOAM_KEYS.length; f2++) {
                var foam2 = parseFoam(FOAM_KEYS[f2]);
                var liftBase = foam.lift + foam2.lift;
                for (var y = 0; y < YARN_OPTIONS.length; y++) {
                    for (var h = 0; h < HOOK_OPTIONS.length; h++) {
                        for (var b = 0; b < beads.length; b++) {
                            var lift = rigLift(liftBase, YARN_OPTIONS[y], HOOK_OPTIONS[h], rig.bdMat, beads[b]);
                            var changed = [];
                            if (FOAM_KEYS[f] !== rig.foam.key) changed.push('foam');
                            if (FOAM_KEYS[f2] !== rig.foam2.key) changed.push('foam2');
                            if (HOOK_OPTIONS[h] !== Number(rig.hook)) changed.push('hook');
                            if (YARN_OPTIONS[y] !== Number(rig.yarn)) changed.push('yarn');
                            if (beads[b] !== Number(rig.bdSz)) changed.push('bead');
                            for (var w = 0; w < passes[p].weights.length; w++) {
                                var wt = passes[p].weights[w];
                                var drag = totalDragPerFt(bed, rig.ldLb, rig.ldMat, rig.mlLb, rig.mlMat, wt,
                                    HOOK_OPTIONS[h], YARN_OPTIONS[y], rig.bdMat, beads[b],
                                    0, 0, rig.weightShape);
                                for (var l = 0; l < passes[p].leaders.length; l++) {
                                    var len = passes[p].leaders[l];
                                    var hgt = presentationHeightInches(lift, len, drag);
                                    if (!isFinite(hgt) || hgt <= 0) continue;
                                    var cost = Math.abs(hgt - target);
                                    for (var c = 0; c < changed.length; c++) cost += (CHANGE_PENALTY[changed[c]] || 0.1);
                                    if (Number(len) !== Number(rig.ldLen)) cost += CHANGE_PENALTY.leader;
                                    if (Number(wt) !== Number(rig.weightOz)) cost += CHANGE_PENALTY.weight;
                                    var cand = {
                                        cost: cost, hgt: hgt, foam: foam, foam2: foam2,
                                        hook: HOOK_OPTIONS[h], yarn: YARN_OPTIONS[y], bdSz: beads[b],
                                        weight: wt, leader: len
                                    };
                                    if (!passBest || cost < passBest.cost) passBest = cand;
                                }
                            }
                        }
                    }
                }
            }
        }
        // A tackle-only PASS 1 that reaches the zone WINS - that is the whole point of the
        // priority order. Otherwise remember the closest attempt and let pass 2 try.
        if (passBest && passBest.hgt >= zone.min && passBest.hgt <= zone.max) return passBest;
        if (passBest && (!fallback || passBest.cost < fallback.cost)) fallback = passBest;
    }
    return fallback;
}
