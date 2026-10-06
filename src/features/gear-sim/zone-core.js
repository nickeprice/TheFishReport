/**
 * src/features/gear-sim/zone-core.js - strike zone computation, positioning,
 * and HUD painting. Extracted from original zone.js (906 lines).
 * public: computeStrikeZone(), gradeColor(), zoneColor(), zoneTrend(),
 *         depthBandText(), positionParts(), whereToFish(), plainDepthText(),
 *         fishOutlook(), paintZoneHud(), refreshZonePreview()
 * ES module.
 */
import { getActiveReport, getCurrentFlow } from './sonar.js';
import { provVal } from '../../shared/format.js';
import { getWaterTempF, lightTerm, tideTerm } from './zone-env.js';
import { BASE_ZONE_MIN, BASE_ZONE_MAX, thermalOptimum } from './inputs.js';
export function computeStrikeZone(sonar) {
    var zone = { min: BASE_ZONE_MIN, max: BASE_ZONE_MAX, shift: 0, sonarShift: 0, notes: [], report: null, sonar: null };
    var rep = getActiveReport();
    if (!rep) {
        zone.notes.push('No water report loaded: using the baseline 4.0" - 12.0" strike zone.');
    } else {
        zone.report = rep;
        var pressureDelta = Number(rep.press_delta);
        if (!isNaN(pressureDelta)) {
            if (pressureDelta <= -0.03) { zone.shift += 1.2; zone.notes.push('Barometer falling ' + pressureDelta.toFixed(2) + ' inHg: bladders expand, fish ride a little higher.'); }
            else if (pressureDelta >= 0.03) { zone.shift -= 1.2; zone.notes.push('Barometer rising ' + pressureDelta.toFixed(2) + ' inHg: fish pin down a little (lockjaw).'); }
        }
        var cloud = Number(provVal(rep.cloud_pct));
        if (!isNaN(cloud)) {
            if (cloud >= 70) { zone.shift += 1.5; zone.notes.push('Heavy cloud cover (' + cloud + '%): fish feel safe riding higher.'); }
            else if (cloud <= 30) { zone.shift -= 1.5; zone.notes.push('Bright sun (' + cloud + '% cloud): fish hold deep and tight.'); }
        }
        var rain = Number(provVal(rep.rain));
        if (!isNaN(rain) && rain > 0.25) { zone.shift += 1.0; zone.notes.push('Rain freshet (' + rain.toFixed(2) + '"): coloured water, run a bigger profile.'); }
        var temp = getWaterTempF();
        var th = thermalOptimum(temp);
        if (th) { zone.shift += th.shift; zone.notes.push('Water ' + th.tempF.toFixed(0) + 'F (' + th.range + 'F band): ' + th.note); }
        var turb = turbidityTerm();
        if (turb) { zone.shift += turb.shift; zone.notes.push(turb.label.charAt(0).toUpperCase() + turb.label.slice(1) + ' water (' + turb.fnu.toFixed(1) + ' FNU): ' + turb.note); }
        var block = refHourBlock();
        var light = block ? lightTerm(block, rep) : null;
        if (light) { zone.shift += light.shift; var when = block.label ? ' (' + block.label + ')' : ''; zone.notes.push(light.label.charAt(0).toUpperCase() + light.label.slice(1) + when + ': ' + light.note); }
        var tide = tideTerm(block, rep);
        if (tide) { zone.shift += tide.shift; zone.notes.push('Tide ' + tide.trend + ' (' + tide.heightFt.toFixed(1) + ' ft): ' + tide.note); }
    }
    var zMin = BASE_ZONE_MIN + zone.shift;
    var zMax = BASE_ZONE_MAX + zone.shift;
    if (sonar && sonar.center !== null && sonar.center !== undefined && isFinite(sonar.center) && sonar.samples >= 1) {
        var weatherCenter = (zMin + zMax) / 2;
        var halfWidth = (zMax - zMin) / 2;
        var effective = (sonar.matched && sonar.matched >= 1) ? sonar.matched : sonar.samples;
        var pull = Math.min(SONAR_PULL_MAX, SONAR_PULL_FLOOR + (effective * SONAR_PULL_STEP));
        var blended = weatherCenter + ((sonar.center - weatherCenter) * pull);
        zone.sonarShift = blended - weatherCenter;
        zMin = blended - halfWidth; zMax = blended + halfWidth; zone.sonar = sonar;
        zone.notes.push('Recent catches pull the zone ' +
            (zone.sonarShift >= 0 ? '+' : '') + zone.sonarShift.toFixed(1) +
            '" toward where fish are being caught.');
    }
    if (zMin < 1.0) zMin = 1.0;
    if (zMax > 24.0) zMax = 24.0;
    if (zMax - zMin < 4.0) zMax = zMin + 4.0;
    zone.min = zMin;
    zone.max = zMax;
    zone.notes.unshift('Strike zone shifted ' + (zone.shift >= 0 ? '+' : '') + zone.shift.toFixed(1) + '" to ' + zMin.toFixed(1) + '" - ' + zMax.toFixed(1) + '".');
    return zone;
}

