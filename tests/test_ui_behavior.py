"""Playwright behavioral UI tests with offline-mocked API.

Uses ``page.route()`` to intercept all ``/api/water_report`` requests
and fulfill them with a local JSON mock — zero live network calls.
"""

import json
import pytest

# ======== Mock water-report payload (4 day-rows) =============================
MOCK_REPORT = [
    {
        "id": "d0", "title": "Today in", "tag": "Today",
        "peak": 72, "cfs": 1040, "gage": 5.2,
        "water_temp_f": 55, "turbidity_fnu": 5.2,
        "flow_idx": 45, "pressure": 30.1, "press_delta": -0.08,
        "rain": 0.0, "lunar_icon": "\U0001f313 First Quarter",
        "cloud_pct": 30, "sunrise": "7:00 AM", "sunset": "7:00 PM",
        "lines_in": "6:30 AM", "lines_out": "8:00 PM",
        "legal_hours": "daylight",
        "moon_upper": "10:00 AM", "moon_lower": "10:00 PM",
        "net_status": "River Open \u2014 No Net Restriction",
        "is_netting": False,
        "transit_state": "Steady Migration", "transit_time": "15 to 17 hrs",
        "tide_chart": "High: 6:00 AM (8.5 ft) | Low: 12:00 PM (3.2 ft)",
        "tide_curve": [
            {"t": "6:00 AM", "h": 8.5, "type": "H"},
            {"t": "12:00 PM", "h": 3.2, "type": "L"},
            {"t": "6:00 PM", "h": 9.1, "type": "H"},
        ],
        "tide_points": [
            {"t": "6:00 AM", "h": 8.5},
            {"t": "9:00 AM", "h": 5.8},
            {"t": "12:00 PM", "h": 3.2},
        ],
        "species_calendar": [{
            "species": "Chinook", "window_start": "2026-10-01",
            "window_end": "2026-11-15", "peak_date": "2026-10-20",
            "days_until_peak": 16, "position": "pre",
            "status_text": "Getting better", "progress": 0.3, "peak_frac": 0.6,
        }],
        "windows": [{
            "start": "6:30 AM", "end": "8:00 PM", "score": 72,
            "triggers": ["Dawn"], "start_str": "6:30 AM", "end_str": "8:00 PM",
        }],
        "api_offline": False, "is_active": True,
        "site_name": "Puyallup River at Puyallup, WA", "site_id": "12101500",
    },
    {
        "id": "d1", "title": "Tomorrow in", "tag": "Tomorrow",
        "peak": 68, "cfs": 1010, "gage": 5.0,
        "water_temp_f": 54, "turbidity_fnu": 4.8,
        "flow_idx": 43, "pressure": 30.0, "press_delta": -0.05,
        "rain": 0.1, "lunar_icon": "\U0001f313 First Quarter",
        "cloud_pct": 40, "sunrise": "7:01 AM", "sunset": "6:59 PM",
        "lines_in": "6:30 AM", "lines_out": "8:00 PM",
        "legal_hours": "daylight",
        "moon_upper": "11:00 AM", "moon_lower": "11:00 PM",
        "net_status": "River Open \u2014 No Net Restriction", "is_netting": False,
        "transit_state": "Steady Migration", "transit_time": "15 to 17 hrs",
        "tide_chart": "High: 6:30 AM (8.7 ft) | Low: 1:00 PM (3.5 ft)",
        "tide_curve": [{"t": "6:30 AM","h": 8.7,"type": "H"},{"t": "1:00 PM","h": 3.5,"type": "L"}],
        "tide_points": [],
        "species_calendar": [{
            "species": "Chinook","window_start":"2026-10-01","window_end":"2026-11-15",
            "peak_date":"2026-10-20","days_until_peak":15,"position":"pre",
            "status_text":"Getting better","progress":0.35,"peak_frac":0.65,
        }],
        "windows": [{"start":"6:30 AM","end":"8:00 PM","score":68,"triggers":["Dawn"],"start_str":"6:30 AM","end_str":"8:00 PM"}],
        "api_offline": False, "is_active": True,
        "site_name": "Puyallup River at Puyallup, WA", "site_id": "12101500",
    },
{
        "id": "d2", "title": "Day 3", "tag": "Day 3",
        "peak": 55, "cfs": 980, "gage": 4.9,
        "water_temp_f": 53, "turbidity_fnu": None,
        "flow_idx": 40, "pressure": 29.9, "press_delta": -0.02,
        "rain": None, "lunar_icon": "\U0001f313 First Quarter",
        "cloud_pct": 20, "sunrise": "7:02 AM", "sunset": "6:58 PM",
        "lines_in": "6:30 AM", "lines_out": "8:00 PM",
        "legal_hours": "daylight",
        "moon_upper": "--", "moon_lower": "--",
        "net_status": "River Open \u2014 No Net Restriction", "is_netting": False,
        "transit_state": "Steady Migration", "transit_time": "15 to 17 hrs",
        "tide_chart": "High: 7:00 AM (8.3 ft) | Low: 1:30 PM (3.8 ft)",
        "tide_curve": [], "tide_points": [],
        "species_calendar": [], "windows": [],
        "api_offline": False, "is_active": True,
        "site_name": "Puyallup River at Puyallup, WA", "site_id": "12101500",
    },
    {
        "id": "d3", "title": "Day 4", "tag": "Day 4",
        "peak": 0, "cfs": None, "gage": None,
        "water_temp_f": None, "turbidity_fnu": None,
        "flow_idx": 1, "pressure": None, "press_delta": 0.0,
        "rain": None, "lunar_icon": None,
        "cloud_pct": None, "sunrise": "7:03 AM", "sunset": "6:57 PM",
        "lines_in": None, "lines_out": None,
        "legal_hours": "unknown",
        "moon_upper": "--", "moon_lower": "--",
        "net_status": "River Open \u2014 No Net Restriction", "is_netting": False,
        "transit_state": "Steady Migration", "transit_time": "15 to 17 hrs",
        "tide_chart": "", "tide_curve": [], "tide_points": [],
        "species_calendar": [], "windows": [],
        "api_offline": True, "is_active": False,
        "site_name": "Puyallup River at Puyallup, WA", "site_id": "12101500",
    },
]

