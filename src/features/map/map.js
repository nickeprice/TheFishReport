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
 * ES module.
 */
import { logDebug } from '../../shared/debug.js';
import { apiGetJson } from '../../shared/api.js';
import { State } from '../../shared/state.js';
import { escapeHtml, escapeJsString } from '../../shared/format.js';
import { showToast } from '../../shared/ui.js';
import { getStr } from '../gear-sim/inputs.js';
import { setFieldValue } from '../../shared/forms.js';
import { spotsState, SPOTS_CACHE_KEY, SPOT_LABEL_MAX, spotsSignedIn, spotsStatus, loadFavoriteSpots, saveSpotAt, selectSavedSpot } from './spots.js';
import { savedSpotIcon, savedSpotPopupHtml } from './spots-map.js';
import { selectPreset } from '../station/picker.js';
import L from 'leaflet';

const LEAFLET_TILES_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const MAP_DEFAULT_CENTER = [47.195, -122.302];
const MAP_START_ZOOM = 10;

let _stationMap = null;
let _stationMarkers = null;

// Leaflet is imported statically at build time. The legacy dynamic CDN loader
// (fetching unpkg.com/leaflet@1.9.4) is deleted — Vite resolves the npm package.
export function loadLeaflet() {
    return Promise.resolve(true);
}
window.loadLeaflet = loadLeaflet;
window.L = L;

export function mapPinHasReading(station) {
    if (!station) return false;
    const hasCfs = station.cfs !== undefined && station.cfs !== null;
    const hasGage = station.gage !== undefined && station.gage !== null;
    return hasCfs || hasGage;
}

export function mapPinColor(station) {
    return mapPinHasReading(station) ? '#22c55e' : '#94a3b8';
}

