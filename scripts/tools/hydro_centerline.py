#!/usr/bin/env python3
"""
hydro_centerline.py — Extract river centerline from HydroRIVERS GDB.
Walks downstream from gauge via NEXT_DOWN, resamples at 100m intervals.

Usage:
    python3 scripts/tools/hydro_centerline.py 47.208 -122.327 --dry-run
    python3 scripts/tools/hydro_centerline.py 47.208 -122.327 --json out.json --river-id puyallup
"""

import json, math, os, subprocess, sys, tempfile

OGR = None
HYDRO_GDB = "/Users/nprice/Downloads/HydroRIVERS_v10_na.gdb/HydroRIVERS_v10_na.gdb"


def find_ogr():
    global OGR
    for p in ["ogr2ogr", "/opt/homebrew/bin/ogr2ogr"]:
        try:
            subprocess.run([p, "--version"], capture_output=True, check=True)
            OGR = p; return
        except FileNotFoundError: continue
    sys.exit("ogr2ogr not found")


def ogr2json(sql, spat=None):
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp: fp = tmp.name
    os.unlink(fp)
    cmd = [OGR, "-f", "GeoJSON", fp, HYDRO_GDB, "-sql", sql, "-lco", "WRITE_BBOX=NO"]
    if spat: cmd += ["-spat"] + [str(x) for x in spat]
    subprocess.run(cmd, capture_output=True, check=True, timeout=120)
    with open(fp) as f: return json.load(f)


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000; dLat, dLon = math.radians(lat2-lat1), math.radians(lon2-lon1)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dLon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def extract_centerline(lat, lon, search_deg=0.6):
    """Get centerline by walking downstream via NEXT_DOWN from gauge.
    Spatial window covers ~110km — enough for any PNW river."""
    sql = "SELECT HYRIV_ID, NEXT_DOWN FROM HydroRIVERS_v10_na WHERE SHAPE_Length > 0"
    dt = ogr2json(sql, spat=[lon-search_deg, lat-search_deg, lon+search_deg, lat+search_deg])
    ft = dt.get("features", [])
    if not ft: return None

    # Build quick spatial index: HYRIV_ID -> (first coord, last coord)
    index = {}
    for f in ft:
        g = f.get("geometry", {}).get("coordinates", [[[]]])
        line = g[0] if isinstance(g[0], list) else g
        if line and isinstance(line[0], list) and len(line) > 1:
            fid = f["properties"]["HYRIV_ID"]
            index[fid] = (line[0], line[-1])

    best_d, best_f = 1e9, None
    for f in ft:
        g = f.get("geometry", {}).get("coordinates", [[[]]])
        line = g[0] if isinstance(g[0], list) else g
        if line and isinstance(line[0], list) and len(line) > 0:
            mid = line[len(line)//2]
            if len(mid) >= 2:
                d = haversine_m(lat, lon, mid[1], mid[0])
                if d < best_d: best_d, best_f = d, f
    if best_f is None: return None

    sid = best_f["properties"]["HYRIV_ID"]
    print(f"  Reach {sid} ({best_d:.0f}m)", file=sys.stderr)

    # Walk downstream via NEXT_DOWN
    walk = [sid]
    cur = best_f["properties"].get("NEXT_DOWN", 0)
    while cur and cur > 0 and cur not in walk:
        walk.append(cur)
        r = ogr2json(f"SELECT HYRIV_ID,NEXT_DOWN FROM HydroRIVERS_v10_na WHERE HYRIV_ID={cur}")
        fts = r.get("features", [])
        if not fts: break
        nd = fts[0]["properties"].get("NEXT_DOWN", 0)
        cur = nd if nd != cur else 0

    # Walk upstream: find reaches whose NEXT_DOWN is in our set
    all_ids = set(walk)
    for _ in range(10):
        prev = len(all_ids)
        for s in range(0, len(list(all_ids)), 200):
            chunk = list(all_ids)[s:s+200]
            q = f"SELECT HYRIV_ID FROM HydroRIVERS_v10_na WHERE NEXT_DOWN IN ({','.join(map(str,chunk))}) AND SHAPE_Length > 0"
            try:
                for f in ogr2json(q).get("features", []):
                    hid = f["properties"]["HYRIV_ID"]
                    if hid not in all_ids: all_ids.add(hid)
            except Exception as e: print(f"  up err: {e}", file=sys.stderr)
        if len(all_ids) == prev: break

    all_ids_list = list(all_ids)
    print(f"  {len(all_ids_list)} reaches", file=sys.stderr)

    pts, seen = [], {}
    for i in range(0, len(all_ids_list), 50):
        chunk = all_ids_list[i:i+50]
        q = f"SELECT HYRIV_ID FROM HydroRIVERS_v10_na WHERE HYRIV_ID IN ({','.join(map(str,chunk))})"
        try:
            for f in ogr2json(q).get("features", []):
                coords = f.get("geometry", {}).get("coordinates", [[[]]])
                if coords and isinstance(coords, list) and len(coords) > 0:
                    for pt in coords[0]:
                        if isinstance(pt, list) and len(pt) >= 2:
                            k = f"{pt[1]:.5f},{pt[0]:.5f}"
                            if k not in seen: seen[k] = True; pts.append([pt[1], pt[0]])
        except Exception as e: print(f"  batch err: {e}", file=sys.stderr)
    return pts if pts else None
def chain_path(raw):
    if len(raw) < 2: return raw
    pts, remaining = [raw[0]], raw[1:]
    while remaining:
        last = pts[-1]
        idx = min(range(len(remaining)), key=lambda i: haversine_m(last[0], last[1], remaining[i][0], remaining[i][1]))
        pts.append(remaining.pop(idx))
    return pts


def resample_path(path, interval=100):
    if len(path) < 2: return [(path[0][0], path[0][1], 0.0)]
    cum = [0.0]
    for i in range(1, len(path)):
        cum.append(cum[-1] + haversine_m(path[i-1][0], path[i-1][1], path[i][0], path[i][1]))
    total = cum[-1]
    if total < 0.1: return [(path[0][0], path[0][1], 0.0)]
    result, target, idx = [], 0.0, 0
    while target <= total + 0.5:
        while idx < len(cum)-1 and cum[idx+1] < target: idx += 1
        if idx >= len(cum)-1: break
        seg = cum[idx+1] - cum[idx]
        frac = max(0, min(1, (target - cum[idx]) / seg)) if seg > 0 else 0
        lat = path[idx][0] + frac * (path[idx+1][0] - path[idx][0])
        lon = path[idx][1] + frac * (path[idx+1][1] - path[idx][1])
        result.append((round(lat,6), round(lon,6), round(target,1)))
        target += interval
    if total - (result[-1][2] if result else 0) > 10:
        result.append((path[-1][0], path[-1][1], round(total,1)))
    return result


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("lat", type=float); ap.add_argument("lon", type=float)
    ap.add_argument("--interval", type=float, default=100)
    ap.add_argument("--json"); ap.add_argument("--river-id")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    find_ogr()
    raw = extract_centerline(args.lat, args.lon)
    if not raw: print("  No geometry", file=sys.stderr); return 1
    r = resample_path(chain_path(raw), args.interval)
    print(f"  {len(r)} pts at {args.interval}m ({r[-1][2]/1000:.1f}km)", file=sys.stderr)
    if args.dry_run:
        print(f"River length: {r[-1][2]/1000:.1f} km"); print(f"Points: {len(r)}"); return 0
    if args.json:
        out = {"id": args.river_id or "auto", "points": [
            {"lat":p[0],"lon":p[1],"cum_m":p[2],"wetted_ft":None,
             "bankfull_ft":None,"thalweg_m":None,"truncated":False} for p in r]}
        with open(args.json, "w") as f: json.dump(out, f)
        print(f"  Wrote {args.json}", file=sys.stderr)
    for p in r: print(f"{p[0]},{p[1]},{p[2]:.1f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
