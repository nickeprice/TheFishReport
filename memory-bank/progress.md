# Progress — status & milestones

**Where it stands:** UPDATE 3.0's scaling + trust core is built.

- **Phase 1 ✅** — `src/app.js` split into feature modules (2,460 → 24 lines), WA region
  registry, region-aware `api/water_report.py`, technique registry, legal hours from data.
- **Phase 2 ✅** — USGS WDFN OGC API migration (all 5 call sites; legacy kept as a fallback
  ahead of the Q1 2027 decommission), dynamic radial station discovery, NOAA CO-OPS tide
  pairing per waterbody, proxy hardening, interactive Leaflet station map.
- **Phase 3 ✅** — idempotent catch writes, durable IndexedDB outbox, reconciliation on
  `online`/resume/focus, and (3.4) optimistic UI: a just-logged catch paints immediately
  with a "Syncing..." badge that clears once the flush confirms.
- **Phase 4 ✅** — token-efficiency: `docs/SYMBOLS.md`, the `// public:` file headers, the
  four contracts, and doc hygiene. Only 4.5 (`api/lib/*.py` extraction) is open.

**Next:** UPDATE 4.0 — engagement + native packaging (`docs/ROADMAP.md`).

**Recent log** (newest first; full history in `docs/CHANGELOG.md`):

- 2026-09-28 — Temporal audit answered "are we mixing dates?": yes, but measured — the record is
  1977–2026 and the Puyallup is stable to <1% (**the White is the find: 1 measurement since 2010,
  now flagged**). Then shipped honest velocity display (true ft/s beside the anchored scale),
  near-you continuity (`continuity.js`, same-reach ±20% — no spot width exists yet), and the **v²
  drag law** (contract bump; baselines re-pinned). 106/106 green.
- 2026-09-28 — Width: measured NAIP-NDWI against the USGS field widths and proved it fails on
  **all five** rivers here (4 ft vs 215 ft at the Puyallup — glacial silt kills the green−NIR
  index). Replaced it with a dual-method extractor + a router that trusts a method only if it
  reproduces the USGS width (`scripts/width_elevation.py` reads the 3DEP DEM from AWS Terrain
  Tiles); the DEM validates at Puyallup only and the rest fall back to the measured truth.
- 2026-09-28 — Measured gauge velocity: the one-size `0.25 · Q^0.4` fit (which overstated the
  Puyallup ~2.3×) is replaced by per-gauge `v = a·Q^b` fitted from **USGS field measurements**,
  pulled by a new `scripts/fetch_channel_measurements.py` and anchored to the locked reference so
  `DRAG_REF`/strike zone keep their calibration (104/104 green).
- 2026-09-28 — Hygiene sprint H1–H3: `sw.js` `SHELL_FILES` ↔ `index.html` parity guard
  (kills a silent offline-cache drift bug), orphaned `src/services/schema.sql` deleted,
  over-target files recorded (101/101).
- 2026-09-28 — Phase 3.4 optimistic UI + pending-sync badge (`catch-log/pending.js`); sanity
  gains 8 runtime assertions on the pending logic (100/100).
- 2026-09-28 — Phase 3.3 outbox reconciliation + docs consolidation into `memory-bank/`.
- 2026-09-28 — Phase 3.1/3.2 durable IndexedDB outbox + idempotent writes (`clientId`).
- 2026-09-28 — Phase 2.5 Leaflet station map; cleanup pass (dead API fields, dead DB
  columns, stale docs/worktrees).

**Milestones:** v2.0 modular core · WA region registry (multi-state ready) · WDFN migration
(the Q1 2027 deadline is cleared) · offline-first catch pipeline.
