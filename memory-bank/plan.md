# Fish Report — Multi-Phase Roadmap

## ✅ Phase 0: Chain Solver Integration (COMPLETE)
Branch: `feature/hydrodynamic-refactor`
- [x] Step 1: 10-test physics validation suite (pytest 10/10)
- [x] Step 2: Dynamic spot depth from continuity.js
- [x] Step 3: Submerged mass (density fallback 11.34) + Re clamping
- [x] Step 4: Substrate boundary clamping in chain.js
- [x] Step 5: Chain solver as primary presentation height
- [x] Step 6: Interception probability blended into score
- [x] Step 7: Frozen baselines re-pinned (sanity 198/198)
- [x] Debug console improvements: 🐛 toggle button, 📋 Copy All, rig input logging

## 🔜 Phase 1: Spot Geometry System
Goal: Replace `ratio: 1.0` with real DEM-based spot width + Manning-corrected depth/velocity

### 1.1 Pre-compute channel widths
- Run width_elevation.py at ~500m intervals along 5 rivers (~1,000 pts)
- Output: lat/lon/wetted_ft/bankfull_ft/thalweg_m per point

### 1.2 Create spot_widths.js lookup table (~50 KB)
- New data file, loaded as window.SPOT_WIDTHS
- Works offline, no API calls

### 1.3 Fit depth rating curves at each gauge
- d = c × Q^f from existing channel measurements
- Add to channel_measurements.js alongside existing velocity fit

### 1.4 Nearest-neighbor search in continuity.js
### 1.5 Manning + continuity correction
- d_spot = d_gauge × (w_gauge / w_spot)^(3/5)
- v_spot = v_gauge × (w_spot / w_gauge)^(2/5)

### 1.6 Water type selector (UI)
- Dropdown: Pool / Riffle / Run / Glide with depth×vel multipliers
- **Visual guide popup** — ⓘ button shows SVG cross-section diagrams
### 1.7 Species selector in Gear Sim (UI)
### 1.8 Online DEM endpoint (api/spot-geometry.py)
### 1.9 Online StreamStats enhancement

## 🔜 Phase 2: Progressive Enhancement Architecture
### 2.1 docs/ARCHITECTURE.md — tiered fallback pattern
### 2.2 Audit all data layers for online/cached/fallback tiers
### 2.3 Standardize output shape: { value, source, uncertainty }

## 🔜 Phase 3: Enhanced UI
### 3.1 Debug console persistence
### 3.2 Visual water type guide (SVG cross-sections)
### 3.3 Width slider supplement

Spec: docs/CHAIN_SOLVER.md

- [x] 1. Weight Setup dropdown — index.html, solver.js, rig.js, log.js, sanity
- [x] 2. lineNetBuoyancyPerFt() — physics.js, Archimedes net buoyancy per foot
- [x] 3. Weight submerged mass — already in tackleWeightPhysicsData()
- [x] 4. Salmon species registry — salmon.js: add Chinook/Steelhead/Coho params
- [x] 5. Gear mass parameter — interception.js: replace hardcoded 0.030kg
- [x] 6. D50 parameter — hydro.js: make MEDIAN_COBBLE_M overridable
- [x] 7. chain.js NEW — RK4 + shooting method + air catenary
- [x] 8. Wire chain solver into drift.js, remove cable/terminal/sinker
- [x] 9. DELETE cable.js, terminal.js, sinker.js
- [x] 10. Update index.html script tags, sw.js SHELL_FILES, bump version
- [x] 11. Sanity tests for chain solver, re-pin baselines

### Fixes
- [x] Fix Step 12: update foam/yarn/hook with spec-derived physics values (PU/EPS density, sphere geometry, Cd=1.05 hooks, validated yarn)
- [x] Fix Step 1.6: Extract water type guide to standalone module; fix brace nesting bug in solver.js
- [x] Fix Step 9: DELETE cable.js, terminal.js, sinker.js

### Physics Validation Tests

- [x] 1. Add rigorous physics validation tests: terminal velocity, Hooke's law + damping, low-Re line drag, shear profile boundaries, and bed contact + Coulomb friction

## ✅ Phase R: Repository Overhaul & Testing Optimization (COMPLETE)
Branch: `main` (applied directly)
- [x] Phase 1: Workflow overhaul & cleanup
- [x] Phase 2: Testing infrastructure prep
- [x] Phase 3: Schema-driven API contract tests
- [ ] Phase 4: Playwright behavioral UI tests
- [ ] Phase 5: Chain solver fuzzing via Playwright
- [ ] Phase 6: Strip orchestration tax from sanity_pass.js + CI