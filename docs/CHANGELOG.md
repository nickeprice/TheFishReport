# Internal Change Log

Keep this LEAN by design: a fresh chat reads only the LAST entries to restore context.
`memory-bank/progress.md` is the two-paragraph summary; this file is the per-change record.
Completed-phase detail lives in `docs/ARCHIVE.md` + `git log`.

## 2026-09-29 — P4b: the picked brand now reaches the catch row and the replay
The three P4 columns were write-only until now. `logData()` sends `ldLine` / `mlLine` /
`weightShape` from the pickers, `toCatchRow()` maps them into `leader_line_id` /
`mainline_line_id` / `weight_shape` (absent → NULL, never `''`, so an older installed client is
harmless), and the replay resolves them: `tackleRowLine(row, role)` prefers the brand id — which
owns the measured diameter the drag term needs — and falls back to material + lb, so
`communitySonar()` runs the angler's actual line. Id-less rows take exactly the old path, which is
why the **frozen baselines did not move** and needed no re-pin. Proven live-surface: PostgREST
resolves the columns (`GET /rest/v1/...&select=mainline_line_id,leader_line_id,weight_shape` → 200
`[]`). Two new sanity checks: the real `toCatchRow()` mapping (plus the payload source), and
"a row with the picked brand replays at that brand" — same row, brand ids: **2.887″ → 3.976″**.
Deliberately NOT done: `get_global_calibration` still does not return the ids — it is
`SECURITY DEFINER` + anon-executable and the whole community path is gated off (`loc !== 'Fair'`,
nothing populates it, ROADMAP §3.2), so widening it would change nothing today. One decision, later.
- Key files: `src/services/supabase.js`, `src/features/catch-log/log.js`,
  `src/features/gear-sim/sonar.js`, `src/shared/tackle.js`, `sanity_pass.js`, `sw.js` (`v2.03.13`).

## 2026-09-29 — P4: `public.catches` can hold the picked tackle brand
Migration `20260929055300_line_ids_weight_shape` adds **three nullable text columns alongside**
`mainline_mat`/`mainline_lb`/`leader_material`/`leader_lb`: `mainline_line_id`, `leader_line_id`
(the `src/data/tackle.json` item id) and `weight_shape` (the weight row's `shape_label`). Additive
and un-backfilled on purpose — the mat/lb pair stays the fallback for legacy readers (community
sonar replays, the frozen baselines), and a pre-P4 row has no brand to recover. No FK and no index:
the library is a static asset and the columns are read per row. Applied with `npx supabase db push
--yes` and **verified live**: 34 → 37 columns, catches RLS still on, `public_catch_feed` still its 4
explicit columns (the brand never reaches the public board), and `get_global_calibration`'s
signature, `security definer` flag and ACL unchanged. They stay NULL until the client write path
sends them — columns must land FIRST, because PostgREST 400s on an unknown column.
- Key files: `supabase/migrations/20260929055300_line_ids_weight_shape.sql`, `docs/CONTRACT_CATCH.md`.

## 2026-09-28 — Weight drag areas derived from geometry (P1b) — the sheet is complete
The 60 weight rows had no `area_cm2`/`cd`, so the drag half of a lead/tungsten weight was invisible.
Rather than guess, the volumes come **exactly** from each row's own `mass_g` ÷ metal density, and the
only assumption is the shape's aspect ratio (slinky 5, pencil 3, teardrop 2, barrel 1, cannonball =
sphere) plus a 0.8 mm rubber wall on the sleeved variants. Everything else is physics.

Two real findings fell out: a **slinky's density is the shot-packed effective 7.26 g/cm³**
(0.64 × 11.34 — random close packing), not solid lead, so the density column was corrected; and a
**tungsten weight is ~30% smaller than the same-oz lead one**, so it drags less — exactly the effect
the weight rows exist to capture. `python3 scripts/tackle_csv_to_json.py --check` now reports **zero
incomplete items** for the first time (185/185).

- Key files: `docs/tackle_measurements.csv`, `src/data/tackle.json`, `docs/CONTRACT_TACKLE.md`.

## 2026-09-28 — Gear Sim line + weight pickers are live (P2)
Approach B shipped: the four material/lb dropdowns per pair of forms are gone, replaced by **one
brand-specific picker per line** (Mainline, Leader), populated at boot from `src/data/tackle.json` —
110 lines grouped by material, `generic` as the fallback. `Weight` gains a **shape picker** built
from the rows' derived `shape_label`, so metal, rubber sleeve and shape are all selectable-in-one;
with oz that identifies exactly one weight row.

The picker only **CHOOSES**: each pick resolves into hidden `ml-mat`/`ml-lb`/`ld-mat`/`ld-lb`, so
the rig model, solver, catch row and DB all stay material+lb — which means the **physics is
untouched and the frozen baselines do not move** (P3 does the real-diameter swap). A pre-picker rig
in localStorage still restores, via `tackleLineByMatLb()`.

Files: `index.html`, new `src/shared/tackle.js`, `rig.js`, `forms.js` (dead LB cascade deleted),
`zone.js` (`RIG_REQUIRED`), `app.js` (loads the library before `restoreRig()`), `sw.js`
(`SHELL_FILES` + VERSION `v2.03.12`), `sanity_pass.js`, `docs/SYMBOLS.md`. **`src/data/tackle.json`
is now committed** — the pickers are its consumer, which is what the contract was waiting for.
Verified: sanity 108/108 (the a11y check now skips `type="hidden"`, which is not user-reachable);
`tackle.json` serves 200 with 185 items + 10 shape labels; all 6 pickers present in the served HTML.

## 2026-09-28 — Tackle library expanded to 185 measured rows (P1)
`docs/tackle_measurements.csv` went 38 → **185 rows** so the Gear Sim can stop running on
unitless fudges: **110 lines** (brand-expanded, role-agnostic ids `{material}-{brand}-{lb}`,
`generic` = fallback) and **60 weights** (lead slinky/pencil/barrel/teardrop/cannonball plus
tungsten barrel/teardrop; the rubber sleeve is a label variant, not a shape), plus the measured
foam 4 · bead 6 · hook 4 · yarn 1. Schema: `brand` + `sample_length_mm` added (18 cols),
`type: weight`, `material` on weights, 9 shapes. Removed: 6 phantom line rows
(`mainline-mono-*`, `mainline-copoly-*`) and the soft 2/4 mm beads (not owned).

Measured 2026-09-28 on a 0.01 g scale + Archimedes rig: corkies density **0.5** (3 sizes, consistent) ·
cheater **0.43** (egg 13 × 9.5 mm, broadside area 0.97 cm²) · beads **≈1.0 for both** hard and soft ·
hooks 0.35 / 0.28 / 0.20 / 0.16 g. Below scale resolution and therefore DERIVED: the 6 mm corky
(density 0.5) and the 2/4 mm beads (density 1.0). ESTIMATED near-neutral: yarn **0.01 g/in**, which
shows the model's `+0.15/in` yarn *lift* is ~15× high, and that `BEAD_DENSITY.soft = 0.55` is wrong
(both bead materials measure ≈1.0 — the soft/hard difference is drag, not buoyancy).

Still open: `area_cm2` + `cd` on the 60 weight rows (`--check` lists exactly those) and the physics
rewrite (P3) that consumes the JSON.
- Key files: `docs/tackle_measurements.csv`, `docs/CONTRACT_TACKLE.md`,
  `scripts/tackle_csv_to_json.py`.

## 2026-09-28 — GitHub repo renamed `index.html` → `TheFishReport`
Infra only, no code: the repo now lives at `github.com/nickeprice/TheFishReport` (renamed via
`PATCH /repos/nickeprice/index.html` using the stored `gho_` credential — `gh` is not installed
here). Local `origin` re-pointed to the new URL; `git ls-remote` + `fetch` verified, `origin/main`
still `578aa06`, tree clean. GitHub 301-redirects the old URL, so existing clones and the Vercel
Git integration keep working (Vercel keys on the repo, not the name; no `vercel.json`/`.vercel`
link file exists). No tracked file hardcoded the old repo URL, so nothing else needed editing.
Note: the local folder is still `~/index.html`, and the IDE's `associatedRemoteUrls` refreshes to
the new URL on reload.
- Key files: `.git/config` (remote URL) only.


User-visible identity: `index.html` `<title>` → `The Fish Report`, `apple-mobile-web-app-title`
→ `Fish Report`, `manifest.json` `name` ("The Fish Report") / `short_name` ("Fish Report").
`/manifest.json` is in `sw.js` `SHELL_FILES`, so `VERSION` bumped `v2.03.09` → `v2.03.11`
(second bump covers the cache-prefix rename below) — without a bump an installed PWA keeps the
old name. Same pass renamed the *identity strings* that are not UI: doc titles (README, AGENTS,
projectbrief, supabase/README), the init-migration comment, file headers in
`sw.js`/`src/app.js`/`sanity_pass.js`, the `dev_server.py` banner, the WDFW scraper
`USER_AGENT`, and the `prc-*` → `tfr-*` service-worker cache prefixes (safe: `activate`
deletes every cache not in `keep`, so the stale `prc-*` caches self-clean). Regional prose and
`wdfw_rules.json` regulatory text ("designated harvester companion card") were NOT touched.
Deliberately left: `src/shared/idb.js` `IDB_NAME = 'puyallup_companion'` — IndexedDB is keyed by
name and holds the offline catch buffer, so renaming orphans unsynced catches unless a copy shim
ships; and `supabase/config.toml` `project_id` (local-stack label; the linked remote ref lives in
`supabase/.temp/project-ref`).
- Key files: `index.html`, `manifest.json`, `sw.js`, `README.md`, `AGENTS.md`,
  `memory-bank/projectbrief.md`, `supabase/README.md`, `sanity_pass.js`, `src/app.js`,
  `scripts/{dev_server,refresh_wdfw_forecast,extract_river_widths}.py`.

