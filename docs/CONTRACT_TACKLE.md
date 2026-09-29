# Contract — Tackle Spec (measured, not guessed)

**Status:** FILLED — measured 2026-09-28 (foam, beads, hooks, yarn) + published line
diameters + the weight library. The Gear Sim still runs on unitless calibration constants
(`lift = 0.90`, `DRAG_REF = 7.5`, `hookSink = 0.35`); this file is the data that will replace
them with real grams, millimetres and cm² so `F = ½·ρ·C_d·A·v²` gets real numbers in it.

**No row is incomplete any more** — `--check` lists none. The 60 weight rows' `area_cm2` + `cd` are
**ESTIMATED from geometry**, not from calipers: the volume comes *exactly* from the row's own
`mass_g` ÷ metal density, and the only assumption is each shape's aspect ratio (length/diameter) —
slinky 5, pencil 3, teardrop 2, barrel 1, cannonball = a sphere — plus a 0.8 mm rubber wall on the
sleeved variants. Three consequences worth knowing:

- A **slinky's density is the shot-packed effective value**: 0.64 × 11.34 = **7.26 g/cm³** (random
  close packing of equal spheres), because its tube is mostly void space, not solid lead.
- A **tungsten weight is ~30% smaller than the same-oz lead one**, so it displaces less and drags
  less — that is the density effect the weight rows exist to capture.
- A rubber sleeve adds a real tube of volume and mass, so a sleeved row's density is the *combined*
  value (~7.7–8.8), not the bare lead's.

Anything whose `notes` say DERIVED or ESTIMATED was not directly measured: either the item is below
the 0.01 g scale's resolution, or the value is a standard material constant.

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
| weight `area_cm2` | graph paper + photo | silhouette of the **broadside** (what the current sees) | the rubber sleeve changes area *and* bottom grip — measure the sleeved unit as its own item |
| weight `cd` | standard | sphere `0.47`, cylinder ≈ `1.0`, teardrop ≈ `0.3` | `slinky` is a cylinder, so it drags like a parachute — the whole reason shape is being modelled |
| weight `density_g_cm3` | standard | lead `11.34`, tungsten `19.3`, steel `7.85` | a tungsten weight of the same oz is ~40% smaller → less drag, sinks harder |
| yarn `buoyancy_per_inch_g` | Archimedes | measure a known length (e.g. 10"), ÷ length | measure **after 5 min soak** — that's the honest in-river value (synthetic yarn reads ≈ neutral, so expect a very small number) |

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
| `id` | — | all | unique slug (the stable key), e.g. `corky-10`, `fluoro-seaguar-sts-12` |
| `type` | — | all | `foam` \| `line` \| `bead` \| `hook` \| `yarn` \| `weight` |
| `label` | — | all | display name; carries the variant (e.g. `Lead Pencil (rubber sleeve) 1/4 oz`) |
| `brand` | — | line | brand name; `generic` = the fallback average row |
| `material` | — | line, bead, weight | line: `mono`/`copoly`/`fluoro`/`braid`; bead: `hard`/`soft`; weight: `lead`/`tungsten` |
| `lb_test` | lb | line | |
| `diameter_mm` | mm | line, bead, foam | line: published average, or wrap-and-divide |
| `mass_g` | g | all | weight: a unit conversion of the oz label |
| `buoyancy_g` | g-force | all | straight off the Archimedes rig |
| `density_g_cm3` | g/cm³ | all | **derived** when `buoyancy_g` is present, else a standard material value |
| `area_cm2` | cm² | foam, bead, weight | spheres: `π(d/2)²`; irregular: photo + graph paper |
| `shape` | — | foam, bead, weight | geometry only: `sphere`/`plate`/`other`/`egg`/`slinky`/`pencil`/`barrel`/`teardrop`/`cannonball` |
| `cd` | — | foam, bead, weight | `0.47` sphere · `1.1` flat plate · egg ≈ `0.5` |
| `gap_width_mm` | mm | hook | |
| `wire_diameter_mm` | mm | hook | |
| `buoyancy_per_inch_g` | g/in | yarn | 10 in saturated ÷ 10 |
| `sample_length_mm` | mm | line, yarn | length of a weighed sample, so a per-length mass stays honest (unused so far) |
| `notes` | — | all | free text — avoid commas, or wrap the cell in quotes |

A weight's **rubber sleeve is a variant, not a shape**: `shape` stays the bare geometry and
the sleeve lives in `label` (each configuration is its own row, measured as a whole unit).

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

For `weight` rows it also derives **`shape_label`** — the item's label with the trailing oz
stripped, e.g. `Lead Pencil (rubber sleeve) 1/4 oz` → `Lead Pencil (rubber sleeve)`. The Gear
Sim's weight picker offers `(shape_label, oz)` pairs, which is what lets a rubber sleeve and the
metal show up as one option without giving `shape` a second job; every `shape_label` exists at
every oz, so the pair identifies exactly one row.

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

