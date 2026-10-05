#!/usr/bin/env python3
"""Print ONLY the user instructions from a Cline session transcript.

Why this exists: instructions are given in chat and recorded nowhere in the repo, so a
promise can be acknowledged in prose and then evaporate when the conversation pivots —
rod length was lost that way TWICE. Auditing for that by reading the transcript is
expensive. Measured 2026-09-28 on session `1790604718924_nudti`: 7.26 MB total, of which
3.03 MB is assistant reasoning against 27 KB of user text — **112x**. The user's own turns
are a few KB, so this prints just those and a phase-end audit becomes one cheap command
instead of a multi-megabyte read.

Usage:
    python3 scripts/session_instructions.py                 # newest session
    python3 scripts/session_instructions.py 1790604718924   # session-id prefix
    python3 scripts/session_instructions.py --list
    python3 scripts/session_instructions.py --width 0       # no truncation

At each phase end: run this, reconcile every line against what actually shipped
(`docs/archive/CHANGELOG.md`, `git log`), and either do the
missing item or mark it open-by-design. Read-only, stdlib only, deterministic; session
data never leaves this machine.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

DEFAULT_DIR = Path(os.environ.get("CLINE_SESSIONS_DIR")
                   or Path.home() / ".cline" / "data" / "sessions")

# Keep the mode (an ask made in plan mode is still an ask), drop the switch notices.
MODE_RE = re.compile(r"<user_input\s+mode=\"([^\"]+)\"")
NOTICE_RE = re.compile(r"<mode_notice>.*?</mode_notice>", re.S)
TAG_RE = re.compile(r"</?user_input[^>]*>")

# Bare acknowledgements are not standalone asks, but they DO approve the prior proposal,
# so they stay visible and are flagged rather than hidden.
ACK = {"yes", "no", "go", "ok", "sure", "y", "n", "continue", "do it", "yes do it"}


def session_files(directory):
    return sorted(directory.glob("*/*.messages.json"), key=lambda p: p.stat().st_mtime)


def resolve(target, directory):
    if target is None:
        found = session_files(directory)
        if not found:
            sys.exit(f"no *.messages.json under {directory}")
        return found[-1]
    direct = Path(target)
    if direct.is_file():
        return direct
    hits = [p for p in session_files(directory) if p.parent.name.startswith(target)]
    if len(hits) != 1:
        sys.exit(f"{target!r} matched {len(hits)} sessions - use --list")
    return hits[0]


def turns(path):
    """Yield (index, mode, text) for each user text block in the transcript."""
    messages = json.loads(path.read_text())["messages"]
    for index, message in enumerate(messages):
        if message.get("role") != "user":
            continue
        content = message.get("content")
        blocks = content if isinstance(content, list) else [
            {"type": "text", "text": str(content)}]
        for block in blocks:
            if not isinstance(block, dict) or block.get("type") != "text":
                continue
            raw = block.get("text") or ""
            mode = MODE_RE.search(raw)
            text = " ".join(TAG_RE.sub(" ", NOTICE_RE.sub(" ", raw)).split())
            if text:
                yield index, (mode.group(1) if mode else "?"), text


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("session", nargs="?",
                        help="session-id prefix, or a path to a .messages.json")
    parser.add_argument("--dir", default=str(DEFAULT_DIR), help="sessions directory")
    parser.add_argument("--list", action="store_true", help="list sessions, newest first")
    parser.add_argument("--width", type=int, default=240,
                        help="max characters per turn (0 = no truncation)")
    args = parser.parse_args()

    directory = Path(args.dir)
    if not directory.is_dir():
        sys.exit(f"sessions dir not found: {directory} (set CLINE_SESSIONS_DIR)")

    if args.list:
        for path in reversed(session_files(directory)):
            print(f"{path.parent.name:<26} {sum(1 for _ in turns(path)):>4} turn(s)")
        return

    path = resolve(args.session, directory)
    limit = args.width if args.width > 0 else 10 ** 9
    print(f"# {path.parent.name} - user turns only (assistant reasoning excluded)\n")
    count = 0
    for index, mode, text in turns(path):
        count += 1
        ellipsis = "" if len(text) <= limit else " ..."
        ack = "   <ack>" if text.lower().strip(" .!") in ACK else ""
        print(f"[{index:>4} {mode:<4}] {text[:limit]}{ellipsis}{ack}")
    print(f"\n{count} turn(s). Reconcile each against docs/archive/CHANGELOG.md, "
          f"git log before calling the phase done.")


if __name__ == "__main__":
    main()
