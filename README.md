# The Fish Report

A mobile-first fishing companion for 15 Washington waterbodies — Puyallup, White,
Carbon, Green, Nisqually, Skagit, Snoqualmie, Skykomish, Snohomish, Stillaguamish,
Cedar, Cowlitz, Toutle, Lewis and Kalama. Three tools in one shell:

1. **Water Report** — live USGS flow, barometer, tides, solunar, hatchery
   escapement, fishing-window scoring, a thermal run-status advisory and WDFW legal
   hours.
2. **Gear Sim** — a unified chain-solver (RK4 + shooting + air catenary) that
   solves your full rig from hook to rod tip against today's strike zone.
3. **Catch Log** — private catch records with offline-first durable sync
   (IndexedDB outbox + optimistic UI + automatic reconciliation).

Installable as a PWA and usable offline from a cached app shell.

## Architecture

Plain static frontend — no build step, no bundler, no framework. All scripts are
classic (non-module) scripts sharing one global scope, loaded in dependency
order at the end of `<body>`.

```
index.html                  markup only (tabs, forms, ARIA labels, script tags)
manifest.json               PWA manifest (icons, shortcuts, theme)
sw.js                       service worker (v2.03.42; offline + caching strategy)
icons/                      generated app icons (any + maskable)
src/
  styles.css                all styling (toasts, empty states, focus rings, tabs)
  app.js                    BOOTSTRAP ONLY (59 lines): window.onload wiring
  shared/                   reusable primitives (classic scripts, one global scope)
    debug.js                logDebug + the double-tap debug matrix
    ui.js                   the toast stack
    nav.js                  switchTab / resetToToday
    api.js                  provVal() unwrap helper for provenance envelopes
    format.js               feed-row normalise, time format, escaping, newUuid
    forms.js                line/material/field sync (shared by BOTH tabs)
    idb.js                  tiny promise wrapper over IndexedDB
    refresh.js              auto-refresh timer (hooks into water report)
    pwa.js                  service-worker registration + deep links
    tackle.js               tackle library loader + line/weight/hook lookups
    gear-options.js         gear-sim dropdown option builders
  features/
    auth/                   anonymous guest session + OAuth-ready upgrade path
    telemetry/              report.js (pipeline), hero.js (run cards), hourly.js,
                            daynav.js (date nav), tide.js (tide curve SVG)
    gear-sim/               chain.js (unified RK4+solver), continuity.js,
                            hydro.js, inputs.js, interception.js, physics.js,
                            registry.js, rig.js, riverbed.js, salmon.js,
                            sim.js, solver.js, sonar.js, water-types.js,
                            zone-best.js, zone-core.js, zone-env.js,
                            techniques/drift.js
    catch-log/              outbox.js (durable IndexedDB), pending.js (optimistic),
                            board.js (scope switcher), mycatches.js (your list),
                            log.js (catch form), reconcile.js (auto-flush)
    station/                picker.js (modal + GPS), search.js (USGS by id/name)
    map/                    map.js (Leaflet), spots.js (spot save/load),
                            spots-map.js (spot-pick mode)
  data/
    regions/washington.js   the WA region registry (strict JSON; read by BOTH
                            JS frontend and api/water_report.py)
    tackle.json             measured tackle specs (density, drag, buoyancy)
    spot_widths.js          precomputed DEM cross-sections for each spot
    channel_measurements.js velocity/depth power-law fits per site
    river_widths.js         measured width at each gauge
    wdfw_rules.json         cached WDFW regulatory rules
    wdfw_forecasts.json     harvested WDFW hatchery escapement forecasts
  services/
    supabase.js             Supabase client: anonymous auth, catch writes,
                            public feed, favorite_spots, calibration RPC
    water.js                telemetry data layer: USGS WDFN, Open-Meteo,
                            WDFW Socrata escapement
  utils/regulations.js      WDFW regulations engine + local NOAA/Meeus solar calc
api/
  water_report.py           Python serverless function: /api/water_report (~1500 lines)
  streamstats.py            USGS StreamStats watershed geometry: /api/streamstats
  spot-geometry.py          Nearest DEM cross-section lookup: /api/spot-geometry
  nearby_stations.py        Server-side USGS gauge search: /api/nearby_stations
  report-issue.py           GitHub issue reporter: /api/report-issue
supabase/
  migrations/               16 idempotent schema + RLS migrations
  README.md                 how to link / push / verify
scripts/
  dev_server.py             local dev server (static + /api/* routing)
  tackle_csv_to_json.py     converter: tackle_measurements.csv → src/data/tackle.json
  session_instructions.py   instructions generator for MuPDF extraction
  scrape_wdfw.py            WDFW regulation scraper
  refresh_wdfw_forecast.py  forecast scraper
  smoke.sh                  live API contract smoke test
  check.sh                  quick syntax check
  tools/                    PDF-extraction helper scripts
```

