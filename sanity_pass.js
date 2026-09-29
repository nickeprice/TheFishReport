#!/usr/bin/env node
/**
 * sanity_pass.js — zero-dependency sanity pass for The Fish Report.
 *
 * The repo has no test runner and deliberately avoids npm tooling. This script:
 *   1. Builds/starts the dev server (scripts/dev_server.py) on a free port.
 *   2. STATIC INTEGRITY: every label[for] resolves to an id, every input/select
 *      has an accessible name, and the classic script load order ends with app.js.
 *   3. HTTP/API: static 200s + water report shape (4 days, tide_curve, species_calendar).
 *   4. BEHAVIOR: load real app.js functions in a DOM-stubbed Node context and
 *      exercise debounce, toasts, deep links, tab switching, and the empty state.
 *
 * Exit 0 on full pass, 1 on any failure.
 */

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname);
let PORT = 0;   // resolved to a free port in main()
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
  return [...html.matchAll(/<script src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !/^https?:/i.test(s));
}
function readAllScripts() {
  return localScriptPaths().map((s) => fs.readFileSync(path.join(ROOT, s), 'utf8')).join('\n');
}



// Start the dev server
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['scripts/dev_server.py', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('server start timeout: ' + out)); } }, 8000);
    function probe() {
      http.get(`http://127.0.0.1:${PORT}/index.html`, (res) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(child); }
        res.resume();
      }).on('error', () => { if (!settled) setTimeout(probe, 250); });
    }
    probe();
  });
}
function stopServer(child) {
  if (!child || child.killed) return;
  try { child.kill('SIGTERM'); } catch (e) {}
  // Give it a moment to exit; escalate to SIGKILL if it lingers (e.g. python may
  // not exit immediately on SIGTERM once it has served).
  setTimeout(() => {
    try {
      if (!child.killed) { process.kill(child.pid, 'SIGKILL'); }
    } catch (e) {}
  }, 500);
}

