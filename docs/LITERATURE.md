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
| Keefer, Naughton, Blubaugh, Clabough & Caudill 2025, "River environment effects on adult migration phenology and rate of spring-run Chinook Salmon", TAFS | Willamette River (OR) spring-run: 23-yr daily counts at Willamette Falls + **909 radio-tagged** fish across 13 reaches. **"moved upstream faster when river temperatures were higher and discharge was lower"**; runs migrated **earlier in warm, low-flow years**; mean-May conditions best predicted median timing (early May–mid-June); main-stem **25–50 km/d** vs tributaries **<10 km/d**; stock identity not significant after accounting for temp + discharge; results aligned across Yukon/Columbia/Snake. *(DOI unconfirmed — the cited `10.1093/tafs/8081683` returned 404.)* | **Corroborating + new nuance (low flow → faster)** |
| Keefer, Peery, Bjornn, Jepson & Stuehrenberg 2004, "Hydrosystem, Dam, and Reservoir Passage Rates of Adult Chinook Salmon and Steelhead in the Columbia and Snake Rivers", TAFS 133(6):1413–1432 | **>12,000** radio-tagged adults past Columbia/Snake dams. Most fish passed each dam in **< 2 d**; spring–summer Chinook migrated **faster as temperature and date increased**; **fastest in low-discharge years**; steelhead **slowed dramatically at summer temperature peaks, then sped up as rivers cooled**; fall Chinook also **slowed in warm water**; temperature explained more between-year variation than discharge. | **Corroborating (flow/temp); dam-passage dynamics = out of scope** |

**Candidate — flow-regime boundaries (NOT built).** Two independent studies land on **~20 cms (~706 cfs)**
as a "more water stops helping migration" plateau, with a high-flow bound at **80 cms**. Real concept,
but **different rivers and units (cms vs our cfs)**, and it is *migration activity*, not *holding
depth* — so no threshold transfers. Gate: a Puget-Sound-relevant number or the notebook residual.

**Reconciliation — temperature is NON-LINEAR (recorded 2026-09-30).** Keefer 2025/2004 say warm water
*speeds* migration, while Keefer 2018 and §8 say warm water *blocks* it. Both are true on ONE curve:
warmer water raises migration rate **up to ~18–20 °C**, then temperature **impairs (18–20 °C)**,
**blocks (21–22 °C)** and **kills (22 °C+)**. So "warm → faster" holds only inside the tolerable
window; past ~18 °C the behaviour inverts to hold/stall. Consistent with `thermalOptimum()`'s stress
onset and the §8 thresholds — **no model change**, but it is why a naive "warm ⇒ move" reading is wrong.

**The freshet trigger is re-disproven from the flow side.** Two independent Keefer papers (2025 and
2004) find **LOWER discharge → FASTER migration** — the *opposite* of a freshet cueing a run. That stacks
on the pulse-flow disproof (§8) and Damborg's ~20 cms plateau.

## 8. Puget Sound regional drivers — the app's own rivers (GREY-LIT; thermal thresholds VERIFIED)

Region-specific, directly on the rivers the app serves (USGS 12101500 Puyallup, 12113000 Auburn,
12089500 McKenna). Sources are **WRIA 9 / King County DNRP / USGS** technical reports, not the
peer-reviewed journals above — so every threshold here is **reported, verify against the source**
before hard-coding.

