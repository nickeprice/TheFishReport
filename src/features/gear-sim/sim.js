/**
 * src/features/gear-sim/sim.js - runSim(): solve the rig against the live report.
 *
 * A SHORT orchestrator since UPDATE 3.0 Phase 1.4: read the form -> load community
 * sonar -> hand both to the registered TECHNIQUE's pure compute() -> paint the HUD.
 * Adding a fishing technique does NOT touch this file (see gear-sim/registry.js).
 *
 * public: runSim()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
async function runSim() {
    var simBtn = document.getElementById('btn-sim');

    // No defaults: every gear field must be chosen before the solver can run.
    var missing = missingRigFields();
    if (missing.length) {
        showToast('Fill in: ' + missing.join(', '), 'warn', 6000);
        return;
    }

    if (simBtn) { simBtn.innerText = 'CALCULATING...'; simBtn.disabled = true; }

    // 1. Read the rig off the form.
    var rig = readRigFromForm();

    // 2. Community sonar - the only await (a network read with a local fallback).
    var dbArray = await loadCalibrationData(rig.flow, rig.species);

    // 3-4. Solve + score through the registered technique. Only `drift` ships today;
    // its compute() owns the locked-Cd physics, the strike zone and the suggestions.
    // The active station's own USGS-measured velocity curve shapes the response.
    var siteId = (typeof getActiveStationId === 'function') ? getActiveStationId() : null;
    var out = gearTechnique().compute(rig, { flow: rig.flow, species: rig.species, dbArray: dbArray, siteId: siteId });

    // 5. Persist the rig + paint the HUD.
    currentStats = buildSimStats(rig, out);
    saveRig();
    paintSimHud(rig, out, currentStats);
}