function httpGet(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: pathname }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body }));
    }).on('error', reject);
  });
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

  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  scripts.length && scripts[scripts.length - 1].includes('app.js')
    ? ok('script load order ends with app.js', scripts.join(' → '))
    : fail('script load order ends with app.js', scripts.join(' → '));

  // index.html and sw.js SHELL_FILES are hand-maintained in PARALLEL. A module added to one
  // but not the other breaks offline caching SILENTLY: the page requests a script the
  // service worker never precached, so it works online and fails in a dead zone — exactly
  // where this app is supposed to earn its keep. Assert the two src/*.js subsets agree.
  // The CDN script is not a shell file, and the non-<script> shell assets (manifest.json,
  // icons, styles.css) have no <script> tag, so both are excluded by the .js-under-src/ match.
  const swShellSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shellAt = swShellSrc.indexOf('const SHELL_FILES');
  const shellBlock = swShellSrc.slice(shellAt, swShellSrc.indexOf('];', shellAt));
  const shellJs = [...shellBlock.matchAll(/'\/(src\/[^']+\.js)'/g)].map((m) => m[1]);
  const htmlJs = localScriptPaths();
  const notShelled = htmlJs.filter((p) => !shellJs.includes(p));
  const staleShell = shellJs.filter((p) => !htmlJs.includes(p));
  (notShelled.length === 0 && staleShell.length === 0)
    ? ok('sw.js SHELL_FILES matches the index.html script list', `${htmlJs.length} modules`)
    : fail('sw.js SHELL_FILES matches the index.html script list',
        [notShelled.length ? 'missing from SHELL_FILES: ' + notShelled.join(', ') : '',
         staleShell.length ? 'in SHELL_FILES but not loaded: ' + staleShell.join(', ') : '']
          .filter(Boolean).join(' | '));

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
  (cssSrc.includes('.gear-row {') && cssSrc.includes('.gear-row-3 {') && threeUp === 2)
    ? ok('resting gear rows present (.gear-row + one 3-up row per form)',
         `${threeUp} 3-up rows (the 3-part mainline cascade)`)
    : fail('resting gear rows present (.gear-row + one 3-up row per form)',
           `css .gear-row-3=${cssSrc.includes('.gear-row-3 {')} 3-up rows=${threeUp}`);
  (!cssSrc.includes('gear-grid') && !cssSrc.includes('.run-footer'))
    ? ok('dead .gear-grid / .run-footer rules removed', 'no stale layout rules')
    : fail('dead .gear-grid / .run-footer rules removed', 'stale CSS found');

  // Gear Sim HUD wording + bullets (direct user instruction, 2026-09-29): both numbers are
  // ESTIMATES, both note lists are bulleted (one ROW per point), and the strike zone carries
  // a TREND LINE whose marker is placed by paintZoneHud(). Pin the wording, the containers
  // and the grade rule, so a silent revert fails here.
  (html.includes('<span class="hud-cap">Strike Zone Estimate:</span>') &&
   html.includes('<span class="hud-cap">Line Height Estimate:</span>') &&
   /id="hud-zone-notes"/.test(html) && /<ul id="hud-changes"/.test(html))
    ? ok('HUD caps say "Estimate" and both note lists are bullets',
         'Strike Zone Estimate / Line Height Estimate, both in <ul> bullets')
    : fail('HUD caps say "Estimate" and both note lists are bullets',
           'cap wording or bullet list changed');
  (/id="hud-zone-mark"/.test(html) && /\.zone-trend \{[^}]*linear-gradient\(to right/.test(cssSrc))
    ? ok('strike-zone trend line present and graded red-yellow-green-yellow-red',
         'marker on a gradient strip; paintZoneHud() positions it')
    : fail('strike-zone trend line present and graded red-yellow-green-yellow-red',
           'trend markup or CSS missing');
  // The community note must stay OFF the HUD even though the sonar still moves the zone.
  (fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'zone.js'), 'utf8')
    .includes('Recent community catches holding') &&
   /ZONE_NOTE_HIDDEN = \/\^\(Strike zone shifted\|Recent community catches holding\)\//.test(
     fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'zone.js'), 'utf8')))
    ? ok('community-catch note is computed but hidden from the HUD',
         'zone.notes keeps it; zoneNotes() filters it out')
    : fail('community-catch note is computed but hidden from the HUD', 'filter missing');
  (/\.hud-panel \{[^}]*text-align: center/.test(cssSrc) &&
   /\.hud-changes \{[^}]*list-style-position: inside/.test(cssSrc) &&
   /#tab-gear-sim #hud \+ \.bucket \{[^}]*padding-top: 1[0-9]px/.test(cssSrc))
    ? ok('HUD panels are centred, with clearance above the first gear row',
         '.hud-panel centred + inside bullets + bucket padding-top')
    : fail('HUD panels are centred, with clearance above the first gear row',
           'centring / separation CSS missing');
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
    .filter((p) => fs.readFileSync(path.join(ROOT, p), 'utf8').indexOf("'catch_db'") !== -1);
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

  // Phase 3.4 runtime: pending.js is pure logic, so exercise it for real against a fake
  // outbox instead of only grepping the source — filter, order, dedupe, mapping, badge and
  // the post-flush re-render all have to behave, not merely appear.
  try {
    const vm = require('vm');
    const mockEl = (tag) => ({ tag: tag, className: '', textContent: '', title: '',
                               children: [], appendChild(c) { this.children.push(c); } });
    const FAKE_OUTBOX = [
      { clientId: 'c-old',    time: '2026-09-28T05:00:00Z', spc: 'Chinook', flow: 1040, score: 7.2, pendingSync: true },
      { clientId: 'c-new',    time: '2026-09-28T09:00:00Z', spc: 'Coho',    flow: 1010, score: 6.1, pendingSync: true },
      { clientId: 'c-synced', time: '2026-09-28T03:00:00Z', spc: 'Chum',    flow: 990,  score: 5.5, pendingSync: false },
      { clientId: 'c-lost',   time: '2026-09-28T08:00:00Z', spc: 'Pink',    flow: 1000, score: 4.0, pendingSync: true }
    ];
    let scopeRenders = 0;
    const box = {
      document: { createElement: mockEl },
      outboxPending: () => FAKE_OUTBOX.filter((r) => r && r.pendingSync),
      CATCH_SCOPE: 'yours',
      setCatchScope: () => { scopeRenders++; }
    };
    box.window = box;
    vm.createContext(box);
    vm.runInContext(pendingSrc, box, { filename: 'pending.js' });

    const pr = box.pendingRows();
    const ids = pr.map((r) => r.clientId).join(',');
    (pr.length === 3 && ids === 'c-new,c-lost,c-old')
      ? ok('pendingRows() returns only pending rows, newest first', ids)
      : fail('pendingRows() returns only pending rows, newest first', ids || '(none)');
    FAKE_OUTBOX.length === 4
      ? ok('pendingRows() does not mutate the outbox', '4 rows retained')
      : fail('pendingRows() does not mutate the outbox', FAKE_OUTBOX.length + ' rows');

    const d1 = box.pendingNotIn([{ id: 'c-lost' }]).map((r) => r.clientId).join(',');
    (d1 === 'c-new,c-old')
      ? ok('pendingNotIn() drops a row the server already has', 'lost-response dedupe')
      : fail('pendingNotIn() drops a row the server already has', d1);
    box.pendingNotIn(null).length === 3
      ? ok('pendingNotIn() tolerates a null server list', '3 rows')
      : fail('pendingNotIn() tolerates a null server list', 'wrong length');

    const m = box.asMyCatchRow(FAKE_OUTBOX[1]);
    (m.id === 'c-new' && m.species === 'Coho' && m.catch_time === '2026-09-28T09:00:00Z' &&
     m.flow === 1010 && m.sim_score === 6.1 && m._pending === true)
      ? ok('asMyCatchRow() maps the outbox payload to the private row shape', 'spc/score -> species/sim_score')
      : fail('asMyCatchRow() maps the outbox payload to the private row shape', JSON.stringify(m));

    const badge = box.pendingBadge();
    (badge.className === 'sync-badge' && badge.textContent === 'Syncing...' && badge.title.length > 10)
      ? ok('pendingBadge() renders the sync badge', badge.textContent)
      : fail('pendingBadge() renders the sync badge', badge.className + ' / ' + badge.textContent);

    box.refreshCatchLists();
    scopeRenders === 1
      ? ok('refreshCatchLists() re-renders the active scope', '1 render')
      : fail('refreshCatchLists() re-renders the active scope', scopeRenders + ' renders');

    // Offline / stripped builds: no outbox globals must degrade, not throw.
    const bare = { document: { createElement: mockEl } };
    bare.window = bare;
    vm.createContext(bare);
    vm.runInContext(pendingSrc, bare, { filename: 'pending.js' });
    let threw = '';
    try { bare.pendingRows(); bare.pendingNotIn([]); bare.refreshCatchLists(); } catch (e) { threw = e.message; }
    threw === ''
      ? ok('pending.js degrades safely when the outbox globals are absent', 'no throw')
      : fail('pending.js degrades safely when the outbox globals are absent', threw);
  } catch (e) {
    fail('pending.js runtime behaviour', e.message);
  }

  const gearRows = (html.match(/class="gear-row(?:[" ])/g) || []).length;
  (gearRows === 14 && !html.includes('gear-grid'))
    ? ok('both gear forms use 7 resting rows each', `${gearRows} rows total`)
    : fail('both gear forms use 7 resting rows each', `${gearRows} rows found`);

  // The gear-box ORDER is a deliberate user instruction (session 1790604718924_nudti,
  // msg 1477 for the rows, WS-3/issue #1b for the cascades): Mainline material → brand →
  // lb test · Weight type → amount · Leader length → material → brand → lb test ·
  // Hook/Yarn · Foam 1+2 · Beads. The instruction was once acknowledged and silently
  // skipped, so assert the exact per-row `for=` ids in document order for BOTH tabs and
  // fail loudly on any future reorder.
  {
    const GEAR_ORDER = ['ml-mat', 'ml-brand', 'ml-lb', 'weight-shape', 'weight',
                        'ld-len', 'ld-mat', 'ld-brand', 'ld-lb', 'hook', 'yarn',
                        'foam', 'foam2', 'bd-mat', 'bd-sz'];
    const blocks = html.split('<div class="gear-rows">');
    const labelsOf = (b) => (b.match(/<label for="[^"]+"/g) || [])
      .map((s) => s.match(/for="([^"]+)"/)[1]);
    const simOrder = labelsOf((blocks[1] || '').split('<button class="btn-main"')[0]).join(',');
    const logOrder = labelsOf((blocks[2] || '')
      .split('<h2 class="purple-heading">Catch Result')[0]).join(',');
    const wantSim = GEAR_ORDER.join(',');
    const wantLog = GEAR_ORDER.map((id) => `${id}-log`).join(',');
    (simOrder === wantSim && logOrder === wantLog)
      ? ok('gear box order is the instructed cascade flow (both tabs)', wantSim)
      : fail('gear box order is the instructed cascade flow (both tabs)',
             `sim=[${simOrder}] log=[${logOrder}]`);
  }

  // Rod length was REMOVED 2026-09-28 (it moved no number — see memory-bank/activeContext.md).
  // This guard exists because the removal was once instructed, acknowledged and then silently
  // dropped, so a stray form field or a resurrected code path must fail loudly instead.
  {
    const rodHits = [];
    if (/rod-ft|rod-in|Rod Length/.test(html)) rodHits.push('index.html');
    for (const p of localScriptPaths()) {
      const s = fs.readFileSync(path.join(ROOT, p), 'utf8');
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
    const regSrc = fs.readFileSync(path.join(ROOT, 'src', 'data', 'regions', 'washington.js'), 'utf8');
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

  try {
    const mb = ['projectbrief', 'productContext', 'activeContext', 'systemPatterns', 'techContext', 'progress'];
    const absent = mb.filter((f) => !fs.existsSync(path.join(ROOT, 'memory-bank', f + '.md')));
    absent.length === 0
      ? ok('memory-bank/ complete', mb.join(', '))
      : fail('memory-bank/ complete', 'missing: ' + absent.join(', '));
  } catch (e) {
    fail('memory-bank/ complete', String(e.message).split('\n')[0]);
  }
}



// HTTP and API checks
async function httpChecks() {
  describe('HTTP + API');
  for (const [p, wantType] of [
    ['/index.html', 'text/html'],
    ['/manifest.json', 'application/json'],
    ['/src/styles.css', 'text/css'],
    ...localScriptPaths().map((s) => ['/' + s, 'text/javascript'])
  ]) {
    const r = await httpGet(p);
    r.status === 200 ? ok(`GET ${p} → 200`, r.type) : fail(`GET ${p} → 200`, `got ${r.status}`);
  }

  const api = await httpGet('/api/water_report?site=12101500&lat=47.195&lon=-122.302');
  api.status === 200 ? ok('GET /api/water_report → 200', api.type) : fail('GET /api/water_report → 200', `got ${api.status}`);
  let reports = null;
  try { reports = JSON.parse(api.body); } catch (e) {}
  if (!reports || !reports.length) {
    fail('API returns 4 report days', JSON.stringify(reports));
  } else {
    const day0 = reports[0];
    (reports.length === 4 && day0.tide_curve && day0.species_calendar)
      ? ok('API returns 4 report days with tide_curve + species_calendar', `days=${reports.length}`)
      : fail('API returns 4 report days with tide_curve + species_calendar', `days=${reports.length}`);
    // Own-gauge water quality: the report exposes water_temp_f + turbidity_fnu
    // (may be null when the station doesn't report them — the UI hides then).
    ('water_temp_f' in day0 && 'turbidity_fnu' in day0)
      ? ok('API exposes own-gauge water_temp_f + turbidity_fnu', `temp=${day0.water_temp_f} turb=${day0.turbidity_fnu}`)
      : fail('API exposes own-gauge water_temp_f + turbidity_fnu', 'missing keys in report');
    // Phase H: the real hourly tide curve (tide_points) with 12-hour times feeds
    // the smooth area chart; species run cards need progress/peak_frac geometry.
    const tpts = day0.tide_points || [];
    (tpts.length > 1 && /([AP]M)$/.test((tpts[0] || {}).t || ''))
      ? ok('API returns real hourly tide_points with 12-hour times', `${tpts.length} points, e.g. ${(tpts[0] || {}).t}`)
      : fail('API returns real hourly tide_points with 12-hour times', `points=${tpts.length}`);
    // Phase 2.3: each day names the CO-OPS station its tides were paired with, so the
    // panel/UI can attribute them (and null means "this river has no tide influence").
    Object.prototype.hasOwnProperty.call(day0, 'tide_station')
      ? ok('API exposes the paired tide_station', `station=${day0.tide_station}`)
      : fail('API exposes the paired tide_station', 'field missing');
    const firstSpc = (day0.species_calendar || [])[0] || {};
    (firstSpc.progress !== undefined && firstSpc.peak_frac !== undefined)
      ? ok('species calendar carries run progress + peak geometry', `progress=${firstSpc.progress} peak_frac=${firstSpc.peak_frac}`)
      : fail('species calendar carries run progress + peak geometry', 'progress/peak_frac missing');

    // Phase 2.4.1 — TIMEZONE: `now` is Pacific wall-clock (ZoneInfo), so day 0 must
    // BE Pacific today and each card's netting flag must match the weekday of its
    // OWN title. The old server-local (UTC on Vercel) `now` drifted a day apart.
    const pacToday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', weekday: 'long', month: 'short', day: 'numeric'
    }).format(new Date());
    (day0.tag === 'TODAY' && String(day0.title) === pacToday)
      ? ok('day 0 card is TODAY in Pacific time', `${day0.title} == ${pacToday}`)
      : fail('day 0 card is TODAY in Pacific time', `title=${day0.title} pacificToday=${pacToday}`);
    const NET_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday']; // NETTING_DAYS = [6, 0, 1]
    const netBad = reports.filter((d) => {
      const wd = String(d.title || '').split(',')[0];
      const nets = /NETS IN/.test(String(d.net_status || ''));
      return nets !== (NET_WEEKDAYS.indexOf(wd) !== -1) || nets !== !!d.is_netting;
    });
    netBad.length === 0
      ? ok('netting matches each day\'s own Pacific weekday',
          reports.map((d) => String(d.title).split(',')[0] + (d.is_netting ? '=NETS' : '=open')).join(' '))
      : fail('netting matches each day\'s own Pacific weekday',
          netBad.map((d) => `${d.title} / ${d.net_status}`).join(' '));
  }

  // /api/nearby_stations — the server-side USGS lookup for the GPS flow.
  // USGS can be slow on a cold connection (the app retries once for the same reason
  // in useGPS()), so allow ONE retry before failing rather than reporting a flake.
  let near = await httpGet('/api/nearby_stations?lat=47.2&lon=-122.31');
  let stations = [];
  try { stations = JSON.parse(near.body).stations || []; } catch (e) {}
  if (near.status === 200 && stations.length === 0) {
    await new Promise((r) => setTimeout(r, 1500));
    near = await httpGet('/api/nearby_stations?lat=47.2&lon=-122.31');
    try { stations = JSON.parse(near.body).stations || []; } catch (e) { stations = []; }
  }
  if (near.status === 200) {
    stations.length >= 1
      ? ok('GET /api/nearby_stations returns nearest gauges', `${stations.length} station(s), closest=${stations[0] && stations[0].id}`)
      : fail('GET /api/nearby_stations returns nearest gauges', '0 stations (retried once)');
  } else {
    fail('GET /api/nearby_stations → 200', `got ${near.status}`);
  }
}

