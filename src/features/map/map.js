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

// ── Composite style: satellite base + road/label vector overlay ─────────────────
var SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.jpg';
var OVERLAY_URL = 'https://tiles.openfreemap.com/tiles/{z}/{x}/{y}.pbf';
var MAP_DEFAULT_CENTER = [-122.302, 47.195];  // [lng, lat]
var MAP_START_ZOOM = 10;

// MapLibre style JSON: satellite raster + OpenFreeMap vector overlay for roads/labels
var MAP_STYLE = { version: 8, sources: {
    satellite: { type: 'raster', tiles: [SATELLITE_URL], tileSize: 256, attribution: '\u00a9 Esri' },
    overlay: { type: 'vector', tiles: [OVERLAY_URL], minzoom: 0, maxzoom: 14, attribution: '\u00a9 OpenFreeMap' }
}, layers: [
    { id: 'satellite-base', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 19 },
    // Roads
    { id: 'road-highway', type: 'line', source: 'overlay', 'source-layer': 'road',
      filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
      paint: { 'line-color': '#fff', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3] }, minzoom: 6 },
    { id: 'road-secondary', type: 'line', source: 'overlay', 'source-layer': 'road',
      filter: ['!in', 'class', 'motorway', 'trunk', 'primary'],
      paint: { 'line-color': '#ddd', 'line-opacity': 0.2, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5] }, minzoom: 8 },
    // Place labels (city/town names)
    { id: 'place-label', type: 'symbol', source: 'overlay', 'source-layer': 'place',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5,
               'text-size': ['match', ['get', 'class'], 'city', 13, 'town', 10, 8],
               'text-field': ['get', 'name'], 'text-max-width': 8 }, minzoom: 6 },
    // Water labels (river names)
    { id: 'water-label', type: 'symbol', source: 'overlay', 'source-layer': 'water_name',
      paint: { 'text-color': '#b0d0f0', 'text-halo-color': '#000', 'text-halo-width': 1.2,
               'text-size': 10, 'text-field': ['get', 'name'] },
      placement: 'line-center', minzoom: 8 }
] };

var _stationMap = null;
var _mapMarkers = [];
var _spotsPlotted = 0;

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
        var box = document.getElementById('map-modal-container');
        if (box) box.appendChild(popup);
    }
    if (!popup) return;
    popup.innerHTML = html;
    popup.style.display = 'block';
    popup.hidden = false;
}

// ── Saved spot stars ──────────────────────────────────────────────────────────────
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
        var dotEl = document.createElement('div');
        dotEl.className = 'map-centre-dot';
        addMarker(dotEl, [center[1], center[0]]);
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

// ── Open / close map modal ─────────────────────────────────────────────────────────
export var mapModalOpen = false;
window.mapModalOpen = mapModalOpen;

export async function openMapModal() {
    var modal = document.getElementById('map-modal');
    var note = document.getElementById('station-map-note');
    if (!modal) return;
    modal.hidden = false;
    if (note) { note.hidden = false; note.textContent = 'Loading map\u2026'; }
    if (typeof loadFavoriteSpots === 'function') { try { await loadFavoriteSpots(); } catch (e) {} }
    var center = mapCenter();
    if (!_stationMap) {
        var box = document.getElementById('map-modal-container');
        if (!box) return;
        _stationMap = new MaplibreMap({
            container: box,
            style: MAP_STYLE,
            center: [center[1], center[0]],
            zoom: MAP_START_ZOOM,
            attribution: { compact: true }
        });
        _stationMap.on('click', function (e) {
            var p = document.getElementById('station-popup');
            if (p) { p.style.display = 'none'; p.hidden = true; }
            onMapClick(e);
        });
        _stationMap.addControl(new GeolocateControl({
            positionOptions: { enableHighAccuracy: false }, fitBoundsOptions: { padding: 100 }
        }));
    } else {
        _stationMap.setCenter([center[1], center[0]]);
    }
    try {
        var out = await refreshStationMap(center);
        if (note) {
            var spotsN = (typeof spotsState !== 'undefined' && spotsState.rows.length)
                ? ' \u00b7 ' + spotsState.rows.length + ' saved spot(s) (star).' : '';
            if (out.error) note.textContent = 'Could not load nearby gauges (' + out.error + ')' +
                ' \u2014 use the presets or GPS above.' + (out.spots ? ' Your saved spots (star) are still shown.' : '');
            else if (out.note) note.textContent = out.note;
            else if (out.count) note.textContent = out.count + ' nearest gauge(s) \u2014 grey = dormant, green = live.' + spotsN;
            else note.textContent = 'No live gauges found nearby.' + spotsN;
        }
    } catch (e) {
        logDebug('Station map feed failed: ' + e.message, 'MAP');
        if (note) note.textContent = 'Could not load nearby gauges.';
    }
    mapModalOpen = true;
}
window.openMapModal = openMapModal;

