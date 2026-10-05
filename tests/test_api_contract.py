"""Schema-driven API contract tests for /api/water_report.

Patches every upstream HTTP call (USGS, NOAA, Open-Meteo) with dummy JSON
so tests are fast, deterministic, and offline.  Uses an in-process HTTP
server so patches are visible to the handler code.
"""

import json, os, sys, time, urllib.request
from io import BytesIO
from http.server import ThreadingHTTPServer
from threading import Thread
from unittest.mock import patch
import pytest, jsonschema

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, 'api')


def _free_port():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


# ======== JSON Schema (per CONTRACT.md) =====================================
# Provenance envelope (Phase 2.3): { value, source, uncertainty | null }.
# The schema accepts BOTH the old plain scalar and the new envelope so a stale
# SW-cached payload never fails validation shape-wise (the frontend provVal()
# tolerance matches this).
def _prov_item(value_schema):
    return {
        "anyOf": [
            {
                "type": "object",
                "required": ["value", "source", "uncertainty"],
                "properties": {
                    "value": value_schema,
                    "source": {"type": "string"},
                    "uncertainty": {"anyOf": [{"type": "number"}, {"type": "null"}]},
                },
            },
            {"type": "null"},
        ]
    }

PER_DAY_SCHEMA = {
    "type": "object",
    "required": [
        "id","title","tag","peak","cfs","gage","water_temp_f","turbidity_fnu",
        "flow_idx","pressure","press_delta","rain","lunar_icon","cloud_pct",
        "sunrise","sunset","lines_in","lines_out","legal_hours",
        "moon_upper","moon_lower","net_status","is_netting",
        "transit_state","transit_time","tide_chart","tide_curve","tide_points",
        "species_calendar","windows","api_offline","is_active",
        "site_name","site_id",
    ],
    "properties": {
        "id":{"type":"string"},"title":{"type":"string"},"tag":{"type":"string"},
        "peak":{"type":"number","minimum":0,"maximum":100},
        "cfs": _prov_item({"oneOf": [{"type": "integer"}, {"type": "number"}]}),
        "gage": _prov_item({"type": "number"}),
        "water_temp_f": _prov_item({"type": "number"}),
        "turbidity_fnu": _prov_item({"type": "number"}),
        "flow_idx":{"type":"integer","minimum":1,"maximum":100},
        "pressure": _prov_item({"type": "number"}),
        "press_delta":{"type":"number"},
        "rain": _prov_item({"type": "number"}),
        "lunar_icon":{"anyOf":[{"type":"string"},{"type":"null"}]},
        "cloud_pct": _prov_item({"type": "number"}),
        "sunrise":{"type":"string"},"sunset":{"type":"string"},
        "lines_in":{"anyOf":[{"type":"string"},{"type":"null"}]},
        "lines_out":{"anyOf":[{"type":"string"},{"type":"null"}]},
        "legal_hours":{"type":"string",
                       "enum":["daylight","24hr","custom","unknown"]},
        "moon_upper":{"anyOf":[{"type":"string"},{"pattern":"^--$"}]},
        "moon_lower":{"anyOf":[{"type":"string"},{"pattern":"^--$"}]},
        "net_status":{"type":"string"},"is_netting":{"type":"boolean"},
        "transit_state":{"type":"string"},"transit_time":{"type":"string"},
        "tide_chart":{"type":"string"},
        "tide_curve": _prov_item({"type":"array",
            "items":{"type":"object","required":["t","h","type"],
                     "properties":{"t":{"type":"string"},"h":{"type":"number"},
                                    "type":{"type":"string","enum":["H","L"]}}}}),
        "tide_points": _prov_item({"type":"array",
            "items":{"type":"object","required":["t","h"],
                     "properties":{"t":{"type":"string"},"h":{"type":"number"}}}}),
        "species_calendar": _prov_item({"type":"array",
            "items":{"type":"object",
                "required":["species","window_start","window_end","peak_date",
                            "days_until_peak","position","status_text",
                            "progress","peak_frac"],
                "properties":{
                    "species":{"type":"string"},
                    "window_start":{"type":"string"},
                    "window_end":{"type":"string"},
                    "peak_date":{"type":"string"},
                    "days_until_peak":{"anyOf":[{"type":"integer"},
                                                {"type":"null"}]},
                    "position":{"type":"string"},
                    "status_text":{"type":"string"},
                    "progress":{"type":"number","minimum":0,"maximum":1},
                    "peak_frac":{"type":"number","minimum":0,"maximum":1},
                }}}),
        "windows":{"type":"array",
            "items":{"type":"object",
                "required":["start","end","score","triggers",
                            "start_str","end_str"],
                "properties":{
                    "start":{"type":"string"},"end":{"type":"string"},
                    "score":{"type":"number"},"triggers":{"anyOf":[{"type":"array"},{"type":"string"}]},
                    "start_str":{"type":"string"},"end_str":{"type":"string"},
                }}},
        "api_offline":{"type":"boolean"},"is_active":{"type":"boolean"},
        "site_name":{"type":"string"},"site_id":{"type":"string"},
    },
}
# ======== Mock upstream responses ===========================================

