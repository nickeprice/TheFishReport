/**
 * src/features/map/map.js - interactive station map (Phase A6: MapLibre GL JS).
 *
 * public: showStationMap(), loadLeaflet(), refreshStationMap(center), mapCenter(),
 *         startSpotPick(), onSpotPick(e)
 *
 * Uses MapLibre GL JS (WebGL) for smooth map rendering with raster tile layers
 * (street + satellite) and a built-in GeolocateControl. Tapping a pin selects
 * that station through the SAME selectPreset() path the preset buttons use.
 *
 * Pin colour states DATA AVAILABILITY: grey = dormant, green = live.
 *
 * ES module.
 */
import { logDebug } from '../../shared/debug.js';
import { apiGetJson } from '../../shared/api.js';
import { State } from '../../shared/state.js';
import { escapeHtml, escapeJsString } from '../../shared/format.js';
import { showToast } from '../../shared/ui.js';
import { getStr } from '../gear-sim/inputs.js';
import { setFieldValue } from '../../shared/forms.js';
import { spotsState, SPOT_LABEL_MAX, spotsStatus, loadFavoriteSpots, saveSpotAt } from './spots.js';
import { savedSpotPopupHtml } from './spots-map.js';
import { selectPreset } from '../station/picker.js';
import { Map as MaplibreMap, Marker, GeolocateControl } from 'maplibre-gl';

// ── Tile sources ──────────────────────────────────────────────────────────────────
var STREET_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
var SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.jpg';
var MAP_DEFAULT_CENTER = [-122.302, 47.195];  // [lng, lat]
var MAP_START_ZOOM = 10;

var _stationMap = null;
var _mapMarkers = [];           // { el, lng, lat, station? }
var _spotsPlotted = 0;
var _spotPicking = false;
var _tileMode = 'street';       // 'street' | 'satellite'

// ── Compatibility shim ────────────────────────────────────────────────────────────
export function loadLeaflet() { return Promise.resolve(true); }
window.loadLeaflet = loadLeaflet;

// ── Pin helpers ──────────────────────────────────────────────────────────────────
export function mapPinHasReading(station) {
    if (!station) return false;
    return (station.cfs !== undefined && station.cfs !== null) ||
           (station.gage !== undefined && station.gage !== null);
}

export function mapPinColor(station) {
    return mapPinHasReading(station) ? '#22c55e' : '#94a3b8';
}

export function mapLegalText(rule) {
    if (rule === '24hr') return 'Open all day';
    if (rule === 'daylight') return 'Daylight window (1h either side of sunrise/sunset)';
    return 'Hours not verified \u2014 check the regulations';
}

export function stationPopupHtml(s) {
    var cfs = (s.cfs === undefined || s.cfs === null) ? '--' : s.cfs;
    var gage = (s.gage === undefined || s.gage === null) ? '--' : s.gage;
    return '<b>' + escapeHtml(s.name || s.id) + '</b><br>' +
        escapeHtml(cfs + ' CFS \u00b7 ' + gage + ' ft') + '<br>' +
        escapeHtml(mapLegalText(s.legal_hours)) + '<br>' +
        '<a href="#" onclick="selectPreset(\'' + escapeJsString(s.id) + '\',' +
        Number(s.lat) + ',' + Number(s.lon) + ',\'' + escapeJsString(s.name || s.id) +
        '\');return false;">Fish this gauge</a>';
}

// ── Map centre ───────────────────────────────────────────────────────────────────
export function mapCenter() {
    if (_stationMap) {
        var c = _stationMap.getCenter();
        if (c) return [c.lat, c.lng];
    }
    if (State.userGPSCoords && State.userGPSCoords.lat != null && State.userGPSCoords.lon != null) {
        return [State.userGPSCoords.lat, State.userGPSCoords.lon];
    }
    try {
        var stored = JSON.parse(localStorage.getItem('active_station') || 'null');
        if (stored && stored.lat != null && stored.lon != null) return [stored.lat, stored.lon];
    } catch (e) {}
    return [MAP_DEFAULT_CENTER[1], MAP_DEFAULT_CENTER[0]];  // [lat, lng]
}
window.mapCenter = mapCenter;

// ── Marker helpers ───────────────────────────────────────────────────────────────
function makePinEl(color) {
    var el = document.createElement('div');
    el.className = 'station-pin';
    el.innerHTML = '<span class="station-pin-dot" style="background:' + color + '"></span>';
    return el;
}

function makeStarEl() {
    var el = document.createElement('div');
    el.className = 'spot-pin';
    el.innerHTML = '<span class="spot-pin-dot">\u2605</span>';
    return el;
}

