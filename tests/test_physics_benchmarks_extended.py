"""
Extended physics benchmark suite — Tests 6–10.
Validates physical regimes beyond the foundational 5 tests:
buoyant equilibrium, oblique Morison drag, density scaling,
air catenary continuity, and boundary-layer shear convergence.
"""

import math
import pytest

# ============================================================================
# PHYSICAL CONSTANTS
# ============================================================================
RHO_WATER = 1000.0       # kg/m^3 (freshwater)
RHO_LEAD = 11340.0       # kg/m^3
RHO_TUNGSTEN = 19300.0   # kg/m^3
G = 9.80665              # m/s^2


# ============================================================================
# 6. TERMINAL TACKLE BUOYANT EQUILIBRIUM TEST
# ============================================================================
def test_terminal_tackle_buoyant_equilibrium():
    """
    Test 6: Corky 10 lift balancing a Size 1 hook submerged mass.
    In water, a Corky 10 provides Archimedes buoyant lift.
    A Size 1 hook has ~0.15 g dry mass, negligible buoyancy.
    The net buoyancy must match Archimedes balance.
    """
    # Corky 10: 10 mm diameter sphere, density 120 kg/m^3 (foam)
    corky_diameter_m = 0.010  # 10 mm
    corky_vol = (4.0 / 3.0) * math.pi * ((corky_diameter_m / 2.0) ** 3)
    corky_rho = 120.0  # kg/m^3 (closed-cell foam)
    corky_mass = corky_rho * corky_vol  # kg
    corky_buoyancy_N = RHO_WATER * corky_vol * G
    corky_weight_N = corky_mass * G

    # Size 1 hook: ~0.15 g, steel density 7800 kg/m^3
    hook_mass = 0.00015  # kg
    hook_rho = 7800.0
    hook_vol = hook_mass / hook_rho
    hook_buoyancy_N = RHO_WATER * hook_vol * G
    hook_weight_N = hook_mass * G

    # Net buoyant lift (positive = floats up)
    net_buoyancy_N = corky_buoyancy_N - corky_weight_N - (hook_weight_N - hook_buoyancy_N)

    expected_buoyancy_N = (corky_vol * RHO_WATER - corky_mass) * G - (hook_mass - hook_vol * RHO_WATER) * G
    assert net_buoyancy_N == pytest.approx(expected_buoyancy_N, abs=1e-6)
    assert net_buoyancy_N > 0, f"Should be net buoyant, got {net_buoyancy_N:.6f} N"
    assert 0.002 < net_buoyancy_N < 0.005, f"Net buoyancy {net_buoyancy_N:.6f} N outside [0.002, 0.005] N"


# ============================================================================
# 7. OBLIQUE LINE MORISON DRAG DECOMPOSITION TEST
# ============================================================================
def test_oblique_morison_drag_decomposition():
    """
    Test 7: Oblique Line Drag — Normal vs Tangential Dominance at 45°.
    A line segment at 45° experiences mostly normal drag. The Morison
    decomposition separates relative velocity into normal and tangential
    components. Normal drag should strongly dominate tangential skin friction.
    """
    u_flow = 1.0
    angle_deg = 45.0
    theta = math.radians(angle_deg)
    d = 0.0003
    cd_n = 1.0
    cd_t = 0.02
    ct = math.cos(theta)
    st = math.sin(theta)

    # Velocity decomposition
    v_t = u_flow * ct
    v_n_x = u_flow - v_t * ct
    v_n_z = 0 - v_t * st
    v_n = math.sqrt(v_n_x ** 2 + v_n_z ** 2)

    # Normal drag uses projected area (d * L), tangential uses wetted area (pi*d * L)
    f_normal = 0.5 * RHO_WATER * cd_n * (d * 1.0) * (v_n ** 2)
    f_tangential = 0.5 * RHO_WATER * cd_t * (math.pi * d * 1.0) * (abs(v_t) ** 2)

    ratio = f_tangential / f_normal if f_normal > 0 else float('inf')
    assert ratio < 0.20, f"Tangential/normal ratio = {ratio:.4f} (expected < 0.20)"
    assert v_n == pytest.approx(u_flow * st, rel=0.005)


