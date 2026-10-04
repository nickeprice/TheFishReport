# Architecture — Tiered Data & Fallback Pattern

Phase 2.1 — this document defines the app's data architecture: every data path,
the tier (local / cached / online) it lives in, how the app degrades when a tier
fails, and the provenance shape that (Phase 2.3) all data producers will return.

> Status: Phase 2.1 (framework + pipeline reference). The exhaustive per-call-site
> audit table is appended in Phase 2.2 — see "Data Layer Audit" at the bottom.

---

## 1. The three tiers

Every data consumer in the app resolves through one of three tiers. Higher tiers
(online) give fresher data but fail under dead zones; lower tiers (bundled JSON,
IndexedDB) are what make the app earn its keep offline.

| Tier | Storage | Freshness | Failure behavior |
|------|---------|-----------|------------------|
| 0 — **Local / offline-first** | Classic-script data files + JSON beside the shell (`src/data/*`), `localStorage` prefs | Static (baked at build / deploy) | Never fails — the files ship with the app shell; a missing file is treated as "unmeasured" and the consumer degrades |
| 1 — **Cached** | IndexedDB (`idb.js`), the service-worker precache (`sw.js` SHELL_FILES), occasional `localStorage` mirrors | Seconds-to-days, written by the app itself | If the cache is empty the app falls to tier 0 or shows a named empty state — never a silent blank |
| 2 — **Own API (serverless)** | `api/*.py` → live USGS / NOAA / Open-Meteo fan-out, memoised 60 s in-process | Minutes (report TTL) | The endpoint replies 200 with a degraded payload or a named error; the frontend duplicates NOTHING the server answers |
| 3 — **Live upstream (client-direct)** | Direct `fetch()` from the browser to USGS / Supabase / WDFW | Live | Each consumer has its own retry + honest wording (see §4) |

**Rule:** a higher tier may never silently masquerade as a lower one. `api_offline`,
`is_active`, `source`, and the error `note` exist so the user can always tell "live",
"cached", and "estimate" apart.

---

## 2. App shell + offline story

- `index.html` loads every classic script in one scope; `src/app.js` is LAST and
  owns only `window.onload` bootstrap.
- `sw.js` precaches `SHELL_FILES` — every local script, the stylesheet, `index.html`,
  `manifest.json`, icons, and `src/data/*` — so the whole tool launches from cache.
- `src/shared/pwa.js` registers the worker and handles `?tab=` deep links (they
  must work offline too — the tabs switch with zero network).
- The CDN-hosted Supabase JS is the one non-shell script; auth simply degrades when
  the network is gone.

Because the shell includes `src/data/*`, tier-0 assets are precached by definition.

---

## 3. Data domains & pipeline reference

### 3.1 Telemetry & water report (flow / gage / temp / turbidity / weather)

```
client: src/features/telemetry/report.js
  └─ fetch('/api/water_report?site=&lat=&lon=')     [tier 2]
        api/water_report.py
          ├─ USGS WDFN OGC API  (primary; api.waterdata.usgs.gov/ogcapi/v1)
          │      latest-continuous + monitoring-locations      [tier 3 upstream]
          ├─ USGS NWIS /iv      (legacy fallback — decommissioned Q1 2027)
          ├─ Open-Meteo         (pressure, precip, cloud, solar, uv, sunrise/set)
          ├─ NOAA CO-OPS mdapi  (tide predictions + station list)
          ├─ src/data/channel_measurements.js  (velocity/depth power-law fits)
          ├─ src/data/river_widths.js          (gauge width_ft)
          └─ src/data/regions/washington.js    (legal hours, species stocks, netting)
        → 4 day-rows; each carries api_offline / is_active / updated_time
```

- The report is fan-out-heavy, so the backend memoises a capped LRU cache for 60 s.
- **Degrades to:** Gear Sim still solves on the flow the angler types. Auto-refresh
  starts once `online`, and stops when offline.

### 3.2 Hydraulic geometry (spot velocity / depth)

