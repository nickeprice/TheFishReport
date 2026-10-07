/**
 * src/services/water-weather.js - report weather painting (Open-Meteo conditions).
 * Splintered from water.js. ES module.
 */
import { logDebug } from '../shared/debug.js';
import { State } from '../shared/state.js';

window.applyReportWeather = applyReportWeather;
export function applyReportWeather(rep) {
    if (!rep) return;
    const WIND_ARROWS = { 'N':'\u2191','NNE':'\u2197','NE':'\u2197','ENE':'\u2197','E':'\u2192','ESE':'\u2198','SE':'\u2198','SSE':'\u2198','S':'\u2193','SSW':'\u2199','SW':'\u2199','WSW':'\u2199','W':'\u2190','WNW':'\u2196','NW':'\u2196','NNW':'\u2196' };
    const airT = (rep.air_temp_f !== undefined && rep.air_temp_f !== null && !isNaN(rep.air_temp_f)) ? Math.round(Number(rep.air_temp_f)) : null;
    const wSpeed = (rep.wind_speed_mph !== undefined && rep.wind_speed_mph !== null && !isNaN(rep.wind_speed_mph)) ? Number(rep.wind_speed_mph) : null;
    const wDir = (rep.wind_dir_compass !== undefined && rep.wind_dir_compass !== null) ? rep.wind_dir_compass : null;
    const pop = (rep.pop_pct !== undefined && rep.pop_pct !== null) ? rep.pop_pct : null;
    const hour = rep.weather_hour || {};
    const hourPv = (hour.precip_in !== undefined && hour.precip_in !== null) ? Number(hour.precip_in).toFixed(2) : null;
    const scope = (rep.id && document.getElementById(rep.id)) || null;
    if (!scope) return;                       // card not in the DOM (yet) -> nothing to paint

    if (wSpeed != null) {
        State.currentWindMph = wSpeed;
        State.currentWindDir = wDir;
    }

    if (airT != null) {
        scope.querySelectorAll('.air-temp').forEach(function (el) { el.innerText = airT; });
    }
    if (wSpeed != null) {
        // Arrow + the 16-point direction TEXT + the single "mph" unit.
        const windTxt = (wDir ? (WIND_ARROWS[wDir] || wDir) + ' ' + wDir + ' ' : '') + Math.round(wSpeed) + ' mph';
        scope.querySelectorAll('.wind-val').forEach(function (el) { el.innerText = windTxt; });
    }
    scope.querySelectorAll('.precip-pop').forEach(function (el) { el.innerText = (pop != null) ? pop : '--'; });
    scope.querySelectorAll('.precip-vol').forEach(function (el) { el.innerText = (hourPv != null) ? hourPv : '--'; });

    logDebug('Weather painted (' + (rep.title || rep.id) + '): Air ' + (airT == null ? '--' : airT) + 'F, Wind ' + (wSpeed == null ? '--' : Math.round(wSpeed) + ' mph ' + (wDir || '')) + ', PoP ' + (pop == null ? '--' : pop) + '%', 'NET');
}

// --- PHASE 2: HATCHERY ESCAPEMENT TRACKING ---
// Run-return registry keyed by the active USGS river gauge ID. Metrics WDFW has not
// published are left null so the UI renders "--" instead of inventing a number.
// Rivers absent from this map degrade to a clean "not tracked" state.
export var hatcheryEscapement = {
    '12101500': { system: 'Puyallup / White River', source: 'WDFW Puyallup Basin Facilities', stocks: [
        { name: 'Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Coho',         totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Jacks',        totalReturn: null, trapCount: null, fiveYrAvg: null }
    ]},
    '12093500': { system: 'Puyallup / White River (Orting)', source: 'WDFW Puyallup Basin Facilities', stocks: [
        { name: 'Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Coho',         totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Jacks',        totalReturn: null, trapCount: null, fiveYrAvg: null }
    ]},
    '12094000': { system: 'Puyallup / White River (Carbon)', source: 'WDFW Puyallup Basin Facilities', stocks: [
        { name: 'Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Coho',         totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Jacks',        totalReturn: null, trapCount: null, fiveYrAvg: null }
    ]},
    '12113000': { system: 'Green River', source: 'WDFW Soos Creek Hatchery', stocks: [
        { name: 'Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Pink',    totalReturn: null, trapCount: null, fiveYrAvg: null }
    ]},
    '12200500': { system: 'Skagit River', source: 'WDFW Marblemount Hatchery', stocks: [
        { name: 'Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
        { name: 'Chum',    totalReturn: null, trapCount: null, fiveYrAvg: null }
    ]}
};

// Live feed: Socrata (data.wa.gov) "WDFW-Hatchery Adult Salmon Returns". This endpoint
// is CORS-enabled, so the browser can query it directly with no proxy.
export const ESCAPEMENT_SOCRATA = 'https://data.wa.gov/resource/9q4e-xhag.json';
// Only the event that represents adults physically RETURNING to the facility. The other
// events (Adult Plant / Mortality / Surplus / Parent Spawn / EggTake) re-count those very
// same fish, so summing every event would inflate the total several times over.
export const ESCAPEMENT_EVENT = 'Trap Estimate';
// Shown under the counts fold whenever WDFW exposes no usable :updated_at stamp.
// Shared by app.js (first paint) and refreshEscapement (after the live fetch) so
// the UI never invents a date.
export const ESCAPEMENT_UPDATED_FALLBACK = 'Hatchery data may lag WDFW reporting.';
// Active USGS river gauge ID -> WDFW `facility` string(s) exactly as spelled in the
// dataset. The whole Puyallup / White River basin is pooled into one query per gauge:
// today only VOIGHTS CR HATCHERY actively reports Trap Estimates (PUYALLUP HATCHERY's
// stopped in 2000, and CLARKS CR / WHITE RIVER / BUCKLEY TRAP / DIRU CREEK have no rows
// yet), so they ride along in the IN clause and light up automatically if WDFW adds them.
// Anything unmapped (e.g. Nisqually 12089500) renders the "no tracking" state.
export var PUYALLUP_BASIN_FACILITIES = [
    'VOIGHTS CR HATCHERY', 'PUYALLUP HATCHERY', 'CLARKS CR HATCHERY',
    'WHITE RIVER HATCHERY', 'BUCKLEY TRAP', 'DIRU CREEK'
];
export var escapementFacilities = {
    '12101500': PUYALLUP_BASIN_FACILITIES, // Puyallup River at Puyallup
    '12093500': PUYALLUP_BASIN_FACILITIES, // Puyallup River near Orting
    '12094000': PUYALLUP_BASIN_FACILITIES, // Carbon River (Puyallup system)
    '12113000': ['SOOS CREEK HATCHERY'],   // Green River at Auburn
    '12200500': ['MARBLEMOUNT HATCHERY']   // Skagit River
};

// Counts render as "--" until a published figure exists.
