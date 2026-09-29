# Contract — Gear Sim Techniques (`window.GEAR_TECHNIQUES`)

Canonical interface for a fishing **technique** in the Gear Sim, introduced in
UPDATE 3.0 Phase 1.4. Read this instead of re-grepping `sim.js`/`drift.js` when
adding a method.

## Load pattern

Classic scripts, one global scope, loaded in this order (all before `src/app.js`):

```
gear-sim/physics.js, inputs.js, sonar.js, zone.js
gear-sim/techniques/<id>.js   -> defines <ID>_TECHNIQUE
gear-sim/registry.js          -> indexes the techniques + gearTechnique(id)
gear-sim/solver.js            -> form reading, calibration load, HUD paint
gear-sim/sim.js               -> runSim(): the orchestrator
```

## The three levels (do not confuse them)

| Level | Changes | Mechanism |
|---|---|---|
| **Technique** | the **physics** | a new `techniques/<id>.js` implementing `compute()` |
| **Style** | *tuning only*, same math | a preset (leader length / weight-to-depth bias) |
| **Rig preset** | nothing | saved form values ("Heavy Flow Chinook") |

**Flossing is a STYLE of `drift`, not a technique** — identical dead-drift physics,
different tuning. Do not create `techniques/flossing.js`.

## Technique interface

```js
var MY_TECHNIQUE = {
  id: 'bobber',                  // stable key used by the registry + saved profiles
  label: 'Bobber / Float',       // display name
  kind: 'river-moving-water',    // grouping
  waterbody_types: ['river'],    // which waterbody_type values it applies to
  compute: function (rig, env) { return { /* see below */ }; }
};
```

Registered in `registry.js` as `GEAR_TECHNIQUES[id] = MY_TECHNIQUE;`.

### `rig` (built by `readRigFromForm()` in `solver.js`)

`flow`, `weightOz`, `ldLen`, `ldMat`, `ldLb`, `mlMat`, `mlLb`, `hook`
(`0` = 1/0, `-1` = 2/0), `yarn`, `foam` (parsed record: `{key, lift, label}`),
`foam2`, `bdMat`, `bdSz`, `species`.

### `env`

`{ flow, species, dbArray }` — `dbArray` is community-sonar calibration rows (already
resolved by `loadCalibrationData()`, which is async and therefore stays OUTSIDE
`compute`).

### Return value (consumed by `buildSimStats()` + `paintSimHud()`)

```js
{
  velocity: { mean, bottom },   // ft/s
  dragPerFt, lift, hgt,         // inches of line height
  blownOut,                     // bool: bed too fast for the lead
  sonar, zone,                  // zone = {min, max, notes[], center?}
  score,                        // 0.0 - 5.0
  suggestions: [string]         // plain-English "Rig Adjustments"
}
```

## Rules

1. **Determinism is the contract.** Drag coefficient stays **LOCKED at 1.0**; a
   technique must be a pure function of `(rig, env)`. `sanity_pass.js` pins
   `drift`'s output as a frozen baseline — a refactor that changes a number fails CI.
2. `compute()` must NOT touch the network, `localStorage`, or the DOM. Those belong
   in `solver.js` (before/after the call).
3. **No fabrication**: absent data yields `null`/empty, never an invented value.
4. Adding a technique must not require editing `sim.js` or `drift.js`.
5. New technique files must be added to **both** `index.html` (load order, before
   `registry.js`) **and** `sw.js` `SHELL_FILES`, and `sw.js` `VERSION` bumped.

## Not here yet (deliberately)

- `GEAR_STYLES` (natural drift / flossing / high-stick) and `GEAR_SPECIES`.
- The Technique/Species **picker UI** in both tabs.
  These land together, so the repo never carries data without a consumer.
