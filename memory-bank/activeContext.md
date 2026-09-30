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

## HANDOFF — 2026-09-29 (all approved work + summary/biology/rig-advice corrections shipped)

Shipped and pushed: WS-1 (GPS modal), WS-2 (Gear Sim HUD), WS-3 (the gear cascade), **WS-5**
(private favourite spots + RLS default-deny), **Phase 1/2/3** (gradient-on-estimate; WS-4 per-day
reference-hour weather + hourly popup; WS-8a thermal curve / own-gauge colour / sun-anchored light /
demoted barometer / measured `A/W` gauge depth), **WS-8b b1 + a2** (light on the day's
sunrise/sunset; depth as the measured BAND), the **HUD restructure** (two banners + one summary)
and the **2026-09-29 corrections** (2-sentence summary, no "feeding" anywhere, corky-first rig
advice). Current state: sanity **137/137**, `sw.js` `v2.03.27`, `origin/main` clean.

**NEXT = verify by eye.** No decisions are pending; every Phase 4 sub-item is recorded (b1 → then
**b2′ shipped** on the user's challenge; a2 shipped; c2 + d3 declined-by-design with reasons; a1 waits
on a dated 1 m 3DEP source).
1. **Browser pass** — `python3 scripts/dev_server.py 8000` → `http://127.0.0.1:8000/index.html`.
   Look at: the Gear Sim HUD (two banners SIDE BY SIDE — zone left, line right — then the 2-sentence
   summary and the corky-first change rows full width beneath), the saved-spot list + map star layer,
   the weather popup.

Owed regardless: a by-hand browser pass (the cascade is proven by the recording-DOM harness, the
per-day weather by the live API + sanity, the popup CSS by rule, the where-to-fish row and the
saved-spot list only by the recording DOM, the star layer not at all — none by eye).

## Instruction ledger — chat asks persisted to `.clinerules`
- [x] **2026-09-29 — "commit" / "push" both mean commit AND push.** Persisted to `.clinerules`
      §Git. Never stop at a local commit; never ask whether to push.

## ACTIVE — GitHub issues #1–#3 (approved plan 2026-09-29)

Five workstreams, execute in order. Each: files · Potential Bugs (1 line) · Verify.

### WS-1 — GPS "nearest river" regression (issue #3a)
- [x] `src/features/station/picker.js` — `useGPS()` must KEEP the modal OPEN on every failure
      path (unsupported / timeout / empty / HTTP error) and show a retry hint instead of
      auto-calling `fallbackStation()` → `selectPreset()` → `closeStationModal()`; log the real
      `/api/nearby_stations` HTTP status + body; set `window.userGPSCoords` on success so
      `mapCenter()` centres on the user. Keep `fallbackStation()` DEFINED (SYMBOLS assertion).
      Potential bug: all three `settled` paths must leave a non-blank `#gps-status` message or
      the button looks stuck.
      Verified: `node sanity_pass.js --quiet` 111/111; `node --check
      src/features/station/picker.js`.

