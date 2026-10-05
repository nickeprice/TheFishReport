/**
 * src/shared/state.js - cross-feature shared state.
 *
 * Every mutation goes through State.set() so debug.js can watch key changes
 * without wrapping every assignment. Readers access State.X directly.
 *
 * ES module. Import via: import { State } from '../shared/state.js';
 */
// --- user's GPS fix (private, never surfaced in the public feed) ---
export var State = {};
State.userGPSCoords = null;
// --- own-gauge water quality (set by applyOwnGaugeWaterQuality) ---
State.waterTempF = null;
State.turbidityFnu = null;
// --- surface wind (stashed by applyReportWeather for catch-log enrichment) ---
State.currentWindMph = null;
State.currentWindDir = null;
// Test compat shim:
window.State = State;