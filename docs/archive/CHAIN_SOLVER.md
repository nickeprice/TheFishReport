# Unified Chain Solver — Physics Engine Design

**Status:** Design complete, implementation in progress
**Replaces:** `cable.js`, `terminal.js`, `sinker.js`
**Net line change:** −117 lines

---

## Problem

The current physics pipeline has two problems:

1. **34 hardcoded values** across 6 modules — line density, line diameter, water depth, salmon mouth size, weight density, etc. The angler picks mono; the model models braid. The angler picks tungsten; the model uses lead density.

2. **Fragmented architecture** — 6 disconnected modules (`cable.js`, `terminal.js`, `sinker.js`, `riverbed.js`, `salmon.js`, `interception.js`) that barely talk. The corky doesn't know the weight exists. The leader doesn't feel hook mass. The sinker and riverbed aren't even wired in.

---

## Solution

Replace the 6 fragmented modules with **one unified chain solver** — a single model that treats the entire rig (rod tip to hook) as one connected chain where forces accumulate naturally.

---

## Physical System

A drift fishing rig in an open-channel river flow. The rig is a slender, flexible line (negligible bending stiffness) with concentrated masses and buoyant elements. The river is a steady turbulent boundary-layer flow over a rough bed. The rig aligns with the primary flow direction (2D, x-z plane).

---

## Coordinate System

```
Origin:    hook position
+x:        downstream (flow direction)
+z:        upward (opposite gravity)
s:         arc length along chain (s=0 at hook, increasing toward rod tip)
t̂(s):      unit tangent vector, points from hook toward rod tip
θ(s):      line angle from horizontal, θ = atan2(T_z, −T_x)
T(s):      tension vector = T(s) · t̂(s)
```

---

## Physical Constants

| Symbol | Value | Units | Source |
|--------|-------|-------|--------|
| ρ_water | 1000 | kg/m³ | Fresh water, 20°C |
| g | 9.81 | m/s² | Standard gravity |
| κ | 0.41 | — | von Kármán constant |
| C_Dn | 1.0 | — | Smooth cylinder crossflow |
| C_Dt | 0.02 | — | Smooth cylinder skin friction |
| ν | 1.0×10⁻⁶ | m²/s | Kinematic viscosity |
---

## Rig Configurations

### Sliding weight

```
rod tip → mainline → WEIGHT (can slide on mainline) → [4mm bead] → swivel → leader → corky2 → corky1 → bead → yarn → hook
```

### 3-way swivel (T-junction)

```
rod tip → mainline → T-junction → WEIGHT
                                  → leader → corky2 → corky1 → bead → yarn → hook
```

At the T-junction, mainline tension balances: weight's submerged mass + leader tension's vertical component.

---

## Governing Equations

### Line Segments (distributed)

Per unit arc length:

| Force | Formula | Direction |
|-------|---------|-----------|
| Weight | −ρ_line · g · π(d/2)² | −z |
| Buoyancy | +ρ_water · g · π(d/2)² | +z |
| Drag (normal) | ½ · ρ_water · C_Dn · d · (V·sin θ)² | angle-dependent |
| Drag (tangential) | ½ · ρ_water · C_Dt · d · (V·cos θ)² | angle-dependent |

### Point Elements

At each element (hook, corky, bead, weight, yarn):

```
T_above = T_below − F_element

where:
  F_element_x = ½ · ρ_water · C_D · A · V(z)²
  F_element_z = B_element − m_element · g
  B_element = buoyancy_g / 1000 · g   (from tackle.json)
  m_element = mass_g / 1000           (from tackle.json)
```

### Weight submerged mass

```
m_submerged = oz / 35.274 · (1 − ρ_water / ρ_weight)
```

Where ρ_weight comes from tackle.json weight row `density_g_cm3` × 1000.

---

## Chain Structure

### Sliding weight (ordered hook → rod tip)

