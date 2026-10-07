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
    var location = escapeHtml(spot.river_name || '');
    if (!location && spot.latitude && spot.longitude) {
        location = Number(spot.latitude).toFixed(4) + '\u00b0N, ' + Number(spot.longitude).toFixed(4) + '\u00b0W';
    }
    return '<span class="pin-popup-title">' + escapeHtml(spot.label || 'Saved spot') + '</span>' +
        '<span class="pin-popup-meta">' + (location || 'Flow from nearest gauge on tap') + '</span>' +
        '<button class="pin-popup-btn" onclick="selectSavedSpot(\'' + safeId + '\');return false;">\u00b7\u00b7\u00b7 Fish this spot</button>' +
        '<button class="pin-popup-delete" onclick="deleteSavedSpot(\'' + safeId + '\');return false;">Delete</button>';
}
