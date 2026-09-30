# UPDATE 4.0 — Engagement & Native

STATUS: **ROADMAP** (not started). Gated behind Update 3.0 completion.
Companion file: [ARCHIVE_UPDATE_3.0.md](ARCHIVE_UPDATE_3.0.md) (scaling + trust core, built first).

## 1. Purpose

Update 3.0 scales the core and protects the trust identity. Update 4.0 adds the two
things deliberately deferred: **engagement** (the reason to open the app every day) and
**native packaging** (the eventual store goal). None of it blocks scaling, and all of it
consumes the "hooks" Update 3.0 leaves behind (§7 of Update 3.0).

## 2. The engagement philosophy (why this isn't "another fishing social app")

The identity stays **honest field companion**. Engagement is added **inside** that idiom,
never by diluting it:

> The retention loop is **trust + a private season**, not a leaderboard.

Gamification is honest only when it is **self-referential** — public leaderboards reward
posting, and posting-at-scale rewards *lying*. So:

| Ring | Audience | What's shared |
| --- | --- | --- |
| **Private Season** | You | Everything (stats, streaks, your best conditions) |
| **Crews** | Trusted friends | Catch *summary* only (species/size/photo) |
| **Brag board** | Public | Location-free only (species/size/photo) |
| **River Pulse** | Anonymous | Aggregated, time-decayed, river-name level |

**Design rule:** every shared datum is either (a) location-free, (b) aggregated +
time-decayed + coarse, or (c) private. If it would identify a spot or an individual,
it defaults to private.

### Do / Don't

- **Do:** private stats & streaks · personal milestones · optional photo brag (no
  location) · anonymized river pulse · "conditions look prime tomorrow" nudges.
- **Don't:** public leaderboards of strangers · real-time "who's catching where" ·
  location on any public feed · streak-loss pressure notifications · anything that
  rewards posting more than honesty.

## 3. Workstreams

### 3.1 Accounts + the RLS "summary vs. details" tier

Crews require identity (you can't friend an anonymous UUID). Anonymous stays the
**zero-friction default**; accounts are an **optional upgrade** for those who want
cross-device sync and crews.

- Add `profiles` (display name, persistence).
- Add the **RLS tier**: *"a friend may read my catch **summary** (species, size, date,
  photo), never my **details** (GPS, reach, tackle)."*
- **Invariant preserved:** GPS/tackle/auth identifiers are never public, in any tier.
- Files: `supabase/migrations/<ts>_profiles_and_friend_tier.sql`,
  `src/services/supabase.js`, `src/features/auth/`.

#### Mechanism: OAuth, not passwords (decided 2026-09-28)

Accounts are **Google + Sign in with Apple**. No email/password to store, no password
reset to build, no credential database to leak.

- **Upgrade in place — do NOT replace the session.** A signed-in anonymous angler is
  linked with `auth.linkIdentity({ provider })`, so the **same `user_id` persists** and
  their already-synced private catches stay theirs under RLS. A first-time visitor (no
  session yet) falls back to `auth.signInWithOAuth({ provider })`. Replacing the session
  instead would silently orphan every row the anon user had written.
- **Google setup (free):** Google Cloud project → OAuth consent screen → *Web* OAuth
  client. Authorized JavaScript origin = the app origin; Authorized redirect URI =
  `https://pztcfsqifbfkjvosygcy.supabase.co/auth/v1/callback`. Paste Client ID + secret
  into Supabase → Authentication → Providers → Google.
- **Apple setup:** requires Apple Developer Program membership (**$99/yr**) — create a
  **Services ID** with "Sign in with Apple", a `.p8` signing key, and the same Supabase
  callback. Paste Service ID + Team ID + Key ID + key into Supabase.
- **Always** add the app's public URL to Supabase → Authentication → URL Configuration →
  Redirect URLs, or the round-trip cannot complete.
- **App Store Guideline 4.8:** on iOS, offering Google sign-in **requires** also offering
  Sign in with Apple — ship them together for the native build, not one then the other.
- **Frontend (~4 small files):** `Supa.linkOAuth(provider)` in `src/services/supabase.js`
  (+ export); extend the `getSession()` display-name fallback to OAuth metadata
  (`display_name || full_name || name || email local-part || recallName()` — OAuth users
  have no `display_name`); two buttons in the signed-out block of `index.html` +
  `src/features/auth/auth.js`. `initAuth()` already restores the session on load, so the
  OAuth return needs no extra handler.
- **Native (later):** needs deep links (universal links / app links) plus
  `@capacitor/browser`.
