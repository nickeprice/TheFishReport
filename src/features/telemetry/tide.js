/**
 * src/features/telemetry/tide.js - tide row + tide curve rendering.
 * public: getFMIColor(), tideHourOf(), formatTideRow(), tideCurveSvg()
 * ES module.
 */
// --- WATER REPORT LOGIC ---
export function getFMIColor(score) {
    const s = Math.max(0, Math.min(100, parseFloat(score)));
    if (s <= 50) {
        var pct = s / 50.0;
        return "rgb(255, " + Math.round(69 + pct*(214-69)) + ", " + Math.round(58 + pct*(10-58)) + ")";
    } else {
        pct = (s - 50) / 50.0;
        return "rgb(" + Math.round(255 + pct*(48-255)) + ", " + Math.round(214 + pct*(209-214)) + ", " + Math.round(10 + pct*(88-10)) + ")";
    }
}

// Parse a 12-hour display time ("4:15 AM") back into decimal hours for chart
// x-placement. Falls back to parsing "HH:MM" for defensive compatibility.
export function tideHourOf(label) {
    const m = String(label || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
    if (!m) return 0;
    let h = parseInt(m[1], 10) % 12;
    if (/pm/i.test(m[3] || '')) h += 12;
    return h + parseInt(m[2], 10) / 60;
}

export function formatTideRow(tideStr, tideCurve, tidePoints) {
    if (!tideStr || tideStr.indexOf('Syncing') !== -1) {
        // Keep the curve beside the pills so there is never an orphaned
        // "TIDE CURVE" section anywhere else on the card.
        const curveHtml = tideCurveSvg(tidePoints, tideCurve);
        return '<div class="env-tide-row">' +
            '<span class="tide-empty">' + (tideStr || 'Tide Data Syncing...') + '</span>' +
            (curveHtml ? '<div class="tide-curve-wrap">' + curveHtml + '</div>' : '') +
            '</div>';
    }
    const items = tideStr.split(' | ');
    let html = '<div class="env-tide-row"><div class="tide-pills">';
    for (let k = 0; k < items.length; k++) {
        const item = items[k].trim();
        const match = item.match(/^(High|Low):\s*([0-9:AMP\s]+)\s*\(([0-9.-]+\s*ft)\)/i);
        if (match) {
            const type = match[1].toUpperCase();
            const time = match[2].trim();
            const height = match[3].trim();
            html += '<div class="tide-pill">' +
                '<span class="tide-type">' + type + '</span>' +
                '<span class="tide-time">' + time + '</span>' +
                '<span class="tide-level">(' + height + ')</span>' +
            '</div>';
        } else {
            html += '<div class="tide-pill"><span class="tide-time" style="color: #64d2ff;">' + item + '</span></div>';
        }
    }
    html += '</div>';
    // The tide curve rides inside the same panel, right beside the pills.
    html += '<div class="tide-curve-wrap">' + tideCurveSvg(tidePoints, tideCurve) + '</div>' +
        '</div>';
    return html;
}

// Smooth full-height tide area chart. Draws the day's REAL hourly NOAA curve
// (tidePoints) with light Catmull-Rom smoothing, fills the area under it with a
// subtle gradient, and labels ONLY the high/low extremes (tideCurve) with dots +
// compact 12-hour times. Falls back to the old 4-point zigzag if no hourly
// data arrived (e.g. offline cached payload).
export function tideCurveSvg(points, extremes) {
    const smooth = points && points.length > 1;
    const src = smooth ? points : (extremes || []);
    if (!src || !src.length) return '';
    const W = 320, H = 96, padX = 12, padY = 18;
    const hrs = src.map(function (p) { return tideHourOf(p.t); });
    const hs = src.map(function (p) { return Number(p.h); });
    let minH = Math.min.apply(null, hs), maxH = Math.max.apply(null, hs);
    let spanH = (maxH - minH) || 1;
    // Pad the vertical range so labels don't clip at the top/bottom edges.
    minH -= spanH * 0.18; maxH += spanH * 0.18; spanH = (maxH - minH) || 1;

    function X(t) { return padX + (t / 23) * (W - 2 * padX); }
    function Y(h) { return H - padY - ((h - minH) / spanH) * (H - 2 * padY); }

    let lineD;
    if (smooth) {
        // Catmull-Rom -> cubic bezier path through every hourly point.
        const P = src.map(function (p, i) { return { x: X(hrs[i]), y: Y(Number(p.h)) }; });
        lineD = 'M' + P[0].x.toFixed(1) + ',' + P[0].y.toFixed(1);
        for (let j = 0; j < P.length - 1; j++) {
            const p0 = P[j - 1] || P[j], p1 = P[j], p2 = P[j + 1], p3 = P[j + 2] || p2;
            lineD += ' C' + (p1.x + (p2.x - p0.x) / 6).toFixed(1) + ',' + (p1.y + (p2.y - p0.y) / 6).toFixed(1) +
                ' ' + (p2.x - (p3.x - p1.x) / 6).toFixed(1) + ',' + (p2.y - (p3.y - p1.y) / 6).toFixed(1) +
                ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
        }
    } else {
        lineD = 'M' + src.map(function (p, i) { return X(hrs[i]).toFixed(1) + ',' + Y(Number(p.h)).toFixed(1); }).join(' L');
    }

    const areaD = lineD + ' L' + (W - padX).toFixed(1) + ',' + (H - padY).toFixed(1) +
        ' L' + padX.toFixed(1) + ',' + (H - padY).toFixed(1) + ' Z';

    // Label ONLY the extremes (highs above the dot, lows below) so the labels
    // never collide into the dense 9px mess the old version had.
    let labels = '';
    if (extremes && extremes.length) {
        for (let k = 0; k < extremes.length; k++) {
            const e = extremes[k];
            const cx = X(tideHourOf(e.t)), cy = Y(Number(e.h));
            const up = (e.type === 'H');
            labels += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.2" class="tide-ext-dot" />' +
                '<text x="' + cx.toFixed(1) + '" y="' + (up ? cy - 7 : cy + 14).toFixed(1) + '" text-anchor="middle" class="tide-ext-label">' +
                (e.t || '') + ' · ' + (up ? 'H' : 'L') + ' ' + Number(e.h).toFixed(1) + 'ft</text>';
        }
    }

    return '<svg viewBox="0 0 ' + W + ' ' + (H + 8) + '" class="tide-svg" role="img" aria-label="Tide curve for the day">' +
        '<defs><linearGradient id="tide-grad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#64d2ff" stop-opacity="0.45"/>' +
        '<stop offset="1" stop-color="#64d2ff" stop-opacity="0"/>' +
        '</linearGradient></defs>' +
        '<path d="' + areaD + '" class="tide-area" />' +
        '<path d="' + lineD + '" class="tide-line" fill="none" />' +
        '<line x1="' + padX + '" y1="' + (H - padY).toFixed(1) + '" x2="' + (W - padX) + '" y2="' + (H - padY).toFixed(1) + '" class="tide-baseline" />' +
        labels + '</svg>';
}
