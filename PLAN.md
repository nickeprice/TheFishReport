# Fish Report — Active Plan

## 🪄 Lane-Aware Depth (phone GPS + compass → cross-section lane)

- [ ] Phase 1: Retain bank-to-bank depth profile + transect bearing per cross-section
      → width_elevation.py, measure_hydro_widths.py, data/hydro_profiles.json, api/spot-geometry.py
      [Detail → docs/PLAN_REFERENCE.md#data-lane-profile]

- [ ] Phase 2: Compass/GPS → lane fraction → lane depth into driftEnv (bank-fallback if no compass)
      → continuity.js, drift-model.js, drift.js, zone-core.js
      [Detail → docs/PLAN_REFERENCE.md#drift-lane-model]

- [ ] Phase 3: Validate lane depth shifts hgt/drag/coverage + offline & compass-denied fallbacks
      → sanity_pass.cjs, spot_widths.js
      [Detail → docs/PLAN_REFERENCE.md#sim-lane-validate]
