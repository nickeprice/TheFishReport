/**
 * src/features/catch-log/outbox.js - the durable catch outbox (UPDATE 3.0 Phase 3.1).
 *
 * public: outboxLoad(), outboxAll(), outboxPending(), outboxAdd(row),
 *         outboxUpdate(clientId, patch), outboxStoreKind()
 *
 * WHY an in-memory mirror: several readers need the list SYNCHRONOUSLY (the board
 * fallback, the gear-sim calibration fallback, the pending-sync flush) while IndexedDB
 * is asynchronous. So we load once at boot into OUTBOX and write through on every
 * change — callers keep their synchronous API and the store stays durable.
 *
 * Storage is IndexedDB, with an automatic localStorage fallback (private browsing can
 * make IndexedDB unavailable) plus a one-time import of the legacy `catch_db` key that
 * is only retired once the durable copy is confirmed written.
 *
 * ES module.
 */
import { newUuid } from '../../shared/format.js';
import { idbOpen, idbGetAll, idbPutAll } from '../../shared/idb.js';
import { logDebug } from '../../shared/debug.js';
var OUTBOX = [];
export var OUTBOX_STORE_KIND = 'idb';        // 'idb' | 'ls' — diagnostic
window.OUTBOX_STORE_KIND = OUTBOX_STORE_KIND;
export var LEGACY_CATCH_KEY = 'catch_db';
window.LEGACY_CATCH_KEY = LEGACY_CATCH_KEY;

window.outboxAll = outboxAll;
export function outboxAll() { return OUTBOX; }

export function outboxPending() {
    return OUTBOX.filter(function (r) { return r && r.pendingSync; });
}

export function outboxStoreKind() { return OUTBOX_STORE_KIND; }

export function outboxReadLegacy() {
    try {
        var j = localStorage.getItem(LEGACY_CATCH_KEY);
        var rows = j ? JSON.parse(j) : [];
        return Array.isArray(rows) ? rows : [];
    } catch (e) { return []; }
}

export function outboxWriteLegacy() {
    try { localStorage.setItem(LEGACY_CATCH_KEY, JSON.stringify(OUTBOX)); } catch (e) {}
}

// Merge by clientId, giving legacy rows (which predate clientId) a stable key so a
// retry can never duplicate them. An already-synced row wins over an unsynced copy.
export function outboxMerge(rows) {
    var byKey = {};
    OUTBOX.forEach(function (r) { if (r && r.clientId) byKey[r.clientId] = r; });
    (rows || []).forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        if (!r.clientId) r.clientId = newUuid();
        var prev = byKey[r.clientId];
        if (!prev || (!prev.syncedAt && r.syncedAt)) byKey[r.clientId] = r;
    });
    OUTBOX = Object.keys(byKey).map(function (k) { return byKey[k]; });
}

export async function outboxLoad() {
    var db = await idbOpen();
    var usingIdb = !!db;
    if (!usingIdb) OUTBOX_STORE_KIND = 'ls';

    outboxMerge(usingIdb ? await idbGetAll('catches') : []);
    outboxMerge(outboxReadLegacy());

    if (usingIdb) {
        var wrote = await idbPutAll('catches', OUTBOX);
        // Retire the legacy key ONLY once the durable copy is confirmed.
        if (wrote) { try { localStorage.removeItem(LEGACY_CATCH_KEY); } catch (e) {} }
    } else {
        outboxWriteLegacy();
        logDebug('IndexedDB unavailable — outbox using the localStorage fallback', 'DB');
    }
    logDebug('Outbox loaded: ' + OUTBOX.length + ' row(s) via ' + OUTBOX_STORE_KIND, 'DB');
    return OUTBOX.length;
}

export function outboxPersist() {
    if (OUTBOX_STORE_KIND === 'ls') { outboxWriteLegacy(); return; }
    idbPutAll('catches', OUTBOX);      // write-through; fire and forget
}

export function outboxAdd(row) {
    if (!row.clientId) row.clientId = newUuid();
    OUTBOX.push(row);
    outboxPersist();
    return row.clientId;
}

// ===== G5 (Phase 2.4): Brag Board + calibration snapshots ====================
// read-through snapshots of Supabase reads, stored as ONE IndexedDB row
// { id: '_snapshot', ts, value } per store so the public board and the Gear Sim
// community sonar still have real (honestly stale) data offline.
export function snapshotSave(store, value) {
window.snapshotSave = snapshotSave;
    var row = { id: '_snapshot', ts: Date.now(), value: value };
    if (typeof idbPutAll === 'function') {
        idbPutAll(store, [row]);   // write-through
    }
    try { localStorage.setItem('snap_' + store, JSON.stringify(row)); } catch (e) {}
}

window.snapshotLoad = snapshotLoad;
export async function snapshotLoad(store) {
    var row = null;
    if (typeof idbGetAll === 'function') {
        try {
            var rowsGet = await idbGetAll(store);
            if (rowsGet && rowsGet.length && rowsGet[0] && rowsGet[0].value) row = rowsGet[0];
        } catch (e) {}
    }
    if (!row) {
        try { row = JSON.parse(localStorage.getItem('snap_' + store) || 'null'); } catch (e) { row = null; }
    }
    return (row && row.value) ? row.value : null;
}

export function snapshotsAvailable() {
    return (typeof idbPutAll === 'function' && typeof idbGetAll === 'function');
}

export function outboxUpdate(clientId, patch) {
    for (var i = 0; i < OUTBOX.length; i++) {
        if (OUTBOX[i] && OUTBOX[i].clientId === clientId) {
            Object.keys(patch || {}).forEach(function (k) { OUTBOX[i][k] = patch[k]; });
            outboxPersist();
            return true;
        }
    }
    return false;
}

// NOTE (Phase 3.1 scope call): a per-waterbody telemetry snapshot was planned here, but
// sw.js already caches /api/water_report under a NORMALISED per-station key, so an
// IndexedDB copy would be a second cache of the same payload with no consumer. Not built
// — revisit only alongside a feature that displays it (e.g. "offline: data from 3h ago").
