

<a id="fixing-map-colors"></a>
## F2: Map Gauge Color Coding + Seasonal Logic

**Goal:** Green = permanent, Yellow = seasonal (in season), Red = error state.

**New pin colors in `mapPinColor()`:**
- `#22c55e` green — permanent gauge with valid data
- `#eab308` yellow — seasonal gauge, currently in operational window
- `#ef4444` red — gauge that should have data (permanent or in-season seasonal) but reading is null

**New helper `mapPinIsSeasonal(site)`:** checks gauge_type + date vs season_start/season_end.

**New helper `mapPinHasError(station)`:** returns true when a gauge is expected to report but `cfs === null && gage === null`.

**Update `refreshStationMap()`:**
- After fetching stations, filter out seasonal gauges whose window doesn't include today
- Call `mapPinColor()` on each remaining station

**Update `stationPopupHtml()`:**
- Show gauge type badge: "PERMANENT" / "SEASONAL (MM/DD – MM/DD)"
- Show error badge when `mapPinHasError()` is true

---

<a id="fixing-legal-hours"></a>
## F3: Legal Hours Data — Per-River Records

**Goal:** Every tracked river has a verified `legal_hours` so "not verified" never appears.

**WDFW salmon/steelhead hours for Puget Sound rivers:**
| River | Legal Hours |
|---|---|
| Puyallup | daylight |
| Carbon | daylight |
| White | daylight |
| Green | daylight |
| Nisqually | daylight |
| Skagit | daylight |
| Snoqualmie | daylight |
| Skykomish | daylight |
| Snohomish | daylight |
| Stillaguamish | daylight |
| Cowlitz | daylight |
| Toutle | daylight |
| Lewis | daylight |
| Kalama | daylight |
| Cedar | closed (Seattle watershed — no fishing) |

**Changes to `washington.js`:** Set `legal_hours: "daylight"` for all rivers except Cedar (`"closed"`).

**Changes to `daynav.js`:**
- Handle `"closed"` rule → `"Legal Hours: River closed — no fishing"`
- Ensure `legalHoursLabel()` receives the correct rule from the waterbody registry

**Changes to `regulations.js`:**
- In `checkRiverStatus()`, pass the waterbody's `legal_hours` through so the daynav renders the correct label instead of "not verified"

---

<a id="fixing-map-cfs"></a>
## F4: Fix Map CFS/Gauge Values + New Data Sources

**Goal:** All gauge popups on the map show real-time CFS and gauge height, not "--". Add new data sources for forecasts, dam releases, and tides.**

**Problem:** `/api/nearby_stations` returns station list but may not include `cfs`/`gage` fields.

**Approach:**
1. Inspect what the API actually returns (run a test fetch)
2. If missing, fetch real-time USGS data for each gauge individually using `fetchCfsReadingsWdfn()` on the first marker render
3. Cache the readings so the user doesn't wait for N API calls

**New Data Sources to Integrate:**
1. **NOAA NWRFC (Northwest River Forecast Center)** — 10-day deterministic flow forecasts. Tells your users when the Puyallup or Green will blow out and when it will drop back into fishable shape.
   - API: `https://api.waterdata.usgs.gov/nwrfc/` (or directly via NWRFC REST)
2. **USACE CWMS Data API (Army Corps of Engineers)** — Live release schedules and pool elevations for Howard Hanson Dam (Green River) and Mud Mountain Dam (White River). If the Corps opens the spillway, users need to know before the water reaches them.
   - API: `https://cwms-data.usace.army.mil/cwms-data/`
3. **NOAA CO-OPS API (Tides & Currents)** — Station-specific water level predictions for the lower Puyallup, Nisqually, and Green rivers. Salmon push in on the tides.
   - API: `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter`

**Future Data Sources (add as separate F-phases after core fixings):**
4. **USGS 3DEP (3D Elevation Program)** — High-res DEMs for riverbed gradient and slope calculations (Phase D drift physics)
5. **OpenWater API (EPA)** — Stream order and velocity estimations for hydraulic drag
6. **Data.wa.gov Socrata API (WDFW)** — Hatchery escapement datasets via JSON for run timing cards

