/**
 * src/features/map/spots.js - PRIVATE favourite fishing spots (WS-5, issue #3b).
 *
 * public: SPOTS_CACHE_KEY, SPOT_LABEL_MAX, spotsState, spotsStatus, loadFavoriteSpots(),
 *         renderFavoriteSpots(), saveCurrentSpot(), saveSpotAt(lat, lon, label),
 *         resolveSpotStation(lat, lon), spotGaugeText(spot), deleteSavedSpot(id),
 *         selectSavedSpot(id)
 *
 * The Leaflet half (the star pin + its popup) lives in src/features/map/spots-map.js.
 *
 * A saved spot is a lat/lon the angler picked on the map - the angler's own water, not a
 * gauge. It is PRIVATE by construction — `public.favorite_spots` is RLS-scoped to
 * `user_id = auth.uid()` (supabase/migrations/20260929190000_favorite_spots.sql), there is no
 * view and no RPC over it, and nothing here sends a spot to the public board or to telemetry.
 *
 * WHAT DATA A POINT CAN HAVE: the report is queried WITH the spot's own lat/lon (so the
 * weather is for that exact point) and WITH the nearest USGS gauge's id (so the flow, species
 * runs, legal windows and tides come from a real measurement). A spot with no gauge nearby
 * cannot show flow at all - it never silently falls back to the app's default river.
 *
 * Tapping a spot goes through the SAME `selectPreset()` path as a preset or a map pin, so
 * "the conditions at MY spot tomorrow" is answered by the existing per-day report. Offline
 * the list falls back to a local mirror and says so; saving needs a live session.
 *
 * Classic script (global scope). Loaded BEFORE src/features/map/map.js + src/app.js.
 */
import { AuthState } from '../auth/auth.js';
import { Supa } from '../../services/supabase.js';
import { apiGetJson } from '../../shared/api.js';
import { showToast } from '../../shared/ui.js';
import { newUuid } from '../../shared/format.js';
import { getStr } from '../gear-sim/inputs.js';
import { logDebug } from '../../shared/debug.js';
import { mapCenter } from './map.js';
import { setFieldValue } from '../../shared/forms.js';
import { selectPreset } from '../station/picker.js';
export var SPOTS_CACHE_KEY = 'favorite_spots_cache';
window.SPOTS_CACHE_KEY = SPOTS_CACHE_KEY;
export var SPOT_LABEL_MAX = 60;
window.SPOT_LABEL_MAX = SPOT_LABEL_MAX;

export var spotsState = { rows: [], loaded: false, offline: false, gauge: {} };



// The active station RECORD (id + name + coords) — the anchor a spot is saved against,
// because /api/water_report needs a USGS site id to answer for a spot.
export function activeStationRecord() {
    try {
        const st = JSON.parse(localStorage.getItem('active_station') || 'null');
        if (st && st.id) return st;
    } catch (e) {}
    return null;
}

export function readSpotCache() {
    try {
        const raw = localStorage.getItem(SPOTS_CACHE_KEY);
        const rows = raw ? JSON.parse(raw) : [];
        return Object.prototype.toString.call(rows) === '[object Array]' ? rows : [];
    } catch (e) {
        return [];
    }
}

export function writeSpotCache(rows) {
    try { localStorage.setItem(SPOTS_CACHE_KEY, JSON.stringify(rows || [])); } catch (e) {}
}

export function spotsStatus(text) {
window.spotsStatus = spotsStatus;
    const el = document.getElementById('spot-status');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
}

// Load MY spots: local mirror first (so a spot stays usable offline), then the server
// when a session exists. `offline` = the server was unreachable, so keep the cache.
export async function loadFavoriteSpots() {
window.loadFavoriteSpots = loadFavoriteSpots;
    if (!spotsState.loaded) spotsState.rows = readSpotCache();
    if (typeof Supa !== 'undefined') {
        let rows = null;
        try { rows = await Supa.fetchFavoriteSpots(); } catch (e) { rows = null; }
        if (rows) {
            spotsState.rows = rows;
            spotsState.offline = false;
            writeSpotCache(rows);
        } else {
            spotsState.offline = true;      // keep what we already have
        }
    }
    spotsState.loaded = true;
    renderFavoriteSpots();
    return spotsState.rows;
}

// ── Spot chips (Phase Y3) ───────────────────────────────────────────────────────
// Each spot is a pill chip. The last chip is "+" to add a new spot from the map.
export function spotChipEl(spot) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'spot-chip';
    chip.textContent = spot.label || 'Spot';
    chip.title = spotGaugeText(spot);
    chip.onclick = (function (id) { return function () { selectSavedSpot(id); }; })(spot.id);
    return chip;
}

