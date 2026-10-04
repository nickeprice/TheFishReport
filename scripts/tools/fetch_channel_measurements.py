#!/usr/bin/env python3
"""Fetch USGS field discharge measurements -> src/data/channel_measurements.js.

WHY THIS EXISTS
The Gear Sim's velocity came from a single-site empirical fit (`0.25 * Q^0.4`) —
a LEVEL that is several times too high for these gravel-bed rivers. USGS field
crews already solve this the honest way: several times a year they wade or boat
across the gauge and MEASURE discharge, channel width, cross-section area and
mean velocity by hand, then publish it. Those measurements ARE `v = Q/A` truth at
the gauge, so the app can stop guessing at velocity and interpolate the real
flow-response instead.

This is a ONE-TIME extraction, re-run when a station is added or data ages out —
the same shape as `extract_river_widths.py`.

SOURCE
  `channel-measurements` collection, USGS Water Data OGC API
  (api.waterdata.usgs.gov) — public, no key. The legacy NWISWeb RDB endpoints are
  being decommissioned, so this uses the modern OGC API with a CQL2 filter.

QUALITY GATE, deliberate
  The published rows are not perfectly clean: at least one measurement reports a
  cross-section area with a trailing zero (Q != v * A by an order of magnitude).
  Every row is therefore checked against continuity (`Q ~= v * A`, 5% tolerance)
  and incoherent rows are DROPPED and reported on stderr. A typo must never be
  baked into a velocity curve.

Output is DETERMINISTIC: points sorted by discharge, no timestamps, so re-running
against unchanged upstream data produces a byte-identical file.

Usage:
    python3 scripts/fetch_channel_measurements.py
    python3 scripts/fetch_channel_measurements.py --sites 12101500 --out /tmp/cm.js
    python3 scripts/fetch_channel_measurements.py --print
"""

import argparse
import json
import math
import ssl
import sys
import urllib.parse
import urllib.request

# python.org macOS builds do not populate the system trust store; prefer certifi
# when it is importable (mirrors scripts/extract_river_widths.py).
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:                                   # pragma: no cover
    SSL_CTX = ssl.create_default_context()

API = "https://api.waterdata.usgs.gov/ogcapi/v0/collections/channel-measurements/items"

# The five gauged waterbodies the app tracks (src/data/regions/washington.js).
SITES = [
    ("12101500", "Puyallup River at Puyallup"),
    ("12098500", "White River near Buckley"),
    ("12094000", "Carbon River near Fairfax"),
    ("12113000", "Green River near Auburn"),
    ("12089500", "Nisqually River at McKenna"),
]

CONTINUITY_TOL = 0.05       # |Q - v*A| / Q must stay inside 5%
MIN_POINTS = 2              # a one-point "curve" has no shape
THIN_RECENT_MIN = 5         # fewer than this many measurements in the last 10y -> flag it
DEFAULT_OUT = "src/data/channel_measurements.js"