- **Privacy unchanged:** linking *upgrades* the anonymous identity in place; it adds no
  tracking and leaves RLS, the 4-column public feed and the no-GPS/tackle invariant as-is.

### 3.2 Private Season (the retention star)

Personal dashboard: trips count, streaks, milestones ("first Chinook of the season",
personal best), a season recap, and **"your best conditions"** — the personal-sonar
feature built from *your own* logged flow/tide/weather/gear data.

- Fully private; no competition, no fabrication incentive.
- Consumes the IndexedDB outbox + per-waterbody snapshot from Update 3.0.
- **RESOLVED 2026-09-30 — the inert sonar is ON, and the mouth-hook filter is GONE.** The filter
  was DROPPED, not re-derived: hooking location is not recorded on a catch and there is no field
  to derive it from, so the product decision was to remove it rather than keep a gate with no
  data behind it. `communitySonar()` now uses every same-stage / same-species row with a solvable
  rig, matches on the SAME env signature the sim uses (temperature / light / cloud / turbidity /
  tide / barometric trend / rain — no wind, no moon), drops the ≥2-sample floor, and applies a
  capped, SILENT pull (no count / confidence / "not enough data" text). The residual (notebook)
  is logged to the debug trail. Migration `20260930120000_sonar_env_snapshot`.
  - **(historical) DECIDED 2026-09-29 — left off for now (`d3`).** Evidence at the time:
    `public.catches` held 1 row / 1 owner and `communitySonar()` needed ≥2 heights, so dropping
    the filter would have been invisible; and the gate meant something real ("mouth-hooked fish
    only"). Superseded 2026-09-30 by the user's call to drop the filter outright (no
    hooking-location field) and remove the floor.
- **Level 2 overfitting guardrail (Burke et al. 2013, PLoS ONE 8:e54134).** Before Level 2
  re-fits the env weights / thermal + light curves from catch data, require a minimum sample
  size AND a train/validation split. That study combined 31 ocean indicators over 11 years and
  still hit R^2 > 0.9 when the indicators were randomized - many variables + little data =
  spurious fits. Our catch table holds ~1 row, so re-fitting now would fabricate precision.
- Files: `src/features/season/`.

### 3.3 Crews + friends leaderboard

- Small, invite-only groups (~8–20) via shareable invite link.
- Ranked on season catch count / total weight / personal best — **species, size, count.
  Never location.**
- Spot-guarding *even among friends*: river-name sharing is a per-catch toggle, off by default.
- Self-policing honesty: friends catch fake catches.
- Files: `supabase/migrations/<ts>_crews.sql`, `src/features/crews/`.

### 3.4 Location-free brag board + catch photos

- Keep/enhance the existing 4-column public board; add photo.
- **EXIF strip + downsample on-device (max 1200px / WebP)** before upload — photos embed
  GPS and would otherwise leak the exact spot.
- Upload to Supabase Storage; a per-catch privacy tier ("public board" vs "private").
- Files: `src/features/catch-log/photo.js`, `src/services/supabase.js` (storage).

### 3.5 River Pulse (anonymized conditions intel)

- Opt-in, aggregated, **time-decayed** activity/conditions reports
  ("steady action on the Puyallup this morning", "blown out at the Carbon").
- Coarse to **river-name level only** — no reach, no name, no timestamps that triangulate
  a spot. This is the privacy-safe generalisation of the dropped "Seal Spotter" idea.
- Revives the (currently dead) `get_global_calibration` mechanism in a privacy-safe form.
- Files: `supabase/migrations/<ts>_river_pulse.sql`, `src/features/pulse/`.

### 3.6 Technique + species expansion

Update 3.0 ships the *registries* with `drift` only. Update 4.0 adds content:

- **Techniques:** bobber/float, stillwater, trolling — each a new
  `src/features/gear-sim/techniques/<id>.js` implementing the shared interface.
- **Species:** beyond Chinook/Coho/Steelhead (bass, walleye, trout, …), each a registry
  entry with strike-zone priors.
- **Rig presets ("Tackle Box")** — save/label/switch full-rig profiles
  ("Heavy Flow Chinook", "Low Water Coho"), auto-populating the Gear Sim in one tap.
  *(Flossing is a `style` under drift, saved as a preset — not a technique.)*

### 3.7 Regulation zones on the map (Level B)

Level A (text panel per waterbody) ships in Update 3.0. Level B draws actual regulation
**zones** as shaded polygons. This is a **data pipeline**, not a feature toggle: WDFW
describes zones in prose ("mainstem downstream of Marine Drive"), so it needs geocoding
of rule text → GeoJSON per zone, then a map layer + tap-for-rule.

