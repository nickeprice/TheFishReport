/**
 * src/data/regions/washington.js - Washington region registry.
 *
 * public: window.REGIONS.WA   (schema: docs/CONTRACT_REGIONS.md)
 *
 * Classic script (one global scope), loaded BEFORE the feature modules.
 *
 * IMPORTANT: the object assigned below is STRICT JSON (double-quoted keys and
 * strings, no comments, no trailing commas) so that the Python backend can read
 * the SAME file: api/water_report.py takes everything from the WA assignment
 * marker to the final semicolon and json.loads() it. That keeps ONE source of
 * truth for the station constants shared by the JS frontend and the Python API.
 *
 * Therefore: never put comments inside the JSON payload - a comment (or a trailing
 * comma) breaks the backend parse. Put notes in docs/CONTRACT_REGIONS.md instead.
 *
 * Honesty rules: `legal_hours` is "unknown" unless a real window is verified, and
 * `stocks` is null unless the run baselines genuinely belong to that waterbody.
 */
window.REGIONS = window.REGIONS || {};
window.REGIONS.WA = {
    "state": "WA",
    "state_name": "Washington",
    "timezone": "America/Los_Angeles",
    "units": { "flow": "cfs", "gage": "ft", "temp": "F" },
    "forecast_days": 4,
    "default_site": "12101500",
    "default_coords": { "lat": 47.2028, "lon": -122.2965 },
    "default_tide_station": "9446484",
    "default_species": ["Chinook", "Coho", "Pink", "Chum", "Steelhead"],
    "netting_days": [6, 0, 1],
    "discovery_pool": [
        { "site_id": "12101500", "name": "Puyallup River at Puyallup", "coords": { "lat": 47.2028, "lon": -122.2965 } },
        { "site_id": "12093500", "name": "Puyallup River near Orting", "coords": { "lat": 47.1005, "lon": -122.2133 } },
        { "site_id": "12094000", "name": "Carbon River near Fairfax", "coords": { "lat": 47.0177, "lon": -122.0197 } },
        { "site_id": "12113000", "name": "Green River at Auburn", "coords": { "lat": 47.3125, "lon": -122.2027 } },
        { "site_id": "12089500", "name": "Nisqually River at McKenna", "coords": { "lat": 46.9365, "lon": -122.5483 } },
        { "site_id": "12200500", "name": "Skagit River near Mount Vernon", "coords": { "lat": 48.444828, "lon": -122.335437 } },
        { "site_id": "12150800", "name": "Snoqualmie River near Snoqualmie", "coords": { "lat": 47.830932, "lon": -122.048459 } },
        { "site_id": "12134500", "name": "Skykomish River near Gold Bar", "coords": { "lat": 47.837325, "lon": -121.666781 } },
        { "site_id": "12155300", "name": "Snohomish River near Monroe", "coords": { "lat": 47.93482, "lon": -122.073185 } },
        { "site_id": "12167000", "name": "North Fork Stillaguamish near Arlington", "coords": { "lat": 48.261464, "lon": -122.047617 } },
        { "site_id": "14242500", "name": "Cowlitz River near Castle Rock", "coords": { "lat": 46.336222, "lon": -122.725389 } },
        { "site_id": "14240500", "name": "Toutle River near Silver Lake", "coords": { "lat": 46.344275, "lon": -122.534553 } },
        { "site_id": "14236000", "name": "Lewis River at Ariel", "coords": { "lat": 46.558164, "lon": -122.284549 } },
        { "site_id": "14241000", "name": "Kalama River near Kalama", "coords": { "lat": 46.374831, "lon": -122.56511 } },
        { "site_id": "12115000", "name": "Cedar River near Renton", "coords": { "lat": 47.370107, "lon": -121.625101 } }
    ],
    "waterbodies": [
        {
            "id": "puyallup",
            "name": "Puyallup River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12101500", "param": "00060" },
            "related_gauges": [
                { "site_id": "12093500", "name": "Puyallup River near Orting", "role": "upstream" }
            ],
            "coords": { "lat": 47.2028, "lon": -122.2965 },
            "legal_hours": "daylight",
            "netting_sites": ["12101500", "12093500"],
            "stocks": [
                { "species": "Chinook", "peak_window": [8, 1, 9, 30], "peak_date": "09-10", "avg_run": 34000, "present": true },
                { "species": "Coho", "peak_window": [8, 25, 11, 15], "peak_date": "10-05", "avg_run": 48000, "present": true },
                { "species": "Pink", "peak_window": [8, 1, 9, 15], "peak_date": "08-20", "avg_run": 150000, "present": false }
            ],
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "carbon",
            "name": "Carbon River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12094000", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.0177, "lon": -122.0197 },
            "legal_hours": "unknown",
            "netting_sites": ["12094000"],
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "white",
            "name": "White River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12098500", "param": "00060" },
            "related_gauges": [
                { "site_id": "12098000", "name": "Mud Mountain Lake (reservoir elevation)", "role": "reservoir" }
            ],
            "coords": { "lat": 47.151187, "lon": -121.94981 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": { "dam_clarity": true },
            "no_telemetry": false
        },
        {
            "id": "green",
            "name": "Green River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12113000", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.3125, "lon": -122.2027 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "nisqually",
            "name": "Nisqually River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12089500", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 46.9365, "lon": -122.5483 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "skagit",
            "name": "Skagit River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12200500", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 48.444828, "lon": -122.335437 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "snoqualmie",
            "name": "Snoqualmie River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12150800", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.830932, "lon": -122.048459 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "skykomish",
            "name": "Skykomish River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12134500", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.837325, "lon": -121.666781 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "snohomish",
            "name": "Snohomish River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12155300", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.93482, "lon": -122.073185 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "stillaguamish",
            "name": "North Fork Stillaguamish River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12167000", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 48.261464, "lon": -122.047617 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "cowlitz",
            "name": "Cowlitz River",
            "waterbody_type": "river",
            "gauge": { "site_id": "14242500", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 46.336222, "lon": -122.725389 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "toutle",
            "name": "Toutle River",
            "waterbody_type": "river",
            "gauge": { "site_id": "14240500", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 46.344275, "lon": -122.534553 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "lewis",
            "name": "Lewis River",
            "waterbody_type": "river",
            "gauge": { "site_id": "14236000", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 46.558164, "lon": -122.284549 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "kalama",
            "name": "Kalama River",
            "waterbody_type": "river",
            "gauge": { "site_id": "14241000", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 46.374831, "lon": -122.56511 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "cedar",
            "name": "Cedar River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12115000", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.370107, "lon": -121.625101 },
            "legal_hours": "unknown",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        }
    ]
};
