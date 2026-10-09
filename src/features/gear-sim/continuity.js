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
 *         spotNearestWidth(siteId), spotWidthAt(lat, lon),
 *         spotWidthInterp(lat, lon), blendedWidthFt(lat, lon, siteId),
 *         drainageWidthFt(siteId), spotSubstrateAt(lat, lon)
 * ES module.
 */
// Site ID -> SPOT_WIDTHS river key lookup — REPLACED by lat/lon nearest-neighbor search.
// All 32 gauges / 15 rivers now supported via haversine search across ALL points.

import { hydraulicVelocity } from './inputs.js';

// ── Width source helpers ────────────────────────────────────────────────────

/** Read NAIP-derived gauge width from window.RIVER_WIDTHS. */
export var SAME_REACH_UNCERTAINTY = 0.20;
const SAME_REACH_MEASURED_UNCERTAINTY = 0.10;

export function gaugeWidthFt(siteId) {
    const all = (typeof window !== 'undefined') ? window.RIVER_WIDTHS : null;
    if (!all || !siteId || !all[String(siteId)]) return null;
    const w = Number(all[String(siteId)].width_ft);
    return (w > 0) ? w : null;
}

// ── SPOT_WIDTHS: nearest-neighbor across ALL rivers ─────────────────────────

/** Haversine distance in metres between two lat/lon points. */
function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) *
              Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SPOT_SEARCH_LIMIT_M = 5000;

/** Nearest SPOT_WIDTHS cross-section to (lat, lon) across ALL rivers. */
export function spotWidthAt(lat, lon) {
    const all = (typeof window !== 'undefined') ? window.SPOT_WIDTHS : null;
    if (!all || !all.rivers) return null;
    let best = null, bestDist = Infinity, bestKey = null;
    const keys = Object.keys(all.rivers);
    for (let ri = 0; ri < keys.length; ri++) {
        const river = all.rivers[keys[ri]];
        if (!river || !river.points || !river.points.length) continue;
        const pts = river.points;
        for (let pi = 0; pi < pts.length; pi++) {
            const p = pts[pi];
            const d = haversineM(lat, lon, p.lat, p.lon);
            if (d < bestDist) { bestDist = d; best = p; bestKey = keys[ri]; }
        }
    }
    if (bestDist > SPOT_SEARCH_LIMIT_M) return null;
    return { point: best, distance_m: bestDist, riverKey: bestKey };
}

/** Interpolate width between 2 nearest cross-sections on same river by cum_m. */
export function spotWidthInterp(lat, lon) {
    const nearest = spotWidthAt(lat, lon);
    if (!nearest || !nearest.point || !nearest.riverKey) return null;
    const all = window.SPOT_WIDTHS;
    const river = all.rivers[nearest.riverKey];
    const pts = river.points;
    const refCum = nearest.point.cum_m || 0;
    const refDist = nearest.distance_m;
    let p1 = null, p2 = null, d1 = Infinity, d2 = Infinity;
    for (let pi = 0; pi < pts.length; pi++) {
        const p = pts[pi];
        if (!p.cum_m) continue;
        const diff = Math.abs(p.cum_m - refCum);
        if (diff < 0.1) continue;
        if (diff < d1) { d2 = d1; p2 = p1; d1 = diff; p1 = p; }
        else if (diff < d2) { d2 = diff; p2 = p; }
    }
    if (!p1 || !p2 || !p1.wetted_ft || !p2.wetted_ft) {
        const w = nearest.point.wetted_ft || nearest.point.bankfull_ft || null;
        return { width_ft: w, point1: nearest.point, point2: null,
                 cum_m: refCum, distance_m: refDist, riverKey: nearest.riverKey };
    }
    const cum1 = Math.min(p1.cum_m, p2.cum_m);
    const cum2 = Math.max(p1.cum_m, p2.cum_m);
    const w1 = (p1.cum_m === cum1) ? p1.wetted_ft : p2.wetted_ft;
    const w2 = (p1.cum_m === cum2) ? p1.wetted_ft : p2.wetted_ft;
    const delta = cum2 - cum1;
    const frac = (delta > 0.01) ? Math.max(0, Math.min(1, (refCum - cum1) / delta)) : 0;
    return { width_ft: Math.round((w1 + (w2 - w1) * frac) * 10) / 10,
             point1: p1, point2: p2, cum_m: refCum, distance_m: refDist, riverKey: nearest.riverKey };
}

