<!-- Phase A6 complete — detail deleted per protocol -->

<a id="ux-map-modal"></a>
## Phase Y1: Map as Full-Screen Station Selector

**Change:** Station modal opens to a full-screen satellite map instead of a list
panel with a hidden 260px map div. The map IS the station selector.

**Composite style (MapLibre):**
- Base: Esri World Imagery (raster satellite tiles)
- Overlay: OpenFreeMap vector tiles with road lines, place labels, water labels
- No toggle — satellite with labels is the permanent view

**Map chrome:**
- GeolocateControl (your GPS dot)
- Gauge pins (color-coded: green = live, grey = dormant)
- Saved spot stars
- Crosshair cursor always active
- Close X button in top-right corner

**Files:**
- `index.html` — new `<div id="map-modal">` overlay, full viewport; remove inline
  station-map div from station modal; keep existing station modal as the entry panel
- `map.js` — composite MapLibre style (raster + vector), open/close modal fns,
  `showStationMap()` replaced by `openMapModal()`
- `styles.css` — `.map-modal` full-screen overlay, close button, remove old
  `.map-tile-toggle-btn`, `.leaflet-*` dead CSS

---

<a id="ux-pin-drop"></a>
## Phase Y2: Tap-to-Pin + Floating Name Pill

**Change:** Tap map → pin drops + floating name pill appears above pin.
No bottom sheet, no modal-in-modal.

**Flow:**
1. Map crosshair cursor always active
2. Tap anywhere → pin drops with spring animation, pill appears above it
3. Pill contains: `[________] ✓` — type name or tap ✓ with empty field
4. Auto-name fallback: `"Spot at 47.2°N, 122.3°W"`
5. On save: pin becomes star, spots list updates, pill disappears

**Files:**
- `map.js` — onMapClick handler, pin placement, pill create/dismiss, save flow
- `spots.js` — auto-name fallback logic
- `styles.css` — `.map-pin-pill` with animation

---

<a id="ux-spot-chips"></a>
## Phase Y3: Saved Spots as Compact Pill Chips

**Change:** Saved spots render as pill chips above the river list instead of
rows with full-width buttons.

**Layout:**
- `.spot-chips` flex row: each chip is a compact pill with spot name
- "+" chip opens map to add a new spot
- Up to 6 chips, then "View all" link
- Chips appear above generic river content (personal > generic)

**Files:**
- `spots.js` — renderFavoriteSpots outputs chips
- `index.html` — `.spot-chips` container
- `styles.css` — chip styling

---

<a id="ux-river-finder"></a>
## Phase Y4: Filterable River Finder

**Change:** Replace static 15-river list with a search-as-you-type filter.

**Layout:**
- Text input at top: "Find a river..."
- As you type, rivers filter in real time by name match
- Empty filter shows: starred rivers → nearest rivers → "Show all 15" link
- Card-based layout for filtered results (2-column grid)
- Multi-gauge rivers (Puyallup) show all options inline, no collapse
- Star toggle in card header

**Files:**
- `picker.js` — rewrite renderPresets() with filter logic
- `index.html` — filter input above preset list
- `styles.css` — card grid, filter input

---

<a id="ux-polish"></a>
## Phase Y5: CSS Polish & Dead Code Removal

**Remove:**
- `.map-tile-toggle-btn`, `.map-tile-toggle-btn:hover`, `.map-tile-toggle-btn:active`
- `.leaflet-*` dead CSS (already partial)
- `.preset-group`, `.preset-group summary`, `.preset-group[open]`
- `.preset-row`, `.preset-star` (replaced by card layout in Y4)

**Add:**
- `.map-modal`, `.map-modal-content`, `.map-close-btn` styles
- `.map-pin-pill` (Y2 pill animation)
- `.spot-chips`, `.spot-chip` styles
- `.preset-card`, `.preset-card-header`, `.preset-card-row`, `.preset-card-sub`
- Ensure all touch targets ≥ 44px

**Files:** `styles.css`

---

<!-- H1 complete — detail deleted per protocol -->

<!-- H2 complete — detail deleted per protocol -->

<!-- H3 complete — detail deleted per protocol -->
<!-- H4 complete — detail deleted per protocol -->

<!-- H5 complete — detail deleted per protocol -->

<a id="data-forecast-pymupdf"></a>
## Phase A3: Add PyMuPDF to Forecast Scraper

**Change:** Add real PDF table extraction to `refresh_wdfw_forecast.py` via 
PyMuPDF (`pip install PyMuPDF`), replacing the broken stdlib zlib approach.