export function renderFavoriteSpots() {
    var chips = document.getElementById('spot-chips');
    if (!chips) return;
    chips.innerHTML = '';
    spotsState.rows.forEach(function (s) { chips.appendChild(spotChipEl(s)); });
    // "+" chip to add a new spot from the map
    var addChip = document.createElement('button');
    addChip.type = 'button';
    addChip.className = 'spot-chip spot-chip-add';
    addChip.textContent = '+';
    addChip.title = 'Add a new spot from the map';
    addChip.onclick = function () { if (typeof openMapModal === 'function') openMapModal(); };
    chips.appendChild(addChip);
}

// ==================================================================================
// RESOLVING A GAUGE FOR A RAW COORDINATE
//
// A saved spot is a lat/lon the angler picked on the map - it is NOT a gauge. But the
// conditions that matter (flow, species runs, legal windows, tides) only exist AT a USGS
// gauge, and /api/water_report falls back to the app's default site when `site` is
// omitted - so sending a spot with no gauge would silently show the WRONG river's
// numbers. That is why a spot's gauge is resolved explicitly, stored on the row, and
// named in the UI.
//
// What the spot DOES own is the weather: the report takes lat/lon and Open-Meteo is
// queried at those coordinates, so the forecast is for the exact point that was saved.
// ==================================================================================

// The closest USABLE entry from a nearby-stations payload. Pure (the fetch lives in
// resolveSpotStation), so the picking rule can be tested on its own: an entry without
// coordinates is skipped rather than accepted - a gauge we cannot place on the map is not
// a gauge we can claim the flow of.
//
// `preferId` is the gauge the angler already has selected. Nearest is not the same as
// relevant: a live probe at 47.09,-122.15 put South Prairie Creek (33 CFS) 4.4 mi away and
// the Puyallup at Orting (483 CFS) the same distance out, so "nearest" can hand a spot the
// flow of a creek beside the river being fished. If the selected gauge is in range it wins;
// otherwise the closest one does.
export function pickNearestStation(list, preferId) {
    if (!list || !list.length) return null;
    const prefer = (preferId != null) ? String(preferId) : null;
    let nearest = null;
    for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s || !s.id || s.lat == null || s.lon == null) continue;
        const cand = {
            id: String(s.id),
            name: s.name ? String(s.name) : String(s.id),
            distance: (s.distance_mi != null && isFinite(Number(s.distance_mi))) ? Number(s.distance_mi) : null
        };
        if (prefer && cand.id === prefer) return cand;
        if (!nearest) nearest = cand;
    }
    return nearest;
}

// { ok: true, station: {id,name,distance}|null } | { ok: false, status, error, serverMessage }
// ok:false means "we could not ask" (offline / server error / USGS unreachable) - NOT "there is
// no gauge". The two need different words: only the second one is a fact about the place.
export async function resolveSpotStation(lat, lon, preferId) {
    if (typeof fetch !== 'function' || lat == null || lon == null) {
        return { ok: false, status: 0, error: 'no position', serverMessage: null };
    }
    const res = await apiGetJson('/api/nearby_stations?lat=' + lat + '&lon=' + lon,
                               { label: 'nearby_stations' });
    if (!res.ok) {
        return { ok: false, status: res.status, error: res.error, serverMessage: res.serverMessage };
    }
    // HTTP 200 carrying the server's degradation note = BOTH USGS upstreams were unreachable.
    // That is "could not ask", never the fact "no gauge exists here" (the API is explicit about
    // this, so an empty list must not be read as the answer).
    const note = (res.data && res.data.note) ? String(res.data.note) : '';
    if (/could not be reached/i.test(note)) {
        return { ok: false, status: res.status, error: note, serverMessage: null };
    }
    const list = (res.data && res.data.stations) ? res.data.stations : [];
    return { ok: true, station: pickNearestStation(list, preferId) };
}

// The gauge NAME for a spot row (and the distance when this session resolved it).
export function spotGaugeText(spot) {
    if (!spot) return '';
    const known = spotsState.gauge[spot.id];
    const name = (known && known.name) ? known.name : (spot.river_name || null);
    if (!name) return 'flow from the nearest gauge';
    const dist = (known && known.distance != null) ? ' \u00b7 ' + known.distance + ' mi away' : '';
    return 'flow: ' + name + dist;
}

