/**
 * src/features/station/picker.js - station modal, GPS pick and presets.
 * public: openStationModal(), closeStationModal(), selectPreset(),
 *         calcDistance(), fallbackStation(), useGPS()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- STATION SELECTOR MODAL & GPS FUNCTIONS ---
function openStationModal() {
    document.getElementById('station-modal').style.display = 'block';
    document.getElementById('gps-status').innerText = '';
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('station-search').value = '';
}

function closeStationModal() {
    document.getElementById('station-modal').style.display = 'none';
}

function selectPreset(id, lat, lon, name, isGps) {
    activeDateOffset = 0;
    var station = { id: id, lat: lat, lon: lon, name: name, isGps: !!isGps };
    localStorage.setItem('active_station', JSON.stringify(station));
    logDebug("Selected Station: " + name + " (" + id + ")", "STATE");
    closeStationModal();
    loadWaterReport();
}

// Haversine distance in miles
function calcDistance(lat1, lon1, lat2, lon2) {
    var R = 3958.8; // Radius of Earth in miles
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function fallbackStation() {
    selectPreset('12101500', 47.1950, -122.3020, 'Puyallup River at Puyallup, WA', false);
}

function useGPS() {
    var status = document.getElementById('gps-status');
    status.innerText = "Waiting for GPS (grant the location prompt)...";
    if (!navigator.geolocation) {
        status.innerText = "Geolocation not supported. Falling back.";
        setTimeout(fallbackStation, 1500);
        return;
    }
    var settled = false;
    var watchdog = setTimeout(function () {
        if (settled) return;
        settled = true;
        status.innerText = "GPS took too long. Falling back.";
        logDebug("GPS location timed out - falling back to default station", "ERR");
        fallbackStation();
    }, 15000);
    navigator.geolocation.getCurrentPosition(async function(pos) {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        status.innerText = "Captured position. Searching nearby USGS gauges...";
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var fetchTimer = setTimeout(function () { if (controller) controller.abort(); }, 10000);
        try {
            // Same-origin server-side USGS lookup (reliable on mobile). Retry once
            // if the first response is empty (a cold Cloudflare tunnel connection can
            // return an aborted body on the very first request).
            var timeSeries = null;
            for (var attempt = 0; attempt < 2; attempt++) {
                var response = await fetch('/api/nearby_stations?lat=' + lat + '&lon=' + lon, { cache: "no-store", signal: controller ? controller.signal : undefined });
                var data = await response.json();
                timeSeries = (data && data.stations) ? data.stations : [];
                if (timeSeries && timeSeries.length > 0) break;
                if (attempt === 0) await new Promise(function (r) { setTimeout(r, 700); });
            }
            if (!timeSeries || timeSeries.length === 0) {
                status.innerText = "No USGS stations found in range. Falling back.";
                setTimeout(fallbackStation, 2000);
                return;
            }
            var stationsMap = {};
            timeSeries.forEach(function(ts) {
                var sCode = ts.id;
                var sName = ts.name;
                var sLat = ts.lat;
                var sLon = ts.lon;
                var sDist = ts.distance_mi;
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
            var stationsList = Object.values(stationsMap);
            stationsList.sort(function(a, b) { return a.distance - b.distance; });
            if (stationsList.length > 0) {
                var closest = stationsList[0];
                status.innerText = "Found: " + closest.name + " (" + closest.distance.toFixed(1) + " mi)";
                setTimeout(function() { selectPreset(closest.id, closest.lat, closest.lon, closest.name, true); }, 1500);
            } else {
                status.innerText = "No active gauge stations in range. Falling back.";
                setTimeout(fallbackStation, 2000);
            }
        } catch(e) {
            status.innerText = "USGS search failed. Falling back.";
            logDebug("USGS GPS box error: " + e.message, "ERR");
            setTimeout(fallbackStation, 2000);
        } finally {
            clearTimeout(fetchTimer);
        }
    }, function(err) {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        status.innerText = (err && err.code === 3) ? "GPS timed out. Falling back." : "GPS Access Denied. Falling back.";
        logDebug("Geolocation error: " + (err ? err.message : "unknown"), "ERR");
        setTimeout(fallbackStation, 1500);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
}
