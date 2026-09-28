# ACTIVE — current work focus

STATUS: UPDATE 3.0 **COMPLETE** — Phases 1–4 all shipped (4.5, the `api/lib/*.py`
extraction, is the only open item). Next up is Update 4.0.

Blueprint (completed work): `docs/ARCHIVE_UPDATE_3.0.md` · Roadmap (next): `docs/ROADMAP.md`
· History: `docs/CHANGELOG.md` + `docs/ARCHIVE.md` · Status: `progress.md`.

## Ready to build

- [x] **3.4** Optimistic UI + pending-sync indicator — `src/features/catch-log/pending.js`.
      Pending outbox rows paint at the top of both scopes with a `.sync-badge`; a confirmed
      flush calls `refreshCatchLists()`. Verify: `node sanity_pass.js` (100/100).
- [ ] **Update 4.0** — engagement + native packaging. Read `docs/ROADMAP.md` and write the
      ACTIVE items here before starting.

## Open product decisions (do NOT build without an explicit call)

- [ ] **Inert community sonar.** `communitySonar()` skips every row whose `loc !== 'Fair'`,
      and nothing has ever populated that field — so the whole path is dead. Fixing it
      CHANGES the Gear Sim's strike zone. Recorded as a product decision in
      `docs/ROADMAP.md` §3.2.
- [ ] **1.4b** Technique/Species picker in both tabs plus `GEAR_STYLES`/`GEAR_SPECIES`
      (deferred: it needs real style tuning, not scaffolding).

## Deferred

- [ ] **OAuth sign-in** (Google + Apple) via `auth.linkIdentity` — mechanism, provider
      setup and the App Store 4.8 gotcha are captured in `docs/ROADMAP.md` §3.1. Not
      started by design.
- [ ] **Split `src/features/telemetry/report.js`** (294 lines, one large function) — over
      the <150-line feature-file target. Pure refactor: slice by exact line ranges with a
      byte-for-byte tiling assertion, then update `index.html` + `sw.js` SHELL_FILES.

## Verification (whole phase)

- `node sanity_pass.js` → green (it derives the script list from `index.html`).
- `python3 -m py_compile api/water_report.py scripts/dev_server.py`.
- Bump `sw.js` VERSION whenever shell files change.
