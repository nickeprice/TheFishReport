
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

<a id="data-chain-fix"></a>
## Phase 0: Code changes (already committed)
- Chain solver removed — `presentationHeightInches` catenary is the correct drift-fishing model
- Lat/lon blended width (`blendedWidthFt`) on all 15 rivers
- Substrate z₀ from HydroATLAS wired into driftEnvironment
- Continuity.js: `spotWidthAt`, `spotWidthInterp`, `drainageWidthFt`, `spotSubstrateAt`

These are already in the codebase. Remaining work: run the extraction scripts.

<a id="data-expand-all"></a>
## Phase 0: Run extraction scripts

Run these 3 scripts in order to generate the expanded data files.

### 1a — SPOT_WIDTHS (precompute_spot_widths.py)

**Add 10 new rivers** to the RIVERS list. Each needs: `id`, `name`, `site_id`
(a primary gauge), `lat`, `lon`, `usgs_width_ft` for validation.

| New river | Primary gauge | Coords | USGS width |
|-----------|---------------|--------|-----------|
| snoqualmie | 12144500 | 47.52, -121.84 | 150 |
| skykomish | 12134500 | 47.81, -121.56 | 180 |
| snohomish | 12150800 | 47.86, -122.00 | 200 |
| skagit | 12200500 | 48.42, -122.33 | 250 |
| cedar | 12119000 | 47.49, -122.20 | 80 |
| cowlitz | 14243000 | 46.27, -122.91 | 300 |
| stillaguamish | 12167000 | 48.24, -122.12 | 160 |
| duwamish | 12113390 | 47.53, -122.28 | 200 |
| puyallup_upper | 12092000 | 46.97, -122.14 | 120 |
| white_lower | 12100490 | 47.22, -122.21 | 130 |

**Run:** `python3 scripts/tools/precompute_spot_widths.py`
→ regenerates `public/src/data/spot_widths.js` with ~3500 cross-sections
(~500m intervals × 15 rivers).

### 1b — RIVER_SUBSTRATE (extract_river_substrate.py)

**Expand RUNS list** from 5 to 15 entries. Each entry = `(key, name, lat, lon, buf)`.
Uses HydroATLAS spatial query by gauge coordinates. All 15 rivers get D₅₀ → z₀
for every ~500m reach.

**Run:** `python3 scripts/extract_river_substrate.py`
→ regenerates `public/src/data/river_substrate.js`.

### 1c — RIVER_WIDTHS (extract_river_widths.py)

**Expand GAUGES list** from 5 to 32 entries. Each entry = `(site_id, name, lat, lon)`.
Uses NAIP satellite imagery via Microsoft Planetary Computer STAC API.

| Gauge ID | Name | Lat | Lon |
|----------|------|-----|-----|
| 12101500 | Puyallup at Puyallup | 47.20843358 | -122.3270652 |
| 12093500 | Puyallup near Orting | 47.10 | -122.22 |
| 12096500 | Puyallup at Alderton | 47.15 | -122.24 |
| 12101470 | Puyallup at 5th St Bridge | 47.23 | -122.33 |
| 12096505 | Puyallup at E Main Bridge | 47.18 | -122.30 |
| 12092000 | Puyallup near Electron | 46.97 | -122.14 |
| 12094000 | Carbon near Fairfax | 47.02788105 | -122.0326105 |
| 12098500 | White near Buckley | 47.15118666 | -121.94981 |
| 12097850 | White below Clearwater | 47.10 | -121.86 |
| 12100490 | White at R Street | 47.22 | -122.21 |
| 12113000 | Green near Auburn | 47.3123228 | -122.2040082 |
| 12108800 | Green below Crisp Creek | 47.24 | -121.80 |
| 12113150 | Green above 277th St | 47.38 | -122.19 |
| 12113310 | Green below Meeker St | 47.50 | -122.22 |
| 12113340 | Green at 212 St | 47.40 | -122.21 |
| 12113350 | Green at Tukwila | 47.47 | -122.26 |
| 12113390 | Duwamish at Tukwila | 47.53 | -122.28 |
| 12112600 | Big Soos Creek | 47.32 | -122.18 |
| 12113347 | Mill Creek | 47.36 | -122.24 |
| 12089500 | Nisqually at McKenna | 46.93340268 | -122.5609345 |
| 12200500 | Skagit near Mt Vernon | 48.42 | -122.33 |
| 12194000 | Skagit near Concrete | 48.53 | -121.75 |
| 12144500 | Snoqualmie near Snoqualmie | 47.52 | -121.84 |
| 12149000 | Snoqualmie near Carnation | 47.66 | -121.90 |
| 12134500 | Skykomish at Gold Bar | 47.85 | -121.69 |
| 12150800 | Snohomish near Monroe | 47.86 | -122.00 |
| 12167000 | NF Stillaguamish | 48.24 | -122.12 |
| 14243000 | Cowlitz at Castle Rock | 46.27 | -122.91 |
| 14238000 | Cowlitz below Mayfield Dam | 46.50 | -122.57 |
| 14233500 | Cowlitz near Kosmos | 46.62 | -122.17 |
| 14240525 | NF Toutle below SRS | 46.35 | -122.35 |
| 12119000 | Cedar at Renton | 47.49 | -122.20 |
| 12115000 | Cedar near Cedar Falls | 47.42 | -121.77 |

**Run:** `/tmp/tfr_env/bin/python scripts/tools/extract_river_widths.py`
→ regenerates `public/src/data/river_widths.js`.

**Files:** `scripts/tools/precompute_spot_widths.py`, `scripts/extract_river_substrate.py`, `scripts/tools/extract_river_widths.py`

---

<a id="data-verify"></a>
## Phase 4: Verification

- `node sanity_pass.cjs --quiet` — confirm all exports exist, blended width
  returns non-null for sample gauges
- `npm run build` — Vite build succeeds
- `python -m pytest tests/ -q --tb=line` — gear sim tests pass

**Files:** `sanity_pass.cjs` (+3 baseline cases for blended width)