### Script load order

`supabase-js` (CDN) → `data/regions/washington.js` → `utils/regulations.js` →
`services/*` → `shared/*` → `features/*` → **`app.js` last**.

`app.js` must load last: it wires `window.onload`, and the module graph above it
depends on being fully defined first. `sanity_pass.js` derives this list from
`index.html`, so a newly added file is automatically syntax- and HTTP-checked.

## Repo docs

| Where | What |
| --- | --- |
| `AGENTS.md` + `.clinerules` | working rules and the plan/act workflow |
| `docs/SYMBOLS.md` | file → public API index (find a function without opening files) |
| `docs/CONTRACT*.md` | API, region, technique, tackle and catch contracts |
| `docs/ARCHITECTURE.md` | tiered data architecture & fallback pattern |
| `docs/CHAIN_SOLVER.md` | unified chain-solver physics design & governing equations |
| `docs/MEASUREMENT_PROTOCOL.md` | tackle measurement protocols & CSV spec |
| `docs/LITERATURE.md` | the studies behind the environment model — thresholds + provenance |
| `docs/ROADMAP.md` | forward plan (Update 4.0) |
| `docs/ARCHIVE_UPDATE_3.0.md`, `docs/ARCHIVE.md`, `docs/CHANGELOG.md` | how the current code got here |


## Backend

`/api/water_report?site=&lat=&lon=` is a Python `BaseHTTPRequestHandler`
(`api/water_report.py`), which is the shape Vercel expects for a Python
serverless function — no `vercel.json` or adapter is required. **Vercel serves one
function per FILE**, so every route is its own entry point:
`api/nearby_stations.py` is the nearest-gauge lookup (it subclasses the same handler
and delegates, so there is only one implementation). A route that exists only as a
branch inside `water_report.py` answers under `scripts/dev_server.py` and 404s once
deployed. It aggregates
**USGS WDFN** (`api.waterdata.usgs.gov`; the legacy `waterservices` reader is a
fallback only, retired by USGS in Q1 2027), Open-Meteo and NOAA tides into a 4-day
forecast, typically in 4–6 s. Responses are memoised briefly and the endpoint is
rate-limited and coordinate-bounded (see `docs/ARCHIVE_UPDATE_3.0.md` §2.4).

The database is Supabase. Schema and RLS are managed as migrations in
`supabase/` — see [`supabase/README.md`](supabase/README.md) for how to apply
them.

## Data flow

- **Live telemetry** (`water.js`) is fetched concurrently via `Promise.all()` —
  CFS momentum, proxy water temperature and surface conditions are independent
  reads.
- **Strike zone** combines weather (barometer, cloud, rain, water temp, turbidity,
  light, and **tide** on a tide-paired reach) with *community sonar*: anonymised
  tackle telemetry from logged catches near the current flow, pulled from the
  `get_global_calibration()` RPC. The sonar matches a catch on the SAME variable set
  the sim uses (`envSignature()` — no wind, no moon), applies a **capped, silent** pull
  (no catch count / confidence is shown), and keeps a private **notebook** of its own
  residual error for later correction.
- **Unified chain solver** (`chain.js`): an RK4-based shooting-method ODE solver
  models the full rig from hook to rod tip. Concentrated elements (hook, bead,
  corky, weight) apply discrete buoyancy/drag/friction at their arc-length
  positions; the air segment above the waterline uses a closed-form catenary.
  Every simulation output is a pure function of the form inputs, so identical
  inputs always return identical numbers.
- **Offline-first writes**: a logged catch goes into a durable **IndexedDB outbox**
  (`src/features/catch-log/outbox.js`) first, then is pushed to Supabase. Each row carries
  a client-generated `clientId`, and the write is an upsert with `ignoreDuplicates`, so a
  retry after a response lost in a dead zone is **deduped instead of double-logging**.
  Rows that fail to reach the server are flagged `pendingSync` and retried on the next
  session. If IndexedDB is unavailable (private browsing) the outbox degrades to the
  legacy `localStorage` buffer rather than losing the catch.
