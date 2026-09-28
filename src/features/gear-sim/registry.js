/**
 * src/features/gear-sim/registry.js - the Gear Sim technique registry.
 *
 * public: GEAR_TECHNIQUES, GEAR_DEFAULT_TECHNIQUE, gearTechnique(id)
 *
 * A TECHNIQUE changes the physics. Only `drift` is implemented. Adding one is a
 * new file under `techniques/<id>.js` implementing the
 * `{ id, label, kind, waterbody_types, compute(rig, env) }` contract
 * (see docs/CONTRACT_TECHNIQUE.md) plus one line here - runSim() needs no change.
 *
 * NOT HERE YET (deliberately): GEAR_STYLES (natural-drift / flossing / high-stick
 * tunings of the SAME drift physics) and GEAR_SPECIES. Both land together with the
 * Technique/Species picker, so the repo never carries data without a consumer.
 *
 * Classic script (global scope). Loaded AFTER techniques/*.js, BEFORE sim.js.
 */
var GEAR_TECHNIQUES = {
    drift: DRIFT_TECHNIQUE
};

var GEAR_DEFAULT_TECHNIQUE = 'drift';

// Resolve a technique by id, falling back to the default so the sim can never run
// without a solver (an unknown id must not blank the Gear Sim).
function gearTechnique(id) {
    return GEAR_TECHNIQUES[id || GEAR_DEFAULT_TECHNIQUE] || GEAR_TECHNIQUES[GEAR_DEFAULT_TECHNIQUE];
}
