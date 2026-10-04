/**
 * src/features/gear-sim/zone-best.js - deterministic gear solver for the
 * best-rig search. Extracted from original zone.js (906 lines).
 * public: bestZoneRig()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
var LEADER_LENGTH_OPTIONS = GEAR_OPTIONS.leaderLen;
var FOAM_KEYS = GEAR_OPTIONS.foam.map(function(o) { return String(o.val); });
var CHANGE_PENALTY = { foam: 0.05, foam2: 0.06, hook: 0.08, yarn: 0.10, bead: 0.12, leader: 0.30, weight: 0.35 };
var WEIGHT_OPTIONS = GEAR_OPTIONS.weight.map(function(o) { return o.val; });
var YARN_OPTIONS = GEAR_OPTIONS.yarn.map(function(o) { return o.val; });
var HOOK_OPTIONS = GEAR_OPTIONS.hook.map(function(o) { return o.val; });

function beadSizeOptions(bdSz) {
    var opts = [0];
    if (typeof tackleBeadSizes === 'function') {
        tackleBeadSizes().forEach(function (o) {
            var mm = Number(o.value);
            if (isFinite(mm) && opts.indexOf(mm) === -1) opts.push(mm);
        });
    }
    if (opts.indexOf(Number(bdSz)) === -1) opts.push(Number(bdSz));
    return opts.sort(function (a, b) { return a - b; });
}

function foamShort(foam) {
    var short = String(foam.label || '').replace(' - Size ', ' ').replace(/\s*\(\d+mm\)/, '').replace(' - ', ' ');
    return /cheater/i.test(short) ? short + ' float' : short;
}

function rigChangeList(best, rig) {
    var out = [];
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

function rigChangePlain(best, rig) {
    var up = [];
    if (best.foam.key !== rig.foam.key) up.push(best.foam.lift > rig.foam.lift ? 'a bigger corky' : 'a smaller corky');
    if (best.foam2.key !== rig.foam2.key) {
        if (best.foam2.key === '0') up.push('drop the second corky');
        else if (rig.foam2.key === '0') up.push('a second corky');
        else up.push(best.foam2.lift > rig.foam2.lift ? 'a bigger second corky' : 'a smaller second corky');
    }
    if (String(best.hook) !== String(rig.hook)) {
        var hkBest = (typeof tackleHookData === 'function' ? tackleHookData(best.hook) : null);
        var hkRig = (typeof tackleHookData === 'function' ? tackleHookData(rig.hook) : null);
        var hkBestMass = hkBest ? hkBest.mass_g : 0;
        var hkRigMass = hkRig ? hkRig.mass_g : 0;
        up.push(hkBestMass < hkRigMass ? 'a smaller hook' : 'a bigger hook');
    }
    if (Number(best.yarn) !== Number(rig.yarn)) up.push(Number(best.yarn) > Number(rig.yarn) ? 'more yarn' : 'less yarn');
    if (Number(best.bdSz) !== Number(rig.bdSz)) {
        var bdBest = (typeof tackleBeadData === 'function' ? tackleBeadData(best.bdSz) : null);
        var bdRig = (typeof tackleBeadData === 'function' ? tackleBeadData(rig.bdSz) : null);
        var bdBestNet = bdBest ? bdBest.netSinkG : 0;
        var bdRigNet = bdRig ? bdRig.netSinkG : 0;
        up.push(bdBestNet < bdRigNet ? 'a lighter bead' : 'a heavier bead');
    }
    if (Number(best.leader) !== Number(rig.ldLen)) up.push(Number(best.leader) > Number(rig.ldLen) ? 'a longer leader' : 'a shorter leader');
    if (Number(best.weight) !== Number(rig.weightOz)) up.push(Number(best.weight) > Number(rig.weightOz) ? 'more weight' : 'less weight');
    return up;
}

function joinPlain(items) {
    if (!items || !items.length) return '';
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

function bestZoneRig(zone, rig, vel) {
    var target = (zone.min + zone.max) / 2;
    var bed = vel.bottom;
    var beads = beadSizeOptions(rig.bdSz);
    var passes = [
        { weights: [rig.weightOz], leaders: [rig.ldLen] },
        { weights: WEIGHT_OPTIONS, leaders: LEADER_LENGTH_OPTIONS }
    ];
    var fallback = null;
    var refLdDia = rig.ldDia || 0;
    var refLdLen = rig.ldLen;
    for (var p = 0; p < passes.length; p++) {
        var passBest = null;
        for (var f = 0; f < FOAM_KEYS.length; f++) {
            var foam = parseFoam(FOAM_KEYS[f]);
            for (var f2 = 0; f2 < FOAM_KEYS.length; f2++) {
                var foam2 = parseFoam(FOAM_KEYS[f2]);
                for (var y = 0; y < YARN_OPTIONS.length; y++) {
                    for (var h = 0; h < HOOK_OPTIONS.length; h++) {
                        for (var b = 0; b < beads.length; b++) {
                            var hData = (typeof tackleHookData === 'function') ? tackleHookData(HOOK_OPTIONS[h]) : null;
                            var bData = (typeof tackleBeadData === 'function') ? tackleBeadData(beads[b]) : null;
                            var yG = (typeof tackleYarnBuoyancyG === 'function') ? tackleYarnBuoyancyG(YARN_OPTIONS[y]) : 0;
                            var hookMassG = hData ? (hData.mass_g - hData.buoyancy_g) : 0;
                            var beadNetSink = bData ? bData.netSinkG : 0;
                            var liftGf = computeLiftGf(foam.net_buoyancy_g, foam2.net_buoyancy_g, hookMassG, beadNetSink, yG);
                            var changed = [];
                            if (FOAM_KEYS[f] !== rig.foam.key) changed.push('foam');
                            if (FOAM_KEYS[f2] !== rig.foam2.key) changed.push('foam2');
                            if (HOOK_OPTIONS[h] !== String(rig.hook)) changed.push('hook');
                            if (YARN_OPTIONS[y] !== Number(rig.yarn)) changed.push('yarn');
                            if (beads[b] !== Number(rig.bdSz)) changed.push('bead');
                            for (var w = 0; w < passes[p].weights.length; w++) {
                                var wt = passes[p].weights[w];
                                var wObj = (typeof tackleWeightPhysicsData === 'function')
                                    ? tackleWeightPhysicsData(rig.weightShape || null, wt) : null;
                                wObj = wObj ? { areaCm2: wObj.areaCm2, cd: wObj.cd } : null;
                                var ck1Obj = { areaCm2: foam.areaCm2, cd: foam.cd };
                                var ck2Obj = { areaCm2: foam2.areaCm2, cd: foam2.cd };
                                var bObj = bData ? { areaCm2: bData.areaCm2, cd: bData.cd } : null;
                                var hObj = hData ? { areaCm2: hData.areaCm2, cd: hData.cd } : null;
                                var yarnDrag = (typeof tackleYarnDragData === 'function') ? tackleYarnDragData() : null;
                                var yObj = yarnDrag ? { areaCm2: yarnDrag.areaCm2, cd: yarnDrag.cd } : null;
                                var dragGfFt = totalDragPerFt(bed, refLdDia, refLdLen, wObj, ck1Obj, ck2Obj, bObj, hObj, yObj);
                                if (rig.mlDia && rig.mlDia > 0) dragGfFt += lineDragPerFt(rig.mlDia, bed);
                                for (var l = 0; l < passes[p].leaders.length; l++) {
                                    var len = passes[p].leaders[l];
                                    var hgt = presentationHeightInches(liftGf, dragGfFt, len);
                                    if (!isFinite(hgt) || hgt <= 0) continue;
                                    var cost = Math.abs(hgt - target);
                                    for (var c = 0; c < changed.length; c++) cost += (CHANGE_PENALTY[changed[c]] || 0.1);
                                    if (Number(len) !== Number(rig.ldLen)) cost += CHANGE_PENALTY.leader;
                                    if (Number(wt) !== Number(rig.weightOz)) cost += CHANGE_PENALTY.weight;
                                    var cand = { cost: cost, hgt: hgt, foam: foam, foam2: foam2, hook: HOOK_OPTIONS[h], yarn: YARN_OPTIONS[y], bdSz: beads[b], weight: wt, leader: len };
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