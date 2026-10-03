# Tackle measurement protocol

Purpose: replace the assumed foam / hook / yarn / bead values with measured ones, each
carrying its spread (`sd`) so errors propagate. Template: `docs/tackle_measure_template.csv`.
Status: NOT started — awaiting the scale and cylinder. Nothing here is measured yet.

## Equipment
- Scale, 0.001 g readability, 100-200 g capacity, draft shield, plus 20 g and 100 mg check weights.
- Calipers (check against a drill bit / feeler gauge of known size).
- 10 mL graduated cylinder (batch cross-check only; 0.1 mL steps are too coarse for one corky).
- 50-100 mL beaker, ring stand + clamp (or bridge over the pan), fine pin/wire, thread,
  distilled water, thermometer, dish soap, tweezers, nitrile gloves, lint-free wipes, timer.

## Rules
1. Check the scale with the check weights at the start of each session; log the reading.
2. Water: distilled, record temperature; density = 0.9986 g/cm3 near 15 C (look up other temps).
3. One drop of dish soap per 100 mL so no bubbles cling to foam.
4. n >= 10 per item type. Record every reading; do not round while measuring.
5. A value with no `sd` is rejected. Single readings use the scale resolution (0.0005 g
   half-step) as `sd`.
6. Never clamp a net lift <= 0; report it.

## Procedures
- **Foam lift (direct):** beaker on scale, tare. Hold the item under the surface on the pin
  without touching glass; reading = buoyant force in gf. Run the pin alone first and subtract.
  Repeat at 1 min, 1 h and 24 h soak to see whether the skin stops water uptake.
- **Mass in air:** weigh the item dry. Batches of 20 for beads under 4 mm.
- **Volume / density of sinkers and hooks (Archimedes):** weigh in air, then hung from thread
  fully submerged; volume = (air - water) / water density.
- **Dimensions:** calipers on 2-3 axes; record each axis.
- **Yarn:** dry mass per inch; then soaked and squeezed the same way each time, lift per inch
  in the beaker. Gives the real fresh-cast vs soaked values.
- **Beads:** hard and soft separately, including soft 10 mm.
- **Hooks:** Owner SSW Cutting Point, Gamakatsu Octopus, Gamakatsu Finesse Wide Gap in
  sizes 2, 1, 1/0, 2/0: mass in air, submerged mass, length, gap, wire diameter.

## Scope
Lil Corky #14/12/10/8/6/4; Beau Mac Cheater #14/12/10/8; Glo Bugs yarn; existing beads + 10 mm
soft; hooks above. Line diameters (110) and weight geometry are already locked: do not remeasure.

## Downstream (after data exists)
Extend `docs/tackle_measurements.csv` + `scripts/tackle_csv_to_json.py` with `sd` / `n`;
make `scripts/derive_tackle.py` run a seeded Monte Carlo (fixed seed, byte-identical runs)
reporting median and 5th-95th percentile height and the fraction of draws with net lift <= 0.
Then the physics rebuild (see `memory-bank/activeContext.md`).
