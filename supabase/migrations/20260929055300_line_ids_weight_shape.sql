-- 2026-09-29 — P4: record the PICKED tackle brand on each catch.
--
-- The Gear Sim line pickers now carry a `src/data/tackle.json` item id (e.g.
-- `fluoro-seaguar-sts-12`) instead of a material + lb pair, and the weight picker
-- carries the weight row's `shape_label`. Only the resolved material/lb pair survived
-- the write, so the BRAND — the thing that owns the measured line diameter, and through
-- it the drag term — was lost at log time.
--
-- THREE ADDITIVE, NULLABLE columns, ALONGSIDE the existing mat/lb columns:
--   mainline_line_id, leader_line_id  — tackle.json item id (`{material}-{brand}-{lb}`)
--   weight_shape                      — the weight row's derived `shape_label`
--
-- Additive on purpose: `mainline_mat`/`mainline_lb`/`leader_material`/`leader_lb` stay
-- the authoritative fallback for legacy readers (community sonar replays, `--check`
-- baselines) and old catches stay readable. NOT backfilled — a pre-P4 row has no brand
-- to recover, and inventing one would fabricate data.
--
-- NO foreign key: the tackle library is a static asset (`src/data/tackle.json`), not a
-- table, so there is nothing to reference. No index either — these are read per row,
-- never filtered on.
--
-- Privacy: unchanged. `public.catches` keeps RLS, and `public.public_catch_feed` lists
-- its four columns explicitly (name/time/river/fish), so nothing new reaches the public
-- board. The client write path is a separate step; these columns stay NULL until it
-- ships, and PostgREST would 400/PGRST204 on an unknown column, so the columns MUST
-- land before the client starts sending them.
--
-- Data-safe: additive, all nullable, no default, no table rewrite.
-- Idempotent: `add column if not exists` can be re-run.

alter table public.catches
    add column if not exists mainline_line_id text,
    add column if not exists leader_line_id  text,
    add column if not exists weight_shape    text;
