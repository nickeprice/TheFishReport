# SYMBOLS — file → public API index

Locate any public symbol **without opening the file**. Every module is an
ES module (`import`/`export`); `window.*` shims provide backward compatibility
for Node.js tests.

`node sanity_pass.cjs --quiet` asserts that every name listed here still exists
as a `window.*` property, and that no module's `public:` header declares a name
missing from this index. **Rename a public symbol → update this file**, or the
pass fails.

## Modules (ES module import chain — no classic scripts)

### src/data — measured gauge velocity & width (classic data globals)

`washington.js` (REGIONS), `channel_measurements.js` (CHANNEL_MEASUREMENTS), `river_widths.js` (RIVER_WIDTHS), `spot_widths.js` (SPOT_WIDTHS) — classic data globals.

## src/data — measured gauge velocity & width

`channel_measurements.js`, `river_widths.js` and `spot_widths.js` are GENERATED; never hand-edit.
- `channel_measurements.js` (`scripts/fetch_channel_measurements.py`) — one USGS field-measurement
  fit per gauge, `fit = { a, b, r2 }` for `v = a * Q^b`, plus `first_yr`/`last_yr`/`recent_n`/
  `thin_recent` and the underlying `points[]`. `hydraulicVelocity(flow, siteId)` uses the measured
  **shape**, anchored to the locked reference so `DRAG_REF` and the strike zone keep their calibration.
- `river_widths.js` (`scripts/extract_river_widths.py`) — per-gauge `width_ft` + the `method` that
  produced it (`elevation` / `naip` / `usgs`), validated against the USGS field width. `dem_vintage`
  is `"unknown"` (the DEM tile exposes no collection date).
- `spot_widths.js` (`scripts/precompute_spot_widths.py`) — channel widths measured from the 3DEP DEM
  (AWS Terrain Tiles / terrarium z15) at ~500m intervals along 5 core rivers. Each point includes
  `lat`/`lon`, `wetted_ft`, `bankfull_ft`, `thalweg_m`, and a `truncated` flag. Consumed by the
  nearest-neighbor spot-width lookup in `continuity.js` (Phase 1.4).

## src/utils — regulations.js
`loadRules(customPath)` · `setRulesCache(rules)` / `getRulesCache()` ·
`parseGPS(gpsInput)` · `matchRiverRules(rules, riverName)` ·
`findZoneForGPS(riverName, zones, gpsCoords)` ·
`isDateInRange(targetDate, dateRangeStr)` · `evaluateZoneRules(zone, targetDate)` ·
`checkRiverStatus(date, gpsCoords, activeRiverName, overrideRules)` ·
**`calculateSolarHours(date, lat, lon)`** · `getMemorialDaySaturday(year)` · `parseDateToken(token, year)`

## src/services
- **supabase.js** — `isConfigured()`, `ensureSdk()`, `getClient()`, `rememberName(name)`,
  `recallName()`, `signInGuest(name)`, `signOut()`, `getSession()`, `toCatchRow(payload)`,
  `insertCatch(payload)`, `fetchMyCatches()`, `updateMyCatch(id, patch)`,
  `deleteMyCatch(id)`, `fetchPublicFeed(limit)`, `fetchGlobalCalibration(flow, species)`,
  `toSpotRow(payload)`, `saveFavoriteSpot(payload)`, `fetchFavoriteSpots()`,
  `deleteFavoriteSpot(id)` — the private favourite-spot CRUD (WS-5; `user_id` is never
  client-supplied, the DB default owns it)
- **water.js** — `fetchCFSMomentum(siteId)`, `renderCfsTrend(siteId, sorted)`,
  `fetchCfsReadingsWdfn(siteId)`,
  `fetchCfsReadingsLegacy(siteId)`, `applyOwnGaugeWaterQuality(waterTempF, turbidityFnu)`,
  `applyReportWeather(rep)`, `loadEscapementData(siteId)`, `refreshEscapement(siteId)`,
  `refreshWdfwForecast()`, `fetchStreamStats(lat, lon, siteId)`, `hatcheryEscapement`,
  `escapementFacilities`

## src/shared
- **state.js** — `State.userGPSCoords`, `State.waterTempF`, `State.turbidityFnu`,
  `State.currentWindMph`, `State.currentWindDir` — cross-feature shared state, replacing
  `window.*` globals. Loaded first among shared scripts.
