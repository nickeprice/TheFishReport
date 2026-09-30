# LITERATURE — the studies behind the Gear Sim's environment model

The Gear Sim's strike zone is a **declared** model: explicit terms, explicit thresholds. This file
records the peer-reviewed studies those terms are anchored to, so every number has provenance and
can be re-checked. It is a **reference**, not a fitted model — we have no catch volume to fit one
(see the Burke 2013 caution at the bottom).

**How a finding gets IN:** only if it (a) is about **adult salmonids in rivers**, (b) bears on
**where/when they hold or migrate**, and (c) can be stated as a threshold or direction we can
defend. A finding becomes a **candidate** when it is an inference we cannot yet test; the notebook
(`catchResidual()` in `sonar.js`) is what promotes a candidate to a term.

## 1. Temperature — the `thermalOptimum()` bands (`inputs.js`)

| Study | Finding | Status |
| --- | --- | --- |
| Keefer et al. 2018, "Thermal exposure of adult Chinook salmon and steelhead…", PLoS ONE 13:e0204274 | **20 °C** is the acute-stress threshold; 68% of steelhead reached ≥20 °C; behaviour grows "considerably more complex" as temperature rises | **Implemented** (stress > 68 °F) |
| Goniea et al. 2006, "Behavioral Thermoregulation and Slowed Migration by Adult Fall Chinook Salmon…", TAFS | Adults slow and seek thermal refuge at high Columbia temperatures (~21 °C+) | Implemented (warm → deep) |
| Salinger & Anderson 2006, "Effects of Water Temperature and Flow on Adult Salmon Migration Swim Speed and Delay", TAFS | Temperature **and** flow jointly set migration swim speed + delay | Implemented (delay band 64–68 °F) |
| Keefer et al. 2009 (spring–summer Chinook, Columbia/Snake) | Migration delayed at ~20 °C | Corroborates the 20 °C onset |
| Goetz et al., "Behavioral thermoregulation by adult Chinook salmon in estuary and freshwater habitats prior to spawning", NOAA Fish. Bull. | **Puget Sound** Chinook use thermal refuge in freshwater pre-spawn | Corroborates (geographically on-point) |

Implemented bands (°F): `<45` torpid · `45–50` cool · `50–64` optimal · `64–68` delay · `>68` stress.
(Revised 2026-09-30 from `50–60`/`60–65 warming`/`>65` to the measured 20 °C stress onset.)

## 2. Flow / velocity

| Study | Finding | Status |
| --- | --- | --- |
| Hinch et al. 1998, "Swim speeds and energy use of upriver-migrating sockeye salmon: role of local environment and fish characteristics", CJFAS 55 | Swim speed responds to **local flow + temperature** | Corroborates that flow drives behaviour (the rig physics stays locked) |

## 3. Tide — the `tideTerm()` (`zone.js`)

| Study | Finding | Status |
| --- | --- | --- |
| Levy & Cadenhead, "Selective tidal stream transport of adult sockeye salmon in the Fraser River Estuary" | Salmon ride the **flood** tide upstream and **hold on the ebb** | **Implemented** (+1.0″ flood / −1.0″ ebb) |
| Smith et al., "Tidal and diel timing of river entry by adult Atlantic salmon" | River entry peaks on the **flood**, at dawn/dusk | Implemented (flood) + light corroboration |
| Drenner et al. 2015, estuarine movements of homing sockeye, Fisheries Oceanography | Estuary movement driven by tide + physiological state | Corroborates |

## 4. Light / diel — the `lightTerm()` (`zone.js`)

| Study | Finding | Status |
| --- | --- | --- |
| Keefer et al. 2013, "Context-dependent diel behavior of upstream-migrating anadromous fishes" | Adults migrate **more at night**, and shift **more nocturnal when warm** | Direction implemented (dark → up) |

**CANDIDATE — the warm × light interaction (deliberately NOT implemented).** The inference: if
adults shift nocturnal when warm, then on a **warm, bright day** they should sit deeper/tighter than
the *independent* thermal + light terms predict. We did NOT add it because (a) it is an
extrapolation from migration *timing* to holding *depth*, (b) it double-counts the two terms we
already have, and (c) we cannot yet validate it — adding it now would be a guess, not an
improvement. **Test:** once the notebook residual accumulates, check whether warm+bright catches sit
consistently deeper than predicted; only then add a term.

## 5. Swimming performance (informational — the rig physics is LOCKED)

