#!/usr/bin/env python3
"""Generate Nunba splash.png from splash.svg using headless Chromium.
This ensures all Indic scripts (Tamil, Devanagari, Bengali, Telugu, etc.)
render with proper complex text shaping via the browser's HarfBuzz engine.
"""
import os

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)
SVG_PATH = os.path.join(PROJECT_ROOT, 'splash.svg')
PNG_PATH = os.path.join(PROJECT_ROOT, 'splash.png')

# Build a minimal HTML page that displays the SVG at exact size
html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* {{ margin:0; padding:0; }}
body {{ width:960px; height:640px; overflow:hidden; background:#0A0914; }}
img {{ width:960px; height:640px; display:block; }}
</style></head>
<body><img src="file:///{SVG_PATH.replace(os.sep, '/')}"></body></html>
"""

html_path = os.path.join(HERE, '_splash_render.html')
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 960, 'height': 640})
    page.goto(f'file:///{html_path.replace(os.sep, "/")}')
    page.wait_for_timeout(500)  # let fonts load
    page.screenshot(path=PNG_PATH, type='png')
    browser.close()

# Clean up temp HTML
os.remove(html_path)
print(f'Saved {PNG_PATH} (960x640)')