### 3.8 Native packaging (Capacitor) — the eventual store goal

The web output is wrapped, not replaced. The PWA path stays.

- `npx cap init`, bind `dist`, `npx cap add ios && npx cap add android`.
- Build scripts: `npm run build && npx cap sync` (Vite/adjacent build introduced *here*,
  only if needed to produce `dist`).
- **Camera** (`@capacitor/camera`) — native capture/gallery → EXIF strip + WebP
  downsample (§3.4) → Supabase Storage.
- **Push notifications** — alerts when a favorited waterbody enters a prime CFS/percentile
  bracket, or a sudden upstream release is detected. *(Favorites ship in Update 3.0.)*
- **Store shipping** — iOS signing/icons/splash/permissions → TestFlight; Android
  keystore/splash → `.aab` for Play Console.

### 3.9 Model accuracy — the measurement-free path

The Gear Sim is a deterministic heuristic, and its accuracy ceiling is set by **data +
physics, not hardware**: velocity came from one empirical fit (`0.25 · Q^0.4`) applied to
every river, which overstated the Puyallup's mean velocity ~2.3× and under-predicted how
fast it rises with flow.

**Layer 1 — gauge velocity from the USGS's own measurements. ✅ SHIPPED (2026-09-28).**
USGS crews wade/boat each gauge several times a year and measure discharge, width,
cross-section area **and** mean velocity by hand. `scripts/fetch_channel_measurements.py`
pulls those from the Water Data OGC API `channel-measurements` collection (with a `Q = v·A`
continuity gate that discards bad rows), least-squares-fits `v = a · Q^b` per gauge, and
writes `src/data/channel_measurements.js`. `hydraulicVelocity(flow, siteId)` now uses the
measured **shape**, anchored to the locked reference so `DRAG_REF` / the strike zone keep
their calibration. Result: every gauge carries its own response, up to **+22% bed velocity
at 10,000 CFS** versus the old one-size fit — i.e. it now matters most at blown-out flows.

**Layer 2 — "near you" via continuity (IN PROGRESS).** The gap is local *width*: the USGS
measurements give the width at the gauge, but the angler's own spot needs its own. That proved
harder than expected — **NAIP/NDWI fails on every river in this basin** (glacial silt
backscatters NIR, and NAIP has no SWIR band, so the turbid-water index MNDWI cannot be
computed): it returned **4 ft where the truth is 215 ft**. Width is therefore a **dual-method
pipeline with a router** (`scripts/extract_river_widths.py`) — NAIP-NDWI plus a colour-blind
3DEP-elevation method (`scripts/width_elevation.py`) — where a method is trusted **only if it
reproduces the USGS field width at that gauge**. The generated `src/data/river_widths.js`
currently validates the DEM at Puyallup only (202 vs 215 ft) and falls back to the measured
USGS width elsewhere. What remains is the app-side estimator:
`v_spot ≈ v_gauge × (width_gauge / width_spot)`, using the routed gauge width and the spot's
DEM ratio over the same reach.

**Layer 3 — validate + re-anchor the rest.** The measured fits already reproduce real
measurements inside ~6%. Still tuned against the *old* inflated velocity and therefore
worth revisiting as one deliberate contract bump (it re-pins the frozen baselines):
the `blownOut` threshold (`bottom > 3.5`), and the drag law being linear in velocity where
physics wants `v²`.

**The honest boundary that survives all of this.** Even a perfect `v = Q/A` gives the
cross-section *average* velocity at that gauge — never the velocity in one specific seam.
Without a local measurement that last ~±30% is unknowable, and the UI must keep saying so.

**Candidate — conveyance and Froude number (recorded 2026-09-30, NOT built).** Luis & Pasternack
2023 (*Fisheries Research* 262:106634; `docs/LITERATURE.md` §6) found migrating Chinook at a
confluence select **lower velocity** and **deeper, higher-conveyance** water, with detection rate
best predicted by **conveyance + temperature + turbidity**. Both metrics are computable today —
conveyance `≈ Q/W` (`getCurrentFlow()` ÷ `gaugeWidthFt()`), Froude `= V/√(g·D)`
(`hydraulicVelocity` ÷ √(`depthAtGauge`·g)) — but the paper publishes **no thresholds**, so adding a
term would mean inventing a cutoff. Gate: a numeric preference from the hydraulic-habitat literature
or the notebook residual. Build only then.

