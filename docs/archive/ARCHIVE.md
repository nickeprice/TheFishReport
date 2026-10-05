# Archived plan — Phases A through H (completed)

Structured task detail for phases already shipped on main. Each phase is a
one-paragraph summary with the key commit hash and migration files where
applicable. The full per-checkbox audit trail (verification steps,
potential-bug analysis) is preserved in `git log` — dig there for detail.

---

# Phase A — Correctness & Safety (P0)

Unified the two regulation engines under `src/utils/regulations.js`, removed the
legacy `src/data/riverRegulations.js` globals, fixed a stored XSS vector in the
catch log (DOM APIs instead of `innerHTML`), stopped leaking raw GPS coordinates
into the debug console, and made `fetchCFSMomentum()` sort readings chronologically
so the 4-hour delta is order-independent. Added `user_id: undefined` default in
`toCatchRow()` so RLS respects anonymous sessions.
- Key migration: `20260917000000_init_schema.sql`

# Phase B — Catch-write fixes + environment enrichment

Dropped the redundant `corky_size` column (Cheater rig broke string→int inserts),
added env columns (`water_temp_f`, `wind_speed_mph`, `wind_dir_compass`,
`moon_phase`) to the catch table, and mapped client-side env fields to the new
DB columns. Added `user_id default auth.uid()` so fresh inserts always assign the
session, keeping RLS intact.
- Key migrations: `20260917000200_catch_writes_env_columns.sql`,
  `20260917000300_set_user_id_default.sql`,
  `20260917000400_calibration_env_columns.sql`

# Phase C — My Catches scope + Brag Board UI

Replaced the single "Catch Log" tab with three scopes: My Catches (your records),
Brag Board (tackle-only anonymised feed), and the log-form. Rebuilt the scope
switcher and unified the pending-sync rendering.
- Key files: `src/features/catch-log/board.js`, `src/features/catch-log/mycatches.js`


# Phase D --- Tide chart + species calendar + calibration env RPC

Built the tide curve SVG renderer, species run calendar with peak window
display, and the get_global_calibration(env_signature) RPC that fetches
environment-matched catch telemetry.
- Key file: src/features/telemetry/tide.js

# Phase E --- Community sonar weighting (env-matched)

The sonar weighting system was rewritten to match on the shared variable set
the sim uses (temp, flow, turbidity, tide state) with declared weights.
Removed wind and moon from the match (they don't constrain vertical holding
position). Environment signatures are now deterministic.
- Key file: src/features/gear-sim/sonar.js

# Phase F --- Catch-log column drops

Dropped two always-NULL columns (cast_distance_ft, hook_location) from the
catch table. Updated calibration RPC SELECT to match.
- Key migration: 20260928000100_drop_dead_columns.sql

# Phase G --- Own-gauge water quality + GPS reliability

Added own-gauge water quality fields (water_temp_f, turbidity_fnu) to the
report pipeline. Safari HTTPS GPS fix + reliable /api/nearby_stations.
- Key migration: 20260928235500_drop_rod_ft.sql

# Phase H --- Tide area chart + species run cards

Smooth tide area chart (tideCurveSvg) and species run cards with peak window.
Stripped loadout overhead from sanity pass vs pure static checks.

---

## Post H --- Calibration columns drop rod_ft + line IDs weight+shape

Dropped never-used rod_ft, added leader_diameter_mm, mainline_diameter_mm,
weight_setup, weight_shape to the calibration table.
- Migration: 20260929055300_line_ids_weight_shape.sql

## Favorites (spots)

RLS-guarded favorite_spots with Leaflet spot saves + spot-pick mode.
- Migration: 20260929190000_favorite_spots.sql

## Sonar env snapshot

10-column env-signature snapshot captured at catch time.
- Migration: 20260930120000_sonar_env_snapshot.sql

## Weight setup

weight_setup (sinker type/location) column for sliding vs 3-way configs.
- Migration: 20261002120000_weight_setup.sql

---

## Phase 2.4.1 --- Timezone, scroll, hero polish, gear rows (Sep 18)

Timezone fix (ZoneInfo Pacific), scroll-to-bottom, bar spelunking fixes,
hero pill polish, gear table alignment. sw.js v2.00.12.

## Commit 2.1c --- Hatchery regs + catch-detail overflow menu

Hatchery regulation zones from WDFW rules, overflow/action menu on catch
detail rows, WDFW forecast hybrid scraper.

## Commit 2.1d --- WDFW forecast hybrid scraper

PDF scraper with --confirm/--yes safety gates (no silent writes).

## Commit 2.1e --- App feel (bottom tab bar, pinch zoom, date tap)

Fixed bottom tab bar with ARIA roles, pinch zoom restored, date header
click resets to Today, station name ellipsis. sw.js v2.00.7.

## Commit 2.1f --- Conditions grid: 9 pills

Open-Meteo air_temp_f, wind_speed_mph, wind_dir_compass in every report
day. 9-pill grid format. Absent values render as --.

## Commit 2.1g --- Tide timeline with 2h stick labels

12h tide timeline with 2-hourly tick labels, NOAA-CO-OPS cross-referenced.
sw.js v2.00.9.

## Commit 2.1h --- Netting calendar for the Puyallup

Puyallup/White/Carbon netting: net_status, is_netting, angler_mult for
weekend transit. Key file: api/water_report.py.

## Commit 2.1i --- Movement index (transit state + duration)

transit_state / transit_time: High Velocity Push / Steady Migration /
Bay Staging / Bank Hugging / RIVER CORKED. BLOCKED on net days.

## Commit 2.1j --- RUN & TIMING + clarity signal + movement index

Consolidated into one RUN & TIMING panel via details. Added clarity
signal (White River/Mud Mountain dam), WDFW forecast scraper, 9-pill
grid, bottom nav feel.

---

## Verification (Phase 2.1 cumulative)

- python3 -m py_compile api/water_report.py scripts/dev_server.py scripts/refresh_wdfw_forecast.py
- node sanity_pass.js -> all green
- Dev-server + phone pass: RUN & TIMING panel, movement index, clarity badge,
  instant wind/temp, 9-pill grid, bottom nav.
