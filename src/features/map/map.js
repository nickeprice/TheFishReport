/**
 * src/features/map/map.js - interactive station map (CDN MapLibre GL JS).
 *
 * public: openMapScreen(), closeMapScreen(), refreshStationMap(center), mapCenter()
 *
 * Uses MapLibre GL JS v4.7.1 loaded from CDN (unpkg). Satellite imagery base
 * with gauge pins, saved spot stars, and tap-to-pin drop via FAB.
 *
 * Pin colour: green = live, grey = dormant.
 *
 * ES module.
 */
import { logDebug } from '../../shared/debug.js';
import { apiGetJson } from '../../shared/api.js';
import { State } from '../../shared/state.js';
import { escapeHtml, escapeJsString } from '../../shared/format.js';
import { showToast } from '../../shared/ui.js';
import { spotsState, SPOT_LABEL_MAX, loadFavoriteSpots, saveSpotAt, renderDrawerSpots } from './spots.js';
import { savedSpotPopupHtml } from './spots-map.js';
import { selectPreset } from '../station/picker.js';

const maplibregl = window.maplibregl;

// ── Map constants ──────────────────────────────────────────────────────────────
var MAP_DEFAULT_CENTER = [-122.2943, 47.1932];
var MAP_START_ZOOM = 11;
var MAP_STYLE = { version: 8, sources: {
    satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.jpg'], tileSize: 256, attribution: '\u00a9 Esri' }
}, layers: [
    { id: 'satellite-base', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 19 }
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
    var m = new maplibregl.Marker({ element: el, lngLat: lngLat });
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
    var popup = document.getElementById('pin-popup');
    if (popup) {
        var body = document.getElementById('pin-popup-body');
        if (body) body.innerHTML = html;
        popup.hidden = false;
        popup.style.display = 'block';
    }
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
export var mapScreenOpen = false;
window.mapScreenOpen = mapScreenOpen;

export async function openMapScreen() {
    var screen = document.getElementById('map-screen');
    if (!screen) return;
    var topNav = document.getElementById('top-nav');
    if (topNav) topNav.style.display = 'none';
    screen.classList.remove('map-screen-hidden');
    var loading = document.getElementById('map-loading');
    if (loading) loading.style.display = 'block';
    var handleStation = document.getElementById('map-handle-station');
    if (handleStation) {
        var activeName = document.getElementById('active-station-name');
        handleStation.textContent = activeName ? activeName.textContent : 'Select a river';
    }
    mapScreenOpen = true;
    var box = document.getElementById('map-container');
    if (!box) return;
    if (typeof loadFavoriteSpots === 'function') { try { await loadFavoriteSpots(); } catch (e) {} }
    if (!_stationMap) {
        _stationMap = new maplibregl.Map({
            container: box,
            style: MAP_STYLE,
            center: MAP_DEFAULT_CENTER,
            zoom: MAP_START_ZOOM
        });
        // Render gauge pins on load
        _stationMap.on('load', function () {
            var stations = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.stations;
            if (stations) {
                Object.values(stations).forEach(function (st) {
                    var el = document.createElement('div');
                    el.className = 'station-pin-dot';
                    el.style.backgroundColor = '#22c55e';
                    el.addEventListener('click', function (e) {
                        e.stopPropagation();
                        if (typeof selectPreset === 'function') selectPreset(st.id, st.lat, st.lon, st.name);
                        closeMapScreen();
                    });
                    new maplibregl.Marker({ element: el }).setLngLat([st.lon, st.lat]).addTo(_stationMap);
                });
            }
        });
        // Tap-to-pin click handler
        _stationMap.on('click', function (e) {
            var fab = document.getElementById('map-fab');
            if (fab && fab.innerText === '\u2715') {
                var lat = e.lngLat.lat, lng = e.lngLat.lng;
                var tempEl = document.createElement('div');
                tempEl.className = 'temp-pin-dot';
                if (window._tempMarker) { try { window._tempMarker.remove(); } catch (ex) {} }
                window._tempMarker = new maplibregl.Marker({ element: tempEl }).setLngLat([lng, lat]).addTo(_stationMap);
                var pill = document.getElementById('pin-name-pill');
                if (pill) {
                    pill.style.display = 'flex';
                    var coords = document.querySelector('.pin-pill-coords');
                    if (coords) coords.textContent = Number(lat).toFixed(4) + '\u00b0N ' + Number(lng).toFixed(4) + '\u00b0W';
                }
                window._pendingPinCoords = { lat: lat, lng: lng };
                fab.textContent = '+';
                fab.style.background = '#23402a';
                fab.style.border = '2px solid #2d5a3a';
            }
        });
        _stationMap.addControl(new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: false }, fitBoundsOptions: { padding: 100 }
        }));
    }
    if (loading) loading.style.display = 'none';
}
window.openMapScreen = openMapScreen;