## 2026-09-28 — `scripts/session_instructions.py`: make the instruction audit cheap
Instructions are given in chat and recorded nowhere in the repo, so a promise can be acknowledged
in prose and then evaporate when the conversation pivots — rod length was lost that way TWICE
(`R5`, `R7`). Auditing for it by reading a transcript is what made the R8 check expensive: the
session that hid those three misses (`1790604718924_nudti`) is **7.26 MB, of which 3.03 MB is
assistant reasoning against 27 KB of user text (112x)**. This script prints only the user turns and
strips the wrapper/switch notices: the entire 108-turn session comes out as **11 KB — 662x
smaller** — so a phase-end audit is one command instead of a multi-megabyte read.

Re-ran the COMPLETE audit with it and reconciled all 108 turns: no further misses. Notably
confirmed msg 39 ("lets delete the .kilo worktree") really was done — `.kilo` is now 4 KB with a
single 0-byte marker and `git worktree list` shows only main — and that the remaining items are the
documented open-by-design ones (OAuth → Update 4.0 §3.1, the `blownOut` contract bump, spot width).

Extended the sweep to **all 28 sessions (534 turns, 65 KB)**: every miss in this project's history
has the same shape — an ask answered in prose that evaporated when the chat pivoted — and beyond the
three fixed here, **nothing further was dropped**. Spot-checked the loudest old complaints:
`--quiet` exists (from "why did it say let me run sanity pass 10000 times"), one-screen forms landed
(`b7b8f1d`), and the Safari GPS failure was fixed and verified on device (`docs/ARCHIVE.md`). The
Sep-17 sessions share a forked history segment, so the ~65 KB has partial redundancy.
`.clinerules` now carries the capture + audit rule.
- Key files: `scripts/session_instructions.py`, `docs/CHANGELOG.md`.

## 2026-09-28 — Audit of the rod-length chat: three promised items had been dropped
Re-read the source session (`1790604718924_nudti`) end-to-end instead of trusting the memory notes,
and diffed every instruction against the live repo. Most of that chat did ship — Planetary Computer
STAC, USGS channel measurements, the width dual-method router, the temporal audit, honest velocity
display, near-you continuity, and the v² drag bump. But **three things were acknowledged and never
done**, all found only by reading the transcript:

1. **The tackle CSV inventory was never expanded.** The user caught it himself (msg 1469: "were
   clearly missing alot of things right now") and the fix was agreed explicitly — derive the rows
   from the form: foam 4 · leader 12 · mainline 9 · bead 8 · hook 4 · yarn 1 = **38**. The CSV still
   held 16, and because the converter doubles as the measurement progress tracker, it was
   under-reporting the checklist as if it were nearly done. Now 38.
2. **The bead label was never disambiguated.** "Bead Material / Bead Size" is the *presentation*
   bead on the leader, not the mainline stop bead (msg 1482: "we should make that label explicit so
   nobody logs the wrong one"). Relabelled `(Presentation)` in both tabs.
3. **The weight-shape roadmap line was never written.** Rod length and weight-shape were parked
   together but differently: rod length was *deleted*, weight-shape was to be *recorded* as a
   deferred data dependency (msg 1476). It never was; now accuracy-roadmap item (e).

Re-confirmed as open-by-design (documented, not missed): the `blownOut` 3.5 threshold contract bump,
and the spot-width source that leaves `spotWidthRatio()` at 1.0.

Verified: `python3 scripts/tackle_csv_to_json.py --check` → **"checked 38 item(s)"**; sanity
**107/107 GREEN**; `sw.js` VERSION → `v2.03.09`.
- Key files: `docs/tackle_measurements.csv`, `index.html`, `memory-bank/activeContext.md`, `sw.js`.

## 2026-09-28 — Gear box order: the instructed 2-up flow (follow-up to rod removal)
Removing rod length left the form's field ORDER wrong. The same instruction block (session
`1790604718924_nudti`, msg 1477) specified: row 1 mainline material + mainline lb test, row 2
weight + leader length, row 3 leader material + leader lb test, row 4 hook size + yarn, row 5
foam 1 + foam 2, row 6 bead material + bead size — i.e. Mainline moves to the top, Weight absorbs
Leader Length, and the leader row is no longer 3-up. It was acknowledged and then skipped, so it is
now pinned by a sanity guard instead of trusted.

Both tabs (`index.html`) reordered; every id/for/onchange/placeholder/type/option line is
unchanged (scripted diff of the two `gear-rows` blocks vs HEAD: 122 lines each side, the only delta
being the two `gear-row-3` classes). The now-dead 3-up rule is deleted from `src/styles.css` and the
CSS guard asserts it stays gone. `sanity_pass.js` gains `gear box order is the instructed 2-up flow
(both tabs)`, asserting the exact `for=` sequence per form. `sw.js` VERSION → `v2.03.08`.

Verified: sanity **107/107 GREEN**; the order guard echoes
`ml-mat,ml-lb,weight,ld-len,ld-mat,ld-lb,hook,yarn,foam,foam2,bd-mat,bd-sz`.
- Key files: `index.html`, `src/styles.css`, `sw.js`, `sanity_pass.js`.

## 2026-09-28 — Remove rod length (the instruction that evaporated)
The instruction was given in the previous session — *"additionally im saying lets remove the rod
length"* (20:56Z) and *"drop the `rod_ft` db column"* (21:05Z) — and answered with *"Confirmed on
the column — I'll drop `rod_ft` (migration, applied and verified live)."* **It was never done:** no
migration existed, `public.catches.rod_ft` was still live, and the app was still writing it. The
chat pivoted to velocity/widths and the promise vanished, which is exactly why the field was still
on screen. Recovered from the Cline session log (`logs/20260928T120538/…/1-Cline.log`) and executed.

Why removal was safe — measured, not assumed: the drift technique was run at 9'0" / 9'8" / 12'0"
and all 24 scalar outputs compared. `hgt`, `score`, `dragPerFt`, `lift`, bottom/true velocity and
the strike zone were identical to the last digit. Rod length was only ever echoed in one suggestion
sentence, yet it was a REQUIRED field that blocked both the sim and catch logging.

Removed: both form rows (`index.html`) · `getRodLengthFt`/`formatRodLength`/`onRodChange`
(`forms.js`) · rig save/restore + tab mirroring (`rig.js`) · the required-field gate (`zone.js`) ·
the `rodFt` read (`solver.js`) · the catch payload (`catch-log/log.js`) · the write map and
`asMyCatchRow` (`supabase.js`) · the rod clause in the drift suggestion (the sentence keeps its
species/flow/leader context, so the frozen 3-suggestion shape is unchanged). The dead fallout went
too: with `flow`/`distance` already gone, `gear-sim/debounce.js`'s id list was empty, so the module
is **deleted** (`index.html` + `SHELL_FILES` + `app.js`) along with the unused `.dual-input` CSS.
`sw.js` VERSION → `v2.03.07`.

`20260928235500_drop_rod_ft.sql` recreates `get_global_calibration` without `rod_ft` (a RETURNS
TABLE signature cannot be altered in place — 42P13 — and dropping the function drops its ACL, so it
is re-granted to anon/authenticated/service_role), then drops the column. Applied and verified
live: **0** `%rod%` columns on `catches`, **0** hits in the RPC signature and body, `service_role`
grant intact, and the RPC still returns its row.

`sanity_pass.js` now carries a **guard** (`rod length is fully removed`) asserting no
`rod-ft`/`rod-in`/`Rod Length` in `index.html` and no `rodFt`/`getRodLengthFt`/`formatRodLength`/
`onRodChange`/`rod_ft` in any loaded script — because this is the second time the field outlived a
decision to remove it. Verified: sanity **106/106 GREEN** (39 modules, load order still ending with
`app.js`).
- Key files: `index.html`, `src/shared/forms.js`, `src/features/gear-sim/{rig,zone,solver}.js`,
  `src/features/gear-sim/techniques/drift.js`, `src/features/gear-sim/debounce.js` (deleted),
  `src/features/catch-log/log.js`, `src/services/supabase.js`, `src/styles.css`, `sw.js`,
  `sanity_pass.js`, `supabase/migrations/20260928235500_drop_rod_ft.sql`, `docs/CONTRACT_CATCH.md`,
  `docs/CONTRACT_TECHNIQUE.md`, `docs/SYMBOLS.md`, `README.md`.

## 2026-09-28 — Temporal audit, honest velocity display, near-you continuity, and the v^2 drag bump
Four connected changes, all prompted by one fair question: *are we mixing dates and calling it
"now"?* We were, so it was measured rather than assumed.

**Temporal audit (the finding).** The velocity fit pools the whole coherent record — which turned
out to be **1977–2026**, not the 90 years assumed (the `Q = v·A` gate had already dropped older
rows lacking width/area). Re-fitting per window shows the *level* barely moves: the Puyallup —
the flagship and the only DEM-validated river — is stable to **<1%** across the whole span, and
Carbon/Nisqually/Green drift ±6–15% (the exponent stays ~0.45–0.5 everywhere, so the *shape* we
shipped was sound). The real finding is the **White River: one field measurement since 2010**, so
its curve is effectively pre-2010. `channel_measurements.js` now carries `first_yr`/`last_yr`/
`recent_n`/`thin_recent`, and the HUD says "thin recent data" instead of looking timeless.
`river_widths.js` records `dem_vintage: "unknown"` — the DEM tile exposes no collection date, and
that gap is stated rather than papered over.

**A — honest velocity display.** `hydraulicVelocity()` also returns the **true measured ft/s**
(`trueMean`/`trueBottom`) alongside its internal anchored calibration values, so BOTTOM CURRENT now
shows reality (1.35 ft/s at 1650 cfs) while the drag/strike-zone math keeps using the anchored
scale. Showing truth can no longer silently move the physics.

**B3 — "near you" continuity, honestly bounded.** New `src/features/gear-sim/continuity.js`
(`gaugeWidthFt`, `spotWidthRatio`, `velocityAtSpot`) plus `src/data/river_widths.js` now in the
shell, and the HUD appends the gauge's measured channel width. There is still **no spot-width
source** (NAIP fails on these glacial rivers), so the ratio is 1.0 and labelled as a same-reach
estimate with a ±20% spread — not a fabricated spot number. B1 (dated 3DEP endpoint) can drop into
`spotWidthRatio()` later without touching callers.

**C — drag is now v² (deliberate contract bump).** `mainlineDragPerFt`/`leaderDragPerFt` scale with
`(v / REF_VELOCITY)²` instead of linearly, matching `F = ½ρCdAv²`. `REF_VELOCITY` became the exact
reference bed velocity rather than a rounded 2.45. Effect: drag **+41% at 2500 cfs**, **−19% at
600**, and the 1040 reference shifts only +0.28% (from the rounding fix, not the v² change). The
four frozen baselines and the drift-technique values were re-pinned with that rationale recorded
inline. `sw.js` VERSION → `v2.03.06`.

Verified: `sanity_pass.js` **106/106 GREEN** (was 104 — two new module checks), `python3 -m
py_compile` on all three scripts, and `node --check` on both generated data files.
- Key files: `src/features/gear-sim/{inputs,physics,continuity,solver,techniques/drift}.js`,
  `src/data/{channel_measurements,river_widths}.js` (generated), `scripts/fetch_channel_measurements.py`,
  `scripts/extract_river_widths.py`, `index.html`, `sw.js`, `sanity_pass.js`, `docs/SYMBOLS.md`.

## 2026-09-28 — Width: NAIP fails on every river here; dual-method extractor + truth-validated router
The width work was about to be built on NAIP imagery alone. Measuring it against the USGS
field widths showed that method is **unusable on all five gauges** — the Puyallup, White,
Carbon and Nisqually are glacial/silt-laden, so suspended sediment backscatters near-infrared
and the green−NIR contrast collapses: NAIP returned **4 ft where the truth is 215 ft** (White
0 vs 119, Carbon 10 vs 63, Green 14 vs 128, Nisqually 0 vs 176). NAIP has no SWIR band, so the
index that would fix turbid water (MNDWI) cannot be computed from it.

So width became a **dual-method pipeline with a router** (`scripts/extract_river_widths.py`):
NAIP-NDWI kept as one provider, plus a new `scripts/width_elevation.py` that reads the 3DEP
DEM from AWS Terrain Tiles (terrarium z15, ~3.25 m ground resolution, colour-blind) and measures
the channel trough along the across-gradient axis. Crucially, **clarity is never guessed from a
turbidity number** — a method earns trust only by reproducing the USGS field width at that gauge
(≤25%). The DEM also self-reports a `truncated` flag when the trough runs off the window, which
correctly disqualifies the steep-canyon gauges.

Result (`src/data/river_widths.js`, generated): the DEM validates at **Puyallup only**
(202 vs 215 ft); White/Carbon/Nisqually are truncated and Green's estimate misses by 83%, so all
four fall back to the USGS measured width. That is the honest outcome — one method is right for
one reach, and the router says so instead of pretending.

`src/data/river_widths.js` is deliberately **not** added to `index.html`/`SHELL_FILES` yet:
nothing consumes it until the app-side continuity estimator lands, and the repo's rule is that an
unread data file should not ship in the offline shell. `sw.js` VERSION unchanged.

Verified: `sanity_pass.js` **104/104 GREEN**; `river_widths.js` passes `node --check`; the
extractor is deterministic (a re-run reproduces byte-identical numbers).
- Key files: `scripts/width_elevation.py` (new), `scripts/extract_river_widths.py`,
  `src/data/river_widths.js` (new, not yet shell-loaded), `docs/ROADMAP.md` §3.9.

## 2026-09-28 — Measured gauge velocity: USGS field measurements replace the one-size fit
The Gear Sim derived velocity from a single `0.25 · Q^0.4` fit applied to every river. That fit
overstated the Puyallup's mean velocity **~2.3×** and — because its exponent was too low (0.4 vs
~0.47) — *under*-predicted how fast velocity rises with flow, worst exactly at blown-out levels.
The USGS already answers this: its field crews wade/boat each gauge several times a year and
measure discharge, width, cross-section area **and** mean velocity by hand. New
`scripts/fetch_channel_measurements.py` pulls those rows from the Water Data OGC API
`channel-measurements` collection (the legacy NWISWeb RDB endpoints are mid-decommission), gates
each row on continuity (`Q = v·A`, 5% — the published data is not clean: a Nisqually row carries a
trailing-zero area, 37 rows dropped in all), least-squares-fits `v = a·Q^b` per gauge, and writes
`src/data/channel_measurements.js` (deterministic, no timestamp, precached in the shell).

