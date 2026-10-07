/**
 * src/features/gear-sim/report-state.js — shared water-report state accessors.
 *
 * Extracted from sonar.js in Phase 8.3 to break the zone-core/sonar/zone-env
 * dependency cycle. Leaf module — imports nothing from gear-sim or telemetry.
 *
 * public: getActiveReport(), getCurrentFlow()
 * ES module.
 */

// The active day index set by daynav.js — starts at 0 (today).
export var activeDateOffset = 0;
window.activeDateOffset = activeDateOffset;

// The full water-report payload array.
export var reportsData = [];
window.reportsData = reportsData;

// Setter MUST use a unique function name (20+ chars) that Rollup cannot
// minify to the same 2-letter name as Leaflet's position setter.
// If they collide, reportsData stays empty and day navigation breaks.
export var setReportDataAndWindow = function setReportDataAndWindow(arr) {
    reportsData = arr;
    window.reportsData = reportsData;
};

export var setActiveOffsetAndWindow = function setActiveOffsetAndWindow(n) {
    activeDateOffset = n;
    window.activeDateOffset = activeDateOffset;
};

// Live discharge for the Gear Sim + Catch Log. There is NO user-facing flow
// input any more: the value comes from the current water report, falls back to
// the last reading we saw this session, and finally to the 1040 CFS reference so
// the solver always has a number to work with. It is still RECORDED on a catch.
let lastKnownFlow = null;

export function getActiveReport() {
    if (typeof reportsData !== 'undefined' && typeof activeDateOffset !== 'undefined' &&
        activeDateOffset >= 0 && activeDateOffset < reportsData.length) {
        return reportsData[activeDateOffset];
    }
    return null;
}

export function getCurrentFlow() {
    const rep = getActiveReport();
    if (!rep) return (lastKnownFlow !== null) ? lastKnownFlow : 1040;
    const provVal = window.provVal;
    if (typeof provVal === 'function') {
        const cfsV = provVal(rep.cfs);
        if (cfsV !== null && cfsV !== undefined && !rep.api_offline) {
            lastKnownFlow = cfsV;
            return cfsV;
        }
    } else {
        if (rep.cfs !== undefined && rep.cfs !== null && !rep.api_offline) {
            lastKnownFlow = Number(rep.cfs);
            return Number(rep.cfs);
        }
    }
    if (lastKnownFlow !== null) return lastKnownFlow;
    return 1040;
}