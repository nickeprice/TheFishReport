/**
 * src/features/telemetry/daynav.js - forecast-day navigation + empty state.
 * public: activeDateOffset, reportsData, stepDate(), showDay(),
 *         updateActiveDateUI(), renderWaterReportEmptyState(), legalHoursLabel()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
var activeDateOffset = 0;
var reportsData = [];

function stepDate(delta) {
    var newOffset = activeDateOffset + delta;
    if (newOffset < 0) return;
    var maxOffset = reportsData.length > 0 ? reportsData.length - 1 : 14;
    if (newOffset > maxOffset) return;
    activeDateOffset = newOffset;
    updateActiveDateUI();
}

function showDay(dayId) {
    var cards = document.getElementsByClassName('day-card');
    for(var i = 0; i < cards.length; i++) { cards[i].style.display = 'none'; }
    var target = document.getElementById(dayId);
    if(target) target.style.display = 'block';
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
function legalHoursLabel(rule, legalIn, legalOut) {
    if (rule === '24hr') return 'Legal Hours: Open all day';
    if (rule !== 'daylight') return 'Legal Hours: not verified \u2014 check the regulations';
    return 'Legal Hours: ' + legalIn + ' \u2013 ' + legalOut;
}


function updateActiveDateUI() {
    var d = new Date();
    d.setDate(d.getDate() + activeDateOffset);

    // 1. Centered Date Display: e.g. "Monday, September 14"
    var options = { weekday: 'long', month: 'long', day: 'numeric' };
    var dateStr = d.toLocaleDateString('en-US', options);
    var dateEl = document.getElementById('date-nav-text');
    if (dateEl) dateEl.innerText = dateStr;

    // Subtle (Today) badge if matches current calendar day
    var now = new Date();
    var isToday = (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    );
    var badgeEl = document.getElementById('date-today-badge');
    if (badgeEl) badgeEl.style.display = isToday ? 'inline' : 'none';

    // Prev/Next button states
    var prevBtn = document.getElementById('btn-prev-date');
    if (prevBtn) {
        if (activeDateOffset <= 0) {
            prevBtn.classList.add('disabled');
            prevBtn.disabled = true;
        } else {
            prevBtn.classList.remove('disabled');
            prevBtn.disabled = false;
        }
    }
    var nextBtn = document.getElementById('btn-next-date');
    if (nextBtn) {
        var maxOffset = reportsData.length > 0 ? reportsData.length - 1 : 14;
        if (activeDateOffset >= maxOffset) {
            nextBtn.classList.add('disabled');
            nextBtn.disabled = true;
        } else {
            nextBtn.classList.remove('disabled');
            nextBtn.disabled = false;
        }
    }

    // 2. Resolve Active Station & GPS
    var activeStation = null;
    try {
        var sStr = localStorage.getItem('active_station');
        if (sStr) activeStation = JSON.parse(sStr);
    } catch(e) {}
    var riverId = activeStation ? activeStation.id : "12101500";
    var riverName = (activeStation && activeStation.name) ? activeStation.name : 'Puyallup River';
    var gpsCoords = (activeStation && activeStation.isGps) ? { lat: activeStation.lat, lon: activeStation.lon } : (window.userGPSCoords || null);

    // 3. Dynamic Regulations Engine Evaluation
    if (typeof checkRiverStatus === 'function') {
        // New engine signature: checkRiverStatus(date, gpsCoords, activeRiverName) -> ruled by src/utils/regulations.js.
        var reg = checkRiverStatus(d, gpsCoords, riverName);
        var pill = document.getElementById('river-status-pill');
        if (pill) {
            // Plain pill: just OPEN / CLOSED. No reason or zone-detail text on the
            // pill itself — the title attr keeps the full rule detail for assistive tech.
            pill.innerText = (reg && reg.isOpen ? '● RIVER OPEN' : '● RIVER CLOSED');
            pill.className = 'reg-status-pill ' + (reg && reg.isOpen ? 'status-pill-open' : 'status-pill-closed');
            pill.title = (reg && reg.ruleDetail) ? String(reg.ruleDetail) : 'WDFW regulation status for ' + riverName;
        }
        var regDetail = document.getElementById('reg-detail');
        if (regDetail) {
            regDetail.innerHTML = '';
        }
    }

    // 4. Dynamic Solar / Legal Hours Calculation
    var stLat = activeStation ? activeStation.lat : 47.1950;
    var stLon = activeStation ? activeStation.lon : -122.3020;
    var rep = (activeDateOffset >= 0 && activeDateOffset < reportsData.length) ? reportsData[activeDateOffset] : null;
    var legalIn = "--:--", legalOut = "--:--";
    // The waterbody's hours RULE comes from the region registry. Only a `daylight`
    // river may use the local solar approximation - a 24hr/unknown window is never
    // invented client-side (UPDATE 3.0 Phase 1.5).
    var legalRule = (rep && rep.legal_hours) ? rep.legal_hours : 'daylight';

    // Primary: backend legal window (already computed from the registry rule).
    if (rep && rep.lines_in && rep.lines_out && !rep.api_offline) {
        legalIn = rep.lines_in;
        legalOut = rep.lines_out;
    } else if (legalRule === 'daylight' && typeof calculateSolarHours === 'function') {
        // Offline fallback: local approximation for the active station coords.
        var solar = calculateSolarHours(d, stLat, stLon);
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

    var heroHours = document.getElementById('hero-legal-hours');
    if (heroHours) {
        heroHours.innerText = legalHoursLabel(legalRule, legalIn, legalOut);
    }

    // 5. Toggle active day card
    var cards = document.getElementsByClassName('day-card');
    for (var i = 0; i < cards.length; i++) {
        cards[i].style.display = 'none';
    }
    if (rep) {
        var targetCard = document.getElementById(rep.id);
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
function renderWaterReportEmptyState(title, hint, offline) {
    var box = document.getElementById('water-report-cards');
    if (!box) return;
    box.innerHTML = '<div class="empty-state empty-state-panel">' +
        '<div class="empty-state-icon">' + (offline ? '📡' : '🌊') + '</div>' +
        '<div class="empty-state-title">' + title + '</div>' +
        '<div class="empty-state-hint">' + hint + '</div>' +
        '<button class="btn-main" onclick="loadWaterReport()" style="margin-top:14px;">RETRY</button>' +
        '</div>';
    logDebug('Water report empty state: ' + title, 'UI');
}
