# Plan Reference — Implementation Details

<a id="build-setup"></a>
## Phase V0: Setup & Scaffold

**Goal:** Create the build toolchain (`package.json` + `vite.config.js`), move data files to `public/`, and update all Python paths so the filesystem stays consistent.

**New files:**
- `package.json` — `npm init -y`, then `npm install vite @supabase/supabase-js vite-plugin-pwa leaflet`
- `vite.config.js` — Vite config with PWA plugin + `/api` proxy

**Files to move to `public/`:**
| File | Source | Destination |
|---|---|---|
| `washington.js` | `src/data/regions/washington.js` | `public/src/data/regions/washington.js` |
| `channel_measurements.js` | `src/data/channel_measurements.js` | `public/src/data/channel_measurements.js` |
| `river_widths.js` | `src/data/river_widths.js` | `public/src/data/river_widths.js` |
| `spot_widths.js` | `src/data/spot_widths.js` | `public/src/data/spot_widths.js` |
| Icons | `icons/*` | `public/icons/*` |
| Manifest | `manifest.json` | `public/manifest.json` |

**NOT moved:** `tackle.json` stays at `src/data/tackle.json` — Vite imports it statically at build time, Python scripts read/write it unchanged.

**Python output scripts — path updates (append `public/` prefix):**
| File | Line | Change |
|---|---|---|
| `scripts/tools/fetch_channel_measurements.py` | 67: `DEFAULT_OUT` | `"src/data/channel_measurements.js"` → `"public/src/data/channel_measurements.js"` |
| `scripts/tools/precompute_spot_widths.py` | 47: path join | `"src"` → `"public"`, `"src"` chain |
| `scripts/tools/extract_river_widths.py` | 50-51: `CHANNEL_MEASUREMENTS_JS`, `DEFAULT_WIDTHS_JS` | prepend `"public"` |

**Python API files — path updates (append `public/` prefix):**
| File | Path | Change |
|---|---|---|
| `api/water_report.py` | `REGION_CANDIDATES` | `"..","src",...` → `"..","public","src",...`; keep both candidates |
| `api/streamstats.py` | `spot_widths.js` read | `"..","src",...` → `"..","public","src",...` |
| `api/spot-geometry.py` | `spot_widths.js` read | `"..","src",...` → `"..","public","src",...` |

**Dev workflow after migration:** `python3 scripts/dev_server.py 8000` (term 1) + `npm run dev` (term 2).

---

<a id="build-split"></a>
## Phase V6: Split Oversized Files (<150 lines)

**Goal:** Split 6 files exceeding the 150-line target. The real token savings live here.

**Split map:**
| File (lines) | Into | Target |
|---|---|---|
| water.js (548) | water-gauge.js + water-weather.js + water-escapement.js | ~180ea |
| supabase.js (491) | supabase-client.js + supabase-auth.js + supabase-crud.js | ~165ea |
| chain.js (444) | chain-core.js + chain-forces.js + chain-shooting.js | ~150ea |
| tackle.js (363) | tackle-data.js + tackle-pickers.js | ~180ea |
| inputs.js (353) | inputs-constants.js + inputs-readers.js | ~175ea |
| report.js (348) | report-fetch.js + report-render.js | ~175ea |

**Pattern:** New focused files, thin re-export wrapper at original path. Callers unaffected.

**Token impact:** ~1,800 tokens/read → ~600 tokens/read. Per session: ~3,000-5,000 tokens saved.

---

<a id="build-deploy"></a>
## Phase V7: Ship & Validate

**Goal:** Build, test, PWA, deploy — everything works.

**Checklist:**
- [ ] `npm run build` exits 0, outputs to `dist/`
- [ ] `npm run preview` serves app — all tabs work
- [ ] Physics: `python -m pytest tests/test_physics_validation.py -q --tb=line`
- [ ] UI: `python -m pytest tests/test_ui_behavior.py -q --tb=line`
- [ ] API: `python -m pytest tests/test_api_contract.py -q --tb=line`
- [ ] `node sanity_pass.js --quiet` exits 0
- [ ] PWA offline: install → disconnect → app loads
- [ ] Vercel auto-deploys (detects Vite, runs build, serves dist/)
- [ ] Dev workflow: `python3 scripts/dev_server.py 8000` + `npm run dev`

**dev_server.py update:** `SERVE_ROOT = os.environ.get('TFR_SERVE_ROOT', os.path.join(ROOT, 'dist'))`

**Rollback:** Every phase is a separate git commit. Revert any independently.

---

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
