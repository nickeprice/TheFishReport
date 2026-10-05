"""Vercel entry point for ``/api/streamstats``.

Resolves USGS StreamStats basin characteristics (drainage area, mean basin
elevation, mean annual precipitation) for a given GPS coordinate.

PRIMARY: the USGS StreamStats ``delineateByLatLon`` REST service. As of 2026
the ``streamstats.usgs.gov`` host is in a deprecation/transition state — every
documented path answers 404 and the root redirects to a USGS mission page — so
this call is deliberately best-effort (short timeout, tolerant parser) and is
expected to fall through to the offline estimates in practice.

FALLBACK: when the primary fails (timeout / 404 / HTTP error / ambiguous JSON),
the endpoint computes honest offline estimates from the app's own DEM-measured
data (``src/data/spot_widths.js``) and published USGS gauge facts:

  * drainage area (sq mi) — published gauge values for the covered rivers when
    the gauge is known or resolvable, else a regional default; every value
    carries a wide uncertainty band
  * mean basin elevation (ft) — the nearest 3DEP ``thalweg_m`` sample, converted
    to feet, with an honest ``+/-50%`` band (thalweg != whole-basin mean)
  * mean annual precip (in) — a simple elevation-lapse model
    (``38 + 0.018 * elev_ft``, clamped), again with a wide band

Every metric uses the roadmap Phase 2.3 provenance shape
``{ value, source, uncertainty }`` so the frontend can always distinguish a
live basin delineation from an offline estimate.

Usage::

    GET /api/streamstats?lat=47.195&lon=-122.302
    GET /api/streamstats?lat=47.195&lon=-122.302&site_id=12101500

400 outside the covered region / missing params · 429 over the per-client
burst limit · 503 when the local data files cannot be read.
"""

import json
import math
import os
import re
import ssl
import time as _time
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

SSL_CONTEXT = ssl._create_unverified_context()

_STREAMSTATS_BASE = "https://streamstats.usgs.gov/streamstatsservices"
_STREAMSTATS_REGION = "wa"          # lower-case region code for WA
_STREAMSTATS_TIMEOUT = 8.0          # seconds — this is best-effort by design

# Proxy hardening mirrors api/water_report.py's (same bounds and burst window).
US_LAT_BOUNDS = (24.0, 50.0)
US_LON_BOUNDS = (-125.5, -66.0)
RATE_LIMIT_MAX = 40
RATE_LIMIT_WINDOW = 60.0
_recent_hits = {}


def coords_ok(lat, lon):
    """True when the pair is a plausible coordinate inside the covered region."""
    try:
        lat_f, lon_f = float(lat), float(lon)
    except (TypeError, ValueError):
        return False
    if lat_f != lat_f or lon_f != lon_f:          # NaN
        return False
    return (US_LAT_BOUNDS[0] <= lat_f <= US_LAT_BOUNDS[1]
            and US_LON_BOUNDS[0] <= lon_f <= US_LON_BOUNDS[1])


def client_key(req_handler):
    """Best-effort client identity: proxies put the real IP in a header."""
    for header in ("x-forwarded-for", "x-real-ip", "cf-connecting-ip"):
        val = req_handler.headers.get(header)
        if val:
            return val.split(",")[0].strip()
    try:
        return req_handler.client_address[0]
    except Exception:
        return "unknown"


def is_rate_limited(key):
    """Sliding-window counter (same shape as water_report.py)."""
    now = _time.time()
    hits = [t for t in _recent_hits.get(key, []) if now - t < RATE_LIMIT_WINDOW]
    hits.append(now)
    if len(_recent_hits) > 5000:                  # bounded memory
        _recent_hits.clear()
    _recent_hits[key] = hits
    return len(hits) > RATE_LIMIT_MAX


