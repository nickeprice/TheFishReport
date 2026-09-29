/**
 * src/features/map/spots-map.js - the PRIVATE saved-spot LAYER on the station map
 * (WS-5, issue #3b).
 *
 * public: savedSpotIcon(), savedSpotPopupHtml(spot)
 *
 * Split from src/features/map/spots.js on purpose: spots.js owns the account half
 * (state + server CRUD + the modal list) and this file owns the Leaflet half, so the
 * list logic can be tested without a map and the map code stays one concern. Both are
 * loaded before src/app.js; this one only runs once loadLeaflet() resolved true.
 *
 * Classic script (global scope). Loaded AFTER src/features/map/spots.js.
 */
// A star pin, visually distinct from the gauge dot the map already plots.
function savedSpotIcon() {
    return window.L.divIcon({
        className: 'spot-pin',
        html: '<span class="spot-pin-dot">\u2605</span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
}

// Popup for a saved spot: open it (the same selectPreset path as a gauge pin) or delete
// it. User/data text is escaped exactly like stationPopupHtml() does.
function savedSpotPopupHtml(spot) {
    var safeId = escapeJsString(String(spot.id || ''));
    return '<b>' + escapeHtml(spot.label || 'Saved spot') + '</b><br>' +
        escapeHtml(spot.river_name || 'No river saved') +
        (spot.station_id ? '<br>' + escapeHtml('USGS ' + spot.station_id) : '') + '<br>' +
        '<a href="#" onclick="selectSavedSpot(\'' + safeId + '\');return false;">Fish this spot</a> \u00b7 ' +
        '<a href="#" onclick="deleteSavedSpot(\'' + safeId + '\');return false;">Delete</a>';
}
