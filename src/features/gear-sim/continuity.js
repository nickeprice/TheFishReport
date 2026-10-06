/**
 * src/features/gear-sim/continuity.js - gauge velocity -> "near you" velocity.
 *
 * The Gear Sim knows the velocity AT THE GAUGE. Since Phase 1.4-1.5, the app also
 * knows the channel width at the angler's spot from a pre-computed DEM lookup table
 * (`src/data/spot_widths.js`). Continuity + Manning gives the adjustment:
 *
 *     v_spot = v_gauge * (w_spot / w_gauge)^(2/5)
 *     d_spot = d_gauge * (w_gauge / w_spot)^(3/5)
 *
 * The Manning exponents (2/5, 3/5) assume a wide rectangular channel with constant
 * slope and roughness — the standard hydraulic-geometry scaling for gravel-bed rivers.
 *
 * `src/data/river_widths.js` carries per-gauge channel width (validated against USGS
 * field widths). `src/data/spot_widths.js` carries DEM-measured cross-sections at
 * ~500m intervals along 5 core rivers. The nearest-neighbor lookup finds the closest
 * DEM point to the active station's GPS coordinates.
 *
 * The premise that fish hold in LOWER-velocity water is corroborated in the hydraulic-habitat
 * literature: Luis & Pasternack 2023 (Fisheries Research 262:106634) found migrating Chinook
 * selected lower velocity and deeper, higher-conveyance water at a river confluence. See
 * docs/LITERATURE.md §6 (and its conveyance/Froude candidate).
 *
 * public: gaugeWidthFt(siteId), spotWidthRatio(siteId), velocityAtSpot(flow, siteId),
 *         depthAtGauge(flow, siteId), spotDepthFt(flow, siteId),
 *         spotNearestWidth(siteId)
 * ES module.
 */
import { hydraulicVelocity } from './inputs.js';
export var SAME_REACH_UNCERTAINTY = 0.20;        // +/- this much without a spot measurement
var SAME_REACH_MEASURED_UNCERTAINTY = 0.10; // +/- 10% when spot width IS measured

// Site ID -> SPOT_WIDTHS river key lookup.
var SPOT_WIDTHS_SITE_MAP = {
    "12101500": "puyallup",
    "12098500": "white",
    "12094000": "carbon",
    "12113000": "green",
    "12089500": "nisqually"
};

export function gaugeWidthFt(siteId) {
    var all = (typeof window !== 'undefined') ? window.RIVER_WIDTHS : null;
    if (!all || !siteId || !all[String(siteId)]) return null;
    var w = Number(all[String(siteId)].width_ft);
    return (w > 0) ? w : null;
}

