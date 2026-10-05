# Fish Report — Active Plan

All prior phases (0 Chain Solver Integration, 1 Spot Geometry System,
2 Progressive Enhancement Architecture, 3 Enhanced UI,
R Repository Overhaul & Testing Optimisation) are complete.

Active task list begins below.

---

## Gear Sim — Named Rig Presets (localStorage MVP)

**Goal:** Save named rig configurations so an angler can switch between
frequently-used setups instead of re-entering everything.

**What:**
- Multiple named presets stored in `localStorage` (`puyallup_rig_presets`).
- Each preset captures the full form state: water type, species, technique,
  plus all 16 rig fields (matching the existing `saveRig()` shape).
- Dropdown to load a preset → fills the gear sim form (reusing the existing
  cascade restore logic).
- Save button (prompts for name), delete button for the active preset.
- Existing `saveRig()` / `restoreRig()` single-slot auto-save stays untouched.

**Why localStorage (not DB):**
- Zero coupling to backend patterns that may still evolve (`favorite_spots`,
  `profiles`).
- Works for anonymous and signed-in users, online and offline.
- The JSON shape ports 1:1 to any DB schema later — adding cross-device sync
  is a follow-up task with no wasted work.

**Files:**
- `src/features/gear-sim/presets.js` (new, ~80 lines)
- `index.html` — preset bar (dropdown + save/delete buttons) above gear rows
- `src/styles.css` — ~15 lines for preset bar styling
- `src/app.js` — wire `loadPresets()` into boot
- `sanity_pass.js` — assertions for new globals

**Not in scope (follow-up):**
- DB sync / cross-device presets
- Offline write queue
- Sharing presets within crews

- [x] Rig presets: localStorage MVP