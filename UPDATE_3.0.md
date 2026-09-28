# UPDATE 3.0 — Scale the Core & Fix What's Urgent

STATUS: **PLANNED** (blueprint) — nothing in this file is built yet.
Companion file: [UPDATE_4.0.md](UPDATE_4.0.md) (engagement + native, future).

## 1. Scope

Update 3.0 is everything that is **(a)** a hard deadline, **(b)** a correctness bug,
or **(c)** the de-hardcoding work that lets the app scale past Washington. It is not
a rewrite. The frontend stays plain HTML/CSS/classic-JS — no bundler, no framework,
no npm. Native packaging is deliberately deferred to Update 4.0.

**Goal statement:**

> De-hardcode every Washington / Puyallup-specific assumption so the app can scale to
> more rivers and states — while keeping Washington working and the vanilla,
> no-build-step architecture intact.

## 2. The identity (why this work, in one paragraph)

This app is the **honest, offline-first field companion for river drift-anglers**: it
reads the *real* water, solves the rig against today's conditions, and keeps the
private log private — even with no signal, and it never invents a number.
The identity is a **trust** product; spot-guarding and no-fabrication are the
differentiators. Update 3.0 protects that identity while removing the hardcoded
assumptions that would break it at scale.

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Framework | **No rewrite.** Migrate in place; modularize `src/app.js` into `src/features/*`. |
| Scope | **Washington ships first.** Build the *structure* for more rivers/states; don't build them. |
| Native | **Deferred to Update 4.0.** |
| Seal Spotter | **Dropped.** |
| Privacy | Keep **anonymous-first** auth. Invariant: **never expose GPS/tackle/auth identifiers publicly.** |
| Gear Sim | **Drift is the only shipped technique.** Flossing = a drift *style* preset. |
| Deliverables | `UPDATE_3.0.md` (this file, executable) + `UPDATE_4.0.md` (roadmap). |

## 4. Token Efficiency Protocol

Principle: **minimize what Cline has to read to be correct.** Every token waste is
"a file was read that wasn't needed" or "something had to be re-derived because it
wasn't written down."

### 4.1 Offenders in this repo (fix these)

| Offender | Size today | Fix |
| --- | --- | --- |
| `src/app.js` | 2,460 lines | Split into `src/features/*` (each <150 lines) — Phase 1 |
| `api/water_report.py` | 868 lines | Extract pure helpers → `api/lib/*.py`, thin handler — Phase 4 |
| `TASK.md` | big (completed phases at top) | Keep ACTIVE phase only; archive the rest — Phase 4 |
| `src/data/wdfw_rules.json` | thousands of lines | Never whole-read; grep key + read ±30 lines (rule) |
| `.kilo/worktrees/clumsy-college/` | duplicate tree | Remove stray worktree (pure search-noise reduction) |

### 4.2 New artifacts

- **`SYMBOLS.md`** — file → public functions + one-line purpose. Cline reads this
  *map*, then reads only the target window. Highest-leverage token tool in the repo.
- **File headers** — every feature file begins with
  `// public: foo(), bar() — <one-line purpose>` so Cline greps headers, not bodies.
- **Contracts** (pattern already proven by `docs/CONTRACT.md`):
  - `docs/CONTRACT_REGIONS.md` — region registry schema
  - `docs/CONTRACT_TECHNIQUE.md` — technique/style/species registry interface
  - `docs/CONTRACT_CATCH.md` — catch payload → DB column map
- **Symbol-level digest** — for GitIngest, strip function bodies and keep
  signatures + docstrings. **Migrations stay included** (they are the safety rails;
  excluding them invites an RLS-breaking migration).
- **Refined rules** (proposed `.clinerules`/`AGENTS.md` edits, shown before applying):
  - "no file >150 lines" → **feature/component files <150; data, types, contract files exempt.**
  - "max 2 files per Act prompt" → **scope each Act prompt to one feature boundary.**

## 5. Region registry (the centerpiece)

Every hardcoded constant moves into declarative config keyed `state → waterbody`,
so "add another river" becomes a data change, not a code change.

### 5.1 Draft schema

