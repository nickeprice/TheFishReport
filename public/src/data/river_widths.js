/* GENERATED - do not edit by hand.
 * Source: scripts/extract_river_widths.py - routes between NAIP-NDWI and 3DEP
 * elevation, and only trusts a method that reproduces the USGS field width.
 *
 * method  "elevation" | "naip" -> validated against the USGS width (<=25%)
 *         "usgs"               -> neither cleared validation; the USGS measurement IS the value
 * width_ft is the canonical channel width: the USGS field measurement when available.
 *
 * VINTAGE: the elevation method reads a compiled DEM (AWS Terrain Tiles / terrarium)
 * whose source collection date is NOT exposed by the tile, so dem_vintage stays
 * "unknown". Elevation changes slowly, but this is an honest gap -- prefer a dated
 * 3DEP 1m source if the spot ratio ever needs to be more defensible than that.
 */
window.RIVER_WIDTHS = {
    "12089500": {
        "name": "Nisqually River at McKenna",
        "width_ft": 176.0,
        "method": "usgs", "validated": false,
        "usgs_ft": 176.0, "naip_ft": null, "elevation_ft": 267.6,
        "dem_vintage": "unknown"
    },
    "12092000": {
        "name": "Puyallup River near Electron",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 3.9, "elevation_ft": 299.5,
        "dem_vintage": "unknown"
    },
    "12093500": {
        "name": "Puyallup River near Orting",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 9.8, "elevation_ft": 693.5,
        "dem_vintage": "unknown"
    },
    "12094000": {
        "name": "Carbon River near Fairfax",
        "width_ft": 63.0,
        "method": "usgs", "validated": false,
        "usgs_ft": 63.0, "naip_ft": 9.8, "elevation_ft": 256.4,
        "dem_vintage": "unknown"
    },
    "12096500": {
        "name": "Puyallup River at Alderton",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 3.9, "elevation_ft": 575.6,
        "dem_vintage": "unknown"
    },
    "12096505": {
        "name": "Puyallup River at E Main Bridge",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 745.7,
        "dem_vintage": "unknown"
    },
    "12097850": {
        "name": "White River below Clearwater",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 160.0,
        "dem_vintage": "unknown"
    },
    "12098500": {
        "name": "White River near Buckley",
        "width_ft": 119.0,
        "method": "usgs", "validated": false,
        "usgs_ft": 119.0, "naip_ft": null, "elevation_ft": 479.7,
        "dem_vintage": "unknown"
    },
    "12100490": {
        "name": "White River at R Street",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 41.3, "elevation_ft": 117.1,
        "dem_vintage": "unknown"
    },
    "12101470": {
        "name": "Puyallup River at 5th St Bridge",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 33.5, "elevation_ft": 425.7,
        "dem_vintage": "unknown"
    },
    "12101500": {
        "name": "Puyallup River at Puyallup",
        "width_ft": 202.3,
        "method": "elevation", "validated": true,
        "usgs_ft": 215.0, "naip_ft": 3.9, "elevation_ft": 202.3,
        "dem_vintage": "unknown"
    },
    "12108800": {
        "name": "Green River below Crisp Creek",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 212.8,
        "dem_vintage": "unknown"
    },
    "12112600": {
        "name": "Big Soos Creek",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 2.0, "elevation_ft": 159.4,
        "dem_vintage": "unknown"
    },
    "12113000": {
        "name": "Green River near Auburn",
        "width_ft": 128.0,
        "method": "usgs", "validated": false,
        "usgs_ft": 128.0, "naip_ft": 13.8, "elevation_ft": 233.8,
        "dem_vintage": "unknown"
    },
    "12113150": {
        "name": "Green River above 277th St",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 233.5,
        "dem_vintage": "unknown"
    },
    "12113310": {
        "name": "Green River below Meeker St",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 7.9, "elevation_ft": 222.4,
        "dem_vintage": "unknown"
    },
    "12113340": {
        "name": "Green River at 212 St",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 265.2,
        "dem_vintage": "unknown"
    },
    "12113347": {
        "name": "Mill Creek",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 2.0, "elevation_ft": 753.8,
        "dem_vintage": "unknown"
    },
    "12113350": {
        "name": "Green River at Tukwila",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 392.0,
        "dem_vintage": "unknown"
    },
    "12113390": {
        "name": "Duwamish River at Tukwila",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 328.1,
        "dem_vintage": "unknown"
    },
    "12115000": {
        "name": "Cedar River near Cedar Falls",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 84.8,
        "dem_vintage": "unknown"
    },
    "12119000": {
        "name": "Cedar River at Renton",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 3.9, "elevation_ft": 519.0,
        "dem_vintage": "unknown"
    },
    "12134500": {
        "name": "Skykomish River at Gold Bar",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 25.6, "elevation_ft": 725.8,
        "dem_vintage": "unknown"
    },
    "12144500": {
        "name": "Snoqualmie River near Snoqualmie",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 9.8, "elevation_ft": 232.9,
        "dem_vintage": "unknown"
    },
    "12149000": {
        "name": "Snoqualmie River near Carnation",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 2.0, "elevation_ft": 432.8,
        "dem_vintage": "unknown"
    },
    "12150800": {
        "name": "Snohomish River near Monroe",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 13.8, "elevation_ft": 757.2,
        "dem_vintage": "unknown"
    },
    "12167000": {
        "name": "NF Stillaguamish River",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 167.0,
        "dem_vintage": "unknown"
    },
    "12194000": {
        "name": "Skagit River near Concrete",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 238.7,
        "dem_vintage": "unknown"
    },
    "12200500": {
        "name": "Skagit River near Mt Vernon",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 166.4,
        "dem_vintage": "unknown"
    },
    "14233500": {
        "name": "Cowlitz River near Kosmos",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 3.9, "elevation_ft": 96.9,
        "dem_vintage": "unknown"
    },
    "14238000": {
        "name": "Cowlitz River below Mayfield Dam",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 226.6,
        "dem_vintage": "unknown"
    },
    "14240525": {
        "name": "NF Toutle River below SRS",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": null, "elevation_ft": 97.4,
        "dem_vintage": "unknown"
    },
    "14243000": {
        "name": "Cowlitz River at Castle Rock",
        "width_ft": None,
        "method": "usgs", "validated": false,
        "usgs_ft": null, "naip_ft": 33.5, "elevation_ft": 747.6,
        "dem_vintage": "unknown"
    }
};