export function closeMapScreen() {
    var screen = document.getElementById('map-screen');
    if (screen) screen.classList.add('map-screen-hidden');
    // Restore the old UI top nav
    var topNav = document.getElementById('top-nav');
    if (topNav) topNav.style.display = '';
    mapScreenOpen = false;
}
window.closeMapScreen = closeMapScreen;

// ── Drawer toggle ──────────────────────────────────────────────────────────────────
var _drawerOpen = false;

export function toggleDrawer() {
    _drawerOpen = !_drawerOpen;
    var drawer = document.getElementById('map-drawer');
    var arrow = document.getElementById('map-handle-arrow');
    if (drawer) {
        if (_drawerOpen) {
            drawer.classList.add('map-drawer-open');
            if (arrow) arrow.textContent = '\u25bc';
            // Populate spots + results on first open
            renderDrawerContent();
        } else {
            drawer.classList.remove('map-drawer-open');
            if (arrow) arrow.textContent = '\u25b2';
        }
    }
}
window.toggleDrawer = toggleDrawer;

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
    // If FAB pin-drop mode is active, drop a pin
    if (_fabPinning) {
        dropTempPin(lat, lng);
        showNamePill(lat, lng);
        // Reset FAB to + state
        _fabPinning = false;
        var fab = document.getElementById('map-fab');
        if (fab) { fab.textContent = '+'; fab.style.background = '#23402a'; fab.style.border = '2px solid #2d5a3a'; }
        return;
    }
    // Dismiss existing pill if present
    if (_pendingPin) {
        var pill = document.getElementById('pin-name-pill');
        if (pill) { pill.style.display = 'none'; pill.hidden = true; }
        _pendingPin = null;
    }
}

// ── Drawer content: spots + river results ──────────────────────────────────────
function renderDrawerContent() {
    // Populate saved spots row
    var spotsRow = document.getElementById('drawer-spots');
    if (spotsRow && typeof renderDrawerSpots === 'function') renderDrawerSpots(spotsRow);
    // Populate river results
    renderDrawerResults();
}

export function onDrawerFilter() {
    renderDrawerResults();
}
window.onDrawerFilter = onDrawerFilter;

