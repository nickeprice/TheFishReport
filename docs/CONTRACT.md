# API Contract — `/api/water_report`

Canonical field map for the per-day report object (one per forecast day, 4 days).
Read this instead of re-grepping `api/water_report.py` when wiring the frontend.
Verify against live output with `scripts/smoke.sh`.

> **Telemetry source (UPDATE 3.0 Phase 2.1):** USGS **WDFN OGC API**
> (`api.waterdata.usgs.gov/ogcapi/v1/…`, `/latest-continuous` + `/monitoring-locations`),
> no API key required. The legacy `waterservices.usgs.gov/nwis/iv` reader is kept as a
> fallback only — it is decommissioned in Q1 2027. WDFN ids carry a `USGS-` prefix
> internally; the `site_id` reported to the frontend stays unprefixed (`12101500`).

## Per-day object keys

| key | type | meaning | consumer (frontend) |
|---|---|---|---|
| `id`, `title`, `tag` | string | day slug / header / TODAY-TOMORROW-… | `app.js` card header |
| `peak` | number 0-100 | best window score this day | card peak display |
| `cfs` | int\|null | discharge (00060), null when absent | telemetry + catch log |
| `gage` | float\|null | gage height (00065) | telemetry |
| `water_temp_f` | float\|null | own-gauge 00010 only (deg F) | `.water-temp`; hidden when null |
| `turbidity_fnu` | float\|null | own-gauge 63680 only; NEVER invented | `.turbidity-val` |
| `flow_idx` | int 1-100 | speed index from `calculate_transit_time_and_flow` | env scoring |
| `pressure` | float\|null | current baro inHg | barometer pill + catch env |
| `press_delta` | float | current − 6h prior (inHg) | pressure-trend trigger |
| `rain` | float\|null | precip in inches (24h) | freshet trigger |
| `lunar_icon` | string\|null | emoji + phase name | moon pill + catch env |
| `cloud_pct` | number\|null | daily mean cloud % | twilight UV/overcast |
| `sunrise`/`sunset` | string | 12h display | twilight calc |
| `lines_in`/`lines_out` | string\|**null** | legal window (string) — **null** unless `legal_hours` is `daylight`/`24hr` | hero `legalHoursLabel()` |
| `legal_hours` | string | `daylight`\|`24hr`\|`custom`\|`unknown` — per-waterbody FACT from the region registry (UPDATE 3.0 Phase 1.5) | `legalHoursLabel()` |
| `moon_upper`/`moon_lower` | string\|"--" | tidal moon times | solunar |
| `net_status` | string | "NETS IN…" / "River Open…" — Puyallup/White/Carbon only | status display |
| `is_netting` | bool | `weekday ∈ NETTING_DAYS && site ∈ NETTING_SITES` | gates transit "BLOCKED" |
| `transit_state` | string | "High Velocity Push"/"Steady Migration"/"Bay Staging…"/"Bank Hugging…"/"RIVER CORKED" | MOVEMENT INDEX (2.1b) |
| `transit_time` | string\|"BLOCKED" | "15 to 17 hrs" etc (6.0 mi at modeled speed) | MOVEMENT INDEX (2.1b) |
| `tide_chart` | string | "High: 4:15 AM (11.2 ft) | Low: …" | tide pills fallback |
| `tide_curve` | array | extremes `{t, h, type:H|L}` (12h times) | `tideCurveSvg` labels |
| `tide_points` | array | ~240 hourly NOAA points `{t, h}` for THIS day | `tideCurveSvg` area curve |
| `species_calendar` | array | per-stock `{species, window_start, window_end, peak_date, days_until_peak, position(pre/peak/post/off), status_text, progress 0-1, peak_frac 0-1}` | run cards (2.1b) |
| `windows` | array | `{start, end, score, triggers, start_str, end_str}` | legal-hours timeline |
| `api_offline` | bool | USGS unreachable vs seasonal | empty-state |
| `is_active` | bool | fresh 00060/00065 <=24h | station active badge |
| `site_name`/`site_id` | string | station identity | header + GPS flow |

## Removed (do not resurrect)
- `active_fish` — fake Gaussian count; deleted in 2.1a. NEVER re-add (AGENTS.md no-fabricate).
- `push_status` — macro-env string, never a fish-moving label. Shipped for back-compat, but
  had **zero** consumers; removed 2026-09-28.
- `angler_desc` — "High (Weekend)" / "Low (Weekday)" label. Never consumed; removed 2026-09-28.
- `civil_in` / `civil_out` — legacy ±35 min twilight times. Superseded by `lines_in`/`lines_out`;
  removed 2026-09-28.