function addMarker(el, lngLat) {
    if (!_stationMap) return;
    var m = new Marker({ element: el, lngLat: lngLat });
    m.addTo(_stationMap);
    _mapMarkers.push({ el: el, lng: lngLat[0], lat: lngLat[1] });
}

function removeAllMarkers() {
    for (var i = 0; i < _mapMarkers.length; i++) _mapMarkers[i].el.remove();
    _mapMarkers = [];
    _spotsPlotted = 0;
}

// ── Popup overlay ─────────────────────────────────────────────────────────────────
function showPopup(html) {
    var popup = document.getElementById('station-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'station-popup';
        popup.className = 'map-popup';
        var box = document.getElementById('station-map');
        if (box) box.appendChild(popup);
    }
    if (!popup) return;
    popup.innerHTML = html;
    popup.style.display = 'block';
    popup.hidden = false;
}

// ── Saved spot stars ──────────────────────────────────────────────────────────────
// Plotted from LOCAL state only, on every refresh.
export function plotSavedSpotStars() {
    if (typeof spotsState === 'undefined' || !spotsState.rows.length) return 0;
    var plotted = 0;
    spotsState.rows.forEach(function (sp) {
        if (sp.latitude == null || sp.longitude == null) return;
        var el = makeStarEl();
        el.addEventListener('click', function () { showPopup(savedSpotPopupHtml(sp)); });
        addMarker(el, [Number(sp.longitude), Number(sp.latitude)]);
        plotted++;
    });
    _spotsPlotted = plotted;
    return plotted;
}

// ── Refresh stations ──────────────────────────────────────────────────────────────
export async function refreshStationMap(center) {
    if (!_stationMap || typeof apiGetJson !== 'function') {
        return { count: 0, note: '', error: null, status: 0, spots: 0 };
    }
    var out = { count: 0, note: '', error: null, status: 0, spots: 0 };
    var res = await apiGetJson('/api/nearby_stations?lat=' + center[0] + '&lon=' + center[1],
                              { label: 'nearby_stations' });
    removeAllMarkers();
    if (res.ok) {
        var stations = (res.data && res.data.stations) ? res.data.stations : [];
        // Centre dot
        var dotEl = document.createElement('div');
        dotEl.className = 'map-centre-dot';
        addMarker(dotEl, [center[1], center[0]]);
        // Station pins
        stations.forEach(function (s) {
            if (s.lat == null || s.lon == null) return;
            var el = makePinEl(mapPinColor(s));
            el.addEventListener('click', function () { showPopup(stationPopupHtml(s)); });
            addMarker(el, [s.lon, s.lat]);
        });
        out.count = stations.length;
        out.note = (res.data && res.data.note) || '';
        logDebug('Station map: ' + stations.length + ' gauge(s) plotted', 'MAP');
    } else {
        out.error = res.error;
        out.status = res.status;
        out.note = res.serverMessage || '';
    }
    out.spots = plotSavedSpotStars();
    return out;
}

// ── Tile layer toggle ──────────────────────────────────────────────────────────────
function toggleTiles() {
    if (!_stationMap) return;
    _tileMode = (_tileMode === 'street') ? 'satellite' : 'street';
    var url = (_tileMode === 'street') ? STREET_TILES : SATELLITE_TILES;
    var attr = (_tileMode === 'street') ? '\u00a9 OpenStreetMap' : '\u00a9 Esri';
    var s = { version: 8, sources: { 'base': { type: 'raster', tiles: [url], tileSize: 256, attribution: attr } },
        layers: [{ id: 'base', type: 'raster', source: 'base', minzoom: 0, maxzoom: 19 }] };
    _stationMap.setStyle(s);
    var btn = document.getElementById('map-tile-toggle');
    if (btn) {
        btn.textContent = (_tileMode === 'street') ? '\ud83d\uddfa Sat' : '\ud83d\uddfa Str';
        btn.title = 'Switch to ' + (_tileMode === 'street' ? 'satellite' : 'street') + ' view';
    }
}

// ── Spot picker ───────────────────────────────────────────────────────────────────
export function startSpotPick() { openSpotPickMap(); }
window.startSpotPick = startSpotPick;

export async function openSpotPickMap() {
    if (!_stationMap) {
        spotsStatus('Loading the map\u2026');
        try { await showStationMap(); } catch (e) {}
    }
    if (!_stationMap) {
        spotsStatus('Map unavailable (offline or CDN blocked) \u2014 use the presets or GPS instead.');
        return;
    }
    var p = document.getElementById('station-popup');
    if (p) { p.style.display = 'none'; p.hidden = true; }
    spotsStatus('Now tap the map where your spot is.');
    if (_stationMap.getContainer) _stationMap.getContainer().style.cursor = 'crosshair';
    _spotPicking = true;
    var label = (typeof getStr === 'function') ? (getStr('spot-label') || '').trim() : '';
    if (!label) { var inp = document.getElementById('spot-label'); if (inp && inp.focus) inp.focus(); }
}

