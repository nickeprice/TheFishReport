#!/usr/bin/env python3
"""
Systematic USGS gauge scanner for The Fish Report.
Scans each river basin, finds ALL stream gauges, checks discharge data.
"""
import json, subprocess, sys, time

RIVERS = {
    "puyallup": {
        "bbox": [-122.5, 46.9, -121.7, 47.5],
        "names": ["puyallup", "carbon"]
    },
    "white": {
        "bbox": [-122.3, 47.0, -121.7, 47.5],
        "names": ["white river"]
    },
    "green": {
        "bbox": [-122.3, 47.2, -121.5, 47.6],
        "names": ["green river", "duwamish", "soos", "mill creek"]
    },
    "nisqually": {
        "bbox": [-122.8, 46.9, -122.3, 47.2],
        "names": ["nisqually"]
    },
    "skagit": {
        "bbox": [-122.5, 48.0, -120.5, 49.0],
        "names": ["skagit river"]
    },
    "snoqualmie": {
        "bbox": [-122.3, 47.4, -121.7, 48.0],
        "names": ["snoqualmie", "snohomish", "skykomish", "pilchuck", "stillaguamish"]
    },
    "cowlitz": {
        "bbox": [-122.9, 46.1, -122.0, 46.7],
        "names": ["cowlitz", "toutle", "lewis river", "kalama"]
    },
    "cedar": {
        "bbox": [-122.3, 47.3, -121.5, 47.7],
        "names": ["cedar river"]
    }
}

def curl(url):
    """Run curl and return stdout."""
    result = subprocess.run(["curl", "-s", "--max-time", "20", url],
                          capture_output=True, text=True, timeout=30)
    return result.stdout

def get_sites_in_bbox(bbox):
    """Get all USGS stream sites in bounding box."""
    url = "https://waterservices.usgs.gov/nwis/site/?format=rdb&seriesCatalogOutput=false&bBox=%s,%s,%s,%s&siteStatus=all" % tuple(bbox)
    data = curl(url)
    sites = {}
    for line in data.split('\n'):
        if not line.startswith('USGS'):
            continue
        parts = line.split('\t')
        if len(parts) < 7:
            continue
        site_no = parts[1].strip()
        site_name = parts[2].strip()
        site_type = parts[3].strip()
        lat = parts[4].strip()
        lon = parts[5].strip()
        # Only stream sites
        if site_type == 'ST':
            sites[site_no] = {'name': site_name, 'lat': lat, 'lon': lon, 'has_flow': None}
    return sites

def check_discharge(site_no):
    """Check if site has discharge data."""
    url = ("https://api.waterdata.usgs.gov/ogcapi/v1/collections/continuous/"
           "items?monitoring_location_id=USGS-%s&parameter_code=00060&limit=1" % site_no)
    data = curl(url)
    try:
        d = json.loads(data)
        return d.get('numberReturned', 0) > 0
    except:
        return False

print("=" * 80)
print("SYSTEMATIC USGS GAUGE SCAN - ALL RIVERS")
print("=" * 80)

all_results = {}

for river_key, config in RIVERS.items():
    print("\n\n>>> Scanning %s basin..." % river_key.upper())
    print("    Bounding box: %s" % config["bbox"])
    
    sites = get_sites_in_bbox(config["bbox"])
    print("    Found %d stream sites in basin" % len(sites))
    
    # Filter by river name keywords
    matching = {}
    for sid, info in sites.items():
        name_lower = info['name'].lower()
        for keyword in config["names"]:
            if keyword in name_lower:
                matching[sid] = info
                break
    
    print("    Matching river names: %d sites" % len(matching))
    
    # Check discharge for each
    active = []
    inactive = []
    for sid in sorted(matching.keys()):
        name = matching[sid]['name']
        sys.stdout.write("      %-8s %s..." % (sid, name[:50]))
        sys.stdout.flush()
        has_flow = check_discharge(sid)
        matching[sid]['has_flow'] = has_flow
        if has_flow:
            active.append((sid, name))
            print(" DISCHARGE OK")
        else:
            inactive.append((sid, name))
            print(" NO FLOW")
        time.sleep(0.3)  # Rate limit
    
    all_results[river_key] = {'active': active, 'inactive': inactive, 'all_matching': matching}
    
    print("\n    --- %s RESULTS ---" % river_key.upper())
    print("    ACTIVE (has discharge data):")
    for sid, name in active:
        print("      %s - %s" % (sid, name))
    print("    INACTIVE (no discharge data):")
    for sid, name in inactive:
        print("      %s - %s" % (sid, name))

print("\n\n" + "=" * 80)
print("FINAL SUMMARY - ALL ACTIVE GAUGES")
print("=" * 80)

for river_key, result in all_results.items():
    if result['active']:
        print("\n%s:" % river_key.upper())
        for sid, name in result['active']:
            print("  %s | %s" % (sid, name))