```
client: src/features/gear-sim/continuity.js
  ├─ src/data/spot_widths.js        (window.SPOT_WIDTHS — DEM cross-sections)  [t0]
  ├─ src/data/channel_measurements.js (depthAtGauge / velocity fits)            [t0]
  ├─ src/data/river_widths.js        (gauge widths for Manning ratio)           [t0]
  ├─ api/spot-geometry.py            (server mirror for the map/GPS)            [t2]
  └─ api/streamstats.py              (basin characteristics — live or offline)  [t2]
```

- Velocity/depth already return `{ value, bandLow, bandHigh, source, uncertainty }`
  (the Phase 2.3 pioneer). `ratio: 1.0` no longer exists — Manning exponents are
  hard-coded in continuity.js.
- **Degrades to:** unmeasured → `value: null` (never a placeholder number); water
  type multipliers still apply.

### 3.3 Tides & solunar

- Server-rendered in each report day (`tide_curve`, `tide_points`, `moon_upper/lower`)
  from NOAA. [tier 2 → tier 3 upstream]
- `src/features/telemetry/tide.js` has a local Meeus calculation as the offline
  fallback — a legal-hours/moon estimate when NOAA cannot be reached.
- **Degrades to:** local lunar calc + an honestly-labelled estimate.

### 3.4 Species calendar & escapement

- The species calendar ships **server-rendered** in the report from the region
  registry + WDFW forecast JSON (`src/data/`). [tier 2 / t0]
- Escapement counts: WDFW Socrata feed fetched by `src/services/water.js`
  (`loadEscapementData`) — client-direct. [tier 3]
