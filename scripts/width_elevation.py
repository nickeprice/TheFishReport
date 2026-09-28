#!/usr/bin/env python3
"""Channel width from the 3DEP-derived terrarium DEM (AWS Open Data Terrain Tiles).

WHY THIS EXISTS
`width_naip.py` / NAIP-NDWI detects water by colour, which FAILS on this basin: the
Puyallup, White, Carbon and Nisqually are glacial/silt-laden, so suspended sediment
backscatters near-infrared and the green-NIR contrast collapses. Measured against the
USGS field widths, NAIP returned 4 ft where the truth is 215 ft (White: 0 vs 119,
Carbon: 10 vs 63, Green: 14 vs 128, Nisqually: 0 vs 176) — useless for every river here.

Elevation is colour-blind: the channel is a topographic trough, so width can be measured
from the DEM whatever the water looks like. That makes it the fallback (and here, the
primary) method.

SOURCE
  AWS Terrain Tiles, `terrarium` encoding, z15 -> ~3.25 m on the ground at this latitude.
      elevation_m = (R*256 + G + B/256) - 32768
  Free, no key, and the tiles are georeferenced EPSG:3857 PNGs that rasterio reads
  directly over HTTPS. z16+ does not exist, so z15 is the resolution ceiling.

METHOD
  Take a low-elevation trough near the point, orient the cross-section across it (PCA on
  the channel pixels, same idea as the NAIP method), then walk both ways from the thalweg
  and record the width at each height above it. Widths are returned as a small
  height->width profile rather than one number, because "the" channel width depends on
  what stage you mean (wetted at today's flow vs bankfull) and that choice belongs to the
  caller, not to the measurement.
"""

import math

import numpy as np
import rasterio

TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ZOOM = 15
R_MERC = 6378137.0
ORIGIN_SHIFT = math.pi * R_MERC          # half the Web Mercator extent, in metres


def _mercator(lat, lon):
    """WGS84 -> EPSG:3857 metres."""
    x = math.radians(lon) * R_MERC
    y = math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0)) * R_MERC
    return x, y


def _tile(lat, lon, z=ZOOM):
    n = 2 ** z
    tx = int((lon + 180.0) / 360.0 * n)
    ty = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return tx, ty


def fetch_dem(lat, lon, half_m=250.0):
    """Elevation (metres) over a square window centred on (lat, lon).

    Returns (elevation_array, transform) in EPSG:3857, stitched across however many
    terrarium tiles the window touches (a tile is ~830 m of ground here, so a 500 m
    window usually straddles one seam).
    """
    x, y = _mercator(lat, lon)
    left, right = x - half_m, x + half_m
    bottom, top = y - half_m, y + half_m

    # Probe one tile to learn the native pixel size, then build the holding grid.
    tx0, ty0 = _tile(lat, lon)
    with rasterio.open(TERRARIUM.format(z=ZOOM, x=tx0, y=ty0)) as probe:
        res = probe.transform.a                      # metres per pixel (mercator)
        tile_px = probe.width, probe.height
        tt = probe.transform

    ncols = int(math.ceil((right - left) / res))
    nrows = int(math.ceil((top - bottom) / res))
    grid = np.full((nrows, ncols), np.nan, dtype="float32")

    # Tile index span covered by the window (tiles count up left->right, top->bottom).
    tile_span = tt.a * tile_px[0]
    tx_start = int(math.floor((left + ORIGIN_SHIFT) / tile_span))
    tx_end = int(math.floor((right + ORIGIN_SHIFT) / tile_span))
    ty_start = int(math.floor((ORIGIN_SHIFT - top) / tile_span))
    ty_end = int(math.floor((ORIGIN_SHIFT - bottom) / tile_span))

    for ty in range(ty_start, ty_end + 1):
        for tx in range(tx_start, tx_end + 1):
            if tx < 0 or ty < 0 or tx >= 2 ** ZOOM or ty >= 2 ** ZOOM:
                continue
            try:
                with rasterio.open(TERRARIUM.format(z=ZOOM, x=tx, y=ty)) as ds:
                    a = ds.read()
                    ele = (a[0].astype("float32") * 256.0 + a[1].astype("float32")
                           + a[2].astype("float32") / 256.0 - 32768.0)
                    t = ds.transform
            except Exception:
                continue
            # Vectorised placement into the holding grid.
            px = t.a * (np.arange(ele.shape[1]) + 0.5) + t.c
            py = t.e * (np.arange(ele.shape[0]) + 0.5) + t.f
            gc = np.round((px - left) / res - 0.5).astype(int)
            gr = np.round((top - py) / res - 0.5).astype(int)
            GC = np.tile(gc, (ele.shape[0], 1))
            GR = np.tile(gr[:, None], (1, ele.shape[1]))
            m = (GR >= 0) & (GR < nrows) & (GC >= 0) & (GC < ncols)
            grid[GR[m], GC[m]] = ele[m]

    if np.all(np.isnan(grid)):
        return None, None
    transform = rasterio.transform.from_origin(left, top, res, res)
    return grid, transform


