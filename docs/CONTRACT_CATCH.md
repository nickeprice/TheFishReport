# Contract — catch payload → `public.catches`

The one place the catch write path is defined. `toCatchRow(payload)` in
`src/services/supabase.js` is the only translation layer; `insertCatch()` is the only writer.

**Verify against the live table** (read-only):

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'catches' order by ordinal_position;
```

> Columns below were confirmed against the live DB on 2026-09-29, after migrations
> `20260928000100_drop_dead_columns`, `20260928235500_drop_rod_ft` and
> `20260929055300_line_ids_weight_shape`.

## Payload → column map

| payload key | column | notes |
| --- | --- | --- |
| `clientId` | `id` (uuid, PK) | **client-generated** — makes the write idempotent |
| `user_id` | `user_id` (uuid, NOT NULL) | auth uuid; defaults server-side |
| `name` | `angler_name` | |
| `time` | `catch_time` (timestamptz) | parsed to ISO; invalid → now |
| `flow` | `flow` (int) | CFS at log time |
| `spc` | `species` (text, NOT NULL) | |
| `river` | `river_name` | coarse name from `deriveRiverName()` — **never coordinates** |
| `gps` (`"lat,lon"`) | `latitude`, `longitude` | `"Denied"`/unparseable → both NULL |
| `weight` | `weight` (numeric) | |
| `ldLen` / `ldMat` / `ldLb` | `leader_length`, `leader_material`, `leader_lb` | |
| `hook` | `hook_size` (int) | coerced via `Number()` |
| `yarn` | `yarn` | |
| `foam` | `foam` | source of truth for corky size (`corky_size` was dropped) |
| `foam2` | `foam_2` | second float |
| `bdMat` / `bdSz` | `bead_material`, `bead_size` | |
| `mlMat` / `mlLb` | `mainline_mat`, `mainline_lb` | |
| `gauge` | `gauge_height` | |
| `barometer` | `barometer` | |
| `waterTemp` | `water_temp_f` | |
| `windSpeed` / `windDir` | `wind_speed_mph`, `wind_dir_compass` | |
| `moon` | `moon_phase` | |
| `hgt` | `line_height_in` | Gear Sim presentation height |
| `zoneMin` / `zoneMax` | `zone_min_in`, `zone_max_in` | strike zone at log time |
| `score` | `sim_score` | |

**Server-side columns never written by the client:** `created_at` (default) and `bd_mat` /
`bd_sz` (legacy duplicates of `bead_material` / `bead_size` — do not add new readers).

## The picked brand (P4/P4b, migration `20260929055300_line_ids_weight_shape`)

Three **nullable text** columns sit **alongside** the mat/lb pair — the pair stays the authoritative
fallback for legacy readers and old catches stay readable. No backfill: a pre-P4 row has no brand to
recover, and inventing one would fabricate data. No FK and no index: the library is a static asset
(`src/data/tackle.json`), not a table, and these are read per row, never filtered on.

| payload key | column | value |
| --- | --- | --- |
| `mlLine` | `mainline_line_id` | `src/data/tackle.json` item id, e.g. `fluoro-seaguar-sts-12` |
| `ldLine` | `leader_line_id` | same library, leader role |
| `weightShape` | `weight_shape` | the weight row's `shape_label`, e.g. `Lead Pencil (rubber sleeve)` |

`logData()` sends all three from the pickers, and `toCatchRow()` maps an absent id to **NULL, never
`''`** — an installed client older than P4b sends none, and every reader must tolerate that.
Direction matters: the columns MUST exist before the client writes them, because PostgREST rejects
an unknown column (400 / PGRST204). Verified live that the REST surface resolves them:
`GET /rest/v1/catches?select=mainline_line_id,leader_line_id,weight_shape` → 200 `[]` (RLS hides
other users' rows).

**Readers.** `communitySonar()` resolves each line with `tackleRowLine(row, role)` — brand id first
(it owns the measured diameter, which is what the drag term needs), material + lb as the fallback.
`fetchGlobalCalibration()` already passes the ids through if the RPC ever returns them.

**Deliberately NOT done: `get_global_calibration` does not return the ids yet.** It is
`SECURITY DEFINER` and anon-executable, so adding brand-level tackle detail widens an anon-readable
surface — and the entire community path is gated off anyway (`communitySonar()` skips every row
whose `loc !== 'Fair'`, and nothing populates that field; see `docs/ROADMAP.md` §3.2). Widening the
RPC before that gate is decided would change nothing for an angler. Revisit as ONE decision.

## Idempotency (Phase 3.2)

`insertCatch()` upserts with `{ onConflict: 'id', ignoreDuplicates: true }`. A retry after a
response lost in a dead zone conflicts on the primary key and is **discarded**, not
duplicated. **No migration was required** — `PRIMARY KEY (id)` already existed.

An empty `select('id')` result means the row was already stored: that is the intended
retry outcome, so it is reported as success (`deduped: true`) rather than retried forever.

## Privacy boundary (do not weaken)

- `public.catches` has **RLS**; a client only ever reads its own rows.
- The public board reads `public_catch_feed`, which is location-free by construction.
- GPS, reach and tackle details are private in every tier — see
  `memory-bank/productContext.md`.

## Removed columns (do not resurrect)

| column | why |
| --- | --- |
| `corky_size` | superseded by `foam` |
| `cast_distance_ft` | placement-distance input removed; client wrote NULL |
| `hook_location` | always NULL; spot-adjacent data that should not sit unused |

Dropping the last two also required recreating `get_global_calibration` (its `RETURNS TABLE`
listed them); see `supabase/migrations/20260928000100_drop_dead_columns.sql`.