- **debug.js** — `logDebug(msg, source)` (+ the double-tap header matrix)
- **ui.js** — `showToast(msg, kind, ms, action)`
- **nav.js** — `switchTab(tabId)`, `resetToToday()`
- **format.js** — `normalizeFeedRow(row)`, `formatCatchTime(value)`, `provVal(x)`,
  `escapeHtml(value)`, `escapeJsString(value)`, `newUuid()`
- **api.js** — `apiGetJson(path, opts)` → `{ ok, status, data, error, serverMessage, note }`:
  one resilient GET for the app's OWN `/api/*` endpoints (one retry on a cold/5xx/HTML
  response, a per-attempt timeout, the real status + a sanitised body slice in the debug
  trail, and NEVER the query string in a log — it carries coordinates). `ok:false` means
  "we could not ask", which callers must not word as "the data says no". Used by
  `src/features/map/map.js` + `src/features/map/spots.js`.
- **forms.js** — `syncSelect(baseId, fromLog)`, `setFieldValue()`
- **tackle.js** — `tackleLoad()`, `tackleItems(type)`, `tackleLineById(id)`,
  `tackleLineByMatLb(mat, lb)`, `tackleRowLine(row, role)` (brand id -> else material+lb),
  `isGenericBrand()`, `brandLabel()` (displays "Generic"), `brandOrder()` (generic first),
  `populateTacklePickers()`, `tackleLineBrands(mat, role)`, `tackleLineLbs(mat, brand, role)`,
  `tackleLineFind(mat, brand, lb)`, `cascadeLine(role)`, `resolveLineId(role)`,
  `onLinePartChange(fieldId, fromLog)`, `onWeightShapeChange(baseId, fromLog)`,
  `onBeadMatChange(fieldId, fromLog)`, `tackleWeightOz(shape)`,
  `tackleWeightRow(shapeLabel, oz)` (the ONE row a picker pair names), `tackleWeightArea(shapeLabel, oz)`
  (`area_cm2` or `null`), `tackleBeadSizes(mat)` —
  the CASCADE (material -> brand -> lb test, weight type -> amount, bead material -> size)
  over `src/data/tackle.json`; the picks resolve into the hidden `ml-line`/`ld-line` id
- **idb.js** — `idbAvailable()`, `idbOpen()`, `idbGetAll(store)`, `idbPutAll(store, rows)`
- **gear-options.js** — `GEAR_OPTIONS`, `populateStaticGear()` — single source of truth for all dropdown options (hook, yarn, foam, bead, weight, line mat). Populates selects on load.
- **refresh.js** — `AUTO_REFRESH_MS`, `silenceableRefresh()`, `startAutoRefresh()`, `refreshNow()`
- **pwa.js** — `registerServiceWorker()`, `applyTabDeepLink()`

## src/features/auth
- **auth.js** — `AuthState`, `applyAuthState()`, `initAuth()`, `startFishing()`,
  `stopFishing()`, `syncPendingCatches()`

## src/features/telemetry
- **tide.js** — `getFMIColor(score)`, `tideHourOf()`, `formatTideRow()`, `tideCurveSvg()`
- **hero.js** — `buildFishingHero(rep)`, `buildSpeciesCalendarHtml(calendar, escStocks)`
- **daynav.js** — `activeDateOffset`, `reportsData`, `stepDate()`,
  `updateActiveDateUI()`, `renderWaterReportEmptyState()`, `legalHoursLabel()`
- **report.js** — `loadWaterReport(silent)`
- **hourly.js** — `HOURLY_METRICS`, `openHourlyPopup(metricKey)`, `closeHourlyPopup()` — the
  tap-a-pill 24-hour strip (WS-4), auto-scrolled to the day's reference hour

## src/features/gear-sim
- **inputs.js** — `currentStats`, `BASE_ZONE_MIN`/`BASE_ZONE_MAX`, `getNum`/`getStr`/`getGPS`,
  `FOAM_TABLE`, `parseFoam`/`hookLabel`/`hookSink`, `hydraulicVelocity(flow, siteId)`,
  `rigLift()`, `getActiveStationId()`, `measuredFit(siteId)`, `measuredVelocity(siteId, flow)`,
  `WATER_TYPES` (pool/riffle/run/glide depth/vel multipliers),
  `THERMAL_BANDS`, `thermalOptimum(tempF)` — the water-temperature curve (WS-8a)
