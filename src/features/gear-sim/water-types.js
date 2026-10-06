/**
 * src/features/gear-sim/water-types.js — Water Type Guide modal + multipliers.
 *
 * public: openWaterTypeGuide(), closeWaterTypeGuide(), waterTypeMultiplier(typeId)
 *
 * Phase 1.6: renders the guide modal with cards showing depth × velocity
 * multipliers for Pool / Riffle / Run / Glide.
 * Relies on WATER_TYPES (inputs.js, loaded earlier).
 * Loaded AFTER solver.js, BEFORE app.js (app.js wires the ⓘ click handler).
 *
 * Future: extend each card with inline <svg> cross-section diagrams (Phase 3.2)
 * or a width-slider supplement (Phase 3.3).
 */

// ==================================================================================
// WATER TYPE GUIDE (Phase 1.6)
// ==================================================================================

window.waterTypeMultiplier = waterTypeMultiplier;
export function waterTypeMultiplier(typeId) {
    var types = (typeof WATER_TYPES !== 'undefined') ? WATER_TYPES : null;
    var def = types ? types[2] : { id: 'run', label: 'Run', depthMul: 1.0, velMul: 1.0, desc: '' };
    if (!types || !typeId) return def;
    for (var i = 0; i < types.length; i++) {
        if (types[i].id === typeId) return types[i];
    }
    return def;
}

export function openWaterTypeGuide() {
    var list = document.getElementById('water-type-guide-list');
    if (!list) return;
    var types = (typeof WATER_TYPES !== 'undefined') ? WATER_TYPES : [];
    if (!list.getAttribute('data-rendered')) {
        var html = '';
        for (var i = 0; i < types.length; i++) {
            var t = types[i];
            var icon = t.id === 'pool' ? '\u25cf' : t.id === 'riffle' ? '\u25b3' : t.id === 'run' ? '\u25a1' : '\u2014';
            html += '<div style="background:#26262a;border-radius:10px;padding:10px 14px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<span style="font-weight:bold;color:#fff;">' + icon + ' ' + t.label + '</span>' +
                '<span style="font-size:0.7rem;color:#aaa;">' +
                (t.depthMul !== 1.0 ? '\u00d7' + t.depthMul : '') + ' depth' +
                (t.velMul !== 1.0 ? ', \u00d7' + t.velMul : '') + ' velocity' +
                '</span></div>' +
                '<div style="font-size:0.72rem;color:#d1d5db;margin-top:4px;">' + t.desc + '</div></div>';
        }
        list.innerHTML = html;
        list.setAttribute('data-rendered', '1');
    }
    var modal = document.getElementById('water-type-modal');
    if (modal) modal.style.display = 'block';
}

export function closeWaterTypeGuide() {
    var modal = document.getElementById('water-type-modal');
    if (modal) modal.style.display = 'none';
}
window.closeWaterTypeGuide = closeWaterTypeGuide;