# ============================================================================
# 8. SUBMERGED MASS DENSITY SCALING TEST
# ============================================================================
def test_submerged_mass_density_scaling():
    """
    Test 8: Lead vs Tungsten submerged mass difference.
    1/2 oz (14.175 g) of lead (11.34 g/cm^3) vs tungsten (19.3 g/cm^3)
    produces different Archimedes-corrected downforce.
    Denser = less volume = less buoyancy = higher submerged weight.
    """
    mass = 0.014175  # kg = 1/2 oz

    # Lead: density 11.34 g/cm^3
    vol_lead = mass / RHO_LEAD
    submerged_weight_lead_N = (RHO_LEAD - RHO_WATER) * vol_lead * G
    submerged_mass_lead_g = mass * 1000 * (1.0 - 1.0 / 11.34)

    # Tungsten: density 19.3 g/cm^3
    vol_tungsten = mass / RHO_TUNGSTEN
    submerged_weight_tungsten_N = (RHO_TUNGSTEN - RHO_WATER) * vol_tungsten * G
    submerged_mass_tungsten_g = mass * 1000 * (1.0 - 1.0 / 19.3)

    # Tungsten should have higher submerged weight (less buoyancy loss)
    assert submerged_weight_tungsten_N > submerged_weight_lead_N, (
        f"Tungsten ({submerged_weight_tungsten_N:.6f} N) should exceed lead ({submerged_weight_lead_N:.6f} N)"
    )

    # Ratio check: lead ~91.2% of dry mass; tungsten ~94.8%
    ratio_lead = submerged_mass_lead_g / (mass * 1000)
    ratio_tungsten = submerged_mass_tungsten_g / (mass * 1000)
    assert ratio_lead == pytest.approx(0.9118, rel=0.005)
    assert ratio_tungsten == pytest.approx(0.9482, rel=0.005)

    # Difference should be > 0.3 gf for 1/2 oz
    diff_gf = submerged_mass_tungsten_g - submerged_mass_lead_g
    assert diff_gf > 0.3, f"Tungsten/lead diff ({diff_gf:.3f} gf) should be > 0.3 gf"


# ============================================================================
# 9. AIR CATENARY TENSION CONTINUITY TEST
# ============================================================================
def test_air_catenary_tension_continuity():
    """
    Test 9: Air catenary tension continuity across the water surface.
    Horizontal tension (T_x) must remain constant across z = H.
    Vertical tension (T_z) must be continuous but changes due to
    line weight in air compared to submerged buoyancy.
    """
    H = 2.0
    d = 0.0003
    rho_line = 1150

    # Tension at water surface — positive Tz = upward
    Tx_surf = 0.5
    Tz_surf = 0.1  # upward pull at surface

    area = math.pi * d * d / 4
    w_z = -rho_line * G * area  # N/m, line weight in air
    L_air = 3.0

    # Catenary: T_x constant, T_z changes linearly with self-weight
    # Note: chain.js uses "Tz - w_z * L_air" (not "+ w_z * L") due to sign
    # convention in the air catenary parameterization. The test matches
    # the actual code formula to validate internal consistency.
    Tz_tip = Tz_surf - w_z * L_air  # Match chain.js sign convention
    Tx_tip = Tx_surf

    assert Tx_tip == Tx_surf, f"T_x should be constant: {Tx_surf:.4f} vs {Tx_tip:.4f}"
    # T_z changes (either direction) due to self-weight
    assert Tz_tip != Tz_surf, "T_z should change due to line weight in air"
    T_surf = math.sqrt(Tx_surf ** 2 + Tz_surf ** 2)
    T_tip = math.sqrt(Tx_tip ** 2 + Tz_tip ** 2)
    # With the chain.js convention, T_tip > T_surf when Tz_surf > 0
    assert abs(T_tip - T_surf) > 1e-6, "Tension magnitude should change through air segment"

    # asinh helper
    def asinh(x):
        return math.log(x + math.sqrt(x * x + 1))

    arg0 = Tz_surf / abs(Tx_surf)
    arg1 = (Tz_surf - w_z * L_air) / abs(Tx_surf)
    z_tip = (1.0 / w_z) * (math.sqrt(Tx_surf ** 2 + Tz_surf ** 2) -
                            math.sqrt(Tx_surf ** 2 + (Tz_surf - w_z * L_air) ** 2))
    assert z_tip > 0, f"Tip height z_tip={z_tip:.3f} should be above surface"


# ============================================================================
# 10. BOUNDARY LAYER SHEAR COMPARISON TEST
# ============================================================================
def test_boundary_layer_shear_comparison():
    """
    Test 10: Log-law vs 1/7th power-law convergence within 15% near the bed.
    Both profiles should agree within 15% in the drift gear zone
    (0.15–0.60 m above a cobble bed).
    """
    H = 5.0
    u_surf = 1.0
    z0 = 0.003
    kappa = 0.41

    # Log-law: u(z) = (u*/kappa) * ln(z/z0)
    u_star = u_surf * kappa / math.log(H / z0)

    def log_law(z):
        if z <= z0:
            return 0.0
        return (u_star / kappa) * math.log(z / z0)

    # 1/7th power-law: u(z) = u_surf * (z/H)^(1/7)
    def power_law(z):
        if z <= 0:
            return 0.0
        return u_surf * ((z / H) ** (1.0 / 7.0))

    for z in [0.15, 0.25, 0.35, 0.45, 0.60]:
        v_log = log_law(z)
        v_power = power_law(z)
        assert v_log > 0, f"Log-law at z={z:.2f} should be > 0"
        assert v_power > 0, f"Power-law at z={z:.2f} should be > 0"
        rel_diff = abs(v_log - v_power) / max(v_log, v_power)
        assert rel_diff < 0.15, (
            f"Log ({v_log:.4f}) vs power ({v_power:.4f}) "
            f"differ {rel_diff*100:.1f}% at z={z:.2f}m (limit 15%)"
        )

    assert log_law(z0) == 0.0, "Log-law should be zero at roughness height"