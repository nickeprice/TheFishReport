-- 2026-09-30 — Community-sonar environment snapshot + the notebook (residual) columns.
--
-- WHY: the Gear Sim and the community sonar were two different brains. The sim places the
-- strike zone from temperature / light / cloud / turbidity / barometric trend / rain (+ tide
-- on a tidal reach); the sonar matched catches on temperature / wind / moon. Wind and moon do
-- not move where a river fish holds vertically, so weighting them like temperature diluted the
-- one signal that matters. This migration gives the sonar the SAME variable set the sim uses,
-- so the two work hand in hand.
--
-- It also stores the "notebook": `line_height_in` (where the fish was caught) and
-- `zone_min_in`/`zone_max_in` (what the model predicted at that moment). The notebook's
-- residual = line_height_in - (zone_min_in + zone_max_in)/2 is DERIVED, never stored, so it
-- cannot drift. `get_global_calibration` returns all of it so the client can compute residuals.
--
-- DEPLOY ORDER: apply this migration BEFORE the client that writes the new columns lands.
-- PostgREST rejects an unknown column with 400/PGRST204, so the new client must not send
-- `cloud_pct`/`rain_in`/... until the columns exist.
--
-- Preserves RLS on public.catches and the intentional SECURITY DEFINER contract of
-- get_global_calibration. Idempotent: `add column if not exists` + drop/create the function.

alter table public.catches
    add column if not exists cloud_pct       numeric,
    add column if not exists rain_in         numeric,
    add column if not exists turbidity_fnu   numeric,
    add column if not exists barometer_delta numeric,
    add column if not exists tide_stage_ft   numeric,
    add column if not exists tide_trend      text,
    add column if not exists light_shift     numeric;

-- A RETURNS TABLE signature cannot be altered in place (SQLSTATE 42P13), so drop + create.
-- Dropping a function also drops its ACL, which is re-issued below.
drop function if exists public.get_global_calibration(integer, text);

create function public.get_global_calibration(p_flow integer, p_species text)
returns table (
    flow integer,
    species text,
    leader_length text,
    leader_material text,
    leader_lb text,
    mainline_mat text,
    mainline_lb text,
    weight text,
    hook_size text,
    yarn text,
    foam text,
    bead_material text,
    bead_size text,
    water_temp_f numeric,
    cloud_pct numeric,
    rain_in numeric,
    turbidity_fnu numeric,
    barometer_delta numeric,
    tide_stage_ft numeric,
    tide_trend text,
    light_shift numeric,
    line_height_in numeric,
    zone_min_in numeric,
    zone_max_in numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
    select
        c.flow::integer,
        c.species::text,
        c.leader_length::text,
        c.leader_material::text,
        c.leader_lb::text,
        c.mainline_mat::text,
        c.mainline_lb::text,
        c.weight::text,
        c.hook_size::text,
        c.yarn::text,
        c.foam::text,
        c.bead_material::text,
        c.bead_size::text,
        c.water_temp_f,
        c.cloud_pct,
        c.rain_in,
        c.turbidity_fnu,
        c.barometer_delta,
        c.tide_stage_ft,
        c.tide_trend,
        c.light_shift,
        c.line_height_in,
        c.zone_min_in,
        c.zone_max_in
    from public.catches c
    where c.leader_length is not null
      and c.flow is not null
      and abs(c.flow - p_flow) <= 300
      and (p_species is null or c.species = p_species)
    -- Deterministic newest-first so the app's 8-sample window is stable run-to-run.
    order by c.catch_time desc nulls last, c.id desc
    limit 500;
$function$;

grant execute on function public.get_global_calibration(integer, text)
    to anon, authenticated, service_role;
