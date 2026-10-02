var fs = require('fs');
var path = require('path');
var ROOT = '.';

// Load all the modules the test loads
global.window = {};
global.document = { getElementById: function() { return null; }, querySelector: function() { return null; } };

eval(fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/inputs.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/physics.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/sonar.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/zone.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/shared/tackle.js'), 'utf8'));
TACKLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/tackle.json'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/shared/forms.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/techniques/drift.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/registry.js'), 'utf8'));

// Stub getActiveReport used by zone.js
function getActiveReport() { return null; }

function ldRow(mat, lb) {
  var lines = tackleItems('line');
  for (var i = 0; i < lines.length; i++) {
    var it = lines[i];
    if (it.material !== mat || Number(it.lb_test) !== Number(lb)) continue;
    if (isGenericLine(it)) return it;
  }
  return null;
}

var reportsData = [];
var extraSrc = ['src/shared/forms.js', 'src/features/gear-sim/techniques/drift.js',
  'src/features/gear-sim/registry.js']
  .map(function(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }).join('\n');
eval(extraSrc);

var rig = {
  flow: 1040, weightOz: 0.5, ldLen: 8, ldMat: 'mono', ldLb: 12,
  mlMat: 'mono', mlLb: 15, hook: 2, yarn: 0,
  foam: parseFoam('12'), foam2: parseFoam('0'), bdMat: 'hard', bdSz: 6, species: 'Chinook'
};
var lr = ldRow('mono', 12);
rig.ldDia = lr ? Number(lr.diameter_mm) : 0;
var t = gearTechnique();
var got = t.compute(rig, { flow: 1040, species: 'Chinook', dbArray: [] });

console.log('hgt=' + got.hgt);
console.log('score=' + got.score);
console.log('bottom=' + got.velocity.bottom);
console.log('mean=' + got.velocity.mean);
console.log('zone.min=' + got.zone.min + ' zone.max=' + got.zone.max);
console.log('blownOut=' + got.blownOut);
console.log('suggestions=' + JSON.stringify(got.suggestions));
console.log('lift=' + got.lift);
console.log('dragPerFt=' + got.dragPerFt);
console.log('whereToFish=' + got.whereToFish);
console.log('outlook=' + got.outlook);

// On-target rig
var rigOn = Object.assign({}, rig, { ldLen: 6, weightOz: 0.25, foam: parseFoam('10') });
rigOn.ldDia = rig.ldDia;
var gotOn = t.compute(rigOn, { flow: 1040, species: 'Chinook', dbArray: [] });
console.log('\nON-TARGET:');
console.log('hgt=' + gotOn.hgt);
console.log('zone.min=' + gotOn.zone.min + ' zone.max=' + gotOn.zone.max);
console.log('suggestions=' + JSON.stringify(gotOn.suggestions));
console.log('outlook=' + gotOn.outlook);
console.log('score=' + gotOn.score);