// Behavior checks via a DOM-stubbed context (done() resolves when async settles)
function behaviorChecks(done) {
  describe('Behavior (DOM-stubbed app.js)');
  const elements = {};
  const classes = {};

  function el(id) {
    if (!elements[id]) {
      elements[id] = {
        innerText: '', textContent: '', innerHTML: '', value: '', style: {},
        className: '', classList: {
          add: (c) => { (classes[id] = classes[id] || new Set()).add(c); },
          remove: (c) => { if (classes[id]) classes[id].delete(c); },
          toggle: (c, force) => { (classes[id] = classes[id] || new Set()); force === undefined ? (classes[id].has(c) ? classes[id].delete(c) : classes[id].add(c)) : (force ? classes[id].add(c) : classes[id].delete(c)); },
          has: (c) => !!(classes[id] && classes[id].has(c))
        },
        setAttribute: () => {}, appendChild: () => {}, removeChild: () => {},
        addEventListener: () => {}, focus: () => {}
      };
    }
    return elements[id];
  }
  global.document = {
    getElementById: el,
    querySelector: () => null,
    querySelectorAll: (sel) => {
      if (sel === '.tab-content') {
        return ['tab-water-report', 'tab-gear-sim', 'tab-catch-log'].map((id) => {
          const e = el(id);
          e.classList.value = classes[id] || new Set();
          return e;
        });
      }
      return [];
    },
    createElement: () => el('__dyn_' + Math.random()),
    body: { appendChild: () => {} }
  };
  global.window = global;
  global.localStorage = { getItem: () => null, setItem: () => {} };
  global.logDebug = () => {};

  // Extract the functions we exercise from the combined classic-script source.
  const src = readAllScripts();
  function extract(fnName) {
    const idx = src.indexOf('function ' + fnName + '(');
    if (idx === -1) return null;
    let depth = 0, end = idx;
    for (let i = idx; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    return depth === 0 ? src.slice(idx, end) : null;
  }
  const need = ['debounce', 'showToast', 'switchTab', 'applyTabDeepLink', 'renderWaterReportEmptyState', 'setCatchScope', 'legalHoursLabel'];
  let code = '';
  // Bring in the top-level var showToast depends on
  {
    const m = src.match(/var TOAST_KIND_CLASS = \{[\s\S]*?\};/);
    if (m) code += m[0] + '\n';
  // CATCH_SCOPE state + stubs for the renderers setCatchScope invokes
  {
    const m = src.match(/var CATCH_SCOPE = 'yours';/);
    if (m) code += m[0] + '\n';
    code += 'function renderMyCatches() { return Promise.resolve(); }\n';
    code += 'function loadDatabase() { return Promise.resolve(); }\n';
  }

  }
  for (const n of need) {
    const e = extract(n);
    if (!e) { fail('extract ' + n, 'function not found'); return; }
    code += e + '\n';
  }
  eval(code);

  // --- legal hours (UPDATE 3.0 Phase 1.5) ------------------------------------
  // The rule -> wording mapping must never fabricate a window: a 24hr river is
  // "Open all day" and an unverified one says so instead of inventing times.
  try {
    const l24 = legalHoursLabel('24hr', '12:00 AM', '11:59 PM');
    const lDay = legalHoursLabel('daylight', '6:30 AM', '8:00 PM');
    const lUnk = legalHoursLabel('unknown', '--:--', '--:--');
    const lCus = legalHoursLabel('custom', '--:--', '--:--');
    (l24 === 'Legal Hours: Open all day' && lDay === 'Legal Hours: 6:30 AM \u2013 8:00 PM' &&
     lUnk.indexOf('check the regulations') !== -1 && lUnk.indexOf('--:--') === -1 &&
     lCus.indexOf('check the regulations') !== -1)
      ? ok('legal-hours labels never fabricate a window', 'daylight / 24hr / unknown / custom')
      : fail('legal-hours labels never fabricate a window', `${l24} | ${lDay} | ${lUnk} | ${lCus}`);
  } catch (e) {
    fail('legal-hours labels never fabricate a window', String(e.message).split('\n')[0]);
  }

  // --- Gear Sim physics regression -------------------------------------------
  // The deterministic solver must NOT drift when it is refactored into the
  // technique/style registry (UPDATE 3.0 Phase 1.4). Drag coefficient stays LOCKED
  // at 1.0. The expected values were captured from the pre-refactor implementation.
  try {
    const gearSrc = ['inputs', 'physics', 'sonar', 'zone']
      .map((n) => fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', n + '.js'), 'utf8'))
      .join('\n');
    eval(gearSrc);
    // Load the MEASURED tackle library as well, so this baseline exercises the real
    // measured-diameter path instead of the sqrt(lb) proxy fallback. Without it, a
    // wrong number in lineDiameterScale() would pass the suite silently.
    eval(fs.readFileSync(path.join(ROOT, 'src', 'shared', 'tackle.js'), 'utf8'));
    TACKLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'tackle.json'), 'utf8'));
    const cases = [
      // Re-pinned 2026-09-28 for the v^2 drag law (was linear in velocity), and for
      // REF_VELOCITY becoming the exact reference bed velocity (2.442952438) instead of a
      // rounded 2.45. Only the RESPONSE to flow moved: drag is +41% at 2500 CFS and -19% at
      // 600, while the 1040 CFS reference shifts just +0.28%.
      //
      // Re-pinned AGAIN 2026-09-28 (P3): line drag now uses the MEASURED diameters from
      // src/data/tackle.json via lineDiameterScale() instead of the sqrt(lb/12) proxy. The
      // reference rig (12lb mono leader) is anchored unchanged, so the 1040 rows move only
      // ~-0.01%. The rows that genuinely move are the 2500 one (20lb braid mainline: real
      // 0.23mm vs a proxy scale of 0.6455, so it drags harder) and the 600 one (10lb copoly
      // leader: real 0.31mm vs 0.8672). This block LOADS the library, so a regression in the
      // measured path fails here instead of passing silently.
      { rig: [1040, 0.5, 12, 'mono', 15, 'mono', 2, 0, 'hard', 6, 8, '12', '0'],
        want: [2.442952438, 4.024883779, 9.795588235294117, 0.3936, 2.8867637713966774, false] },
      { rig: [1040, 0.25, 12, 'mono', 15, 'mono', 2, 0, 'hard', 6, 8, '14', '12'],
        want: [2.442952438, 4.024883779, 8.670588235294117, 0.6936, 5.08612871920681, false] },
      { rig: [2500, 0.75, 15, 'fluoro', 20, 'braid', 0, 1, 'soft', 8, 10, '10', '0'],
        want: [3.469586182, 5.716313149, 19.87215698801195, 0.65736, 2.5423189537067374, false] },
      { rig: [600, 0.5, 10, 'copoly', 12, 'mono', -1, 2, 'hard', 4, 6, 'c12', '0'],
        want: [1.960478917, 3.229985025, 5.781432857814255, 0.6244, 6.104993199104268, false] },
    ];
    let drift = 0;
    const bad = [];
    for (const c of cases) {
      const [flow, weightOz, ldLb, ldMat, mlLb, mlMat, hook, yarn, bdMat, bdSz, ldLen, f1, f2] = c.rig;
      const v = hydraulicVelocity(flow);
      const drag = totalDragPerFt(v.bottom, ldLb, ldMat, mlLb, mlMat, weightOz, hook, yarn, bdMat, bdSz);
      const foam = parseFoam(f1), foam2 = parseFoam(f2);
      const lift = rigLift(foam.lift + foam2.lift, yarn, hook, bdMat, bdSz);
      const hgt = presentationHeightInches(lift, ldLen, drag);
      const blown = (v.bottom > 3.5 && weightOz < 0.5);
      const got = [v.bottom, v.mean, drag, lift, hgt, blown];
      for (let i = 0; i < got.length; i++) {
        if (Math.abs(got[i] - c.want[i]) > 1e-6) {
          drift++;
          bad.push(`${c.rig[0]}cfs[${i}]=${got[i]}`);   // paste-ready for `want`
        }
      }
    }
    drift === 0
      ? ok('gear-sim physics is deterministic (frozen baseline)', `${cases.length} rigs, drag coefficient locked at 1.0`)
      : fail('gear-sim physics is deterministic (frozen baseline)', `${drift} drifted: ${bad.join(' ')}`);

    // gap 1 (2026-09-28): a PICKED line's real diameter must actually REACH the drag term,
    // not merely be displayed. The leader term is linear in diameterScale, so the gap
    // between two explicit diameters is exactly DRAG_REF * vScale * (d1 - d2) / REF.
    const vb = hydraulicVelocity(1040).bottom;
    const vs = Math.pow(vb / REF_VELOCITY, 2);
    const dA = totalDragPerFt(vb, 12, 'mono', 15, 'mono', 0.5, 2, 0, 'hard', 6, 0.31, 0);
    const dB = totalDragPerFt(vb, 12, 'mono', 15, 'mono', 0.5, 2, 0, 'hard', 6, 0.29, 0);
    const wantDiff = DRAG_REF * vs * (0.31 - 0.29) / REF_DIAMETER_MM;
    Math.abs((dA - dB) - wantDiff) < 1e-9
      ? ok('picked line diameter reaches the drag term', '0.31 vs 0.29mm = DRAG_REF*vScale*d/REF')
      : fail('picked line diameter reaches the drag term', `got ${dA - dB} want ${wantDiff}`);
  } catch (e) {
    fail('gear-sim physics is deterministic (frozen baseline)', String(e.message).split('\n')[0]);
  }

  // --- Drift technique (COMPOSED solver) regression ---------------------------
  // Pins the composition (read rig -> physics -> strike zone -> score -> suggestions),
  // not just the primitives, so moving the solver into techniques/drift.js and
  // routing it through the technique registry cannot silently change behaviour.
  try {
    var reportsData = [];   // no live report in the harness -> baseline strike zone
    const extraSrc = ['src/shared/forms.js', 'src/features/gear-sim/techniques/drift.js',
      'src/features/gear-sim/registry.js']
      .map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');
    eval(extraSrc);
    const rig = {
      flow: 1040, weightOz: 0.5, ldLen: 8, ldMat: 'mono', ldLb: 12,
      mlMat: 'mono', mlLb: 15, hook: 2, yarn: 0,
      foam: parseFoam('12'), foam2: parseFoam('0'), bdMat: 'hard', bdSz: 6, species: 'Chinook'
    };
    const t = gearTechnique();
    const got = t.compute(rig, { flow: 1040, species: 'Chinook', dbArray: [] });
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    // Re-pinned 2026-09-28 (P3): the measured line diameters shift this reference rig by
    // -0.006% on height and -0.018% on score (see the frozen-baseline block above).
    // Re-pinned 2026-09-29 (WS-7): the suggestion LIST is a deliberate product change - the
    // long paragraphs became short rows and the "Targeting <species> at <flow> CFS …" line
    // is gone (it said nothing to change), so this rig now yields 2 rows ("Too low …" +
    // "Try this: …") instead of 3. hgt / score / velocity / zone are unchanged.
    const okT = t.id === 'drift' &&
      near(got.hgt, 2.8867637713966774) && near(got.score, 4.499043697128505) &&
      near(got.velocity.bottom, 2.442952438) &&
      got.zone.min === 4 && got.zone.max === 12 && got.blownOut === false &&
      got.suggestions.length === 2 &&
      /^Too low at 2\.9"/.test(got.suggestions[0]) && /^Try this: /.test(got.suggestions[1]);
    okT
      ? ok('drift technique reproduces the frozen solver output', 'hgt 2.887", score 4.499, 2 short rows')
      : fail('drift technique reproduces the frozen solver output',
             `hgt=${got.hgt} score=${got.score} zone=${got.zone.min}-${got.zone.max} sugg=${got.suggestions.length} [${got.suggestions.join(' | ')}]`);
  } catch (e) {
    fail('drift technique reproduces the frozen solver output', String(e.message).split('\n')[0]);
  }

  // --- P4b: the PICKED brand must reach the ROW -------------------------------
  // The three identity columns are only worth their migration if the client writes them, so
  // assert the real toCatchRow() mapping (not a regex): ids present -> columns set, ids absent
  // (a payload from an older installed client) -> NULL, never ''. logData() is checked at the
  // source level because it needs the whole form/DOM stack to run.
  try {
    const rowFn = extract('toCatchRow');
    if (!rowFn) {
      fail('catch row carries the picked brand', 'toCatchRow() not found');
    } else {
      eval(rowFn);
      const mapped = toCatchRow({
        clientId: 'x', name: 'n', time: '2026-09-29T00:00:00Z', spc: 'Chinook',
        mlLine: 'braid-daiwa-j-braid-x8-grand-20', ldLine: 'fluoro-seaguar-sts-8',
        weightShape: 'Lead Pencil (rubber sleeve)'
      });
      const got = mapped.mainline_line_id === 'braid-daiwa-j-braid-x8-grand-20' &&
        mapped.leader_line_id === 'fluoro-seaguar-sts-8' &&
        mapped.weight_shape === 'Lead Pencil (rubber sleeve)';
      const legacy = toCatchRow({ clientId: 'y', name: 'n', time: '2026-09-29T00:00:00Z', spc: 'Chinook' });
      const nulls = legacy.mainline_line_id === null && legacy.leader_line_id === null &&
        legacy.weight_shape === null;
      const payloadSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'catch-log', 'log.js'), 'utf8');
      const sends = /ldLine:\s*getStr\('ld-line'\)/.test(payloadSrc) &&
        /mlLine:\s*getStr\('ml-line'\)/.test(payloadSrc) &&
        /weightShape:\s*getStr\('weight-shape'\)/.test(payloadSrc);
      (got && nulls && sends)
        ? ok('catch row carries the picked brand',
             'logData() sends the ids -> toCatchRow() maps them; absent -> NULL, never empty string')
        : fail('catch row carries the picked brand', `mapped=${got} nulls=${nulls} sends=${sends}`);
    }
  } catch (e) {
    fail('catch row carries the picked brand', String(e.message).split('\n')[0]);
  }

  // --- WS-3: the tackle cascade (issue #1b) ------------------------------------
  // The cascade is what turns three visible picks into the hidden line id, so exercise the
  // REAL functions against the REAL library in a recording DOM: every select records its own
  // option list and its value setter enforces the browser rule (assigning a value that is not
  // on offer leaves the select EMPTY), which is exactly what drops a stale brand when the
  // material changes. Without this the cascade could only be checked by hand in a browser.
  try {
    const vm = require('vm');   // same local-require pattern as the pending.js stub above
    const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'tackle.json'), 'utf8'));
    const pageHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const selects = {}, inputs = {};
    function mkSel(id) {
      const e = { id, options: [], tag: 'select', _v: '' };
      Object.defineProperty(e, 'value', {
        get() { return e._v; },
        set(v) {
          const s = (v === null || v === undefined) ? '' : String(v);
          e._v = (s === '' || e.options.some((o) => o.value === s)) ? s : '';
        }
      });
      Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set() { e.options = []; } });
      e.appendChild = (c) => {
        if (!c) return;
        if (c.frag) { c.children.forEach(e.appendChild); return; }
        if (c.tag === 'option') e.options.push(c);
      };
      return e;
    }
    const ctx = {
      logDebug: () => {},
      document: {
        getElementById: (id) => {
          if (/-line$/.test(id)) return (inputs[id] = inputs[id] || { id, value: '' });
          return (selects[id] = selects[id] || mkSel(id));
        },
        createElement: (tag) => {
          const e = { tag, value: '', textContent: '', children: [] };
          e.appendChild = (c) => {
            if (c && c.frag) c.children.forEach(e.appendChild);
            else if (c) e.children.push(c);
          };
          return e;
        },
        createDocumentFragment: () => ({
          frag: true, children: [],
          appendChild(c) { this.children.push(c); }
        })
      }
    };
    ctx.window = ctx;
    ctx.getStr = (id) => (selects[id] ? selects[id].value
      : (inputs[id] ? inputs[id].value : ''));
    ctx.setFieldValue = (id, v) => { ctx.document.getElementById(id).value = v; };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'shared', 'forms.js'), 'utf8') + '\n' +
      fs.readFileSync(path.join(ROOT, 'src', 'shared', 'tackle.js'), 'utf8') + '\n' +
      fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'rig.js'), 'utf8'), ctx);
    // The static <option> list index.html ships is the NO-LIBRARY fallback, so it has to be
    // the same union the library builds for a blank parent - otherwise an offline first run
    // offers values the library would never accept (or too few to log at all).
    const staticVals = (id) => {
      const m = pageHtml.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</select>'));
      if (!m) return 'MISSING';
      return (m[1].match(/<option value="([^"]*)"/g) || [])
        .map((s) => s.match(/value="([^"]*)"/)[1]).join(',');
    };
    // Seed the controls with what the page ships, exactly like the browser does before any
    // script runs: the mock must not accept a value the real form could not hold.
    ['ml-mat', 'ml-brand', 'ml-lb', 'ld-mat', 'ld-brand', 'ld-lb', 'weight-shape', 'weight',
      'bd-mat', 'bd-sz'].forEach((id) => {
      const sel = ctx.document.getElementById(id);
      sel.options = (staticVals(id) === 'MISSING' ? [] : staticVals(id).split(','))
        .map((v) => ({ tag: 'option', value: v, textContent: v }));
    });
    ctx.TACKLE = lib;
    ctx.populateTacklePickers();

    const vals = (id) => selects[id].options.map((o) => o.value).join(',');
    const texts = (id) => selects[id].options.map((o) => o.textContent).join(',');
    const bad = [];
    const eq = (label, got, want) => { if (got !== want) bad.push(`${label}=[${got}] want [${want}]`); };

    eq('ml-mat boot', vals('ml-mat'), ',braid,mono,copoly');
    eq('ld-mat boot', vals('ld-mat'), ',mono,copoly,fluoro');
    eq('weight boot', vals('weight'), ',0.25,0.375,0.5,0.625,0.75,1');
    eq('bd-sz boot', vals('bd-sz'), ',0,2,4,6,8');

    // material -> brand -> lb test. The triple must resolve the LIBRARY row, and the
    // Catch Log twin must hold the identical list and value.
    selects['ml-mat'].value = 'braid';
    ctx.onLinePartChange('ml-mat');
    eq('braid brands', String(selects['ml-brand'].options.length - 1), '7');
    // WS-7: the generic row is ALWAYS the first brand, and it DISPLAYS as "Generic" while its
    // VALUE stays the library's "Generic average" - the value is what matching round-trips on.
    const gOpt = selects['ml-brand'].options[1];
    eq('generic first', String(!!gOpt && /^generic/i.test(gOpt.value)) + '|' +
      (gOpt ? gOpt.textContent : 'none'), 'true|Generic');
    const sOpt = selects['ml-brand'].options.filter((o) => o.value === 'Sufix 832 Advanced Superline')[0];
    eq('brand label', sOpt ? sOpt.textContent : 'missing', 'Sufix 832 Advanced Superline');
    eq('braid lb', vals('ml-lb'), ',20,30,40');
    selects['ml-brand'].value = 'Sufix 832 Advanced Superline';
    ctx.onLinePartChange('ml-brand');
    selects['ml-lb'].value = '30';
    ctx.onLinePartChange('ml-lb');
    const picked = lib.items.filter((i) => i.id === inputs['ml-line'].value)[0];
    eq('resolved id', String(!!picked && picked.material === 'braid' &&
      picked.brand === 'Sufix 832 Advanced Superline' && picked.lb_test === 30), 'true');
    eq('twin list', vals('ml-brand') + '|' + vals('ml-lb'), vals('ml-brand-log') + '|' + vals('ml-lb-log'));
    eq('twin value', selects['ml-brand-log'].value, selects['ml-brand'].value);
    // A new material DROPS the braid brand, its lb test and the resolved id: no stale
    // pick may keep resolving a line the angler is no longer fishing.
    selects['ml-mat'].value = 'mono';
    ctx.onLinePartChange('ml-mat');
    eq('material switch clears', selects['ml-brand'].value + '|' + inputs['ml-line'].value, '|');

    // weight type -> amount (the nominal oz read from the row labels; the leading "—" is
    // the blank option, so strip it before comparing the wording)
    selects['weight-shape'].value = 'Lead Slinky (shot in tubing)';
    ctx.onWeightShapeChange('weight-shape');
    eq('slinky amounts', vals('weight'), ',0.25,0.375,0.5,0.625,0.75,1');
    eq('slinky labels', texts('weight').replace('\u2014', ''),
       ',1/4 oz,3/8 oz,1/2 oz,5/8 oz,3/4 oz,1 oz');
    // bead material -> size
    selects['bd-mat'].value = 'soft';
    ctx.onBeadMatChange('bd-mat');
    eq('soft bead sizes', vals('bd-sz'), ',6,8');
    selects['bd-mat'].value = 'none';
    ctx.onBeadMatChange('bd-mat');
    eq('no bead size', vals('bd-sz'), ',0');

    // the static fallback lists must equal the union the library builds
    eq('static ml-mat', staticVals('ml-mat'), ',braid,mono,copoly');
    eq('static ld-mat', staticVals('ld-mat'), ',mono,copoly,fluoro');
    eq('static weight', staticVals('weight'), ',0.25,0.375,0.5,0.625,0.75,1');
    eq('static bd-sz', staticVals('bd-sz'), ',0,2,4,6,8');

    const cascadeBad = bad.filter((b) => !b.startsWith('static '));
    const staticBad = bad.filter((b) => b.startsWith('static '));
    cascadeBad.length === 0
      ? ok('tackle cascade drives the gear form (both tabs)',
           'material → brand → lb test resolves the library id; weight type → amount; bead material → size')
      : fail('tackle cascade drives the gear form (both tabs)', cascadeBad.join(' '));
    staticBad.length === 0
      ? ok('static gear options are the library union (offline fallback)',
           'material / weight oz / bead size lists')
      : fail('static gear options are the library union (offline fallback)', staticBad.join(' '));

    // --- restore: a saved rig has to come back THROUGH the cascade ---------------
    // Parents before children is the whole trick: restoring an amount whose type is not set
    // yet is silently dropped, and a rig saved before the cascade (or by an older installed
    // client) carries no brand at all - it only has material + lb test.
    const saved = { v: null };
    ctx.localStorage = {
      getItem: () => saved.v,
      setItem: (k, v) => { saved.v = v; }
    };
    const bad2 = [];
    const eq2 = (label, got, want) => { if (got !== want) bad2.push(`${label}=[${got}] want [${want}]`); };
    const genericMono12 = lib.items.filter((i) => i.material === 'mono' &&
      i.lb_test === 12 && /^generic/i.test(i.brand))[0];
    saved.v = JSON.stringify({ mlMat: 'mono', mlLb: 12, ldMat: 'mono', ldLb: 12, ldLen: '8',
      weight: '0.5', weightShape: 'Lead Pencil (rubber sleeve)', hook: '2', yarn: '0',
      foam: '10', foam2: '0', bdMat: 'hard', bdSz: '6' });
    ctx.restoreRig();
    eq2('old rig resolves', inputs['ml-line'].value, genericMono12.id);
    eq2('old rig recovers brand', [selects['ml-brand'].value, selects['ml-mat-log'].value,
      selects['ml-lb-log'].value].join('|'), [genericMono12.brand, 'mono', '12'].join('|'));
    saved.v = JSON.stringify({ mlMat: 'braid', mlBrand: 'Sufix 832 Advanced Superline',
      mlLb: '30', ldMat: 'fluoro', ldBrand: 'Seaguar Blue Label Leader', ldLb: '12',
      weightShape: 'Lead Slinky (shot in tubing)', weight: '0.5', bdMat: 'soft', bdSz: '8' });
    ctx.restoreRig();
    eq2('cascade rig resolves', inputs['ml-line'].value, 'braid-sufix-832-30');
    eq2('children survive', [selects['ml-lb'].value, selects['weight'].value,
      selects['bd-sz'].value, inputs['ld-line'].value].join('|'),
      ['30', '0.5', '8', 'fluoro-seaguar-blue-label-12'].join('|'));
    ctx.saveRig();
    const stored = JSON.parse(saved.v);
    eq2('saveRig parts', [stored.mlMat, stored.mlBrand, stored.mlLb, stored.bdMat].join('|'),
      'braid|Sufix 832 Advanced Superline|30|soft');
    bad2.length === 0
      ? ok('a saved rig restores through the cascade (parents first)',
           'an older material+lb rig recovers its brand; the saved lb / amount / bead size survive')
      : fail('a saved rig restores through the cascade (parents first)', bad2.join(' '));
  } catch (e) {
    fail('tackle cascade drives the gear form (both tabs)', String(e.message).split('\n')[0]);
  }

  // --- WS-7: the zone panel reads as a LIST, with a graded trend --------------------
  // The gear sources (inputs / physics / sonar / zone) are already eval'd above, so these are
  // the REAL functions. The asks: one bullet per reason (never one joined sentence), "On
  // target" when nothing is shifting the zone, the community note NOT shown even though the
  // sonar still moves the zone, and a trend graded green at the 4"-12" base -> yellow at half
  // scale -> red at full scale, quantised to 0.1" (so a 0.04" move cannot flip the colour).
  try {
    const badZone = [];
    const eqz = (label, got, want) => { if (got !== want) badZone.push(`${label}=[${got}] want [${want}]`); };
    const zoneRows = zoneNotes({ notes: [
      'Barometer rising 0.03 inHg: fish pin down (lockjaw).',
      'Heavy cloud cover (100%): fish feel safe riding higher.',
      'Recent community catches holding near 9.4" (3 fish): zone pulled +0.6" toward feeding fish.',
      'Strike zone shifted +2.0" to 6.0" - 14.0".'
    ] });
    eqz('one row per reason', String(zoneRows.length), '2');
    eqz('weather only', String(/community|Strike zone shifted/i.test(zoneRows.join(' '))), 'false');
    eqz('on target', zoneNotes({ notes: [] }).join('|'), 'On target');
    eqz('no zone object', zoneNotes(null).join('|'), 'On target');

    const tBase = zoneTrend({ min: 4, max: 12 });
    const tHalf = zoneTrend({ min: 7.5, max: 15.5 });
    const tFull = zoneTrend({ min: 11, max: 19 });
    const tShallow = zoneTrend({ min: 1, max: 9 });
    eqz('base', [tBase.offset, tBase.pct, tBase.color].join('|'), '0|50|hsl(140, 72%, 46%)');
    eqz('half scale', [tHalf.offset, tHalf.pct, tHalf.color].join('|'), '3.5|75|hsl(52, 72%, 46%)');
    eqz('full scale', [tFull.offset, tFull.pct, tFull.color].join('|'), '7|100|hsl(0, 72%, 46%)');
    eqz('shallow side', String(tShallow.pct < 50 && tShallow.pct > 0 && tShallow.color !== tBase.color), 'true');
    eqz('ratio clamped', String(zoneTrend({ min: 20, max: 28 }).ratio) + '|' +
      String(zoneTrend({ min: -4, max: 4 }).ratio), '1|1');
    eqz('0.1" step ignored', zoneTrend({ min: 4.04, max: 12.04 }).color, tBase.color);
    eqz('0.1" step taken', String(zoneTrend({ min: 4.1, max: 12.1 }).pct > 50), 'true');
    // The line-height grade must be byte-identical after sharing the grade helper.
    eqz('lh centre', zoneColor(8.0, { min: 4, max: 12 }), 'hsl(140, 72%, 46%)');
    eqz('lh edge', zoneColor(12.0, { min: 4, max: 12 }), 'hsl(0, 72%, 46%)');
    badZone.length === 0
      ? ok('strike-zone HUD: one bullet per reason + a graded trend line',
           'community note hidden · "On target" when nothing shifted · green base -> yellow half -> red full, 0.1" steps')
      : fail('strike-zone HUD: one bullet per reason + a graded trend line', badZone.join(' '));
  } catch (e) {
    fail('strike-zone HUD: one bullet per reason + a graded trend line', String(e.message).split('\n')[0]);
  }

  // --- P4b: the brand changes the community REPLAY ----------------------------
  // The library is loaded by now, so an id-bearing calibration row must replay at the BRAND's
  // measured diameter while a material+lb-only row keeps the generic row for its class: the two
  // heights must therefore DIFFER. If they stop differing, the brand is being ignored again.
  // (The rows carry loc:'Fair' because that gate decides whether a row is used at all — see the
  // inert-sonar product decision in docs/ROADMAP.md §3.2 — and the last check pins the gate, so
  // P4b cannot silently switch the whole sonar path on.)
  try {
    const baseRow = {
      flow: 1040, spc: 'Chinook', loc: 'Fair', ldLen: 8, weight: 0.5, hook: '2', yarn: 0,
      foam: '12', foam2: '0', bdMat: 'hard', bdSz: 6, ldMat: 'mono', ldLb: 12, mlMat: 'mono', mlLb: 15
    };
    const brandRow = Object.assign({}, baseRow, {
      ldLine: 'fluoro-seaguar-sts-8',             // fluoro  8lb, 0.235 mm measured
      mlLine: 'braid-daiwa-j-braid-x8-grand-20'   // braid  20lb, 0.230 mm measured
    });
    const genericCenter = communitySonar([baseRow, baseRow], 1040, 'Chinook', null).center;
    const brandCenter = communitySonar([brandRow, brandRow], 1040, 'Chinook', null).center;
    const picked = tackleRowLine(brandRow, 'leader');
    const fellBack = tackleRowLine(baseRow, 'leader');
    const prefersId = !!picked && picked.id === 'fluoro-seaguar-sts-8' && picked.diameter_mm === 0.235;
    const usesPair = !!fellBack && fellBack.material === 'mono' && Number(fellBack.lb_test) === 12;
    const gate = communitySonar([Object.assign({}, brandRow, { loc: null })], 1040, 'Chinook', null).samples === 0;
    (isFinite(genericCenter) && isFinite(brandCenter) &&
     Math.abs(brandCenter - genericCenter) > 1e-3 && prefersId && usesPair && gate)
      ? ok('a row with the picked brand replays at that brand',
           `generic ${genericCenter.toFixed(3)}" vs brand ${brandCenter.toFixed(3)}"`)
      : fail('a row with the picked brand replays at that brand',
             `generic=${genericCenter} brand=${brandCenter} prefersId=${prefersId} usesPair=${usesPair} gate=${gate}`);
  } catch (e) {
    fail('a row with the picked brand replays at that brand', String(e.message).split('\n')[0]);
  }



  // --- Measured gauge velocity (USGS field measurements) ---------------------
  // The velocity curve is data-driven now (src/data/channel_measurements.js,
  // generated by scripts/fetch_channel_measurements.py). Two properties must hold
  // or the physics is silently detuned: a gauge WITH measurements must anchor to
  // the SAME reference output (DRAG_REF / strike zone stay calibrated), and a
  // gauge WITHOUT them must fall back to the estimate byte-for-byte.
  try {
    const inputsSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'inputs.js'), 'utf8');
    const dataSrc = fs.readFileSync(path.join(ROOT, 'src', 'data', 'channel_measurements.js'), 'utf8');
    // Run in a FRESH function scope: the data file needs a `window`, and declaring
    // one with a bare eval() would leak into this test file's shared scope.
    const M = new Function(
      'var window = {};\n' + dataSrc + '\n' + inputsSrc +
      '\nreturn { f: measuredFit, v: measuredVelocity, hv: hydraulicVelocity };')();
    const measuredFitFn = M.f, measuredVelocity = M.v, hydraulicVelocity = M.hv;

    const fit = measuredFitFn('12101500');
    const est = hydraulicVelocity(1650);                     // no site -> estimate
    const meas = hydraulicVelocity(1650, '12101500');        // measured shape
    const anchorEst = hydraulicVelocity(1040);
    const anchorMeas = hydraulicVelocity(1040, '12101500');
    const refBottom = 0.25 * Math.pow(1040, 0.4) * Math.pow(0.05, 1 / 6);
    // The published fit must reproduce a REAL measurement: Puyallup 2026-07-30,
    // 1650 cfs measured at 2.09 ft/s. Inside 15% or the fit is not usable.
    const raw = measuredVelocity('12101500', 1650);
    const reproduces = raw && Math.abs(raw - 2.09) / 2.09 < 0.15;
    const ratio = meas.bottom / est.bottom;
    // The honest display value: true measured ft/s, separate from the anchored scale.
    const trueBottom = meas.trueBottom;
    const wantTrueBottom = raw * Math.pow(0.05, 1 / 6);

    (fit && fit.a > 0 && fit.b > 0 && reproduces &&
     Math.abs(anchorMeas.bottom - refBottom) < 1e-9 &&       // anchored AT the reference
     Math.abs(anchorMeas.bottom - anchorEst.bottom) < 1e-9 && // == the old reference value
     est.source === 'estimate' && meas.source === 'measured' &&
     est.trueBottom === undefined &&                          // estimate carries no true value
     Math.abs(meas.trueMean - raw) < 1e-9 &&                  // true ft/s IS the measured curve
     Math.abs(trueBottom - wantTrueBottom) < 1e-9 &&
     trueBottom > 1.0 && trueBottom < 1.6 &&                  // sane real ft/s at 1650 cfs
     ratio > 1.0 && ratio < 1.6)                              // response really does move
      ? ok('measured velocity: anchored calibration scale + honest true ft/s',
           `12101500 v=${fit.a}*Q^${fit.b} (n=${fit.n}); bed ${trueBottom.toFixed(2)} ft/s true ` +
           `(fit ${raw.toFixed(2)} vs USGS 2.09); ${ratio.toFixed(3)}x anchored`)
      : fail('measured velocity: anchored calibration scale + honest true ft/s',
             `fit=${JSON.stringify(fit)} raw=${raw} true=${trueBottom}/${wantTrueBottom} ` +
             `anchor=${anchorMeas.bottom}/${refBottom} est=${est.bottom} meas=${meas.bottom}`);
  } catch (e) {
    fail('measured gauge velocity anchors to the locked reference', String(e.message).split('\n')[0]);
  }

  // --- debounce ---
  let calls = 0;
  const db = debounce(() => { calls++; }, 30);
  db(); db(); db();
  setTimeout(() => {
    calls === 1
      ? ok('debounce collapses burst (trailing)', `3 calls → ${calls} execution`)
      : fail('debounce collapses burst (trailing)', `${calls} executions`);

    // --- toast ---
    showToast('hello', 'info', 300);
    elements['toast-stack'] || (document.body.lastChild && document.body.lastChild.id === 'toast-stack')
      ? ok('toast renders in a role=status stack', 'toast-stack present')
      : fail('toast renders in a role=status stack', '');

    // --- deep link ---
    // applyTabDeepLink() reads window.location.search then new URLSearchParams(...).
    global.window.location = { search: '?tab=tab-gear-sim' };
    const okLink = applyTabDeepLink();
    okLink
      ? ok('?tab= deep link activates the target tab', 'tab-gear-sim')
      : fail('?tab= deep link activates the target tab', '');

    // --- switchTab ---
    switchTab('tab-catch-log');
    elements['tab-catch-log'].classList.has('tab-active')
      ? ok('switchTab adds tab-active to target', 'tab-catch-log')
      : fail('switchTab adds tab-active to target', '');

    // --- empty state ---
    renderWaterReportEmptyState('No river data', 'Try another station.', false);
    const box = elements['water-report-cards'];
    (box.innerHTML.indexOf('No river data') !== -1 && box.innerHTML.indexOf('empty-state') !== -1)
      ? ok('water report empty state renders', 'empty-state + title')
      : fail('water report empty state renders', box.innerHTML);

    // --- catch log yours/everyone toggle ---
    setCatchScope('yours');
    const yoursActive = elements['scope-yours'].classList.has('scope-active');
    const headYours = elements['catch-log-head'].innerHTML.indexOf('Species') !== -1;
    setCatchScope('everyone');
    const everyoneActive = elements['scope-everyone'].classList.has('scope-active');
    const headEveryone = elements['catch-log-head'].innerHTML.indexOf('Name') !== -1;
    (yoursActive && everyoneActive && headYours && headEveryone)
      ? ok('catch log yours/everyone toggle switches scope + headers', 'yours→Species, everyone→Name')
      : fail('catch log yours/everyone toggle switches scope + headers', '');

    // --- logData decoupled from the Gear Sim ---
    // logData() must not bail when currentStats is null (no runSim required).
    const logFn = src.slice(src.indexOf('async function logData()'));
    const logEnd = logFn.indexOf('\n}\n') + 3;
    const logBody = logFn.slice(0, logEnd);
    !/if \(!currentStats\) return;/.test(logBody)
      ? ok('logData works without runSim (no currentStats gate)', 'form-driven logging')
      : fail('logData works without runSim (no currentStats gate)', 'still gated on currentStats');

    finish(done);
  }, 80);

  function finish(done) { done(); }
}

// Runner
async function main() {
  if (!QUIET) {
    console.log('Sanity pass — The Fish Report');
    console.log('======================================');
  }

  describe('Syntax');
  try {
    const jsFiles = localScriptPaths().concat('sw.js');
    for (const f of jsFiles) execFileSync('node', ['--check', f], { cwd: ROOT, stdio: 'pipe' });
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

  // Resolve a free port, then start the server on it.
  if (!PORT) {
    PORT = await new Promise((resolve, reject) => {
      const srv = require('net').createServer();
      srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
      srv.on('error', reject);
    });
  }

  let server = null;
  try {
    server = await startServer();
    await httpChecks();
    await new Promise((resolve) => behaviorChecks(resolve));
  } catch (e) {
    fail('dev server start', e.message);
  } finally {
    if (server) stopServer(server);
  }

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

