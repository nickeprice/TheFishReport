/**
 * scripts/complete-step.js — Atomic step completion.
 * Usage: node scripts/complete-step.js <N> "<description>"
 *        node scripts/complete-step.js <N> "<description>" --fix
 *
 * Lifecycle:
 *   1. Run sanity_pass.js, compare failures against .sanity-baseline
 *   2. Update memory-bank/plan.md checklist
 *   3. git add + commit + push
 *   4. Print next step
 */
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var stepNum = process.argv[2];
var description = process.argv[3];
var isFix = process.argv[4] === '--fix';
var planFile = path.join(__dirname, '..', 'memory-bank', 'plan.md');
var baselineFile = path.join(__dirname, '..', '.sanity-baseline');

if (!stepNum || !description) {
    console.error('Usage: node scripts/complete-step.js <N> "<description>" [--fix]');
    process.exit(1);
}

// --- Step 1: Verification ---
console.log('=== Verifying sanity_pass.js ===');
try {
    var sanityOut = cp.execSync('node', [path.join(__dirname, '..', 'sanity_pass.js'), '--quiet'], { timeout: 60000 });
    console.log('sanity_pass.js: PASSED');
} catch (sanityErr) {
    var stderr = sanityErr.stderr ? sanityErr.stderr.toString() : '';
    var stdout = sanityErr.stdout ? sanityErr.stdout.toString() : '';
    var output = stdout + stderr;
    var failMatch = output.match(/FAILED (\d+)/);
    var failCount = failMatch ? parseInt(failMatch[1], 10) : 999;
    
    var baselineStr = '0';
    try { baselineStr = fs.readFileSync(baselineFile, 'utf-8').trim(); } catch (e) {}
    var baseline = parseInt(baselineStr, 10) || 0;
    
    if (failCount <= baseline) {
        console.log('sanity_pass.js: ' + failCount + ' failures (within baseline of ' + baseline + ') — proceeding');
    } else {
        console.error('sanity_pass.js FAILED: ' + failCount + ' failures exceeds baseline of ' + baseline);
        console.error(output);
        process.exit(1);
    }
}

// --- Step 2: Markdown Update ---
console.log('=== Updating plan.md ===');
var planContent = fs.readFileSync(planFile, 'utf-8');
var lines = planContent.split('\n');
var found = false;

if (isFix) {
    // Append to Fixes section
    var fixLine = '- [x] Fix Step ' + stepNum + ': ' + description;
    if (planContent.indexOf('### Fixes') >= 0) {
        planContent = planContent.replace('### Fixes\n', '### Fixes\n' + fixLine + '\n');
    } else {
        planContent = planContent.trim() + '\n\n### Fixes\n' + fixLine + '\n';
    }
    console.log('Fix appended for Step ' + stepNum);
} else {
    // Find and mark the step checkbox
    var stepPattern = new RegExp('(- \\[ \\]\\s*' + stepNum + '\\.)', '');
    if (stepPattern.test(planContent)) {
        planContent = planContent.replace(stepPattern, '- [x] ' + stepNum + '.');
        found = true;
        console.log('Step ' + stepNum + ' marked [x]');
    } else {
        console.log('Step ' + stepNum + ' not found or already marked — proceeding');
    }
}

fs.writeFileSync(planFile, planContent);

// --- Step 3: Atomic Git Operation ---
console.log('=== Committing and pushing ===');
var commitMsg = isFix
    ? 'Fix (Step ' + stepNum + '): ' + description
    : 'Step ' + stepNum + ': ' + description;

try {
    cp.execSync('git', ['add', '-A'], { cwd: path.join(__dirname, '..') });
    cp.execSync('git', ['commit', '-m', commitMsg], { cwd: path.join(__dirname, '..') });
    cp.execSync('git', ['push', 'origin', 'HEAD'], { cwd: path.join(__dirname, '..') });
    console.log('Pushed: ' + commitMsg);
} catch (gitErr) {
    console.error('Git operation failed: ' + (gitErr.stderr ? gitErr.stderr.toString() : gitErr.message));
    process.exit(1);
}

// --- Step 4: Next Task Output ---
var nextMatch = planContent.match(/- \[ \]\s*(\d+)\./);
if (nextMatch) {
    console.log('[SUCCESS] Step completed and pushed. Next up: Step ' + nextMatch[1] + '.');
} else {
    console.log('[SUCCESS] Step completed and pushed. All steps are done!');
}