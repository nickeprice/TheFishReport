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
- [ ] **H4. (PARKED — optional, lowest priority) de-monolith `sanity_pass.js`** (850 lines) —
      split the static-preflight / vm-runtime / dev-server sections into helpers.

## ACTIVE — REMOVE rod length (instruction RECOVERED from session 1790604718924_nudti)

**Why this block exists:** the instruction was given twice in the previous chat —
"additionally im saying lets remove the rod length" (2026-09-28 20:56Z) and
"drop the rod_ft db column" (21:05Z). The agent replied
"Confirmed on the column — I'll drop `rod_ft` (migration, applied and verified live)"
and then **never did it**: no migration file exists, `public.catches.rod_ft` is still
live (`numeric`), and the app still writes it. It evaporated when the conversation
pivoted. It is written down here so it cannot happen again. Evidence: Cline session log
`logs/20260928T120538/window1/exthost/output_logging_20260928T122955/1-Cline.log`.
Also confirmed measured: rod length changes **no** Gear Sim number (24 scalar fields
identical across 9'0" / 9'8" / 12'0" — only the prose suggestion echoed it).

- [x] **R1. Delete the rod inputs from BOTH tabs** — `index.html` (Gear Sim + Catch Log
      "Row 1"). Weight keeps the row, so the frozen `gearRows === 12` guard still holds.
      Potential bug: the row is shared "Rod Length + Weight" — deleting the whole row
      would break the 6-rows-per-form assertion and drop the Weight control.
      Verified: the row comment now reads "Row 1: Weight"; sanity's "both gear forms use
      6 resting rows each" is still green (12 rows), and `grep -i rod index.html` is empty.
