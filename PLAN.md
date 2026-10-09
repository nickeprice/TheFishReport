# Fish Report — Active Plan

## 🔄 Rebuild Gear Sim for Drift Fishing

- [ ] Phase 0: Data Wiring — add qc_*/qe_* to nhdplus.js, verify spot-width data
      → nhdplus.js
      [Detail → docs/PLAN_REFERENCE.md#drift-data]

- [ ] Phase 1: Drift Force Model — new drift-model.js with Manning depth fallback, slip-speed drag, 3-state bottom contact
      → drift-model.js (new), drift.js, solver.js
      [Detail → docs/PLAN_REFERENCE.md#drift-force-model]

- [ ] Phase 2: Sweep + Coverage Score — 5 snapshot quasi-static sweep, water-type channel position
      → drift-model.js, drift.js, inputs-readers.js, index.html
      [Detail → docs/PLAN_REFERENCE.md#drift-coverage]

- [ ] Phase 3: Flow-Adjusted Recommendations — NHDPlus monthly flow vs current
      → drift-model.js, solver.js, index.html
      [Detail → docs/PLAN_REFERENCE.md#drift-flow-rec]

- [ ] Phase 4: Cleanup + Baselines — remove old catenary + chain solver, update sanity_pass.js
      → drift.js, chain.js, chain-helpers.js, chain-shooting.js, sanity_pass.js
      [Detail → docs/PLAN_REFERENCE.md#drift-cleanup]
