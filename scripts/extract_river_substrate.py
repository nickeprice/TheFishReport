#!/usr/bin/env python3
"""
extract_river_substrate.py — Extract substrate from HydroATLAS for 5 PNW rivers.
Usage: python3 scripts/extract_river_substrate.py
Requires GDAL >= 3.5 (ogr2ogr). Reads HydroRIVERS_v10_na.gdb + RiverATLAS_Data_v10.gdb.
Output: src/data/river_substrate.js
"""
import json, os, subprocess, sys, tempfile, glob

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TEXT_D50 = {"clay":0.002,"silt":0.008,"sand":0.25,"loam":0.025,
            "sandy_loam":0.06,"loamy_sand":0.12,"gravel":10.0,"cobble":100.0,"boulder":500.0}
D50DEF = 10.0
def z0(d): return 0.033 * 2.5 * d / 1000.0

def find_ogr():
    try:
        subprocess.run(["ogr2ogr","--version"],capture_output=True,check=True)
        return "ogr2ogr"
    except: pass
    for p in ["/opt/homebrew/opt/gdal/bin/ogr2ogr","/usr/local/bin/ogr2ogr","/usr/bin/ogr2ogr"]:
        if glob.glob(p): return glob.glob(p)[0]
    sys.exit("ogr2ogr not found. brew install gdal")

def ogr2json(path, sql, spat=None):
    ogr = find_ogr()
    with tempfile.NamedTemporaryFile(suffix=".json",delete=False) as tmp:
        fp = tmp.name
    os.unlink(fp)  # remove so ogr2ogr can create it (no overwrite)
    cmd = [ogr,"-f","GeoJSON",fp,path,"-sql",sql]
    if spat:
        cmd += ["-spat"] + [str(x) for x in spat]
    subprocess.run(cmd,capture_output=True,check=True,timeout=300)
    with open(fp) as f: return json.load(f)

def tex_class(clay,silt,sand):
    if clay is None or silt is None or sand is None: return "gravel"
    if sand >= 85: return "sand"
    if clay >= 40 and silt < 40: return "clay"
    if silt >= 80: return "silt"
    return "loam"

# 5 core PNW rivers + 10 expanded rivers with gauge coordinates + 5km search radius
RUNS = [
    ("puyallup","Puyallup",47.19,-122.29,0.05),
    ("white","White",47.31,-122.18,0.05),
    ("carbon","Carbon",47.20,-122.31,0.05),
    ("green","Green",47.43,-122.28,0.05),
    ("nisqually","Nisqually",47.07,-122.70,0.05),
    ("snoqualmie","Snoqualmie",47.52,-121.84,0.05),
    ("skykomish","Skykomish",47.81,-121.56,0.05),
    ("snohomish","Snohomish",47.86,-122.00,0.05),
    ("skagit","Skagit",48.42,-122.33,0.05),
    ("cedar","Cedar",47.49,-122.20,0.05),
    ("cowlitz","Cowlitz",46.32,-122.84,0.05),
    ("stillaguamish","Stillaguamish",48.24,-122.12,0.05),
    ("duwamish","Duwamish",47.53,-122.28,0.05),
    ("puyallup_upper","Puyallup",46.96,-122.14,0.05),
    ("white_lower","White",47.27,-122.22,0.05),
]

def main():
    # Find HydroRIVERS
    hyd = None
    for p in [os.path.join(REPO,"HydroRIVERS_v10_na.gdb"),
              "/Users/nprice/Downloads/HydroRIVERS_v10_na.gdb/HydroRIVERS_v10_na.gdb",
              "/Users/nprice/Downloads/HydroRIVERS_v10_na.gdb"]:
        if os.path.isdir(p): hyd = p; break
    if not hyd: sys.exit("ERROR: HydroRIVERS_v10_na.gdb not found")

    # Find RiverATLAS
    atl = None
    for p in [os.path.join(REPO,"RiverATLAS_Data_v10.gdb"),
              "/Users/nprice/Downloads/RiverATLAS_Data_v10.gdb/RiverATLAS_v10.gdb",
              "/Users/nprice/Downloads/RiverATLAS_Data_v10.gdb"]:
        if os.path.isdir(p) or "RiverATLAS_v10" in str(p): atl = p; break
        inner = os.path.join(p,"RiverATLAS_v10.gdb")
        if os.path.isdir(inner): atl = inner; break
    if not atl: sys.exit("ERROR: RiverATLAS not found")

    out = {"rivers": {}}
    for key,name,glat,glon,buf in RUNS:
        try:
            # Spatial query HydroRIVERS for reaches near this gauge
            sql1 = "SELECT HYRIV_ID FROM HydroRIVERS_v10_na WHERE SHAPE_Length > 0"
            dt1 = ogr2json(hyd,sql1,spat=[glon-buf,glat-buf,glon+buf,glat+buf])
            ids = list({f["properties"]["HYRIV_ID"] for f in dt1.get("features",[])
                        if f.get("properties",{}).get("HYRIV_ID")})
            if not ids:
                print("%s: 0 reaches" % name)
                out["rivers"][key] = {"river":name,"n_points":0,"points":[]}
                continue

            # Query RiverATLAS for these IDs
            id_list = ",".join(str(i) for i in ids)
            sql2 = ("SELECT HYRIV_ID,cly_pc_cav,slt_pc_cav,snd_pc_cav,lit_cl_cmj "
                    "FROM RiverATLAS_v10 WHERE HYRIV_ID IN (%s)" % id_list)
            dt2 = ogr2json(atl,sql2)
            atlas = {f["properties"]["HYRIV_ID"]:f["properties"]
                     for f in dt2.get("features",[]) if f.get("properties",{}).get("HYRIV_ID")}

            # Build points from HydroRIVERS geometry + RiverATLAS attributes
            pts = []
            for f in dt1.get("features",[]):
                p = f.get("properties",{})
                hid = p.get("HYRIV_ID")
                if hid is None: continue
                a = atlas.get(hid,{})
                c = f.get("geometry",{}).get("coordinates",[[[-122,47]]])
                try: lon,lat = c[0][len(c[0])//2]
                except: continue
                cly = a.get("cly_pc_cav")
                slt = a.get("slt_pc_cav")
                snd = a.get("snd_pc_cav")
                tex = tex_class(cly,slt,snd)
                d_mm = TEXT_D50.get(tex,D50DEF)
                pts.append({"lat":round(lat,6),"lon":round(lon,6),
                            "d50_mm":d_mm,"z0_m":round(z0(d_mm),6),"texture":tex})
            out["rivers"][key] = {"river":name,"n_points":len(pts),"points":pts}
            print("%s: %d reaches" % (name,len(pts)))
        except Exception as e:
            print("ERROR %s: %s" % (name,e))
            out["rivers"][key] = {"river":name,"n_points":0,"points":[]}

    with open(os.path.join(REPO,"src/data/river_substrate.js"),"w") as f:
        f.write("// GENERATED by scripts/extract_river_substrate.py\n// DO NOT EDIT\n"
                "window.RIVER_SUBSTRATE = " + json.dumps(out,indent=2) + ";\n")
    n = sum(r["n_points"] for r in out["rivers"].values())
    print("Done: %d total points -> src/data/river_substrate.js" % n)

if __name__ == "__main__":
    main()