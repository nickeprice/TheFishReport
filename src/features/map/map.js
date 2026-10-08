/**
 * src/features/map/map.js - interactive station map (CDN MapLibre GL JS).
 *
 * public: openMapScreen(), closeMapScreen(), refreshStationMap(center), mapCenter()
 *
 * Uses MapLibre GL JS v4.7.1 loaded from CDN (unpkg). Satellite imagery base
 * with gauge pins, saved spot stars, and tap-to-pin drop via FAB.
 *
 * Pin colour: green = permanent with data, yellow = seasonal (in season), red = error state, grey = offline.
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
import { getGPS } from '../gear-sim/inputs.js';

const maplibregl = window.maplibregl;

// ── Map constants ──────────────────────────────────────────────────────────────
const MAP_DEFAULT_CENTER = [-122.2943, 47.1932];
const MAP_START_ZOOM = 11;
const MAP_STYLE = {
    version: 8, sources: {
        satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.jpg'], tileSize: 256, attribution: '\u00a9 Esri' }
    }, layers: [
        { id: 'satellite-base', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 19 }
    ]
};

let _stationMap = null;
let _mapMarkers = [];
let _spotsPlotted = 0;

export function loadLeaflet() { return Promise.resolve(true); }
window.loadLeaflet = loadLeaflet;

// ── Pin helpers ──────────────────────────────────────────────────────────────────
export function mapPinHasReading(station) {
    if (!station) return false;
    return (station.cfs !== undefined && station.cfs !== null) ||
        (station.gage !== undefined && station.gage !== null);
}

function _mapPoolEntry(siteId) {
    // Look up gauge_type from the region registry (loaded as window.REGIONS)
    var pool = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.discovery_pool;
    if (!pool || !siteId) return null;
    for (var i = 0; i < pool.length; i++) {
        if (pool[i].site_id === siteId) return pool[i];
    }
    return null;
}

export function mapPinGaugeType(siteId) {
    var entry = _mapPoolEntry(siteId);
    return entry ? (entry.gauge_type || 'permanent') : 'permanent';
}

export function mapPinIsSeasonal(siteId) {
    var entry = _mapPoolEntry(siteId);
    if (!entry || entry.gauge_type !== 'seasonal') return false;
    // Check current date against season window
    var now = new Date();
    var today = (now.getMonth() + 1) * 100 + now.getDate(); // MMDD
    var start = entry.season_start ? parseInt(entry.season_start.replace('-',''), 10) : 0;
    var end = entry.season_end ? parseInt(entry.season_end.replace('-',''), 10) : 0;
    if (start === 0 || end === 0) return false;
    // Handle wrap-around (season crossing Dec 31)
    if (start <= end) return today >= start && today <= end;
    return today >= start || today <= end;
}

export function mapPinHasError(station) {
    if (!station) return false;
    var gType = mapPinGaugeType(station.id);
    if (gType === 'seasonal' && !mapPinIsSeasonal(station.id)) return false;
    // Permanent or seasonal-in-season: should have data
    return !mapPinHasReading(station);
}

export function mapPinColor(station) {
    if (!station) return '#94a3b8';
    // Red = gauge expected to report but missing data (permanent or in-season seasonal)
    if (mapPinHasError(station)) return '#ef4444';
    var gType = mapPinGaugeType(station.id);
    // Yellow = seasonal gauge currently in its operational window
    if (gType === 'seasonal' && mapPinIsSeasonal(station.id)) return '#eab308';
    // Green = permanent or off-season seasonal gauge with data
    if (mapPinHasReading(station)) return '#22c55e';
    // Grey = permanent gauge temporarily unreachable
    return '#94a3b8';
}

export function mapLegalText(rule) {
    if (rule === '24hr') return 'Open all day';
    if (rule === 'daylight') return 'Daylight window (1h either side of sunrise/sunset)';
    return 'Hours not verified \u2014 check the regulations';
}

export function stationPopupHtml(s) {
    const cfs = (s.cfs === undefined || s.cfs === null) ? '--' : s.cfs;
    const gage = (s.gage === undefined || s.gage === null) ? '--' : s.gage;
    var legalBadge = '';
    if (s.legal_hours === '24hr') {
        legalBadge = '<span class="pin-popup-badge badge-open">OPEN</span>';
    } else if (s.legal_hours === 'daylight') {
        legalBadge = '<span class="pin-popup-badge badge-daylight">DAYLIGHT</span>';
    } else {
        legalBadge = '<span class="pin-popup-badge badge-closed">CLOSED</span>';
    }
    // Gauge type badge
    var gType = mapPinGaugeType(s.id);
    var typeBadge = '';
    if (gType === 'seasonal') {
        var entry = _mapPoolEntry(s.id);
        var sw = entry && entry.season_start ? entry.season_start : '??';
        var ew = entry && entry.season_end ? entry.season_end : '??';
        typeBadge = '<span class="pin-popup-badge badge-seasonal">SEASONAL (' + sw + ' - ' + ew + ')</span>';
    } else {
        typeBadge = '<span class="pin-popup-badge badge-permanent">PERMANENT</span>';
    }
    // Error badge for gauges expected to report but missing data
    var errorBadge = '';
    if (mapPinHasError(s)) {
        errorBadge = '<span class="pin-popup-badge badge-error">&#9888; NO DATA</span>';
    }
    const safeId = escapeJsString(s.id || '');
    const safeName = escapeJsString(s.name || s.id);
    return '<span class="pin-popup-title">' + escapeHtml(s.name || s.id) + '</span>' +
        '<span class="pin-popup-meta">USGS ' + escapeHtml(s.id || '') + '</span>' +
        typeBadge +
        errorBadge +
        '<span class="pin-popup-cfs">' + escapeHtml(String(cfs)) + ' <span class="pin-popup-cfs-label">CFS</span> \u00b7 ' + escapeHtml(String(gage)) + ' <span class="pin-popup-cfs-label">ft</span></span>' +
        legalBadge +
        '<button class="pin-popup-btn" onclick="selectPreset(\'' + safeId + '\',' +
        Number(s.lat) + ',' + Number(s.lon) + ',\'' + safeName +
        '\'); closeMapScreen(); return false;">\u00b7\u00b7\u00b7 Fish this gauge</button>';
}

// ── Map centre ───────────────────────────────────────────────────────────────────
export function mapCenter() {
    if (_stationMap) {
        const c = _stationMap.getCenter();
        if (c) return [c.lat, c.lng];
    }
    // State.userGPSCoords is stored as [lng, lat] array
    if (State.userGPSCoords && State.userGPSCoords.length >= 2 && State.userGPSCoords[0] != null && State.userGPSCoords[1] != null) {
        return [State.userGPSCoords[1], State.userGPSCoords[0]];  // return [lat, lng]
    }
    try {
        const stored = JSON.parse(localStorage.getItem('active_station') || 'null');
        if (stored && stored.lat != null && stored.lon != null) return [stored.lat, stored.lon];
    } catch (e) { }
    return [MAP_DEFAULT_CENTER[1], MAP_DEFAULT_CENTER[0]];  // [lat, lng]
}
window.mapCenter = mapCenter;

// ── Marker helpers ───────────────────────────────────────────────────────────────
function makePinEl(color) {
    const el = document.createElement('div');
    el.className = 'station-pin';
    el.innerHTML = '<span class="station-pin-dot" style="background:' + color + '"></span>';
    return el;
}

function makeStarEl() {
    const el = document.createElement('div');
    el.className = 'spot-pin';
    el.innerHTML = '<span class="spot-pin-dot">\u2605</span>';
    return el;
}

function addMarker(el, lngLat) {
    if (!_stationMap) return;
    // MapLibre fix: lngLat must be set via method, not the config object
    const m = new maplibregl.Marker({ element: el });
    m.setLngLat(lngLat);
    m.addTo(_stationMap);
    _mapMarkers.push({ el: el, lng: lngLat[0], lat: lngLat[1] });
}

function removeAllMarkers() {
    for (let i = 0; i < _mapMarkers.length; i++) _mapMarkers[i].el.remove();
    _mapMarkers = [];
    _spotsPlotted = 0;
}

// ── Popup overlay ─────────────────────────────────────────────────────────────────
function showPopup(html) {
    const popup = document.getElementById('pin-popup');
    if (popup) {
        const body = document.getElementById('pin-popup-body');
        if (body) body.innerHTML = html;
        popup.hidden = false;
        popup.style.display = 'block';
    }
}

// ── Saved spot stars ──────────────────────────────────────────────────────────────
export function plotSavedSpotStars() {
    if (typeof spotsState === 'undefined' || !spotsState.rows.length) return 0;
    let plotted = 0;
    spotsState.rows.forEach(function (sp) {
        if (sp.latitude == null || sp.longitude == null) return;
        const el = makeStarEl();
        el.addEventListener('click', function (e) {
            e.stopPropagation();
            showPopup(savedSpotPopupHtml(sp));
        });
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
    const out = { count: 0, note: '', error: null, status: 0, spots: 0 };
    const res = await apiGetJson('/api/nearby_stations?lat=' + center[0] + '&lon=' + center[1],
        { label: 'nearby_stations' });
    removeAllMarkers();
    if (res.ok) {
        const stations = (res.data && res.data.stations) ? res.data.stations : [];
        const dotEl = document.createElement('div');
        dotEl.className = 'map-centre-dot';
        addMarker(dotEl, [center[1], center[0]]);
        stations.forEach(function (s) {
            if (s.lat == null || s.lon == null) return;
            // Skip seasonal gauges that are currently out of season
            if (mapPinGaugeType(s.id) === 'seasonal' && !mapPinIsSeasonal(s.id)) return;
            const el = makePinEl(mapPinColor(s));
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                showPopup(stationPopupHtml(s));
            });
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
    const screen = document.getElementById('map-screen');
    if (!screen) return;
    const topNav = document.getElementById('top-nav');
    if (topNav) topNav.style.display = 'none';
    screen.classList.remove('map-screen-hidden');

    // Fix: Force MapLibre to recalculate layout to prevent black screen when reopening
    if (_stationMap) {
        setTimeout(function () { _stationMap.resize(); }, 50);
    }

    const loading = document.getElementById('map-loading');
    if (loading) loading.style.display = 'block';
    const handleStation = document.getElementById('map-handle-station');
    if (handleStation) {
        const activeName = document.getElementById('active-station-name');
        handleStation.textContent = activeName ? activeName.textContent : 'Select a river';
    }
    mapScreenOpen = true;
    const box = document.getElementById('map-container');
    if (!box) return;
    if (typeof loadFavoriteSpots === 'function') { try { await loadFavoriteSpots(); } catch (e) { } }
    if (!_stationMap) {
        // Use app's known GPS position as the map center when available
        const initialCenter = mapCenter();  // returns [lat, lng]
        const mapCenterLngLat = [initialCenter[1], initialCenter[0]];  // MapLibre expects [lng, lat]
        _stationMap = new maplibregl.Map({
            container: box,
            style: MAP_STYLE,
            center: mapCenterLngLat,
            zoom: MAP_START_ZOOM
        });
        // Render gauge pins on load with badge popups
        _stationMap.on('load', function () {
            const stations = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.discovery_pool;
            if (stations) {
                stations.forEach(function (st) {
                    if (!st.coords) return;
                    const el = document.createElement('div');
                    el.className = 'station-pin';
                    el.innerHTML = '<span class="station-pin-dot" style="background:' + mapPinColor({ id: st.site_id, cfs: null, gage: null }) + '"></span>';
                    el.addEventListener('click', function (e) {
                        e.stopPropagation();
                        // Show the badge popup
                        showPopup(stationPopupHtml({
                            id: st.site_id,
                            name: st.name,
                            lat: st.coords.lat,
                            lon: st.coords.lon
                        }));
                    });
                    const m = new maplibregl.Marker({ element: el });
                    m.setLngLat([st.coords.lon, st.coords.lat]);
                    m.addTo(_stationMap);
                });
            }
            plotSavedSpotStars();
        });
        // Tap-to-pin click handler
        _stationMap.on('click', function (e) {
            onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        });
        // GeolocateControl for the familiar white icon — but we strip its broken
        // internal logic and build a fresh button that looks identical.
        const geolocateCtrl = new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: false },
            fitBoundsOptions: { padding: 100 }
        });
        _stationMap.addControl(geolocateCtrl);
        // After the control renders, replace it entirely with a fresh button
        // that uses our own click handler (avoids disabled-state cloning).
        requestAnimationFrame(function () {
            const geoBtn = document.querySelector('.maplibregl-ctrl-geolocate');
            if (!geoBtn) return;
            const parent = geoBtn.parentElement;
            if (!parent) return;
            // Fresh button — NOT a clone, so no inherited disabled state
            const fresh = document.createElement('button');
            fresh.className = 'maplibregl-ctrl-geolocate';
            fresh.title = 'Recenter map on your location';
            const icon = document.createElement('div');
            icon.className = 'maplibregl-ctrl-icon';
            fresh.appendChild(icon);
            fresh.addEventListener('click', async function (e) {
                e.preventDefault();
                e.stopPropagation();
                try {
                    var coords = await getGPS();
                    _stationMap.jumpTo({ center: coords, zoom: MAP_START_ZOOM });
                } catch (err) {
                    alert('Could not determine your location.\n' + err.message);
                }
            });
            parent.replaceChild(fresh, geoBtn);
        });
    }
    if (loading) loading.style.display = 'none';
}
window.openMapScreen = openMapScreen;

// ── GPS recenter ──────────────────────────────────────────────────────────────
export function recenterMap() {
    if (!_stationMap) return;
    const center = mapCenter();  // returns [lat, lng]
    const lngLat = [center[1], center[0]];  // MapLibre expects [lng, lat]
    _stationMap.jumpTo({ center: lngLat, zoom: MAP_START_ZOOM });
}
window.recenterMap = recenterMap;

export function closeMapScreen() {
    const screen = document.getElementById('map-screen');
    if (screen) screen.classList.add('map-screen-hidden');
    // Restore the old UI top nav
    const topNav = document.getElementById('top-nav');
    if (topNav) topNav.style.display = '';
    mapScreenOpen = false;
    const popup = document.getElementById('pin-popup');
    if (popup) { popup.style.display = 'none'; popup.hidden = true; }
}
window.closeMapScreen = closeMapScreen;

// ── Drawer toggle ──────────────────────────────────────────────────────────────────
let _drawerOpen = false;

export function toggleDrawer() {
    _drawerOpen = !_drawerOpen;
    const drawer = document.getElementById('map-drawer');
    const arrow = document.getElementById('map-handle-arrow');
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
let _tempPin = null;  // { el, lat, lng }

function dropTempPin(lat, lng) {
    clearTempPin();
    const el = document.createElement('div');
    el.className = 'station-pin';
    el.innerHTML = '<span class="temp-pin-dot"></span>';
    addMarker(el, [lng, lat]);
    // last marker in the list is the new temp pin
    _tempPin = _mapMarkers.length > 0 ? { el: _mapMarkers[_mapMarkers.length - 1].el, lat: lat, lng: lng } : null;
}

function clearTempPin() {
    // Remove temp pin element and its marker entry
    if (_tempPin) {
        for (let i = 0; i < _mapMarkers.length; i++) {
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
    let pill = document.getElementById('pin-name-pill');
    if (!pill) {
        pill = document.createElement('div');
        pill.id = 'pin-name-pill';
        pill.className = 'pin-name-pill';
        const modal = document.getElementById('map-screen');
        if (modal) modal.appendChild(pill);
    }
    pill.innerHTML = '<div class="pin-pill-body"><input type="text" id="pin-pill-input" maxlength="60" placeholder="Name this spot" value="">' +
        '<button class="pin-pill-save" onclick="confirmPinSpot()">\u2713</button>' +
        '<button class="pin-pill-cancel" onclick="cancelPinSpot()">\u2715</button></div>' +
        '<div class="pin-pill-coords"></div>';
    pill.style.display = 'flex';
    const coords = document.querySelector('.pin-pill-coords');
    if (coords) coords.textContent = Number(lat).toFixed(4) + '\u00b0N, ' + Number(lng).toFixed(4) + '\u00b0W';
    const input = document.getElementById('pin-pill-input');
    if (input) { input.focus(); input.select(); }
    _pendingPin = { lat: lat, lng: lng };
}

function hideNamePill() {
    const pill = document.getElementById('pin-name-pill');
    if (pill) { pill.style.display = 'none'; pill.hidden = true; }
}

var _pendingPin = null;

export function confirmPinSpot() {
    if (!_pendingPin) return;
    const input = document.getElementById('pin-pill-input');
    let label = input ? input.value.trim().slice(0, SPOT_LABEL_MAX) : '';
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
    const id = await saveSpotAt(lat, lng, label);
    if (!id) { if (typeof showToast === 'function') showToast('Could not save that spot.', 'warn', 4000); return; }
    if (typeof showToast === 'function') showToast('Saved: ' + label, 'success', 2500);
    // Remove old markers (temp pins, station pins, old stars) then re-plot stars only.
    // spotsState.rows was already updated by saveSpotAt() so stars appear immediately.
    removeAllMarkers();
    if (typeof plotSavedSpotStars === 'function') plotSavedSpotStars();
}

// ── Map click handler ─────────────────────────────────────────────────────────────
export function onMapClick(e) {
    if (!e || e.lat == null || e.lng == null) {
        if (!e || !e.latlng) return;
    }
    const lat = e.lat != null ? e.lat : e.latlng.lat;
    const lng = e.lng != null ? e.lng : e.latlng.lng;

    // Hide standard popup if open
    const popup = document.getElementById('pin-popup');
    if (popup && !popup.hidden) {
        popup.style.display = 'none';
        popup.hidden = true;
    }

    // If FAB pin-drop mode is active, drop a pin
    if (_fabPinning) {
        dropTempPin(lat, lng);
        showNamePill(lat, lng);
        // Reset FAB to + state
        _fabPinning = false;
        const fab = document.getElementById('map-fab');
        if (fab) { fab.textContent = '+'; fab.style.background = '#23402a'; fab.style.border = '2px solid #2d5a3a'; }
        return;
    }

    // Dismiss existing pill if present
    if (_pendingPin) {
        const pill = document.getElementById('pin-name-pill');
        if (pill) { pill.style.display = 'none'; pill.hidden = true; }
        _pendingPin = null;
        clearTempPin();
    }
}

// ── Drawer content: spots + river results ──────────────────────────────────────
function renderDrawerContent() {
    // Populate saved spots row
    const spotsRow = document.getElementById('drawer-spots');
    if (spotsRow && typeof renderDrawerSpots === 'function') renderDrawerSpots(spotsRow);
    // Populate river results
    renderDrawerResults();
}

export function onDrawerFilter() {
    renderDrawerResults();
}
window.onDrawerFilter = onDrawerFilter;

function renderDrawerResults() {
    const results = document.getElementById('drawer-results');
    const filterEl = document.getElementById('drawer-search');
    if (!results) return;
    const pool = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.discovery_pool;
    const wbs = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.waterbodies;
    if (!pool || !pool.length) { results.innerHTML = ''; return; }
    const filter = filterEl ? filterEl.value.trim().toLowerCase() : '';
    // Build site_id → waterbody name lookup
    const siteToWb = {};
    if (wbs) {
        for (let i = 0; i < wbs.length; i++) {
            const wb = wbs[i];
            if (wb.gauge && wb.gauge.site_id) siteToWb[wb.gauge.site_id] = wb.name;
            if (wb.related_gauges) {
                for (let j = 0; j < wb.related_gauges.length; j++)
                    siteToWb[wb.related_gauges[j].site_id] = wb.name;
            }
        }
    }
    // Group pool by waterbody name
    const groups = {};
    for (let k = 0; k < pool.length; k++) {
        const s = pool[k];
        if (!s || !s.site_id || !s.coords) continue;
        const wbName = siteToWb[s.site_id] || s.name.replace(/ at .*$/, '').replace(/ near .*$/, '');
        if (!groups[wbName]) groups[wbName] = [];
        groups[wbName].push(s);
    }
    let names = Object.keys(groups);
    // Filter
    if (filter) {
        names = names.filter(function (n) {
            if (n.toLowerCase().indexOf(filter) >= 0) return true;
            for (let fi = 0; fi < groups[n].length; fi++) {
                if (groups[n][fi].name.toLowerCase().indexOf(filter) >= 0 ||
                    groups[n][fi].site_id.indexOf(filter) >= 0) return true;
            }
            return false;
        });
    }
    names.sort(function (a, b) { return a.localeCompare(b); });
    if (!names.length) { results.innerHTML = ''; return; }
    let html = '';
    for (let gi = 0; gi < names.length; gi++) {
        const name = names[gi];
        const items = groups[name];
        const fullName = items[0].name;

        // Clean Subtitle Split: Extract "near ___" or "at ___" for the subtitle
        let subTitle = fullName;
        const match = fullName.match(/(?:near|at)\s+.*/i);
        if (match) {
            subTitle = match[0];
        }

        html += '<div class="result-row" onclick="mapResultSelect(\'' +
            escapeJsString(items[0].site_id) + '\', ' +
            Number(items[0].coords.lat) + ', ' +
            Number(items[0].coords.lon) + ', \'' +
            escapeJsString(name) + '\')">' +
            '<div class="result-row-name">' + escapeHtml(name) + '</div>' +
            '<div class="result-row-sub">' + escapeHtml(subTitle) + '</div></div>';
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
    const handleStation = document.getElementById('map-handle-station');
    if (handleStation) handleStation.textContent = name;
}
window.mapResultSelect = mapResultSelect;

// ── FAB toggle: + / X state ─────────────────────────────────────────────────────
var _fabPinning = false;

export function toggleFabSpotDrop() {
    _fabPinning = !_fabPinning;
    const fab = document.getElementById('map-fab');
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
                const activeName = document.getElementById('active-station-name');
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