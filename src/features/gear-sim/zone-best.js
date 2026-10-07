/**
 * src/features/gear-sim/zone-best.js - deterministic gear solver for the
 * best-rig search. Extracted from original zone.js (906 lines).
 * public: bestZoneRig()
 * ES module.
 */
import { GEAR_OPTIONS } from '../../shared/gear-options.js';
import { tackleBeadSizes } from '../../shared/tackle.js';
import { hookLabel, tackleHookData, tackleBeadData, parseFoam, tackleYarnBuoyancyG } from './inputs.js';
import { tackleWeightPhysicsData, tackleYarnDragData } from './inputs-readers.js';
import { totalDragPerFt, lineDragPerFt, presentationHeightInches, computeLiftGf } from './physics.js';
const LEADER_LENGTH_OPTIONS = GEAR_OPTIONS.leaderLen;
const FOAM_KEYS = GEAR_OPTIONS.foam.map(function(o) { return String(o.val); });
const CHANGE_PENALTY = { foam: 0.05, foam2: 0.06, hook: 0.08, yarn: 0.10, bead: 0.12, leader: 0.30, weight: 0.35 };
const WEIGHT_OPTIONS = GEAR_OPTIONS.weight.map(function(o) { return o.val; });
const YARN_OPTIONS = GEAR_OPTIONS.yarn.map(function(o) { return o.val; });
const HOOK_OPTIONS = GEAR_OPTIONS.hook.map(function(o) { return o.val; });

export function beadSizeOptions(bdSz) {
    const opts = [0];
    if (typeof tackleBeadSizes === 'function') {
        tackleBeadSizes().forEach(function (o) {
            const mm = Number(o.value);
            if (isFinite(mm) && opts.indexOf(mm) === -1) opts.push(mm);
        });
    }
    if (opts.indexOf(Number(bdSz)) === -1) opts.push(Number(bdSz));
    return opts.sort(function (a, b) { return a - b; });
}

export function foamShort(foam) {
    const short = String(foam.label || '').replace(' - Size ', ' ').replace(/\s*\(\d+mm\)/, '').replace(' - ', ' ');
    return /cheater/i.test(short) ? short + ' float' : short;
}

window.rigChangeList = rigChangeList;
export function rigChangeList(best, rig) {
    const out = [];
    if (best.foam.key !== rig.foam.key) out.push(foamShort(best.foam));
    if (best.foam2.key !== rig.foam2.key) {
        out.push(best.foam2.key === '0' ? 'drop the second corky' : 'a second ' + foamShort(best.foam2));
    }
    if (String(best.hook) !== String(rig.hook)) out.push('hook size ' + hookLabel(best.hook));
    if (Number(best.yarn) !== Number(rig.yarn)) out.push('yarn at ' + best.yarn + '"');
    if (Number(best.bdSz) !== Number(rig.bdSz)) out.push(best.bdSz + 'mm bead');
    if (Number(best.leader) !== Number(rig.ldLen)) out.push('a ' + best.leader + ' ft leader');
    if (Number(best.weight) !== Number(rig.weightOz)) out.push(best.weight + ' oz lead');
    return out;
}

export function rigChangePlain(best, rig) {
window.rigChangePlain = rigChangePlain;
    const up = [];
    if (best.foam.key !== rig.foam.key) up.push(best.foam.lift > rig.foam.lift ? 'a bigger corky' : 'a smaller corky');
    if (best.foam2.key !== rig.foam2.key) {
        if (best.foam2.key === '0') up.push('drop the second corky');
        else if (rig.foam2.key === '0') up.push('a second corky');
        else up.push(best.foam2.lift > rig.foam2.lift ? 'a bigger second corky' : 'a smaller second corky');
    }
    if (String(best.hook) !== String(rig.hook)) {
        const hkBest = (typeof tackleHookData === 'function' ? tackleHookData(best.hook) : null);
        const hkRig = (typeof tackleHookData === 'function' ? tackleHookData(rig.hook) : null);
        const hkBestMass = hkBest ? hkBest.mass_g : 0;
        const hkRigMass = hkRig ? hkRig.mass_g : 0;
        up.push(hkBestMass < hkRigMass ? 'a smaller hook' : 'a bigger hook');
    }
    if (Number(best.yarn) !== Number(rig.yarn)) up.push(Number(best.yarn) > Number(rig.yarn) ? 'more yarn' : 'less yarn');
    if (Number(best.bdSz) !== Number(rig.bdSz)) {
        const bdBest = (typeof tackleBeadData === 'function' ? tackleBeadData(best.bdSz) : null);
        const bdRig = (typeof tackleBeadData === 'function' ? tackleBeadData(rig.bdSz) : null);
        const bdBestNet = bdBest ? bdBest.netSinkG : 0;
        const bdRigNet = bdRig ? bdRig.netSinkG : 0;
        up.push(bdBestNet < bdRigNet ? 'a lighter bead' : 'a heavier bead');
    }
    if (Number(best.leader) !== Number(rig.ldLen)) up.push(Number(best.leader) > Number(rig.ldLen) ? 'a longer leader' : 'a shorter leader');
    if (Number(best.weight) !== Number(rig.weightOz)) up.push(Number(best.weight) > Number(rig.weightOz) ? 'more weight' : 'less weight');
    return up;
}

