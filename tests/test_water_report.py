import re
import json
from playwright.sync_api import Page, expect

BASE_URL = "http://localhost:3000"

def test_water_report_renders_successfully(page: Page):
    errors = []
    page.on("pageerror", lambda err: errors.append(err.message))

    # NEW METHOD: Lobotomize the Service Worker API before the page boots.
    # MSW checks for this. Without it, MSW gracefully degrades and makes standard 
    # fetch requests, allowing Playwright's native routing to finally catch them.
    page.add_init_script("delete Navigator.prototype.serviceWorker;")

    mock_report = [{
        "id": "day-0",
        "title": "Wednesday, Oct 7",
        "tag": "TODAY",
        "peak": 85,
        "cfs": {"value": 2450, "source": "usgs-telemetry", "uncertainty": None},
        "gage": {"value": 5.2, "source": "usgs-telemetry", "uncertainty": None},
        "is_active": True,
        "api_offline": False,
        "legal_hours": "daylight",
        "lines_in": "6:30 AM",
        "lines_out": "7:45 PM",
        "site_name": "PUYALLUP RIVER AT PUYALLUP, WA",
        "site_id": "12101500",
        "weather_hourly": [],
        "tide_curve": {"value": [], "source": "mock", "uncertainty": None},
        "tide_points": {"value": [], "source": "mock", "uncertainty": None},
        "species_calendar": {"value": [], "source": "mock", "uncertainty": None},
        "windows": []
    }]

    # Standard routing - this will work now because MSW isn't stealing them
    page.route("**/api/water_report*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps(mock_report)
    ))

    page.route("**/rest/v1/public_catch_feed*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps([])
    ))

    page.goto(f"{BASE_URL}/?station=12101500")

    # Wait for the water report cards container
    cards_container = page.locator("#water-report-cards")
    expect(cards_container).not_to_be_empty(timeout=10000)

    # Assert the legal hours label is populated
    legal_hours = page.locator("#hero-legal-hours")
    expect(legal_hours).not_to_contain_text("--:-- – --:--")
    expect(legal_hours).to_contain_text(re.compile(r"\d{1,2}:\d{2}"))

    # Assert the first day card exists
    first_day_card = page.locator("#day-0")
    expect(first_day_card).to_be_visible()

    # Assert CFS data loaded successfully
    cfs_text = page.locator("#day-0").locator("text=CFS")
    expect(cfs_text).to_be_visible()
    
    # Ensure no console errors were thrown
    assert len(errors) == 0, f"Page threw JavaScript errors: {errors}"