def _smooth(grid, k=3):
    """3x3 mean on the valid data only — terrarium is smooth, this just kills specks."""
    filled = np.where(np.isnan(grid), np.nanmean(grid), grid)
    kernel = np.ones((k, k), dtype="float32") / (k * k)
    from numpy.lib.stride_tricks import sliding_window_view
    win = sliding_window_view(filled, (k, k))
    out = (win * kernel).sum(axis=(-1, -2)).astype("float32")
    pad = k // 2
    return np.pad(out, pad, mode="edge")


def measure_width_elevation(lat, lon, half_m=200.0, heights=(1.0, 2.0, 3.0)):
    """Channel width near (lat, lon) as a width-at-stage curve, from the contiguous low trough.

    Measuring the *contiguous trough region* rather than a single transect matters: the
    lowest pixel is often jammed against one steep bank, so a one-line walk reports a
    lopsided (or window-truncated) width. Flooding the low region and taking its extent
    along the across-channel axis is stable in both wide lowland and narrow canyon reaches.
    """
    grid, transform = fetch_dem(lat, lon, half_m)
    if grid is None:
        return None
    px_m = abs(transform.a) * math.cos(math.radians(lat))   # mercator metres -> ground metres
    ele = _smooth(grid, 3)
    H, W = ele.shape
    cy, cx = (H - 1) / 2.0, (W - 1) / 2.0

    # Thalweg = lowest pixel within 120 m of the point (window-wide min would jump to an
    # unrelated hillside cut or a deeper reach off to the side).
    R = min(120.0 / px_m, min(H, W) / 2.0 - 1)
    rr, cc = np.mgrid[0:H, 0:W]
    near = ((rr - cy) ** 2 + (cc - cx) ** 2) <= R * R
    if not near.any():
        near = np.ones((H, W), dtype=bool)
    masked = np.where(near, ele, np.inf)
    flat = int(np.argmin(masked))
    r0, c0 = flat // W, flat % W
    thalweg = float(masked[r0, c0])

    # Across-channel axis = local gradient: the bank rises across the channel while the
    # channel only descends gently downstream, so the gradient points across, not along.
    gy, gx = np.gradient(ele)
    trough = (ele <= thalweg + 1.5) & near
    if int(trough.sum()) >= 5:
        gxm, gym = float(gx[trough].mean()), float(gy[trough].mean())
    else:
        gxm, gym = float(gx[r0, c0]), float(gy[r0, c0])
    norm = math.hypot(gxm, gym)
    if norm < 1e-9:
        return None
    across = (gxm / norm, gym / norm)

    widths, truncated = {}, False
    max_px = 200.0 / px_m
    for h in heights:
        half = 0.0
        for sign in (1.0, -1.0):
            d = 0.0
            while d < max_px:
                r = int(round(r0 + sign * across[1] * d))
                c = int(round(c0 + sign * across[0] * d))
                if not (0 <= r < H and 0 <= c < W):
                    truncated = True
                    break
                if float(ele[r, c]) > thalweg + h:
                    break
                d += 1.0
            half += d * px_m
        widths[h] = half * 3.28084

    return {
        "width_ft": widths.get(2.0, widths.get(max(widths))),
        "pick_h_m": 2.0,
        "widths_ft": {h: round(v, 1) for h, v in widths.items()},
        "thalweg_m": round(thalweg, 2),
        "relief_m": round(float(np.nanpercentile(ele, 95)) - thalweg, 2),
        "px_m": round(px_m, 2),
        "truncated": truncated,
        "method": "elevation",
    }


if __name__ == "__main__":
    import sys
    GAUGES = [
        ("12101500", "Puyallup River at Puyallup", 47.20843358, -122.3270652, 215),
        ("12098500", "White River near Buckley", 47.15118666, -121.94981, 119),
        ("12094000", "Carbon River near Fairfax", 47.02788105, -122.0326105, 63),
        ("12113000", "Green River near Auburn", 47.3123228, -122.2040082, 128),
        ("12089500", "Nisqually River at McKenna", 46.93340268, -122.5609345, 176),
    ]
    print("station    river                            usgs   elev  trunc  thalweg relief  widths@h(ft)")
    print("-" * 112)
    for sid, name, la, lo, usgs in GAUGES:
        r = measure_width_elevation(la, lo)
        if not r:
            print("%-10s %-32s %5d  FAILED" % (sid, name[:32], usgs))
            continue
        print("%-10s %-32s %5d %6.0f  %5s  %6.1f %5.1f  %s" % (
            sid, name[:32], usgs, r["width_ft"], "yes" if r["truncated"] else "no",
            r["thalweg_m"], r["relief_m"],
            " ".join("%s=%.0f" % (h, v) for h, v in sorted(r["widths_ft"].items()))))
    sys.exit(0)

