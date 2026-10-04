"""Vercel entry point for ``/api/report-issue``.

POST a debug log to create a GitHub issue.

Usage::

    POST /api/report-issue
    {"log": "...debug log text...", "description": "optional description", "page": "the page URL"}

Requires ``GITHUB_TOKEN`` environment variable (a GitHub personal access token
with ``public_repo`` scope). When the token is missing, the report is logged
to stderr instead.

Returns::

    {"ok": true, "issue_url": "https://github.com/nprice/TheFishReport/issues/123"}
    {"ok": true, "stored": true, "note": "GITHUB_TOKEN not set — reported to stderr"}
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse
import urllib.request

GITHUB_API = "https://api.github.com/repos/nprice/TheFishReport/issues"
TOKEN = os.environ.get("GITHUB_TOKEN", "")


def _respond(handler, status, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        _respond(self, 204, {})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return _respond(self, 400, {"error": "empty request body"})

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw)
        except Exception:
            return _respond(self, 400, {"error": "invalid JSON"})

        log_text = (payload.get("log") or "").strip()
        description = (payload.get("description") or "").strip()
        page = (payload.get("page") or "").strip()

        if not log_text:
            return _respond(self, 400, {"error": "log is required"})

        # Build issue body
        body_parts = []
        if description:
            body_parts.append("## Description\n" + description + "\n")
        if page:
            body_parts.append("## Page\n" + page + "\n")
        body_parts.append("## Debug Log\n```\n" + log_text + "\n```")

        issue_body = "\n".join(body_parts)

        title = "Issue Report"
        if description:
            title = description[:80]

        # Try to create GitHub issue
        if TOKEN:
            try:
                req_data = json.dumps({
                    "title": title,
                    "body": issue_body,
                    "labels": ["report"],
                }).encode("utf-8")

                req = urllib.request.Request(
                    GITHUB_API, data=req_data,
                    headers={
                        "Authorization": "token " + TOKEN,
                        "Content-Type": "application/json",
                        "User-Agent": "TheFishReport/1.0",
                    })
                with urllib.request.urlopen(req, timeout=15) as resp:
                    result = json.load(resp)
                    issue_url = result.get("html_url", "")
                    return _respond(self, 200, {
                        "ok": True,
                        "issue_url": issue_url,
                        "issue_number": result.get("number"),
                    })
            except Exception as e:
                return _respond(self, 500, {
                    "ok": False,
                    "error": "GitHub API error: " + str(e),
                })
        else:
            # No token — log to stderr
            import sys
            print("[report-issue] NO GITHUB_TOKEN set. Report:",
                  file=sys.stderr)
            print(issue_body, file=sys.stderr)
            return _respond(self, 200, {
                "ok": True,
                "stored": True,
                "note": "GITHUB_TOKEN not set — reported to stderr",
            })