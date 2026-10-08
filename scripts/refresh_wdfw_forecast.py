#!/usr/bin/env python3
"""
refresh_wdfw_forecast.py — WDFW annual salmon forecast scraper.

Fetches the STABLE index page (https://wdfw.wa.gov/fishing/management/north-falcon/forecasts),
resolves the current-year "Chinook forecasts" + "coho forecast" PDF hrefs (the
URLs change every year; the index is the stable anchor), downloads the PDFs,
and extracts table data via PyMuPDF (fitz) with fuzzy river-name matching.
The `--confirm` gate stays — the script prints candidates and NEVER writes
an unverified number.

Usage:
    python3 scripts/refresh_wdfw_forecast.py            # resolve + print, no write
    python3 scripts/refresh_wdfw_forecast.py --confirm  # write only CONFIRMED numbers

AI/LLM INSTRUCTIONS (no-fabricate):
  - `--confirm` writes a number ONLY when the human has verified it and passes
    it via --chinook=NNNN / --coho=NNNN (or edits the JSON by hand). The scraper
    never invents a figure from PDF geometry.
  - Without explicit confirmed numbers the JSON keeps `forecast: null` / `--`.
"""

import argparse
import difflib
import json
import os
import re
import ssl
import sys
import urllib.request
import pymupdf  # PyMuPDF (legacy alias: fitz)

# Matches api/water_report.py's fetch pattern: public USGS/NOAA/WDFW data over
# HTTPS with an unverified context (local python often lacks the CA bundle).
SSL_CONTEXT = ssl._create_unverified_context()

INDEX_URL = "https://wdfw.wa.gov/fishing/management/north-falcon/forecasts"
JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "wdfw_forecasts.json")
USER_AGENT = "Mozilla/5.0 (The-Fish-Report; contact via wdfw.wa.gov)"
FORECAST_YEAR = 2026


def http_get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20, context=SSL_CONTEXT) as res:
        return res.read()


def resolve_index_links(html):
    """Return { 'chinook': href, 'coho': href } for the CURRENT-year PDFs."""
    links = {}
    for m in re.finditer(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.S):
        href, text = m.group(1), m.group(2)
        flat = re.sub(r'<[^>]+>', '', text).replace('&amp;', '&').strip()
        if str(FORECAST_YEAR) not in flat:
            continue  # only current-year items
        if 'coho forecast' in flat.lower() and 'coho' not in links:
            links['coho'] = href
        elif 'chinook forecast' in flat.lower() and 'chinook' not in links:
            links['chinook'] = href
    return links


def extract_pdf_tables(pdf_bytes):
    """
    PyMuPDF table extraction.
    Returns a list of dicts: { 'river': str, 'value': int|None, 'species': str|None }
    """
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    rows = []

    # Known waterbody names (from wdfw_forecasts.json) for fuzzy matching
    WATERBODY_NAMES = [
        "Puyallup River", "Carbon River", "White River", "Green River",
        "Nisqually River", "Skagit River", "Snoqualmie River",
        "Skykomish River", "Snohomish River", "North Fork Stillaguamish River",
        "Cowlitz River", "Toutle River", "Lewis River", "Kalama River",
        "Cedar River",
    ]

    for page in doc:
        # 1) Try PyMuPDF built-in table detection (fitz >= 1.18.0)
        try:
            tabs = page.find_tables()
            for t in tabs:
                for r in t.extract():
                    row_text = ' '.join(str(c) for c in r if c is not None)
                    matched = None
                    for wb in WATERBODY_NAMES:
                        if wb.lower() in row_text.lower():
                            matched = wb
                            break
                    if matched is None:
                        for cell in r:
                            if cell is None:
                                continue
                            cell_str = str(cell)
                            for wb in WATERBODY_NAMES:
                                ratio = difflib.SequenceMatcher(
                                    None, cell_str.lower(), wb.lower()
                                ).ratio()
                                if ratio > 0.6:
                                    matched = wb
                                    break
                            if matched:
                                break
                    if matched:
                        nums = [
                            int(c.replace(',', '')) for c in r if c is not None
                            and re.sub(r'[,\s]', '', str(c)).isdigit()
                        ]
                        value = nums[0] if nums else None
                        rows.append({'river': matched, 'value': value, 'species': None})
        except Exception:
            pass

        # 2) Fallback: page text — find river name + number patterns
        text = page.get_text("text")
        for ln in text.split('\n'):
            ln = ln.strip()
            if not ln:
                continue
            matched = None
            for wb in WATERBODY_NAMES:
                if wb.lower() in ln.lower():
                    matched = wb
                    break
            if matched:
                nums = [
                    int(s.replace(',', '')) for s in re.findall(r'[\d,]+', ln)
                    if re.sub(r'[,\s]', '', s).isdigit()
                ]
                value = nums[0] if nums else None
                if not any(r['river'] == matched for r in rows):
                    rows.append({'river': matched, 'value': value, 'species': None})
                elif rows and rows[-1]['river'] == matched and rows[-1]['value'] is None and value is not None:
                    rows[-1]['value'] = value

    doc.close()
    return rows


