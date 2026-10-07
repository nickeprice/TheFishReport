/**
 * src/services/supabase-auth.js - Supabase anonymous auth (guest sessions).
 * Splintered from supabase.js. ES module.
 */
import { getClient, ensureSdk, rememberName, recallName, GUEST_NAME_KEY } from './supabase-client.js';

// ---------------------------------------------------------------- AUTH ---

/**
 * Anonymous (guest) sign in. No email or password: Supabase issues an anonymous user and
 * we stash the display name in user_metadata so the public feed can show it.
 */
export async function signInGuest(name) {
    const clean = String(name || '').trim().slice(0, 24);
    if (!clean) return { ok: false, error: 'Enter a name to start fishing.' };
    rememberName(clean);

    const client = getClient();
    if (!client) return { ok: true, offline: true, name: clean, user: null };

    try {
        if (typeof client.auth.signInAnonymously !== 'function') {
            return { ok: true, offline: true, name: clean, user: null };
        }
        const res = await client.auth.signInAnonymously({ options: { data: { display_name: clean } } });
        if (res.error) return { ok: false, error: res.error.message, name: clean };
        return { ok: true, name: clean, user: res.data ? res.data.user : null };
    } catch (e) {
        return { ok: false, error: e.message, name: clean };
    }
}

export async function signOut() {
    const client = getClient();
    try { if (client) await client.auth.signOut(); } catch (e) {}
    try { localStorage.removeItem(GUEST_NAME_KEY); } catch (e) {}
    return { ok: true };
}

/**
 * Returns { user, session, name, isGuest }. `name` falls back to the cached display name so
 * the UI still shows an identity when Supabase is unreachable.
 */
export async function getSession() {
    const sdk = await ensureSdk();
    const client = sdk ? getClient() : null;
    if (!client) return { session: null, user: null, name: recallName(), isGuest: false, offline: true };
    try {
        const res = await client.auth.getSession();
        const session = (res && res.data) ? res.data.session : null;
        const user = session ? session.user : null;
        const meta = (user && user.user_metadata) ? user.user_metadata : {};
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