### 3.10 Copy mode: Beginner / Advanced (future, NOT built)

Recorded 2026-09-29 as a deliberate future feature, at the user's request.

The Gear Sim's on-screen copy is now **beginner-first**: the summary paragraph, the "rig is
running low/high" row and the "Try this" advice are written for someone who has never fished
(no inches of line height, no CFS, no gauge, no brand names, no "riffle lips"). The precise
version - depth band, flow, ±%, brand + size + projected height - still exists and is written
to the DEBUG TRAIL by `paintSimHud()` (`out.rigChanges`, `whereToFish()`).

A **toggle** would let an experienced angler read the precise strings in the HUD itself - e.g.
a "Details: Beginner / Advanced" switch in the Gear Sim, persisted like the rig (`localStorage`),
defaulting to Beginner. It is NOT built because nothing has asked for it yet, and the data for it
already exists: `rigChangeList()` (precise) and `rigChangePlain()` (plain) are produced side by
side on every solve, so the switch is a render-time choice, not a second model.

Cost when it is wanted: one persisted setting + a branch in `paintSimHud()`/`fishOutlook()`, plus
the sanity assertions for both renderings. No physics, no contract change.

### 3.11 Flow-regime boundaries (recorded 2026-09-30, NOT built)

Two independent in-river adult-Chinook studies plateau at **~20 cms (~706 cfs)**: Peterson et al. 2017
(NAJFM 37:78; Stanislaus) found migration activity stops rising above ~20 m³/s, and Damborg et al. 2020
(Can. MS Rep. 3026; Vancouver Island) bracket the migration window as low flow < 20 cms, high flow
> 80 cms. Naylor et al. 2025 (NW Science 98:2) adds the move/sprint/stall tactics and that warm-reach
stalling is the mortality path. Gate: a Puget-Sound-relevant number or the notebook residual — the
units (cms) and rivers differ, and it is migration *activity*, not holding depth. See `LITERATURE.md` §7.

### 3.12 "Stall vs. Run" thermal run-timing signal (recorded 2026-09-30, NOT built)

**Thermal numbers partly VERIFIED (2026-09-30).** Green/Duwamish: the **WA Ecology criterion for the
Lower Green is 63.5 °F (17.5 °C)**; observed **Lower Green summer temps are 70–72 °F (21.1–22.2 °C)**,
sometimes **> 74 °F (lethal)**, and July 2015 exceeded the lethal threshold at almost every mainstem
site in the **lower 45 miles**. So the "20–21 °C block / < 18 °C" framing is real — but the **"< 18 °C"
is the regulatory criterion, not a measured behavioural trigger**. Adults **do** stage in Puget Sound
estuaries, and the mechanism now has peer-reviewed anchors: **Strange 2013** (adult Chinook residence
in a *stratified estuary* — the salt-wedge hold) and **Strange 2010** (upper thermal limits to adult
migration, Klamath). **Still unverified:** the **RM 7.9** figure and the **15–25 % freshet** trigger
(not in any readable source), and the **Nisqually "adults cross on flood tide"** claim — the USGS
Nisqually work is **juvenile**-focused. Gate: a source for the freshet trigger + the RM 7.9 figure
before hard-coding; the run-timing advisory stays a reach-level (estuary) idea, not a strike-zone term.
See `LITERATURE.md` §8.

## 4. Suggested phasing within 4.0

1. **Accounts + RLS tier** (unblocks everything social).
2. **Private Season** (retention; no social dependency — ship it early).
3. **Crews + brag board photos.**
4. **River Pulse.**
5. **Techniques/species expansion + rig presets.**
6. **Regulation polygons.**
7. **Native packaging + store shipping.**

## 5. Hooks consumed from Update 3.0

| Update 3.0 hook | Consumed by |
| --- | --- |
| Region registry | Future states / waterbody types |
| Technique + species registries | §3.6 techniques/species |
| Favorites + account-ready RLS tier | §3.1 accounts, §3.3 crews, §3.8 push |
| IndexedDB outbox + per-waterbody snapshot | §3.2 Private Season, offline brag board |
| Legal-hours + regulation panel | §3.7 regulation polygons |

## 6. Guardrails that still apply

- Anonymous-first; accounts optional.
- Never expose GPS / reach / tackle / auth identifiers publicly, in any tier.
- No public leaderboards of strangers; no location on any public feed.
- No fabrication: absent data renders `--` / empty state, in telemetry, regs, and stats.
- RLS, `SECURITY DEFINER` calibration/RPC contracts, and the public-feed privacy
  boundary are preserved through every migration.

