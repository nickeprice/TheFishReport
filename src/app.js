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
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById('log-datetime').value = d.toISOString().slice(0,16);
    // Load the tackle library BEFORE restoring the rig: the line + weight-shape
    // pickers only have options once it lands, and restoreRig() selects into them.
    if (typeof tackleLoad === 'function') {
        try { await tackleLoad(); } catch (e) { logDebug('Tackle load failed: ' + e.message, 'DB'); }
    }
    restoreRig();
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
    loadWaterReport();
};
