/**
 * src/services/water.js - re-export wrapper (was the water telemetry + escapement
 * monolithic file). Split into water-gauge.js, water-weather.js, water-escapement.js.
 * ES module. Callers unchanzged — just import from this file as before.
 */
export * from './water-gauge.js';
export * from './water-weather.js';
export * from './water-escapement.js';
