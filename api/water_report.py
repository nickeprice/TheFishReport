import json
import math
import os
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from zoneinfo import ZoneInfo
import ssl

SSL_CONTEXT = ssl._create_unverified_context()

# ==================================================================================
# REGION REGISTRY (UPDATE 3.0 Phase 1.3)
# ONE source of truth shared with the frontend: src/data/regions/washington.js, whose
# payload is strict JSON (the frontend loads that same file as a classic script).
# We slice from the state assignment marker to the final semicolon and json.loads()
# it, so these station constants can never drift from the app's.
#
# DEPLOY NOTE: the registry file must ship alongside this handler. If it cannot be
# read, the legacy literals below are used verbatim so the API still serves the
# default river instead of failing outright.
# ==================================================================================
_REGION_STATE = "WA"
_REGION_CANDIDATES = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "regions", "washington.js"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "regions", "washington.js"),
)
_registry = None


def load_region_registry(state=_REGION_STATE):
    """Parsed region registry for `state` (cached for the warm instance); {} if unreadable."""
    global _registry
    if _registry is None:
        _registry = {}
        marker = "window.REGIONS." + state + " = "
        for path in _REGION_CANDIDATES:
            try:
                with open(path, encoding="utf-8") as fh:
                    text = fh.read()
                _registry = json.loads(text[text.rindex(marker) + len(marker):text.rindex(";")])
                break
            except Exception:
                continue
    return _registry


_WA = load_region_registry("WA")

# Every gauged site id -> the waterbody that owns it (gauge + related gauges).
_WB_BY_SITE = {}
for _wb in _WA.get("waterbodies", []):
    if (_wb.get("gauge") or {}).get("site_id"):
        _WB_BY_SITE[str(_wb["gauge"]["site_id"])] = _wb
    for _rel in (_wb.get("related_gauges") or []):
        if _rel.get("site_id"):
            _WB_BY_SITE.setdefault(str(_rel["site_id"]), _wb)


def stocks_for_site(site_id):
    """Species -> baseline meta for the waterbody that owns `site_id`.

    Empty when that waterbody has no verified baselines, so an off-basin river can
    never inherit another river's run numbers (AGENTS.md: never fabricate)."""
    _wb = _WB_BY_SITE.get(str(site_id))
    if not _wb or not _wb.get("stocks"):
        return {}
    return {_s["species"]: _s for _s in _wb["stocks"]}


def legal_hours_for_site(site_id):
    """The waterbody's fishing-hours rule: daylight | 24hr | custom | unknown.

    "unknown" is the honest default - a legal window is never invented (UPDATE 3.0
    Phase 1.5). The frontend renders "check the regulations" for it."""
    _wb = _WB_BY_SITE.get(str(site_id))
    return ((_wb or {}).get("legal_hours") or "unknown")


USGS_SITE = _WA.get("default_site") or "12101500"
NOAA_STATION = _WA.get("default_tide_station") or "9446484"   # fallback only; see tide_station_for_site()
_coords = _WA.get("default_coords") or {}
LAT = _coords.get("lat", 47.1950)
LON = _coords.get("lon", -122.3020)
FORECAST_DAYS = _WA.get("forecast_days") or 4

# Netting (gillnet sets by tribes) is a Puyallup/White/Carbon basin reality ONLY.
# Off-basin rivers (Green, Nisqually, Skagit, ...) must never read "Nets In".
NETTING_DAYS = _WA.get("netting_days") or [6, 0, 1]
NETTING_SITES = set()
for _wb in _WA.get("waterbodies", []):
    NETTING_SITES.update(_wb.get("netting_sites") or [])
if not NETTING_SITES:
    NETTING_SITES = {"12101500", "12093500", "12094000"}

def mm_to_in(mm): return mm / 25.4
def hpa_to_inhg(hpa): return hpa * 0.02953

def fmt_duration(total_min):
    """"
    Format a minute count as a compact '15M' / '3H' / '1H30M' string (or '').
    """
    if total_min is None: return ''
    total_min = int(round(total_min))
    if total_min < 1: return ''
    if total_min < 60: return f"{total_min}M"
    h, m = divmod(total_min, 60)
    return f"{h}H" + (f"{m}M" if m else "")

def precip_phase(hourly, time_arr, ref_iso):
    """"
    Return (phase, start_text, end_text) for the current precipitation story:

      phase:
        'none'   — no ≥30% hours in the visible horizon (both texts '')
        'later'  — dry now, next ≥30% spell is upcoming   (start = 'in 3H')
        'now'    — currently in a ≥30% spell              (end = 'now for 2H')
        'breaks' — the current spell just ended and the next is hours away,
                   fall back to that next spell's start (honest 'in 5H')

    Uses Open-Meteo's hourly precipitation_probability (0-100). All strings are
    display-only hints derived from a real forecast — never fabricated numbers.
    """
    try:
        if not hourly or not time_arr: return 'none', '', ''
        pp = hourly.get('precipitation_probability')
        times = [datetime.fromisoformat(h) for h in time_arr]
        if not pp or not times: return 'none', '', ''
        ref = datetime.fromisoformat(ref_iso)
        # Find the nearest hour index (the app's existing "now" anchor).
        best = min(range(len(times)), key=lambda i: abs((times[i] - ref).total_seconds()))
        raining = []
        for k in range(best, len(times)):
            if k >= len(pp): break
            if pp[k] is not None and float(pp[k]) >= 30.0:
                raining.append(k)
        # Currently in a wet hour?
        if best < len(raining) and raining[0] == best:
            # Count consecutive wet hours from here for the duration estimate.
            run = [best]
            for k in range(best + 1, len(times)):
                if k >= len(pp): break
                if pp[k] is not None and float(pp[k]) >= 30.0: run.append(k)
            dur_min = (times[run[-1]] - times[run[0]]).total_seconds() / 60.0 + 60.0
            return 'now', '', 'now for ' + fmt_duration(dur_min)
        if raining:
            start_min = (times[raining[0]] - ref).total_seconds() / 60.0
            return 'later', 'in ' + fmt_duration(start_min), ''
        # Nothing ≥30% ahead: the last spell may just have ended; still honest '--'.
        return 'none', '', ''
    except Exception:
        return 'none', '', ''

def compass_from_deg(deg):
    """16-point compass label for a bearing in degrees (e.g. 225 -> 'SW')."""
    if deg is None: return None
    dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
    idx = int(round((((float(deg) % 360) + 360) % 360) / 22.5)) % 16
    return dirs[idx]

# ==================================================================================
# USGS WDFN OGC API (UPDATE 3.0 Phase 2.1)
# waterservices.usgs.gov (nwis/iv) is DECOMMISSIONED in Q1 2027. The modernized
# replacement is the OGC API at api.waterdata.usgs.gov, which:
#   * needs NO api key (a key only raises the rate limit -> optional),
#   * takes a "USGS-"-prefixed location id,
#   * returns GeoJSON features (properties.value / .time) not NWIS timeSeries.
# The legacy reader is kept as fetch_usgs_telemetry_legacy() and is used only when
# the modern endpoint is unreachable/unparseable, so the app cannot regress.
# ==================================================================================
WDFN_BASE = "https://api.waterdata.usgs.gov/ogcapi/v1/collections"
WDFN_PARAMS = "00060,00065,00010,63680"   # discharge, gage height, water temp, turbidity
WDFN_TIMEOUT = 8


# Optional: the API works without a key but throttles per IP (HTTP 429). Set
# USGS_API_KEY in the server env to raise the limit. Never expose it to the client.
WDFN_API_KEY = os.environ.get("USGS_API_KEY", "").strip()


def _wdfn_get(url, timeout=WDFN_TIMEOUT):
    """GET + JSON-decode a WDFN OGC API url. Raises on any failure.

    A raised 429 is TRANSIENT (rate limiting), NOT "there is no data" — callers must
    never collapse the two, or a throttle gets reported to the angler as an empty river.
    """
    if WDFN_API_KEY and url.startswith(WDFN_BASE) and "api_key=" not in url:
        url = url + "&api_key=" + WDFN_API_KEY
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as res:
        return json.loads(res.read().decode('utf-8'))


def format_site_name(site_raw):
    """Title-case a USGS station name exactly as the legacy nwis/iv parser did."""
    if not site_raw:
        return None
    if site_raw.isupper():
        parts = site_raw.title().rsplit(', ', 1)
        formatted = f"{parts[0]}, {parts[1].upper()}" if (len(parts) == 2 and len(parts[1]) == 2) else site_raw.title()
        return formatted.replace(" At ", " at ").replace(" Near ", " near ")
    return site_raw