`hydraulicVelocity(flow, siteId)` now uses the measured **shape**, ANCHORED to the locked reference
(`shape(1040) === 1`) so `DRAG_REF` and the strike zone keep their calibration and only the
flow-response moves; a gauge with no measurements falls back to the old estimate byte-for-byte.
`env.siteId` threads `sim.js` → `drift.js` → `sonar.js`, and the HUD appends "• USGS-measured"
rather than implying the number is exact. `sw.js` VERSION → `v2.03.05`.

Verified: `sanity_pass.js` **104/104 GREEN** — the frozen-baseline and drift-technique tests are
byte-identical (the anchoring held), and a new assertion proves the published fit reproduces a real
measurement: Puyallup 2026-07-30, 1650 cfs @ 2.09 ft/s → the fit gives 2.22. Flow sweep: 1.000× at
the 1040 CFS anchor, +22% (Puyallup) / +14% (Carbon) bed velocity at 10,000 CFS.
- Key files: `scripts/fetch_channel_measurements.py` (new), `src/data/channel_measurements.js`
  (new), `src/features/gear-sim/{inputs,sim,solver,sonar,techniques/drift}.js`, `index.html`,
  `sw.js`, `sanity_pass.js`, `docs/SYMBOLS.md`, `docs/ROADMAP.md` §3.9, `memory-bank/*`.

## 2026-09-28 — Tackle spec: CSV entry surface + validator (supersedes the md template)
Split the tackle-spec deliverable into two files with different lifecycles, because a cheat
sheet does not change when data does:

- **`docs/tackle_measurements.csv`** — the values, one row per item, 16 columns. CSV rather
  than embedded JSON so it opens in Numbers / Excel / Sheets (typed columns, sheet-side
  formulas for the derived fields) and so a miscounted comma cannot silently corrupt
  hand-edited JSON. Blank means "not measured", and blanks are never guessed.
- **`scripts/tackle_csv_to_json.py`** — the ONLY writer of `src/data/tackle.json`. Stdlib
  only and deterministic (sorted by id, no timestamp, so a no-op re-run is byte-identical).
  Derives `volume_cm3` and `density_g_cm3` from `mass_g` + `buoyancy_g`; rejects a wrong field
  count, an unknown `type`/`shape`, a duplicate id, or a non-numeric cell; and prints which
  items are still incomplete so it doubles as the progress tracker.
- **`docs/CONTRACT_TACKLE.md`** — now the cheat sheet only (measurement protocol), plus a
  column reference and the converter command. The old fill-in JSON template block is gone.

`src/data/tackle.json` is deliberately **not committed**: 15 of 16 seeded items are still
unmeasured and nothing reads the file yet, so it should appear alongside the physics rewrite
(and then join `sw.js` SHELL_FILES with a VERSION bump) rather than ship as a null skeleton.

Verified: a new sanity guard runs the **real** converter in `--check` mode instead of
reimplementing CSV parsing in JS — proven in BOTH directions. An injected extra comma on row 2
fails with "line 2: 17 fields, expected at most 16"; reverting is byte-identical (`git diff`
empty) and returns **102/102 green**. The guard earned its place immediately by catching a
genuine miscount in my own `cheater-12` row while building this.
- Key files: `docs/tackle_measurements.csv` (new), `scripts/tackle_csv_to_json.py` (new),
  `docs/CONTRACT_TACKLE.md`, `sanity_pass.js`.


## 2026-09-28 — docs/CONTRACT_TACKLE.md: measurement protocol + data template
Added the tackle-spec contract: how to measure every physical property of a tackle item
(mass, buoyancy, volume, density, diameters, projected area) plus an editable JSON template
with a worked example and 15 pre-seeded blank entries.

Purpose: the Gear Sim currently runs on **unitless calibration constants** (`lift = 0.90`,
`DRAG_REF = 7.5`, `hookSink = 0.35`) tuned so one reference rig lands at 8". Filling this in
lets the drag equation `F = ½·ρ·C_d·A·v²` carry **real units**, which is what makes the model
extrapolate instead of only working at the reference flow.

The core method is **Archimedes in one setup**: tare a cup of water on the scale, then
suspend the item submerged on a thread — the scale reads buoyant lift directly for floating
*and* sinking items, and `volume = B/ρ` and `density = m/V` follow. Notable guidance: line
diameter must be measured by **wrap-and-divide** (a micrometer crushes nylon and reads low),
yarn must be measured **saturated** (it absorbs water), and a line's drag coefficient is
*not* a static measurement — it needs a drop test or the field validation loop.

