/**
 * Supabase service layer: anonymous auth, private catch writes, public reads.
 *
 * public: isConfigured(), ensureSdk(), getClient(), rememberName(name), recallName(),
 *         signInGuest(name), signOut(), getSession(), toCatchRow(payload),
 *         insertCatch(payload), fetchMyCatches(), updateMyCatch(id, patch),
 *         deleteMyCatch(id), fetchPublicFeed(limit), fetchGlobalCalibration(flow, species)
 *
 * Classic script (global scope). Loaded BEFORE src/app.js.
 *
 * The catch payload -> `public.catches` column map is the contract in
 * `docs/CONTRACT_CATCH.md` — read that instead of re-deriving it here, and verify with the
 * `information_schema` query it gives. Anonymous (guest) sign-ins are ENABLED on this
 * project; `insertCatch` is idempotent on the client-generated `id`.
 */

// --- CONFIG: paste the values from Supabase > Project Settings > API ---
const SUPABASE_URL = 'https://pztcfsqifbfkjvosygcy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CJcIKTHTSUGSFkw6POK6XA_tNfo37Gr';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const GUEST_NAME_KEY = 'angler_display_name';

var _client = null;
var _sdkPromise = null;

function isConfigured() {
    return SUPABASE_URL.indexOf('PASTE_YOUR') !== 0 && SUPABASE_ANON_KEY.indexOf('PASTE_YOUR') !== 0;
}

// The CDN bundle is normally loaded by a <script> tag in index.html. If that failed
// (offline, blocked, cached miss) inject it on demand so the app can still try to connect.
function ensureSdk() {
    if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
        return Promise.resolve(true);
    }
    if (_sdkPromise) return _sdkPromise;
    _sdkPromise = new Promise(function (resolve) {
        if (typeof document === 'undefined' || !document.head) return resolve(false);
        var tag = document.createElement('script');
        tag.src = SUPABASE_CDN;
        tag.async = true;
        tag.onload = function () { resolve(!!(window.supabase && window.supabase.createClient)); };
        tag.onerror = function () { resolve(false); };
        document.head.appendChild(tag);
        setTimeout(function () { resolve(!!(window.supabase && window.supabase.createClient)); }, 6000);
    });
    return _sdkPromise;
}

function getClient() {
    if (_client) return _client;
    if (!isConfigured()) return null;
    if (typeof window === 'undefined' || !window.supabase || !window.supabase.createClient) return null;
    try {
        _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, storageKey: 'puyallup_angler_auth' }
        });
    } catch (e) {
        _client = null;
    }
    return _client;
}

function rememberName(name) {
    try { localStorage.setItem(GUEST_NAME_KEY, name); } catch (e) {}
}

function recallName() {
    try { return localStorage.getItem(GUEST_NAME_KEY) || ''; } catch (e) { return ''; }
}

// ---------------------------------------------------------------- AUTH ---

/**
 * Anonymous (guest) sign in. No email or password: Supabase issues an anonymous user and
 * we stash the display name in user_metadata so the public feed can show it.
 */
async function signInGuest(name) {
    var clean = String(name || '').trim().slice(0, 24);
    if (!clean) return { ok: false, error: 'Enter a name to start fishing.' };
    rememberName(clean);

    var sdk = await ensureSdk();
    var client = sdk ? getClient() : null;
    // Local-only guest: Supabase is not configured, or the SDK failed to load / could
    // not be reached. NOTE: anonymous sign-ins ARE ENABLED on this project (verified
    // 2026-09-28 against the live DB: 7 anonymous auth users, and one private catch row
    // written by one of them). Do NOT assume they are disabled without querying first —
    // an earlier version of this comment claimed the opposite and was simply stale.
    if (!client) return { ok: true, offline: true, name: clean, user: null };

    try {
        if (typeof client.auth.signInAnonymously !== 'function') {
            return { ok: true, offline: true, name: clean, user: null };
        }
        var res = await client.auth.signInAnonymously({ options: { data: { display_name: clean } } });
        if (res.error) return { ok: false, error: res.error.message, name: clean };
        return { ok: true, name: clean, user: res.data ? res.data.user : null };
    } catch (e) {
        return { ok: false, error: e.message, name: clean };
    }
}

async function signOut() {
    var client = getClient();
    try { if (client) await client.auth.signOut(); } catch (e) {}
    try { localStorage.removeItem(GUEST_NAME_KEY); } catch (e) {}
    return { ok: true };
}

/**
 * Returns { user, session, name, isGuest }. `name` falls back to the cached display name so
 * the UI still shows an identity when Supabase is unreachable.
 */
async function getSession() {
    var sdk = await ensureSdk();
    var client = sdk ? getClient() : null;
    if (!client) return { session: null, user: null, name: recallName(), isGuest: false, offline: true };
    try {
        var res = await client.auth.getSession();
        var session = (res && res.data) ? res.data.session : null;
        var user = session ? session.user : null;
        var meta = (user && user.user_metadata) ? user.user_metadata : {};
        return {
            session: session,
            user: user,
            name: meta.display_name || recallName(),
            isGuest: !!(user && !user.email)
        };
    } catch (e) {
        return { session: null, user: null, name: recallName(), isGuest: false, offline: true };
    }
}

// ------------------------------------------------------------ DATABASE ---

