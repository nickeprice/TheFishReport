/**
 * src/shared/gear-options.js — single source of truth for all gear-form dropdown
 * options and rig-search ranges. Do NOT duplicate these values anywhere else.
 * Reference `GEAR_OPTIONS` instead.
 *
 * public: GEAR_OPTIONS, populateStaticGear()
 * ES module.
 */

export var GEAR_OPTIONS = {
  hook: [
    { val: 'gam-oct-3', label: 'Gamakatsu Octopus 3' },
    { val: 'gam-oct-2', label: 'Gamakatsu Octopus 2' },
    { val: 'gam-oct-1', label: 'Gamakatsu Octopus 1' },
    { val: 'gam-oct-1-0', label: 'Gamakatsu Octopus 1/0' },
    { val: 'gam-oct-2-0', label: 'Gamakatsu Octopus 2/0' },
    { val: 'gam-fwg-3', label: 'Gamakatsu Wide Gap 3' },
    { val: 'gam-fwg-2', label: 'Gamakatsu Wide Gap 2' },
    { val: 'gam-fwg-1', label: 'Gamakatsu Wide Gap 1' },
    { val: 'gam-fwg-1-0', label: 'Gamakatsu Wide Gap 1/0' },
    { val: 'gam-fwg-2-0', label: 'Gamakatsu Wide Gap 2/0' },
    { val: 'owner-ssw-3', label: 'Owner SSW 3' },
    { val: 'owner-ssw-2', label: 'Owner SSW 2' },
    { val: 'owner-ssw-1', label: 'Owner SSW 1' },
    { val: 'owner-ssw-1-0', label: 'Owner SSW 1/0' },
    { val: 'owner-ssw-2-0', label: 'Owner SSW 2/0' }
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
    { val: '14', label: 'Corky 14' },
    { val: '12', label: 'Corky 12' },
    { val: '10', label: 'Corky 10' },
    { val: '8', label: 'Corky 8' },
    { val: '6', label: 'Corky 6' },
    { val: 'c14', label: 'Cheater 14' },
    { val: 'c12', label: 'Cheater 12' },
    { val: 'c10', label: 'Cheater 10' },
    { val: 'c8', label: 'Cheater 8' },
    { val: 'c6', label: 'Cheater 6' }
  ],
  beadSize: [
    { val: 0, label: 'None' },
    { val: 4, label: '4mm' },
    { val: 5, label: '5mm' },
    { val: 5.8, label: '6mm' },
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
  foamMap: { '14': 'corky-14', '12': 'corky-12', '10': 'corky-10', '8': 'corky-8', '6': 'corky-6', 'c14': 'cheater-14', 'c12': 'cheater-12', 'c10': 'cheater-10', 'c8': 'cheater-8', 'c6': 'cheater-6' },
  hookIdMap: { 'gam-oct-3': 'hook-gam-oct-3', 'gam-oct-2': 'hook-gam-oct-2', 'gam-oct-1': 'hook-gam-oct-1', 'gam-oct-1-0': 'hook-gam-oct-1-0', 'gam-oct-2-0': 'hook-gam-oct-2-0', 'gam-fwg-3': 'hook-gam-fwg-3', 'gam-fwg-2': 'hook-gam-fwg-2', 'gam-fwg-1': 'hook-gam-fwg-1', 'gam-fwg-1-0': 'hook-gam-fwg-1-0', 'gam-fwg-2-0': 'hook-gam-fwg-2-0', 'owner-ssw-3': 'hook-owner-ssw-3', 'owner-ssw-2': 'hook-owner-ssw-2', 'owner-ssw-1': 'hook-owner-ssw-1', 'owner-ssw-1-0': 'hook-owner-ssw-1-0', 'owner-ssw-2-0': 'hook-owner-ssw-2-0' }
};
window.GEAR_OPTIONS = GEAR_OPTIONS;

// Populate all static gear dropdowns from GEAR_OPTIONS (offline fallback before
// tackle.json loads). Runs immediately on load. Mirrors both -sim and -log tabs.
export function populateStaticGear() {
  var fields = [
    { id: 'weight', items: GEAR_OPTIONS.weight },
    { id: 'hook', items: GEAR_OPTIONS.hook },
    { id: 'yarn', items: GEAR_OPTIONS.yarn },
    { id: 'foam', items: GEAR_OPTIONS.foam },
    { id: 'foam2', items: GEAR_OPTIONS.foam },
    { id: 'foam3', items: GEAR_OPTIONS.beadSize },
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