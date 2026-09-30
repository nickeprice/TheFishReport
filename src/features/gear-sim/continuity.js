/**
 * src/features/gear-sim/continuity.js - gauge velocity -> "near you" velocity.
 *
 * The Gear Sim knows the velocity AT THE GAUGE. Continuity says the same discharge
 * spreading into a wider channel runs slower:
 *
 *     v_spot ~= v_gauge * (width_gauge / width_spot)
 *
 * `src/data/river_widths.js` carries a per-gauge channel width routed between two
 * measurement methods and validated against the USGS field widths
 * (scripts/extract_river_widths.py). The SPOT width is the missing half: NAIP cannot
 * measure these glacial rivers at all, so the routed table falls back to the USGS width
 * and there is no per-spot number yet. Until a spot-width source lands (a dated 3DEP
 * endpoint, or a client-side DEM read) the honest answer is the gauge value LABELLED as a
 * same-reach estimate - never a fabricated spot number.
 *
 * The premise that fish hold in LOWER-velocity water is corroborated in the hydraulic-habitat
 * literature: Luis & Pasternack 2023 (Fisheries Research 262:106634) found migrating Chinook
 * selected lower velocity and deeper, higher-conveyance water at a river confluence. See
 * docs/LITERATURE.md §6 (and its conveyance/Froude candidate).
 *
 * public: gaugeWidthFt(siteId), spotWidthRatio(siteId), velocityAtSpot(flow, siteId),
 *         depthAtGauge(flow, siteId), spotDepthFt(flow, siteId)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
var SAME_REACH_UNCERTAINTY = 0.20;   // +/- this much until a real spot width exists

function gaugeWidthFt(siteId) {
    var all = (typeof window !== 'undefined') ? window.RIVER_WIDTHS : null;
    if (!all || !siteId || !all[String(siteId)]) return null;
    var w = Number(all[String(siteId)].width_ft);
    return (w > 0) ? w : null;
}

// width_gauge / width_spot. Returns provenance, not a bare number, so callers cannot
// quietly present an unmeasured ratio as if it were measured.
function spotWidthRatio(siteId) {
    return { ratio: 1.0, measured: false, gaugeFt: gaugeWidthFt(siteId) };
}

// Velocity at the angler's spot in TRUE ft/s, with its provenance and honest spread.
function velocityAtSpot(flow, siteId) {
    var v = hydraulicVelocity(flow, siteId);
    var r = spotWidthRatio(siteId);
    var has = (typeof v.trueMean === 'number');
    return {
        mean: has ? v.trueMean * r.ratio : null,
        bottom: has ? v.trueBottom * r.ratio : null,
        atGauge: true,                    // no spot width yet -> the value IS the gauge's
        ratio: r.ratio,
        ratioMeasured: r.measured,
        gaugeWidthFt: r.gaugeFt,
        uncertainty: SAME_REACH_UNCERTAINTY,
        source: v.source,
        thinRecent: !!v.thinRecent
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
function siteDepthRows(siteId) {
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
function depthAtGauge(flow, siteId) {
    var s = siteDepthRows(siteId);
    if (!s) return null;
    var q = (Number(flow) > 0) ? Number(flow) : REF_FLOW;
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

// Depth at the angler's spot, in the SAME provenance shape as velocityAtSpot(): the
// value IS the gauge's (no spot-width/depth source exists yet), so it is labelled as a
// same-reach estimate with its honest spread. value === null means "unmeasured", never
// a placeholder number.
function spotDepthFt(flow, siteId) {
    var d = depthAtGauge(flow, siteId);
    if (!d) {
        return {
            value: null, bandLow: null, bandHigh: null, atGauge: false, ratio: 1.0, ratioMeasured: false,
            gaugeWidthFt: gaugeWidthFt(siteId), uncertainty: SAME_REACH_UNCERTAINTY,
            source: 'none'
        };
    }
    return {
        value: d.value,                   // central estimate (ft)
        // WS-8b a2: the MEASURED BAND, i.e. what the gauge's own cross-section rows actually
        // span in this flow window. The HUD leads with this; `value` is its centre.
        bandLow: d.minFt,
        bandHigh: d.maxFt,
        atGauge: true,
        ratio: 1.0,                       // depth is not scaled by the width ratio
        ratioMeasured: false,
        gaugeWidthFt: gaugeWidthFt(siteId),
        uncertainty: SAME_REACH_UNCERTAINTY,
        spreadFt: d.spreadFt,
        spreadPct: d.spreadPct,
        crossCheckPct: d.crossCheckPct,
        rows: d.rows,
        gaugeRows: d.gaugeRows,
        thinRecent: d.thinRecent,
        source: 'measured'
    };
}
