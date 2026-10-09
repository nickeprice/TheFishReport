
<a id="fixing-run-timing-s1"></a>
## F5a-F5f: Hatchery escapement pipeline — COMPLETE

**Commit:** `f3a9862`

**What was done:**
- F5a-F5b: Researched Socrata, updated escapementFacilities (28/32 gauge IDs)
- F5c-F5d: Updated hatcheryEscapement (28 run-specific entries), filled wdfw_forecasts.json
- F5e: Species by run — bucketName preserves run, two-pass matching in refreshEscapement/hero.js
- F5f: Verification — sanity 43/43, build OK, 32 tests passed

---



<a id="drift-data"></a>
## Phase 0: Data Wiring

**Goal:** Ensure all drift model inputs are available.

**Actions:**

1. **Add missing NHDPlus fields.** Extend `OUT_FIELDS` in `nhdplus.js` line 17
   to include `qc_01,qc_02,...,qc_12` (10-yr low monthly flow) and
   `qe_01,qe_02,...,qe_12` (10-yr high monthly flow), and the corresponding
   velocity fields `vc_*` and `ve_*`. Currently only `qa_*` and `va_*` are
   requested.

2. **Verify spot-width data flow.** `spotNearestWidth(siteId)` in `continuity.js`
   must return both `wetted_ft` and `bankfull_ft` for the active station's GPS
   location. Already implemented for 5 core rivers — verify it's connected so
   `driftDepth()` can consume it.

3. **Document wind dependency.** `State.currentWindMph` / `State.currentWindDir`
   come from Open-Meteo via the water report backend. They are only populated
   after the water report tab loads. The drift model reads them conditionally
   — null wind = treated as zero (no wind force).

**Files:** `nhdplus.js` (+1 for OUT_FIELDS)

<a id="drift-force-model"></a>
## Phase 1: Drift Force Model

**Goal:** Compute leader shape, hook depth, and bottom-contact state for the
current rig and environment. Replaces both the old catenary physics and the
chain solver.

**New file:** `drift-model.js`

### Model architecture

```
driftDepth(flow, siteId, nhdData)
  → { valueFt, source, uncertainty }

driftEnvironment(flow, siteId, nhdData)
  → { depthM, uSurface, uStar, z0, waterType, vBedMs, vSurfaceMs }

driftSlipSpeed(z, env, driftSpeedMs)
  → vSlipMs  (water velocity at z minus drift speed)

driftLeaderShape(rig, env, sweepAngle)
  → { hookDepthM, hookZM, leaderPoints[], converged }

driftBottomState(rig, env)
  → { state: 'dragging'|'bouncing'|'suspended', terminalVelMs, bedVelMs, note }
```

### Manning depth fallback (replaces hardcoded 6.0 ft)

When `spotDepthFt()` returns null (no USGS field measurements), estimate
depth from the Manning equation using data we already have:

```
d_ft = ( n * Q / ( w * sqrt(S) ) )^(3/5)
```

| Input | Source | Fallback if null |
|---|---|---|
| Q | getCurrentFlow() | 1040 CFS reference |
| w (ft) | spotNearestWidth().wetted_ft | null → fall through |
| S (slope) | State.nhdData.slope | null → fall through |
| n (roughness) | 0.035 — gravel-cobble textbook value | constant |

If any Manning input is null, try continuity estimate:
```
d_ft = Q / ( w * va_MM * 0.3048 * 3600 )
```
Where `va_MM` is NHDPlus mean monthly velocity (ft/s).

If both fallbacks fail: `driftDepth()` returns null. The drift model shows
what it can (velocity, bottom contact) and marks depth as unknown.

**Return shape:**
```
{ valueFt: number|null,
  source: 'measured'|'manning'|'continuity_estimate'|null,
  uncertainty: 0.10|0.30|0.40|null, note: string }
```

### The slip-speed insight

The rig drifts downstream at roughly the water speed at the weight's depth.
Water drag depends on the relative velocity between gear and water:

```
v_slip = u(z) - v_drift
```

`v_drift` = `u(z_weight) * (1 - friction_factor)` where friction_factor ≈ 0.1
when weight is dragging, ~0 when suspended.

Drag force on a leader segment:
```
F_drag = 0.5 * rho * Cd * A * v_slip^2
```
Since `v_slip << u(z)`, drag is ~100x smaller than the old stationary-line
model. This is the fundamental fix.

### Five modeled forces

