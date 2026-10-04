#!/usr/bin/env python3
"""Extract channel width at USGS gauge coordinates from NAIP imagery.

ONE-TIME EXTRACTION, re-run per region when stations are added. Measures the wetted
channel width from a 0.6 m USDA NAIP aerial image and prints the result, which feeds the
`v = Q/A` velocity estimate (see the accuracy roadmap in memory-bank/activeContext.md).

Source: Microsoft Planetary Computer STAC API — free, and explicitly permits commercial
use (unlike the Google Earth Engine non-commercial tier). Collection `naip`, 4 bands
(Red/Green/Blue/NIR). Water is detected with NDWI: water absorbs near-infrared, so the
channel reads as a dark band against bright vegetation/soil.

HONEST CAVEATS, deliberate:
  * NAIP is flown in SUMMER, so this is the WETTED width at low flow, not bankfull.
    Width varies only weakly with discharge, so it is a sound first-order channel width —
    but it is NOT the width at flood stage.
  * The USGS gauge coordinate sits on the BANK (the gage house), not mid-channel, so the
    window is searched for the nearest substantial water body rather than assuming centre.

Usage:
    /tmp/tfr_env/bin/python scripts/extract_river_widths.py
    /tmp/tfr_env/bin/python scripts/extract_river_widths.py --station 12101500
    /tmp/tfr_env/bin/python scripts/extract_river_widths.py --half-window-m 300

Requires rasterio + numpy (pip install rasterio).
"""

import argparse
import json
import ssl
import sys
import urllib.request

import certifi
import numpy as np
import rasterio
from rasterio.warp import transform as rio_transform
from rasterio.windows import from_bounds

import width_elevation as we

# python.org builds on macOS do not populate the system trust store, so pin the CA bundle
# that certifi ships rather than relying on the platform default.
SSL_CTX = ssl.create_default_context(cafile=certifi.where())

STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
NAIP_COLLECTION = "naip"

# Where the USGS field-measurement widths (the ground truth at each gauge) live.
CHANNEL_MEASUREMENTS_JS = "src/data/channel_measurements.js"
DEFAULT_WIDTHS_JS = "src/data/river_widths.js"
# A method is only trusted for a river if it reproduces the USGS measured width this closely.
VALIDATION_TOL = 0.25


