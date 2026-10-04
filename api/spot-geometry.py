"""Vercel entry point for ``/api/spot-geometry``.

Returns the nearest pre-computed DEM cross-section geometry for the
given GPS coordinates, using the SPOT_WIDTHS static lookup table
(``src/data/spot_widths.js``) that the frontend loads as ``window.SPOT_WIDTHS``.

Phase 1.9 enhancement: accepts optional ``flow`` (discharge in cfs). When
provided, returns Manning-corrected hydraulic estimates (velocity, depth) at
the spot, using the same logic as the frontend's continuity.js. Also returns
site characteristics (gauge width, drainage area) from companion data files.

Usage::

    GET /api/spot-geometry?lat=47.2&lon=-122.3
    GET /api/spot-geometry?lat=47.2&lon=-122.3&site_id=12101500
    GET /api/spot-geometry?lat=47.2&lon=-122.3&site_id=12101500&flow=1650

404 when no point is within the covered rivers; 400 on missing params.
503 when data files are unavailable.
"""

import re
import json
import math
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

_SPOT_CANDIDATES = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "..", "src", "data", "spot_widths.js"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "data", "spot_widths.js"),
)
_CHANNEL_CANDIDATES = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "..", "src", "data", "channel_measurements.js"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "data", "channel_measurements.js"),
)
_WIDTHS_CANDIDATES = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "..", "src", "data", "river_widths.js"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "data", "river_widths.js"),
)
_DRAINAGE_AREAS = {
    "12101500": 948, "12098500": 459, "12094000": 195,
    "12113000": 500, "12089500": 516,
}
_spot_data = None
_channel_data = None
_widths_data = None
def _load_js(candidates, marker):
    for path in candidates:
        try:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
            start = text.rindex(marker) + len(marker)
            end = text.rindex(";")
            payload = text[start:end]
            # Strip JS-style trailing commas before JSON parsing
            payload = re.sub(r",\n(\s*)([}\]])", r"\n\1\2", payload)
            return json.loads(payload)
        except Exception:
            continue
    return {}


def _load_spot_data():
    global _spot_data
    if _spot_data is None:
        _spot_data = _load_js(_SPOT_CANDIDATES,
                              "window.SPOT_WIDTHS.rivers = ")
    return _spot_data


def _load_channel_data():
    global _channel_data
    if _channel_data is None:
        _channel_data = _load_js(_CHANNEL_CANDIDATES,
                                 "window.CHANNEL_MEASUREMENTS.sites = ")
    return _channel_data

def _haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def _nearest_point(lat, lon, site_id=None, max_distance_m=10000):
    data = _load_spot_data()
    n_rivers = len(data) if data else 0
    if not data:
        return None, n_rivers
    best = None
    best_dist = float("inf")
    for river_key, river in data.items():
        if site_id and river.get("site_id") != site_id:
            continue
        for pt in river.get("points", []):
            d = _haversine_m(lat, lon, pt["lat"], pt["lon"])
            if d < best_dist:
                best_dist = d
                best = {
                    "lat": pt["lat"], "lon": pt["lon"],
                    "cum_m": pt["cum_m"],
                    "wetted_ft": pt["wetted_ft"],
                    "bankfull_ft": pt["bankfull_ft"],
                    "thalweg_m": pt["thalweg_m"],
                    "truncated": pt["truncated"],
                    "river": river["name"],
                    "site_id": river["site_id"],
                    "distance_m": round(d, 1),
                }
    if best is None or best_dist > max_distance_m:
        return None, n_rivers
    return best, n_rivers


# ── Phase 1.9: Hydraulic geometry estimates ─────────────────────────────────────

def _hydraulic_velocity(flow_cfs, site_id):
    ch = _load_channel_data()
    if not ch or not site_id:
        return None
    site = ch.get(site_id)
    if not site or not site.get("fit"):
        return None
    fit = site["fit"]
    a = fit.get("a")
    b = fit.get("b")
    if not a or not b or flow_cfs <= 0:
        return None
    mean = a * (flow_cfs ** b)
    bottom = mean * (0.05 ** (1.0 / 6.0))
    return {"mean": round(mean, 4), "bottom": round(bottom, 4)}