// NOTE: `zone.notes` is the audit trail paintSimHud() writes to logDebug.
// THE shared colour grade: d=0 (on target) -> 1 (furthest from target).
export function gradeColor(d) {
    if (!(d > 0)) d = 0; if (d > 1) d = 1;
    var t = d * 2;
    var hue = (t <= 1) ? (140 - 88 * t) : (52 - 52 * (t - 1));
    return 'hsl(' + Math.round(hue) + ', 72%, 46%)';
}

export function zoneColor(hgt, zone) {
    var center = (zone.min + zone.max) / 2;
    var half = Math.max(0.5, (zone.max - zone.min) / 2);
    var q = Math.round(hgt * 10) / 10;
    return gradeColor(Math.abs(q - center) / half);
}

var ZONE_TREND_FULL_SCALE = 7.0;
var SONAR_PULL_MAX = 0.40;
var SONAR_PULL_FLOOR = 0.10;
var SONAR_PULL_STEP = 0.0375;

export function zoneTrend(zone) {
    var baseMid = (BASE_ZONE_MIN + BASE_ZONE_MAX) / 2;
    var offset = Math.round((((zone.min + zone.max) / 2) - baseMid) * 10) / 10;
    var ratio = Math.abs(offset) / ZONE_TREND_FULL_SCALE;
    if (ratio > 1) ratio = 1;
    return { offset: offset, ratio: ratio, color: gradeColor(ratio) };
}
var LIE_SOFT_FTS = 1.5;
var LIE_FAST_FTS = 3.0;
var DEPTH_BAND_MIN_FT = 0.2;

export function depthBandText(spot) {
    if (!spot || !(spot.value > 0)) return null;
    var low = Number(spot.bandLow), high = Number(spot.bandHigh);
    if (isFinite(low) && isFinite(high) && (high - low) >= DEPTH_BAND_MIN_FT && low > 0) {
        return low.toFixed(1) + '-' + high.toFixed(1) + ' ft';
    }
    return spot.value.toFixed(1) + ' ft';
}

export function positionParts(zone, hgt) {
    var flow = getCurrentFlow();
    var siteId = (typeof getActiveStationId === 'function') ? getActiveStationId() : null;
    var spot = (typeof spotDepthFt === 'function') ? spotDepthFt(flow, siteId) : null;
    var near = (typeof velocityAtSpot === 'function') ? velocityAtSpot(flow, siteId) : null;
    var mid = (zone && isFinite(zone.min) && isFinite(zone.max)) ? (zone.min + zone.max) / 2 : null;
    var out = { depth: null, lie: null, liePlain: null, line: null, linePlain: null, depthParts: null, bed: null, unc: null };
    if (spot && spot.value > 0 && mid !== null) {
        var band = depthBandText(spot);
        out.unc = spot.uncertainty || SAME_REACH_UNCERTAINTY;
        out.depthParts = { midIn: mid, ft: spot.value, band: band, bandLow: spot.bandLow, bandHigh: spot.bandHigh, spreadPct: spot.spreadPct, pct: Math.round(out.unc * 100), flow: flow };
        out.depth = 'hold ~' + mid.toFixed(1) + '" up in ~' + spot.value.toFixed(1) + ' ft of water (gauge measurements ' + band + ', \u00b1' + out.depthParts.pct + '%)';
    } else { out.depth = 'no measured cross-section at this gauge, so no spot depth'; }
    if (near && typeof near.bottom === 'number') {
        out.bed = near.bottom;
        if (near.bottom > LIE_FAST_FTS) { out.lie = 'bed ' + near.bottom.toFixed(1) + ' ft/s: behind boulders, wood and cut banks'; out.liePlain = 'the slower pockets behind rocks, logs and cut banks'; }
        else if (near.bottom >= LIE_SOFT_FTS) { out.lie = 'bed ' + near.bottom.toFixed(1) + ' ft/s: the seam beside the current tongue'; out.liePlain = 'the edge where the slow water meets the faster current'; }
        else { out.lie = 'bed ' + near.bottom.toFixed(1) + ' ft/s: soft water, fish spread over the flats and riffle lips'; out.liePlain = 'calm, shallow water along the gentle edges and the tail of a pool'; }
    }
    if (mid !== null && typeof hgt === 'number' && isFinite(hgt) && zone) {
        if (hgt >= zone.min && hgt <= zone.max) { out.line = 'your line at ' + hgt.toFixed(1) + '" is in that band'; out.linePlain = 'Your rig is right where the fish are.'; }
        else { out.line = 'your line at ' + hgt.toFixed(1) + '" is ' + Math.abs(hgt - mid).toFixed(1) + '" ' + (hgt < zone.min ? 'below' : 'above') + ' that band'; out.linePlain = 'Your rig is sitting much ' + (hgt < zone.min ? 'lower' : 'higher') + ' than the fish.'; }
    }
    return out;
}

