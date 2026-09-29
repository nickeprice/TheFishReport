# ACTIVE — current work focus

STATUS: UPDATE 3.0 **COMPLETE** (Phases 1–4 shipped). Hygiene sprint **H1–H3 done**; H4 is
parked, and the two future buckets below are parked deliberately.

Blueprint (completed work): `docs/ARCHIVE_UPDATE_3.0.md` · Roadmap (next): `docs/ROADMAP.md`
· History: `docs/CHANGELOG.md` + `docs/ARCHIVE.md` · Status: `progress.md`.

- [x] **D4. GitHub repo renamed `index.html` → `TheFishReport`** — done via the REST API
      (`PATCH /repos/nickeprice/index.html`) because `gh` is not installed; local `origin`
      re-pointed to `https://github.com/nickeprice/TheFishReport.git` and the new URL accepts
      pushes. Potential bug: the IDE's `associatedRemoteUrls` and the local folder name
      (`~/index.html`) still say the old name — the folder was deliberately NOT renamed, because
      it would invalidate every absolute path in this workspace.
      Verified: `git ls-remote` + `git fetch` against the new URL, `origin/main` unchanged,
      old `github.com/nickeprice/index.html` returns 301 (GitHub redirect), new URL 200.

## ACTIVE — measured tackle data → **P1 DONE 2026-09-28**

`docs/tackle_measurements.csv` now holds **185 rows** (was 38): foam 4 · bead 6 · hook 4 ·
yarn 1 · line 110 · weight 60. Schema gained `brand` + `sample_length_mm` (18 cols total),
`type: weight`, `material` for weights, and 9 shapes. Measured on a 0.01 g scale + Archimedes
rig; the 6 mm corky and 2/4 mm beads are below scale resolution so their values are DERIVED
(density 0.5 / 1.0), and yarn is ESTIMATED near-neutral — every such value is flagged in
`notes`. Measurement protocol: `docs/CONTRACT_TACKLE.md`.

- [x] **P1. Schema + all 185 rows** — converter `COLUMNS`/`TYPES`/`SHAPES`/`TEXT_COLS`/
      `REQUIRED` updated (`scripts/tackle_csv_to_json.py`); 6 phantom line rows removed
      (`mainline-mono-*`, `mainline-copoly-*`); soft 2/4 mm beads removed (not owned);
      lines are role-agnostic (`{material}-{brand}-{lb}`, `generic` = fallback).
      Potential bug: the CSV header is compared byte-for-byte against the converter's
      `COLUMNS`, so the two must always change together.
      Verified: `--check` → "checked 185 item(s) / 60 still incomplete" (exactly the weight
      rows, all missing `area_cm2`); JSON round-trip derives corky 0.4993 / cheater 0.428 /
      bead 0.9982; `node sanity_pass.js --quiet` 107/107; the throwaway generator was deleted
      and `src/data/tackle.json` was NOT committed (it ships with P3).
- [ ] **P1b. Weights still need `area_cm2` + `cd`** — mass (oz→g), density (lead 11.34 /
      tungsten 19.3) and shape are in, but the drag half is not, so `--check` flags all 60.
      Measure the broadside silhouette (graph paper + photo) per shape; `cd` is a standard per
      shape (sphere 0.47 · cylinder ≈1.0 · teardrop ≈0.3). Rubber-sleeved rows are separate
      items and drag differently from bare ones.

### Design LOCKED with the user 2026-09-28 (do not relitigate — execute)

- **P2 layout = Approach B, unified line picker.** Replace the 4 line selects (Mainline
  Material + Lb, Leader Material + Lb; ×2 tabs = 8 controls) with ONE `Mainline` and ONE
  `Leader` `<select>`, each `<optgroup>`-grouped by material, option text
  "Seaguar STS — 12lb", `value` = the tackle.json id. Lines go 6 controls → 2.
- **Dropdowns are DATA-DRIVEN from `src/data/tackle.json`** (single source of truth). Load once
  in the `app.js` bootstrap and populate; on fetch failure fall back to the hardcoded Generic
  rows. Never hardcode the 110 line names in `index.html` — that is the drift this whole effort
  exists to kill.
