"""Pytest shared fixtures for The Fish Report test suite.

Provides:
- dev_server: starts scripts/dev_server.py on a free port, yields the base URL,
  and tears down the server after the test session. The server runs in a
  subprocess, so patches in the test process do NOT affect it.
- inprocess_server: starts the same server IN-PROCESS on a thread, so
  patches applied via @patch ARE visible to the handler.  Use this fixture
  for API contract / schema tests.
"""

import os
import subprocess
import sys
import time
import urllib.request
from http.server import ThreadingHTTPServer
from threading import Thread
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, 'api')


def _find_free_port():
    """Return a (socket, port) bound to an ephemeral port."""
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope='session')
def dev_server():
    """Start the dev server as a subprocess, yield the root URL, tear down.

    NOTE: the subprocess has its own Python process, so patches from
    @mock.patch do NOT propagate here.  Use ``inprocess_server`` instead when
    you need to mock upstream API calls.
    """
    port = _find_free_port()
    proc = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, 'scripts', 'dev_server.py'), str(port)],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    url = f'http://127.0.0.1:{port}'

    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            urllib.request.urlopen(urllib.request.Request(url), timeout=2)
            break
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(0.2)
    else:
        proc.terminate()
        proc.wait()
        raise RuntimeError('Dev server failed to start within 10 s')

    yield url

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


@pytest.fixture(scope='function')
def inprocess_server():
    """Start the dev server IN-process on a thread, yield the root URL, tear down.

    Because the server runs in the same Python process, ``@mock.patch``
    decorators applied in the test or its fixtures are visible to the handler
    code.  This is the fixture to use for API contract / offline-mocked tests.

    Usage::

        @patch('water_report.urllib.request.urlopen', side_effect=mock_impl)
        def test_my_api(inprocess_server):
            url = inprocess_server + '/api/water_report?lat=...'
            ...

    The patch must be active *before* this fixture is requested.  Apply it
    as a decorator on the test (``@patch`` runs before fixture setup).
    """
    # Delay-import so water_report is not loaded until the test asks for it
    sys.path.insert(0, API_DIR)

    from scripts.dev_server import Handler

    port = _find_free_port()
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.timeout = 0.5
    url = f'http://127.0.0.1:{port}'

    t = Thread(target=server.serve_forever, daemon=True)
    t.start()

    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            urllib.request.urlopen(urllib.request.Request(url), timeout=2)
            break
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(0.1)
    else:
        server.shutdown()
        raise RuntimeError('In-process server failed to start within 10 s')

    yield url

    server.shutdown()