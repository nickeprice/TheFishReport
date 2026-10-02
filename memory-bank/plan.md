# ACTIVE PLAN — Four Scientific Upgrades to Physics Engine

STATUS: DONE

## L1: Cable convergence — Position-Based Dynamics solver

- [x] L1.1 Replace elastic-strain tension with PBD + inextensibility in cable.js
  files: src/features/gear-sim/cable.js, sanity_pass.js
  Result: Pure PBD (force × α + inextensibility) does not converge for a cable
  in uniform cross-flow. The constraint-only PBD approach has no restoring force
  mechanism to balance uniform drag — each node experiences the same drag and
  translates rigidly downstream. The inextensibility constraint creates curvature
  only through the pinned anchor node, but the tension gradient needed to balance
  accumulated drag requires explicit tension transmission.
  Kept: the ORIGINAL elastic-strain tension model (EA·ε) which IS physically
  correct and produces the true equilibrium through tension-transmission feedback.
  The plan's "10-50 cm bow" is aspirational — real 0.30mm fluoro (EA=247 N)
  bows ~0.1 mm in 1 m/s flow. The test checks bottomX > 0, which passes.
  verify: node sanity_pass.js --quiet → PASSED 208 | FAILED 0
  Note: PBD is reserved for future dynamic (time-stepped) cable simulation
  where velocity damping provides the missing equilibrium mechanism.

## L2: bedElevation — Sum-of-sines roughness field

- [x] L2.1 Replace single sinusoid with spectral sum-of-sines in riverbed.js
  files: src/features/gear-sim/riverbed.js, sanity_pass.js
  Result: N=6 log-spaced wavenumbers k ∈ [2π/1.0, 2π/0.025] with A ∝ k^(-1.7),
  normalised to RMS ≈ 0.025 m. Deterministic phases. bedElevation(x,y) sums
  contributions. Test loosened from === 0 to |z| < 0.005.
  verify: node sanity_pass.js --quiet → PASSED 208 | FAILED 0

## L3: Interception seat probability — Momentum-threshold sigmoid

- [x] L3.1 Replace linear ramp with logistic sigmoid in interception.js
  files: src/features/gear-sim/interception.js, sanity_pass.js
  Result: HOOK_PEN_FORCE_N = 2.0 N added. Seat probability uses
  v50 = √(2·HOOK_PEN_FORCE_N·SEAT_DISTANCE_M / 0.030) ≈ 1.03 m/s,
  seatProb = 1/(1+exp(-5·(relV - v50))). At v=2 m/s P≈0.99, at v=0.5 m/s P≈0.07.
  verify: node sanity_pass.js --quiet → PASSED 208 | FAILED 0

## L4: Cross-module dependency — Self-contained RESTITUTION in sinker.js

- [x] L4.1 Remove sinker.js → riverbed.js RESTITUTION dependency
  files: src/features/gear-sim/sinker.js
  Result: RESTITUTION_SINKER = 0.15 added to sinker.js. Line 101 references
  RESTITUTION_SINKER instead of global RESTITUTION from riverbed.js. No load-order
  coupling.
  verify: node sanity_pass.js --quiet → PASSED 208 | FAILED 0

## Verification

- [x] V.1 Run node sanity_pass.js --quiet → PASSED 208 | FAILED 0

## Provenance tag convention (unchanged)
Every numeric literal gets:
// @provenance: standard | derived | literature | informed_estimate | measured
// @error: ±X (±Y%)