**Guardrails:**
- Extract **combined totals only** (hatchery + wild, never split)
- Fuzzy-match river names against `REGIONS.WA.waterbodies[].name`
- `--confirm` gate stays — script resolves + prints, human confirms before write
- Ambiguous extractions → leave `forecast: null`

**Files:**
- `scripts/refresh_wdfw_forecast.py` — add PyMuPDF extraction

---

<a id="data-hatchery"></a>
## Phase B: Hatchery Escapement — Map WDFW Facilities for All 15 Rivers

**Current:** Only 5 of 15 gauges mapped in `escapementFacilities` / 
`hatcheryEscapement`. The Socrata live feed (`data.wa.gov`) already works — 
just needs facility names.

**Currently mapped:**
- Puyallup basin: `12101500`, `12093500`, `12094000` (VOIGHTS CR, PUYALLUP, 
  CLARKS CR, WHITE RIVER, BUCKLEY TRAP, DIRU CREEK)
- Green: `12113000` (SOOS CREEK HATCHERY)
- Skagit: `12200500` (MARBLEMOUNT HATCHERY)

**Missing** (need WDFW facility name research):
- `12089500` — Nisqually River
- `12098500` — White River
- `12150800` — Snoqualmie River
- `12134500` — Skykomish River
- `12155300` — Snohomish River
- `12167000` — Stillaguamish River
- `14242500` — Cowlitz River
- `14240500` — Toutle River
- `14236000` — Lewis River
- `14241000` — Kalama River
- `12115000` — Cedar River

**Files:** `src/services/water.js`
---

<a id="ui-debug"></a>
## Phase C: Debug Pipeline → Supabase + Button Styling

**Report pipeline:**
- Currently dumps to Vercel `stderr` (ephemeral, invisible).
- Replace with Supabase `debug_reports` table.
- RLS: anonymous `INSERT` only, no `SELECT` from frontend.
- Migration: `supabase/migrations/<timestamp>_debug_reports.sql`

```sql
CREATE TABLE public.debug_reports (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  log_text text not null,
  page_url text,
  description text
);
alter table public.debug_reports enable row level security;
create policy insert_anon on public.debug_reports for insert to anon with check (true);
```

**Button styling** (`index.html` line 451):
- Copy All: yellow border (`#ff0`) + yellow text
- Report Issue: red border (`#f44`) + red text
- Buttons in a `.debug-toolbar` pinned top-right

**Files:**
- `api/report-issue.py` — write to Supabase instead of stderr
- `supabase/migrations/<timestamp>_debug_reports.sql` — migration
- `src/shared/debug.js` — update reportDebugIssue response handling
- `index.html` (line 451) — update inline styles + add toolbar wrapper
- `src/styles.css` — `.debug-toolbar` CSS rule
---

<a id="drift-nhdplus"></a>
## Drift Phase 0: NHDPlus API Integration

**Goal:** One fetch per report load gets reach-level attributes at the user's
GPS location. Feeds ALL subsequent phases.

**New file:** `src/services/nhdplus.js` (~50 lines)

```
public: fetchNhdPlus(lat, lon), NHDPLUS_CACHE_KEY
function fetchNhdPlus(lat, lon):
  1. Check localStorage cache — if cached point within 500m, return it
  2. Query EPA WATERS API (Network Flowline, buffer 500m)
     Fields: comid,gnis_name,streamorder,slope,lengthkm,totdasqkm,qb,
             va_MA,qa_MA,va_01–va_12,qa_01–qa_12
  3. Pick closest reach from results
  4. Cache in localStorage with GPS stamp
  5. Return object or null on failure (offline fallback)
```

**Integration:** `src/app.js` — call after GPS lock. Include `nhdData` in 
water report payload from `water.js`.

**Files:**
- `src/services/nhdplus.js` — NEW
- `src/app.js` — fetchNhdPlus() after GPS lock
- `src/services/water.js` — pass nhdData
- `sw.js` — add to SHELL_FILES, bump VERSION
- `docs/SYMBOLS.md` — entry

---

<a id="drift-hud"></a>
## Drift Phase 1: Fix HUD Messaging

**Goal:** Replace "hook depth (chain not converged)" with honest drift label.

**Edit `solver.js` line ~157:**
```
(out.hookDepthM && out.chainResult && out.chainResult.converged
    ? '; hook depth ' + (out.hookDepthM * 39.37).toFixed(1) + '"'
    : '; hook height ~' + hgt.toFixed(1) + '" (drift model)')
```

**Edit `styles.css`:** `.hud-drift-note { color: var(--text-muted); font-style: italic; font-size: 0.75rem; }`

**Files:** `solver.js` (~3 lines), `styles.css` (+3 lines)

---

<a id="drift-contact"></a>
## Drift Phase 2: Bottom Contact Check

