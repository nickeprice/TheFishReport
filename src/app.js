/**
 * src/app.js - The Fish Report BOOTSTRAP.
 *
 * The classic-script monolith was split into modules during UPDATE 3.0 Phase 1.1
 * (2,460 lines -> 24). Everything now lives under src/shared/* and src/features/*
 * (telemetry, gear-sim, catch-log, station, auth). This file owns ONLY the
 * window.onload bootstrap and is still loaded LAST, so every global it calls
 * (restoreRig, registerServiceWorker, ...) is already
 * defined by the scripts loaded above it in index.html.
 */
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
    if (typeof tackleLoad === 'function') {
        try { await tackleLoad(); } catch (e) { logDebug('Tackle load failed: ' + e.message, 'DB'); }
    }
    restoreRig();
    if (typeof loadPresets === 'function') loadPresets();
    applyTabDeepLink();
    registerServiceWorker();
    startAutoRefresh();

    // Load the durable catch outbox BEFORE anything reads it: the board fallback, the
    // gear-sim calibration fallback and the pending-sync flush all read it synchronously.
    if (typeof outboxLoad === 'function') {
        try { await outboxLoad(); } catch (e) { logDebug('Outbox load failed: ' + e.message, 'DB'); }
    }

    getGPS();
    initAuth();
    // Flush the outbox when the network returns / the app is resumed (Phase 3.3).
    if (typeof initCatchReconcile === 'function') initCatchReconcile();
    if (typeof setCatchScope === 'function') setCatchScope(CATCH_SCOPE);
    // Wire water type guide button (must wait for full DOM + scripts)
    var guideBtn = document.getElementById('wt-guide-btn');
    if (guideBtn) {
        guideBtn.addEventListener('click', openWaterTypeGuide);
        guideBtn.addEventListener('touchend', function (e) { e.preventDefault(); openWaterTypeGuide(); });
    }
    loadWaterReport();
};