MOCK_USGS_NWIS = {
    "value": {"timeSeries": [
        {"sourceInfo":{"siteName":"Puyallup River at Puyallup, WA"},
         "variable":{"variableName":"Discharge, cubic feet per second",
                     "unit":{"unitCode":"ft3/s"},"noDataValue":-999999.0},
         "values":[{"value":[{"dateTime":"2026-10-04T08:00:00.000-07:00",
                              "value":"1040"}]}]},
        {"sourceInfo":{"siteName":"Puyallup River at Puyallup, WA"},
         "variable":{"variableName":"Gage height, feet",
                     "unit":{"unitCode":"ft"},"noDataValue":-999999.0},
         "values":[{"value":[{"dateTime":"2026-10-04T08:00:00.000-07:00",
                              "value":"5.2"}]}]},
        {"sourceInfo":{"siteName":"Puyallup River at Puyallup, WA"},
         "variable":{"variableName":"Temperature, water, deg Fahrenheit",
                     "unit":{"unitCode":"deg F"},"noDataValue":-999999.0},
         "values":[{"value":[{"dateTime":"2026-10-04T08:00:00.000-07:00",
                              "value":"55"}]}]},
        {"sourceInfo":{"siteName":"Puyallup River at Puyallup, WA"},
         "variable":{"variableName":"Turbidity, FNU",
                     "unit":{"unitCode":"FNU"},"noDataValue":-999999.0},
         "values":[{"value":[{"dateTime":"2026-10-04T08:00:00.000-07:00",
                              "value":"5.2"}]}]},
    ]}
}

MOCK_WDFN = {"value": []}

MOCK_METEO = {
    "hourly": {
        "time":[f"2026-10-{d:02d}T{h:02d}:00" for d in range(4,8)
                for h in range(24)],
        "cloud_cover":[30]*96,"precipitation":[0.0]*96,
        "pressure_msl":[1020]*96,"surface_pressure":[1015]*96,
        "temperature_2m":[55]*96,"wind_speed_10m":[5]*96,
        "wind_direction_10m":[180]*96,"shortwave_radiation":[300]*96,
        "uv_index":[2]*96,"precipitation_probability":[10]*96,
        "visibility":[16093]*96,},
    "daily":{
        "time":["2026-10-04","2026-10-05","2026-10-06","2026-10-07"],
        "sunrise":["2026-10-04T07:00","2026-10-05T07:01",
                   "2026-10-06T07:02","2026-10-07T07:03"],
        "sunset":["2026-10-04T19:00","2026-10-05T18:59",
                  "2026-10-06T18:58","2026-10-07T18:57"],
        "temperature_2m_max":[60,62,61,59],
        "temperature_2m_min":[50,51,50,48],
        "precipitation_sum":[0.0,0.1,0.0,0.0],
        "cloud_cover_mean":[30,40,20,50],"uv_index_max":[3,4,3,2],
    }
}

MOCK_COOPS = {"stations":[{"id":"9446484","name":"Seattle"}]}

MOCK_STREAMSTATS_DELINEATION = {
    "wscode": 200,
    "featurecollection": [{
        "features": [],
        "parameters": [
            {"id": "DRNAREA", "name": "Drainage Area", "value": "948",
             "unit": "mi2", "type": "basin"},
            {"id": "ELEV", "name": "Mean Basin Elevation", "value": "1100",
             "unit": "ft", "type": "basin"},
            {"id": "PRECIP", "name": "Mean Annual Precipitation", "value": "70",
             "unit": "in", "type": "basin"},
        ],
    }],
    "workspaceId": "ws-test-123",
}
MOCK_TIDES = {"predictions":[
    {"t":"2026-10-04 06:00","v":"8.5"},{"t":"2026-10-04 12:00","v":"3.2"},
    {"t":"2026-10-04 18:00","v":"9.1"},{"t":"2026-10-05 06:30","v":"8.7"},
    {"t":"2026-10-05 13:00","v":"3.5"},{"t":"2026-10-05 19:00","v":"8.9"},
    {"t":"2026-10-06 07:00","v":"8.3"},{"t":"2026-10-06 13:30","v":"3.8"},
    {"t":"2026-10-06 19:30","v":"9.3"},{"t":"2026-10-07 07:30","v":"8.1"},
    {"t":"2026-10-07 14:00","v":"4.0"},{"t":"2026-10-07 20:00","v":"9.5"},
]}


