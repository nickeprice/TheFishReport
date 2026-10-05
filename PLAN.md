# Fish Report — Active Plan

All prior phases (0 Chain Solver Integration, 1 Spot Geometry System,
2 Progressive Enhancement Architecture, 3 Enhanced UI,
R Repository Overhaul & Testing Optimisation) are complete.

Active task list begins below.

---

## ✅ Gear Sim — Named Rig Presets (localStorage MVP)

- [x] Rig presets: localStorage MVP

---

**Active tasks use checkboxes (`- [ ]`) only. Future ideas go in `docs/ROADMAP.md`.**

---

## 🔄 Rebuild Gear Sim for Drift Fishing

**Root cause:** The chain solver models a static suspended rig. Drift fishing
is fundamentally different — weight bounces bottom, line is slack, rod sweeps
1→10 o'clock. The sim needs drift-aware physics.

**Data backbone:** NHDPlus v2.1 via EPA WATERS API. One call per report load,
cached in report snapshot for offline. Provides per-reach: slope, stream order,
bankfull discharge, mean annual flow, monthly norms, drainage area.

**All phases ship independently. Build in order, pause between each.**

**Bed type:** Default to gravel-cobble (ROUGHNESS_COBBLE = 0.00825m). No
per-reach riverbed composition dataset exists at useful resolution. User can
still override via the existing D50 mechanism in hydro.js.

---

### Phase 0: NHDPlus API Integration (data pipeline)

**Goal:** One `fetch()` per report load gets reach-level attributes at the
user's GPS location. Feeds ALL subsequent phases.

#### New file: `src/services/nhdplus.js` (~50 lines)

```
public: fetchNhdPlus(lat, lon), NHDPLUS_CACHE_KEY

function fetchNhdPlus(lat, lon):
  1. Check localStorage cache — if cached point within 500m, return it
  2. Query EPA WATERS API (Network Flowline, buffer 500m)
     URL: watersgeo.epa.gov/arcgis/rest/services/.../2/query
     Fields: comid,gnis_name,streamorder,slope,lengthkm,totdasqkm,qb,
             va_MA,qa_MA,va_01–va_12,qa_01–qa_12
  3. Pick closest reach from results
  4. Cache in localStorage with GPS stamp
  5. Return object or null on failure (offline fallback)
```

#### Integration: `src/app.js` — call after GPS lock

```
if (typeof fetchNhdPlus === 'function' && window.userGPSCoords) {
    window.nhdData = await fetchNhdPlus(lat, lon);
}
```

#### Integration: `src/services/water.js`
Include `nhdData` in the water report payload.

#### Files:
- `src/services/nhdplus.js` — NEW
- `src/app.js` — fetchNhdPlus() after GPS lock
- `src/services/water.js` — pass nhdData
- `sw.js` — add to SHELL_FILES, bump VERSION
- `docs/SYMBOLS.md` — entry

- [ ] Phase 0: NHDPlus API Integration

---

### Phase 1: Fix HUD — stop showing chain failure as error

**Goal:** Replace `hook depth (chain not converged)` with honest drift label.

#### Edit `src/features/gear-sim/solver.js` line 157

Replace:
```
(out.hookDepthM ? '; hook depth ' + out.hookDepthM.toFixed(2) + ' m'
 : '; hook depth (chain not converged)')
```
With:
```
(out.hookDepthM && out.chainResult && out.chainResult.converged
    ? '; hook depth ' + (out.hookDepthM * 39.37).toFixed(1) + '"'
    : '; hook height ~' + hgt.toFixed(1) + '" (drift model)')
```

#### Edit `src/styles.css`
```css
.hud-drift-note { color: var(--text-muted); font-style: italic; font-size: 0.75rem; }
```

#### Files: `solver.js` (~3 lines), `styles.css` (+3 lines)

- [ ] Phase 1: Fix HUD messaging

---

### Phase 2: Bottom Contact Check

