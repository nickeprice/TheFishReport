/**
 * src/features/map/spots.js - PRIVATE favourite fishing spots (WS-5, issue #3b).
 *
 * public: SPOTS_CACHE_KEY, SPOT_LABEL_MAX, spotsState, loadFavoriteSpots(),
 *         renderFavoriteSpots(), saveCurrentSpot(), deleteSavedSpot(id),
 *         selectSavedSpot(id)
 *
 * The Leaflet half (the star pin + its popup) lives in src/features/map/spots-map.js.
 *
 * A saved spot is the angler's own water: a label, its gauge, and the coordinates. It is
 * PRIVATE by construction — `public.favorite_spots` is RLS-scoped to `user_id =
 * auth.uid()` (supabase/migrations/20260929190000_favorite_spots.sql), there is no view
 * and no RPC over it, and nothing here sends a spot to the public board or to telemetry.
 *
 * Tapping a spot goes through the SAME `selectPreset()` path as a preset or a map pin, so
 * "the conditions at MY spot tomorrow" is answered by the existing per-day report. Offline
 * the list falls back to a local mirror and says so; saving needs a live session.
 *
 * Classic script (global scope). Loaded BEFORE src/features/map/map.js + src/app.js.
 */
var SPOTS_CACHE_KEY = 'favorite_spots_cache';
var SPOT_LABEL_MAX = 60;

var spotsState = { rows: [], loaded: false, offline: false };

function spotsSignedIn() {
    return (typeof AuthState !== 'undefined') && !!(AuthState && AuthState.signedIn);
}

// The active station RECORD (id + name + coords) — the anchor a spot is saved against,
// because /api/water_report needs a USGS site id to answer for a spot.
function activeStationRecord() {
    try {
        var st = JSON.parse(localStorage.getItem('active_station') || 'null');
        if (st && st.id) return st;
    } catch (e) {}
    return null;
}

function readSpotCache() {
    try {
        var raw = localStorage.getItem(SPOTS_CACHE_KEY);
        var rows = raw ? JSON.parse(raw) : [];
        return Object.prototype.toString.call(rows) === '[object Array]' ? rows : [];
    } catch (e) {
        return [];
    }
}

function writeSpotCache(rows) {
    try { localStorage.setItem(SPOTS_CACHE_KEY, JSON.stringify(rows || [])); } catch (e) {}
}

function spotsStatus(text) {
    var el = document.getElementById('spot-status');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
}

// Load MY spots: local mirror first (so a spot stays usable offline), then the server
// when a session exists. `offline` = the server was unreachable, so keep the cache.
async function loadFavoriteSpots() {
    if (!spotsState.loaded) spotsState.rows = readSpotCache();
    if (spotsSignedIn() && typeof Supa !== 'undefined') {
        var rows = null;
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

// One row: the label block opens the spot, the small button deletes it.
function spotRowEl(spot) {
    var row = document.createElement('div');
    row.className = 'spot-row';

    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'spot-open';
    open.textContent = spot.label || 'Saved spot';
    var meta = document.createElement('span');
    meta.className = 'spot-meta';
    meta.textContent = (spot.river_name || 'No river saved') +
        (spot.station_id ? ' \u00b7 USGS ' + spot.station_id : '');
    open.appendChild(meta);
    open.onclick = (function (id) { return function () { selectSavedSpot(id); }; })(spot.id);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'mini-btn mini-btn-danger';
    del.textContent = 'Delete';
    del.onclick = (function (id) { return function () { deleteSavedSpot(id); }; })(spot.id);

    row.appendChild(open);
    row.appendChild(del);
    return row;
}

// Paint the list + its one-line status. Text only (textContent), never innerHTML for the
// label, which is user text.
function renderFavoriteSpots() {
    var box = document.getElementById('favorite-spots');
    var saveRow = document.getElementById('spot-save-row');
    if (saveRow) saveRow.hidden = !spotsSignedIn();
    if (!box) return;
    box.innerHTML = '';
    if (!spotsSignedIn()) {
        spotsStatus('Start a session on the Catch Log tab to save spots here. They stay private to you.');
        return;
    }
    spotsStatus(spotsState.offline
        ? 'Showing the spots saved on this device \u2014 the server could not be reached.'
        : '');
    if (!spotsState.rows.length) {
        var empty = document.createElement('div');
        empty.className = 'spot-empty';
        empty.textContent = 'No saved spots yet. Pick your river, then name it and tap "Save this spot".';
        box.appendChild(empty);
        return;
    }
    spotsState.rows.forEach(function (s) { box.appendChild(spotRowEl(s)); });
}

// Save the CURRENT position (the GPS fix when we have one, else the active station's
// gauge) against the active gauge. Private: label + coords go to the owner's own rows.
async function saveCurrentSpot() {
    if (!spotsSignedIn()) {
        showToast('Start a session on the Catch Log tab first \u2014 spots save to your private account.', 'warn', 6000);
        return;
    }
    var label = (getStr('spot-label') || '').trim().slice(0, SPOT_LABEL_MAX);
    if (!label) { showToast('Name this spot first.', 'warn', 4000); return; }
    var station = activeStationRecord();
    var loc = (typeof mapCenter === 'function') ? mapCenter() : null;
    if (!loc || loc[0] == null || loc[1] == null) {
        showToast('No position yet \u2014 pick a river first.', 'warn', 4000);
        return;
    }
    var res = null;
    try {
        res = await Supa.saveFavoriteSpot({
            clientId: newUuid(),
            label: label,
            stationId: station ? station.id : null,
            riverName: station ? station.name : null,
            latitude: loc[0],
            longitude: loc[1]
        });
    } catch (e) { res = null; }
    if (res && res.ok) {
        setFieldValue('spot-label', '');
        // The LABEL only: coordinates never reach the debug log (AGENTS.md GPS hygiene).
        logDebug('Favourite spot saved: ' + label, 'SPOT');
        showToast('Spot saved (private)', 'success', 2500);
        await loadFavoriteSpots();
    } else {
        showToast('Could not save the spot: ' + ((res && res.error) || 'unknown error'), 'error', 5000);
    }
}

// Open a saved spot: the SAME path as a preset / map pin, so the per-day report does the
// rest — that is exactly what makes "conditions at MY spot tomorrow" work.
function selectSavedSpot(id) {
    var spot = null;
    for (var i = 0; i < spotsState.rows.length; i++) {
        if (spotsState.rows[i].id === id) { spot = spotsState.rows[i]; break; }
    }
    if (!spot) return;
    if (!spot.station_id) {
        showToast('That spot has no gauge saved \u2014 pick it from the map instead.', 'warn', 5000);
        return;
    }
    logDebug('Saved spot selected: ' + (spot.label || ''), 'SPOT');
    selectPreset(spot.station_id, Number(spot.latitude), Number(spot.longitude), spot.label || 'Saved spot', false);
}

async function deleteSavedSpot(id) {
    if (!window.confirm('Delete this saved spot? Your other spots are untouched.')) return;
    var res = null;
    try { res = await Supa.deleteFavoriteSpot(id); } catch (e) { res = null; }
    if (res && res.ok) {
        showToast('Spot deleted', 'success', 2500);
        await loadFavoriteSpots();
    } else {
        showToast('Could not delete: ' + ((res && res.error) || 'unknown error'), 'error', 5000);
    }
}