class _MockBytesIO(BytesIO):
    def __init__(self, data):
        super().__init__(data); self.status = 200; self.headers = {}
    def getcode(self):
        return self.status


_MOCK_CALLS = []
_real_urlopen = urllib.request.urlopen

def _mock_urlopen(req, *a, **kw):
    """Pass-through for local server; return mock data for upstream APIs."""
    url = req.full_url if hasattr(req, 'full_url') else str(req)
    _MOCK_CALLS.append(url[:120])
    # Let requests to the in-process server go through to the real handler
    if '127.0.0.1' in url:
        return _real_urlopen(req, *a, **kw)
    # Upstream API → return mock data
    if 'nwis/iv' in url:       data = json.dumps(MOCK_USGS_NWIS)
    elif 'api.open-meteo.com' in url: data = json.dumps(MOCK_METEO)
    elif 'tidesandcurrents' in url and 'predict' in url:
        data = json.dumps(MOCK_TIDES)
    elif 'tidesandcurrents' in url: data = json.dumps(MOCK_COOPS)
    elif 'api_key' in url or 'ogcapi' in url: data = json.dumps(MOCK_WDFN)
    elif 'streamstatsservices' in url or 'delineateByLatLon' in url:
        data = json.dumps(MOCK_STREAMSTATS_DELINEATION)
    else:                        data = '{}'
    return _MockBytesIO(data.encode('utf-8'))
# ======== Fixture: in-process server with patches ===========================

@pytest.fixture(scope='function')
def server_with_patch():
    """Start dev server in-process WITH urlopen patched.

    The ``with patch():`` context starts BEFORE any water_report code runs,
    so the handler uses mocked upstream calls throughout.
    """
    _MOCK_CALLS.clear()
    sys.path.insert(0, API_DIR)
    with patch('urllib.request.urlopen',
               side_effect=_mock_urlopen):
        import water_report   # noqa: import under patch
        port = _free_port()
        srv = ThreadingHTTPServer(('127.0.0.1', port),
                                  water_report.handler)
        srv.timeout = 0.5
        url = f'http://127.0.0.1:{port}'
        t = Thread(target=srv.serve_forever, daemon=True)
        t.start()
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                urllib.request.urlopen(
                    urllib.request.Request(url), timeout=2)
                break
            except Exception:
                time.sleep(0.1)
        else:
            srv.shutdown()
            raise RuntimeError('In-process server did not start')
        yield url
        srv.shutdown()


# ======== Tests =============================================================
WATER_REPORT = '/api/water_report?lat=47.1950&lon=-122.3020'


@pytest.mark.parametrize("endpoint", [WATER_REPORT,
                                       WATER_REPORT + '&site=12101500'])
def test_water_report_contract(server_with_patch, endpoint):
    """Validate every per-day object against the strict JSON schema."""
    resp = urllib.request.urlopen(
        urllib.request.Request(server_with_patch + endpoint), timeout=10)
    raw = resp.read().decode('utf-8')
    report = json.loads(raw)
    assert isinstance(report, list), (
        f"Got {type(report).__name__}, status={resp.status}, "
        f"mock_calls={len(_MOCK_CALLS)}")
    assert len(report) == 4
    for day in report:
        jsonschema.validate(instance=day, schema=PER_DAY_SCHEMA)
    d0 = report[0]
    assert d0['site_id'] == '12101500'
    tc = d0['tide_curve']
    assert (isinstance(tc, dict) and isinstance(tc.get('value'), list)) or isinstance(tc, list), (
        f"tide_curve should be an envelope with value array, got {type(tc)}")
    sc = d0['species_calendar']
    assert (isinstance(sc, dict) and isinstance(sc.get('value'), list)) or isinstance(sc, list), (
        f"species_calendar should be an envelope with value array, got {type(sc)}")
    assert isinstance(d0['windows'], list)


