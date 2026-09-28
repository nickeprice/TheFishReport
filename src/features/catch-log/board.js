/**
 * src/features/catch-log/board.js - merged catch list + "yours / everyone" scope.
 * public: CATCH_SCOPE, setCatchScope(scope), loadDatabase()
 * Classic script (global scope). Loaded BEFORE src/app.js.
 * Privacy: the public board renders 4 columns only (name/time/river/fish).
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
