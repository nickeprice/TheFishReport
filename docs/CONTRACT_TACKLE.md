# Contract — Tackle Spec (measured, not guessed)

**Status:** TEMPLATE — fill in the values. The Gear Sim currently runs on unitless
calibration constants (`lift = 0.90`, `DRAG_REF = 7.5`, `hookSink = 0.35`). This file
replaces those with real grams, millimetres and cm² so the drag equation
`F = ½·ρ·C_d·A·v²` gets real numbers in it.

The whole thing rests on **one setup (Archimedes)** — weigh the item in air, then weigh it
submerged. That pair gives you mass, buoyancy, volume and density all at once. Everything
else is a diameter/area reading or a standard value.

Units throughout: **grams, millimetres, cm²** (no ounces or feet).

---

## Equipment (~$30)

- Digital scale, **0.01 g** (0.001 g if possible) — mass + buoyancy
- Digital **calipers** — diameters
- A smooth **rod** (drill-bit shank) — the line "wrap-and-divide"
- A **cup of water + a stand + thin mono** — the Archimedes rig
- (optional) graph paper + phone camera — projected area of irregular items
- (optional) a 4–6 ft clear tube + slow-mo — line drag-coefficient drop test

---

## Cheat sheet — how to measure each field

### The one Archimedes setup (mass + buoyancy + volume + density)

1. Cup of water **on the scale** → **tare to 0.00 g**.
2. Suspend the item on a **thin thread** from a stand, lower until **fully submerged,
   touching nothing** (not the walls, not the bottom).
3. The scale now reads **buoyancy in gram-force, directly** — for floating *and* sinking
   items, no sign juggling. A floating corky reads *more* than its own mass; that's correct.

Then:

| You want | Formula | Notes |
|---|---|---|
| **Mass `m`** | weigh dry (tared, average 3×) | 0.01 g scale |
| **Buoyancy `B`** | scale reading above | **no bubbles** — tap the thread; corky/yarn trap air |
| **Volume `V`** | `V = B / ρ_water` | ≈ `B` in cm³ if water ≈ 1 g/cm³ |
| **Density `ρ`** | `ρ = m / V` | `>1` sinks, `<1` floats — the number the model is missing |

> **Water temp:** buoyancy shifts ~0.2% across the fishing range — record the temp, don't
> bother correcting unless you're chasing <1%.

### Per-parameter quick reference

| Field | Tool | How | Gotcha |
|---|---|---|---|
| `mass_g` | scale | weigh dry | average tiny hooks (they swing ±0.02 g) |
| `buoyancy_g` | Archimedes | read directly | dislodge bubbles; for yarn measure **dry AND saturated** |
| `diameter_mm` (line) | calipers + rod | **wrap 30–50 tight turns**, measure width, subtract rod, ÷ turns | a micrometer *crushes* nylon → reads low; low tension (nylon stretches) |
| `diameter_mm` (bead/foam) | calipers | direct, 2 axes, average | not perfect spheres |
| `density_g_cm3` | derived | `m/V` | distinguishes fluoro (≈1.78) vs mono (≈1.15) vs braid (≤1.0) |
| `projected_area_cm2` | graph paper + photo | silhouette → count squares | for spheres skip it: `A = π(d/2)²` |
| `cd` | standard | sphere ≈ 0.47, flat plate ≈ 1.1 | **line `cd` is NOT a static measurement** — see below |
| hook `gap_width_mm`, `wire_diameter_mm` | calipers | direct | drag is a small correction |
| yarn `buoyancy_per_inch_g` | Archimedes | measure a known length (e.g. 10"), ÷ length | measure **after 5 min soak** — that's the honest in-river value |

### Drag coefficient of line — don't hand-measure it

Static specs give you everything *except* the line's `cd`. Get it two ways:

1. **Drop test:** known sinker (buoyancy-corrected) + known line length dropped down a
   4–6 ft clear tube, filmed in slow-mo → terminal velocity → back out the line's drag.
2. **Field validation (more important):** measure your *real* presentation height across a
   few flows (ruler, or a depth logger at the tag end) and fit the model to reality.

---

## Where the values live

Values go in **`docs/tackle_measurements.csv`** — one row per item, header row on top. Open
it in Numbers, Excel or Google Sheets: you get typed columns for free, and the sheet can
compute the derived fields for you. The CSV is the **single source of truth**;
`src/data/tackle.json` is generated from it and is never hand-edited. One source, so the two
cannot drift.

### Columns

| Column | Unit | Applies to | Notes |
|---|---|---|---|
| `id` | — | all | unique slug, e.g. `corky-10` (the stable key) |
| `type` | — | all | `foam` \| `line` \| `bead` \| `hook` \| `yarn` |
| `label` | — | all | display name |
| `material` | — | line, bead | line: `mono`/`copoly`/`fluoro`/`braid`; bead: `hard`/`soft` |
| `lb_test` | lb | line | |
| `diameter_mm` | mm | line, bead, foam | line: wrap-and-divide |
| `mass_g` | g | all | |
| `buoyancy_g` | g-force | all | straight off the Archimedes rig |
| `density_g_cm3` | g/cm³ | all | **derived** when blank (`mass / volume`) |
| `area_cm2` | cm² | foam, bead | spheres: `π(d/2)²` |
| `shape` | — | foam, bead | `sphere` (drives the standard `cd`) |
| `cd` | — | foam, bead | `0.47` for spheres; flat plate ≈ 1.1 |
| `gap_width_mm` | mm | hook | |
| `wire_diameter_mm` | mm | hook | |
| `buoyancy_per_inch_g` | g/in | yarn | 10 in saturated ÷ 10 |
| `notes` | — | all | free text — avoid commas, or wrap the cell in quotes |

Leave a cell **blank** when it does not apply, and blank when you have not measured it yet.
Blank means "unknown", which is honest. Never type a guess.

### Generate the JSON

```bash
python3 scripts/tackle_csv_to_json.py            # validate + write src/data/tackle.json
python3 scripts/tackle_csv_to_json.py --check    # validate only, write nothing
```

The converter derives `volume_cm3` and `density_g_cm3` from `mass_g` + `buoyancy_g`, fails
loudly on a malformed row (a miscounted comma is caught, never silently shifted), and lists
which items are still incomplete — so it doubles as the progress tracker.

---

## Minimum viable set (80/20 — do this first)

Measure **mass + buoyancy** for every item, plus **diameter** for line/bead/foam. Density and
volume are derived, `cd` uses the standard sphere value, and hook drag can start at zero.
That alone replaces every unitless constant with real units.

## After you fill it in

`src/data/tackle.json` is the machine-readable result, read by the Gear Sim so `rigLift()` /
`totalDragPerFt()` take real units instead of tuned coefficients. It is **not committed yet**:
it appears alongside the physics rewrite (and then joins `sw.js` SHELL_FILES with a VERSION
bump), so the repo never ships data without a consumer.

