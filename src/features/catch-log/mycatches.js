/**
 * src/features/catch-log/mycatches.js - the private "Yours" log (list/edit/delete).
 * public: _myCatches, renderMyCatches(), editMyCatch(row), deleteMyCatch(id)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
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

    // Phase 3.4: optimistic rows first — buffered locally, not confirmed by the server yet.
    var pending = (typeof pendingNotIn === 'function') ? pendingNotIn(_myCatches).map(asMyCatchRow) : [];
    var list = pending.concat(_myCatches);

    if (!list.length) {
        var empty = document.createElement('tr');
        empty.innerHTML = '<td colspan="5" class="empty-state">' +
            '<div class="empty-state-title">No logged catches yet</div>' +
            '<div class="empty-state-hint">Fill in the form above and tap LOG CATCH DATA — no Gear Sim needed.</div></td>';
        tbody.appendChild(empty);
        return;
    }

    for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var tr = document.createElement('tr');
        if (c._pending) tr.className = 'row-pending';

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
        if (c._pending) {
            // Buffered only: there is no server id yet, so Edit/Delete would have no target.
            tdAct.appendChild(pendingBadge());
        } else {
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
        }
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
