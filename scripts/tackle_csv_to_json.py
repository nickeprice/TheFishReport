#!/usr/bin/env python3
"""Convert docs/tackle_measurements.csv -> src/data/tackle.json.

The CSV is the SOURCE OF TRUTH for measured tackle properties (see
docs/CONTRACT_TACKLE.md for how to measure each field). This script is the only writer
of src/data/tackle.json, so the two can never silently drift apart.

The Gear Sim currently runs on unitless calibration constants (lift = 0.90,
DRAG_REF = 7.5); this file is how real grams / mm / cm2 get in.

Zero dependencies (stdlib only). Output is deterministic — sorted by id, no timestamp —
so re-running with unchanged input produces a byte-identical file.

Usage:
    python3 scripts/tackle_csv_to_json.py            # validate + write
    python3 scripts/tackle_csv_to_json.py --check    # validate only, write nothing
    python3 scripts/tackle_csv_to_json.py --water-density 0.9986
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "docs" / "tackle_measurements.csv"
JSON_PATH = ROOT / "src" / "data" / "tackle.json"

COLUMNS = [
    "id", "type", "label", "brand", "material", "lb_test", "diameter_mm",
    "mass_g", "buoyancy_g", "density_g_cm3", "area_cm2", "shape", "cd",
    "gap_width_mm", "wire_diameter_mm", "buoyancy_per_inch_g",
    "sample_length_mm", "notes",
]

TYPES = {"foam", "line", "bead", "hook", "yarn", "weight"}
# Geometric shapes only. A rubber sleeve on a weight is a LABEL/variant, not a
# shape, so `shape` stays the bare geometry and the variant lives in `label`.
SHAPES = {"sphere", "cylinder", "plate", "other", "egg", "slinky", "pencil", "barrel",
          "teardrop", "cannonball"}
TEXT_COLS = ("brand", "material", "shape", "notes")

# Weight rows only: the UI picks a weight as (shape_label, oz) so it can offer the
# metal and the rubber sleeve as one option without a `variant` column. The metal
# and the sleeve live in `label`, so strip the trailing " 1/4 oz" back off it.
OZ_SUFFIX = re.compile(r"\s+\d+(?:/\d+)?\s+oz$")

# What each type must have before it can drive real physics.
REQUIRED = {
    # foam: drag area comes from diameter_mm (sphere) OR area_cm2 (egg/cheater),
    # so area_cm2 is the field that always applies.
    "foam": ("mass_g", "buoyancy_g", "area_cm2"),
    "bead": ("mass_g", "buoyancy_g", "diameter_mm"),
    "line": ("diameter_mm",),
    "hook": ("mass_g",),
    "yarn": ("buoyancy_per_inch_g", "area_cm2", "cd"),
    # weight: mass pins the sink/hold side, area_cm2 the drag side. Mass is
    # currently derived from the oz label; area still needs measuring.
    "weight": ("mass_g", "area_cm2"),
}


def parse_number(raw: str, col: str, line_no: int, errors: list):
    text = (raw or "").strip()
    if text == "":
        return None
    try:
        return float(text)
    except ValueError:
        errors.append(f"line {line_no}: {col} = {text!r} is not a number")
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--water-density", type=float, default=0.9986,
                    help="g/cm3, used to derive volume from buoyancy (default 0.9986)")
    ap.add_argument("--check", action="store_true", help="validate only; write nothing")
    args = ap.parse_args()

    if not CSV_PATH.exists():
        print(f"missing {CSV_PATH}", file=sys.stderr)
        return 1

    raw_rows = list(csv.reader(CSV_PATH.read_text(encoding="utf-8").splitlines()))
    rows = [r for r in raw_rows
            if r and any(c.strip() for c in r) and not r[0].lstrip().startswith("#")]
    if not rows:
        print("CSV has no rows", file=sys.stderr)
        return 1

    header, body = rows[0], rows[1:]
    if header != COLUMNS:
        print("CSV header does not match the expected schema.", file=sys.stderr)
        print("  expected: " + ",".join(COLUMNS), file=sys.stderr)
        print("  found:    " + ",".join(header), file=sys.stderr)
        return 1

    errors: list = []
    items: list = []
    seen: set = set()
    incomplete: list = []

    for line_no, row in enumerate(body, start=2):
        if len(row) > len(COLUMNS):
            errors.append(f"line {line_no}: {len(row)} fields, expected at most {len(COLUMNS)}")
            continue
        row = row + [""] * (len(COLUMNS) - len(row))          # tolerate trailing blanks
        cells = {c: row[i].strip() for i, c in enumerate(COLUMNS)}

        item_id = cells["id"]
        if not item_id:
            errors.append(f"line {line_no}: blank id")
            continue
        if item_id in seen:
            errors.append(f"line {line_no}: duplicate id {item_id!r}")
            continue
        seen.add(item_id)
        if cells["type"] not in TYPES:
            errors.append(f"line {line_no}: type {cells['type']!r} not one of {sorted(TYPES)}")
            continue
        if cells["shape"] and cells["shape"] not in SHAPES:
            errors.append(f"line {line_no}: shape {cells['shape']!r} not one of {sorted(SHAPES)}")
            continue

        item: dict = {"id": item_id, "type": cells["type"]}
        if cells["label"]:
            item["label"] = cells["label"]
        for col in COLUMNS[3:]:
            if col in TEXT_COLS:
                if cells[col]:
                    item[col] = cells[col]
            else:
                value = parse_number(cells[col], col, line_no, errors)
                if value is not None:
                    item[col] = value

        # Derived from the Archimedes pair: volume from displaced water, then density.
        if item.get("buoyancy_g") is not None:
            item["volume_cm3"] = round(item["buoyancy_g"] / args.water_density, 4)
            if item.get("mass_g") is not None and item["volume_cm3"]:
                item["density_g_cm3"] = round(item["mass_g"] / item["volume_cm3"], 4)

        # Weights: emit the picker option label (metal + shape + sleeve, no oz) so a
        # UI can pair it with the oz value. Falls back to the full label if a row's
        # label does not end in "NN oz" rather than emitting something empty.
        if item["type"] == "weight":
            label = item.get("label", "")
            item["shape_label"] = OZ_SUFFIX.sub("", label).strip() or label

        absent = [c for c in REQUIRED[cells["type"]] if c not in item]
        if absent:
            incomplete.append(f"{item_id} (missing {', '.join(absent)})")
        items.append(item)

    if errors:
        print("FAILED - bad rows:", file=sys.stderr)
        for err in errors:
            print("  " + err, file=sys.stderr)
        return 1

    items.sort(key=lambda i: i["id"])
    payload = {
        "source": "docs/tackle_measurements.csv",
        "water_density_g_cm3": args.water_density,
        "items": items,
    }

    verb = "checked" if args.check else "wrote"
    target = "" if args.check else f" -> {JSON_PATH.relative_to(ROOT)}"
    print(f"{verb} {len(items)} item(s){target}")
    if incomplete:
        print(f"  {len(incomplete)} still incomplete (no physics yet):")
        for entry in incomplete:
            print("    - " + entry)

    if not args.check:
        JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
        JSON_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
