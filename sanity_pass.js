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

  // Vercel serves Python functions ONE FILE PER ROUTE, so a `/api/<name>` call that only
  // exists as a branch inside api/water_report.py — which is where the local dev server used
  // to send every /api/* path — 404s on the DEPLOYED app. That is exactly how
  // /api/nearby_stations broke the map feed, the GPS lookup and every saved-spot resolution
  // in production while looking perfectly healthy locally (found 2026-09-29 from the phone's
  // debug trail: `GET /api/nearby_stations -> HTTP 404 … NOT_FOUND pdx1::…`). Every path the
  // frontend fetches must have its own api/<name>.py entry point.
  const apiCalls = new Set();
  for (const f of localScriptPaths()) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/['"`](\/api\/[a-z0-9_]+)/g)) apiCalls.add(m[1]);
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
  (cssSrc.includes('.gear-row {') && cssSrc.includes('.gear-row-3 {') && threeUp === 2)
    ? ok('resting gear rows present (.gear-row + one 3-up row per form)',
         `${threeUp} 3-up rows (the 3-part mainline cascade)`)
    : fail('resting gear rows present (.gear-row + one 3-up row per form)',
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
  // The community note must stay OFF the HUD even though the sonar still moves the zone. The
  // old display filter (zoneNotes/ZONE_NOTE_HIDDEN) went with the bullet list; the guarantee is
  // now structural - the summary paragraph simply never prints community wording (asserted on
  // the REAL fishOutlook() further down), while zone.notes still records the effect for the log.
  {
    // Comments cannot display anything, so strip them: the check is about real code.
    const zoneSrcStatic = fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'zone.js'), 'utf8')
      .replace(/\/\/[^\n]*/g, '');
    (zoneSrcStatic.includes('Recent community catches holding') &&
     !/ZONE_NOTE_HIDDEN/.test(zoneSrcStatic) && !/function zoneNotes\(/.test(zoneSrcStatic) &&
     /function fishOutlook\(/.test(zoneSrcStatic))
      ? ok('community-catch note is computed but never displayed',
           'zone.notes keeps it for the log; the bullet filter left with the bullets; the summary never mentions it')
      : fail('community-catch note is computed but never displayed', 'note missing, or the old filter came back');
  }
  // Bead labels read plainly (the "(Presentation)" suffix was a stray) and the Cheater float is
  // named "Cheater 10" (direct user corrections). The option VALUE stays 'c12', so parseFoam()
  // / FOAM_TABLE lifts - and therefore the frozen physics - are untouched.
  {
    const cheater = (html.match(/<option value="c12">Cheater 10<\/option>/g) || []).length;
    const inSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'gear-sim', 'inputs.js'), 'utf8');
    (!html.includes('Presentation') && cheater === 4 &&
     /'c12': \{ lift: 0\.70, label: 'Cheater - Size 10' \}/.test(inSrc))
      ? ok('bead labels are plain and the Cheater float reads "Cheater 10"',
           'no "(Presentation)"; 4 Cheater 10 options; FOAM_TABLE label matches (value stays c12)')
      : fail('bead labels are plain and the Cheater float reads "Cheater 10"',
             `presentation=${html.includes('Presentation')} cheaterOptions=${cheater}`);
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

    // --- WS-4: WEATHER IS PER-DAY, NOT ONE "NOW" SNAPSHOT ----------------------------
    // Every day must carry its OWN reference-hour weather plus its own 24 hourly rows, the
    // pill label must NAME that hour block ("3-4 PM" today, "6-7 AM" once fishing can start),
    // and the days must actually DIFFER - a single snapshot stamped on all four is the bug
    // this replaced. The popup's metric keys are cross-checked against the payload here, so
    // a renamed field cannot silently break a pill.
    {
      const wh = reports.map((d) => d.weather_hour || null);
      const labels = wh.map((h) => (h && h.label) || '--');
      const temps = reports.map((d) => d.air_temp_f);
      const rowKeys = Object.keys((reports[0].weather_hourly || [])[0] || {});
      const hourlySrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'telemetry', 'hourly.js'), 'utf8');
      const popupKeys = [...hourlySrc.matchAll(/^\s{4}'([a-z_]+)':/gm)].map((m) => m[1]);
      const perDay = wh.every((h) => h && h.label && h.iso) &&
        reports.every((d) => Array.isArray(d.weather_hourly) && d.weather_hourly.length === 24);
      const distinct = new Set(labels).size > 1 && new Set(temps).size > 1;
      const keysOk = popupKeys.length === 6 && popupKeys.every((k) => rowKeys.includes(k));
      (perDay && distinct && keysOk)
        ? ok('weather is per-day (reference hour + 24 hourly rows)',
             `${labels.join(' / ')} · temps ${temps.map((t) => Math.round(t)).join('/')}° · popup keys covered`)
        : fail('weather is per-day (reference hour + 24 hourly rows)',
               `perDay=${perDay} distinct=${distinct} keysOk=${keysOk} labels=[${labels.join(',')}] rows=${reports.map((d) => (d.weather_hourly || []).length).join(',')}`);
    }
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
        // children/parentNode are part of the shape a REAL element always has: a toast's
        // dismiss timer reads stack.children.length, and a stub without it crashed the run
        // (TypeError) as soon as that timer got a chance to fire (2026-09-29).
        children: [], parentNode: undefined,
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
      /^Your rig is running low/.test(got.suggestions[0]) && /^Try this: /.test(got.suggestions[1]);
    okT
      ? ok('drift technique reproduces the frozen solver output', 'hgt 2.887", score 4.499, 2 short rows')
      : fail('drift technique reproduces the frozen solver output',
             `hgt=${got.hgt} score=${got.score} zone=${got.zone.min}-${got.zone.max} sugg=${got.suggestions.length} [${got.suggestions.join(' | ')}]`);

    // ON TARGET -> NO suggestion rows at all (direct user ask, 2026-09-29). This rig lands at
    // 4.81" inside the baseline 4"-12" zone, so the HUD shows the summary paragraph and no
    // "what to change" rows: the old single "On target" row was noise.
    const rigOn = Object.assign({}, rig, { ldLen: 6, weightOz: 0.25, foam: parseFoam('10') });
    const gotOn = t.compute(rigOn, { flow: 1040, species: 'Chinook', dbArray: [] });
    (gotOn.suggestions.length === 0 && gotOn.hgt >= gotOn.zone.min && gotOn.hgt <= gotOn.zone.max &&
     /Your rig is right where the fish are\./.test(String(gotOn.outlook)))
      ? ok('an on-target rig gets no suggestion rows at all',
           'hgt 4.810" inside the 4"-12" zone -> 0 suggestions; the summary states the rig is where the fish are')
      : fail('an on-target rig gets no suggestion rows at all',
             `hgt=${gotOn.hgt} zone=${gotOn.zone.min}-${gotOn.zone.max} sugg=${gotOn.suggestions.length} ` +
             `[${gotOn.suggestions.join(' | ')}] outlook=${gotOn.outlook}`);
  } catch (e) {
    fail('drift technique reproduces the frozen solver output', String(e.message).split('\n')[0]);
  }

  // --- WS-8a: the scientific model (thermal curve, gauge depth, colour/light, where-to-fish) ---
  // The frozen baselines above run REPORT-LESS on purpose, so NONE of them may move. This block
  // pins the NEW behaviour instead: the thermal-optimum band edges, D = A/W from the REAL USGS
  // cross-sections (with its Q/(W*V) cross-check), the null-everything path that must never
  // fabricate a spot depth, the DEMOTED barometer, the own-gauge colour and reference-hour light
  // terms, and the "where to fish" row actually reaching the strike-zone panel through the REAL
  // painter rather than only appearing in the source.
  try {
    var activeDateOffset = 0;                 // reportsData is declared in the drift block above
    eval(fs.readFileSync(path.join(ROOT, 'src/data/channel_measurements.js'), 'utf8'));
    eval(fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/continuity.js'), 'utf8'));

    // (1) The thermal curve: every band edge, and null -> no term at all (the old rule was a
    // single ">= 55F -> rise", which pointed the wrong way above the comfort band).
    const edges = [[44, 'torpid', -1.5], [45, 'cool', -0.75], [49.9, 'cool', -0.75], [50, 'optimal', 0.75],
      [59.9, 'optimal', 0.75], [60, 'warming', -1], [65, 'warming', -1], [65.5, 'stress', -2], [70, 'stress', -2]];
    const badEdges = edges.filter(([t, band, sh]) => {
      const b = thermalOptimum(t);
      return !b || b.band !== band || b.shift !== sh;
    });
    const noTemp = thermalOptimum(null) === null && thermalOptimum(undefined) === null && thermalOptimum(NaN) === null;
    (badEdges.length === 0 && noTemp)
      ? ok('thermal-optimum curve replaces "warm water = rise"',
           'torpid <45 / cool 45-50 / optimal 50-60 / warming 60-65 / stress >65, null -> no term')
      : fail('thermal-optimum curve replaces "warm water = rise"', `${JSON.stringify(badEdges)} noTemp=${noTemp}`);

    // (2) Depth is the gauge's OWN measured cross-section: median of the six rows nearest today's
    // discharge, cross-checked against Q/(W*V) on those same rows.
    const dN = depthAtGauge(1040, '12089500');
    const dHi = depthAtGauge(3000, '12089500');
    const dPuy = depthAtGauge(1040, '12101500');
    const depthOk = dN && dHi && dPuy &&
      Math.abs(dN.value - 3.159825238772607) < 1e-6 &&
      Math.abs(dHi.value - 4.260821514090993) < 1e-6 &&
      Math.abs(dPuy.value - 3.329611650485437) < 1e-6 &&
      dN.rows === 6 && dN.gaugeRows === 237 && dN.source === 'measured' && dN.thinRecent === false &&
      dN.crossCheckPct < 0.05 && dHi.crossCheckPct < 0.05 && dPuy.crossCheckPct < 0.05 &&
      dN.minFt < dN.value && dN.value < dN.maxFt;
    depthOk
      ? ok('gauge depth is the measured cross-section (A/W), cross-checked by Q/(W*V)',
           'Nisqually 3.16 ft @1040 and 4.26 @3000, Puyallup 3.33 @1040; worst continuity gap <0.5%')
      : fail('gauge depth is the measured cross-section (A/W), cross-checked by Q/(W*V)',
             `N=${dN && dN.value} Hi=${dHi && dHi.value} Puy=${dPuy && dPuy.value} ` +
             `x=${dN && dN.crossCheckPct} rows=${dN && dN.rows}/${dN && dN.gaugeRows}`);

    // WS-8b a2: the angler is shown the BAND the gauge's own rows span, not one bare number.
    // The band is the measured min/max of that window; a degenerate (single-value) band must
    // collapse to one number rather than read "3.2-3.2 ft", and a missing one stays null.
    const spotN = spotDepthFt(1040, '12089500');
    const spotPuy = spotDepthFt(1040, '12101500');
    const bandOk = Math.abs(spotN.bandLow - 2.140449438202247) < 1e-9 &&
      Math.abs(spotN.bandHigh - 4.142857142857143) < 1e-9 &&
      spotN.bandLow < spotN.value && spotN.value < spotN.bandHigh &&
      depthBandText(spotN) === '2.1-4.1 ft' &&
      depthBandText(spotPuy) === '2.3-3.5 ft' &&
      // One row (or a razor-thin spread) -> a single number, never "3.2-3.2 ft".
      depthBandText({ value: 3.2, bandLow: 3.2, bandHigh: 3.2 }) === '3.2 ft' &&
      depthBandText({ value: 3.2, bandLow: 3.14, bandHigh: 3.26 }) === '3.2 ft' &&
      depthBandText({ value: null, bandLow: null, bandHigh: null }) === null &&
      depthBandText(null) === null;
    bandOk
      ? ok('the depth is reported as a measured band, not one bare number',
           'Nisqually 2.1-4.1 ft (median 3.16), Puyallup 2.3-3.5 ft (median 3.33); a degenerate band collapses to one number; none -> null')
      : fail('the depth is reported as a measured band, not one bare number',
             `N=[${spotN.bandLow},${spotN.value},${spotN.bandHigh}] Puy=[${spotPuy.bandLow},${spotPuy.value},${spotPuy.bandHigh}] ` +
             `text=${depthBandText(spotN)}/${depthBandText(spotPuy)} degenerate=${depthBandText({ value: 3.2, bandLow: 3.2, bandHigh: 3.2 })}`);

    // (3) Nothing measured -> NO depth number. A missing/unknown gauge must stay null, and
    // spotDepthFt() must still carry the same-reach provenance velocityAtSpot() carries.
    const noSite = spotDepthFt(1040, null);
    const nullOk = depthAtGauge(1040, null) === null && depthAtGauge(1040, '99999999') === null &&
      noSite.value === null && noSite.bandLow === null && noSite.bandHigh === null &&
      noSite.atGauge === false && noSite.source === 'none' &&
      noSite.uncertainty === 0.2 && noSite.ratioMeasured === false;
    nullOk
      ? ok('no measured cross-section -> a null depth, never a fabricated number',
           'unknown/null siteId -> value + band null, atGauge false, source none, +/-20% same-reach spread kept')
      : fail('no measured cross-section -> a null depth, never a fabricated number', JSON.stringify(noSite));

    // (4) "Where to fish" - depth + lie + colour, ON and OFF target, and the honest empty path.
    const realGetItem = global.localStorage.getItem;
    const bare = whereToFish({ min: 4, max: 12 });
    global.localStorage.getItem = (k) => (k === 'active_station' ? JSON.stringify({ id: '12089500' }) : null);
    const offTgt = whereToFish({ min: 4, max: 12 }, 2.8867637713966774);
    const onTgt = whereToFish({ min: 4, max: 12 }, 8);
    global.turbidityFnu = 32;
    const dirty = whereToFish({ min: 4, max: 12 }, 8);
    global.turbidityFnu = null;
    global.localStorage.getItem = realGetItem;
    const whereOk = /^Where to fish: /.test(bare) && /no measured cross-section/.test(bare) &&
      !/ft of water/.test(bare) && !/\d+ ft of water/.test(bare) &&
      // WS-8b a2: the detail clause now carries the measured BAND beside the +/-20% same-reach factor.
      /hold ~8\.0" up in ~3\.2 ft of water \(gauge measurements 2\.1-4\.1 ft, \u00b120%\)/.test(offTgt) &&
      /bed 1\.5 ft\/s: soft water, fish spread over the flats and riffle lips/.test(offTgt) &&
      /your line at 2\.9" is 5\.1" below that band/.test(offTgt) &&
      /your line at 8\.0" is in that band/.test(onTgt) &&
      /coloured water \(32\.0 FNU\) puts them shallower, closer to cover/.test(dirty);
    whereOk
      ? ok('"where to fish" carries depth + lie + colour, on AND off target',
           'no gauge -> no depth number; with the Nisqually -> "hold ~8.0" up in ~3.2 ft ... (gauge measurements 2.1-4.1 ft, +/-20%)"; in/out of band')
      : fail('"where to fish" carries depth + lie + colour, on AND off target',
             `${bare} || ${offTgt} || ${onTgt} || ${dirty}`);
  } catch (e) {
    fail('thermal-optimum curve replaces "warm water = rise"', String(e.message).split('\n')[0]);
    fail('gauge depth is the measured cross-section (A/W), cross-checked by Q/(W*V)', 'block threw');
    fail('no measured cross-section -> a null depth, never a fabricated number', 'block threw');
    fail('"where to fish" carries depth + lie + colour, on AND off target', 'block threw');
  }

  // --- WS-8a part 2: the report terms (demoted barometer, colour, light) --------
  // Colour reads the ACTIVE gauge's own FNU (no reading -> no term at all) and the light term
  // reads the report's REFERENCE HOUR block, never the local clock - a clock would make
  // computeStrikeZone() non-deterministic and flap the frozen baselines between 7 AM and 7 PM.
  // The expected stacks are arithmetic: falling 1.2 + cloud 1.5 + rain 1.0 + optimal 0.75 +
  // low light 1.0 = +5.45", and the fully-loaded case adds dirty 1.25 for +6.7", which is what
  // proves the unchanged 7.0" ZONE_TREND_FULL_SCALE still bounds the rebuilt model.
  try {
    reportsData = [{ press_delta: -0.08, cloud_pct: 90, rain: 0.4, weather_hour: { iso: '2026-09-29T05:00', label: '5-6 AM' } }];
    activeDateOffset = 0;
    global.waterTempF = 52;
    const wzHot = computeStrikeZone();
    const wzHotNotes = wzHot.notes.join(' | ');
    reportsData = [{ press_delta: 0.05, cloud_pct: 5, rain: 0, weather_hour: { iso: '2026-09-29T13:00', label: '1-2 PM' } }];
    global.waterTempF = 61;
    const wzCold = computeStrikeZone();
    const wzColdNotes = wzCold.notes.join(' | ');
    reportsData = [{ press_delta: -0.08, cloud_pct: 50, rain: 0 }];     // no reference hour, no probe
    global.waterTempF = null;
    const wzBare = computeStrikeZone();
    const wzBareNotes = wzBare.notes.join(' | ');
    global.turbidityFnu = 32;
    reportsData = [{ press_delta: 0, cloud_pct: 50, rain: 0 }];
    const wzColour = computeStrikeZone();
    global.turbidityFnu = 80;
    reportsData = [{ press_delta: -0.08, cloud_pct: 90, rain: 0.4, weather_hour: { iso: '2026-09-29T05:00', label: '5-6 AM' } }];
    global.waterTempF = 52;
    const wzMax = computeStrikeZone();
    global.turbidityFnu = null;
    global.waterTempF = null;
    const wzTermsOk = Math.abs(wzHot.shift - 5.45) < 1e-9 && Math.abs(wzCold.shift + 4.45) < 1e-9 &&
      Math.abs(wzBare.shift - 1.2) < 1e-9 && Math.abs(wzColour.shift - 0.75) < 1e-9 &&
      Math.abs(wzMax.shift - 6.7) < 1e-9 && zoneTrend(wzMax).ratio < 1 &&
      /Low light \(5-6 AM\): fish hold higher and are quicker to take/.test(wzHotNotes) &&
      /Water 52F \(50-60F band\)/.test(wzHotNotes) &&
      /High sun \(1-2 PM\): fish hold deep and tight/.test(wzColdNotes) &&
      /Water 61F \(60-65F band\): fish slide to the coolest, fastest water/.test(wzColdNotes) &&
      /Coloured water \(32\.0 FNU\): fish move up and closer to cover/.test(wzColour.notes.join(' | ')) &&
      wzBareNotes.indexOf('FNU') === -1 && wzBareNotes.indexOf('light') === -1;
    wzTermsOk
      ? ok('zone terms: demoted barometer, own-gauge colour, reference-hour light',
           '+5.45" stacked, -4.45" the other way, alone the barometer is 1.2"; no probe/hour -> no term; the 6.7" ceiling still fits 7.0"')
      : fail('zone terms: demoted barometer, own-gauge colour, reference-hour light',
             `hot=${wzHot.shift} cold=${wzCold.shift} bare=${wzBare.shift} colour=${wzColour.shift} ` +
             `max=${wzMax.shift} ratio=${zoneTrend(wzMax).ratio} | ${wzBareNotes}`);

    // WS-8b (b2'): the light term is keyed on the sun's REAL ELEVATION, so the same clock hour
    // means different things in December and July, the ramp is monotone, and there are no cliffs
    // between consecutive hour blocks. Endpoints unchanged from b1: dark = +1.00", overhead = -0.75".
    const clockOk = parseClockMinutes('6:30 AM') === 390 && parseClockMinutes('12:05 PM') === 725 &&
      parseClockMinutes('12:30 AM') === 30 && parseClockMinutes('6:55 PM') === 1135 &&
      parseClockMinutes('--') === null && parseClockMinutes(null) === null;
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    reportsData = [{ press_delta: 0, cloud_pct: 50, rain: 0, sunrise: '7:45 AM', sunset: '4:20 PM',
      weather_hour: { iso: '2026-12-10T16:00', label: '4-5 PM' } }];
    const wzDusk = computeStrikeZone();                     // sun 2 deg BELOW the horizon
    reportsData = [{ press_delta: 0, cloud_pct: 50, rain: 0, sunrise: '7:00 AM', sunset: '6:55 PM',
      weather_hour: { iso: '2026-09-30T16:00', label: '4-5 PM' } }];
    const wzShoulder = computeStrikeZone();                 // sun ~22 deg up: graded, not a cliff
    reportsData = [{ press_delta: 0, cloud_pct: 50, rain: 0, sunrise: '5:20 AM', sunset: '9:00 PM',
      weather_hour: { iso: '2026-07-10T12:00', label: '12-1 PM' } }];
    const wzNoon = computeStrikeZone();                     // sun ~64 deg: the full penalty
    reportsData = [{ press_delta: 0, cloud_pct: 50, rain: 0, sunrise: '7:45 AM', sunset: '4:20 PM',
      weather_hour: { iso: '2026-12-10T12:00', label: '12-1 PM' } }];
    const wzDecNoon = computeStrikeZone();                  // a 20 deg December noon is NOT July
    const wzLightOk = clockOk && near(wzDusk.shift, 1.0) && near(wzShoulder.shift, 0.3) &&
      near(wzNoon.shift, -0.75) && near(wzDecNoon.shift, 0.4) &&
      /Low light \(4-5 PM\): fish hold higher and are quicker to take/.test(wzDusk.notes.join(' | ')) &&
      /Low light \(4-5 PM\)/.test(wzShoulder.notes.join(' | ')) &&
      /High sun \(12-1 PM\): fish hold deep and tight/.test(wzNoon.notes.join(' | ')) &&
      // Monotone climb then fall, and NO cliff between neighbouring hour blocks (b1 jumped 1.75").
      (function () {
        const rep = { sunrise: '7:05 AM', sunset: '6:52 PM' };
        const seq = [];
        for (let h = 5; h <= 20; h++) {
          const t = lightTerm({ hour: h, label: '', year: 2026, month: 9, day: 29 }, rep);
          seq.push(t ? t.shift : 0);
        }
        let jump = 0;
        for (let i = 1; i < seq.length; i++) jump = Math.max(jump, Math.abs(seq[i] - seq[i - 1]));
        let mono = true;
        for (let i = 1; i <= 7; i++) if (seq[i] > seq[i - 1]) mono = false;      // falls to noon
        for (let i = 9; i < seq.length; i++) if (seq[i] < seq[i - 1]) mono = false; // rises after
        return jump <= 0.45 && mono;
      })();
    wzLightOk
      ? ok('the light term rides the sun\'s real elevation (no cliffs, seasonal)',
           'December dusk +1.00", September 4-5 PM +0.30", July noon -0.75", December noon +0.40"; whole-day ramp monotone with a max 0.40" step')
      : fail('the light term rides the sun\'s real elevation (no cliffs, seasonal)',
             `clock=${clockOk} dusk=${wzDusk.shift} sepPM=${wzShoulder.shift} julNoon=${wzNoon.shift} decNoon=${wzDecNoon.shift}`);
  } catch (e) {
    fail('zone terms: demoted barometer, own-gauge colour, reference-hour light', String(e.message).split('\n')[0]);
    fail('the light term rides the sun\'s real elevation (no cliffs, seasonal)', String(e.message).split('\n')[0]);
  }


  // --- WS-8a part 3: the summary reaches the panel, and the wiring cannot regress ------
  // Drive the REAL paintZoneHud() against a recording element (the DOM stub appends nowhere),
  // then re-run the frozen drift rig under the frozen report-less conditions: the summary must
  // be painted AND the pinned suggestion count must NOT have moved - the reason the summary is
  // rendered by the panel painter instead of being pushed into out.suggestions.
  try {
    const recWhere = {
      id: 'hud-where', tag: 'p', textContent: '', innerHTML: '',
      appendChild() {}, style: {}
    };
    const recZone = { id: 'hud-zone', innerText: '', style: {} };
    const realGetById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'hud-where') return recWhere;
      if (id === 'hud-zone') return recZone;
      return realGetById(id);
    };
    reportsData = [{ press_delta: -0.08, cloud_pct: 50, rain: 0 }];
    paintZoneHud(computeStrikeZone(), null);
    global.document.getElementById = realGetById;
    const wsPainted = String(recWhere.textContent);
    reportsData = [];                                   // report-less == the frozen harness conditions
    const wsRig = {
      flow: 1040, weightOz: 0.5, ldLen: 8, ldMat: 'mono', ldLb: 12,
      mlMat: 'mono', mlLb: 15, hook: 2, yarn: 0,
      foam: parseFoam('12'), foam2: parseFoam('0'), bdMat: 'hard', bdSz: 6, species: 'Chinook'
    };
    const wsOut = gearTechnique().compute(wsRig, { flow: 1040, species: 'Chinook', dbArray: [] });
    const wsWireOk = /^Fish are likely holding a bit higher than usual\./.test(wsPainted) &&
      /Most of that is/.test(wsPainted) === false && String(wsPainted).split('. ').length <= 2 &&
      /^Where to fish: /.test(wsOut.whereToFish) &&
      /No water report loaded yet, so this is just the standard starting estimate\./.test(wsOut.outlook) &&
      wsOut.suggestions.length === 2 && /^Your rig is running low/.test(wsOut.suggestions[0]) &&
      /^Try this: [^,]+,? and [^,]+ \u2014 that should /.test(wsOut.suggestions[1]) &&
      wsOut.rigChanges.length === 2 && wsOut.rigChangesPlain.length === 2 &&
      Math.abs(wsOut.hgt - 2.8867637713966774) < 1e-9;
    const zoneSrc = fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/zone.js'), 'utf8');
    const solverSrc = fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/solver.js'), 'utf8');
    const driftSrc = fs.readFileSync(path.join(ROOT, 'src/features/gear-sim/techniques/drift.js'), 'utf8');
    const waterSrc = fs.readFileSync(path.join(ROOT, 'src/services/water.js'), 'utf8');
    const wsStaticOk = !/shift \+= 3\.5|shift -= 3\.0/.test(zoneSrc) && !/Warm water \(/.test(zoneSrc) &&
      /thermalOptimum\(/.test(zoneSrc) && /turbidityTerm\(\)/.test(zoneSrc) && /lightTerm\(/.test(zoneSrc) &&
      /ZONE_TREND_FULL_SCALE = 7\.0/.test(zoneSrc) && /id === 'hud-where'/.test(solverSrc + zoneSrc) === false &&
      /paintZoneHud\(zone, out\.outlook\)/.test(solverSrc) && /fishOutlook\(zone, hgt\)/.test(driftSrc) &&
      /suggestions\.push\('On target'\)/.test(driftSrc) === false &&
      /rigChangePlain\(best, rig\)/.test(driftSrc) && /joinPlain\(shown\)/.test(driftSrc) &&
      /window\.turbidityFnu = hasTurb/.test(waterSrc);
    (wsWireOk && wsStaticOk)
      ? ok('the summary paragraph is painted, and the frozen suggestion count did not move',
           'recording #hud-where gets the outcome + driver sentences; drift still 2 suggestions, hgt 2.887"; no "On target" row exists')
      : fail('the summary paragraph is painted, and the frozen suggestion count did not move',
             `painted=[${wsPainted}] sugg=${wsOut.suggestions.length} where=${wsOut.whereToFish} ` +
             `outlook=${wsOut.outlook} hgt=${wsOut.hgt} static=${wsStaticOk}`);
  } catch (e) {
    fail('the summary paragraph is painted, and the frozen suggestion count did not move', String(e.message).split('\n')[0]);
  }

  // --- WS-5: private favourite spots (issue #3b) -------------------------------
  // The privacy boundary is the whole feature: a spot must be invisible to every other
  // session. Three things are asserted, and only the middle one is a regex:
  //   1. the MIGRATION's shape (RLS on, four owner-scoped policies, user_id defaulted by
  //      the database) and that the file defines no view/RPC that could expose it;
  //   2. the real `toSpotRow()` — it must never set `user_id`, so a payload cannot claim
  //      someone else's identity, and a bad coordinate must leave the table alone;
  //   3. the real list renderer against the recording DOM, plus the signed-out guard that
  //      must stop the save BEFORE any network call.
  try {
    const spotsMigration = path.join(ROOT, 'supabase', 'migrations', '20260929190000_favorite_spots.sql');
    const migOk = fs.existsSync(spotsMigration);
    const mig = migOk ? fs.readFileSync(spotsMigration, 'utf8') : '';
    const migSql = mig.replace(/--[^\n]*/g, '');   // DDL only: a comment can never grant a row
    const policies = (migSql.match(/create policy "favorite_spots_\w+" on public\.favorite_spots/g) || []).length;
    // select/update/delete carry USING, insert/update carry WITH CHECK — all five owner-scoped.
    const usingOwn = (migSql.match(/using \(user_id = auth\.uid\(\)\)/g) || []).length;
    const checkOwn = (migSql.match(/with check \(user_id = auth\.uid\(\)\)/g) || []).length;
    const migShapeOk = migOk &&
      /create table if not exists public\.favorite_spots/.test(migSql) &&
      /user_id\s+uuid\s+not null default auth\.uid\(\)/.test(migSql) &&
      /alter table public\.favorite_spots enable row level security/.test(migSql) &&
      /grant select, insert, update, delete on public\.favorite_spots/.test(migSql) &&
      policies === 4 && usingOwn === 3 && checkOwn === 2 &&
      !/create (or replace )?view/i.test(migSql) && !/security definer/i.test(migSql);
    // No view, no SECURITY DEFINER function and no public-feed reference anywhere in the
    // migrations can expose these rows to another angler.
    const migDir = path.join(ROOT, 'supabase', 'migrations');
    const leaky = fs.readdirSync(migDir).filter((f) => {
      // Comments cannot leak anything, so strip them first: the check is about real DDL.
      const src = fs.readFileSync(path.join(migDir, f), 'utf8').replace(/--[^\n]*/g, '');
      if (!/favorite_spots/.test(src)) return false;
      return /create (or replace )?view/i.test(src) || /security definer/i.test(src) || /public_catch_feed/.test(src);
    });
    const migPrivacyOk = leaky.length === 0;
    migShapeOk && migPrivacyOk
      ? ok('favorite_spots is RLS default-deny, owner-scoped, and never exposed',
           'RLS on + 4 policies (auth.uid()), user_id default auth.uid(), no view / no definer fn, absent from the public schema')
      : fail('favorite_spots is RLS default-deny, owner-scoped, and never exposed',
             `exists=${migOk} policies=${policies} using=${usingOwn} check=${checkOwn} privacy=${migPrivacyOk} leaky=${leaky.join(',')}`);

    // 2. The real payload -> row mapper.
    const spotFn = extract('toSpotRow');
    if (!spotFn) {
      fail('a spot payload cannot claim another angler\'s row', 'toSpotRow() not found');
      fail('the saved-spot list renders my own spots only', 'toSpotRow() not found');
    } else {
      eval(spotFn);
      const mapped = toSpotRow({
        clientId: '11111111-2222-3333-4444-555555555555', label: '  Blue Creek run  ',
        stationId: '12101500', riverName: 'Puyallup River at Puyallup, WA',
        latitude: '47.195', longitude: '-122.302', notes: 'fish the seam'
      });
      const spoof = toSpotRow({ label: 'x', latitude: 47, longitude: -122, user_id: 'someone-else' });
      const bad = toSpotRow({ label: 'no position', latitude: 'nope', longitude: null });
      const mapOk = Object.prototype.hasOwnProperty.call(mapped, 'user_id') === false &&
        Object.prototype.hasOwnProperty.call(spoof, 'user_id') === false &&
        mapped.label === 'Blue Creek run' && mapped.station_id === '12101500' &&
        mapped.latitude === 47.195 && mapped.longitude === -122.302 &&
        typeof mapped.updated_at === 'string' && bad.latitude === null && bad.longitude === null;
      mapOk
        ? ok('a spot payload cannot claim another angler\'s row',
             'toSpotRow() never emits user_id (the DB default fills auth.uid()), trims the label, NaN coords -> null')
        : fail('a spot payload cannot claim another angler\'s row',
               `user_id=${mapped.user_id} spoof=${spoof.user_id} label="${mapped.label}" lat=${mapped.latitude} bad=${bad.latitude}`);
    }
  } catch (e) {
    fail('favorite_spots is RLS default-deny, owner-scoped, and never exposed', String(e.message).split('\n')[0]);
    fail('a spot payload cannot claim another angler\'s row', String(e.message).split('\n')[0]);
  }

  // WS-5 runtime: the real list renderer + the signed-out save guard, against a recording
  // DOM. spots.js is not loaded by any other harness block, so eval the real file.
  try {
    const recEls = {};
    const recGetById = (id) => {
      if (!recEls[id]) {
        recEls[id] = {
          id, children: [], innerHTML: '', textContent: '', hidden: false, className: '',
          appendChild(c) { this.children.push(c); }
        };
      }
      return recEls[id];
    };
    const realGetById2 = global.document.getElementById;
    const realCreate = global.document.createElement;
    const realAuth = global.AuthState;
    const realSupa = global.Supa;
    // showToast/logDebug: logDebug is the harness's global stub, but showToast is a LOCAL
    // declaration (the earlier block evaluates app.js's real one), so the local wins.
    const realToast = showToast;
    const realLogDebug = global.logDebug;
    global.document.getElementById = recGetById;
    global.document.createElement = (tag) => ({
      tag, children: [], className: '', textContent: '', type: '',
      appendChild(c) { this.children.push(c); }
    });
    const toasts = [];
    showToast = (m) => { toasts.push(String(m)); };
    const logs = [];
    global.logDebug = (m) => { logs.push(String(m)); };

    eval(fs.readFileSync(path.join(ROOT, 'src', 'features', 'map', 'spots.js'), 'utf8'));

    // (a) signed out: no list, an explanation, and the controls must still be VISIBLE - hiding
    // them is exactly why "Place a spot on the map" was invisible (2026-09-29 fix). The save
    // must not touch the network. saveCurrentSpot() returns before its first await, so this is sync.
    global.AuthState = { signedIn: false, name: '' };
    let wrote = 0;
    global.Supa = { saveFavoriteSpot: () => { wrote++; return { ok: true }; } };
    renderFavoriteSpots();
    const controlsStayVisible = !('spot-save-row' in recEls);
    const signedOutOk = controlsStayVisible &&
      /^Start a session/.test(recEls['spot-status'].textContent) &&
      recEls['favorite-spots'].children.length === 0;
    saveCurrentSpot();
    const guardOk = wrote === 0 && toasts.length === 1 && /Start a session/.test(toasts[0]);

    // (b) signed in with two rows: one .spot-row each, labels as TEXT (never innerHTML),
    // and the offline note when the server could not be reached.
    global.AuthState = { signedIn: true, name: 'Nick' };
    spotsState.rows = [
      { id: 'a1', label: 'Blue Creek run', station_id: '12101500', river_name: 'Puyallup River at Puyallup, WA' },
      { id: 'b2', label: 'Lower Nisqually', station_id: '12089500', river_name: 'Nisqually River at McKenna' }
    ];
    spotsState.loaded = true;
    spotsState.offline = true;
    renderFavoriteSpots();
    const rows = recEls['favorite-spots'].children;
    const labels = rows.map((r) => r.children[0] && r.children[0].textContent);
    const metas = rows.map((r) => {
      const span = r.children[0] && r.children[0].children[0];
      return span ? span.textContent : '';
    });
    const listOk = controlsStayVisible && rows.length === 2 &&
      rows[0].className === 'spot-row' && labels[0] === 'Blue Creek run' && labels[1] === 'Lower Nisqually' &&
      /^flow: Puyallup River at Puyallup, WA/.test(metas[0]) && /^flow: Nisqually River at McKenna/.test(metas[1]) &&
      recEls['favorite-spots'].innerHTML === '' &&
      /could not be reached/.test(recEls['spot-status'].textContent);

    // (c) GPS hygiene: the debug trail carries labels, never coordinates.
    const loggedCoords = logs.filter((l) => /\d+\.\d+\s*,\s*-?\d+\.\d+/.test(l) || /lat\b|lon\b/i.test(l));

    global.document.getElementById = realGetById2;
    global.document.createElement = realCreate;
    showToast = realToast;
    global.logDebug = realLogDebug;
    if (realAuth === undefined) delete global.AuthState; else global.AuthState = realAuth;
    if (realSupa === undefined) delete global.Supa; else global.Supa = realSupa;

    (signedOutOk && guardOk && listOk && loggedCoords.length === 0)
      ? ok('the saved-spot list shows my spots only, and never leaks coordinates',
           'signed out -> controls still VISIBLE + explanation + no write; 2 rows rendered as text with their gauge; no lat/lon in the log')
      : fail('the saved-spot list shows my spots only, and never leaks coordinates',
             `signedOut=${signedOutOk} guard=${guardOk} wrote=${wrote} list=${listOk} ` +
             `rows=${rows.length} labels=[${labels.join(' | ')}] metas=[${metas.join(' | ')}] coords=${loggedCoords.join(';')}`);
  } catch (e) {
    fail('the saved-spot list shows my spots only, and never leaks coordinates', String(e.message).split('\n')[0]);
  }

  // WS-5b: a saved spot is a LAT/LON, not a gauge (direct user ask) ----------------------
  // The report's weather comes from the spot's own coordinates, but flow / runs / legal hours /
  // tides only exist at a USGS gauge - and /api/water_report defaults to the app's site when
  // none is passed, so a point must have its gauge RESOLVED explicitly or it would silently
  // show the wrong river. Assert the resolver, the row's provenance line, and the picker wiring.
  try {
    const spotsSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'map', 'spots.js'), 'utf8');
    const mapSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'map', 'map.js'), 'utf8');
    const pageHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

    // The PICKING rule is pure, so it is exercised for real: the closest usable entry wins,
    // an entry without coordinates is skipped, an empty list is "no gauge here" (null), and
    // resolveSpotStation only has the thin fetch wrapper left around it.
    const nearPick = pickNearestStation([
      { id: '12094000', name: 'Carbon River near Fairfax', lat: 47.02, lon: -122.03, distance_mi: 3.4 },
      { id: '12101500', name: 'Puyallup River at Puyallup, WA', lat: 47.19, lon: -122.30, distance_mi: 12.1 }
    ]);
    const skipPick = pickNearestStation([
      { id: '12093500', name: 'no coords' },                       // skipped: lat/lon missing
      { id: '12094000', name: 'Carbon River near Fairfax', lat: 47.02, lon: -122.03, distance_mi: 3.4 }
    ]);
    // The SELECTED gauge beats the nearest one when it is in range - the live probe case where
    // the closest gauge was a 33 CFS creek beside the river being fished.
    const preferPick = pickNearestStation([
      { id: '12095000', name: 'South Prairie Creek at South Prairie, WA', lat: 47.14, lon: -122.09, distance_mi: 4.4 },
      { id: '12093500', name: 'Puyallup River near Orting, WA', lat: 47.10, lon: -122.21, distance_mi: 4.4 }
    ], '12093500');
    const nearOk = nearPick && nearPick.id === '12094000' && nearPick.distance === 3.4 &&
      /^Carbon River/.test(nearPick.name) &&
      skipPick && skipPick.id === '12094000' &&
      preferPick && preferPick.id === '12093500' && preferPick.distance === 4.4 &&
      pickNearestStation([]) === null && pickNearestStation(null) === null &&
      pickNearestStation([{ id: 'x', name: 'y' }]) === null &&
      // A station with no name still resolves, by id - never a blank label.
      pickNearestStation([{ id: '99999', lat: 1, lon: 2 }]).name === '99999';
    const gaugeTextOk = (function () {
      spotsState.gauge = { s1: { name: 'Carbon River near Fairfax', distance: 3.4 } };
      const a = spotGaugeText({ id: 's1', river_name: 'Carbon River near Fairfax' });
      const b = spotGaugeText({ id: 's2', river_name: 'Nisqually River at McKenna' });
      const c = spotGaugeText({ id: 's3', river_name: null });
      spotsState.gauge = {};
      return a === 'flow: Carbon River near Fairfax \u00b7 3.4 mi away' &&
        b === 'flow: Nisqually River at McKenna' && c === 'flow from the nearest gauge';
    })();

    // Static wiring: the point IS the spot (its own coords saved, its gauge resolved), a point
    // with no gauge is not refused, unreachable stays distinct from "none nearby", the pick
    // button OPENS the map itself and refuses clearly without a session, and an unnamed pick
    // asks for the name on the tap.
    const wireOk = /async function saveSpotAt\(lat, lon, label\)/.test(spotsSrc) &&
      /await resolveSpotStation\(Number\(lat\), Number\(lon\), want \? want\.id : null\)/.test(spotsSrc) &&
      /latitude: Number\(lat\),\s*\n\s*longitude: Number\(lon\)/.test(spotsSrc) &&
      /stationId: station \? station.id : null/.test(spotsSrc) &&
      /if \(!gaugeId\) \{/.test(spotsSrc) && !/That spot has no gauge saved/.test(spotsSrc) &&
      /return \{ ok: false, status: 0, error: 'no position'/.test(spotsSrc) &&
      /resolved\.ok && resolved\.station/.test(spotsSrc) &&
      !/saveRow\.hidden/.test(spotsSrc) && !/id="spot-save-row" hidden/.test(pageHtml) &&
      /function startSpotPick\(\)/.test(mapSrc) && /\.once\('click', onSpotPick\)/.test(mapSrc) &&
      /async function openSpotPickMap\(\)/.test(mapSrc) && /await showStationMap\(\)/.test(mapSrc) &&
      /if \(!spotsSignedIn\(\)\) \{[\s\S]{0,200}spotsStatus\(/.test(mapSrc) &&
      /window\.prompt\('Name this spot'/.test(mapSrc) &&
      /onclick="startSpotPick\(\)"/.test(pageHtml) && /Place a spot on the map/.test(pageHtml);

    (nearOk && gaugeTextOk && wireOk)
      ? ok('a saved spot is a lat/lon: nearest gauge resolved, provenance shown, point never refused',
           'resolver picks the closest usable gauge (3.4 mi), skips a coord-less entry, distinguishes none vs unreachable; row says "flow: <gauge>"')
      : fail('a saved spot is a lat/lon: nearest gauge resolved, provenance shown, point never refused',
             `near=${nearOk} gaugeText=${gaugeTextOk} wire=${wireOk} first=${JSON.stringify(results[0])} noneNear=${JSON.stringify(noneNear)}`);
  } catch (e) {
    fail('a saved spot is a lat/lon: nearest gauge resolved, provenance shown, point never refused', String(e.message).split('\n')[0]);
  }

    // --- WS-8b: the rig search proposes what anglers actually change --------------
    // Direct user ask: "you always suggest corky size leader length and lead but for the most
    // part people change their leader length and lead size not as often so lets adjust corky
    // first, add a second corky, second hook size, yarn, beads - lets focus on those things
    // before the others". So PASS 1 must solve with tackle only whenever it can, the change
    // list must come out in that priority order, and leader/lead may only appear as the
    // fallback when no tackle swap reaches the zone.
    try {
        const badRig = [];
        const eqr = (label, got, want) => { if (got !== want) badRig.push(`${label}=[${got}] want [${want}]`); };
        const baseRig = {
            flow: 1040, weightOz: 0.5, ldLen: 8, ldMat: 'mono', ldLb: 12,
            mlMat: 'mono', mlLb: 15, hook: 2, yarn: 0,
            foam: parseFoam('12'), foam2: parseFoam('0'), bdMat: 'hard', bdSz: 6, species: 'Chinook'
        };
        // Bead options come from the library, and what is tied on is always in the list.
        eqr('hard beads', beadSizeOptions('hard', 6).join(','), '2,4,6,8');
        eqr('soft beads', beadSizeOptions('soft', 6).join(','), '6,8');
        eqr('no bead', beadSizeOptions('none', 0).join(','), '0');
        eqr('foam naming', [foamShort(parseFoam('10')), foamShort(parseFoam('c12')), foamShort(parseFoam('0'))].join('|'),
            'Corky 10|Cheater 10 float|None');

        // (1) The frozen reference rig is 2.89" (too low). Tackle alone fixes it, and the
        // suggestion starts with the corky.
        const vel1 = hydraulicVelocity(1040, null);
        const zone1 = { min: 4, max: 12 };
        const best1 = bestZoneRig(zone1, baseRig, vel1);
        const ch1 = rigChangeList(best1, baseRig);
        eqr('tackle-only reaches the zone', String(best1.hgt >= 4 && best1.hgt <= 12), 'true');
        eqr('corky leads the list', ch1[0], 'Cheater 10 float');
        eqr('no leader/lead in a tackle fix', String(/leader|lead/.test(ch1.join(' '))), 'false');
        eqr('tackle fix projection', best1.hgt.toFixed(1), '8.1');

        // (2) Priority ORDER: a rig that needs three swaps lists them corky -> second corky
        // -> hook, in that order, and never reorders.
        const rigD = Object.assign({}, baseRig, { foam: parseFoam('12'), foam2: parseFoam('0'), hook: -1, bdMat: 'soft', bdSz: 8 });
        const bestD = bestZoneRig(zone1, rigD, hydraulicVelocity(1040, null));
        eqr('priority order', rigChangeList(bestD, rigD).join(' + '), 'Corky 10 + a second Corky 10 + hook size 1/0');

        // (3) At 8000 CFS the drag beats every tackle combination, so the fallback fires and
        // leader/lead come LAST in the list.
        const rigHi = Object.assign({}, baseRig, { weightOz: 0.75, ldLen: 10, foam: parseFoam('0'), foam2: parseFoam('0'), bdSz: 8 });
        const bestHi = bestZoneRig(zone1, rigHi, hydraulicVelocity(8000, null));
        const chHi = rigChangeList(bestHi, rigHi);
        eqr('fallback fires at 8000 CFS', String(chHi[chHi.length - 1]), '0.25 oz lead');
        eqr('fallback lists leader/lead last', String(/leader/.test(chHi.join(' ')) || chHi[chHi.length - 1].indexOf('lead') !== -1), 'true');
        badRig.length === 0
            ? ok('the rig search changes the corky first and only falls back to leader/lead',
                 'tackle-only fix for the frozen rig (Cheater 10 float -> 8.1"), priority order corky > 2nd corky > hook > yarn > bead, leader/lead only when nothing else reaches the zone')
            : fail('the rig search changes the corky first and only falls back to leader/lead', badRig.join(' '));
    } catch (e) {
        fail('the rig search changes the corky first and only falls back to leader/lead', String(e.message).split('\n')[0]);
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

  // --- HUD restructure: TWO banners + ONE summary (direct user ask, 2026-09-29) -------------
  // The zone panel's per-reason bullets were replaced by one cohesive paragraph, so the REAL
  // fishOutlook() is asserted here: the outcome band by net shift, the two named drivers, the
  // depth/lie/line sentences, the report-less path, and that the community wording (which the
  // old display filter `zoneNotes()` existed for) can no longer reach the angler. The trend
  // maths and the line-height grade are unchanged, so they stay pinned in the same block.
  try {
    const badZone = [];
    const eqz = (label, got, want) => { if (got !== want) badZone.push(`${label}=[${got}] want [${want}]`); };

    const sonarZone = {
      min: 6, max: 14, shift: 2,
      report: { cfs: 1040 },
      notes: ['Recent community catches holding near 9.4" (3 fish): zone pulled +0.6" toward holding fish.']
    };
    // Depth/lie need a station, exactly like the app: stub the active station, then restore.
    const realGetItem2 = global.localStorage.getItem;
    global.localStorage.getItem = (k) => (k === 'active_station' ? JSON.stringify({ id: '12101500' }) : null);
    const outlookStn = fishOutlook(sonarZone, 8.0);
    global.localStorage.getItem = realGetItem2;
    const noStn = fishOutlook(sonarZone);
    // Direct user ask: 1-2 sentences a NON-ANGLER can act on. No jargon, no CFS, no gauge,
    // no inches, no "line height" - and never a claim that they are feeding.
    eqz('two sentences', String(outlookStn.split('. ').length), '2');
    eqz('outcome tag', String(/^Fish are likely holding higher in the water and more willing to grab/.test(outlookStn)), 'true');
    eqz('says where to look', String(/\u2014 look for calm, shallow water along the gentle edges and the tail of a pool/.test(outlookStn)), 'true');
    eqz('plain depth', String(/\(about 2-4 feet deep\)/.test(outlookStn)), 'true');
    eqz('line clause', String(/Your rig is right where the fish are\.$/.test(outlookStn)), 'true');
    eqz('no jargon in the summary',
      String(/CFS|gauge|off the bed|your line|ft of water|line height|strike zone|base zone|\u00b1/i.test(outlookStn)), 'false');
    eqz('never claims feeding', String(/feed/i.test(outlookStn)), 'false');
    eqz('community wording never shown', String(/community/i.test(outlookStn)), 'false');
    eqz('no station -> tag only, no invented depth [' + noStn + ']',
      String(/^Fish are likely holding higher in the water and more willing to grab\.$/.test(noStn)), 'true');

    // Each outcome band, by net shift (tags only - no station, so no depth clause).
    const bandOf = (s) => fishOutlook({ min: 4 + s, max: 12 + s, shift: s, report: {}, notes: [] }).replace(/\.$/, '');
    eqz('band 2.0', bandOf(2.0), 'Fish are likely holding higher in the water and more willing to grab');
    eqz('band 0.8', bandOf(0.8), 'Fish are likely holding a bit higher than usual');
    eqz('band 0', bandOf(0), 'Fish are about where you would normally expect them');
    eqz('band -1', bandOf(-1), 'Fish are holding deep and staying tight');
    eqz('band -3', bandOf(-3), 'Fish are holding deep and not very active');
    // No report -> one plain sentence, no invented behaviour.
    const noReport = fishOutlook({ min: 4, max: 12, shift: 0, notes: [], report: null });
    eqz('no report', String(/^No water report loaded yet, so this is just the standard starting estimate\.$/.test(noReport)), 'true');
    // The live preview has no rig, so it must not claim anything about a line.
    eqz('no rig -> no line sentence',
      String(/Your line/.test(fishOutlook({ min: 4, max: 12, shift: 0, notes: [], report: {} }))), 'false');
    // The old bullet machinery is gone for good.
    eqz('no zoneNotes()', String(typeof zoneNotes), 'undefined');
    eqz('no ZONE_NOTE_HIDDEN', String(typeof ZONE_NOTE_HIDDEN), 'undefined');

    const tBase = zoneTrend({ min: 4, max: 12 });
    const tHalf = zoneTrend({ min: 7.5, max: 15.5 });
    const tFull = zoneTrend({ min: 11, max: 19 });
    const tShallow = zoneTrend({ min: 1, max: 9 });
    eqz('base', [tBase.offset, tBase.color].join('|'), '0|hsl(140, 72%, 46%)');
    eqz('half scale', [tHalf.offset, tHalf.color].join('|'), '3.5|hsl(52, 72%, 46%)');
    eqz('full scale', [tFull.offset, tFull.color].join('|'), '7|hsl(0, 72%, 46%)');
    eqz('shallow side', [tShallow.offset, String(tShallow.color !== tBase.color)].join('|'), '-3|true');
    eqz('ratio clamped', String(zoneTrend({ min: 20, max: 28 }).ratio) + '|' +
      String(zoneTrend({ min: -4, max: 4 }).ratio), '1|1');
    eqz('0.1" step ignored', zoneTrend({ min: 4.04, max: 12.04 }).color, tBase.color);
    eqz('0.1" step taken', String(zoneTrend({ min: 4.1, max: 12.1 }).color !== tBase.color), 'true');
    // The line-height grade must be byte-identical after sharing the grade helper.
    eqz('lh centre', zoneColor(8.0, { min: 4, max: 12 }), 'hsl(140, 72%, 46%)');
    eqz('lh edge', zoneColor(12.0, { min: 4, max: 12 }), 'hsl(0, 72%, 46%)');
    badZone.length === 0
      ? ok('HUD summary: one outcome paragraph + a graded estimate',
           'outcome bands by shift · top-two drivers named · depth/lie/line sentences · no community wording · bullets gone · green base -> yellow half -> red full, 0.1" steps')
      : fail('HUD summary: one outcome paragraph + a graded estimate', badZone.join(' '));
  } catch (e) {
    fail('HUD summary: one outcome paragraph + a graded estimate', String(e.message).split('\n')[0]);
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

// --- API resilience (2026-09-29 phone report) ------------------------------------------
// The phone showed EVERY /api/nearby_stations consumer failing at once ("Could not load nearby
// gauges" + "Could not reach the gauge lookup") while the endpoint was healthy from the dev
// machine. A cold tunnel answers the FIRST request with an HTML error page instead of JSON -
// the flake station/picker.js already retries for. The map + spot paths had no retry, and the
// map threw on that page BEFORE plotting the saved-spot stars (so a saved spot vanished too).
// These checks pin the retry, the honest wording, the coordinate hygiene, and the star layer.
async function apiResilienceChecks() {
  describe('API resilience (the /api/* lookups the map + spots use)');
  const apiSrc = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'api.js'), 'utf8');
  const formatSrc = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'format.js'), 'utf8');
  const spotsSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'map', 'spots.js'), 'utf8');
  const mapSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'map', 'map.js'), 'utf8');
  const spotsMapSrc = fs.readFileSync(path.join(ROOT, 'src', 'features', 'map', 'spots-map.js'), 'utf8');
  const NAME = 'a cold /api lookup recovers on retry, names its cause, and keeps the star layer';
  const realFetch = global.fetch;
  const realWindow = global.window;
  const realLogDebug = global.logDebug;
  try {
    const logs = [];
    global.logDebug = (m) => logs.push(String(m));
    // One scope, so the pure halves (api.js, format.js for escapeHtml, spots.js, map.js) can be
    // called directly - the map builds its popup HTML eagerly, so format.js is required here.
    eval(apiSrc + '\n' + formatSrc + '\n' + spotsSrc + '\n' + spotsMapSrc + '\n' + mapSrc);

    const res_ = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
    const HTML_502 = '<html><body><h1>502 Bad Gateway</h1></body></html>';
    const ONE_STATION = JSON.stringify({ stations: [{ id: '12101500', name: 'Puyallup River at Puyallup, WA', lat: 47.2, lon: -122.31, distance_mi: 1.2 }] });
    const nearest = [{ id: '12094000', name: 'Carbon River near Fairfax', lat: 47.02, lon: -122.03, distance_mi: 3.4 }];

    // (1) Cold tunnel: the first answer is an HTML error page, the retry is real data. The
    // status and a sanitised body slice reach the debug trail; the query string (it carries
    // the angler's coordinates) never does.
    let n = 0;
    global.fetch = async () => (++n === 1 ? res_(502, HTML_502) : res_(200, ONE_STATION));
    const cold = await apiGetJson('/api/nearby_stations?lat=47.1&lon=-122.2', { label: 'nearby_stations' });
    const coldOk = cold.ok && cold.status === 200 && n === 2 && cold.data.stations.length === 1 &&
      logs.some((l) => /HTTP 502/.test(l)) && logs.some((l) => /502 Bad Gateway/.test(l)) &&
      logs.every((l) => !/47\.1|-122\.2/.test(l));

    // (2) A permanent 5xx is retried then reported; a 4xx is the server's FINAL word, so it is
    // not retried and the server's own message is what surfaces.
    n = 0;
    global.fetch = async () => { n++; return res_(503, 'gateway down'); };
    const dead = await apiGetJson('/api/nearby_stations?lat=47.1&lon=-122.2', { label: 'nearby_stations' });
    const deadTries = n;
    n = 0;
    global.fetch = async () => { n++; return res_(400, JSON.stringify({ stations: [], error: 'Coordinates outside the covered region' })); };
    const refused = await apiGetJson('/api/nearby_stations?lat=1&lon=2', { label: 'nearby_stations' });
    const statusOk = !dead.ok && dead.status === 503 && dead.error === 'HTTP 503' && deadTries === 2 && n === 1 &&
      !refused.ok && /outside the covered region/.test(refused.serverMessage || '');

    // (3) "Could not ask" stays distinct from "no gauge here" - including the API's own HTTP 200
    // degradation note ("USGS gauges could not be reached"), which must NOT read as a fact.
    global.fetch = async () => res_(200, JSON.stringify({ stations: [] }));
    const noneNear = await resolveSpotStation(47.0, -122.0, null);
    global.fetch = async () => res_(200, JSON.stringify({ stations: [], note: 'USGS gauges could not be reached (throttled or offline)' }));
    const couldNotAsk = await resolveSpotStation(47.0, -122.0, null);
    global.fetch = async () => res_(200, JSON.stringify({ stations: nearest }));
    const gotIt = await resolveSpotStation(47.0, -122.0, null);
    const resolverOk = noneNear.ok === true && noneNear.station === null &&
      couldNotAsk.ok === false && /could not be reached/i.test(couldNotAsk.error || '') &&
      gotIt.ok === true && gotIt.station.id === '12094000';
    // (4) The saved-spot STAR LAYER is plotted from local state even when the feed is dead -
    // that is the bug that left a saved spot off the phone's map entirely.
    const marked = [];
    global.window = { L: {
      divIcon: (o) => ({ o }),
      circleMarker: () => ({ addTo: () => {} }),
      layerGroup: () => ({ addTo: () => {} }),
      marker: (ll) => {
        const m = { ll, bindPopup() { return m; }, addTo() { marked.push(ll); return m; } };
        return m;
      }
    } };
    spotsState.rows = [{ id: 's1', label: 'Smooth Operator', latitude: 47.19, longitude: -122.30 }];
    _stationMap = { getZoom: () => 10, setView: () => {}, getContainer: () => ({ style: {} }), invalidateSize: () => {}, once: () => {} };
    _stationMarkers = { clearLayers: () => {}, addTo: () => {} };
    global.fetch = async () => res_(503, 'gateway down');
    const outDead = await refreshStationMap([47.2, -122.31]);
    const deadStarOk = !!outDead.error && outDead.count === 0 && outDead.spots === 1 &&
      marked.length === 1 && marked[0][0] === 47.19 && marked[0][1] === -122.30;
    global.fetch = async () => res_(200, ONE_STATION);
    marked.length = 0;
    const outLive = await refreshStationMap([47.2, -122.31]);
    const liveStarOk = outLive.count === 1 && outLive.spots === 1 && !outLive.error && marked.length === 2;

    // (5) Wiring: both consumers go through the helper (no bare fetch of the endpoint left),
    // and both failure messages name the cause instead of blaming the data.
    const wireOk = /apiGetJson\('\/api\/nearby_stations/.test(mapSrc) &&
      /apiGetJson\('\/api\/nearby_stations/.test(spotsSrc) &&
      !/await fetch\('\/api\/nearby_stations/.test(spotsSrc) &&
      !/await fetch\('\/api\/nearby_stations/.test(mapSrc) &&
      /function plotSavedSpotStars\(\)/.test(mapSrc) &&
      /out\.spots = plotSavedSpotStars\(\)/.test(mapSrc) &&
      /'Could not load nearby gauges \(' \+ out\.error \+ '\)'/.test(mapSrc) &&
      /'Could not reach the gauge lookup' \+ \(why \?/.test(spotsSrc) &&
      /attempts = opts\.attempts \|\| 2/.test(apiSrc) &&
      /API_RETRY_DELAY_MS/.test(apiSrc);

    (coldOk && statusOk && resolverOk && deadStarOk && liveStarOk && wireOk)
      ? ok(NAME, 'retried the HTML 502 -> 200 (2 calls); 5xx retried, 4xx not; note != empty list; star plotted on a dead feed AND beside live gauges; no coordinates in the log')
      : fail(NAME, `cold=${coldOk} status=${statusOk} resolver=${resolverOk} deadStar=${deadStarOk} ` +
          `liveStar=${liveStarOk} wire=${wireOk} marked=${JSON.stringify(marked)} logs=[${logs.join(' | ')}]`);

  } catch (e) {
    fail(NAME, String(e.message).split('\n')[0]);
  } finally {
    global.fetch = realFetch;
    global.logDebug = realLogDebug;
    if (realWindow === undefined) delete global.window; else global.window = realWindow;
  }
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
    await apiResilienceChecks();
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