def fetch_wdfn_site_name(site_id):
    """Station name from the monitoring-locations collection (None when unavailable)."""
    try:
        d = _wdfn_get(f"{WDFN_BASE}/monitoring-locations/items?id=USGS-{site_id}&limit=1")
        feats = d.get("features") or []
        if feats:
            return format_site_name(feats[0].get("properties", {}).get("monitoring_location_name"))
    except Exception:
        pass
    return None

def fetch_usgs_telemetry_wdfn(site_id):
    """USGS WDFN OGC API telemetry — same dict shape as the legacy reader.

    Returns None (so the caller falls back to legacy nwis/iv) only when the endpoint
    is unreachable or the response shape is unrecognizable. A valid-but-empty
    FeatureCollection is NOT a fallback: it honestly means "no fresh readings here".
    """
    default_name = "Puyallup River at Puyallup, WA" if site_id == USGS_SITE else f"USGS Station {site_id}"
    out = {"site_name": default_name, "cfs": None, "gage": None,
           "water_temp_f": None, "turbidity_fnu": None,
           "is_active": False, "updated_time": "Updated: Telemetry Offline", "api_offline": True}
    try:
        d = _wdfn_get(f"{WDFN_BASE}/latest-continuous/items"
                      f"?monitoring_location_id=USGS-{site_id}"
                      f"&parameter_code={WDFN_PARAMS}&limit=50")
    except Exception:
        return None
    feats = d.get("features")
    if feats is None:
        return None                       # shape changed -> let the legacy reader try

    name = fetch_wdfn_site_name(site_id)
    if name:
        out["site_name"] = name
    # Live response parsed — clear the offline fallback so the frontend can tell
    # "USGS unreachable" apart from "station seasonal".
    out["api_offline"] = False

    now_aware = datetime.now(timezone.utc)
    latest_dt = None
    latest_for = {}
    for f in feats:
        p = f.get("properties") or {}
        code = str(p.get("parameter_code") or "")
        if code not in ("00060", "00065", "00010", "63680"):
            continue
        try:
            val = float(p.get("value"))
        except (TypeError, ValueError):
            continue
        if val < -900000:                 # NWIS missing/error sentinel
            continue
        try:
            reading_dt = datetime.fromisoformat(str(p.get("time")))
        except Exception:
            continue
        if reading_dt.tzinfo is None:
            reading_dt = reading_dt.replace(tzinfo=timezone.utc)
        if (now_aware - reading_dt).total_seconds() > 24 * 3600:
            continue                      # stale (>24h) -> never reported as current
        if code not in latest_for or reading_dt > latest_for[code][0]:
            latest_for[code] = (reading_dt, val)
        if latest_dt is None or reading_dt > latest_dt:
            latest_dt = reading_dt

    if "00060" in latest_for:
        out["cfs"] = latest_for["00060"][1]
    if "00065" in latest_for:
        out["gage"] = latest_for["00065"][1]
    if "00010" in latest_for:
        # Own-gauge water temperature: Celsius -> Fahrenheit, exactly once.
        out["water_temp_f"] = round((latest_for["00010"][1] * 9.0 / 5.0) + 32.0, 1)
    if "63680" in latest_for:
        out["turbidity_fnu"] = round(latest_for["63680"][1], 1)

    if latest_dt and ("00060" in latest_for or "00065" in latest_for):
        out["is_active"] = True
        # WDFN times are UTC; display them in Pacific like the rest of the report.
        pacific = latest_dt.astimezone(ZoneInfo('America/Los_Angeles'))
        today = datetime.now(ZoneInfo('America/Los_Angeles')).date()
        day_prefix = "Today at " if pacific.date() == today else pacific.strftime("%A at ")
        out["updated_time"] = f"Updated: {day_prefix}{pacific.strftime('%-I:%M %p')} {pacific.strftime('%Z')}"
    return out

def fetch_usgs_telemetry(site_id=USGS_SITE):
    """Prefer the modernized WDFN OGC API; fall back to legacy nwis/iv.

    The fallback is TEMPORARY by design: waterservices.usgs.gov goes away in Q1 2027,
    so by then the modern branch must be the only one still exercised.
    """
    if not site_id or site_id == "12096500":
        site_id = USGS_SITE
    modern = fetch_usgs_telemetry_wdfn(site_id)
    if modern is not None:
        return modern
    return fetch_usgs_telemetry_legacy(site_id)


def fetch_usgs_telemetry_legacy(site_id=USGS_SITE):
    # LEGACY fallback: waterservices.usgs.gov/nwis/iv — decommissioned in Q1 2027.
    # Puyallup River defaults strictly to USGS 12101500 (Puyallup River at Puyallup)
    if not site_id or site_id == "12096500":
        site_id = USGS_SITE

    # Query ONLY the active station's own gauge. Discharge (00060) + gage height
    # (00065) are always requested; water temp (00010) and turbidity (63680) are
    # included on the same single call so the payload either carries the station's
    # own readings or nothing at all — never a proxy/cross-gauge substitute.
    url = f"https://waterservices.usgs.gov/nwis/iv/?format=json&sites={site_id}&parameterCd=00060,00065,00010,63680&siteStatus=all"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    default_name = "Puyallup River at Puyallup, WA" if site_id == USGS_SITE else f"USGS Station {site_id}"
    data_dict = {"site_name": default_name, "cfs": None, "gage": None,
                 "water_temp_f": None, "turbidity_fnu": None,
                 "is_active": False, "updated_time": "Updated: Telemetry Offline", "api_offline": True}
    try:
        with urllib.request.urlopen(req, timeout=8, context=SSL_CONTEXT) as response:
            try:
                raw = response.read().decode('utf-8')
            except Exception as e:
                raw = getattr(e, 'partial', b'').decode('utf-8', errors='ignore')
            data = json.loads(raw)
            time_series = data.get('value', {}).get('timeSeries', [])
            if not time_series:
                return data_dict
            
            site_raw = time_series[0]['sourceInfo']['siteName']
            if site_raw.isupper():
                parts = site_raw.title().rsplit(', ', 1)
                if len(parts) == 2 and len(parts[1]) == 2:
                    formatted_name = f"{parts[0]}, {parts[1].upper()}"
                else:
                    formatted_name = site_raw.title()
                data_dict["site_name"] = formatted_name.replace(" At ", " at ").replace(" Near ", " near ")
            else:
                data_dict["site_name"] = site_raw
            
            # Live response parsed — clear the offline fallback so the frontend
            # can tell "USGS unreachable" apart from "station seasonal".
            data_dict["api_offline"] = False

            has_fresh_discharge_or_gage = False
            latest_time = None
            latest_dt_str = ""
            latest_cfs_time = None
            latest_gage_time = None
            latest_temp_time = None
            latest_turb_time = None

            for ts in time_series:
                param_code = ts['variable']['variableCode'][0]['value']
                try:
                    records = ts['values'][0]['value']
                    if not records:
                        continue
                    
                    # Ensure the latest timeValue selected is the most recent record from the timeseries
                    records_sorted = sorted(records, key=lambda x: datetime.fromisoformat(x['dateTime']), reverse=True)
                    latest_record = records_sorted[0]
                    
                    val_str = latest_record['value']
                    dt_str = latest_record['dateTime']
                    
                    # Numerical Value Check (disregard missing/error values like -999999)
                    val = float(val_str)
                    if val < -900000:
                        continue
                    
                    # 24-Hour Freshness Check
                    reading_dt = datetime.fromisoformat(dt_str)
                    from datetime import timezone
                    now_aware = datetime.now(timezone.utc)
                    age_seconds = (now_aware - reading_dt).total_seconds()
                    
                    if age_seconds <= 24 * 3600:
                        if param_code in ["00060", "00065"]:
                            has_fresh_discharge_or_gage = True
                        if latest_time is None or reading_dt > latest_time:
                            latest_time = reading_dt
                            latest_dt_str = dt_str
                            
                        # Parameter 00060 = Discharge (CFS), Parameter 00065 = Gage Height (ft)
                        if param_code == "00060":
                            if latest_cfs_time is None or reading_dt >= latest_cfs_time:
                                latest_cfs_time = reading_dt
                                data_dict["cfs"] = val
                        elif param_code == "00065":
                            if latest_gage_time is None or reading_dt >= latest_gage_time:
                                latest_gage_time = reading_dt
                                data_dict["gage"] = val
                        elif param_code == "00010":
                            # Water temperature (deg C) from the ACTIVE station's OWN gauge.
                            # Convert to Fahrenheit exactly once; absent -> None (hidden by UI).
                            if latest_temp_time is None or reading_dt >= latest_temp_time:
                                latest_temp_time = reading_dt
                                data_dict["water_temp_f"] = round((val * 9.0 / 5.0) + 32.0, 1)
                        elif param_code == "63680":
                            # Turbidity (FNU) from the ACTIVE station's OWN gauge.
                            if latest_turb_time is None or reading_dt >= latest_turb_time:
                                latest_turb_time = reading_dt
                                data_dict["turbidity_fnu"] = round(val, 1)
                except:
                    continue

            if has_fresh_discharge_or_gage and latest_time:
                data_dict["is_active"] = True
                day_prefix = "Today at "
                if latest_time.date() != datetime.now().date():
                    day_prefix = latest_time.strftime("%A at ")
                tz_name = "PDT" if "-07:00" in latest_dt_str else "PST" if "-08:00" in latest_dt_str else "Local"
                time_str = latest_time.strftime("%-I:%M %p")
                data_dict["updated_time"] = f"Updated: {day_prefix}{time_str} {tz_name}"
    except:
        pass

    return data_dict