- **Weight = 2 controls**: `Weight (oz)` + `Weight shape`, whose options come from the weight
  rows' `label`s (so "Pencil (rubber sleeve)" is its own option). Rubber stays in the label.
- **Brand IS persisted to the catch log**, so sonar replays at the exact brand.
- **lb lists expand**: leader needs `8`; mainline needs `8/10/12/15/17` for non-braid materials.
- The `gearRows === 12` assertion (`sanity_pass.js:344`) WILL change — update it deliberately,
  and keep the `!html.includes('gear-grid')` assertion.

- [x] **P2. UI (Approach B) — DONE 2026-09-28, commit `9c0838c`, sanity 108/108.** Shipped as
      scoped: 2 brand pickers per pair of forms (Mainline, Leader) + a weight-shape picker, all
      data-driven from `src/data/tackle.json`; each pick resolves into the hidden mat/lb fields so
      the physics and baselines are untouched. `tackle.json` is committed and SW-cached.

      **DECOMPOSITION (found 2026-09-28 while starting this — use it, it is the cheap path):**
      keep the picker's `value` as the tackle.json **id** but have the plumbing resolve
      `id -> {material, lb_test}` and keep calling the existing physics untouched. Then P2 lands
      with the frozen baselines UNCHANGED (sanity stays green) and the proxy->real-diameter swap
      is a separate, reviewable P3 step. Do NOT mix the two.
      Files: new `src/shared/tackle.js` (`tackleLoad()`, `tackleLineById()`,
      `tackleLineByMatLb()` fallback, `populateTacklePickers()`), `index.html` (replace the 4 line
      selects per pair of forms with 2 full-width pickers), `forms.js` (drop `LB_OPTIONS`/
      `updateLbOptions`/`onLineMatChange`), `rig.js` (save/restore `mlLine`/`ldLine`, with
      backward compat for rigs saved as mat+lb), `solver.js`/`sonar.js`/`drift.js` (read the id),
      `app.js` (await `tackleLoad()` BEFORE `restoreRig()` or the pickers are empty), `sw.js`
      (+`/src/data/tackle.json` in SHELL_FILES, VERSION bump), commit `src/data/tackle.json`.

      **RESOLVED 2026-09-28 — user chose (a):** the converter now derives `shape_label` per weight
      row (`Lead Pencil (rubber sleeve) 1/4 oz` → `Lead Pencil (rubber sleeve)`), so the weight
      picker offers `(shape_label, oz)` pairs and the metal + sleeve ride along in one option
      without giving `shape` a second job. Chosen over (b) a `variant` column and (c) a single
      unified weight picker.
      Verified: 10 distinct `shape_label`s, every one present at all 6 oz, all 60
      `(shape_label, mass_g)` pairs unique (so the pair identifies exactly one row), and no
      non-weight row carries the field. `py_compile` clean; JSON regenerated then removed.
- [ ] **P4. DB** — timestamped idempotent migration adding the line ids + weight shape to
      `public.catches`, applied by me with `npx supabase db push --yes`, then verified with a
      read-only query, preserving RLS and the public-feed privacy boundary.
      **USER REVIEW REQUESTED for this and for P3's baseline re-pin.**

## Handoff — 2026-09-28 (end of session; context exhausted, nothing half-built)

**Objective:** land the measured-tackle library into the Gear Sim (P1 + P2 done, P3/P4 open).
**Last completed step:** P2 — data-driven line + weight-shape pickers, committed `9c0838c`,
sanity 108/108, pushed. `src/data/tackle.json` is now committed and service-worker cached.
**Immediate next step:** **P3** — swap the diameter PROXY for the real measured diameters and
re-pin the frozen baselines (deliberate contract bump), then the rest of the measured units, then
P4's migration. Nothing is mid-flight: tree clean, app runs, physics untouched so the baselines
still hold.