# ======== StreamStats endpoint tests =========================================

@pytest.fixture(scope='function')
def streamstats_server():
    """In-process server serving streamstats.handler with live-mock urlopen."""
    sys.path.insert(0, API_DIR)
    with patch('urllib.request.urlopen', side_effect=_mock_urlopen):
        import streamstats
        port = _free_port()
        srv = ThreadingHTTPServer(('127.0.0.1', port),
                                  streamstats.handler)
        srv.timeout = 0.5
        url = f'http://127.0.0.1:{port}'
        t = Thread(target=srv.serve_forever, daemon=True)
        t.start()
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                urllib.request.urlopen(
                    urllib.request.Request(
                        url + '/api/streamstats?lat=47&lon=-122'), timeout=2)
                break
            except Exception:
                time.sleep(0.1)
        else:
            srv.shutdown()
            raise RuntimeError('StreamStats server did not start')
        yield url
        srv.shutdown()


@pytest.fixture(scope='function')
def streamstats_server_offline():
    """In-process streamstats server where the upstream urlopen RAISES.

    Forces the offline-estimate fallback path. Local (127.0.0.1) calls are
    passed through to the real urlopen so the test can still talk to the
    in-process server.
    """
    def offline_urlopen(req, *a, **kw):
        url = req.full_url if hasattr(req, 'full_url') else str(req)
        if '127.0.0.1' in url:
            return _real_urlopen(req, *a, **kw)
        raise urllib.error.URLError('streamstats upstream unreachable (test)')

    sys.path.insert(0, API_DIR)
    with patch('urllib.request.urlopen', side_effect=offline_urlopen):
        import streamstats
        port = _free_port()
        srv = ThreadingHTTPServer(('127.0.0.1', port),
                                  streamstats.handler)
        srv.timeout = 0.5
        url = f'http://127.0.0.1:{port}'
        t = Thread(target=srv.serve_forever, daemon=True)
        t.start()
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                urllib.request.urlopen(
                    urllib.request.Request(
                        url + '/api/streamstats?lat=47&lon=-122'), timeout=2)
                break
            except Exception:
                time.sleep(0.1)
        else:
            srv.shutdown()
            raise RuntimeError('StreamStats server did not start')
        yield url
        srv.shutdown()


STREAMSTATS_URL = '/api/streamstats?lat=47.1950&lon=-122.3020'


def test_streamstats_live_mode(streamstats_server):
    """Live StreamStats delineation returns provenance-shape metrics."""
    resp = urllib.request.urlopen(
        urllib.request.Request(streamstats_server + STREAMSTATS_URL),
        timeout=10)
    out = json.loads(resp.read().decode('utf-8'))
    assert out['ok'] is True
    assert out['mode'] == 'live'
    d = out['drainage_area_sq_mi']
    assert d['value'] == 948
    assert 'source' in d and 'uncertainty' in d
    assert out['mean_elevation_ft']['value'] == 1100
    assert out['mean_precip_in']['value'] == 70


def test_streamstats_offline_fallback(streamstats_server_offline):
    """When the upstream fails, the offline fallback serves honest estimates."""
    resp = urllib.request.urlopen(
        urllib.request.Request(streamstats_server_offline + STREAMSTATS_URL),
        timeout=10)
    out = json.loads(resp.read().decode('utf-8'))
    assert out['ok'] is True
    assert out['mode'] == 'offline'
    assert out['resolved_site_id'] == '12101500'
    for key in ('drainage_area_sq_mi', 'mean_elevation_ft', 'mean_precip_in'):
        metric = out[key]
        assert 'value' in metric and 'source' in metric and 'uncertainty' in metric
        assert isinstance(metric['value'], (int, float)) and metric['value'] > 0
    assert out['drainage_area_sq_mi']['value'] == 948
    assert out['note'], 'offline mode must explain the fallback'


def test_streamstats_rejects_bad_coords(streamstats_server_offline):
    """Coordinates outside the covered region are refused, not fanned out."""
    url = streamstats_server_offline + '/api/streamstats?lat=0&lon=0'
    try:
        urllib.request.urlopen(urllib.request.Request(url), timeout=10)
        assert False, 'expected non-2xx for out-of-region coordinates'
    except urllib.error.HTTPError as e:
        assert e.code == 400
        body = json.loads(e.read().decode('utf-8'))
        assert 'outside' in body.get('error', '').lower()