### WS-2 — Gear Sim HUD redesign (issue #1a)
- [x] `index.html` (HUD block + DELETE `<div id="suggestions">`), `solver.js` (`paintSimHud`),
      `zone.js` (`refreshZonePreview`), `src/styles.css`, `sw.js` — top HUD becomes TWO panels:
      LEFT `Strike Zone: X"–Y"` + why-it-shifted line (from `zone.notes`); RIGHT `Line Height:
      N.N"` colour-coded (0.1"-quantised green=centre / yellow=halfway / red=edge) WITH the
      bulleted `out.suggestions` beneath it. Remove BOTTOM CURRENT, the score text, and the
      bottom "Rig Adjustments" box + its CSS.
      Potential bug: keep the internal `score` (gates the "Try this" suggestion + the frozen
      `sanity_pass.js:736` baseline) — only stop DISPLAYING it.
      Verify: `node sanity_pass.js --quiet` (frozen drift baseline still green).

### WS-3 — Cascading dropdowns, both tabs (issue #1b)
- [x] `index.html` (both tabs → 7-row / 15-field layout), `src/shared/tackle.js`,
      `zone.js` (`RIG_REQUIRED`), `sanity_pass.js`, `src/styles.css`, `sw.js` — cascade
      Material→Brand→LB Test (mainline + leader), Weight Type→Amount, Bead Material→Size from
      `tackle.json`.
      DESIGN (verified 2026-09-29): keep `ml-line`/`ld-line` as HIDDEN inputs holding the
      resolved tackle.json id, so `solver.js` `pickedLineDiameter()`, `log.js` and the DB
      catch-row contract are UNCHANGED. `ml-mat`/`ml-lb`/`ld-mat`/`ld-lb` become the VISIBLE
      selects (their values already feed `readRigFromForm`/`logData` verbatim); add visible
      `ml-brand`/`ld-brand`. Field order (user spec): ml-mat, ml-brand, ml-lb, weight-shape,
      weight, ld-len, ld-mat, ld-brand, ld-lb, hook, yarn, foam, foam2, bd-mat, bd-sz.
      Data: lines = material→brand→lb_test (110 rows). Weights = 10 `shape_label`s, each with
      the same 6 NOMINAL oz (0.25…1) — keep Amount values nominal (0.25 etc.) so the frozen
      physics baseline cannot move. Beads = hard{2,4,6,8} / soft{6,8} / none{0}.
      Potential bug: TWO existing sanity assertions must move DELIBERATELY — `gearRows === 12`
      → 14 (`sanity_pass.js:349`, message "6 resting rows" → 7) AND the `GEAR_ORDER` array
      (`sanity_pass.js:359`) → the 15 ids above; `zone.js` `RIG_REQUIRED` ids must match the new
      VISIBLE selects or the sim blocks forever (currently lists `ml-line`/`ld-line`). `.gear-row`
      is a 2-col grid → add a `.gear-row-3` variant for row 1.
      Verified (DONE 2026-09-29, sanity **114/114**, `sw.js` `v2.03.16`): the 3 moved/updated
      guards (3-up CSS rule + 2 forms, 14 rows / 7 each, 15 ids in the instructed order) PLUS 3
      new assertions — a recording-DOM harness that drives the real `cascadeLine()` /
      `onWeightShapeChange()` / `onBeadMatChange()` against the real `tackle.json` (braid → 7
      brands → 20/30/40 → id `braid-sufix-832-30`; a material switch clears the stale brand AND
      the id; soft → 6/8mm, none → 0; the -log twin always matches), "the static `<option>`
      lists are the library union" (the offline fallback cannot drift), and "a saved rig restores
      through the cascade (parents first)" (`restoreRig()` on a legacy material+lb-only rig
      recovers the generic brand + id, on a cascade rig the saved lb / amount / bead size survive,
      and `saveRig()` writes the parts). Implementation notes:
      ONE cascade rule (a child list = what its parent allows; a blank parent = the union),
      `fillBothSelects()` is the only writer of an option list so both tabs can never disagree,
      weight amounts come from each row's own `1/4 oz` label (NOT from mass — the sleeve rows
      weigh more than nominal), `RIG_REQUIRED` lists the 14 visible fields, and `restoreRig()`
      applies parents before children (a rig saved by an older client recovers its brand/lb from
      the saved line id, else from material+lb).
      Potential bug (kept): without `tackle.json` there is no brand/lb to pick, so the sim/log
      blocks on "Mainline brand" — the SAME offline behaviour as the pre-WS-3 single picker, and
      `tackle.json` is precached in `sw.js` `SHELL_FILES`, so an installed app has it offline.
      Still owed: a real-browser pass on both tabs (the harness proves the logic, not the DOM).

### WS-4 — Per-day weather forecast (issue #2)
- [ ] `api/water_report.py`, `telemetry/report.js`, `telemetry/daynav.js`, `services/water.js` —
      backend emits per-`forecast_date` weather (Open-Meteo daily/hourly) instead of one
      `current` snapshot; frontend paints weather from `reportsData[activeDateOffset]` in
      `updateActiveDateUI()` (not `reports[0]`).
      Potential bug: absent per-day fields must stay `null` → frontend renders `--`, never a
      fabricated value.
      Verify: `python3 -m py_compile api/water_report.py`; `node sanity_pass.js --quiet`.