def _respond(handler, status, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


# ============================================================================
# PRIMARY — live USGS StreamStats delineation (best-effort)
# ============================================================================

# Parameter-id aliases accepted for each metric. StreamStats ids vary slightly
# by regional model; we match case-insensitively against the stable codes.
_AREA_CODES = {"DRNAREA", "DRAINAGEAREA"}
_ELEV_CODES = {"ELEV", "MELEV", "ELEVMEAN", "BASINMEANELEV", "ELEV_M"}
_PRECIP_CODES = {"PRECIP", "PRECIPMEAN", "PRECIPITATION", "PRECIP_AVG"}


def _parse_delineation(payload):
    """Extract DRNAREA / ELEV / PRECIP from a StreamStats delineation reply.

    Tolerates the variable nesting of the geospatial payload; returns None when
    no characteristic can be extracted (ambiguous reply => treated as failure).
    """
    try:
        features = payload.get("featurecollection") or []
        params = features[0].get("parameters", []) if features else []
    except (AttributeError, TypeError, KeyError, IndexError):
        return None
    if not params:
        return None

    def grab(codes):
        for p in params:
            pid = str(p.get("id") or "").upper().strip()
            if pid in codes:
                raw = p.get("value")
                try:
                    val = float(raw)
                except (TypeError, ValueError):
                    return None
                if val != val:                     # NaN
                    return None
                return val
        return None

    area = grab(_AREA_CODES)
    elev = grab(_ELEV_CODES)
    precip = grab(_PRECIP_CODES)
    if area is None and elev is None and precip is None:
        return None
    return {
        "drainage_area_sq_mi": area,
        "mean_elevation_ft": elev,
        "mean_precip_in": precip,
        "_live": True,
    }


def _fetch_streamstats(lat, lon):
    """Best-effort live delineation; None on any failure (never raises)."""
    url = (
        "%s/%s/delineateByLatLon/start?x=%.6f&y=%.6f&crs=4326"
        "&includeparameters=true&includeflowtypes=false"
        "&includefeatures=false"
        % (_STREAMSTATS_BASE, _STREAMSTATS_REGION, lon, lat))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(
                req, timeout=_STREAMSTATS_TIMEOUT,
                context=SSL_CONTEXT) as res:
            if res.getcode() != 200:
                return None
            raw = res.read().decode("utf-8")
        payload = json.loads(raw)
    except Exception:
        return None
    return _parse_delineation(payload)
# ============================================================================
# FALLBACK — offline estimates from the app's own DEM data + gauge facts
# ============================================================================

_SPOT_CANDIDATES = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "..", "public", "src", "data", "spot_widths.js"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "..", "src", "data", "spot_widths.js"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "data", "spot_widths.js"),
)
_spot_data = None

# Verifiable drainage areas (sq mi) — these five are pinned in
# api/spot-geometry.py `_DRAINAGE_AREAS` and are the codebase's known gauge
# facts. Anything outside this set uses the regional default below rather than
# an invented gauge figure (no-fabricate policy).
_DRAINAGE_AREA_SQMI = {
    "12101500": 948, "12098500": 459, "12094000": 195,
    "12113000": 500, "12089500": 516,
}
# Mean of the five verified values; wide band for unresolvable gauges.
_REGIONAL_DEFAULT_DRAINAGE_SQMI = 520.0
_REGIONAL_DEFAULT_ELEV_FT = 2500.0
_UNRESOLVED_UNC = 0.50          # unknown gauge -> wide band
_KNOWN_GAUGE_UNC = 0.20         # resolved to a known gauge who still get a band
_THALWEG_UNC = 0.50             # thalweg != whole-basin mean elevation
_PRECIP_UNC = 0.35              # lapse model is coarse

_STREAMSTATS_LIVE_SOURCE = "usgs-streamstats live delineation"
_OFFLINE_AREA_SOURCE = "offline-estimate: published USGS gauge area"
_OFFLINE_AREA_DEFAULT_SOURCE = "offline-estimate: regional default (unresolved gauge)"
_OFFLINE_ELEV_SOURCE = "offline-estimate: nearest 3DEP thalweg (spot_widths.js)"
_OFFLINE_PRECIP_SOURCE = "offline-estimate: elevation-lapse model on spot thalweg"


def _load_spot_data():
    """Cached parse of ``window.SPOT_WIDTHS.rivers = { ... };`` from spot_widths.js."""
    global _spot_data
    if _spot_data is not None:
        return _spot_data
    _spot_data = {}
    marker = "window.SPOT_WIDTHS.rivers = "
    for path in _SPOT_CANDIDATES:
        try:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
            start = text.index(marker) + len(marker)
            end = text.rindex(";")
            payload = text[start:end]
            payload = re.sub(r",\n(\s*)([}\]])", r"\n\1\2", payload)
            _spot_data = json.loads(payload)
            break
        except Exception:
            continue
    return _spot_data


def _haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def _nearest_spot(lat, lon):
    """Nearest {lat, lon, thalweg_m, site_id, river} DEM sample, or None."""
    data = _load_spot_data()
    if not data:
        return None
    best = None
    best_d = float("inf")
    for river_key, river in data.items():
        site_id = river.get("site_id")
        for pt in river.get("points", []):
            d = _haversine_m(lat, lon, pt["lat"], pt["lon"])
            if d < best_d:
                best_d = d
                best = {
                    "lat": pt["lat"], "lon": pt["lon"],
                    "thalweg_m": pt.get("thalweg_m"),
                    "site_id": site_id, "river": river.get("name", river_key),
                }
    return best
