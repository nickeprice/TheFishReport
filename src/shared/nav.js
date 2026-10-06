/**
 * src/shared/nav.js - tab navigation + date reset.
 * public: switchTab(tabId), resetToToday()
 * ES module.
 */
// --- NAVIGATION ---
import { logDebug } from './debug.js';
export function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('tab-active'); });
    document.getElementById(tabId).classList.add('tab-active');
    // Keep the persistent bottom tab bar in sync (deep links / bootstrap call
    // switchTab too, so the aria-selected + active class must follow the tab).
    var btnMap = {
        'tab-water-report': 'tab-btn-water-report',
        'tab-gear-sim': 'tab-btn-gear-sim',
        'tab-catch-log': 'tab-btn-catch-log'
    };
    document.querySelectorAll('#bottom-tab-bar .tab-btn').forEach(function(btn) {
        var on = (btn.id === btnMap[tabId]);
        btn.classList.toggle('tab-btn-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    logDebug("Switched to " + tabId, "UI");
}
window.switchTab = switchTab;

// Tapping the date header resets paging back to "Today" (offset 0).
export function resetToToday() {
    if (activeDateOffset === 0) return;
    activeDateOffset = 0;
    window.activeDateOffset = activeDateOffset;
    updateActiveDateUI();
}
window.resetToToday = resetToToday;
