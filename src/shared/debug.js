/**
 * src/shared/debug.js - debug console.
 * public: logDebug(msg, source), toggleDebug(), copyDebugLog(), reportDebugIssue()
 * ES module.
 */
// --- DEBUG TOGGLE (5 rapid taps on station name) ---
var _tapCount = 0;
var _tapTimer = null;
export function toggleDebug() {
    const con = document.getElementById('debug-console');
    con.classList.toggle('open');
    logDebug(con.classList.contains('open') ? 'Debug Matrix Opened' : 'Debug Matrix Closed', "SYS");
}
(function () {
    var el = document.getElementById('active-station-name');
    if (!el) return;
    el.addEventListener('click', function () {
        _tapCount++;
        if (_tapTimer) clearTimeout(_tapTimer);
        _tapTimer = setTimeout(function () { _tapCount = 0; }, 1500);
        if (_tapCount >= 5) {
            _tapCount = 0;
            toggleDebug();
        }
    });
})();
// Expose toggleDebug globally so any button can call it
window.toggleDebug = toggleDebug;

export function logDebug(msg, source) {
    const con = document.getElementById('debug-console');
    const time = new Date().toISOString().split('T')[1].slice(0,-1);
    con.innerHTML += '<div class="log-entry">[' + time + '] <b>' + source + '</b>: ' + msg + '</div>';
    con.scrollTop = con.scrollHeight;
}
window.logDebug = logDebug;

// Copy all debug entries as plain text
export function copyDebugLog() {
    const con = document.getElementById('debug-console');
    let text = '';
    const entries = con.querySelectorAll('.log-entry');
    for (let i = 0; i < entries.length; i++) {
        const t = entries[i].textContent || entries[i].innerText || '';
        if (t) text += t + '\n';
    }
    if (!text) { logDebug('Nothing to copy', 'SYS'); return; }
    const ta = document.createElement('textarea');
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
export function reportDebugIssue() {
    const con = document.getElementById('debug-console');
    const entries = con.querySelectorAll('.log-entry');
    let logText = '';
    for (let i = 0; i < entries.length; i++) {
        const t = entries[i].textContent || entries[i].innerText || '';
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
            logDebug('Report stored: ' + (data.note || 'server-side'), 'SYS');
        } else if (data.error) {
            logDebug('Report failed: ' + data.error, 'ERR');
        }
    }).catch(function (err) {
        logDebug('Report failed: ' + (err.message || 'unknown'), 'ERR');
    });
}
window.reportDebugIssue = reportDebugIssue;