- [x] **R2. Remove the rod code paths** — `forms.js` (`getRodLengthFt`,
      `formatRodLength`, `onRodChange`), `rig.js` (save/restore, both tabs),
      `zone.js` (required-field gate), `solver.js` (`readRigFromForm` + `buildSimStats`),
      `catch-log/log.js` (payload), `techniques/drift.js` (read + the
      "Targeting … on a 9'0" rod …" suggestion).
      Potential bug: the drift suggestion goes 3 → 2, which the frozen baseline pins.
      Verified: the sentence was kept and only the rod clause dropped ("Targeting Chinook at
      1040 CFS with a mono 12lb leader."), so the frozen 3-suggestion shape needs no re-pin
      and the useful species/flow/leader context survives.
- [x] **R3. Stop writing/reading `rod_ft`** — `services/supabase.js` (write map + `asMyCatchRow`).
      Potential bug: writing a dropped column 400s (PGRST204), so this MUST land before R5.
      Verified: both the write map and `asMyCatchRow` no longer mention `rod_ft`; the code
      change landed before the migration (see R5).
- [x] **R4. Dead-code fallout** — with `flow`/`distance` already gone, `debounce.js`'s id
      list becomes empty, so the module is dead: delete it from `index.html`,
      `sw.js` `SHELL_FILES`, and `app.js`; drop the now-unused `.dual-input` CSS.
      Potential bug: missing any of the three references = ReferenceError at bootstrap;
      `sw.js VERSION` bump is required because the shell changed.
      Verified: file `git rm`'d; index.html tag, `SHELL_FILES` entry and the `app.js` call all
      gone; parity check green at **39 modules**; `VERSION` → `v2.03.07`.
- [x] **R5. Migration: drop `public.catches.rod_ft`** + recreate
      `get_global_calibration` without it (RETURNS TABLE cannot be altered → drop+create,
      and dropping the function drops its ACL → re-grant). Apply with
      `npx supabase db push --yes < /dev/null`, then verify live.
      Potential bug: 42P13 on an in-place signature change; a bare column drop would
      break the still-deployed old client that writes `rodFt`.
      Verified LIVE: `20260928235500_drop_rod_ft` recorded applied; 0 `%rod%` columns on
      `catches`; 0 hits for `rod_ft` in the RPC signature and body; `service_role` grant
      intact; `select count(*) from get_global_calibration(1040, null)` → 1 row.
- [x] **R6. Guard + docs** — `sanity_pass.js`: fixture loses `rodFt`, plus a NEW guard asserting
      `rod-ft`/`getRodLengthFt`/`rod_ft` appear nowhere in `index.html` or any loaded script so
      the field cannot silently return. (No suggestion re-pin was needed — the sentence kept its
      context, count stayed 3.) Updated `CONTRACT_CATCH.md`, `CONTRACT_TECHNIQUE.md`,
      `SYMBOLS.md`, `README.md`, `docs/CHANGELOG.md`.
      Verification: `node sanity_pass.js` GREEN; live `information_schema` shows no
      `%rod%` column; `get_global_calibration` returns no `rod_ft`.
      Verified: sanity **106/106 GREEN** with the new guard firing
      (`rod length is fully removed — no rod-ft / rodFt / rod_ft in index.html or any
      loaded script`); docs updated (`CONTRACT_CATCH`, `CONTRACT_TECHNIQUE`, `SYMBOLS`,
      `README`, `CHANGELOG`).



## ACTIVE — measured gauge velocity (USGS field measurements) — SHIPPED 2026-09-28

- [x] **M1. Ingest USGS field measurements** — `scripts/fetch_channel_measurements.py` pulls
      the `channel-measurements` OGC collection (CQL2 filter, no key) for all five gauges,
      gates every row on continuity (`Q = v·A`, 5%), least-squares-fits `v = a·Q^b` per gauge,
      and emits `src/data/channel_measurements.js` (deterministic, no timestamp).
      Potential bug: the published data is NOT clean — a Nisqually row carries a trailing-zero
      area (Q off by 10×). The gate drops 37 such rows rather than baking a typo into a curve.
      Verified: live run → 234/192/199/297/237 coherent points; `py_compile` + `node --check`;
      a sanity assertion checks the fit reproduces the real 2026-07-30 Puyallup measurement
      (1650 cfs @ 2.09 ft/s) inside 15% (it lands at 2.22).
- [x] **M2. Use the measured SHAPE, anchored** — `hydraulicVelocity(flow, siteId)` takes the
      gauge's measured response and anchors it to the locked reference (`shape(1040) === 1`),
      so `DRAG_REF` and the strike zone keep their calibration and only the flow-response
      moves. `env.siteId` threads `sim.js` → `drift.js` → `sonar.js`; `index.html` + `sw.js`
      SHELL_FILES carry the new data file (`VERSION` → `v2.03.05`).
      Potential bug: swapping the velocity LEVEL outright would detune every frozen baseline.
      Verified: frozen-baseline + drift-technique tests byte-identical (104/104 GREEN);
      sweep gives 1.000× at 1040 CFS and +22% (Puyallup) / +14% (Carbon) at 10,000 CFS.
- [x] **M3. Label the provenance honestly** — the HUD appends "• USGS-measured" when the
      response came from field measurements (else the old "Target: < 3.5 ft/s"), and the debug
      log carries `source`. Values remain in calibration units, not raw ft/s — see the ROADMAP
      §3.9 note on the honest boundary.

## ACTIVE — width: dual-method extractor + truth-validated router — SHIPPED 2026-09-28

- [x] **W1. Proved NAIP/NDWI is unusable on this basin** — measured against the USGS field widths
      it returned 4 ft where the truth is 215 ft, and 0/10/14/0 ft for White/Carbon/Green/Nisqually.
      Cause: glacial silt backscatters near-infrared, collapsing the green−NIR contrast, and NAIP
      has no SWIR band so the turbid-water index (MNDWI) cannot be computed from it.
      Potential bug: a permissive 0.05 NDWI threshold looked "ok" (4% water) while measuring specks.
      Verified: all five gauges measured and tabulated; see `docs/CHANGELOG.md`.
- [x] **W2. Colour-blind elevation provider** — `scripts/width_elevation.py` reads the 3DEP DEM
      from AWS Terrain Tiles (terrarium z15, ~3.25 m ground) and measures the channel trough along
      the across-gradient axis; it also reports a `truncated` flag when the trough leaves the window.
      Potential bug: a plain PCA axis and a single transect both locked onto banks/hillsides and
      returned 0 ft or 4x overestimates in the canyons — the gradient axis + truncation flag fixed it.
      Verified: decode cross-checked against NED10m (6.38 m vs 6.70 m at the Puyallup gauge).
- [x] **W3. Router that trusts only what matches truth** — a method earns trust only by reproducing
      the USGS field width at that gauge (≤25%); otherwise the USGS measurement is the value.
      Emits the generated `src/data/river_widths.js`.
      Verified: the DEM validates at Puyallup only (202 vs 215 ft); the other four fall back to the
      measured truth. (Now shell-loaded — see B3 below, which consumes it.)

## ACTIVE — temporal audit + honest velocity + continuity + v² drag — SHIPPED 2026-09-28

- [x] **T. Temporal audit** — re-fit `v = a·Q^b` per window over the actual record (1977–2026, not
      the 90 years assumed: the `Q = v·A` gate had already dropped older incomplete rows). The
      Puyallup is stable to **<1%** across the whole span; Carbon/Nisqually/Green drift ±6–15%; the
      exponent stays ~0.45–0.5 everywhere, so the *shape* shipped earlier was sound. **The real
      finding is the White: one measurement since 2010** — its curve is effectively pre-2010.
      Data now carries `first_yr`/`last_yr`/`recent_n`/`thin_recent`; `river_widths.js` records
      `dem_vintage: "unknown"` because the tile exposes no collection date.
      Verified: windowed re-fit table in `docs/CHANGELOG.md`; HUD shows "thin recent data".
- [x] **A. Honest velocity display** — `hydraulicVelocity()` returns `trueMean`/`trueBottom` (true
      ft/s) beside its internal anchored calibration values; BOTTOM CURRENT shows truth (1.35 ft/s
      at 1650 CFS) while the drag/strike-zone math keeps the anchored scale, so showing truth can
      never move the physics.
      Verified: a sanity assertion pins the true value and that the estimate path carries none.
- [x] **B3. Near-you continuity** — new `src/features/gear-sim/continuity.js` +
      `src/data/river_widths.js` shell-loaded; the HUD appends the gauge's measured channel width.
      There is still NO spot-width source (NAIP fails on these glacial rivers), so the ratio is
      1.0 and labelled a same-reach estimate ±20% — never a fabricated spot number. B1 can drop
      into `spotWidthRatio()` without touching callers.
      Verified: SHELL_FILES ↔ index.html parity green (40 modules); SYMBOLS coverage green.
- [x] **C. Drag is now v² (deliberate contract bump)** — `mainlineDragPerFt`/`leaderDragPerFt`
      scale with `(v/REF_VELOCITY)²`; `REF_VELOCITY` is the exact reference bed velocity rather
      than a rounded 2.45. Drag +41% at 2500 CFS, −19% at 600, +0.28% at the 1040 reference.
      Verified: the 4 frozen baselines + drift-technique values re-pinned with rationale inline.

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

**Accuracy roadmap** — from the 2026-09-28 physics review. The Gear Sim is a *deterministic
heuristic*, not a physics simulation, and these are the false truths that bound its output:

- (a) ~~Drag is coded linear in velocity~~ — **FIXED 2026-09-28** as a deliberate contract bump
  (see the ACTIVE block above). `mainlineDragPerFt`/`leaderDragPerFt` now scale with
  `(v/REF_VELOCITY)²`, matching `F = ½ρCdAv²`, and `REF_VELOCITY` is the exact reference bed
  velocity rather than a rounded 2.45. Drag +41% at 2500 CFS, −19% at 600, +0.28% at the 1040
  reference. Frozen baselines re-pinned with the rationale recorded inline.
- (b) ~~Velocity is derived from discharge alone (`0.25·Q^0.4`)~~ — **FIXED 2026-09-28** (see the
  ACTIVE block above + `docs/ROADMAP.md` §3.9). The one-size fit overstated the Puyallup ~2.3×
  and under-predicted how fast velocity rises with flow. `hydraulicVelocity(flow, siteId)` now
  uses a per-gauge `v = a·Q^b` fitted from USGS field measurements, anchored to the locked
  reference. **Still open:** the `blownOut` 3.5 threshold and item (a)'s linear-vs-`v²` drag law
  were both tuned against the OLD inflated velocity, so they want one deliberate contract bump.
- (c) The strike zone is **folklore printed to two decimals** (fixed ±1.0/1.5/3.5" shifts),
  and the empirical anchor that could have fixed it (community sonar) is dead code.
- (d) **Yarn is modelled as lift** though synthetic yarn is ~neutrally buoyant; line
  *density* (the reason fluoro gets down) is not modelled at all.

Groundwork scaffolded: `docs/CONTRACT_TACKLE.md` (measurement protocol + template) →
`src/data/tackle.json`. The model has **never been validated against a measured presentation
height** — that feedback loop is the single highest-value missing piece.

**Future tests / experiments** (validate later): a second region, to prove the multi-region
abstraction is real · technique + species expansion with rig presets · native packaging
(Capacitor) · extending the `vm` runtime-test pattern to
`regulations.js` / `physics.js` / `format.js` / `idb.js` · a visual/DOM test if a test
dependency is ever accepted.

## Verification (whole phase)

- `node sanity_pass.js` → green (it derives the script list from `index.html`).
- `python3 -m py_compile api/water_report.py scripts/dev_server.py`.
- Bump `sw.js` VERSION whenever shell files change.