def _depth_at_gauge(flow_cfs, site_id, nearest_n=6):
    ch = _load_channel_data()
    if not ch or not site_id:
        return None
    site = ch.get(site_id)
    if not site or not site.get("points"):
        return None
    pts = site["points"]
    if len(pts) < 2:
        return None
    rows = []
    for p in pts:
        w = p.get("w")
        a = p.get("a")
        q = p.get("q")
        if w and a and w > 0 and a > 0 and q > 0:
            rows.append({"q": q, "d": a / w, "w": w, "v": p.get("v", 0)})
    if len(rows) < 2:
        return None
    q = max(flow_cfs, 1)
    picked = sorted(rows, key=lambda r: abs(math.log(r["q"] / q)))
    picked = picked[:nearest_n]
    if len(picked) < 2:
        return None
    ds = sorted(r["d"] for r in picked)
    mid = (ds[len(ds) // 2] if len(ds) % 2
           else (ds[len(ds) // 2 - 1] + ds[len(ds) // 2]) / 2.0)
    return {"value": round(mid, 4), "min": round(ds[0], 4),
            "max": round(ds[-1], 4)}


def _manning_at_spot(flow_cfs, site_id, w_spot_ft):
    widths = _load_widths_data()
    w_gauge = None
    if widths and site_id and site_id in widths:
        w_gauge = widths[site_id].get("width_ft")
    if not w_gauge or w_gauge <= 0 or w_spot_ft <= 0:
        return None
    v_gauge = _hydraulic_velocity(flow_cfs, site_id)
    d_gauge = _depth_at_gauge(flow_cfs, site_id)
    if not v_gauge or not d_gauge:
        return None
    ratio = w_gauge / w_spot_ft
    depth_factor = ratio ** 0.6
    vel_factor = ratio ** -0.4
    return {
        "flow": round(flow_cfs, 1),
        "gauge_velocity_fps": round(v_gauge["mean"], 2),
        "spot_velocity_fps": round(v_gauge["mean"] * vel_factor, 2),
        "gauge_depth_ft": round(d_gauge["value"], 2),
        "spot_depth_ft": round(d_gauge["value"] * depth_factor, 2),
        "gauge_width_ft": round(w_gauge, 1),
        "w_spot_ft": round(w_spot_ft, 1),
        "method": "Manning-continuity (w_spot/w_gauge)^(2/5), (w_gauge/w_spot)^(3/5)",
    }


def _respond(handler, status, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        try:
            lat = float(qs.get("lat", [None])[0])
            lon = float(qs.get("lon", [None])[0])
        except (TypeError, ValueError, IndexError):
            return _respond(
                self, 400,
                {"error": "lat and lon are required numeric query parameters"})
        site_id = (qs.get("site_id") or [None])[0]
        flow_str = (qs.get("flow") or [None])[0]
        flow_cfs = float(flow_str) if flow_str else None
        if abs(lat) > 90 or abs(lon) > 180:
            return _respond(self, 400, {"error": "lat or lon out of range"})
        result, n_rivers = _nearest_point(lat, lon, site_id)
        if result is None:
            if not _load_spot_data():
                return _respond(self, 503,
                                {"error": "spot geometry data unavailable"})
            return _respond(
                self, 404,
                {"error": "no spot geometry found for the given coordinates",
                 "n_rivers": n_rivers})
        sid = result["site_id"]
        widths = _load_widths_data()
        if widths and sid in widths:
            result["gauge_width_ft"] = widths[sid].get("width_ft")
            result["gauge_width_method"] = widths[sid].get("method", "unknown")
        if sid in _DRAINAGE_AREAS:
            result["drainage_area_sq_mi"] = _DRAINAGE_AREAS[sid]
        sources = ["pre-computed DEM cross-section (spot_widths.js)"]
        if flow_cfs is not None and flow_cfs > 0:
            w_spot = result.get("wetted_ft", 0)
            if w_spot > 0:
                hyd = _manning_at_spot(flow_cfs, sid, w_spot)
                if hyd:
                    result["hydraulic_estimates"] = hyd
                    sources.append(
                        "USGS channel measurements (channel_measurements.js)")
                    sources.append("routed gauge width (river_widths.js)")
        return _respond(self, 200, {
            "ok": True,
            "result": result,
            "n_rivers": n_rivers,
            "sources": sources,
        })

def _load_widths_data():
    global _widths_data
    if _widths_data is None:
        _widths_data = _load_js(_WIDTHS_CANDIDATES,
                                "window.RIVER_WIDTHS = ")
    return _widths_data