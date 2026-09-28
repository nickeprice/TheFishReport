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
| 2 | `src/utils/regulations.js` | WDFW rules engine + local solar calc |
| 3 | `src/services/supabase.js` | auth, catch writes, public feed, calibration RPC |
| 4 | `src/services/water.js` | USGS WDFN / Open-Meteo / WDFW Socrata data layer |
| 5 | `src/shared/*` | debug, ui, nav, format, forms, idb, refresh, pwa |
| 6 | `src/features/*` | auth, telemetry, gear-sim, catch-log, station, map |
| 7 | `src/app.js` | **bootstrap only** — `window.onload` |

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
- **forms.js** — `syncSelect(baseId, fromLog)`, `getRodLengthFt()`, `formatRodLength()`,
  `onRodChange()`, `setFieldValue()`, `LB_OPTIONS`, `updateLbOptions()`, `onLineMatChange()`
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
  `FOAM_TABLE`, `parseFoam`/`hookLabel`/`hookSink`, `hydraulicVelocity()`, `rigLift()`
- **physics.js** — `lineDiameterScale`, `beadDrag`/`beadSink`, `hookDrag`, `yarnDrag`,
  `mainlineDragPerFt`, `leaderDragPerFt`, `totalDragPerFt`, `presentationHeightInches()`
- **sonar.js** — `envMatchWeight()`, `communitySonar()`, `getActiveReport()`, `getCurrentFlow()`
- **zone.js** — `RIG_REQUIRED`, `missingRigFields()`, `getWaterTempF()`, `computeStrikeZone()`,
  `refreshZonePreview()`, `bestZoneRig()`
- **rig.js** — `RIG_STORE_KEY`, `saveRig()`, `restoreRig()`
- **registry.js** — `GEAR_TECHNIQUES`, `GEAR_DEFAULT_TECHNIQUE`, `gearTechnique(id)`
- **techniques/drift.js** — `DRIFT_TECHNIQUE` (`CONTRACT_TECHNIQUE.md`)
- **solver.js** — `readRigFromForm()`, `loadCalibrationData(flow, species)`,
  `buildSimStats(rig, out)`, `paintSimHud(rig, out, stats)`
- **sim.js** — `runSim()`
- **debounce.js** — `initGearSimInputDebounce()`

## src/features/catch-log
- **outbox.js** — `outboxLoad()`, `outboxAll()`, `outboxPending()`, `outboxAdd(row)`,
  `outboxUpdate(clientId, patch)`, `outboxStoreKind()`
- **log.js** — `deriveRiverName()`, `logData()`
- **board.js** — `CATCH_SCOPE`, `setCatchScope(scope)`, `loadDatabase()`
- **mycatches.js** — `_myCatches`, `renderMyCatches()`, `editMyCatch(row)`, `deleteMyCatch(id)`
- **reconcile.js** — `initCatchReconcile()`, `reconcileCatches(force)`

## src/features/station
- **picker.js** — `openStationModal()`, `closeStationModal()`, `selectPreset()`,
  `calcDistance()`, `fallbackStation()`, `useGPS()`
- **search.js** — `searchStation()`

## src/features/map
- **map.js** — `showStationMap()`, `loadLeaflet()`

## src/app.js
Bootstrap only — no public API. It wires `window.onload` to the globals above.
