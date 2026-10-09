# Fish Report — Active Plan

## 🔬 Physics Refinement — Drag & Substrate

- [x] Phase A: FAO/FAO-equivalent drag coefficients for monofilament
      → physics.js
      [Detail → docs/PLAN_REFERENCE.md#physics-drag-coefficients]

- [x] Phase B: HydroATLAS substrate → real bed roughness z₀
      → extract_river_substrate.py (new), river_substrate.js (gen), continuity.js, drift-model.js
      [Detail → docs/PLAN_REFERENCE.md#physics-substrate-z0]

## 🔗 Chain + Data Expansion (32 gauges / 15 rivers)

- [x] Phase 0: Chain solver terminates at weight (remove 35m mainline)
      → chain-shooting.js
      [Detail → docs/PLAN_REFERENCE.md#data-chain-fix]

- [x] Phase 1: Expand all 3 datasets to 32 gauges / 15 rivers
      → precompute_spot_widths.py, extract_river_substrate.py, extract_river_widths.py
      [Detail → docs/PLAN_REFERENCE.md#data-expand-all]

- [x] Phase 2: Lat/lon lookup with inverse-variance blended width
      → continuity.js
      [Detail → docs/PLAN_REFERENCE.md#ui-blended-width]

- [x] Phase 3: Wire blended width into drift depth model
      → drift-model.js
      [Detail → docs/PLAN_REFERENCE.md#drift-wire-depth]

- [ ] Phase 4: Verification — sanity, tests, all 32 gauges
      → sanity_pass.cjs, tests/
      [Detail → docs/PLAN_REFERENCE.md#data-verify]
