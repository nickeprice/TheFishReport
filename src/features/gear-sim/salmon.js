/**
 * src/features/gear-sim/salmon.js — Target fish entity.
 *
 * Position, respiration, and mouth geometry for a holding adult salmon.
 * Used by interception.js to evaluate gear pass-through probability.
 *
 * public: salmonState(), salmonMouthCone(), salmonPositionZ(),
 *         SALMON_DEFAULTS, setSalmonSpecies(), getSalmonSpecies(),
 *         SALMON_SPECIES
 * ES module.
 */

/** Species morphological registry. SALMON_DEFAULTS points to the active entry. */
var SALMON_SPECIES = {
    chinook: {
        label: 'Chinook',
        freqHz: 1.0,
        dutyCycle: 0.35,
        depthMinM: 0.15,
        depthMaxM: 0.60,
        mouthWidthMm: 65,
        mouthHeightMm: 45,
        mouthDepthMm: 80
    },
    steelhead: {
        label: 'Steelhead',
        freqHz: 1.2,
        dutyCycle: 0.30,
        depthMinM: 0.10,
        depthMaxM: 0.45,
        mouthWidthMm: 45,
        mouthHeightMm: 30,
        mouthDepthMm: 55
    },
    coho: {
        label: 'Coho',
        freqHz: 1.1,
        dutyCycle: 0.35,
        depthMinM: 0.15,
        depthMaxM: 0.50,
        mouthWidthMm: 55,
        mouthHeightMm: 38,
        mouthDepthMm: 65
    }
};

/** Points to the currently selected species entry in SALMON_SPECIES. */
var SALMON_DEFAULTS = SALMON_SPECIES.chinook;

/** Active species key — default 'chinook'. Updated by setSalmonSpecies(). */
var ACTIVE_SALMON_SPECIES = 'chinook';

/**
 * Switch the active species.
 * @param {string} name — 'chinook', 'steelhead', or 'coho'
 * Returns true if recognised, false if unknown (defaults to chinook).
 */
export function setSalmonSpecies(name) {
    name = (name || '').toLowerCase();
    if (SALMON_SPECIES[name]) {
        ACTIVE_SALMON_SPECIES = name;
        SALMON_DEFAULTS = SALMON_SPECIES[name];
        return true;
    }
    // Unknown species — fall back to chinook
    ACTIVE_SALMON_SPECIES = 'chinook';
    SALMON_DEFAULTS = SALMON_SPECIES.chinook;
    return false;
}

/** Return the current species key. */
export function getSalmonSpecies() {
    return ACTIVE_SALMON_SPECIES;
}

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
export function salmonState(t, freqHz, dutyCycle, phase) {
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
export function salmonMouthCone(mouthFraction) {
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
export function salmonPositionZ(depthMinM, depthMaxM) {
    var lo = depthMinM || SALMON_DEFAULTS.depthMinM;
    var hi = depthMaxM || SALMON_DEFAULTS.depthMaxM;
    return lo + Math.random() * (hi - lo);
}