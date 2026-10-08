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
// Shared stock arrays keyed by Socrata (species, run) combinations per waterbody.
// Run-qualified names (e.g. "Fall Chinook", "Winter Steelhead") let the count
// pipeline split totals by season; base-species matching in refreshEscapement
// and hero.js collapses them into the correct calendar card.
var PUYALLUP_BASIN_STOCKS = [
    { name: 'Fall Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Jacks',   totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Pink',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null }
];
var GREEN_STOCKS = [
    { name: 'Fall Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Pink',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Chum',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Summer Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter-Late Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null }
];
var SKAGIT_STOCKS = [
    { name: 'Spring Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Summer Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Fall Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Chum',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Pink',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Summer Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null }
];
var SNOQUALMIE_STOCKS = [
    { name: 'Fall Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Spring Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Summer Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null }
];
var SKYKOMISH_STOCKS = [
    { name: 'Summer Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Summer Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter-Late Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null }
];
var SNOHOMISH_STOCKS = [
    { name: 'Summer Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Fall Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Summer Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter-Late Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null }
];
var STILLAGUAMISH_STOCKS = [
    { name: 'Fall Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Chum',    totalReturn: null, trapCount: null, fiveYrAvg: null }
];
var COWLITZ_STOCKS = [
    { name: 'Spring Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Fall Chinook',  totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Summer Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter-Late Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null }
];
var CEDAR_STOCKS = [
    { name: 'Fall Chinook', totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Coho',    totalReturn: null, trapCount: null, fiveYrAvg: null },
    { name: 'Winter Steelhead', totalReturn: null, trapCount: null, fiveYrAvg: null }
];
export var hatcheryEscapement = {
    // === PUYALLUP BASIN (all share the same stock composition) ===
    '12101500': { system: 'Puyallup / White River', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    '12093500': { system: 'Puyallup / White River (Orting)', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    '12096500': { system: 'Puyallup / White River (Alderton)', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    '12101470': { system: 'Puyallup / White River (5th St Br)', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    '12096505': { system: 'Puyallup / White River (E Main Br)', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    '12092000': { system: 'Puyallup / White River (Electron)', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    '12094000': { system: 'Carbon River (Puyallup basin)', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    '12097850': { system: 'White River (Puyallup basin)', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    '12100490': { system: 'White River at R St (Puyallup basin)', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    '12101100': { system: 'Lake Tapps / White R (Puyallup basin)', source: 'WDFW Puyallup Basin Facilities', stocks: PUYALLUP_BASIN_STOCKS },
    // === GREEN RIVER ===
    '12113000': { system: 'Green River', source: 'WDFW Soos Creek Hatchery', stocks: GREEN_STOCKS },
    '12108800': { system: 'Green River (Crisp Cr)', source: 'WDFW Soos Creek Hatchery', stocks: GREEN_STOCKS },
    '12113150': { system: 'Green River (Kent)', source: 'WDFW Soos Creek Hatchery', stocks: GREEN_STOCKS },
    '12113310': { system: 'Green River (Meeker)', source: 'WDFW Soos Creek Hatchery', stocks: GREEN_STOCKS },
    '12113340': { system: 'Green River (212 St)', source: 'WDFW Soos Creek Hatchery', stocks: GREEN_STOCKS },
    '12113350': { system: 'Green River (Tukwila)', source: 'WDFW Soos Creek Hatchery', stocks: GREEN_STOCKS },
    // === SKAGIT RIVER ===
    '12200500': { system: 'Skagit River', source: 'WDFW Marblemount Hatchery', stocks: SKAGIT_STOCKS },
    '12194000': { system: 'Skagit River (Concrete)', source: 'WDFW Marblemount Hatchery', stocks: SKAGIT_STOCKS },
    // === SNOQUALMIE RIVER ===
    '12144500': { system: 'Snoqualmie River', source: 'WDFW Fallert Creek Hatchery', stocks: SNOQUALMIE_STOCKS },
    '12149000': { system: 'Snoqualmie River (Carnation)', source: 'WDFW Fallert Creek Hatchery', stocks: SNOQUALMIE_STOCKS },
    // === SKYKOMISH RIVER ===
    '12134500': { system: 'Skykomish River', source: 'WDFW Reiter Ponds', stocks: SKYKOMISH_STOCKS },
    // === SNOHOMISH RIVER ===
    '12150800': { system: 'Snohomish River', source: 'WDFW Wallace R Hatchery', stocks: SNOHOMISH_STOCKS },
    // === STILLAGUAMISH RIVER ===
    '12167000': { system: 'Stillaguamish River', source: 'WDFW Samish Hatchery', stocks: STILLAGUAMISH_STOCKS },
    // === COWLITZ RIVER + NF Toutle ===
    '14243000': { system: 'Cowlitz River (Castle Rock)', source: 'WDFW Cowlitz Salmon Hatchery', stocks: COWLITZ_STOCKS },
    '14238000': { system: 'Cowlitz River (Mayfield)', source: 'WDFW Cowlitz Salmon Hatchery', stocks: COWLITZ_STOCKS },
    '14233500': { system: 'Cowlitz River (Kosmos)', source: 'WDFW Cowlitz Salmon Hatchery', stocks: COWLITZ_STOCKS },
    '14240525': { system: 'NF Toutle River', source: 'WDFW Cowlitz Salmon Hatchery', stocks: COWLITZ_STOCKS },
    // === CEDAR RIVER ===
    '12119000': { system: 'Cedar River', source: 'WDFW Issaquah Hatchery', stocks: CEDAR_STOCKS }
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
// dataset (verified via F5a Socrata distinct queries). The whole Puyallup / White
// River basin is pooled into one query per gauge: today only VOIGHTS CR HATCHERY
// actively reports Trap Estimates (PUYALLUP HATCHERY stopped in 2000, and the
// others have no rows yet), so they ride along in the IN clause and light up
// automatically if WDFW adds them. Anything unmapped (Nisqually 12089500,
// Duwamish 12113390, Big Soos 12112600, Mill Creek 12113347) renders "--".
export var PUYALLUP_BASIN_FACILITIES = [
    'VOIGHTS CR HATCHERY', 'PUYALLUP HATCHERY', 'CLARKS CR HATCHERY',
    'WHITE RIVER HATCHERY', 'BUCKLEY TRAP', 'DIRU CREEK'
];
export var escapementFacilities = {
    // === PUYALLUP BASIN (all share the pooled facility list) ===
    '12101500': PUYALLUP_BASIN_FACILITIES, // Puyallup River at Puyallup
    '12093500': PUYALLUP_BASIN_FACILITIES, // Puyallup River near Orting
    '12096500': PUYALLUP_BASIN_FACILITIES, // Puyallup River at Alderton (seasonal)
    '12101470': PUYALLUP_BASIN_FACILITIES, // Puyallup River at 5th St Bridge (seasonal)
    '12096505': PUYALLUP_BASIN_FACILITIES, // Puyallup River at E Main Bridge (seasonal)
    '12092000': PUYALLUP_BASIN_FACILITIES, // Puyallup River near Electron
    '12094000': PUYALLUP_BASIN_FACILITIES, // Carbon River near Fairfax
    '12097850': PUYALLUP_BASIN_FACILITIES, // White River below Clearwater nr Buckley
    '12100490': PUYALLUP_BASIN_FACILITIES, // White River at R Street near Auburn (seasonal)
    '12101100': PUYALLUP_BASIN_FACILITIES, // Lake Tapps Diversion at Dieringer
    // === GREEN RIVER ===
    '12113000': ['SOOS CREEK HATCHERY'],   // Green River near Auburn
    '12108800': ['SOOS CREEK HATCHERY'],   // Green River below Crisp Creek nr Black Diamond (seasonal)
    '12113150': ['SOOS CREEK HATCHERY'],   // Green River above S 277th St at Kent (seasonal)
    '12113310': ['SOOS CREEK HATCHERY'],   // Green River below Meeker St at Kent (seasonal)
    '12113340': ['SOOS CREEK HATCHERY'],   // Green River at 212 St near Kent (seasonal)
    '12113350': ['SOOS CREEK HATCHERY'],   // Green River at Tukwila (seasonal)
    // === SKAGIT RIVER ===
    '12200500': ['MARBLEMOUNT HATCHERY'],  // Skagit River near Mount Vernon
    '12194000': ['MARBLEMOUNT HATCHERY'],  // Skagit River near Concrete
    // === SNOQUALMIE RIVER ===
    '12144500': ['FALLERT CR HATCHERY'],   // Snoqualmie River near Snoqualmie
    '12149000': ['FALLERT CR HATCHERY'],   // Snoqualmie River near Carnation
    // === SKYKOMISH RIVER ===
    '12134500': ['REITER PONDS'],           // Skykomish River near Gold Bar
    // === SNOHOMISH RIVER ===
    '12150800': ['WALLACE R HATCHERY'],    // Snohomish River near Monroe
    // === STILLAGUAMISH RIVER ===
    '12167000': ['SAMISH HATCHERY'],        // N Fork Stillaguamish near Arlington
    // === COWLITZ RIVER (including NF Toutle) ===
    '14243000': ['COWLITZ SALMON HATCHERY', 'COWLITZ TROUT HATCHERY'], // Cowlitz at Castle Rock
    '14238000': ['COWLITZ SALMON HATCHERY', 'COWLITZ TROUT HATCHERY'], // Cowlitz below Mayfield Dam
    '14233500': ['COWLITZ SALMON HATCHERY', 'COWLITZ TROUT HATCHERY'], // Cowlitz near Kosmos (seasonal)
    '14240525': ['COWLITZ SALMON HATCHERY', 'COWLITZ TROUT HATCHERY'], // NF Toutle below SRS nr Kid Valley
    // === CEDAR RIVER ===
    '12119000': ['ISSAQUAH HATCHERY', 'CEDAR RIVER HATCHERY'] // Cedar River at Renton
};

// Counts render as "--" until a published figure exists.
