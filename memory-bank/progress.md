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

- 2026-09-30 — **Recorded an external study as a Level 2 guardrail (no code).** Burke et al. 2013
  (PLoS ONE 8:e54134) — return-abundance forecasting from 31 marine indicators — corroborates
  temperature as the first-order salmon driver, and its randomized-indicators R²>0.9 warns against
  re-fitting our env weights with little data. Cited in `sonar.js` + `ROADMAP.md` §3.2.

- 2026-09-30 — **Sonar + sim = one learning machine; tide in the model; dead code removed.** The
  community sonar matched catches on temp/**wind/moon** while the sim placed the zone from
  temp/light/cloud/turbidity/barometer/rain — two brains, and wind/moon do not move vertical
  holding depth. Now `envSignature()` is the ONE shared set and `envMatchWeight()` weights it the
  way the sim does (temp leads). The dead `loc !== 'Fair'` mouth-hook gate is DROPPED (no
  hooking-location field), the ≥2-sample floor is gone, and the zone pull is silent + capped (no
  count/confidence/"not enough data"). **Tide is now a first-principles term** (+1.0" flood /
  −1.0" ebb on tide-paired stations, no curve → no term). The **notebook** (`catchResidual()` +
  `communitySonar().residuals[]`) records the model's own error, debug-trail only. Migration
  `20260930120000_sonar_env_snapshot` (env columns + notebook in the RPC) **still to apply**.
  Cleaned up `debounce`/`showDay`/`fallbackStation`/`idbDelete`. `sw.js` `v2.03.34`, sanity
  **143/143**.

- 2026-09-29 — **Ledger audit + spot findings parked.** Ticked two stale `- [ ]` boxes for work that
  HAD shipped (WS-4 per-day weather/hourly popup), because a fresh chat reads an unticked box as open
  work. Then parked, at the user's explicit call, the four spot-feature findings found by reading the
  code: **S1** the report ERASES a spot's name (`report.js:24` sets it from the label, `:59-60`
  overwrites it with the API's `site_name`, and the badge says `📌 USGS:` — a spot-opened report is
  pixel-identical to the gauge preset); **S2** a spot changes nothing but WHERE the weather is
  forecast, because the depth band is a per-gauge reach average, so the strike-zone advice is
  identical to the gauge's — the missing input is what the spot IS (pool tail, riffle lip, log jam);
  **S3** tide is absent from the model entirely (`grep -i tide src/features/gear-sim/**` → 0 hits)
  while the Puyallup at Puyallup swings ~12 ft twice a day on a tidal reach — awareness only, no
  invented datum offsets; **S4** nothing closes the loop (catches never validate the model). Detail
  lives in `memory-bank/activeContext.md` Backlog → S1–S5.

- 2026-09-29 — **ROOT CAUSE of the phone's /api failures: `/api/nearby_stations` was never
  deployed.** The debug trail showed a **Vercel** 404 (`NOT_FOUND pdx1::…`) while `/api/water_report`
  answered 200 on the same device; `curl` against `thefishreport.vercel.app` confirmed 404 vs 200.
  Vercel serves Python functions **one file per route**, and `/api/nearby_stations` existed only as a
  branch inside `api/water_report.py` while `scripts/dev_server.py` routed *every* `/api/*` path to
  that one handler — perfect locally, 404 in production, which broke the map feed, GPS lookup and
  every saved-spot gauge resolution at once. Fix: new `api/nearby_stations.py` (subclass that
  delegates to the same handler — one implementation), **dev server now routes `/api/<name>` to
  `api/<name>.py` exactly as Vercel does** (so this class of bug can no longer hide locally), and a
  new sanity check requires every `/api` route the client calls to have its own entry point.
  Local: 200 with 8 stations; sanity **141/141**; production re-verified 200 after the push.

- 2026-09-29 — **Every `/api/nearby_stations` consumer failed at once on the phone** (user screenshot:
  "Could not load nearby gauges" + "Could not reach the gauge lookup", a spot reading "flow from the
  nearest gauge", no star). The endpoint was healthy (HTTP 200, 0.59 s, 11 stations) — the client was
  wrong: the map called `res.json()` without checking `res.ok` (an HTML error page threw) and the spot
  resolver collapsed any non-2xx into "unreachable", both on the FIRST request of a cold connection
  (`picker.js` already retried for that; these did not). New `src/shared/api.js` `apiGetJson()` adds
  one retry, a 12 s timeout, a 4xx-is-final rule, the server's own message, and a sanitised
  status+body line in the debug trail (never the query string). The map now always returns an object
  and **plots the saved-spot star layer even when the gauge feed fails** (it sat after the throwing
  `res.json()`, so a private spot could never appear) and names the cause of a failure. `sw.js`
  `v2.03.33`, **140/140**.

- 2026-09-29 — **A saved spot is a LAT/LON you pick on the map** (direct user correction: "its not
  save a guage pin… so i can pull the data for that"): new map picker (`startSpotPick()` /
  `onSpotPick(e)` + a modal button), the tap's latlng is saved by `saveSpotAt()`, and the gauge that
  supplies the FLOW is **resolved** (`resolveSpotStation` → `/api/nearby_stations`, pure
  `pickNearestStation`) instead of required — the row names it ("flow: Puyallup River near Orting,
  WA · 4.4 mi away"). Weather comes from the spot's OWN coordinates because the report takes lat/lon;
  a point with no gauge nearby shows no flow rather than borrowing the app's default river. A live
  probe at 47.09,-122.15 found the nearest gauge was South Prairie Creek (33 CFS) instead of the
  Puyallup at Orting (483 CFS) at the same distance, so the rule is now
  **the selected gauge wins when in range, else nearest**. `sw.js` `v2.03.31`, **138/138**.

- 2026-09-29 — **Beginner copy** (direct user ask): the HUD summary is now **two plain sentences for
  someone who has never fished** ("Fish are likely holding higher in the water and more willing to
  grab — look for calm, shallow water along the gentle edges and the tail of a pool (about 2-5 feet
  deep). Your rig is sitting much lower than the fish, so it is not where they are.") and the advice
  is plain too ("Your rig is running low — raise it: a bigger corky, a second corky, or more yarn" /
  "Try this: a bigger corky and a second corky — that should get you much closer"). No inches, CFS,
  gauge, ±%, brand names or projected heights on screen; the precise version moved to the debug trail
  (`whereToFish()`, `out.rigChanges`). The plain `Try this` is capped at two changes and says "much
  closer" when the full fix needs more, so the projection is never claimed for a partial list.
  **Beginner/Advanced toggle recorded as a future feature** (`ROADMAP` §3.10), and the wording says
  **corky** (not float). `sw.js` `v2.03.30`, **137/137** with a new jargon guard.

- 2026-09-29 — **WS-8b (b2′) shipped: the light term rides the sun's real elevation.** After the user
  asked why b2 was never attempted, the curve was rebuilt on the correct driver (not a feeding
  curve): `solarElevationDeg()` from the payload's own sunrise/sunset midpoint + the date's
  declination + station latitude, ramping **+1.00" (dark/≤3°) → 0.00" (30°) → −0.75" (≥50°)**.
  Endpoints unchanged, but the shape is fixed: 2026-09-29 is now monotone with a **0.40" max step**
  (b1 jumped 1.75"), and a **20° December noon reads +0.40"** instead of "high sun −0.75". No
  timezone/DST maths; thresholds declared as chosen, not fitted; fixed brackets kept as the
  fallback. `sw.js` `v2.03.29`, **137/137**, frozen report-less baselines unmoved.

- 2026-09-29 — **HUD layout: banners side by side** (direct user ask): Strike Zone Estimate on the
  **LEFT**, Line Height Estimate on the **RIGHT**, each centred in its own half (label above the
  number; cap 0.78rem, value 1.2rem bold so the number reads at a glance), with a **vertical**
  divider rule between the halves — and the 2-sentence summary + the corky-first change rows
  **full width beneath both**. New `.hud-banners` 2-up grid wrapper; no JS changed (same ids).
  `sw.js` `v2.03.28`, **137/137**.

- 2026-09-29 — **HUD summary trimmed + biology fix + corky-first rig advice** (three direct user
  corrections): the summary is now **2 sentences** (outcome tag + where they're holding/depth band/
  where to target; then your line vs the band) — the driver sentence and its `zone.terms` data are
  gone; **"feeding" is gone from every angler-facing string** (in-river salmon stage, they don't
  feed — `THERMAL_BANDS` labels/notes, the light note, the sonar note and the outcome tags all
  rewritten, with a guard that fails if 'feed' returns); and the **rig advice now changes the CORKY
  first** — `bestZoneRig()` is two-pass (corky × 2nd corky × yarn × hook × bead with leader+lead
  FIXED; leader/lead only when no tackle swap reaches the zone), with `rigChangeList()` listing only
  what changes in the order corky → 2nd corky → hook → yarn → bead → leader → lead.
  `sw.js` `v2.03.27`, **137/137**.

- 2026-09-29 — **WS-8b (a2): depth as a measured BAND**: `spotDepthFt()` now exposes
  `bandLow`/`bandHigh` (the measured min/max of the same USGS rows the median comes from) and
  `zone.js` `depthBandText()` renders `'2.1-4.1 ft'` — or a single number when the band is
  degenerate, `null` when there is no measurement. The summary reads *"in about 2.1-4.1 ft at 1040
  CFS (gauge measurement, ±20% for spot vs gauge)"*: the band IS the measurement spread, and the
  ±20% is now purely the same-reach factor (your spot is not the gauge) instead of a max() of the
  two. Nisqually 2.1-4.1 ft @1040 → 3.9-4.5 @3000; Puyallup 2.3-3.5; Carbon 2.2-2.9. Median
  unchanged, no physics moved. `sw.js` `v2.03.26`, **136/136**. a1 (DEM section) declined on the
  numbers — the terrarium z15 profile matches the USGS width on 1 of 5 rivers and is 1.5-4× off on
  the rest; a real section waits for a dated 1 m 3DEP source.

- 2026-09-29 — **HUD restructure: two banners + ONE summary** (direct user ask): the Gear Sim HUD is
  now **Strike Zone banner → Line Height banner → one cohesive paragraph** ("what the fish are doing
  and where": outcome by net shift, the two strongest drivers in plain words, the depth of water
  they are holding in, the lie, and your line against that band) **→ gear changes only when the rig
  is off target** (the "On target" padder row is gone). The per-reason bullets are deleted as a
  display (`zoneNotes()`/`ZONE_NOTE_HIDDEN` removed; `zone.notes` still records every reason and
  `paintSimHud()` writes them to the debug trail). New `zone.terms` structured drivers +
  `fishOutlook()`; `positionParts()` now feeds both the detail string and the summary. `sw.js`
  `v2.03.25`, **135/135**. ⚠ One interpretation flagged: both banners are stacked with the summary
  BELOW both.

- 2026-09-29 — **WS-8b (b1) + Phase 4 decisions**: the Gear Sim's light term now brackets the
  reference hour against **that day's own sunrise/sunset** (`parseClockMinutes()`,
  `LIGHT_EDGE_MINUTES`/`LIGHT_CORE_MINUTES`) instead of fixed clock hours — the old version gave a
  December 4–5 PM block (real dusk) no term at all and a July 9 AM block none either; the twilight
  shoulder is neutral and a day without solar times falls back to the old brackets. `sw.js`
  `v2.03.24`, **134/134**. Three decisions recorded as deliberate non-builds (with the evidence):
  **b2** a fitted crepuscular curve (no local data to fit), **c2** finer lie buckets (would
  over-claim from a gauge-only velocity), **d3** the community sonar stays off (the `loc` gate has
  no data source and the live table holds 1 row while the sonar needs ≥2). **(a)** is still open
  pending a1-vs-a2: USGS *does* publish NAVD88 `/altitude (3.49 ft, ±0.03)` so a1's datum
  "blocker" was overstated, but the terrarium z15 section (~3.25 m/px) matches the USGS width on
  only 1 of 5 rivers (+52% Nisqually, 4× Carbon/White) — a2 (report the measured depth band) is
  recommended, with a dated 1 m 3DEP source as the real path to a DEM section.

- 2026-09-29 — **WS-5 private favourite spots** (issue #3b): `public.favorite_spots` is live with
  **RLS enabled in the same transaction** and one owner-scoped policy per command
  (`user_id = auth.uid()`, defaulted by the DB, **never** client-sent — `toSpotRow()` is asserted
  to omit it), no view and no `SECURITY DEFINER` over it. The station modal gains "My Saved
  Spots (private)": name the spot you're on, then tap it later to see that water's per-day report
  (`selectPreset()`), with a local mirror (`favorite_spots_cache`) so the list still works
  offline; the map draws the stars from local state and "Fish this spot" from the popup. Applied
  + verified live (4 policies, PK on `id`, **0 rows without a JWT**). `sw.js` `v2.03.23`,
  **133/133**. Files: migration, `supabase.js`, new `map/{spots,spots-map}.js`, `map.js`,
  `auth.js`, `picker.js`, `index.html`, `styles.css`, `sanity_pass.js`, docs.

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
