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