def _clarity_series_wdfn():
    """WDFN /daily version of the clarity series. None when the API is unusable."""
    end = datetime.now(ZoneInfo('America/Los_Angeles'))
    start = end - timedelta(days=14)
    url = (f"{WDFN_BASE}/daily/items"
           f"?monitoring_location_id=USGS-12098500,USGS-12098000"
           f"&parameter_code=00060,62614"
           f"&datetime={start:%Y-%m-%d}/{end:%Y-%m-%d}&limit=500")
    try:
        d = _wdfn_get(url, timeout=10)
    except Exception:
        return None
    feats = d.get("features")
    if feats is None:
        return None
    series = {}
    for f in feats:
        try:
            p = f.get("properties") or {}
            code = str(p.get("parameter_code") or "")
            if code not in ('00060', '62614'):
                continue
            val = float(p.get("value"))
            if val < -900000:
                continue
            day = datetime.fromisoformat(str(p.get("time"))).date()
            series.setdefault(code, []).append((day, val))
        except Exception:
            continue
    for pairs in series.values():
        pairs.sort(key=lambda pr: pr[0])
    return series


def _clarity_series_legacy():
    """LEGACY nwis/dv version — decommissioned in Q1 2027."""
    end = datetime.now()
    start = end - timedelta(days=14)
    url = ("https://waterservices.usgs.gov/nwis/dv/?format=json"
           f"&sites=12098500,12098000&parameterCd=00060,62614"
           f"&startDT={start:%Y-%m-%d}&endDT={end:%Y-%m-%d}")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=10, context=SSL_CONTEXT) as res:
            data = json.loads(res.read().decode('utf-8'))
    except Exception:
        return {}
    series = {}
    for ts in (data.get('value', {}).get('timeSeries', []) or []):
        code = ts['variable']['variableCode'][0]['value']
        records = (ts.get('values') or [{}])[0].get('value') or []
        try:
            pairs = sorted(
                ((datetime.fromisoformat(r['dateTime']).date(), float(r['value']))
                 for r in records
                 if r.get('value') not in (None, '') and float(r['value']) > -900000),
                key=lambda p: p[0]
            )
        except Exception:
            continue
        if pairs:
            series[code] = pairs
    return series


def _clarity_series():
    """Real per-day series {parameter_code: [(date, value), ...]}, WDFN first."""
    series = _clarity_series_wdfn()
    if series is None:
        series = _clarity_series_legacy()
    return series


def fetch_dam_clarity():
    """White River / Mud Mountain Dam clarity signal (Puyallup basin only).

    Reads TWO USGS sites via the daily collection (WDFN /daily; legacy nwis/dv as a
    fallback) — one value per day gives an honest multi-day TREND, which the instantaneous (iv) feed lacks
    (it only returns the last few hours, and White River near Buckley 00060 is
    currently dormant). Parameters:
      12098500 — White River near Buckley (00060 streamflow, cfs)
      12098000 — Mud Mountain Lake     (62614 reservoir elevation, ft)

    Derives an honest text outlook from the daily trend, never invents a
    turbidity/FNU value:
      elevation dropping + flow rising  -> "Dam releasing -> turbidity rising"
      elevation dropping (any flow)     -> "Dam releasing (reservoir dropping)"
      elevation rising                  -> "Reservoir filling (clearing)"
      stable / no trend data            -> "Clearing / stable"
      no data at all                    -> None (UI hides the badge)

    Returns a short string or None. Never throws; the caller gates this on
    Puyallup-basin sites only.
    """
    series = _clarity_series()
    if not series:
        return None

    # Compare the most recent reading against the prior available reading (could
    # be a few days earlier if WDFW/USGS publish laggily — still a real trend).
    elev_down = flow_up = False
    if '62614' in series and len(series['62614']) >= 2:
        prev_e, cur_e = series['62614'][-2][1], series['62614'][-1][1]
        elev_down = (cur_e < prev_e)
        elev_rising = (cur_e > prev_e)
    if '00060' in series and len(series['00060']) >= 2:
        prev_f, cur_f = series['00060'][-2][1], series['00060'][-1][1]
        flow_up = (cur_f > prev_f)

    if elev_down and flow_up:
        return "Dam releasing \u2192 turbidity rising downstream"
    if elev_down:
        return "Dam releasing (reservoir dropping)"
    if '62614' in series and len(series['62614']) >= 2 and elev_rising:
        return "Reservoir filling (clearing upstream)"
    return "Clearing / stable"



# Using sites= (instead of the flaky bBox= query — USGS NWIS bBox often 503s/timeouts
# while the multi-site list endpoint is fast and reliable) means "nearest" always
# resolves to a real *river* gauge, not random tributaries/ditches from a bbox.
# Was a curated literal list; now the registry's discovery_pool (TEMPORARY —
# UPDATE 3.0 Phase 2 replaces this with USGS WDFN site-index discovery).
nearbyStationIds = [s["site_id"] for s in _WA.get("discovery_pool", [])] or [USGS_SITE]


def fetch_nearby_stations(lat, lon):
    """Server-side USGS lookup for the 'Use My GPS' flow.

    Prefers the modernized WDFN OGC API: ONE multi-location query returns each
    gauge's value AND its coordinates, so no hardcoded coordinate map is needed.
    Falls back to the legacy nwis/iv multi-site endpoint while it still exists.

    Returns a list of { id, name, lat, lon, distance_mi, cfs, gage } with only
    stations that have a fresh (<=24h) reading, sorted by distance.
    """
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return []
    stations = _nearby_from_wdfn(lat_f, lon_f)
    if stations is None:
        stations = _nearby_from_legacy(lat_f, lon_f)
    if stations is None:
        # BOTH sources unreachable: return None, never an empty list. An empty list
        # would be read as the FACT "no gauges here" when we simply could not ask.
        return None
    return sorted(stations.values(), key=lambda s: s['distance_mi'])


def _haversine_mi(lat1, lon1, lat2, lon2):
    import math
    R = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = p2 - p1
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _station_add(stations, code, name, s_lat, s_lon, lat_f, lon_f, param, val):
    if code not in stations:
        stations[code] = {'id': code, 'name': name, 'lat': s_lat, 'lon': s_lon,
                          'distance_mi': round(_haversine_mi(lat_f, lon_f, s_lat, s_lon), 1),
                          # Registry-driven fishing-hours rule, so the map's regulation
                          # panel can state it without loading the full report. Unknown
                          # for gauges the registry does not cover yet (never invented).
                          'legal_hours': legal_hours_for_site(code)}
    if param == '00060':
        stations[code]['cfs'] = int(round(val))
    elif param == '00065':
        stations[code]['gage'] = round(val, 2)


# Display names for the curated discovery gauges (from the region registry, so the
# list reads in title case like the rest of the app instead of NWIS ALL CAPS).
_POOL_NAMES = {s["site_id"]: s["name"] for s in _WA.get("discovery_pool", []) if s.get("name")}


# --- Dynamic radial discovery (UPDATE 3.0 Phase 2.2) --------------------------
# Instead of the curated gauge list we ask WDFN for the stream monitoring locations
# around the point (bbox), keep the closest handful by real distance, then ask which
# of THOSE report live discharge/gage. This is the two-step pattern USGS recommends,
# and it scales to any waterbody rather than the 15 gauges hand-picked for WA.
NEARBY_BBOX_DEG = 0.6           # ~ +/- 40 miles at these latitudes
NEARBY_LOCATION_LIMIT = 1000    # enough to receive every stream site inside the box
NEARBY_CANDIDATES = 120         # closest N candidates we then check for live data


