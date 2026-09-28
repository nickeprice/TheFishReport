/**
 * src/features/station/search.js - USGS site search (gauge id or river name).
 *
 * public: searchStation()
 *
 * Source: the modernized WDFN OGC API (waterservices/nwis is decommissioned in
 * Q1 2027). The state filter comes from the region registry (state_name), NOT a
 * hardcoded `stateCd=wa`, so adding a state does not touch this file.
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
var WDFN_LOCATIONS = 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/monitoring-locations/items';
var WDFN_LATEST = 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items';

function searchRegionStateName() {
    var r = (typeof window !== 'undefined' && window.REGIONS) ? window.REGIONS.WA : null;
    return (r && r.state_name) || 'Washington';
}

// WDFN returns GeoJSON: coordinates are [lon, lat] and the id carries a USGS- prefix.
function wdfnLocationsToStations(feats) {
    var out = [];
    (feats || []).forEach(function (f) {
        var p = f.properties || {};
        var coords = (f.geometry && f.geometry.coordinates) || [];
        if (!p.id || coords.length < 2) return;
        out.push({
            id: String(p.id).replace('USGS-', ''),
            name: p.monitoring_location_name || String(p.id),
            lat: coords[1],
            lon: coords[0]
        });
    });
    return out;
}

function presetButtonHtml(id, name, lat, lon) {
    // USGS station text is third-party data: escape it for BOTH the HTML body and the
    // JS string literal inside the onclick attribute (never interpolate it raw).
    return '<button class="preset-btn" onclick="selectPreset(\'' + escapeJsString(id) + '\', ' +
        Number(lat) + ', ' + Number(lon) + ', \'' + escapeJsString(name) + '\')" style="margin:5px 0;">' +
        '<span>' + escapeHtml(name) + '</span> <span class="preset-id">' + escapeHtml(id) + '</span></button>';
}

function searchErrorHtml(msg) {
    return '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">\u274c ' + msg + '</div>';
}

async function searchStation() {
    var term = document.getElementById('station-search').value.trim();
    var resultsBox = document.getElementById('search-results');

    if (!term) return;
    resultsBox.style.display = 'block';
    resultsBox.innerHTML = '<div style="color:var(--accent-yellow); font-weight:bold; padding:8px;">Searching...</div>';

    // 1. Exact 8-digit gauge id -> one monitoring-locations record (name + coords).
    if (term.match(/^\d{8}$/)) {
        resultsBox.innerHTML = '<div style="color:var(--accent-yellow); font-weight:bold; padding:8px;">Fetching metadata...</div>';
        try {
            var res = await fetch(WDFN_LOCATIONS + '?id=USGS-' + encodeURIComponent(term) + '&limit=1');
            var data = await res.json();
            var hits = wdfnLocationsToStations(data && data.features);
            resultsBox.innerHTML = hits.length
                ? presetButtonHtml(hits[0].id, hits[0].name, hits[0].lat, hits[0].lon)
                : searchErrorHtml('USGS Station ID not found.');
        } catch (e) {
            resultsBox.innerHTML = searchErrorHtml('Search Error.');
            logDebug('USGS Search error: ' + e.message, 'ERR');
        }
        return;
    }

    // 2. River-name search: CQL2 LIKE over the registry state's STREAM sites, then keep
    //    only the ones reporting live discharge/gage (the old "active stations" filter).
    var stateName = searchRegionStateName();
    resultsBox.innerHTML = '<div style="color:var(--accent-yellow); font-weight:bold; padding:8px;">Searching ' + stateName + ' rivers...</div>';
    try {
        // NWIS names are uppercase; strip LIKE wildcards so the term is matched literally.
        var safe = term.toUpperCase().replace(/[%_']/g, '');
        var filter = "monitoring_location_name LIKE '%" + safe + "%'";
        var lres = await fetch(WDFN_LOCATIONS + '?filter=' + encodeURIComponent(filter) + '&filter-lang=cql2-text'
            + '&state_name=' + encodeURIComponent(stateName) + '&site_type_code=ST&limit=25');
        var ldata = await lres.json();
        var found = wdfnLocationsToStations(ldata && ldata.features);
        if (!found.length) {
            resultsBox.innerHTML = searchErrorHtml('No matching stations found.');
            return;
        }

        // Second step: which of those gauges actually report live readings right now?
        var liveIds = {};
        var ids = found.map(function (s) { return 'USGS-' + s.id; }).join(',');
        var vres = await fetch(WDFN_LATEST + '?monitoring_location_id=' + ids + '&parameter_code=00060,00065&limit=200');
        var vdata = await vres.json();
        ((vdata && vdata.features) || []).forEach(function (f) {
            liveIds[String((f.properties || {}).monitoring_location_id).replace('USGS-', '')] = true;
        });
        var results = Object.keys(liveIds).length
            ? found.filter(function (s) { return liveIds[s.id]; })
            : found;   // if the live check failed, still offer the matches

        resultsBox.innerHTML = '<div style="color:var(--text-muted); font-size:10px; padding:4px;">Showing top ' + Math.min(10, results.length) + ' matches:</div>';
        results.slice(0, 10).forEach(function (s) {
            resultsBox.innerHTML += presetButtonHtml(s.id, s.name, s.lat, s.lon);
        });
    } catch (e) {
        resultsBox.innerHTML = searchErrorHtml('Search Error.');
        logDebug('USGS search error: ' + e.message, 'ERR');
    }
}