| Basin (gauge) | Reported limiting factor / trigger | Maps to |
| --- | --- | --- |
| Puyallup / White (12101500) | Glacial silt / turbidity: high glacial flour impairs visual feeding, fish travel **lower** in the column along gravel seams | `turbidityTerm()` (turbid → deep) |
| Duwamish / Green (12113000 Auburn) | **Thermal block** — applicable criterion **17.5 °C**; **18–20 °C = impairment, 21–22 °C = blockage, 22 °C = lethal**; adults hold in the **cool brackish salt wedge** (Elliott Bay water on high tides) in the **RM 4.7–8.5 transition zone**; **RM 7.9 = the 42nd Ave S Bridge station** | `thermalOptimum()` (stress > 68 °F — matches Keefer's 20 °C, region-confirmed) |
| Nisqually (12089500 McKenna) | **Delta tidal flux**: fish cross the extensive shallow flats mainly on **high-slack / flood tides** (avoid stranding + seal predation). **⚠️ Adult version UNVERIFIED — see below** | `tideTerm()` (flood → up/active) |

**Verification pass (2026-09-30) — what the sources actually say.**

*Confirmed from readable sources.*
- **The thermal block is a named, numeric, sourced phenomenon.** King County's June 2004
  *Green-Duwamish Watershed Temperature Monitoring Report* (kcr1532; full text read via PDFKit)
  applies four Ecology (2002) categories, verbatim: *"average temperatures in the range of
  **18–20 °C** may periodically pose **impairment** to salmon migration while temperatures in the
  range of **21–22 °C** may result in a temperature related **blockage to migration**"* — with
  lethality above. Measured: **CO1 (Covington Ck) 21.5 °C** and **GRT02 (Springbrook Ck) 21.4 °C** →
  "potential for **blockage to migration**"; **29 further stations at 18–21 °C** → "potential for
  **impairment**"; one at **23.1 °C** → "potential for **lethality**". The report carries dedicated
  sections *3.1.3 Exceedances Critical to Migration* and *4.2.3 Potential Impacts to Salmonid
  Migration / 4.2.3.1 Potential Lethality*. ✅ **This confirms the "20–21 °C thermal block".**
- **The "< 18 °C" figure is the named "Migration and Rearing" criterion**, by segment: **Upper Green
  (RM 42.3–59.1) = 16 °C**, **Lower Green (RM 11–42.3) = 17.5 °C**, **Duwamish (mouth–RM 11) =
  21 °C** (17.5 °C appears as the *"Salmon/trout … migration"* criterion in Figs. 7/9/11/13/16/18 —
  the same 63.5 °F American Rivers quotes). ✅ **Confirms the "< 18 °C" figure.**
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
- **"RM 7.9" CONFIRMED — it is real, and it is the transition-zone station.** King County's *2015
  Temperature Data Compilation* (kcr2880) lists the station **"MIT 42nd Ave S Bridge RM7.9"**
  (47.4900, −122.2802) plus **RM7.9a**, with Figures 2–3 plotting temperature at both; the Duwamish
  Blueprint names **"Southgate Creek (RM 7.9)"** as a freshwater input. It sits inside the **Duwamish
  transition zone**, which the Blueprint expanded from the 2005 area (**RM 4.7–7.0**) — juveniles use
  RM 1–3.5 → 4.7–6.5 → **6.8–8.5** by season. ✅ **"RM 7.9" is a genuine location, not a misprint.**
- **The cold water adults hold in is the brackish salt wedge.** kcr2880: *"the presence of **cooler
  bottom water** found in the **brackish salt wedge** that enters the river from Elliott Bay during
  **high tides** and recedes as the tide goes out"*; the Blueprint adds that dam operations have
  *"pushed the salt wedge farther upstream"*. USGS (WSP 1873-D) measured the wedge's tide excursion
  (≈1 km for a 1.3 m tide, ≈3 km for a 3 m tide).
- **Observed 2015 severity (kcr2880).** The applicable criterion is **17.5 °C** ("Salmonid spawning,
  rearing and migration") for the Duwamish + Green from **RM 11** to Mill Creek; *"7-DMax temperatures
  at all of the mainstem stations in this reach **exceeded the 17.5 °C … criterion until about
  September 2, 2015**"* and *"7-DMax temperatures at all of the stations **exceeded the 22 °C lethal
  threshold**"*. So **22 °C is the lethal line**, and the summer block lasts into early September.
- The staging mechanism has **peer-reviewed anchors**: **Goetz & Quinn 2019** (*Fishery Bulletin*
  117(3):258–271, DOI 10.7755/FB.117.3.12) — Puget Sound adults entered in mid-summer but *"often moved
  back into the cool, marine waters of Puget Sound"* before running (basin = Lake Washington/Cedar, not
  the Green); **Strange 2013** (adult residence in a *stratified estuary*, *Environ. Biol. Fish*
  96:225–243); **Strange 2010** (upper thermal limits to migration, Klamath, *TAFS* 139:1091–1108).

*DISPROVEN / not to be built.*
- The **"15–25 % freshet"** trigger is **DISPROVEN**, not merely unverified. **"freshet" appears zero
  times** in the full text of *all five* documents read (kcr1532, kcr2880, the Duwamish Blueprint, its
  Appendix B, and the WRIA 9 deck), and the peer-reviewed pulse-flow literature finds the effect weak or
  absent: **Peterson, Fuller & Demko 2017** (NAJFM 37:78) — pulse flows triggered migration in **only 2
  of 11 years**, "small and short-lived", with **no added movement above 700 cfs**; **Hasler et al.
  2014** (Aquat. Sci. 76:231–241; keyword "**Artificial freshets**") — effect "**unclear**", passage
  improved only in an *abnormal* pulse at **2× prescribed flow**, "requires further research".
  **Temperature, not flow, is the driver. Do not code a flow trigger.**
- The **Nisqually "adults cross on flood tide"** claim stays unsupported: the USGS Nisqually work is
  explicitly **juvenile** — "as **juvenile Fall Chinook salmon are dependent on the estuary**" (USGS
  WFRC, Puget Sound Fall Chinook Estuarine Utilization / Nisqually otolith studies).

**Candidate — "Stall vs. Run" (a run-timing signal, NOT built).** For a tidal-reach river like the
Green/Duwamish: `temp > ~20 °C → fish staging in tidewater / the salt wedge` (few in the river reach);
as it cools toward the **17.5 °C** criterion (lethal **22 °C**) → upstream movement. **This is
temperature-gated, NOT flow-gated** — the freshet trigger is disproven above. This is a
**"are the fish even here"** state, not a strike-zone depth, and it lives in the **estuary/tidal zone
(RM 7.9 → Elliott Bay)** that the per-gauge model does not cover. The **evidence gate is now closed** —
the thresholds are verified above and the flow trigger is disproven — so the only open question is a
*product* one: whether to surface it as a reach-level advisory rather than a strike-zone term.

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

**Fukushima & Rand 2023, "Individual variation in spawning migration timing in a salmonid fish —
Exploring roles of environmental and social cues", Ecology and Evolution 13(5):e10101**
(doi:10.1002/ece3.10101). ⚠️ **Not a Chinook study** — the species is **Sakhalin taimen (*Parahucho
perryi*)**, an endangered salmonid, in northern Japan. Adult spring migration: **water temperature and
water level near the river mouth ~1 week before arrival** explained between-year run timing **for females
but not males**; **no** conspicuous social/conspecific effect; concluded individual-specific
responsiveness to environmental cues. Kept only as a **weak, species-adjacent** note that temperature +
water level are timing cues — it supplies no threshold and does not transfer to adult Chinook holding
depth. *(Listed as "Rand et al. 2023" when provided; first author is Fukushima.)*

**Burke et al. 2013, "Multivariate Models of Adult Pacific Salmon Returns", PLoS ONE 8:e54134.**
Combines **31 marine indicators** to forecast adult **return abundance** a year ahead (PCA/PCR/MCA).
Different question — *how many* return from the ocean, not *where* they hold in the river — so none
of its machinery was imported. Two lessons were kept (see `ROADMAP.md` §3.2): SST (temperature) was
the top-weighted driver — corroborating that temperature leads — and multivariate models **overfit**
(randomized indicators still gave R² > 0.9), which is why Level 2 must wait for real catch volume
plus a train/validation split.