def _discover_wdfn_locations(lat_f, lon_f):
    """Stream monitoring locations around a point, nearest first.

    Returns None when discovery is unusable so the caller can fall back to the
    registry's curated discovery_pool."""
    bbox = "{},{},{},{}".format(round(lon_f - NEARBY_BBOX_DEG, 4), round(lat_f - NEARBY_BBOX_DEG, 4),
                                round(lon_f + NEARBY_BBOX_DEG, 4), round(lat_f + NEARBY_BBOX_DEG, 4))
    try:
        d = _wdfn_get(WDFN_BASE + "/monitoring-locations/items"
                      "?bbox=" + bbox + "&site_type_code=ST&limit=" + str(NEARBY_LOCATION_LIMIT), timeout=12)
    except Exception:
        return None
    feats = d.get("features")
    if feats is None:
        return None
    out = []
    for f in feats:
        try:
            p = f.get("properties") or {}
            coords = (f.get("geometry") or {}).get("coordinates") or []
            if len(coords) < 2:
                continue
            code = str(p.get("id") or "").replace("USGS-", "", 1)
            if not code:
                continue
            s_lat, s_lon = float(coords[1]), float(coords[0])
            out.append({"id": code,
                        "name": format_site_name(p.get("monitoring_location_name")) or code,
                        "lat": s_lat, "lon": s_lon,
                        "distance_mi": round(_haversine_mi(lat_f, lon_f, s_lat, s_lon), 1)})
        except Exception:
            continue
    out.sort(key=lambda s: s["distance_mi"])
    return out



def _nearby_from_wdfn(lat_f, lon_f):
    """Nearest LIVE gauges: dynamic radial discovery, then one multi-location query.

    Discovery is the Phase 2.2 two-step pattern. If discovery itself is unusable it
    degrades to the registry's curated discovery_pool, so a WDFN hiccup cannot break
    the 'Use My GPS' flow. Returns None when nothing could be read at all.
    """
    candidates = _discover_wdfn_locations(lat_f, lon_f)
    if candidates is None:
        candidates = [{"id": s, "name": _POOL_NAMES.get(s, s)} for s in nearbyStationIds]
        if not candidates:
            return None
    candidates = candidates[:NEARBY_CANDIDATES]
    by_id = {c["id"]: c for c in candidates}

    ids = ",".join("USGS-" + c["id"] for c in candidates)
    try:
        d = _wdfn_get(WDFN_BASE + "/latest-continuous/items"
                      "?monitoring_location_id=" + ids +
                      "&parameter_code=00060,00065&limit=400", timeout=12)
    except Exception:
        return None
    feats = d.get("features")
    if feats is None:
        return None

    now_aware = datetime.now(timezone.utc)
    stations = {}
    for f in feats:
        try:
            p = f.get("properties") or {}
            code = str(p.get("monitoring_location_id") or "").replace("USGS-", "", 1)
            cand = by_id.get(code)
            if not cand:
                continue
            param = str(p.get("parameter_code") or "")
            if param not in ('00060', '00065'):
                continue
            val = float(p.get("value"))
            if val < -900000:
                continue
            reading_dt = datetime.fromisoformat(str(p.get("time")))
            if reading_dt.tzinfo is None:
                reading_dt = reading_dt.replace(tzinfo=timezone.utc)
            if (now_aware - reading_dt).total_seconds() > 24 * 3600:
                continue
            # Prefer the discovery coordinates (basin-correct); else the feature's own.
            s_lat, s_lon = cand.get("lat"), cand.get("lon")
            if s_lat is None or s_lon is None:
                coords = (f.get("geometry") or {}).get("coordinates") or []
                if len(coords) < 2:
                    continue
                s_lon, s_lat = float(coords[0]), float(coords[1])
            _station_add(stations, code, cand.get("name") or code, s_lat, s_lon, lat_f, lon_f, param, val)
        except Exception:
            continue
    return stations


def _nearby_from_legacy(lat_f, lon_f):
    """LEGACY nwis/iv multi-site lookup — decommissioned in Q1 2027."""
    url = ("https://waterservices.usgs.gov/nwis/iv/"
           f"?format=json&sites={','.join(nearbyStationIds)}&parameterCd=00060,00065&siteStatus=all")
    now_aware = datetime.now(timezone.utc)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10, context=SSL_CONTEXT) as res:
            data = json.loads(res.read().decode('utf-8'))
    except Exception:
        return None          # unreachable (unlike {} which means "asked, nothing fresh")
    KNOWN_COORDS = {
        "12101500": (47.195, -122.302), "12093500": (47.1005, -122.2133),
        "12094000": (47.0177, -122.0197), "12113000": (47.3115, -122.2265),
        "12089500": (46.9365, -122.5483), "12200500": (48.4086, -122.3049),
        "12150800": (47.5396, -121.8252), "12134500": (47.8031, -121.6600),
        "12155300": (47.8595, -122.0810), "12167000": (48.1804, -122.1268),
        "14242500": (46.2800, -122.9150), "14240500": (46.3370, -122.7500),
        "14236000": (45.8570, -122.6380), "14241000": (46.0780, -122.7580),
        "12115000": (47.4730, -122.2080),
    }
    stations = {}
    for ts in (data.get('value', {}).get('timeSeries', []) or []):
        try:
            info = ts['sourceInfo']
            code = info['siteCode'][0]['value']
            name = info.get('siteName', code)
            param = ts['variable']['variableCode'][0]['value']
            if param not in ('00060', '00065'):
                continue
            readings = ts['values'][0]['value'] if ts.get('values') else []
            latest = readings[-1] if readings else None
            if not latest:
                continue
            val = float(latest['value'])
            if val < -900000:
                continue
            try:
                reading_dt = datetime.fromisoformat(latest['dateTime'])
                if (now_aware - reading_dt).total_seconds() > 24 * 3600:
                    continue
            except Exception:
                pass
            try:
                geog = info['geoLocation']['geogLocation']
                s_lat, s_lon = float(geog['latitude']), float(geog['longitude'])
            except Exception:
                s_lat, s_lon = KNOWN_COORDS.get(code, (lat_f, lon_f))
            _station_add(stations, code, name, s_lat, s_lon, lat_f, lon_f, param, val)
        except Exception:
            continue
    return stations

# ==================================================================================
# NOAA CO-OPS tide-station pairing (UPDATE 3.0 Phase 2.3)
# Previously every river used ONE hardcoded station. Now each waterbody is paired with
# the CLOSEST tide-prediction station to its own coordinates — resolved from the region
# registry, or from the gauge's coordinates via WDFN when the registry has none. A
# waterbody with no station within TIDE_PAIRING_MAX_MI genuinely has no tide influence,
# so it reports NO tide data instead of borrowing a far-away coast gauge.
# ==================================================================================
COOPS_STATIONS_URL = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions"
TIDE_PAIRING_MAX_MI = 40.0
_coops_stations = None
_gauge_coords_cache = {}
_tide_pair_cache = {}


def _coops_tide_stations():
    """All NOAA CO-OPS tide-prediction stations (cached for the warm instance).

    The API ignores state filters and returns ~2 MB, but it is fetched once per instance
    and only on a request that actually needs tides."""
    global _coops_stations
    if _coops_stations is None:
        _coops_stations = []
        try:
            req = urllib.request.Request(COOPS_STATIONS_URL, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=12, context=SSL_CONTEXT) as res:
                data = json.loads(res.read().decode('utf-8'))
            for st in (data.get('stations') or []):
                try:
                    _coops_stations.append({'id': str(st['id']), 'name': st.get('name') or str(st['id']),
                                            'lat': float(st['lat']), 'lon': float(st['lng'])})
                except Exception:
                    continue
        except Exception:
            _coops_stations = []
    return _coops_stations


