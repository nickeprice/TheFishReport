# The Fish Report

A mobile-first fishing companion for Washington's Puyallup / White / Carbon /
Green / Nisqually rivers. Three tools in one shell:

1. **Water Report** — live USGS flow, barometer, tides, solunar, hatchery
   escapement, fishing-window scoring and WDFW legal hours.
2. **Gear Sim** — a deterministic fluid-dynamics engine that solves your rig
   against today's strike zone.
3. **Catch Log** — private catch records with a four-column public Brag Board.

Installable as a PWA and usable offline from a cached app shell.

## Architecture

Plain static frontend — no build step, no bundler, no framework. All scripts are
classic (non-module) scripts sharing one global scope, loaded in dependency
order at the end of `<body>`.

```
index.html                  markup only (tabs, forms, ARIA labels, script tags)
manifest.json               PWA manifest (icons, shortcuts, theme)
sw.js                       service worker (offline + caching strategy)
icons/                      generated app icons (any + maskable)
src/
  styles.css                all styling, incl. toasts / empty states / focus rings
  app.js                    BOOTSTRAP ONLY (33 lines): window.onload + the outbox load
  shared/                   reusable primitives (classic scripts, one global scope)
    debug.js                logDebug + the double-tap debug matrix
    ui.js                   debounce + the toast stack
    nav.js                  switchTab / resetToToday
    format.js               feed-row normalise, time format, escaping, newUuid
    forms.js                line/material/field sync (shared by BOTH tabs)
    idb.js                  tiny promise wrapper over IndexedDB
    refresh.js / pwa.js     auto-refresh; service-worker registration + deep links
  features/
    auth/                   anonymous guest session + pending-catch flush
    telemetry/              tide, hero, day-nav, the water-report pipeline
    gear-sim/               inputs, physics (Cd locked 1.0), sonar, zone, rig,
                            solver, sim, techniques/drift.js, registry
    catch-log/              outbox (durable), pending (optimistic rows),
                            board, mycatches, log
    station/                picker (modal/GPS) + search (USGS by id/name)
    map/                    Leaflet station map (lazy-loaded enhancement)
  data/
    regions/washington.js   the WA region registry (strict JSON payload; read by
                            BOTH the frontend and api/water_report.py)
    wdfw_rules.json         fetched WDFW rules cache
  services/
    supabase.js             Supabase client: anonymous auth, catch writes,
                            public feed, calibration RPC
    water.js                telemetry data layer: USGS WDFN, Open-Meteo,
                            WDFW Socrata escapement
  utils/regulations.js      WDFW regulations engine + local NOAA/Meeus solar calc
api/
  water_report.py           Python serverless function: /api/water_report
supabase/
  migrations/               idempotent schema + RLS migrations
  README.md                 how to link / push / verify
scripts/                    dev_server.py, scrape_wdfw.py, refresh_wdfw_forecast.py
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
| `memory-bank/` | the six-file front page — project brief, product context, **current work focus**, system patterns, tech context, progress |
| `AGENTS.md` + `.clinerules` | working rules and the plan/act workflow |
| `docs/SYMBOLS.md` | file → public API index (find a function without opening files) |
| `docs/CONTRACT*.md` | API, region, technique and catch contracts |
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
- **Strike zone** combines weather (barometer, cloud, rain, water temp) with
  *community sonar*: anonymised tackle telemetry from logged catches near the
  current flow, pulled from the `get_global_calibration()` RPC.
- **Physics is locked** at drag coefficient 1.0. Every simulation output is a
  pure function of the form inputs plus the catch log, so identical inputs
  always return identical numbers.
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

Note that the API is genuinely slow (4–6 s): it fans out to USGS NWIS,
Open-Meteo and NOAA tides on every call. The service worker caches the result,
so repeat loads are instant.

## Testing

There is no committed test runner; the codebase is validated by:

- `find src -name '*.js' -print0 | xargs -0 -n1 node --check` and `node --check sw.js` (syntax).
- `python3 -m py_compile api/water_report.py scripts/dev_server.py scripts/scrape_wdfw.py`.
- **`node sanity_pass.js`** — a zero-dependency sanity pass that starts the dev server
  and checks (exit 0 = all green):
  - `label[for]` / accessible-name integrity against the markup + classic script order.
  - HTTP: static assets serve 200 with correct content types; `/api/water_report`
    returns 4 report days incl. `tide_curve` + `species_calendar`.
  - Behavior (real `app.js` functions in a DOM-stubbed Node context): debounce
    collapses a burst, toast renders in a `role=status` stack, `?tab=` deep links
    activate the target tab, `switchTab` toggles `tab-active`, and the water-report
    empty state renders.

Run it with `node sanity_pass.js` (it picks a free port and cleans up after itself).

A CI workflow (`.github/workflows/sanity.yml`) runs `node sanity_pass.js` on every
push/PR to `main` (and on manual `workflow_dispatch`). It needs no install step — the
pass is plain Node + Python, both preinstalled on GitHub Actions runners. It also
asserts the pass leaves no dev-server process behind.
