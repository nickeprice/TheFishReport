/**
 * src/features/telemetry/daynav.js - forecast-day navigation + empty state.
 * public: activeDateOffset, reportsData, stepDate(), updateActiveDateUI(),
 *         renderWaterReportEmptyState(), legalHoursLabel()
 * ES module.
 */
import { logDebug } from '../../shared/debug.js';
import { calculateSolarHours } from '../../utils/regulations.js';
import { refreshZonePreview } from '../gear-sim/zone-core.js';
import { applyReportWeather } from '../../services/water.js';
import { State } from '../../shared/state.js';
import { checkRiverStatus } from '../../utils/regulations.js';

// Resolve legal-hours rule from the local REGIONS registry as a fallback
// when the API returns "unknown" or is unreachable.
function _resolveLocalLegalRule(riverId) {
    var wbs = window.REGIONS && window.REGIONS.WA && window.REGIONS.WA.waterbodies;
    if (!wbs || !riverId) return 'daylight';
    var riverPart = riverId.split(',')[0].split(' at ')[0].split(' near ')[0].trim().toLowerCase();
    for (var i = 0; i < wbs.length; i++) {
        if (wbs[i].name && wbs[i].name.toLowerCase().indexOf(riverPart) >= 0) {
            return wbs[i].legal_hours || 'daylight';
        }
    }
    return 'daylight';
}

export function stepDate(delta) {
    const ao = window.activeDateOffset || 0;
    const newOffset = ao + delta;
    if (newOffset < 0) return;
    const rd = window.reportsData || [];
    const maxOffset = rd.length > 0 ? rd.length - 1 : 14;
    if (newOffset > maxOffset) return;
    window.activeDateOffset = newOffset;
    updateActiveDateUI();
}

// Legal-hours resolution: the backend Open-Meteo payload is the single source of
// truth whenever the telemetry API is reachable. The local NOAA/Meeus
// calculation is the offline fallback only, so the hero and the day cards
// can never disagree by 1-3 min on a fresh load.
/**
 * The one-line legal-hours label for the hero (UPDATE 3.0 Phase 1.5).
 * Pure so it is directly testable - and so the rule -> wording mapping lives in
 * exactly one place:
 *   'daylight'         -> "Legal Hours: 6:30 AM - 8:00 PM"
 *   '24hr'             -> "Legal Hours: Open all day"
 *   'custom'/'unknown' -> "Legal Hours: not verified - check the regulations"
 */
export function legalHoursLabel(rule, legalIn, legalOut) {
    if (rule === '24hr') return 'Legal Hours: Open all day';
    if (rule === 'closed') return 'Legal Hours: River closed \u2014 no fishing';
    if (rule !== 'daylight') return 'Legal Hours: not verified \u2014 check the regulations';
    if (legalIn === '--:--' || legalOut === '--:--') return 'Legal Hours: not verified \u2014 check the regulations';
    return 'Legal Hours: ' + legalIn + ' \u2013 ' + legalOut;
}


