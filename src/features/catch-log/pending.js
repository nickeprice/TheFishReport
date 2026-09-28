/**
 * src/features/catch-log/pending.js - optimistic rows for the catch lists
 * (UPDATE 3.0 Phase 3.4).
 *
 * public: pendingRows(), pendingNotIn(serverRows), pendingBadge(),
 *         asMyCatchRow(row), refreshCatchLists()
 *
 * WHY: logData() writes the durable outbox BEFORE it talks to the network, so a catch
 * logged in a dead zone is never lost. That same buffer is the honest source for the UI:
 * without this, a just-logged catch sits in the outbox and the list simply does not show
 * it — the angler taps LOG CATCH DATA, sees nothing appear, and assumes it failed.
 * Rendering the pending rows closes that gap. They carry a "Syncing..." badge which
 * clears when the flush confirms (syncPendingCatches -> refreshCatchLists()).
 *
 * These are the caller's OWN rows (the outbox is device-local), and only the columns the
 * active scope already displays are read here, so the public-feed privacy boundary in
 * board.js (name/time/river/fish) is untouched.
 *
 * DEDUPE: `pendingSync: true` means the insert did not confirm. The one case where the
 * row may already exist server-side is a lost *response* (commit happened, reply never
 * arrived). fetchMyCatches() returns a row whose id IS the clientId, so the "yours" scope
 * dedupes on it via pendingNotIn(). The public view selects no id by design, so the
 * "everyone" scope cannot — the retry resolves it (ON CONFLICT DO NOTHING) and the
 * optimistic row drops out. Bounded to that one catch, for one session.
 *
 * Classic script (global scope). Loaded BEFORE src/app.js, AFTER outbox.js.
 */
// Newest first, so an optimistic row lands where it belongs at the top of the list.
function pendingRows() {
    if (typeof outboxPending !== 'function') return [];
    return outboxPending().slice().sort(function (a, b) {
        return new Date(b.time || 0) - new Date(a.time || 0);
    });
}

// Pending rows the server list does not already contain (id === clientId).
function pendingNotIn(serverRows) {
    var seen = {};
    (serverRows || []).forEach(function (r) { if (r && r.id != null) seen[String(r.id)] = true; });
    return pendingRows().filter(function (r) { return !seen[String(r.clientId)]; });
}

function pendingBadge() {
    var span = document.createElement('span');
    span.className = 'sync-badge';
    span.textContent = 'Syncing...';
    span.title = 'Saved on this device — will upload when the connection returns.';
    return span;
}

// Map an outbox payload onto the "yours" row shape, so mycatches.js keeps one render loop.
function asMyCatchRow(r) {
    return {
        id: r.clientId,
        species: r.spc,
        catch_time: r.time,
        flow: r.flow,
        sim_score: r.score,
        _pending: true
    };
}

// Re-render whichever scope is on screen, so a row that is no longer pending loses its
// badge and comes back from the server instead of the outbox.
function refreshCatchLists() {
    if (typeof setCatchScope === 'function' && typeof CATCH_SCOPE !== 'undefined') {
        setCatchScope(CATCH_SCOPE);
    }
}
