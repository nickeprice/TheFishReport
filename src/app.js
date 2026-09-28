/**
 * src/app.js - Puyallup River Companion application core.
 *
 * Extracted verbatim from the inline script in index.html (v2.00) so behaviour
 * is unchanged. Owns UI state, navigation, guest auth, the deterministic fluid
 * dynamics engine, the Gear Sim, the Brag Board and the station selector.
 *
 * Loaded as a classic script LAST: it calls into src/services/water.js and
 * src/services/supabase.js, and wires window.onload.
 */
    // Catch Log renderer — merged single list with a "yours / everyone" toggle.
// The ONE list shows either the signed-in angler's private rows (with Edit/Delete)
// or the public board (Name / Time / Flow / Fish). The active scope is tracked in
// CATCH_SCOPE so sign-in/sign-out and new logs re-render the right side.
var CATCH_SCOPE = 'everyone';   // 'yours' | 'everyone' (default = the public board)

function setCatchScope(scope) {
    CATCH_SCOPE = (scope === 'everyone') ? 'everyone' : 'yours';
    var yoursBtn = document.getElementById('scope-yours');
    var everyoneBtn = document.getElementById('scope-everyone');
    var note = document.getElementById('catch-scope-note');
    if (yoursBtn) yoursBtn.classList.toggle('scope-active', CATCH_SCOPE === 'yours');
    if (everyoneBtn) everyoneBtn.classList.toggle('scope-active', CATCH_SCOPE === 'everyone');
    if (note) {
        note.textContent = (CATCH_SCOPE === 'yours')
            ? 'Your private catch log — only you can see it. Edit or delete from here.'
            : 'Public feed — name, time, river and fish only. Gear profiles and GPS stay private.';
    }
    // Swap the table headers to match the active scope, then render.
    var head = document.getElementById('catch-log-head');
    if (head) {
        head.innerHTML = (CATCH_SCOPE === 'yours')
            ? '<tr><th>Species</th><th>Time</th><th>Flow</th><th>Score</th><th></th></tr>'
            : '<tr><th>Name</th><th>Time</th><th>River</th><th>Fish</th></tr>';
    }
    if (CATCH_SCOPE === 'yours') {
        if (typeof renderMyCatches === 'function') renderMyCatches();
    } else {
        loadDatabase();
    }
}