function renderDrawerResults() {
    var results = document.getElementById('drawer-results');
    var filterEl = document.getElementById('drawer-search');
    if (!results) return;
    var pool = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.discovery_pool;
    var wbs = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.waterbodies;
    if (!pool || !pool.length) { results.innerHTML = ''; return; }
    var filter = filterEl ? filterEl.value.trim().toLowerCase() : '';
    // Build site_id → waterbody name lookup
    var siteToWb = {};
    if (wbs) {
        for (var i = 0; i < wbs.length; i++) {
            var wb = wbs[i];
            if (wb.gauge && wb.gauge.site_id) siteToWb[wb.gauge.site_id] = wb.name;
            if (wb.related_gauges) {
                for (var j = 0; j < wb.related_gauges.length; j++)
                    siteToWb[wb.related_gauges[j].site_id] = wb.name;
            }
        }
    }
    // Group pool by waterbody name
    var groups = {};
    for (var k = 0; k < pool.length; k++) {
        var s = pool[k];
        if (!s || !s.site_id || !s.coords) continue;
        var wbName = siteToWb[s.site_id] || s.name.replace(/ at .*$/, '').replace(/ near .*$/, '');
        if (!groups[wbName]) groups[wbName] = [];
        groups[wbName].push(s);
    }
    var names = Object.keys(groups);
    // Filter
    if (filter) {
        names = names.filter(function(n) {
            if (n.toLowerCase().indexOf(filter) >= 0) return true;
            for (var fi = 0; fi < groups[n].length; fi++) {
                if (groups[n][fi].name.toLowerCase().indexOf(filter) >= 0 ||
                    groups[n][fi].site_id.indexOf(filter) >= 0) return true;
            }
            return false;
        });
    }
    names.sort(function(a, b) { return a.localeCompare(b); });
    if (!names.length) { results.innerHTML = ''; return; }
    var html = '';
    for (var gi = 0; gi < names.length; gi++) {
        var name = names[gi];
        var items = groups[name];
        html += '<div class="result-row" onclick="mapResultSelect(\'' +
            escapeJsString(items[0].site_id) + '\', ' +
            Number(items[0].coords.lat) + ', ' +
            Number(items[0].coords.lon) + ', \'' +
            escapeJsString(name) + '\')">' +
            '<div class="result-row-name">' + escapeHtml(name) + '</div>' +
            '<div class="result-row-sub">' + escapeHtml(items[0].name) + '</div></div>';
    }
    results.innerHTML = html;
}

// When a river card is tapped — select it and close the map
export function mapResultSelect(siteId, lat, lon, name) {
    if (_stationMap) {
        _stationMap.setCenter([lon, lat]);
        if (_stationMap.getZoom() < 11) _stationMap.setZoom(11);
    }
    if (_drawerOpen) toggleDrawer();
    var handleStation = document.getElementById('map-handle-station');
    if (handleStation) handleStation.textContent = name;
}
window.mapResultSelect = mapResultSelect;

// ── FAB toggle: + / X state ─────────────────────────────────────────────────────
var _fabPinning = false;

export function toggleFabSpotDrop() {
    _fabPinning = !_fabPinning;
    var fab = document.getElementById('map-fab');
    if (fab) {
        if (_fabPinning) {
            fab.textContent = '\u2715';
            fab.style.background = '#5a3030';
            fab.style.border = '2px solid #8a5050';
            var handle = document.getElementById('map-handle-station');
            if (handle) handle.textContent = 'Tap the map to drop a pin';
        } else {
            fab.textContent = '+';
            fab.style.background = '#23402a';
            fab.style.border = '2px solid #2d5a3a';
            var handle = document.getElementById('map-handle-station');
            if (handle) {
                var activeName = document.getElementById('active-station-name');
                handle.textContent = activeName ? activeName.textContent : 'Select a river';
            }
            cancelPinSpot();
        }
    }
}
window.toggleFabSpotDrop = toggleFabSpotDrop;

// ── Shims for backward compatibility ─────────────────────────────────────────────
export async function showStationMap() { await openMapScreen(); }
window.showStationMap = showStationMap;

export function startSpotPick() { openMapScreen(); }
window.startSpotPick = startSpotPick;

export async function onSpotPick(e) { onMapClick(e); }

// Legacy aliases (removed old modal names)
export var mapModalOpen = mapScreenOpen;
window.mapModalOpen = mapModalOpen;
export async function openMapModal() { return openMapScreen(); }
window.openMapModal = openMapModal;
export function closeMapModal() { return closeMapScreen(); }
window.closeMapModal = closeMapModal;
