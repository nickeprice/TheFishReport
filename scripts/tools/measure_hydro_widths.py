#!/usr/bin/env python3
"""Run DEM width measurements on HydroRIVERS centerline points."""
import sys, json, os, time
sys.path.insert(0, 'scripts/tools')
from width_elevation import measure_width_elevation
from concurrent.futures import ThreadPoolExecutor

IN_DIR = 'data/hydro_centerlines'
OUT_DIR = 'data/hydro_measured'
os.makedirs(OUT_DIR, exist_ok=True)

executor = ThreadPoolExecutor(8)

def meas(lat, lon):
    r = measure_width_elevation(lat, lon, half_m=250.0)
    if r is None:
        return {'wetted_ft': None, 'bankfull_ft': None,
                'thalweg_m': None, 'truncated': True}
    widths = r.get('widths_ft', {})
    return {
        'wetted_ft': round(r.get('width_ft') or 0, 1) or None,
        'bankfull_ft': round(widths.get(3.0, 0), 1) or None,
        'thalweg_m': r.get('thalweg_m'),
        'truncated': r.get('truncated', True)
    }

rivers = sorted(f.replace('.json', '') for f in os.listdir(IN_DIR) if f.endswith('.json'))
done_count = len([f for f in os.listdir(OUT_DIR) if f.endswith('.json')])
print(f'{len(rivers)} rivers, {done_count} already done')

for rid in rivers:
    out_path = os.path.join(OUT_DIR, f'{rid}.json')
    if os.path.isfile(out_path):
        print(f'{rid}: exists, skip')
        continue
    with open(os.path.join(IN_DIR, f'{rid}.json')) as f:
        data = json.load(f)
    pts = data.get('points', [])
    print(f'{rid}: {len(pts)} pts...', end=' ', flush=True)
    t0 = time.time()
    for i in range(0, len(pts), 8):
        batch = pts[i:i+8]
        futures = [executor.submit(meas, p['lat'], p['lon']) for p in batch]
        for j, f in enumerate(futures):
            try:
                pts[i+j].update(f.result(timeout=60))
            except Exception:
                pts[i+j]['truncated'] = True
        if (i + 8) % 200 == 0 or i + 8 >= len(pts):
            done = min(i + 8, len(pts))
            rate = done / (time.time() - t0) if time.time() > t0 else 0
            eta = (len(pts) - done) / rate if rate > 0 else 0
            print(f'{done}/{len(pts)} ({rate:.0f}/s, ETA {eta:.0f}s)', end=' ', flush=True)
    good = sum(1 for p in pts if p.get('wetted_ft') and p['wetted_ft'] > 0)
    fail = len(pts) - good
    print(f'DONE: {good} good, {fail} fail ({time.time()-t0:.0f}s)')
    with open(out_path, 'w') as f:
        json.dump(data, f)