/**
 * src/shared/gear-options.js — single source of truth for all gear-form dropdown
 * options and rig-search ranges. Do NOT duplicate these values anywhere else.
 * Reference `GEAR_OPTIONS` instead.
 *
 * public: GEAR_OPTIONS, populateStaticGear()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */

var GEAR_OPTIONS = {
  hook: [
    { val: 2, label: 'Size 2' },
    { val: 1, label: 'Size 1' },
    { val: 0, label: '1/0' },
    { val: -1, label: '2/0' }
  ],
  yarn: [
    { val: 0, label: 'None' },
    { val: 0.5, label: '1/2"' },
    { val: 1, label: '1"' },
    { val: 1.5, label: '1.5"' },
    { val: 2, label: '2"' }
  ],
  foam: [
    { val: '0', label: 'None' },
    { val: '14', label: 'Corky 14 (7mm)' },
    { val: '12', label: 'Corky 12 (8.4mm)' },
    { val: '10', label: 'Corky 10 (10mm)' },
    { val: 'c12', label: 'Cheater 10' }
  ],
  beadMat: [
    { val: 'none', label: 'None' },
    { val: 'hard', label: 'Plastic' },
    { val: 'soft', label: 'Soft' }
  ],
  beadSize: [
    { val: 0, label: 'None' },
    { val: 2, label: '2mm' },
    { val: 4, label: '4mm' },
    { val: 6, label: '6mm' },
    { val: 8, label: '8mm' }
  ],
  weight: [
    { val: 0.25, label: '1/4 oz' },
    { val: 0.375, label: '3/8 oz' },
    { val: 0.5, label: '1/2 oz' },
    { val: 0.625, label: '5/8 oz' },
    { val: 0.75, label: '3/4 oz' }
  ],
  lineMat: {
    ml: [
      { val: 'braid', label: 'Braid' },
      { val: 'mono', label: 'Mono' },
      { val: 'copoly', label: 'Copoly' }
    ],
    ld: [
      { val: 'mono', label: 'Mono' },
      { val: 'copoly', label: 'Copoly' },
      { val: 'fluoro', label: 'Fluorocarbon' }
    ]
  },
  leaderLen: [6, 7, 8, 9, 10, 11, 12],
  foamMap: { '14': 'corky-14', '12': 'corky-12', '10': 'corky-10', 'c12': 'cheater-12' },
  hookIdMap: { '2': 'hook-2', '1': 'hook-1', '0': 'hook-1-0', '-1': 'hook-2-0' }
};

// Populate all static gear dropdowns from GEAR_OPTIONS (offline fallback before
// tackle.json loads). Runs immediately on load. Mirrors both -sim and -log tabs.
function populateStaticGear() {
  var fields = [
    { id: 'weight', items: GEAR_OPTIONS.weight },
    { id: 'hook', items: GEAR_OPTIONS.hook },
    { id: 'yarn', items: GEAR_OPTIONS.yarn },
    { id: 'foam', items: GEAR_OPTIONS.foam },
    { id: 'foam2', items: GEAR_OPTIONS.foam },
    { id: 'bd-mat', items: GEAR_OPTIONS.beadMat },
    { id: 'bd-sz', items: GEAR_OPTIONS.beadSize },
    { id: 'ml-mat', items: GEAR_OPTIONS.lineMat.ml },
    { id: 'ld-mat', items: GEAR_OPTIONS.lineMat.ld }
  ];
  for (var f = 0; f < fields.length; f++) {
    var sel = document.getElementById(fields[f].id);
    if (!sel) continue;
    var html = '<option value="">—</option>';
    for (var i = 0; i < fields[f].items.length; i++) {
      var o = fields[f].items[i];
      html += '<option value="' + o.val + '">' + o.label + '</option>';
    }
    sel.innerHTML = html;
    // Mirror to the -log twin
    var logSel = document.getElementById(fields[f].id + '-log');
    if (logSel) logSel.innerHTML = html;
  }
}

// Run immediately on DOM-ready — guard with typeof check for test contexts.
if (typeof document !== 'undefined' && document.getElementById) {
  populateStaticGear();
}