/**
 * src/app.js - The Fish Report BOOTSTRAP.
 *
 * ES module entry point. Imports every public symbol it needs.
 * Loaded LAST (via <script type="module" src="/src/app.js"> in Phase V3).
 * For now, all dependencies are available via window.* shims.
 */
import { logDebug } from './shared/debug.js';
import { showToast } from './shared/ui.js';
import { switchTab } from './shared/nav.js';
import { restoreRig } from './features/gear-sim/rig.js';
import { loadPresets } from './features/gear-sim/presets.js';
import { registerServiceWorker, applyTabDeepLink } from './shared/pwa.js';
import { startAutoRefresh } from './shared/refresh.js';
import { getGPS } from './features/gear-sim/inputs.js';
import { initAuth } from './features/auth/auth.js';
import { initCatchReconcile } from './features/catch-log/reconcile.js';
import { setCatchScope, CATCH_SCOPE } from './features/catch-log/board.js';
import { loadWaterReport } from './services/water.js';
import { openWaterTypeGuide } from './features/gear-sim/water-types.js';
import { outboxLoad } from './features/catch-log/outbox.js';
// --- BOOTSTRAP ---
window.onload = async function() {
    // URL param override: ?station=12101500 or ?lat=47.2&lon=-122.3
    var qs = window.location.search;
    function qp(name) {
        var m = qs.match(new RegExp('[?&]' + name + '=([^&]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    }
    var qpStation = qp('station');
    var qpLat = qp('lat');
    var qpLon = qp('lon');
    if (qpStation) {
        localStorage.setItem('active_station', JSON.stringify({ id: qpStation, name: 'URL override', lat: 0, lon: 0, isGps: false }));
        logDebug('Station override from URL: ' + qpStation, 'SYS');
    } else if (qpLat && qpLon) {
        localStorage.setItem('active_station', JSON.stringify({ id: qpLat + ',' + qpLon, name: 'GPS override', lat: parseFloat(qpLat), lon: parseFloat(qpLon), isGps: true }));
        logDebug('GPS override from URL: ' + qpLat + ', ' + qpLon, 'SYS');
    }
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById('log-datetime').value = d.toISOString().slice(0,16);
    // Load the tackle library BEFORE restoring the rig: the line + weight-shape
    // pickers only have options once it lands, and restoreRig() selects into them.
    // (tackle is now loaded statically at build time — no async fetch needed.)
    restoreRig();
    loadPresets();
    applyTabDeepLink();
    registerServiceWorker();
    startAutoRefresh();

    // Load the durable catch outbox BEFORE anything reads it: the board fallback, the
    // gear-sim calibration fallback and the pending-sync flush all read it synchronously.
    try { await outboxLoad(); } catch (e) { logDebug('Outbox load failed: ' + e.message, 'DB'); }

    getGPS();
    initAuth();
    // Flush the outbox when the network returns / the app is resumed (Phase 3.3).
    initCatchReconcile();
    setCatchScope(CATCH_SCOPE);
    // Wire water type guide button (must wait for full DOM + scripts)
    var guideBtn = document.getElementById('wt-guide-btn');
    if (guideBtn) {
        guideBtn.addEventListener('click', openWaterTypeGuide);
        guideBtn.addEventListener('touchend', function (e) { e.preventDefault(); openWaterTypeGuide(); });
    }
    loadWaterReport();
};