**Goal:** Tell the angler if their weight reaches the bottom at this flow.

**Physics:** Terminal settling velocity balances drag against submerged weight:
```
v_terminal = sqrt(2 × submerged_weight / (ρ × Cd × A))
submerged_weight = (ρ_lead − ρ_water) × g × (mass / ρ_lead)
```

#### New functions in `src/features/gear-sim/inputs.js` (~30 lines)

```js
function weightTerminalVelocity(weightOz, shape) {
    var massKg = weightOz * 0.0283495;
    var volM3 = massKg / 11340;
    var submerged = (11340 - 1000) * 9.81 * volM3;
    var areaM2 = null, cd = 0.47;
    if (typeof tackleWeightPhysicsData === 'function') {
        var w = tackleWeightPhysicsData(shape, weightOz);
        if (w) { areaM2 = (w.areaCm2 || 0) * 1e-4; cd = w.cd || 0.47; }
    }
    if (!areaM2 || areaM2 <= 0) {
        var d = 0.014 * Math.pow(weightOz, 1/3); // sphere approx
        areaM2 = Math.PI * (d/2) * (d/2);
    }
    return Math.sqrt(2 * submerged / (1000 * cd * areaM2));
}

function assessBottomContact(weightOz, shape, bedVelMs) {
    var vt = weightTerminalVelocity(weightOz, shape);
    if (!vt) return { status: 'unknown', ratio: 0 };
    var r = bedVelMs / vt;
    if (r < 0.7) return { status: 'bouncing', ratio: r };
    if (r < 1.0) return { status: 'light', ratio: r };
    return { status: 'floating', ratio: r };
}
```

#### NHDPlus: reach slope → bed shear → accurate bed velocity
```
τ_bed = ρ × g × depth × nhdData.slope
u* = sqrt(τ_bed / ρ)
bedVelMs = (u*/0.41) × ln(z0 / z0_eff)
```

#### Integration in `drift.js`: `assessBottomContact(weightOz, weightShape, bedVelMs)`
#### HUD: `<span id="hud-bottom-contact" class="hud-drift-note">`

---

### Phase 3: Complete Drift Force Model

**Goal:** Replace the broken chain solver with a drift-specific model
accounting for ALL forces on the rig.

#### Forces modeled:
1. Weight submerged weight (pushes down)
2. Foam/yarn buoyancy (lifts up)
3. Leader drag in water column (log-law × Morison equation)
4. Mainline surface drag (line-on-water × surface velocity × line diameter)
5. Wind on mainline (from Open-Meteo report — already available)
6. Sliding vs fixed weight (sliding = free through eyelet)

#### New function: `driftLeaderShape()` in `src/features/gear-sim/chain.js` (~50 lines)

Single-pass integration from the bottom upward — no shooting method, no rod
tip constraint. Starts at the weight (z = zBed), traces leader upward through
the log-law velocity profile accounting for distributed drag at each depth.

Leader-in-water `f_drag(z) = ½ × ρ × Cd × D × u(z)²` per unit length

Mainline surface `f_drag = ½ × ρ × Cd × mlDia × u_surface² × lineOnWater`

Wind on mainline adds or subtracts from surface velocity (upwind = more drag,
downwind helps).

#### Water-type auto-detection from NHDPlus slope

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

Auto-sets water-type dropdown. Falls back to manual when offline.

#### Integration in `drift.js` compute():
```
var driftShape = driftLeaderShape(rig, {
    depthM: H, uMax: ..., liftGf: liftGf, siteId: env.siteId,
    windMph: reportData ? reportData.wind_mph : 0,
    windFromUpstream: ...
}, nhdData);

if (nhdData && !userHasChosenWaterType)
    if (detectWaterType(nhdData)) setFieldValue('water-type', autoType);
```

#### Files: `chain.js` (+50), `drift.js` (+20), `solver.js` (+8)

- [ ] Phase 3: Complete drift force model

---

### Phase 4: Drift Coverage Score