### WS-5 — Private favourite spots + map (issue #3b)
- [x] `supabase/migrations/20260929190000_favorite_spots.sql` (new),
      `services/supabase.js` (`toSpotRow`/`saveFavoriteSpot`/`fetchFavoriteSpots`/
      `deleteFavoriteSpot`), `features/map/spots.js` + `features/map/spots-map.js` (new),
      `features/map/map.js` (star layer), `index.html` (modal block + 2 script tags),
      `src/styles.css`, `sw.js` (SHELL_FILES + `v2.03.23`), `auth.js`/`picker.js` hooks —
      `favorite_spots` table, RLS enabled with the table, one owner-scoped policy per command
      (`user_id = auth.uid()`, defaulted by the DB and never client-sent); client CRUD; the
      modal list, the star layer, and "Fish this spot" through the SAME `selectPreset()` path.
      Never in the public feed (no view, no `SECURITY DEFINER`, not referenced by it).
      Potential bug: RLS must default-deny — a spot must be invisible to another session.
      Verify: `npx supabase db push --yes < /dev/null`, then a read-only live-DB query.
      Verified: migration APPLIED (`Applying migration 20260929190000_favorite_spots.sql...
      Finished`) and live-verified read-only — `relrowsecurity=true`, 4 owner-scoped policies
      (3 USING + 2 WITH CHECK), `user_id` default `auth.uid()`, `favorite_spots_pkey PRIMARY
      KEY (id)`, grants identical to `catches`, and **0 rows visible without a JWT**
      (`user_id = auth.uid()` → NULL). PLUS a live REST round-trip with two throwaway guest
      sessions: the exact `toSpotRow()` payload → 201 with `user_id` stamped from the JWT, the
      owner read it back with the client's select list, **another session saw `[]`** (and a
      cross-session DELETE was a no-op), a bare publishable key saw `[]`, and the probe row was
      deleted by its owner (table back to 0 rows). Sanity **133/133** with 5 new assertions
      (migration shape + a migration-wide leak scan, the real `toSpotRow()` never emitting
      `user_id`, the real list renderer on a recording DOM, the signed-out save that must not
      reach the network, and GPS hygiene: no coordinate in `logDebug`).
      Scope calls: `spots-map.js` was split out of `spots.js` (Leaflet concern) so each file
      stays one topic — both are OVER the 150-line target (`spots.js` 195, `map.js` 173,
      `supabase.js` 457), recorded here rather than mangled. No outbox for spots (planning
      data, not a catch): a failed save tells the angler instead of queueing.
      Open by design (NOT dropped): a saved spot is the CURRENT position (the GPS fix when we
      have one, else the active station's gauge) — there is no "save THIS gauge pin as a spot"
      action from a map popup yet, and no rename/edit beyond re-saving. Both are small, additive
      follow-ups; issue #3's ask ("save your location … conditions at my spot tomorrow") is
      covered by what shipped.

### WS-6 — Gear Sim HUD polish (chat ask 2026-09-29, same session as WS-3)
- [x] Four asks, all shipped: (1) the strike-zone and line-height panels are CENTRED — label,
      number and the notes beneath them — so the two halves read as a symmetric pair;
      (2) the notes/points under each are BULLETED (the right panel's rig changes always were,
      the left "why it moved" note was a plain `<div>` → now the first `<li>` of a `<ul>`);
      (3) caps renamed "Strike Zone:" → **Strike Zone Estimate:** and "Line Height:" →
      **Line Height Estimate:**; (4) the sticky banner and the first cascade row read as ONE
      block → `#tab-gear-sim #hud + .bucket { padding-top: 14px }`.
      Files: `index.html` (HUD block), `src/styles.css` (`.hud-panel` centre, `.hud-changes`
      `list-style-position: inside` + `padding: 0` so a centred bullet is not pushed off-centre,
      `li.hud-note` keeps the quieter 0.62rem muted note), `sanity_pass.js`, `sw.js`.
      Not touched on purpose: `zone.js` `refreshZonePreview()` / `solver.js` `paintSimHud()` only
      set `innerText` on `#hud-zone-why`, which is the same property on an `<li>` as it was on the
      `div`, so no JS changed (NOT verified in a browser — see the owed look below).
      Verified: `node sanity_pass.js` **116/116** with 2 NEW assertions — the cap wording + both
      bullets are in the markup, and the centring/separation CSS rules exist (`sw.js`
      `v2.03.17`). **Still owed: a by-hand browser look** (CSS is asserted by rule, not painted).


### WS-7 — Gear Sim HUD v2 (chat ask 2026-09-29, later in the WS-6 session)
- [x] Six asks: (1) the generic line brand is ALWAYS the first brand option and reads
      **"Generic"** (DISPLAY ONLY — the option value stays the library's "Generic average" so
      (material, brand, lb) matching, `tackleLineFind`, the saved rig and the DB ids are all
      untouched); (2) the Strike Zone Estimate gets a **trend line**, graded green at the
      4"-12" base → yellow at half scale → red at full scale, 0.1" steps (full scale = 7.0",
      the largest stack the weather rules in `computeStrikeZone()` can build); (3) **one bullet
      per row** on both panels (the zone reasons used to be joined into a single sentence);
      (4) the **community-catch note is NOT displayed** while the sonar still pulls the zone;
      (5) on target ⇒ a single **"On target"** row, no explanation — same for line height;
      (6) the rig bullets drop the "Targeting <species>…" line so they only ever say what the
      zone is doing / what to change.
      Files: `src/shared/tackle.js`, `src/features/gear-sim/{zone,solver}.js`,
      `src/features/gear-sim/techniques/drift.js`, `index.html`, `src/styles.css`,
      `sanity_pass.js`, `sw.js`, docs.
      Potential bug: the frozen `drift` baseline asserts **3 suggestions** — dropping the
      species line moves it to 2, which is DELIBERATE and must be re-pinned with the reason
      recorded (never silently).
      Verify: `node sanity_pass.js --quiet`; new assertions for the trend gradient, the
      one-row-per-reason notes, the hidden community note and the generic-first brand order.
      ⚠ INTERPRETATION to confirm: "remove the community catches section … allow it to effect
      the strike zone estimate but lets not show this" was read as *the sonar NOTE in the zone
      bullets* (the only place community catches are shown alongside their effect on the zone),
      NOT the Catch Log's public "Everyone" board — see the follow-up note below.
      Verified (DONE 2026-09-29, sanity **119/119**, `sw.js` `v2.03.18`): 3 NEW assertions —
      the trend maths on the REAL `zoneTrend()` (base 8.0" mid ⇒ offset 0 / pct 50 /
      `hsl(140,…)`; +3.5" ⇒ pct 75 / `hsl(52,…)`; +7" ⇒ pct 100 / `hsl(0,…)`; the shallow side
      grades too; the ratio clamps at 1 for an out-of-scale zone; a 0.04" move is ignored and a
      0.1" move is not) plus `zoneColor()` parity after the `gradeColor()` extraction, the REAL
      `zoneNotes()` (4 notes in ⇒ 2 rows out, community + summary filtered, `[]`/`null` ⇒
      `On target`), and the generic-first brand order with `Generic` as its display text in the
      cascade harness. Plus the frozen `drift` baseline deliberately re-pinned to 2 suggestions
      with the reason inline. `zoneWhyText()` deleted; `paintZoneHud()` is now the single
      painter for both the live preview and `runSim()`.
      **Follow-up owed:** a by-hand browser look (the trend strip's paint and the marker
      position can only be judged visually), and the user's confirmation of the community
      interpretation above — if they meant the Catch Log's public board, that is a separate,
      much larger change (auth/board removal) and must NOT be started on this reading.
- [x] **Addendum (same session, 2026-09-29):** bead fields lost the stray "(Presentation)"
      suffix (both tabs) and the foam option `Cheater 12` → **`Cheater 10`**, with
      `FOAM_TABLE.c12.label` changed to `Cheater - Size 10` so the HUD advice matches the picker.
      Display-only: the option value stays `c12`, lift stays 0.70 (no physics moved), and
      `docs/tackle_measurements.csv` deliberately keeps its `cheater-12` measurement row.
      Verified: sanity **120/120** (`v2.03.19`) incl. a new assertion for all three facts.

## CURRENT SPRINT — WS-4 weather + WS-8a science (approved 2026-09-29, Act mode)

Full outline agreed with the user before acting. Execute in order; mark `- [x]` only after the
Verify step passes; **commit + push at each phase end**; bump `sw.js` VERSION when shell files
change.

### LOCKED DECISIONS
- WS-7 community reading = the sonar NOTE is hidden (sonar still moves the zone); the Catch Log
  board is untouched.
- Trend line: REMOVE the `.zone-trend` strip/marker; KEEP the gradient on the estimate number.
- Bullets: both panels unify to 0.68rem / `#d1d5db` (drop the dim `.hud-note` variant).
- Precip Vol pill = HOURLY (that block's precip); daily total stays internal for the Gear Sim.
- 24hr river reference hour = SUNRISE (fallback 6 AM).
- Wind = arrow AND direction text (`↗ NE 9 mph`).
- Popup = clicked metric only, full 24-HOUR swipeable strip, auto-scrolled to the reference hour.
- Depth: derive `D = A/W`, cross-check `D = Q/(W·V)`, expose `spotDepthFt` as a same-reach estimate.
- "Where to fish" line shows BOTH on- and off-target.
- [x] Phase 1 — WS-7 corrections: `index.html` (delete `.zone-trend` + `#hud-zone-mark`, static note →
  plain `<li>`), `src/styles.css` (delete `.zone-trend*` and `.hud-changes li.hud-note`), `zone.js`
  (`paintZoneHud` drops the marker, keeps the number colour; `zoneTrend` drops `pct`; plain `<li>`),
  `sanity_pass.js` (keep the colour-gradient checks, drop the marker-% checks, add "no `.zone-trend`
  / no `.hud-note`" guards), `sw.js` VERSION.
  Verified: `node sanity_pass.js` **120/120**; `sw.js` `v2.03.20` — `zoneTrend()` returns
  `{offset, ratio, color}`, both panels render plain `<li>` at one style, and the new guard proves
  the strip/variant cannot return.
- [x] Phase 2 — WS-4 per-day weather: `api/water_report.py` (add `cloudcover,wind_speed_10m,
  wind_direction_10m` to the hourly request; per-day REFERENCE HOUR: today = hour containing now,
  future = `lines_in` hour / sunrise / 12 PM; new `weather_hour` object + `weather_hourly` 24 rows;
  keep `rain`/`cloud_pct` for physics — `press_delta` re-anchors to the reference hour, a deliberate
  change further demoted in WS-8a), `report.js` (block-label sub-line, wind `↗ NE 9 mph`, tappable
  pill), `water.js` (repaint scoped to the ACTIVE card + popup renderer), `daynav.js` (re-paint
  weather on day change), `index.html`/`styles.css` (popup + swipeable strip), `sanity_pass.js`.
  Potential bug: per-day fields must stay `null` when the hourly slice is missing → `--`, never
  fabricated; the repaint must NOT touch the other cards.
  Verified: live `/api/water_report` → 4 distinct days (`3-4 PM / 6-7 AM / 6-7 AM / 6-7 AM`,
  temps 63/51/46/57°F, per-day wind+compass, 24 hourly rows each); sanity **122/122** with a new
  per-day assertion that also cross-checks the popup's 6 metric keys against the payload;
  `sw.js` `v2.03.21`. Two bugs caught and fixed while verifying: `compass_from_deg` was clobbered by
  the helper insertion (the module still compiled because the orphan body was absorbed into the
  function above), and `pressure` was double-converted (fixed by keeping `pressure_hpa` raw).
- [x] Phase 3 — WS-8a scientific model: `inputs.js` (`THERMAL_BANDS` + `thermalOptimum(tempF)`:
  `<45` torpid · `45–50` cool · `50–60` optimal · `60–65` warming · `>65` stress, 65 = warming,
  null probe → no term — replaces `≥55 → "rise"`), `zone.js` (barometer demoted +3.5/−3.0 → ±1.2;
  new `getTurbidityFnu()` + `turbidityTerm()` [own-gauge, null → no term] and `refHourBlock()` +
  `lightTerm()` [report reference hour, NOT the clock — a clock would make `computeStrikeZone()`
  non-deterministic and flap the frozen baselines]; `whereToFish(zone, hgt)` = depth-of-water +
  lie + colour/light + the line's position in/out of the band; `paintZoneHud(zone, where)` appends
  the row), `continuity.js` (`depthAtGauge(flow, siteId)` = median `A/W` over the six rows nearest
  today's flow, cross-checked by `Q/(W·V)`; `spotDepthFt()` = the SAME same-reach provenance shape
  as `velocityAtSpot()`, `value: null` when unmeasured), `solver.js`/`drift.js` (the
  `out.whereToFish` row + the debug record), `src/services/water.js` (`window.turbidityFnu`),
  `sanity_pass.js`, `sw.js` → `v2.03.22`.
  Potential bug: the frozen baselines run REPORT-LESS, so they must NOT move; pin the new curve
  instead of re-pinning old numbers.
  Verify: `node sanity_pass.js --quiet` + `node --check`.
  Verified: sanity **128/128** (6 new assertions: the curve's 9 band edges + null; `A/W` on the REAL
  USGS rows — Nisqually 3.159825238772607 ft @1040 / 4.260821514090993 @3000, Puyallup
  3.329611650485437 @1040, worst continuity gap 0.47%; the null-depth path; the where-to-fish text
  incl. "±32%" and in/out-of-band; the term arithmetic +5.45 / −4.45 / 1.2 alone / the 6.7" ceiling
  inside 7.0; and the row reaching a recording `<ul>` through the REAL painter). The frozen drift
  baseline did NOT move (2 suggestions, hgt 2.887"). Two deliberate scope calls: the where-to-fish
  row is NOT part of `out.suggestions` (so the pinned count survives), and `channel_measurements.js`
  was left untouched because its `points[]` already expose the per-point `a`/`w` the depth maths
  reads — regenerating that file would only re-emit the same numbers.
  Still open from this wire (WS-8b): DEM width@height → a REAL spot depth, the crepuscular curve,
  and finer velocity-lie buckets (this ships a 3-bucket call at 1.5 / 3.0 ft/s).
  Live data note (2026-09-29): `/api/water_report?site=12101500` returned
  `water_temp_f: null, turbidity_fnu: null` on all four days, so the thermal and colour terms are
  DORMANT at the Puyallup until that gauge reports 00010/63680 — correctly (null → no term, never a
  guess). The light term IS live there: the reference hours came back `3-4 PM` today and `6-7 AM`
  on the later days, i.e. +1.0" low light on any day whose reference block is a dawn legal start.
- [ ] Phase 4 — deferred (separate confirm): WS-8b (persist the DEM width@height cross-section →
  real spot depth; crepuscular light curve; velocity lie buckets; re-enable the community-sonar
  calibrator — a product decision).

## HUD RESTRUCTURE — 2026-09-29 (direct user ask, supersedes WS-7's bullet display)

- [x] **Two banners + one cohesive summary + suggestions ONLY when off target.** The user's words:
      "its too much info … instead of each having bullets below them there should be two separate
      banners first the strike zone estimate output and the line height estimate output, and then
      this would populate the where the fish are and suggestion changes if you are out of target".
      Shipped: `index.html` (two `.hud-banner` rows, `<p id="hud-where" class="hud-outlook">`, the
      `#hud-changes` list — no more `.hud-panels` grid, no `#hud-zone-notes`), `src/styles.css`
      (banner + summary CSS, dead `.hud-panels`/`.hud-panel` rules removed), `zone.js`
      (`zone.terms` structured drivers, `positionParts()` shared by the detail + the summary,
      `fishOutlook(zone, hgt)`, `paintZoneHud(zone, outlook)`; `zoneNotes()`/`ZONE_NOTE_HIDDEN`
      DELETED), `drift.js` (returns `outlook`, no "On target" row), `solver.js` (paints the
      summary + logs every `zone.notes` reason to the debug trail), `inputs.js` (driver nouns on
      `THERMAL_BANDS`), `sanity_pass.js`, `sw.js` `v2.03.25`, docs.
      Verified: sanity **135/135** — the WS-7 bullet assertion was REPLACED (deliberate reversal,
      recorded here and in the CHANGELOG) by a summary assertion on the REAL `fishOutlook()`
      (five outcome bands, top-two drivers, third driver dropped, community wording impossible,
      depth/lie/line sentences, report-less path, no-rig = no line claim), the painter is driven
      against a recording `#hud-where`, and a NEW assertion pins that an on-target rig
      (hgt 4.810" in the 4"–12" zone) yields **0** suggestions.
      ⚠ Interpretation flagged for confirmation: "two separate banners … and then this would
      populate the where the fish are" was read as BOTH banners stacked on top with the summary
      BELOW both (not the summary owned by the line-height banner). If the intent was the latter,
      the fix is one block move in `index.html` + the CSS order — no JS change.
      Note: the frozen drift baseline did NOT move (off-target rig still 2 suggestions, hgt 2.887").

## HUD SUMMARY + RIG ADVICE CORRECTIONS — 2026-09-29 (direct user ask)

- [x] **Three corrections in one pass, all shipped.** The user's words: *"this is still to much
      information and why are we saying feeding dont salmon stop feeding after then enter the
      river … we need a short 1-2 sentence summary of where the fish are, and where to taget …
      you always suggest corky size leader length and lead but for the most part people change
      their leader length and lead size not as often so lets adjust corky first add a second
      corky second hook size yarn beads lets forcus on those things before the others"*.
      1. **Summary = 2 sentences** (where they are + where your line sits). The driver sentence and
         the `zone.terms`/`driver` data that fed it were REMOVED. `zone.notes` still carries every
         reason → the debug trail.
      2. **No "feeding" anywhere in angler copy.** In-river salmon are staging; a fly is taken out
         of reaction. Rewritten in `THERMAL_BANDS` (labels+notes), the low-light note, the
         community-sonar note and the outcome tags; a sanity assertion fails if 'feed' returns in
         the produced summary.
      3. **Rig advice changes the CORKY first**: `bestZoneRig(zone, rig, vel)` is two-pass (leader +
         lead FIXED → sweep corky × 2nd corky × yarn × hook × bead; leader/lead free ONLY if no
         tackle swap reaches the zone), and `rigChangeList()` names only what changes in the order
         corky → 2nd corky → hook → yarn → bead → leader → lead. Remedy rows reordered to match.
      Verify: `node sanity_pass.js --quiet` → **137/137** (new block pins library bead options, foam
      naming, the tackle-only fix for the frozen rig (Cheater 10 float → 8.1"), the priority order
      for a 3-swap rig, and the leader/lead fallback firing at 8000 CFS; summary assertions rewritten
      for the 2-sentence shape incl. "never claims feeding").
      ⚠ NOTE for the next session: this commit touched `computeStrikeZone` heavily, and an early
      regex-based edit duplicated + deleted blocks (caught by the harness, fixed). The zone terms are
      pinned: +5.45 / −4.45 / 1.2 alone / 0.75 colour / 6.7 ceiling — if those move, something broke.
- [x] **Layout follow-up (same day, direct user ask): the two banners sit SIDE BY SIDE** — Strike Zone
      LEFT, Line Height RIGHT, each centred in its own half (label above the number: cap 0.78rem,
      value 1.2rem bold), with the summary + adjustments FULL WIDTH beneath both. `index.html` (a
      `.hud-banners` wrapper), `src/styles.css` (2-up grid, centred columns, VERTICAL divider rule),
      `sanity_pass.js` (structure + CSS assertions now pin the side-by-side layout and the DOM order:
      zone before line, both `</div>`s before `#hud-where`, `#hud-where` before `#hud-changes`),
      `sw.js` `v2.03.28`, sanity **137/137**. No JS changed — the same ids are painted.
      This RESOLVES the "interpretation to confirm" item in the handoff: the summary belongs under
      BOTH banners.

## PHASE 4 DECISIONS — 2026-09-29 (user call, Act mode)

The user was given the four sub-items with their evidence and chose: **b1 yes, c2 no, d3 no, and
asked for the a1-vs-a2 case before picking a.** Recorded here because these are deliberate
NON-builds, not oversights.

- [x] **b1 — SHIPPED: the light term rides the day's own sunrise/sunset** (`zone.js`
      `parseClockMinutes()` + `LIGHT_EDGE_MINUTES`/`LIGHT_CORE_MINUTES`, `lightTerm(block, rep)`;
      both call sites updated). Fixes the seasonal defect: a December 4–5 PM block (real dusk)
      used to get NO term and a July 9 AM block (full sun) none either. The twilight shoulder
      carries no term; a day with no solar times falls back to the fixed clock brackets. `sw.js`
      `v2.03.24`, sanity **134/134** (new assertion pins the parser AND the December-vs-September
      contrast at the same clock hour).
- [x] **b2 — SUPERSEDED by b2′ (SHIPPED 2026-09-29) after the user asked why it was never attempted.**
      The original record below said "declined"; that was my recommendation, not a blocker — and the
      stronger reason to be careful is now on file: a classic crepuscular curve is a FEEDING curve,
      and in-river salmon stage rather than feed, so it would have repeated the biology error fixed
      the same day. What shipped instead keys the light term on the sun's REAL ELEVATION
      (`zone.js` `solarElevationDeg()` from the payload's own sunrise/sunset midpoint + the date's
      declination + station latitude, so no timezone/DST maths), ramping +1.00" (dark, <= 3°) to 0.00"
      (30°) to -0.75" (>= 50°). Endpoints unchanged; the seasonal consequence is the point (a 20°
      December noon reads +0.40" instead of "high sun -0.75"). No more cliffs: the 2026-09-29 day is
      monotone with a max 0.40" step (b1 jumped 1.75"). `sw.js` `v2.03.29`, sanity **137/137**, and
      the report-less fixtures did NOT move (+5.45") so the frozen baselines are intact.
      Original record (kept for honesty): *"b2 — DECLINED (user). A fitted crepuscular curve implies
      an amplitude we cannot fit (no local catch dataset: 1 row live)."* — the dataset point stands;
      the fitting premise was wrong, and the curve never had to be fitted to begin with.
- [x] **c2 — DECLINED (user): the lie call stays at 3 buckets** (1.5 / 3.0 ft/s). The number it
      reads is the GAUGE's bed velocity times a spot ratio still stuck at 1.0, so finer buckets
      would only make more specific claims from the same single figure. Revisit when a
      spot-relative velocity exists (needs a real spot width — see B1 in the roadmap).
- [x] **d3 — DECLINED (user): the community sonar stays off.** The `loc !== 'Fair'` gate has no
      data source (`hook_location` dropped as always-NULL) and the live table held **1 row /
      1 owner** while `communitySonar()` needs **≥2** heights to shift anything — so flipping it
      is invisible today and would then count foul-hooked fish, which is exactly what the gate
      excluded. Written up in `docs/ROADMAP.md` §3.2 with the revisit path (`d2` = a real
      hooking-location field + column + RPC return). Verified en route: the RPC already returns
      everything the replay needs, because heights are RECOMPUTED by `presentationHeightInches()`
      — no `line_height_in` column is required.
- [x] **a — RESOLVED: a2 shipped (2026-09-29).** The depth is reported as the **measured band** the
      gauge's own USGS rows span, with the median as its centre: `spotDepthFt()` gained
      `bandLow`/`bandHigh`, `zone.js` gained `depthBandText()` (a degenerate band collapses to one
      number; no measurement -> `null`, never invented), the summary now reads *"in about 2.1-4.1 ft
      at 1040 CFS (gauge measurement, ±20% for spot vs gauge)"*, and the `whereToFish()` detail
      carries the median AND the band. The `±20%` is now purely the same-reach factor instead of a
      max() of two spreads. `sw.js` `v2.03.26`, sanity **136/136** (band maths pinned on the real
      rows: Nisqually 2.140449438202247–4.142857142857143 median 3.159825238772607; Puyallup
      2.3-3.5 ft; degenerate -> one number; missing -> null). Median unchanged, so no physics moved.
      **a1 was declined** — see the CHANGELOG entry for the numbers (the DEM matches the USGS width
      on 1 of 5 rivers and is 1.5–4× off on the rest; the datum chain was NOT the blocker).
      ⚠ a1's real path stays open by design: a DEM/lidar section waits for a **dated 1 m 3DEP
      source** (which `river_widths.js`'s header already recommends).
- [ ] Still queued: nothing from issues #1–#3 — WS-5 shipped 2026-09-29 (`favorite_spots` + RLS
  default-deny + the modal list + the map star layer). Phase 4 / WS-8b is the only open item and
  it needs a product confirm.
- Guardrails for every wire: own-gauge only · `null` → `--` · estimates carry provenance +
  uncertainty · never a fabricated spot number · `textContent` for user/data text.

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
- [x] **P4. DB — DONE 2026-09-29, migration `20260929055300_line_ids_weight_shape`.** Decision
      resolved as recommended: **ADD** `mainline_line_id` / `leader_line_id` / `weight_shape` (all
      nullable text) **ALONGSIDE** the mat/lb pair — additive + no backfill, so old catches stay
      readable and the legacy readers (community sonar replays, the frozen baselines) keep working;
      a pre-P4 row has no brand to recover, and inventing one would fabricate data. No FK and no
      index: the library is a static asset (`src/data/tackle.json`) and the columns are read per
      row, never filtered on.
      Potential bug: the columns are **ALWAYS NULL until the client sends them**, and PostgREST
      rejects an unknown column (400/PGRST204) — so DB-before-client is the only safe order. Never
      ship the client send first.
      Verified LIVE: `public.catches` went 34 → 37 columns (the 3 new ones text/nullable/no
      default); `catches` RLS still enabled; `public_catch_feed` still its 4 explicit columns
      (name/time/river/fish — the brand does NOT reach the public board); `get_global_calibration`
      signature `(integer,text)`, `security definer`, ACL
      (`anon`/`authenticated`/`service_role`) UNCHANGED and still returns 1 row; `npx supabase db
      push --yes < /dev/null` recorded the migration as applied.
- [x] **P4b. Client send + replay — DONE 2026-09-29, sanity 111/111, `VERSION` `v2.03.13`.**
      `logData()` sends `ldLine`/`mlLine`/`weightShape`; `toCatchRow()` maps them to
      `leader_line_id`/`mainline_line_id`/`weight_shape` (absent → NULL, never `''`, so an older
      installed client is harmless); new `tackleRowLine(row, role)` in `src/shared/tackle.js`
      prefers the brand id (it owns the measured diameter) and falls back to material+lb, and
      `communitySonar()` now passes that diameter into `totalDragPerFt`. `fetchGlobalCalibration()`
      passes the ids through if the RPC ever returns them.
      Potential bug: id-less rows take exactly the old code path, which is *why* the frozen
      baselines did not move — do NOT "simplify" the fallback away, it is the legacy contract.
      Verified: `node sanity_pass.js` 111/111 (the 4 frozen rigs + the drift technique unchanged,
      so no re-pin was needed); 2 NEW checks — the real `toCatchRow()` mapping (ids → columns,
      absent → NULL) and "a row with the picked brand replays at that brand" (**2.887″ → 3.976″**
      for the same row with brand ids); live PostgREST resolves the columns
      (`select=mainline_line_id,leader_line_id,weight_shape` → 200 `[]`); `node --check` clean.
      **Deliberately NOT done:** `get_global_calibration` still does not return the ids — it is
      `SECURITY DEFINER` + anon-executable and the whole community path is gated off anyway
      (`loc !== 'Fair'`, nothing populates it), so widening an anon-readable surface would change
      nothing for an angler today. That is now ONE decision with the item below, not two.
      **Still unverified end-to-end:** a real UI log → row read-back (needs a signed-in browser
      session; the mapping and the REST surface are both proven, the round-trip is not).

## Handoff — 2026-09-28 (end of session; context exhausted, nothing half-built)

**Objective:** land the measured-tackle library into the Gear Sim. P1, P2, P4, P4b DONE; P3 PARTIAL
(the measured diameters are threaded; the remaining measured units are listed below).

**Last completed step:** P3a — `lineDiameterScale()` now uses the **measured** diameters
(`diameter_mm / REF_DIAMETER_MM`, anchored at 0.34 mm = generic mono 12 lb so the locked reference
rig does not move), with the old proxy as the fallback. Commit `b14a805`, sanity 108/108, pushed.
Measured movement vs the proxy: braid 20 **+4.8%**, copoly 10 **+5.1%**, fluoro 17 **+5.3%**,
braid 40 +3.1%, fluoro 12 −1.4%, reference rig −0.03%.

**TWO GAPS FOUND — gap 2 is now CLOSED, gap 1 is still open:**

1. **CLOSED 2026-09-28 (commit `c1011b7`).** `totalDragPerFt` / `leaderDragPerFt` /
   `mainlineDragPerFt` / `lineDiameterScale` now take an OPTIONAL diameter; `readRigFromForm()`
   resolves the picker id to its measured mm and `drift.js` passes it, so a picked brand line
   drives the drag. Omitted (community catch rows, the frozen baselines) -> generic row, so
   **nothing moved and no re-pin was needed**. A new sanity check proves the diameter reaches the
   term. STILL GENERIC ON PURPOSE: `sonar.js` replays (community rows carry no brand) and
   `zone.js`'s `bestZoneRig` sweep — thread the sweep too if a solver *suggestion* should honour
   the brand rather than the generic row.
2. **CLOSED 2026-09-28 (commit `07f5e89`).** The frozen-baseline block now evals
   `src/shared/tackle.js` and loads `src/data/tackle.json`, so it exercises the MEASURED path
   instead of the proxy fallback. Evidence that this is real coverage: with the library loaded
   and the pre-P3 expected values still in place, sanity FAILED 2 checks (8 frozen values +
   the drift-technique pair) — which is exactly the drift that was previously invisible.
   Removing the load would make it pass again, so the load is what makes the coverage real.
   All 10 values were re-pinned with the rationale inline, and a drift now prints
   paste-ready `flow[i]=value` entries.

**Still unconsumed measured data** (each is a small, contained edit): yarn `buoyancy_per_inch_g`
0.01/in vs the hardcoded `yarnInches * 0.15` in `rigLift()` (~15x high); `BEAD_DENSITY.soft = 0.55`
(measured ≈1.0 — the soft/hard difference is drag, not lift); hook `mass_g` (only size 2 moved,
0.12 → 0.16); the weight shape/density (`anchorScale = 0.7 + 0.6*oz` is still a mass-only fudge —
the weight `area_cm2`/`cd` are also still unmeasured, which is P1b).

**Immediate next step:** the tackle library is fully wired end to end (P1 → P4b all DONE), so the
next step is a **product call, not code**: the merged decision above (enable `communitySonar()`'s
`loc` gate and, in the same change, decide whether `get_global_calibration` returns the brand ids).
After that the remaining measured data is physics-contract work — P3 leftovers (yarn 0.01/in vs the
0.15 constant, `BEAD_DENSITY.soft` 0.55 -> ~1.0, hook size 2's 0.16) and the weight
mass/area/density in place of `anchorScale = 0.7 + 0.6*oz`, which must land WITH the hold-bottom
model (that is its trigger, per the accuracy roadmap). Nothing is mid-flight: tree clean (the P4/P4b
diff is uncommitted), app runs, sanity 111/111, and `--check` reports 185/185 complete.




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

- [ ] **Inert community sonar — MERGED with "should the RPC return the brand ids?"** (2026-09-29).
      `communitySonar()` skips every row whose `loc !== 'Fair'`, and nothing has ever populated that
      field — so the whole path is dead, and the P4b brand ids cannot reach a cloud row until the
      RPC returns them. Both are the same call: enabling the gate without the RPC gives
      material-level replays, widening the RPC without the gate changes nothing. Recorded in
      `docs/ROADMAP.md` §3.2 + `docs/CONTRACT_CATCH.md`.
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
