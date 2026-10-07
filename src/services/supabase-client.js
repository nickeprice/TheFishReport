/**
 * src/services/supabase-client.js - Supabase client setup + config helpers.
 * Splintered from supabase.js. ES module.
 */
import { createClient } from '@supabase/supabase-js';

// --- CONFIG: paste the values from Supabase > Project Settings > API ---
const SUPABASE_URL = 'https://pztcfsqifbfkjvosygcy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CJcIKTHTSUGSFkw6POK6XA_tNfo37Gr';
export const GUEST_NAME_KEY = 'angler_display_name';

let _client = null;

export function isConfigured() {
    return SUPABASE_URL.indexOf('PASTE_YOUR') !== 0 && SUPABASE_ANON_KEY.indexOf('PASTE_YOUR') !== 0;
}

export function getClient() {
    if (_client) return _client;
    if (!isConfigured()) return null;
    try {
        _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, storageKey: 'puyallup_angler_auth' }
        });
    } catch (e) {
        _client = null;
    }
    return _client;
}

export async function ensureSdk() {
    try {
        const mod = await import('@supabase/supabase-js');
        return mod && typeof mod.createClient === 'function' ? mod : null;
    } catch (e) {
        return null;
    }
}

export function rememberName(name) {
    try { localStorage.setItem(GUEST_NAME_KEY, name); } catch (e) {}
}

export function recallName() {
    try { return localStorage.getItem(GUEST_NAME_KEY) || ''; } catch (e) { return ''; }
}