def fetch_site(site_id, limit=2000):
    """Return every channel-measurement feature for one monitoring location."""
    cql = "monitoring_location_id='USGS-{}'".format(site_id)
    params = {"filter": cql, "limit": limit, "sortby": "-time", "f": "json"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Accept": "application/json",
                                               "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90, context=SSL_CTX) as resp:
        payload = json.load(resp)
    return payload.get("features") or []


def _num(value):
    """USGS serves these as strings; blank/absent means 'not measured'."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def points_for_site(features, site_id, dropped):
    """Coherent (q, w, a, v, t) points for one site, sorted by discharge."""
    seen = set()
    points = []
    for feat in features:
        p = feat.get("properties") or {}
        if p.get("monitoring_location_id") != "USGS-" + site_id:
            continue
        q = _num(p.get("channel_flow"))
        w = _num(p.get("channel_width"))
        a = _num(p.get("channel_area"))
        v = _num(p.get("channel_velocity"))
        when = (p.get("time") or "")[:10]
        if q is None or w is None or a is None or v is None or not when:
            continue                           # partial row: nothing to interpolate

        # Continuity gate: Q = v * A. Catches the published trailing-zero typo.
        if abs(q - v * a) / q > CONTINUITY_TOL:
            dropped.append((site_id, when, q, v, a))
            continue

        key = (when, round(q, 3))
        if key in seen:
            continue
        seen.add(key)
        points.append({"t": when, "q": round(q, 1), "w": round(w, 1),
                       "a": round(a, 1), "v": round(v, 3)})

    points.sort(key=lambda pt: (pt["q"], pt["t"]))
    return points


def fit_power_law(points):
    """Least-squares v = a * Q^b in log-log space (standard hydraulic geometry).

    A power law is used at runtime instead of raw piecewise interpolation: the
    record spans decades of channel change, so scattered same-discharge points
    would otherwise make the curve jump. r^2 is reported so the fit's quality is
    visible rather than assumed.
    """
    xs = [math.log(pt["q"]) for pt in points]
    ys = [math.log(pt["v"]) for pt in points]
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    if sxx <= 0:
        return None
    b = sxy / sxx
    a = math.exp(my - b * mx)
    syy = sum((y - my) ** 2 for y in ys)
    r2 = (sxy ** 2) / (sxx * syy) if syy > 0 else 1.0
    return {"a": round(a, 6), "b": round(b, 4), "r2": round(r2, 4)}


def render_js(sites_data):
    """Deterministic classic-script payload (window.CHANNEL_MEASUREMENTS)."""
    ordered = sorted(sites_data)
    lines = [
        "/* GENERATED - do not edit by hand.",
        " * Source: USGS field discharge measurements (`channel-measurements`, Water Data OGC API).",
        " * Regenerate: python3 scripts/fetch_channel_measurements.py",
        " *",
        " * fit   = least-squares v = a * Q^b (log-log), the hydraulic-geometry curve",
        " *         the Gear Sim interpolates instead of `0.25 * Q^0.4`.",
        " * points = the underlying measurements (audit trail), each:",
        " *         q = discharge (cfs)    v = measured mean velocity (ft/s)",
        " *         w = channel width (ft) a = cross-section area (ft^2)  t = date",
        " * Rows failing the Q = v*A continuity gate are dropped (see the script).",
        " */",
        "window.CHANNEL_MEASUREMENTS = window.CHANNEL_MEASUREMENTS || {};",
        "window.CHANNEL_MEASUREMENTS.sites = {",
    ]
    for i, sid in enumerate(ordered):
        entry = sites_data[sid]
        pts = entry["points"]
        fit = entry["fit"]
        lines.append('    "{}": {{'.format(sid))
        lines.append('        "name": {},'.format(json.dumps(entry["name"])))
        lines.append('        "n": {}, "first_yr": {}, "last_yr": {}, "recent_n": {},'
                     ' "thin_recent": {},'.format(
                         len(pts), entry["first_yr"], entry["last_yr"], entry["recent_n"],
                         "true" if entry["thin_recent"] else "false"))
        lines.append('        "qmin": {}, "qmax": {},'.format(pts[0]["q"], pts[-1]["q"]))
        lines.append('        "fit": {{ "a": {}, "b": {}, "r2": {} }},'.format(
            fit["a"], fit["b"], fit["r2"]))
        lines.append('        "points": [')
        for pt in pts:
            lines.append(
                '            {{ "t": "{}", "q": {}, "w": {}, "a": {}, "v": {} }},'.format(
                    pt["t"], pt["q"], pt["w"], pt["a"], pt["v"]))
        lines.append("        ]")
        lines.append("    }" + ("," if i < len(ordered) - 1 else ""))
    lines.append("};")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sites", help="comma-separated site ids (default: all five)")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--print", dest="to_stdout", action="store_true",
                    help="print the JS payload instead of writing it")
    args = ap.parse_args()

    wanted = [s for s in SITES if not args.sites or s[0] in args.sites.split(",")]
    if not wanted:
        print("no matching site: " + str(args.sites), file=sys.stderr)
        return 1

    sites_data = {}
    dropped = []
    for sid, name in wanted:
        try:
            feats = fetch_site(sid)
        except Exception as exc:
            print("{} {}: fetch failed: {}".format(sid, name, exc), file=sys.stderr)
            continue
        pts = points_for_site(feats, sid, dropped)
        if len(pts) < MIN_POINTS:
            print("{} {}: only {} coherent point(s)".format(sid, name, len(pts)),
                  file=sys.stderr)
            continue
        fit = fit_power_law(pts)
        if not fit or fit["a"] <= 0 or not (0 < fit["b"] < 1.5):
            print("{} {}: implausible fit {}, skipped".format(sid, name, fit),
                  file=sys.stderr)
            continue
        # Temporal honesty: the fit pools the WHOLE record, so publish the span and how
        # much of it is recent. A gauge whose curve rests on pre-2010 data (the White has a
        # single measurement since 2010) must be able to say so instead of looking timeless.
        yrs = sorted(int(pt["t"][:4]) for pt in pts)
        recent_n = sum(1 for y in yrs if y >= yrs[-1] - 10)
        sites_data[sid] = {
            "name": name, "points": pts, "fit": fit,
            "first_yr": yrs[0], "last_yr": yrs[-1], "recent_n": recent_n,
            "thin_recent": recent_n < THIN_RECENT_MIN,
        }
        print("{:10s} {:<32s} {:3d} pts {}..{}  recent10y={:<3d}{}  v={}*Q^{}  r2={}".format(
            sid, name, len(pts), yrs[0], yrs[-1], recent_n,
            " THIN" if recent_n < THIN_RECENT_MIN else "    ",
            fit["a"], fit["b"], fit["r2"]))

    if dropped:
        print("\ndropped {} row(s) failing Q = v*A:".format(len(dropped)), file=sys.stderr)
        for sid, when, q, v, a in dropped:
            print("  {} {}: Q={} v={} A={} (v*A={})".format(
                sid, when, q, v, a, round(v * a, 1)), file=sys.stderr)

    if not sites_data:
        print("nothing fetched; refusing to write", file=sys.stderr)
        return 1

    payload = render_js(sites_data)
    if args.to_stdout:
        sys.stdout.write(payload)
        return 0
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(payload)
    print("\nwrote {} ({} sites)".format(args.out, len(sites_data)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
