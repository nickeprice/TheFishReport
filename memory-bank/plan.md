# ACTIVE PLAN — Physics Engine Rebuild

STATUS: READY

## Phase 0: Data Foundation (bug fixes — start here)

- [x] 0.1 Fix corky net buoyancy. **[DONE in working tree]**
  files: inputs.js, physics.js, drift.js, zone.js, sonar.js
  Change: parseFoam() returns net_buoyancy_g = buoyancy_g - mass_g (Archimedes net).
  Every call site passes foam.net_buoyancy_g to computeLiftGf() instead of foam.buoyancy_g.
  verify: ✅ corky-12 net=0.20, corky-10 net=0.30, cheater-12 net=0.40, corky-14 net=0.05

- [x] 0.2 Fix yarn buoyancy sign.
  files: inputs.js, tackle.json, docs/tackle_measurements.csv
  GAP: tackleYarnBuoyancyG() hardcodes -0.012 ✓, BUT tackle.json override is +0.01 —
  the JSON wins at runtime, making yarn ACTUALLY buoyant, not sinking.
  Fix: (a) change tackle.json line 2172 buoyancy_per_inch_g: 0.01 → -0.012,
  (b) change tackle_measurements.csv row 16 buoyancy_per_inch_g: 0.01 → -0.012,
  (c) regen tackle.json from CSV. The function default of -0.012 is already correct.
  verify: node -e "tackleYarnBuoyancyG(10)" returns -0.12 (NOT +0.10)

- [x] 0.3 Add yarn drag fields.
  files: inputs.js (DONE), tackle.json, docs/tackle_measurements.csv, scripts/tackle_csv_to_json.py
  GAP: tackleYarnDragData() returns {areaCm2:1.8, cd:0.8} ✓ but FROM hardcoded default,
  not from tackle.json — the CSV/JSON yarn row has no area_cm2, cd, or shape columns.
  Fix: (a) add area_cm2=1.8, cd=0.8, shape=cylinder to tackle_measurements.csv row 16
  at the correct column positions, (b) update tackle_csv_to_json.py REQUIRED_FIELDS["yarn"]
  from ("buoyancy_per_inch_g",) → ("buoyancy_per_inch_g", "area_cm2", "cd"),
  (c) regen tackle.json. The JS function already reads these fields when present.
  verify: node -e "JSON.stringify(tackleYarnDragData())" → {areaCm2:1.8, cd:0.8}

- [x] 0.4 Wire yarn drag into all 3 call sites. **[DONE in working tree]**
  files: drift.js, zone.js, sonar.js
  verify: ✅ grep 'yarnObj' — all use tackleYarnDragData(), zero null

- [x] 0.5 Wire mainline drag into all 3 call sites. **[DONE in working tree]**
  files: drift.js, zone.js, sonar.js
  verify: ✅ grep mlDia — all 3 sites guard mlDia > 0 and call lineDragPerFt

- [x] 0.6 Re-pin sanity baselines (AFTER 0.2 + 0.3 — data must be correct first).
  files: sanity_pass.js
  Note: sanity_pass.js line 841 still references foam1.buoyancy_g (GROSS) instead
  of foam1.net_buoyancy_g — the 4 test rigs may need their foam values adjusted.
  Run: node sanity_pass.js --quiet, capture FAIL lines, update frozen assertions,
  re-run → 149/149. Ensure all changed lines carry a // rationale: comment.
  verify: node sanity_pass.js --quiet prints "PASSED 149 | FAILED 0"

- [x] 0.7 Commit + push.
  files: all modified
  Run: stage all, commit: "fix: Phase0 data foundation — net corky buoyancy,
  yarn sign/drag (CSV→JSON fix), mainline drag, provenance comments", push to origin
  verify: git status clean, origin/main advanced

## Phase 1: hydro.js — 3D Velocity Field

- [x] 1.1 New file: src/features/gear-sim/hydro.js
  Functions: logLawVelocity(z, uStar, z0), velocityProfile(z, H, uMax), uStarFromMax(uMax, H, z0),
  turbulenceFluctuation(t, intensity)
  Constants: κ=0.41, ρ=1000 kg/m³, ν=1.0e-6 m²/s, ROUGHNESS_COBBLE=0.00825 m
  Derive u* from uMax = u* · κ / ln(H/z0). z₀ = 0.033 · (2.5 · D₅₀), D₅₀ = 0.10m cobble default.
  Wired into index.html (after physics.js), sw.js SHELL_FILES, SYMBOLS.md, and sanity_pass.js.
  verify: node sanity_pass.js --quiet → PASSED 157 | FAILED 0

## Phase 2: riverbed.js — Substrate & Contact