export function mapPinIcon(station) {
    return L.divIcon({
        className: 'station-pin',
        html: '<span class="station-pin-dot" style="background:' + mapPinColor(station) + '"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
}

// The nearby-stations payload carries the legal RULE but not that day's clock times,
// so describe the rule instead of printing empty times.
export function mapLegalText(rule) {
    if (rule === '24hr') return 'Open all day';
    if (rule === 'daylight') return 'Daylight window (1h either side of sunrise/sunset)';
    return 'Hours not verified \u2014 check the regulations';
}

export function stationPopupHtml(s) {
    const cfs = (s.cfs === undefined || s.cfs === null) ? '--' : s.cfs;
    const gage = (s.gage === undefined || s.gage === null) ? '--' : s.gage;
    return '<b>' + escapeHtml(s.name || s.id) + '</b><br>' +
        escapeHtml(cfs + ' CFS \u00b7 ' + gage + ' ft') + '<br>' +
        escapeHtml(mapLegalText(s.legal_hours)) + '<br>' +
        '<a href="#" onclick="selectPreset(\'' + escapeJsString(s.id) + '\',' +
        Number(s.lat) + ',' + Number(s.lon) + ',\'' + escapeJsString(s.name || s.id) +
        '\');return false;">Fish this gauge</a>';
}

window.mapCenter = mapCenter;
export function mapCenter() {
    if (State.userGPSCoords && State.userGPSCoords.lat != null && State.userGPSCoords.lon != null) {
        return [State.userGPSCoords.lat, State.userGPSCoords.lon];
    }
    try {
        const stored = JSON.parse(localStorage.getItem('active_station') || 'null');
        if (stored && stored.lat != null && stored.lon != null) return [stored.lat, stored.lon];
    } catch (e) {}
    return MAP_DEFAULT_CENTER;
}

// The angler's OWN saved spots, as a star layer. Plotted from LOCAL state only, on every
// refresh - including when the gauge feed failed, which is the point: a spot you already
// saved must not vanish (or fail to appear) because the lookup was unreachable. Private
// data: these coordinates are never sent anywhere by this plot.
export function plotSavedSpotStars() {
    if (typeof spotsState === 'undefined' || !spotsState.rows.length) return 0;
    if (typeof savedSpotIcon !== 'function') return 0;
    let plotted = 0;
    spotsState.rows.forEach(function (sp) {
        if (sp.latitude == null || sp.longitude == null) return;
        L.marker([Number(sp.latitude), Number(sp.longitude)], { icon: savedSpotIcon(), title: sp.label })
            .bindPopup(savedSpotPopupHtml(sp))
            .addTo(_stationMarkers);
        plotted++;
    });
    return plotted;
}

// { count, note, error, status, spots } - always an object, so callers can read the fields
// without guarding. `error` set = we could not reach the lookup; `count` is then 0 and the
// star layer is still painted.
export async function refreshStationMap(center) {
    if (!_stationMap || !_stationMarkers || typeof apiGetJson !== 'function') {
        return { count: 0, note: '', error: null, status: 0, spots: 0 };
    }
    const out = { count: 0, note: '', error: null, status: 0, spots: 0 };
    const res = await apiGetJson('/api/nearby_stations?lat=' + center[0] + '&lon=' + center[1],
                              { label: 'nearby_stations' });
    if (res.ok) {
        const stations = (res.data && res.data.stations) ? res.data.stations : [];
        _stationMarkers.clearLayers();
        L.circleMarker(center, { radius: 6, color: '#38bdf8', weight: 2, fillOpacity: 0.35 })
            .addTo(_stationMarkers);
        stations.forEach(function (s) {
            if (s.lat == null || s.lon == null) return;
            L.marker([s.lat, s.lon], { icon: mapPinIcon(s), title: s.name })
                .bindPopup(stationPopupHtml(s))
                .addTo(_stationMarkers);
        });
        out.count = stations.length;
        out.note = (res.data && res.data.note) || '';
        logDebug('Station map: ' + stations.length + ' gauge(s) plotted', 'MAP');
    } else {
        // Do NOT clear the layer: stale gauge pins beat an empty map, and the star layer
        // below is re-plotted regardless.
        out.error = res.error;
        out.status = res.status;
        out.note = res.serverMessage || '';
    }
    out.spots = plotSavedSpotStars();
    return out;
}

// --- SPOT PICKER (2026-09-29, direct user ask) ----------------------------------------
// Drop a point ANYWHERE on the map and save it as a private fishing spot by its lat/lon.
// The point is not a gauge, so spots.js resolves the nearest gauge for the FLOW while the
// point keeps its OWN coordinates for the weather (see the resolver note in spots.js).

export function startSpotPick() {
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
export async function openSpotPickMap() {
    if (!_stationMap || !L) {
        spotsStatus('Loading the map\u2026');
        try { await showStationMap(); } catch (e) {}
    }
    if (!_stationMap || !L) {
        spotsStatus('Map unavailable (offline or CDN blocked) \u2014 use the presets or GPS instead.');
        return;
    }
    spotsStatus('Now tap the map where your spot is.');
    if (_stationMap.getContainer) _stationMap.getContainer().style.cursor = 'crosshair';
    _stationMap.once('click', onSpotPick);
    // The name can come first or on the tap (the pick asks for it if it is still empty), so
    // nudge the field rather than blocking the pick.
    const label = (typeof getStr === 'function') ? (getStr('spot-label') || '').trim() : '';
    if (!label) {
        const input = document.getElementById('spot-label');
        if (input && input.focus) input.focus();
    }
}

export async function onSpotPick(e) {
    if (_stationMap && _stationMap.getContainer) _stationMap.getContainer().style.cursor = '';
    if (!e || !e.latlng) return;
    if (!spotsSignedIn()) { spotsStatus('Start a session on the Catch Log tab first.'); return; }
    // Name it now if it was not named first: the tap is the moment the angler knows where it is.
    let label = (typeof getStr === 'function') ? (getStr('spot-label') || '').trim().slice(0, SPOT_LABEL_MAX) : '';
    if (!label) {
        const typed = window.prompt('Name this spot', 'My spot');
        if (typed == null) { spotsStatus('Cancelled \u2014 tap the map again when you are ready.'); return; }
        label = String(typed).trim().slice(0, SPOT_LABEL_MAX);
        if (!label) { spotsStatus('A spot needs a name \u2014 tap the map again.'); return; }
        setFieldValue('spot-label', label);
    }
    spotsStatus('Saving\u2026');
    const id = await saveSpotAt(e.latlng.lat, e.latlng.lng, label);
    if (!id) { spotsStatus('Could not save that spot.'); return; }
    setFieldValue('spot-label', '');
    if (typeof showToast === 'function') showToast('Spot saved (private)', 'success', 2500);
    await loadFavoriteSpots();
    try { await refreshStationMap(mapCenter()); } catch (err) {}   // re-plot so the star appears
    spotsStatus('Saved. Tap its star to load the conditions there.');
}

export async function showStationMap() {
    const box = document.getElementById('station-map');
    const note = document.getElementById('station-map-note');
    if (!box) return;
    box.hidden = false;
    if (note) { note.hidden = false; note.textContent = 'Loading map\u2026'; }

    const available = await loadLeaflet();
    if (!available) {
        box.hidden = true;
        if (note) note.textContent = 'Map unavailable (offline or CDN blocked) \u2014 use the presets, search or GPS above.';
        return;
    }

    const center = mapCenter();
    // WS-5: refresh the private spot list first, so the star layer below is current.
    if (typeof loadFavoriteSpots === 'function') { try { await loadFavoriteSpots(); } catch (e) {} }
    if (!_stationMap) {
        _stationMap = L.map(box).setView(center, MAP_START_ZOOM);
        L.tileLayer(LEAFLET_TILES_URL, { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(_stationMap);
        _stationMarkers = L.layerGroup().addTo(_stationMap);
    } else {
        _stationMap.setView(center, _stationMap.getZoom());
    }
    // Leaflet measures its container on creation; inside a modal that was hidden it
    // needs a nudge once visible, or the tiles render as a grey block.
    setTimeout(function () { if (_stationMap) _stationMap.invalidateSize(); }, 200);

    try {
        const out = await refreshStationMap(center);
        if (note) {
            const spotsN = (typeof spotsState !== 'undefined' && spotsState.rows.length)
                ? ' \u00b7 ' + spotsState.rows.length + ' saved spot(s) (star).' : '';
            if (out.error) {
                // Name the CAUSE (status / timeout / network) instead of blaming the data:
                // it is the only way to tell a tunnel hiccup from a code bug on a phone.
                note.textContent = 'Could not load nearby gauges (' + out.error + ')' +
                    ' \u2014 use the presets, search or GPS above.' + (out.spots ? ' Your saved spots (star) are still shown.' : '');
            }
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
window.startSpotPick = startSpotPick;
