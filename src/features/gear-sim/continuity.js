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
 * public: gaugeWidthFt(siteId), spotWidthRatio(siteId), velocityAtSpot(flow, siteId)
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