```js
// src/data/regions/washington.js  (ships first)
{
  state: "WA",
  default_timezone: "America/Los_Angeles",
  waterbodies: [
    {
      id: "puyallup",
      name: "Puyallup River",
      waterbody_type: "river",                 // river | lake | coastal
      gauge: { site_id: "12101500", param: "00060" },  // null → no_telemetry
      tide_station: "9446484",                 // null when non-tidal
      coords: { lat: 47.1950, lon: -122.3020 },
      units: { flow: "cfs", gage: "ft" },
      legal_hours: "daylight",                 // daylight | 24hr | custom | unknown
      netting: { sites: ["12101500","12093500","12094000"], days: [6,0,1] },
      stocks: [ { species: "Chinook", peak_window: [8,1,9,30], peak_date: "09-10", avg_run: 34000 } ],
      hatchery_facility: null,
      regulation_source: "wdfw_rules.json",
      species: ["Chinook", "Coho"],
      no_telemetry: false
    }
  ]
}
```

### 5.2 De-hardcoding hit list (what the registry replaces)

| Today (hardcoded) | Where | Replaced by |
| --- | --- | --- |
| `USGS_SITE = "12101500"` | `api/water_report.py:12` | `waterbody.gauge.site_id` |
| `NOAA_STATION = "9446484"` | `api/water_report.py:13` | `waterbody.tide_station` |
| `LAT/LON = 47.1950/-122.3020` | `api/water_report.py:14` | `waterbody.coords` |
| `STOCK_BASELINES` | `api/water_report.py:16-20` | `waterbody.stocks` |
| `NETTING_DAYS` / `NETTING_SITES` | `api/water_report.py:21-24` | `waterbody.netting` |
| `nearbyStationIds` (16 WA gauges) | `api/water_report.py:286` | dynamic site-index discovery (§7) |
| `fetch_dam_clarity()` gated to Puyallup | `api/water_report.py:677` | `waterbody` capability flag |
| legal hours `±1h` / `±35m` | `api/water_report.py` report loop | `waterbody.legal_hours` (§9) |
| `fallbackStation()` → Puyallup | `src/app.js:2144` | first waterbody in registry |
| species list / netting constants | `src/app.js` | registry lookup |
| `riverRegulations.js`, `wdfw_rules.json`, `wdfw_forecasts.json` | `src/data/` | `src/data/regions/` |
| WDFW-only regs engine | `src/utils/regulations.js` | regulation *adapter* interface |
| hatchery facility mapping | `src/services/water.js` | `waterbody.hatchery_facility` |

## 6. Gear Sim — technique / style / rig-preset model

```
Technique   (changes PHYSICS)     →  drift  ·  bobber/float  ·  stillwater  ·  trolling  (future)
   └─ Style (tuning, same math)   →  natural drift · flossing · high-stick
         └─ Rig preset (saved)    →  "Heavy Flow Chinook" · "Low Water Coho"
```

- **Flossing is a *style* inside `drift`, not a separate technique** — same dead-drift
  physics, different tuning (leader length / weight-to-depth). One `compute()`, not two.
- `src/features/gear-sim/physics/` — shared deterministic primitives
  (`hydraulicVelocity`, `totalDragPerFt`, `rigLift`, `presentationHeightInches`). Cd stays 1.0.
- `src/features/gear-sim/techniques/drift.js` — the only shipped technique.
- `src/features/gear-sim/registry.js` — technique + style + species registries (data-driven).
- **Shared `<TechniqueSpeciesPicker>`** — one Style + Target-fish selector used by **both**
  Gear Sim and Catch Log (per AGENTS.md: never desync duplicated controls).
- Species registry: Chinook / Coho / Steelhead now; each contributes strike-zone priors.
- Determinism preserved: same inputs → same outputs, per technique.
- **Shipped now:** interface + registries + picker + `drift` only. Other techniques are stubs.

## 7. USGS migration (hard deadline, Q1 2027)

The telemetry layer calls `waterservices.usgs.gov`, which USGS is **decommissioning in
early 2027** (Campaign 3: Nov 2026–Feb 2027; degradations possible after Aug 2026).

| Current (dying) | Replacement (`api.waterdata.usgs.gov/ogcapi/v1/collections/`) |
| --- | --- |
| `nwis/iv/` (instant values) | `/latest-continuous` + `/continuous` |
| `nwis/dv/` (daily) | `/daily` |
| `nwis/site/` (inventory) | `/monitoring-locations` |

- **Two-step discovery** (USGS-sanctioned): query `/monitoring-locations` for station IDs
  in an area, then query flow by those IDs. This *is* our scale-correct radial discovery.
- **Free USGS API key**, held **server-side** in the proxy env (never in client files).
- Affects: `src/services/water.js` (`fetchCFSMomentum` URL, line 14) and
  `api/water_report.py` (`fetch_usgs_telemetry`, `fetch_nearby_stations`).

