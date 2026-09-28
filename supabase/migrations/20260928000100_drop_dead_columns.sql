-- 2026-09-28 — UPDATE 3.0 cleanup: drop two always-NULL columns, and fix the RPC that
--              SELECTed them.
--
-- `cast_distance_ft` and `hook_location` have been written as NULL by every client since
-- the placement-distance input was removed (src/services/supabase.js hardcoded both to
-- null). Nothing in the app reads them, and `hook_location` is spot-adjacent data that
-- should not sit in the table unused.
--
-- `public.get_global_calibration` SELECTs both columns, so it is recreated without them.
-- A RETURNS TABLE signature cannot be altered in place (SQLSTATE 42P13), so this must be
-- drop + create — and dropping a function also drops its ACL, which is re-issued below
-- (verified live: the function was granted to anon, authenticated and service_role).
--
-- Data-safe: the single live row has NULL in both columns.
-- Idempotent: `drop function if exists` + `drop column if exists` can be re-run.
--
-- NOTE: `corky_size` was already dropped by an earlier migration and is NOT listed here.

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
    rod_ft text,
    water_temp_f numeric,
    wind_speed_mph numeric,
    wind_dir_compass text,
    moon_phase text
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
        c.rod_ft::text,
        c.water_temp_f,
        c.wind_speed_mph,
        c.wind_dir_compass,
        c.moon_phase
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

alter table public.catches
    drop column if exists cast_distance_ft,
    drop column if exists hook_location;
