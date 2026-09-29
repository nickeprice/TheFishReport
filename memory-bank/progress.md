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

- 2026-09-29 — **WS-8a science model** (issue #2 follow-on): the Gear Sim's environment is rebuilt.
  The single `≥55F → rise` rule (backwards above the comfort band) becomes `thermalOptimum()` with
  five bands — `<45` torpid / `45–50` cool / `50–60` optimal / `60–65` warming / `>65` stress — the
  barometer is **demoted** +3.5/−3.0 → **±1.2"**, and two terms join it: **own-gauge turbidity**
  (`window.turbidityFnu`, null → no term) and **light from the report's reference hour** (never the
  clock — that would make the solver non-deterministic). Depth is now **measured**: `depthAtGauge()`
  = median `A/W` of the six USGS rows nearest today's flow, cross-checked by `Q/(W·V)` (worst gap
  0.47%), exposed as `spotDepthFt()` in the same same-reach provenance shape as `velocityAtSpot()`
  and **null** when unmeasured. New **"Where to fish"** row (depth + lie + colour/light + your
  line against the band, on AND off target) paints as the last strike-zone bullet and returns as
  `out.whereToFish` — deliberately not a `suggestions` entry, so the frozen baseline stayed at 2.
  `sw.js` `v2.03.22`, **128/128**.

- 2026-09-29 — **WS-4 weather is per-day** (issue #2) + **tappable hourly popup**: each day now
  reports ONE reference hour block — today = the hour containing *now* (`2:37pm → "3-4 PM"`), a
  later day = the hour containing the **legal start** (`lines_in`), a 24hr river = sunrise, an
  unverified window = midday — so the six weather pills describe the *same* moment and finally
  change as you cycle days (the old code stamped one `current` snapshot on all four cards AND
  `applyReportWeather` re-painted every card from `reports[0]`). New per-day `weather_hour` +
  `weather_hourly` (24 rows); **wind shows the direction text as well as the arrow**; **Precip Vol
  is the hour's volume**; tapping any of the six pills opens that day's **24-hour swipeable strip**
  (reference hour outlined + auto-scrolled, ≥30% hours tinted on the precip strip). Physics
  untouched: `rain` stays the daily freshet total, `cloud_pct` prefers the reference hour,
  `press_delta` anchors to it. `sw.js` `v2.03.21`, **122/122**.

- 2026-09-29 — HUD correction (user): the Strike Zone gradient lives on the **estimate number
  only** — the separate trend strip + sliding marker are gone — and **both** panels now render one
  bullet style (0.68rem / `#d1d5db`; the dim 0.62rem strike-zone variant read as hard to read).
  `sw.js` `v2.03.20`, **120/120**.

- 2026-09-29 — Gear Sim HUD v2 (chat ask, same session): line **brands list "Generic" first**
  (display only — the value stays the library string so matching/ids are untouched), the **Strike
  Zone Estimate grew a trend line** (red-yellow-**green**-yellow-red strip, marker walks right for a
  deeper zone, number coloured on the same grade: green at the 4"–12" base → yellow at half scale →
  red at 7.0", 0.1" steps), **one bullet per row** on both panels, the **community-catch note is
  hidden** while the sonar still pulls the zone, **"On target"** is a single row, and the rig bullets
  are short rows (the `Targeting <species>…` line is gone). `zoneNotes()` + `paintZoneHud()` replace
  `zoneWhyText()`; both panels share `gradeColor()`. Frozen drift suggestion count deliberately
  re-pinned 3 → 2. `sw.js` `v2.03.18`, **119/119**. Then two label fixes in the same session: the
  bead fields dropped the stray `(Presentation)` and the foam option reads **`Cheater 10`**
  (display-only — value still `c12`, lift 0.70, and the `cheater-12` measurement row untouched);
  `sw.js` `v2.03.19`, **120/120**.

- 2026-09-29 — Gear Sim HUD polish (chat ask, same session as WS-3): both panels are **centred**
  (label, number, notes) and both notes are **bulleted** (the left "why it moved" note was a plain
  `div`), the caps read **Strike Zone Estimate:** / **Line Height Estimate:**, and the sticky banner
  no longer sits flush on the first cascade row (`#tab-gear-sim #hud + .bucket`, 14px). No JS
  changed — `innerText` on the `li` is the same property the `div` had. `sw.js` `v2.03.17`,
  **116/116** (2 new assertions). A by-hand browser look is still owed.

- 2026-09-29 — GitHub issues #1/#3 WS-3: the gear form is a **real cascade** on both tabs — 7
  rows / 15 fields in the user-specified order (Mainline material → brand → lb test · Weight type →
  amount · Leader length → material → brand → lb test · Hook/Yarn · Foam 1+2 · Beads). The three
  line picks resolve into the HIDDEN `ml-line`/`ld-line` id, so the solver, the catch row and the
  `*_line_id` columns are untouched. One rule: a child list = what its parent allows, a blank
  parent = the union, so nothing is invented and the short static `<option>` lists (the no-library
  fallback) are provably that union. A stale pick (a braid brand under mono) is dropped and takes
  the id with it; `RIG_REQUIRED` now names the 14 visible fields. New recording-DOM assertion
  drives the real cascade (and `restoreRig()`/`saveRig()`) against the real `tackle.json`.
  `sw.js` `v2.03.16`, **114/114**.

- 2026-09-29 — GitHub issues #1/#3 first pass: **WS-1** `useGPS()` no longer auto-falls-back
  and closes the station modal on failure (keeps it open with a retry hint, logs the real
  `/api/nearby_stations` status, stores the fix so the map centres on the angler); **WS-2** the
  Gear Sim HUD is now just Strike Zone (+ why it moved off the 4"–12" base) and colour-graded
  Line Height (green centre → yellow 50% → red edge, 0.1" steps) with the rig suggestions under
  it — score line, BOTTOM CURRENT and the old bottom box all gone. `sw.js` `v2.03.15`, 111/111.
  WS-4 (per-day weather) and WS-5 (private spots) still open —
  see `memory-bank/activeContext.md`.

- 2026-09-29 — Tackle brand is now end-to-end: `public.catches` gained `mainline_line_id` /
  `leader_line_id` / `weight_shape` (P4, additive, applied + verified live), the client writes them
  and the replay reads them via `tackleRowLine()` (P4b) — same row with brand ids replays
  2.887″ → 3.976″. Frozen baselines did not move (id-less rows keep the legacy path). Sanity
  111/111. The RPC/`loc` gate is now one merged product decision.

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
