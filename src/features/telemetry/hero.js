/**
 * src/features/telemetry/hero.js - the plain-English FISHING OUTLOOK hero and
 * the per-species RUN & TIMING cards. Values come from the real report only
 * (never fabricated); absent data folds to "--".
 * public: buildFishingHero(rep), buildSpeciesCalendarHtml(calendar, escStocks)
 * ES module.
 */
// Plain-English "hero" for the water card. Replaces the opaque 0-100 Movement
// Index + % timeline: a single-line compact strip — verdict · best window · why.
// Everything is derived from the same real triggers (rain freshet, pressure
// trend, tide highs, moon phase, transit state, netting) — never fabricated.
export function buildFishingHero(rep) {
    if (!rep) return '';
    var score = 0;
    var reasons = [];
    var any = false;

    // Thermal RUN status (WRIA 9 / King County thresholds - docs/LITERATURE.md SS8). A
    // tidal-reach river at/above the 21-22C migration-block range stalls the run: adults
    // stage in the cool salt wedge and stop pushing upstream, so "are they even here?".
    // Own-gauge probe only - a missing reading makes NO claim. This is a RUN signal, not
    // the strike zone. 21C = 69.8F, 22C = 71.6F. Ordered first: a blocked run beats a freshet.
    if (provVal(rep.water_temp_f) !== null && provVal(rep.water_temp_f) !== undefined && !isNaN(Number(provVal(rep.water_temp_f)))) {
        var wtF = Number(provVal(rep.water_temp_f));
        var wtC = (wtF - 32) * 5 / 9;
        if (wtC >= 22) { any = true; score -= 14; reasons.push('Lethal water (' + Math.round(wtF) + 'F) - the run has stalled'); }
        else if (wtC >= 21) { any = true; score -= 9; reasons.push('Migration-block range (' + Math.round(wtF) + 'F) - fish are holding'); }
    }

    if (provVal(rep.rain) !== null && provVal(rep.rain) !== undefined && provVal(rep.rain) > 0.05) {
        any = true; score += 12;
        reasons.push('Rain freshet (' + provVal(rep.rain).toFixed(2) + ' in)');
    }
    if (rep.press_delta !== null && rep.press_delta !== undefined && rep.press_delta < -0.04) {
        any = true; score += 10;
        reasons.push('Pressure dropping');
    } else if (rep.press_delta !== null && rep.press_delta !== undefined && rep.press_delta > 0.04) {
        any = true; score -= 6;
        reasons.push('High pressure settling in');
    }
    if (provVal(rep.tide_curve) && provVal(rep.tide_curve).length) {
        var highs = provVal(rep.tide_curve).filter(function (t) { return t.type === 'H'; });
        if (highs.length) {
            any = true; score += Math.min(10, highs.length * 5);
            reasons.push(highs.length + ' high tide' + (highs.length > 1 ? 's' : '') + ' today');
        }
    }
    if (rep.lunar_icon && (rep.lunar_icon.indexOf('New') !== -1 || rep.lunar_icon.indexOf('Full') !== -1)) {
        any = true; score += 5;
        reasons.push(rep.lunar_icon.replace(/^[^\s]+\s*/, '') + ' swing');
    }
    if (rep.transit_state && rep.transit_state !== '--') {
        any = true;
        if (rep.transit_state.indexOf('High Velocity') !== -1) { score += 8; reasons.push('Water moving fast'); }
        else if (rep.transit_state.indexOf('Bay Staging') !== -1) { score += 4; reasons.push('Fish staging'); }
        else if (rep.transit_state.indexOf('CORKED') !== -1) { score -= 25; reasons.push('River corked (nets in)'); }
    }
    if (rep.is_netting) { score -= 15; reasons.push('Netting day (Sun/Mon/Tue)'); }
    if (rep.clarity_outlook) { any = true; reasons.push(rep.clarity_outlook); }

    var verdict, vColor;
    if (!any) {
        verdict = 'Live conditions unavailable';
        vColor = 'var(--text-muted)';
    } else if (score >= 20) {
        verdict = '\uD83D\uDC4D Good day to fish'; vColor = 'var(--accent-green)';
    } else if (score >= 0) {
        verdict = '\u26A0\uFE0F Mixed conditions'; vColor = 'var(--accent-yellow)';
    } else {
        verdict = '\uD83D\uDC4E Tough conditions'; vColor = 'var(--accent-red)';
    }

    // Best window: the server already computes rep.windows with start/end + trigger.
    var best = null;
    if (rep.windows && rep.windows.length) {
        for (var w = 0; w < rep.windows.length; w++) {
            if (!best || rep.windows[w].score > best.score) best = rep.windows[w];
        }
    }
    var peakTxt = '';
    if (best) {
        var pCol = getFMIColor(best.score);
        peakTxt = '<span class="hero-peak-time" style="color:' + pCol + ';">Best ' + best.start_str + ' \u2013 ' + best.end_str + '</span>';
    }

    // Join reasons into the strip (cap at 2 so the centred line never wraps on a
    // phone; the reasons are ordered by importance above).
    var whyTxt = reasons.slice(0, 2).map(function (r) { return '<span class="hero-why-bit">' + r + '</span>'; }).join('<span class="hero-sep">\u00B7</span>');

    return '<div class="fishing-hero">' +
        '<div class="hero-line">' +
          '<span class="hero-verdict" style="color:' + vColor + ';">' + verdict + '</span>' +
          (peakTxt ? '<span class="hero-sep">\u00B7</span>' + peakTxt : '') +
          (whyTxt ? '<span class="hero-sep">\u00B7</span>' + whyTxt : '') +
        '</div>' +
        '</div>';
}

