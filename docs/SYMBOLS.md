# SYMBOLS — file → public API index

Locate a global **without opening the file**. Every module is a classic (non-module) script
sharing one global scope, loaded in the order below; `src/app.js` is last and bootstrap-only.

`node sanity_pass.js` asserts that every name listed here still exists, and that no module's
`public:` header declares a name missing from this index. **Rename a public symbol → update
this file**, or the pass fails.

## Load order (`index.html`)

| # | file | owns |
| --- | --- | --- |
| 0 | `@supabase/supabase-js` (CDN) | the SDK, lazily awaited by `services/supabase.js` |
| 1 | `src/data/regions/washington.js` | `window.REGIONS.WA` (strict JSON; schema `CONTRACT_REGIONS.md`) |
| 2 | `src/data/channel_measurements.js` | `window.CHANNEL_MEASUREMENTS` — USGS field-measurement velocity fits (generated) |
| 3 | `src/data/river_widths.js` | `window.RIVER_WIDTHS` — routed channel widths (generated) |
| 4 | `src/utils/regulations.js` | WDFW rules engine + local solar calc |
| 5 | `src/services/supabase.js` | auth, catch writes, public feed, calibration RPC |
| 6 | `src/services/water.js` | USGS WDFN / Open-Meteo / WDFW Socrata data layer |
| 7 | `src/shared/*` | debug, ui, nav, format, api, forms, idb, refresh, pwa |
| 8 | `src/features/*` | auth, telemetry, gear-sim, catch-log, station, map |
| 9 | `src/app.js` | **bootstrap only** — `window.onload` |

## src/data — measured gauge velocity & width

`channel_measurements.js` and `river_widths.js` are GENERATED; never hand-edit.
- `channel_measurements.js` (`scripts/fetch_channel_measurements.py`) — one USGS field-measurement
  fit per gauge, `fit = { a, b, r2 }` for `v = a * Q^b`, plus `first_yr`/`last_yr`/`recent_n`/
  `thin_recent` and the underlying `points[]`. `hydraulicVelocity(flow, siteId)` uses the measured
  **shape**, anchored to the locked reference so `DRAG_REF` and the strike zone keep their calibration.
- `river_widths.js` (`scripts/extract_river_widths.py`) — per-gauge `width_ft` + the `method` that
  produced it (`elevation` / `naip` / `usgs`), validated against the USGS field width. `dem_vintage`
  is `"unknown"` (the DEM tile exposes no collection date).

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
- **water.js** — `fetchCFSMomentum(siteId)`, `fetchCfsReadingsWdfn(siteId)`,
  `fetchCfsReadingsLegacy(siteId)`, `applyOwnGaugeWaterQuality(waterTempF, turbidityFnu)`,
  `applyReportWeather(rep)`, `loadEscapementData(siteId)`, `refreshEscapement(siteId)`,
  `refreshWdfwForecast()`, `hatcheryEscapement`, `escapementFacilities`

## src/shared
- **debug.js** — `logDebug(msg, source)` (+ the double-tap header matrix)
- **ui.js** — `showToast(msg, kind, ms, action)`
- **nav.js** — `switchTab(tabId)`, `resetToToday()`
- **format.js** — `normalizeFeedRow(row)`, `formatCatchTime(value)`, `escapeHtml(value)`,
  `escapeJsString(value)`, `newUuid()`
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
  `THERMAL_BANDS`, `thermalOptimum(tempF)` — the water-temperature curve (WS-8a)
