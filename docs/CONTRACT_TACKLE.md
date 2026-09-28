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

## Template — fill these in

### Metadata

```json
{
  "measured_on": "YYYY-MM-DD",
  "water_temp_c": 18,
  "water_density_g_cm3": 0.9986,
  "scale_resolution_g": 0.01,
  "items": []
}
```

### Worked example (reference — keep it)

```json
{
  "id": "corky-10",
  "type": "foam",
  "label": "Corky 10 (10mm)",
  "diameter_mm": 10.0,
  "mass_g": 0.42,
  "buoyancy_g": 0.51,
  "density_g_cm3": 0.41,
  "projected_area_cm2": 0.785,
  "shape": "sphere",
  "cd": 0.47,
  "notes": "saturated; Method A, tap-water 18C"
}
```

### Blank entries — copy one per item and fill

This is a ready-to-extend JSON **array** — once filled, paste it straight into the `items`
field of the metadata block above.

```json
[
{ "id": "corky-14",  "type": "foam", "label": "Corky 14 (6mm)",  "diameter_mm": null, "mass_g": null, "buoyancy_g": null, "density_g_cm3": null, "shape": "sphere", "cd": 0.47, "notes": "" },
{ "id": "corky-12",  "type": "foam", "label": "Corky 12 (8mm)",  "diameter_mm": null, "mass_g": null, "buoyancy_g": null, "density_g_cm3": null, "shape": "sphere", "cd": 0.47, "notes": "" },
{ "id": "cheater-12","type": "foam", "label": "Cheater 12",      "diameter_mm": null, "mass_g": null, "buoyancy_g": null, "density_g_cm3": null, "shape": "sphere", "cd": 0.47, "notes": "" },

{ "id": "leader-mono-12",    "type": "line", "material": "mono",   "lb_test": 12, "diameter_mm": null, "density_g_cm3": null, "notes": "wrap/40" },
{ "id": "leader-copoly-12",  "type": "line", "material": "copoly", "lb_test": 12, "diameter_mm": null, "density_g_cm3": null, "notes": "wrap/40" },
{ "id": "leader-fluoro-12",  "type": "line", "material": "fluoro", "lb_test": 12, "diameter_mm": null, "density_g_cm3": null, "notes": "wrap/40" },
{ "id": "mainline-braid-30", "type": "line", "material": "braid",  "lb_test": 30, "diameter_mm": null, "density_g_cm3": null, "notes": "wrap/40" },

{ "id": "bead-hard-6", "type": "bead", "material": "hard", "diameter_mm": 6.0, "mass_g": null, "buoyancy_g": null, "density_g_cm3": null, "shape": "sphere", "cd": 0.47, "notes": "" },
{ "id": "bead-soft-6", "type": "bead", "material": "soft", "diameter_mm": 6.0, "mass_g": null, "buoyancy_g": null, "density_g_cm3": null, "shape": "sphere", "cd": 0.47, "notes": "" },
{ "id": "bead-soft-8", "type": "bead", "material": "soft", "diameter_mm": 8.0, "mass_g": null, "buoyancy_g": null, "density_g_cm3": null, "shape": "sphere", "cd": 0.47, "notes": "" },

{ "id": "hook-2-0", "type": "hook", "size_label": "2/0", "mass_g": null, "gap_width_mm": null, "wire_diameter_mm": null, "notes": "" },
{ "id": "hook-1-0", "type": "hook", "size_label": "1/0", "mass_g": null, "gap_width_mm": null, "wire_diameter_mm": null, "notes": "" },
{ "id": "hook-1",   "type": "hook", "size_label": "1",   "mass_g": null, "gap_width_mm": null, "wire_diameter_mm": null, "notes": "" },
{ "id": "hook-2",   "type": "hook", "size_label": "2",   "mass_g": null, "gap_width_mm": null, "wire_diameter_mm": null, "notes": "" },

{ "id": "yarn-egg", "type": "yarn", "label": "Egg yarn (saturated)", "buoyancy_per_inch_g": null, "density_g_cm3": null, "notes": "measure 10 in, soak 5 min, ÷ 10" }
]
```

---

## Minimum viable set (80/20 — do this first)

Measure **mass + buoyancy** for every item, plus **diameter** for line/bead/foam. Density and
volume are derived, `cd` uses the standard sphere value, and hook drag can start at zero.
That alone replaces every unitless constant with real units.

## After you fill it in

The filled values become `src/data/tackle.json` (strict JSON, same pattern as the region
registry), read by the Gear Sim so `rigLift()` / `totalDragPerFt()` take real numbers instead
of tuned coefficients.
