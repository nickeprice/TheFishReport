# Contract — Region Registry (`window.REGIONS`)

Canonical shape of the region/waterbody registry introduced in UPDATE 3.0 Phase 1.2.
Read this instead of re-grepping `api/water_report.py` or `index.html` for a station
constant. The registry is **data**, not behaviour: Phase 1.2 only authors it; the
backend (1.3) and frontend (1.4/1.5) are wired to read it afterwards.

## Load pattern

A **classic script** (one global scope), NOT JSON — JSON would force an async load into
the synchronous classic-script pipeline. Each state file self-registers:

```js
window.REGIONS = window.REGIONS || {};
window.REGIONS.WA = { /* ...state object... */ };
```

Loaded from `index.html` after the other `src/data/*` scripts and before the feature
modules; listed in `sw.js` `SHELL_FILES`.

## State object

| field | type | meaning |
|---|---|---|
| `state` | string | 2-letter code, e.g. `"WA"` |
| `state_name` | string | display name |
| `timezone` | string | IANA zone driving "today", legal hours, sunrise/sunset |
| `units` | `{flow, gage, temp}` | display units (`cfs`/`ft`/`F`) |
| `forecast_days` | int | forecast horizon (currently 4) |
| `default_site` | string | site id used when nothing is stored/selected |
| `default_coords` | `{lat, lon}` | coords paired with `default_site` |
| `default_tide_station` | string\|null | NOAA CO-OPS id used when a waterbody doesn't override |
| `default_species` | string[] | the species picker's option list for this state |
| `netting_days` | int[] | weekday numbers that can be netting days (0=Sun) |
| `discovery_pool` | `{site_id, name, coords}[]` | curated radial-discovery gauges — **temporary** |
| `waterbodies` | Waterbody[] | the user-facing rivers/lakes |

## Waterbody object

| field | type | meaning |
|---|---|---|
| `id` | string | slug, e.g. `"puyallup"` |
| `name` | string | display name, e.g. `"Puyallup River"` |
| `waterbody_type` | `"river"\|"lake"\|"coastal"` | drives which outlook model applies |
| `gauge` | `{site_id, param}` \| null | primary USGS gauge (`param` = `"00060"` discharge) |
| `related_gauges` | `{site_id, name, role}[]` \| null | secondary gauges on the same waterbody |
| `coords` | `{lat, lon}` \| null | null when the codebase has no verified coordinates |
| `tide_station` | string \| undefined | per-waterbody NOAA override (else `default_tide_station`) |
| `legal_hours` | `"daylight"\|"24hr"\|"custom"\|"unknown"` | fishing-hours rule |
| `netting_sites` | string[] \| null | gillnet sites on THIS waterbody (null = no netting) |
| `stocks` | `{species, peak_window, peak_date, avg_run}[]` \| null | run baselines (null = unknown) |
| `capabilities` | `{dam_clarity?: bool}` | optional feature flags |
| `no_telemetry` | bool | true when no gauge reports usable data |

### Enum notes

- `legal_hours: "unknown"` is the **honest default** — never invent a window. Phase 1.5
  resolves real values from the WDFW rules data (`unknown` renders "check regulations").
- `netting_sites` is a subset of the state's `netting_days` basin — only the
  Puyallup/White/Carbon basin has tribal gillnet sets; off-basin rivers must be `null`.
- `stocks` is `null` unless the baselines genuinely belong to that waterbody. Today only
  the Puyallup basin has `STOCK_BASELINES`.

## What the registry replaces (Phase 1.2 is data-only)

| Legacy constant | Location | Registry home |
|---|---|---|
| `USGS_SITE` | `api/water_report.py:12` | `WA.default_site` |
| `NOAA_STATION` | `api/water_report.py:13` | `WA.default_tide_station` |
| `LAT, LON` | `api/water_report.py:14` | `WA.default_coords` |
| `STOCK_BASELINES` | `api/water_report.py:16-20` | `waterbodies[puyallup].stocks` |
| `NETTING_DAYS` | `api/water_report.py:21` | `WA.netting_days` |
| `NETTING_SITES` | `api/water_report.py:24` | `waterbodies[*].netting_sites` |
| `nearbyStationIds` | `api/water_report.py:286` | `WA.discovery_pool` (until Phase 2) |
| transparency/gauge gate | `api/water_report.py:677` | `waterbodies[*].capabilities.dam_clarity` |
| legal-hours `±1h` | `api/water_report.py` report loop | `waterbodies[*].legal_hours` |
| preset buttons (coords+names) | `index.html:39-52` | `waterbodies[*]` / `discovery_pool` |
| species dropdown options | `index.html` (`#species`) | `WA.default_species` |
| `fallbackStation()` | `src/features/station/picker.js:41` | `WA.default_site` + `default_coords` |

## Rules

1. **Never fabricate** `legal_hours`, `stocks`, or `species` — use `null`/`"unknown"`.
2. `discovery_pool` is **temporary**; UPDATE 3.0 Phase 2 replaces it with USGS
   site-index (WDFN) discovery. Do not build new features on it.
3. Adding a river = adding a `waterbodies[]` entry (a data change), not a code change.
4. Adding a state = a new `src/data/regions/<state>.js` self-registering file.
