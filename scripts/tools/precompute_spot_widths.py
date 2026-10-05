#!/usr/bin/env python3
"""
Phase 1.1 — Pre-compute channel widths at ~500m intervals along 5 rivers.

For each river:
  1. Fetch the river centerline geometry from OSM (Overpass API) by name.
  2. Chain the ways into an ordered upstream->downstream path.
  3. Resample the path at ~500m intervals using Haversine distance.
  4. Run measure_width_elevation() (3DEP DEM) at each sample point.
  5. Write src/data/spot_widths.js — a static lookup table loaded as window.SPOT_WIDTHS.

Output per point: lat, lon, wetted_ft, bankfull_ft, thalweg_m.

Usage:
    python3 scripts/precompute_spot_widths.py [--rivers puyallup,white] [--dry-run]
    python3 scripts/precompute_spot_widths.py              # all 5 rivers, full run
"""

import json, math, os, sys, time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import width_elevation as we

# ── Configuration ────────────────────────────────────────────────────────────

RIVERS = [
    {"id": "puyallup",  "name": "Puyallup River",  "site_id": "12101500",
     "lat": 47.20843358, "lon": -122.3270652,       "usgs_width_ft": 215},
    {"id": "white",     "name": "White River",      "site_id": "12098500",
     "lat": 47.15118666, "lon": -121.94981,         "usgs_width_ft": 119},
    {"id": "carbon",    "name": "Carbon River",     "site_id": "12094000",
     "lat": 47.02788105, "lon": -122.0326105,       "usgs_width_ft": 63},
    {"id": "green",     "name": "Green River",      "site_id": "12113000",
     "lat": 47.3123228,  "lon": -122.2040082,       "usgs_width_ft": 128},
    {"id": "nisqually", "name": "Nisqually River",  "site_id": "12089500",
     "lat": 46.93340268, "lon": -122.5609345,       "usgs_width_ft": 176},
]

SAMPLE_INTERVAL_M = 500
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT = 120
DEM_HALF_M = 250.0
OUTPUT_JS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "src", "data", "spot_widths.js"
)
UA = "TheFishReport/1.0 (spot-widths precompute)"

# ── Geography helpers ────────────────────────────────────────────────────────

R_EARTH_M = 6371000  # Earth mean radius in metres


def haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres between two WGS84 points."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return 2 * R_EARTH_M * math.asin(math.sqrt(a))


def resample_along_path(points, interval_m):
    """Resample a list of (lat, lon) tuples at ~interval_m intervals."""
    if not points:
        return []
    out = [(points[0][0], points[0][1], 0.0)]
    accumulated = 0.0
    target = interval_m
    i = 1
    while i < len(points):
        d = haversine_m(out[-1][0], out[-1][1], points[i][0], points[i][1])
        accumulated += d
        if accumulated >= target or abs(accumulated - target) < 5:
            frac = max(0.0, min(1.0, 1.0 - (accumulated - target) / d)) if d > 1e-6 else 0.0
            lat = out[-1][0] + (points[i][0] - out[-1][0]) * frac
            lon = out[-1][1] + (points[i][1] - out[-1][1]) * frac
            out.append((lat, lon, target))
            target += interval_m
            accumulated = 0.0
            continue
        i += 1
    last = out[-1]
    end = points[-1]
    if haversine_m(last[0], last[1], end[0], end[1]) >= interval_m * 0.5:
        out.append((end[0], end[1], target))
    return out


def chain_ways(ways):
    """Chain OSM way geometries into an ordered upstream->downstream path."""
    if not ways:
        return []
    geoms = []
    for w in ways:
        g = w.get("geometry", [])
        if len(g) >= 2:
            geoms.append([(p["lat"], p["lon"]) for p in g])
    if not geoms:
        return []
    geoms.sort(key=lambda g: -len(g))
    chain = list(geoms[0])
    used = {0}
    changed = True
    while changed and len(used) < len(geoms):
        changed = False
        for i, g in enumerate(geoms):
            if i in used:
                continue
            c_first, c_last = g[0], g[-1]
            ch_first, ch_last = chain[0], chain[-1]
            d_se = haversine_m(ch_first[0], ch_first[1], c_last[0], c_last[1])
            d_sf = haversine_m(ch_first[0], ch_first[1], c_first[0], c_first[1])
            d_ee = haversine_m(ch_last[0], ch_last[1], c_last[0], c_last[1])
            d_ef = haversine_m(ch_last[0], ch_last[1], c_first[0], c_first[1])
            best = min(d_se, d_sf, d_ee, d_ef)
            if best > 200.0:
                continue
            if best == d_ef:
                chain.extend(g[1:])
            elif best == d_ee:
                chain.extend(reversed(g)[1:])
            elif best == d_se:
                chain = g[:-1] + chain
            else:
                chain = list(reversed(g))[:-1] + chain
            used.add(i)
            changed = True
            break
    clean = [(lat, lon) for lat, lon in chain if lat != "GAP"]
    return clean


# ── Overpass query ───────────────────────────────────────────────────────────

