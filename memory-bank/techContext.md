# Tech Context — stack & setup

| Layer | Choice |
| --- | --- |
| Frontend | Plain HTML + CSS + classic JS. **No** framework, bundler, npm or ES modules. |
| Backend | `api/water_report.py` — Vercel Python serverless (`handler` class only, no `__main__`). |
| Database | Supabase (Postgres + RLS + anonymous auth); migrations in `supabase/migrations/`. |
| Live data | USGS **WDFN OGC API** (keyless), Open-Meteo, NOAA CO-OPS tides, WDFW Socrata. |
| Offline | `sw.js` (tap-to-apply updates) + a durable IndexedDB catch outbox. |

**Run locally**

```bash
python3 scripts/dev_server.py 8000      # → http://127.0.0.1:8000/index.html
```

The dev server subclasses `api/water_report.handler`; do not construct a second handler
(it re-runs `handle()` on a consumed socket and blocks forever).

**Validate** — `node sanity_pass.js` (zero dependencies: plain Node + Python). It picks a
free port, cleans up after itself, and derives the script list from `index.html`, so a newly
added module is syntax- and HTTP-checked automatically. `.github/workflows/sanity.yml` runs
it on every push/PR to `main`.

**Ship** — Vercel git integration, keyed on the REPO (no `vercel.json` / `.vercel`), so a push to
`main` is the deploy. **Production: `https://thefishreport.vercel.app`** (verified live 2026-09-29:
`sw.js` served `v2.03.13`, `/api/water_report` → 4 days, `tackle.json` 200). The repo's GitHub
homepage field still points at the pre-rename alias `index-html-topaz-five.vercel.app`, which
**404s** — stale metadata, not a broken deploy; the Vercel project itself is still named
`index-html` (team `pioneer-co`), and its immutable per-deployment URL is behind deployment
protection.

**Detail:** `README.md` (full layout, PWA caching table, the dev-server gotcha).
