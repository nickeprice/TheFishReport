/**
 * src/features/map/spots-map.js - the PRIVATE saved-spot popup HTML.
 *
 * public: savedSpotPopupHtml(spot)
 *
 * Star pins are now created in map.js (MapLibre) — this file only keeps the
 * popup HTML helper since it is pure string logic testable without a map.
 *
 * ES module.
 */
import { escapeHtml, escapeJsString } from '../../shared/format.js';

// Popup for a saved spot: open it (the same selectPreset path as a gauge pin) or delete
// it. User/data text is escaped exactly like stationPopupHtml() does.
export function savedSpotPopupHtml(spot) {
    const safeId = escapeJsString(String(spot.id || ''));
    return '<b>' + escapeHtml(spot.label || 'Saved spot') + '</b><br>' +
        escapeHtml(spot.river_name || 'No river saved') +
        (spot.station_id ? '<br>' + escapeHtml('USGS ' + spot.station_id) : '') + '<br>' +
        '<a href="#" onclick="selectSavedSpot(\'' + safeId + '\');return false;">Fish this spot</a> \u00b7 ' +
        '<a href="#" onclick="deleteSavedSpot(\'' + safeId + '\');return false;">Delete</a>';
}
