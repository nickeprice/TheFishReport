-- ============================================================================
-- 2026-09-29 — WS-5 (issue #3b): PRIVATE favourite fishing spots.
--
-- The angler can save the spot they are standing on ("Blue Creek run"), then open
-- the app days later and see what the water is doing THERE, without publishing the
-- spot to anybody. Issue #3 asks for exactly that: the saved location is private.
--
-- WHY A SEPARATE TABLE (not a column on `catches`): a spot is PLANNING data that
-- exists with no catch attached, and it is reused across many trips, so it cannot
-- hang off a catch row. It also must never be reachable by the public board.
--
-- PRIVACY CONTRACT (AGENTS.md: GPS + auth ids never public):
--   * RLS is enabled in the SAME transaction as the CREATE TABLE. Without it the
--     table would be world-readable through the Data API, because anon/authenticated
--     hold the grants below — RLS is the ONLY thing protecting these coordinates.
--   * ONE policy per command, every one scoped to `user_id = auth.uid()`. Because
--     `auth.uid()` is NULL for a signed-out visitor and `user_id = NULL` is never
--     true, an anonymous session reads and writes NOTHING here.
--   * `user_id` defaults to `auth.uid()` and is NEVER sent by the client, so a
--     payload cannot claim somebody else's identity (see `toSpotRow()`).
--   * There is deliberately NO view and NO SECURITY DEFINER function over this
--     table, and nothing in `public_catch_feed` touches it: there is no code path
--     that can expose one angler's spots to another.
--
-- Data-safe: a brand-new table, so nothing existing is rewritten or dropped.
-- Idempotent: `if not exists` / `drop policy if exists` can be re-run.
-- ============================================================================

create table if not exists public.favorite_spots (
    id          uuid             not null default gen_random_uuid(),
    user_id     uuid             not null default auth.uid(),
    label       text             not null,
    -- The USGS gauge this spot belongs to. A spot is always saved from the active
    -- station, and the report endpoint needs a site id, so it is the anchor for
    -- "what are the conditions at my spot". Nullable only so a row stays readable
    -- if a gauge is ever retired upstream.
    station_id  text,
    river_name  text,
    latitude    double precision not null,
    longitude   double precision not null,
    notes       text,
    created_at  timestamptz      not null default timezone('utc', now()),
    -- Touched by the client on upsert (an edit keeps the same id).
    updated_at  timestamptz      not null default timezone('utc', now()),
    constraint favorite_spots_pkey primary key (id)
);

-- Every read is "my spots", so the policy's predicate is the index.
create index if not exists favorite_spots_user_idx
    on public.favorite_spots using btree (user_id);

alter table public.favorite_spots enable row level security;

-- One canonical policy per command, owner-scoped. Drop first so a re-run cannot
-- collide with an existing policy of the same name.
drop policy if exists "favorite_spots_select_own" on public.favorite_spots;
drop policy if exists "favorite_spots_insert_own" on public.favorite_spots;
drop policy if exists "favorite_spots_update_own" on public.favorite_spots;
drop policy if exists "favorite_spots_delete_own" on public.favorite_spots;

create policy "favorite_spots_select_own" on public.favorite_spots
    for select
    to anon, authenticated
    using (user_id = auth.uid());

create policy "favorite_spots_insert_own" on public.favorite_spots
    for insert
    to anon, authenticated
    with check (user_id = auth.uid());

create policy "favorite_spots_update_own" on public.favorite_spots
    for update
    to anon, authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "favorite_spots_delete_own" on public.favorite_spots
    for delete
    to anon, authenticated
    using (user_id = auth.uid());

-- Grants mirror `catches`: the Data API roles can reach the table, RLS decides the
-- rows. Withholding the grant would make the feature fail for guests; granting it
-- without RLS would expose everyone's spots. Both are needed.
grant select, insert, update, delete on public.favorite_spots
    to anon, authenticated, service_role;