// Save a spot at a LAT/LON the angler chose on the map. The nearest gauge is resolved
// first and stored on the row so the row (and the report) say where the flow comes from.
export async function saveSpotAt(lat, lon, label) {
    if (lat == null || lon == null || isNaN(Number(lat)) || isNaN(Number(lon))) {
        showToast('No position for that spot.', 'warn', 4000);
        return null;
    }
    const id = newUuid();
    const want = activeStationRecord();
    const resolved = await resolveSpotStation(Number(lat), Number(lon), want ? want.id : null);
    const station = (resolved && resolved.ok && resolved.station) ? resolved.station : null;
    if (station) spotsState.gauge[id] = { name: station.name, distance: station.distance };
    let res = null;
    try {
        res = await Supa.saveFavoriteSpot({
            clientId: id,
            label: label,
            stationId: station ? station.id : null,
            riverName: station ? station.name : null,
            latitude: Number(lat),
            longitude: Number(lon)
        });
    } catch (e) { res = null; }
    if (res && res.ok) {
        // The LABEL only: coordinates never reach the debug log (AGENTS.md GPS hygiene).
        logDebug('Favourite spot saved: ' + label + (station ? ' (flow via ' + station.id + ')' : ' (no gauge resolved)'), 'SPOT');
        if (resolved && !resolved.ok) {
            // Saved, but the flow is NOT linked (the lookup was unreachable). Say so instead
            // of letting the row read "flow from the nearest gauge" with no explanation.
            showToast('Spot saved \u2014 the gauge lookup failed, so flow is not linked yet. Open the spot later to retry.', 'warn', 6000);
        }
        return id;
    }
    showToast('Could not save the spot: ' + ((res && res.error) || 'unknown error'), 'error', 5000);
    return null;
}

// Save the CURRENT position (the GPS fix when we have one, else the active station's
// gauge) - the "I am standing here" path. Private: label + coords go to the owner's rows.
export async function saveCurrentSpot() {
    const label = (getStr('spot-label') || '').trim().slice(0, SPOT_LABEL_MAX);
    if (!label) { showToast('Name this spot first.', 'warn', 4000); return; }
    const loc = (typeof mapCenter === 'function') ? mapCenter() : null;
    if (!loc || loc[0] == null || loc[1] == null) {
        showToast('No position yet \u2014 pick a river first.', 'warn', 4000);
        return;
    }
    const saved = await saveSpotAt(loc[0], loc[1], label);
    if (saved) {
        setFieldValue('spot-label', '');
        showToast('Spot saved (private)', 'success', 2500);
        await loadFavoriteSpots();
    }
}

// Open a saved spot: resolve its gauge if it has none yet (a point picked on the map is not
// a gauge), then go through the SAME selectPreset() path a preset / map pin uses. The SPOT's
// coordinates ride along, so the report's weather is for the saved point while the flow comes
// from the resolved gauge - and the row names that gauge, so the provenance is visible.
export async function selectSavedSpot(id) {
    let spot = null;
    for (let i = 0; i < spotsState.rows.length; i++) {
        if (spotsState.rows[i].id === id) { spot = spotsState.rows[i]; break; }
    }
    if (!spot) return;

    let gaugeId = spot.station_id || null;
    if (!gaugeId) {
        spotsStatus('Finding the nearest gauge for that spot\u2026');
        const want = activeStationRecord();
        const resolved = await resolveSpotStation(Number(spot.latitude), Number(spot.longitude), want ? want.id : null);
        if (resolved && resolved.ok && resolved.station) {
            gaugeId = resolved.station.id;
            spotsState.gauge[spot.id] = { name: resolved.station.name, distance: resolved.station.distance };
            spot.station_id = gaugeId;
            spot.river_name = resolved.station.name;
            // Persist it once so the row never has to resolve again (same id = an edit).
            try {
                await Supa.saveFavoriteSpot({
                    clientId: spot.id, label: spot.label, stationId: gaugeId, riverName: resolved.station.name,
                    latitude: Number(spot.latitude), longitude: Number(spot.longitude)
                });
            } catch (e) {}
            renderFavoriteSpots();
        } else if (resolved && !resolved.ok) {
            const why = resolved.serverMessage || resolved.error || '';
            spotsStatus('Could not reach the gauge lookup' + (why ? ' (' + why + ')' : '') +
                ' \u2014 try again when you have signal.');
            return;
        } else {
            showToast('No USGS gauge near that spot yet \u2014 flow needs a nearby gauge.', 'warn', 6000);
            spotsStatus('No USGS gauge near that spot, so there is no flow to show.');
            return;
        }
    }
    spotsStatus('');
    logDebug('Saved spot selected: ' + (spot.label || '') + ' (gauge ' + gaugeId + ')', 'SPOT');
    selectPreset(gaugeId, Number(spot.latitude), Number(spot.longitude), spot.label || 'Saved spot', false);
}

export async function deleteSavedSpot(id) {
    if (!window.confirm('Delete this saved spot? Your other spots are untouched.')) return;
    let res = null;
    try { res = await Supa.deleteFavoriteSpot(id); } catch (e) { res = null; }
    if (res && res.ok) {
        showToast('Spot deleted', 'success', 2500);
        await loadFavoriteSpots();
    } else {
        showToast('Could not delete: ' + ((res && res.error) || 'unknown error'), 'error', 5000);
    }
}
window.saveCurrentSpot = saveCurrentSpot;
