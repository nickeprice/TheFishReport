/**
 * src/features/telemetry/report-render.js - water-report day-card rendering.
 * Splintered from report.js. ES module.
 */
import { logDebug } from '../../shared/debug.js';
import { provVal } from '../../shared/format.js';
import { buildFishingHero, buildSpeciesCalendarHtml } from './hero.js';
import { refreshZonePreview } from '../gear-sim/zone-core.js';
import { activeDateOffset } from './daynav.js';
import { renderCfsTrend, formatEscapementUpdated, refreshEscapement, refreshWdfwForecast, fetchCFSMomentum } from '../../services/water.js';
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
    var first = reports[0];
    var actId = first.site_id || station.id;

    // Update station name from payload
    if (first.site_name) {
        document.getElementById('active-station-name').innerText = first.site_name.toUpperCase();
    }
    var badge = document.getElementById('active-station-badge');
    badge.innerText = (station.isGps ? "📍 GPS: " : "📌 USGS: ") + actId;

    // Seasonal warning
    var seasonalWarn = '';
    if (first.seasonal_warning && first.seasonal_warning !== '') {
        seasonalWarn = '<div class="seasonal-warning">' + provVal(first.seasonal_warning) + '</div>';
    }

    // Today's barometer / cloud / rain for the Gear Sim strike zone
    if (typeof refreshZonePreview === 'function') refreshZonePreview();

    var cardsHtml = '';
    for (var i = 0; i < reports.length; i++) {
        var rep = reports[i];
        var dStyle = (i === activeDateOffset) ? "block" : "none";

        // CFS + gage
        var cfsVal = (provVal(rep.gage) !== null) ? provVal(rep.gage) + ' cfs' : '-- cfs';
        var gageVal = (provVal(rep.gage_ft) !== null) ? provVal(rep.gage_ft) + ' ft' : '--';

        // Water quality
        var waterQualityHtml = '';
        var wt = provVal(rep.water_temp_f);
        var tb = provVal(rep.turbidity_fnu);
        if (wt !== null || tb !== null) {
            var parts = [];
            if (wt !== null) parts.push(Math.round(Number(wt)) + '°F');
            if (tb !== null) parts.push(Number(tb).toFixed(0) + ' FNU');
            waterQualityHtml = ' <span class="telemetry-sep">•</span> <span class="telemetry-water-quality">' + parts.join(' • ') + '</span>';
        }

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
                // Weather pills rendered by hourly.js openHourlyPopup
              '</div>' +
            '</div>' +
            '<div class="sec-hdr">[ RUN &amp; TIMING ]</div>' +
            buildSpeciesCalendarHtml(provVal(rep.species_calendar), provVal(rep.esc_stocks)) +
            '</div></div>';
    }

    // Render cards into DOM
    var container = document.getElementById('water-report-cards');
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