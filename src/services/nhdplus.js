/**
 * src/services/nhdplus.js — EPA WATERS NHDPlus reach query.
 *
 * public: fetchNhdPlus(lat, lon), NHDPLUS_CACHE_KEY
 * ES module.
 */
import { State } from '../shared/state.js';

export const NHDPLUS_CACHE_KEY = 'nhdplus_reach';
// Cache TTL: 24h (in ms)
const CACHE_TTL_MS = 86400000;
// Buffer in degrees (~500m at 47°N): 0.0045 ≈ 500m
const BUFFER_DEG = 0.0045;
// EPA WATERS REST endpoint for Network Flowline layer
const EPA_URL = 'https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus/NHDPlus/MapServer/2/query';
// Fields we need from the flowline
const OUT_FIELDS = 'comid,gnis_name,streamorder,slope,lengthkm,totdasqkm,qa_MA,va_MA,qa_01,va_01,qa_02,va_02,qa_03,va_03,qa_04,va_04,qa_05,va_05,qa_06,va_06,qa_07,va_07,qa_08,va_08,qa_09,va_09,qa_10,va_10,qa_11,va_11,qa_12,va_12';

/**
 * Fetch NHDPlus reach data nearest to (lat, lon).
 * Returns { comid, gnis_name, streamorder, slope, ... } or null.
 */
export async function fetchNhdPlus(lat, lon) {
    if (lat == null || lon == null) return null;

    // 1) Check localStorage cache
    try {
        const cached = JSON.parse(localStorage.getItem(NHDPLUS_CACHE_KEY) || 'null');
        if (cached && cached.lat && cached.lon) {
            const d = dist(cached.lat, cached.lon, lat, lon);
            if (d < 500 && Date.now() - cached.ts < CACHE_TTL_MS) {
                State.nhdData = cached.data;
                return cached.data;
            }
        }
    } catch (e) { /* cache miss */ }

    // 2) Build bounding-box envelope around the point
    const minX = lon - BUFFER_DEG;
    const minY = lat - BUFFER_DEG;
    const maxX = lon + BUFFER_DEG;
    const maxY = lat + BUFFER_DEG;

    const params = new URLSearchParams({
        geometry: `${minX},${minY},${maxX},${maxY}`,
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: OUT_FIELDS,
        returnGeometry: 'false',
        f: 'json',
    });

    try {
        const resp = await fetch(EPA_URL + '?' + params.toString(), { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) return null;
        const data = await resp.json();
        const features = data.features || [];
        if (!features.length) return null;

        // Pick closest reach by center-point distance
        let best = null, bestDist = Infinity;
        for (const feat of features) {
            const a = feat.attributes;
            if (!a) continue;
            // Without geometry, estimate via streamorder (higher = mainstem)
            // Actually just return the first (most relevant) feature
            if (!best) { best = a; continue; }
            // Prefer higher streamorder (main channel)
            if ((a.streamorder || 0) > (best.streamorder || 0)) best = a;
        }

        // 3) Cache result with GPS stamp
        try {
            localStorage.setItem(NHDPLUS_CACHE_KEY, JSON.stringify({
                lat: lat, lon: lon, ts: Date.now(), data: best
            }));
        } catch (e) { /* storage full */ }

        State.nhdData = best;
        return best;
    } catch (e) {
        return null;
    }
}

// Haversine distance in meters
function dist(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

window.NHDPLUS_CACHE_KEY = NHDPLUS_CACHE_KEY;
window.fetchNhdPlus = fetchNhdPlus;