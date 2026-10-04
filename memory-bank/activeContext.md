# Active Context — Phase 1.1 Complete

## What Was Done (this session)

### Phase 1.1: Pre-compute channel widths at ~500m intervals along 5 rivers

**New files:**
- `scripts/precompute_spot_widths.py` — fetches river centerlines from OSM Overpass API, chains OSM ways into ordered paths, resamples at 500m Haversine intervals, runs `measure_width_elevation()` (3DEP DEM) at each point
- `src/data/spot_widths.js` — generated static lookup table (54KB)

**Data generated (379 points total):**
| River | Points | Length |
|-------|--------|--------|
| Puyallup | 71 | 35 km |
| White | 76 | 37.5 km |
| Carbon | 53 | 26 km |
| Green | 96 | 47.5 km |
| Nisqually | 83 | 41 km |

Each point includes: lat, lon, cum_m (cumulative river metres), wetted_ft, bankfull_ft, thalweg_m, truncated flag.

**Files modified:**
- `index.html` — loads `<script src="src/data/spot_widths.js">` after river_widths.js
- `sw.js` — `'/src/data/spot_widths.js'` added to SHELL_FILES
- `docs/SYMBOLS.md` — documented as row 4 in load-order table + data section

**Verification:** `node sanity_pass.js --quiet` → 199/199 GREEN

### Key Technical Notes
- River geometries come from OSM Overpass API (bbox-constrained per river to avoid wrong-river matches)
- DEM tile fetches can hang — use subprocess-per-river with 300s timeout (`scripts/run_all_spot_widths.py` pattern)
- Each river's DEM measurements take 2-4 minutes (71-96 points × ~0.3-2s per measurement)
- The `})` closing in `render_js()` was a bug (should be `}`) — FIXED before final generation
- R_EARTH_M = 6371000 must be defined before `haversine_m()` references it (Python scoping)

## Next Steps (Phase 1.3-1.9)

The plan's remaining Phase 1 items:

### 1.3 Fit depth rating curves at each gauge
- d = c × Q^f from existing channel measurements
- Add to channel_measurements.js alongside existing velocity fit

### 1.4 Nearest-neighbor search in continuity.js
### 1.5 Manning + continuity correction
- d_spot = d_gauge × (w_gauge / w_spot)^(3/5)
- v_spot = v_gauge × (w_spot / w_gauge)^(2/5)

### 1.6 Water type selector (UI)
- Dropdown: Pool / Riffle / Run / Glide with depth×vel multipliers
- Visual guide popup with SVG cross-section diagrams

### 1.7 Species selector in Gear Sim (UI)
### 1.8 Online DEM endpoint (api/spot-geometry.py)
### 1.9 Online StreamStats enhancement

## Architecture Summary
- `window.SPOT_WIDTHS.rivers` keyed by river id (`"puyallup"`, `"white"`, `"carbon"`, `"green"`, `"nisqually"`)
- Each river entry: `{ name, site_id, n_points, points: [{lat, lon, cum_m, wetted_ft, bankfull_ft, thalweg_m, truncated}] }`
- The lookup table works offline; Phase 1.4 will add nearest-neighbor search to `continuity.js`
