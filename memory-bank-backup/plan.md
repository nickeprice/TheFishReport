# ACTIVE PLAN — Clean up guardrails, fix plan/act collision, shrink token overhead

STATUS: DONE

- [x] 1. Replace `.clinerules` — 96→38 lines, removed [cite:1]/plan-workflow/redundancies — verify: `wc -l .clinerules` = 38 (< 40)
- [x] 2. Archive activeContext.md — 119 KB→2.6 KB, 1434 lines moved to history.md — verify: `wc -c memory-bank/activeContext.md` = 2573 (< 3000)
- [x] 3. Remove plan_check from verification — plan_check.py deleted, lines 15-16 removed from check.sh — verify: `bash scripts/check.sh --quick` exits 0
- [x] 4. Delete progress.md — file deleted — verify: file does not exist
- [x] 5. Update memory-bank rule in .clinerules — verify: grep 'history.md' returns the "Do NOT read" line
- [x] 6. Run full verification — `node sanity_pass.js --quiet` 199/208 (9 pre-existing physics failures, same as baseline); `bash scripts/check.sh --quick` syntax OK