RIVER_BBOXES = {
    # (min_lat, min_lon, max_lat, max_lon) for each river
    "puyallup": (46.8, -122.5, 47.4, -121.8),
    "white":    (46.8, -122.5, 47.4, -121.8),   # White feeds into Puyallup
    "carbon":   (46.8, -122.5, 47.4, -121.8),
    "green":    (47.0, -122.5, 47.5, -121.8),
    "nisqually": (46.7, -122.7, 47.2, -122.2),
    # Wider fallback for named rivers outside the core 5
    "default":  (45.0, -125.0, 50.0, -116.0),
}


def _river_bbox(river_id):
    """Return bounding box for a river, or the default Washington bbox."""
    return RIVER_BBOXES.get(river_id, RIVER_BBOXES["default"])


def fetch_river_ways(river_name, river_id="default"):
    """Fetch OSM way geometries for a river by name in Washington state.

    Retries with delay on 429/504. Uses a river-specific bounding box to
    avoid returning wrong rivers with the same name.
    """
    safe_name = river_name.replace("'", "\\'")
    bbox = _river_bbox(river_id)
    query = f"""
    [out:json][timeout:120];
    area[name="Washington"];
    way["name"="{safe_name}"]["waterway"="river"]
      ({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]})
      (area);
    out geom;
    """
    for attempt in range(3):
        try:
            resp = requests.get(OVERPASS_URL, params={"data": query},
                                headers={"User-Agent": UA},
                                timeout=OVERPASS_TIMEOUT)
            if resp.status_code == 200:
                data = resp.json()
                elements = data.get("elements", [])
                if elements:
                    return elements
                print(f"  No OSM ways found for '{river_name}' (attempt {attempt+1})",
                      file=sys.stderr)
            elif resp.status_code in (429, 504) and attempt < 2:
                delay = 15 if resp.status_code == 429 else 5
                print(f"  Overpass {resp.status_code}; retrying in {delay}s...",
                      file=sys.stderr)
                time.sleep(delay)
                continue
            else:
                print(f"  Overpass HTTP {resp.status_code}: {resp.text[:200]}",
                      file=sys.stderr)
                return None
        except requests.RequestException as exc:
            if attempt < 2:
                print(f"  Overpass attempt {attempt+1} failed: {exc}; retrying...",
                      file=sys.stderr)
                time.sleep(5)
                continue
            print(f"  Overpass request failed: {exc}", file=sys.stderr)
            return None
    return None


# ── River path generation ────────────────────────────────────────────────────

def generate_sample_points(river, dry_run=False):
    """Generate (lat, lon, cum_m) sample points along a river.

    Returns list of dict points or None.
    """
    rid = river["id"]
    rname = river["name"]

    print(f"\n{'='*60}")
    print(f"River: {rname}")
    print(f"{'='*60}")

    # 1. Fetch geometry from OSM
    print(f"  Querying Overpass API for '{rname}'...")
    ways = fetch_river_ways(rname, river_id=rid)
    if not ways:
        print(f"  ✗ No geometry found for {rname}")
        return None

    total_geom_pts = sum(len(w.get("geometry", [])) for w in ways)
    print(f"  Got {len(ways)} ways, {total_geom_pts} raw geometry points")

    # 2. Chain ways into ordered path
    path = chain_ways(ways)
    if not path:
        print(f"  ✗ Could not chain ways for {rname}")
        return None
    print(f"  Chained path: {len(path)} points")

    # 3. Resample at ~500m intervals
    samples = resample_along_path(path, SAMPLE_INTERVAL_M)
    print(f"  Resampled to {len(samples)} points at {SAMPLE_INTERVAL_M}m intervals")

    if dry_run:
        return [{"lat": round(s[0], 5), "lon": round(s[1], 5),
                 "cum_m": round(s[2], 0), "wetted_ft": None,
                 "bankfull_ft": None, "thalweg_m": None, "truncated": False}
                for s in samples]

    # 4. Run width measurement at each point
    results = []
    n_total = len(samples)
    n_error = 0
    _executor = ThreadPoolExecutor(1)

    def _measure(lat, lon):
        return we.measure_width_elevation(lat, lon, half_m=DEM_HALF_M)

    for idx, (lat, lon, cum_m) in enumerate(samples):
        dist_km = cum_m / 1000.0
        print(f"    [{idx+1}/{n_total}] lat={lat:.5f} lon={lon:.5f}  "
              f"river_km={dist_km:.1f}", end="", flush=True)
        try:
            future = _executor.submit(_measure, lat, lon)
            r = future.result(timeout=60)  # 60s timeout per measurement
            if r and r.get("width_ft") and r["width_ft"] > 0:
                widths_ft = r.get("widths_ft", {})
                wetted_ft = r["width_ft"]
                bankfull_ft = max(widths_ft.values()) if widths_ft else wetted_ft
                thalweg = r.get("thalweg_m", None)
                truncated = r.get("truncated", False)
                flag = " T" if truncated else ""
                print(f"  w={wetted_ft:.0f}ft  bkf={bankfull_ft:.0f}ft  "
                      f"thalweg={thalweg}{flag}")
                results.append({
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "cum_m": round(cum_m, 0),
                    "wetted_ft": round(wetted_ft, 1),
                    "bankfull_ft": round(bankfull_ft, 1),
                    "thalweg_m": round(thalweg, 2) if thalweg is not None else None,
                    "truncated": truncated,
                })
            else:
                print("  FAIL (no width)")
                n_error += 1
        except FuturesTimeout:
            print("  TIMEOUT (60s)")
            n_error += 1
        except Exception as exc:
            print(f"  ERROR: {exc}")
            n_error += 1

        time.sleep(0.3)

    print(f"\n  Results: {len(results)} good, {n_error} failed")
    return results


