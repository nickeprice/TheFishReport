/**
 * src/services/supabase-crud.js - Supabase data CRUD + calibration + Supa export.
 * Splintered from supabase.js. ES module.
 */
import { getClient, isConfigured, ensureSdk } from './supabase-client.js';
import { signInGuest, signOut, getSession } from './supabase-auth.js';
// ------------------------------------------------------------ DATABASE ---

// Local payload -> LIVE public.catches columns. Only live columns are sent:
// name/time/flow/spc -> angler_name/catch_time/flow/species, GPS "lat, lon" split ->
// latitude/longitude, weight -> weight,
// ldLen/ldMat/ldLb -> leader_length/leader_material/leader_lb,
// mlLine/ldLine/weightShape -> mainline_line_id/leader_line_id/weight_shape (P4b: the PICKED
//   brand ids + weight shape, which ride ALONGSIDE the material+lb fallback),
// hook -> hook_size, yarn -> yarn, foam -> foam (+ foam2 -> foam_2),
// bdMat/bdSz -> bead_material/bead_size.
export function toCatchRow(payload) {
    var t = payload.time ? new Date(payload.time) : new Date();
    if (isNaN(t.getTime())) t = new Date();
    var lat = null, lon = null;
    if (payload.gps && payload.gps !== 'Denied') {
        var parts = String(payload.gps).split(',');
        if (parts.length === 2) {
            lat = parseFloat(parts[0]); lon = parseFloat(parts[1]);
            if (isNaN(lat)) lat = null;
            if (isNaN(lon)) lon = null;
        }
    }
    return {
        // The client-generated id makes the write idempotent (see insertCatch).
        id: (payload.clientId !== undefined && payload.clientId !== null) ? payload.clientId : undefined,
        user_id: (payload.user_id !== undefined && payload.user_id !== null) ? payload.user_id : undefined,
        angler_name: payload.name,
        catch_time: t.toISOString(),
        flow: payload.flow,
        species: payload.spc,
        river_name: payload.river || null,
        latitude: lat,
        longitude: lon,
        weight: (payload.weight !== undefined && payload.weight !== null) ? payload.weight : null,
        leader_length: payload.ldLen,
        leader_material: payload.ldMat || null,
        leader_lb: payload.ldLb,
        hook_size: (payload.hook !== undefined && payload.hook !== null) ? String(payload.hook) : null,
        yarn: payload.yarn,
        foam: payload.foam || null,
        foam_2: payload.foam2 || null,
        bead_material: payload.bdMat || null,
        bead_size: payload.bdSz,
        mainline_mat: payload.mlMat || null,
        mainline_lb: (payload.mlLb !== undefined && payload.mlLb !== null) ? payload.mlLb : null,
        // P4b: the picked brand ids (`src/data/tackle.json`) + the weight row's shape_label.
        // They must be sent AFTER the columns exist (migration 20260929055300) — PostgREST
        // rejects an unknown column with 400/PGRST204. Readers must tolerate NULL.
        mainline_line_id: payload.mlLine || null,
        leader_line_id: payload.ldLine || null,
        weight_shape: payload.weightShape || null,
        weight_setup: payload.weightSetup || null,
        gauge_height: (payload.gauge !== undefined && payload.gauge !== null) ? payload.gauge : null,
        barometer: (payload.barometer !== undefined && payload.barometer !== null) ? payload.barometer : null,
        water_temp_f: (payload.waterTemp !== undefined && payload.waterTemp !== null) ? payload.waterTemp : null,
        wind_speed_mph: (payload.windSpeed !== undefined && payload.windSpeed !== null) ? payload.windSpeed : null,
        wind_dir_compass: payload.windDir || null,
        moon_phase: payload.moon || null,
        // The shared environment signature (envSignature() in zone.js) captured at catch
        // time, so the community sonar can match a catch's conditions against today's.
        // Must be sent AFTER migration 20260930120000 (PostgREST 400 on an unknown column).
        cloud_pct: (payload.cloudPct !== undefined && payload.cloudPct !== null) ? payload.cloudPct : null,
        rain_in: (payload.rainIn !== undefined && payload.rainIn !== null) ? payload.rainIn : null,
        turbidity_fnu: (payload.turbidityFnu !== undefined && payload.turbidityFnu !== null) ? payload.turbidityFnu : null,
        barometer_delta: (payload.barometerDelta !== undefined && payload.barometerDelta !== null) ? payload.barometerDelta : null,
        tide_stage_ft: (payload.tideStage !== undefined && payload.tideStage !== null) ? payload.tideStage : null,
        tide_trend: payload.tideTrend || null,
        light_shift: (payload.lightShift !== undefined && payload.lightShift !== null) ? payload.lightShift : null,
        // The notebook: what the model predicted (zone) and where the fish was (hgt).
        line_height_in: (payload.hgt !== undefined && payload.hgt !== null) ? payload.hgt : null,
        zone_min_in: (payload.zoneMin !== undefined && payload.zoneMin !== null) ? payload.zoneMin : null,
        zone_max_in: (payload.zoneMax !== undefined && payload.zoneMax !== null) ? payload.zoneMax : null,
        sim_score: (payload.score !== undefined && payload.score !== null) ? payload.score : null
    };
}

