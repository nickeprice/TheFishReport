/**
 * src/shared/pwa.js - service-worker registration (tap-to-apply updates; never an
 * auto-reload that would discard a half-typed catch) + ?tab= deep links.
 * public: registerServiceWorker(), applyTabDeepLink()
 * ES module.
 */
// --- PWA: SERVICE WORKER REGISTRATION ---
// Called from window.onload, so the document is already fully loaded and the
// worker install will not compete with first paint. Failures are non-fatal: the
// app works exactly as before without a worker.
//
// NOTE: this must NOT wrap registration in another 'load' listener. window.onload
// runs *during* the load event's dispatch, and the DOM copies the listener list
// before invoking it, so a listener added here would never fire.
import { logDebug } from './debug.js';
import { showToast } from './ui.js';
import { silenceableRefresh } from './refresh.js';
export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        logDebug('Service worker unsupported - PWA caching disabled', 'PWA');
        return;
    }

    navigator.serviceWorker.register('/sw.js').then(function (reg) {
        logDebug('Service worker registered (scope ' + reg.scope + ')', 'PWA');

        reg.addEventListener('updatefound', function () {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', function () {
                if (installing.state !== 'installed') return;
                if (navigator.serviceWorker.controller) {
                    // A new version finished caching. Do NOT reload automatically:
                    // an angler mid-way through a catch log would lose typed data.
                    // Offer the update instead and let them choose when to apply.
                    logDebug('New app version cached - awaiting user approval', 'PWA');
                    showToast('Update ready for the next launch', 'info', 8000, {
                        label: 'UPDATE NOW',
                        onClick: function () {
                            installing.postMessage({ type: 'SKIP_WAITING' });
                            // Give the new worker a moment to claim clients first.
                            setTimeout(function () { window.location.reload(); }, 400);
                        }
                    });
                } else {
                    logDebug('App shell cached for offline use', 'PWA');
                    showToast('Offline mode ready', 'success', 2500);
                }
            });
        });
    }).catch(function (err) {
        logDebug('Service worker registration failed: ' + err.message, 'PWA');
    });

    // Tell the angler when connectivity changes, since the water report depends
    // on it and the offline shell can serve stale numbers. On reconnect, actually
    // re-fetch so a homescreen install self-heals without a manual refresh.
    if ('onLine' in navigator) {
        window.addEventListener('online', function () {
            showToast('Back online - refreshing live data', 'success', 2500);
            logDebug('Network restored', 'PWA');
            silenceableRefresh();
        });
        window.addEventListener('offline', function () {
            showToast('Offline - showing cached river data', 'warn', 4000);
            logDebug('Network lost - offline shell active', 'PWA');
        });
    }
}
window.registerServiceWorker = registerServiceWorker;

// Apply a ?tab= deep link so the PWA manifest shortcuts land on the right tool.
export function applyTabDeepLink() {
    try {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (!tab) return false;
        if (!document.getElementById(tab)) return false;
        document.querySelectorAll('.tab-content').forEach(function (el) {
            el.classList.remove('tab-active');
        });
        document.getElementById(tab).classList.add('tab-active');
        logDebug('Deep link opened ' + tab, 'UI');
        return true;
    } catch (e) {
        return false;
    }
}
window.applyTabDeepLink = applyTabDeepLink;
