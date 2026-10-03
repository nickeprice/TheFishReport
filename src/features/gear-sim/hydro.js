/**
 * src/features/gear-sim/hydro.js — 3D velocity field (log-law + turbulence).
 *
 * River hydraulics primitives for the lumped-mass cable simulator.
 * All velocities in m/s; depths in m.
 *
 * public: logLawVelocity(), velocityProfile(), turbulenceFluctuation(),
 *         uStarFromMax(), ROUGHNESS_COBBLE, setD50()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */

// von Kármán constant (standard fluid dynamics, no site tuning)
var KAPPA = 0.41;            // dimensionless — @provenance: standard
// Water density, kg/m³ (fresh water, 20 °C)
var RHO = 1000;              // kg/m³ — @provenance: standard
// Kinematic viscosity, m²/s (fresh water, 10 °C — conservative for cold rivers)
var NU = 1.0e-6;             // m²/s — @provenance: standard
// Median cobble diameter, metres (D₅₀ = 10 cm default for gravel-cobble bed)
var MEDIAN_COBBLE_M = 0.10;  // m — @provenance: literature (Nick Thorne 2025, PNW gravel-cobble)
// Roughness length z₀ = 0.033 · (2.5 · D₅₀) per Nikora 1992 / Raudkivi 1998
// 0.033 · 0.25 = 0.00825 m ≈ 8 mm
var ROUGHNESS_COBBLE = 0.033 * 2.5 * MEDIAN_COBBLE_M;  // m — @provenance: derived

/** D50 setter — overrides the median cobble diameter at runtime.
 *  Updates both MEDIAN_COBBLE_M and the derived ROUGHNESS_COBBLE.
 *  @param meters — new D50 in metres (e.g. 0.15 for coarse gravel)
 *  @provenance: derived */
function setD50(meters) {
    MEDIAN_COBBLE_M = meters;
    ROUGHNESS_COBBLE = 0.033 * 2.5 * MEDIAN_COBBLE_M;
}

/**
 * Log-law velocity at height z above the bed.
 *
 *    u(z) = (u* / κ) · ln(z / z₀)
 *
 * z: height above bed (m)
 * uStar: shear velocity (m/s)
 * z0: roughness length (m) — use ROUGHNESS_COBBLE for gravel-cobble bed
 *
 * Returns 0 when z <= z0 (within the roughness sublayer).
 * @provenance: standard — log-law is the canonical neutral boundary-layer profile.
 * @error: ±0.15 m/s (±10%) — standard deviation on a natural river estimate.
 */
function logLawVelocity(z, uStar, z0) {
    if (!z || z <= 0 || !uStar || uStar <= 0 || !z0 || z0 <= 0) return 0;
    if (z <= z0) return 0;                                  // roughness sublayer
    return (uStar / KAPPA) * Math.log(z / z0);
}

/**
 * Derive shear velocity u* from the depth-averaged maximum (surface) velocity.
 *
 *    uMax = (u* / κ) · ln(H / z₀)   →   u* = uMax · κ / ln(H / z₀)
 *
 * uMax: maximum (surface) velocity (m/s)
 * H: total water depth (m)
 * z0: roughness length (m)
 *
 * Returns null when inputs are non-positive.
 * @provenance: derived — inverted from standard log-law.
 * @error: ±0.02 m/s (±10%) — propagated from velocity uncertainty.
 */
function uStarFromMax(uMax, H, z0) {
    if (!uMax || uMax <= 0 || !H || H <= 0 || !z0 || z0 <= 0) return null;
    var lnArg = H / z0;
    if (lnArg <= 1) return null;                            // H must be > z0
    return uMax * KAPPA / Math.log(lnArg);
}

/**
 * Full velocity profile at height z, given total depth H and surface velocity uMax.
 *
 * Combines uStarFromMax() + logLawVelocity() in one call. Returns a structured
 * result with the velocity vector (assumed streamwise, —x), shear velocity, and
 * roughness length used.
 *
 * z: height above bed (m)
 * H: total water depth (m)
 * uMax: maximum (surface) velocity (m/s)
 * z0: roughness length (m) — defaults to ROUGHNESS_COBBLE when null/undefined
 *
 * Returns { vMs: number, uStar: number, z0: number, H: number }
 * or { vMs: 0, uStar: null, z0: z0, H: H } when inputs are out of range.
 * @provenance: derived — composed from uStarFromMax() + logLawVelocity().
 */
function velocityProfile(z, H, uMax, z0) {
    z0 = (z0 && z0 > 0) ? z0 : ROUGHNESS_COBBLE;
    var uStar = uStarFromMax(uMax, H, z0);
    if (uStar === null) {
        return { vMs: 0, uStar: null, z0: z0, H: H };
    }
    var v = logLawVelocity(z, uStar, z0);
    return { vMs: v, uStar: uStar, z0: z0, H: H };
}

/**
 * Isotropic Gaussian turbulence fluctuation for one velocity component.
 *
 *    δu = randomGauss() · intensity · uMean
 *
 * Uses the Box-Muller transform. Zero when uMean ≤ 0 or intensity ≤ 0.
 *
 * turbulenceIntensity = σ_u / u_mean. For gravel-cobble rivers at Re ≈ 10⁶:
 *    I_x (streamwise) = 0.15–0.25 (turbulent boundary layer)
 *    I_y (spanwise)   = 0.08–0.15
 *    I_z (vertical)   = 0.05–0.10
 *
 * t: time (s) — unused in this isotropic model, reserved for future coloured noise
 * intensity: dimensionless turbulence intensity (I_x, I_y, or I_z)
 * uMean: mean velocity (m/s) at this point
 *
 * @provenance: standard — Gaussian white noise via Box-Muller.
 * @error: ±0.10 m/s — bounded by the intensity fraction.
 */
function turbulenceFluctuation(t, intensity, uMean) {
    // t is reserved; silence unused-param warnings by the convention of including it.
    if (!intensity || intensity <= 0 || !uMean || uMean <= 0) return 0;
    // Box-Muller: two uniform(0,1] → one standard normal
    var u = 1 - Math.random();                              // (0,1] avoid ln(0)
    var v = 1 - Math.random();
    var z0bm = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return z0bm * intensity * uMean;
}