export function updateActiveDateUI() {
    // Read shared state from window.* (not from imported bindings) to avoid
    // stale references after Vite bundling flattens module scopes.
    const ao = window.activeDateOffset || 0;
    const rd = window.reportsData || [];

    const d = new Date();
    d.setDate(d.getDate() + ao);

    // 1. Centered Date Display: e.g. "Monday, September 14"
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    const dateStr = d.toLocaleDateString('en-US', options);
    const dateEl = document.getElementById('date-nav-text');
    if (dateEl) dateEl.innerText = dateStr;

    // Subtle (Today) badge if matches current calendar day
    const now = new Date();
    const isToday = (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    );
    const badgeEl = document.getElementById('date-today-badge');
    if (badgeEl) badgeEl.style.display = isToday ? 'inline' : 'none';

    // Prev/Next button states
    const prevBtn = document.getElementById('btn-prev-date');
    if (prevBtn) {
        if (ao <= 0) {
            prevBtn.classList.add('disabled');
            prevBtn.disabled = true;
        } else {
            prevBtn.classList.remove('disabled');
            prevBtn.disabled = false;
        }
    }
    const nextBtn = document.getElementById('btn-next-date');
    if (nextBtn) {
        const maxOffset = rd.length > 0 ? rd.length - 1 : 14;
        if (ao >= maxOffset) {
            nextBtn.classList.add('disabled');
            nextBtn.disabled = true;
        } else {
            nextBtn.classList.remove('disabled');
            nextBtn.disabled = false;
        }
    }

    // 2. Resolve Active Station & GPS
    let activeStation = null;
    try {
        const sStr = localStorage.getItem('active_station');
        if (sStr) activeStation = JSON.parse(sStr);
    } catch(e) {}
    const riverId = activeStation ? activeStation.id : "12101500";
    const riverName = (activeStation && activeStation.name) ? activeStation.name : 'Puyallup River';
    const gpsCoords = (activeStation && activeStation.isGps) ? { lat: activeStation.lat, lon: activeStation.lon } : (State.userGPSCoords || null);

    // 3. Dynamic Regulations Engine Evaluation
    if (typeof checkRiverStatus === 'function') {
        // New engine signature: checkRiverStatus(date, gpsCoords, activeRiverName) -> ruled by src/utils/regulations.js.
        const reg = checkRiverStatus(d, gpsCoords, riverName);
        const pill = document.getElementById('river-status-pill');
        if (pill) {
            // Plain pill: just OPEN / CLOSED. No reason or zone-detail text on the
            // pill itself — the title attr keeps the full rule detail for assistive tech.
            pill.innerText = (reg && reg.isOpen ? '● RIVER OPEN' : '● RIVER CLOSED');
            pill.className = 'reg-status-pill ' + (reg && reg.isOpen ? 'status-pill-open' : 'status-pill-closed');
            pill.title = (reg && reg.ruleDetail) ? String(reg.ruleDetail) : 'WDFW regulation status for ' + riverName;
        }
        const regDetail = document.getElementById('reg-detail');
        if (regDetail) {
            regDetail.innerHTML = '';
        }
    }

    // 4. Dynamic Solar / Legal Hours Calculation
    const stLat = activeStation ? activeStation.lat : 47.1950;
    const stLon = activeStation ? activeStation.lon : -122.3020;
    const rep = (ao >= 0 && ao < rd.length) ? rd[ao] : null;
    let legalIn = "--:--", legalOut = "--:--";

    // Resolve legal-hours rule: prefer API response, then local REGIONS registry, default daylight
    const legalRule = (rep && rep.legal_hours && rep.legal_hours !== 'unknown')
        ? rep.legal_hours
        : _resolveLocalLegalRule(riverId);

    // Primary: backend legal window (already computed from the registry rule).
    if (rep && rep.lines_in && rep.lines_out && !rep.api_offline) {
    if (rep && rep.lines_in && rep.lines_out && !rep.api_offline) {
        legalIn = rep.lines_in;
        legalOut = rep.lines_out;
    } else if (legalRule === 'daylight' && typeof calculateSolarHours === 'function') {
        // Offline fallback: local approximation for the active station coords.
        const solar = calculateSolarHours(d, stLat, stLon);
        if (solar && solar.lines_in && solar.lines_out && solar.lines_in !== '--') {
            legalIn = solar.lines_in;
            legalOut = solar.lines_out;
        } else if (rep && rep.lines_in && rep.lines_out) {
            // Last resort: stale backend payload (better than "--:--").
            legalIn = rep.lines_in;
            legalOut = rep.lines_out;
        }
    } else if (rep && rep.lines_in && rep.lines_out) {
        legalIn = rep.lines_in;
        legalOut = rep.lines_out;
    }

    const heroHours = document.getElementById('hero-legal-hours');
    if (heroHours) {
        heroHours.innerText = legalHoursLabel(legalRule, legalIn, legalOut);
    }

    // 5. Toggle active day card
    const cards = document.getElementsByClassName('day-card');
    for (let i = 0; i < cards.length; i++) {
        cards[i].style.display = 'none';
    }
    if (rep) {
        const targetCard = document.getElementById(rep.id);
        if (targetCard) targetCard.style.display = 'block';
    }

    // Keep the Gear Sim strike zone in step with the day being viewed
    if (typeof refreshZonePreview === 'function') refreshZonePreview();

    // WS-4: the day's own weather (temp / wind / precip / cloud pills) is painted for THIS
    // day's card only, so cycling the days actually changes what the pills say.
    if (rep && typeof applyReportWeather === 'function') applyReportWeather(rep);
}

/**
 * Water Report empty / failure state. Rendered when the API returns no day
 * cards or throws, so the tab is never a blank black screen.
 *
 * @param {string} title    headline for the state
 * @param {string} hint     what the angler can do about it
 * @param {boolean} offline whether the failure was a network failure
 */
export function renderWaterReportEmptyState(title, hint, offline) {
    const box = document.getElementById('water-report-cards');
    if (!box) return;
    box.innerHTML = '<div class="empty-state empty-state-panel">' +
        '<div class="empty-state-icon">' + (offline ? '📡' : '🌊') + '</div>' +
        '<div class="empty-state-title">' + title + '</div>' +
        '<div class="empty-state-hint">' + hint + '</div>' +
        '<button class="btn-main" onclick="loadWaterReport()" style="margin-top:14px;">RETRY</button>' +
        '</div>';
    logDebug('Water report empty state: ' + title, 'UI');
}
window.stepDate = stepDate;
