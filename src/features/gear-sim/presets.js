/**
 * src/features/gear-sim/presets.js — named rig presets (localStorage).
 *
 * public: PRESET_STORE_KEY, loadPresets(), savePreset(name), deletePreset(name),
 *         applyPreset(name)
 *
 * Adds multi-slot named presets on top of the existing single-slot
 * saveRig()/restoreRig(). The auto-save slot stays untouched — presets
 * are explicit save/load only.
 *
 * ES module.
 */
export var PRESET_STORE_KEY = 'puyallup_rig_presets';
window.PRESET_STORE_KEY = PRESET_STORE_KEY;

export function readPresets() {
    try {
        var raw = localStorage.getItem(PRESET_STORE_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
}
export function writePresets(arr) {
    try { localStorage.setItem(PRESET_STORE_KEY, JSON.stringify(arr)); } catch (e) {}
}

export function captureCurrentPreset() {
    return {
        waterType: getStr('water-type'), species: getStr('species'),
        technique: 'drift',
        mlMat: getStr('ml-mat'), mlBrand: getStr('ml-brand'), mlLb: getStr('ml-lb'),
        ldMat: getStr('ld-mat'), ldBrand: getStr('ld-brand'), ldLb: getStr('ld-lb'),
        mlLine: getStr('ml-line'), ldLine: getStr('ld-line'), ldLen: getStr('ld-len'),
        weightSetup: getStr('weight-setup'), weight: getStr('weight'),
        weightShape: getStr('weight-shape'),
        hook: getStr('hook'), yarn: getStr('yarn'),
        foam: getStr('foam'), foam2: getStr('foam2'), bdSz: getStr('foam3')
    };
}

// Apply a preset to the form, reusing the cascade restore pattern from rig.js.
export function applyPreset(name) {
    if (!name) return;
    var presets = readPresets(), p = null;
    for (var i = 0; i < presets.length; i++) {
        if (presets[i].name === name) { p = presets[i].rig; break; }
    }
    if (!p) { showToast('Preset not found: ' + name, 'warn', 4000); return; }

    function set(id, val) {
        var el = document.getElementById(id);
        if (el && val !== undefined && val !== null && val !== '') el.value = String(val);
    }
    function setBoth(id, val) { set(id, val); set(id + '-log', val); }

    set('water-type', p.waterType); set('species', p.species);
    setBoth('ml-mat', p.mlMat); setBoth('ld-mat', p.ldMat);
    cascadeLine && (cascadeLine('mainline'), cascadeLine('leader'));
    setBoth('ml-brand', p.mlBrand); setBoth('ld-brand', p.ldBrand);
    cascadeLine && (cascadeLine('mainline'), cascadeLine('leader'));
    setBoth('ml-lb', p.mlLb); setBoth('ld-lb', p.ldLb);
    resolveLineId && (resolveLineId('mainline'), resolveLineId('leader'));

    setBoth('weight-shape', p.weightShape);
    if (p.weightShape && onWeightShapeChange) onWeightShapeChange('weight-shape');
    setBoth('weight-setup', p.weightSetup || 'sliding'); setBoth('weight', p.weight);
    setBoth('ld-len', p.ldLen); setBoth('hook', p.hook); setBoth('yarn', p.yarn);
    setBoth('foam', p.foam); setBoth('foam2', p.foam2); setBoth('foam3', p.bdSz);
    showToast('Loaded preset: ' + name, 'success', 2500);
}

export function savePreset(name) {
    if (!name || !String(name).trim()) { showToast('Enter a name for this preset.', 'warn', 4000); return; }
    name = String(name).trim().slice(0, 48);
    var presets = readPresets();
    for (var i = 0; i < presets.length; i++) {
        if (presets[i].name === name) {
            if (!confirm('Preset "' + name + '" already exists. Overwrite?')) return;
            presets.splice(i, 1); break;
        }
    }
    presets.push({ name: name, rig: captureCurrentPreset() });
    writePresets(presets); populatePresetDropdown();
    showToast('Preset saved: ' + name, 'success', 2500);
}

export function deletePreset(name) {
    if (!name || !confirm('Delete preset "' + name + '"?')) return;
    var presets = readPresets();
    for (var i = 0; i < presets.length; i++) {
        if (presets[i].name === name) { presets.splice(i, 1); break; }
    }
    writePresets(presets); populatePresetDropdown();
    showToast('Preset deleted: ' + name, 'success', 2500);
}

export function saveCurrentPreset() {
    var sel = document.getElementById('preset-select');
    var hint = (sel && sel.value) ? sel.value : 'My Rig';
    var name = prompt('Name this rig preset:', hint);
    if (name === null || !name.trim()) return;
    savePreset(name.trim());
}

export function deleteCurrentPreset() {
    var sel = document.getElementById('preset-select');
    if (!sel || !sel.value) return;
    deletePreset(sel.value);
    sel.value = '';
    var delBtn = document.getElementById('btn-delete-preset');
    if (delBtn) delBtn.style.display = 'none';
}

export function populatePresetDropdown() {
    var sel = document.getElementById('preset-select');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = '<option value="">— Load a saved rig —</option>';
    var presets = readPresets();
    for (var i = 0; i < presets.length; i++) {
        var opt = document.createElement('option');
        opt.value = presets[i].name; opt.textContent = presets[i].name;
        sel.appendChild(opt);
    }
    if (current && presets.find(function (p) { return p.name === current; })) sel.value = current;
    var delBtn = document.getElementById('btn-delete-preset');
    if (delBtn) delBtn.style.display = sel.value ? 'inline-block' : 'none';
}

export function onPresetSelect() {
    var sel = document.getElementById('preset-select');
    if (!sel) return;
    var delBtn = document.getElementById('btn-delete-preset');
    if (delBtn) delBtn.style.display = sel.value ? 'inline-block' : 'none';
    if (sel.value) applyPreset(sel.value);
}

export function loadPresets() { populatePresetDropdown(); }