// ── Drainage-area width regression ───────────────────────────────────────────
export function drainageWidthFt(siteId) {
    const nhdData = (typeof window !== 'undefined' && window.State && window.State.nhdData)
        ? window.State.nhdData : null;
    if (!nhdData || !siteId) return null;
    const da = nhdData[String(siteId)] && nhdData[String(siteId)].totdasqkm
        ? Number(nhdData[String(siteId)].totdasqkm) : null;
    if (!da || da <= 0) return null;
    return Math.round(4.0 * Math.pow(da, 0.4) * 3.28084 * 10) / 10;
}

// ── Inverse-variance blended width ──────────────────────────────────────────
export function blendedWidthFt(lat, lon, siteId) {
    const src = [];
    const interp = spotWidthInterp(lat, lon);
    if (interp && interp.width_ft && interp.width_ft > 0) {
        src.push({ w: interp.width_ft, v: 100, label: 'spot_widths_interp' });
    } else {
        const nearest = spotWidthAt(lat, lon);
        if (nearest && nearest.point) {
            const w = nearest.point.wetted_ft || nearest.point.bankfull_ft || null;
            if (w && w > 0) src.push({ w: w, v: 44, label: 'spot_widths_nearest' });
        }
    }
    const gw = gaugeWidthFt(siteId);
    if (gw && gw > 0) src.push({ w: gw, v: 25, label: 'gauge_width' });
    const da = drainageWidthFt(siteId);
    if (da && da > 0) src.push({ w: da, v: 6.25, label: 'drainage_area' });
    if (!src.length) return { widthFt: null, sigma: null, sources: [] };
    let num = 0, den = 0;
    for (let si = 0; si < src.length; si++) {
        num += src[si].w * src[si].v;
        den += src[si].v;
    }
    return { widthFt: Math.round(num / den * 10) / 10,
             sigma: 1 / Math.sqrt(den), sources: src };
}

// ── Substrate lookup — lat/lon across ALL rivers ────────────────────────────
export function spotSubstrateAt(lat, lon) {
    const all = (typeof window !== 'undefined') ? window.RIVER_SUBSTRATE : null;
    if (!all || !all.rivers) return null;
    let best = null, bestDist = Infinity;
    const keys = Object.keys(all.rivers);
    for (let ri = 0; ri < keys.length; ri++) {
        const river = all.rivers[keys[ri]];
        if (!river || !river.points || !river.points.length) continue;
        for (let pi = 0; pi < river.points.length; pi++) {
            const p = river.points[pi];
            const d = haversineM(lat, lon, p.lat, p.lon);
            if (d < bestDist) { bestDist = d; best = p; }
        }
    }
    if (bestDist > SPOT_SEARCH_LIMIT_M) return null;
    return { point: best, distance_m: bestDist };
}

// Backward compat: spotNearestSubstrate(siteId) reads active_station from localStorage
export function spotNearestSubstrate(siteId) {
    try {
        const raw = localStorage.getItem('active_station');
        if (raw) {
            const st = JSON.parse(raw);
            if (st.lat != null && st.lon != null) {
                return spotSubstrateAt(Number(st.lat), Number(st.lon));
            }
        }
    } catch (e) {}
    return null;
}

// ── Legacy spotNearestWidth — now delegates to spotWidthAt ──────────────────

export function spotNearestWidth(siteId) {
    try {
        const raw = localStorage.getItem('active_station');
        if (raw) {
            const st = JSON.parse(raw);
            if (st.lat != null && st.lon != null) {
                return spotWidthAt(Number(st.lat), Number(st.lon));
            }
        }
    } catch (e) {}
    return null;
}

