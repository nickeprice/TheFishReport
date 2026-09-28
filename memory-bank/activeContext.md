# ACTIVE — current work focus

STATUS: UPDATE 3.0 **COMPLETE** (Phases 1–4 shipped). Hygiene sprint **H1–H3 done**; H4 is
parked, and the two future buckets below are parked deliberately.

Blueprint (completed work): `docs/ARCHIVE_UPDATE_3.0.md` · Roadmap (next): `docs/ROADMAP.md`
· History: `docs/CHANGELOG.md` + `docs/ARCHIVE.md` · Status: `progress.md`.

## ACTIVE — hygiene sprint

- [x] **H1. `SHELL_FILES` ↔ `index.html` parity guard** — `sanity_pass.js`.
      `index.html` and `sw.js` `SHELL_FILES` are hand-maintained in PARALLEL, so a module
      added to one but not the other breaks offline caching *silently* (the app fetches a
      script the service worker never precached). Assert the two `src/*.js` subsets agree.
      The CDN script and the non-`<script>` shell assets (manifest, icons, `styles.css`) are
      intentionally in neither list.
      Potential bug: naive set-equality false-fails on those two exclusions.
      Verified: a probe script in `index.html` only → the guard FAILS naming the file; revert is
      byte-identical (`git diff` empty) → 101/101 green.
- [x] **H2. Delete the orphaned `src/services/schema.sql`** — self-labeled
      "DEPRECATED — superseded by `supabase/migrations/`", referenced by no code/CI/config,
      and already stale once (it still listed `corky_size`). Migrations + git history preserve
      it, so it is pure drift risk.
      Verified: `git rm`; no code/CI/config refs remain; it was never in `SHELL_FILES`, so no
      service-worker VERSION bump was required.
- [x] **H3. Record the over-target files honestly** — doc-only. Only `report.js` was tracked;
      the table below lists the rest so the debt stops being invisible.
- [ ] **H4. (PARKED — optional, lowest priority) de-monolith `sanity_pass.js`** (771 lines) —
      split the static-preflight / vm-runtime / dev-server sections into helpers.

## Over-target files

The <150-line target is soft, and these are recorded rather than urgently fixed:

| file | lines | note |
| --- | --- | --- |
| `src/utils/regulations.js` | 536 | WDFW rules engine — largest code file |
| `src/services/water.js` | 450 | USGS / Open-Meteo / WDFW data layer |
| `src/services/supabase.js` | 361 | auth + catch writes + feed + RPC |
| `src/features/telemetry/report.js` | 295 | one large function |
| `src/features/telemetry/daynav.js` | 183 | near target |
| `src/features/gear-sim/zone.js` | 180 | near target |

Exempt by rule: `src/data/*` (`washington.js` 254, `wdfw_rules.json` 11,222).

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

## Backlog — parked, do NOT build without an explicit call

**Future ideas** (features): a data-freshness gate for `wdfw_rules.json` plus a
regulation-change alert · a *source-status honesty panel* (which upstream is down, and why,
instead of a silent `--`) · a legal-hours countdown widget · "which rig fits today?" ·
an offline photo queue · a shareable location-free trip card · everything in Update 4.0's
Private Season / Crews / photos / River Pulse (`docs/ROADMAP.md`).

**Future tests / experiments** (validate later): a second region, to prove the multi-region
abstraction is real · technique + species expansion with rig presets · native packaging
(Capacitor) · extending the `vm` runtime-test pattern to
`regulations.js` / `physics.js` / `format.js` / `idb.js` · a visual/DOM test if a test
dependency is ever accepted.

## Verification (whole phase)

- `node sanity_pass.js` → green (it derives the script list from `index.html`).
- `python3 -m py_compile api/water_report.py scripts/dev_server.py`.
- Bump `sw.js` VERSION whenever shell files change.
