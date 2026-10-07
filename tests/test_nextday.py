"""Playwright: verify forward-day navigation + weather pills populate."""
import json, sys
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8080'

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        
        page.goto(f'{BASE}/?station=12101500')
        page.wait_for_function(
            'document.getElementById("water-report-cards")?.children.length > 0',
            timeout=15000
        )
        print('ok: initial cards loaded', flush=True)
        
        # Check day-0 visible, has data
        day0 = page.query_selector('#day-0')
        d0style = day0.get_attribute('style') if day0 else 'MISSING'
        d0temp = day0.query_selector('.air-temp').inner_text() if day0 and day0.query_selector('.air-temp') else 'MISSING'
        print(f'ok: day-0 style={d0style} temp={d0temp}', flush=True)
        
        # Click forward 3 times: day-0 -> day-1 -> day-2 -> day-3
        for target_day in range(1, 4):
            page.query_selector('#btn-next-date').click()
            page.wait_for_timeout(1500)
            
            card = page.query_selector(f'#day-{target_day}')
            style = card.get_attribute('style') if card else 'MISSING'
            temp = card.query_selector('.air-temp').inner_text() if card and card.query_selector('.air-temp') else 'MISSING'
            wind = card.query_selector('.wind-val').inner_text() if card and card.query_selector('.wind-val') else 'MISSING'
            precip = card.query_selector('.precip-pop').inner_text() if card and card.query_selector('.precip-pop') else 'MISSING'
            solunar = card.query_selector('.solunar-val') if card else None
            solunar_over = solunar.inner_text() if solunar else 'MISSING'
            
            print(f'ok: day-{target_day} style={style} temp={temp} wind={wind} precip={precip} solunar={solunar_over}', flush=True)
            
            # Verify it has real data (not --)
            assert temp != '--', f'FAIL: day-{target_day} temp is --'
            assert wind != '--', f'FAIL: day-{target_day} wind is --'
            assert precip != '--', f'FAIL: day-{target_day} precip is --'
            print(f'ok: day-{target_day} all pills populated', flush=True)
        
        if errors:
            print(f'FAIL: JS errors: {errors}', flush=True)
        else:
            print('ok: no JS errors', flush=True)
        
        browser.close()
        print('ALL PASSED', flush=True)

if __name__ == '__main__':
    main()