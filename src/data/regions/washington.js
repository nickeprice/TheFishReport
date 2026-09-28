/**
 * src/data/regions/washington.js - Washington region registry.
 *
 * public: window.REGIONS.WA  (see docs/CONTRACT_REGIONS.md for the schema)
 *
 * Classic script (global scope), loaded BEFORE the feature modules. This file is
 * DATA ONLY - nothing reads it yet in Phase 1.2; api/water_report.py is made to read
 * it in 1.3 and the frontend readers in 1.4/1.5.
 *
 * Every value here mirrors a constant that used to be hardcoded in
 * api/water_report.py / index.html (see the CONTRACT's "what it replaces" table).
 * Honesty rules: `legal_hours: 'unknown'` where no verified window exists, and
 * `stocks: null` unless the baselines genuinely belong to that waterbody.
 */
window.REGIONS = window.REGIONS || {};

window.REGIONS.WA = {
    state: 'WA',
    state_name: 'Washington',
    // Pacific wall-clock drives "today", the 4 forecast days, netting weekday checks,
    // sunrise/sunset and the tide-day filter (see the Phase 2.4.1 timezone fix).
    timezone: 'America/Los_Angeles',
    units: { flow: 'cfs', gage: 'ft', temp: 'F' },
    forecast_days: 4,

    // Was USGS_SITE / LAT,LON in api/water_report.py and fallbackStation() in
    // src/features/station/picker.js.
    default_site: '12101500',
    default_coords: { lat: 47.1950, lon: -122.3020 },   // Puyallup River at Puyallup

    // Was NOAA_STATION. Used by every waterbody that does not override `tide_station`.
    // Phase 2.2 replaces this with dynamic nearest-gauge pairing.
    default_tide_station: '9446484',

    // Mirrors the current global #species dropdown options.
    default_species: ['Chinook', 'Coho', 'Pink', 'Chum', 'Steelhead'],

    // Was NETTING_DAYS. 0 = Sunday. Netting is a Puyallup/White/Carbon basin reality only.
    netting_days: [6, 0, 1],

    // Was nearbyStationIds in api/water_report.py (15 curated WA river gauges, sorted
    // by distance for the 'Use My GPS' flow). TEMPORARY: UPDATE 3.0 Phase 2 replaces
    // this with USGS WDFN site-index discovery. Do not build new features on it.
    discovery_pool: [
        { site_id: '12101500', name: 'Puyallup River at Puyallup', coords: { lat: 47.1950, lon: -122.3020 } },
        { site_id: '12093500', name: 'Puyallup River near Orting', coords: { lat: 47.1005, lon: -122.2133 } },
        { site_id: '12094000', name: 'Carbon River near Fairfax', coords: { lat: 47.0177, lon: -122.0197 } },
        { site_id: '12113000', name: 'Green River at Auburn', coords: { lat: 47.3115, lon: -122.2265 } },
        { site_id: '12089500', name: 'Nisqually River at McKenna', coords: { lat: 46.9365, lon: -122.5483 } },
        { site_id: '12200500', name: 'Skagit River near Mount Vernon', coords: null },
        { site_id: '12150800', name: 'Snoqualmie River near Snoqualmie', coords: null },
        { site_id: '12134500', name: 'Skykomish River near Gold Bar', coords: null },
        { site_id: '12155300', name: 'Snohomish River near Monroe', coords: null },
        { site_id: '12167000', name: 'North Fork Stillaguamish near Arlington', coords: null },
        { site_id: '14242500', name: 'Cowlitz River near Castle Rock', coords: null },
        { site_id: '14240500', name: 'Toutle River near Silver Lake', coords: null },
        { site_id: '14236000', name: 'Lewis River at Ariel', coords: null },
        { site_id: '14241000', name: 'Kalama River near Kalama', coords: null },
        { site_id: '12115000', name: 'Cedar River near Renton', coords: null }
    ],

    waterbodies: [
        {
            id: 'puyallup',
            name: 'Puyallup River',
            waterbody_type: 'river',
            gauge: { site_id: '12101500', param: '00060' },
            related_gauges: [
                { site_id: '12093500', name: 'Puyallup River near Orting', role: 'upstream' }
            ],
            coords: { lat: 47.1950, lon: -122.3020 },
            // Mirrors the current implementation (lines_in/lines_out = ±1h around
            // sunrise/sunset). To be confirmed against the WDFW rules in Phase 1.5.
            legal_hours: 'daylight',
            netting_sites: ['12101500', '12093500'],
            // Was STOCK_BASELINES (Puyallup-basin run numbers).
            stocks: [
                { species: 'Chinook', peak_window: [8, 1, 9, 30], peak_date: '09-10', avg_run: 34000 },
                { species: 'Coho', peak_window: [8, 25, 11, 15], peak_date: '10-05', avg_run: 48000 },
                { species: 'Pink', peak_window: [8, 1, 9, 15], peak_date: '08-20', avg_run: 150000 }
            ],
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'carbon',
            name: 'Carbon River',
            waterbody_type: 'river',
            gauge: { site_id: '12094000', param: '00060' },
            related_gauges: null,
            coords: { lat: 47.0177, lon: -122.0197 },
            legal_hours: 'unknown',
            netting_sites: ['12094000'],
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'white',
            name: 'White River',
            waterbody_type: 'river',
            // White River is the Puyallup system's other major fork. Its gauge feeds the
            // dam-clarity signal (streamflow) and Mud Mountain Lake (reservoir elevation).
            gauge: { site_id: '12098500', param: '00060' },
            related_gauges: [
                { site_id: '12098000', name: 'Mud Mountain Lake (reservoir elevation)', role: 'reservoir' }
            ],
            coords: null,   // no verified coordinates in the codebase
            legal_hours: 'unknown',
            netting_sites: null,   // not in NETTING_SITES — clarity only
            stocks: null,
            // Replaces the `site in NETTING_SITES` gate for fetch_dam_clarity().
            capabilities: { dam_clarity: true },
            no_telemetry: false
        },
        {
            id: 'green',
            name: 'Green River',
            waterbody_type: 'river',
            gauge: { site_id: '12113000', param: '00060' },
            related_gauges: null,
            coords: { lat: 47.3115, lon: -122.2265 },
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'nisqually',
            name: 'Nisqually River',
            waterbody_type: 'river',
            gauge: { site_id: '12089500', param: '00060' },
            related_gauges: null,
            coords: { lat: 46.9365, lon: -122.5483 },
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'skagit',
            name: 'Skagit River',
            waterbody_type: 'river',
            gauge: { site_id: '12200500', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'snoqualmie',
            name: 'Snoqualmie River',
            waterbody_type: 'river',
            gauge: { site_id: '12150800', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'skykomish',
            name: 'Skykomish River',
            waterbody_type: 'river',
            gauge: { site_id: '12134500', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'snohomish',
            name: 'Snohomish River',
            waterbody_type: 'river',
            gauge: { site_id: '12155300', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'stillaguamish',
            name: 'North Fork Stillaguamish River',
            waterbody_type: 'river',
            gauge: { site_id: '12167000', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'cowlitz',
            name: 'Cowlitz River',
            waterbody_type: 'river',
            gauge: { site_id: '14242500', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'toutle',
            name: 'Toutle River',
            waterbody_type: 'river',
            gauge: { site_id: '14240500', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'lewis',
            name: 'Lewis River',
            waterbody_type: 'river',
            gauge: { site_id: '14236000', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'kalama',
            name: 'Kalama River',
            waterbody_type: 'river',
            gauge: { site_id: '14241000', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        },
        {
            id: 'cedar',
            name: 'Cedar River',
            waterbody_type: 'river',
            gauge: { site_id: '12115000', param: '00060' },
            related_gauges: null,
            coords: null,
            legal_hours: 'unknown',
            netting_sites: null,
            stocks: null,
            capabilities: {},
            no_telemetry: false
        }
    ]
};
