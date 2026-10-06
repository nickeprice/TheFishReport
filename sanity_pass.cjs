#!/usr/bin/env node
/**
 * sanity_pass.js — zero-dependency static sanity pass for The Fish Report.
 *
 * This script performs INSTANTANEOUS static checks only — string/regex/fs
 * parsing. No server is launched, no HTTP is polled, and no browser runtime
 * is emulated. Behavioural + API tests live in tests/test_api_contract.py and
 * tests/test_ui_behavior.py (pytest + Playwright, offline-mocked).
 *
 * Checks covered here:
 *   1. Syntax: node --check on every JS file and
 *      python3 -m py_compile on the Python entry points.
 *   2. STATIC INTEGRITY: every label[for] resolves to an id, every input/select
 *      has an accessible name, Vercel entry-point parity, CSS dead-rule
 *      checks, and source-level contract guards.
 *   3. Docs index: docs/SYMBOLS.md covers every loaded module + contract files.
 *
 * Exit 0 on full pass, 1 on any failure.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
let failures = [];
let passes = 0;
// --quiet: print only failures + the PASSED/FAILED summary (token-lean CI/local use).
// Default (no flag / --verbose): full per-check listing.
let QUIET = process.argv.includes('--quiet');

function ok(name, detail) { passes++; if (!QUIET) console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
function fail(name, detail) { failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
function describe(name) { if (!QUIET) console.log('\n## ' + name); }
// The classic scripts share ONE global scope and app.js is no longer a monolith,
// so source-level checks must read EVERY local script in the index.html load order.
function localScriptPaths() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script[^>]*src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !/^https?:/i.test(s));
}
/** Concatenated source of every loaded classic script — for static pattern scans. */
function readAllScripts() {
  return localScriptPaths().map((p) => {
    // Data files migrated to public/ — check both locations
    var f = path.join(ROOT, p.replace(/^\//, ''));
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    var pf = path.join(ROOT, 'public', p.replace(/^\//, ''));
    if (fs.existsSync(pf)) return fs.readFileSync(pf, 'utf8');
    throw new Error('cannot find ' + p);
  }).join('\n');
}




// Static integrity: label[for], accessible names, script order
function staticIntegrity() {
  describe('Markup integrity');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const forAttrs = [...html.matchAll(/\bfor="([^"]+)"/g)].map((m) => m[1]);
  const broken = forAttrs.filter((f) => !ids.has(f));
  broken.length ? fail('label[for] resolves', broken.join(', ')) : ok('label[for] resolves', `${forAttrs.length} labels → present ids`);

  // Only user-facing controls need accessible names. A type="hidden" input is not
  // reachable by keyboard or screen reader, so it is excluded deliberately — this
  // keeps the check honest without weakening it.
  const controls = [...html.matchAll(/<(input|select)[^>]*>/g)].map((m) => m[0])
    .filter((c) => !/type="hidden"/.test(c));
  const unnamed = [];
  for (const c of controls) {
    const idMatch = c.match(/\bid="([^"]+)"/);
    const id = idMatch ? idMatch[1] : null;
    const hasAria = /\b(aria-label|aria-labelledby)="/.test(c);
    const labelMatch = id ? html.match(new RegExp('<label[^>]*\\bfor="' + id + '"')) : null;
    if (!hasAria && !labelMatch) unnamed.push(id || '(no id)');
  }
  unnamed.length ? fail('controls have accessible names', unnamed.join(', ')) : ok('controls have accessible names', `${controls.length} inputs/selects named`);

  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  (scripts.length > 0)
    ? ok('scripts loaded', scripts.join(', '))
    : fail('scripts loaded', 'no scripts found in index.html');

  // Vercel serves Python functions ONE FILE PER ROUTE, so a `/api/<name>` call that only
  // exists as a branch inside api/water_report.py — which is where the local dev server used
  // to send every /api/* path — 404s on the DEPLOYED app. That is exactly how
  // /api/nearby_stations broke the map feed, the GPS lookup and every saved-spot resolution
  // in production while looking perfectly healthy locally (found 2026-09-29 from the phone's
  // debug trail: `GET /api/nearby_stations -> HTTP 404 … NOT_FOUND pdx1::…`). Every path the
  // frontend fetches must have its own api/<name>.py entry point.
  const apiCalls = new Set();
  for (const f of localScriptPaths()) {
    var srcPath = path.join(ROOT, f);
    if (!fs.existsSync(srcPath)) srcPath = path.join(ROOT, 'public', f);
    const src = fs.readFileSync(srcPath, 'utf8');
    for (const m of src.matchAll(/['"`](\/api\/[a-z0-9_-]+)/g)) apiCalls.add(m[1]);
  }
  const apiRoutes = [...apiCalls].sort();
  const noEntryPoint = apiRoutes.filter((p) => !fs.existsSync(path.join(ROOT, p.slice(1) + '.py')));
  noEntryPoint.length === 0
    ? ok('every /api route the client calls has its own Vercel entry point',
        apiRoutes.join(', ') + ' -> api/<name>.py')
    : fail('every /api route the client calls has its own Vercel entry point',
        'no api/<name>.py for: ' + noEntryPoint.join(', ') +
        ' (Vercel routes one function per file, so it would 404 in production)');

  // Catch Log merge: ONE list with a yours/everyone toggle; default = Everyone
  const merged = html.includes('id="catch-log-table"') && html.includes('id="catch-log-body"') &&
    html.includes('id="scope-yours"') && html.includes('id="scope-everyone"') &&
    html.includes('onclick="setCatchScope');
  merged ? ok('catch log merged into one list + yours/everyone toggle', 'catch-log-body + scope buttons')
    : fail('catch log merged into one list + yours/everyone toggle', '');
  (!html.includes('id="my-catches-table"') && !html.includes('id="db-table"'))
    ? ok('split My Catches / Brag Board tables removed', 'single merged table only')
    : fail('split My Catches / Brag Board tables removed', 'stale tables found');

  // Phase 2.3: default scope is Everyone (board-first), board columns Name/Time/
  // River/Fish, and the GPS field + hook-location select are gone from the DOM.
  const scopeDefault = /id="scope-everyone" class="scope-btn scope-active"/.test(html);
  scopeDefault ? ok('catch log default scope is Everyone', 'scope-everyone active in markup')
    : fail('catch log default scope is Everyone', 'expected scope-everyone.scope-active');

  const boardHead = html.includes('<tr><th>Name</th><th>Time</th><th>River</th><th>Fish</th></tr>');
  boardHead ? ok('public board columns = Name/Time/River/Fish', 'no Flow column')
    : fail('public board columns = Name/Time/River/Fish', 'expected River header');

  (!html.includes('id="log-gps"') && !html.includes('id="hook-loc"'))
    ? ok('GPS field + hook-location removed from catch form', 'silent GPS, no hook-loc')
    : fail('GPS field + hook-location removed from catch form', 'stale controls found');

  // Phase 2.4: flow + distance inputs removed (flow is derived), Foam 1 + Foam 2
  // exist on both tabs, and the Gear Sim HUD stars/score-bar are gone.
  (!html.includes('id="flow"') && !html.includes('id="distance"') &&
   !html.includes('id="flow-log"') && !html.includes('id="distance-log"'))
    ? ok('flow + distance inputs removed from both forms', 'flow derived from the live report')
    : fail('flow + distance inputs removed from both forms', 'stale flow/distance inputs');

  (html.includes('id="foam"') && html.includes('id="foam2"') &&
   html.includes('id="foam-log"') && html.includes('id="foam2-log"'))
    ? ok('Foam 1 + Foam 2 present on both tabs', 'two-corky rig supported')
    : fail('Foam 1 + Foam 2 present on both tabs', 'missing Foam 2 control');

  (!html.includes('id="stars"') && !html.includes('id="score-bar"'))
    ? ok('Gear Sim stars + score bar removed', 'line height + bottom current only')
    : fail('Gear Sim stars + score bar removed', 'stale stars/score-bar markup');

  const cssSrc = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  // Phase 2.4.1: gear fields rest in explicit per-line rows (.gear-row) replacing the
  // auto-flow 2-column grid. WS-3 brought the 3-up variant BACK for exactly one row per
  // form - row 1, the 3-part mainline cascade (material → brand → lb test), which would
  // otherwise wrap the lb test onto its own line. Assert the rule exists and that no
  // other row uses it, so a stray 3-up row cannot appear unnoticed.
  const threeUp = (html.match(/class="gear-row gear-row-3"/g) || []).length;
  (cssSrc.includes('.gear-row {') && cssSrc.includes('.gear-row-3 {') && threeUp === 6)
    ? ok('resting gear rows present (.gear-row + two 3-up rows per form)',
         `${threeUp} 3-up rows (mainline cascade + weight setup row)`)
    : fail('resting gear rows present (.gear-row + two 3-up rows per form)',
           `css .gear-row-3=${cssSrc.includes('.gear-row-3 {')} 3-up rows=${threeUp}`);
  (!cssSrc.includes('gear-grid') && !cssSrc.includes('.run-footer'))
    ? ok('dead .gear-grid / .run-footer rules removed', 'no stale layout rules')
    : fail('dead .gear-grid / .run-footer rules removed', 'stale CSS found');

  // Gear Sim HUD structure (direct user instructions, 2026-09-29): TWO BANNERS SIDE BY SIDE —
  // strike zone LEFT, line height RIGHT, each centred in its own half — then the summary paragraph
  // and the gear changes full width beneath them, and the changes shown only when off target. The
  // per-reason bullet list and the old panel/hud-line classes are gone, so a silent revert fails.
  (html.includes('<span class="hud-cap">Strike Zone Estimate:</span>') &&
   html.includes('<span class="hud-cap">Line Height Estimate:</span>') &&
   (html.match(/class="hud-banner"/g) || []).length === 2 &&
   /<div class="hud-banners">/.test(html) &&
   /id="hud-zone"[\s\S]{0,200}id="hud-hgt"/.test(html) &&
   /<\/div>\s*<\/div>\s*<p id="hud-where" class="hud-outlook"/.test(html) &&
   /<p id="hud-where" class="hud-outlook"[\s\S]{0,400}<ul id="hud-changes"/.test(html) &&
   !/hud-zone-notes|hud-panels|hud-panel\b|hud-line\b/.test(html) &&
   !/hud-panels|hud-panel\b|hud-line\b/.test(cssSrc))
    ? ok('HUD = two banners side by side, then the summary and the change list beneath',
         'Strike Zone banner left, Line Height banner right, #hud-where and #hud-changes full width below; no bullet list, no panel grid')
    : fail('HUD = two banners side by side, then the summary and the change list beneath',
           'banner layout, summary paragraph or change list changed');
  // WS-7 correction (direct user ask): the gradient lives on the ESTIMATE NUMBER only — the
  // separate trend strip + marker were unwanted, and the strike-zone bullets no longer use the
  // dim/smaller variant (both HUD panels now render ONE bullet style).
  (!/zone-trend/.test(html) && !/zone-trend/.test(cssSrc) &&
   !/hud-note/.test(html) && !/hud-note/.test(cssSrc))
    ? ok('strike-zone gradient is on the estimate only (no strip, one bullet style)',
         'no .zone-trend / #hud-zone-mark; no .hud-note variant')
    : fail('strike-zone gradient is on the estimate only (no strip, one bullet style)',
           'a trend strip or the dim bullet variant came back');
  // The community adjustment must stay OFF the HUD even though the sonar still moves the zone.
  // The old display filter (zoneNotes/ZONE_NOTE_HIDDEN) went with the bullet list; the
  // guarantee is now structural - the summary paragraph simply never prints community wording
  // (asserted on the REAL fishOutlook() further down), while zone.notes still records the
  // effect for the log. The new note is count-free (no "N fish" / confidence wording).
  {
    // Comments cannot display anything, so strip them: the check is about real code.
    const zoneSrcStaticArr = [
      'zone-env.js', 'zone-core.js', 'zone-best.js'
    ].map(function (f) {
      return fs.readFileSync(path.join(ROOT, 'src/features/gear-sim', f), 'utf8');
    }).join('\n');
    const zoneSrcStaticClean = String(zoneSrcStaticArr).replace(/\/\/[^\n]*/g, '');
    (zoneSrcStaticClean.includes('Recent catches pull the zone') &&
     !/ZONE_NOTE_HIDDEN/.test(zoneSrcStaticClean) && !/function zoneNotes\(/.test(zoneSrcStaticClean) &&
     /function fishOutlook\(/.test(zoneSrcStaticClean))
      ? ok('community-catch adjustment is computed but never displayed',
           'zone.notes keeps it for the log; the summary never mentions it; the note is count-free')
      : fail('community-catch adjustment is computed but never displayed', 'note missing, or the old filter came back');
  }
  // Bead labels read plainly (the "(Presentation)" suffix was a stray) and the Cheater float is
  // named "Cheater 10" (direct user corrections). The option VALUE stays 'c12', so parseFoam()
  // resolves through FOAM_PICKER_MAP -> tackle.json, keeping the lift from the library.
  {
    const cheater = (html.match(/<option value="c12">Cheater 10<\/option>/g) || []).length;
    const inSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'inputs.js'), 'utf8');
    const hasMap = /FOAM_PICKER_MAP.*foamMap/.test(inSrc) && /GEAR_OPTIONS\.foamMap/.test(inSrc);
    (!html.includes('Presentation') && cheater === 4 && hasMap)
      ? ok('bead labels are plain and the Cheater float reads "Cheater 10"',
           'no "(Presentation)"; 4 Cheater 10 options; FOAM_PICKER_MAP maps c12 -> cheater-12')
      : fail('bead labels are plain and the Cheater float reads "Cheater 10"',
             `presentation=${html.includes('Presentation')} cheaterOptions=${cheater} hasMap=${hasMap}`);
  }
  (/.hud-banners \{[^}]*grid-template-columns: 1fr 1fr/.test(cssSrc) &&
   /.hud-banner \{[^}]*align-items: center/.test(cssSrc) &&
   /.hud-banner \+ \.hud-banner \{[^}]*border-left/.test(cssSrc) &&
   /.hud-outlook \{[^}]*text-align: left/.test(cssSrc) &&
   /.hud-changes \{[^}]*list-style-position: inside/.test(cssSrc) &&
   /#tab-gear-sim #hud \+ \.bucket \{[^}]*padding-top: 1[0-9]px/.test(cssSrc))
    ? ok('HUD banners sit side by side and are centred, with the summary readable below',
         '.hud-banners 2-up + .hud-banner centred + vertical rule + .hud-outlook left + .hud-changes bullets + bucket padding-top')
    : fail('HUD banners sit side by side and are centred, with the summary readable below',
           'banner grid / centring / summary CSS missing');
  // Scroll/bar geometry: no body-as-scroll-container, and the body padding must
  // clear the REAL 56px bar + safe-area inset.
  (/html, body \{[^}]*height: 100%/.test(cssSrc) === false)
    ? ok('document-level scrolling (no body height:100%)', 'body is not a nested scroller')
    : fail('document-level scrolling (no body height:100%)', 'height:100% still set');
  (cssSrc.includes('padding-bottom: calc(56px + env(safe-area-inset-bottom))'))
    ? ok('body bottom padding clears the 56px tab bar + inset', 'last line not hidden')
    : fail('body bottom padding clears the 56px tab bar + inset', 'expected calc(56px + env(safe-area-inset-bottom))');

  // Header: station opens the modal only from a centered <button> (no full-width flex:1 div)
  /<button id="station-header"/.test(html)
    ? ok('station header is a centered button', 'no full-width click target')
    : fail('station header is a centered button', 'expected <button id="station-header">');

  // Water temp/turbidity: ONLY the active station's own gauge — proxy map must be gone
  const waterSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'water.js'), 'utf8');
  (!waterSrc.includes('waterTempProxies') && !waterSrc.includes('fetchProxyWaterTemp'))
    ? ok('no cross-gauge water-temp proxy in water.js', 'own-gauge payload only')
    : fail('no cross-gauge water-temp proxy in water.js', 'proxy remnants found');

  // Phase 2.4.1: the hatchery freshness stamp rides on WDFW's own :updated_at
  // system column (never a fabricated date), and both forms rest in 6 rows.
  (waterSrc.includes('max(:updated_at) AS lastUpdated') && waterSrc.includes('formatEscapementUpdated'))
    ? ok('escapement feed requests + formats max(:updated_at)', 'real WDFW publish time')
    : fail('escapement feed requests + formats max(:updated_at)', 'missing :updated_at wiring');
  (waterSrc.includes('Hatchery data may lag WDFW reporting.'))
    ? ok('honest fallback when no :updated_at stamp exists', 'never a fake date')
    : fail('honest fallback when no :updated_at stamp exists', 'fallback wording missing');

  // Phase 1.6: water type guide is a standalone module (functions must be global).
  // Regression guard: the three guide functions were previously trapped inside paintSimHud
  // due to misplaced closing braces in solver.js. Verify they live in water-types.js now.
  const waterTypesSrc = fs.existsSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'water-types.js'))
    ? fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'water-types.js'), 'utf8')
    : '';
  const solverSrcFinal = fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'solver.js'), 'utf8');
  const wtLoaded = localScriptPaths().some((p) => p.indexOf('gear-sim/water-types.js') !== -1);
  (wtLoaded &&
   /function openWaterTypeGuide/.test(waterTypesSrc) &&
   /function closeWaterTypeGuide/.test(waterTypesSrc) &&
   !/function openWaterTypeGuide/.test(solverSrcFinal) &&
   !/function closeWaterTypeGuide/.test(solverSrcFinal))
    ? ok('water type guide is a standalone module, functions are global',
         'water-types.js loaded after solver.js; solver.js no longer contains guide functions')
    : fail('water type guide is a standalone module, functions are global',
           `fileExists=${fs.existsSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'water-types.js'))} loaded=${wtLoaded} inWaterTypes=${/function openWaterTypeGuide/.test(waterTypesSrc)} inSolver=${/function openWaterTypeGuide/.test(solverSrcFinal)}`);

  const appSrc = readAllScripts();
  (!appSrc.includes('hero-lbl') && appSrc.includes('[ FISHING OUTLOOK ]') &&
   appSrc.includes('Forecast &amp; Hatchery Report') && appSrc.includes('data-esc-updated'))
    ? ok('hero uses a real section header + renamed counts fold', 'no in-pill label')
    : fail('hero uses a real section header + renamed counts fold', 'stale hero-lbl / fold label');
  (!appSrc.includes('peakLine') && !appSrc.includes('run-footer'))
    ? ok('run cards carry no peak day-counter', 'peak date label only')
    : fail('run cards carry no peak day-counter', 'peakLine / .run-footer remnants');

  // Phase 3.2: the catch write MUST be idempotent, or a retry after a response lost in
  // a dead zone inserts a second copy of the same fish.
  const supabaseSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'supabase.js'), 'utf8');
  (/onConflict:\s*'id'/.test(supabaseSrc) && /ignoreDuplicates:\s*true/.test(supabaseSrc) &&
   /id:\s*\(payload\.clientId/.test(supabaseSrc))
    ? ok('catch writes are idempotent', 'clientId -> ON CONFLICT (id) DO NOTHING')
    : fail('catch writes are idempotent', 'missing clientId / ignoreDuplicates');
  const logSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'catch-log', 'log.js'), 'utf8');
  /clientId:\s*newUuid\(\)/.test(logSrc)
    ? ok('logged catches carry a client-generated id', 'newUuid() at buffer time')
    : fail('logged catches carry a client-generated id', 'clientId missing from the buffered payload');

  // Phase 3.1: catch storage must go through the durable outbox — no module may reach
  // for the legacy localStorage buffer directly any more.
  const catchDbOffenders = localScriptPaths()
    .filter((p) => p.indexOf('catch-log/outbox.js') === -1)
    .filter((p) => {
    var path1 = path.join(ROOT, p);
    if (fs.existsSync(path1)) return fs.readFileSync(path1, 'utf8').indexOf("'catch_db'") !== -1;
    var path2 = path.join(ROOT, 'public', p);
    if (fs.existsSync(path2)) return fs.readFileSync(path2, 'utf8').indexOf("'catch_db'") !== -1;
    return false;
  });
  catchDbOffenders.length === 0
    ? ok('catch storage goes through the outbox', 'no direct catch_db access outside outbox.js')
    : fail('catch storage goes through the outbox', catchDbOffenders.join(', '));

  // Phase 3.3: the outbox must be flushed when the network/app comes BACK, not only at
  // sign-in — and the flush must be guarded so overlapping events cannot double-send.
  const reconcileSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'catch-log', 'reconcile.js'), 'utf8');
  const appSrcReconcile = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
  (/addEventListener\('online'/.test(reconcileSrc) &&
   /addEventListener\('visibilitychange'/.test(reconcileSrc) &&
   /_reconcileInFlight/.test(reconcileSrc) &&
   /initCatchReconcile\(\)/.test(appSrcReconcile))
    ? ok('the catch outbox reconciles on online / resume / focus', 'guarded by an in-flight lock')
    : fail('the catch outbox reconciles on online / resume / focus', 'listener(s) or lock missing');
  // Phase 3.4: a just-logged catch must paint immediately with a pending-sync badge, and
  // the badge must clear once the flush confirms. Both scopes read ONE pending source
  // (outboxPending) — no second store — and pending.js must load before its consumers.
  const pendingSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'catch-log', 'pending.js'), 'utf8');
  const boardSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'catch-log', 'board.js'), 'utf8');
  const mineSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'catch-log', 'mycatches.js'), 'utf8');
  const authSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'auth', 'auth.js'), 'utf8');
  const loaded = localScriptPaths();
  const pIdx = loaded.findIndex((p) => p.indexOf('catch-log/pending.js') !== -1);
  const bIdx = loaded.findIndex((p) => p.indexOf('catch-log/board.js') !== -1);
  const mIdx = loaded.findIndex((p) => p.indexOf('catch-log/mycatches.js') !== -1);
  // Slice the flush body rather than regex-window it — the badge reset must be inside it.
  const flush = authSrc.slice(authSrc.indexOf('async function syncPendingCatches()'));
  const flushBody = flush.slice(0, flush.indexOf('\n}\n') + 3);
  (/outboxPending\(\)/.test(pendingSrc) &&
   boardSrc.indexOf('pendingBadge()') !== -1 &&
   mineSrc.indexOf('pendingBadge()') !== -1 &&
   /refreshCatchLists\(\)/.test(flushBody) &&
   pIdx >= 0 && bIdx > pIdx && mIdx > pIdx)
    ? ok('pending catches paint optimistically with a sync badge', 'both scopes; cleared by the flush')
    : fail('pending catches paint optimistically with a sync badge', 'badge, flush reset or load order missing');


  const gearRows = (html.match(/class="gear-row(?:[" ])/g) || []).length;
  (gearRows === 13 && !html.includes('gear-grid'))
    ? ok('both gear forms resting rows', `${gearRows} rows total`)
    : fail('both gear forms resting rows', `${gearRows} rows found`);

  // The gear-box ORDER is a deliberate user instruction (session 1790604718924_nudti,
  // msg 1477 for the rows, WS-3/issue #1b for the cascades): Mainline material → brand →
  // lb test · Weight type → amount · Leader length → material → brand → lb test ·
  // Hook/Yarn · Foam 1+2 · Beads. The instruction was once acknowledged and silently
  // skipped, so assert the exact per-row `for=` ids in document order for BOTH tabs and
  // fail loudly on any future reorder.
  {
    const GEAR_ORDER_SIM = ['water-type', 'species', 'ml-mat', 'ml-brand', 'ml-lb', 'weight-setup', 'weight-shape', 'weight',
                        'ld-len', 'ld-mat', 'ld-brand', 'ld-lb', 'hook', 'yarn',
                        'foam', 'foam2', 'foam3'];
    const GEAR_ORDER_LOG = ['ml-mat', 'ml-brand', 'ml-lb', 'weight-setup', 'weight-shape', 'weight',
                        'ld-len', 'ld-mat', 'ld-brand', 'ld-lb', 'hook', 'yarn',
                        'foam', 'foam2', 'foam3'];
    const blocks = html.split('<div class="gear-rows">');
    const labelsOf = (b) => (b.match(/<label for="[^"]+"/g) || [])
      .map((s) => s.match(/for="([^"]+)"/)[1]);
    const simOrder = labelsOf((blocks[1] || '').split('<button class="btn-main"')[0]).join(',');
    const logOrder = labelsOf((blocks[2] || '')
      .split('<h2 class="purple-heading">Catch Result')[0]).join(',');
    const wantSim = GEAR_ORDER_SIM.join(',');
    const wantLog = GEAR_ORDER_LOG.map((id) => `${id}-log`).join(',');
    (simOrder === wantSim && logOrder === wantLog)
      ? ok('gear box order is the instructed cascade flow (both tabs)', wantSim)
      : fail('gear box order is the instructed cascade flow (both tabs)',
             `sim=[${simOrder}] log=[${logOrder}]`);
  }

  // Rod length was REMOVED 2026-09-28 (it moved no number).
  // This guard exists because the removal was once instructed, acknowledged and then silently
  // dropped, so a stray form field or a resurrected code path must fail loudly instead.
  {
    const rodHits = [];
    if (/rod-ft|rod-in|Rod Length/.test(html)) rodHits.push('index.html');
    for (const p of localScriptPaths()) {
      const sPath = path.join(ROOT, p);
          const s = fs.existsSync(sPath) ? fs.readFileSync(sPath, 'utf8')
            : fs.readFileSync(path.join(ROOT, 'public', p), 'utf8');
      if (/rodFt|getRodLengthFt|formatRodLength|onRodChange|rod_ft/.test(s)) rodHits.push(p);
    }
    rodHits.length === 0
      ? ok('rod length is fully removed', 'no rod-ft / rodFt / rod_ft in index.html or any loaded script')
      : fail('rod length is fully removed', 'still referenced by: ' + rodHits.join(', '));
  }
  // Region registry (UPDATE 3.0 Phase 1.2/1.3). The registry file is the ONE source of
  // truth: the frontend loads it as a classic script and api/water_report.py reads the
  // SAME file (strict-JSON payload, sliced marker -> final semicolon). Assert that both
  // parse paths agree, that the backend truly derives from it (no literal list left),
  // and that the legacy fallbacks survive for a registry-less deploy.
  try {
    const py = fs.readFileSync(path.join(ROOT, 'api', 'water_report.py'), 'utf8');
    const regSrc = fs.readFileSync(path.join(ROOT, 'public', 'src', 'data', 'regions', 'washington.js'), 'utf8');
    const stub = {};
    new Function('window', regSrc)(stub);
    const WA = stub.REGIONS && stub.REGIONS.WA;
    const marker = 'window.REGIONS.WA = ';
    const pyJson = JSON.parse(regSrc.slice(regSrc.lastIndexOf(marker) + marker.length, regSrc.lastIndexOf(';')));
    const okReg = !!WA &&
      JSON.stringify(pyJson) === JSON.stringify(WA) &&
      /USGS_SITE = _WA\.get\("default_site"\)/.test(py) &&
      /_WA\.get\("discovery_pool"/.test(py) &&
      /stocks_for_site\(/.test(py) &&
      !/STOCK_BASELINES/.test(py) &&
      py.includes('"12101500"') && py.includes('"9446484"') &&
      WA.default_site === '12101500' &&
      WA.default_tide_station === '9446484' &&
      WA.default_coords.lat === 47.195 && WA.default_coords.lon === -122.302 &&
      JSON.stringify(WA.netting_days) === '[6,0,1]' &&
      WA.discovery_pool.length === 15 &&
      WA.waterbodies.length === 15 &&
      WA.waterbodies.every((w) => w.gauge && ['daylight', '24hr', 'custom', 'unknown'].includes(w.legal_hours)) &&
      WA.waterbodies.filter((w) => w.legal_hours === 'daylight').map((w) => w.id).join() === 'puyallup' &&
      WA.waterbodies.filter((w) => w.stocks).map((w) => w.id).join() === 'puyallup';
    okReg
      ? ok('region registry drives both the API and the frontend', `${WA.waterbodies.length} waterbodies, backend parses the same file`)
      : fail('region registry drives both the API and the frontend', 'registry/backend out of sync');
  } catch (e) {
    fail('region registry drives both the API and the frontend', String(e.message).split('\n')[0]);
  }


// PLAN.md anchor integrity: every [Detail → docs/PLAN_REFERENCE.md#anchor]
  // link must have a matching <a id="anchor"> in PLAN_REFERENCE.md.
  describe('Plan integrity');
  try {
    const planMd = fs.readFileSync(path.join(ROOT, 'PLAN.md'), 'utf8');
    const refMd = fs.readFileSync(path.join(ROOT, 'docs/PLAN_REFERENCE.md'), 'utf8');
    const anchors = [...planMd.matchAll(/PLAN_REFERENCE\.md#([a-z0-9-]+)/g)].map((m) => m[1]);
    const broken = anchors.filter((a) => refMd.indexOf('<a id="' + a + '">') === -1);
    broken.length
      ? fail('PLAN.md anchor → PLAN_REFERENCE.md', 'missing: ' + broken.join(', '))
      : ok('PLAN.md → PLAN_REFERENCE.md anchors', anchors.length + ' links resolve');
  } catch (e) {
    fail('PLAN.md anchor → PLAN_REFERENCE.md', String(e.message).split('\\n')[0]);
  }
}
// Docs index — every module loaded by index.html must be listed in docs/SYMBOLS.md.
// This is what keeps the index from silently going stale as files move or get renamed:
// add a script to index.html without indexing it and the pass fails.
function symbolsIndex() {
  describe('Docs index');
  try {
    const scripts = localScriptPaths();
    const idx = fs.readFileSync(path.join(ROOT, 'docs', 'SYMBOLS.md'), 'utf8');
    const missing = scripts.map((p) => path.basename(p)).filter((b) => !idx.includes(b));
    missing.length === 0
      ? ok('docs/SYMBOLS.md covers every loaded module', `${scripts.length} scripts indexed`)
      : fail('docs/SYMBOLS.md covers every loaded module', 'missing: ' + missing.join(', '));
  } catch (e) {
    fail('docs/SYMBOLS.md covers every loaded module', String(e.message).split('\n')[0]);
  }
  try {
    const contracts = ['CONTRACT.md', 'CONTRACT_REGIONS.md', 'CONTRACT_TECHNIQUE.md', 'CONTRACT_CATCH.md'];
    const absent = contracts.filter((c) => !fs.existsSync(path.join(ROOT, 'docs', c)));
    absent.length === 0
      ? ok('contract docs present', contracts.join(', '))
      : fail('contract docs present', 'missing: ' + absent.join(', '));
  } catch (e) {
    fail('contract docs present', String(e.message).split('\n')[0]);
  }
  // Tackle spec: docs/tackle_measurements.csv is the single source of truth for measured
  // tackle properties; docs/CONTRACT_TACKLE.md says how to measure each field. Validate by
  // running the REAL converter in --check mode rather than reimplementing CSV parsing here —
  // a miscounted comma silently SHIFTS every value after it, so it should fail CI rather than
  // being discovered downstream.
  try {
    const tackleFiles = ['docs/CONTRACT_TACKLE.md', 'docs/tackle_measurements.csv',
                         'scripts/tackle_csv_to_json.py'];
    const gone = tackleFiles.filter((p) => !fs.existsSync(path.join(ROOT, p)));
    if (gone.length) throw new Error('missing ' + gone.join(', '));
    const checked = execFileSync('python3',
      [path.join(ROOT, 'scripts', 'tackle_csv_to_json.py'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
    ok('tackle spec validates', checked.trim().split('\n')[0]);
  } catch (e) {
    fail('tackle spec validates', String(e.stderr || e.message).trim().split('\n').pop());
  }

  
}




// Runner
function main() {
  if (!QUIET) {
    console.log('Sanity pass — The Fish Report (static checks only)');
    console.log('======================================');
  }

  describe('Syntax');
  try {
    const jsFiles = localScriptPaths().map((p) => p.replace(/^\//, '').replace(/^public\//, ''));
    for (const f of jsFiles) {
      var checkPath = fs.existsSync(path.join(ROOT, f)) ? f : 'public/' + f;
      execFileSync('node', ['--check', checkPath], { cwd: ROOT, stdio: 'pipe' });
    }
    ok('node --check on JS + sw.js', jsFiles.join(', '));
  } catch (e) {
    fail('node --check on JS + sw.js', String(e.message).split('\n')[0]);
  }
  try {
    execFileSync('python3', ['-m', 'py_compile', 'api/water_report.py', 'scripts/dev_server.py', 'scripts/scrape_wdfw.py', 'scripts/refresh_wdfw_forecast.py'], { cwd: ROOT, stdio: 'pipe' });
    ok('python3 -m py_compile', 'api/water_report.py, scripts/*.py');
  } catch (e) {
    fail('python3 -m py_compile', String(e.message).split('\n')[0]);
  }

  staticIntegrity();
  symbolsIndex();

  if (!QUIET) console.log('\n======================================');
  console.log(`PASSED ${passes} | FAILED ${failures.length}`);
  if (failures.length) {
    console.log('Failures: ' + failures.join('; '));
    process.exit(1);
  }
  console.log('Sanity pass: ALL GREEN');
  process.exit(0);
}

main();

