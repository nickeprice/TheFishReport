/**
 * src/features/telemetry/report.js - the water-report pipeline (fetch, paint,
 * silent refresh). Depends on the tide/hero/daynav renderers + water.js.
 * public: loadWaterReport(silent)
 * ES module.
 * NOTE: 294 lines, one large function — over the <150-line target.
 */
import { logDebug } from '../../shared/debug.js';
import { provVal } from '../../shared/format.js';
import { idbPutAll, idbGetAll } from '../../shared/idb.js';
import { Supa } from '../../services/supabase.js';
import { renderWaterReportEmptyState, updateActiveDateUI, setReportsData, activeDateOffset, reportsData } from './daynav.js';
import { buildFishingHero, buildSpeciesCalendarHtml } from './hero.js';
import { loadRules as loadRegulationsRules } from '../../utils/regulations.js';
import { applyReportWeather } from '../../services/water.js';
import { renderReportDays } from './report-render.js';
// Loads (or silently refreshes) the water report. When `silent` is true this is
// a background auto-refresh: it must NOT overwrite a Gear Sim CFS the angler
// typed by hand (the initial load + manual station change still auto-sync).
export async function loadWaterReport(silent) {
    var active = localStorage.getItem('active_station');
    var station = null;
    try {
        if (active) station = JSON.parse(active);
    } catch(e) {}
    if (!station || station.id === '12096500' || !station.id) {
        station = { id: '12101500', lat: 47.200917, lon: -122.2897, name: 'Puyallup River at Puyallup, WA', isGps: true };
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
        setReportsData(reports);
        logDebug("Water API success. Processing " + reports.length + " days.", "NET");

        // G1 (Phase 2.4): persist a durable offline snapshot of the report day-rows.
        // idbPutAll is write-through IndexedDB (with a localStorage fallback via
        // outbox semantics); a failed write is logged, never fatal.
        try {
            if (typeof idbPutAll === 'function') {
                idbPutAll('telemetry_snapshots', reports);
            }
            localStorage.setItem('telemetry_snapshot_ts', String(Date.now()));
        } catch (e) {
            logDebug('Snapshot write failed: ' + e.message, 'DB');
        }

        // Today's barometer / cloud / rain now feed the Gear Sim strike zone
        if (typeof refreshZonePreview === 'function') refreshZonePreview();
        await rulesPromise;

        // Render day cards, species calendar, tide, CFS momentum via extracted helper
        renderReportDays(reports, station);
        updateActiveDateUI();
        // WS-4: each day's card already carries ITS OWN reference-hour weather (rendered
        // above from that day's payload), so this only re-paints the ACTIVE day (and it is
        // what makes the day switch repaint in updateActiveDateUI).
        var activeRep = reports[Math.min(Math.max(activeDateOffset, 0), reports.length - 1)];
        if (activeRep && typeof applyReportWeather === 'function') {
            applyReportWeather(activeRep);
        }
    } catch(e) {
        logDebug("API Error: " + e.message, "ERR");
        await rulesPromise;
        // G1 (Phase 2.4): on a failed fetch, fall back to the durable IndexedDB
        // snapshot of the last report and label it honestly — legal hours, the
        // fishing hero and the Gear Sim globals still compute from cached data.
        var snap = null;
        if (typeof idbGetAll === 'function') {
            try { snap = await idbGetAll('telemetry_snapshots'); } catch (e2) { snap = null; }
        }
        if (snap && snap.length) {
            setReportsData(snap);
            updateActiveDateUI();
            var hoursAgo = 'a while';
            try {
                var ts = parseInt(localStorage.getItem('telemetry_snapshot_ts') || '0', 10);
                if (ts && isFinite(ts)) {
                    hoursAgo = Math.max(0, Math.round((Date.now() - ts) / 3600000)) + ' hour(s)';
                }
            } catch (e3) {}
            var cards = document.getElementById('water-report-cards');
            if (cards && !cards.children.length) {
                cards.innerHTML = '<div class="empty-state empty-state-panel">' +
                    '<div class="empty-state-icon">📡</div>' +
                    '<div class="empty-state-title">Offline — showing the last cached report</div>' +
                    '<div class="empty-state-hint">Last updated ' + hoursAgo + ' ago. Reconnect to refresh.</div>' +
                    '</div>';
            } else if (cards) {
                var badge = document.createElement('div');
                badge.className = 'seasonal-warning';
                badge.style.cssText = 'background:var(--card-bg);border:1px solid var(--accent-yellow);color:var(--accent-yellow);';
                badge.textContent = 'Offline: Last updated ' + hoursAgo + ' ago';
                cards.insertBefore(badge, cards.firstChild);
            }
        }
        // Only replace the container with an empty-state when there is nothing to
        // show — a previously rendered (or snapshot-restored) report wins.
        var existing2 = document.getElementById('water-report-cards');
        if ((!snap || !snap.length) && existing2 && !existing2.children.length) {
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
window.loadWaterReport = loadWaterReport;



