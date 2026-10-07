/**
 * src/features/catch-log/board.js - merged catch list + "yours / everyone" scope.
 * public: CATCH_SCOPE, setCatchScope(scope), loadDatabase()
 * ES module.
 * Privacy: the public board renders 4 columns only (name/time/river/fish).
 */
import { logDebug } from '../../shared/debug.js';
import { normalizeFeedRow, formatCatchTime } from '../../shared/format.js';
import { Supa } from '../../services/supabase.js';
import { outboxAll, snapshotLoad } from './outbox.js';
import { pendingRows, pendingBadge } from './pending.js';
import { refreshZonePreview } from '../gear-sim/zone-core.js';
import { renderMyCatches } from './mycatches.js';
// Catch Log renderer — merged single list with a "yours / everyone" toggle.
// The ONE list shows either the signed-in angler's private rows (with Edit/Delete)
// or the public board (Name / Time / Flow / Fish). The active scope is tracked in
// CATCH_SCOPE so sign-in/sign-out and new logs re-render the right side.
export var CATCH_SCOPE = 'everyone';   // 'yours' | 'everyone' (default = the public board)
window.CATCH_SCOPE = CATCH_SCOPE;

export function setCatchScope(scope) {
    CATCH_SCOPE = (scope === 'everyone') ? 'everyone' : 'yours';
    const yoursBtn = document.getElementById('scope-yours');
    const everyoneBtn = document.getElementById('scope-everyone');
    const note = document.getElementById('catch-scope-note');
    if (yoursBtn) yoursBtn.classList.toggle('scope-active', CATCH_SCOPE === 'yours');
    if (everyoneBtn) everyoneBtn.classList.toggle('scope-active', CATCH_SCOPE === 'everyone');
    if (note) {
        note.textContent = (CATCH_SCOPE === 'yours')
            ? 'Your private catch log — only you can see it. Edit or delete from here.'
            : 'Public feed — name, time, river and fish only. Gear profiles and GPS stay private.';
    }
    // Swap the table headers to match the active scope, then render.
    const head = document.getElementById('catch-log-head');
    if (head) {
        head.innerHTML = (CATCH_SCOPE === 'yours')
            ? '<tr><th>Species</th><th>Time</th><th>Flow</th><th>Score</th><th></th></tr>'
            : '<tr><th>Name</th><th>Time</th><th>River</th><th>Fish</th></tr>';
    }
    if (CATCH_SCOPE === 'yours') {
        if (typeof renderMyCatches === 'function') renderMyCatches();
    } else {
        loadDatabase();
    }
}

// Public board renderer (the "everyone" scope of the merged list): only
// Name / Time / Flow / Fish. Reads the Supabase view first and falls back to
// the local buffer when offline or unconfigured.
window.loadDatabase = loadDatabase;
export async function loadDatabase() {
    const tbody = document.getElementById('catch-log-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let rows = [];
    let fromCloud = false;
    try {
        rows = await Supa.fetchPublicFeed(100);
        fromCloud = rows.length > 0;
    } catch (e) { rows = []; }

    if (!fromCloud) {
        // Offline fallback: first the durable read-through snapshot (last-known
        // public board), then the durable outbox, then nothing.
        const snapRows = (typeof snapshotLoad === 'function') ? await snapshotLoad('feed_snapshot') : null;
        if (snapRows && snapRows.length) {
            rows = snapRows;
            logDebug('Brag board falling back to cached snapshot: ' + rows.length + ' row(s)', 'DB');
        } else {
            // Fallback: the durable outbox (in-memory mirror, loaded at boot).
            const local = (typeof outboxAll === 'function') ? outboxAll() : [];
            rows = local.slice().reverse();
            logDebug('Brag board falling back to ' + rows.length + ' buffered row(s)', 'DB');
        }
    }

    // Phase 3.4: rows still sitting in the outbox are shown optimistically at the top with
    // a "Syncing..." badge. The public view exposes no id (privacy boundary), so a row that
    // was stored but whose reply was lost can appear twice until the retry clears it —
    // see the DEDUPE note in pending.js.
    const localFallback = !fromCloud;
    const entries = [];
    if (!localFallback && typeof pendingRows === 'function') {
        const pending = pendingRows();
        for (let p = 0; p < pending.length; p++) entries.push({ row: pending[p], pending: true });
    }
    for (let i = 0; i < rows.length; i++) {
        // Already rendered from the outbox in the fallback case — badge, don't duplicate.
        entries.push({ row: rows[i], pending: localFallback && !!rows[i].pendingSync });
    }

    let rendered = 0;
    for (let e = 0; e < entries.length; e++) {
        const src = entries[e];
        const r = normalizeFeedRow(src.row);
        if (!r) continue;
        const tr = document.createElement('tr');
        if (src.pending) tr.className = 'row-pending';
        const tdName = document.createElement('td');
        tdName.textContent = (r.name !== undefined && r.name !== null && r.name !== '') ? String(r.name) : '--';
        // The badge rides inside the Name cell so the board keeps its four public columns.
        if (src.pending && typeof pendingBadge === 'function') {
            tdName.appendChild(document.createTextNode(' '));
            tdName.appendChild(pendingBadge());
        }
        const tdTime = document.createElement('td');
        tdTime.textContent = formatCatchTime(r.time);
        const tdRiver = document.createElement('td');
        tdRiver.textContent = (r.river !== undefined && r.river !== null && r.river !== '') ? String(r.river) : '--';
        const tdSpc = document.createElement('td');
        tdSpc.textContent = (r.spc !== undefined && r.spc !== null && r.spc !== '') ? String(r.spc) : '--';
        tr.appendChild(tdName);
        tr.appendChild(tdTime);
        tr.appendChild(tdRiver);
        tr.appendChild(tdSpc);
        tbody.appendChild(tr);
        rendered++;
    }

    if (rendered === 0) {
        const empty = document.createElement('tr');
        empty.innerHTML = '<td colspan="4" class="empty-state">' +
            '<div class="empty-state-icon">\ud83c\udfa3</div>' +
            '<div class="empty-state-title">No catches on the board yet</div>' +
            '<div class="empty-state-hint">' + (fromCloud
                ? 'Be the first to post — log a catch from the form above and it lands here.'
                : 'You are offline or signed out, so this shows your local log only. Sign in to sync to the public board.') +
            '</div>' +
            '</td>';
        tbody.appendChild(empty);
    }

    if (typeof refreshZonePreview === 'function') refreshZonePreview();
    logDebug('Catch log (everyone): ' + rendered + ' row(s) ' + (fromCloud ? 'from Supabase' : 'from local buffer'), 'DB');
}
window.setCatchScope = setCatchScope;
