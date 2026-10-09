# Fish Report — Active Plan

## 🔬 Physics Refinement — Drag & Substrate

- [x] Phase A: FAO/FAO-equivalent drag coefficients for monofilament
      → physics.js
      [Detail → docs/PLAN_REFERENCE.md#physics-drag-coefficients]

- [x] Phase B: HydroATLAS substrate → real bed roughness z₀
      → extract_river_substrate.py (new), river_substrate.js (gen), continuity.js, drift-model.js
      [Detail → docs/PLAN_REFERENCE.md#physics-substrate-z0]

## 🔗 Data Expansion (32 gauges / 15 rivers)

- [x] Phase 0: Extraction scripts — river_substrate (15 rivers) + river_widths (33 gauges) generated
      → precompute_spot_widths.py, extract_river_substrate.py, extract_river_widths.py
      [Detail → docs/PLAN_REFERENCE.md#data-expand-all]

- [x] Phase 1: Code — lat/lon blended width, spotWidthAt, drainageWidthFt, substrate z0 wired in
      → continuity.js, drift-model.js, drift.js
      [Detail → docs/PLAN_REFERENCE.md#data-chain-fix]

- [ ] Phase 2: Run spot_widths for remaining 10 rivers (wait for Overpass API availability)
      → python3 scripts/tools/precompute_spot_widths.py --rivers white,carbon,green,snohomish,skagit,puyallup_upper,white_lower
      [Detail → docs/PLAN_REFERENCE.md#data-expand-all]
