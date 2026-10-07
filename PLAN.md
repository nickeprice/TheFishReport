# Fish Report — Active Plan

## 🛠 Station Modal & Map

- [x] Phase A1: Import issue #4 river technique/season JSON
      → washington_rivers.json (NEW), ROADMAP.md
      [Detail → docs/PLAN_REFERENCE.md#data-river-techniques]

- [x] Phase A2: Dynamic Quick Regional Presets from discovery_pool
      → index.html, picker.js
      [Detail → docs/PLAN_REFERENCE.md#ui-dynamic-presets]

- [ ] Phase A5: Saved spots — no sign-in required
      → spots.js, index.html
      [Detail → docs/PLAN_REFERENCE.md#ui-spots-no-auth]

- [ ] Phase A7: Grouped collapsible river presets + favorites
      → picker.js
      [Detail → docs/PLAN_REFERENCE.md#ui-grouped-presets]

- [ ] Phase A6: MapLibre GL JS upgrade (satellite + vector + geolocate)
      → map.js, package.json
      [Detail → docs/PLAN_REFERENCE.md#ui-maplibre]

## 🛠 Data Pipeline & Infrastructure

- [ ] Phase A3: Add PyMuPDF to forecast scraper
      → refresh_wdfw_forecast.py
      [Detail → docs/PLAN_REFERENCE.md#data-forecast-pymupdf]

- [ ] Phase B: Hatchery escapement — map WDFW facilities for all 15 rivers
      → water.js
      [Detail → docs/PLAN_REFERENCE.md#data-hatchery]

- [ ] Phase C: Debug pipeline → Supabase + button styling
      → api/report-issue.py, migration, debug.js, index.html, styles.css
      [Detail → docs/PLAN_REFERENCE.md#ui-debug]

## 🔄 Rebuild Gear Sim for Drift Fishing (after Vite migration)

- [ ] Phase D0: NHDPlus API Integration
      → nhdplus.js (NEW), app.js, water.js, sw.js, SYMBOLS.md
      [Detail → docs/PLAN_REFERENCE.md#drift-nhdplus]

- [ ] Phase D1: Fix HUD messaging
      → solver.js, styles.css
      [Detail → docs/PLAN_REFERENCE.md#drift-hud]

- [ ] Phase D2: Bottom Contact Check
      → inputs.js, drift.js, solver.js, index.html, styles.css
      [Detail → docs/PLAN_REFERENCE.md#drift-contact]

- [ ] Phase D3: Complete drift force model
      → chain.js, drift.js, solver.js
      [Detail → docs/PLAN_REFERENCE.md#drift-forces]

- [ ] Phase D4: Drift coverage score
      → inputs.js, drift.js, solver.js, index.html
      [Detail → docs/PLAN_REFERENCE.md#drift-coverage]

- [ ] Phase D5: Flow-Adjusted Recommendations
      → inputs.js, water.js, solver.js, styles.css
      [Detail → docs/PLAN_REFERENCE.md#drift-flow]

- [ ] Phase D6: NHDPlus-Enhanced Features
      → hero.js, log.js, picker.js, drift.js, zone-core.js
      [Detail → docs/PLAN_REFERENCE.md#drift-nhdplus-features]

- [ ] Phase D7: River Entry Conditions
      → water.js, report.js, hero.js, index.html, styles.css
      [Detail → docs/PLAN_REFERENCE.md#drift-entry]