- **continuity.js** — `gaugeWidthFt(siteId)`, `spotWidthRatio(siteId)`,
  `velocityAtSpot(flow, siteId)` — gauge velocity -> "near you" (Manning-adjusted when
  SPOT_WIDTHS data is available, same-reach estimate ±20% otherwise);
  `depthAtGauge(flow, siteId)` (`D = A/W` median, cross-checked by `Q/(W·V)`; `minFt`/`maxFt` are
  the MEASURED BAND), `spotDepthFt(flow, siteId)` — the spot DEPTH estimate with
  `bandLow`/`bandHigh` (`value: null` = unmeasured) (WS-8a + a2);
  `spotNearestWidth(siteId)` — nearest DEM cross-section from SPOT_WIDTHS
- **physics.js** — `lineDragPerFt(diameterMm, velocityFtS)`, `pointDragGf(areaCm2, cd, velocityFtS)`,
  `totalDragPerFt(velocityFtS, leaderDiaMm, leaderLenFt, ...objects)`, `computeLiftGf(...)`,
  `presentationHeightInches(liftGf, dragGfPerFt, leaderFt)` — standard fluid dynamics:
  `F = 0.5·ρ·Cd·A·v²` with no tuned constants. Lift is net Archimedes (buoyancy − mass).
- **hydro.js** — `KAPPA`, `ROUGHNESS_COBBLE`, `logLawVelocity(z, uStar, z0)`,
  `uStarFromMax(uMax, H, z0)`, `velocityProfile(z, H, uMax, [z0])`,
  `turbulenceFluctuation(t, intensity, uMean)` — log-law boundary layer velocity profile,
  roughness estimates, and isotropic Gaussian turbulence for the 3D cable simulator.
- **riverbed.js** — `MU_STATIC`, `MU_KINETIC`, `RESTITUTION`, `R_COBBLE_M`,
  `bedElevation(x, y)`, `contactForce(z, z_bed, v_z)`,
  `frictionForce(v_xy, F_n)`, `isSnagged(z, z_bed, pullVec, muS)` —
  cobble-bed substrate, Hertz contact, Coulomb friction, and snag detection for
  the lumped-mass cable simulator.
- **chain.js** — `chainSolve(rig, env)` — unified chain solver: RK4 shooting
  method integrating the ODE from hook to rod tip through water, then an analytical
  air catenary. Replaces cable.js, terminal.js, and sinker.js with a single model.
  Returns `{ hookDepthM, hookZ, converged, iterations, detail }`.
- **salmon.js** — `SALMON_DEFAULTS`, `salmonState(t, freqHz, dutyCycle, phase)`,
  `salmonMouthCone(mouthFraction)`, `salmonPositionZ(depthMinM, depthMaxM)` —
  adult salmon target: respiration cycle (sinusoidal, f=1.0 Hz, duty=35%),
  elliptical mouth cone (65×45×80 mm), random holding depth (0.15-0.60 m).
- **interception.js** — `interceptionRun(hookDepthM, salmonZ, mouthOpen, flowMs)`,
  `interceptionProbability(hookDepthM, flowMs)`, `HOOK_SET_FORCE_N` — flossing
  interception state machine: 4-phase (DRIFT_STABILIZE → SWEEP → COLLISION → SEAT),
  Monte-Carlo (N=100) over randomised salmon depth + breathing phase,
  hook set threshold 8.0 N, seat distance 0.008 m.
- **sonar.js** — `envMatchWeight()`, `envCloseness()`, `catchPredictedCenter()`,
  `catchResidual()`, `communitySonar(dbArray, flow, species, siteId)`,
  `getActiveReport()`, `getCurrentFlow()` — the community sonar matches a catch on the SAME
  variable set the sim uses (see `envSignature()`), max 8 newest eligible rows, and returns a
  weighted centre + `residuals[]` (the notebook). No mouth-hook filter; no sample-count floor.
- **zone-env.js** — `RIG_REQUIRED`, `missingRigFields()`, `getWaterTempF()`, `getTurbidityFnu()`,
  `refHourBlock()`, `lightTerm(block, rep)`, `turbidityTerm()`, `tideAt(block, rep)`,
  `tideTerm(block, rep)`, `envSignature(rep)` —
  environmental math: rig requirements, weather terms (barometer, cloud, rain, thermal curve
  calling `thermalOptimum()`), own-gauge colour, solar-geometry light term, tide term. All
  null-safe (missing input → null, never a guess).
