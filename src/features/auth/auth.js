/**
 * src/features/auth/auth.js - anonymous (guest) session + pending-catch flush.
 * public: AuthState, applyAuthState(), initAuth(), startFishing(),
 *         stopFishing(), syncPendingCatches()
 * ES module.
 * syncPendingCatches() drains the durable IndexedDB outbox (see catch-log/outbox.js).
 */
import { logDebug } from '../../shared/debug.js';
import { showToast } from '../../shared/ui.js';
import { getStr } from '../gear-sim/inputs.js';
import { setFieldValue } from '../../shared/forms.js';
import { setCatchScope, CATCH_SCOPE } from '../catch-log/board.js';
import { switchTab } from '../../shared/nav.js';
import { loadFavoriteSpots } from '../map/spots.js';
import { Supa } from '../../services/supabase.js';
import { outboxPending, outboxUpdate } from '../catch-log/outbox.js';
import { refreshCatchLists } from '../catch-log/pending.js';
// --- AUTH (anonymous guest session) ---
export var AuthState = { signedIn: false, name: '', offline: false };
window.AuthState = AuthState;

export function applyAuthState(signedIn, name) {
    AuthState.signedIn = !!signedIn;
    AuthState.name = name || '';
    var out = document.getElementById('auth-logged-out');
    var inn = document.getElementById('auth-logged-in');
    if (out) out.style.display = signedIn ? 'none' : 'block';
    if (inn) inn.style.display = signedIn ? 'block' : 'none';
    var label = document.getElementById('auth-display-name');
    if (label) label.innerText = AuthState.name || '--';

    var btnLog = document.getElementById('btn-log');
    if (btnLog) {
        if (!signedIn) {
            btnLog.innerText = 'SIGN IN TO LOG CATCHES';
            btnLog.className = 'btn-main locked';
        } else {
            // Logging is decoupled from the Gear Sim: no runSim() required.
            btnLog.innerText = 'LOG CATCH DATA';
            btnLog.className = 'btn-main ready';
        }
    }
    logDebug('Auth: ' + (signedIn ? ('guest session for ' + AuthState.name) : 'signed out'), 'AUTH');
    // WS-5: the private spot list is session-scoped, so it repaints on every auth change
    // (and re-fetches once a session exists).
    if (typeof loadFavoriteSpots === 'function') loadFavoriteSpots();
}

export async function initAuth() {
    if (typeof Supa.isConfigured !== 'function' || !Supa.isConfigured()) {
        applyAuthState(false, '');
        logDebug('Supabase not configured — offline-only mode', 'AUTH');
        return;
    }
    try { await Supa.ensureSdk(); } catch (e) {}
    var sess = null;
    try { sess = await Supa.getSession(); } catch (e) { sess = null; }
    var name = (sess && sess.name) ? sess.name : '';
    if (name) setFieldValue('auth-name', name);
    applyAuthState(!!(sess && (sess.user || name)), name);
    if (AuthState.signedIn) syncPendingCatches();
}

export async function startFishing() {
    var name = (getStr('auth-name') || '').trim();
    if (!name) { showToast('Enter a name to start fishing.', 'warn'); return; }
    var btn = document.getElementById('btn-auth-start');
    if (btn) { btn.innerText = 'CONNECTING...'; btn.disabled = true; }
    var res = null;
    try {
        res = await Supa.signInGuest(name);
    } catch (e) {
        res = { ok: false, error: e.message };
    }
    if (btn) { btn.innerText = 'START FISHING'; btn.disabled = false; }
    if (!res || !res.ok) {
        showToast('Could not start a session: ' + ((res && res.error) || 'unknown error'), 'error', 6000);
        return;
    }
    applyAuthState(true, res.name || name);
    if (res.offline) logDebug('Local-only guest session (Supabase unreachable)', 'AUTH');
    await syncPendingCatches();
    if (typeof setCatchScope === 'function') setCatchScope(CATCH_SCOPE);
    switchTab('tab-gear-sim');
}

export async function stopFishing() {
    try { await Supa.signOut(); } catch (e) {}
    setFieldValue('auth-name', '');
    window.currentStats = null;
    applyAuthState(false, '');
    if (typeof setCatchScope === 'function') setCatchScope(CATCH_SCOPE);
    switchTab('tab-catch-log');
}

// Rows that failed to reach Supabase stay in the durable outbox flagged pendingSync and
// are retried whenever a session becomes available. The write is idempotent (clientId ->
// ON CONFLICT DO NOTHING), so a retry can never double-log a catch.
export async function syncPendingCatches() {
    if (typeof outboxPending !== 'function') return 0;
    var pending = outboxPending();
    if (!pending.length) return 0;

    var synced = 0;
    for (var i = 0; i < pending.length; i++) {
        var res = null;
        try { res = await Supa.insertCatch(pending[i]); } catch (e) { res = null; }
        if (res && res.ok) {
            outboxUpdate(pending[i].clientId, { pendingSync: false, syncedAt: new Date().toISOString() });
            synced++;
        } else {
            break;   // still offline: stop here and retry next session
        }
    }
    if (synced > 0) {
        logDebug('Flushed ' + synced + ' buffered catch(es) to Supabase', 'SYNC');
        // Phase 3.4: confirmed now, so drop the "Syncing..." badge and let the rows come
        // back from the server rather than the outbox.
        if (typeof refreshCatchLists === 'function') refreshCatchLists();
    }
    return synced;
}
window.startFishing = startFishing;
window.stopFishing = stopFishing;