def _gauge_coords(site_id):
    """Resolve (lat, lon) for a USGS gauge -> ((lat, lon)|None, resolved: bool).

    `resolved=False` means a lookup FAILED (throttled/unreachable) as opposed to
    genuinely finding no coordinates. The distinction is load-bearing: reporting a
    throttle as "this river has no tide influence" would silently strip tides from
    every river, which is exactly the bug this signature prevents.
    """
    sid = str(site_id)
    cached = _gauge_coords_cache.get(sid)
    if cached is not None:
        return cached
    wb = _WB_BY_SITE.get(sid) or {}
    if wb.get("coords"):
        out = ((wb["coords"]["lat"], wb["coords"]["lon"]), True)
        _gauge_coords_cache[sid] = out
        return out
    try:
        d = _wdfn_get(WDFN_BASE + "/monitoring-locations/items?id=USGS-" + sid + "&limit=1", timeout=8)
    except Exception:
        return (None, False)          # transient -> do NOT cache, so a retry can succeed
    coords = None
    feats = d.get("features") or []
    if feats:
        c = (feats[0].get("geometry") or {}).get("coordinates") or []
        if len(c) >= 2:
            coords = (float(c[1]), float(c[0]))
    out = (coords, True)
    _gauge_coords_cache[sid] = out
    return out


TIDE_CANDIDATES = 4          # how many nearest stations to try before giving up


def tide_station_candidates_for_site(site_id):
    """CO-OPS stations to try for this waterbody, NEAREST FIRST (possibly empty).

    Returning several matters: the tide-prediction list includes stations that do not
    actually serve MLLW predictions (verified: 9446248 Des Moines -> "No Predictions
    data was found"), so the caller walks the list rather than trusting the nearest one.

    An empty list means "no tides here" — the coordinates WERE resolved and nothing is
    within TIDE_PAIRING_MAX_MI. A FAILED coordinate lookup instead yields the registry
    default, so a throttle can never strip tides from a river.
    """
    sid = str(site_id)
    cached = _tide_pair_cache.get(sid)
    if cached is not None:
        return cached
    wb = _WB_BY_SITE.get(sid) or {}
    override = wb.get("tide_station")
    if override:
        result = [{'id': str(override), 'name': None, 'distance_mi': None}]
        _tide_pair_cache[sid] = result
        return result

    coords, resolved = _gauge_coords(sid)
    if not resolved:
        return [{'id': NOAA_STATION, 'name': None, 'distance_mi': None, 'fallback': True}]
    if not coords:
        _tide_pair_cache[sid] = []
        return []

    ranked = []
    for st in _coops_tide_stations():
        d = _haversine_mi(coords[0], coords[1], st['lat'], st['lon'])
        if d <= TIDE_PAIRING_MAX_MI:
            ranked.append({'id': st['id'], 'name': st['name'], 'lat': st['lat'], 'lon': st['lon'],
                           'distance_mi': round(d, 1)})
    ranked.sort(key=lambda s: s['distance_mi'])
    result = ranked[:TIDE_CANDIDATES]
    _tide_pair_cache[sid] = result
    return result


def fetch_noaa_tides_bulletproof(start_date, days, station=None):
    fetch_start = start_date - timedelta(days=2)
    date_str = fetch_start.strftime('%Y%m%d')
    total_hours = (days + 2) * 24
    url = f"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date={date_str}&range={total_hours}&station={station or NOAA_STATION}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&format=json"
    curve, extremes = [], []
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5, context=SSL_CONTEXT) as res:
            for item in json.loads(res.read().decode('utf-8')).get('predictions', []):
                curve.append({"dt": datetime.strptime(item['t'], "%Y-%m-%d %H:%M"), "height": float(item['v'])})
    except: pass

    if len(curve) > 60:
        for i in range(30, len(curve) - 30):
            pt = curve[i]
            window = [c['height'] for c in curve[i-25:i+26]]
            if pt['height'] == max(window):
                if not extremes or (pt['dt'] - extremes[-1]['dt']).total_seconds() > 3600*3:
                    extremes.append({'type': 'H', 'dt': pt['dt'], 'height': pt['height']})
            elif pt['height'] == min(window):
                if not extremes or (pt['dt'] - extremes[-1]['dt']).total_seconds() > 3600*3:
                    extremes.append({'type': 'L', 'dt': pt['dt'], 'height': pt['height']})
    return curve, extremes

def fetch_meteorological_data(lat=LAT, lon=LON):
    meteo_url = (f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
                 f"&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation"
                 f"&daily=sunrise,sunset,moonrise,moonset,cloudcover_mean,precipitation_sum"
                 f"&hourly=surface_pressure,precipitation_probability,temperature_2m,precipitation&timezone=America%2FLos_Angeles")
    req = urllib.request.Request(meteo_url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=5, context=SSL_CONTEXT) as res:
            return json.loads(res.read().decode('utf-8'))
    except: return None

def calculate_stock_base_score(target_date, site_id=None):
    """Baseline (0-25ish) that the dynamic timeline adds to per-minute scores.

    The old version fabricated a fake "~N entering today" Gaussian count
    (`avg_run * curve_mult * 0.04`) and shipped it as `active_fish`. That number
    was invented — REMOVED permanently (AGENTS.md: never fabricate). The honest
    run anchor is the WDFW forecast (Commit 2.1d) + real trap counts. We keep
    only the structure: how far today sits inside each stock's real peak window.
    """
    base_score = 10.0
    # Baselines come from the waterbody that owns this site (empty off-basin,
    # so another river's run numbers can never leak in).
    for species, meta in stocks_for_site(site_id or USGS_SITE).items():
        if not meta.get("present", True): continue
        sm, sd, em, ed = meta["peak_window"]
        s_dt, e_dt = datetime(target_date.year, sm, sd), datetime(target_date.year, em, ed)
        if s_dt <= target_date <= e_dt:
            pm, pd = map(int, meta["peak_date"].split("-"))
            peak_dt = datetime(target_date.year, pm, pd)
            days_from_peak = abs((target_date - peak_dt).days)
            curve_mult = math.exp(-0.5 * (days_from_peak / 14.0) ** 2)
            score = 8.0 + (17.0 * curve_mult)
            if score > base_score: base_score = score
    return base_score


def build_species_calendar(target_date, site_id=None):
    """Per-species run calendar for the current day.

    For each modeled stock returns:
      - window_start / window_end (peak window)
      - peak_date
      - days_until_peak (negative if past, 0 at peak)
      - position: 'pre' / 'peak' / 'post' / 'off'
      - status_text for the UI
    """
    out = []
    # Pink salmon run on ODD years only in Puget Sound. On even years (2026,
    # 2028, ...) there is no pink run, so do NOT show a pink card at all —
    # honest data, no stale "NO PEAK PERIOD" entry.
    odd_year = (target_date.year % 2) == 1
    for species, meta in stocks_for_site(site_id or USGS_SITE).items():
        if species == "Pink" and not odd_year:
            continue
        sm, sd, em, ed = meta["peak_window"]
        pm, pd = map(int, meta["peak_date"].split("-"))
        start = datetime(target_date.year, sm, sd)
        end = datetime(target_date.year, em, ed)
        peak = datetime(target_date.year, pm, pd)
        in_window = start <= target_date <= end
        days_until_peak = (peak - target_date).days
        if in_window:
            if days_until_peak == 0:
                position, status_text = "peak", "AT PEAK"
            elif days_until_peak < 0:
                position = "post"
                status_text = "PAST PEAK" if days_until_peak < -14 else "TAPERING"
            else:
                position = "pre"
                status_text = "BUILDING" if days_until_peak > 14 else "APPROACHING"
        else:
            position = "off"
            status_text = "NO PEAK PERIOD"
            if target_date < start:
                status_text = "SEASON AHEAD"
            elif target_date > end:
                status_text = "SEASON OVER"
        out.append({
            "species": species,
            "window_start": start.strftime("%b %-d"),
            "window_end": end.strftime("%b %-d"),
            "peak_date": peak.strftime("%b %-d"),
            "days_until_peak": days_until_peak,
            "position": position,
            "status_text": status_text,
            # Run-progress bar data (0..1): how far "today" is across the window,
            # and where the peak sits — the client draws these without parsing text.
            "progress": round(max(0.0, min(1.0, (target_date - start).days / float(max(1, (end - start).days)))), 3),
            "peak_frac": round(max(0.0, min(1.0, (peak - start).days / float(max(1, (end - start).days)))), 3)
        })
    return out