- **zone-core.js** — `computeStrikeZone()`, `gradeColor()`, `zoneColor()`, `zoneTrend()`,
  `depthBandText()`, `positionParts()`, `whereToFish()` (detail string),
  `fishOutlook()` (the 2-sentence HUD summary), `paintZoneHud(zone, outlook)`,
  `refreshZonePreview()`, `plainDepthText()` —
  strike zone computation, positioning, and HUD painting. The community-catch pull is silent
  (no count/confidence text) and capped (`SONAR_PULL_*`). `zone.notes` still records every
  reason for the log. `envSignature()`, called from zone-env, is the ONE variable set the sim
  and the sonar share (temperature, light/cloud, turbidity, tide, barometric trend, rain).
- **zone-best.js** — `bestZoneRig(zone, rig, vel)`, `beadSizeOptions()`, `foamShort()`,
  `rigChangeList()` (precise), `rigChangePlain()` + `joinPlain()` (beginner) —
  deterministic two-pass tackle search: leader/lead fixed first (corky → 2nd corky → hook →
  yarn → bead), leader/lead only as the fallback.
- **presets.js** — `PRESET_STORE_KEY`, `savePreset()`, `deletePreset()`, `applyPreset()`, `loadPresets()` — multi-slot named rig presets in localStorage
- **rig.js** — `RIG_STORE_KEY`, `saveRig()`, `restoreRig()`
- **registry.js** — `GEAR_TECHNIQUES`, `GEAR_DEFAULT_TECHNIQUE`, `gearTechnique(id)`
- **techniques/drift.js** — `DRIFT_TECHNIQUE` (`CONTRACT_TECHNIQUE.md`)
- **solver.js** — `readRigFromForm()`, `loadCalibrationData(flow, species)`,
  `buildSimStats(rig, out)`, `paintSimHud(rig, out, stats)`
- **water-types.js** — `waterTypeMultiplier(typeId)`, `openWaterTypeGuide()`,
  `closeWaterTypeGuide()`
- **sim.js** — `runSim()`

## src/features/catch-log
- **outbox.js** — `outboxLoad()`, `outboxAll()`, `outboxPending()`, `outboxAdd(row)`,
  `outboxUpdate(clientId, patch)`, `outboxStoreKind()`; G5 snapshots:
  `snapshotSave(store, value)`, `snapshotLoad(store)`, `snapshotsAvailable()`
- **log.js** — `deriveRiverName()`, `logData()`
- **board.js** — `CATCH_SCOPE`, `setCatchScope(scope)`, `loadDatabase()`
- **mycatches.js** — `_myCatches`, `renderMyCatches()`, `editMyCatch(row)`, `deleteMyCatch(id)`
- **pending.js** — `pendingRows()`, `pendingNotIn(serverRows)`, `pendingBadge()`,
  `asMyCatchRow(row)`, `refreshCatchLists()`
- **reconcile.js** — `initCatchReconcile()`, `reconcileCatches(force)`

## src/features/station
- **picker.js** — `openStationModal()`, `closeStationModal()`, `selectPreset()`,
  `calcDistance()`, `useGPS()`, `renderPresets()`,
  `PRESET_FAV_KEY`, `togglePresetFav(siteId)`
- **search.js** — `searchStation()`, `updateSearchAvailability()`

## src/features/map
- **spots.js** — private favourite spots (WS-5): `SPOTS_CACHE_KEY`, `SPOT_LABEL_MAX`,
  `spotsState`, `spotsStatus`, `loadFavoriteSpots()`, `renderFavoriteSpots()`, `saveCurrentSpot()`,
  `saveSpotAt(lat, lon, label)`, `pickNearestStation(list, preferId)`,
  `resolveSpotStation(lat, lon, preferId)`, `spotGaugeText(spot)`, `selectSavedSpot(id)`,
  `deleteSavedSpot(id)` — a spot is a lat/lon YOU pick (weather at the point, flow from the
  resolved gauge), RLS-private, cached locally
- **spots-map.js** — `savedSpotIcon()`, `savedSpotPopupHtml(spot)` — the saved-spot star
  layer (Leaflet half, split out of spots.js)
- **map.js** — `showStationMap()`, `loadLeaflet()`, `refreshStationMap(center)`,
  `mapCenter()`, `startSpotPick()`, `onSpotPick(e)` — the "drop a point anywhere" picker

## src/app.js
Bootstrap only — no public API. It wires `window.onload` to the globals above.