// Per-species run card in the [ RUN & TIMING ] panel: status pill + window
// progress bar + peak line ALWAYS visible; the raw counts (WDFW forecast /
// Return / Trap / 5-Yr Avg) fold behind a <details> per card so "status stays,
// numbers fold". escStocks is the water.js hatchery registry (may be absent => "--").
export function buildSpeciesCalendarHtml(calendar, escStocks) {
    if (!calendar || !calendar.length) return '';
    var html = '<div class="run-timing-cards">';
    for (var i = 0; i < calendar.length; i++) {
        var s = calendar[i];
        var statusClass = 'spc-' + (s.position || 'off');
        var prog = (typeof s.progress === 'number') ? Math.max(0, Math.min(1, s.progress)) : 0;
        var peakFrac = (typeof s.peak_frac === 'number') ? Math.max(0, Math.min(1, s.peak_frac)) : 0.5;
        var fillPct = (prog * 100).toFixed(1);
        var peakLeft = (peakFrac * 100).toFixed(1);
        // Species-safe key for count folding: match hatchery registry by exact
        // species name (Chinook/Coho/Pink vs the registry's Chinook/Coho/Jacks).
        var escKey = String(s.species || '').toLowerCase();
        var esc = null;
        if (escStocks && escStocks.stocks) {
            for (var e = 0; e < escStocks.stocks.length; e++) {
                if (String(escStocks.stocks[e].name || '').toLowerCase() === escKey) { esc = escStocks.stocks[e]; break; }
            }
        }
        var wdfwForecast = null; // filled by 2.1d from src/data/wdfw_forecasts.json
        var countVal = function (v) { return (v === null || v === undefined || isNaN(v)) ? '--' : Number(v).toLocaleString('en-US'); };
        var escName = esc ? esc.name : (s.species || '');
        var escNameEsc = String(escName).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });

        html += '<div class="run-card ' + statusClass + '" data-species="' + escKey + '">' +
            '<div class="run-card-hdr">' +
                '<span class="spc-name">' + escNameEsc + '</span>' +
                '<span class="run-status-pill">' + (s.status_text || '') + '</span>' +
            '</div>' +
            '<div class="run-track" role="img" aria-label="Run window">' +
                '<span class="run-fill" style="width:' + fillPct + '%;"></span>' +
                '<span class="run-peak" style="left:' + peakLeft + '%;"></span>' +
            '</div>' +
            '<div class="run-track-lbl">' +
                '<span class="run-lbl-start">' + (s.window_start || '') + '</span>' +
                '<span class="run-lbl-peak">Peak ' + (s.peak_date || '') + '</span>' +
                '<span class="run-lbl-end">' + (s.window_end || '') + '</span>' +
            '</div>' +
            '<details class="run-counts">' +
                '<summary>Forecast &amp; Hatchery Report</summary>' +
                '<div class="run-counts-grid">' +
                    '<div class="esc-row esc-row-forecast"><span class="esc-row-lbl">Forecast</span><span class="esc-row-val" data-count="wdfw">' + countVal(wdfwForecast) + '</span></div>' +
                    '<div class="esc-row"><span class="esc-row-lbl">Returned</span><span class="esc-row-val" data-count="return">' + (esc ? countVal(esc.totalReturn) : '--') + '</span></div>' +
                    '<div class="esc-row"><span class="esc-row-lbl">Trapped</span><span class="esc-row-val" data-count="trap">' + (esc ? countVal(esc.trapCount) : '--') + '</span></div>' +
                    '<div class="esc-row"><span class="esc-row-lbl">5-Yr Avg</span><span class="esc-row-val" data-count="avg">' + (esc ? countVal(esc.fiveYrAvg) : '--') + '</span></div>' +
                '</div>' +
                // Honest freshness stamp: refreshEscapement rewrites this with the
                // Socrata max(:updated_at) in LOCAL time, or leaves the fallback.
                '<div class="run-counts-updated" data-esc-updated>' + ESCAPEMENT_UPDATED_FALLBACK + '</div>' +
            '</details>' +
        '</div>';
    }
    html += '</div>';
    return html;
}
