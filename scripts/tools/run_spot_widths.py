#!/usr/bin/env python3
"""
run_spot_widths.py — Batch runner for precompute_spot_widths.py.

Processes rivers one at a time with retry + cooldown.
Saves per-river JSON to data/spot_widths/{id}.json for resume support.
Merges completed rivers into public/src/data/spot_widths.js at the end.

Usage:
    python3 scripts/tools/run_spot_widths.py                    # all rivers
    python3 scripts/tools/run_spot_widths.py --rivers white,carbon
    python3 scripts/tools/run_spot_widths.py --resume
    python3 scripts/tools/run_spot_widths.py --merge-only
"""

import json, os, subprocess, sys, time

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(REPO, "data", "spot_widths")
OUTPUT_JS = os.path.join(REPO, "public", "src", "data", "spot_widths.js")
RIVER_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "precompute_spot_widths.py")
MAX_RETRIES = 3
RETRY_COOLDOWN_S = 15

RIVERS = [
    {"id":"puyallup","name":"Puyallup River"},
    {"id":"white","name":"White River"},
    {"id":"carbon","name":"Carbon River"},
    {"id":"green","name":"Green River"},
    {"id":"nisqually","name":"Nisqually River"},
    {"id":"snoqualmie","name":"Snoqualmie River"},
    {"id":"skykomish","name":"Skykomish River"},
    {"id":"snohomish","name":"Snohomish River"},
    {"id":"skagit","name":"Skagit River"},
    {"id":"cedar","name":"Cedar River"},
    {"id":"cowlitz","name":"Cowlitz River"},
    {"id":"stillaguamish","name":"Stillaguamish River"},
    {"id":"duwamish","name":"Duwamish River"},
    {"id":"puyallup_upper","name":"Puyallup River (upper)"},
    {"id":"white_lower","name":"White River (lower)"},
]


def load_progress():
    os.makedirs(OUT_DIR, exist_ok=True)
    done = {}
    for f in os.listdir(OUT_DIR):
        if f.endswith(".json"):
            rid = f[:-5]
            try:
                with open(os.path.join(OUT_DIR, f)) as fp:
                    data = json.load(fp)
                pts = data.get("points", [])
                if pts:
                    good = sum(1 for p in pts if p.get("wetted_ft", 0) > 0)
                    done[rid] = good
            except Exception:
                pass
def run_river(rid):
    result = subprocess.run(
        [sys.executable, RIVER_SCRIPT, "--rivers", rid, "--json-out", OUT_DIR],
        capture_output=True, text=True, timeout=1800
    )
    if result.returncode == 0:
        fp = os.path.join(OUT_DIR, f"{rid}.json")
        if os.path.isfile(fp):
            try:
                with open(fp) as f:
                    d = json.load(f)
                n = len(d.get("points", []))
                good = sum(1 for p in d.get("points", []) if p.get("wetted_ft", 0) > 0)
                print(f"  {rid}: {n} points ({good} good)")
                return True
            except Exception:
                pass
    if result.returncode != 0:
        print(f"  return code {result.returncode}")
        err = result.stderr[-500:] if result.stderr else "(no stderr)"
        print(f"  stderr: {err}")
    return False


def merge_all():
    progress = load_progress()
    if not progress:
        print("No per-river data files found.")
        return False
    sys.path.insert(0, os.path.dirname(RIVER_SCRIPT))
    import precompute_spot_widths as psw
    rivers_data = []
    for rid in sorted(progress):
        fp = os.path.join(OUT_DIR, f"{rid}.json")
        with open(fp) as f:
            rivers_data.append(json.load(f))
    js = psw.render_js(rivers_data)
    with open(OUTPUT_JS, "w", encoding="utf-8") as fh:
        fh.write(js)
    total_pts = sum(len(rd.get("points", [])) for rd in rivers_data)
    print(f"\nMerged -> {OUTPUT_JS}")
    print(f"  {len(rivers_data)} rivers, {total_pts} points")
    print(f"\n{'River':<20} {'Points':>8} {'Failed':>8}")
    print("-" * 40)
    for rd in rivers_data:
        pts = rd.get("points", [])
        n_good = sum(1 for p in pts if p.get("wetted_ft", 0) > 0)
        n_fail = len(pts) - n_good
        print(f"{rd['id']:<20} {n_good:>8} {n_fail:>8}")
    return True


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rivers", help="Comma-separated river ids")
    ap.add_argument("--resume", action="store_true",
                    help="Skip already-completed rivers")
    ap.add_argument("--merge-only", action="store_true",
                    help="Merge only, skip measurements")
    args = ap.parse_args()
    selected = [r for r in RIVERS
                if not args.rivers or r["id"] in args.rivers.split(",")]
    if not selected:
        print("No matching rivers.", file=sys.stderr)
        return 1
    if args.merge_only:
        merge_all()
        return 0
    progress = load_progress()
    os.makedirs(OUT_DIR, exist_ok=True)
    for i, river in enumerate(selected):
        rid = river["id"]
        if args.resume and rid in progress:
            print(f"[{i+1}/{len(selected)}] {rid:<15}  done ({progress[rid]} pts)")
            continue
        if i > 0:
            print("  cooling 10s...")
            time.sleep(10)
        success = False
        for attempt in range(1, MAX_RETRIES + 1):
            print(f"[{i+1}/{len(selected)}] {rid:<15} attempt {attempt}/{MAX_RETRIES}...")
            success = run_river(rid)
            if success:
                break
            if attempt < MAX_RETRIES:
                print(f"  retry in {RETRY_COOLDOWN_S}s...")
                time.sleep(RETRY_COOLDOWN_S)
        if not success:
            print(f"  Skipped {rid} after {MAX_RETRIES} attempts.")
    print()
    merge_all()
    return 0


if __name__ == "__main__":
    sys.exit(main())
