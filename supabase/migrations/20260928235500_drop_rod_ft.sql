-- 2026-09-28 — Drop `public.catches.rod_ft`, and recreate the RPC that returned it.
--
-- Rod length is inert to the Gear Sim. Measured, not assumed: the drift technique was
-- run at 9'0" / 9'8" / 12'0" and every output compared (24 scalar fields) — hgt, score,
-- dragPerFt, lift, bottom/true velocity and the strike zone are identical to the last
-- digit. The field was only echoed in a suggestion sentence, yet it was REQUIRED and
-- blocked both the sim and catch logging while contributing nothing to the physics.
--
-- `public.get_global_calibration` SELECTs the column, so it is recreated without it.
-- A RETURNS TABLE signature cannot be altered in place (SQLSTATE 42P13), so this must be
-- drop + create — and dropping a function also drops its ACL, which is re-issued below
-- (verified live: granted to anon, authenticated and service_role).
--
-- Deploy order matters: the client must stop sending `rodFt` BEFORE this lands, because
-- PostgREST rejects an unknown column with 400/PGRST204. src/services/supabase.js no
-- longer maps it in the same change, so the old client is the only residual risk — the
-- value it would send is discarded by the column drop, not by this function.
--
-- Data-safe: rod_ft carried no analytic weight and the calibration view never used it.
-- Idempotent: `drop function if exists` + `drop column if exists` can be re-run.

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
    drop column if exists rod_ft;