- [ ] **P3. (next) Physics rewrite that consumes the JSON** — each measured field now has a
      named target in `src/features/gear-sim/`: `buoyancy_g` (foam) → `foam.lift` via
      `parseFoam()`; `buoyancy_per_inch_g` (yarn) → the hardcoded `yarnInches * 0.15` term in
      `inputs.js:187 rigLift()` — measured ~0.01/in, i.e. **yarn is NOT a lift device**; hook
      `mass_g` → `hookSink()` (measured 0.35/0.28/0.20/0.16 vs the constants
      0.35/0.28/0.20/0.12 — only size 2 moves); bead `mass_g`/`buoyancy_g` → `beadSink()`
      (both bead materials measure density ≈1.0, so `BEAD_DENSITY = {hard:1.0, soft:0.55}` is
      **wrong for soft** — the soft/hard difference is drag, not lift); line `diameter_mm` →
      `lineDiameterScale(lbTest, mat)` (`physics.js:17`) and the `DRAG_REF = 7.5` terms (110
      real diameters, keyed `{material}-{brand}-{lb}`); weight mass/density/shape → the
      `anchorScale = 0.7 + 0.6*oz` fudge, which reads mass only and must become a real
      hold-or-drag model. Nothing reads `tackle.json` yet — verified by grep.
      Then commit the JSON, add it to `SHELL_FILES`, bump `VERSION`, re-pin the frozen baselines.
      Potential bug: `DRAG_REF`/`blownOut` 3.5 were tuned against the old inflated velocity, so
      swapping in real units is a deliberate **contract bump** — expect the frozen baselines to
      move and be re-pinned with the rationale inline (see the accuracy roadmap below).
- [x] **M3. Closed by P1** — the cheater is now `shape=other` with a measured broadside area
      (0.97 cm², egg 13 × 9.5 mm) and `cd = 0.5` instead of the wrong sphere default; the yarn
      row carries an ESTIMATED near-neutral `buoyancy_per_inch_g = 0.01` (flagged in `notes`)
      rather than a fabricated soaked measurement.
- [x] **M4. Closed by P1 (the free win, as predicted)** — standard material densities are typed
      into `density_g_cm3` on all 110 line rows (fluoro 1.78 · copoly 1.2 · mono 1.15 ·
      braid 1.0) and survive into the JSON because the converter only overwrites that column
      when `buoyancy_g` is present. The per-brand long-length weigh-off stays open — that is
      what the reserved `sample_length_mm` column is for. Never put a long-length weigh-off in
      `mass_g`: there is no length column to interpret it.


## ACTIVE — rename to "The Fish Report"

- [x] **D1. Swap the user-visible app name** — `index.html` `<title>` → `The Fish Report`,
      `apple-mobile-web-app-title` → `Fish Report`, `manifest.json` `name` → `The Fish Report`
      / `short_name` → `Fish Report`. Bumped `sw.js` `VERSION` `v2.03.09` → `v2.03.10` because
      `/manifest.json` is a `SHELL_FILES` entry (no bump ⇒ installed PWA keeps the old name).
      Potential bug: a stale shell cache serves the old manifest, so the name "changes" only
      after a refresh cycle.
      Verified: `node sanity_pass.js --quiet` green; `manifest.json` re-parses; `sw.js` OK.
- [x] **D2. Rename the identity strings that are not UI** (user picked the recommended subset) —
      doc titles (`README.md`, `AGENTS.md`, `memory-bank/projectbrief.md`,
      `supabase/README.md`), the init-migration comment, file headers
      (`sw.js`, `src/app.js`, `sanity_pass.js`), the `dev_server.py` banner, the WDFW scraper
      `USER_AGENT`, the `extract_river_widths.py` `/tmp/prc_env` example path, and the
      `prc-*` → `tfr-*` SW cache prefixes (second `VERSION` bump → `v2.03.11`).
      Potential bug: the cache-prefix rename is a cache-key change, so it needs an online +
      offline check — covered by `activate` deleting any cache not in `keep`.
      Verified: `node sanity_pass.js --quiet` → 107/107 green; JS + `py_compile` syntax clean;
      old name now only remains in `src/data/wdfw_rules.json` (WDFW "harvester companion card"
      regulation prose), which must never be touched.