def usgs_median_widths(path=CHANNEL_MEASUREMENTS_JS):
    """Median USGS measured channel width per gauge, read from the generated JS data file."""
    import re
    with open(path, encoding="utf-8") as fh:
        txt = fh.read()
    out = {}
    for m in re.finditer(r'"(\d{8})":\s*\{(.*?)\n    \}', txt, re.S):
        sid, body = m.group(1), m.group(2)
        ws = sorted(float(x) for x in re.findall(r'"w":\s*([\d.]+)', body))
        ws = [w for w in ws if w > 0]
        if ws:
            out[sid] = ws[len(ws) // 2]
    return out

# True gauge coordinates from the USGS NWIS site file (NOT the approximate registry
# values, which are 1-2.5 km off for four of these five).
GAUGES = [
    ("12101500", "Puyallup River at Puyallup", 47.20843358, -122.3270652),
    ("12098500", "White River near Buckley", 47.15118666, -121.94981),
    ("12094000", "Carbon River near Fairfax", 47.02788105, -122.0326105),
    ("12113000", "Green River near Auburn", 47.3123228, -122.2040082),
    ("12089500", "Nisqually River at McKenna", 46.93340268, -122.5609345),
]


def stac_naip_item(lat, lon, pad_deg=0.004):
    """Return the most recent NAIP item covering (lat, lon), or None."""
    bbox = "{},{},{},{}".format(lon - pad_deg, lat - pad_deg, lon + pad_deg, lat + pad_deg)
    url = "{}?collections={}&bbox={}&limit=20".format(STAC_SEARCH, NAIP_COLLECTION, bbox)
    with urllib.request.urlopen(url, timeout=90, context=SSL_CTX) as resp:
        payload = json.load(resp)
    feats = payload.get("features") or []
    if not feats:
        return None
    feats.sort(key=lambda f: f["properties"].get("datetime", ""), reverse=True)
    return feats[0]


def measure_width(href, lat, lon, half_m=250.0):
    """Measure the wetted channel width near (lat, lon) from a remote NAIP COG.

    Detects water with NDWI, then measures width perpendicular to the channel by
    projecting the water pixels onto the channel's minor axis (PCA) and taking the
    median extent across a series of cross-sections.
    """
    with rasterio.open(href) as ds:
        xs, ys = rio_transform("EPSG:4326", ds.crs, [lon], [lat])
        x, y = xs[0], ys[0]
        win = from_bounds(x - half_m, y - half_m, x + half_m, y + half_m, ds.transform)
        win = win.round_offsets().round_lengths()
        green = ds.read(2, window=win).astype("float32")
        nir = ds.read(4, window=win).astype("float32")
        px_m = abs(ds.transform.a)
        crs_epsg = ds.crs.to_epsg()

    if green.size == 0:
        return None

    denom = green + nir
    ndwi = np.where(denom > 0, (green - nir) / np.maximum(denom, 1e-6), 0.0)
    water = ndwi > 0.05
    n_water = int(water.sum())
    if n_water < 100:
        return None

    rows, cols = np.nonzero(water)
    cy, cx = (green.shape[0] - 1) / 2.0, (green.shape[1] - 1) / 2.0

    # The gauge sits on the BANK, so the channel is the water nearest the gauge point.
    i0 = int(np.argmin((rows - cy) ** 2 + (cols - cx) ** 2))
    p0 = (float(rows[i0]), float(cols[i0]))

    # Local channel direction from water within 120 m; the PCA minor axis runs ACROSS it.
    radius_px = 120.0 / px_m
    near = ((rows - p0[0]) ** 2 + (cols - p0[1]) ** 2) <= radius_px * radius_px
    if int(near.sum()) >= 30:
        sample = np.column_stack([cols[near], rows[near]]).astype("float64")
    else:
        sample = np.column_stack([cols, rows]).astype("float64")
    centered = sample - sample.mean(axis=0)
    _evals, evecs = np.linalg.eigh(np.cov(centered.T))
    across = evecs[:, 0]   # (dx, dy) pointing across the channel

    max_px = 300.0 / px_m

    def run(sign):
        """Step across the channel until we leave the water for >= 3 px."""
        dist = 0.0
        misses = 0
        while dist < max_px:
            dist += 1.0
            r = int(round(p0[0] + sign * across[1] * dist))
            c = int(round(p0[1] + sign * across[0] * dist))
            if r < 0 or c < 0 or r >= water.shape[0] or c >= water.shape[1]:
                break
            if water[r, c]:
                misses = 0
            else:
                misses += 1
                if misses >= 3:
                    break
        return max(0.0, dist - misses)

    width_m = (run(+1) + run(-1)) * px_m
    return {
        "width_m": width_m,
        "width_ft": width_m * 3.28084,
        "water_frac": float(n_water) / float(water.size),
        "px_m": float(px_m),
        "window_px": [int(green.shape[0]), int(green.shape[1])],
        "epsg": crs_epsg,
    }


def route_width(sid, usgs_ft, naip_ft, elev_res, tol=VALIDATION_TOL):
    """Pick which measurement to trust for a river BY VALIDATING AGAINST USGS TRUTH.

    Clarity is never guessed from a turbidity number. A method earns trust only by
    reproducing the USGS field width at that gauge; anything that misses is discarded and
    the USGS measurement itself becomes the value. On this basin every river is silt-laden:
    NAIP fails everywhere, and the DEM only clears the wide lowland Puyallup channel, so
    the other four correctly fall back to the measured truth rather than a bad estimate.
    """
    elev_ft = float(elev_res["width_ft"]) if elev_res and elev_res.get("width_ft") else None
    truncated = bool(elev_res.get("truncated")) if elev_res else True

    cands = []
    if naip_ft and usgs_ft:
        cands.append(("naip", float(naip_ft), abs(naip_ft - usgs_ft) / usgs_ft))
    if elev_ft and not truncated and usgs_ft:
        cands.append(("elevation", elev_ft, abs(elev_ft - usgs_ft) / usgs_ft))
    cands.sort(key=lambda c: c[2])

    if cands and cands[0][2] <= tol:
        return cands[0][0], cands[0][1], "validated"
    return "usgs", (float(usgs_ft) if usgs_ft else None), "unvalidated"


def render_widths_js(rows):
    """Deterministic `window.RIVER_WIDTHS` table consumed by the continuity estimator."""
    def jsnum(v):
        return "null" if v is None else ("%.1f" % float(v))

    ordered = sorted(rows)
    lines = [
        "/* GENERATED - do not edit by hand.",
        " * Source: scripts/extract_river_widths.py - routes between NAIP-NDWI and 3DEP",
        " * elevation, and only trusts a method that reproduces the USGS field width.",
        " *",
        ' * method  "elevation" | "naip" -> validated against the USGS width (<=25%)',
        ' *         "usgs"               -> neither cleared validation; the USGS measurement IS the value',
        " * width_ft is the canonical channel width: the USGS field measurement when available.",
        " *",
        " * VINTAGE: the elevation method reads a compiled DEM (AWS Terrain Tiles / terrarium)",
        " * whose source collection date is NOT exposed by the tile, so dem_vintage stays",
        ' * "unknown". Elevation changes slowly, but this is an honest gap -- prefer a dated',
        " * 3DEP 1m source if the spot ratio ever needs to be more defensible than that.",
        " */",
        "window.RIVER_WIDTHS = {",
    ]
    for i, sid in enumerate(ordered):
        r = rows[sid]
        lines.append('    "%s": {' % sid)
        lines.append('        "name": %s,' % json.dumps(r["name"]))
        lines.append('        "width_ft": %s,' % r["width_ft"])
        lines.append('        "method": "%s", "validated": %s,' % (
            r["method"], "true" if r["validated"] else "false"))
        lines.append('        "usgs_ft": %s, "naip_ft": %s, "elevation_ft": %s,' % (
            jsnum(r["usgs_ft"]), jsnum(r["naip_ft"]), jsnum(r["elevation_ft"])))
        lines.append('        "dem_vintage": "unknown"')
        lines.append("    }" + ("," if i < len(ordered) - 1 else ""))
    lines.append("};")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--station", help="limit to a single station id")
    ap.add_argument("--half-window-m", type=float, default=250.0)
    ap.add_argument("--emit", nargs="?", const=DEFAULT_WIDTHS_JS, default=None,
                    help="write the routed width table (default: %s)" % DEFAULT_WIDTHS_JS)
    args = ap.parse_args()

    gauges = [g for g in GAUGES if not args.station or g[0] == args.station]
    if not gauges:
        print("no matching station: " + str(args.station), file=sys.stderr)
        return 1

    try:
        usgs = usgs_median_widths()
    except Exception as exc:
        print("could not read USGS widths ({}): {}".format(CHANNEL_MEASUREMENTS_JS, exc),
              file=sys.stderr)
        usgs = {}

    print("station    river                            usgs   naip   elev trunc  -> method       width")
    print("-" * 104)
    rows = {}
    for sid, name, lat, lon in gauges:
        usgs_ft = usgs.get(sid)

        # Both methods always run: the router needs both numbers to validate against truth.
        naip_ft = None
        try:
            item = stac_naip_item(lat, lon)
            if item:
                res = measure_width(item["assets"]["image"]["href"], lat, lon,
                                    args.half_window_m)
                naip_ft = res["width_ft"] if res else None
        except Exception:
            naip_ft = None

        elev = None
        try:
            elev = we.measure_width_elevation(lat, lon)
        except Exception:
            elev = None

        method, width, status = route_width(sid, usgs_ft, naip_ft, elev)
        rows[sid] = {
            "name": name,
            "width_ft": round(width, 1) if width is not None else None,
            "method": method,
            "validated": status == "validated",
            "usgs_ft": round(usgs_ft, 1) if usgs_ft else None,
            "naip_ft": round(naip_ft, 1) if naip_ft else None,
            "elevation_ft": round(elev["width_ft"], 1) if elev and elev.get("width_ft") else None,
        }
        print("{:10s} {:<32s} {:5s} {:6s} {:6s} {:5s}  -> {:<12s} {:6s} {}".format(
            sid, name[:32],
            "%.0f" % usgs_ft if usgs_ft else "-",
            "%.0f" % naip_ft if naip_ft else "-",
            "%.0f" % elev["width_ft"] if elev and elev.get("width_ft") else "-",
            "yes" if (elev and elev.get("truncated")) else "no",
            method,
            "%.0f" % width if width is not None else "-",
            status))

    if args.emit:
        with open(args.emit, "w", encoding="utf-8") as fh:
            fh.write(render_widths_js(rows))
        print("\nwrote {} ({} rows)".format(args.emit, len(rows)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
