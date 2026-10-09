
<a id="fixing-run-timing-s1"></a>
## F5a-F5f: Hatchery escapement pipeline — COMPLETE

**Commit:** `f3a9862`

**What was done:**
- F5a-F5b: Researched Socrata, updated escapementFacilities (28/32 gauge IDs)
- F5c-F5d: Updated hatcheryEscapement (28 run-specific entries), filled wdfw_forecasts.json
- F5e: Species by run — bucketName preserves run, two-pass matching in refreshEscapement/hero.js
- F5f: Verification — sanity 43/43, build OK, 32 tests passed

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