export async function onSpotPick(e) {
    if (_stationMap && _stationMap.getContainer) _stationMap.getContainer().style.cursor = '';
    _spotPicking = false;
    if (!e || (e.lat == null && (!e.latlng || e.latlng.lat == null))) return;
    var lat = e.lat != null ? e.lat : e.latlng.lat;
    var lng = e.lng != null ? e.lng : e.latlng.lng;
    var label = (typeof getStr === 'function') ? (getStr('spot-label') || '').trim().slice(0, SPOT_LABEL_MAX) : '';
    if (!label) {
        var typed = window.prompt('Name this spot', 'My spot');
        if (typed == null) { spotsStatus('Cancelled \u2014 tap the map again when you are ready.'); return; }
        label = String(typed).trim().slice(0, SPOT_LABEL_MAX);
        if (!label) { spotsStatus('A spot needs a name \u2014 tap the map again.'); return; }
        setFieldValue('spot-label', label);
    }
    spotsStatus('Saving\u2026');
    var id = await saveSpotAt(lat, lng, label);
    if (!id) { spotsStatus('Could not save that spot.'); return; }
    setFieldValue('spot-label', '');
    if (typeof showToast === 'function') showToast('Spot saved (private)', 'success', 2500);
    await loadFavoriteSpots();
    try { await refreshStationMap(mapCenter()); } catch (err) {}
    spotsStatus('Saved. Tap its star to load the conditions there.');
}

// ── Show / build map ──────────────────────────────────────────────────────────────
export async function showStationMap() {
    var box = document.getElementById('station-map');
    var note = document.getElementById('station-map-note');
    if (!box) return;
    box.hidden = false;
    if (note) { note.hidden = false; note.textContent = 'Loading map\u2026'; }
    if (typeof loadFavoriteSpots === 'function') { try { await loadFavoriteSpots(); } catch (e) {} }
    var center = mapCenter();

    if (!_stationMap) {
        var baseStyle = {
            version: 8,
            sources: { 'base': { type: 'raster', tiles: [STREET_TILES], tileSize: 256, attribution: '\u00a9 OpenStreetMap' } },
            layers: [{ id: 'base', type: 'raster', source: 'base', minzoom: 0, maxzoom: 19 }]
        };
        _stationMap = new MaplibreMap({
            container: box,
            style: baseStyle,
            center: [center[1], center[0]],
            zoom: MAP_START_ZOOM,
            attribution: { compact: true }
        });
        _stationMap.on('click', function (e) {
            if (_spotPicking) onSpotPick(e);
            else { var p = document.getElementById('station-popup'); if (p) { p.style.display = 'none'; p.hidden = true; } }
        });
        _stationMap.addControl(new GeolocateControl({
            positionOptions: { enableHighAccuracy: false }, fitBoundsOptions: { padding: 100 }
        }));
        var tb = document.createElement('button');
        tb.id = 'map-tile-toggle'; tb.className = 'map-tile-toggle-btn';
        tb.addEventListener('click', toggleTiles);
        tb.textContent = '\ud83d\uddfa Sat'; tb.title = 'Switch to satellite view';
        box.appendChild(tb);
    } else {
        _stationMap.setCenter([center[1], center[0]]);
    }

    try {
        var out = await refreshStationMap(center);
        if (note) {
            var spotsN = (typeof spotsState !== 'undefined' && spotsState.rows.length)
                ? ' \u00b7 ' + spotsState.rows.length + ' saved spot(s) (star).' : '';
            if (out.error) note.textContent = 'Could not load nearby gauges (' + out.error + ')' +
                ' \u2014 use the presets, search or GPS above.' + (out.spots ? ' Your saved spots (star) are still shown.' : '');
            else if (out.note) note.textContent = out.note;
            else if (out.count) note.textContent = out.count + ' nearest gauge(s) \u2014 grey = dormant, green = live.' + spotsN + ' Tap a pin to fish it.';
            else note.textContent = 'No live gauges found nearby.' + spotsN;
        }
    } catch (e) {
        logDebug('Station map feed failed: ' + e.message, 'MAP');
        if (note) note.textContent = 'Could not load nearby gauges \u2014 use the presets, search or GPS above.';
    }
}
window.showStationMap = showStationMap;
