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

- [x] Phase V6: Split Oversized Files (6/6 complete)
      → water.js(→3), supabase.js(→3), chain.js(→3), tackle.js(→2), inputs.js(→2), report.js(→2)
      [Detail → docs/PLAN_REFERENCE.md#build-split]

- [x] Phase V7: Ship & Validate
      → npm run build, full test suite, PWA offline, Vercel deploy
      [Detail → docs/PLAN_REFERENCE.md#build-deploy]

## 🛡 Pre-Validation: ESM Strict Mode & Tooling Stabilization

- [x] PRE-1: Prevent Playwright HTTP 429 Rate Limit Timeouts
      → src/app.js, src/mocks/
      [Detail → docs/PLAN_REFERENCE.md#test-429-timeout]

- [x] PRE-2: Enforce ESM Build-Time Safety (Flat Config)
      → eslint.config.js, vite.config.js
      [Detail → docs/PLAN_REFERENCE.md#test-esm-safety]

- [x] PRE-3: Resolve Circular Dependencies (Batch 1: Catch Log)
      → src/features/auth/auth.js, src/features/catch-log/*
      [Detail → docs/PLAN_REFERENCE.md#test-catch-cycle]

- [x] PRE-4: Resolve Circular Dependencies (Batch 2: Gear Sim)
      → src/features/gear-sim/*
      [Detail → docs/PLAN_REFERENCE.md#test-sim-cycle]

- [x] PRE-5: Complete Global `no-undef` Sweep
      → Remaining files in src/
      [Detail → docs/PLAN_REFERENCE.md#test-undef-sweep]
## 🔬 Validation Suite

- [x] T1: Playwright full-integration (gear sim)
      → chain-shooting.js, sim.js, solver.js, conftest.py, NEW test file
      [Detail → docs/PLAN_REFERENCE.md#test-playwright]

- [x] T2: Playwright water-report render test
      → daynav.js, report.js, report-render.js, conftest.py, NEW test file
      [Detail → docs/PLAN_REFERENCE.md#test-water]

- [x] T3: Fix 8 sanity_check failures
      → sanity_pass.cjs, various source files per failure
      [Detail → docs/PLAN_REFERENCE.md#test-sanity]

- [ ] T4: Audit remaining typeof guards
      → quick grep across src/ — 0 new code, pure verification
      [Detail → docs/PLAN_REFERENCE.md#test-typeof]

- [ ] T5: ESLint prefer-const sweep
      → ESLint rule on src/ — fix candidates to const where safe
      [Detail → docs/PLAN_REFERENCE.md#test-const]

- [ ] T6: HTML onclick handler audit
      → index.html, search for onclick= — verify each fn has window shim
      [Detail → docs/PLAN_REFERENCE.md#test-onclick]

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
