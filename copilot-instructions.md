# Copilot Instructions

**Read [`AGENTS.md`](AGENTS.md) and [`.clinerules`](.clinerules) before making changes —
they are the single source of truth for this repo's architecture, working rules and
validation commands.**

This file exists only so GitHub Copilot picks that pointer up automatically. It
deliberately duplicates nothing, because a second copy of the rules drifts: an earlier
version of this file still described the pre-3.0 `app.js` monolith and a script order
that included the now-deleted `riverRegulations.js`.

Quick pointers:

- **Stack:** plain HTML/CSS/classic JavaScript. No framework, bundler, package manager or
  ES modules. `src/app.js` is **bootstrap-only** and must load **last**.
- **Layout:** features in `src/features/*`, shared primitives in `src/shared/*`, region
  data in `src/data/regions/`.
- **Contracts:** `docs/CONTRACT.md` (API), `docs/CONTRACT_REGIONS.md` (region registry),
  `docs/CONTRACT_TECHNIQUE.md` (gear-sim techniques).
- **Check:** `node sanity_pass.js` — it derives the script list from `index.html`, so a
  newly added file is automatically syntax- and HTTP-checked.
