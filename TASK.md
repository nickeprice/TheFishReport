# ACTIVE — UPDATE 3.0 Phase 1: de-hardcode & modularize

Blueprint: [UPDATE_3.0.md](UPDATE_3.0.md) (executable) · [UPDATE_4.0.md](UPDATE_4.0.md) (roadmap).
Completed history (Phases A–H and 2.1–2.4.1) lives in [docs/ARCHIVE.md](docs/ARCHIVE.md).

STATUS: **1.1 complete** (app.js 2,460 → 24 lines, sanity 70/70). Next: **1.2 region registry**.

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
- [ ] **2.2** Two-step site discovery + optional server-side API key
- [ ] **2.3** Proxy hardening (User-Agent, caching, rate-limit, SSRF validation)
- [ ] **2.4** Interactive map — gauge picker + Level-A regulation panel + flow colour

## Deferred / follow-ups

- [ ] **1.4b** Technique/Species picker in both tabs + `GEAR_STYLES`/`GEAR_SPECIES`
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
