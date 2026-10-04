/**
 * src/shared/debug.js - debug console + double-tap header matrix.
 * public: logDebug(msg, source)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- DEBUG MATRIX (Double Tap / Double Click Header, or Debug button) ---
var lastTap = 0;
function toggleDebug() {
    var con = document.getElementById('debug-console');
    con.classList.toggle('open');
    logDebug(con.classList.contains('open') ? 'Debug Matrix Opened' : 'Debug Matrix Closed', "SYS");
}
function _toggleDebug(e) {
    var now = Date.now();
    if (now - lastTap < 500) {
        toggleDebug();
        e.preventDefault();
    }
    lastTap = now;
}
document.getElementById('top-nav').addEventListener('touchend', _toggleDebug);
document.getElementById('top-nav').addEventListener('click', _toggleDebug);
// Expose toggleDebug globally so any button can call it
window.toggleDebug = toggleDebug;

function logDebug(msg, source) {
    var con = document.getElementById('debug-console');
    var time = new Date().toISOString().split('T')[1].slice(0,-1);
    con.innerHTML += '<div class="log-entry">[' + time + '] <b>' + source + '</b>: ' + msg + '</div>';
    con.scrollTop = con.scrollHeight;
}

// Copy all debug entries as plain text
// Copy all debug entries as plain text
function copyDebugLog() {
    var con = document.getElementById('debug-console');
    var text = '';
    var entries = con.querySelectorAll('.log-entry');
    for (var i = 0; i < entries.length; i++) {
        var t = entries[i].textContent || entries[i].innerText || '';
        if (t) text += t + '\n';
    }
    if (!text) { logDebug('Nothing to copy', 'SYS'); return; }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'absolute'; ta.style.left = '0'; ta.style.top = '0';
    ta.style.width = '1px'; ta.style.height = '1px'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    logDebug('Copied ' + entries.length + ' entries to clipboard', 'SYS');
}
window.copyDebugLog = copyDebugLog;

// Open a GitHub issue with the current debug log as the body.
function reportDebugIssue() {
    var con = document.getElementById('debug-console');
    var entries = con.querySelectorAll('.log-entry');
    var logText = '';
    for (var i = 0; i < entries.length; i++) {
        var t = entries[i].textContent || entries[i].innerText || '';
        if (t) logText += t + '\n';
    }
    if (!logText) { logDebug('Nothing to report', 'SYS'); return; }

    logDebug('Sending report...', 'SYS');

    fetch('/api/report-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            log: logText,
            description: '',
            page: window.location ? window.location.href : ''
        })
    }).then(function (res) {
        return res.json();
    }).then(function (data) {
        if (data.issue_url) {
            logDebug('Issue created: ' + data.issue_url, 'SYNC');
            window.open(data.issue_url, '_blank');
        } else if (data.stored) {
            logDebug('Report stored (no GitHub token). Log saved server-side.', 'SYS');
        } else if (data.error) {
            logDebug('Report failed: ' + data.error, 'ERR');
        }
    }).catch(function (err) {
        logDebug('Report failed: ' + (err.message || 'unknown'), 'ERR');
    });
}
window.reportDebugIssue = reportDebugIssue;