## 8. Flow scoring — percentile, not absolute CFS

Current scoring keys on absolute CFS / velocity (e.g. `blownOut = velocity.bottom > 3.5`).
That breaks across rivers of different sizes. New primitive:
**flow percentile-of-record for that gauge** (or gage height relative to median).
Unitless, portable, correct for every waterbody. Feeds the Hero outlook, the map
color-coding, and the Gear Sim's environment.

## 9. Legal hours — rule-driven per waterbody

Replace the hardcoded `±1h` sunrise/sunset (`lines_in`/`lines_out`) and `±35m` twilight
(`civil_in`/`civil_out`) with `waterbody.legal_hours`:

| Value | Behavior |
| --- | --- |
| `daylight` | 1h before sunrise → 1h after sunset |
| `24hr` | night fishing allowed → render "Open all day," no daylight bar |
| `custom` | explicit open/close windows |
| `unknown` | honest "check regulations" state — never a fabricated window |

Consumers: `api/water_report.py` `windows[]` + timeline, `src/app.js` legal-hours UI,
and the upcoming map regulation panel (§11).

## 10. Offline outbox (IndexedDB + idempotency)

Replaces the `localStorage` `catch_db` + `pendingSync` buffer
(`src/app.js:237` `syncPendingCatches`, `src/app.js:2018` `logData`).

1. **IndexedDB outbox** — pending catch writes, rig/technique presets, and a
   **last-known telemetry snapshot per waterbody**.
2. **Idempotency (the real bug today)** — every outbox row carries a client-generated
   UUID; the `public.catches` migration adds `ON CONFLICT (id) DO NOTHING` so a retry
   after a lost response cannot double-log. *Today a dead-zone response loss double-logs.*
3. **Reconciliation** — flush on `online`, on app `focus`/`resume`; Capacitor Network
   plugin later. **Not** Service Worker Background Sync (unsupported on iOS).
4. **Optimistic UI** — catch appears instantly in "Yours" with a pending-sync badge,
   cleared on server confirm.

Migration rules (per `.clinerules`): idempotent, timestamped, authored under
`supabase/migrations/`, **applied by the agent** with `npx supabase db push --yes`,
then verified read-only against the live DB. RLS on `public.catches` is preserved.

## 11. Interactive waterbody map (expands old Phase 2.4)

The map becomes the **primary waterbody picker + regulation browser**.

- **Tap to select** — tapping a gauge calls the existing `selectPreset()` →
  `loadWaterReport()` flow. The current search box + "Use My GPS" stay as the
  **accessible fallback** (a map alone is not a11y-complete).
- **Layers** — (1) gauge pins color-coded by flow percentile (green optimal / red
  blown out / gray dormant-offline); (2) waterbody geometry (river lines / lake
  polygons); (3) regulation layer.
- **Tap → regulation panel** with species, seasons, gear restrictions, legal hours,
  and **night-fishing status** (§9).

### Regulation display — two honest levels

| Level | What | Status |
| --- | --- | --- |
| **A** | Click gauge → text panel of that waterbody's rules (`regulation_source` pointer) | **Ship in 3.0** |
| **B** | Actual regulation *zones* as shaded polygons | **Update 4.0** — needs a geocoding pipeline (WDFW describes zones in prose, not coordinates) |

### Implementation notes

- Base tiles: OpenStreetMap via **Leaflet** (vanilla-JS friendly, no framework).
- Gauge locations come free from USGS `/monitoring-locations` (§7).
- **Viewport-only queries + marker clustering** — never render every national gauge.
- Offline: small tile cache; pins from the IndexedDB snapshot (§10); reuse the existing
  offline banner.

## 12. Security & privacy invariants (non-negotiable)

- **SSRF / abuse** — validate `lat`/`lon` (US bounds or whitelist) and rate-limit the
  proxy before it becomes an open fan-out proxy; add response caching.
- **Never expose** GPS, exact reach, tackle details, or auth identifiers in the public
  feed, telemetry payloads, logs, or debug UI.
- **No** service-role key / access token in client files or committed docs.
- **USGS API key** lives in server env only.
- (Catch-photo **EXIF stripping** is a camera concern → Update 4.0.)

## 13. Execution checklist (ACTIVE)

Each item lists its file paths, a one-line potential bug, and a concrete verification
step, per `.clinerules`. Mark `- [x]` only after the verification step passes.