**Goal:** Replace broken P(intercept) with "what % of sweep is through
fish-holding water?"

#### Extend WATER_TYPES in `src/features/gear-sim/inputs.js`:
Add `channelPosition` (tail/seam/edge/full) and `channelWidth` (fraction
of river width holding fish) to each water type.

Pool: tail, 0.3 | Riffle: full, 1.0 | Run: seam, 0.5 | Glide: edge, 0.4

#### New function in `drift.js`:

```js
function driftCoverageScore(waterType) {
    if (!waterType || !waterType.channelWidth) return { score: 0.5, label: 'mid-channel' };
    var sweep = 0.6;  // 1→10 sweep ≈ 60% of river width
    var score = Math.min(1.0, waterType.channelWidth / sweep);
    // position-specific labels
}
```

#### HUD: `<p id="hud-coverage" class="hud-outlook"></p>`

#### Files: `inputs.js` (+4 fields per water type), `drift.js` (+25),
         `solver.js` (+5), `index.html` (+1)

- [ ] Phase 4: Drift coverage score

---

### Phase 5: Flow-Adjusted Recommendations

**Goal:** Recommendations that change with conditions using per-gauge
historical data from USGS Statistics Service + NHDPlus reach data.

#### Data: USGS Statistics Service

One REST call per gauge per report load:

```
https://waterservices.usgs.gov/rest/stat/service/stats
  ?sites=12101500
  &statParameterCd=00060   (daily discharge in CFS)
  &statTypeCd=all
  &format=json
```

Returns per-day-of-year:
- p10, p25, p50 (median), p75, p90 percentile flow
- mean, min, max for that day

This replaces NHDPlus `qa_MA` (arithmetic mean, skewed by floods) with true
historical percentiles. The 50th percentile (median) IS "normal flow."

#### Why percentiles beat means

River flows are log-normal. A few big floods pull the mean way up, so
"1,060 CFS is 71% of mean" understates how low the river actually is.

| Measure | What 1,060 CFS on Oct 4 Puyallup means |
|---------|----------------------------------------|
| NHDPlus qa_MA (mean) | "71% of October mean (1,500 CFS)" |
| USGS p50 (median) | "60% of October median (1,770 CFS)" — slightly below normal |
| USGS **p10** | "**9th percentile** — only 9% of Octobers have been lower" |

The p10 percentile is the single most useful number: "this is unusually low."

#### New function in `inputs.js`:

```
function fetchFlowPercentiles(siteId)  — cached by station
function flowAdjustedWeightRec(weightOz, flow, percentiles, nhdData, month)
```

Flow-vs-normal label uses percentiles when available, falls back to
NHDPlus qa_MA or hardcoded default when offline.

#### Files: `inputs.js` (+40), `drift.js` (+5), `solver.js` (+5),
         `water.js` (+5) — fetch percentiles after gauge data

- [ ] Phase 5: Flow-adjusted recommendations

---

### Phase 6: NHDPlus-Enhanced Features (zero extra network cost)

All consume the single NHDPlus response from Phase 0.

| # | Feature | File | What |
|---|---------|------|------|
| 6a | Flow-vs-normal | `hero.js` | "1,060 CFS — 71% of Oct normal" |
| 6b | Auto river name | `log.js` | Replace deriveRiverName() with nhdData.gnis_name |
| 6c | Ungauged context | `picker.js` | Reach data when no USGS gauge |
| 6d | Bankfull blowout | `drift.js` | Replace fixed thresholds with flow/qb > 0.8 |
| 6e | Stream order behavior | `zone-core.js` | 1-2: stealth, 3-4: default, 5-6: migration |

- [ ] Phase 6a: Flow-vs-normal in water report
- [ ] Phase 6b: Auto river name in catch log
- [ ] Phase 6c: Ungauged reach context
- [ ] Phase 6d: Bankfull blowout detection
- [ ] Phase 6e: Stream order → fish behavior

---


- [ ] Phase 2: Bottom contact check