// Public board renderer (the "everyone" scope of the merged list): only
// Name / Time / Flow / Fish. Reads the Supabase view first and falls back to
// the local buffer when offline or unconfigured.
async function loadDatabase() {
    var tbody = document.getElementById('catch-log-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    var rows = [];
    var fromCloud = false;
    if (typeof Supa !== 'undefined') {
        try {
            rows = await Supa.fetchPublicFeed(100);
            fromCloud = rows.length > 0;
        } catch (e) { rows = []; }
    }

    if (!fromCloud) {
        var local = [];
        try {
            var jStr = localStorage.getItem('catch_db');
            local = jStr ? JSON.parse(jStr) : [];
        } catch (e) { local = []; }
        rows = local.slice().reverse();
        logDebug('Brag board falling back to ' + rows.length + ' buffered row(s)', 'DB');
    }

    var rendered = 0;
    for (var i = 0; i < rows.length; i++) {
        var r = normalizeFeedRow(rows[i]);
        if (!r) continue;
        var tr = document.createElement('tr');
        var tdName = document.createElement('td');
        tdName.textContent = (r.name !== undefined && r.name !== null && r.name !== '') ? String(r.name) : '--';
        var tdTime = document.createElement('td');
        tdTime.textContent = formatCatchTime(r.time);
        var tdRiver = document.createElement('td');
        tdRiver.textContent = (r.river !== undefined && r.river !== null && r.river !== '') ? String(r.river) : '--';
        var tdSpc = document.createElement('td');
        tdSpc.textContent = (r.spc !== undefined && r.spc !== null && r.spc !== '') ? String(r.spc) : '--';
        tr.appendChild(tdName);
        tr.appendChild(tdTime);
        tr.appendChild(tdRiver);
        tr.appendChild(tdSpc);
        tbody.appendChild(tr);
        rendered++;
    }

    if (rendered === 0) {
        var empty = document.createElement('tr');
        empty.innerHTML = '<td colspan="4" class="empty-state">' +
            '<div class="empty-state-icon">\ud83c\udfa3</div>' +
            '<div class="empty-state-title">No catches on the board yet</div>' +
            '<div class="empty-state-hint">' + (fromCloud
                ? 'Be the first to post — log a catch from the form above and it lands here.'
                : 'You are offline or signed out, so this shows your local log only. Sign in to sync to the public board.') +
            '</div>' +
            '</td>';
        tbody.appendChild(empty);
    }

    if (typeof refreshZonePreview === 'function') refreshZonePreview();
    logDebug('Catch log (everyone): ' + rendered + ' row(s) ' + (fromCloud ? 'from Supabase' : 'from local buffer'), 'DB');
}

// --- YOUR CATCHES (private log: list, edit, delete) — the "yours" scope ---
var _myCatches = [];

async function renderMyCatches() {
    var tbody = document.getElementById('catch-log-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Show an empty/disabled state until a session exists.
    var signedIn = AuthState && AuthState.signedIn;
    if (!signedIn || typeof Supa === 'undefined') {
        var signInEmpty = document.createElement('tr');
        signInEmpty.innerHTML = '<td colspan="5" class="empty-state">' +
            '<div class="empty-state-title">Join the board to see your catches</div>' +
            '<div class="empty-state-hint">Enter your name below and tap JOIN THE BOARD, then log your first catch.</div></td>';
        tbody.appendChild(signInEmpty);
        return;
    }

    var rows = null;
    try { rows = await Supa.fetchMyCatches(); } catch (e) { rows = []; }
    _myCatches = rows || [];

    if (!_myCatches.length) {
        var empty = document.createElement('tr');
        empty.innerHTML = '<td colspan="5" class="empty-state">' +
            '<div class="empty-state-title">No logged catches yet</div>' +
            '<div class="empty-state-hint">Fill in the form above and tap LOG CATCH DATA — no Gear Sim needed.</div></td>';
        tbody.appendChild(empty);
        return;
    }

    for (var i = 0; i < _myCatches.length; i++) {
        var c = _myCatches[i];
        var tr = document.createElement('tr');

        var tdSpc = document.createElement('td');
        tdSpc.textContent = c.species || '--';
        var tdTime = document.createElement('td');
        tdTime.textContent = formatCatchTime(c.catch_time);
        var tdFlow = document.createElement('td');
        tdFlow.textContent = (c.flow != null) ? c.flow : '--';
        var tdScore = document.createElement('td');
        tdScore.textContent = (c.sim_score != null) ? Number(c.sim_score).toFixed(1) : '--';
        tr.appendChild(tdSpc);
        tr.appendChild(tdTime);
        tr.appendChild(tdFlow);
        tr.appendChild(tdScore);

        var tdAct = document.createElement('td');
        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'mini-btn';
        editBtn.textContent = 'Edit';
        editBtn.onclick = (function (row) { return function () { editMyCatch(row); }; })(c);
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'mini-btn mini-btn-danger';
        delBtn.textContent = 'Delete';
        delBtn.onclick = (function (id) { return function () { deleteMyCatch(id); }; })(c.id);
        tdAct.appendChild(editBtn);
        tdAct.appendChild(delBtn);
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
    }
}

// Inline edit: prompt for the most useful private fields and update the row.
async function editMyCatch(row) {
    var species = prompt('Species', row.species || '');
    if (species == null) return;
    var flow = prompt('River flow (CFS)', row.flow != null ? String(row.flow) : '');
    if (flow == null) return;
    var patch = { species: species.trim() || row.species, flow: parseInt(flow, 10) || row.flow };
    var res = null;
    try { res = await Supa.updateMyCatch(row.id, patch); } catch (e) { res = null; }
    if (res && res.ok) {
        showToast('Catch updated', 'success', 2500);
        renderMyCatches();
    } else {
        showToast('Could not update: ' + ((res && res.error) || 'unknown error'), 'error', 5000);
    }
}

async function deleteMyCatch(id) {
    if (!window.confirm('Delete this catch? This cannot be undone.')) return;
    var res = null;
    try { res = await Supa.deleteMyCatch(id); } catch (e) { res = null; }
    if (res && res.ok) {
        showToast('Catch deleted', 'success', 2500);
        renderMyCatches();
        loadDatabase();   // the public board may have shrunk
    } else {
        showToast('Could not delete: ' + ((res && res.error) || 'unknown error'), 'error', 5000);
    }
}

// --- RIG PRESET PERSISTENCE ---
var RIG_STORE_KEY = 'puyallup_last_rig';

function saveRig() {
    try {
        var rig = {
            rodFt: getStr('rod-ft'),
            rodIn: getStr('rod-in'),
            mlMat: getStr('ml-mat'),
            mlLb: getStr('ml-lb'),
            ldLen: getStr('ld-len'),
            ldMat: getStr('ld-mat'),
            ldLb: getStr('ld-lb'),
            weight: getStr('weight'),
            hook: getStr('hook'),
            yarn: getStr('yarn'),
            foam: getStr('foam'),
            foam2: getStr('foam2'),
            bdMat: getStr('bd-mat'),
            bdSz: getStr('bd-sz')
        };
        localStorage.setItem(RIG_STORE_KEY, JSON.stringify(rig));
    } catch (e) {}
}

function restoreRig() {
    var raw = null;
    try { raw = localStorage.getItem(RIG_STORE_KEY); } catch (e) { return; }
    if (!raw) return;
    var rig = null;
    try { rig = JSON.parse(raw); } catch (e) { return; }
    if (!rig) return;

    // Pre-fill from the angler's OWN last-used values. Anything they have never
    // entered stays blank (the set() guard skips empty strings) and is required.
    function set(id, val) {
        var el = document.getElementById(id);
        if (el && val !== undefined && val !== null && val !== '') el.value = String(val);
    }
    set('rod-ft', rig.rodFt); set('rod-in', rig.rodIn);
    set('ml-mat', rig.mlMat); set('ml-lb', rig.mlLb);
    set('ld-len', rig.ldLen); set('ld-mat', rig.ldMat); set('ld-lb', rig.ldLb);
    set('weight', rig.weight); set('hook', rig.hook); set('yarn', rig.yarn);
    set('foam', rig.foam); set('foam2', rig.foam2);
    set('bd-mat', rig.bdMat); set('bd-sz', rig.bdSz);
    // Mirror to the Catch Log duplicated controls.
    set('rod-ft-log', rig.rodFt); set('rod-in-log', rig.rodIn);
    set('ml-mat-log', rig.mlMat); set('ml-lb-log', rig.mlLb);
    set('ld-len-log', rig.ldLen); set('ld-mat-log', rig.ldMat); set('ld-lb-log', rig.ldLb);
    set('weight-log', rig.weight); set('hook-log', rig.hook); set('yarn-log', rig.yarn);
    set('foam-log', rig.foam); set('foam2-log', rig.foam2);
    set('bd-mat-log', rig.bdMat); set('bd-sz-log', rig.bdSz);
}

async function runSim() {
    var simBtn = document.getElementById('btn-sim');

    // No defaults: every gear field must be chosen before the solver can run.
    var missing = missingRigFields();
    if (missing.length) {
        showToast('Fill in: ' + missing.join(', '), 'warn', 6000);
        return;
    }

    if (simBtn) { simBtn.innerText = 'CALCULATING...'; simBtn.disabled = true; }

    // 1. Read the rig off the form -------------------------------------------------
    var flow = getCurrentFlow();          // derived from the live water report
    var weightOz = getNum('weight');
    var rodFt = getRodLengthFt();
    var ldLen = getNum('ld-len');
    var ldMat = getStr('ld-mat');
    var ldLb = getNum('ld-lb') || REF_LB_TEST;
    var mlMat = getStr('ml-mat');
    var mlLb = getNum('ml-lb');
    var hookRaw = parseFloat(getStr('hook'));
    var hook = isNaN(hookRaw) ? 2 : hookRaw;        // 0 = 1/0, -1 = 2/0
    var yarn = getNum('yarn');
    var foam = parseFoam(getStr('foam'));           // Foam 1
    var foam2 = parseFoam(getStr('foam2'));         // Foam 2 (second corky)
    var bdMat = getStr('bd-mat');
    var bdSz = getNum('bd-sz');
    var species = getStr('species');

    // Community sonar: anonymised full tackle telemetry from every angler who has
    // logged a catch at this flow and species. Physics stays locked - this data only
    // moves the strike zone toward where fish are actually feeding. Falls back to
    // the local buffer offline.
    var dbArray = [];
    if (typeof Supa !== 'undefined') {
        try { dbArray = await Supa.fetchGlobalCalibration(flow, species); } catch (e) { dbArray = []; }
    }
    if (!dbArray.length) {
        try {
            var jStr = localStorage.getItem('catch_db');
            dbArray = jStr ? JSON.parse(jStr) : [];
        } catch (e) { dbArray = []; }
    }

    // 2. Fluid dynamics (LOCKED: drag coefficient is always 1.0) -----------------------
    // Every component counts: leader diameter (sqrt lb x material), coupled
    // mainline, bead sphere + material sink, hook mass/gap, yarn skirt.
    var velocity = hydraulicVelocity(flow);
    var dragPerFt = totalDragPerFt(velocity.bottom, ldLb, ldMat, mlLb, mlMat, weightOz, hook, yarn, bdMat, bdSz);
    // Foam 1 + Foam 2 both contribute buoyancy (two corkies lift more).
    var lift = rigLift(foam.lift + foam2.lift, yarn, hook, bdMat, bdSz);
    var hgt = presentationHeightInches(lift, ldLen, dragPerFt);
    var blownOut = (velocity.bottom > 3.5 && weightOz < 0.5);

    // 3. Where the fish are today, then score the presentation ------------------------
    var sonar = communitySonar(dbArray, flow, species);
    var zone = computeStrikeZone(sonar);
    var score = 5.0;
    if (blownOut) {
        score = 0.0;
    } else {
        if (hgt < zone.min) score -= Math.min(3.0, (zone.min - hgt) * 0.45);
        if (hgt > zone.max) score -= Math.min(3.0, (hgt - zone.max) * 0.45);
    }
    if (score < 0) score = 0;
    if (score > 5) score = 5;

    // 4. Build the suggestions: what to change to get into the zone -------------------
    // Rig Adjustments only: your current state + the exact gear to tie on. No
    // calibration meta-talk - the community data already moved the zone above.
    var suggestions = [];
    var best = bestZoneRig(zone, velocity.bottom, ldLb, ldMat, mlLb, mlMat, foam.key, weightOz, ldLen, yarn, hook, bdMat, bdSz, foam2.lift);

    if (blownOut) {
        suggestions.push('BLOWN OUT: the bed is running ' + velocity.bottom.toFixed(1) + ' ft/s with only ' + weightOz + ' oz of lead. Step up to 3/4 oz or 1 oz, or fish a slower seam.');
    } else if (hgt < zone.min) {
        var lowWhy = (sonar && sonar.center !== null && sonar.center > (zone.min + zone.max) / 2)
            ? 'Weather and recent catches show fish holding higher in the column'
            : 'Fish are holding off the bottom';
        suggestions.push('Presentation pinned at ' + hgt.toFixed(1) + '" (zone ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"). ' + lowWhy + '. Add buoyancy: bigger Corky, more yarn, or a longer leader.');
    } else if (hgt > zone.max) {
        var highWhy = (sonar && sonar.center !== null && sonar.center < (zone.min + zone.max) / 2)
            ? 'Weather and recent catches show fish pinned tight to the bottom'
            : 'Fish are holding tight to the bottom';
        suggestions.push('Floating over fish at ' + hgt.toFixed(1) + '" (zone ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"). ' + highWhy + '. Cut lift: smaller Corky, less yarn, heavier lead, or a shorter leader.');
    } else {
        suggestions.push('On target: ' + hgt.toFixed(1) + '" sits inside today\'s ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '" strike zone.');
    }

    if (best && !blownOut && score < 5.0) {
        suggestions.push('Try this: ' + best.foam.label + ' + ' + best.leader + ' ft leader + ' + best.weight + ' oz lead -> projects ' + best.hgt.toFixed(1) + '" of line height.');
    }
    if (species && species !== 'None') {
        suggestions.push('Targeting ' + species + ' at ' + flow + ' CFS on a ' + formatRodLength(rodFt) + ' rod with a ' + ldMat + ' ' + ldLb + 'lb leader.');
    }
// 5. Paint the HUD ---------------------------------------------------------------
    currentStats = {
        flow: flow,
        rodFt: rodFt,
        weight: weightOz,
        ldLen: ldLen,
        ldMat: ldMat,
        ldLb: ldLb,
        mlMat: mlMat,
        mlLb: mlLb,
        hook: hook,
        yarn: yarn,
        foam: foam.key,
        foam2: foam2.key,
        bdMat: bdMat,
        bdSz: bdSz,
        hgt: hgt,
        zoneMin: zone.min,
        zoneMax: zone.max,
        score: score,
        bottomVelocity: velocity.bottom,
        meanVelocity: velocity.mean,
        dragCoeff: 1.0,
        blownOut: blownOut
    };
    saveRig();

    var color = 'var(--accent-green)';
    if (score < 4.0) color = 'var(--accent-yellow)';
    if (score < 2.5) color = 'var(--accent-red)';

    var eHgt = document.getElementById('hud-hgt');
    eHgt.innerText = hgt.toFixed(1) + '"';
    eHgt.style.color = color;

    var eVel = document.getElementById('hud-vel');
    eVel.innerText = velocity.bottom.toFixed(1);
    eVel.style.color = blownOut ? 'var(--accent-red)' : color;

    document.getElementById('target-hgt').innerText = 'Zone: ' + zone.min.toFixed(1) + '" - ' + zone.max.toFixed(1) + '"';
    document.getElementById('vel-target').innerText = blownOut ? 'BLOWN OUT' : 'Target: < 3.5 ft/s';

    var msg = blownOut ? 'BLOWN OUT - no presentation control'
        : ((hgt >= zone.min && hgt <= zone.max) ? 'Inside the strike zone' : 'Outside the strike zone');
    document.getElementById('hud-msg').innerText = msg + '  \u2022  Score ' + score.toFixed(1) + ' / 5.0';

    // Logging is decoupled from the Gear Sim — the catch-log button keeps its
    // own label/state (set by applyAuthState) and is never gated on the sim.

    var sugBox = document.getElementById('suggestions');
    sugBox.style.display = 'block';
    sugBox.innerHTML = '<span class="sug-head">Rig Adjustments</span>- ' + suggestions.join('<br>- ') +
        '<div class="sug-cond">' + zone.notes.join('<br>') + '</div>';

    if (simBtn) { simBtn.innerText = 'RUN SIMULATION'; simBtn.disabled = false; }
    logDebug('Sim: height ' + hgt.toFixed(2) + '", bed velocity ' + velocity.bottom.toFixed(2) +
        ' ft/s, zone ' + zone.min.toFixed(1) + '-' + zone.max.toFixed(1) + '", score ' + score.toFixed(2), 'SIM');
}

// Derive a coarse river name from the active station (e.g. "Puyallup River",
// "Carbon River", "Green River", "Nisqually River", "White River"). Falls back
// to '--'. Never exposes exact coordinates on the public board.
function deriveRiverName() {
    try {
        var active = JSON.parse(localStorage.getItem('active_station') || 'null');
        var nm = (active && active.name) ? String(active.name) : '';
        var m = nm.match(/([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:River|Creek|Ck)/i);
        if (m) return m[1].replace(/\s+/g, ' ').trim() + ' River';
        // Fall back to a known station-id map.
        if (active && active.id) {
            if (active.id === '12101500') return 'Puyallup River';
            if (active.id === '12093500') return 'White River';
            if (active.id === '12094000') return 'Carbon River';
            if (active.id === '12113000') return 'Green River';
            if (active.id === '12089500') return 'Nisqually River';
        }
    } catch (e) {}
    return '--';
}

    // Offline-first write: buffer the catch locally, then push the full private profile
// (complete tackle + GPS) to Supabase. The public view only ever exposes 4 columns.
async function logData() {
    if (!AuthState.signedIn) {
        switchTab('tab-catch-log');
        var nameField = document.getElementById('auth-name');
        if (nameField) nameField.focus();
        showToast('Join the board first: enter your name and tap JOIN THE BOARD.', 'warn', 5000);
        return;
    }
    // No defaults anywhere: gear, species and time must all be filled in.
    var missing = missingRigFields();
    if (getStr('species') === '') missing.push('Species Caught');
    if (getStr('log-datetime') === '') missing.push('Date & Time');
    if (missing.length) {
        showToast('Fill in: ' + missing.join(', '), 'warn', 6000);
        return;
    }
    var foamRaw = getStr('foam');
    var activeRep = getActiveReport();
    // Decoupled from the Gear Sim: logging works straight from the form. When a
    // sim HAS been run we still carry its solved geometry (hook/height/zone) so
    // logs keep the rich private columns, but nothing here requires runSim().
    var simFlow = (currentStats && currentStats.flow != null) ? currentStats.flow : null;
    // Flow is derived from the live report now — never read off a form field.
    var flowValue = (simFlow != null) ? simFlow : getCurrentFlow();
    var hookValue = (currentStats && currentStats.hook != null) ? currentStats.hook : (parseFloat(getStr('hook')) || 2);
    var payload = {
        name: AuthState.name || 'Anonymous',
        time: getStr('log-datetime'),
        gps: (window.userGPSCoords && window.userGPSCoords.lat != null && window.userGPSCoords.lon != null)
            ? window.userGPSCoords.lat + ',' + window.userGPSCoords.lon
            : null,
        river: deriveRiverName(),
        flow: flowValue,
        spc: getStr('species'),
        ldLen: getNum('ld-len'),
        ldMat: getStr('ld-mat'),
        ldLb: getNum('ld-lb'),
        mlMat: getStr('ml-mat'),
        mlLb: getNum('ml-lb'),
        weight: getNum('weight'),
        rodFt: getRodLengthFt(),
        hook: hookValue,
        yarn: getNum('yarn'),
        foam: foamRaw,
        foam2: getStr('foam2'),
        bdMat: getStr('bd-mat'),
        bdSz: getNum('bd-sz'),
        // Environmental context captured at log time (private row enrichment).
        // Falls back to null when the report/telemetry is unavailable.
        gauge: (activeRep && activeRep.gage != null) ? activeRep.gage : null,
        barometer: (activeRep && activeRep.pressure != null) ? activeRep.pressure : null,
        waterTemp: getWaterTempF(),
        windSpeed: (typeof window.currentWindMph !== 'undefined' && window.currentWindMph != null) ? window.currentWindMph : null,
        windDir: (typeof window.currentWindDir !== 'undefined' && window.currentWindDir != null) ? window.currentWindDir : null,
        moon: (activeRep && activeRep.lunar_icon != null) ? activeRep.lunar_icon : null,
        hgt: (currentStats && currentStats.hgt != null) ? Number(currentStats.hgt.toFixed(2)) : null,
        zoneMin: (currentStats && currentStats.zoneMin != null) ? Number(currentStats.zoneMin.toFixed(2)) : null,
        zoneMax: (currentStats && currentStats.zoneMax != null) ? Number(currentStats.zoneMax.toFixed(2)) : null,
        score: (currentStats && currentStats.score != null) ? Number(currentStats.score.toFixed(2)) : null
    };

    // 1. Offline buffer first, so a logged catch is never lost.
    var db = [];
    try {
        var jStr = localStorage.getItem('catch_db');
        db = jStr ? JSON.parse(jStr) : [];
    } catch (e) { db = []; }
    var idx = db.push(payload) - 1;
    try { localStorage.setItem('catch_db', JSON.stringify(db)); } catch (e) {}
    logDebug('Catch buffered locally', 'DB');

    // 2. Async push of the private record to Supabase.
    var res = null;
    if (typeof Supa !== 'undefined') {
        try { res = await Supa.insertCatch(payload); } catch (e) { res = null; }
    }
    if (res && res.ok) {
        db[idx].syncedAt = new Date().toISOString();
        try { localStorage.setItem('catch_db', JSON.stringify(db)); } catch (e) {}
        logDebug('Catch synced to Supabase', 'SYNC');
    } else {
        db[idx].pendingSync = true;
        try { localStorage.setItem('catch_db', JSON.stringify(db)); } catch (e) {}
        logDebug('Queued for retry: ' + ((res && res.error) || 'offline'), 'SYNC');
    }

    document.getElementById('btn-log').innerText = 'LOG CATCH DATA';
    document.getElementById('btn-log').className = 'btn-main';
    currentStats = null;
    if (typeof setCatchScope === 'function') setCatchScope(CATCH_SCOPE);
    switchTab('tab-catch-log');
}

// --- STATION SELECTOR MODAL & GPS FUNCTIONS ---
function openStationModal() {
    document.getElementById('station-modal').style.display = 'block';
    document.getElementById('gps-status').innerText = '';
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('station-search').value = '';
}

function closeStationModal() {
    document.getElementById('station-modal').style.display = 'none';
}

function selectPreset(id, lat, lon, name, isGps) {
    activeDateOffset = 0;
    var station = { id: id, lat: lat, lon: lon, name: name, isGps: !!isGps };
    localStorage.setItem('active_station', JSON.stringify(station));
    logDebug("Selected Station: " + name + " (" + id + ")", "STATE");
    closeStationModal();
    loadWaterReport();
}

// Haversine distance in miles
function calcDistance(lat1, lon1, lat2, lon2) {
    var R = 3958.8; // Radius of Earth in miles
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function fallbackStation() {
    selectPreset('12101500', 47.1950, -122.3020, 'Puyallup River at Puyallup, WA', false);
}

function useGPS() {
    var status = document.getElementById('gps-status');
    status.innerText = "Waiting for GPS (grant the location prompt)...";
    if (!navigator.geolocation) {
        status.innerText = "Geolocation not supported. Falling back.";
        setTimeout(fallbackStation, 1500);
        return;
    }
    var settled = false;
    var watchdog = setTimeout(function () {
        if (settled) return;
        settled = true;
        status.innerText = "GPS took too long. Falling back.";
        logDebug("GPS location timed out - falling back to default station", "ERR");
        fallbackStation();
    }, 15000);
    navigator.geolocation.getCurrentPosition(async function(pos) {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        status.innerText = "Captured position. Searching nearby USGS gauges...";
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var fetchTimer = setTimeout(function () { if (controller) controller.abort(); }, 10000);
        try {
            // Same-origin server-side USGS lookup (reliable on mobile). Retry once
            // if the first response is empty (a cold Cloudflare tunnel connection can
            // return an aborted body on the very first request).
            var timeSeries = null;
            for (var attempt = 0; attempt < 2; attempt++) {
                var response = await fetch('/api/nearby_stations?lat=' + lat + '&lon=' + lon, { cache: "no-store", signal: controller ? controller.signal : undefined });
                var data = await response.json();
                timeSeries = (data && data.stations) ? data.stations : [];
                if (timeSeries && timeSeries.length > 0) break;
                if (attempt === 0) await new Promise(function (r) { setTimeout(r, 700); });
            }
            if (!timeSeries || timeSeries.length === 0) {
                status.innerText = "No USGS stations found in range. Falling back.";
                setTimeout(fallbackStation, 2000);
                return;
            }
            var stationsMap = {};
            timeSeries.forEach(function(ts) {
                var sCode = ts.id;
                var sName = ts.name;
                var sLat = ts.lat;
                var sLon = ts.lon;
                var sDist = ts.distance_mi;
                if (!stationsMap[sCode]) {
                    stationsMap[sCode] = {
                        id: sCode,
                        name: sName,
                        lat: sLat,
                        lon: sLon,
                        distance: (sDist !== undefined && sDist != null) ? sDist : calcDistance(lat, lon, sLat, sLon)
                    };
                }
            });
            var stationsList = Object.values(stationsMap);
            stationsList.sort(function(a, b) { return a.distance - b.distance; });
            if (stationsList.length > 0) {
                var closest = stationsList[0];
                status.innerText = "Found: " + closest.name + " (" + closest.distance.toFixed(1) + " mi)";
                setTimeout(function() { selectPreset(closest.id, closest.lat, closest.lon, closest.name, true); }, 1500);
            } else {
                status.innerText = "No active gauge stations in range. Falling back.";
                setTimeout(fallbackStation, 2000);
            }
        } catch(e) {
            status.innerText = "USGS search failed. Falling back.";
            logDebug("USGS GPS box error: " + e.message, "ERR");
            setTimeout(fallbackStation, 2000);
        } finally {
            clearTimeout(fetchTimer);
        }
    }, function(err) {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        status.innerText = (err && err.code === 3) ? "GPS timed out. Falling back." : "GPS Access Denied. Falling back.";
        logDebug("Geolocation error: " + (err ? err.message : "unknown"), "ERR");
        setTimeout(fallbackStation, 1500);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
}

async function searchStation() {
    var term = document.getElementById('station-search').value.trim();
    var resultsBox = document.getElementById('search-results');
    
    if (!term) return;
    resultsBox.style.display = 'block';
    resultsBox.innerHTML = '<div style="color:var(--accent-yellow); font-weight:bold; padding:8px;">Searching...</div>';
    
    // If exact 8 digit gauge ID
    if (term.match(/^\d{8}$/)) {
        resultsBox.innerHTML = '<div style="color:var(--accent-yellow); font-weight:bold; padding:8px;">Fetching metadata...</div>';
        var url = 'https://waterservices.usgs.gov/nwis/iv/?format=json&sites=' + term + '&parameterCd=00060,00065&siteStatus=all';
        try {
            var response = await fetch(url);
            var data = await response.json();
            var timeSeries = data.value.timeSeries;
            if (timeSeries && timeSeries.length > 0) {
                var info = timeSeries[0].sourceInfo;
                var name = info.siteName;
                var sLoc = info.geoLocation.geogLocation;
                var lat = sLoc.latitude;
                var lon = sLoc.longitude;
                
                resultsBox.innerHTML = '<button class="preset-btn" onclick="selectPreset(\''+term+'\', '+lat+', '+lon+', \''+name.replace(/'/g, "\\'")+'\')" style="margin:5px 0;">' +
                    '<span>'+name+'</span> <span class="preset-id">'+term+'</span></button>';
            } else {
                resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ USGS Station ID not found or inactive.</div>';
            }
        } catch(e) {
            resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ Search Error.</div>';
            logDebug("USGS Search error: " + e.message, "ERR");
        }
        return;
    }

    // Search by river name in Washington State (stateCd=wa)
    resultsBox.innerHTML = '<div style="color:var(--accent-yellow); font-weight:bold; padding:8px;">Searching Washington rivers...</div>';
    var url = 'https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=wa&parameterCd=00060,00065&siteStatus=all';
    try {
        var response = await fetch(url);
        var data = await response.json();
        var timeSeries = data.value.timeSeries;
        if (!timeSeries || timeSeries.length === 0) {
            resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ No active stations found.</div>';
            return;
        }
        
        var stationsMap = {};
        var searchTermLower = term.toLowerCase();
        timeSeries.forEach(function(ts) {
            var sCode = ts.sourceInfo.siteCode[0].value;
            var sName = ts.sourceInfo.siteName;
            var sLoc = ts.sourceInfo.geoLocation.geogLocation;
            var sLat = sLoc.latitude;
            var sLon = sLoc.longitude;
            
            if (sName.toLowerCase().indexOf(searchTermLower) !== -1) {
                stationsMap[sCode] = {
                    id: sCode,
                    name: sName,
                    lat: sLat,
                    lon: sLon
                };
            }
        });
        
        var results = Object.values(stationsMap);
        if (results.length === 0) {
            resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ No matching active stations found.</div>';
        } else {
            resultsBox.innerHTML = '<div style="color:var(--text-muted); font-size:10px; padding:4px;">Showing top ' + Math.min(10, results.length) + ' matches:</div>';
            // Show up to 10 results
            results.slice(0, 10).forEach(function(s) {
                var safeName = s.name.replace(/'/g, "\\'");
                resultsBox.innerHTML += '<button class="preset-btn" onclick="selectPreset(\''+s.id+'\', '+s.lat+', '+s.lon+', \''+safeName+'\')" style="margin:5px 0;">' +
                    '<span>'+s.name+'</span> <span class="preset-id">'+s.id+'</span></button>';
            });
        }
    } catch(e) {
        resultsBox.innerHTML = '<div style="color:var(--accent-red); font-weight:bold; padding:8px;">❌ Search Error.</div>';
        logDebug("USGS search error: " + e.message, "ERR");
    }
}

// --- GEAR SIM INPUT DEBOUNCING ---
// The numeric gear inputs feed the deterministic physics engine. Recomputing on
// every keystroke would run the solver for each partial value ("1", "10", "104",
// "1040"), so the live zone preview is debounced to a single trailing pass.
// Selects and the rod boxes keep their existing synchronous onchange sync.
function initGearSimInputDebounce() {
    var ids = ['flow', 'distance', 'rod-ft', 'rod-in'];
    var debounced = debounce(function () {
        if (typeof refreshZonePreview === 'function') refreshZonePreview();
    }, 250);

    ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', debounced);
    });
    logDebug('Gear Sim inputs debounced (' + ids.length + ' fields, 250ms trailing)', 'UI');
}

// --- AUTO-REFRESH ---
// A homescreen PWA has no pull-to-refresh, so the live telemetry is re-fetched
// on its own: every 5 minutes while visible+online, the moment the app comes
// back to the foreground, and when connectivity returns. All three routes call
// loadWaterReport(true) — a "silent" refresh that updates the whole report +
// hero but never overwrites a Gear Sim CFS the angler typed by hand.
var AUTO_REFRESH_MS = 5 * 60 * 1000;
var autoRefreshTimer = null;

function silenceableRefresh() {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        loadWaterReport(true);
    }
}

function startAutoRefresh() {
    if (autoRefreshTimer) return;
    // Periodic: keep the data fresh while the app sits open.
    autoRefreshTimer = setInterval(silenceableRefresh, AUTO_REFRESH_MS);
    // Foregrounding: the classic "I picked up my phone" moment.
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') silenceableRefresh();
    });
    logDebug('Auto-refresh armed (every ' + (AUTO_REFRESH_MS / 60000) + ' min + on foreground)', 'PWA');
}

// Manual refresh affordance (header ⟳) for a standalone PWA.
function refreshNow() {
    loadWaterReport(true);
    showToast('Refreshing live data\u2026', 'info', 2000);
}

// --- PWA: SERVICE WORKER REGISTRATION ---
// Called from window.onload, so the document is already fully loaded and the
// worker install will not compete with first paint. Failures are non-fatal: the
// app works exactly as before without a worker.
//
// NOTE: this must NOT wrap registration in another 'load' listener. window.onload
// runs *during* the load event's dispatch, and the DOM copies the listener list
// before invoking it, so a listener added here would never fire.
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        logDebug('Service worker unsupported - PWA caching disabled', 'PWA');
        return;
    }

    navigator.serviceWorker.register('/sw.js').then(function (reg) {
        logDebug('Service worker registered (scope ' + reg.scope + ')', 'PWA');

        reg.addEventListener('updatefound', function () {
            var installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', function () {
                if (installing.state !== 'installed') return;
                if (navigator.serviceWorker.controller) {
                    // A new version finished caching. Do NOT reload automatically:
                    // an angler mid-way through a catch log would lose typed data.
                    // Offer the update instead and let them choose when to apply.
                    logDebug('New app version cached - awaiting user approval', 'PWA');
                    showToast('Update ready for the next launch', 'info', 8000, {
                        label: 'UPDATE NOW',
                        onClick: function () {
                            installing.postMessage({ type: 'SKIP_WAITING' });
                            // Give the new worker a moment to claim clients first.
                            setTimeout(function () { window.location.reload(); }, 400);
                        }
                    });
                } else {
                    logDebug('App shell cached for offline use', 'PWA');
                    showToast('Offline mode ready', 'success', 2500);
                }
            });
        });
    }).catch(function (err) {
        logDebug('Service worker registration failed: ' + err.message, 'PWA');
    });

    // Tell the angler when connectivity changes, since the water report depends
    // on it and the offline shell can serve stale numbers. On reconnect, actually
    // re-fetch so a homescreen install self-heals without a manual refresh.
    if ('onLine' in navigator) {
        window.addEventListener('online', function () {
            showToast('Back online - refreshing live data', 'success', 2500);
            logDebug('Network restored', 'PWA');
            silenceableRefresh();
        });
        window.addEventListener('offline', function () {
            showToast('Offline - showing cached river data', 'warn', 4000);
            logDebug('Network lost - offline shell active', 'PWA');
        });
    }
}

// Apply a ?tab= deep link so the PWA manifest shortcuts land on the right tool.
function applyTabDeepLink() {
    try {
        var params = new URLSearchParams(window.location.search);
        var tab = params.get('tab');
        if (!tab) return false;
        if (!document.getElementById(tab)) return false;
        document.querySelectorAll('.tab-content').forEach(function (el) {
            el.classList.remove('tab-active');
        });
        document.getElementById(tab).classList.add('tab-active');
        logDebug('Deep link opened ' + tab, 'UI');
        return true;
    } catch (e) {
        return false;
    }
}

// --- BOOTSTRAP ---
window.onload = function() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById('log-datetime').value = d.toISOString().slice(0,16);
    restoreRig();
    initGearSimInputDebounce();
    applyTabDeepLink();
    registerServiceWorker();
    startAutoRefresh();
    getGPS();
    initAuth();
    if (typeof setCatchScope === 'function') setCatchScope(CATCH_SCOPE);
    loadWaterReport();
};
