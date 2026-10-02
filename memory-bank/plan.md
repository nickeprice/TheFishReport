# ACTIVE PLAN — re-pin sanity_pass.js to the pure-math physics invariants

STATUS: READY
Updated: 2026-10-02

Goal: the pure-math physics rebuild (`F = 0.5·rho·Cd·A·v²`) shipped, but the frozen
baseline tests in `sanity_pass.js` still pin the OLD tuned values, so 7 assertions fail.
Replace the pinned numbers with invariants that hold for the new physics.

> Seeded from the recorded pending item at the top of `activeContext.md`. Plan mode owns
> this file — overwrite it with the real plan before act mode runs.

- [ ] 1. Enumerate the failing assertions — run `node sanity_pass.js --quiet` and list
      every FAIL with its line. files: sanity_pass.js — verify: the FAIL list is reported
      before any edit.
- [ ] 2. Re-pin each frozen baseline to a physics INVARIANT, not a magic number (drag
      scales with diameter; buoyancy scales with size; lift is a small difference of large
      terms). files: sanity_pass.js — verify: `node sanity_pass.js --quiet` prints PASSED
      with 0 FAIL.
- [ ] 3. Record the re-pin rationale inline next to each changed assertion.
      files: sanity_pass.js — verify: every changed line carries a `// rationale:` comment.
- [ ] 4. Bump `sw.js` VERSION if any shell file changed. files: sw.js — verify:
      `node sanity_pass.js --quiet` still green.
- [ ] 5. Commit AND push in one step. files: — verify: `git status` clean and `origin/main`
      advanced.

## Follow-ups (NOT part of this plan — do not execute)
- Archive the stale `## ACTIVE` sections in `memory-bank/activeContext.md` so the word
  "ACTIVE" means one thing (large, risky rewrite — do it deliberately, not in act mode).
