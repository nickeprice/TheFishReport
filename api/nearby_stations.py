"""Vercel entry point for ``/api/nearby_stations``.

Vercel serves Python functions ONE FILE PER ROUTE: ``api/water_report.py`` answers
``/api/water_report`` only. The nearby-stations route inside that handler therefore
existed in LOCAL dev (``scripts/dev_server.py`` delegates every ``/api/*`` path to the
one handler) but NOT once deployed — the phone and
``curl https://thefishreport.vercel.app/api/nearby_stations?lat=47.2&lon=-122.31``
both got the Vercel 404 page (``NOT_FOUND pdx1::…``) on 2026-09-29, which broke the
map feed, the GPS lookup and every saved-spot resolution at once.

This file IS that route. It re-implements nothing: it delegates to the production
handler's ``do_GET``, which already recognises ``/api/nearby_stations`` (the two
answers cannot drift because there is only one implementation).

IMPORTANT: subclass and DELEGATE — never construct a second ``BaseHTTPRequestHandler``.
A second handler instance re-runs ``handle()``, which reads a NEW request line off the
socket; this one has already consumed it, so the call blocks forever.
``scripts/dev_server.py`` documents the same trap.
"""

import os
import sys

# The sibling module lives in this file's own directory, which is not guaranteed to be
# on sys.path in the deployed bundle. ``water_report`` is shipped with the function
# because it reads ../src/data/regions/washington.js at runtime (see its DEPLOY NOTE).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import water_report  # noqa: E402  (path set up above)


class handler(water_report.handler):
    def do_GET(self):
        # water_report.do_GET routes /api/nearby_stations (coordinates guard, USGS lookup,
        # the degradation note) and answers 400 outside the covered region.
        return water_report.handler.do_GET(self)