- **continuity.js** — `gaugeWidthFt(siteId)`, `spotWidthRatio(siteId)`,
  `velocityAtSpot(flow, siteId)` — gauge velocity -> "near you" (same-reach estimate + spread);
  `depthAtGauge(flow, siteId)` (`D = A/W` median, cross-checked by `Q/(W·V)`; `minFt`/`maxFt` are
  the MEASURED BAND), `spotDepthFt(flow, siteId)` — the same-reach DEPTH estimate with
  `bandLow`/`bandHigh` (`value: null` = unmeasured) (WS-8a + a2)
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
- **sonar.js** — `envMatchWeight()`, `envCloseness()`, `catchPredictedCenter()`,
  `catchResidual()`, `communitySonar(dbArray, flow, species, siteId)`,
  `getActiveReport()`, `getCurrentFlow()` — the community sonar matches a catch on the SAME
  variable set the sim uses (see `envSignature()`), max 8 newest eligible rows, and returns a
  weighted centre + `residuals[]` (the notebook). No mouth-hook filter; no sample-count floor.
- **zone.js** — `RIG_REQUIRED`, `missingRigFields()`, `getWaterTempF()`, `getTurbidityFnu()`,
  `refHourBlock()`, `lightTerm(block, rep)`, `turbidityTerm()`, `tideAt(block, rep)`,
  `tideTerm(block, rep)`, `envSignature(rep)`,
  `computeStrikeZone()`, `gradeColor()`, `zoneColor()`, `zoneTrend()`, `depthBandText()`,
  `positionParts()`, `whereToFish()` (detail string), `fishOutlook()` (the 2-sentence HUD summary),
  `paintZoneHud(zone, outlook)`, `refreshZonePreview()`, `bestZoneRig(zone, rig, vel)`,
  `beadSizeOptions()`, `foamShort()`, `rigChangeList()` (precise), `rigChangePlain()` +
  `joinPlain()` (beginner), `plainDepthText()` —
  the HUD: two estimate banners + the summary paragraph, and the colour grade shared with line
  height. The report terms are the WS-8a set: demoted barometer ±1.2", thermal curve, own-gauge
  colour/gauge terms, the LIGHT term keyed on the sun's real elevation (`solarElevationDeg()`,
  `solarDeclinationDeg()`, `activeStationLat()` — WS-8b b2′), and the TIDE term (`tideAt`/
  `tideTerm`: +1.0" on a flood, −1.0" on an ebb, tide-paired stations only, no tide curve → no
  term). `envSignature()` is the ONE variable set the sim and the sonar share (temperature,
  light/cloud, turbidity, tide, barometric trend, rain — no wind, no moon). The community pull
  is silent (no count/confidence text) and capped (`SONAR_PULL_*`). `zone.notes` still records
  every reason for the log.
  **The rig search is two-pass**: leader/lead fixed first (corky → 2nd corky → hook → yarn → bead),
  leader/lead only as the fallback.
- **rig.js** — `RIG_STORE_KEY`, `saveRig()`, `restoreRig()`
- **registry.js** — `GEAR_TECHNIQUES`, `GEAR_DEFAULT_TECHNIQUE`, `gearTechnique(id)`
- **techniques/drift.js** — `DRIFT_TECHNIQUE` (`CONTRACT_TECHNIQUE.md`)
- **solver.js** — `readRigFromForm()`, `loadCalibrationData(flow, species)`,
  `buildSimStats(rig, out)`, `paintSimHud(rig, out, stats)`
- **sim.js** — `runSim()`

## src/features/catch-log
- **outbox.js** — `outboxLoad()`, `outboxAll()`, `outboxPending()`, `outboxAdd(row)`,
  `outboxUpdate(clientId, patch)`, `outboxStoreKind()`
- **log.js** — `deriveRiverName()`, `logData()`
- **board.js** — `CATCH_SCOPE`, `setCatchScope(scope)`, `loadDatabase()`
- **mycatches.js** — `_myCatches`, `renderMyCatches()`, `editMyCatch(row)`, `deleteMyCatch(id)`
- **pending.js** — `pendingRows()`, `pendingNotIn(serverRows)`, `pendingBadge()`,
  `asMyCatchRow(row)`, `refreshCatchLists()`
- **reconcile.js** — `initCatchReconcile()`, `reconcileCatches(force)`

## src/features/station
- **picker.js** — `openStationModal()`, `closeStationModal()`, `selectPreset()`,
  `calcDistance()`, `useGPS()`
- **search.js** — `searchStation()`

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
