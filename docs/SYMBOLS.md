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
| 7 | `src/shared/*` | debug, ui, nav, format, forms, idb, refresh, pwa |
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
  `deleteMyCatch(id)`, `fetchPublicFeed(limit)`, `fetchGlobalCalibration(flow, species)`
- **water.js** — `fetchCFSMomentum(siteId)`, `fetchCfsReadingsWdfn(siteId)`,
  `fetchCfsReadingsLegacy(siteId)`, `applyOwnGaugeWaterQuality(waterTempF, turbidityFnu)`,
  `applyReportWeather(rep)`, `loadEscapementData(siteId)`, `refreshEscapement(siteId)`,
  `refreshWdfwForecast()`, `hatcheryEscapement`, `escapementFacilities`

## src/shared
- **debug.js** — `logDebug(msg, source)` (+ the double-tap header matrix)
- **ui.js** — `debounce(fn, wait)`, `showToast(msg, kind, ms, action)`
- **nav.js** — `switchTab(tabId)`, `resetToToday()`
- **format.js** — `normalizeFeedRow(row)`, `formatCatchTime(value)`, `escapeHtml(value)`,
  `escapeJsString(value)`, `newUuid()`
- **forms.js** — `syncSelect(baseId, fromLog)`, `setFieldValue()`
- **tackle.js** — `tackleLoad()`, `tackleItems(type)`, `tackleLineById(id)`,
  `tackleLineByMatLb(mat, lb)`, `tackleRowLine(row, role)` (brand id -> else material+lb),
  `isGenericBrand()`, `brandLabel()` (displays "Generic"), `brandOrder()` (generic first),
  `populateTacklePickers()`, `tackleLineBrands(mat, role)`, `tackleLineLbs(mat, brand, role)`,
  `tackleLineFind(mat, brand, lb)`, `cascadeLine(role)`, `resolveLineId(role)`,
  `onLinePartChange(fieldId, fromLog)`, `onWeightShapeChange(baseId, fromLog)`,
  `onBeadMatChange(fieldId, fromLog)`, `tackleWeightOz(shape)`, `tackleBeadSizes(mat)` —
  the CASCADE (material -> brand -> lb test, weight type -> amount, bead material -> size)
  over `src/data/tackle.json`; the picks resolve into the hidden `ml-line`/`ld-line` id
- **idb.js** — `idbAvailable()`, `idbOpen()`, `idbGetAll(store)`, `idbPutAll(store, rows)`,
  `idbDelete(store, key)`
- **refresh.js** — `AUTO_REFRESH_MS`, `silenceableRefresh()`, `startAutoRefresh()`, `refreshNow()`
- **pwa.js** — `registerServiceWorker()`, `applyTabDeepLink()`

## src/features/auth
- **auth.js** — `AuthState`, `applyAuthState()`, `initAuth()`, `startFishing()`,
  `stopFishing()`, `syncPendingCatches()`

## src/features/telemetry
- **tide.js** — `getFMIColor(score)`, `tideHourOf()`, `formatTideRow()`, `tideCurveSvg()`
- **hero.js** — `buildFishingHero(rep)`, `buildSpeciesCalendarHtml(calendar, escStocks)`
- **daynav.js** — `activeDateOffset`, `reportsData`, `stepDate()`, `showDay()`,
  `updateActiveDateUI()`, `renderWaterReportEmptyState()`, `legalHoursLabel()`
- **report.js** — `loadWaterReport(silent)`

## src/features/gear-sim
- **inputs.js** — `currentStats`, `BASE_ZONE_MIN`/`BASE_ZONE_MAX`, `getNum`/`getStr`/`getGPS`,
  `FOAM_TABLE`, `parseFoam`/`hookLabel`/`hookSink`, `hydraulicVelocity(flow, siteId)`,
  `rigLift()`, `getActiveStationId()`, `measuredFit(siteId)`, `measuredVelocity(siteId, flow)`
- **continuity.js** — `gaugeWidthFt(siteId)`, `spotWidthRatio(siteId)`,
  `velocityAtSpot(flow, siteId)` — gauge velocity -> "near you" (same-reach estimate + spread)
- **physics.js** — `lineDiameterScale`, `beadDrag`/`beadSink`, `hookDrag`, `yarnDrag`,
  `mainlineDragPerFt`, `leaderDragPerFt`, `totalDragPerFt`, `presentationHeightInches()`
- **sonar.js** — `envMatchWeight()`, `communitySonar(dbArray, flow, species, siteId)`,
  `getActiveReport()`, `getCurrentFlow()`
- **zone.js** — `RIG_REQUIRED`, `missingRigFields()`, `getWaterTempF()`, `computeStrikeZone()`,
  `gradeColor()`, `zoneColor()`, `zoneTrend()`, `zoneNotes()`, `paintZoneHud()`,
  `refreshZonePreview()`, `bestZoneRig()` — the HUD zone panel (trend line + one bullet per
  reason; the community note is filtered out) and the colour grade shared with line height
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
  `calcDistance()`, `fallbackStation()`, `useGPS()`
- **search.js** — `searchStation()`

## src/features/map
- **map.js** — `showStationMap()`, `loadLeaflet()`

## src/app.js
Bootstrap only — no public API. It wires `window.onload` to the globals above.