- **Degrades to:** "—" per card when the feed is unreachable; a freshness stamp
  reports the true WDFW `:updated_at` or an honest "no stamp" wording (never a
### 3.5 Legal hours & regulations

- Legal hours are a per-waterbody FACT from `src/data/regions/washington.js`
  (`daylight | 24hr | custom | unknown`) — the backend reads the SAME file the
  frontend loads. [t0]
- `src/utils/regulations.js` fetches `src/data/wdfw_rules.json` (bundled); cached
  in-memory after first load. [t0]
- **Degrades to:** "not verified — check the regulations" for `unknown`.

### 3.6 StreamStats basin characteristics (Phase 1.9)

- `api/streamstats.py` → USGS `delineateByLatLon` (best-effort). [t2 → t3]
- Offline fallback: pinned gauge drainage areas, nearest 3DEP `thalweg_m`, an
  elevation-lapse precip model — every metric carries `{ value, source, uncertainty }`.
- `src/services/water.js::fetchStreamStats(lat, lon, siteId)` consumes it. [t2]
- **Degrades to:** `mode: "offline"` with a `note` + wide uncertainty bands.

### 3.7 Station picker / GPS ("Use My GPS")

- `src/features/station/picker.js` + `map.js` + `spots.js` → `/api/nearby_stations`.
- Backend: WDFN monitoring-locations finder; falls back to the registry's curated
  `discovery_pool`. [t2 → t3 / t0]
- `src/features/station/search.js` talks **directly** to WDFN for id/name search. [t3]
- **Degrades to:** retry once (cold-tunnel HTML fix); distinct wording for
  "could not reach the gauge lookup" vs "no gauges here".

### 3.8 Catch log (offline-first writes)

```
write path: src/features/catch-log/log.js → outbox (IndexedDB `catches` store,
            localStorage `catch_db` fallback) → flush to Supabase `public.catches`
read path:  board.js / mycatches.js → Supabase; pending.js paints optimistic rows
            with a "Syncing…" badge until the flush confirms
```

- This is the model offline-first write in the app: durable, deduped by
  `clientId`, idempotent (`ON CONFLICT (id) DO NOTHING`). [t1 + t3]
- **Degrades to:** rows stay in the outbox with a pending badge; `online` /
  `visibilitychange` reconcile flush them. No outbox → no catch lost, no fake row.

### 3.9 Favorite spots & map

- `src/services/supabase.js` → `favorite_spots` (RLS: owner-only). [t3]
- `localStorage: favorite_spots_cache` mirrors the list for offline map reading. [t1]
- **Degrades to:** the cache + a "saved spots may be stale" tint; saving needs a
  live session (spots are planning data, no outbox).

### 3.10 Auth

- Anonymous guest session via Supabase (`src/features/auth/auth.js`); guest name in
  `localStorage`. [t3 + t1]
- **Degrades to:** fully signed-out behaviour (public board only) — never a crash.

### 3.11 Gear Sim stored rig + community sonar

- Rig prefs persist in `localStorage` (`restoreRig` / `saveRig`); tackle library is
  the bundled `tackle.json`. [t0]
- Community sonar pulls recent public catches through the catch-log path; its
  baselines are frozen locally so simulation stays deterministic offline. [t1/t0]

---

## 4. Degradation & wording policy

1. **Never fabricate.** No invented discharge, temp, species count, or window.
   `null` / `"--"` / "no data" are all legal renders; invented numbers are not.
2. **Keep "could not ask" distinct from "the data says no".** `apiGetJson()` returns
   `ok:false` for *network* failures and the server's own message for 4xx finals.
3. **Name the cause in the UI.** Empty states, toasts and map errors say
   "Telemetry Offline", "Could not reach the gauge lookup", etc. — not "no fish".
4. **Refresh on recovery.** Auto-refresh resumes on `online`; the outbox flushes on
   `online` / `visibilitychange`; nothing reloads the page silently (tap-to-apply SW
   updates) so a half-typed catch is never discarded.

---

## 5. Provenance shape (Phase 2.3 target)

Every data producer should eventually return:

```js
{ value: number | null,
  source: string,                     // "usgs-streamstats live delineation",
                                     //  "offline-estimate: ...", etc.
  uncertainty: number | null }        // fractional ± band; null = exact/unknown
```

Implemented today: `continuity.js` (velocity/depth as `{value, bandLow, bandHigh,
source, uncertainty}`), `api/streamstats.py` (area/elevation/precip). Remaining to
convert: telemetry scalars, weather fields, tides, species calendar (Phase 2.3).

---

## Data Layer Audit (Phase 2.2)

Complete call-site inventory of network + storage touchpoints. Tiers:
**T0** local/offline-first · **T1** cached · **T2** own API (serverless) ·
**T3** live upstream (server-side or client-direct).

### A. Frontend → own API (Tier 2)

| Call site | Domain | Reads | Tier | Notes / gaps |
|---|---|---|---|---|
| `src/features/telemetry/report.js:47` | telemetry, weather, tides, species | GET `/api/water_report` | T2 | SW `API_CACHE` serves it offline after a prior online fetch; **no durable IDB snapshot** |
| `src/features/station/picker.js:81` | station discovery | GET `/api/nearby_stations` | T2 | 2 attempts, abort timeout |
| `src/features/map/map.js:130` | station discovery | GET `/api/nearby_stations` | T2 | via `apiGetJson` (1 retry) |
| `src/features/map/spots.js:189` | spot station resolution | GET `/api/nearby_stations` | T2 | via `apiGetJson` |
| `src/shared/api.js:80` | generic | GET any `/api/*` | T2 | retry + 12 s timeout wrapper |
| `src/services/water.js:475` | basin characteristics | GET `/api/streamstats` | T2→T3 | offline mode + `{value,source,uncertainty}` |
| `src/shared/debug.js:70` | diagnostics | POST `/api/report-issue` | T2 | GitHub issue proxy |

### B. Own API → live upstream (Tier 3, server-side)

| Call site | Domain | Reads | Tier | Notes |
|---|---|---|---|---|
| `api/water_report.py:320` | telemetry | USGS WDFN OGC `_wdfn_get` | T3 | primary |
| `api/water_report.py:451` | telemetry | USGS NWIS `/iv` | T3 | legacy fallback (decommissioned Q1 2027) |
| `api/water_report.py:595,846` | site name / clarity | WDFN monitoring-locations + `/daily` | T3 | own-gauge only |
| `api/water_report.py:917` | tides | NOAA CO-OPS stations | T3 | |
| `api/water_report.py:1014` | tides | NOAA CO-OPS predictions | T3 | |
| `api/water_report.py:1039` | weather | Open-Meteo | T3 | |
| `api/streamstats.py:167` | basin | USGS StreamStats `delineateByLatLon` | T3 | **host currently 404s → offline path** |
| `api/report-issue.py:93` | diagnostics | GitHub API | T3 | |
| `api/spot-geometry.py` | hydraulic geometry | none — reads local data only | T0 | endpoint mirrors client SPOT_WIDTHS; no live consumer yet |
### C. Frontend → live upstream (Tier 3, client-direct)

| Call site | Domain | Reads | Tier | Notes / gaps |
|---|---|---|---|---|
| `src/services/water.js:25` | telemetry momentum | USGS WDFN `/continuous` | T3 | **no cache** |
| `src/services/water.js:38` | telemetry momentum | USGS NWIS `/iv` legacy | T3 | fallback reader |
| `src/services/water.js:285` | escapement | WDFW Socrata `9q4e-xhag` | T3 | **no cache**; cards show "—" offline |
| `src/features/station/search.js:60,81,93` | station search | WDFN monitoring-locations + latest | T3 | **no cache**; retry only |
| `src/services/supabase.js` (board, mycatches, auth, spots) | auth, catches, favorite spots | Supabase REST via supabase-js | T3 | reads online-only; writes outbox-protected |

### D. Local / static (Tier 0)

| Call site | What | Domain | Notes |
|---|---|---|---|
| `src/data/*.js` classic scripts | regions, channel_measurements, river_widths, spot_widths | all domains | precached in SW shell |
| `src/utils/regulations.js:120` | `src/data/wdfw_rules.json` | legal hours / regs | bundled JSON |
| `src/shared/tackle.js:353` | `src/data/tackle.json` | gear sim | bundled JSON |
| `src/services/water.js:403` | `src/data/wdfw_forecasts.json` | species / escapement | bundled JSON |
| `continuity.js` + `tide.js` | Manning/continuity + Meeus algorithms | hydraulic geometry, legal hours | pure compute, zero network |

### E. Cached (Tier 1)

| Key / store | Domain | Written by | Notes |
|---|---|---|---|
| IndexedDB `catches` | catch log | `outbox.js` | durable; localStorage fallback |
| `localStorage 'catch_db'` (`LEGACY_CATCH_KEY`) | catch log | `outbox.js` | legacy buffer |
| `localStorage 'active_station'` | station | picker, report, log, app | read across 7 modules |
| `localStorage RIG_STORE_KEY` | gear sim | `rig.js` | stored rig |
| `localStorage favorite_spots_cache` (`SPOTS_CACHE_KEY`) | map | `spots.js` | offline star layer |
| `localStorage GUEST_NAME_KEY` | auth | `supabase.js` | guest identity |
| sw.js `SHELL_CACHE` | app shell | install | precache of shell + data |
| sw.js `API_CACHE` | `/api/*` | fetch handler | stale-while-revalidate |
| sw.js `ASSET_CACHE` | static assets | fetch handler | runtime asset cache |

### F. Critical online-only gaps (should be cached)

| # | Gap | Impact | Suggested fix |
|---|---|---|---|
| G1 | **Water report has no durable offline snapshot** — only sw.js `API_CACHE` (requires an earlier online fetch in the same browser profile) | Cold offline open shows an empty state with no last-known conditions | Persist the latest per-waterbody report day-rows to a new IndexedDB `telemetry` store on each successful fetch; hydrate from it on cold offline start (idb.js already documents this intent) |
| G2 | **Escapement feed (WDFW Socrata) is client-direct online-only** | Run cards show "—" in dead zones; planning data lost | Cache last-known stats per site in IDB, stamp with WDFW `:updated_at` |
| G3 | **Station search (WDFN direct) is online-only** | Manual gauge search fails offline | Small localStorage cache of the recent/known station list |
| G4 | **CFS momentum readings (WDFN direct) are online-only** | Momentum calc unavailable offline | Persist the last short window of readings per site |
| G5 | **Supabase reads (board / my catches) are online-only** | Board + private list empty offline (writes are already safe via outbox) | Last-known read-through cache per scope, cleared on successful refresh |

**Priorities:** G1 is the only high-impact gap — it is exactly the "dead zone
where this app is supposed to earn its keep" case. G2–G5 are medium and can be
folded into the same Phase 2.3 "provenance + cache" work (each cached value
carries its fetch time as `source`).
  fake date).