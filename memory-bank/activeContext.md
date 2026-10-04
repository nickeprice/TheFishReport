# Active Context — Hydrodynamic Refactor + Spot Geometry

## Previous Work (Phase 0 — DONE)

**Branch:** `feature/hydrodynamic-refactor`

All 7 steps of the chain solver integration are complete on this branch. The chain solver is wired as the primary presentation height in drift.js, with interception probability blended into the score. Debug console has 🐛 toggle and 📋 Copy All. Frozen baselines re-pinned.

**Verification:**
- `python3 -m pytest tests/ -v` → 10/10 pass
- `node sanity_pass.js --quiet` → 198/198 pass (ALL GREEN)

## Current Findings (DEM Valley Width Research)

### Existing Infrastructure
- `scripts/width_elevation.py` already has validated method for measuring channel width from 3DEP DEM
- At Puyallup gauge: elevation method gives 202ft vs USGS 215ft (94% accuracy)
- At user's spot (47.2008, -122.2896): wetted width = 202ft (same as gauge, 1.5km downstream)
- Data source: AWS Terrain Tiles (z15, ~3.25m/pixel), free, no API key
- `src/data/channel_measurements.js` has 234 field measurements per gauge with Q/w/a/v

### Key Design Decisions Made
1. **Layered estimation cascade** (online → cached → pre-computed → fallback) — applied app-wide
2. **Manning + continuity correction**: d_spot = d_gauge × (w_gauge/w_spot)^(3/5)
3. **Water type multipliers**: Pool x1.3 depth/x0.7 vel, Riffle x0.7/x1.3, Run x1.0/x1.0, Glide x1.1/x0.85
4. **Visual water type guide**: ⓘ popup with SVG cross-section diagrams
5. **Species picker** goes into Gear Sim form (auto-fills Catch Log)
6. **Width slider** supplement for manual override

## Multi-Phase Plan

See `memory-bank/plan.md` for the full roadmap:
- **Phase 1**: Spot Geometry System (DEM widths, Manning, rating curves, water type + species UI)
- **Phase 2**: Progressive Enhancement Architecture (tiered fallback docs)
- **Phase 3**: Enhanced UI (debug persistence, visual guide, width slider)

## Files Modified in Phase 0
- `tests/test_physics_validation.py` — self-weight correction in Test 2
- `tests/test_physics_benchmarks_extended.py` — Tests 6-10
- `src/features/gear-sim/techniques/drift.js` — chain solver as primary hgt, dynamic depth, scoring blend
- `src/features/gear-sim/inputs.js` — density fallback 11.34
- `src/features/gear-sim/physics.js` — Re clamping in lineDragPerFt
- `src/features/gear-sim/chain.js` — substrate boundary clamping
- `src/features/gear-sim/solver.js` — enhanced debug logging
- `src/shared/debug.js` — toggle button, copy all
- `src/app.js` — URL param override (?station=, ?lat=&lon=)
- `index.html` — 🐛 debug toggle button
- `sanity_pass.js` — re-pinned all 6 frozen baselines
- `memory-bank/activeContext.md` — this file
