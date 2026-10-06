/**
 * src/shared/refresh.js - auto-refresh of the live report (a homescreen PWA has
 * no pull-to-refresh): every 5 min while visible+online, on foreground, on regain.
 * public: AUTO_REFRESH_MS, silenceableRefresh(), startAutoRefresh(), refreshNow()
 * ES module.
 */
import { loadWaterReport } from '../features/telemetry/report.js';
import { showToast } from './ui.js';
import { logDebug } from './debug.js';
// --- AUTO-REFRESH ---
// A homescreen PWA has no pull-to-refresh, so the live telemetry is re-fetched
// on its own: every 5 minutes while visible+online, the moment the app comes
// back to the foreground, and when connectivity returns. All three routes call
// loadWaterReport(true) — a "silent" refresh that updates the whole report +
// hero but never overwrites a Gear Sim CFS the angler typed by hand.
export var AUTO_REFRESH_MS = 5 * 60 * 1000;
var autoRefreshTimer = null;

export function silenceableRefresh() {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        loadWaterReport(true);
    }
}

export function startAutoRefresh() {
    if (autoRefreshTimer) return;
    // Periodic: keep the data fresh while the app sits open.
    autoRefreshTimer = setInterval(silenceableRefresh, AUTO_REFRESH_MS);
    // Foregrounding: the classic "I picked up my phone" moment.
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') silenceableRefresh();
    });
    logDebug('Auto-refresh armed (every ' + (AUTO_REFRESH_MS / 60000) + ' min + on foreground)', 'PWA');
}

// Manual refresh affordance (header ⟳) for a standalone PWA.
export function refreshNow() {
    loadWaterReport(true);
    showToast('Refreshing live data\u2026', 'info', 2000);
}
window.refreshNow = refreshNow;
window.silenceableRefresh = silenceableRefresh;
window.startAutoRefresh = startAutoRefresh;