**Goal:** Tell the angler if their weight reaches the bottom at this flow.

**Physics:**
```
v_terminal = sqrt(2 x submerged_weight / (p x Cd x A))
```

**New functions in `inputs.js`:** `weightTerminalVelocity()` and 
`assessBottomContact()`.

**NHDPlus integration:** reach slope → bed shear → accurate bed velocity.

**Files:** `inputs.js` (+30), `drift.js` (+5), `solver.js` (+5), 
`index.html` (+1 HUD), `styles.css` (+1 HUD style)

---

<a id="drift-forces"></a>
## Drift Phase 3: Complete Drift Force Model

**Goal:** Replace broken chain solver with a drift-specific model.

**Forces modeled:**
1. Weight submerged weight (pushes down)
2. Foam/yarn buoyancy (lifts up)
3. Leader drag in water column (log-law x Morison equation)
4. Mainline surface drag
5. Wind on mainline (from Open-Meteo)
6. Sliding vs fixed weight

**New function** `driftLeaderShape()` in `chain.js` (~50 lines)

**Water-type auto-detection from slope:**
```js
function detectWaterType(nhdData) {
    if (!nhdData) return null;
    var s = nhdData.slope;
    if (s < 0.0008 && nhdData.streamorder >= 5) return 'pool';
    if (s > 0.008) return 'riffle';
    if (s < 0.001) return 'glide';
    return 'run';
}
```

**Files:** `chain.js` (+50), `drift.js` (+20), `solver.js` (+8)

---

<a id="drift-coverage"></a>
## Drift Phase 4: Drift Coverage Score

**Goal:** Replace broken P(intercept) with "% of sweep through fish-holding
water."

**Extend WATER_TYPES in `inputs.js`:** Add `channelPosition` and 
`channelWidth` to each type.

**New function in `drift.js`:** `driftCoverageScore(waterType)`

**HUD:** `<p id="hud-coverage" class="hud-outlook"></p>`

**Files:** `inputs.js` (+4 fields per water type), `drift.js` (+25),
`solver.js` (+5), `index.html` (+1)

---

<a id="drift-flow"></a>
## Drift Phase 5: Flow-Adjusted Recommendations

**Data:** USGS Statistics Service. One REST call per gauge per report load:
```
https://waterservices.usgs.gov/rest/stat/service/stats
  ?sites=12101500&statParameterCd=00060&statTypeCd=all&format=json
```

**Why percentiles beat means:** River flows are log-normal. The p50 (median)
is "normal flow." The p10 says "unusually low."

**New functions in `inputs.js`:**
- `fetchFlowPercentiles(siteId)` — cached by station
- `flowAdjustedWeightRec(weightOz, flow, percentiles, nhdData, month)`

**Files:** `inputs.js` (+40), `drift.js` (+5), `solver.js` (+5),
`water.js` (+5)

---

<a id="drift-nhdplus-features"></a>
## Drift Phase 6: NHDPlus-Enhanced Features

All consume the single NHDPlus response from Phase 0.

| # | Feature | File | What |
|---|---------|------|------|
| 6a | Flow-vs-normal | `hero.js` | "% of Oct normal" |
| 6b | Auto river name | `log.js` | Replace deriveRiverName() |
| 6c | Ungauged context | `picker.js` | Reach data when no gauge |
| 6d | Bankfull blowout | `drift.js` | flow/qb > 0.8 |
| 6e | Stream order behavior | `zone-core.js` | 1-2/3-4/5-6 |

**Files:** `hero.js`, `log.js`, `picker.js`, `drift.js`, `zone-core.js`
---

<a id="drift-entry"></a>
## Drift Phase 7: River Entry Conditions

**Goal:** Tell angler if fish are staging in Puget Sound or actively entering
river.

**Data sources:** River temp (USGS), Sound temp (NOAA Tacoma 9446484),
Current flow (USGS), Flow p50 (Phase 5), 48hr rain (Open-Meteo), Tide (NOAA)

**Score formula in `report.js`:**
```js
function computeEntryScore(tempDiff, flowDeficit, rainSignal, tide) {
    var score = -tempDiff * 2 - flowDeficit * 3 + rainSignal * 2 + tide * 1;
    if (score < -3) return { band: 'heldeep', label: 'Fish holding deep' };
    if (score < 0)  return { band: 'staging' };
    if (score < 3)  return { band: 'entry' };
    return { band: 'active' };
}
```

**UI:** New inline panel. Color-coded: amber staging, green active, red hold.
Panel hidden when both sound temp and statistics unreachable.

**Files:** `water.js` (+15), `report.js` (+25), `hero.js` (+20),
`index.html` (+3 DOM), `styles.css` (+10)
