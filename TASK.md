# ACTIVE — UPDATE 3.0 Phase 3: offline outbox

Blueprint: [UPDATE_3.0.md](UPDATE_3.0.md) (executable) · [UPDATE_4.0.md](UPDATE_4.0.md) (roadmap).
Completed history (Phases A–H and 2.1–2.4.1) lives in [docs/ARCHIVE.md](docs/ARCHIVE.md).

STATUS: **Phases 1 + 2 COMPLETE**; Phase 3.2 (idempotency) done. Next: 3.1 IndexedDB outbox.
`sanity_pass.js` **82/82 GREEN** · `sw.js` `v2.02.01`.

## Phase 1 items (detail + file paths in UPDATE_3.0.md §13)

- [x] **1.1** Split `src/app.js` into feature modules — 24 lines, bootstrap only
- [x] **1.2** Region registry — `src/data/regions/washington.js` + `docs/CONTRACT_REGIONS.md`
- [x] **1.3** Region-aware `api/water_report.py` (constants at lines 12–24, 286, 677)
- [x] **1.4a** Technique registry + `drift.compute()` + `solver.js` split (behavior pinned)
- [ ] **1.4b** Technique/Species picker in both tabs + `GEAR_STYLES`/`GEAR_SPECIES` (deferred)
- [x] **1.5** Legal hours from `waterbody.legal_hours` (daylight/24hr/custom/unknown)

## Phase 2 — USGS WDFN migration (Q1 2027 deadline)

- [x] **2.1** WDFN migration — all 5 call sites done (telemetry, nearby, clarity/dv,
      browser momentum PT4H, station search incl. `stateCd=wa`); legacy kept as fallback
- [x] **2.2** Two-step site discovery — dynamic radial bbox discovery (registry pool now fallback only)
- [x] **2.3** NOAA CO-OPS dynamic tide pairing — nearest-station walk; Lewis River correctly shows no tides
- [x] **2.4** Proxy hardening — coord bounds, 429 rate limit, 60s report cache
- [x] **2.5** Interactive map — Leaflet gauge picker + legal-hours panel (tap-test outstanding)

## Phase 3 — Offline outbox

- [x] **3.2** Idempotency — client `clientId` → `ON CONFLICT (id) DO NOTHING` (no migration needed)
- [x] **3.1** IndexedDB outbox (in-memory mirror + write-through, legacy `catch_db` imported)
- [ ] **3.3** In-app reconciliation on `online` / `focus` / `resume`
- [ ] **3.4** Optimistic UI + pending-sync indicator

## Cleanup pass (2026-09-28, before 3.3)

- [x] Removed `src/data/riverRegulations.js` (loaded nowhere; the service worker was
      precaching it) + its `sw.js` `SHELL_FILES` entry
- [x] Dropped 4 dead API fields — `push_status`, `angler_desc`, `civil_in`, `civil_out`
      (computed and shipped, zero consumers) + `docs/CONTRACT.md` updated
- [x] Migration `20260928000100_drop_dead_columns`: dropped `cast_distance_ft` +
      `hook_location` and recreated `get_global_calibration` without them (its ACL was
      re-issued and verified identical; the RPC was then called live and returned the row)
- [x] Retired the stale `.kilo/worktrees/clumsy-college` git worktree
- [x] Refreshed `README.md`; `ARCHITECTURE.md` + `copilot-instructions.md` reduced to
      pointers (both were stale second copies of the rules)
- [ ] **OPEN DECISION (not cleanup):** `communitySonar()` skips any row whose
      `loc !== 'Fair'`, and nothing has ever populated that field — so the whole
      community-sonar path is inert. Fixing it CHANGES the Gear Sim's strike zone, so it
      needs a product call. See UPDATE_4.0 §3.2.

## Deferred / follow-ups

- [ ] **1.4b** Technique/Species picker in both tabs + `GEAR_STYLES`/`GEAR_SPECIES`
- [ ] **Update 4.0 §3.1** OAuth sign-in (Google + Apple) — mechanism, setup and the
      App Store 4.8 gotcha are captured in `UPDATE_4.0.md`; not started by design
- [ ] Propose `.clinerules` / `AGENTS.md` refinements (UPDATE_3.0.md §4.2) — show before applying

## Verification (whole phase)

- `find src -name '*.js' -print0 | xargs -0 -n1 node --check`
- `python3 -m py_compile api/water_report.py scripts/dev_server.py`
- `node sanity_pass.js` → green
- `sw.js` VERSION bumped whenever shell files change

## A fresh session reads ONLY

1. This file's ACTIVE items.
2. `UPDATE_3.0.md` §13 (checklists) + §5 (region registry schema).
3. The last ~20 lines of `CHANGELOG_INTERNAL.md`.
