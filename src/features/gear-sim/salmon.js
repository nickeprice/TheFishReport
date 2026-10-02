/**
 * src/features/gear-sim/salmon.js — Target fish entity.
 *
 * Position, respiration, and mouth geometry for a holding adult salmon.
 * Used by interception.js to evaluate gear pass-through probability.
 *
 * public: salmonState(), salmonMouthCone(), salmonPositionZ(),
 *         SALMON_DEFAULTS
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */

var SALMON_DEFAULTS = {
    freqHz: 1.0,           // buccal respiration — @provenance: literature (Kawasaki 1982, 0.8-1.4 Hz)
    dutyCycle: 0.35,        // fraction of cycle mouth is open — @provenance: literature
    depthMinM: 0.15,        // typical holding depth (boundary layer) — @provenance: literature
    depthMaxM: 0.60,        // deeper holding in bright/clear conditions
    mouthWidthMm: 65,       // inside width, mm — @provenance: literature (adult Chinook)
    mouthHeightMm: 45,      // inside height, mm — @provenance: literature
    mouthDepthMm: 80        // mouth cavity depth, mm — @provenance: literature
};

/**
 * Compute the salmon's current state at time t.
 *
 *   mouthOpen = sin(2π · f · t + phase) > dutyCycle · 2 − 1
 *
 * Maps the sinusoidal cycle so the mouth is open for `dutyCycle` fraction
 * of the period. Phase shift randomises the start of the breathing cycle.
 *
 * t: simulation time (s)
 * freqHz: breathing frequency (Hz) — default 1.0
 * dutyCycle: fraction open — default 0.35
 * phase: phase offset (radians) — default 0
 *
 * Returns { mouthOpen: bool, mouthFraction: number }.
 * mouthFraction: 0 (closed) to 1 (fully open), computed as the normalised
 *   sinusoid clipped to [0, 1].
 * @provenance: literature — sinusoidal respiration model.
 */
function salmonState(t, freqHz, dutyCycle, phase) {
    var f = freqHz || SALMON_DEFAULTS.freqHz;
    var d = dutyCycle || SALMON_DEFAULTS.dutyCycle;
    var p = phase || 0;
    // Normalised sinusoid: -1 to 1
    var s = Math.sin(2 * Math.PI * f * t + p);
    // Convert to mouth fraction: open when s crosses the duty-cycle threshold
    var threshold = 1 - 2 * d;   // for d=0.35, threshold = 0.3
    var frac = Math.max(0, Math.min(1, (s - threshold) / (1 - threshold)));
    return {
        mouthOpen: frac > 0.01,
        mouthFraction: frac
    };
}

/**
 * The elliptical truncated cone of the salmon's mouth cavity.
 *
 * Returns { widthM, heightM, depthM, areaM2 }.
 * areaM2 is the projected frontal area of the open mouth (elliptical).
 *
 * If mouthFraction = 0, areaM2 = 0 (mouth closed).
 * @provenance: derived from SALMON_DEFAULTS mouth dimensions.
 */
function salmonMouthCone(mouthFraction) {
    var w = SALMON_DEFAULTS.mouthWidthMm * 0.001;
    var h = SALMON_DEFAULTS.mouthHeightMm * 0.001;
    var frac = mouthFraction || 0;
    return {
        widthM: w,
        heightM: h,
        depthM: SALMON_DEFAULTS.mouthDepthMm * 0.001,
        areaM2: frac > 0 ? Math.PI * w * h / 4 * frac : 0
    };
}

/**
 * Random holding depth within the salmon's preferred range.
 *
 * Returns z (m) from uniform distribution over [depthMinM, depthMaxM].
 * @provenance: literature — adult Chinook hold 0.15-0.60 m off bottom.
 */
function salmonPositionZ(depthMinM, depthMaxM) {
    var lo = depthMinM || SALMON_DEFAULTS.depthMinM;
    var hi = depthMaxM || SALMON_DEFAULTS.depthMaxM;
    return lo + Math.random() * (hi - lo);
}