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
// Fields we need from the flowline (+ geometry for river heading + bend position)
const OUT_FIELDS = 'comid,gnis_name,streamorder,slope,lengthkm,totdasqkm,fcode,ftype,lakefract,navigable,coastal,maxelevsmo,minelevsmo,terminalfl,divergence,qa_MA,va_MA,qa_01,va_01,qa_02,va_02,qa_03,va_03,qa_04,va_04,qa_05,va_05,qa_06,va_06,qa_07,va_07,qa_08,va_08,qa_09,va_09,qa_10,va_10,qa_11,va_11,qa_12,va_12,qc_01,vc_01,qc_02,vc_02,qc_03,vc_03,qc_04,vc_04,qc_05,vc_05,qc_06,vc_06,qc_07,vc_07,qc_08,vc_08,qc_09,vc_09,qc_10,vc_10,qc_11,vc_11,qc_12,vc_12,qe_01,ve_01,qe_02,ve_02,qe_03,ve_03,qe_04,ve_04,qe_05,ve_05,qe_06,ve_06,qe_07,ve_07,qe_08,ve_08,qe_09,ve_09,qe_10,ve_10,qe_11,ve_11,qe_12,ve_12,Q0001E,Q0002E,Q0005E,Q0010E,Q0025E,Q0050E,Q0100E,Q0500E,Q1000E';

/**
 * Fetch NHDPlus reach data nearest to (lat, lon), enriched with flowline
 * geometry (vertices + river heading) and recurrence-interval flows.
 * Returns { comid, gnis_name, streamorder, slope, fcode, headingRad, ... } or null.
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
        returnGeometry: 'true',
        f: 'json',
    });

    try {
        const resp = await fetch(EPA_URL + '?' + params.toString(), { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) return null;
        const data = await resp.json();
        const features = data.features || [];
        if (!features.length) return null;

        // Pick closest reach by center-point distance
        let best = null;
        for (const feat of features) {
            const a = feat.attributes;
            if (!a) continue;
            // Enrich with geometry: extract polyline vertices for river heading
            const g = feat.geometry;
            if (g && g.paths && g.paths.length > 0) {
                // NHDPlus polylines are digitized in the direction of flow
                // (ESRI convention). Each path is [[x1,y1],[x2,y2],...].
                // Project to lon/lat and find the heading of the central segment.
                const path = g.paths[0];
                a.vertices = path.map(function (p) {
                    return [p[1], p[0]];  // [lat, lon]
                });
                // Compute heading: bearing of the segment closest to the query point
                let bestSeg = 0, bestDist = Infinity;
                for (let vi = 0; vi < path.length - 1; vi++) {
                    const segMidLat = (path[vi][1] + path[vi+1][1]) / 2;
                    const segMidLon = (path[vi][0] + path[vi+1][0]) / 2;
                    const d = dist(lat, lon, segMidLat, segMidLon);
                    if (d < bestDist) { bestDist = d; bestSeg = vi; }
                }
                const p1 = path[bestSeg], p2 = path[bestSeg + 1];
                const dx = p2[0] - p1[0];
                const dy = p2[1] - p1[1];
                a.headingRad = Math.atan2(dx, dy);  // bearing of flow dir (rad)
            }
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