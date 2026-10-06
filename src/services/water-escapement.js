/**
 * src/services/water-escapement.js - WDFW hatchery escapement + forecast + stream stats.
 * Splintered from water.js. ES module.
 */
import { logDebug } from '../shared/debug.js';
import { apiGetJson } from '../shared/api.js';
import { ESCAPEMENT_UPDATED_FALLBACK } from './water-weather.js';

export function escNum(v) {
    return (v === null || v === undefined || isNaN(v)) ? '--' : Number(v).toLocaleString('en-US');
}

// Maps a dataset row's species + run into a display bucket, e.g.
// species 'Chinook' + run 'Fall' -> 'Chinook'. Legacy 'Fall Chinook' rows
// (cached before the rename) map to the same bucket so old data never
// orphans. Jacks are pooled separately from the dataset's dedicated
// jack_count column.
export function escBucketName(species, run) {
    var sp = String(species || '').trim();
    // Chinook (any run) -> 'Chinook'. Legacy 'Fall Chinook' rows map here too.
    if (sp.toLowerCase().indexOf('chinook') !== -1 || sp.toLowerCase() === 'king') return 'Chinook';
    return sp || 'Unknown';
}

// Week-over-Week (WoW) momentum badge: last 7 days of returns vs the prior 7 days.
// Green = building push, Red = slowing, Muted = flat.
export function escWowBadge(wow) {
    if (!wow || (wow.cur === 0 && wow.prior === 0)) return { text: '\u2014 Stable', color: '#94a3b8' };
    if (wow.delta > 0) {
        return { text: '\u25B2 +' + wow.delta + ((wow.pct !== null) ? ' (+' + wow.pct + '%)' : ''), color: '#22c55e' };
    }
    if (wow.delta < 0) {
        return { text: '\u25BC ' + Math.abs(wow.delta) + ((wow.pct !== null) ? ' (' + wow.pct + '%)' : ''), color: '#ef4444' };
    }
    return { text: '\u2014 Stable', color: '#94a3b8' };
}

// Freshness line for the hatchery counts fold: "Last updated Sep 18, 2026 · 12:09 AM"
// in the DEVICE's local time from WDFW's own :updated_at stamp. An absent /
// unparseable stamp returns the honest fallback wording — never a fabricated date.
export function formatEscapementUpdated(iso) {
    if (!iso) return ESCAPEMENT_UPDATED_FALLBACK;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return ESCAPEMENT_UPDATED_FALLBACK;
    var datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    var timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return 'Last updated ' + datePart + ' \u00B7 ' + timePart;
}

// Escapement counts now render inside the merged [ RUN & TIMING ] per-species
// cards (buildSpeciesCalendarHtml in app.js); refreshEscapement fills their
// count rows async after the card HTML renders.

