# Unified Chain Solver

Spec: docs/CHAIN_SOLVER.md

- [x] 1. Weight Setup dropdown — index.html, solver.js, rig.js, log.js, sanity
- [x] 2. lineNetBuoyancyPerFt() — physics.js, Archimedes net buoyancy per foot
- [x] 3. Weight submerged mass — already in tackleWeightPhysicsData()
- [ ] 4. Salmon species registry — salmon.js: add Chinook/Steelhead/Coho params
- [ ] 5. Gear mass parameter — interception.js: replace hardcoded 0.030kg
- [ ] 6. D50 parameter — hydro.js: make MEDIAN_COBBLE_M overridable
- [ ] 7. chain.js NEW — RK4 + shooting method + air catenary
- [ ] 8. Wire chain solver into drift.js, remove cable/terminal/sinker
- [ ] 9. DELETE cable.js, terminal.js, sinker.js
- [ ] 10. Update index.html script tags, sw.js SHELL_FILES, bump version
- [ ] 11. Sanity tests for chain solver, re-pin baselines

### Fixes
