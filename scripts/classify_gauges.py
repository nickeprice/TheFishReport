#!/usr/bin/env python3
"""Classify gauges as permanent or seasonal based on NWIS reading counts."""
import subprocess, json

GAUGES = {
    "12101500":"Puyallup at Puyallup","12093500":"Puyallup near Orting","12096500":"Puyallup at Alderton",
    "12101470":"Puyallup at 5th St Bridge","12096505":"Puyallup at E Main Bridge","12092000":"Puyallup near Electron",
    "12094000":"Carbon near Fairfax","12097850":"White below Clearwater","12100490":"White at R Street",
    "12113000":"Green near Auburn","12108800":"Green below Crisp Creek","12113150":"Green above 277th St",
    "12113310":"Green below Meeker St","12113340":"Green at 212 St","12113350":"Green at Tukwila",
    "12113390":"Duwamish at Tukwila","12112600":"Big Soos Creek","12113347":"Mill Creek",
    "12089500":"Nisqually at McKenna","12200500":"Skagit near Mt Vernon","12194000":"Skagit near Concrete",
    "12144500":"Snoqualmie near Snoqualmie","12149000":"Snoqualmie near Carnation","12134500":"Skykomish at Gold Bar",
    "12150800":"Snohomish near Monroe","12167000":"NF Stillaguamish","14243000":"Cowlitz at Castle Rock",
    "14238000":"Cowlitz below Mayfield Dam","14233500":"Cowlitz near Kosmos","14240525":"NF Toutle below SRS",
    "12119000":"Cedar at Renton","12115000":"Cedar near Cedar Falls"
}

def get_count(sid):
    r = subprocess.run(["curl","-s","--max-time","8",
        "https://waterservices.usgs.gov/nwis/site/?format=rdb&seriesCatalogOutput=true&site=%s&siteStatus=all" % sid],
        capture_output=True, text=True)
    for line in r.stdout.split("\n"):
        parts = line.split("\t")
        if len(parts) > 23 and parts[12] == "uv" and parts[13] == "00060":
            return int(parts[23])
    return 0

results = {}
for sid, name in GAUGES.items():
    count = get_count(sid)
    gtype = "seasonal" if count < 8000 else "permanent"
    results[sid] = {"name": name, "count": count, "type": gtype}
    status = "SEASONAL" if gtype == "seasonal" else "PERMANENT"
    print("%-10s %5d %s  %s" % (sid, count, status, name[:55]))

print("\n\n=== CLASSIFICATION ===")
print("SEASONAL (< 8000 readings, set gauge_type='seasonal'):")
for sid, info in sorted(results.items()):
    if info["type"] == "seasonal":
        print("  %s | %s" % (sid, info["name"]))
print("\nPERMANENT (>= 8000 readings, gauge_type='permanent'):")
for sid, info in sorted(results.items()):
    if info["type"] == "permanent":
        print("  %s | %s" % (sid, info["name"]))