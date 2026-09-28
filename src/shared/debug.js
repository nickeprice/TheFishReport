/**
 * src/shared/debug.js - debug console + double-tap header matrix.
 * public: logDebug(msg, source)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- DEBUG MATRIX (Double Tap Header) ---
var lastTap = 0;
document.getElementById('top-nav').addEventListener('touchend', function(e) {
    var currentTime = new Date().getTime();
    if (currentTime - lastTap < 300) {
        document.getElementById('debug-console').classList.toggle('open');
        logDebug("Debug Matrix Toggled", "SYS");
        e.preventDefault();
    }
    lastTap = currentTime;
});

function logDebug(msg, source) {
    var con = document.getElementById('debug-console');
    var time = new Date().toISOString().split('T')[1].slice(0,-1);
    con.innerHTML += '<div class="log-entry">[' + time + '] <b>' + source + '</b>: ' + msg + '</div>';
    con.scrollTop = con.scrollHeight;
}