- `lines_in`/`lines_out` are **not** removed, but note they are `null` unless `legal_hours`
  is `daylight`/`24hr`.

## Private favourite spots (`public.favorite_spots`, WS-5)

The angler's own saved water. **Private by construction** — read the header of
`supabase/migrations/20260929190000_favorite_spots.sql` before touching it.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | client-generated (`newUuid()`), so a re-save of the same id is an EDIT, not a duplicate |
| `user_id` | uuid NOT NULL default `auth.uid()` | **never sent by the client** — `toSpotRow()` omits it so a payload cannot claim another angler's row |
| `label` | text NOT NULL | what the angler calls the spot; trimmed to 60 chars client-side |
| `station_id` | text\|null | the USGS gauge the spot is anchored to (the report endpoint needs a site id) |
| `river_name` | text\|null | display name of that gauge |
| `latitude`/`longitude` | double precision NOT NULL | the saved position (the GPS fix when available, else the active station) |
| `notes` | text\|null | optional, ≤240 chars |
| `created_at`/`updated_at` | timestamptz NOT NULL default `timezone('utc', now())` | `updated_at` is written by the client on each upsert |

Client payload -> row: `src/services/supabase.js` `toSpotRow()` / `saveFavoriteSpot()` /
`fetchFavoriteSpots()` / `deleteFavoriteSpot()`; the UI is
`src/features/map/spots.js` (+ `spots-map.js` for the Leaflet star layer). Tapping a saved
spot calls the same `selectPreset()` path as a preset, so "conditions at my spot tomorrow"
is answered by the per-day report.

**RLS (the whole point):** enabled in the same transaction as the table; one policy per
command, all `user_id = auth.uid()`. A signed-out visitor has a NULL `uid`, and
`user_id = NULL` is never true, so `select count(*) from public.favorite_spots where
user_id = auth.uid()` returns **0** without a JWT (verified live 2026-09-29). There is **no
view and no `SECURITY DEFINER` function** over this table, and `public_catch_feed` never
references it — there is no code path that can show one angler another's spots.

### A spot is a POINT, and its data comes from two places

A spot is a lat/lon the angler picked on the map (`map.js` `startSpotPick()`), NOT a gauge.
`station_id` is the **resolved** nearest gauge and may be null, and the coordinates are the
ANGLE the report is asked for:

| what | where it comes from |
|---|---|
| weather, cloud, wind, precip | Open-Meteo at the **spot's own lat/lon** (`/api/water_report?lat=&lon=`) |
| flow, species runs, legal windows, tides | the **resolved gauge** (`?site=<id>`), named in the row |
| nothing nearby | the point shows **no flow at all** — `site` omitted would silently default to the app's river, so it is never sent without one |

`resolveSpotStation(lat, lon, preferId)` → `/api/nearby_stations`; `pickNearestStation(list,
preferId)` is the pure rule: **the gauge already selected wins if it is in range, otherwise the
closest usable one** (a live probe at 47.09,-122.15 found South Prairie Creek, 33 CFS, 4.4 mi
away, with the Puyallup at Orting, 483 CFS, the same distance — nearest is not the same as
relevant). An entry with no coordinates is skipped; `{ ok: false }` means "could not ask" and is
kept distinct from "no gauge here".


Offline: the list falls back to a local mirror (`localStorage: favorite_spots_cache`) and
says so; **saving** needs a live session (no outbox for spots — they are planning data, not
a catch).


## Removed DB columns (2026-09-28 migration `drop_dead_columns`)
- `cast_distance_ft` — the placement-distance input was removed; the client hardcoded NULL.
- `hook_location` — always NULL (the client hardcoded NULL). Dropped for hygiene: it is
  spot-adjacent data that should not sit in the table unused.
- `corky_size` — dropped earlier; `foam` is the source of truth.
- The **`get_global_calibration` RPC was recreated** in the same migration (its
  `RETURNS TABLE` listed both columns). Its ACL (anon, authenticated, service_role) was
  re-issued and verified identical.

## Constants worth remembering
- `NETTING_DAYS = [6,0,1]` (Sun/Mon/Tue); `NETTING_SITES = {12101500, 12093500, 12094000}`
- Curated WA gauges: `nearbyStationIds` in `api/water_report.py` (~line 147)
- Defaults: `USGS_SITE=12101500`, `NOAA_STATION=9446484`, `LAT/LON = 47.1950/-122.3020`