/** Private write: the full tackle profile and GPS go up, nothing comes back.
 *
 * IDEMPOTENT (UPDATE 3.0 Phase 3.2). The row carries the client-generated id
 * (`payload.clientId` -> `id`) and we upsert with `ignoreDuplicates`, so a retry after
 * a response lost in a dead zone conflicts on the primary key and is DISCARDED rather
 * than inserting a second copy of the catch. No DB change was needed: `public.catches`
 * already has `PRIMARY KEY (id)`.
 */
export async function insertCatch(payload) {
    var client = getClient();
    if (!client) return { ok: false, offline: true, error: 'Supabase not configured or offline' };
    try {
        var res = await client
            .from('catches')
            .upsert(toCatchRow(payload), { onConflict: 'id', ignoreDuplicates: true })
            .select('id');
        if (res.error) return { ok: false, error: res.error.message };
        var row = (res.data && res.data.length) ? res.data[0] : null;
        // No row returned simply means it was ALREADY stored — the intended outcome of a
        // retry, so it counts as success rather than as a failure to retry forever.
        return { ok: true, id: row ? row.id : (payload.clientId || null), deduped: !row };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/** Private read: the signed-in user's own catch rows (RLS guarantees ownership). */
export async function fetchMyCatches() {
    var client = getClient();
    if (!client) return [];
    try {
        var res = await client.from('catches')
            .select('id,species,catch_time,flow,sim_score,angler_name,leader_length,leader_material,leader_lb,weight,foam,bead_material,bead_size,hook_size,yarn,line_height_in,zone_min_in,zone_max_in')
            .order('catch_time', { ascending: false })
            .limit(100);
        if (res.error) return [];
        return res.data || [];
    } catch (e) {
        return [];
    }
}

/** Private update: edit allowed columns on one of the user's own rows. */
export async function updateMyCatch(id, patch) {
    var client = getClient();
    if (!client) return { ok: false, error: 'Supabase not configured or offline' };
    try {
        var res = await client.from('catches').update(patch).eq('id', id);
        if (res.error) return { ok: false, error: res.error.message };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/** Private delete: remove one of the user's own rows. */
export async function deleteMyCatch(id) {
    var client = getClient();
    if (!client) return { ok: false, error: 'Supabase not configured or offline' };
    try {
        var res = await client.from('catches').delete().eq('id', id);
        if (res.error) return { ok: false, error: res.error.message };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ------------------------------------------------ PRIVATE FAVOURITE SPOTS ---
// WS-5 (issue #3b). A spot is PRIVATE planning data: the live RLS policies on
// `public.favorite_spots` scope every command to `user_id = auth.uid()`, and
// `user_id` is left to the DATABASE default (auth.uid()) — `toSpotRow()` deliberately
// never sets it, so a payload cannot claim another angler's identity or read anybody
// else's spots. Read the schema + privacy proof in
// `supabase/migrations/20260929190000_favorite_spots.sql`. Nothing here is public.

/** payload -> favorite_spots columns. NEVER sets user_id (the DB default owns it). */
export function toSpotRow(payload) {
    var lat = parseFloat(payload.latitude);
    var lon = parseFloat(payload.longitude);
    return {
        // Client-generated id: the same id on an edit, so an upsert cannot duplicate.
        id: (payload.clientId !== undefined && payload.clientId !== null) ? payload.clientId : undefined,
        label: String(payload.label || '').trim().slice(0, 60),
        station_id: payload.stationId ? String(payload.stationId).slice(0, 20) : null,
        river_name: payload.riverName ? String(payload.riverName).slice(0, 80) : null,
        latitude: isNaN(lat) ? null : lat,
        longitude: isNaN(lon) ? null : lon,
        notes: payload.notes ? String(payload.notes).slice(0, 240) : null,
        updated_at: new Date().toISOString()
    };
}

/** Private write: save (or re-save, same id = edit) one of MY spots.
 *
 * Idempotent on the primary key, so a retry after a response lost in a dead zone
 * updates the same row instead of planting a second spot. An unnamed spot or a
 * non-numeric coordinate is rejected BEFORE the network — a bad row cannot land.
 */
export async function saveFavoriteSpot(payload) {
    var client = getClient();
    if (!client) return { ok: false, offline: true, error: 'Supabase not configured or offline' };
    var row = toSpotRow(payload);
    if (!row.label || row.latitude === null || row.longitude === null) {
        return { ok: false, error: 'A spot needs a name and a position.' };
    }
    try {
        var res = await client.from('favorite_spots').upsert(row, { onConflict: 'id' }).select('id');
        if (res.error) return { ok: false, error: res.error.message };
        var saved = (res.data && res.data.length) ? res.data[0] : null;
        return { ok: true, id: saved ? saved.id : (row.id || null) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/** Private read: MY spots only (RLS guarantees ownership; no view, no RPC). */
export async function fetchFavoriteSpots() {
    var client = getClient();
    if (!client) return null;   // null = unreachable, [] = reachable and empty
    try {
        var res = await client.from('favorite_spots')
            .select('id,label,station_id,river_name,latitude,longitude,notes,created_at')
            .order('created_at', { ascending: true });
        if (res.error) return null;
        return res.data || [];
    } catch (e) {
        return null;
    }
}

/** Private delete: remove one of MY spots. */
export async function deleteFavoriteSpot(id) {
    var client = getClient();
    if (!client) return { ok: false, error: 'Supabase not configured or offline' };
    try {
        var res = await client.from('favorite_spots').delete().eq('id', id);
        if (res.error) return { ok: false, error: res.error.message };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/** Public read: the rebuilt view exposes name / time / river / fish.
 * Falls back gracefully when run against an older view (name,time[,river]). */
export async function fetchPublicFeed(limit) {
    var client = getClient();
    if (!client) return [];
    try {
        var res = await client
            .from('public_catch_feed')
            .select('name,time,river,fish')
            .order('time', { ascending: false })
            .limit(limit || 100);
        if (res.error) {
            // Older view without river — retry so the board still loads.
            var retry = await client
                .from('public_catch_feed')
                .select('name,time')
                .order('time', { ascending: false })
                .limit(limit || 100);
            if (retry.error || !retry.data) return [];
            return retry.data.map(function (r) {
                return { name: r.name, time: r.time, river: '--', spc: null };
            });
        }
        if (!res.data) return [];
        // G5: snapshot the successful read so the board renders offline.
        if (typeof snapshotSave === 'function') {
            try {
                snapshotSave('feed_snapshot', res.data.map(function (r) {
                    return { name: r.name, time: r.time, river: (r.river !== undefined && r.river !== null) ? r.river : '--', spc: (r.fish !== undefined) ? r.fish : null };
                }));
            } catch (e) {}
        }
        return res.data.map(function (r) {
            return { name: r.name, time: r.time, river: (r.river !== undefined && r.river !== null) ? r.river : '--', spc: (r.fish !== undefined) ? r.fish : null };
        });
    } catch (e) {
        return [];
    }
}

/**
 * Community telemetry for the physics engine.
 *
 * The RPC returns anonymised tackle + the environment signature for catches at the same
 * river stage and species. `communitySonar()` replays each rig through the SAME locked
 * physics to solve the height where that fish was caught, then pulls today's strike zone
 * toward where fish are being caught.
 *
 * The env fields below are the SAME variables the sim uses to place the zone
 * (temperature, light/cloud, turbidity, tide, barometric trend, rain) so the two work
 * hand in hand. `line_height_in` / `zone_min_in` / `zone_max_in` are the notebook: what
 * the model predicted vs where the fish actually was (the residual is derived, not stored).
 *
 * The mapper stays shape-tolerant so a slightly different RPC shape still maps cleanly.
 */
export async function fetchGlobalCalibration(flow, species) {
    var client = getClient();
    if (!client) return [];
    try {
        var res = await client.rpc('get_global_calibration', { p_flow: flow, p_species: species });
        if (res.error || !res.data) return [];
        // G5: snapshot the successful read so community sonar works offline.
        try { snapshotSave('calibration_snapshot', res.data); } catch (e) {}
        return res.data.map(function (r) {
            var num = function (v) {
                if (v === null || v === undefined || v === '') return null;
                var n = Number(v);
                return isFinite(n) ? n : null;
            };
            return {
                flow: (r.cfs !== undefined) ? r.cfs : r.flow,
                spc: (r.species !== undefined) ? r.species : (r.spc || species),
                ldLen: (r.leader_len_ft !== undefined) ? r.leader_len_ft : r.leader_length,
                ldMat: (r.leader_material !== undefined) ? r.leader_material : (r.ldMat || null),
                ldLb: (r.leader_lb !== undefined) ? r.leader_lb : null,
                mlMat: (r.mainline_mat !== undefined) ? r.mainline_mat : (r.mlMat || null),
                mlLb: (r.mainline_lb !== undefined) ? r.mainline_lb : null,
                // P4b brand ids, passed through IF the RPC ever returns them (it does not
                // select those columns yet — see the P4b note in docs/CONTRACT_CATCH.md).
                ldLine: r.leader_line_id || null,
                mlLine: r.mainline_line_id || null,
                weightShape: r.weight_shape || null,
                weight: (r.lead_oz !== undefined) ? r.lead_oz : r.weight,
                hook: (r.hook_size !== undefined) ? r.hook_size : null,
                yarn: (r.yarn_in !== undefined) ? r.yarn_in : r.yarn,
                foam: r.foam,
                bdMat: (r.bead_mat !== undefined) ? r.bead_mat : r.bead_material,
                bdSz: (r.bead_size !== undefined) ? r.bead_size : null,
                // The shared environment signature (envSignature() in zone.js).
                waterTempF: num(r.water_temp_f),
                cloudPct: num(r.cloud_pct),
                rainIn: num(r.rain_in),
                turbidityFnu: num(r.turbidity_fnu),
                barometerDelta: num(r.barometer_delta),
                tideStage: num(r.tide_stage_ft),
                tideTrend: (r.tide_trend !== undefined) ? r.tide_trend : null,
                lightShift: num(r.light_shift),
                // The notebook: prediction vs reality, for the residual.
                lineHeightIn: num(r.line_height_in),
                zoneMinIn: num(r.zone_min_in),
                zoneMaxIn: num(r.zone_max_in)
            };
        });
    } catch (e) {
        return [];
    }
}

// Export Supa so feature modules can import it directly instead of typeof guards.
export var Supa = {
    // auth
    signInGuest: signInGuest,
    signOut: signOut,
    getSession: getSession,
    // data
    insertCatch: insertCatch,
    fetchPublicFeed: fetchPublicFeed,
    fetchGlobalCalibration: fetchGlobalCalibration,
    fetchMyCatches: fetchMyCatches,
    updateMyCatch: updateMyCatch,
    deleteMyCatch: deleteMyCatch,
    // private favourite spots (WS-5)
    saveFavoriteSpot: saveFavoriteSpot,
    fetchFavoriteSpots: fetchFavoriteSpots,
    deleteFavoriteSpot: deleteFavoriteSpot,
    // support
    isConfigured: isConfigured,
    toCatchRow: toCatchRow,
    toSpotRow: toSpotRow
};

if (typeof window !== 'undefined') {
    window.Supa = Supa;
}