// width_gauge / width_spot — lat/lon lookup across ALL rivers.
export function spotWidthRatio(siteId) {
    const gaugeFt = gaugeWidthFt(siteId);
    try {
        const raw = localStorage.getItem('active_station');
        if (raw) {
            const st = JSON.parse(raw);
            if (st.lat != null && st.lon != null) {
                const near = spotWidthAt(Number(st.lat), Number(st.lon));
                if (near && near.point && near.point.wetted_ft > 0 && gaugeFt && gaugeFt > 0) {
                    const ratio = gaugeFt / near.point.wetted_ft;
                    return {
                        ratio: ratio, measured: true,
                        gaugeFt: gaugeFt, spotFt: near.point.wetted_ft,
                        spotDistanceM: Math.round(near.distance_m)
                    };
                }
            }
        }
    } catch (e) {}
    return { ratio: 1.0, measured: false, gaugeFt: gaugeFt };
}

// Velocity at the angler's spot in TRUE ft/s, with its provenance and honest spread.
// When the spot width is measured (SPOT_WIDTHS), uses the Manning-based adjustment:
//     v_spot = v_gauge * (w_spot / w_gauge)^(2/5)
// Otherwise falls back to the simple continuity ratio (w_gauge / w_spot).
window.velocityAtSpot = velocityAtSpot;
export function velocityAtSpot(flow, siteId) {
    const v = hydraulicVelocity(flow, siteId);
    const r = spotWidthRatio(siteId);
    const has = v && v.mean && v.mean > 0;
    // Manning velocity exponent: (w_spot/w_gauge)^(2/5) = (1/r.ratio)^(2/5) = r.ratio^(-0.4)
    const velFactor = (r.measured && r.ratio > 0) ? Math.pow(r.ratio, -0.4) : r.ratio;
    const uncertainty = r.measured ? SAME_REACH_MEASURED_UNCERTAINTY : SAME_REACH_UNCERTAINTY;
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
const DEPTH_NEAREST_N = 6;      // rows around today's flow that set the median
const DEPTH_MIN_ROWS = 1;

// The site's usable rows, or null. `points[].a` / `points[].w` are the measured
// area/width the depth comes from - nothing here invents a value.
export function siteDepthRows(siteId) {
    const all = (typeof window !== 'undefined') ? window.CHANNEL_MEASUREMENTS : null;
    if (!all || !all.sites || !siteId) return null;
    const site = all.sites[String(siteId)];
    if (!site || !site.points || !site.points.length) return null;
    const rows = [];
    for (let i = 0; i < site.points.length; i++) {
        const p = site.points[i];
        const q = Number(p.q), w = Number(p.w), a = Number(p.a), v = Number(p.v);
        if (!(q > 0) || !(w > 0) || !(a > 0)) continue;
        rows.push({ q: q, w: w, a: a, v: v, d: a / w, date: p.t });
    }
    return rows.length ? { site: site, rows: rows } : null;
}

// Measured mean depth (ft) at the gauge for this discharge, with its provenance.
// null when the gauge has no measured cross-section.
export function depthAtGauge(flow, siteId) {
    const s = siteDepthRows(siteId);
    if (!s) return null;
    const q = (Number(flow) > 0) ? Number(flow) : 0;
    if (!q || q <= 0) return null;
    const rows = s.rows.slice().sort(function (x, y) {
        return Math.abs(Math.log(x.q / q)) - Math.abs(Math.log(y.q / q));
    });
    const picked = rows.slice(0, DEPTH_NEAREST_N);
    if (picked.length < DEPTH_MIN_ROWS) return null;

    const ds = picked.map(function (r) { return r.d; }).sort(function (a, b) { return a - b; });
    const mid = (ds.length % 2)
        ? ds[(ds.length - 1) / 2]
        : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2;      // median

    // Continuity cross-check: A/W vs Q/(W*V) on the same rows. The generator already
    // drops rows failing Q = v*A (5%), so a large value here means a row slipped in.
    let worst = 0;
    for (let i = 0; i < picked.length; i++) {
        const r = picked[i];
        if (!(r.v > 0)) continue;
        const viaQ = r.q / (r.w * r.v);
        const dev = Math.abs(r.d - viaQ) / r.d;
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
    const d = depthAtGauge(flow, siteId);
    const r = spotWidthRatio(siteId);
    // Manning depth exponent: (w_gauge/w_spot)^(3/5) = r.ratio^0.6
    const depthFactor = (r.measured && r.ratio > 0) ? Math.pow(r.ratio, 0.6) : 1.0;
    const uncertainty = r.measured ? SAME_REACH_MEASURED_UNCERTAINTY : SAME_REACH_UNCERTAINTY;
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
