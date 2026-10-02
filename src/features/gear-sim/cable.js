/**
 * src/features/gear-sim/cable.js — Lumped-mass cable dynamics.
 *
 * N-node lumped-parameter cable for mainline and leader segments.
 * Normal + tangential drag. Quasi-static equilibrium via force relaxation.
 *
 * public: cablePreset(), cableNodes(), resolveCable(), CABLE_PRESETS
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */

var RHO_CABLE = 1000;           // kg/m³ — @provenance: standard (same as hydro.js RHO)
var G_CABLE = 9.81;             // m/s² — @provenance: standard
var CABLE_MAX_ITER = 500;
var CABLE_EPSILON = 1e-4;       // m — convergence threshold

var CABLE_PRESETS = {
    mainline: { label:'Mainline (braid)', nodes:40, diameterMm:0.35, sg:0.97,
        youngsModGPa:10, cdNormal:1.15, cdTangential:0.03 },
    leader: { label:'Leader (fluoro)', nodes:30, diameterMm:0.30, sg:1.78,
        youngsModGPa:3.5, cdNormal:1.1, cdTangential:0.03 }
};

function cablePreset(presetKey, totalLengthM) {
    var p = CABLE_PRESETS[presetKey];
    if (!p || !totalLengthM || totalLengthM <= 0) return null;
    var ds = totalLengthM / p.nodes;
    var dM = p.diameterMm * 0.001;
    var cs = Math.PI * dM * dM / 4;
    var vol = cs * ds;
    var mass = p.sg * RHO_CABLE * vol;
    var w = mass * G_CABLE;
    var b = RHO_CABLE * G_CABLE * vol;
    return {
        nodes: p.nodes, ds: ds, diameterM: dM,
        youngsModGPa: p.youngsModGPa, cdNormal: p.cdNormal, cdTangential: p.cdTangential,
        massPerNode: mass, netWeightN: w - b, areaPerNodeM2: dM * ds
    };
}

function cableNodes(startX, startZ, preset) {
    var nds = [];
    for (var i = 0; i < preset.nodes; i++) {
        nds.push({ index: i, x: startX, z: startZ - i * preset.ds,
            vx: 0, vz: 0, fx: 0, fz: 0, snagged: false });
    }
    nds[0].pinned = true;   // top node = attachment
    return nds;
}

function resolveCable(nodes, preset, flowAt) {
    if (!nodes || nodes.length < 2 || !preset || !flowAt)
        return { converged: false, iterations: 0 };
    var iter, maxDisp, n = nodes.length;
    var ea = preset.youngsModGPa * 1e9 * (Math.PI * preset.diameterM * preset.diameterM / 4);
    var kEff = 2 * ea / preset.ds; if (kEff < 1) kEff = 1;

    for (iter = 0; iter < CABLE_MAX_ITER; iter++) {
        maxDisp = 0;
        for (var i = 1; i < n; i++) {
            var nd = nodes[i], prv = nodes[i-1];
            var dx = nd.x - prv.x, dz = nd.z - prv.z;
            var sl = Math.sqrt(dx*dx + dz*dz); if (sl < 1e-12) { sl = preset.ds; }
            var ux = dx/sl, uz = dz/sl;

            // Tension from segment above
            var strain = (sl - preset.ds) / preset.ds;
            var ten = Math.max(0, ea * strain);

            // Weight + buoyancy (net = weight - buoyancy, downward)
            var fx = ten * ux;
            var fz = ten * uz + preset.netWeightN;

            // Water velocity at this node height
            var vel = flowAt ? flowAt(nd.z) : 0; if (typeof vel === 'number') vel = { vMs: vel };
            var vw = vel ? vel.vMs : 0;
            var rvx = vw - nd.vx, rvz = -nd.vz;

            // Tangential drag: F = 0.5 * ρ * Cd_t * π*d * ds * |v_t| * v_t
            var vDot = rvx*ux + rvz*uz;
            var vtMag = Math.abs(vDot);
            if (vtMag > 1e-12) {
                var fdT = 0.5 * RHO_CABLE * preset.cdTangential * Math.PI * preset.diameterM * preset.ds * vtMag;
                fx += fdT * (vDot > 0 ? ux : -ux);
                fz += fdT * (vDot > 0 ? uz : -uz);
            }

            // Normal drag: F = 0.5 * ρ * Cd_n * d * ds * |v_n| * v_n
            var vnX = rvx - vDot*ux, vnZ = rvz - vDot*uz;
            var vnMag = Math.sqrt(vnX*vnX + vnZ*vnZ);
            if (vnMag > 1e-12) {
                var fdN = 0.5 * RHO_CABLE * preset.cdNormal * preset.diameterM * preset.ds * vnMag;
                fx += fdN * (vnX / vnMag);
                fz += fdN * (vnZ / vnMag);
            }

            // Tension from segment below (pulls node i upward)
            if (i < n - 1) {
                var nx = nodes[i+1].x - nd.x, nz = nodes[i+1].z - nd.z;
                var sn = Math.sqrt(nx*nx + nz*nz); if (sn < 1e-12) sn = preset.ds;
                var strain2 = (sn - preset.ds) / preset.ds;
                var ten2 = Math.max(0, ea * strain2);
                fx -= ten2 * (nx / sn);
                fz -= ten2 * (nz / sn);
            }

            // Damped pseudodynamic step — boosted for quasi-static convergence
            // The physical stiffness kEff ~ 10⁴ N/m, so direct integration is glacial.
            // Apply a convergence boost (10×) to reach the equilibrium bow within 500 iterations.
            var sx = fx / kEff * 10, sz = fz / kEff * 10;
            nd.x += sx; nd.z += sz;
            var d = Math.sqrt(sx*sx + sz*sz); if (d > maxDisp) maxDisp = d;
        }
        if (maxDisp < CABLE_EPSILON)
            return { converged: true, iterations: iter + 1, maxDisplacement: maxDisp };
    }
    return { converged: false, iterations: CABLE_MAX_ITER, maxDisplacement: maxDisp };
}