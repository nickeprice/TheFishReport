# Fish Report — Active Plan

## 🔬 Physics Refinement — Drag & Substrate

- [x] Phase A: FAO/FAO-equivalent drag coefficients for monofilament
      → physics.js
      [Detail → docs/PLAN_REFERENCE.md#physics-drag-coefficients]

- [x] Phase B: HydroATLAS substrate → real bed roughness z₀
      → extract_river_substrate.py (new), river_substrate.js (gen), continuity.js, drift-model.js
      [Detail → docs/PLAN_REFERENCE.md#physics-substrate-z0]

## 🔗 Chain + Data Expansion (32 gauges / 15 rivers)

- [ ] Phase 0: Run extraction scripts — generate data for all 32 gauges / 15 rivers
      → precompute_spot_widths.py, extract_river_substrate.py, extract_river_widths.py
      [Detail → docs/PLAN_REFERENCE.md#data-expand-all]

- [ ] Phase 1: Verification — sanity, build, tests
      → sanity_pass.cjs, tests/
      [Detail → docs/PLAN_REFERENCE.md#data-verify]
