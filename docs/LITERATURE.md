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

## 7. Flow / migration activity — CORROBORATING (and a flow-regime candidate)

These are in-river adult-salmon studies of migration **activity/counts/tactics** (not holding depth),
so they corroborate that **temperature and flow are the dominant drivers** — which the model already
encodes — rather than supplying a strike-zone threshold.

| Study | Finding | Status |
| --- | --- | --- |
| Peterson, Fuller & Demko 2017, "Environmental Factors Associated with the Upstream Migration of Fall-Run Chinook Salmon in a Regulated River", NAJFM 37(1):78 | 12-yr, 38,206 fall-run Chinook (Stanislaus/San Joaquin, CA). **Migration activity plateaus — no more daily passages once flow exceeds ~20 m³/s**; temperature, moon, weather and a rock barrier also modelled; managed pulse flows had little effect. | Corroborating (flow drives behaviour) |
| Naylor et al. 2025, "Prespawn Migration Patterns of Adult Spring Chinook Salmon in the Terminal Reaches of a Highly Altered Interior Stream", Northwest Science 98(2) (doi:10.3955/046.098.0205) | Spring Chinook (Grande Ronde, OR), radio tags + a move/hold Hidden-Markov model. **Higher temperature → more movement**; three tactics — rapid move to cold, **sprint**, **stall**; **stalling in the warmest reaches = highest prespawn mortality**; holding above thermal tolerance → mortality. | Corroborating (temperature dominant); move/hold nuance is for the mental model, no depth number |
| Keefer et al. 2018, PLoS ONE 13:e0204274 | (duplicate of §1) | already in §1 |
| Damborg, Stiff, Hyatt, Stockwell, Brown & Till 2020, "Water temperature, river discharge, and adult Chinook salmon migration observations in the Stamp/Somass watershed, 1986–2012", Can. MS Rep. Fish. Aquat. Sci. 3026 | Vancouver Island Chinook, 27-yr series. **"Low flow" < 20 cms and "high flow" > 80 cms** bracket the migration window; low-flow frequency rising since the 1980s. | Corroborating (flow-regime boundaries) |

**Candidate — flow-regime boundaries (NOT built).** Two independent studies land on **~20 cms (~706 cfs)**
as a "more water stops helping migration" plateau, with a high-flow bound at **80 cms**. Real concept,
but **different rivers and units (cms vs our cfs)**, and it is *migration activity*, not *holding
depth* — so no threshold transfers. Gate: a Puget-Sound-relevant number or the notebook residual.

## 8. Puget Sound regional drivers — the app's own rivers (GREY-LIT; partly verified — see pass below)

Region-specific, directly on the rivers the app serves (USGS 12101500 Puyallup, 12113000 Auburn,
12089500 McKenna). Sources are **WRIA 9 / King County DNRP / USGS** technical reports, not the
peer-reviewed journals above — so every threshold here is **reported, verify against the source**
before hard-coding.

