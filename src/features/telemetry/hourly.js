/**
 * src/features/telemetry/hourly.js - the tap-a-pill HOURLY popup (WS-4).
 *
 * Tapping any of the six weather pills opens that day's own 24-hour strip for the tapped
 * metric. The strip is the day's real hourly forecast (Open-Meteo), the REFERENCE HOUR the
 * card reports is highlighted, and the row auto-scrolls to it. Nothing is invented: a missing
 * hour value renders "--".
 *
 * public: HOURLY_METRICS, openHourlyPopup(metricKey), closeHourlyPopup()
 * ES module.
 */
import { logDebug } from '../../shared/debug.js';
// metric -> display spec. The keys are the SAME keys the pill uses in `weather_hourly`.
var HOURLY_METRICS = {
    'pressure':       { label: 'Barometer', unit: ' inHg', dec: 2 },
    'pop_pct':        { label: 'Precip Chance', unit: '%', dec: 0, wetAt: 30 },
    'precip_in':      { label: 'Precip Volume', unit: '"', dec: 2 },
    'cloud_pct':      { label: 'Cloud Cover', unit: '%', dec: 0 },
    'air_temp_f':     { label: 'Air Temp', unit: '\u00b0F', dec: 0 },
    'wind_speed_mph': { label: 'Wind', unit: ' mph', dec: 0, withDir: true }
};

export function closeHourlyPopup() {
    var modal = document.getElementById('hourly-modal');
    if (modal) modal.style.display = 'none';
}
window.closeHourlyPopup = closeHourlyPopup;

// Open the strip for one metric on the day the angler is LOOKING AT (activeDateOffset).
export function openHourlyPopup(metricKey) {
    var spec = HOURLY_METRICS[metricKey];
    var modal = document.getElementById('hourly-modal');
    var strip = document.getElementById('hourly-strip');
    if (!spec || !modal || !strip) return;
    var rep = (typeof reportsData !== 'undefined' && reportsData.length)
        ? reportsData[Math.min(Math.max(activeDateOffset, 0), reportsData.length - 1)] : null;
    var rows = (rep && rep.weather_hourly) ? rep.weather_hourly : [];
    var ref = (rep && rep.weather_hour) ? rep.weather_hour : null;

    var title = document.getElementById('hourly-title');
    if (title) title.innerText = spec.label;
    var sub = document.getElementById('hourly-sub');
    if (sub) {
        var bits = [];
        if (rep && rep.title) bits.push(rep.title);
        if (ref && ref.label) bits.push('reporting ' + ref.label);
        // The DAILY precipitation total is honest context for both precip metrics (the pill
        // itself shows the reference hour); it is the same number the Gear Sim calls rain.
        if ((metricKey === 'precip_in' || metricKey === 'pop_pct') && rep && provVal(rep.rain) != null) {
            bits.push('day total ' + Number(provVal(rep.rain)).toFixed(2) + '"');
        }
        if (!rows.length) bits.push('hourly forecast unavailable');
        sub.innerText = bits.join(' \u00b7 ');
    }

    strip.innerHTML = '';
    rows.forEach(function (r) {
        var v = r[metricKey];
        var cell = document.createElement('div');
        cell.className = 'hour-cell';
        if (ref && r.iso === ref.iso) cell.className += ' hour-cell-now';
        if (spec.wetAt && v != null && Number(v) >= spec.wetAt) cell.className += ' hour-cell-wet';
        var t = document.createElement('div');
        t.className = 'hour-cell-t';
        t.textContent = r.label || '--';
        var val = document.createElement('div');
        val.className = 'hour-cell-v';
        val.textContent = (v == null ? '--' : Number(v).toFixed(spec.dec) + spec.unit);
        cell.appendChild(t);
        cell.appendChild(val);
        if (spec.withDir) {
            var dir = document.createElement('div');
            dir.className = 'hour-cell-d';
            dir.textContent = r.wind_dir_compass || '--';
            cell.appendChild(dir);
        }
        strip.appendChild(cell);
    });

    modal.style.display = 'block';
    // Centre the reference hour (the strip is wider than the screen: swipe / scroll it).
    var now = strip.getElementsByClassName('hour-cell-now')[0];
    if (now && strip.scrollWidth > strip.clientWidth) {
        strip.scrollLeft = Math.max(0, now.offsetLeft - (strip.clientWidth - now.offsetWidth) / 2);
    }
    logDebug('Hourly popup: ' + metricKey + ' (' + rows.length + ' rows)', 'UI');
}
