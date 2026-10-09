
<a id="physics-drag-coefficients"></a>
## Phase A: FAO-equivalent drag coefficients for monofilament

**Goal:** Replace the generic smooth-cylinder `Cd(Re)` with a fit derived from
fishing-gear hydrodynamics literature (FAO Fisheries Technical Paper 222,
marine-engineering mooring-line studies) for monofilament and braid at
Re ≈ 40–600.

**Current model** (`physics.js:30–34`):
```js
export function lineCd(reynolds) {
    if (!reynolds || reynolds <= 0) return 1.0;
    const reClamped = Math.max(reynolds, 0.1);
    return Math.min(10.0, 1.0 + 10.0 * Math.pow(reClamped, -2.0 / 3.0));
}
```

This is White 1991's fit for smooth circular cylinders — academically standard
but NOT calibrated for fishing monofilament/braid which has:
- Surface texture (extruded mono, braided fibers) that trips the boundary layer
  at lower Re than a smooth cylinder
- Elliptical vs. perfectly circular cross-section (tension flattens line slightly)

**Target:** FAO Fisheries Technical Paper 222, "Introduction to Fishing Gear
Technology" (Fridtjof Fyhn / Arne Kvitberg) + follow-up studies on sheared
geometry in nylon monofilament under tension. Replace the White fit with a
piecewise or fitted lookup table:

```
Cd(Re) = 
  Re < 10     → 1.8 (Stokes regime, not relevant)
  10 ≤ Re ≤ 30  → 1.2   (cable literature, e.g. DNV-RP-H103)
  30 < Re < 500 → 1.0   (monofilament plateau per FAO 222)
  Re ≥ 500     → 0.8  (fully separated)
```

The key difference: real fishing line hits a drag plateau of ~0.8–1.0 in the
Re=100–500 range, while White 1991 gives ~1.3. This ~25% reduction in drag
is physically meaningful and propagates through `lineDragPerFt` → `hgt`.

**Files:** `physics.js` (±4 lines), `sanity_pass.cjs` (+1 frozen baseline)

<a id="physics-substrate-z0"></a>
## Phase B: HydroATLAS substrate → real bed roughness z₀

**Goal:** Replace the water-type-guessed z₀ with a physically measured
substrate-derived value from HydroATLAS RiverATLAS data.

**Data source:** HydroATLAS RiverATLAS (version 1) — soils & geology
attributes per river reach at ~500m intervals. CC-BY license. Downloadable
geodatabase (2.3 GB for global; PNW subset ≈ 50 MB).

**Processing pipeline:**
```
scripts/extract_river_substrate.py
  1. Read HydroATLAS RiverATLAS .gdb for 5 core rivers
     (Puyallup, White, Carbon, Green, Nisqually)
  2. Extract soil_cly_avg, soil_slt_avg, sand_percent (or equivalent)
  3. Map soil composition → D₅₀ → z₀:
     clay/silt   (D₅₀ ≈ 0.002mm)  → z₀ = 0.000165m
     fine sand   (D₅₀ ≈ 0.2mm)    → z₀ = 0.0005m
     coarse sand (D₅₀ ≈ 1mm)      → z₀ = 0.003m
     gravel      (D₅₀ ≈ 10mm)     → z₀ = 0.008m
     cobble      (D₅₀ ≈ 100mm)    → z₀ = 0.016m
     boulder     (D₅₀ ≈ 500mm)    → z₀ = 0.041m
  4. Output to src/data/river_substrate.js (same lat/lon/interval format
     as spot_widths.js)
```

**Frontend:**
- `continuity.js`: add `spotNearestSubstrate(siteId)` — same nearest-neighbor
  Haversine lookup as `spotNearestWidth`, returns `{ d50_mm, z0_m }`.
- `drift-model.js` `z0FromWaterType()`: add a third tier (above the fallback):
  1. `spotNearestSubstrate().z0_m` (measured substrate)
  2. `Z0_BY_TYPE[waterType]` (water-type estimate)
  3. `0.00825` (hardcoded default)

**Files:** `scripts/extract_river_substrate.py` (new, ~80 lines),
`src/data/river_substrate.js` (generated, ~5 KB),
`continuity.js` (+15), `drift-model.js` (+3)
## F5a-F5f: Hatchery escapement pipeline — COMPLETE

**Commit:** `f3a9862`

**What was done:**
- F5a-F5b: Researched Socrata, updated escapementFacilities (28/32 gauge IDs)
- F5c-F5d: Updated hatcheryEscapement (28 run-specific entries), filled wdfw_forecasts.json
- F5e: Species by run — bucketName preserves run, two-pass matching in refreshEscapement/hero.js
- F5f: Verification — sanity 43/43, build OK, 32 tests passed

---
