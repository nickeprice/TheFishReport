/**
 * src/features/telemetry/report.js - the water-report pipeline (fetch, paint,
 * silent refresh). Depends on the tide/hero/daynav renderers + water.js.
 * public: loadWaterReport(silent)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 * NOTE: still ~285 lines (one large function) — split further in a follow-up.
 */
// Loads (or silently refreshes) the water report. When `silent` is true this is
// a background auto-refresh: it must NOT overwrite a Gear Sim CFS the angler
// typed by hand (the initial load + manual station change still auto-sync).
async function loadWaterReport(silent) {
    var active = localStorage.getItem('active_station');
    var station = null;
    try {
        if (active) station = JSON.parse(active);
    } catch(e) {}
    if (!station || station.id === '12096500' || !station.id) {
        station = { id: '12101500', lat: 47.1950, lon: -122.3020, name: 'Puyallup River at Puyallup, WA', isGps: false };
        localStorage.setItem('active_station', JSON.stringify(station));
    }
    
    // Update header & badge
    document.getElementById('active-station-name').innerText = station.name.toUpperCase();
    var badge = document.getElementById('active-station-badge');
    if (station.isGps) {
        badge.innerText = "📍 GPS: " + station.id;
        badge.className = "station-badge badge-gps";
    } else {
        badge.innerText = "📌 USGS: " + station.id;
        badge.className = "station-badge badge-manual";
    }
    updateActiveDateUI();

    // Regulations rules and the water report are independent network reads, so
    // start them concurrently instead of paying for the two round trips in
    // series. The promise is awaited just before the date UI evaluates river
    // status, so behaviour is identical - only the wait is shorter.
    var rulesPromise = (typeof loadRegulationsRules === 'function')
        ? Promise.resolve().then(loadRegulationsRules).catch(function (e) {
            logDebug('Regulations rules error: ' + e.message, 'ERR');
        })
        : Promise.resolve();

    logDebug("Fetching Water API for " + station.name + " (" + station.id + ")...", "NET");
    try {
        var res = await fetch('/api/water_report?site=' + station.id + '&lat=' + station.lat + '&lon=' + station.lon + '&_t=' + Date.now(), {
            cache: 'no-store'
        });
        var reports = await res.json();
        reportsData = reports;
        logDebug("Water API success. Processing " + reports.length + " days.", "NET");

        // Today's barometer / cloud / rain now feed the Gear Sim strike zone
        if (typeof refreshZonePreview === 'function') refreshZonePreview();

        if (reports.length > 0) {
            var first = reports[0];
            if (first.site_name) {
                document.getElementById('active-station-name').innerText = first.site_name.toUpperCase();
            }
            var actId = first.site_id || station.id;
            badge.innerText = (station.isGps ? "📍 GPS: " : "📌 USGS: ") + actId;
        }
        
        // Phase 2: hatchery escapement counts now live INSIDE the merged
        // [ RUN & TIMING ] per-species cards (see buildSpeciesCalendarHtml);
        // refreshEscapement fills their count rows async after card render.

        var cardsHtml = '';

        // Automatically push Live CFS to Gear Sim (skip on USGS outage so the
        // manual CFS the angler typed is preserved instead of being blanked,
        // and skip on silent auto-refresh so a background refresh never clobbers
        // a CFS the angler typed by hand).
        // Live discharge now feeds the Gear Sim + catch log directly (there is no
        // user-facing flow input any more) — the derived value is still recorded.
        if(reports.length > 0 && reports[0].cfs !== null && reports[0].cfs !== undefined && !reports[0].api_offline) {
            lastKnownFlow = reports[0].cfs;
            logDebug("Live flow recorded for the sim: " + reports[0].cfs + " CFS", "STATE");
        }

        for(var i=0; i<reports.length; i++) {
            var rep = reports[i];
            // Escapement registry for the [ RUN & TIMING ] panel.
            var escStocks = (typeof hatcheryEscapement !== 'undefined' && hatcheryEscapement[String(actId || station.id)])
                ? hatcheryEscapement[String(actId || station.id)] : null;

            var dStyle = (i === activeDateOffset) ? "block" : "none";

            var pCol = (rep.press_delta > 0) ? 'var(--accent-green)' : ((rep.press_delta < 0) ? 'var(--accent-red)' : '#ffffff');
            // Barometric trend from the API's 6-hour pressure window: up-arrow rising, down-arrow falling, dash flat
            var pArr = (rep.press_delta > 0) ? '\u2191' : ((rep.press_delta < 0) ? '\u2193' : '\u2014');
            // Temperature trend arrow + color (same barometer pattern, honest data).
            var tCol = (rep.temp_delta_f > 0.4) ? 'var(--accent-green)' : ((rep.temp_delta_f < -0.4) ? 'var(--accent-red)' : '#ffffff');
            var tArr = (rep.temp_delta_f > 0.4) ? '\u2191' : ((rep.temp_delta_f < -0.4) ? '\u2193' : '\u2014');
            // Wind: direction arrow + speed (single "mph" unit — FIXES the
            // duplicate "mphmph" text). 16-point compass -> 8-way arrow.
            var WIND_ARROWS = { 'N':'\u2191','NNE':'\u2197','NE':'\u2197','ENE':'\u2197','E':'\u2192','ESE':'\u2198','SE':'\u2198','SSE':'\u2198','S':'\u2193','SSW':'\u2199','SW':'\u2199','WSW':'\u2199','W':'\u2190','WNW':'\u2196','NW':'\u2196','NNW':'\u2196' };
            var windDisplay = (rep.wind_speed_mph != null)
                ? ((rep.wind_dir_compass ? (WIND_ARROWS[rep.wind_dir_compass] || rep.wind_dir_compass) + ' ' : '') + Math.round(rep.wind_speed_mph) + ' mph')
                : '--';

            var cfsVal = (rep.cfs !== null && rep.cfs !== undefined) ? Number(rep.cfs).toLocaleString('en-US') + ' CFS' : '-- CFS';
            var gageVal = (rep.gage !== null && rep.gage !== undefined) ? rep.gage.toFixed(2) + ' ft Gauge Height' : '-- ft Gauge Height';
            // Own-gauge water quality (locked: active station's OWN USGS 00010 /
            // 63680 only — never a proxy). Rendered ONLY when the station reports
            // them; otherwise the whole block is omitted so nothing fake shows.
            var hasWaterTemp = (rep.water_temp_f !== undefined && rep.water_temp_f !== null && !isNaN(rep.water_temp_f));
            var hasTurbidity = (rep.turbidity_fnu !== undefined && rep.turbidity_fnu !== null && !isNaN(rep.turbidity_fnu));
            var waterQualityHtml = '';
            if (hasWaterTemp || hasTurbidity) {
                waterQualityHtml = '<div class="telemetry-qualities">' +
                    (hasWaterTemp ? '<span class="telemetry-quality"><span class="water-temp">' + Math.round(Number(rep.water_temp_f)) + '</span>°F H₂O</span>' : '') +
                    (hasWaterTemp && hasTurbidity ? '<span class="telemetry-sep">&bull;</span>' : '') +
                    (hasTurbidity ? '<span class="telemetry-quality">Turbidity <span class="turbidity-val">' + Number(rep.turbidity_fnu).toFixed(1) + '</span> FNU</span>' : '') +
                '</div>';
            }
            // Clarity is folded into the fishing hero (buildFishingHero) — no
            // inline badge in the telemetry row.
            // Distinguish USGS network outages (data_dict api_offline) from a truly seasonal station
            // so a 503 / timeout no longer renders as "seasonal / not reporting".
            var seasonalWarn = '';
            if (rep.api_offline) {
                seasonalWarn = '<div class="seasonal-warning" style="background:var(--card-bg);border:1px solid var(--accent-red);color:var(--accent-red);">⚠️ USGS Telemetry API temporarily unreachable — showing last manual CFS</div>';
            } else if (!rep.is_active) {
                seasonalWarn = '<div class="seasonal-warning">⚠️ Station currently seasonal / not reporting live discharge</div>';
            }

            cardsHtml += '<div id="'+rep.id+'" class="day-card" style="display: '+dStyle+';">' +
                '<div class="card">' +
                // PLAIN-ENGLISH HERO — the first thing on the card, under its own
                // [ FISHING OUTLOOK ] section header: verdict · best window · why
                // on ONE centred line.
                '<div class="sec-hdr">[ FISHING OUTLOOK ]</div>' +
                buildFishingHero(rep) +
                // RIVER & ENVIRONMENTAL CONDITIONS (Consolidated)
                '<div class="sec-hdr">[ RIVER &amp; ENVIRONMENTAL CONDITIONS ]</div>' +
                seasonalWarn +
                '<div class="env-telemetry-row">' +
                  '<div class="telemetry-main">' +
                    '<span class="telemetry-val"><span class="cfs-val">' + cfsVal + '</span><span class="telemetry-sep">&bull;</span><span class="gage-val">' + gageVal + '</span></span>' +
                    waterQualityHtml +
                  '</div>' +
                  '<div class="telemetry-updated">' + (rep.updated_time || '') + '</div>' +
                '</div>' +
                formatTideRow(rep.tide_chart, rep.tide_curve, rep.tide_points) +
                '<div class="env-weather-solunar">' +
                  '<div class="env-stat-grid">' +
                    // Row 1 (Atmospheric): BAROMETER, PRECIP %, PRECIP VOL (each
                    // with a live timing hint when the forecast supports it)
                    '<div class="env-badge">' +
                      '<div class="env-badge-val" style="color:' + pCol + ';">' + rep.pressure.toFixed(2) + ' <span style="font-size:10px; font-weight:600;">inHg</span> ' + pArr + '</div>' +
                      // Reserved sub-line slot on EVERY cell so all 9 pills centre
                      // their value/label pair identically (empty = no hint).
                      '<div class="env-badge-sub"></div>' +
                      '<div class="env-badge-lbl">Barometer</div>' +
                    '</div>' +
                    '<div class="env-badge">' +
                      '<div class="env-badge-val"><span class="precip-pop">' + (rep.pop_pct != null ? rep.pop_pct : '--') + '</span>%</div>' +
                      '<div class="env-badge-sub">' + (rep.precip_start_text || rep.precip_end_text || '') + '</div>' +
                      '<div class="env-badge-lbl">Precip %</div>' +
                    '</div>' +
                    '<div class="env-badge">' +
                      '<div class="env-badge-val"><span class="precip-vol">' + (rep.rain != null ? rep.rain.toFixed(2) : '--') + '</span>"</div>' +
                      '<div class="env-badge-sub">' + (rep.precip_start_text || rep.precip_end_text || '') + '</div>' +
                      '<div class="env-badge-lbl">Precip Vol</div>' +
                    '</div>' +
                    // Row 2: CLOUD%, TEMP (trend arrow), WIND (direction arrow)
                    '<div class="env-badge">' +
                      '<div class="env-badge-val">' + rep.cloud_pct + '%</div>' +
                      '<div class="env-badge-sub"></div>' +
                      '<div class="env-badge-lbl">Cloud Cover</div>' +
                    '</div>' +
                    '<div class="env-badge">' +
                      '<div class="env-badge-val" style="color:' + tCol + ';"><span class="air-temp">' + (rep.air_temp_f != null ? Math.round(rep.air_temp_f) : '--') + '</span>° ' + tArr + '</div>' +
                      '<div class="env-badge-sub"></div>' +
                      '<div class="env-badge-lbl">Temp</div>' +
                    '</div>' +
                    '<div class="env-badge">' +
                      '<div class="env-badge-val"><span class="wind-val">' + windDisplay + '</span></div>' +
                      '<div class="env-badge-sub"></div>' +
                      '<div class="env-badge-lbl">Wind</div>' +
                    '</div>' +
                    // Row 3: SUNRISE/SUNSET (split), MOON PHASE, SOLUNAR
                    '<div class="env-badge">' +
                      '<div class="env-badge-val solunar-split">' +
                        '<div class="solunar-half">' +
                          '<span class="solunar-val" style="color:#fbbf24;">\u2191 ' + (rep.sunrise || '--:--') + '</span>' +
                          '<span class="solunar-sublbl">Sunrise</span>' +
                        '</div>' +
                        '<div class="solunar-half">' +
                          '<span class="solunar-val" style="color:#64d2ff;">\u2193 ' + (rep.sunset || '--:--') + '</span>' +
                          '<span class="solunar-sublbl">Sunset</span>' +
                        '</div>' +
                      '</div>' +
                      '<div class="env-badge-sub"></div>' +
                      '<div class="env-badge-lbl">Sun / Set</div>' +
                    '</div>' +
                    '<div class="env-badge">' +
                      '<div class="env-badge-val moon-pill">' + (rep.lunar_icon || '🌑') + '</div>' +
                      '<div class="env-badge-sub"></div>' +
                      '<div class="env-badge-lbl">Moon Phase</div>' +
                    '</div>' +
                    '<div class="env-badge">' +
                      '<div class="env-badge-val solunar-split">' +
                        '<div class="solunar-half">' +
                          '<span class="solunar-val" style="color:#ffd60a;">' + rep.moon_upper + '</span>' +
                          '<span class="solunar-sublbl">Overhead</span>' +
                        '</div>' +
                        '<div class="solunar-half">' +
                          '<span class="solunar-val" style="color:#64d2ff;">' + rep.moon_lower + '</span>' +
                          '<span class="solunar-sublbl">Underfoot</span>' +
                        '</div>' +
                      '</div>' +
                      '<div class="env-badge-sub"></div>' +
                      '<div class="env-badge-lbl">Solunar</div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                // 5b. ONE [ RUN & TIMING ] panel: per-species run cards
                // (status/progress/peak visible, counts folded).
                '<div class="run-timing">' +
                  '<div class="sec-hdr">[ RUN &amp; TIMING ]</div>' +
                  buildSpeciesCalendarHtml(rep.species_calendar, escStocks) +
                '</div>' + '</div></div>';
        }
        document.getElementById('water-report-cards').innerHTML = cardsHtml;
        // Paint the own-gauge water temp/turbidity into the telemetry area
        // (already server-rendered in the card HTML) and sync window.waterTempF
        // for the Gear Sim.
        var firstRep = reports[0];
        if (typeof applyOwnGaugeWaterQuality === 'function') {
            applyOwnGaugeWaterQuality(
                (firstRep && firstRep.water_temp_f !== undefined) ? firstRep.water_temp_f : null,
                (firstRep && firstRep.turbidity_fnu !== undefined) ? firstRep.turbidity_fnu : null
            );
        }
        // An empty payload would otherwise leave the tab as a blank black screen.
        if (!reports || reports.length === 0) {
            renderWaterReportEmptyState(
                'No river data returned',
                'USGS did not report any forecast days for this station. Try another station, or check back when the gauge is back online.',
                false
            );
        }
        // Ensure the WDFW rules are in place before the date UI evaluates river
        // status (checkRiverStatus reads them). They were fetched in parallel
        // with the water report above, so this normally resolves immediately.
        await rulesPromise;
        updateActiveDateUI();
        // Phase 2: refresh escapement figures from the live Socrata feed (graceful -- on failure)
        refreshEscapement(actId || station.id);
        // Phase 2.1: apply the human-confirmed WDFW annual forecast (static JSON,
        // graceful -- if absent). Same "fill only matching count cell" contract.
        refreshWdfwForecast();

        // Live telemetry: two independent reads (USGS CFS momentum, Open-Meteo
        // surface conditions). Water temp + turbidity no longer need their own
        // call — they ride in the water-report payload from the active station's
        // OWN gauge (00010 / 63680) and are painted straight from the card HTML.
        Promise.all([
            fetchCFSMomentum(actId || station.id)
        ]).then(function () {
            logDebug('Telemetry batch settled (CFS momentum)', 'NET');
        });
        // "Now" surface conditions (air/wind/precip) are painted FROM the first
        // report day (backend Open-Meteo `current`) — no client-side Open-Meteo call.
        if (reports && reports[0] && typeof applyReportWeather === 'function') {
            applyReportWeather(reports[0]);
        }
    } catch(e) {
        logDebug("API Error: " + e.message, "ERR");
        await rulesPromise;
        updateActiveDateUI();
        // Only replace the container when there is nothing to show; a previously
        // rendered report is more useful than an error panel.
        var existing = document.getElementById('water-report-cards');
        if (existing && !existing.children.length) {
            renderWaterReportEmptyState(
                navigator.onLine === false ? 'Offline — no cached report yet' : 'Water report unavailable',
                navigator.onLine === false
                    ? 'This station has not been cached on this device. Reconnect to fetch it, or pick a station you have already loaded.'
                    : 'The telemetry service did not respond. Legal hours still compute locally, and the Gear Sim works on the flow you enter.',
                navigator.onLine === false
            );
        }
        // Catch path: still paint weather from whatever report may be cached.
        if (typeof applyReportWeather === 'function' && reportsData && reportsData[0]) {
            applyReportWeather(reportsData[0]);
        }
    }
}