// Local payload -> LIVE public.catches columns. Only live columns are sent:
// name/time/flow/spc -> angler_name/catch_time/flow/species, GPS "lat, lon" split ->
// latitude/longitude, weight -> weight,
// ldLen/ldMat/ldLb -> leader_length/leader_material/leader_lb,
// mlLine/ldLine/weightShape -> mainline_line_id/leader_line_id/weight_shape (P4b: the PICKED
//   brand ids + weight shape, which ride ALONGSIDE the material+lb fallback),
// hook -> hook_size, yarn -> yarn, foam -> foam (+ foam2 -> foam_2),
// bdMat/bdSz -> bead_material/bead_size.
function toCatchRow(payload) {
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
        hook_size: (payload.hook !== undefined && payload.hook !== null) ? Number(payload.hook) : null,
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
        gauge_height: (payload.gauge !== undefined && payload.gauge !== null) ? payload.gauge : null,
        barometer: (payload.barometer !== undefined && payload.barometer !== null) ? payload.barometer : null,
        water_temp_f: (payload.waterTemp !== undefined && payload.waterTemp !== null) ? payload.waterTemp : null,
        wind_speed_mph: (payload.windSpeed !== undefined && payload.windSpeed !== null) ? payload.windSpeed : null,
        wind_dir_compass: payload.windDir || null,
        moon_phase: payload.moon || null,
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
async function insertCatch(payload) {
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
async function fetchMyCatches() {
    var client = getClient();
    if (!client) return [];
    try {
        var res = await client.from('catches')
            .select('id,species,catch_time,flow,sim_score,angler_name,leader_length,leader_material,leader_lb,weight,foam,bead_material,bead_size,hook_size,yarn')
            .order('catch_time', { ascending: false })
            .limit(100);
        if (res.error) return [];
        return res.data || [];
    } catch (e) {
        return [];
    }
}

/** Private update: edit allowed columns on one of the user's own rows. */
async function updateMyCatch(id, patch) {
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
async function deleteMyCatch(id) {
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

/** Public read: the rebuilt view exposes name / time / river / fish.
 * Falls back gracefully when run against an older view (name,time[,river]). */
async function fetchPublicFeed(limit) {
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
 * STATUS (verified live 2026-09-28): the RPC is live and DOES return real rows — it
 * returned the single stored catch. The earlier "returns []" note here was stale.
 *
 * CAVEAT — the consumer is still inert: `communitySonar()` in gear-sim/sonar.js skips any
 * row whose `loc !== 'Fair'`, and nothing has ever populated that field (`hook_location`
 * was always NULL and was dropped on 2026-09-28). So every returned row is filtered out
 * and the strike zone keeps using its baseline. Fixing it CHANGES the Gear Sim's zone, so
 * it is a deliberate product decision, not a cleanup (see docs/ROADMAP.md §3.2).
 *
 * The mapper stays shape-tolerant so any future RPC shape still maps cleanly.
 */
async function fetchGlobalCalibration(flow, species) {
    var client = getClient();
    if (!client) return [];
    try {
        var res = await client.rpc('get_global_calibration', { p_flow: flow, p_species: species });
        if (res.error || !res.data) return [];
        return res.data.map(function (r) {
            return {
                flow: (r.cfs !== undefined) ? r.cfs : r.flow,
                spc: (r.species !== undefined) ? r.species : (r.spc || species),
                loc: null,   // `hook_location` was dropped 2026-09-28 (always NULL); see docs/ROADMAP.md §3.2
                ldLen: (r.leader_len_ft !== undefined) ? r.leader_len_ft : r.leader_length,
                ldMat: (r.leader_material !== undefined) ? r.leader_material : (r.ldMat || null),
                ldLb: (r.leader_lb !== undefined) ? r.leader_lb : null,
                mlMat: (r.mainline_mat !== undefined) ? r.mainline_mat : (r.mlMat || null),
                mlLb: (r.mainline_lb !== undefined) ? r.mainline_lb : null,
                // P4b: pass the brand ids through IF the RPC ever returns them, so the replay
                // picks them up with no further client change. They are null today —
                // `get_global_calibration` does not select the columns yet (see the P4b note
                // in docs/CONTRACT_CATCH.md for why that is a deliberate product decision).
                ldLine: r.leader_line_id || null,
                mlLine: r.mainline_line_id || null,
                weightShape: r.weight_shape || null,
                weight: (r.lead_oz !== undefined) ? r.lead_oz : r.weight,
                hook: (r.hook_size !== undefined) ? r.hook_size : null,
                yarn: (r.yarn_in !== undefined) ? r.yarn_in : r.yarn,
                foam: r.foam,
                bdMat: (r.bead_mat !== undefined) ? r.bead_mat : r.bead_material,
                bdSz: (r.bead_size !== undefined) ? r.bead_size : null,
                dist: null,  // `cast_distance_ft` was dropped 2026-09-28 (always NULL)
                waterTempF: (r.water_temp_f !== undefined) ? r.water_temp_f : null,
                windSpeedMph: (r.wind_speed_mph !== undefined) ? r.wind_speed_mph : null,
                windDirCompass: (r.wind_dir_compass !== undefined) ? r.wind_dir_compass : null,
                moonPhase: (r.moon_phase !== undefined) ? r.moon_phase : null,
                samples: r.samples
            };
        });
    } catch (e) {
        return [];
    }
}

if (typeof window !== 'undefined') {
    window.Supa = {
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
        // support
        isConfigured: isConfigured,
        ensureSdk: ensureSdk,
        toCatchRow: toCatchRow,
        SUPABASE_CDN: SUPABASE_CDN
    };
}