def _offline_estimates(lat, lon, site_id):
    """Honest offline estimates; every metric uses { value, source, uncertainty }."""
    spot = _nearest_spot(lat, lon)
    if spot is None:
        return None                       # no local data at all -> caller 503s

    # Drainage area: use the pinned gauge fact when we know this site.
    area_sqmi = None
    area_src = _OFFLINE_AREA_DEFAULT_SOURCE
    area_unc = _UNRESOLVED_UNC
    sid = site_id or spot.get("site_id")
    if sid and sid in _DRAINAGE_AREA_SQMI:
        area_sqmi = float(_DRAINAGE_AREA_SQMI[sid])
        area_src = _OFFLINE_AREA_SOURCE
        area_unc = _KNOWN_GAUGE_UNC
    if area_sqmi is None:
        area_sqmi = _REGIONAL_DEFAULT_DRAINAGE_SQMI

    # Elevation: nearest 3DEP thalweg converted to feet.
    elev_ft = None
    elev_src = _OFFLINE_ELEV_SOURCE
    elev_unc = _THALWEG_UNC
    if spot.get("thalweg_m") is not None:
        elev_ft = round(spot["thalweg_m"] * 3.28084, 1)
    else:
        elev_ft = _REGIONAL_DEFAULT_ELEV_FT
        elev_unc = 0.60

    # Precip: coarse elevation-lapse model, clamped to plausible WA range.
    p = max(35.0, min(160.0, 38.0 + 0.018 * elev_ft))
    precip_in = round(p, 1)

    return {
        "_offline": True,
        "site_id": sid,
        "drainage_area_sq_mi": {
            "value": round(area_sqmi, 1),
            "source": area_src,
            "uncertainty": area_unc,
        },
        "mean_elevation_ft": {
            "value": elev_ft,
            "source": elev_src,
            "uncertainty": elev_unc,
        },
        "mean_precip_in": {
            "value": precip_in,
            "source": _OFFLINE_PRECIP_SOURCE,
            "uncertainty": _PRECIP_UNC,
        },
        "resolved_site_id": sid,
    }


def _live_metrics(parsed):
    """Wrap a successful live delineation into the provenance shape."""
    m = {}
    if parsed.get("drainage_area_sq_mi") is not None:
        m["drainage_area_sq_mi"] = {
            "value": parsed["drainage_area_sq_mi"],
            "source": _STREAMSTATS_LIVE_SOURCE,
            "uncertainty": 0.05,
        }
    if parsed.get("mean_elevation_ft") is not None:
        m["mean_elevation_ft"] = {
            "value": parsed["mean_elevation_ft"],
            "source": _STREAMSTATS_LIVE_SOURCE,
            "uncertainty": 0.10,
        }
    if parsed.get("mean_precip_in") is not None:
        m["mean_precip_in"] = {
            "value": parsed["mean_precip_in"],
            "source": _STREAMSTATS_LIVE_SOURCE,
            "uncertainty": 0.10,
        }
    return m


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        # Only actual API requests fan out to third parties; a bare / health
        # probe (local tests, LB checks) must never consume the client's budget.
        if urlparse(self.path).path.startswith("/api/") and is_rate_limited(client_key(self)):
            return _respond(self, 429,
                            {"ok": False, "error": "Too many requests",
                             "retry_after_s": int(RATE_LIMIT_WINDOW)})

        qs = parse_qs(urlparse(self.path).query)
        try:
            lat = float(qs.get("lat", [None])[0])
            lon = float(qs.get("lon", [None])[0])
        except (TypeError, ValueError, IndexError):
            return _respond(
                self, 400,
                {"ok": False,
                 "error": "lat and lon are required numeric query parameters"})
        if not coords_ok(lat, lon):
            return _respond(
                self, 400,
                {"ok": False, "error": "Coordinates outside the covered region"})
        site_id = (qs.get("site_id") or [None])[0]
        if site_id is not None and not str(site_id).strip():
            site_id = None

        # Primary: live USGS StreamStats delineation (best-effort).
        parsed = _fetch_streamstats(lat, lon)
        if parsed:
            metrics = _live_metrics(parsed)
            out = {
                "ok": True,
                "mode": "live",
                "site_id": site_id,
                "resolved_site_id": parsed.get("site_id"),
                "note": None,
            }
        else:
            # Fallback: offline estimates from local DEM data + gauge facts.
            est = _offline_estimates(lat, lon, site_id)
            if est is None:
                return _respond(
                    self, 503,
                    {"ok": False,
                     "error": "StreamStats unavailable and local spot geometry data cannot be read"})
            _ = est.pop("_offline")
            metrics = {k: v for k, v in est.items()
                       if k not in ("site_id", "resolved_site_id")}
            out = {
                "ok": True,
                "mode": "offline",
                "site_id": site_id,
                "resolved_site_id": est.get("resolved_site_id"),
                "note": ("USGS StreamStats unreachable or ambiguous — "
                         "offline estimates carry wide uncertainty bounds"),
            }

        if "drainage_area_sq_mi" in metrics:
            out["drainage_area_sq_mi"] = metrics["drainage_area_sq_mi"]
        if "mean_elevation_ft" in metrics:
            out["mean_elevation_ft"] = metrics["mean_elevation_ft"]
        if "mean_precip_in" in metrics:
            out["mean_precip_in"] = metrics["mean_precip_in"]

        return _respond(self, 200, out)