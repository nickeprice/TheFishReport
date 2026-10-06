"""Playwright integration test: gear-sim full pipeline.
Loads app, fills form, runs sim, asserts HUD paints results.
Edge cases: 429 API, chain solver non-convergence.
"""

import json
import pytest

MOCK_EMPTY = []
MOCK_OFFLINE = [
    {"api_offline": True, "is_active": False,
     "updated_time": "Updated: Telemetry Offline"}
]


@pytest.fixture(autouse=True)
def mock_api(page):
    page.route("**/api/water_report*",
               lambda r: r.fulfill(status=200, content_type="application/json",
                                   body=json.dumps(MOCK_EMPTY)))
    yield


@pytest.fixture
def mock_api_429(page):
    page.route("**/api/water_report*",
               lambda r: r.fulfill(status=429, content_type="application/json",
                                   body=json.dumps(MOCK_OFFLINE)))
    yield


def _wait_for_gear_sim(page, url, timeout=20000):
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_selector("#btn-sim", state="visible", timeout=timeout)
    page.wait_for_function(
        "document.getElementById('weight-shape') && "
        "document.getElementById('weight-shape').options.length > 1",
        timeout=timeout)


def _fill_form(page):
    """Fill gear-sim form via JS cascade (same pattern as restoreRig())."""
    page.evaluate("""
(function(){
function s(i,v){
var e=document.getElementById(i);if(e)e.value=String(v);
var l=document.getElementById(i+'-log');if(l)l.value=String(v);
}
s('ml-mat','mono');if(typeof cascadeLine==='function')cascadeLine('mainline');
s('ml-brand','Generic average');if(typeof cascadeLine==='function')cascadeLine('mainline');
s('ml-lb','15');if(typeof resolveLineId==='function')resolveLineId('mainline');
s('ld-mat','mono');if(typeof cascadeLine==='function')cascadeLine('leader');
s('ld-brand','Generic average');if(typeof cascadeLine==='function')cascadeLine('leader');
s('ld-lb','12');if(typeof resolveLineId==='function')resolveLineId('leader');
s('weight-setup','sliding');s('weight-shape','Lead Cannonball');
if(typeof onWeightShapeChange==='function')onWeightShapeChange('weight-shape');
s('weight','0.5');s('ld-len','8');
s('hook','2');if(typeof syncSelect==='function')syncSelect('hook');
s('yarn','0');if(typeof syncSelect==='function')syncSelect('yarn');
s('foam','12');if(typeof syncSelect==='function')syncSelect('foam');
s('foam2','0');if(typeof syncSelect==='function')syncSelect('foam2');
s('foam3','0');if(typeof syncSelect==='function')syncSelect('foam3');
s('species','Chinook');if(typeof syncSelect==='function')syncSelect('species');
s('water-type','run');if(typeof syncSelect==='function')syncSelect('water-type');
})();
""")


def _run_and_wait(page):
    page.click("#btn-sim")
    page.wait_for_function(
        "document.getElementById('btn-sim').innerText === 'RUN SIMULATION'",
        timeout=30000)


def test_gear_sim_happy_path(page, dev_server, mock_api):
    _wait_for_gear_sim(page, dev_server + "/?tab=tab-gear-sim")
    errs = []
    page.on("console", lambda m: errs.append(str(m.text)) if m.type == "error" else None)
    _fill_form(page)
    _run_and_wait(page)
    hgt = page.evaluate("document.getElementById('hud-hgt').innerText")
    assert hgt and hgt != "--", f"HUD line height missing, got '{hgt}'"
    zone = page.evaluate("document.getElementById('hud-zone').innerText")
    assert zone and '"' in zone, f"HUD zone estimate missing, got '{zone}'"
    assert len(errs) == 0, f"Console errors: {errs}"


def test_gear_sim_429_api(page, dev_server, mock_api_429):
    _wait_for_gear_sim(page, dev_server + "/?tab=tab-gear-sim")
    errs = []
    page.on("console", lambda m: errs.append(str(m.text)) if m.type == "error" else None)
    _fill_form(page)
    _run_and_wait(page)
    hgt = page.evaluate("document.getElementById('hud-hgt').innerText")
    assert hgt and hgt != "--", f"HUD should paint under 429, got '{hgt}'"
    real = [e for e in errs if "429" not in e and "rate" not in e.lower()]
    assert len(real) == 0, f"Unexpected errors: {real}"


def test_gear_sim_non_convergence(page, dev_server, mock_api):
    _wait_for_gear_sim(page, dev_server + "/?tab=tab-gear-sim")
    errs = []
    page.on("console", lambda m: errs.append(str(m.text)) if m.type == "error" else None)
    _fill_form(page)
    page.evaluate("var e=document.getElementById('ld-len');if(e)e.value='30';")
    _run_and_wait(page)
    hgt = page.evaluate("document.getElementById('hud-hgt').innerText")
    assert hgt and hgt != "--", f"HUD should show fallback, got '{hgt}'"
    real = [e for e in errs if "429" not in e and "rate" not in e.lower()]
    assert len(real) == 0, f"Unexpected errors: {real}"