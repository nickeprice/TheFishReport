/**
 * src/shared/api.js - one resilient GET for the app's OWN /api/* endpoints.
 *
 * public: apiGetJson(path, opts) -> { ok, status, data, error, serverMessage, note }
 *
 * WHY: every /api/* call leaves the device (dev server, Cloudflare tunnel, serverless) and
 * the FIRST request on a cold tunnel can come back as an HTML error page instead of JSON -
 * a documented, recurring flake (src/features/station/picker.js retries for exactly this).
 * The map and spot paths had no retry, so one cold request showed up as "Could not load
 * nearby gauges" / "Could not reach the gauge lookup" while the endpoint was healthy a
 * moment later (2026-09-29 phone report).
 *
 * `ok:false` means WE COULD NOT ASK (network / timeout / non-2xx / unreadable body). It is
 * never "the data says no" - callers must keep those two apart in their wording. `status`,
 * `error` and the server's own `serverMessage` say which one it was.
 *
 * The status plus a SANITISED slice of the body go to the debug trail, so a 502 tunnel page
 * is distinguishable from a code bug. The query string is NEVER logged - it carries the
 * angler's coordinates (AGENTS.md GPS hygiene) - and the body is escaped because
 * logDebug() writes with innerHTML.
 *
 * Classic script (global scope). Loaded AFTER src/shared/format.js (uses escapeHtml).
 * ES module.
 */
import { escapeHtml } from './format.js';
import { logDebug } from './debug.js';
const API_RETRY_DELAY_MS = 700;
const API_TIMEOUT_MS = 12000;

export function apiSleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
}

// The path without its query string: the only form of an API url that is safe to log.
function apiLogLabel(path) {
    return String(path || '').split('?')[0];
}

// A short, single-line, HTML-escaped slice of a response body - enough to recognise a
// Cloudflare/gateway error page without ever injecting markup or coordinates.
function apiBodySnippet(body) {
    const s = String(body == null ? '' : body).replace(/\s+/g, ' ').slice(0, 120);
    return (typeof escapeHtml === 'function') ? escapeHtml(s) : s.replace(/[<>]/g, '');
}

function apiLog(path, text) {
    if (typeof logDebug === 'function') logDebug('GET ' + apiLogLabel(path) + ' -> ' + text, 'ERR');
}

// The server's own explanation, when a failure body is JSON we understand.
function apiServerMessage(data) {
    if (!data) return null;
    const msg = data.error || data.note || null;
    return msg ? String(msg).slice(0, 120) : null;
}

function apiParseJson(body) {
    try {
        const d = JSON.parse(body);
        return (d && typeof d === 'object') ? d : null;
    } catch (e) {
        return null;
    }
}

// { signal, done() } - the abort timer is cleared on every path, so no timer outlives its call.
function apiTimeout(ms) {
    if (typeof AbortController === 'undefined' || !ms) return { signal: undefined, done: function () {} };
    const c = new AbortController();
    const t = setTimeout(function () { c.abort(); }, ms);
    return { signal: c.signal, done: function () { clearTimeout(t); } };
}

export async function apiGetJson(path, opts) {
window.apiGetJson = apiGetJson;
    opts = opts || {};
    const attempts = opts.attempts || 2;
    let status = 0;
    let error = null;
    let serverMessage = null;
    for (let i = 0; i < attempts; i++) {
        const t = apiTimeout(opts.timeoutMs || API_TIMEOUT_MS);
        try {
            const res = await fetch(path, { cache: 'no-store', signal: t.signal });
            status = res.status;
            const body = await res.text();
            t.done();
            const data = apiParseJson(body);
            if (res.ok) {
                if (data) {
                    return { ok: true, status: status, data: data, error: null,
                             serverMessage: null, note: data.note || '' };
                }
                error = 'unreadable response';
                apiLog(path, 'HTTP ' + status + ' ' + apiBodySnippet(body));
            } else {
                error = 'HTTP ' + status;
                serverMessage = apiServerMessage(data);
                apiLog(path, error + ' ' + apiBodySnippet(serverMessage || body));
                // A 4xx is the server's FINAL answer (e.g. "outside the covered region"):
                // retrying cannot change it, so report it straight away.
                if (status < 500) {
                    return { ok: false, status: status, data: null, error: error,
                             serverMessage: serverMessage, note: '' };
                }
            }
        } catch (e) {
            t.done();
            error = (e && e.name === 'AbortError') ? 'timed out' : 'network error';
            apiLog(path, error);
        }
        if (i < attempts - 1) await apiSleep(API_RETRY_DELAY_MS);
    }
    return { ok: false, status: status, data: null, error: error || 'unreachable',
             serverMessage: serverMessage, note: '' };
}