1. **Weight submerged weight** — pulls the leader end down, reference anchor.
2. **Corky/yarn buoyancy** — pulls the hook end up (top boundary condition).
3. **Leader drag** — integrated along leader using v_slip at each depth.
4. **Wind on mainline** — small force, air is 800x less dense than water.
5. **Bottom contact** — normal force + friction when weight touches bed.

### 3-state bottom contact

```
v_term = sqrt(2 * W_submerged / (rho * Cd * A))
  (terminal velocity of weight sinking through still water)

v_term > 2 * v_bed   → 'dragging'  — weight rides bottom
v_term > v_bed       → 'bouncing'  — intermittent contact
v_term <= v_bed      → 'suspended' — blown out
```

### Water-type auto-detection

```
function detectWaterType(slope, streamorder):
    if slope == null: return 'run'
    if slope < 0.0008 AND streamorder >= 5: return 'pool'
    if slope > 0.008: return 'riffle'
    if slope < 0.001: return 'glide'
    return 'run'
```

Returns 'run' when NHDPlus data is unavailable.

**Files:** `drift-model.js` (new, ~200 lines), `drift.js` (call drift-model),
`solver.js` (+8 HUD fields)

---
---

<a id="drift-coverage"></a>
## Phase 2: Sweep + Coverage Score

**Goal:** Model the 45°R → 45°L sweep and compute what % of fish-holding water
the rig covers.

### Sweep model — 5 quasi-static snapshots

```angles = [-45°, -22.5°, 0°, +22.5°, +45°]```

At each angle:

1. `driftLeaderShape(rig, env, sweepAngle)` solves leader equilibrium at that
   sweep position.
2. Check: is hook inside the strike zone?
3. Check: does the water type match a fish-holding type?

### Water type extension

Add `channelPosition` and `channelWidth` to each WATER_TYPES entry:

```
pool:   channelPosition: 'center-deep', channelWidth: 0.3
riffle: channelPosition: 'spread',      channelWidth: 0.8
run:    channelPosition: 'center',      channelWidth: 0.5
glide:  channelPosition: 'edges',       channelWidth: 0.6
```

### Coverage score

Weighted by estimated time at each sweep angle:

```
coverage = sum(position_weight[angle] * isInZone(angle)) / sum(position_weight)
weighting: center = 3, mid = 2, edge = 1
```

**HUD:** `<p id="hud-coverage" class="hud-outlook"></p>`

**Files:** `drift-model.js` (+40 sweep + coverage), `drift.js` (+25),
`inputs-readers.js` (+4 fields per water type), `index.html` (+1)

---

<a id="drift-flow-rec"></a>
## Phase 3: Flow-Adjusted Recommendations

**Goal:** Recommend leader length and weight based on current vs normal flow.

### Flow vs normal

```js
function flowVsNormal(currentFlow, nhdData, month):
    key = 'qa_' + month.padStart(2)
    mean = nhdData ? nhdData[key] : null
    if mean == null or mean <= 0: return null
    return currentFlow / mean
```

### Recommendation table by ratio

```
r < 0.6   Very low   → lighter weight (1 size down), +1-2 ft leader
0.6-0.8   Low        → consider lighter weight or longer leader
0.8-1.2   Normal     → standard rig
1.2-2.0   High       → heavier weight (1 size up), -1 ft leader
r > 2.0   Very high  → heaviest weight, shortest leader, or wait
```

Silent when NHDPlus data is absent (null ratio).

**Files:** `drift-model.js` (+30), `solver.js` (+5), `index.html` (+1 line)

---

<a id="drift-cleanup"></a>
## Phase 4: Cleanup + Baselines

**Goal:** Remove all dead code; pin new model output in frozen baselines.

### Deletions

| Pipeline | Lines removed | Reason |
|---|---|---|
| Old catenary physics | drift.js 62-168 | Replaced by drift-model |
| Chain solver | drift.js 175-221 | Wrong physics model |
| interception.js | Entire file (~136 lines) | Flossing MC model, not needed |
| salmon.js | Entire file | Only consumed by interception |
| chain.js + helpers + shooting | 3 files, ~460 lines | Replaced by drift-model |

### New frozen baselines in sanity_pass.js

```
Phase 1 — drift leader shape at reference rig
  → hookDepthM = <pinned>
  → bottomState = 'dragging'
  → coverage = <pinned>

Phase 2 — flow-adjusted recommendation
  → flowVsNormal(2000, nhdData, 10) = <pinned>
```

### Tests

Fix or delete 3 failing gear sim integration tests.

**Files:** `drift.js` (-150, +30), `chain.js`, `chain-helpers.js`,
`chain-shooting.js`, `interception.js`, `salmon.js` (delete),
`sanity_pass.js` (+15 assertions), test files


