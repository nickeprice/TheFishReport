/**
 * src/features/catch-log/log.js - logData(): buffer a catch locally, then push it
 * to Supabase. deriveRiverName() supplies the coarse (coordinate-free) river name.
 * public: deriveRiverName(), logData()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 * NOTE: the localStorage buffer becomes the IndexedDB outbox in UPDATE 3.0 Phase 3.
 */
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
        // Client-generated id -> becomes the row's primary key, so a retry that follows a
        // lost response is deduped instead of logging the fish twice (Phase 3.2).
        clientId: newUuid(),
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
