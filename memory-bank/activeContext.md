# Active Context — Phase 1.4-1.7 Complete

## What Was Done

### Phase 1.4-1.5: Nearest-neighbor + Manning correction
(Previous session - continuity.js updated with SPOT_WIDTHS nearest-neighbor lookup and Manning exponents)

### Phase 1.6-1.7: Water type selector + Species selector (UI)

**Files modified:**
- `index.html` — Gear Sim form:
  - Added Row 0 (first row): Water Type dropdown + ⓘ info button + Species dropdown
  - Water type options: Run (default), Pool, Riffle, Glide
  - Species options: —, Chinook, Coho (Silver), Pink, Chum, Steelhead
  - Both sync with the Catch Log form via `syncSelect()`
  - Added `#water-type-modal` with a dynamic guide that renders water type cards (icons, descriptions, multiplier values)
  
- `index.html` — Catch Log form:
  - Added Row 0 in gear-rows: Water Type + Species Caught (synced via `-log` pattern)
  - Both fields moved from the old Catch Result section into proper gear-rows

- `src/features/gear-sim/inputs.js` — Added `WATER_TYPES` constant array:
  - Pool: depth ×1.2, velocity ×0.7
  - Riffle: depth ×0.7, velocity ×1.3
  - Run (default): depth ×1.0, velocity ×1.0
  - Glide: depth ×0.9, velocity ×0.9
  - Plus `DEFAULT_WATER_TYPE = 'run'`

- `src/features/gear-sim/solver.js` — Updated:
  - `readRigFromForm()` now reads `waterType: getStr('water-type') || 'run'`
  - Added `waterTypeMultiplier(typeId)` — resolves water type id to multiplier object
  - Added `openWaterTypeGuide()` — renders water type cards and shows the modal
  - Added `closeWaterTypeGuide()` — hides the modal

- `src/features/gear-sim/techniques/drift.js` — Updated `compute()`:
  - Velocity: applies water type `velMul` after continuity/Manning correction
  - Depth: applies water type `depthMul` before the chain solver

- `docs/SYMBOLS.md` — Updated inputs.js, solver.js API listings
- `sanity_pass.js` — Updated gearRows count (12→14), GEAR_ORDER prepended with water-type,species

**Behavior change:**
- Water type selection adjusts the simulation velocity and depth for the local hydraulic habitat
- Species selection in the Gear Sim sets the target fish (was previously only in the Catch Log)
- Both fields sync bidirectionally between Gear Sim and Catch Log tab
- The ⓘ button opens a modal guide with descriptions of each water type

**Verification:** `node sanity_pass.js --quiet` → 199/199 GREEN

## Next Steps

### Phase 2: Progressive Enhancement Architecture

- **2.1** docs/ARCHITECTURE.md — tiered fallback pattern
- **2.2** Audit all data layers for online/cached/fallback tiers
- **2.3** Standardize output shape: { value, source, uncertainty }

## API Routes

| Route | File | Purpose |
|-------|------|---------|
| `/api/water_report` | `api/water_report.py` | Main water report (weather, flow, tide, windows) |
| `/api/nearby_stations` | `api/nearby_stations.py` | Server-side USGS gauge search for "Use My GPS" |
| `/api/spot-geometry` | `api/spot-geometry.py` | Nearest pre-computed DEM cross-section from SPOT_WIDTHS |
| `/api/spot_geometry` | (alias) | Python module name for `spot-geometry` (Vercel deploys by filename) |

### `/api/spot-geometry` contract

```http
GET /api/spot-geometry?lat=47.2&lon=-122.3
GET /api/spot-geometry?lat=47.2&lon=-122.3&site_id=12101500   # filter to one river

200 OK
{
  "ok": true,
  "result": {
    "lat": 47.20204,           // nearest DEM point lat
    "lon": -122.29149,         // nearest DEM point lon
    "cum_m": 32000,            // cumulative river distance from downstream end (m)
    "wetted_ft": 276.9,        // channel width at ~2m above thalweg (wetted proxy)
    "bankfull_ft": 308.8,      // width at highest measured elevation
    "thalweg_m": 6.77,         // thalweg elevation above sea level (m)
    "truncated": false,        // DEM window was too small
    "river": "Puyallup River",
    "site_id": "12101500",
    "distance_m": 681.8        // distance from requested point to nearest DEM point
  },
  "n_rivers": 5,
  "note": "pre-computed DEM cross-section (spot_widths.js)"
}

400 { "error": "lat and lon are required numeric query parameters" }
404 { "error": "no spot geometry found for the given coordinates", "n_rivers": 5 }
503 { "error": "spot geometry data unavailable" }
```