// Query the Socrata dataset for EVERY facility mapped to the river (dynamic IN clause)
// and derive, per life stage:
//   Total Return = sum of adult_count in the current calendar year
//   Trap Count   = the most recent single-day count
//   5-Yr Avg     = mean of the same calendar window across the prior 5 years
//   WoW          = last 7 days vs the prior 7 days (delta + percent change)
// Adults come from adult_count; jacks are pooled from the dataset's jack_count column.
// Returns null (never throws) when the river is unmapped or the feed has no rows.
// Returns { stocks: { bucket -> counts }, lastUpdated } where lastUpdated is the
// MAX Socrata system column :updated_at across the rows (WDFW's own publish time,
// never a client guess) — null when the feed does not expose it.
export async function fetchEscapementLive(siteId) {
    var facilities = escapementFacilities[siteId ? String(siteId) : ''];
    if (!facilities || !facilities.length) return null;

    var year = new Date().getFullYear();
    var quoted = facilities.map(function(f) { return "'" + f + "'"; }).join(',');
    var where = "event='" + ESCAPEMENT_EVENT + "' AND facility in(" + quoted + ")" +
        " AND date >= '" + (year - 5) + "-01-01T00:00:00.000'";
    var url = ESCAPEMENT_SOCRATA +
        '?$select=date,species,run,sum(adult_count) AS adults,sum(jack_count) AS jacks,max(:updated_at) AS lastUpdated' +
        '&$group=date,species,run' +
        '&$where=' + encodeURIComponent(where) +
        '&$order=date DESC&$limit=5000';

    var res = await fetch(url, { cache: 'no-store' });
    var rows = await res.json();
    if (!rows || !rows.length) return null;

    var today = new Date();
    var DAY = 86400000;
    var acc = {};   // display bucket -> { days: { 'YYYY-MM-DD': adultSum } }
    var jacc = {};  // pooled jacks across every species and run
    var lastUpdated = null; // MAX :updated_at across every returned row
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var stamp = r.lastUpdated;
        if (stamp && (!lastUpdated || String(stamp) > lastUpdated)) lastUpdated = String(stamp);
        var key = String(r.date || '').slice(0, 10);
        if (!key) continue;
        var bucket = escBucketName(r.species, r.run);
        var a = parseFloat(r.adults) || 0;
        var j = parseFloat(r.jacks) || 0;
        if (!acc[bucket]) acc[bucket] = { days: {} };
        acc[bucket].days[key] = (acc[bucket].days[key] || 0) + a;
        jacc[key] = (jacc[key] || 0) + j;
    }
    acc['Jacks'] = { days: jacc };

    var out = {};
    Object.keys(acc).forEach(function(sp) {
        var days = acc[sp].days;
        var keys = Object.keys(days);
        if (!keys.length) return;

        // Freshest trap date anchors the WoW windows so WDFW reporting lag can't skew it.
        var latestKey = keys[0];
        keys.forEach(function(k) { if (k > latestKey) latestKey = k; });
        var maxT = new Date(latestKey + 'T00:00:00').getTime();
        var anchorYear = parseInt(latestKey.slice(0, 4), 10);

        var total = 0, cur = 0, prev = 0, byYear = {};
        keys.forEach(function(k) {
            var n = days[k];
            if (parseInt(k.slice(0, 4), 10) === anchorYear) total += n;
            var t = new Date(k + 'T00:00:00').getTime();
            // Week-over-Week: [max-6 .. max] vs [max-13 .. max-7]
            if (t > maxT - 6 * DAY && t <= maxT) cur += n;
            else if (t > maxT - 13 * DAY && t <= maxT - 7 * DAY) prev += n;
            // 5-yr average over the same calendar window (month/day <= today)
            var d = new Date(k + 'T00:00:00');
            var y = d.getFullYear();
            if (y < year && y >= year - 5) {
                if (d.getMonth() < today.getMonth() ||
                    (d.getMonth() === today.getMonth() && d.getDate() <= today.getDate())) {
                    byYear[y] = (byYear[y] || 0) + n;
                }
            }
        });

        var delta = cur - prev;
        var pct = (prev > 0) ? Math.round((delta / prev) * 100) : null;
        var avg = null, ys = Object.keys(byYear);
        if (ys.length) {
            var sum = 0;
            ys.forEach(function(y) { sum += byYear[y]; });
            avg = Math.round(sum / ys.length);
        }
        out[sp] = {
            totalReturn: total,
            trapCount: days[latestKey] || 0,
            fiveYrAvg: avg,
            wow: { delta: delta, pct: pct, cur: cur, prior: prev }
        };
    });
    return { stocks: out, lastUpdated: lastUpdated };
}