| # | Element | Type | Data Source |
|---|---------|------|-------------|
| 1 | HOOK | point | `tackleHookData(hook)` |
| 2 | YARN | point | `tackleYarnBuoyancyG()`, `tackleYarnDragData()` |
| 3 | BEAD | point | `tackleBeadData(bdMat, bdSz)` |
| 4 | CORKY 1 | point | `parseFoam(foam1)` |
| 5 | CORKY 2 | point | `parseFoam(foam2)` |
| 6 | LEADER | segment | length=ldLen, dia=ldDia, ρ=ldLine.density_g_cm3 |
| 7 | WEIGHT | point | `tackleWeightPhysicsData(shape, oz)` + submerged mass |
| 8 | 4mm BEAD | point | hardcoded (mass=0.02g, buoyancy=0.03g, A=0.13cm², Cd=0.47) |
| 9 | MAINLINE | segment | remaining length to surface, dia=mlDia, ρ=mlLine.density_g_cm3 |

### 3-way swivel (same through #6, then T-junction)

| # | Element | Type | Data Source |
|---|---------|------|-------------|
| 7 | T-JUNCTION | branch | — |
| 7a | → WEIGHT | point | same weight properties, hangs straight down |
---

## Numerical Method

### RK4 integration over a segment

For a segment of length L with N=20 sub-steps:

```
state:  y(s) = [T_x(s), T_z(s), x(s), z(s)]
derivative:  dy/ds = [−w_x(θ, V), −w_z_total, T_x/|T|, T_z/|T|]

where:
  θ = atan2(T_z, −T_x)
  V = velocityProfile(z, H, uMax, z0).vMs
  w_x, w_z from Morison equation with angle-dependent drag
```

Standard RK4 step at each sub-step.

### Shooting method for surface boundary

**Unknown:** z_hook (initial hook depth)
**Constraint:** chain reaches z=H (water surface) at arc length L_under ≤ L_total

```
Bisection on z_hook:
  z_lo = 0.05 m
  z_hi = H + 5.0 m

  Iterate:
    Integrate chain from hook at z_mid
    If arc_length > L_total: z_hi = z_mid (too deep)
    If arc_length << L_total: z_lo = z_mid (too shallow)
    If surface reached within 1m tolerance: accept
```

~10 iterations typical.

### Point element step
---

## Data Sources

| Value | Source |
|-------|--------|
| Line density | tackle.json → `density_g_cm3` |
| Line diameter | `pickedLineDiameter()` → tackle.json |
| Corky buoyancy/area/Cd | `parseFoam()` → tackle.json |
| Bead mass/buoyancy/area/Cd | `tackleBeadData()` → tackle.json |
| Hook mass/area/Cd | `tackleHookData()` → tackle.json |
| Yarn buoyancy/drag | `tackleYarnBuoyancyG()`, `tackleYarnDragData()` → tackle.json |
| Weight area/Cd/density | `tackleWeightPhysicsData()` → tackle.json |
| Leader length | Gear form (`ld-len`) |
| Weight setup (sliding/fixed) | Gear form (`weight-setup`) — NEW field |
| Water depth | User/site parameter |
| Surface velocity | `hydraulicVelocity()` |
| Cobble size D₅₀ | Site parameter (default 0.10m, overridable) |
| Deployed line length | User parameter (default 61m / 200ft) |
| Species mouth/holding | `salmon.js` species registry |
| 4mm cushion bead | Hardcoded (standard rigging component) |

---

## Remaining Hardcoded Values

| Value | Justification |
|-------|--------------|
| ρ_water = 1000 | Physical constant |
| g = 9.81 | Physical constant |
| κ = 0.41 | von Kármán constant |
| C_Dn = 1.0 | Literature, Re 200-1000 |
| C_Dt = 0.02 | Literature, skin friction |
| ν = 1e-6 | Physical constant |
| 4mm bead properties | Standard rigging component |
| N=20 (RK4 steps) | Convergence parameter |
| Max shooting iterations = 25 | Convergence parameter |

---

## Files Changed

