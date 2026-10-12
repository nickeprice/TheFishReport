<a id="data-lane-profile"></a>
## Phase Φ: Per-transect depth profile + bearing data

**Goal:** Extend the measurement pipeline so every one of the 90,873
cross-sections retains its lateral bank-to-bank depth **shape** and transect
**orientation** — not just the summarized `wetted_ft / bankfull_ft / thalweg_m`.
This is the data layer the lane-aware sim (Phase Ω) reads from. The shape data
already exists inside `width_elevation.py`; today we throw it away.

**Data source:** 3DEP DEM (AWS Terrain Tiles / terrarium z15) — tiles already
cached in `data/terrarium_cache/`. `width_elevation.py` walks both banks from
the thalweg and returns a height→width curve per transect; its PCA already gives
the transect orientation.

**Per-transect retained shape (one entry per ~100 m point):**

| Field | Type | Meaning |
|---|---|---|
| `lat`, `lon`, `cum_m`, `wetted_ft`, `bankfull_ft`, `thalweg_m`, `truncated` | as today | unchanged |
| `bearing_deg` | float | transect line bearing (┴ river centerline), true north |
| `l_bank_lat`, `l_bank_lon` | float | left-bank endpoint of the transect |
| `r_bank_lat`, `r_bank_lon` | float | right-bank endpoint |
| `depth_bins[5]` | `[{frac_width, mean_ft, min_ft, max_ft}]` | depth distribution in 5 equal-width strips, left→right |

**Bin derivation:** slice the retained height→width curve into 5 equal
fractions of bankfull width; per strip record mean/min/max depth above the DEM
floor of that strip.

**Output (server-side only — never added to the 13 MB client bundle):**
- `data/hydro_profiles.json` — same 15-river structure as `spot_widths.js`, one
  profile per point (~20 floats × 90,873 ≈ 15 MB)
- `api/spot-geometry.py` — module-level `PROFILES` load + response extension:
  `depth_profile: { bearing_deg, l_bank, r_bank, bins }`

**Pipeline change:** `measure_hydro_widths.py` / `precompute_spot_widths.py`
keep only wetted@2 m + bankfull@max → add a companion writer that serializes the
retained curve + orientation + bank endpoints into `hydro_profiles.json`.

**Verification:** pick TEST-2's transect (puyallup, cum ≈ 36,600 m) and print
its 5 bins; confirm the deepest strip's `max_ft` reproduces the raw DEM profile.

**Files:** `scripts/tools/width_elevation.py`, `scripts/tools/measure_hydro_widths.py`,
`api/spot-geometry.py`, `data/hydro_profiles.json` (new)

---
<a id="drift-lane-model"></a>
## Phase Ω: Compass/GPS → lane fraction → lane depth in the sim

**Goal:** From the phone, decide which **lane** of the cross-section the angler
is fishing, convert that lane's depth to `H` for the physics (replacing the
cross-section mean), and describe the river directionally. No compass → honest
bank-based assumption.

**Orientation chain:**
```
1. getCompassHeading()             → phone magnetic facing
2. profile.bearing_deg             → transect orientation from Phase Φ
3. GPS projection onto line        → perp distance from angler lat/lon to
                                     l_bank→r_bank line
4. laneFrac = proj / total_width   → 0.0 left bank … 1.0 right bank
5. map laneFrac → depth_bins[floor(laneFrac*5)] → lane depth
```

**Bank fallback (when compass permission is denied or unavailable):**

| laneFrac from GPS | Assumption | Used lane |
|---|---|---|
| < 0.15 (on left bank) | casting away from bank → centre-right | bin 0.4 |
| > 0.85 (on right bank) | casting away from bank → centre-left | bin 0.6 |
| 0.15–0.85 (mid-channel / boat) | assume centre | bin 0.5 |

The where-to-fish label notes the assumption: *“no compass — assuming you fish
from this bank across the channel. Tap compass to refine.”* When compass is
available the heading overrides the assumption.

**Physics change (drift-model.js / drift.js):**

`driftDepth` and `driftEnvironment` gain an optional `laneDepthFt`; when the
value is present and positive it replaces the cross-section mean depth as the
channel `H`:

```
u*    = vSurf · κ / ln(H / z₀)
u(z)  = (u*/κ) · ln(z / z₀)            → velocity at every drift height
w     = totalDragPerFt(u(z), rig)       → distributed drag
hgt   = (F/w) · asinh(w · L / F)        → catenary rise (inches off bottom)
```

| Lane depth | Effect on H | u* | Drag → hgt |
|---|---|---|---|
| Shallow shelf (≈1.5 ft) | smaller H | higher u* | higher drag → **hgt drops ~0.5–1\"** |
| Deep slot (≈8 ft) | larger H | lower u* | lower drag → hgt rises slightly |
| Cross-section mean (today) | reference | reference | reference |


<a id="sim-lane-validate"></a>
## Phase Ψ: Validation

**Goal:** Prove the lane depth changes the physics the expected way, and every
fallback stays honest — the same rigor as the depth-blend verification.

1. **Manual math check** — test transect (puyallup, cum ≈ 36,600 m):
   compute `H` for the shallow-shelf bin (mean ≈ 1.5–2 ft) vs the deep-slot
   bin (≈ 3–4 ft); assert `hgt_shallow < hgt_deep` and both match hand-calculated
   catenaries.
2. **Compass on** — mocked heading → laneFrac → bin depth → H → readout matches.
3. **Compass denied** — bank-fallback fires; label announces the assumption.
4. **Offline / API down** — `State.spotProfile` = null → sim produces today's
   cross-section-mean numbers; no crash, no fabricated lane.
5. **Text labels** — “north/south bank”, “middle third”, “seam …” all derived from
   real bin data and source-labeled; no assertion without data.
6. **Persistence** — `sanity_pass.cjs` +2 frozen baselines (lane-hgt direction,
   offline mean revert); `npm run build`; `python -m pytest tests/ -q --tb=line`.

**Files:** `sanity_pass.cjs`, `tests/`, `spot_widths.js` (data unchanged, validator)

**Coverage gate:** if `laneDepthFt × 12 < hgt` → flag: *“your line rides near
the surface in this lane.”*

**State caching:** `State.spotProfile` caches the per-spot profile fetched from
the API. Offline / API fail → null → sim reverts to the cross-section mean
(today's behavior). No crash, no fabricated numbers.

**Where-to-fish text upgrade:** the directional readout is built from the
bearing + bin depths, with the bank description derived from angler position:
> “you're on the N bank, casting into the middle third (~3.1 ft). The deeper
~20% is along the S bank at 8–10 ft — seam lies between the shallow shelf and
the slot.”

**Files:** `src/features/gear-sim/continuity.js` (+fetchProfile/lane helpers),
`src/features/gear-sim/drift-model.js`, `src/features/gear-sim/techniques/drift.js`,
`src/features/gear-sim/zone-core.js`, `src/shared/state.js`

---