export function closeMapModal() {
    var modal = document.getElementById('map-modal');
    if (modal) modal.hidden = true;
    mapModalOpen = false;
}
window.closeMapModal = closeMapModal;

// ── Temporary pin for spot-drop —─────────────────────────────────────────────────
var _tempPin = null;  // { el, lat, lng }

function dropTempPin(lat, lng) {
    clearTempPin();
    var el = document.createElement('div');
    el.className = 'station-pin';
    el.innerHTML = '<span class="temp-pin-dot"></span>';
    addMarker(el, [lng, lat]);
    // last marker in the list is the new temp pin
    _tempPin = _mapMarkers.length > 0 ? { el: _mapMarkers[_mapMarkers.length - 1].el, lat: lat, lng: lng } : null;
}

function clearTempPin() {
    // Remove temp pin element and its marker entry
    if (_tempPin) {
        for (var i = 0; i < _mapMarkers.length; i++) {
            if (_mapMarkers[i].el === _tempPin.el) {
                _tempPin.el.remove();
                _mapMarkers.splice(i, 1);
                break;
            }
        }
        _tempPin = null;
    }
}

// ── Floating name pill ───────────────────────────────────────────────────────────
function showNamePill(lat, lng) {
    var pill = document.getElementById('pin-name-pill');
    if (!pill) {
        pill = document.createElement('div');
        pill.id = 'pin-name-pill';
        pill.className = 'pin-name-pill';
        var modal = document.getElementById('map-modal');
        if (modal) modal.appendChild(pill);
    }
    pill.innerHTML = '<div class="pin-pill-body"><input type="text" id="pin-pill-input" maxlength="60" placeholder="Name this spot" value="">' +
        '<button class="pin-pill-save" onclick="confirmPinSpot()">\u2713</button>' +
        '<button class="pin-pill-cancel" onclick="cancelPinSpot()">\u2715</button></div>' +
        '<div class="pin-pill-coords"></div>';
    pill.style.display = 'flex';
    pill.hidden = false;
    var coords = document.querySelector('.pin-pill-coords');
    if (coords) coords.textContent = Number(lat).toFixed(4) + '\u00b0N, ' + Number(lng).toFixed(4) + '\u00b0W';
    var input = document.getElementById('pin-pill-input');
    if (input) { input.focus(); input.select(); }
    _pendingPin = { lat: lat, lng: lng };
}

function hideNamePill() {
    var pill = document.getElementById('pin-name-pill');
    if (pill) { pill.style.display = 'none'; pill.hidden = true; }
}

var _pendingPin = null;

export function confirmPinSpot() {
    if (!_pendingPin) return;
    var input = document.getElementById('pin-pill-input');
    var label = input ? input.value.trim().slice(0, SPOT_LABEL_MAX) : '';
    if (!label) label = 'Spot at ' + Number(_pendingPin.lat).toFixed(4) + '\u00b0N ' + Number(_pendingPin.lng).toFixed(4) + '\u00b0W';
    hideNamePill();
    doSavePin(_pendingPin.lat, _pendingPin.lng, label);
}
window.confirmPinSpot = confirmPinSpot;

export function cancelPinSpot() {
    clearTempPin();
    hideNamePill();
    _pendingPin = null;
}
window.cancelPinSpot = cancelPinSpot;

async function doSavePin(lat, lng, label) {
    clearTempPin();
    var id = await saveSpotAt(lat, lng, label);
    if (!id) { if (typeof showToast === 'function') showToast('Could not save that spot.', 'warn', 4000); return; }
    if (typeof showToast === 'function') showToast('Saved: ' + label, 'success', 2500);
    await loadFavoriteSpots();
    try { await refreshStationMap(mapCenter()); } catch (err) {}
}

// ── Map click handler ─────────────────────────────────────────────────────────────
export function onMapClick(e) {
    if (!e || e.lat == null || e.lng == null) {
        if (!e || !e.latlng) return;
    }
    var lat = e.lat != null ? e.lat : e.latlng.lat;
    var lng = e.lng != null ? e.lng : e.latlng.lng;
    // Dismiss existing pill if present
    if (_pendingPin) {
        var pill = document.getElementById('pin-name-pill');
        if (pill) { pill.style.display = 'none'; pill.hidden = true; }
        _pendingPin = null;
    }
    dropTempPin(lat, lng);
    showNamePill(lat, lng);
}

// ── Shims for backward compatibility ─────────────────────────────────────────────
export async function showStationMap() { await openMapModal(); }
window.showStationMap = showStationMap;

export function startSpotPick() { openMapModal(); }
window.startSpotPick = startSpotPick;

export async function onSpotPick(e) { onMapClick(e); }
