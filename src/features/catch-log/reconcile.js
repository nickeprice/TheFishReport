/**
 * src/features/catch-log/reconcile.js - flush the catch outbox when the network returns.
 *
 * public: initCatchReconcile(), reconcileCatches(force)
 *
 * The outbox is durable, so a catch logged in a dead zone is never lost — but it only
 * reaches Supabase when something actually flushes it. Today that happens on sign-in;
 * this adds the three moments that matter in the field:
 *   * 'online'           — connectivity restored
 *   * 'visibilitychange' — the app came back to the foreground (mobile "resume")
 *   * 'focus'            — the tab/window regained focus
 *
 * Two guards keep it from hammering: a single in-flight lock (overlapping flushes would
 * double-send) and a minimum interval. `force` bypasses the interval for 'online', since
 * connectivity returning is the strongest possible signal.
 *
 * The write itself is idempotent (clientId -> ON CONFLICT DO NOTHING), so even a
 * double-send cannot duplicate a catch — the lock is about wasted requests, not safety.
 *
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
var RECONCILE_MIN_INTERVAL_MS = 15000;
var _reconcileInFlight = false;
var _reconcileLastAt = 0;

async function reconcileCatches(force) {
    if (_reconcileInFlight) return 0;
    if (typeof syncPendingCatches !== 'function') return 0;
    // Nothing to upload without a session: RLS requires user_id = auth.uid().
    if (typeof AuthState !== 'undefined' && !AuthState.signedIn) return 0;
    if (!force && (Date.now() - _reconcileLastAt) < RECONCILE_MIN_INTERVAL_MS) return 0;

    _reconcileInFlight = true;
    try {
        var n = await syncPendingCatches();
        _reconcileLastAt = Date.now();
        if (n > 0) showToast(n + ' queued catch' + (n === 1 ? '' : 'es') + ' synced', 'success', 2500);
        return n;
    } catch (e) {
        logDebug('Catch reconcile failed: ' + e.message, 'SYNC');
        return 0;
    } finally {
        _reconcileInFlight = false;
    }
}

function initCatchReconcile() {
    if (typeof window === 'undefined' || !window.addEventListener) return;

    window.addEventListener('online', function () {
        reconcileCatches(true);
    });

    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') reconcileCatches(false);
        });
    }

    window.addEventListener('focus', function () {
        reconcileCatches(false);
    });

    logDebug('Catch reconcile armed (online / visibilitychange / focus)', 'SYNC');
}
