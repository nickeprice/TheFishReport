## Phase 0 Complete (2026-10-01)

**What shipped (commit 73d77be):**
- **0.1 Net corky buoyancy** — `parseFoam()` returns `net_buoyancy_g = buoyancy_g - mass_g`; all 4 call sites pass net values.
- **0.2 Yarn buoyancy sign** — CSV `buoyancy_per_inch_g` changed from `+0.01` (buoyant) to `-0.012` (sinking), matching JS default.
- **0.3 Yarn drag fields** — CSV/JSON yarn row carries `area_cm2=1.8`, `shape=cylinder`, `cd=0.8`. Converter updated.
- **0.4-0.5 Yarn/mainline drag wiring** — all 3 call sites verified using `tackleYarnDragData()` and `lineDragPerFt()` with null guards.
- **0.6 Sanity baselines re-pinned** — 149/149 passing. Physics test uses `net_buoyancy_g`; suggestions flipped to "running low".

**Plan status:** Phase 0 all items checked. Phases 1-8 ready to execute.

## Phase 1-8 Complete (2026-10-02) — Physics Engine Rebuild

**What shipped (commits b0c0f36..75d92cc):**

**New modules (6 added to src/features/gear-sim/):**

| File | Lines | Functions | Purpose |
|------|-------|-----------|---------|
| `hydro.js` | 116 | `logLawVelocity`, `uStarFromMax`, `velocityProfile`, `turbulenceFluctuation` | 3D log-law velocity field |
| `riverbed.js` | 140 | `bedElevation`, `contactForce`, `frictionForce`, `isSnagged` | Cobble-bed substrate & contact |
| `cable.js` | 114 | `cablePreset`, `cableNodes`, `resolveCable` | Lumped-mass cable dynamics |
| `sinker.js` | 101 | `sinkerForceBalance`, `sinkerBounceStep` | Bouncing sinker model |
| `terminal.js` | 74 | `terminalEquilibrium`, `vivFrequency`, `vivAmplitude` | Hook + corky/yarn equilibrium |
| `salmon.js` | 82 | `salmonState`, `salmonMouthCone`, `salmonPositionZ` | Target fish entity |
| `interception.js` | 84 | `interceptionRun`, `interceptionProbability` | Flossing state machine |

**Integration:**
- Extended `drift.js compute()` to run the new pipeline additively, outputting `hookDepthM`, `interceptionProb`, `sweepQuality`, `salmonDepthM`
- Extended `solver.js` `buildSimStats()` and `paintSimHud()` for new fields
- All modules wired into `index.html`, `sw.js` SHELL_FILES, `docs/SYMBOLS.md`
- `sw.js` VERSION → `v2.03.39`

**Verification:** 56 new sanity tests. **208/208 GREEN**. All baselines untouched.

**Notable decisions:**
- `cable.js` uses 10× convergence boost — physical stiffness ~10⁴ N/m makes direct integration glacial
- Drag sign corrected in `resolveCable`: flow pushes nodes downstream (+x)
- Seat probability model: `P = min(1, max(0, (v-0.5)/1.5))` — reliable above 2 m/s
- All modules under 150 lines; all literals carry `@provenance:` tags
