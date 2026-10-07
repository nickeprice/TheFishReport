/**
 * src/features/gear-sim/sim.js - runSim(): solve the rig against the live report.
 *
 * A SHORT orchestrator since UPDATE 3.0 Phase 1.4: read the form -> load community
 * sonar -> hand both to the registered TECHNIQUE's pure compute() -> paint the HUD.
 * Adding a fishing technique does NOT touch this file (see gear-sim/registry.js).
 *
 * public: runSim()
 * ES module.
 */
import { showToast } from '../../shared/ui.js';
import { missingRigFields } from './zone-env.js';
import { getActiveStationId } from './inputs.js';
import { readRigFromForm, loadCalibrationData, buildSimStats, paintSimHud } from './solver.js';
import { gearTechnique } from './registry.js';
import { saveRig } from './rig.js';
export async function runSim() {
    const simBtn = document.getElementById('btn-sim');

    // No defaults: every gear field must be chosen before the solver can run.
    const missing = missingRigFields();
    if (missing.length) {
        showToast('Fill in: ' + missing.join(', '), 'warn', 6000);
        return;
    }

    if (simBtn) { simBtn.innerText = 'CALCULATING...'; simBtn.disabled = true; }

    // 1. Read the rig off the form.
    const rig = readRigFromForm();

    // 2. Community sonar - the only await (a network read with a local fallback).
    const dbArray = await loadCalibrationData(rig.flow, rig.species);

    // 3-4. Solve + score through the registered technique. Only `drift` ships today;
    // its compute() owns the locked-Cd physics, the strike zone and the suggestions.
    // The active station's own USGS-measured velocity curve shapes the response.
    const siteId = getActiveStationId();
    const out = gearTechnique().compute(rig, { flow: rig.flow, species: rig.species, dbArray: dbArray, siteId: siteId });

    // 5. Persist the rig + paint the HUD.
    const stats = buildSimStats(rig, out);
    window.currentStats = stats;
    saveRig();
    paintSimHud(rig, out, stats);
}
window.runSim = runSim;