**Files:** `map.js` (hydrate cfs/gage for map markers), `src/services/water-forecast.js` (new: NWRFC), `src/services/water-dam.js` (new: USACE CWMS), `src/services/water-tide-noaa.js` (new: CO-OPS endpoint)

---

<a id="fixing-run-timing"></a>
## F5: Fix Run & Timing Section

**Goal:** The `[ RUN & TIMING ]` section renders species cards with run windows and hatchery data.

**Root cause investigation:**
1. `buildSpeciesCalendarHtml()` is called with `rep.species_calendar` and `rep.esc_stocks`
2. If the API returns null for either, or the array is empty, the section renders blank
3. If `stocks` in the waterbody registry is null, there's no baseline to compare against

**Fix:**
1. Check if the API payload includes `species_calendar` — if not, backend may need updating
2. Populate `stocks` in `washington.js` for all tracked rivers (use known run timing from WDFW)
3. If the API falls back to registry stocks, `buildSpeciesCalendarHtml()` uses those

---

<a id="fixing-ui-buttons"></a>
## F6: Fix Bottom Tab Bar + Remove Refresh/Bug Buttons

**Goal:** Bottom tab bar renders; refresh ⟳ and bug 🐛 buttons removed from top nav.

**Remove from `index.html` lines 33-34:**
```html
<!-- DELETE both buttons from #top-nav -->
```

**Bottom tab bar debug:**
1. Check for JS errors that prevent the HTML from rendering
2. The bar is `position: fixed; bottom: 0` with `z-index: 2500` — ensure no other element masks it
3. Verify `body { padding-bottom: calc(56px + ...) }` doesn't push content too far

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

**Goal:** Recommend leader length / weight based on current flow vs normal.

**Primary data — NHDPlus monthly estimates (already cached in State.nhdData):**
- `qa_01`–`qa_12` — mean monthly flow (CFS) by calendar month
- `qc_01`–`qc_12` — 10-yr low monthly flow
- `qe_01`–`qe_12` — 10-yr high monthly flow
- Same pattern for velocity: `va_*`, `vc_*`, `ve_*`

**Why NHDPlus first:** Works for ALL reaches (gauged + ungauged). Zero extra REST calls.
Compare current USGS flow against the NHDPlus monthly mean for that month.
Always falls back cleanly — if NHDPlus data is absent, skip to USGS stats.

**Fallback — USGS Statistics Service** (gauged sites only):
```
https://waterservices.usgs.gov/rest/stat/service/stats
  ?sites=12101500&statParameterCd=00060&statTypeCd=all&format=json
```

**New functions in `inputs.js`:**
- `flowVsNormal(currentFlow, nhdData, month)` — compare against NHDPlus monthly mean
- `flowAdjustedWeightRec(weightOz, flow, nhdData, month)` — weight recommendation

**Files:** `inputs.js` (+35), `solver.js` (+5), `styles.css` (+5)

---

<a id="drift-nhdplus-features"></a>
## Drift Phase 6: NHDPlus-Enhanced Features

All consume the single NHDPlus response from Phase 0 (`State.nhdData`).

| # | Feature | File | What |
|---|---------|------|------|
| 6a | Flow-vs-normal | `hero.js` | "% of normal" using NHDPlus monthly mean (`qa_MM`) vs current USGS flow |
| 6b | Auto river name | `log.js` | Replace `deriveRiverName()` with `gnis_name` from NHDPlus |
| 6c | Ungauged context | `picker.js` | Show reach data (streamorder, slope) when a selected station has no gauge |
| 6d | Bankfull blowout | `drift.js` | NHDPlus doesn't have `qb` — approximate via `qe_MM` (high flow) × 1.5 or skip |
| 6e | Stream order behavior | `zone-core.js` | 1-2: small, 3-4: medium, 5-6: large river behavior |
| 6f | Streamgage cross-ref | `report.js` | Look up NHDPlus reach via USGS site ID (Layer 0) when GPS unavailable |

**Notes:**
- `qb` (bankfull flow) is NOT in the API fields — use `qe_MM` × 1.5 as proxy or remove
- Layer 0 (Streamgage) links `source_featureid` (USGS site ID) → `flcomid` (NHDPlus COMID) — enables reach lookup by station pick, not just GPS

**Files:** `hero.js`, `log.js`, `picker.js`, `drift.js`, `zone-core.js`, `report.js`
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