// Haversine distance in metres (used for nearest-neighbour SPOT_WIDTHS lookup).
export function haversineM(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Nearest SPOT_WIDTHS DEM cross-section to the active station's GPS coordinates.
// Returns { point, distance_m } or null when unavailable.
export function spotNearestWidth(siteId) {
    if (!siteId) return null;
    var key = SPOT_WIDTHS_SITE_MAP[String(siteId)];
    if (!key) return null;
    var all = (typeof window !== 'undefined') ? window.SPOT_WIDTHS : null;
    if (!all || !all.rivers) return null;
    var river = all.rivers[key];
    if (!river || !river.points || !river.points.length) return null;

    // Read the active station's GPS coordinates from localStorage.
    var lat = null, lon = null;
    try {
        var raw = localStorage.getItem('active_station');
        if (raw) {
            var st = JSON.parse(raw);
            if (st.lat != null && st.lon != null) {
                lat = Number(st.lat);
                lon = Number(st.lon);
            }
        }
    } catch (e) {}
    if (lat == null || lon == null) return null;

    // Linear scan — SPOT_WIDTHS is small (under 100 points per river).
    var best = null, bestDist = Infinity;
    for (var i = 0; i < river.points.length; i++) {
        var p = river.points[i];
        var d = haversineM(lat, lon, p.lat, p.lon);
        if (d < bestDist) {
            bestDist = d;
            best = p;
        }
    }
    return best ? { point: best, distance_m: bestDist } : null;
}

// width_gauge / width_spot. Returns provenance, not a bare number, so callers cannot
// quietly present an unmeasured ratio as if it were measured.
// When SPOT_WIDTHS data exists for the active station's river, uses the nearest
// DEM cross-section. Otherwise falls back to 1.0 (same-reach estimate).
export function spotWidthRatio(siteId) {
    var gaugeFt = gaugeWidthFt(siteId);
    var near = spotNearestWidth(siteId);
    if (near && near.point && near.point.wetted_ft > 0 && gaugeFt && gaugeFt > 0) {
        var ratio = gaugeFt / near.point.wetted_ft;
        return {
            ratio: ratio,
            measured: true,
            gaugeFt: gaugeFt,
            spotFt: near.point.wetted_ft,
            spotDistanceM: Math.round(near.distance_m)
        };
    }
    return { ratio: 1.0, measured: false, gaugeFt: gaugeFt };
}

// Velocity at the angler's spot in TRUE ft/s, with its provenance and honest spread.
// When the spot width is measured (SPOT_WIDTHS), uses the Manning-based adjustment:
//     v_spot = v_gauge * (w_spot / w_gauge)^(2/5)
// Otherwise falls back to the simple continuity ratio (w_gauge / w_spot).
window.velocityAtSpot = velocityAtSpot;
export function velocityAtSpot(flow, siteId) {
    var v = hydraulicVelocity(flow, siteId);
    var r = spotWidthRatio(siteId);
    var has = v && v.mean && v.mean > 0;
    // Manning velocity exponent: (w_spot/w_gauge)^(2/5) = (1/r.ratio)^(2/5) = r.ratio^(-0.4)
    var velFactor = (r.measured && r.ratio > 0) ? Math.pow(r.ratio, -0.4) : r.ratio;
    var uncertainty = r.measured ? SAME_REACH_MEASURED_UNCERTAINTY : SAME_REACH_UNCERTAINTY;
    return {
        mean: has ? v.mean * velFactor : null,
        bottom: has ? v.bottom * velFactor : null,
        atGauge: !r.measured,
        ratio: r.ratio,
        ratioMeasured: r.measured,
        gaugeWidthFt: r.gaugeFt,
        uncertainty: uncertainty,
        source: v ? v.source : 'none',
        thinRecent: v ? !!v.thinRecent : false
    };
}

// ==================================================================================
// DEPTH AT THE GAUGE (WS-8a)
// The velocity half above reads the gauge's measured `v = a*Q^b` curve. The DEPTH
// half needs nothing new: every USGS field-measurement row in
// `src/data/channel_measurements.js` already carries its own cross-section area (`a`,
// ft^2) and channel width (`w`, ft), so the measured mean depth at that discharge is
// simply
//
//     D = A / W
//
// We read the rows nearest today's discharge (log-distance) and take their MEDIAN,
// which is robust to a single odd sounding, and we CROSS-CHECK every chosen row with
// the continuity form the generator gates on (Q = v*A  =>  D = Q/(W*V)) and report the
// worst relative disagreement instead of hiding it.
//
// There is NO extrapolated fit: outside the measured record the nearest rows are the
// honest answer, and beyond that the spread grows where the reader can see it. With no
// measured site there is no number at all - never a fabricated spot depth.
// ==================================================================================
var DEPTH_NEAREST_N = 6;      // rows around today's flow that set the median
var DEPTH_MIN_ROWS = 1;

// The site's usable rows, or null. `points[].a` / `points[].w` are the measured
// area/width the depth comes from - nothing here invents a value.
export function siteDepthRows(siteId) {
    var all = (typeof window !== 'undefined') ? window.CHANNEL_MEASUREMENTS : null;
    if (!all || !all.sites || !siteId) return null;
    var site = all.sites[String(siteId)];
    if (!site || !site.points || !site.points.length) return null;
    var rows = [];
    for (var i = 0; i < site.points.length; i++) {
        var p = site.points[i];
        var q = Number(p.q), w = Number(p.w), a = Number(p.a), v = Number(p.v);
        if (!(q > 0) || !(w > 0) || !(a > 0)) continue;
        rows.push({ q: q, w: w, a: a, v: v, d: a / w, date: p.t });
    }
    return rows.length ? { site: site, rows: rows } : null;
}

// Measured mean depth (ft) at the gauge for this discharge, with its provenance.
// null when the gauge has no measured cross-section.
export function depthAtGauge(flow, siteId) {
    var s = siteDepthRows(siteId);
    if (!s) return null;
    var q = (Number(flow) > 0) ? Number(flow) : 0;
    if (!q || q <= 0) return null;
    var rows = s.rows.slice().sort(function (x, y) {
        return Math.abs(Math.log(x.q / q)) - Math.abs(Math.log(y.q / q));
    });
    var picked = rows.slice(0, DEPTH_NEAREST_N);
    if (picked.length < DEPTH_MIN_ROWS) return null;

    var ds = picked.map(function (r) { return r.d; }).sort(function (a, b) { return a - b; });
    var mid = (ds.length % 2)
        ? ds[(ds.length - 1) / 2]
        : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2;      // median

    // Continuity cross-check: A/W vs Q/(W*V) on the same rows. The generator already
    // drops rows failing Q = v*A (5%), so a large value here means a row slipped in.
    var worst = 0;
    for (var i = 0; i < picked.length; i++) {
        var r = picked[i];
        if (!(r.v > 0)) continue;
        var viaQ = r.q / (r.w * r.v);
        var dev = Math.abs(r.d - viaQ) / r.d;
        if (dev > worst) worst = dev;
    }

    return {
        value: mid,                       // ft - the central (median) estimate
        minFt: ds[0],                     // the MEASURED band: shallowest row in the window
        maxFt: ds[ds.length - 1],         // ...and the deepest. Reported to the angler as a
                                          // range (WS-8b a2) instead of one bare number.
        spreadFt: (ds[ds.length - 1] - ds[0]) / 2,
        spreadPct: (mid > 0) ? ((ds[ds.length - 1] - ds[0]) / 2) / mid : 0,
        crossCheckPct: worst,
        rows: picked.length,
        gaugeRows: s.rows.length,
        q: q,
        thinRecent: !!s.site.thin_recent,
        source: 'measured'
    };
}

// Depth at the angler's spot, in the SAME provenance shape as velocityAtSpot().
// When the spot width is measured (SPOT_WIDTHS), applies the Manning depth correction:
//     d_spot = d_gauge * (w_gauge / w_spot)^(3/5)
// Otherwise returns the gauge depth as-is.
// value === null means "unmeasured", never a placeholder number.
window.spotDepthFt = spotDepthFt;
export function spotDepthFt(flow, siteId) {
    var d = depthAtGauge(flow, siteId);
    var r = spotWidthRatio(siteId);
    // Manning depth exponent: (w_gauge/w_spot)^(3/5) = r.ratio^0.6
    var depthFactor = (r.measured && r.ratio > 0) ? Math.pow(r.ratio, 0.6) : 1.0;
    var uncertainty = r.measured ? SAME_REACH_MEASURED_UNCERTAINTY : SAME_REACH_UNCERTAINTY;
    if (!d) {
        return {
            value: null, bandLow: null, bandHigh: null, atGauge: false, ratio: r.ratio, ratioMeasured: r.measured,
            gaugeWidthFt: gaugeWidthFt(siteId), uncertainty: uncertainty,
            source: 'none'
        };
    }
    return {
        value: d.value * depthFactor,          // central estimate (ft), Manning-corrected
        bandLow: d.minFt * depthFactor,
        bandHigh: d.maxFt * depthFactor,
        atGauge: !r.measured,
        ratio: r.ratio,
        ratioMeasured: r.measured,
        gaugeWidthFt: gaugeWidthFt(siteId),
        uncertainty: uncertainty,
        spreadFt: d.spreadFt,
        spreadPct: d.spreadPct,
        crossCheckPct: d.crossCheckPct,
        rows: d.rows,
        gaugeRows: d.gaugeRows,
        thinRecent: d.thinRecent,
        source: 'measured'
    };
}