def calculate_transit_time_and_flow(cfs, is_netting_day):
    dist_miles = 6.0 
    if cfs is None:
        flow_idx = 50
        base_speed = 0.50
    elif cfs < 800: flow_idx = max(1, int((cfs / 800) * 15)); base_speed = 0.10
    elif cfs <= 1700: progress = (cfs - 800) / 900; flow_idx = int(15 + (progress * 80)); base_speed = 0.10 + (progress * 0.90) 
    elif cfs <= 2400: progress = (cfs - 1700) / 700; flow_idx = int(95 + (progress * 5)); base_speed = 1.00 + (progress * 0.20) 
    elif cfs <= 3200: progress = (cfs - 2400) / 800; flow_idx = int(100 - (progress * 40)); base_speed = 1.20 - (progress * 0.55) 
    else: flow_idx = max(1, int(60 - ((cfs - 3200) / 1000) * 50)); base_speed = max(0.10, 0.65 - ((cfs - 3200)/1000) * 0.45)
        
    actual_speed = base_speed
    if is_netting_day:
        actual_speed = 0.01 
        state = "RIVER CORKED (Nets In)"
        flow_idx = int(flow_idx * 0.1) 
    elif flow_idx >= 80: state = "High Velocity Push"
    elif flow_idx >= 50: state = "Steady Migration"
    elif cfs is not None and cfs < 1300: state = "Bay Staging / Slow Push"
    else: state = "Bank Hugging / Resistance"
    
    hrs = dist_miles / max(actual_speed, 0.01) 
    time_str = "BLOCKED" if is_netting_day else "48+ hrs" if hrs > 48 else f"{int(hrs)} to {int(hrs)+2} hrs"
    return time_str, state, flow_idx, hrs

def simulate_fish_transit(spawn_time, tide_curve, cfs):
    if not tide_curve or not spawn_time: return None
    dist, curr_dt, step_hrs = 0.0, spawn_time, 0.25
    base = 0.5 if (cfs is not None and 1100 <= cfs <= 2800) else 0.2
    while dist < 6.0:
        closest = min(tide_curve, key=lambda x: abs((x['dt'] - curr_dt).total_seconds()))
        future = min(tide_curve, key=lambda x: abs((x['dt'] - (curr_dt + timedelta(hours=1))).total_seconds()))
        if future['height'] > closest['height']: speed = base * 1.8  
        elif future['height'] < closest['height']: speed = base * 0.3  
        else: speed = base
        if closest['height'] < 4.0: speed = base * 0.1 
        dist += speed * step_hrs
        curr_dt += timedelta(hours=step_hrs)
        if (curr_dt - spawn_time).total_seconds() > 96 * 3600: return None
    return curr_dt
    return curr_dt

def calculate_macro_environment(flow_idx, press_curr_inHg, press_prev_inHg, rain_in, lunar_phase, is_netting):
    env_score, conditions = 0.0, []
    net_mult = 0.15 if is_netting else 1.00
    flow_mult = (flow_idx / 100.0) * net_mult
    delta_inHg = press_curr_inHg - press_prev_inHg
    if delta_inHg <= -0.04:
        env_score += min(12, abs(delta_inHg * 100) * 1.2); conditions.append(f"Pressure Drop ({delta_inHg:+.2f} inHg)")
    elif delta_inHg >= 0.04:
        env_score -= min(15, (delta_inHg * 100) * 1.5); conditions.append(f"Pressure Rise (Lockjaw)")
    if rain_in > 0.05:
        env_score += min(8, math.log1p(rain_in * 25.4) * 2.5); conditions.append(f"Rain Freshet")
    if 0.45 <= lunar_phase <= 0.55:
        env_score -= 8; conditions.append("Full Moon Penalty")
    elif lunar_phase < 0.1 or lunar_phase > 0.9:
        env_score += 6; conditions.append("Spring Tide Pulses")
    return env_score, flow_mult, " + ".join(conditions) if conditions else "Stable"

def build_dynamic_timeline(lines_in, lines_out, sunrise_dt, sunset_dt, cloud_pct, arrivals, base_score, env_score, flow_mult, day_mult):
    current_time = lines_in
    timeline = []
    # Cloud pays once: env_score already carries the all-day Overcast bonus, so the
    # twilight UV/shade bonus is halved to avoid a +16 double count on cloudy dawns.
    uv_bonus = (cloud_pct / 100.0) * 4.0 
    # Symmetric twilight windows (both scale gently with cloud; dawn keeps a small
    # edge for the morning-bite bias in this basin).
    twilight_min = int(45 + cloud_pct * 0.2)
    dawn_end = sunrise_dt + timedelta(minutes=twilight_min)
    dusk_start = sunset_dt - timedelta(minutes=twilight_min)
    # Twilight feels pressure at sqrt strength: light still dominates, but a
    # brutal high-pressure day knocks ~10 pts off dawn/dusk instead of 0.
    day_mult_root = math.sqrt(day_mult) if day_mult and day_mult > 0 else 1.0
    
    while current_time <= lines_out:
        minute_score = 25.0 + base_score + env_score
        triggers = []
        in_twilight = False
        if lines_in <= current_time <= dawn_end:
            minute_score += 19.5 + uv_bonus; triggers.append(f"Dawn Light / UV Shield")
            in_twilight = True
        elif dusk_start <= current_time <= lines_out:
            minute_score += 18.5 + uv_bonus; triggers.append("Dusk / Bank Shadow")
            in_twilight = True
        else:
            triggers.append("Mid-Day Stable")
            
        for arr in arrivals:
            if arr["dt"] - timedelta(minutes=75) <= current_time <= arr["dt"] + timedelta(minutes=75):
                swing_pts = min(20.0, max(0.0, (arr["swing"] - 5.0) * 2.5)) + uv_bonus
                minute_score += swing_pts; triggers.append(f"Tide Arrival ({arr['swing']:.1f}ft Push)")
                
        final_score = minute_score * flow_mult
        if in_twilight:
            final_score *= day_mult_root
        else:
            final_score *= day_mult
            if day_mult < 1.0 and triggers and "Mid-Day" in triggers[0]: triggers[0] = "High Pressure Traffic"
                
        timeline.append({"time": current_time, "score": int(max(5, min(100, final_score))), "trigger": " + ".join(triggers)})
        current_time += timedelta(minutes=1)
        
    windows = []
    if not timeline: return windows
    start_time, curr_score, curr_trig = timeline[0]["time"], timeline[0]["score"], timeline[0]["trigger"]
    
    for i in range(1, len(timeline)):
        if timeline[i]["trigger"] != curr_trig or abs(timeline[i]["score"] - curr_score) > 3:
            windows.append({"start": start_time.isoformat(), "end": timeline[i-1]["time"].isoformat(), "score": curr_score, "triggers": curr_trig, "start_str": start_time.strftime('%-I:%M %p'), "end_str": timeline[i-1]["time"].strftime('%-I:%M %p')})
            start_time, curr_score, curr_trig = timeline[i]["time"], timeline[i]["score"], timeline[i]["trigger"]
            
    windows.append({"start": start_time.isoformat(), "end": timeline[-1]["time"].isoformat(), "score": curr_score, "triggers": curr_trig, "start_str": start_time.strftime('%-I:%M %p'), "end_str": timeline[-1]["time"].strftime('%-I:%M %p')})
    return windows

# ==================================================================================
# PROXY HARDENING (UPDATE 3.0 Phase 2.3)
# The handler takes arbitrary lat/lon and fans out to USGS / NOAA / Open-Meteo, so it
# must not be usable as a free open proxy:
#   * coordinates are validated against plausible bounds for the covered region,
#   * each client gets a small token bucket (best effort — serverless instances are
#     ephemeral, so this blunts bursts rather than enforcing a global quota),
#   * the expensive water report is memoised briefly so repeat views are free.
# ==================================================================================
import time as _time

US_LAT_BOUNDS = (24.0, 50.0)      # covers WA today; widen as more states are added
US_LON_BOUNDS = (-125.5, -66.0)
RATE_LIMIT_MAX = 40               # requests per client per window
RATE_LIMIT_WINDOW = 60.0          # seconds
REPORT_CACHE_TTL = 60.0           # seconds
_recent_hits = {}
_report_cache = {}


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
    for header in ('x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'):
        val = req_handler.headers.get(header)
        if val:
            return val.split(',')[0].strip()
    try:
        return req_handler.client_address[0]
    except Exception:
        return 'unknown'


def is_rate_limited(key):
    """Sliding-window counter. Best effort by design (no shared store)."""
    now = _time.time()
    hits = [t for t in _recent_hits.get(key, []) if now - t < RATE_LIMIT_WINDOW]
    hits.append(now)
    if len(_recent_hits) > 5000:                  # bounded memory
        _recent_hits.clear()
    _recent_hits[key] = hits
    return len(hits) > RATE_LIMIT_MAX


def cache_get(key):
    entry = _report_cache.get(key)
    if entry and (_time.time() - entry[0]) < REPORT_CACHE_TTL:
        return entry[1]
    return None


