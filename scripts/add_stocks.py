import json, re

with open('public/src/data/regions/washington.js', 'r') as f:
    c = f.read()

m = re.search(r'window\.REGIONS\.WA\s*=\s*(\{.*\});', c, re.DOTALL)
d = json.loads(m.group(1))

stock_data = {
    'carbon': [
        {"species": "Chinook", "peak_window": [8, 15, 9, 30], "peak_date": "09-10", "avg_run": 5000, "present": True},
        {"species": "Coho", "peak_window": [9, 1, 10, 31], "peak_date": "10-01", "avg_run": 15000, "present": True},
        {"species": "Pink", "peak_window": [8, 1, 9, 30], "peak_date": "09-01", "avg_run": 30000, "present": False},
        {"species": "Steelhead", "peak_window": [12, 1, 2, 28], "peak_date": "01-15", "avg_run": 2000, "present": True}
    ],
    'white': [
        {"species": "Chinook", "peak_window": [8, 15, 9, 30], "peak_date": "09-15", "avg_run": 8000, "present": True},
        {"species": "Coho", "peak_window": [9, 1, 10, 31], "peak_date": "10-01", "avg_run": 12000, "present": True},
        {"species": "Pink", "peak_window": [8, 1, 9, 15], "peak_date": "08-20", "avg_run": 40000, "present": False},
        {"species": "Steelhead", "peak_window": [12, 1, 2, 28], "peak_date": "01-15", "avg_run": 3000, "present": True}
    ],
    'green': [
        {"species": "Chinook", "peak_window": [9, 1, 10, 31], "peak_date": "10-01", "avg_run": 12000, "present": True},
        {"species": "Coho", "peak_window": [10, 1, 11, 30], "peak_date": "11-01", "avg_run": 20000, "present": True},
        {"species": "Steelhead", "peak_window": [12, 1, 3, 15], "peak_date": "01-15", "avg_run": 4000, "present": True}
    ],
    'nisqually': [
        {"species": "Chinook", "peak_window": [9, 1, 9, 30], "peak_date": "09-15", "avg_run": 8000, "present": True},
        {"species": "Coho", "peak_window": [9, 15, 10, 31], "peak_date": "10-15", "avg_run": 15000, "present": True},
        {"species": "Chum", "peak_window": [11, 1, 12, 31], "peak_date": "12-01", "avg_run": 25000, "present": True},
        {"species": "Pink", "peak_window": [8, 1, 9, 30], "peak_date": "09-01", "avg_run": 30000, "present": False}
    ],
    'skagit': [
        {"species": "Chinook", "peak_window": [7, 1, 9, 30], "peak_date": "08-15", "avg_run": 30000, "present": True},
        {"species": "Coho", "peak_window": [9, 1, 11, 30], "peak_date": "10-15", "avg_run": 40000, "present": True},
        {"species": "Pink", "peak_window": [8, 1, 9, 15], "peak_date": "08-20", "avg_run": 100000, "present": False},
        {"species": "Chum", "peak_window": [10, 1, 12, 15], "peak_date": "11-15", "avg_run": 20000, "present": True}
    ],
    'snoqualmie': [
        {"species": "Chinook", "peak_window": [9, 1, 10, 31], "peak_date": "10-01", "avg_run": 15000, "present": True},
        {"species": "Coho", "peak_window": [10, 1, 11, 30], "peak_date": "11-01", "avg_run": 25000, "present": True},
        {"species": "Pink", "peak_window": [8, 1, 9, 15], "peak_date": "09-01", "avg_run": 50000, "present": False},
        {"species": "Steelhead", "peak_window": [12, 1, 2, 28], "peak_date": "01-15", "avg_run": 3000, "present": True}
    ],
    'skykomish': [
        {"species": "Chinook", "peak_window": [9, 1, 10, 31], "peak_date": "10-01", "avg_run": 10000, "present": True},
        {"species": "Coho", "peak_window": [10, 1, 11, 30], "peak_date": "11-01", "avg_run": 15000, "present": True},
        {"species": "Steelhead", "peak_window": [12, 1, 2, 28], "peak_date": "01-15", "avg_run": 2000, "present": True}
    ],
    'snohomish': [
        {"species": "Chinook", "peak_window": [9, 1, 10, 31], "peak_date": "10-01", "avg_run": 20000, "present": True},
        {"species": "Coho", "peak_window": [10, 1, 11, 30], "peak_date": "11-01", "avg_run": 30000, "present": True},
        {"species": "Steelhead", "peak_window": [12, 1, 2, 28], "peak_date": "01-15", "avg_run": 4000, "present": True}
    ],
    'stillaguamish': [
        {"species": "Chinook", "peak_window": [9, 1, 10, 31], "peak_date": "10-01", "avg_run": 8000, "present": True},
        {"species": "Coho", "peak_window": [10, 1, 11, 30], "peak_date": "11-01", "avg_run": 15000, "present": True},
        {"species": "Chum", "peak_window": [11, 1, 12, 31], "peak_date": "12-01", "avg_run": 10000, "present": True}
    ],
    'cowlitz': [
        {"species": "Spring Chinook", "peak_window": [4, 1, 5, 31], "peak_date": "05-01", "avg_run": 15000, "present": True},
        {"species": "Fall Chinook", "peak_window": [9, 1, 10, 31], "peak_date": "10-01", "avg_run": 25000, "present": True},
        {"species": "Coho", "peak_window": [10, 1, 11, 30], "peak_date": "11-01", "avg_run": 20000, "present": True},
        {"species": "Winter Steelhead", "peak_window": [12, 1, 3, 31], "peak_date": "02-01", "avg_run": 8000, "present": True}
    ],
    'duwamish': [
        {"species": "Chinook", "peak_window": [9, 1, 10, 31], "peak_date": "10-01", "avg_run": 5000, "present": True},
        {"species": "Coho", "peak_window": [10, 1, 11, 30], "peak_date": "11-01", "avg_run": 8000, "present": True}
    ]
}

for wb in d['waterbodies']:
    if wb['id'] in stock_data:
        wb['stocks'] = stock_data[wb['id']]

new_json = json.dumps(d, indent=4)
new_c = re.sub(r'window\.REGIONS\.WA\s*=\s*(\{.*\});', 'window.REGIONS.WA = ' + new_json + ';', c, count=1, flags=re.DOTALL)
with open('public/src/data/regions/washington.js', 'w') as f:
    f.write(new_c)
print('Stocks added to %d waterbodies' % len(stock_data))
print('Total with stocks: %d' % sum(1 for wb in d['waterbodies'] if wb.get('stocks')))