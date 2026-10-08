
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