export function joinPlain(items) {
window.joinPlain = joinPlain;
    if (!items || !items.length) return '';
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

export function bestZoneRig(zone, rig, vel) {
    const target = (zone.min + zone.max) / 2;
    const bed = vel.bottom;
    const beads = beadSizeOptions(rig.bdSz);
    const passes = [
        { weights: [rig.weightOz], leaders: [rig.ldLen] },
        { weights: WEIGHT_OPTIONS, leaders: LEADER_LENGTH_OPTIONS }
    ];
    let fallback = null;
    const refLdDia = rig.ldDia || 0;
    const refLdLen = rig.ldLen;
    for (let p = 0; p < passes.length; p++) {
        let passBest = null;
        for (let f = 0; f < FOAM_KEYS.length; f++) {
            const foam = parseFoam(FOAM_KEYS[f]);
            for (let f2 = 0; f2 < FOAM_KEYS.length; f2++) {
                const foam2 = parseFoam(FOAM_KEYS[f2]);
                for (let y = 0; y < YARN_OPTIONS.length; y++) {
                    for (let h = 0; h < HOOK_OPTIONS.length; h++) {
                        for (let b = 0; b < beads.length; b++) {
                            const hData = (typeof tackleHookData === 'function') ? tackleHookData(HOOK_OPTIONS[h]) : null;
                            const bData = (typeof tackleBeadData === 'function') ? tackleBeadData(beads[b]) : null;
                            const yG = (typeof tackleYarnBuoyancyG === 'function') ? tackleYarnBuoyancyG(YARN_OPTIONS[y]) : 0;
                            const hookMassG = hData ? (hData.mass_g - hData.buoyancy_g) : 0;
                            const beadNetSink = bData ? bData.netSinkG : 0;
                            const liftGf = computeLiftGf(foam.net_buoyancy_g, foam2.net_buoyancy_g, hookMassG, beadNetSink, yG);
                            const changed = [];
                            if (FOAM_KEYS[f] !== rig.foam.key) changed.push('foam');
                            if (FOAM_KEYS[f2] !== rig.foam2.key) changed.push('foam2');
                            if (HOOK_OPTIONS[h] !== String(rig.hook)) changed.push('hook');
                            if (YARN_OPTIONS[y] !== Number(rig.yarn)) changed.push('yarn');
                            if (beads[b] !== Number(rig.bdSz)) changed.push('bead');
                            for (let w = 0; w < passes[p].weights.length; w++) {
                                const wt = passes[p].weights[w];
                                let wObj = (typeof tackleWeightPhysicsData === 'function')
                                    ? tackleWeightPhysicsData(rig.weightShape || null, wt) : null;
                                wObj = wObj ? { areaCm2: wObj.areaCm2, cd: wObj.cd } : null;
                                const ck1Obj = { areaCm2: foam.areaCm2, cd: foam.cd };
                                const ck2Obj = { areaCm2: foam2.areaCm2, cd: foam2.cd };
                                const bObj = bData ? { areaCm2: bData.areaCm2, cd: bData.cd } : null;
                                const hObj = hData ? { areaCm2: hData.areaCm2, cd: hData.cd } : null;
                                const yarnDrag = (typeof tackleYarnDragData === 'function') ? tackleYarnDragData() : null;
                                const yObj = yarnDrag ? { areaCm2: yarnDrag.areaCm2, cd: yarnDrag.cd } : null;
                                let dragGfFt = totalDragPerFt(bed, refLdDia, refLdLen, wObj, ck1Obj, ck2Obj, bObj, hObj, yObj);
                                if (rig.mlDia && rig.mlDia > 0) dragGfFt += lineDragPerFt(rig.mlDia, bed);
                                for (let l = 0; l < passes[p].leaders.length; l++) {
                                    const len = passes[p].leaders[l];
                                    const hgt = presentationHeightInches(liftGf, dragGfFt, len);
                                    if (!isFinite(hgt) || hgt <= 0) continue;
                                    let cost = Math.abs(hgt - target);
                                    for (let c = 0; c < changed.length; c++) cost += (CHANGE_PENALTY[changed[c]] || 0.1);
                                    if (Number(len) !== Number(rig.ldLen)) cost += CHANGE_PENALTY.leader;
                                    if (Number(wt) !== Number(rig.weightOz)) cost += CHANGE_PENALTY.weight;
                                    const cand = { cost: cost, hgt: hgt, foam: foam, foam2: foam2, hook: HOOK_OPTIONS[h], yarn: YARN_OPTIONS[y], bdSz: beads[b], weight: wt, leader: len };
                                    if (!passBest || cost < passBest.cost) passBest = cand;
                                }
                            }
                        }
                    }
                }
            }
        }
        if (passBest && passBest.hgt >= zone.min && passBest.hgt <= zone.max) return passBest;
        if (passBest && (!fallback || passBest.cost < fallback.cost)) fallback = passBest;
    }
    return fallback;
}