// Merge live numbers onto the static registry. Species matching is exact first, then by
// base species, so a 'Chinook' card also picks up legacy 'Fall Chinook' buckets. Never
// throws - any failure leaves the existing "--" placeholders in place so the UI stays
// stable. Also stashes rec.lastUpdated (WDFW's max :updated_at) for the counts fold.
export async function loadEscapementData(siteId) {
    var key = siteId ? String(siteId) : '';
    var rec = hatcheryEscapement[key];
    if (!rec) return null;
    try {
        var live = await fetchEscapementLive(key);
        if (live && live.stocks) {
            // G2 (Phase 2.4): cache the last-known live numbers so the run cards
            // keep real figures in a dead zone instead of reverting to "--".
            try {
                localStorage.setItem('esc_snapshot_' + key,
                    JSON.stringify({ stocks: live.stocks, lastUpdated: live.lastUpdated || null, ts: Date.now() }));
            } catch (e) { /* quota / private mode — non-fatal */ }
        }
    } catch(e) {
        // Offline fallback (G2): serve the cached snapshot, honestly stale.
        var cached = null;
        try { cached = JSON.parse(localStorage.getItem('esc_snapshot_' + key) || 'null'); } catch (e2) { cached = null; }
        if (cached && cached.stocks) {
            live = { stocks: cached.stocks, lastUpdated: cached.lastUpdated || null };
            logDebug("Escapement feed unavailable - using cached snapshot for " + key, "ERR");
        } else {
            logDebug("Escapement feed unavailable, keeping -- placeholders: " + e.message, "ERR");
        }
    }
    if (live && live.stocks) {
        rec.stocks.forEach(function(st) {
            var want = String(st.name).toLowerCase();
            var base = want.replace(/^(fall|spring|summer|winter)\s+/, '');
            var hit = null;
            Object.keys(live.stocks).forEach(function(sp) {
                var l = sp.toLowerCase().replace(/^(fall|spring|summer|winter)\s+/, '');
                if (!hit && (sp.toLowerCase() === want || l === base)) hit = live.stocks[sp];
            });
            if (hit) {
                st.totalReturn = hit.totalReturn;
                st.trapCount = hit.trapCount;
                st.fiveYrAvg = hit.fiveYrAvg;
                st.wow = hit.wow;
            }
        });
        rec.lastUpdated = live.lastUpdated || null;
        logDebug("Escapement synced for " + key, "NET");
    }
    return rec;
}

// WDFW annual run forecasts (src/data/wdfw_forecasts.json). Loaded statically
// and merged onto the per-species count cards exactly like the escapement feed:
// values are ONLY the human-confirmed numbers written by
// refresh_wdfw_forecast.py --confirm --chinook=/--coho= (never fabricated).
// To fetch the latest forecast JSON, use wdfw_forecasts.json directly.
// Until a real number exists the UI keeps its "--" placeholder.
// actId = active USGS gauge ID (site_id) — used to filter forecasts to the
// active waterbody so Green River doesn't show Puyallup's numbers.
export async function refreshWdfwForecast(actId) {
    var cell = document.querySelector('[data-count="wdfw"]');
    if (!cell) return;
    if (!actId) return;
    try {
        // Build gauge → waterbody reverse lookup from the region registry
        // so we know which waterbody the active station belongs to.
        var wb = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.waterbodies;
        if (!wb) return;
        var gaugeToWb = {};
        wb.forEach(function (w) {
            if (w.gauge && w.gauge.site_id) {
                gaugeToWb[String(w.gauge.site_id)] = String(w.id);
            }
            // Also map related gauges (upstream/downstream, same river system)
            if (w.related_gauges) {
                w.related_gauges.forEach(function (rg) {
                    if (rg.site_id) {
                        gaugeToWb[String(rg.site_id)] = String(w.id);
                    }
                });
            }
        });
        var wbId = gaugeToWb[String(actId)];
        if (!wbId) return;  // No matching waterbody → never leak forecasts

        var res = await fetch('/src/data/wdfw_forecasts.json', { cache: 'no-store' });
        var data = await res.json();
        if (!data || !data.waterbodies) return;
        // Look up the active waterbody's stocks directly — the JSON is keyed
        // by waterbody id (e.g. "puyallup", "green"), so no cross-river leak.
        var wbEntry = data.waterbodies[wbId];
        if (!wbEntry || !wbEntry.stocks) return;
        var bySp = {};
        wbEntry.stocks.forEach(function (st) {
            if (!st.species) return;
            bySp[st.species.toLowerCase()] = st.forecast;
        });
        if (!Object.keys(bySp).length) return;
        document.querySelectorAll('.run-card[data-species]').forEach(function (card) {
            var sp = card.getAttribute('data-species');
            if (!sp) return;
            var val = bySp[sp];
            var out = (val === null || val === undefined || isNaN(val)) ? '--' : Number(val).toLocaleString('en-US');
            var target = card.querySelector('[data-count="wdfw"]');
            if (target) target.textContent = out;
        });
        logDebug('WDFW forecast applied from wdfw_forecasts.json', 'NET');
    } catch (e) {
        logDebug('WDFW forecast unavailable, keeping "--": ' + e.message, 'ERR');
    }
}

