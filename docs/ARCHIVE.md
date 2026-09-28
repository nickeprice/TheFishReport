# Archived plan — Phases A through H (completed)

Full per-step detail for phases already shipped on main. Kept losslessly so git log + this file are the audit trail; `memory-bank/activeContext.md` stays lean and active-work-only.

# Phase A — Correctness & Safety (P0)

Resolved in the current session. Verification: JS/Python syntax checks, node smoke tests,
then a dev-server browser pass. The two regulation engines are now unified on
`src/utils/regulations.js` (the GPS-aware engine); the legacy
`src/data/riverRegulations.js` globals are no longer loaded.

- [x] `supabase/migrations/20260917000000_init_schema.sql` — `user_id uuid not null default auth.uid()`
      - Potential bugs: a `default auth.uid()` on a table created by an earlier migration cannot
        backfill rows (idempotent `create table if not exists` skips the default); fine here
        because the live DB already has the column and client sends `user_id: undefined` so the
        DB default applies for fresh inserts.
      - Verification: `grep -n "default auth.uid()" supabase/migrations/20260917000000_init_schema.sql`.
- [x] `index.html` — remove the legacy `src/data/riverRegulations.js` script (its globals shadowed
      the new engine at runtime; the new engine is the one that reads `wdfw_rules.json`).
      - Potential bugs: dangling references to `riverRegulations` globals anywhere else in the app
        would break after removal. Grep confirmed no other call sites.
      - Verification: `grep -rn "riverRegulations" index.html src/` shows no external references.
