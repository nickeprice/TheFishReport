/**
 * src/shared/ui.js - UI primitives: trailing debounce + toast stack.
 * public: debounce(fn, wait), showToast(msg, kind, ms, action)
 * Classic script (global scope). Loaded BEFORE src/app.js.
 */
// --- UTILITIES: debounce + toast notifications ---

/**
 * Trailing-edge debounce. Returns a wrapper that delays invoking `fn` until
 * `wait` ms have elapsed since the last call, so a burst of rapid input events
 * collapses into a single execution.
 *
 * Used by the Gear Sim inputs, which re-derive the strike-zone preview on every
 * keystroke; without this, typing "1040" into River Flow would run the physics
 * four times (1, 10, 104, 1040) instead of once.
 */
function debounce(fn, wait) {
    var timer = null;
    var delay = (typeof wait === 'number') ? wait : 250;
    return function () {
        var args = arguments;
        var ctx = this;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
            timer = null;
            fn.apply(ctx, args);
        }, delay);
    };
}

var TOAST_KIND_CLASS = {
    info: 'toast-info',
    success: 'toast-success',
    warn: 'toast-warn',
    error: 'toast-error'
};

/**
 * Non-blocking status message. Replaces the old alert() calls, which froze the
 * UI and could not be styled, with a dismissable pill anchored above the bottom
 * of the viewport.
 *
 * @param {string} msg     plain text (assigned via textContent, so it is never
 *                         interpreted as HTML)
 * @param {string} kind    'info' | 'success' | 'warn' | 'error'
 * @param {number} ms      auto-dismiss delay; default 4000
 * @param {object} action  optional { label, onClick }. Renders a tappable
 *                         button instead of dismissing on tap, so the message
 *                         can offer a choice (used by the PWA update prompt).
 * @returns {function}     dismisses the toast immediately
 */
function showToast(msg, kind, ms, action) {
    if (typeof document === 'undefined') return;
    var stack = document.getElementById('toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toast-stack';
        stack.setAttribute('role', 'status');
        stack.setAttribute('aria-live', 'polite');
        stack.setAttribute('aria-atomic', 'false');
        document.body.appendChild(stack);
    }

    var toast = document.createElement('div');
    toast.className = 'toast ' + (TOAST_KIND_CLASS[kind] || TOAST_KIND_CLASS.info);

    var text = document.createElement('span');
    text.className = 'toast-msg';
    text.textContent = String(msg == null ? '' : msg);
    toast.appendChild(text);

    if (action && action.label && typeof action.onClick === 'function') {
        // An actionable toast: a button performs the action, tapping the body
        // still dismisses it. Nothing is ever done to the page automatically.
        toast.classList.add('toast-action');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-btn';
        btn.textContent = action.label;
        btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            dismiss();
            action.onClick();
        });
        toast.appendChild(btn);
    }

    stack.appendChild(toast);

    // Force a reflow so the entry animation runs on a freshly inserted node.
    void toast.offsetWidth;
    toast.classList.add('toast-show');

    var life = (typeof ms === 'number') ? ms : 4000;
    var timer = setTimeout(dismiss, life);

    function dismiss() {
        clearTimeout(timer);
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
            if (!stack.children.length && stack.parentNode) {
                stack.parentNode.removeChild(stack);
            }
        }, 260);
    }

    // Tapping a toast dismisses it immediately.
    toast.addEventListener('click', dismiss);
    return dismiss;
}