| Basin (gauge) | Reported limiting factor / trigger | Maps to |
| --- | --- | --- |
| Puyallup / White (12101500) | Glacial silt / turbidity: high glacial flour impairs visual feeding, fish travel **lower** in the column along gravel seams | `turbidityTerm()` (turbid → deep) |
| Duwamish / Green (12113000 Auburn) | **Thermal block > 20–21 °C** (RM 7.9 → Auburn): adults stage in Elliott Bay / the lower salt wedge and refuse to push upstream until fall freshets drop temps **below 18 °C** | `thermalOptimum()` (stress > 68 °F — matches Keefer's 20 °C, region-confirmed) |
| Nisqually (12089500 McKenna) | **Delta tidal flux**: fish cross the extensive shallow flats mainly on **high-slack / flood tides** (avoid stranding + seal predation). **⚠️ Adult version UNVERIFIED — see below** | `tideTerm()` (flood → up/active) |

**Verification pass (2026-09-30) — what the sources actually say.**

*Confirmed from readable sources.*
- The **WA Ecology temperature criterion for the Lower Green is 63.5 °F = 17.5 °C** ("healthy
  maximum"). *("A River with a Fever Threatens Native Salmon", American Rivers, 2016-11-09.)*
- **Observed Lower Green summer temps are 70–72 °F (21.1–22.2 °C)**, sometimes **> 74 °F (23.3 °C,
  lethal)**; **July 2015 exceeded the lethal threshold at almost every mainstem site in the lower 45
  miles** — citing **King County's *Green-Duwamish River 2015 Temperature Data Compilation and
  Analysis (Draft)***, which is the document the user named. So the "**20–21 °C block**" matches
  observed summer water, and the "**< 18 °C**" is really the *regulatory criterion* (17.5 °C), **not a
  measured behavioural resume-migration trigger**.
- **Adults do use Puget Sound estuaries before spawning.** *Encyclopedia of Puget Sound, "Chinook
  salmon and estuary use in Puget Sound"* (T. P. Quinn, 2025-09-15), which also names the **Green
  River Soos Creek** Chinook population.
- The staging mechanism now has **peer-reviewed anchors**: **Strange 2013**, "Factors influencing the
  behavior and duration of residence of adult Chinook salmon in a *stratified estuary*", *Environmental
  Biology of Fishes* 96:225–243; and **Strange 2010**, "Upper thermal limits to migration in adult
  Chinook salmon: evidence from the Klamath River basin", *Trans. Am. Fish. Soc.* 139:1091–1108.

*NOT verified — do not build on these.*
- The **RM 7.9** specific figure and the **15–25 % freshet** trigger: **not found** in any readable
  source. The WRIA 9 white papers are PDFs this environment cannot read — there is no
  `pdftotext`/`mutool`/`gs`/`qpdf` and no PyObjC, and the PDF streams carry **no `78` zlib header**
  (i.e. they are encrypted), so a local `zlib` extraction fails too. **To close this:** paste the
  relevant passage from *Green River Temperature and Salmon* (WRIA 9, 2017-02-28) or install poppler.
- The **Nisqually "adults cross on flood tide"** claim: the USGS Nisqually work is explicitly
  **juvenile** — "as **juvenile Fall Chinook salmon are dependent on the estuary**" (USGS WFRC, Puget
  Sound Fall Chinook Estuarine Utilization / Nisqually otolith studies). The *adult* version is
  unsupported by those sources.

**Candidate — "Stall vs. Run" (a run-timing signal, NOT built).** For a tidal-reach river like the
Green/Duwamish: `temp > 20–21 °C → fish staging in tidewater / salt wedge` (few in the river reach);
`temp < 18 °C + an early-fall freshet (15–25 % discharge bump) → mass upstream movement`. This is a
**"are the fish even here"** state, not a strike-zone depth, and it lives in the **estuary/tidal zone
(RM 7.9 → Elliott Bay)** that the per-gauge model does not cover. Gate: **verify the 20–21 °C /
18 °C / freshet numbers against WRIA 9** (govlink.org TMDL + Duwamish Blueprint), then decide
whether it is a reach-level advisory rather than a strike-zone term.

**Juvenile / outmigration (out of scope for the adult model):**
- Kuruvilla, Quinn, Anderson, Scheuerell, Berger, Okasaki, McMillan, Pess, Westley & Berdahl 2026,
  "Social influences complement environmental cues to stimulate migrating juvenile salmon",
  Movement Ecology 14:33 (doi:10.1186/s40462-026-00644-y) — **smolt** outmigration (Puyallup/Skagit/
  Dungeness), MARSS models; night migration, flow anomalies, hatchery pulses. Future *smolt-timing*
  feature, not the adult strike zone.
- Nichols et al. 2026, "Adaptive potential of Puget Sound Chinook salmon seawater tolerance", CJFAS
  (doi:10.1139/cjfas-2026-0078) — **juvenile** smoltification/osmoregulation (genomics). Not our model.

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