Not yet wired into the app, deliberately: `src/data/tackle.json` is the intended
machine-readable form once the values exist, so the repo does not carry data without a
consumer. Verified: all 3 JSON blocks in the file parse (5 keys / 11 keys / 15 items);
sanity **101/101 GREEN**.
- Key files: `docs/CONTRACT_TACKLE.md` (new).


## 2026-09-28 — Hygiene sprint H1–H3: module-list parity guard, `schema.sql` removed
A full repo-structure review surfaced one real bug class plus some drift, so the safe cleanups
went first; the feature ideas and architecture bets were parked rather than built.

**H1 — `SHELL_FILES` ↔ `index.html` parity guard (the only real defect).** The module list was
hand-maintained in TWO places: the `<script>` tags in `index.html` and `sw.js`'s `SHELL_FILES`.
Nothing asserted they agreed, so adding a module to one but not the other broke offline caching
*silently* — the page requests a script the service worker never precached, which works
perfectly online and fails in a dead zone, exactly where this app is supposed to earn its keep.
It had to be hand-synced twice in the two preceding commits. The sanity pass now asserts the two
`src/*.js` subsets match and names the offending file. Verified in BOTH directions: a probe
script added to `index.html` alone makes the guard FAIL with the filename; reverting is
byte-identical (`git diff` empty) and returns 101/101 green. The CDN script and the
non-`<script>` shell assets (manifest, icons, `styles.css`) are excluded by construction, since
neither belongs to both lists.

**H2 — deleted `src/services/schema.sql`.** A 179-line copy of the database schema living in the
frontend tree, self-labeled "DEPRECATED — superseded by `supabase/migrations/`", referenced by no
code, CI or config, and already caught going stale once (it still listed `corky_size`).
`supabase/migrations/` is the single source of truth and `supabase/README.md` documents it, so
the file was pure drift risk. It was never in `SHELL_FILES`, so no service-worker VERSION bump.

**H3 — recorded the over-target files.** Only `report.js` was tracked before; `activeContext.md`
now tables all six non-exempt files over the soft <150-line target (`regulations.js` 536,
`water.js` 450, `supabase.js` 361, `report.js` 295, `daynav.js` 183, `zone.js` 180) so the debt
stops being invisible. Exempt `src/data/*` files are called out separately.

**Parked on purpose**, now listed in `memory-bank/activeContext.md` rather than half-started:
future ideas (data-freshness gate + regulation-change alert, a source-status honesty panel,
legal-hours countdown, "which rig fits today?", offline photo queue, trip card) and future
tests/experiments (a second region, technique/species expansion, Capacitor packaging, extending
the `vm` runtime-test pattern to the pure modules). H4 — de-monolithing `sanity_pass.js` — is
parked as the lowest-value item.
Verified: sanity **101/101 GREEN** (was 100); `./scripts/check.sh --quick` clean.
- Key files: `sanity_pass.js`, `src/services/schema.sql` (removed),
  `memory-bank/activeContext.md`.


## 2026-09-28 — Phase 3.4 COMPLETE ✅: optimistic UI + pending-sync badge
Phase 3 finished. A catch is written to the durable outbox *before* the network call, which
is what makes it unloseable — but it also meant the list simply did not show it: the angler
tapped LOG CATCH DATA, the row went into IndexedDB, and nothing appeared until a later
successful flush. This closes that gap with a render change and no new storage.

New `src/features/catch-log/pending.js` owns all of it: `pendingRows()` (newest-first, from
`outboxPending()` — the ONE source of pending truth), `pendingNotIn(serverRows)`,
`pendingBadge()`, `asMyCatchRow(row)` and `refreshCatchLists()`. Board and My Catches both
paint pending rows at the top of their list; the badge rides inside the Name cell on the
public board so the four-column privacy shape is unchanged, and in the action cell in
"yours" — where Edit/Delete are deliberately withheld, since a buffered row has no server
id to act on yet. `syncPendingCatches()` now calls `refreshCatchLists()` on a confirmed
flush, so the badge clears and the row comes back from the server instead of the outbox
(one small fix folded in: `startFishing()` now awaits that flush instead of racing it).

Two honest limits, both documented in the module header: the public view selects no `id`
(privacy boundary), so the lost-*response* case — insert committed, reply never arrived —
can briefly show one catch twice until the retry resolves it; and the "yours" scope cannot
leak gear/GPS through this path, because only the columns that scope already renders are
read. `sw.js` VERSION → `v2.03.04`; `pending.js` added to SHELL_FILES + `index.html` +
`docs/SYMBOLS.md`.
Verified: sanity **100/100 GREEN** — the new static guard plus **8 runtime assertions** that
load the real module into a `vm` sandbox with a fake outbox and check filter, order,
no-mutation, dedupe, mapping, badge, post-flush re-render and absent-global safety.
- Key files: `src/features/catch-log/pending.js` (new), `src/features/catch-log/{board.js,
  mycatches.js}`, `src/features/auth/auth.js`, `src/styles.css`, `index.html`, `sw.js`,
  `sanity_pass.js`, `docs/SYMBOLS.md`, `docs/ARCHIVE_UPDATE_3.0.md`, `memory-bank/*`.


## 2026-09-28 — Docs consolidation into memory-bank/ + token-efficiency pass
Reorganized the docs into a cohesive `memory-bank/` front page (projectbrief, productContext,
activeContext, systemPatterns, techContext, progress) and moved the long-form docs under
`docs/`: `UPDATE_3.0.md` → `docs/ARCHIVE_UPDATE_3.0.md` (now correctly marked ARCHIVED —
built; it still claimed "nothing built yet"), `UPDATE_4.0.md` → `docs/ROADMAP.md`,
`CHANGELOG_INTERNAL.md` → `docs/CHANGELOG.md`; deleted the pure-pointer files
`ARCHITECTURE.md` and `copilot-instructions.md` (AGENTS.md already covers both).
`.clinerules` + `AGENTS.md` now point at `memory-bank/activeContext.md`, and the Memory rule
is explicit: a fact lives in ONE file and points at the deep doc — never forked. New
`docs/SYMBOLS.md` (file → public API index) and `docs/CONTRACT_CATCH.md` (payload → column
map, every column verified against the live DB via information_schema). A new
`sanity_pass.js` "Docs index" guard asserts every module in `index.html` is listed in
SYMBOLS.md, that all four contracts exist, and that `memory-bank/` is complete — the index
can no longer go stale silently.

Also fixed five stale-comment traps found during the pass: `src/services/supabase.js` listed
the dropped `corky_size` (and omitted 11 real columns) and claimed the calibration RPC
"returns []"; `docs/CONTRACT.md` still tabled `push_status`/`angler_desc`/`civil_in`/
`civil_out` as live fields; `scripts/smoke.sh` printed `push_status`; `auth.js` + `log.js`
carried "moves in UPDATE 3.0 Phase 3" TODOs for work already shipped; `report.js` had drifted
from "~285 lines" (now accurate at 294, and tracked in activeContext.md). Removed the stale
`.kilo/worktrees/chill-column` worktree. `sw.js` VERSION → `v2.03.03`.
Verified: sanity **90/90 GREEN** (was 87).
- Key files: `memory-bank/*`, `docs/SYMBOLS.md`, `docs/CONTRACT_CATCH.md`, `.clinerules`,
  `AGENTS.md`, `README.md`, `sanity_pass.js`, `sw.js`, `src/services/supabase.js`,
  `src/features/{auth/auth.js,catch-log/log.js,catch-log/reconcile.js,telemetry/report.js}`,
  `scripts/smoke.sh`, `docs/CONTRACT.md`.


## 2026-09-28 — Phase 3.3 COMPLETE ✅: outbox reconciliation on online / resume / focus
New `src/features/catch-log/reconcile.js`. The outbox was durable, but it only reached
Supabase when a session started; this arms the three moments the field actually produces:
`online` (connectivity restored), `visibilitychange` → visible (mobile "resume"), and
`focus`. Each calls `syncPendingCatches()`. Guarded exactly as planned: a single IN-FLIGHT
LOCK (overlapping flushes are ignored) plus a 15 s minimum interval; `online` passes
`force` because connectivity returning is the strongest signal; a signed-out client
short-circuits since RLS needs `user_id = auth.uid()`. The module records that the lock is
about WASTED REQUESTS, not safety — the write is already idempotent (clientId →
ON CONFLICT DO NOTHING), so even a double-send could not duplicate a catch. Armed from the
`app.js` bootstrap; `sw.js` precaches it and VERSION → `v2.03.02`. Verified: sanity
**87/87 GREEN** (new guard checks the three listeners, the lock, and that
`initCatchReconcile()` is actually called) + a 12-assertion functional test (in-flight lock,
interval throttle, force bypass, signed-out short-circuit, live listener registration).


