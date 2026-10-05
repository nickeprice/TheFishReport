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
    "12094000": {
        "name": "Carbon River near Fairfax",
        "width_ft": 63.0,
        "method": "usgs", "validated": false,
        "usgs_ft": 63.0, "naip_ft": 9.8, "elevation_ft": 256.4,
        "dem_vintage": "unknown"
    },
    "12098500": {
        "name": "White River near Buckley",
        "width_ft": 119.0,
        "method": "usgs", "validated": false,
        "usgs_ft": 119.0, "naip_ft": null, "elevation_ft": 479.7,
        "dem_vintage": "unknown"
    },
    "12101500": {
        "name": "Puyallup River at Puyallup",
        "width_ft": 202.3,
        "method": "elevation", "validated": true,
        "usgs_ft": 215.0, "naip_ft": 3.9, "elevation_ft": 202.3,
        "dem_vintage": "unknown"
    },
    "12113000": {
        "name": "Green River near Auburn",
        "width_ft": 128.0,
        "method": "usgs", "validated": false,
        "usgs_ft": 128.0, "naip_ft": 13.8, "elevation_ft": 233.8,
        "dem_vintage": "unknown"
    }
};
