# Fish Report — Active Plan

## ⚡ Vite Migration — Foundation (DO FIRST)

- [x] Phase V3: Entry Points (index.html + app.js)
      → index.html, app.js
      [Detail → docs/PLAN_REFERENCE.md#build-html]

- [x] Phase V4: Test & CI Migration
      → test_gear_sim_run.js, conftest.py, dev_server.py, ci-physics.yml, sanity.yml
      [Detail → docs/PLAN_REFERENCE.md#build-tests]

- [x] Phase V5: Tooling (sanity_pass, sw.js, docs, rules)
      → sanity_pass.js, sw.js, vite.config.js (+plugin), SYMBOLS.md, .clinerules
      [Detail → docs/PLAN_REFERENCE.md#build-tooling]

- [ ] Phase V6: Split Oversized Files (<150 lines)
      → water.js(→3), supabase.js(→3), chain.js(→3), tackle.js(→2), inputs.js(→2), report.js(→2)
      [Detail → docs/PLAN_REFERENCE.md#build-split]

- [ ] Phase V7: Ship & Validate
      → npm run build, full test suite, PWA offline, Vercel deploy
      [Detail → docs/PLAN_REFERENCE.md#build-deploy]

## 🛠 UI Polish & Data Pipeline (after Vite migration)

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
