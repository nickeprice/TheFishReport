/**
 * src/services/water-gauge.js - USGS gauge data (CFS momentum, trend, own-gauge).
 * Splintered from water.js. ES module.
 */
import { logDebug } from '../shared/debug.js';
import { State } from '../shared/state.js';

// is source-agnostic.
const WDFN_CONTINUOUS = 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/continuous/items';

export async function fetchCfsReadingsWdfn(siteId, lookbackHours) {
    // Same 4-hour lookback the legacy `period=PT4H` gave, so the delta is comparable.
    // Pass lookbackHours for a wider window (e.g. map popup fallback needs 24h).
    const end = new Date();
    const start = new Date(end.getTime() - (lookbackHours || 4) * 3600 * 1000);
    const iso = function (d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); };
    const url = WDFN_CONTINUOUS
        + '?monitoring_location_id=USGS-' + encodeURIComponent(siteId)
        + '&parameter_code=00060&datetime=' + iso(start) + '/' + iso(end) + '&limit=200';
    const res = await fetch(url);
    const data = await res.json();
    const feats = data && data.features;
    if (!feats) return null;                    // unrecognizable -> let the caller fall back
    return feats.map(function (f) {
        const p = f.properties || {};
        return { t: new Date(p.time).getTime(), v: parseFloat(p.value) };
    }).filter(function (r) { return isFinite(r.t) && isFinite(r.v) && r.v > -900000; });
}

// LEGACY fallback: waterservices.usgs.gov/nwis/iv — decommissioned in Q1 2027.
export async function fetchCfsReadingsLegacy(siteId) {
    const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${siteId}&parameterCd=00060&period=PT4H&siteStatus=all`;
    const response = await fetch(url);
    const data = await response.json();
    const series = data && data.value ? data.value.timeSeries : null;
    const readings = (series && series[0] && series[0].values && series[0].values[0]) ? series[0].values[0].value : null;
    if (!readings) return [];
    return readings.map(function (r) {
        return { t: new Date(r.dateTime).getTime(), v: parseFloat(r.value) };
    }).filter(function (r) { return isFinite(r.t) && isFinite(r.v) && r.v > -900000; });
}

window.fetchCFSMomentum = fetchCFSMomentum;
export async function fetchCFSMomentum(siteId) {
    if (!siteId) return;
    try {
        // G4 (Phase 2.4): cache the last momentum window so a dead zone still shows the
        // trend if it is fresh (< 12 h old); stale cache -> hide the arrow, never lie.
        const CACHE_PREFIX = 'cfs_momentum_';
        const FRESH_MS = 12 * 3600 * 1000;

        // WDFN first; legacy nwis/iv only when the modern endpoint is unusable.
        let readings = null;
        try { readings = await fetchCfsReadingsWdfn(siteId); } catch (e) { readings = null; }
        if (!readings || !readings.length) {
            try { readings = await fetchCfsReadingsLegacy(siteId); } catch (e) { readings = []; }
        }
        if (!readings || readings.length < 2) {
            // Unreachable: fall back to a fresh cached trend, else paint nothing.
            let cachedRaw = null;
            try { cachedRaw = JSON.parse(localStorage.getItem(CACHE_PREFIX + siteId) || 'null'); } catch (e) { cachedRaw = null; }
            if (cachedRaw && cachedRaw.readings && (Date.now() - (cachedRaw.ts || 0)) < FRESH_MS) {
                renderCfsTrend(siteId, cachedRaw.readings);
                logDebug("CFS momentum cached (fresh, " + siteId + ")", "NET");
            }
            return;
        }

        // Sort chronologically so the 4-hour delta never depends on USGS return order.
        const sorted = readings.slice().sort(function (a, b) { return a.t - b.t; });
        try {
            localStorage.setItem(CACHE_PREFIX + siteId,
                JSON.stringify({ readings: sorted, ts: Date.now() }));
        } catch (e) { /* quota / private mode — non-fatal */ }
        renderCfsTrend(siteId, sorted);
    } catch(e) {
        logDebug("CFS Momentum error: " + e.message, "ERR");
    }
}

// Pure-ish: paints the "Rising / Dropping / Stable" trend badge from a sorted window.
window.renderCfsTrend = renderCfsTrend;
export function renderCfsTrend(siteId, sorted) {
    if (!sorted || sorted.length < 2) return;
    const oldest = sorted[0].v;
    const latest = sorted[sorted.length - 1].v;
    if (isNaN(oldest) || isNaN(latest)) return;
    const delta = latest - oldest;

    // Salmon fishing logic: a rise means blowout risk (red),
    // a drop means the river is clearing (green), otherwise neutral (gray).
    let trendText = "Stable";
    let trendColor = "#94a3b8";
    if (delta > 15) {
        trendText = "\u2191 Rising";
        trendColor = "#ef4444";
    } else if (delta < -15) {
        trendText = "\u2193 Dropping";
        trendColor = "#22c55e";
    }

    document.querySelectorAll('.cfs-val').forEach(function(el) {
        const existing = el.parentElement.querySelector('.cfs-trend-badge');
        if (existing) existing.remove();
        const span = document.createElement('span');
        span.className = 'cfs-trend-badge';
        span.style.color = trendColor;
        span.innerText = trendText;
        el.insertAdjacentElement('afterend', span);
    });
    logDebug("CFS momentum (" + siteId + "): " + oldest + " -> " + latest + " (delta " + delta.toFixed(0) + ") " + trendText, "NET");
}

// Own-gauge water temp + turbidity. Locked decision: query ONLY the active
// station's OWN USGS gauge (00010 temp, 63680 turbidity) via the water-report
// API payload — no proxy, no cross-gauge fallback, no guessing. When the
// station does not report them, both stay hidden entirely (the card renders
// only the fields that carry a value).
export function applyOwnGaugeWaterQuality(waterTempF, turbidityFnu) {
    const hasTemp = (waterTempF !== undefined && waterTempF !== null && !isNaN(waterTempF));
    State.waterTempF = hasTemp ? Number(waterTempF) : null;   // Gear Sim falls back to the baseline zone when temp is unknown
    const hasTurb = (turbidityFnu !== undefined && turbidityFnu !== null && !isNaN(turbidityFnu));
    // WS-8a: the Gear Sim's colour term reads the SAME own-gauge reading the card paints,
    // so the zone can never use a turbidity the angler cannot see. null -> no term at all.
    State.turbidityFnu = hasTurb ? Number(turbidityFnu) : null;
    document.querySelectorAll('.water-temp').forEach(function (el) {
        el.innerText = hasTemp ? Math.round(Number(waterTempF)) : '--';
    });
    document.querySelectorAll('.turbidity-val').forEach(function (el) {
        el.innerText = hasTurb ? Number(turbidityFnu).toFixed(1) : '--';
    });
}

// Surface "now" conditions painted FROM the water-report payload (since
// Commit 2.1f the backend's Open-Meteo request includes `current` readings, so
// the client no longer calls Open-Meteo directly). Also stashes the wind for
// the catch-log env enrichment (State.currentWindMph / currentWindDir).
//
// WS-4: this paints the ACTIVE DAY'S CARD ONLY. It used to querySelectorAll across every
// day card, which stamped reports[0]'s weather onto all of them - that is exactly why
// cycling the days never changed the numbers. Pass the day's own rep (or none, and the card
// it belongs to is skipped) and it repaints just that card.