| File | Action | Δ Lines |
|------|--------|---------|
| `src/features/gear-sim/chain.js` | **NEW** — chain solver | +130 |
| `src/features/gear-sim/cable.js` | **DELETE** | −122 |
| `src/features/gear-sim/terminal.js` | **DELETE** | −74 |
| `src/features/gear-sim/sinker.js` | **DELETE** | −101 |
| `src/features/gear-sim/physics.js` | Add `lineNetBuoyancyPerFt()` | +10 |
| `src/features/gear-sim/inputs.js` | Weight submerged mass correction | +8 |
| `src/features/gear-sim/salmon.js` | Species registry | +25 |
| `src/features/gear-sim/interception.js` | Gear mass parameter | +8 |
| `src/features/gear-sim/techniques/drift.js` | Wire chain solver, remove old pipeline | −40, +30 |
| `src/features/gear-sim/hydro.js` | D₅₀ as configurable parameter | +5 |
| `index.html` | Weight Setup field to Row 2, both tabs | ±4 |
| `sanity_pass.js` | Updated GEAR_ORDER, 3-up count | ±4 |
| `solver.js` | weightSetup in readRigFromForm() | +1 |
| `rig.js` | weightSetup in save/restore | +2 |
| `log.js` | weightSetup in catch payload | +1 |
| `sw.js` | SHELL_FILES | ±4 |
| **Net** | | **+220 − 337 = −117** |

---

## Implementation Order

| Step | File | Change | Status |
|------|------|--------|--------|
| 1 | index.html, sanity_pass.js, solver.js, rig.js, log.js | Add Weight Setup dropdown | ✅ DONE |
| 2 | physics.js | Add `lineNetBuoyancyPerFt()` | ✅ DONE |
| 3 | inputs.js | Weight submerged mass in `tackleWeightPhysicsData()` | ✅ DONE |
| 4 | salmon.js | Species registry (Chinook, Steelhead, Coho) | ⬜ |
| 5 | interception.js | Accept gear mass as parameter | ⬜ |
| 6 | hydro.js | D₅₀ as configurable parameter | ⬜ |
| 7 | chain.js | **NEW** — chain solver (RK4 + shooting + air catenary) | ⬜ |
| 8 | drift.js | Wire chain solver, remove cable/terminal/sinker calls | ⬜ |
| 9 | DELETE cable.js, terminal.js, sinker.js | ⬜ |
| 10 | index.html, sw.js | Update script tags, SHELL_FILES, version | ⬜ |
| 11 | Sanity tests for chain solver, re-pin baselines | ✅ DONE |

---

## Verification

1. **Unit tests:** RK4 component, force accumulation, Morison drag, line net buoyancy
2. **Baseline:** Identical rig through classic model and chain solver; hook depth within 10-15%
3. **Degenerate cases:** Zero current -> chain hangs straight down; infinite current -> blows horizontal
4. **Grid refinement:** N=10, 20, 40 -> converge to same solution
5. **Parameter sweep:** Leader length, weight, line type -> monotonic, physically sensible
6. **Sanity baselines:** Re-pin 10-15 tests that depend on hookDepthM, interceptionProb, sweepQuality

---

## Assumptions

1. **2D flow** — river flow unidirectional in x-z plane
2. **Steady flow** — time-averaged mean; turbulence via Monte Carlo
3. **Zero bending stiffness** — EI << T·L² for 0.3mm line
4. **No VIV** — time-averaged C_L = 0; VIV amplitude ~0.03mm
5. **No line stretch** — strain <2% for mono, <1% for braid
6. **Uniform segment properties** — segments correspond to distinct components
7. **Surface at z=H** — river slope <0.1% over rig extent
8. **Log-law to full depth** — standard for rough-bed rivers

```
T_x → T_x − F_drag(el)
T_z → T_z − (B(el) − m(el)·g)
pos unchanged
```

### Air catenary (above water)

When the chain reaches z = H with arc length remaining:

```
w_x = 0                              — no drag in air
w_z = −ρ_line · g · π(d/2)²         — weight only (no buoyancy in air)
T_x = constant through air segment

Position (closed-form catenary):
  x(s) = x_s + (T_x / |w_z|) · [arsinh((T_zs − w_z·s) / |T_x|) − arsinh(T_zs / |T_x|)]
  z(s) = H + (1/w_z) · [√(T_x² + T_zs²) − √(T_x² + (T_zs − w_z·s)²)]
```

Rod tip is at s = L_air = L_total − L_underwater.
| 7b | → MAINLINE | segment | from swivel to surface |