## 2026-09-28 — Dead-code cleanup pass (before Phase 3.3)
Repo-wide sweep for dead code / dormant mechanisms. REMOVED: `src/data/riverRegulations.js`
(503 lines, loaded by NOTHING — `index.html` never included it, yet sw.js was precaching it;
its globals were superseded by `src/utils/regulations.js` long ago) + its SHELL_FILES entry;
and four dead API fields with zero consumers anywhere (`push_status`, `angler_desc`,
`civil_in`, `civil_out`) whose computations and payload keys are gone from
`api/water_report.py` and documented under "Removed (do not resurrect)" in
`docs/CONTRACT.md`. MIGRATION `20260928000100_drop_dead_columns` (authored, applied via
`npx supabase db push`, verified live): dropped `cast_distance_ft` + `hook_location`. Those
two were ALWAYS NULL — but `get_global_calibration` SELECTed both, so the RPC had to be
recreated without them (a RETURNS TABLE signature cannot be altered in place, 42P13) and its
ACL re-issued; verified live that the ACL is byte-identical (anon, authenticated,
service_role), the columns are gone, and the RPC still EXECUTES and returns the row.
`src/services/schema.sql` was ALSO stale (still listed `corky_size`, and an RPC missing the
env columns) and is now aligned with the live schema. Retired the stale
`.kilo/worktrees/clumsy-college` git worktree (it was polluting every repo-wide search).
Docs: `README.md` refreshed to the modular layout; `ARCHITECTURE.md` (a pre-3.0 snapshot) and
`copilot-instructions.md` reduced to POINTERS — both were stale second copies of the rules,
and the copilot file had actively misled (it still described the `app.js` monolith).
**⚠️ ONE DORMANT MECHANISM LEFT, AND IT IS NOT CLEANUP:** `communitySonar()` in
`gear-sim/sonar.js` skips any row whose `loc !== 'Fair'`, but NOTHING has ever populated
that field — so every calibration row is discarded and the strike zone always uses its
baseline. Fixing it changes the Gear Sim's zone, so it is recorded as a product decision in
TASK.md + UPDATE_4.0 §3.2. (Also corrected the stale "the RPC returns []" comment: the RPC
is live and DOES return rows.) Verified: sanity **85/85 GREEN**, all syntax checks, the
removed fields confirmed ABSENT from the live payload with every kept field present, and the
1.3/1.5/2.3 API regressions still green. `sw.js` → `v2.03.01`.


