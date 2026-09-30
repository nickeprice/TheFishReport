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
- **Re-enable the inert sonar filter (carried over from 3.0).** `communitySonar()` skips
  any row whose `loc !== 'Fair'`, but nothing has ever populated that field
  (`hook_location` was always NULL and was dropped 2026-09-28), so **every calibration row
  is discarded** and the strike zone always uses its baseline. Decide whether to derive
  "mouth-hooked" some other way or drop the filter — it CHANGES the Gear Sim's zone, which
  is why it is a product decision rather than a cleanup.
  - **DECIDED 2026-09-29 — leave it off for now (`d3`).** Live evidence at decision time:
    `public.catches` held **1 row, 1 owner** (2026-09-17) and `communitySonar()` needs **≥2**
    heights in the window before it shifts anything, so turning the filter off would be
    invisible and then governed by a rule with no dataset. The gate also means something real
    ("mouth-hooked fish only" — a tail-hooked rig height says nothing about feeding depth), so
    dropping it would silently start counting foul-hooked fish. Revisit when there is catch
    volume AND a populated hooking-location field (`d2`: a real form field + column + RPC
    return; the old always-NULL `hook_location` is why this is a reversal, not a cleanup).
    The RPC already returns everything the replay needs (heights are RECOMPUTED by
    `presentationHeightInches`, so no `line_height_in` column is required).
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

