/**
 * src/features/map/map.js - interactive station map (UPDATE 3.0 Phase 2.5).
 *
 * public: showStationMap(), loadLeaflet(), refreshStationMap(center), mapCenter(),
 *         startSpotPick(), onSpotPick(e)
 *
 * Loads Leaflet lazily from a CDN, then plots one pin per nearby gauge from
 * /api/nearby_stations (dynamic radial discovery, Phase 2.2). Tapping a pin selects
 * that station through the SAME selectPreset() path the preset buttons use, so the
 * map is a pure ENHANCEMENT — if Leaflet never loads (offline, blocked CDN) the
 * presets, search and GPS above it keep working untouched.
 *
 * Pin colour states DATA AVAILABILITY, not a verdict: grey = no fresh reading,
 * green = live reading. An "optimal / blown out" colour needs the flow-percentile
 * work (UPDATE 3.0 §8) — until then we do not invent one.
 *
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
var LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
var LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
var LEAFLET_TILES_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
var MAP_DEFAULT_CENTER = [47.195, -122.302];
var MAP_START_ZOOM = 10;

var _leafletPromise = null;
var _stationMap = null;
var _stationMarkers = null;

// Load Leaflet once. Resolves false when it is unavailable, so every caller can carry
// on without a map instead of throwing.
function loadLeaflet() {
    if (typeof window !== 'undefined' && window.L) return Promise.resolve(true);
    if (_leafletPromise) return _leafletPromise;
    _leafletPromise = new Promise(function (resolve) {
        if (typeof document === 'undefined' || !document.head) return resolve(false);
        if (!document.getElementById('leaflet-css')) {
            var link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = LEAFLET_CSS_URL;
            document.head.appendChild(link);
        }
        var tag = document.createElement('script');
        tag.src = LEAFLET_JS_URL;
        tag.async = true;
        tag.onload = function () { resolve(!!window.L); };
        tag.onerror = function () { resolve(false); };
        document.head.appendChild(tag);
        setTimeout(function () { resolve(!!window.L); }, 8000);
    });
    return _leafletPromise;
}

function mapPinHasReading(station) {
    if (!station) return false;
    var hasCfs = station.cfs !== undefined && station.cfs !== null;
    var hasGage = station.gage !== undefined && station.gage !== null;
    return hasCfs || hasGage;
}

function mapPinColor(station) {
    return mapPinHasReading(station) ? '#22c55e' : '#94a3b8';
}

function mapPinIcon(station) {
    return window.L.divIcon({
        className: 'station-pin',
        html: '<span class="station-pin-dot" style="background:' + mapPinColor(station) + '"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
}

// The nearby-stations payload carries the legal RULE but not that day's clock times,
// so describe the rule instead of printing empty times.
function mapLegalText(rule) {
    if (rule === '24hr') return 'Open all day';
    if (rule === 'daylight') return 'Daylight window (1h either side of sunrise/sunset)';
    return 'Hours not verified \u2014 check the regulations';
}

function stationPopupHtml(s) {
    var cfs = (s.cfs === undefined || s.cfs === null) ? '--' : s.cfs;
    var gage = (s.gage === undefined || s.gage === null) ? '--' : s.gage;
    return '<b>' + escapeHtml(s.name || s.id) + '</b><br>' +
        escapeHtml(cfs + ' CFS \u00b7 ' + gage + ' ft') + '<br>' +
        escapeHtml(mapLegalText(s.legal_hours)) + '<br>' +
        '<a href="#" onclick="selectPreset(\'' + escapeJsString(s.id) + '\',' +
        Number(s.lat) + ',' + Number(s.lon) + ',\'' + escapeJsString(s.name || s.id) +
        '\');return false;">Fish this gauge</a>';
}

function mapCenter() {
    if (window.userGPSCoords && window.userGPSCoords.lat != null && window.userGPSCoords.lon != null) {
        return [window.userGPSCoords.lat, window.userGPSCoords.lon];
    }
    try {
        var stored = JSON.parse(localStorage.getItem('active_station') || 'null');
        if (stored && stored.lat != null && stored.lon != null) return [stored.lat, stored.lon];
    } catch (e) {}
    return MAP_DEFAULT_CENTER;
}

async function refreshStationMap(center) {
    if (!_stationMap || !_stationMarkers) return 0;
    var res = await fetch('/api/nearby_stations?lat=' + center[0] + '&lon=' + center[1], { cache: 'no-store' });
    var data = await res.json();
    var stations = (data && data.stations) ? data.stations : [];
    _stationMarkers.clearLayers();
    window.L.circleMarker(center, { radius: 6, color: '#38bdf8', weight: 2, fillOpacity: 0.35 })
        .addTo(_stationMarkers);
    stations.forEach(function (s) {
        if (s.lat == null || s.lon == null) return;
        window.L.marker([s.lat, s.lon], { icon: mapPinIcon(s), title: s.name })
            .bindPopup(stationPopupHtml(s))
            .addTo(_stationMarkers);
    });
    // WS-5: the angler's OWN saved spots, as a star layer. Plotted from local state, so
    // the layer appears even when /api/nearby_stations is unreachable. Private data:
    // these coordinates are never sent anywhere by this plot.
    if (typeof spotsState !== 'undefined' && spotsState.rows.length && typeof savedSpotIcon === 'function') {
        spotsState.rows.forEach(function (sp) {
            if (sp.latitude == null || sp.longitude == null) return;
            window.L.marker([Number(sp.latitude), Number(sp.longitude)], { icon: savedSpotIcon(), title: sp.label })
                .bindPopup(savedSpotPopupHtml(sp))
                .addTo(_stationMarkers);
        });
    }
    logDebug('Station map: ' + stations.length + ' gauge(s) plotted', 'MAP');
    return { count: stations.length, note: (data && data.note) || '' };
}

// --- SPOT PICKER (2026-09-29, direct user ask) ----------------------------------------
// Drop a point ANYWHERE on the map and save it as a private fishing spot by its lat/lon.
// The point is not a gauge, so spots.js resolves the nearest gauge for the FLOW while the
// point keeps its OWN coordinates for the weather (see the resolver note in spots.js).
var _spotPickOn = false;

function startSpotPick() {
    // A spot belongs to a private account, so starting the pick without a session would be a
    // dead end - say so instead of arming a tap that cannot save.
    if (!spotsSignedIn()) {
        spotsStatus('Start a session on the Catch Log tab first \u2014 spots save to your private account.');
        if (typeof showToast === 'function') showToast('Start a session on the Catch Log tab first.', 'warn', 5000);
        return;
    }
    // THE MAP IS THIS BUTTON'S JOB: it used to refuse when the map had not been opened yet,
    // which read as "the button does nothing" (the map only exists after the map button).
    openSpotPickMap();
}

// Open the map if it is not up yet, then arm the next tap as the spot.
async function openSpotPickMap() {
    if (!_stationMap || !window.L) {
        spotsStatus('Loading the map\u2026');
        try { await showStationMap(); } catch (e) {}
    }
    if (!_stationMap || !window.L) {
        spotsStatus('Map unavailable (offline or CDN blocked) \u2014 use the presets or GPS instead.');
        return;
    }
    _spotPickOn = true;
    spotsStatus('Now tap the map where your spot is.');
    if (_stationMap.getContainer) _stationMap.getContainer().style.cursor = 'crosshair';
    _stationMap.once('click', onSpotPick);
    // The name can come first or on the tap (the pick asks for it if it is still empty), so
    // nudge the field rather than blocking the pick.
    var label = (typeof getStr === 'function') ? (getStr('spot-label') || '').trim() : '';
    if (!label) {
        var input = document.getElementById('spot-label');
        if (input && input.focus) input.focus();
    }
}

async function onSpotPick(e) {
    _spotPickOn = false;
    if (_stationMap && _stationMap.getContainer) _stationMap.getContainer().style.cursor = '';
    if (!e || !e.latlng) return;
    if (!spotsSignedIn()) { spotsStatus('Start a session on the Catch Log tab first.'); return; }
    // Name it now if it was not named first: the tap is the moment the angler knows where it is.
    var label = (typeof getStr === 'function') ? (getStr('spot-label') || '').trim().slice(0, SPOT_LABEL_MAX) : '';
    if (!label) {
        var typed = window.prompt('Name this spot', 'My spot');
        if (typed == null) { spotsStatus('Cancelled \u2014 tap the map again when you are ready.'); return; }
        label = String(typed).trim().slice(0, SPOT_LABEL_MAX);
        if (!label) { spotsStatus('A spot needs a name \u2014 tap the map again.'); return; }
        setFieldValue('spot-label', label);
    }
    spotsStatus('Saving\u2026');
    var id = await saveSpotAt(e.latlng.lat, e.latlng.lng, label);
    if (!id) { spotsStatus('Could not save that spot.'); return; }
    setFieldValue('spot-label', '');
    if (typeof showToast === 'function') showToast('Spot saved (private)', 'success', 2500);
    await loadFavoriteSpots();
    try { await refreshStationMap(mapCenter()); } catch (err) {}   // re-plot so the star appears
    spotsStatus('Saved. Tap its star to load the conditions there.');
}

async function showStationMap() {
    var box = document.getElementById('station-map');
    var note = document.getElementById('station-map-note');
    if (!box) return;
    box.hidden = false;
    if (note) { note.hidden = false; note.textContent = 'Loading map\u2026'; }

    var available = await loadLeaflet();
    if (!available) {
        box.hidden = true;
        if (note) note.textContent = 'Map unavailable (offline or CDN blocked) \u2014 use the presets, search or GPS above.';
        return;
    }

    var center = mapCenter();
    // WS-5: refresh the private spot list first, so the star layer below is current.
    if (typeof loadFavoriteSpots === 'function') { try { await loadFavoriteSpots(); } catch (e) {} }
    if (!_stationMap) {
        _stationMap = window.L.map(box).setView(center, MAP_START_ZOOM);
        window.L.tileLayer(LEAFLET_TILES_URL, { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(_stationMap);
        _stationMarkers = window.L.layerGroup().addTo(_stationMap);
    } else {
        _stationMap.setView(center, _stationMap.getZoom());
    }
    // Leaflet measures its container on creation; inside a modal that was hidden it
    // needs a nudge once visible, or the tiles render as a grey block.
    setTimeout(function () { if (_stationMap) _stationMap.invalidateSize(); }, 200);

    try {
        var out = await refreshStationMap(center);
        if (note) {
            var spotsN = (typeof spotsState !== 'undefined' && spotsState.rows.length)
                ? ' \u00b7 ' + spotsState.rows.length + ' saved spot(s) (star).' : '';
            if (out.note) note.textContent = out.note;
            else if (out.count) note.textContent = out.count + ' nearest gauge(s) \u2014 grey = dormant, green = live.' + spotsN + ' Tap a pin to fish it.';
            else note.textContent = 'No live gauges found nearby.' + spotsN;
        }
    } catch (e) {
        logDebug('Station map feed failed: ' + e.message, 'MAP');
        if (note) note.textContent = 'Could not load nearby gauges \u2014 use the presets, search or GPS above.';
    }
}
