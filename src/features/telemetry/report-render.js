/**
 * src/features/telemetry/report-render.js - water-report day-card rendering.
 * Splintered from report.js. ES module.
 */
import { logDebug } from '../../shared/debug.js';
import { provVal } from '../../shared/format.js';
import { buildFishingHero, buildSpeciesCalendarHtml } from './hero.js';
import { refreshZonePreview } from '../gear-sim/zone-core.js';
import { activeDateOffset } from './daynav.js';
import { renderCfsTrend, refreshEscapement, refreshWdfwForecast, fetchCFSMomentum } from '../../services/water.js';
import { formatTideRow } from './tide.js';

/**
 * Render the day cards, species calendar, tide, and environmental conditions.
 * Extracted from loadWaterReport to keep files under 150 lines.
 */
export function renderReportDays(reports, station, rulesLoaded) {
    if (!reports || !reports.length) {
        logDebug('No river data to render', 'NET');
        return rulesLoaded;
    }
    const first = reports[0];
    const actId = first.site_id || station.id;

    // Update station name from payload
    if (first.site_name) {
        document.getElementById('active-station-name').innerText = first.site_name.toUpperCase();
    }
    const badge = document.getElementById('active-station-badge');
    badge.innerText = (station.isGps ? "📍 GPS: " : "📌 USGS: ") + actId;

    // Seasonal warning
    let seasonalWarn = '';
    if (first.seasonal_warning && first.seasonal_warning !== '') {
        seasonalWarn = '<div class="seasonal-warning">' + provVal(first.seasonal_warning) + '</div>';
    }

    // Today's barometer / cloud / rain for the Gear Sim strike zone
    if (typeof refreshZonePreview === 'function') refreshZonePreview();

    let cardsHtml = '';
    for (let i = 0; i < reports.length; i++) {
        const rep = reports[i];
        const dStyle = (i === activeDateOffset) ? "block" : "none";

        // CFS + gage
        const cfsVal = (provVal(rep.cfs) !== null) ? provVal(rep.cfs) + ' CFS' : '-- CFS';
        const gageVal = (provVal(rep.gage) !== null) ? provVal(rep.gage) + ' ft Gauge Height' : '-- ft Gauge Height';

        // Water quality
        let waterQualityHtml = '';
        const wt = provVal(rep.water_temp_f);
        const tb = provVal(rep.turbidity_fnu);
        if (wt !== null || tb !== null) {
            const parts = [];
            if (wt !== null) parts.push(Math.round(Number(wt)) + '°F');
            if (tb !== null) parts.push(Number(tb).toFixed(0) + ' FNU');
            waterQualityHtml = ' <span class="telemetry-sep">•</span> <span class="telemetry-water-quality">' + parts.join(' • ') + '</span>';
        }

                // Pressure trend for barometer and temp badges
        const pressDelta = rep.press_delta;
        let pressTrend = '\u2014';
        let pressColor = '#ffffff';
        if (pressDelta !== null && pressDelta !== undefined && pressDelta < -0.04) { pressTrend = '\u2193'; pressColor = 'var(--accent-red)'; }
        else if (pressDelta !== null && pressDelta !== undefined && pressDelta > 0.04) { pressTrend = '\u2191'; pressColor = 'var(--accent-green)'; }
cardsHtml += '<div id="' + rep.id + '" class="day-card" style="display: ' + dStyle + ';">' +
            '<div class="card">' +
            '<div class="sec-hdr">[ FISHING OUTLOOK ]</div>' +
            buildFishingHero(rep) +
            '<div class="sec-hdr">[ RIVER &amp; ENVIRONMENTAL CONDITIONS ]</div>' +
            seasonalWarn +
            '<div class="env-telemetry-row">' +
              '<div class="telemetry-main">' +
                '<span class="telemetry-val"><span class="cfs-val">' + cfsVal + '</span><span class="telemetry-sep">&bull;</span><span class="gage-val">' + gageVal + '</span></span>' +
                waterQualityHtml +
              '</div>' +
              '<div class="telemetry-updated">' + (rep.updated_time || '') + '</div>' +
            '</div>' +
            (typeof formatTideRow === 'function' ? formatTideRow(rep.tide_chart, provVal(rep.tide_curve), provVal(rep.tide_points)) : '') +
            '<div class="env-weather-solunar">' +
              '<div class="env-stat-grid">' +
                '<div class="env-badge env-badge-tap" onclick="openHourlyPopup(\'cloud_pct\')"><div class="env-badge-val">' + ((provVal(rep.weather_hour) && rep.weather_hour.cloud_pct != null) ? rep.weather_hour.cloud_pct : '--') + '%</div><div class="env-badge-lbl">Cloud Cover</div></div>' +
                '<div class="env-badge env-badge-tap" onclick="openHourlyPopup(\'pop_pct\')"><div class="env-badge-val"><span class="precip-pop">--</span>%</div><div class="env-badge-lbl">Precip %</div></div>' +
                '<div class="env-badge env-badge-tap" onclick="openHourlyPopup(\'precip_in\')"><div class="env-badge-val"><span class="precip-vol">--</span>"</div><div class="env-badge-lbl">Precip Vol</div></div>' +
                '<div class="env-badge env-badge-tap" onclick="openHourlyPopup(\'pressure\')"><div class="env-badge-val" style="color:' + pressColor + ';">' + ((provVal(rep.weather_hour) && rep.weather_hour.pressure != null) ? rep.weather_hour.pressure : '--') + ' <span style="font-size:10px; font-weight:600;">inHg</span> ' + pressTrend + '</div><div class="env-badge-lbl">Barometer</div></div>' +
                '<div class="env-badge env-badge-tap" onclick="openHourlyPopup(\'air_temp_f\')"><div class="env-badge-val" style="color:' + pressColor + ';"><span class="air-temp">--</span>° ' + pressTrend + '</div><div class="env-badge-lbl">Temp</div></div>' +
                '<div class="env-badge env-badge-tap" onclick="openHourlyPopup(\'wind_speed_mph\')"><div class="env-badge-val"><span class="wind-val">--</span></div><div class="env-badge-lbl">Wind</div></div>' +
                '<div class="env-badge"><div class="env-badge-val solunar-split"><div class="solunar-half"><span class="solunar-val" style="color:#fbbf24;">' + (rep.sunrise || '--') + '</span><span class="solunar-sublbl">Sunrise</span></div><div class="solunar-half"><span class="solunar-val" style="color:#64d2ff;">' + (rep.sunset || '--') + '</span><span class="solunar-sublbl">Sunset</span></div></div><div class="env-badge-lbl">Sun / Set</div></div>' +
                '<div class="env-badge"><div class="env-badge-val moon-pill">' + (rep.lunar_icon || '--') + '</div><div class="env-badge-lbl">Moon Phase</div></div>' +
                '<div class="env-badge"><div class="env-badge-val solunar-split"><div class="solunar-half"><span class="solunar-val" style="color:#ffd60a;">' + (rep.moon_upper || '--') + '</span><span class="solunar-sublbl">Overhead</span></div><div class="solunar-half"><span class="solunar-val" style="color:#64d2ff;">' + (rep.moon_lower || '--') + '</span><span class="solunar-sublbl">Underfoot</span></div></div><div class="env-badge-lbl">Solunar</div></div>' +
'</div>' +
            '<div class="sec-hdr">[ RUN &amp; TIMING ]</div>' +
            buildSpeciesCalendarHtml(provVal(rep.species_calendar), provVal(rep.esc_stocks)) +
            '</div></div>';
    }

    // Render cards into DOM
    const container = document.getElementById('water-report-cards');
    if (container) container.innerHTML = cardsHtml;

    // Rules
    if (typeof renderCfsTrend === 'function' && actId) {
        renderCfsTrend(actId, reports);
    }

    // Escapement + forecast
    if (typeof refreshEscapement === 'function') {
        refreshEscapement(actId);
    }
    if (typeof refreshWdfwForecast === 'function') {
        refreshWdfwForecast(actId);
    }
    // CFS momentum
    Promise.all([
        typeof fetchCFSMomentum === 'function' ? fetchCFSMomentum(actId) : Promise.resolve()
    ]).then(function () {
        logDebug('Telemetry batch settled (CFS momentum)', 'NET');
    });

    return rulesLoaded;
}