- [x] `src/app.js` — `updateActiveDateUI()` calls `checkRiverStatus(date, gpsCoords, riverName)`
      (new engine signature) and surfaces `reason`/`ruleDetail` on the status pill.
      - Potential bugs: a station whose stored `name` is a bare USGS label ("PUYALLUP RIVER AT
        PUYALLUP, WA") — the new engine matches by subtring via `matchRiverRules`, so it resolves.
        GPS coords are only passed when the station was explicitly GPS-selected, preserving the
        per-zone GPS logic without leaking live GPS into the pill.
      - Verification: node smoke test — `checkRiverStatus(new Date(2026,8,17), {lat:47.20,lon:-122.31},
        'Puyallup River')` returns the Clark's Creek zone and open/closed state.
- [x] `src/app.js` — `loadDatabase()` renders the Brag Board with DOM APIs / `textContent` instead
      of `innerHTML` (fixes stored XSS via angler names).
- [x] `src/app.js` — `getGPS()` no longer writes raw coordinates into the debug console
      (sensitive-data exposure).
- [x] `src/services/water.js` — `fetchCFSMomentum()` sorts readings chronologically so the 4-hour
      delta is order-independent.
- [x] `src/services/water.js` — `buildEscapementSection()` escapes species names (defense in depth).
- [x] `src/services/supabase.js` — `toCatchRow()` sends `user_id: undefined` when absent so the DB
      default `auth.uid()` applies (keeps RLS "own rows" intact for every anon session).

Verification run this session:
- `find src -name '*.js' -print0 | xargs -0 -n1 node --check` → OK
- `node --check sw.js` → OK
- `python3 -m py_compile api/water_report.py scripts/dev_server.py scripts/scrape_wdfw.py` → OK
- Node smoke: `checkRiverStatus` on Puyallup/Green/Nisqually returns correct zones & open state.
- Dev-server browser pass: page loads, API returns 4 report days, catch-log tab renders.

# Phase B — Catch-write fixes + environment enrichment + feature work

- [x] `supabase/migrations/20260917000200_catch_writes_env_columns.sql` — drop redundant
      `corky_size` integer (client wrote string `'c12'` for a Cheater rig -> broke inserts);
      add `water_temp_f`, `wind_speed_mph`, `wind_dir_compass`, `moon_phase`.
      - Potential bugs: the live table already exists, so `add column if not exists` is idempotent;
        dropping `corky_size` is safe because nothing reads it and `foam` is the source of truth.
      - Verification: `python3 -m py_compile` + migration statement check (5 statements).
- [x] `src/services/supabase.js` — `toCatchRow` sends `hook_size` as a number, removes
      `corky_size`, and maps `gauge`/`barometer`/`waterTemp`/`windSpeed`/`windDir`/`moon`
      to `gauge_height`/`barometer`/`water_temp_f`/`wind_speed_mph`/`wind_dir_compass`/`moon_phase`.
      - Verification: headless node test — Cheater rig + env payload maps correctly, numeric hook,
        no `corky_size` key.
- [x] `src/services/water.js` — stash `window.currentWindMph`/`currentWindDir` so `logData` can
      enrich the private row.
- [x] `src/app.js` — `logData()` captures gauge, barometer, water temp, wind, moon at log time
      (falls back to null when the report/telemetry is unavailable).
      - Verification: node teste of `toCatchRow` with the new payload shape.
- [x] `index.html` + `src/app.js` + `src/services/supabase.js` + `src/styles.css` — **My Catches**
      panel: fetch/edit/delete own rows via `Supa.fetchMyCatches/updateMyCatch/deleteMyCatch`
      (RLS owns-row policies already permit this). Rendered with DOM APIs (no innerHTML);
      hidden until signed in.
- [x] `index.html` + `src/app.js` + `src/styles.css` — **Regulations detail panel**: `#reg-detail`
      under the status pill shows zone name, open species, and rule detail (all `textContent`).
- [x] `src/app.js` — **Rig preset persistence**: `saveRig()` on sim (localStorage), `restoreRig()`
      on boot mirrors to both Gear Sim + Catch Log controls.

Verification:
- `find src -name '*.js' -print0 | xargs -0 -n1 node --check` → OK
- `python3 -m py_compile` → OK
- Headless `toCatchRow` test → PASS
- Dev server: index / styles / supabase.js / app.js all 200; API 4 days.

# Phase D — Tide chart, species calendar, calibration enrichment

- [x] `api/water_report.py` — `build_species_calendar(target_date)` computes per-stock
      run status (pre/peak/post/off + days-to-peak); each report now includes
      `species_calendar` and `tide_curve` (tide extremes for an SVG sparkline).
      - Verification: local API returns `tide_curve` + `species_calendar`; python
        compile; dev-server 200s.
- [x] `src/app.js` — `tideCurveSvg()` renders a compact inline SVG tide line;
      `buildSpeciesCalendarHtml()` renders the per-species run calendar rows.
      Injected into each day card between the escapement block and legal-hours timeline.
      - Verification: `node --check`; dev-server serves the new card HTML.
- [x] `src/styles.css` — tide SVG (line/dot/label) + species-calendar status colors
      (peak=green, approaching=yellow, tapering=amber, off=muted).
- [x] `supabase/migrations/20260917000400_calibration_env_columns.sql` — `drop function`
      then recreate `get_global_calibration` with `water_temp_f`, `wind_speed_mph`,
      `wind_dir_compass`, `moon_phase` in the return; re-grant execute to anon/
      authenticated/service_role.
      - Potential bug: `create or replace` cannot change a function's return type
        (SQLSTATE 42P13); the migration must drop-then-create, which it now does.
      - Verification: `npx supabase db push --yes` applied; live
        `pg_get_function_result` shows the new columns; migration history lists
        `20260917000400` as applied.
- [x] `src/services/supabase.js` — `fetchGlobalCalibration()` maps the new env fields
      (`waterTempF`, `windSpeedMph`, `windDirCompass`, `moonPhase`) so future sonar
      heuristics can use them.

Verification:
- `find src -name '*.js' -print0 | xargs -0 -n1 node --check` → OK
- `node --check sw.js`, `python3 -m py_compile` → OK
- Dev server: index/app.js/styles 200; API returns tide_curve + species_calendar
- Live DB: RPC return type includes env columns; all 5 migrations applied

## Remaining ideas (future)

- [ ] Use the new env fields in the sonar zone-shift heuristic (e.g. weight samples by
      matching water temp / wind / moon)
- [ ] Live end-to-end insert test of a real catch against the migrated DB
- [ ] Mobile GPS "Use My GPS" verified on a real device (desktop tested here)

# Phase E — Environment-matched sonar weighting

- [x] `src/app.js` — `envMatchWeight(row, rep)`: scores a logged catch's recorded
      water temp / wind / moon against today's live conditions. Returns 1.0 for an
      exact match, ~0.75 for a weak match, 0.25 floor for a strong mismatch, and 1.0
      for legacy rows with no env data (never penalised).
- [x] `src/app.js` — `communitySonar()` now computes a **weighted** center (matching
      catches pull harder) and reports `matched` count + a human note ("3 of 5 matches
      today's conditions" vs "few matching today's conditions").
- [x] `src/app.js` — `computeStrikeZone()` uses the env-matched sample count for the
      zone pull (matching catches pull more), and the zone explanation now says how
      many samples matched today's conditions.
      - Verification: headless node test — exact-env weight 1.00, poor temp/wind 0.75,
        legacy 1.00; communitySonar returns weighted center + matched count.
- [x] Verified with a dev-server pass (index/app.js/styles 200, API 4 days) + JS/Python
      syntax checks.

## Remaining ideas (future, after this)

- [x] **Real-device GPS "Use My GPS" verified on Safari** — fixed + confirmed working via
      Cloudflare HTTPS tunnel (Safari requires HTTPS for geolocation). Root causes were
      (1) iOS needs HTTPS, and (2) the browser→USGS direct bbox call hits USGS NWIS
      flakiness. Now routed through a reliable server-side `/api/nearby_stations` endpoint
      with a curated WA river-gauge list + client retry. Service-worker cache bumped.


# Phase F — CI + live verification

## Step 1 — CI workflow ✅
- [x] `.github/workflows/sanity.yml` — runs `node sanity_pass.js` on push/PR to `main`
      plus manual `workflow_dispatch`, ubuntu-latest, 10-min timeout, no install step,
      and asserts the pass leaves no dev-server processes behind.
      - Verification: first run (35306760950, triggered by `dabc9e7`) completed with
        conclusion `success`; job `sanity` → `success`.
- [x] `README.md` — documented the CI workflow under Testing.

## Step 2 — Live end-to-end catch insert test ✅

- [x] Sign in as a guest in the app, run the Gear Sim, FEED DATA, and confirm the catch
      lands in `public.catches` with env columns populated (`water_temp_f`,
      `wind_speed_mph`, `wind_dir_compass`, `moon_phase`) and shows on the Brag Board.
      - Verified live (2026-09-18): new catch (Nick · Coho · 1020 CFS) landed with
        `water_temp_f=53`, `wind_speed_mph=0.5`, `wind_dir_compass=SSE`,
        `moon_phase="🌓 First Quarter"`, `barometer=29.99`, `gauge_height=10.18`,
        `foam='10'` (text), `hook_size=2` (integer), `sim_score=5`. The public feed
        view shows it at the top (`name, time, flow, fish` — no private columns).

### Analysis (2026-09-18)
- Live DB has 3 catches (all by "Nick", Coho, `foam='10'`, `sim_score=5`) — so the
  `user_id` default + Cheater-rig/`hook_size` write fixes are working.
- All env columns on those rows are `null`, but that's a **timing artifact**: the
  newest catch (2026-09-18T03:17Z ═ 09-17 20:17 PT) predates the env-enrichment commit
  `1460edb` (20:45 PT). The pre-enrichment bundle cannot capture env data.
- GitHub Pages is **not enabled** for this repo (API: `pages: NOT ENABLED`), so there
  is no deployed stale bundle — the "app" is local dev-server only.
- Source wiring is verified correct: `logData()` builds gauge/barometer/waterTemp/
  windSpeed/windDir/moon; `toCatchRow()` maps them to the live columns.
- **Remaining check**: a fresh catch logged through the CURRENT build (manual, in-app)
  should populate the env columns. Do this on the dev server with a guest session.





- [x] `supabase/migrations/20260917000300_set_user_id_default.sql` — set `user_id`
      `default auth.uid()` on the live column. The Phase A migration's `create table
      if not exists` was a no-op on the pre-existing table, so the default never
      landed; this one is idempotent and fixes guest catch inserts.
      - Verification: live query `information_schema.columns` -> `column_default
        = 'auth.uid()'`, and `supabase_migrations.schema_migrations` lists all four
        migrations as applied.
- [x] Live push: `npx supabase db push --yes` applied `20260917000300` (plus the
      earlier `20260917000200` env-columns migration was already live).



# Phase G — UI/UX polish pass (2026-09-18)

- [x] `api/water_report.py` — water temp + turbidity now come from the ACTIVE
      station's OWN USGS gauge only (params 00010 / 63680 on the same single
      telemetry call). Exposed as `water_temp_f` / `turbidity_fnu` per report
      day. No proxy, no cross-gauge fallback, no guessing.
      - Potential bugs: the `has_fresh_discharge_or_gage` gate stays on 00060/00065,
        so a station that reports temp but no discharge won't mark active; the
        freshness check (<=24h) applies to all four params identically.
      - Verification: live `/api/water_report` on 12113000 returns `turbidity_fnu=2.3`,
        on 12115000 returns `water_temp_f=50.4`; 12101500 returns nulls (hidden UI).
- [x] `src/services/water.js` — removed `waterTempProxies`, `fetchProxyWaterTemp`,
      `setWaterTempPlaceholder`. Added `applyOwnGaugeWaterQuality(tempF, turbFnu)`
      which syncs `window.waterTempF` (Gear Sim) and paints `.water-temp` /
      `.turbidity-val` from the report payload.
      - Verification: `grep` shows no proxy remnants; sanity check passes.
- [x] `src/app.js` — water report card layout polish:
      - Tide curve SVG moved INSIDE the tide panel beside the pills
        (`formatTideRow(tideStr, tideCurve)`); orphaned `[ TIDE CURVE ]` section removed.
      - Species run calendar moved beside the hatchery escapement in a shared
        `.run-grid` (stacked mobile / side-by-side at >=900px).
      - Water temp + turbidity render in the "CFS & Gauge Height" telemetry area
        only when the own gauge reports them; hidden entirely otherwise.
      - CFS trend badge (↑ Rising / ↓ Dropping / Stable) restored inline after CFS.
      - Verification: `node _validate_card.js` (tide pills + curve + quality blocks),
        dev-server API pass, `node --check`.
- [x] `src/app.js` + `index.html` + `src/styles.css` — header: station selector is now
      a centered `<button id="station-header">` (removed the full-width `flex:1`
      click target) so tapping empty header space does not open the modal.
      - Verification: sanity check `station header is a centered button`.
- [x] `src/app.js` + `index.html` + `src/styles.css` — regulations pill reverted to
      plain "● RIVER OPEN" / "● RIVER CLOSED" (removed the `reason` suffix and the
      zone-detail block under it). `reg-detail` is now always cleared.
      - Verification: `updateActiveDateUI` only sets the pill innerText + title.
- [x] `index.html` + `src/app.js` + `src/styles.css` — catch log merged: "My Catches" +
      "Brag Board" are now ONE list (`catch-log-table`) with a "yours / everyone"
      toggle (`setCatchScope`). Private rows keep Edit/Delete; public scope shows
      Name/Time/Flow/Fish. Logging is decoupled from the Gear Sim (no `runSim`
      gate; form-driven payload with optional sim geometry).
      - Verification: sanity checks `catch log merged`, `toggle switches scope +
        headers`, `logData works without runSim`.
- [x] `sw.js` — bumped cache to `v2.00.4` so phones pick up the new bundle.
- [x] `sanity_pass.js` — added 11 new checks (merged table markup, no split tables,
      centered station button, no water-temp proxy, own-gauge API keys, scope
      toggle behavior, logData decoupling). Full pass: 26/26 green earlier in
      session; the only intermittent failure is the LIVE USGS `/api/nearby_stations`
      upstream (code path untouched, passed when USGS is up).
- [x] Phase 5 DB cleanup — `supabase/migrations/20260918000100_delete_test_rows.sql`
      (idempotent, exact PKs) removed the two `2026-09-18T03:17Z` rows and the
      `2026-09-18T04:29Z` row; KEPT the `2026-09-17T13:30Z` row.
      - Verification: live query returns exactly 1 row (`141d8fbf…`,
        2026-09-17T13:30Z, Nick/Coho/984/5).

---

# Archived plan — Phases 2.1 – 2.4.1 (completed, shipped on main)

Moved out of TASK.md during UPDATE 3.0 Phase 1.1/4.4 so the live TASK.md
stays lean and ACTIVE-only (per .clinerules). Kept losslessly as the audit trail.

## ACTIVE (COMPLETE)  Phase 2.4.1 — Polish + 3 bug fixes (2026-09-18; done + verified)

# Phase 2.4.1 — Timezone fix, scroll/bar fixes, hero & pill polish, gear rows

STATUS: COMPLETE ✅ (2026-09-18) — all 8 items done + verified; NO DB migration;
`sanity_pass.js` 45/45 green (13 new/updated assertions); sw.js → `v2.00.12`.
Prior phase 2.4 shipped as commit `b7b8f1d`. Not committed yet (awaiting approval).

## 1. TIMEZONE BUG — "nets in the river" showed on the wrong day
- [x] `api/water_report.py` (~line 641): `now = datetime.now()` is SERVER-LOCAL
      (UTC on Vercel) but drives the 4 forecast days, the TODAY/TOMORROW tag,
      `dt.weekday()` netting check, sunrise/sunset and tide-day filtering. The
      browser renders dates in Pacific, so late in the day they drift a day apart
      (a card tagged Saturday was checking Sunday/Tuesday netting).
- [x] Fix: `now = datetime.now(ZoneInfo('America/Los_Angeles')).replace(tzinfo=None)`
      (`from zoneinfo import ZoneInfo`; stdlib). Keep everything naive downstream.
      `NETTING_DAYS = [6,0,1]` is correct — do NOT change it.
      - VERIFIED: `from zoneinfo import ZoneInfo` added; dev-server API on 12101500
        → TODAY = `Friday, Sep 18` == Pacific today, and per-day
        `Friday=open Saturday=open Sunday=NETS Monday=NETS` (NETTING_DAYS = Sun/
        Mon/Tue). Sanity now asserts both (day 0 == Pacific today + per-day match).
- [x] Verify: dev-server API — `net_status` for each of the 4 days matches the
      weekday of that day's `title` in Pacific time.

## 2. SCROLL cannot reach the bottom / needs several drags
- [x] `src/styles.css:14-15`: `html, body { height: 100% }` + `body { overflow-y: auto }`
      makes body an inner scroll container (mobile jank). Drop `height: 100%`.
      - VERIFIED: `height: 100%` + `overflow-y: auto` gone → document-level scroll;
        sanity asserts no `height: 100%` on `html, body`.
- [x] `body` padding-bottom must match the REAL bar height (was `64px`), so the last
      line is not hidden under the bar: `calc(56px + env(safe-area-inset-bottom))`.
      - VERIFIED: padding is `calc(56px + env(safe-area-inset-bottom))`, matching the
        56px `.tab-btn` height; sanity asserts the exact declaration.

## 3. BOTTOM TAB BAR sits too high with a transparent gap
- [x] `src/styles.css`: put `padding-bottom: env(safe-area-inset-bottom)` back on
      `.bottom-tab-bar` (dark bg reaches the home indicator) and REMOVE the
      safe-area term from `.tab-btn` (fixed ~56px height, vertically centered).
      - VERIFIED: `.bottom-tab-bar` owns the inset; `.tab-btn` is `height: 56px` +
        `display:flex; align-items:center` and no longer references safe-area.

## 4. FISHING OUTLOOK — real section header + ONE centred line
- [x] `src/app.js` `buildFishingHero`: drop the in-pill `hero-lbl`; emit only the
      centred line. `src/styles.css`: `justify-content: center`, small gap, reasons
      capped at 2 so it stays one line.
      - VERIFIED: `hero-lbl` gone from app.js + styles.css; `.hero-line` is
        `justify-content: center` with `gap: 3px 7px`; reasons `slice(0, 2)`.
- [x] Card render (`src/app.js` ~line 916): put "FISHING OUTLOOK" ABOVE the hero as
      a `.sec-hdr` (same style as `[ RIVER & ENVIRONMENTAL CONDITIONS ]`).
      - VERIFIED: `'<div class="sec-hdr">[ FISHING OUTLOOK ]</div>'` renders directly
        above `buildFishingHero(rep)`; sanity asserts the marker exists.

## 5. 9-PILL GRID still looks off (dead space between value and label)
- [x] `src/styles.css`: remove `justify-content: space-between` + `min-height:76px`;
      use `justify-content:center`, small fixed gap, a uniform reserved sub-line
      slot on EVERY cell, `grid-auto-rows: 1fr` (all 9 equal + centred).
      - VERIFIED: `.env-badge` is `justify-content:center` + `gap:4px`, no
        min-height; app.js renders 9 `env-badge` cells with 9 `env-badge-sub` slots
        (grep counts = 9/9).

## 6. COUNTS fold label + hatchery "last updated"
- [x] Render the fold as `▸ Forecast & Hatchery Report` (was `Counts`).
      - VERIFIED: summary text is `Forecast &amp; Hatchery Report`; the chevron moved
        to `::before` so it prints BEFORE the label (`▸ Forecast & Hatchery Report`).
- [x] `src/services/water.js` `fetchEscapementLive`: request the Socrata system
      column `:updated_at` and return its MAX with the counts
      (verified live: `max(:updated_at)` = `2026-09-18T07:09:37.303Z`).
      - VERIFIED: `$select=…,max(:updated_at) AS lastUpdated`; Node harness running
        the REAL function against live Socrata returned
        `lastUpdated = 2026-09-18T07:09:37.303Z` and `{ stocks, lastUpdated }`.
- [x] `loadEscapementData` stashes `rec.lastUpdated`; render under the counts fold:
      `Last updated <Mon D, YYYY · H:MM AM>` in LOCAL time. If absent, show the
      honest fallback "Hatchery data may lag WDFW reporting." (never a fake date).
      - VERIFIED: `formatEscapementUpdated()` → `Last updated Sep 18, 2026 ·
        12:09 AM` (local) / fallback wording for `null` + unparseable input;
        `refreshEscapement` repaints every `[data-esc-updated]`.

## 7. RUN & TIMING run cards — remove the peak day-counter
- [x] `src/app.js` ~line 584: DELETE the `peakLine` ("Peak in N d" / "Peak was N d ago")
      and its `.run-footer` div (~line 621). KEEP the `Peak <date>` track label.
      `src/styles.css`: `.run-footer` rule becomes dead — remove it.
      - VERIFIED: `peakLine` + `.run-footer` gone from app.js and styles.css; the
        `run-lbl-peak` "Peak <date>" label is untouched; sanity asserts no remnants.

## 8. GEAR SIM + CATCH LOG — resting rows (undo the over-squash)
- [x] `index.html` (both tabs) + `src/styles.css`: replace the 2-col auto-flow
      `.gear-grid` with explicit rows, ONE group per line, order preserved:
      Rod Length + Weight | Mainline Material + Mainline Lb Test |
      Leader Length + Leader Material + Leader Lb Test (3-up) | Hook Size + Yarn |
      Foam 1 + Foam 2 | Bead Material + Bead Size. Wider gaps + fuller labels.
      Keep the `-log` duplicates in the Catch Log.
      - VERIFIED: `.gear-rows`/`.gear-row`/`.gear-row-3` (gap 11px / 10px) with 6 rows
        per tab = 12 `class="gear-row"` occurrences; every id/for/onchange/onclick/
        aria-labelledby/placeholder/type attribute in index.html is byte-identical to
        HEAD (scripted diff = "ATTRS IDENTICAL"); div open/close = 85/85.

## Verify (whole phase)
- [x] `python3 -m py_compile api/water_report.py`; `node --check` on src/*.js + sw.js + sanity_pass.js
      - `bash scripts/check.sh --quick` → syntax OK.
- [x] `bash scripts/check.sh`; `node sanity_pass.js` (update the `.gear-grid` CSS
      assertion -> `.gear-row`; consider a Pacific-time/nets assertion)
      - VERIFIED: 45 PASSED / 0 FAILED; the `.gear-grid` assertion is now
        `.gear-row` + `.gear-row-3`, plus new checks for dead CSS, document-level
        scroll, body padding, `:updated_at`, hero/`sec-hdr`, peak-counter,
        6-rows-per-form, Pacific TODAY + per-day netting.
- [ ] Dev-server browse: TODAY/netting align with the Pacific calendar; scroll reaches
      the bottom; bottom bar flush; hero/pills/gear rows look right.
      - API-side proven by the checks above; on-device visual pass still outstanding.
- [x] NO DB migration in this phase -> no `db push`.
- [ ] Commit + push when green (awaiting user approval — no auto-commit).

---
# ARCHIVED — Phase 2.4 — Compact one-screen forms, HUD cleanup, foam 1+2 (shipped `b7b8f1d`)

# Phase 2.4 — Fit both forms on one screen; HUD simplification; Foam 1 + Foam 2

## Locked decisions (user-confirmed)
1. Flow is DERIVED from the live report (fallback: last-known -> 1040); still recorded.
   Distance is dropped from view (writes null).
2. Per-device defaults from the user's most recent input; never-logged = blank + REQUIRED.
3. Foam 2 FEEDS THE PHYSICS (Foam 1 lift + Foam 2 lift). Both recorded.
4. Gear field ORDER IS PRESERVED (Rod/Weight -> Mainline -> Leader -> Hook/Yarn -> Foam1/Foam2 -> Beads).
5. Hero gets a label; pills even; counts fold small; bottom bar gap fixed; wind "mph" restored.
6. HUD: REMOVE stars + score-bar. Keep LINE HEIGHT + rename BED VELOCITY -> BOTTOM CURRENT.

## A. Hero (`src/app.js`, `src/styles.css`)
- [x] Add "FISHING OUTLOOK" label; 2-line clean layout.

## B. Pills (`src/styles.css`)
- [x] Even spacing: grid-auto-rows 1fr, no min-height/margin-top:auto weirdness.

## C. Wind (`src/services/water.js`)
- [x] Restore "mph" in applyReportWeather.

## D. Counts fold (`src/styles.css`)
- [x] Small chevron fold, in-family.

## E. Bottom bar (`src/styles.css`)
- [x] Fix safe-area double count.

## F. Gear fields (`index.html`, `src/app.js`, `src/services/supabase.js`)
- [x] Remove #flow/#distance/#flow-log/#distance-log from DOM.
- [x] Remove the 3 big h2 headers; keep order; full labels.
- [x] Leader Length -> number input. Foam -> Foam 1 + Foam 2.
- [x] No selected defaults; per-device prefill; blank+required (validator + toast).

## G. HUD (`index.html`, `src/app.js`)
- [x] Remove #stars + #score-bar; rename Bed Velocity -> BOTTOM CURRENT ("how hard the water pulls").

## H. Catch Log (`index.html`)
- [x] Join the Board back to TOP; remove "Angler & Location" header; Date & Time -> Catch Result.

## I. One-screen fit (`src/styles.css`)
- [x] Compact inputs/rows/labels + 2-col gear grid so each tab fits without scrolling.

## J. DB (`supabase/migrations/`, `src/services/supabase.js`)
- [x] foam_2 column migration + toCatchRow mapping (agent ran db push + verified live).

## Verify
- node --check all JS + sanity; py_compile; check.sh; sanity_pass.js (update harness);
  `npx supabase db push --yes < /dev/null`; live read-only verify; dev-server browse.

---
# ARCHIVED — Phase 2.3 (shipped)

# Phase 2.3 — Hero to top, uniform pills, compact Gear Sim, board-first Catch Log

## Locked decisions
1. DELETE only today's `Nick · Coho · flow 1050 · 2026-09-18T14:38Z` row.
   Yesterday's Nick row stays.
2. Commit a new migration: `river_name` column + `public_catch_feed` view update.
3. Sign-in moves DOWN, directly above the board (public board is the entry point);
   default scope = Everyone (Yours is secondary).

## 1. Compact hero at the top (`src/app.js`, `src/styles.css`)
- [x] Render `buildFishingHero(rep)` FIRST inside `.card`, above [ RIVER & ENVIRONMENTAL CONDITIONS ].
- [x] Halve height: single-line strip (verdict · best window · reasons joined by ·). No `<ul>` bullets.

## 2. Uniform pills (`src/styles.css`)
- [x] `.env-badge` fixed min-height + equal padding; reserve sub-line space so all 3 rows are identical height.

## 3. Remove run-meter gradient (`src/app.js`, `src/styles.css`)
- [x] Drop `.run-gradient` span + CSS; restore flat status-colored `.run-fill`.

## 4. Mobile-friendly bottom bar (`index.html`, `src/styles.css`)
- [x] Add `viewport-fit=cover` to viewport meta.
- [x] `.tab-btn` min-height 60px, font 12px, more padding.

## 5. Shrink Gear Sim top (`src/styles.css`)
- [x] Collapse `#hud` (stars ~1.2rem, tight margins), trim `#tab-gear-sim` h2/h3 spacing so the form fits one screen.

## 6. Catch Log rework (`index.html`, `src/app.js`, `src/services/supabase.js`, `src/styles.css`)
- [x] Remove GPS visual (field + 📍) from DOM; keep silent `payload.gps` capture.
- [x] Remove Hook Location select; send `loc=null`.
- [x] Move auth (sign-in/join) DOWN, directly above the board; fix clipped hint wording.
- [x] Default scope = Everyone; Everyone button first + active; headers Name/Time/River/Fish (public). Downloads Flow from public.
- [x] `normalizeFeedRow` + `loadDatabase` + `fetchPublicFeed` use `river`.
- [x] `toCatchRow` writes `river_name` (derived from active station/GPS; never raw coords).

## 7. Migration (`supabase/migrations/<ts>_add_river_name.sql`)
- [x] `alter table public.catches add column river_name text;` + rebuild `public_catch_feed` (name,time,river,fish) + re-grant.
      NOTE: DDL is repo-only (query tool is read-only) — apply via Supabase CLI/SQL editor.

## Verify
- `node --check` all JS + sanity; `python3 -m py_compile`; `bash scripts/check.sh`; `node sanity_pass.js` (update harness).
- Dev-server browse: hero on top + compact, uniform pills, no gradient, compact Gear Sim, board-first w/ sign-in above board, River column, today's Nick row gone.

---
# ARCHIVED — Phase 2.2 (shipped)


# Phase 2.2 — Conditions grid, plain-English hero, readable run cards, auto-refresh

## Locked decisions
1. Water Temp pill DROPPED from grid (stays in telemetry `°F H₂O` line).
2. Clarity ("Dam releasing…") folds into the hero WHY (no inline badge).
3. Precip % AND Precip Vol each show a live timing hint: `in {H/M}` before rain
   starts, `now for {H/M}` while raining (hourly forecast, threshold ≥30%).
4. Auto-refresh: `loadWaterReport(silent)` every 5 min (visible+online only),
   on `visibilitychange→visible`, and on `online` (re-fetch, not just a toast).
   Silent refreshes must NOT overwrite a manually typed Gear Sim CFS.

## A. Conditions grid → 9 pills (`api/water_report.py`, `src/app.js`, `src/styles.css`, `src/services/water.js`)
- [x] Backend: add `hourly=temperature_2m,precipitation` to the meteo fetch; ship
      `temp_prev_f`/`temp_delta_f` (trend arrow) and `precip_phase_pct` +
      `precip_start_text`/`precip_end_text` (`in 3H` / `now for 2H` / `--`).
- [x] Frontend: Barometer / Precip%+hint / PrecipVol+hint / Cloud / Temp+trend /
      Wind (arrow + fixed mph, FIX the `mphmph` bug) / Sunrise-Sunset split /
      Moon / Solunar. Labels: Precip %, Temp, Wind. Grid stays 3 cols.

## B. Hero replaces Movement Index + % timeline (`src/app.js`, `src/styles.css`)
- [x] Delete `computeMovementIndex()` + movement-index markup + `.run-windows`.
- [x] `buildFishingHero(rep)`: "👍 Good day" / "⚠️ Mixed" / "👎 Tough" + best
      window time + why bullets (clarity folded in). Reuses `getFMIColor`.

## C. Species calendar (`api/water_report.py`, `src/app.js`, `src/styles.css`)
- [x] `build_species_calendar`: skip Pink on even years (2026 hidden).
- [x] Counts toggle bolder/brighter; labels `Forecast`/`Returned`/`Trapped`/
      `5-Yr Avg` (Forecast first, bolded).
- [x] Run meter: full-track cool→hot→cool gradient (peak is the hot stop),
      translucent progress on top, peak tick stays.

## D. Remove hamburger nav (`index.html`, `src/app.js`, `src/styles.css`, `sanity_pass.js`)
- [x] Delete ☰ button, `#menu-drawer`, `toggleMenu()`; center station header;
      drop `toggleMenu()` from `switchTab`.
- [x] `sanity_pass.js`: remove `toggleMenu` from `need`, drop `.nav-btn` stub.

## E. Accessibility (`src/styles.css`)
- [x] Body 11px→14px; scale pill values/labels; brighten muted text; ≥44px
      tap targets; larger counts. Verify 320px reflow.

## F. Auto-refresh + cache bump (`src/app.js`, `sw.js`, `index.html`)
- [x] `loadWaterReport(silent)` guards Gear-Sim CFS overwrite; 5-min interval
      (visible+online), `visibilitychange→visible` refresh, `online` re-fetch.
- [x] Read/refresh affordance: ⟳ button + `updated_time` stamp in the header.
- [x] SW cache bump v2.00.9 → v2.00.10.

## Verify (whole phase)
- `find src -name '*.js' -print0 | xargs -0 -n1 node --check`, `node --check sw.js sanity_pass.js`
- `python3 -m py_compile api/water_report.py`
- `node sanity_pass.js` (harness updated) → all green
- Dev-server phone pass: 9 pills, hero, gradient meters, pink hidden in 2026,
  brighter counts, auto-refresh on foreground + interval, SW update toast intact.
- `CHANGELOG_INTERNAL.md` entry + commit only after user approves.

---
# ARCHIVED — Phase 2.1 (shipped)


## Context & locked decisions (READ BEFORE ANY EDIT)
- Goal: show the real run/movement story honestly. HARD RULE (AGENTS.md): never
  fabricate. The old `active_fish` ("~N entering today") is a hardcoded Gaussian
  (`peak_date` + `avg_run` × curve × 0.04) and is REMOVED permanently — never re-add.
- HERO LINE idea (old item A) — CANCELLED by user. Do NOT build a push hero strip.
- Design rules (user-approved "status stays, numbers fold"):
  1. Status / window / progress ALWAYS visible; raw counts fold behind a native
     `<details>/<summary>` tap (existing chevron pattern `.esc-section > summary::after`).
  2. One conditions grid, ever. No floating badges outside it.
  3. Collapse-by-default anything that is not "today / right now / should I go."
  4. `font-variant-numeric: tabular-nums` on every numeric readout; every value
     renders `--`/empty when absent (never fake). Use textContent/DOM for user/data
     text — no unsanitized HTML `innerHTML` interpolation.
  5. 3×3 pill grid stays 3 columns at ALL widths — DELETE the 6-col `@840px`
     `.env-stat-grid` rule in src/styles.css (~line 348) for this grid.


## Commit 2.1a — Backend accuracy (`api/water_report.py` only)

- [x] Ship the REAL `transit_state` + `transit_time`. They are computed in
      `calculate_transit_time_and_flow()` (~lines 374-393) but the payload only emits
      `push_status` (which is actually `calculate_macro_environment`'s env string —
      misnamed). Add `transit_state`/`transit_time` to the `reports.append({...})`
      dict (~lines 620-638).
      - Potential bugs: `transit_state` strings are long ("Bank Hugging / Resistance")
        — frontend must allow wrap/flex-wrap; keep `push_status` shipped for
        backward-compat but do NOT use it as the "fish moving" label.
      - Verification: `python3 -m py_compile api/water_report.py`; live API shows both keys.
- [x] Scope `NETTING_DAYS` ([6,0,1] = Sun/Mon/Tue) to Puyallup/White basin ONLY.
      In `do_GET` (~line 575) gate `is_netting_day` on site ∈
      {12101500, 12093500, 12094000}; other rivers → `is_netting_day=False` and a
      neutral `net_status`.
      - Potential bugs: off-basin rivers (Green 12113000, Nisqually 12089500,
        Skagit 12200500) must NEVER read "Nets In"; keep net_status honest there.
      - Verification: Green (12113000) API on a netting weekday → `is_netting:false`.
- [x] Delete the fake `active_fish` Gaussian in `calculate_escapement_curve()`
      (~lines 316-322: `avg_run * curve_mult * 0.04`). Do NOT replace with another
      count — the honest anchor is the WDFW forecast (Commit 2.1d) + real trap counts.
      - Potential bugs: make sure no frontend yet reads `active_fish` for counts
        (grep first). `species_calendar` (window/peak) is REAL structure — keep it.
      - Verification: `python3 -m py_compile`; `grep -n "active_fish"` shows no
        `avg_run * curve` math.
- [x] New `src/data/wdfw_forecasts.json` — curated `{ stock, year, forecast,
      source_url }` (Chinook, Coho; seed Puyallup Chinook ~34,000 / Coho ~48,000 from
      the REAL 2026 PDFs via 2.1d). Load statically (read-only); expose `wdfw_forecast`
      per stock in the report payload. Never a live/fabricated count.
      - Verification: file exists + valid JSON; `python3 -m py_compile`; app loads.
## Commit 2.1b — Consolidated RUN & TIMING panel (`src/app.js` + `src/styles.css`)

- [x] Replace the THREE separate sections
      (`[ HATCHERY ESCAPEMENT & RUN MOMENTUM ]` + `[ SPECIES RUN CALENDAR ]` +
      `[ LEGAL HOURS TIMELINE ]`) with ONE `[ RUN & TIMING ]` panel. Species rendered
      ONCE per card. Per-species card = status pill + window progress bar + peak line
      (ALWAYS visible) + counts `WDFW forecast / Return / Trap / 5-Yr Avg` (FOLDED
      behind `<details>/<summary>` per card).
      - CRITICAL: escapement counts load ASYNC via Socrata (`refreshEscapement` in
        water.js) AFTER card HTML renders. Merging means `refreshEscapement` fills the
        merged per-species cards' count cells (`data-species` + `data-count` keys on
        `.run-card`), NOT replace a whole section. `buildEscapementSection` +
        `.esc-slot` removed (dead).
      - Potential bugs: species key must match exactly between
        `buildSpeciesCalendarHtml` (lowercased `s.species`) and `hatcheryEscapement`
        stocks (lowercased `st.name`); off-track rivers → cards still render with
        `--` in the counts fold (never blank/crash).
      - Verification: `node --check`; headless render test (Chinook shows
        `12,345 / 88 / 10,000`, Coho shows `--` for nulls, counts fold present);
        `node sanity_pass.js` 28/28 green; API smoke on Puyallup 12101500 OK.
- [x] MOVEMENT INDEX (0-100) one-liner, ALWAYS visible; the WHY (`reasons[]` list)
      folds behind a `<details>`. Compute from live triggers already fetched (freshet
      delta, tide phase/arrival, moon, pressure trend, transit state, netting).
      Every point in `reasons[]` must be human-readable plain text — no magic number.
      - Potential bugs: clamp 0-100; `--` when triggers missing; never fabricate a
        trigger. textContent only.
      - Verification: headless test — `{rain:0.2, press_delta:-0.08, 2 highs,
        Bay Staging}` → `36` with 4 human reasons; clamps; sanity green.
- [x] Legal-hours windows stay INSIDE the RUN panel (same `.window-box` markup, ~app.js:754).
      - Verification: windows render inside `.run-windows` in the panel; sanity green.



## Commit 2.1c — Clarity signal (White River / Mud Mountain Dam)

- [x] `api/water_report.py` — for Puyallup sites ONLY, a 2nd USGS read of
      12098500 (White River near Buckley, 00060 streamflow) + 12098000 (Mud Mountain
      Lake, 00054 storage + 62614 elevation). Derive `clarity_outlook`:
      reservoir ELEVATION DROPPING + White FLOW RISING →
      "Dam releasing → turbidity rising downstream"; stable → "clearing".
      - Potential bugs: ONLY for sites 12101500 / 12093500 / 12094000; null-safe
        elsewhere; never invent an FNU value (AGENTS.md no fabrication).
      - NOTE: used the USGS DAILY-VALUES (dv) endpoint (14-day series) instead of
        iv — the iv feed returns only 1 record for these params (White River 00060
        is currently dormant; Mud Mountain returns a single fresh reading), so a
        real trend needs the daily series. Honest: single/dormant data → `None`.
      - Verification: `fetch_dam_clarity()` direct test →
        `'Dam releasing (reservoir dropping)'` (real 917.47 ft elevation trend);
        live API on Puyallup 12101500 → that outlook; Green 12113000 → `None`.
- [x] `src/app.js` — inline `clarity_outlook` as a small badge in the telemetry row,
      Puyallup sites only (NOT a new section).
      - Verification: badge renders in `.env-telemetry-row` (`.clarity-badge` pill)
        only when `site_id ∈ {12101500,12093500,12094000}` AND outlook present;
        sanity green.

## Commit 2.1d — WDFW forecast hybrid scraper (`scripts/refresh_wdfw_forecast.py`, NEW)

- [x] Fetch STABLE index `https://wdfw.wa.gov/fishing/management/north-falcon/forecasts`,
      match `<a>` text for current-year "Chinook forecasts" + "coho forecast", resolve
      the `href` (URL changes yearly; the index is stable). Download the PDF, extract
      the candidate Puyallup number, PRINT it + source for HUMAN CONFIRMATION BEFORE
      writing `src/data/wdfw_forecasts.json`.
      - Potential bugs: no pypdf / pdfminer / pdftotext installed in this repo →
        degrade to printing the resolved PDF URL + hint, and NEVER write unverified
        numbers (AGENTS.md no-fabricate). One toggle: `--confirm` writes only the
        confirmed number.
      - VERIFIED: resolved the real 2026 URLs (chinook `2026-2025-chinook-forecasts-03102026-revision.pdf`,
        coho `2026-coho-forecast-summary-draft-handout-02272026.pdf`). The PDFs are
        VECTOR-GRAPHIC TABLES with no text layer (stdlib zlib decompression yields
        only drawing ops) — no honest automated extraction is possible without a
        PDF lib/OCR, so the script prints the source URLs + hint and writes nothing.
      - SAFETY: `--confirm` now also requires `--yes` (double-confirm) so a
        placeholder number can never silently land in the JSON. During testing a
        careless `--confirm --chinook=34000 --coho=48000` wrote seed guesses into
        the real JSON — caught, reverted to null, and hardened with `--yes`.
      - Verification: `python3 -m py_compile`; run resolves links + prints URLs,
        writes nothing; unsafe invocations refused; JSON stays `[null, null]`.
      - NOTE: forecasts remain `null` (UI "--") until a HUMAN opens the two PDFs
        and runs `--confirm --chinook=<N> --coho=<M> --yes`. The seed guesses 34k/48k
        are NOT written (unverified).



## Commit 2.1e — App feel (resurrected D + E, previously dropped)

- [x] `index.html` — persistent fixed bottom tab bar (Water Report / Gear Sim /
      Catch Log) calling the existing `switchTab`; keep the menu-drawer; add
      `role="tablist"`/`aria-selected`; body bottom padding + safe-area.
      - Potential bugs: `switchTab` toggles `.tab-active` — the bar must stay synced
        when deep links / bootstraps switch tabs.
      - Fixed: `switchTab` now also toggles `tab-btn-active` + `aria-selected` on
        `#bottom-tab-bar .tab-btn` (deep links / `startFishing` / `stopFishing`
        all call `switchTab`, so the bar always follows). Verified headless.
      - Verification: sanity `switchTab` behavior; headless test (markup has
        `role="tablist"` + `aria-selected`; switchTab syncs the bar).
- [x] `index.html` — drop `user-scalable=no` / `maximum-scale=1.0` (restore pinch zoom).
      - Verification: viewport is now `width=device-width, initial-scale=1.0`; sanity markup passes.
- [x] `src/app.js` — tapping the date header returns to "Today" when paged forward
      (reset `activeDateOffset=0`); truncate overflowing station name with CSS.
      - Potential bugs: date text click must not conflict with prev/next buttons.
      - Fixed: `#date-nav-text` became a `<button onclick="resetToToday()">` with its
        own tap target (prev/next are separate buttons); `resetToToday()` no-ops at 0.
        `#active-station-name` gets `max-width + text-overflow: ellipsis`.
      - Verification: headless — resetToToday resets offset + re-renders, no-op at Today.
- [x] `src/styles.css` — bottom-bar styles (fixed, safe-area inset), station-name
      ellipsis, date-tap cursor.
      - Verification: `.bottom-tab-bar` fixed + `env(safe-area-inset-bottom)`; body
        padding-bottom bumped; sanity green 28/28.
- [x] `sw.js` — cache bumped to `v2.00.7` (html/styles/app changed).

## Commit 2.1f — Conditions grid: 9 pills (carried over B + C)

- [x] `api/water_report.py` — add `current=temperature_2m,wind_speed_10m,
      wind_direction_10m` to the Open-Meteo `meteo_url`; ship `air_temp_f`,
      `wind_speed_mph`, `wind_dir_compass` per day (null → `--`, never fake).
      - Potential bugs: meteo is fetched once for all 4 days — readings are "now";
        absent current → null → `--`.
      - VERIFIED: live API on 12101500 → `air_temp_f: 66.6`, `wind_speed_mph: 2.2`,
        `wind_dir_compass: SW`, `pop_pct: 0` (converted from °C/kmh/mm; hourly PoP
        sampled at the hour nearest `current.time`).
- [x] `src/services/water.js` — delete client-side `fetchWeatherConditions`; keep
      `window.currentWindMph`/`currentWindDir` populated FROM THE REPORT so catch-log
      env rows still get wind. Delete `compassDir`/`compassArrow` ONLY if unused
      elsewhere (grep first).
      - VERIFIED: `grep -rn fetchWeatherConditions|compassDir|compassArrow` → no refs.
        New `applyReportWeather(rep)` paints `.air-temp`/`.wind-val`/`.precip-pop`
        from the report + stashes wind for the catch-row (same `window.*` names).
- [x] `src/app.js` — 3×3 grid: Barometer / PoP% / Precip-vol / Cloud% / Air / Wind /
      Water-temp / Moon-phase (`rep.lunar_icon`) / Solunar. Split Precip into % + volume.
      - VERIFIED: headless test — all 9 labels present, 8 literal + 1 gated pill,
        report-driven values, water-temp `env-badge-hidden` when no own-gauge.
- [x] `src/styles.css` — delete the 6-col `@840px` `.env-stat-grid` rule (stay 3-col);
      add tabular-nums to numeric readouts; fix trigger/moon wrap on 320px.
      - VERIFIED: no 6-col rule; `tabular-nums` on `.env-badge-val`; `.moon-pill` wraps.
- [x] `sw.js` — cache bumped `v2.00.8`.

## Verification (whole phase)
- `find src -name '*.js' -print0 | xargs -0 -n1 node --check` (+ `sw.js`, `sanity_pass.js`)
- `python3 -m py_compile api/water_report.py scripts/dev_server.py scripts/refresh_wdfw_forecast.py`
- `node sanity_pass.js` → all green (live USGS `/api/nearby_stations` flake excluded).
- Dev-server + phone pass: RUN & TIMING panel, movement index, clarity badge,
  instant wind/temp, 9-pill grid, bottom nav.
- `CHANGELOG_INTERNAL.md` entry + commit ONLY after user approves (no auto-commit).