def cache_put(key, body):
    if len(_report_cache) > 200:
        _report_cache.clear()
    _report_cache[key] = (_time.time(), body)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Hardening (Phase 2.3): reject bursts BEFORE any fan-out to third parties.
        if is_rate_limited(client_key(self)):
            body = json.dumps({'error': 'Too many requests'}).encode('utf-8')
            self.send_response(429)
            self.send_header('Content-type', 'application/json')
            self.send_header('Retry-After', str(int(RATE_LIMIT_WINDOW)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
            return

        # Pacific wall-clock time, NOT the server's local zone (Vercel runs UTC):
        # this `now` drives the 4 forecast days, the TODAY/TOMORROW tag, the
        # dt.weekday() netting check, sunrise/sunset and the tide-day filter, so a
        # UTC `now` made the cards (rendered in Pacific) drift a day apart late in
        # the day. Everything downstream stays naive.
        now = datetime.now(ZoneInfo('America/Los_Angeles')).replace(tzinfo=None)
        qs = parse_qs(urlparse(self.path).query)

        # /api/nearby_stations?lat=&lon= — reliable server-side USGS lookup for
        # the 'Use My GPS' flow (the browser->USGS direct call is flaky on mobile).
        if urlparse(self.path).path == '/api/nearby_stations':
            lat = qs.get('lat', [None])[0]
            lon = qs.get('lon', [None])[0]
            if (lat and lon) and not coords_ok(lat, lon):
                # Outside the covered region: refuse rather than fan out on its behalf.
                body = json.dumps({'stations': [], 'error': 'Coordinates outside the covered region'}).encode('utf-8')
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(body)
                return
            stations = fetch_nearby_stations(lat, lon) if (lat and lon) else []
            payload = {'stations': stations or []}
            if stations is None:
                # Surface the degradation instead of letting an empty list read as the
                # fact "no gauges exist here" when both upstreams were unreachable.
                payload['note'] = 'USGS gauges could not be reached (throttled or offline)'
            body = json.dumps(payload).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
            return

        site = qs.get('site', [USGS_SITE])[0]
        if not site or site == "12096500":
            site = USGS_SITE
        try:
            req_lat = float(qs.get('lat', [str(LAT)])[0])
            req_lon = float(qs.get('lon', [str(LON)])[0])
        except:
            req_lat, req_lon = LAT, LON
        # Out-of-region coordinates fall back to the default, so a bad/abused link still
        # serves the default river instead of fanning out for an arbitrary point.
        if not coords_ok(req_lat, req_lon):
            req_lat, req_lon = LAT, LON

        # Short-lived memoisation (Phase 2.3): the third-party fan-out is the expensive
        # part of this endpoint, and the report only changes every few minutes.
        cache_key = '{}|{:.3f}|{:.3f}'.format(site, req_lat, req_lon)
        cached = cache_get(cache_key)
        if cached is not None:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('X-Cache', 'HIT')
            self.end_headers()
            self.wfile.write(cached)
            return

        forecast_dates = [now + timedelta(days=d) for d in range(FORECAST_DAYS)]
        usgs_data = fetch_usgs_telemetry(site) 
        # Clarity signal: only the Puyallup / White / Carbon basin gauges read the
        # Mud Mountain dam + White River trend (off-basin rivers get None -> UI hides).
        clarity_outlook = fetch_dam_clarity() if site in NETTING_SITES else None
        met_data = fetch_meteorological_data(req_lat, req_lon)
        # Tides: pair THIS waterbody with its nearest CO-OPS gauge (Phase 2.3). Walk the
        # nearest few because some listed stations do not actually serve MLLW
        # predictions; no candidate at all -> the river has no tide influence here.
        tide_pair = None
        all_tides_curve, all_tides_extremes = [], []
        for _cand in tide_station_candidates_for_site(site):
            _curve, _extremes = fetch_noaa_tides_bulletproof(now, FORECAST_DAYS, _cand['id'])
            if _curve and _extremes:
                tide_pair, all_tides_curve, all_tides_extremes = _cand, _curve, _extremes
                break

        arrivals = []
        if all_tides_curve and all_tides_extremes:
            for ext in all_tides_extremes:
                if ext["type"] == "H" and ext["height"] >= 8.0:
                    prev_low = ext["height"]
                    for t in reversed(all_tides_extremes):
                        if t["dt"] < ext["dt"] and t["type"] == "L":
                            prev_low = t["height"]; break
                    swing = ext["height"] - prev_low
                    arr_dt = simulate_fish_transit(ext["dt"], all_tides_curve, usgs_data["cfs"])
                    if arr_dt: arrivals.append({"dt": arr_dt, "swing": swing})

        reports = []
        prev_upper = None
        for i, dt in enumerate(forecast_dates):
            day_extremes = [t for t in all_tides_extremes if t["dt"].date() == dt.date()]
            known_new = datetime(2000, 1, 6)
            days_since = (dt - known_new).days + (dt - known_new).seconds / 86400.0
            lunar_val = (days_since % 29.530588853) / 29.530588853
            
            if lunar_val < 0.05 or lunar_val > 0.95: lunar_icon = "🌑 New Moon"
            elif lunar_val < 0.20: lunar_icon = "🌒 Waxing Crescent"
            elif lunar_val < 0.30: lunar_icon = "🌓 First Quarter"
            elif lunar_val < 0.45: lunar_icon = "🌔 Waxing Gibbous"
            elif lunar_val < 0.55: lunar_icon = "🌕 Full Moon"
            elif lunar_val < 0.70: lunar_icon = "🌖 Waning Gibbous"
            elif lunar_val < 0.80: lunar_icon = "🌗 Last Quarter"
            else: lunar_icon = "🌘 Waning Crescent"
            
            sunrise_dt, sunset_dt = dt.replace(hour=6, minute=35), dt.replace(hour=19, minute=30)
            moonrise_str, moonset_str = None, None
            cloud_pct, rain_mm, press_curr_hpa, press_prev_hpa = 50, 0.0, 1013.25, 1013.25
            # "Now" air/wind/precip from Open-Meteo `current` + hourly PoP. These are
            # fetched once for all 4 days, so they represent NOW, not each day's
            # own forecast. Absent -> null (frontend renders "--", never guesses).
            air_temp_f, wind_speed_mph, wind_dir_deg, pop_pct = None, None, None, None
            temp_prev_f, temp_delta_f = None, None
            precip_phase_key, precip_start_text, precip_end_text = 'none', '', ''
            
            if met_data and 'daily' in met_data and 'hourly' in met_data:
                try:
                    sunrise_dt = datetime.fromisoformat(met_data['daily']['sunrise'][i])
                    sunset_dt = datetime.fromisoformat(met_data['daily']['sunset'][i])
                    moonrise_str = met_data['daily']['moonrise'][i] if 'moonrise' in met_data['daily'] else None
                    moonset_str = met_data['daily']['moonset'][i] if 'moonset' in met_data['daily'] else None
                    cloud_pct = met_data['daily']['cloudcover_mean'][i]
                    rain_mm = met_data['daily']['precipitation_sum'][i]
                    time_arr = met_data['hourly']['time']
                    
                    # OVERHAUL: Dynamic 6-Hour Rolling Pressure Window
                    target_now = dt.strftime('%Y-%m-%dT%H:00')
                    target_minus6 = (dt - timedelta(hours=6)).strftime('%Y-%m-%dT%H:00')
                    
                    if target_now in time_arr: press_curr_hpa = met_data['hourly']['surface_pressure'][time_arr.index(target_now)]
                    if target_minus6 in time_arr: press_prev_hpa = met_data['hourly']['surface_pressure'][time_arr.index(target_minus6)]

                    # Current-conditions object (wind_speed_10m is km/h, temperature
                    # is Celsius, precipitation is mm by default -> convert).
                    cur = met_data.get('current') or {}
                    if cur.get('temperature_2m') is not None:
                        air_temp_f = round(cur['temperature_2m'] * 9.0 / 5.0 + 32.0, 1)
                        # Temperature trend vs the SAME station ~3 hours earlier
                        # (honest: hourly forecast on the same lat/lon, not a guess).
                        try:
                            ref_iso = cur.get('time') or time_arr[0]
                            ref_dt = datetime.fromisoformat(ref_iso)
                            mins_ago = []
                            for hi, h in enumerate(time_arr):
                                cand = datetime.fromisoformat(h)
                                if cand <= ref_dt:
                                    mins_ago.append((abs((ref_dt - cand).total_seconds()), hi))
                            if mins_ago:
                                mins_ago.sort()
                                prev_h = mins_ago[0][1]
                                # Prefer ~3h back if available.
                                for m, hi in mins_ago:
                                    if 150 <= m / 60.0 <= 210:
                                        prev_h = hi; break
                                prev_c = met_data['hourly']['temperature_2m'][prev_h]
                                if prev_c is not None:
                                    temp_prev_f = round(prev_c * 9.0 / 5.0 + 32.0, 1)
                                    temp_delta_f = round(air_temp_f - temp_prev_f, 1)
                        except Exception:
                            temp_delta_f = None
                    if cur.get('wind_speed_10m') is not None:
                        wind_speed_mph = round(cur['wind_speed_10m'] * 0.621371, 1)
                    if cur.get('wind_direction_10m') is not None:
                        wind_dir_deg = cur['wind_direction_10m']
                    # Precipitation probability is hourly-only; sample the hour
                    # nearest to the current observation time.
                    if 'precipitation_probability' in met_data['hourly'] and time_arr:
                        try:
                            stamp = cur.get('time') or time_arr[0]
                            ref_ms = datetime.fromisoformat(stamp).timestamp()
                            best_i, best_diff = 0, None
                            for hi, h in enumerate(time_arr):
                                diff = abs(datetime.fromisoformat(h).timestamp() - ref_ms)
                                if best_diff is None or diff < best_diff:
                                    best_diff, best_i = diff, hi
                            pp = met_data['hourly']['precipitation_probability'][best_i]
                            if pp is not None:
                                pop_pct = round(float(pp))
                            # Phase hint: 'in 3H' / 'now for 2H' / '' from the same
                            # hourly probability forecast (never a fabricated time).
                            precip_phase_key, precip_start_text, precip_end_text = precip_phase(
                                met_data['hourly'], time_arr, stamp)
                        except Exception:
                            pop_pct = None
                except: pass

            rain_in = mm_to_in(rain_mm)
            press_curr_inHg, press_prev_inHg = hpa_to_inhg(press_curr_hpa), hpa_to_inhg(press_prev_hpa)

            is_netting_day = dt.weekday() in NETTING_DAYS and site in NETTING_SITES
            net_status = "NETS IN (Severe Migration Block)" if is_netting_day else "River Open (Nets Out)"
            angler_desc, angler_mult = ("High (Weekend)", 0.80) if dt.weekday() in [5, 6] else ("Low/Moderate (Weekday)", 1.0)
            
            transit_time, transit_state, flow_index, transit_hrs = calculate_transit_time_and_flow(usgs_data["cfs"], is_netting_day)
            stock_base = calculate_stock_base_score(dt, site)
            env_score, flow_mult, push_status = calculate_macro_environment(flow_index, press_curr_inHg, press_prev_inHg, rain_in, lunar_val, is_netting_day)
            
            civil_in, civil_out = sunrise_dt - timedelta(minutes=35), sunset_dt + timedelta(minutes=35)
            # --- Legal fishing hours (registry-driven; NEVER fabricated) ------------
            # `legal_hours` is a per-waterbody FACT from the region registry. The
            # QUALITY timeline below is a separate sunlight-based fishing model and
            # keeps its original window, so the hero/peak scoring is unchanged.
            legal_rule = legal_hours_for_site(site)
            timeline_in, timeline_out = sunrise_dt - timedelta(hours=1), sunset_dt + timedelta(hours=1)
            if legal_rule == "24hr":
                # Night fishing allowed: the day is open end to end.
                timeline_in = dt.replace(hour=0, minute=0, second=0)
                timeline_out = dt.replace(hour=23, minute=59, second=0)
                lines_in_str, lines_out_str = "12:00 AM", "11:59 PM"
            elif legal_rule == "daylight":
                lines_in_str = (sunrise_dt - timedelta(hours=1)).strftime('%-I:%M %p')
                lines_out_str = (sunset_dt + timedelta(hours=1)).strftime('%-I:%M %p')
            else:
                # custom (none configured yet) / unknown -> no verified window, so we
                # report null and the UI says "check the regulations".
                legal_rule = "unknown" if legal_rule != "custom" else "custom"
                lines_in_str, lines_out_str = None, None
            
            upper_dt, lower_dt = None, None
            if moonrise_str and moonset_str:
                try:
                    mr = datetime.fromisoformat(moonrise_str)
                    ms = datetime.fromisoformat(moonset_str)
                    if ms < mr: ms += timedelta(days=1)
                    upper_dt = mr + (ms - mr)/2
                except: pass
            elif prev_upper:
                upper_dt = prev_upper + timedelta(minutes=50)
                
            if upper_dt:
                prev_upper = upper_dt
                lower_dt = upper_dt + timedelta(hours=12, minutes=25)
                if lower_dt.date() > dt.date():
                    lower_dt = upper_dt - timedelta(hours=12, minutes=25)
                    
            moon_upper_str = upper_dt.strftime('%-I:%M %p') if upper_dt else "--"
            moon_lower_str = lower_dt.strftime('%-I:%M %p') if lower_dt else "--"
            
            tide_strs = [f"{'High' if ext['type'] == 'H' else 'Low'}: {ext['dt'].strftime('%-I:%M %p')} ({ext['height']:.1f} ft)" for ext in day_extremes]
            tide_chart_str = " | ".join(tide_strs) if tide_strs else "Tide Data Syncing..."
            tide_curve = [{"t": ext["dt"].strftime("%-I:%M %p"), "h": round(ext["height"], 2), "type": ext["type"]} for ext in day_extremes]
            # Real hourly NOAA tide curve for THIS day (all_tides_curve is already
            # fetched at 1-hour resolution) — lets the chart draw a true smooth
            # area curve instead of a 4-point zigzag. Times are 12-hour display.
            tide_points = [{"t": pt["dt"].strftime("%-I:%M %p"), "h": round(pt["height"], 2)}
                           for pt in all_tides_curve if pt["dt"].date() == dt.date()]

            species_calendar = build_species_calendar(dt, site)

            timeline_windows = build_dynamic_timeline(timeline_in, timeline_out, sunrise_dt, sunset_dt, cloud_pct, arrivals, stock_base, env_score, flow_mult, angler_mult)
            peak_potential = max([w["score"] for w in timeline_windows]) if timeline_windows else 0

            reports.append({
                "id": f"day-{i}",
                "title": dt.strftime('%A, %b %d'), "tag": "TODAY" if i == 0 else "TOMORROW" if i == 1 else dt.strftime('%A').upper(),
                "peak": peak_potential, "cfs": int(round(usgs_data["cfs"])) if usgs_data["cfs"] is not None else None, "gage": round(usgs_data["gage"], 2) if usgs_data["gage"] is not None else None,
                "water_temp_f": usgs_data.get("water_temp_f"), "turbidity_fnu": usgs_data.get("turbidity_fnu"),
                "flow_idx": flow_index,
                "pressure": round(press_curr_inHg, 2), "press_delta": round(press_curr_inHg - press_prev_inHg, 2), "rain": round(rain_in, 2),
                "air_temp_f": air_temp_f, "wind_speed_mph": wind_speed_mph, "wind_dir_compass": compass_from_deg(wind_dir_deg), "pop_pct": pop_pct,
                "temp_prev_f": temp_prev_f, "temp_delta_f": temp_delta_f,
                "precip_phase": precip_phase_key, "precip_start_text": precip_start_text, "precip_end_text": precip_end_text,
                "lunar_icon": lunar_icon, "cloud_pct": cloud_pct,
                "sunrise": sunrise_dt.strftime('%-I:%M %p'), "sunset": sunset_dt.strftime('%-I:%M %p'),
                "civil_in": civil_in.strftime('%-I:%M %p'), "civil_out": civil_out.strftime('%-I:%M %p'),
                "moon_upper": moon_upper_str, "moon_lower": moon_lower_str,
                "lines_in": lines_in_str, "lines_out": lines_out_str,
                "legal_hours": legal_rule,
                "net_status": net_status, "angler_desc": angler_desc,
                "push_status": push_status, "transit_state": transit_state, "transit_time": transit_time,
                "clarity_outlook": clarity_outlook,
                "tide_station": tide_pair['id'] if tide_pair else None,
                "tide_chart": tide_chart_str, "tide_curve": tide_curve,
                "tide_points": tide_points,
                "species_calendar": species_calendar, "windows": timeline_windows, "is_netting": is_netting_day,
                "is_active": usgs_data["is_active"], "updated_time": usgs_data["updated_time"], "api_offline": bool(usgs_data.get("api_offline", False)),
                "site_name": usgs_data["site_name"], "site_id": site
            })

        body = json.dumps(reports).encode('utf-8')
        cache_put(cache_key, body)
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)
