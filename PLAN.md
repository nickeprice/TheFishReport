# Fish Report — Active Plan

## 🔧 FIXINGS: Data Integrity & UI Quality

- [ ] F4: Fix map CFS/gauge values showing "--"
      → src/features/map/map.js, src/styles.css
      [Detail → docs/PLAN_REFERENCE.md#fixing-map-colors]

- [ ] F3: Legal hours data — per-river records, eliminate "not verified"
      → public/src/data/regions/washington.js, src/features/telemetry/daynav.js, src/utils/regulations.js
      [Detail → docs/PLAN_REFERENCE.md#fixing-legal-hours]

- [ ] F4: Fix map CFS/gauge values showing "--"
      → src/features/map/map.js, src/services/water-gauge.js
      [Detail → docs/PLAN_REFERENCE.md#fixing-map-cfs]

- [ ] F5: Fix Run & Timing section rendering
      → src/features/telemetry/report-render.js, src/features/telemetry/hero.js
      [Detail → docs/PLAN_REFERENCE.md#fixing-run-timing]

- [ ] F6: Fix bottom tab bar + remove refresh/bug buttons
      → index.html, src/styles.css
      [Detail → docs/PLAN_REFERENCE.md#fixing-ui-buttons]

## 🔄 Rebuild Gear Sim for Drift Fishing (after Vite migration)

- [x] Phase D1: Fix HUD messaging
      → solver.js, styles.css
      [Detail → docs/PLAN_REFERENCE.md#drift-hud]

- [x] Phase D2: Bottom Contact Check
      → inputs.js, drift.js, solver.js, index.html, styles.css
      [Detail → docs/PLAN_REFERENCE.md#drift-contact]

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
