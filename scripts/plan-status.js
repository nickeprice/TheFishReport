/**
 * scripts/plan-status.js — Read-only status check.
 * Usage: node scripts/plan-status.js
 * Prints: total steps, completed count, pending count, next pending step.
 * Exit 0 if tasks remain. Exit 2 if all done.
 */
var fs = require('fs');
var path = require('path');

var planFile = path.join(__dirname, '..', 'memory-bank', 'plan.md');
var content = fs.readFileSync(planFile, 'utf-8');

var lines = content.split('\n');
var total = 0, completed = 0, pending = 0, nextStep = null;

for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var doneMatch = line.match(/^\s*- \[x\]\s*(\d+)\./);
    var pendMatch = line.match(/^\s*- \[ \]\s*(\d+)\./);

    if (doneMatch) {
        total++;
        completed++;
    }
    if (pendMatch) {
        total++;
        pending++;
        if (!nextStep) {
            nextStep = pendMatch[1];
        }
    }
}

console.log('Total steps: ' + total);
console.log('Completed:   ' + completed);
console.log('Pending:     ' + pending);
if (nextStep) {
    console.log('Next up:     Step ' + nextStep);
} else {
    console.log('Next up:     (none — all done)');
}

if (pending > 0) {
    process.exit(0);
} else {
    process.exit(2);
}