def find_candidate(rows, term):
    """Return rows matching a term (case-insensitive river name)."""
    return [r for r in rows if term.lower() in r['river'].lower()]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--confirm', action='store_true',
                    help='write forecasts into wdfw_forecasts.json (only with --chinook/--coho)')
    ap.add_argument('--chinook', type=int, help='HUMAN-CONFIRMED Puyallup Chinook forecast')
    ap.add_argument('--coho', type=int, help='HUMAN-CONFIRMED Puyallup Coho forecast')
    ap.add_argument('--yes', action='store_true',
                    help='double-confirm: acknowledge you are writing HUMAN-VERIFIED numbers')
    args = ap.parse_args()

    print(f'== WDFW {FORECAST_YEAR} forecast resolver ==')
    try:
        html = http_get(INDEX_URL).decode('utf-8', errors='replace')
    except Exception as e:
        print(f'!! Could not fetch index {INDEX_URL}: {e}')
        sys.exit(1)

    links = resolve_index_links(html)
    print('Resolved current-year links:')
    for kind in ('chinook', 'coho'):
        href = links.get(kind)
        if not href:
            print(f'  {kind}: NOT FOUND on index page')
            continue
        full = href if href.startswith('http') else 'https://wdfw.wa.gov' + href
        print(f'  {kind}: {full}')

    # Download + attempt extraction (never writes beyond print).
    for kind in ('chinook', 'coho'):
        href = links.get(kind)
        if not href:
            continue
        full = href if href.startswith('http') else 'https://wdfw.wa.gov' + href
        try:
            pdf = http_get(full, binary=True)
            print(f'\n-- {kind} PDF: {len(pdf)} bytes --')
        except Exception as e:
            print(f'!! {kind} download failed: {e}')
            continue

        try:
            table_rows = extract_pdf_tables(pdf)
        except Exception as e:
            print(f'  PyMuPDF extraction error: {e}')
            print('  Open the PDF manually (link above) and confirm the Puyallup number.')
            continue

        if table_rows:
            print(f'  Extracted {len(table_rows)} table rows via PyMuPDF:')
            for r in table_rows[:15]:
                val_str = f'{r["value"]:,}' if r['value'] is not None else '--'
                print(f'    {r["river"]}: {val_str}')
        else:
            print('  No table rows extracted — check PDF by hand (link above).')

    # Write path: ONLY with explicit human-confirmed numbers AND --yes.
    if args.confirm:
        if not args.yes:
            print('\n!! --confirm requires --yes (safety: write HUMAN-VERIFIED numbers only).')
            print('   Nothing written.')
            sys.exit(1)
        if args.chinook is None and args.coho is None:
            print('\n!! --confirm requires --chinook=NNNN and/or --coho=NNNN (the HUMAN-confirmed numbers).')
            print('   Nothing written.')
            sys.exit(1)
        with open(JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        confirmed = {'Puyallup Chinook': args.chinook, 'Puyallup Coho': args.coho}
        changed = False
        for stock in data['stocks']:
            name = stock['stock']
            if name in confirmed and confirmed[name] is not None:
                href = links.get('chinook' if 'Chinook' in name else 'coho')
                stock['forecast'] = confirmed[name]
                stock['source_url'] = ('https://wdfw.wa.gov' + href) if href and not href.startswith('http') else href
                stock['year'] = FORECAST_YEAR
                changed = True
        with open(JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
            f.write('\n')
        print(f'\nWrote confirmed forecasts to {JSON_PATH}')
        if not changed:
            print('(no matching stock keys were updated)')
    else:
        print('\nNo --confirm: nothing written. "../src/data/wdfw_forecasts.json" stays null (UI "--").')


if __name__ == '__main__':
    main()