// Re-paint the escapement counts inside the merged [ RUN & TIMING ] per-species
// cards once the live numbers land. Each count row carries data-count (wdfw /
// return / trap / avg) inside a card carrying data-species, so we fill only the
// matching cells — never replace the whole section (the species/status/progress
// geometry stays put). Rivers with no facility mapping keep their "--" placeholders.
export async function refreshEscapement(siteId) {
    var key = siteId ? String(siteId) : '';
    if (!hatcheryEscapement[key]) return;
    await loadEscapementData(key);
    var rec = hatcheryEscapement[key];
    document.querySelectorAll('.run-card[data-species]').forEach(function(card) {
        var sp = card.getAttribute('data-species');
        if (!sp) return;
        var hit = null;
        for (var i = 0; i < rec.stocks.length; i++) {
            if (String(rec.stocks[i].name || '').toLowerCase() === sp) { hit = rec.stocks[i]; break; }
        }
        if (!hit) return;
        var set = function(countKey, val) {
            var cell = card.querySelector('[data-count="' + countKey + '"]');
            if (cell) cell.textContent = (val === null || val === undefined || isNaN(val)) ? '--' : Number(val).toLocaleString('en-US');
        };
        set('return', hit.totalReturn);
        set('trap', hit.trapCount);
        set('avg', hit.fiveYrAvg);
    });
    // Freshness stamp under each counts fold: WDFW's max :updated_at in LOCAL time,
    // or the honest fallback wording when the feed exposed no stamp.
    document.querySelectorAll('.run-card [data-esc-updated]').forEach(function(el) {
        el.textContent = formatEscapementUpdated(rec.lastUpdated);
    });
}
// ============================================================================
// StreamStats basin characteristics (Phase 1.9) — live delineation with an
// offline fallback served by api/streamstats.py. Every metric arrives in the
// { value, source, uncertainty } provenance shape, so the caller can always
// tell a live USGS delineation from an offline estimate.
// ============================================================================
// public: fetchStreamStats(lat, lon, siteId) -> { ok, mode, drainage_area_sq_mi,
//   mean_elevation_ft, mean_precip_in } | null on hard failure.

export async function fetchStreamStats(lat, lon, siteId) {
    var query = '/api/streamstats?lat=' + encodeURIComponent(String(lat)) +
                '&lon=' + encodeURIComponent(String(lon));
    if (siteId) query += '&site_id=' + encodeURIComponent(String(siteId));
    try {
        var res = await apiGetJson(query, { label: 'streamstats' });
        if (res && res.ok && res.data && res.data.ok === true) {
            return res.data;   // { mode: 'live'|'offline', ...provenance }
        }
    } catch (e) { /* fall through */ }
    // The endpoint is unreachable entirely (no offline cache for this): the
    // caller degrades to whatever it has — never invent a figure here.
    return null;
}