MOCK_OFFLINE_REPORT = [{
    "id": "d0", "title": "Today in", "tag": "Today",
    "peak": 0, "cfs": None, "gage": None,
    "water_temp_f": None, "turbidity_fnu": None,
    "flow_idx": 1, "pressure": None, "press_delta": 0.0,
    "rain": None, "lunar_icon": None,
    "cloud_pct": None, "sunrise": "7:00 AM", "sunset": "7:00 PM",
    "lines_in": None, "lines_out": None,
    "legal_hours": "unknown",
    "moon_upper": "--", "moon_lower": "--",
    "net_status": "River Open \u2014 No Net Restriction", "is_netting": False,
    "transit_state": "Steady Migration", "transit_time": "15 to 17 hrs",
    "tide_chart": "", "tide_curve": [], "tide_points": [],
    "species_calendar": [], "windows": [],
    "api_offline": True, "is_active": False,
    "site_name": "Puyallup River at Puyallup, WA", "site_id": "12101500",
    "updated_time": "Updated: Telemetry Offline",
}]
# ======== Playwright fixtures ================================================

@pytest.fixture(scope='function')
def mock_api(page):
    """Intercept all /api/water_report requests and return the mock payload."""
    def handle(route):
        route.fulfill(
            status=200,
            content_type='application/json',
            body=json.dumps(MOCK_REPORT),
        )
    page.route('**/api/water_report*', handle)
    yield


@pytest.fixture(scope='function')
def mock_api_offline(page):
    """Intercept /api/water_report and return an offline/empty payload."""
    def handle(route):
        route.fulfill(
            status=200,
            content_type='application/json',
            body=json.dumps(MOCK_OFFLINE_REPORT),
        )
    page.route('**/api/water_report*', handle)
    yield


# ======== Tests =============================================================


def _goto_and_wait(page, url):
    """Navigate and wait for JS bootstrap to finish."""
    page.goto(url)
    page.wait_for_load_state('networkidle')
    # Wait for app.js onload to finish (which calls applyTabDeepLink)
    page.wait_for_function(
        'typeof window.applyTabDeepLink === "function"', timeout=10000)
    # Wait for the tabs to exist in the DOM (hidden tabs are display:none,
    # so only check for attachment, not visibility).
    page.wait_for_selector('.tab-content', state='attached', timeout=10000)


def _assert_tab_active(page, tab_id):
    """Assert that the given tab element has 'tab-active' in its class list."""
    el = page.locator(f'#{tab_id}')
    page.wait_for_function(
        f'document.getElementById("{tab_id}").classList.contains("tab-active")',
        timeout=5000)


def test_deep_link_activates_correct_tab(page, dev_server, mock_api):
    """Navigating with ?tab=tab-gear-sim activates the Gear Sim tab."""
    _goto_and_wait(page, dev_server + '/?tab=tab-gear-sim')
    _assert_tab_active(page, 'tab-gear-sim')


def test_deep_link_catch_log(page, dev_server, mock_api):
    """Navigating with ?tab=tab-catch-log activates the Catch Log tab."""
    _goto_and_wait(page, dev_server + '/?tab=tab-catch-log')
    _assert_tab_active(page, 'tab-catch-log')


def test_deep_link_water_report(page, dev_server, mock_api):
    """Navigating with ?tab=tab-water-report activates Water Report tab."""
    _goto_and_wait(page, dev_server + '/?tab=tab-water-report')
    _assert_tab_active(page, 'tab-water-report')


def test_switchTab_toggles_class(page, dev_server, mock_api):
    """Calling switchTab() programmatically toggles tab-active class."""
    _goto_and_wait(page, dev_server + '/')
    page.evaluate('switchTab("tab-catch-log")')
    _assert_tab_active(page, 'tab-catch-log')
    # Water report should NOT be active
    wr_active = page.evaluate(
        'document.getElementById("tab-water-report").classList.contains("tab-active")')
    assert wr_active is False, "tab-water-report should NOT be tab-active"


def test_toast_renders_in_stack(page, dev_server, mock_api):
    """Triggering showToast() renders a .toast inside .toast-stack."""
    _goto_and_wait(page, dev_server + '/')
    page.evaluate('showToast("Hello from test", "info", 5000)')
    stack = page.locator('#toast-stack')
    assert stack.count() == 1, "toast-stack element should exist"
    # Check that at least one .toast-msg contains our text
    msgs = stack.locator('.toast-msg')
    texts = msgs.all_text_contents()
    assert any('Hello from test' in t for t in texts), (
        f"No toast-msg contains 'Hello from test'. Messages: {texts}")


def test_empty_state_renders(page, dev_server, mock_api_offline):
    """When the API returns offline, empty state message appears."""
    _goto_and_wait(page, dev_server + '/')
    cards = page.locator('#water-report-cards')
    html = cards.text_content()
    assert ('Telemetry Offline' in html or 'offline' in html.lower()
            or 'No river data' in html
            or 'Water report unavailable' in html
            or 'telemetry service' in html.lower()), (
        f"Expected offline message, got: {html[:200]}")