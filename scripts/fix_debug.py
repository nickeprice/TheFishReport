c = open("src/shared/debug.js").read()
old = """// --- DEBUG MATRIX (Double Tap / Double Click Header, or Debug button) ---
let lastTap = 0;
export function toggleDebug() {
    const con = document.getElementById('debug-console');
    con.classList.toggle('open');
    logDebug(con.classList.contains('open') ? 'Debug Matrix Opened' : 'Debug Matrix Closed', "SYS");
}
function _toggleDebug(e) {
    const now = Date.now();
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

"""
new = """// Expose toggleDebug globally
window.toggleDebug = toggleDebug;

"""
c = c.replace(old, new)
open("src/shared/debug.js", "w").write(c)
print("Done")