### Phase 1 — De-hardcode & modularize

- [x] **1.1 Split `src/app.js` (2,460 lines) into feature modules.** ✅ COMPLETE
  - Result: **`src/app.js` 2,460 → 24 lines (bootstrap only)** + 22 classic-script modules:
    `src/shared/{debug,ui,nav,format,forms,refresh,pwa}.js`; `src/features/auth/auth.js`;
    `src/features/telemetry/{tide,hero,daynav,report}.js`;
    `src/features/gear-sim/{inputs,physics,sonar,zone,rig,sim,debounce}.js`;
    `src/features/catch-log/{board,mycatches,log}.js`;
    `src/features/station/{picker,search}.js`.
  - Files: `src/features/*`, `src/shared/*`, `index.html` (script tags), `sw.js`
    (`SHELL_FILES` + `VERSION` → `v2.01.00`), `sanity_pass.js` (reads load order from `index.html`).
  - Potential bug: script load order / global name collisions — every global name and the
    load order preserved; `app.js` still loads LAST and still wires `window.onload`.
  - Verify: `find src -name '*.js' -print0 | xargs -0 -n1 node --check`;
    `node sanity_pass.js` → **70/70 GREEN**. ✅
  - Follow-up (not blocking): `telemetry/report.js` (294) and `gear-sim/sim.js` (162) are
    single large functions — split internally later.
- [ ] **1.2 Region registry — `src/data/regions/washington.js` + schema.**
  - Files: `src/data/regions/washington.js`, `docs/CONTRACT_REGIONS.md` (§4.2).
  - Potential bug: a waterbody missing from the registry silently falls back to Puyallup.
  - Verify: every constant in §5.2 is present in the registry and matches its current value.
- [ ] **1.3 Make `api/water_report.py` region-aware.**
  - Files: `api/water_report.py` (constants at lines 12–24, 286, 677).
  - Potential bug: reading config per request without caching adds latency; cache it.
  - Verify: dev server `/api/water_report?site=12101500` unchanged; an off-basin site
    (e.g. `12113000`) returns no Puyallup-only fields.
- [ ] **1.4 Technique/style/species registries + `<TechniqueSpeciesPicker>`.**
  - Files: `src/features/gear-sim/registry.js`, `.../techniques/drift.js`,
    `.../physics/*`, `docs/CONTRACT_TECHNIQUE.md`; wire picker into BOTH tabs.
  - Potential bug: picker must not desync the duplicated Gear Sim / Catch Log fields.
  - Verify: same rig inputs → identical `compute()` output as today; both tabs update together.
- [ ] **1.5 Legal hours from `waterbody.legal_hours`.**
  - Files: `api/water_report.py` (report loop), `src/app.js` legal-hours UI.
  - Potential bug: `24hr` rivers must not render a sunrise/sunset bar.
  - Verify: a `24hr` waterbody shows "Open all day"; `unknown` shows "check regulations".

### Phase 2 — USGS migration + radial telemetry

- [ ] **2.1 Migrate to USGS WDFN OGC API.**
  - Files: `api/water_report.py` (`fetch_usgs_telemetry`, `fetch_nearby_stations`),
    `src/services/water.js` (`fetchCFSMomentum`, line 14).
  - Potential bug: response shape differs from NWIS; parser must handle absent values
    as `null` (never fabricate).
  - Verify: live CFS/gage match the legacy endpoint for `12101500` during overlap.
- [ ] **2.2 Two-step site discovery + server-side API key.**
  - Files: `api/water_report.py`; env var for the key (server only).
  - Potential bug: key must never reach client files or the digest.
  - Verify: `/api/nearby_stations?lat=&lon=` returns region-correct gauges sorted by distance.
- [ ] **2.3 NOAA CO-OPS dynamic tide-station pairing.**
  - Files: `api/water_report.py` (`fetch_noaa_tides_bulletproof`, `NOAA_STATION`).
  - Potential bug: non-tidal waterbodies must return no tide data, not the nearest coast gauge.
  - Verify: a coastal waterbody pairs its nearest gauge; an inland one shows no tides.
- [ ] **2.4 Proxy hardening.**
  - Files: `api/water_report.py` (headers, cache, validation).
  - Potential bug: unvalidated lat/lon = open proxy.
  - Verify: out-of-bounds coordinates rejected; repeated calls hit cache.
