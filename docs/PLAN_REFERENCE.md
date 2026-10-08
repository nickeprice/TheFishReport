
<a id="fixing-run-timing"></a>
## F5: Hatchery Counts + Forecast Data

**Goal:** All four count fields (Forecast, Returned, Trapped, 5-Yr Avg) in the `[ RUN & TIMING ]` cards show real WDFW numbers instead of "--".

**Root causes:**
1. `escapementFacilities` in `water-weather.js` uses dead gauge IDs removed in F1 (14242500, etc.)
2. `hatcheryEscapement` entries have all `totalReturn/trapCount/fiveYrAvg` set to `null`
3. New gauge IDs (12097850, 12144500, 14243000) have no hatchery entries at all
4. `wdfwForecast` in `hero.js` is hardcoded to `null` — forecast source never wired up
5. Species name mismatches between Socrata (`species` field) and calendar species (`washington.js` stocks)

### Execution steps

### S1: Research — query Socrata for exact facility names, species, and event types
```bash
curl "https://data.wa.gov/resource/9q4e-xhag.json?$select=distinct facility&$where=event='Trap Estimate'"
curl "https://data.wa.gov/resource/9q4e-xhag.json?$select=distinct species&$where=event='Trap Estimate'"
curl "https://data.wa.gov/resource/9q4e-xhag.json?$select=distinct event&$where=facility='VOIGHTS CR HATCHERY'"
```
**Purpose:** Verify facility names, discover actual species values, confirm event filters.

### S2: Update `escapementFacilities` — map all 32 gauge IDs
**File:** `src/services/water-weather.js` lines 131-146
- Add entries for every gauge ID in our `discovery_pool`
- Seasonal gauges mirror the same facility pool as the main river gauge
- Remove dead IDs (14242500, 14240500, 14236000, 14241000, 12115000, 12155300)
- Leave unmapped: Nisqually, Duwamish, Big Soos, Mill Creek (no WDFW hatchery data → honest "--")

| Waterbody | Facility Names | Gauge IDs |
|---|---|---|
| Puyallup | VOIGHTS CR HATCHERY, PUYALLUP HATCHERY, CLARKS CR HATCHERY, WHITE RIVER HATCHERY, BUCKLEY TRAP, DIRU CREEK | 12101500, 12093500, 12096500, 12101470, 12096505, 12092000 |
| Carbon | (same Puyallup basin) | 12094000 |
| White | (same Puyallup basin) | 12097850, 12100490, 12101100 |
| Green | SOOS CREEK HATCHERY | 12113000, 12108800, 12113150, 12113310, 12113340, 12113350, 12112600, 12113347 |
| Nisqually | — (unmapped) | 12089500 |
| Skagit | MARBLEMOUNT HATCHERY | 12200500, 12194000 |
| Snoqualmie | FALLERT CR HATCHERY | 12144500, 12149000 |
| Skykomish | REITER PONDS | 12134500 |
| Snohomish | WALLACE RIVER HATCHERY (research needed) | 12150800 |
| Stillaguamish | SAMISH HATCHERY, HARVEY CREEK HATCHERY | 12167000 |
| Cowlitz | COWLITZ SALMON HATCHERY, COWLITZ TROUT HATCHERY | 14243000, 14238000, 14233500, 14240525 |
| Duwamish | — (unmapped) | 12113390 |
| Cedar | ISSAQUAH HATCHERY | 12119000, 12115000 |

**Risk mitigation:** All facility names must match Socrata `facility` field exactly (from S1 research).

### S3: Update `hatcheryEscapement` — add entries for all 32 current gauge IDs
**File:** `src/services/water-weather.js` lines 44-108
- Each entry's `stocks[].name` must match the `species` field in `washington.js` stocks
- Remove entries for dead gauge IDs
- `totalReturn/trapCount/fiveYrAvg` stay `null` (Socrata provides live numbers)

```js
'12144500': { system: 'Snoqualmie River', source: 'WDFW Fallert Creek Hatchery', stocks: [
    { name: 'Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Pink', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null }
]},
```

**Risk mitigation:** Species names are copied directly from `washington.js` — no mismatches.

### S4: Fill `wdfw_forecasts.json`
**Files:** `public/src/data/wdfw_forecasts.json`, `src/data/wdfw_forecasts.json`

Current structure (read to confirm):
```json
{ "waterbodies": { "puyallup": { "Chinook": 34000, "Coho": 48000 }, ... } }
```

- Waterbody IDs must match `[wb].id` from `washington.js`
- Species names must match the calendar species from `washington.js` stocks
- Omit waterbodies without WDFW forecasts (honest "--")

**Risk mitigation:** Read the existing file first, add missing waterbody entries, cross-reference species names.

### S5: Fix species name matching chain
**Files:** `src/features/telemetry/hero.js` (line 121), `src/services/water-escapement.js` (line 276-291)

- Socrata `species` field may differ from our calendar species
- If S1 research shows mismatches, add a mapping in `refreshEscapement()`:
  ```js
  var speciesMap = { 'Chinook Salmon': 'Chinook', 'Coho Salmon': 'Coho' };
  ```
- Cowlitz River has `Spring Chinook` + `Fall Chinook` — map Socrata `run` field to distinguish
- Unexpected species (Sockeye, Cutthroat) are filtered out by species name comparison

**Risk mitigation:** Research in S1 determines if mapping is needed. If Socrata species match our calendar species exactly, no mapping needed.

### S6: Verify — run sanity + test

1. `node sanity_pass.cjs --quiet` — must pass
2. Start dev server, inspect `[ RUN & TIMING ]` cards
3. Check `[data-count]` elements populated with numbers after Socrata fetch completes
4. Cross-check WDFW preseason forecast numbers for accuracy

### Rivers excluded from hatchery tracking (honest "--"):
- Nisqually — Tribal hatchery, not in WDFW Socrata dataset
- Duwamish — no dedicated hatchery facility
- Big Soos Creek — tributary of Green, counted under Soos Creek Hatchery
- Mill Creek — no dedicated hatchery facility

### Files affected:
- `src/services/water-weather.js` — `escapementFacilities`, `hatcheryEscapement`
- `src/services/water-escapement.js` — `fetchEscapementLive`, `refreshEscapement`
- `src/data/wdfw_forecasts.json` — forecast numbers per waterbody
- `public/src/data/wdfw_forecasts.json` — duplicate for Vite build output

---


<a id="fixing-bottom-bar"></a>
## F6: Fix Bottom Tab Bar Not Showing

**Goal:** The persistent bottom tab bar (Water Report / Gear Sim / Catch Log) renders and stays visible.

**Root cause:** The bar is `position: fixed; bottom: 0; z-index: 2500`. Possible causes of invisibility:
1. CSS conflict — `z-index` too low, or another element overrides it
2. Body padding — `body { padding-bottom: calc(56px + env(safe-area-inset-bottom)) }` might push content over it
3. JS error — A JS error before the bottom bar renders prevents it from appearing
4. The bar is inside `.tab-content` which might be hidden

**Fix:** Check rendering by inspecting the DOM. Ensure the `<nav id="bottom-tab-bar">` is outside all `.tab-content` divs. Verify z-index stacking relative to other fixed elements.

**Files:** `index.html`, `src/styles.css`

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