| Study | Finding | Status |
| --- | --- | --- |
| Brett 1973 (critical swimming speed vs size/temperature, foundational); Clark et al. 2008 (temperature → pink/sockeye performance); "A review of adult salmon maximum swim performance" (2023, CJFAS); "Estimating Adult Pacific Salmon Energy Use…" (2022) | Swim-speed limits and energy cost vs temperature | **Not implemented** — the drag coefficient is locked at 1.0 and the physics is deterministic by contract. These inform the *interpretation* of velocity, not the solver. |

## 6. Hydraulics / confluence habitat — CANDIDATE (conveyance, Froude)

| Study | Finding | Status |
| --- | --- | --- |
| Luis & Pasternack 2023, "Local hydraulics influence habitat selection and swimming behavior in adult California Central Valley Chinook salmon at a large river confluence", *Fisheries Research* 262:106634 (doi:10.1016/j.fishres.2023.106634) | At the Feather–Yuba confluence (12 DIDSON sites, two 4-day flow periods, Feather:Yuba ratios 8.66 / 4.02): **detection rate** best predicted by **conveyance (m²/s) + temperature + turbidity** (p < 0.001); fish were attracted to **lower velocity** despite higher discharge at reach scale; **deeper + higher conveyance** drew fish but **depth alone was not** a predictor; **milling** ↔ all hydraulics + higher turbidity; **backtracking** ↔ **higher temperature** (p < 0.01); **no model predicted upstream swimming**. | **Corroborates** our velocity-refuge premise, thermal term and turbidity term. Conveyance/Froude = **candidate**. |

**Why it corroborates:** the study independently finds adults select **low-velocity**, **deeper**
water and respond to **temperature** (retreat when warm) and **turbidity** — the same directions our
strike zone already encodes. It also carries an honesty lesson: **nothing predicted upstream
swimming**, so "where they hold" is more tractable than "where they go".

**The candidate — conveyance and Froude number.** Both are computable TODAY from data we already
hold, with no new inputs:

- **Conveyance** `≈ Q / W` (ft²/s): flow (`getCurrentFlow()`) ÷ routed gauge width (`gaugeWidthFt(siteId)`).
- **Froude** `= V / √(g·D)` (dimensionless, `g = 32.174 ft/s²`): bed velocity (`hydraulicVelocity`)
  ÷ √(depth × g), depth from `depthAtGauge(flow, siteId)` — `continuity.js` / `inputs.js`.

**Why it is NOT a term yet — no threshold.** The study reports that conveyance *correlates* with
detection rate but publishes **no numeric thresholds** (no preferred m²/s or Froude value), so wiring
it into the strike zone would mean inventing a cutoff — exactly what the "never fabricate" rule
forbids. Two further caveats: it is a **confluence** study (junction hydraulics, not a general
reach) in a **regulated Central Valley** system, and its responses (detection, milling, backtracking)
are *migration behaviour*, not vertical holding depth.

**Gate to promote it:** a numeric Froude/conveyance preference from the hydraulic-habitat literature
(Pasternack's group has Froude work, though much of it is *spawning* habitat, not holding) **or** the
notebook residual showing our zone is systematically off at high/low conveyance. Until then:
documented, not wired.

## Honesty caveats (do not drop these)

- **System mismatch.** Most thermal/dam studies are **Columbia/Snake** — a *dammed, impounded* system with ladders and reservoirs. Our rivers (Puyallup/White/Carbon/Green/Nisqually) are **free-flowing Puget Sound** streams. The **Goetz** (Puget Sound Chinook) and **sockeye-estuary** papers are the most directly on-point; Columbia thermal *thresholds* transfer, dam *dynamics* do not.
- **Migration ≠ holding.** These are migration studies; the strike zone models *holding/staging*. Thresholds transfer as *guidance*; they are not direct equations for holding depth.
- **Reference, not fitted.** Every number here is literature-derived (declared). Nothing is fitted to our own data.

## Out of scope — recorded, deliberately NOT used

**Burke et al. 2013, "Multivariate Models of Adult Pacific Salmon Returns", PLoS ONE 8:e54134.**
Combines **31 marine indicators** to forecast adult **return abundance** a year ahead (PCA/PCR/MCA).
Different question — *how many* return from the ocean, not *where* they hold in the river — so none
of its machinery was imported. Two lessons were kept (see `ROADMAP.md` §3.2): SST (temperature) was
the top-weighted driver — corroborating that temperature leads — and multivariate models **overfit**
(randomized indicators still gave R² > 0.9), which is why Level 2 must wait for real catch volume
plus a train/validation split.
