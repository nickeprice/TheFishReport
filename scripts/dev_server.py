"""Local development server.

Serves the repository root statically and delegates ``/api/*`` to the real
production handler in ``api/water_report.py``.

``api/water_report.py`` only defines a ``handler`` class - it has no
``__main__`` block, because Vercel's Python serverless runtime supplies the
server. That means there is otherwise no way to run the frontend and the API
together locally.

IMPORTANT: this subclasses the production handler instead of constructing a
second ``BaseHTTPRequestHandler``. Constructing a new handler re-runs
``handle()``, which reads a *new* request line off the socket - but this handler
has already consumed it, so the second handler blocks forever on the keep-alive
socket. Subclassing and delegating to ``do_GET`` avoids that entirely.

Usage::

    python3 scripts/dev_server.py 8000
"""

import importlib
import importlib.util
import mimetypes
import os
import sys
from http.server import ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))

import water_report  # noqa: E402  (path set up above)

_API_DIR = os.path.join(ROOT, 'api')


def _api_module(name):
    """``api/<name>.py`` as a module, or None when no such entry point exists.

    Vercel routes Python functions ONE FILE PER ROUTE, so this mirrors production
    instead of sending every ``/api/*`` path to the water_report handler. That
    difference is exactly what hid the missing ``/api/nearby_stations`` route: it
    answered locally for months and 404'd on the deployed app (2026-09-29).

    Hyphens in the URL path (e.g. ``spot-geometry``) are supported by loading
    the module from its file path via ``importlib.util``, since Python's module
    naming does not allow hyphens.
    """
    if not name:
        return None
    # Try the original name as a file first (supports hyphens via util path).
    full = os.path.join(_API_DIR, name + '.py')
    if os.path.isfile(full):
        spec = importlib.util.spec_from_file_location(name.replace('-', '_'), full)
        if spec is not None:
            mod = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = mod
            spec.loader.exec_module(mod)
            return mod
    # Fallback: try with underscores (e.g. nearby_stations).
    mod_name = name.replace('-', '_')
    if not mod_name.isidentifier():
        return None
    if not os.path.isfile(os.path.join(_API_DIR, mod_name + '.py')):
        return None
    return importlib.import_module(mod_name)


def api_routes():
    """The routes this server (and Vercel) will serve, for the startup banner."""
    names = sorted(f[:-3] for f in os.listdir(_API_DIR)
                   if f.endswith('.py') and not f.startswith('_'))
    return ['/api/' + n for n in names]


class Handler(water_report.handler):
    """Static file server that delegates ``/api/<name>`` to ``api/<name>.py``."""

    protocol_version = 'HTTP/1.0'   # sidestep keep-alive edge cases

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/api/'):
            mod = _api_module(path.split('/')[2])
            if mod is not None:
                return mod.handler.do_GET(self)
            # No api/<name>.py for this path: it is one of the water_report handler's
            # own routes (an unknown path answers there too, as it always has).
            return water_report.handler.do_GET(self)
        return self.serve_static()

    def serve_static(self):
        path = unquote(urlparse(self.path).path)
        if path == '/':
            path = '/index.html'
        full = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
        # Refuse anything that escapes the repository root.
        if not full.startswith(ROOT) or not os.path.isfile(full):
            self.send_response(404)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'not found')
            return
        ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
        with open(full, 'rb') as fh:
            body = fh.read()
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write('[dev] %s\n' % (fmt % args))
        sys.stderr.flush()


def main():
    host = '127.0.0.1'   # loopback default keeps local dev + CI hermetic
    port = 8000
    args = sys.argv[1:]
    if args and args[0].startswith('--host='):
        host = args.pop(0).split('=', 1)[1] or '127.0.0.1'
    if args:
        port = int(args[0])

    httpd = ThreadingHTTPServer((host, port), Handler)
    display = '0.0.0.0' if host in ('0.0.0.0', '::') else host
    print('The Fish Report dev server')
    print('  root : %s' % ROOT)
    print('  host : %s' % display)
    print('  url  : http://%s:%d/index.html' % (display, port))
    print('  api  : %s -> api/<name>.py (Vercel parity)' % ', '.join(api_routes()))
    print('  (LAN test: python3 scripts/dev_server.py --host=0.0.0.0 8000)')
    print('Ctrl-C to stop.')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nstopping')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
