# System Patterns — architecture & conventions

Orientation only. The authoritative sources are **`AGENTS.md`** (project shape, working
rules, validation) and **`.clinerules`** (plan/act workflow + hard guardrails).

- **No build step.** Plain HTML/CSS plus classic (non-module) scripts sharing one global
  scope, loaded in dependency order at the end of `<body>`. `src/app.js` is **last** and
  **bootstrap-only**.
- **Feature layout.** `src/features/{telemetry,gear-sim,catch-log,station,auth,map}/`;
  shared primitives in `src/shared/`; region data in `src/data/regions/`. Target <150 lines
  per feature file; data/contract files are exempt.
- **One registry, no hardcoded regions.** `src/data/regions/washington.js` is a strict-JSON
  payload read by BOTH the frontend and `api/water_report.py`.
- **Techniques are plug-ins.** Gear Sim physics is deterministic and frozen; only the
  registered technique's pure `compute(rig, env)` changes behaviour (`docs/CONTRACT_TECHNIQUE.md`).
- **Privacy boundary.** RLS on `public.catches`; GPS/reach/tackle/auth ids are never public.
- **Service worker is user-visible behaviour.** Bump `sw.js` VERSION whenever shell files
  change, alongside the `SHELL_FILES` list.

**Find a symbol:** `docs/SYMBOLS.md` · **Data shapes:** `docs/CONTRACT*.md`.
