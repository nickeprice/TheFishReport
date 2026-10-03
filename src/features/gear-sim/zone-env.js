/**
 * src/features/gear-sim/zone-env.js - environmental math for the strike zone:
 * rig requirements, weather terms, tide, light. Extracted from the original
 * zone.js (906 lines) in the 2026-10-02 cleanup split.
 * public: RIG_REQUIRED, missingRigFields(), getWaterTempF(), getTurbidityFnu(),
 *         refHourBlock(), lightTerm(), turbidityTerm(), tideAt(), tideTerm(), envSignature()
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
    { id: 'foam3',    label: 'Bead' }
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
// WS-8b (b2'): b1 replaced fixed clock hours with sunrise/sunset offsets but was still a
// THREE-STEP function (+1.00 / 0 / -0.75), which produced cliffs the light does not have:
// at 47N in late September the 8-9 AM block scored the same +1.00 as a pitch-dark 5-6 AM,
// and the zone jumped 1.75" between consecutive hour blocks. A step function is a lookup
// table wearing a costume.
//
// Now the term is DERIVED GEOMETRY: the sun's elevation comes from the payload's OWN
// sunrise/sunset plus the day's declination, and the shift is a monotone ramp on that
// elevation. The ENDPOINTS are unchanged from b1.
//
// Direction corroborated by Keefer et al. 2013.
var LIGHT_LOW_SHIFT = 1.00;      // sun at/under the horizon edge
var LIGHT_BRIGHT_SHIFT = -0.75;  // sun genuinely high
var LIGHT_SUN_DARK_DEG = 3;      // <= this elevation: full low-light lift
var LIGHT_SUN_NEUTRAL_DEG = 30;  // ramps to neutral here
var LIGHT_SUN_FULL_DEG = 50;     // and to the full high-sun penalty here
var LIGHT_SHIFT_STEP = 0.05;     // quantised: the zone model cannot resolve finer
var LIGHT_DEFAULT_LAT = 47.195;  // default station latitude (same as map default centre)

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
    var n = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000;
    return 23.44 * Math.sin((360 / 365) * (n - 81) * Math.PI / 180);
}

function activeStationLat() {
    var el = document.querySelector('.station-gauge');
    return el ? Number(el.getAttribute('data-lat')) || null : null;
}

// Solar elevation for the reference HOUR, using the payload's OWN sunrise/sunset.
function solarElevationDeg(block, rep) {
    if (!block || !rep) return null;
    var lat = activeStationLat();
    if (!lat || !isFinite(lat)) lat = LIGHT_DEFAULT_LAT;
    var sunrise = parseClockMinutes(rep.sunrise);
    var sunset = parseClockMinutes(rep.sunset);
    if (sunrise === null || sunset === null) return null;
    var decl = solarDeclinationDeg(block.year, block.month, block.day);
    if (decl === null) return null;
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
        shift = Math.round(shift * 20) / 20;
        if (shift === 0) return null;
        return {
            shift: shift,
            elevDeg: Math.round(elev * 10) / 10,
            label: shift > 0 ? 'low light' : 'high sun',
            note: shift > 0 ? 'fish hold higher and are quicker to take.' : 'fish hold deep and tight.'
        };
    }

    // No solar times on this day -> the old fixed brackets
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
// ==================================================================================
var TIDE_RISING_SHIFT = 1.00;    // flood: fish move up with the push
var TIDE_FALLING_SHIFT = -1.00;  // ebb: fish drop back to deeper water
// The tide at the report's reference hour: { heightFt, trend, shift } or null when the day
// carries no hourly tide curve.
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
        if (d > 12) d = 24 - d;
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
    if (!t || t.shift === 0) return null;
    return {
        shift: t.shift, trend: t.trend, heightFt: t.heightFt,
        label: t.trend + ' tide',
        note: (t.shift > 0) ? 'fish push up into shallower water with the flood.'
                            : 'fish drop back into deeper holding water on the ebb.'
    };
}

// ==================================================================================
// THE ENVIRONMENT SIGNATURE
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