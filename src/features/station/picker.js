/**
 * src/features/station/picker.js - station modal, GPS pick and presets.
 * public: openStationModal(), closeStationModal(), selectPreset(),
 *         calcDistance(), useGPS()
 * ES module.
 */
import { logDebug } from '../../shared/debug.js';
import { loadWaterReport } from '../telemetry/report.js';
import { loadFavoriteSpots } from '../map/spots.js';
import { State } from '../../shared/state.js';
import { escapeHtml, escapeJsString } from '../../shared/format.js';
// --- STATION SELECTOR MODAL & GPS FUNCTIONS ---
export function openStationModal() {
    document.getElementById('station-modal').style.display = 'block';
    document.getElementById('gps-status').innerText = '';
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('station-search').value = '';
    // WS-5: paint the private saved-spot list (cache first, then the server if signed in).
    if (typeof loadFavoriteSpots === 'function') loadFavoriteSpots();
    // WS-6: render all 15 regional preset buttons from the registry.
    renderPresets();
}

// Build Quick Regional Presets from the registry discovery_pool.
// This replaces the old 5-button hardcode — all 15 waterbodies now appear,
// and new rivers added to the registry show up automatically.
export function renderPresets() {
    const list = document.getElementById('preset-list');
    if (!list) return;
    const pool = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.discovery_pool;
    if (!pool || !pool.length) {
        list.innerHTML = ''; // clean slate when offline/unavailable
        return;
    }
    let html = '';
    for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (!s || !s.site_id || !s.coords) continue;
        html += '<button class="preset-btn" onclick="selectPreset(\'' +
            escapeJsString(s.site_id) + '\', ' +
            Number(s.coords.lat) + ', ' + Number(s.coords.lon) + ', \'' +
            escapeJsString(s.name) + ')\">' +
            '<span>' + escapeHtml(s.name) + '</span> <span class="preset-id">' +
            escapeHtml(s.site_id) + '</span></button>';
    }
    if (html) list.innerHTML = html;
}
window.renderPresets = renderPresets;
window.openStationModal = openStationModal;

export function closeStationModal() {
    document.getElementById('station-modal').style.display = 'none';
}
window.closeStationModal = closeStationModal;

export function selectPreset(id, lat, lon, name, isGps) {
    window.activeDateOffset = 0;
    const station = { id: id, lat: lat, lon: lon, name: name, isGps: !!isGps };
    localStorage.setItem('active_station', JSON.stringify(station));
    logDebug("Selected Station: " + name + " (" + id + ")", "STATE");
    closeStationModal();
    loadWaterReport();
}

// Haversine distance in miles
export function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Radius of Earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// GPS pick. On ANY failure the modal stays OPEN with a retry hint - it is never
// closed out from under the angler. The old auto-fallback straight to the Puyallup
// default (selectPreset -> closeStationModal) is what made "nearest river" look like
// it "failed and closed out of the menu". Retry = tap the same button again (useGPS
// stays bound to it).
export function useGPS() {
    const status = document.getElementById('gps-status');
    status.innerText = "Waiting for GPS (grant the location prompt)...";
    if (!navigator.geolocation) {
        status.innerText = "Geolocation is not supported on this device \u2014 pick a river below or search by name/ID.";
        return;
    }
    let settled = false;
    const watchdog = setTimeout(function () {
        if (settled) return;
        settled = true;
        status.innerText = "GPS took too long. Tap \u201CUse My GPS\u201D to retry, or pick a river below.";
        logDebug("GPS location timed out - modal left open for retry", "ERR");
    }, 15000);
    navigator.geolocation.getCurrentPosition(async function(pos) {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        // Hold the fix privately: mapCenter() centres on it and logData() can enrich the
        // private catch row. Never surfaced in the public feed or debug UI.
        State.userGPSCoords = { lat: lat, lon: lon };
        status.innerText = "Captured position. Searching nearby USGS gauges...";
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const fetchTimer = setTimeout(function () { if (controller) controller.abort(); }, 10000);
        try {
            // Same-origin server-side USGS lookup (reliable on mobile). Retry once if the
            // first response is empty OR errors (a cold Cloudflare tunnel connection can
            // return an aborted body on the very first request). The real status/body is
            // logged so an upstream USGS outage is distinguishable from a code bug.
            let timeSeries = null;
            let lastErr = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                const response = await fetch('/api/nearby_stations?lat=' + lat + '&lon=' + lon, { cache: "no-store", signal: controller ? controller.signal : undefined });
                const bodyText = await response.text();
                if (!response.ok) {
                    lastErr = "HTTP " + response.status;
                    logDebug("nearby_stations " + response.status + ": " + String(bodyText).slice(0, 200), "ERR");
                } else {
                    let data = null;
                    try { data = JSON.parse(bodyText); } catch (pe) { lastErr = "bad JSON"; }
                    timeSeries = (data && data.stations) ? data.stations : [];
                    if (timeSeries.length > 0) break;
                }
                if (attempt === 0) await new Promise(function (r) { setTimeout(r, 700); });
            }
            if (!timeSeries || timeSeries.length === 0) {
                status.innerText = "No USGS stations found nearby" + (lastErr ? " (" + lastErr + ")" : "") +
                    ". Tap \u201CUse My GPS\u201D to retry, or pick a river below.";
                logDebug("nearby_stations returned 0 stations" + (lastErr ? " (" + lastErr + ")" : ""), "ERR");
                return;
            }
            const stationsMap = {};
            timeSeries.forEach(function(ts) {
                const sCode = ts.id;
                const sName = ts.name;
                const sLat = ts.lat;
                const sLon = ts.lon;
                const sDist = ts.distance_mi;
                if (!stationsMap[sCode]) {
                    stationsMap[sCode] = {
                        id: sCode,
                        name: sName,
                        lat: sLat,
                        lon: sLon,
                        distance: (sDist !== undefined && sDist != null) ? sDist : calcDistance(lat, lon, sLat, sLon)
                    };
                }
            });
            const stationsList = Object.values(stationsMap);
            stationsList.sort(function(a, b) { return a.distance - b.distance; });
            if (stationsList.length > 0) {
                const closest = stationsList[0];
                status.innerText = "Found: " + closest.name + " (" + closest.distance.toFixed(1) + " mi)";
                setTimeout(function() { selectPreset(closest.id, closest.lat, closest.lon, closest.name, true); }, 1500);
            } else {
                status.innerText = "No active gauge stations in range. Tap \u201CUse My GPS\u201D to retry, or pick a river below.";
            }
        } catch(e) {
            status.innerText = "USGS search failed (" + e.message + "). Tap \u201CUse My GPS\u201D to retry, or pick a river below.";
            logDebug("USGS GPS box error: " + e.message, "ERR");
        } finally {
            clearTimeout(fetchTimer);
        }
    }, function(err) {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        const msg = (err && err.code === 3) ? "GPS timed out"
            : (err && err.code === 1) ? "Location access was denied"
            : "GPS is unavailable";
        status.innerText = msg + ". Tap \u201CUse My GPS\u201D to retry, or pick a river below.";
        logDebug("Geolocation error: " + (err ? err.message : "unknown"), "ERR");
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
}
window.useGPS = useGPS;
window.selectPreset = selectPreset;