export function whereToFish(zone, hgt) {
    var p = positionParts(zone, hgt);
    var parts = [p.depth];
    if (p.lie) parts.push(p.lie);
    var turb = turbidityTerm();
    if (turb) parts.push(turb.label + ' water (' + turb.fnu.toFixed(1) + ' FNU) puts them ' + (turb.shift > 0 ? 'shallower, closer to cover' : 'deeper and tighter'));
    var block = refHourBlock();
    var light = block ? lightTerm(block, getActiveReport()) : null;
    if (light) parts.push(light.label + ' at ' + (block.label || 'this hour') + ' keeps them ' + (light.shift > 0 ? 'up' : 'deep'));
    var tide = block ? tideTerm(block, getActiveReport()) : null;
    if (tide) parts.push(tide.label + ' at ' + (block.label || 'this hour') + ' moves them ' + (tide.shift > 0 ? 'up' : 'deep'));
    if (p.line) parts.push(p.line);
    return 'Where to fish: ' + parts.join('; ') + '.';
}
var OUTLOOK_BANDS = [
    { min: 2.0, tag: 'Fish are likely holding higher in the water and more willing to grab' },
    { min: 0.7, tag: 'Fish are likely holding a bit higher than usual' },
    { min: -0.7, tag: 'Fish are about where you would normally expect them' },
    { min: -2.0, tag: 'Fish are holding deep and staying tight' },
    { min: -Infinity, tag: 'Fish are holding deep and not very active' }
];

export function plainDepthText(p) {
    if (!p || !p.depthParts) return null;
    var low = Number(p.depthParts.bandLow), high = Number(p.depthParts.bandHigh);
    var lo = (isFinite(low) && low > 0) ? Math.floor(low) : Math.floor(Number(p.depthParts.ft));
    var hi = (isFinite(high) && high > 0) ? Math.ceil(high) : Math.ceil(Number(p.depthParts.ft));
    if (!isFinite(lo) || !isFinite(hi) || hi <= 0) return null;
    if (hi <= lo) hi = lo + 1;
    return lo + '-' + hi + ' feet deep';
}

export function fishOutlook(zone, hgt) {
    var z = zone || { min: BASE_ZONE_MIN, max: BASE_ZONE_MAX, shift: 0, report: null };
    var shift = Number(z.shift) || 0;
    var p = positionParts(z, hgt);
    var sentences = [];
    if (!z.report) { sentences.push('No water report loaded yet, so this is just the standard starting estimate.'); }
    else {
        var tag = OUTLOOK_BANDS[OUTLOOK_BANDS.length - 1].tag;
        for (var i = 0; i < OUTLOOK_BANDS.length; i++) { if (shift >= OUTLOOK_BANDS[i].min) { tag = OUTLOOK_BANDS[i].tag; break; } }
        var deep = plainDepthText(p);
        var one = tag;
        if (p.liePlain || deep) { one += ' \u2014 look for ' + (p.liePlain || 'the calmer water'); if (deep) one += ' (about ' + deep + ')'; }
        sentences.push(one + '.');
    }
    if (p.linePlain) sentences.push(p.linePlain);
    return sentences.join(' ');
}

export function paintZoneHud(zone, outlook) {
    var trend = zoneTrend(zone);
    var range = document.getElementById('hud-zone');
    if (range) { range.innerText = zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"'; range.style.color = trend.color; }
    var where = document.getElementById('hud-where');
    if (where) { var text = outlook || ((typeof fishOutlook === 'function') ? fishOutlook(zone) : ''); where.textContent = text; }
}

export function refreshZonePreview() {
    paintZoneHud(computeStrikeZone());

}