- [ ] 2.1 New file: src/features/gear-sim/riverbed.js
  Functions: bedElevation(x,y), contactForce(z, z_bed, v_z), frictionForce(v_xy, F_n), isSnagged(z, z_bed, pullVec)
  μ_static = 0.65, μ_kinetic = 0.35 (lead-on-wet-cobble, literature range 0.55-0.75)
  Hertz contact: k = (4/3) · E* · √(R*), E* ≈ 12 GPa lead-on-basalt
  Restitution = 0.15 (Marshall 2012, wet rock impacts)
  verify: local test in sanity_pass.js — contact force at penetration > 0

## Phase 3: cable.js — Lumped-Mass Line Dynamics

- [ ] 3.1 New file: src/features/gear-sim/cable.js
  N-node lumped-parameter cable. Normal + tangential drag. Quasi-static equilibrium solver.
  Mainline preset: 40 nodes, d=0.35mm, SG=0.97, E=10 GPa, Cd_n=1.15, Cd_t=0.03
  Leader preset: 30 nodes, d=0.30mm, SG=1.78, E=3.5 GPa, Cd_n=1.1, Cd_t=0.03
  Drag: Fn = 0.5·ρ·Cd_n·d·ds·|v_rel_n|·v_rel_n, Ft = 0.5·ρ·Cd_t·π·d·ds·|v_rel_t|·v_rel_t
  SG braid=0.97 (floats), SG fluoro=1.78 (sinks)
  verify: cable under uniform flow converges to bowed shape

## Phase 4: sinker.js — Bouncing Sinker

- [ ] 4.1 New file: src/features/gear-sim/sinker.js
  Mass Mw = 20-75g (0.7-2.6 oz). Density lead = 11,340 kg/m³.
  Forces: gravity + buoyancy + form drag + Coulomb friction + Saffman lift (negligible, <1% of weight)
  Bouncing: z ≤ z_bed + r_cobble. Compute average v_sinker from force balance.
  Cd_sinker = 1.0 (cylinder at Re ≈ 8000)
  verify: 30g sinker at 2 m/s → v_sinker < 2.0 m/s

## Phase 5: terminal.js — Hook + Corky/Yarn Equilibrium

- [ ] 5.1 New file: src/features/gear-sim/terminal.js
  Equilibrium: netForce = corkyNet + yarnNet − hookMass·g. Target |netForce| < 0.005 N.
  VIV: St = 0.21 (circular cylinder at Re 10³-10⁴). Amplitude ≈ 0.1·D.
  Output: hook z-position, net vertical force, isEquilibrium
  verify: terminalEquilibrium(0.4g net corky, 0.16g hook) → net ≈ 0.24g > threshold → note

## Phase 6: salmon.js — Target Entity

- [ ] 6.1 New file: src/features/gear-sim/salmon.js
  Position: z ∈ [0.15, 0.60]m (boundary layer), facing upstream (−x).
  Buccal respiration: f = 1.0 Hz (0.8-1.4), duty cycle 35%.
  Mouth: elliptical truncated cone (65mm wide × 45mm tall × 80mm deep).
  State: MouthOpen(t) = sin(2π·f·t) > 0.35
  verify: MouthOpen(0.25, 1.0) → true (mouth open at t=0.25s)

## Phase 7: interception.js — Flossing State Machine

- [ ] 7.1 New file: src/features/gear-sim/interception.js
  4-phase: DRIFT_STABILIZE → SWEEP → COLLISION → SEAT
  Monte-Carlo: N=100 runs, randomize salmon position + breathing phase → interceptionProbability
  Hook set force = 8.0 N (informed_estimate, salmon jaw cartilage)
  Seat distance < 0.008m (from hook gap geometry)
  verify: state machine transitions through all 4 phases correctly

## Phase 8: Extend Existing Compute Path

- [ ] 8.1 Extend drift.js compute(): prepend hydro → sinker → cable(mainline+leader) → terminal → salmon → interception, then existing compute pipe (lift → drag → hgt → zone → score)
- [ ] 8.2 Update solver.js: paintSimHud() now shows hook depth + sweep quality
- [ ] 8.3 Update sim.js: orchestrate full sim pipeline with new modules
- [ ] 8.4 Update zone.js: new output fields from simulation (interception probability, sweep quality)
- [ ] 8.5 Update sonar.js: if new engine changes sonar snapshot format, create a DB migration for the sonar_env_snapshot table
- [ ] 8.6 Re-pin all sanity baselines after integration
- [ ] 8.7 Update sw.js SHELL_FILES + VERSION

## Provenance Tag Convention
Every numeric literal in the code gets a comment:
// @provenance: standard | derived | literature | informed_estimate | measured
// @error: ±X (±Y%)
// @measure: [protocol to replace with real value]