- [ ] **D3. (OPEN BY DESIGN) Two identifiers keep the old name deliberately** —
      `src/shared/idb.js` `IDB_NAME = 'puyallup_companion'` (IndexedDB name keys the **offline
      catch buffer**; renaming orphans unsynced catches unless a copy shim ships) and
      `supabase/config.toml` `project_id` (local-stack label only — the linked remote is
      `pztcfsqifbfkjvosygcy` per `supabase/.temp/project-ref`). Only revisit with a migration
      shim, and it is not user-visible.

## ACTIVE — persist operating instructions to `.clinerules`

- [x] **Persist the 4-section instruction block** (handoff / terseness / verification /
      reading blacklist) into `.clinerules`, rewritten to real tools and reconciled with
      the base rules — `ask_followup_question`, `new_task`, and `environment_details` do
      NOT exist, so handoff = write state + end turn, user restarts manually.
      Verified: `git diff .clinerules` shows only the intended hunks; JS untouched so
      sanity is unaffected.

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
- [x] **R7. Reorder the gear boxes to the instructed 2-up flow** — the SAME instruction block
      (msg 1477) specified the order that survives the removal: row 1 mainline material + mainline
      lb test · row 2 weight + leader length · row 3 leader material + leader lb test · row 4 hook
      size + yarn · row 5 foam 1 + foam 2 · row 6 bead material + bead size. Mainline moves to the
      top and Weight absorbs Leader Length. This half was acknowledged and silently skipped with R5,
      so the order is now asserted rather than assumed (both tabs).
      Potential bug: the leader row was 3-up, so moving Leader Length into Weight's row orphans the
      3-up layout — retire its CSS or the rule lies about a layout nothing uses.
      Verified: scripted diff of BOTH `gear-rows` blocks vs HEAD = 122 lines each side, the only
      delta being the two `gear-row-3` classes (every id/for/onchange/placeholder/type/option
      byte-identical); the 3-up rule deleted from `src/styles.css`; `sw.js` → `v2.03.08`; sanity
      **107/107 GREEN** with the new `gear box order is the instructed 2-up flow (both tabs)` guard.
- [x] **R8. Audit the rest of the rod-length chat for dropped instructions** — the R7 miss was
      assumed to be isolated, so the source session was re-read end-to-end and every instruction
      diffed against the repo instead of trusting the memory notes. Most of it shipped (Planetary
      Computer STAC, USGS channel measurements, the width dual-method router, the temporal audit,
      honest velocity, near-you continuity, v² drag). **Three were acknowledged and silently
      skipped**, and all three are now done: the tackle CSV inventory was never expanded to the
      agreed 38 rows (converter said "checked 16"), the presentation-bead label was never
      disambiguated from the mainline stop bead, and the weight-shape roadmap line was never
      written (now accuracy-roadmap item (e)).
      Potential bug: the CSV doubles as the measurement progress tracker, so an incomplete
      inventory under-reports what the user still has to measure — it looks like progress.
      Verified: `python3 scripts/tackle_csv_to_json.py --check` → **"checked 38 item(s)"**; sanity
      **107/107 GREEN**; the two open-by-design items re-confirmed as such, not as misses
      (`blownOut` 3.5 contract bump · spot width, so `spotWidthRatio()` still returns 1.0).



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
- (e) **Weight shape / density / drag is not modelled at all** — `anchorScale = 0.7 + 0.6·oz` is a
  dimensionless fudge that reads mass only, so a slinky (drags like a parachute) and a cannonball
  score identically, even though weight-shape is real physics. Deferred *until the hold-bottom
  model lands* — that is the trigger, not "someday": then measure `shape`/`density`/
  `projected_area`/`cd` per lead, add the weight to `totalDragPerFt`, and replace `anchorScale`
  with a real hold-or-drag model. Mass needs no measurement (the oz label *is* the mass), which is
  why the CSV deliberately carries no weight category. Promised 2026-09-28 (msg 1476) and recorded
  here on 2026-09-28 after an audit found it had been dropped.

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
