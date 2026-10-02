#!/usr/bin/env python3
"""Validate the plan/act handoff artifact: memory-bank/plan.md.

Why this exists: plan mode writes the plan and act mode reads it, but nothing enforced
that the artifact exists or is well-formed — so act mode could search `activeContext.md`
forever for a plan that was never written. This is the guard that breaks that loop.

Exit 0 = a usable plan is present. Exit 1 = missing / malformed / empty, in which case
act mode must STOP and say so rather than hunt for a plan.

Usage:
    python3 scripts/plan_check.py            # check memory-bank/plan.md
    python3 scripts/plan_check.py --quiet    # only print on failure
"""

import argparse
import re
import sys
from pathlib import Path

PLAN = Path(__file__).resolve().parent.parent / "memory-bank" / "plan.md"
TITLE_RE = re.compile(r"^#\s+ACTIVE PLAN\b")
STATUS_RE = re.compile(r"^STATUS:\s*(READY|IN_PROGRESS|BLOCKED|DONE)\s*$", re.M)
TASK_RE = re.compile(r"^\s*-\s*\[[ xX]\]\s+\S", re.M)
DONE_RE = re.compile(r"^\s*-\s*\[[xX]\]", re.M)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--quiet", action="store_true", help="only print on failure")
    args = parser.parse_args()

    problems = []
    text = ""
    if not PLAN.is_file():
        problems.append(f"missing: {PLAN}")
    else:
        text = PLAN.read_text()

    status = None
    tasks = []
    if text:
        first = next((ln for ln in text.splitlines() if ln.strip()), "")
        if not TITLE_RE.match(first):
            problems.append("first non-blank line must be '# ACTIVE PLAN — <goal>'")
        status = STATUS_RE.search(text)
        if not status:
            problems.append("missing 'STATUS: READY|IN_PROGRESS|BLOCKED|DONE' line")
        tasks = TASK_RE.findall(text)
        if not tasks:
            problems.append("no task lines ('- [ ] N. …')")

    if problems:
        print("plan_check: FAIL")
        for problem in problems:
            print(f"  - {problem}")
        print("  act mode must STOP until memory-bank/plan.md is written by plan mode.")
        return 1

    if not args.quiet:
        done = len(DONE_RE.findall(text))
        print(f"plan_check: OK — STATUS {status.group(1)}, "
              f"{done}/{len(tasks)} task(s) done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