# ── JS output writer ─────────────────────────────────────────────────────────

def render_js(rivers_data):
    """Render the spot_widths.js lookup table."""
    lines = [
        "/* GENERATED - do not edit by hand.",
        " * Source: scripts/precompute_spot_widths.py",
        " *",
        " * Channel widths measured from 3DEP DEM (AWS Terrain Tiles / terrarium z15)",
        " * at ~500m intervals along 5 core rivers.",
        " *",
        " * Each entry:",
        " *   lat,lon     = WGS84 sample point",
        " *   cum_m       = cumulative river distance from downstream end (metres)",
        " *   wetted_ft   = channel width at ~2m above thalweg (wetted width proxy)",
        " *   bankfull_ft = width at the highest measured elevation (bankfull proxy)",
        " *   thalweg_m   = thalweg elevation above sea level (metres)",
        " *   truncated   = DEM window was too small for this cross-section",
        " */",
        "window.SPOT_WIDTHS = window.SPOT_WIDTHS || {};",
        "window.SPOT_WIDTHS.rivers = {",
    ]
    first_river = True
    for rd in rivers_data:
        rid = rd["id"]
        pts = rd["points"]
        sep = "" if first_river else ","
        first_river = False
        lines.append(f"{sep}")
        lines.append(f'    "{rid}": {{')
        lines.append(f'        "name": {json.dumps(rd["name"])},')
        lines.append(f'        "site_id": "{rd["site_id"]}",')
        lines.append(f'        "n_points": {len(pts)},')
        lines.append(f'        "points": [')
        for i, p in enumerate(pts):
            comma = "," if i < len(pts) - 1 else ""
            tm = str(p["thalweg_m"]) if p["thalweg_m"] is not None else "null"
            lines.append(
                f'            {{"lat":{p["lat"]}, "lon":{p["lon"]}, '
                f'"cum_m":{p["cum_m"]}, "wetted_ft":{p["wetted_ft"]}, '
                f'"bankfull_ft":{p["bankfull_ft"]}, '
                f'"thalweg_m":{tm}, '
                f'"truncated":{"true" if p["truncated"] else "false"}}}{comma}'
            )
        lines.append(f'        ]')
        lines.append(f'    }}')
    lines.append("\n};")
    return "\n".join(lines) + "\n"


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rivers",
                    help="Comma-separated river ids (default: all 5)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Fetch geometry and sample, but skip DEM measurements")
    ap.add_argument("--output", default=OUTPUT_JS,
                    help=f"Output JS file (default: {OUTPUT_JS})")
    args = ap.parse_args()

    selected = [r for r in RIVERS
                if not args.rivers or r["id"] in args.rivers.split(",")]
    if not selected:
        print("No matching rivers.", file=sys.stderr)
        return 1

    print(f"Phase 1.1 — Pre-compute spot widths")
    print(f"Sample interval: {SAMPLE_INTERVAL_M}m, rivers: {[r['id'] for r in selected]}")
    if args.dry_run:
        print("DRY RUN: skipping DEM measurements\n")

    rivers_data = []
    for river in selected:
        samples = generate_sample_points(river, dry_run=args.dry_run)
        if samples is None:
            print(f"  Skipping {river['id']} due to errors.")
            continue
        rivers_data.append({
            "id": river["id"],
            "name": river["name"],
            "site_id": river["site_id"],
            "points": samples,
        })

    if not rivers_data:
        print("\nNo data collected.", file=sys.stderr)
        return 1

    js = render_js(rivers_data)

    if args.dry_run:
        print(f"\n--- Generated JS preview ({len(js)} chars) ---")
        print(js[:2000])
        return 0

    with open(args.output, "w", encoding="utf-8") as fh:
        fh.write(js)
    total_pts = sum(len(rd["points"]) for rd in rivers_data)
    print(f"\nWrote {args.output}")
    print(f"   {len(rivers_data)} rivers, {total_pts} points")

    print(f"\n{'River':<15} {'Points':>8} {'Failed':>8}")
    print("-" * 35)
    for rd in rivers_data:
        pts = rd["points"]
        n_good = sum(1 for p in pts if p.get("wetted_ft") and p["wetted_ft"] > 0)
        n_fail = len(pts) - n_good
        print(f"{rd['id']:<15} {n_good:>8} {n_fail:>8}")

    return 0


if __name__ == "__main__":
    sys.exit(main())