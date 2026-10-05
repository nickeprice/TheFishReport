/**
 * src/shared/idb.js - a deliberately tiny promise wrapper over IndexedDB.
 *
 * public: idbAvailable(), idbOpen(), idbGetAll(store), idbPutAll(store, rows)
 *
 * The app only needs durable lists (catch records, a telemetry snapshot per waterbody),
 * so this wrapper stays minimal. IndexedDB is unavailable in some private-browsing modes
 * and can throw on open, so every call resolves to a falsy value instead of throwing —
 * the outbox then degrades to localStorage rather than losing the angler's catch.
 *
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
var IDB_NAME = 'puyallup_companion';
var IDB_VERSION = 2;
// Only stores that are actually used — onupgradeneeded adds any missing one, so a future
// store just needs a version bump here (or a new key with a bumped IDB_VERSION).
var IDB_KEYPATH = {
    catches: 'clientId',
    // Phase 2.4 offline-resilience snapshots: each store holds ONE row
    // { id: '_snapshot', ts: <ms>, value: <payload> } written on success.
    telemetry_snapshots: 'id',
    feed_snapshot: 'id',
    calibration_snapshot: 'id',
};
var _idbPromise = null;

export function idbAvailable() {
    try {
        return typeof indexedDB !== 'undefined' && !!indexedDB;
    } catch (e) {
        return false;
    }
}
window.idbAvailable = idbAvailable;

export function idbOpen() {
    if (_idbPromise) return _idbPromise;
    _idbPromise = new Promise(function (resolve) {
        if (!idbAvailable()) return resolve(null);
        try {
            var req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = function (ev) {
                var db = ev.target.result;
                Object.keys(IDB_KEYPATH).forEach(function (name) {
                    if (!db.objectStoreNames.contains(name)) {
                        db.createObjectStore(name, { keyPath: IDB_KEYPATH[name] });
                    }
                });
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { resolve(null); };
            req.onblocked = function () { resolve(null); };
        } catch (e) {
            resolve(null);
        }
    });
    return _idbPromise;
}
window.idbOpen = idbOpen;

// One transaction; resolves true on commit, a read request's result for reads, or null
// if IndexedDB is unavailable / the transaction fails.
function idbRun(store, mode, work) {
    return idbOpen().then(function (db) {
        if (!db) return null;
        return new Promise(function (resolve) {
            var tx;
            try { tx = db.transaction(store, mode); } catch (e) { return resolve(null); }
            var result = null;
            tx.oncomplete = function () { resolve(result === null ? true : result); };
            tx.onerror = function () { resolve(null); };
            tx.onabort = function () { resolve(null); };
            try {
                var maybe = work(tx.objectStore(store));
                if (maybe && typeof maybe.onsuccess !== 'undefined') {
                    maybe.onsuccess = function () { result = maybe.result; };
                }
            } catch (e) { resolve(null); }
        });
    });
}

export function idbGetAll(store) {
    return idbRun(store, 'readonly', function (os) { return os.getAll(); })
        .then(function (r) { return Array.isArray(r) ? r : []; })
        .catch(function () { return []; });
}
window.idbGetAll = idbGetAll;

export function idbPutAll(store, rows) {
    return idbRun(store, 'readwrite', function (os) {
        (rows || []).forEach(function (row) { os.put(row); });
        return true;
    }).catch(function () { return null; });
}
window.idbPutAll = idbPutAll;
