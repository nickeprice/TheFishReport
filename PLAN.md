# Fish Report — Active Plan

## 🔧 FIXINGS: Data Integrity & UI Quality

- [ ] F5a: Research Socrata — fetch distinct facility names, species, events
      → src/services/water-weather.js
      [Detail → docs/PLAN_REFERENCE.md#fixing-run-timing-s1]

- [ ] F5b: Update escapementFacilities — map all 32 gauge IDs
      → src/services/water-weather.js
      [Detail → docs/PLAN_REFERENCE.md#fixing-run-timing-s2]

- [ ] F5c: Update hatcheryEscapement — add entries for all 32 gauge IDs
      → src/services/water-weather.js
      [Detail → docs/PLAN_REFERENCE.md#fixing-run-timing-s3]

- [ ] F5d: Fill wdfw_forecasts.json — per-waterbody forecast numbers
      → src/data/wdfw_forecasts.json
      [Detail → docs/PLAN_REFERENCE.md#fixing-run-timing-s4]

- [ ] F5e: Fix species name mapping — align Socrata species to calendar species
      → src/services/water-escapement.js, src/features/telemetry/hero.js
      [Detail → docs/PLAN_REFERENCE.md#fixing-run-timing-s5]

- [ ] F5f: Verify — run sanity + test
      → (all files above)
      [Detail → docs/PLAN_REFERENCE.md#fixing-run-timing-s6]

- [ ] F6: Fix bottom tab bar (Water Report / Gear Sim / Catch Log) not showing
      → index.html, src/styles.css
      [Detail → docs/PLAN_REFERENCE.md#fixing-bottom-bar]
      → index.html, src/styles.css
      [Detail → docs/PLAN_REFERENCE.md#fixing-bottom-bar]

## 🔄 Rebuild Gear Sim for Drift Fishing (after Vite migration)

- [ ] Phase D3: Complete drift force model
      → chain.js, drift.js, solver.js
      [Detail → docs/PLAN_REFERENCE.md#drift-forces]

- [ ] Phase D4: Drift coverage score
      → inputs.js, drift.js, solver.js, index.html
      [Detail → docs/PLAN_REFERENCE.md#drift-coverage]

- [ ] Phase D5: Flow-Adjusted Recommendations
      → inputs.js, solver.js, styles.css
      [Detail → docs/PLAN_REFERENCE.md#drift-flow]

- [ ] Phase D6: NHDPlus-Enhanced Features
      → hero.js, log.js, picker.js, drift.js, zone-core.js, report.js
      [Detail → docs/PLAN_REFERENCE.md#drift-nhdplus-features]

- [ ] Phase D7: River Entry Conditions
      → water.js, report.js, hero.js, index.html, styles.css
      [Detail → docs/PLAN_REFERENCE.md#drift-entry]