- **Optimistic UI**: because the outbox is written *before* the network call, a just-logged
  catch is rendered straight from it (`src/features/catch-log/pending.js`) at the top of
  whichever scope is on screen, carrying a "Syncing..." badge. A confirmed flush re-renders,
  so the badge clears and the row comes from the server instead of the outbox. A pending row
  has no server id yet, so the private "Yours" scope withholds Edit/Delete until it lands.

## PWA

`sw.js` caches by request type:

| Request | Strategy |
| --- | --- |
| Navigations | network-first, falling back to the precached app shell |
| `/api/water_report` | network-first, with a **normalised cache key** (the app appends a `_t=<timestamp>` cache-buster that is stripped before caching, so offline replay hits) |
| Same-origin static assets | stale-while-revalidate |
| Supabase SDK (CDN) | stale-while-revalidate |
| USGS / Open-Meteo / Socrata | network only — live telemetry is never cached |

Updates are **tap-to-apply**, never automatic: an auto-reload would discard a
catch an angler was mid-way through logging.

## Local development

No build step.

`api/water_report.py` exposes only a `handler` class — it has no `__main__`
block, because Vercel's Python runtime supplies the server. To run the whole app
locally, use the dev server, which serves the repo statically and delegates
`/api/*` to that same handler class:

```bash
python3 scripts/dev_server.py 8000
```

Then open `http://localhost:8000/index.html`.

The dev server subclasses `api/water_report.handler` rather than constructing a
second `BaseHTTPRequestHandler`. Constructing a new handler re-runs `handle()`,
which reads a *new* request line off a socket that has already been consumed —
the request then blocks forever. Subclassing avoids that entirely.

Note that the API is genuinely slow (4–6 s): it fans out to USGS WDFN OGC API
(primary; legacy NWIS fallback, decommissioned Q1 2027), Open-Meteo and NOAA
tides on every call. The service worker caches the result, so repeat loads are
instant.

## Testing

31 hermetic tests across 4 files. All upstream APIs (USGS, NOAA, Open-Meteo) are
mocked — no live network calls run in CI.

| Test file | Scope | Count |
|---|---|---|
| `test_api_contract.py` | Schema-driven `/api/water_report` contract tests (JSON Schema + provenance envelope) | 5 |
| `test_physics_benchmarks_extended.py` | Analytical-solution benchmarks: terminal velocity, oblique drag, submerged density, air catenary continuity, boundary-layer shear | 5 |
| `test_physics_validation.py` | Physics unit validation + 10 chain-solver fuzz cases (negative depth, zero flow, buoyant corky, heavy tungsten, extreme leader length, etc.) | 15 |
| `test_ui_behavior.py` | Playwright behavioural: deep-link tab activation, switchTab toggle, toast stack rendering, empty-state rendering | 6 |

Run locally:
```bash
pip install -r requirements-dev.txt
python -m playwright install --with-deps chromium
python -m pytest tests/ -v --tb=short
```

### Static sanity pass

**`node sanity_pass.js`** — zero-dependency static checks only (no server, no DOM stub,
no HTTP). Exit 0 = all green:

- Syntax: `node --check` on every JS script + sw.js; `python3 -m py_compile` on API scripts
- Markup integrity: `label[for]` → `id` resolution, accessible names on all controls,
  script load order ends with `app.js`
- Service-worker parity: `sw.js` `SHELL_FILES` matches the `index.html` script list
- Doc index: `docs/SYMBOLS.md` covers every loaded module; all 4 contract docs present
- Tackle spec: `tackle_csv_to_json.py --check` validates measurement CSV integrity
- Source-level guards: nav-bar station presets, species/technique registries,
  HEAD navigation ↔ tab parity, API route integrity

### CI

Two GitHub Actions workflows run on push/PR to `main`:

| Workflow | Runs | Path-gated |
|---|---|---|
| **sanity.yml** | Full test suite + static sanity pass + dev-server leak check | All changes |
| **ci-physics.yml** | Physics validation + chain-solver fuzzing | `tests/**`, `requirements-dev.txt`, `.github/workflows/ci-physics.yml` |
