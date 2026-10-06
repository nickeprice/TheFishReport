
function defaultForm() {
  return {
    'ml-mat': 'braid', 'ml-brand': 'PowerPro', 'ml-lb': '30',
    'ml-line': 'pp-30-braid',
    'ld-mat': 'mono', 'ld-brand': 'Maxima', 'ld-lb': '12',
    'ld-line': 'maxima-12-mono', 'ld-len': '8',
    'weight-shape': 'Lead Cannonball', 'weight-setup': 'sliding',
    'weight': '0.5',
    'hook': 'gam-oct-2', 'yarn': '1', 'foam': '12', 'foam2': '0', 'foam3': '6',
    'species': 'Chinook', 'water-type': 'run',
  };
}

// ---------- 3. Main ----------
async function main() {
  const port = 9876 + Math.floor(Math.random() * 1000);
  const server = await startServer(port);
  const baseUrl = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    page = await browser.newPage();
    await page.goto(baseUrl + '/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.logDebug === 'function',
      { timeout: 10000 });

    const form = defaultForm();
    Object.keys(CUSTOM).forEach((k) => {
      if (CUSTOM[k] !== undefined) form[k] = String(CUSTOM[k]);
    });
    await page.evaluate((vals) => {
      Object.entries(vals).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      });
    }, form);

    await page.evaluate(() => {
      const ml = document.getElementById('ml-line');
      if (ml) ml.value = 'pp-30-braid';
      const ld = document.getElementById('ld-line');
      if (ld) ld.value = 'maxima-12-mono';
    });
    await page.evaluate((items) => { window.TACKLE = { items: items }; }, TI);

// ---------- 1. Start minimal HTTP server serving dist/ ----------
function startServer(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = urlMod.parse(req.url).path;
      if (p === '/') p = '/index.html';
      const f = path.join(DIST, p.replace(/^\//, ''));
      if (!f.startsWith(DIST)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        const ext = path.extname(f).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(port, () => resolve(srv));
  });
}

// ---------- 2. Default tackle items ----------
const TI = [
  { id: 'pp-30-braid', type: 'line', material: 'braid', brand: 'PowerPro',
    lb_test: 30, diameter_mm: 0.38, density_g_cm3: 1 },
  { id: 'maxima-12-mono', type: 'line', material: 'mono', brand: 'Maxima',
    lb_test: 12, diameter_mm: 0.33, density_g_cm3: 1.15 },
  { id: 'hook-gam-oct-2', type: 'hook', size: '2', mass_g: 0.145,
    buoyancy_g: 0.019, area_cm2: 0.2916, cd: 1.05 },
  { id: 'corky-12', type: 'foam', size: 12, mass_g: 0.01,
    buoyancy_g: 0.262, area_cm2: 0.495, cd: 0.47 },
  { id: 'bead-6', type: 'bead', size_mm: 6, mass_g: 0.15,
    buoyancy_g: 0.02, netSinkG: 0.13, area_cm2: 0.35, cd: 0.5 },
  { id: 'lead-cannonball-0.5', type: 'weight', shape: 'Lead Cannonball',
    oz: 0.5, mass_g: 14.175, area_cm2: 1.8, cd: 0.47, density_g_cm3: 11.34 },
  { id: 'slinky-0.5', type: 'weight', shape: 'Slinky',
    oz: 0.5, mass_g: 14.175, area_cm2: 3.5, cd: 0.8, density_g_cm3: 4.5 },
];

    const out = await page.evaluate(async () => {
      if (typeof runSim !== 'function') return { error: 'runSim not on window' };
      const rig = readRigFromForm();
      const dbArray = await loadCalibrationData(rig.flow, rig.species);
      const siteId = getActiveStationId();
      const env = { flow: rig.flow, species: rig.species,
        dbArray: dbArray, siteId: siteId };
      const result = gearTechnique().compute(rig, env);
      const stats = buildSimStats(rig, result);
      paintSimHud(rig, result, stats);
      return {
        height: result.hgt, score: result.score, blownOut: result.blownOut,
        chainConverged: result.chainResult ? result.chainResult.converged : null,
        hookDepthM: result.chainResult ? result.chainResult.hookDepthM : null,
        zoneMin: result.zone ? result.zone.min : null,
        zoneMax: result.zone ? result.zone.max : null,
        whereToFish: result.whereToFish || null,
        velocityMean: result.velocity ? result.velocity.mean : null,
        velocityBottom: result.velocity ? result.velocity.bottom : null,
      };
    });

    if (out.error) { console.error('ERROR:', out.error); process.exit(1); }

    if (!BRIEF) {
      console.log('');
      console.log('=== RUN (Playwright) ===');
      console.log('  Rig: ' + (CUSTOM.weightOz || 0.5)
        + 'oz LC 8\' mono Flow: ' + (CUSTOM.flow || 1040) + 'cfs Chinook');
      console.log('  Height=' + out.height.toFixed(2)
        + 'in Score=' + out.score.toFixed(2) + '/5 Blown=' + out.blownOut);
      if (out.chainConverged !== null)
        console.log('  Chain conv=' + out.chainConverged
          + ' hD=' + out.hookDepthM.toFixed(3) + 'm');
      if (out.zoneMin !== null)
        console.log('  Zone: ' + out.zoneMin.toFixed(1)
          + ' - ' + out.zoneMax.toFixed(1) + 'in');
      if (out.whereToFish) console.log('  Where: ' + out.whereToFish);
      if (out.velocityMean)
        console.log('  Vel mean=' + out.velocityMean.toFixed(4)
          + ' bot=' + out.velocityBottom.toFixed(4));
      console.log(''); console.log('-- DONE --');
    } else {
      console.log('h=' + out.height.toFixed(2)
        + ' s=' + out.score.toFixed(2) + ' b=' + out.blownOut);
    }
  } finally {
    if (page) await page.close();
    await browser.close();
    server.close();
  }
}

main().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });
