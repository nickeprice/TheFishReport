from playwright.sync_api import sync_playwright

def verify_layout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844}) # iPhone 12 Pro dimensions
        page.goto("http://localhost:5173/")
        page.wait_for_timeout(2000) # Let MapLibre and UI mount
        
        elements = ["#top-nav", "#map-bottom-handle", "#map-fab"]
        
        for selector in elements:
            try:
                box = page.locator(selector).bounding_box()
                visible = page.locator(selector).is_visible()
                print(f"Element: {selector} | Visible: {visible} | Box: {box}")
            except Exception as e:
                print(f"Element: {selector} | Not found or error: {e}")
                
        browser.close()

if __name__ == "__main__":
    verify_layout()