## 2026-09-28 — Phase 3.1 COMPLETE ✅: durable IndexedDB outbox (localStorage retired)
New `src/shared/idb.js` (minimal promise wrapper: `idbOpen/idbGetAll/idbPutAll/idbDelete`)
and `src/features/catch-log/outbox.js`, which keeps an IN-MEMORY MIRROR of the catch list and
writes through to IndexedDB. The mirror is the key design call: several readers need the list
SYNCHRONOUSLY (board fallback, gear-sim calibration fallback, pending-sync flush) while
IndexedDB is async — so callers keep their API and the store stays durable. `app.js` boot is
now `async` and `await outboxLoad()`s BEFORE any reader runs. Migration is built in: the
legacy `catch_db` key is imported on first load, every legacy row gets a stable `clientId`
(so a retry can't duplicate it), and the key is retired ONLY once the durable copy is
confirmed written. GRACEFUL DEGRADATION: private browsing can make IndexedDB unavailable, so
`idb.js` never throws and the outbox falls back to using `catch_db` as its store rather than
losing a catch. All 4 `catch_db` call sites (`board.js`, `log.js`, `auth.js`, `solver.js`) now
go through the outbox. DELIBERATELY DROPPED: the planned per-waterbody telemetry snapshot —
`sw.js` already caches `/api/water_report` under a normalised per-station key, so an
IndexedDB copy would be a second cache of the same payload with no consumer (recorded in the
code + plan). Verified: sanity **85/85 GREEN** (new guard: no module outside `outbox.js`
touches `catch_db`) + a 9-assertion outbox test (legacy import, stable ids, dedup across a
reload, flag persistence, fallback kind). `sw.js` → `v2.03.00`.


## 2026-09-28 — Phase 3.2 COMPLETE ✅: idempotent catch writes (no migration needed)
The dead-zone double-log bug is fixed CLIENT-SIDE. A read-only LIVE query confirmed
`public.catches` already has `catches_pkey PRIMARY KEY (id)`, so the conflict target needed
no schema change — the bug was simply that the client never sent an `id`, letting the server
mint a fresh one on every retry. Added `newUuid()` to `src/shared/format.js` (with an RFC
4122 v4 fallback for older WebViews); `logData()` stamps `clientId` at buffer time;
`toCatchRow()` maps `clientId` → `id`; `insertCatch()` now calls
`upsert(row, { onConflict: 'id', ignoreDuplicates: true })`. CRUCIAL DETAIL: a deduped write
(0 rows returned) is treated as SUCCESS — otherwise the outbox would retry a stored catch
forever. Verified: 6-assertion functional test (the row carries the id; the call is an
upsert with ignoreDuplicates; a plain `insert()` throws in the harness) + two new
sanity_pass guards → **82/82 GREEN**. CAVEAT (CORRECTED): a live double-insert was not run
from here (it would mint throwaway auth users), but **anonymous sign-ins ARE ENABLED** —
verified live: 7 anonymous auth users + one private catch row owned by one of them, which
correctly surfaces in `public_catch_feed` as 4 columns only. An earlier draft of this entry
claimed sign-ins were disabled; that came from a STALE CODE COMMENT in supabase.js (now
fixed) and was wrong. Lesson: verify auth config against the DB, not against a comment.
Phase 3 continues: 3.1 IndexedDB outbox, 3.3 reconciliation, 3.4 optimistic UI.


## 2026-09-28 — Phase 2.3 COMPLETE ✅: dynamic NOAA tide-station pairing
Each waterbody now pairs with its NEAREST CO-OPS tide station instead of one shared
station. `tide_station_candidates_for_site()` ranks stations within 40 mi and the handler
WALKS up to 4 of them, because some stations in the tideprediction list do not actually
serve MLLW predictions (verified live: 9446248 Des Moines → "No Predictions data was
found"). Day payloads now carry `tide_station`. Result: Puyallup/Carbon/White → Tacoma;
Nisqually → Dupont Wharf; Skagit → Swinomish Channel; Snoqualmie/Skykomish/Snohomish →
Everett; Stillaguamish → Stanwood; Cowlitz/Toutle/Kalama → Longview; and **Lewis River →
NO tides** (nearest gauge >40 mi) where the old code showed it Puget Sound tides — simply
wrong. Real USGS coordinates for ALL 15 waterbodies (+ pool entries) were collected ONCE
offline from the legacy nwis/site service (config population, not a runtime dependency), so
pairing needs no network. TWO HONESTY BUGS FOUND WHILE TESTING: (1) a WDFN **HTTP 429** was
swallowed, so a throttle got reported as "this river has no tides" — `_gauge_coords` now
returns (coords, resolved) and a FAILED lookup falls back to the default station instead of
claiming no tides; (2) `fetch_nearby_stations` returned an empty list when BOTH upstreams
were down, reading as the fact "no gauges here" — it now returns None and the endpoint adds
a `note` ("USGS gauges could not be reached") that the map displays. Added optional
`USGS_API_KEY` env support (raises WDFN's rate limit; never sent to the client). Verified:
sanity **80/80 GREEN** + live checks (12101500 tides, 12113000 walks past the broken
station, 14236000 zero tide points/curve with 4 days still returned).


## 2026-09-28 — Phase 2.5 COMPLETE ✅: interactive Leaflet station map
New `src/features/map/map.js` + a "Show Nearest Rivers on a Map" button in the station
modal. Leaflet loads LAZILY from a CDN; pins come from `/api/nearby_stations` (the 2.2
dynamic discovery) so the map plots whatever gauges actually exist near the point rather
than a hardcoded list, and tapping a pin reuses the SAME `selectPreset()` path as the
preset buttons. Kept deliberately as an ENHANCEMENT: if Leaflet fails (offline/blocked
CDN) the map hides itself with an explanation and the presets/search/GPS are untouched.
`/api/nearby_stations` now carries each gauge's registry `legal_hours`, so the popup can
state the rule ("Open all day" / "Daylight window…" / "Hours not verified") with no report
load. Pin colour states DATA AVAILABILITY (grey dormant / green live) — an
optimal/blown-out colour needs the §8 percentile work, so none was invented.
SECURITY FIX: added `escapeHtml()`/`escapeJsString()` to `src/shared/format.js` and
retrofitted `presetButtonHtml` in `station/search.js`, which had been interpolating
third-party USGS names straight into innerHTML (AGENTS.md forbids that). `sw.js`: map.js
precached, `unpkg.com` added to cross-origin SWR, VERSION → `v2.02.00`; OSM tiles stay
network-only. Verified: sanity **79/79 GREEN** + a 13-assertion map-logic pass. NOTE: a
real-device tap test is still outstanding (no browser in this environment).


## 2026-09-28 — Phase 2.2 + 2.4 COMPLETE ✅: dynamic discovery + proxy hardening
**2.2 dynamic radial discovery:** `fetch_nearby_stations` no longer depends on the curated
gauge list. New `_discover_wdfn_locations()` queries `/monitoring-locations` for the STREAM
sites in a ±0.6° bbox (probed: limit=1000 returns the box COMPLETE — 747 sites, no next
link), keeps the closest 120 by real Haversine distance, then ONE `/latest-continuous`
query returns their live values. The registry `discovery_pool` survives ONLY as a fallback
when discovery fails. Result near Puyallup: **8 live gauges**, including White River sites
the curated pool never had (`12101102`, `12100500`, `12100498`…). Also probed: **no API key
is required** (200 without one), so the "server-side key" part of 2.2 is moot — a key stays
an optional env var only.
**2.4 proxy hardening:** `coords_ok()` bounds lat/lon to the covered region;
`is_rate_limited()` is a per-client sliding window (40/60s → 429 + `Retry-After`) checked
BEFORE any third-party fan-out; the water report is memoised 60s (capped dict). Verified:
out-of-region nearby → **400**; 50-request burst → **429 after 40**; second identical
report → `X-Cache: HIT` and **4.10s → 0.001s**. Caveat recorded: the limiter/cache are per
serverless instance (no shared store) so they blunt bursts, not a global quota.
STILL OPEN in Phase 2: **2.3** NOAA CO-OPS dynamic tide pairing (all waterbodies still use
the registry default station) and **2.5** the interactive map. Sanity **78/78 GREEN**.


## 2026-09-28 — Phase 2.1 COMPLETE ✅: all 5 USGS call sites on WDFN
Finished the migration off the dying `waterservices.usgs.gov` (decommissioned Q1 2027).
Newly migrated this pass: (1) `fetch_dam_clarity` → `/daily` with a 14-day `datetime`
window (probed first: the collection returns the FULL period of record, so the window is
mandatory); (2) `fetchCFSMomentum` in the BROWSER → `/continuous` with a 4-hour window
(same lookback the legacy `period=PT4H` gave, so the delta stays comparable; refactored
into `fetchCfsReadingsWdfn`/`fetchCfsReadingsLegacy` returning a source-agnostic
`[{t,v}]`); (3) `station/search.js` → `/monitoring-locations` by id, and by NAME via
**CQL2 `LIKE`** (plain `monitoring_location_name=` proved to be exact-match only) plus a
second `/latest-continuous` step that keeps only gauges with live readings. De-hardcoding
bonus: `stateCd=wa` → the registry's `state_name`, so adding a state no longer touches
this file. VERIFIED: clarity series has **exact parity** with legacy (14 days, same latest
date/value 2026-09-27 / 917.12, same outlook "Dam releasing (reservoir dropping)");
`nearby_stations` returns 11 stations; 1.3/1.5 API regressions green; sanity **78/78**.
`sw.js` VERSION → `v2.01.04` (water.js + search.js changed).


## 2026-09-28 — Phase 2.1 (partial) ✅: USGS WDFN migration — 2 of 5 call sites
`waterservices.usgs.gov` is decommissioned in Q1 2027, so the two main backend readers now
prefer the modernized **WDFN OGC API** (`api.waterdata.usgs.gov/ogcapi/v1/collections`),
with the legacy reader kept ONLY as a fallback used when the modern endpoint is
unreachable/unparseable. Migrated: `fetch_usgs_telemetry` (`nwis/iv` →
`/latest-continuous` + `/monitoring-locations` for the station name) and
`fetch_nearby_stations` (multi-site `nwis/iv` → ONE multi-location `/latest-continuous`
query). Live-probed the API first: **no API key needed** (200 without one; a key only
raises the rate limit), ids take a `USGS-` prefix, values are GeoJSON
`properties.value/.time`, and CORS is `*`. **Exact parity verified** for `12101500`: WDFN
and legacy return identical `cfs 959`, `gage 10.08`, `is_active`, `site_name`, and even the
same `updated_time` ("Today at 8:45 AM PDT" — the UTC→Pacific conversion matches the legacy
offset check). Bonus: WDFN returns coordinates, so `KNOWN_COORDS` is gone from the modern
path, and nearby station names now come from the registry (title case, not NWIS caps).
REMAINING legacy sites (tracked in TASK.md §2): `fetch_dam_clarity` (nwis/dv),
`fetchCFSMomentum` (browser PT4H — needs `/continuous`), `station/search.js` (×2, incl.
the WA-hardcoded `stateCd=wa`). Verified: sanity **78/78 GREEN** + the 1.3/1.5 API
regressions stay green.


## 2026-09-28 — Phase 1.5 COMPLETE ✅: legal hours are registry-driven
`api/water_report.py` gains `legal_hours_for_site(site)` and reports `lines_in`/`lines_out`
ONLY for `daylight` (sunrise ±1h) and `24hr` ("12:00 AM"/"11:59 PM") — every other rule
reports **null**, so a legal window is never fabricated. Each day now carries a
`legal_hours` field. The **quality** `windows` timeline keeps its sunlight window (it is a
fishing-quality model, not a legal claim), so `peak` and the hero are unchanged. Frontend:
new pure `legalHoursLabel(rule, in, out)` in `daynav.js` is the single rule→wording mapping
(`24hr` → "Open all day", `unknown`/`custom` → "not verified — check the regulations"), and
the local solar fallback now runs ONLY for `daylight` so a client can never invent a window.
Phase 1 (de-hardcode & modularize) is now COMPLETE except the deferred 1.4b picker.
Verified: `sanity_pass.js` → **78/78 GREEN** (new 4-rule label assertion); live API on
`12101500` (daylight: real times + non-zero peak) and `12113000` (unknown: null window,
timeline/peak intact). `sw.js` VERSION → `v2.01.03`. Contracts updated
(`docs/CONTRACT.md` + `docs/CONTRACT_REGIONS.md`).


## 2026-09-28 — Phase 1.4a COMPLETE ✅: Gear Sim technique registry (behaviour frozen)
Split the deterministic solver out of `sim.js` into a REGISTRY-DRIVEN technique:
`techniques/drift.js` owns the logic as `DRIFT_TECHNIQUE.compute(rig, env)` (flossing is a
drift STYLE, not a technique), `registry.js` indexes techniques + `gearTechnique(id)` with a
safe default, and `solver.js` holds the impure halves (`readRigFromForm`,
`loadCalibrationData`, `buildSimStats`, `paintSimHud`). **`sim.js` is now a 37-line
orchestrator (was 162)** — adding a technique never edits it. New
`docs/CONTRACT_TECHNIQUE.md` documents the interface + the technique/style/preset hierarchy.
VERIFICATION FIRST: before refactoring, `sanity_pass.js` gained two frozen-baseline
assertions — the raw physics (4 rigs) AND the COMPOSED drift solver (hgt 2.893", score
4.502, zone 4–12, 3 suggestions) — captured from the pre-refactor implementation, so parity
is proven rather than assumed. `sw.js` VERSION → `v2.01.02`. **77/77 GREEN**.
DEFERRED (deliberate): the Technique/Species picker + `GEAR_STYLES`/`GEAR_SPECIES` — they
land together with real style tuning, so the repo carries no data without a consumer.


## 2026-09-28 — Phase 1.3 (backend) COMPLETE ✅: the API reads the region registry
`src/data/regions/washington.js` is now **strict JSON** (header comment + JSON payload)
so ONE file serves both consumers: the frontend loads it as a classic script and
`api/water_report.py` slices marker→final `;` and `json.loads()` it
(`load_region_registry()`, cached for the warm serverless instance). Derived from the
registry: `USGS_SITE`, `NOAA_STATION`, `LAT`/`LON`, `FORECAST_DAYS`, `NETTING_DAYS`,
`NETTING_SITES` and `nearbyStationIds` (from `discovery_pool`). New `stocks_for_site(site)`
replaces the global `STOCK_BASELINES`; `calculate_stock_base_score`/`build_species_calendar`
now take the active `site` — an off-basin river can no longer inherit Puyallup run numbers.
Legacy literals survive ONLY as a fallback when the registry is unreadable.
Gotcha fixed en route: my own header comment contained the loader's marker string, so a
naive `index()` matched inside the comment → loader uses `rindex` and the comment no longer
repeats the marker. LIVE-VERIFIED (dev server): `12101500` unchanged (4 days, Chinook/Coho,
`clarity_outlook` present); `12113000` (Green) → `species_calendar: []`,
`clarity_outlook: null`, `is_netting: false`, telemetry intact. `sanity_pass.js` guard
rewritten to assert BOTH parse paths agree and that the backend derives from the registry
→ **72/72 GREEN**. STILL PENDING: `report.js` → `cards.js` split (deferred, non-blocking).


## 2026-09-28 — Phase 1.2 COMPLETE ✅: region registry (data + contract)
Authored `docs/CONTRACT_REGIONS.md` (schema + "what it replaces" table) and
`src/data/regions/washington.js` — `window.REGIONS.WA`: **15 waterbodies** (Puyallup,
Carbon, White, Green, Nisqually, Skagit, Snoqualmie, Skykomish, Snohomish,
Stillaguamish, Cowlitz, Toutle, Lewis, Kalama, Cedar), the 15-gauge `discovery_pool`
(was `nearbyStationIds`), `default_site`/`default_coords`/`default_tide_station`/
`default_species`/`netting_days`, and per-waterbody `gauge`/`related_gauges`/`coords`/
`legal_hours`/`netting_sites`/`stocks`/`capabilities`. **Data-only — no reader wired yet**
(1.3 backend, 1.4/1.5 frontend). Honesty rules: `legal_hours` = `daylight` only for
Puyallup (mirrors the current ±1h behaviour), the other 14 stay `unknown` (filled from
WDFW rules in 1.5); `stocks` only on Puyallup; White River carries
`capabilities.dam_clarity` replacing the `site in NETTING_SITES` gate. Wired into
`index.html` (first local script) + `sw.js` SHELL_FILES, `VERSION` → `v2.01.01`.
NEW GUARD: `sanity_pass.js` asserts the registry stays in lockstep with the legacy
`water_report.py` constants (nearbyStationIds / NETTING_SITES / NETTING_DAYS / USGS_SITE /
NOAA_STATION / LAT,LON / STOCK_BASELINES) + the `index.html` presets and `#species`
options → **72/72 GREEN**. Also recorded: Step 4 (report.js/sim.js internal splits) is
folded into Phases 1.3/1.4 rather than done standalone.


## 2026-09-28 — TASK.md trimmed to ACTIVE-only (460 → 33 lines)
UPDATE 3.0 Phase 4.4 (doc hygiene) pulled forward. Moved the completed phases (2.1–2.4.1,
460 lines) out of `TASK.md` into `docs/ARCHIVE.md` (now 714 lines) with an "already
archived" guard so a re-run is a no-op; content preserved verbatim (verified by grep for
`Phase 2.4.1 — Timezone fix` and `Commit 2.1f`). `TASK.md` now points at **UPDATE 3.0
Phase 1** as ACTIVE (1.1 ✅) and lists the non-blocking follow-ups. NOTE: a shell heredoc
mangled the first write attempt and exited 1 **without executing** — `TASK.md` was left
intact; redone via editor temp-file + `cp`.


## 2026-09-28 — Phase 1.1 COMPLETE ✅: app.js 2,460 → 24 lines (bootstrap only)
Finished the monolith split (batches 3–6). New: `src/features/catch-log/`
`board.js`(scope toggle + list) `mycatches.js`(private log) `log.js`(logData +
deriveRiverName); `src/features/gear-sim/` `rig.js`(save/restore) `sim.js`(runSim)
`debounce.js`; `src/features/station/` `picker.js`(modal/GPS) `search.js`(USGS search);
`src/shared/` `refresh.js`(auto-refresh) `pwa.js`(SW + deep link). **22 modules total**,
all classic scripts in `index.html` load order, `app.js` LAST (now just `window.onload`;
its stale "application core" header rewritten to say BOOTSTRAP). Every move was a
line-range slice guarded by a byte-for-byte tiling assertion. Verified: `node --check` on
29 scripts + `node sanity_pass.js` → **70/70 GREEN**. Two large single functions left as
non-blocking follow-ups: `telemetry/report.js` (294) and `gear-sim/sim.js` (162).


## 2026-09-28 — Phase 1.1 (partial): app.js split, 2,460 → 880 lines ✅ verified
Extracted the classic-script monolith into feature modules (all still classic scripts,
one global scope, loaded in `index.html` order, `app.js` LAST). New: `src/shared/`
`debug.js`(logDebug) `ui.js`(debounce/showToast) `nav.js`(switchTab/resetToToday)
`format.js`(normalizeFeedRow/formatCatchTime) `forms.js`(rod/material/field sync);
`src/features/auth/auth.js`(guest session + pending-catch flush); `src/features/telemetry/`
`tide.js` `hero.js` `daynav.js` `report.js`(loadWaterReport); `src/features/gear-sim/`
`inputs.js` `physics.js`(Cd locked 1.0) `sonar.js` `zone.js`. Mechanics: deterministic
line-range slice per batch with a "slices tile the original byte-for-byte" assertion (no
hand transcription); `sw.js` SHELL_FILES + `VERSION` → `v2.01.00`. **`sanity_pass.js` is
now self-maintaining**: it reads the local script list from `index.html` for the syntax
check, HTTP checks, and the source-level checks (it used to hardcode `src/app.js`, which
broke the hero assertion until fixed). Verified: `node --check` on all 19 scripts +
`node sanity_pass.js` → **60/60 GREEN**. REMAINING in 1.1: catch-log, gear-sim rig/sim,
station, refresh/pwa → leave app.js as bootstrap only. NOT committed.


## 2026-09-28 — UPDATE 3.0 / 4.0 blueprints written (planning only; no code yet)
Split the roadmap into TWO files. `UPDATE_3.0.md` (ACTIVE): de-hardcode via a
`state → waterbody` region registry (replaces `USGS_SITE`/`NOAA_STATION`/`LAT,LON`/
`STOCK_BASELINES`/`NETTING_SITES`/`nearbyStationIds` etc.), USGS **WDFN OGC migration**
(hard deadline Q1 2027 — `waterservices.usgs.gov` is being decommissioned), per-river
`legal_hours` (daylight/24hr/custom/unknown — fixes night-fishing rivers), flow
**percentile-of-record** scoring (absolute CFS doesn't scale), IndexedDB outbox +
**idempotency** (`ON CONFLICT DO NOTHING` — fixes the dead-zone double-log bug),
interactive Leaflet map (gauge picker + Level-A reg panel), technique/style/species
registries (drift only; flossing = a drift *style*), and a Token Efficiency Protocol
(`SYMBOLS.md`, file headers, contracts). 26 `- [ ]` items across 5 phases.
`UPDATE_4.0.md` (ROADMAP): accounts + RLS "summary vs details" friend tier, Private
Season, Crews leaderboard, location-free brag board + EXIF-stripped photos, River Pulse,
technique/species expansion, regulation polygons, Capacitor native shipping.
NO code files changed — only the two new docs. Next: sync `TASK.md` to Update 3.0.


## 2026-09-18 — Phase 2.4.1 complete ✅ (timezone + scroll/bar + hero/pills/gear rows)
TIMEZONE: `api/water_report.py` now derives `now` from
`ZoneInfo('America/Los_Angeles')` (Vercel runs UTC), so the 4 cards, the TODAY tag
and the Sun/Mon/Tue netting check all agree with Pacific — verified live: day 0 =
`Friday, Sep 18`, `Sunday=NETS Monday=NETS`. SCROLL: dropped `height:100%` on
`html,body` (body was a nested scroller) and set body padding-bottom to
`calc(56px + env(safe-area-inset-bottom))`. BAR: safe-area inset moved back onto
`.bottom-tab-bar`; `.tab-btn` is a fixed 56px centred button. HERO: real
`[ FISHING OUTLOOK ]` `.sec-hdr` above a single centred line (reasons capped at 2),
in-pill `hero-lbl` gone. PILLS: `.env-badge` centres value+label with a reserved
sub-line slot on all 9 cells. COUNTS: fold renamed `▸ Forecast & Hatchery Report`,
`fetchEscapementLive` now also returns `max(:updated_at) AS lastUpdated`
(live `2026-09-18T07:09:37.303Z`) rendered as `Last updated Sep 18, 2026 · 12:09 AM`
local, else `Hatchery data may lag WDFW reporting.` RUN CARDS: peak day-counter +
`.run-footer` removed (peak date label kept). GEAR: both forms use 6 explicit
`.gear-row`s (leader row is 3-up), replacing the 2-col auto-flow grid.
- Key files: `api/water_report.py`, `index.html`, `src/app.js`,
  `src/services/water.js`, `src/styles.css`, `sw.js` (v2.00.12), `sanity_pass.js`
  (45 checks), `TASK.md`. NO DB migration. Not committed yet (awaiting approval).

## 2026-09-18 — HANDOFF: Phase 2.4.1 planned, NOT started (new chat starts here)
Phase 2.4 shipped as `b7b8f1d` (tree clean). The next batch is fully specified in
`TASK.md` -> ACTIVE Phase 2.4.1 with `- [ ]` boxes; read that file first.
Scope: (1) TIMEZONE BUG — `api/water_report.py` uses `datetime.now()` (server UTC)
so forecast days / TODAY tag / `dt.weekday()` netting drift from the Pacific
calendar ("nets in the river" showed on a Saturday); fix with
`ZoneInfo('America/Los_Angeles')`. (2) Scroll can't reach the bottom — drop
`html,body{height:100%}` and match body padding-bottom to the bar height.
(3) Bottom bar gap — safe-area inset belongs on `.bottom-tab-bar`, not the buttons.
(4) "FISHING OUTLOOK" becomes a real `.sec-hdr`; hero body is ONE centred line.
(5) Pills — centre value+label (drop `space-between`/`min-height:76px`).
(6) Counts fold -> "Forecast & Hatchery Report" + `:updated_at` MAX from Socrata
as a real "Last updated" line (verified live `max(:updated_at)`).
(7) Remove the "Peak in/was N d" footer from run cards. (8) Gear Sim/Catch Log gear
fields -> resting rows, one group per line, order preserved.
No DB migration needed this phase.

## 2026-09-18 — Phase 2.4 complete ✅ (one-screen forms, HUD cleanup, Foam 1+2)
Hero is now a labelled two-line "FISHING OUTLOOK" card. Conditions pills go
uniform (grid-auto-rows 1fr). Wind shows "mph" again. Counts fold is a small
in-family chevron (not a blue pill). Bottom tab bar safe-area inset applied ONCE
(fixes the gap above the home indicator). Gear Sim: stars + score-bar REMOVED —
HUD is LINE HEIGHT + BOTTOM CURRENT ("how hard the water pulls"); bed-velocity
renamed/explained. FLOW + DISTANCE inputs removed from BOTH tabs — flow is now
DERIVED from the live report (fallback last-known -> 1040) and still recorded;
cast_distance_ft writes null. All gear dropdowns lost their defaults: values
pre-fill per-device from the user's own last input (localStorage) and otherwise
stay blank + required (validator toasts "Fill in: …"). Leader Length is a number
input. Foam split into Foam 1 + Foam 2, both FEEDING the buoyancy model (verified
6.56" -> 11.37" for a second corky). Gear fields re-laid into a compact 2-column
grid (same order preserved) so both tabs fit one screen. Catch Log: Join the
Board back at the TOP, "Angler & Location" header removed, Date & Time moved to
Catch Result. Migration 20260918000400 adds foam_2 (agent applied + verified).
SW cache v2.00.11. Sanity 35/35 green.
- Key files: `index.html`, `src/app.js`, `src/services/water.js`,
  `src/services/supabase.js`, `src/styles.css`, `sw.js`, `sanity_pass.js`,
  `supabase/migrations/20260918000400_foam2.sql`.

## 2026-09-18 — Phase 2.3 complete ✅ (board-first catch log, compact hero, mobile polish)
Hero moved to the TOP of the water card, now a single compact line (verdict ·
best window · why) — half the old height. Conditions 3×3 pills given equal
min-heights so all rows are uniform. Run-meter gradient REMOVED (back to flat
status-colored fill + peak tick). Bottom tab bar: `viewport-fit=cover` added to
the meta (fixes rounded/notched phone safe-areas), tabs taller (60px, 12px).
Gear Sim HUD + headings compacted so the whole form fits on one screen. Catch
Log is now BOARD-FIRST: default scope = Everyone (columns Name/Time/River/Fish,
Flow dropped from public), sign-in moved DOWN above the board as "Join the
Board", GPS field + 📍 visual and Hook Location select removed (GPS still
captured silently; `river_name` derived from active station). New migration
`20260918000200_add_river_name_drop_today.sql` adds `river_name`, rebuilds
`public_catch_feed` (name/time/river/fish), and DELETES today's stray
`Nick · Coho · 1050 · 14:38Z` row. Sanity: 31/31 green.
Migrations applied to the live DB by the agent (`npx supabase db push`):
`20260918000200` (river_name + view + today-row delete) and `20260918000300`
(backfill the surviving 09-17 catch to `river_name='Puyallup River'`). Standing
convention persisted to `.clinerules`: always author DB changes as idempotent
timestamped migrations AND apply them via `db push` (never hand it to the user).
- Key files: `src/app.js`, `src/services/supabase.js`, `src/styles.css`,
  `index.html`, `sanity_pass.js`, `supabase/migrations/20260918000200_*.sql`,
  `supabase/migrations/20260918000300_*.sql`, `.clinerules`, `.gitignore`.

## 2026-09-18 — Phase 2.2 complete ✅ (UI honesty + readability + auto-refresh)
9-pill conditions grid rebuilt (Barometer / Precip% + in_NH-now-for hint /
PrecipVol + hint / Cloud / Temp + trend arrow / Wind + direction arrow, FIXED
double-"mph" / Sunrise-Sunset split / Moon / Solunar; Water Temp pill dropped,
it stays in the telemetry line). Backend now ships `temp_delta_f` +
`precip_phase/start/end` (hourly Open-Meteo `temperature_2m,precipitation`).
Mystery "Movement Index" + %-timeline REMOVED → `buildFishingHero()`: plain-
English verdict (Good/Mixed/Tough) + best window + why bullets (clarity "Dam
releasing…" folded in). Species calendar: Pink hidden on even years (2026),
counts toggle is a bright button (Forecast/Returned/Trapped/5-Yr Avg), run
meter is a cool→hot→cool gradient. Hamburger + drawer deleted (bottom tab bar
owns nav; center station header). Accessibility: body 11→14px, bigger labels,
brighter muted text. AUTO-REFRESH: `loadWaterReport(true)` every 5 min (visible
+ online), on foreground, on reconnect — never overwrites a typed Gear Sim CFS;
header ⟳ button added. SW cache v2.00.10. Sanity 28/28 green.
- Key files: `api/water_report.py`, `src/app.js`, `src/services/water.js`,
  `src/styles.css`, `index.html`, `sw.js`, `sanity_pass.js`, `TASK.md`.

## 2026-09-18 — 2.1d CONFIRMED write shipped (real numbers in the UI)
Human opened the real 2026 WDFW PDFs and confirmed: Puyallup Chinook 18,890 /
Puyallup Coho 53,588. `refresh_wdfw_forecast.py --confirm --chinook=18890
--coho=53588 --yes` wrote them into `src/data/wdfw_forecasts.json` (forecast
`null → 18890 / 53588`, year 2026, real source URLs). Fixed the frontend so the
confirmed numbers actually SURFACE: `refreshWdfwForecast()` added to
`src/services/water.js` (mirrors the escapement honest-data fill-only-matching-
cell pattern; fetches the static JSON, maps species, keeps "--" on failure);
called from `src/app.js` after `refreshEscapement`. Previously `wdfwForecast`
was hardcoded `null` in the renderer so the JSON could never display. SW cache
bumped to v2.00.9 so existing installs precache the confirmed numbers. Sanity
28/28 green.
- Key files: `src/data/wdfw_forecasts.json`, `src/services/water.js`,
  `src/app.js`, `sw.js`.

## 2026-09-18 — Phase 2.1 COMPLETE ✅ (a–f all shipped)
2.1a real transit data + netting scoped; 2.1b RUN & TIMING panel + movement
index; 2.1c clarity badge (Mud Mountain dam, Puyallup-only); 2.1d WDFW forecast
scraper (honest degrade — PDFs are vector graphics); 2.1e bottom tab bar +
pinch zoom + date-tap; 2.1f 9-pill conditions grid (backend `current` readings,
client `fetchWeatherConditions` deleted). Real fishing intel, no fabricated
counts. Sanity 28/28 green throughout.
- Key files: `api/water_report.py`, `src/app.js`, `src/services/water.js`,
  `src/styles.css`, `index.html`, `sw.js`, `scripts/refresh_wdfw_forecast.py`.

## 2026-09-18 — Phase 2.1e done: app feel (bottom tab bar, pinch zoom, date-tap)
Persistent fixed bottom tab bar (Water Report / Gear Sim / Catch Log) with
`role="tablist"` + `aria-selected`; `switchTab` now syncs the bar so deep links /
bootstrap keep it accurate. Viewport zoom restrictions dropped (pinch zoom back).
Date header is now a `<button onclick="resetToToday()">` (returns to Today when
paged forward, no-op at 0); long station names ellipsize. Body bottom padding +
safe-area for the fixed bar. SW cache v2.00.7.
- Key files: `index.html`, `src/app.js`, `src/styles.css`, `sw.js`.

## 2026-09-18 — Phase 2.1d done: WDFW forecast hybrid scraper
`scripts/refresh_wdfw_forecast.py` resolves the STABLE WDFW index → real 2026
Chinook/Coho PDF URLs, downloads, attempts stdlib zlib text extraction. The PDFs
are vector-graphic tables (no text layer) → honest degrade: prints URLs + hint,
writes nothing. `--confirm` now requires `--yes` double-confirm (safety, after a
careless test wrote 34k/48k seed guesses — caught + reverted to null). Forecasts
stay null (UI "--") until a HUMAN opens the PDFs and confirms real numbers.
check.sh + sanity compile-list now include the new script.
- Key files: `scripts/refresh_wdfw_forecast.py`, `src/data/wdfw_forecasts.json`,
  `scripts/check.sh`, `sanity_pass.js`.

## 2026-09-18 — Phase 2.1c done: clarity signal (White River / Mud Mountain Dam)
`fetch_dam_clarity()` reads USGS DAILY-VALUES (14-day series, 12098500 00060 +
12098000 62614) and derives an honest `clarity_outlook` — Puyallup sites only
(live: "Dam releasing (reservoir dropping)" on 12101500, `None` on Green).
Frontend renders a small `.clarity-badge` pill inline in the telemetry row,
gated on site_id ∈ Puyallup basin. NOTE: iv feed only returns single/dormant
records, so dv was the right honest trend source (never fabricates FNU).
- Key files: `api/water_report.py`, `src/app.js`, `src/styles.css`.

## 2026-09-18 — Phase 2.1b done: consolidated RUN & TIMING panel
Merged `[ HATCHERY ESCAPEMENT ]` + `[ SPECIES RUN CALENDAR ]` + `[ LEGAL HOURS
TIMELINE ]` into ONE `[ RUN & TIMING ]` panel: always-visible MOVEMENT INDEX
(0-100, human `reasons[]` behind `<details>`), per-species run cards (status
pill + progress bar + peak line always visible; `WDFW forecast / Return / Trap /
5-Yr Avg` counts folded per card), legal-hours windows kept inside.
`refreshEscapement` now fills count cells by `data-species`/`data-count` instead
of replacing a section; dead `buildEscapementSection` + `.esc-slot` removed.
- Key files: `src/app.js`, `src/services/water.js`, `src/styles.css`.

## 2026-09-18 — Phase 2.1a done; token-reduction pass applied
Backend accuracy shipped: real `transit_state`/`transit_time`, netting scoped to
Puyallup/White/Carbon (`NETTING_SITES`), fake `active_fish` Gaussian deleted,
`src/data/wdfw_forecasts.json` schema added (+ precache). Then cut full-history
docs (TASK.md 429->158, CHANGELOG pruned), added `docs/CONTRACT.md`,
`scripts/check.sh`/`scripts/smoke.sh`, `sanity_pass.js --quiet`, and lean
`.clinerules`.
- Key files: `api/water_report.py`, `src/data/wdfw_forecasts.json`, `sw.js`,
  `TASK.md`, `.clinerules`, `docs/ARCHIVE.md`, `docs/CONTRACT.md`,
  `scripts/check.sh`, `scripts/smoke.sh`, `sanity_pass.js`, `CHANGELOG_INTERNAL.md`.

## 2026-09-18 — Phase 2.1 plan persisted (handoff for a fresh Act chat)
Approved plan: surface REAL fishing intel, no fabrication. Removed the fake
`active_fish` Gaussian + cancelled hero line; netting scoped to Puyallup/White;
consolidate escapement+calendar+windows into one RUN & TIMING panel ("status
stays, numbers fold" via <details>); add movement index, clarity signal
(White River/Mud Mountain dam), WDFW forecast hybrid scraper, 9-pill grid, and
resurrected bottom-nav/pinch-zoom app feel.
- Key files: `TASK.md`, `.clinerules`, `CHANGELOG_INTERNAL.md`.

## 2026-09-18 — Phase G–H + real-device GPS shipped
Phase G: own-gauge water quality, merged My Catches + Brag Board, centered
station button, plain OPEN/CLOSED reg pill. GPS: Safari HTTPS + reliable
`/api/nearby_stations` + retry. Phase H: smooth tide area chart + species run
cards. Sanity pass 29 checks, live env verified.
- Key files: `api/water_report.py`, `src/app.js`, `src/services/water.js`,
  `src/styles.css`, `index.html`, `sw.js`, `sanity_pass.js`.

## Archive (older phases, one-liners)
- 2026-09-17 Phase E: env-matched community sonar weighting — `src/app.js`.
- 2026-09-17 Phase D: tide chart + species calendar + calibration env RPC — API/app/styles/migration.
- 2026-09-17 Phase B: catch-write fixes (Cheater rig, hook_size int) + env columns + My Catches.
- 2026-09-17 Phase A: correctness/safety — unified regs engine, XSS fixes, GPS hygiene.
- 2026-09-17 Live DB fully migrated (init_schema, normalize_rls, catch_writes, set_user_id_default).
