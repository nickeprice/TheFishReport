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
        { "site_id": "12101500", "name": "Puyallup River at Puyallup", "coords": { "lat": 47.20843, "lon": -122.3271 }, "gauge_type": "permanent" },
        { "site_id": "12093500", "name": "Puyallup River near Orting", "coords": { "lat": 47.1005, "lon": -122.2133 }, "gauge_type": "permanent" },
        { "site_id": "12096500", "name": "Puyallup River at Alderton", "coords": { "lat": 47.1851, "lon": -122.2296 }, "gauge_type": "permanent" },
        { "site_id": "12101470", "name": "Puyallup River at 5th St Bridge", "coords": { "lat": 47.1987, "lon": -122.2873 }, "gauge_type": "permanent" },
        { "site_id": "12096505", "name": "Puyallup River at E Main Bridge", "coords": { "lat": 47.1967, "lon": -122.2509 }, "gauge_type": "permanent" },
        { "site_id": "12092000", "name": "Puyallup River near Electron", "coords": { "lat": 47.1398, "lon": -122.0796 }, "gauge_type": "permanent" },
        { "site_id": "12094000", "name": "Carbon River near Fairfax", "coords": { "lat": 47.0177, "lon": -122.0197 }, "gauge_type": "permanent" },
        { "site_id": "12097850", "name": "White River below Clearwater nr Buckley", "coords": { "lat": 47.1639, "lon": -121.8498 }, "gauge_type": "permanent" },
        { "site_id": "12100490", "name": "White River at R Street near Auburn", "coords": { "lat": 47.3672, "lon": -122.1471 }, "gauge_type": "permanent" },
        { "site_id": "12113000", "name": "Green River near Auburn", "coords": { "lat": 47.3125, "lon": -122.2027 }, "gauge_type": "permanent" },
        { "site_id": "12108800", "name": "Green River below Crisp Creek nr Black Diamond", "coords": { "lat": 47.4283, "lon": -122.0267 }, "gauge_type": "permanent" },
        { "site_id": "12113150", "name": "Green River above S 277th St at Kent", "coords": { "lat": 47.4456, "lon": -122.2320 }, "gauge_type": "permanent" },
        { "site_id": "12113310", "name": "Green River below Meeker St at Kent", "coords": { "lat": 47.4648, "lon": -122.2478 }, "gauge_type": "permanent" },
        { "site_id": "12113340", "name": "Green River at 212 St near Kent", "coords": { "lat": 47.4742, "lon": -122.2538 }, "gauge_type": "permanent" },
        { "site_id": "12113350", "name": "Green River at Tukwila", "coords": { "lat": 47.5008, "lon": -122.2615 }, "gauge_type": "permanent" },
        { "site_id": "12113390", "name": "Duwamish River at Golf Course at Tukwila", "coords": { "lat": 47.5109, "lon": -122.2636 }, "gauge_type": "permanent" },
        { "site_id": "12112600", "name": "Big Soos Creek above Hatchery near Auburn", "coords": { "lat": 47.4534, "lon": -122.1739 }, "gauge_type": "permanent" },
        { "site_id": "12113347", "name": "Mill Creek at Earthworks Park at Kent", "coords": { "lat": 47.4690, "lon": -122.2584 }, "gauge_type": "permanent" },
        { "site_id": "12089500", "name": "Nisqually River at McKenna", "coords": { "lat": 46.9365, "lon": -122.5483 }, "gauge_type": "permanent" },
        { "site_id": "12200500", "name": "Skagit River near Mount Vernon", "coords": { "lat": 48.4448, "lon": -122.3354 }, "gauge_type": "permanent" },
        { "site_id": "12194000", "name": "Skagit River near Concrete", "coords": { "lat": 48.5307, "lon": -121.8671 }, "gauge_type": "permanent" },
        { "site_id": "12144500", "name": "Snoqualmie River near Snoqualmie", "coords": { "lat": 47.6805, "lon": -121.7904 }, "gauge_type": "permanent" },
        { "site_id": "12149000", "name": "Snoqualmie River near Carnation", "coords": { "lat": 47.6844, "lon": -121.9457 }, "gauge_type": "permanent" },
        { "site_id": "12134500", "name": "Skykomish River near Gold Bar", "coords": { "lat": 47.8373, "lon": -121.6668 }, "gauge_type": "permanent" },
        { "site_id": "12150800", "name": "Snohomish River near Monroe", "coords": { "lat": 47.8309, "lon": -122.0485 }, "gauge_type": "permanent" },
        { "site_id": "12167000", "name": "North Fork Stillaguamish near Arlington", "coords": { "lat": 48.2615, "lon": -122.0476 }, "gauge_type": "permanent" },
        { "site_id": "14243000", "name": "Cowlitz River at Castle Rock", "coords": { "lat": 46.2837, "lon": -122.8254 }, "gauge_type": "permanent" },
        { "site_id": "12119000", "name": "Cedar River at Renton", "coords": { "lat": 47.5121, "lon": -122.1905 }, "gauge_type": "permanent" }
    ],
    "waterbodies": [
        {
            "id": "puyallup",
            "name": "Puyallup River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12101500", "param": "00060" },
            "related_gauges": [
                { "site_id": "12093500", "name": "Puyallup River near Orting", "role": "upstream" },
                { "site_id": "12096500", "name": "Puyallup River at Alderton", "role": "midstream" },
                { "site_id": "12101470", "name": "Puyallup River at 5th St Bridge", "role": "midstream" },
                { "site_id": "12096505", "name": "Puyallup River at E Main Bridge", "role": "midstream" },
                { "site_id": "12092000", "name": "Puyallup River near Electron", "role": "upstream" }
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
            "legal_hours": "daylight",
            "netting_sites": ["12094000"],
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "white",
            "name": "White River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12097850", "param": "00060" },
            "related_gauges": [
                { "site_id": "12100490", "name": "White River at R Street near Auburn", "role": "lower" }
            ],
            "coords": { "lat": 47.1639, "lon": -121.8498 },
            "legal_hours": "daylight",
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
            "related_gauges": [
                { "site_id": "12108800", "name": "Green River below Crisp Creek nr Black Diamond", "role": "upstream" },
                { "site_id": "12113150", "name": "Green River above S 277th St at Kent", "role": "midstream" },
                { "site_id": "12113310", "name": "Green River below Meeker St at Kent", "role": "midstream" },
                { "site_id": "12113340", "name": "Green River at 212 St near Kent", "role": "midstream" },
                { "site_id": "12113350", "name": "Green River at Tukwila", "role": "downstream" }
            ],
            "coords": { "lat": 47.3125, "lon": -122.2027 },
            "legal_hours": "daylight",
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
            "legal_hours": "daylight",
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
            "related_gauges": [
                { "site_id": "12194000", "name": "Skagit River near Concrete", "role": "upstream" }
            ],
            "coords": { "lat": 48.444828, "lon": -122.335437 },
            "legal_hours": "daylight",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "snoqualmie",
            "name": "Snoqualmie River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12144500", "param": "00060" },
            "related_gauges": [
                { "site_id": "12149000", "name": "Snoqualmie River near Carnation", "role": "downstream" }
            ],
            "coords": { "lat": 47.6805, "lon": -121.7904 },
            "legal_hours": "daylight",
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
            "legal_hours": "daylight",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "snohomish",
            "name": "Snohomish River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12150800", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.8309, "lon": -122.0485 },
            "legal_hours": "daylight",
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
            "legal_hours": "daylight",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "cowlitz",
            "name": "Cowlitz River",
            "waterbody_type": "river",
            "gauge": { "site_id": "14243000", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 46.2837, "lon": -122.8254 },
            "legal_hours": "daylight",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "duwamish",
            "name": "Duwamish River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12113390", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.5109, "lon": -122.2636 },
            "legal_hours": "daylight",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "big-soos",
            "name": "Big Soos Creek",
            "waterbody_type": "creek",
            "gauge": { "site_id": "12112600", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.4534, "lon": -122.1739 },
            "legal_hours": "daylight",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "mill-creek",
            "name": "Mill Creek (Green River tributary)",
            "waterbody_type": "creek",
            "gauge": { "site_id": "12113347", "param": "00060" },
            "related_gauges": null,
            "coords": { "lat": 47.4690, "lon": -122.2584 },
            "legal_hours": "daylight",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        },
        {
            "id": "cedar",
            "name": "Cedar River",
            "waterbody_type": "river",
            "gauge": { "site_id": "12119000", "param": "00060" },
            "related_gauges": [
                { "site_id": "12115000", "name": "Cedar River near Cedar Falls", "role": "upstream" }
            ],
            "coords": { "lat": 47.5121, "lon": -122.1905 },
            "legal_hours": "daylight",
            "netting_sites": null,
            "stocks": null,
            "capabilities": {},
            "no_telemetry": false
        }
    ]
};
