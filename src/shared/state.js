/**
 * src/shared/state.js - cross-feature shared state, extracted from window.* globals.
 *
 * Every mutation goes through State.set() so debug.js can watch key changes
 * without wrapping every assignment. Readers access State.X directly.
 *
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
var State = window.State || {};
if (!window.State) {
    // --- user's GPS fix (private, never surfaced in the public feed) ---
    State.userGPSCoords = null;
    // --- own-gauge water quality (set by applyOwnGaugeWaterQuality) ---
    State.waterTempF = null;
    State.turbidityFnu = null;
    // --- surface wind (stashed by applyReportWeather for catch-log enrichment) ---
    State.currentWindMph = null;
    State.currentWindDir = null;
    window.State = State;
}