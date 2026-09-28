# Progress — status & milestones

**Where it stands:** UPDATE 3.0's scaling + trust core is built.

- **Phase 1 ✅** — `src/app.js` split into feature modules (2,460 → 24 lines), WA region
  registry, region-aware `api/water_report.py`, technique registry, legal hours from data.
- **Phase 2 ✅** — USGS WDFN OGC API migration (all 5 call sites; legacy kept as a fallback
  ahead of the Q1 2027 decommission), dynamic radial station discovery, NOAA CO-OPS tide
  pairing per waterbody, proxy hardening, interactive Leaflet station map.
- **Phase 3 🔶** — idempotent catch writes ✅, durable IndexedDB outbox ✅, reconciliation on
  `online`/resume/focus ✅. **Only 3.4 (optimistic UI + pending-sync badge) remains.**

**Next:** finish 3.4, then UPDATE 4.0 — engagement + native packaging (`docs/ROADMAP.md`).

**Recent log** (newest first; full history in `docs/CHANGELOG.md`):

- 2026-09-28 — Phase 3.3 outbox reconciliation + docs consolidation into `memory-bank/`.
- 2026-09-28 — Phase 3.1/3.2 durable IndexedDB outbox + idempotent writes (`clientId`).
- 2026-09-28 — Phase 2.5 Leaflet station map; cleanup pass (dead API fields, dead DB
  columns, stale docs/worktrees).

**Milestones:** v2.0 modular core · WA region registry (multi-state ready) · WDFN migration
(the Q1 2027 deadline is cleared) · offline-first catch pipeline.