- [ ] **2.5 Interactive map (Level A regs).**
  - Files: `src/features/map/`, `index.html`, `src/styles.css`, `sw.js`.
  - Potential bug: rendering all gauges at once tanks mobile; query viewport only.
  - Verify: tap a gauge → report loads; regulation panel shows legal hours + night status;
    search/GPS fallback still works.

### Phase 3 — Offline outbox

- [ ] **3.1 IndexedDB outbox + per-waterbody telemetry snapshot.**
  - Files: new `src/features/catch-log/outbox.js`, `src/shared/idb.js`.
  - Potential bug: must migrate any existing `localStorage` `catch_db` rows on first run.
  - Verify: logging offline persists across reload; snapshot replays per waterbody.
- [ ] **3.2 Idempotency migration (`ON CONFLICT (id) DO NOTHING`).**
  - Files: `supabase/migrations/<ts>_catch_idempotency.sql`, `src/services/supabase.js`
    (`toCatchRow`, `insertCatch`).
  - Potential bug: changing the `id` default or unique constraint must not break RLS.
  - Verify: `npx supabase db push --yes < /dev/null`, then read-only live query confirms
    the constraint exists; a replayed insert does not duplicate.
- [ ] **3.3 In-app reconciliation.**
  - Files: `src/features/catch-log/outbox.js`, `src/app.js` (online/focus/resume hooks).
  - Potential bug: concurrent flushes can double-send — guard with a single in-flight lock.
  - Verify: reconnect flushes the queue once; no duplicates in the live DB.
- [ ] **3.4 Optimistic UI + pending-sync badge.**
  - Files: `src/features/catch-log/*`, `src/styles.css`.
  - Verify: an offline catch shows instantly with the badge; badge clears on confirm.

### Phase 4 — Token Efficiency Protocol (structural)

- [ ] **4.1 `SYMBOLS.md`** — file → public functions + one-line purpose.
- [ ] **4.2 File-header convention** — `// public: ... — purpose` on every feature file.
- [ ] **4.3 Contracts** — `docs/CONTRACT_REGIONS.md`, `docs/CONTRACT_TECHNIQUE.md`,
      `docs/CONTRACT_CATCH.md`.
- [ ] **4.4 Doc hygiene** — trim `TASK.md` to the ACTIVE phase (archive the rest);
      remove the stray `.kilo/worktrees/clumsy-college/` worktree.
- [ ] **4.5 Extract `api/water_report.py` pure helpers → `api/lib/*.py`** (thin handler).
  - Potential bug: the handler must still be a single importable `handler` class for Vercel.
  - Verify: `python3 -m py_compile`; dev-server API unchanged.
- [ ] **4.6 Propose `.clinerules` / `AGENTS.md` refinements** (§4.2) — **show before applying.**

### Phase 5 — Trust quick wins + CI

- [ ] **5.1 Favorites ("My Water")** — private saved waterbodies (push arrives in Update 4.0).
- [ ] **5.2 Safety signal** — rising-water / closure warning line (reuse momentum calc).
- [ ] **5.3 "What changed" trend** — percentile vs. recent norm (tiny sparkline).
- [ ] **5.4 Trust onboarding** — one-line first-run privacy/no-fabrication promise.
- [ ] **5.5 Per-region test fixtures + config schema validation in CI.**
  - Files: `sanity_pass.js` (fixtures), `.github/workflows/sanity.yml`.
  - Verify: CI validates the region registry and a mocked Washington fixture with no live calls.
- [ ] **5.6 Health endpoint + per-source status** — visible degradation, not silent failure.

## 14. Verification (whole release)

- `find src -name '*.js' -print0 | xargs -0 -n1 node --check` (+ `node --check sw.js`)
- `python3 -m py_compile api/water_report.py scripts/dev_server.py`
- `node sanity_pass.js` → green
- `python3 scripts/dev_server.py 8000` → browser pass on the affected tabs + map
- `sw.js` cache version bumped whenever shell files change
- Any DB change: migration applied + read-only live verification

## 15. Hooks left for Update 4.0 (do not build here)

Update 3.0 deliberately leaves these seams so Update 4.0 never forces a redo:

- Region registry → future states / waterbody types are data.
- Technique + species registries → new methods/species are new files.
- Favorites + account-ready RLS tier → **Crews** + push bolt on.
- IndexedDB outbox + per-waterbody snapshot → **Private Season** + offline brag board storage.
- Legal-hours + regulation panel → **regulation-zone polygons** (Level B).

See [UPDATE_4.0.md](UPDATE_4.0.md) for the future scope.

