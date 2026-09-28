/**
 * src/app.js - Puyallup River Companion BOOTSTRAP.
 *
 * The classic-script monolith was split into modules during UPDATE 3.0 Phase 1.1
 * (2,460 lines -> 24). Everything now lives under src/shared/* and src/features/*
 * (telemetry, gear-sim, catch-log, station, auth). This file owns ONLY the
 * window.onload bootstrap and is still loaded LAST, so every global it calls
 * (restoreRig, initGearSimInputDebounce, registerServiceWorker, ...) is already
 * defined by the scripts loaded above it in index.html.
 */
// --- BOOTSTRAP ---
window.onload = function() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById('log-datetime').value = d.toISOString().slice(0,16);
    restoreRig();
    initGearSimInputDebounce();
    applyTabDeepLink();
    registerServiceWorker();
    startAutoRefresh();
    getGPS();
    initAuth();
    if (typeof setCatchScope === 'function') setCatchScope(CATCH_SCOPE);
    loadWaterReport();
};
