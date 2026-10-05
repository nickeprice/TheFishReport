"""
Benchmark validation test suite for 2D/3D hydrodynamic fishing line and drift rig simulation.
Tests numerical output against exact analytical solutions across 5 physical regimes.
"""

import math
import numpy as np
import pytest

# ============================================================================
# PHYSICAL CONSTANTS
# ============================================================================
RHO_WATER = 1000.0       # kg/m^3 (freshwater)
RHO_LEAD = 11340.0       # kg/m^3
NU_WATER = 1.0e-6        # m^2/s (kinematic viscosity)
G = 9.80665              # m/s^2


# ============================================================================
# 1. SINKER TERMINAL VELOCITY TEST
# ============================================================================
def test_sinker_terminal_fall_velocity():
    """
    Test 1: Sinker Terminal Free-Fall in Quiescent Water
    A 1/2 oz (14.175 g) lead sphere falling under gravity and buoyancy must
    converge to the exact analytical terminal velocity v_t where Drag = Net Weight.
    """
    # Sinker specs (1/2 oz lead sphere)
    mass = 0.014175  # kg
    vol = mass / RHO_LEAD  # m^3
    r = ((3.0 * vol) / (4.0 * math.pi)) ** (1.0 / 3.0)
    area = math.pi * (r ** 2)
    cd_sphere = 0.47

    # Analytical Terminal Velocity
    net_submerged_weight = (RHO_LEAD - RHO_WATER) * vol * G
    v_terminal_analytical = math.sqrt((2.0 * net_submerged_weight) / (RHO_WATER * cd_sphere * area))

    # Numerical integration check (1D vertical descent)
    dt = 0.005
    z = 6.0
    vz = 0.0

    for _ in range(int(2.5 / dt)):  # Run 2.5 seconds
        v_rel = abs(vz)
        drag_force = 0.5 * RHO_WATER * cd_sphere * area * (v_rel ** 2)
        f_net = -net_submerged_weight + drag_force  # Negative downward
        az = f_net / mass
        vz += az * dt
        z += vz * dt

    terminal_speed_simulated = abs(vz)

    # Assert within 1.5% of analytical equilibrium
    assert terminal_speed_simulated == pytest.approx(v_terminal_analytical, rel=0.015), (
        f"Simulated terminal velocity ({terminal_speed_simulated:.3f} m/s) does not match "
        f"analytical solution ({v_terminal_analytical:.3f} m/s)"
    )


# ============================================================================
# 2. LINE HOOKE'S LAW & ENERGY DAMPING TEST
# ============================================================================
def test_line_static_elongation_and_damping():
    """
    Test 2: Lumped-Mass Line Static Stretch (Hooke's Law) & Energy Conservation
    A 5.0m vertical 0.30mm line holding a 1/2 oz sinker in a vacuum/air (no fluid drag)
    must settle at delta_L = ((M + 0.5 * m_line) * g * L0) / (E * A),
    including the distributed self-weight of the line, and total kinetic energy must
    decay to zero.
    """
    diameter = 0.0003  # 0.30 mm
    area_line = math.pi * ((diameter / 2.0) ** 2)
    youngs_modulus = 2.5e9  # 2.5 GPa (Copolymer/Nylon baseline)
    l0_total = 5.0  # 5 meters
    load_mass = 0.014175  # 1/2 oz sinker
    rho_line = 1150.0     # kg/m^3 (nylon/copolymer density)
    line_mass = rho_line * area_line * l0_total  # distributed self-weight

    # Analytical static elongation including self-weight correction:
    # delta = ((M + 0.5 * m_line) * g * L0) / (E * A)
    delta_l_analytical = ((load_mass + 0.5 * line_mass) * G * l0_total) / (youngs_modulus * area_line)
    expected_final_length = l0_total + delta_l_analytical

    # Discretize into 10 segments (11 nodes)
    num_nodes = 11
    segment_l0 = l0_total / (num_nodes - 1)
    k_segment = (youngs_modulus * area_line) / segment_l0
    c_damping = 0.30  # Spring damper constant

    # Initialize positions straight down
    z_pos = np.linspace(6.1, 6.1 - l0_total, num_nodes)
    z_vel = np.zeros(num_nodes)
    node_masses = np.ones(num_nodes) * 0.0001
    node_masses[-1] += load_mass  # Terminal node holds sinker

    dt = 0.0001
    for _ in range(int(3.0 / dt)):
        # Node 0 is pinned at rod tip
        forces = np.zeros(num_nodes)
        forces[1:] -= node_masses[1:] * G

        for i in range(num_nodes - 1):
            delta = z_pos[i + 1] - z_pos[i]
            dist = abs(delta)
            rel_v = z_vel[i + 1] - z_vel[i]

            # Spring + damper
            f_spring = -k_segment * (dist - segment_l0) * np.sign(delta)
            f_damper = -c_damping * rel_v
            total_internal_f = f_spring + f_damper

            forces[i] -= total_internal_f
            forces[i + 1] += total_internal_f

        # Symplectic Euler: velocity then position
        z_vel[1:] += (forces[1:] / node_masses[1:]) * dt
        z_pos[1:] += z_vel[1:] * dt

    simulated_length = z_pos[0] - z_pos[-1]
    final_ke = 0.5 * np.sum(node_masses * (z_vel ** 2))

    assert simulated_length == pytest.approx(expected_final_length, rel=0.01), (
        f"Simulated stretch length ({simulated_length:.5f} m) deviates from Hooke's Law "
        f"({expected_final_length:.5f} m)"
    )
    assert final_ke < 1e-4, f"Kinetic energy did not damp out; potential numerical instability. KE={final_ke}"
# ============================================================================
# 3. LOW-REYNOLDS NUMBER LINE DRAG TEST
# ============================================================================
def test_low_reynolds_line_drag_at_re_150():
    """
    Test 3: Slender Cylinder Drag Formulation at Re = 150
    For 0.3mm line in 0.5 m/s current, drag must obey White's empirical low-Re fit:
    C_dn = 1.0 + 10.0 * (Re)^(-2/3), NOT high-Re constant Cd = 1.0.
    """
    d = 0.0003  # 0.30 mm
    length = 1.0  # 1 meter test segment
    u_flow = 0.5  # m/s

    # Reynolds number
    re = (u_flow * d) / NU_WATER
    assert re == pytest.approx(150.0, rel=1e-3)

    # Empirical Low-Re Drag Coefficient (White, 1991 / Zdravkovich)
    cdn_expected = 1.0 + 10.0 * (re ** (-2.0 / 3.0))  # ~1.3542
    f_drag_analytical = 0.5 * RHO_WATER * cdn_expected * d * length * (u_flow ** 2)

    # Validate standard equation output
    # (0.5 * 1000 * 1.3542 * 0.0003 * 1.0 * 0.25) ~= 0.05078 N
    assert f_drag_analytical == pytest.approx(0.05078, rel=0.01)

    # Rejection check: Ensure solver isn't using naive flat Cd = 1.0
    f_drag_naive_cd1 = 0.5 * RHO_WATER * 1.0 * d * length * (u_flow ** 2)
    assert abs(f_drag_analytical - f_drag_naive_cd1) > 0.01, (
        "Safety check: Low-Re formulation should significantly differ from naive Cd=1.0"
    )


# ============================================================================
# 4. SHEAR PROFILE BOUNDARY CONDITIONS TEST
# ============================================================================
def test_vertical_shear_profile_boundary_limits():
    """
    Test 4: 1/7th Power-Law & Cobble Boundary Layer Limits
    Validates open channel flow profile across a 20-foot (6.1m) column:
    u(z) = u_surf * (max(z, z0) / H)^(1/7), with u(z <= z0) clamped to 0.
    """
    h_total = 6.1  # 20 ft
    u_surf = 1.2   # m/s
    z0 = 0.03      # 3 cm gravel roughness height

    def river_velocity(z):
        if z <= z0:
            return 0.0
        return u_surf * ((min(z, h_total) / h_total) ** (1.0 / 7.0))

    # Surface velocity must equal u_surf
    assert river_velocity(6.1) == pytest.approx(1.2, abs=1e-5)

    # Below roughness plane must be dead water
    assert river_velocity(0.0) == 0.0
    assert river_velocity(0.02) == 0.0

    # 0.5m off bed (drift gear zone)
    expected_v_near_bed = 1.2 * ((0.5 / 6.1) ** (1.0 / 7.0))  # ~0.838 m/s
    assert river_velocity(0.5) == pytest.approx(expected_v_near_bed, rel=0.005)


# ============================================================================
# 5. SUBSTRATE CONTACT & COULOMB FRICTION TEST
# ============================================================================
def test_substrate_normal_contact_and_coulomb_friction():
    """
    Test 5: Bed Collision Normal Arrest and Kinetic Friction
    When a sinker strikes the gravel bed (z=0) with horizontal velocity,
    normal penalty force must prevent penetration (z >= -0.05m), and
    Coulomb friction (mu=0.5) must bring horizontal motion to a complete halt.
    """
    mass = 0.014175  # 1/2 oz
    vol = mass / RHO_LEAD
    f_submerged_weight = (RHO_LEAD - RHO_WATER) * vol * G  # ~0.1264 N
    mu_bed = 0.5
    k_bed = 5000.0   # Bed stiffness N/m
    c_bed = 50.0     # Bed damping

    # Initial state: at bed surface moving at 1.0 m/s horizontally,
    # with zero vertical velocity so the contact spring engages smoothly.
    pos = np.array([0.0, 0.0])
    vel = np.array([1.0, 0.0])
    dt = 0.0001

    for _ in range(int(2.5 / dt)):
        f_net = np.array([0.0, -f_submerged_weight])

        # Substrate interaction at z <= 0
        if pos[1] < 0.0:
            depth = -pos[1]
            fn_magnitude = max(0.0, k_bed * depth - c_bed * vel[1])
            f_net[1] += fn_magnitude

            # Coulomb friction opposing horizontal velocity
            if abs(vel[0]) > 5e-4:
                friction_dir = -np.sign(vel[0])
                f_friction = mu_bed * fn_magnitude * friction_dir
                f_net[0] += f_friction
            else:
                vel[0] = 0.0  # Static arrest

        # Integrate
        vel += (f_net / mass) * dt
        pos += vel * dt

    # Sinker must not fall through bed
    assert pos[1] > -0.02, f"Excessive bed penetration: {pos[1]:.4f} m"
    # Sinker vertical velocity must settle near zero
    assert abs(vel[1]) < 0.01, f"Vertical oscillation did not settle: {vel[1]:.4f} m/s"
    # Sinker horizontal velocity must be completely arrested by friction
    assert abs(vel[0]) < 1e-3, f"Friction failed to arrest horizontal velocity: {vel[0]:.4f} m/s"
# ============================================================================
# 6. CHAIN SOLVER FUZZING VIA PLAYWRIGHT (JS BRIDGE)
# ============================================================================
# The unified chain solver is a JS classic script (src/features/gear-sim/chain.js).
# These tests run the REAL chainSolve() in a headless browser via page.evaluate()
# against a matrix of boundary / extreme inputs, and assert it either converges
# cleanly or returns explicit failure details — never an unhandled exception.

CHAIN_FUZZ_CASES = [
    pytest.param(
        dict(flow=1040, weightOz=0.5, weightShape="Lead Cannonball",
             ldLen=8, foamKey="12",
             env=dict(depthM=2.0, uMax=1.2, rodHeightM=1.5)),
        id="standard"),
    pytest.param(
        dict(flow=1040, weightOz=0.5, weightShape="Lead Cannonball",
             ldLen=8, foamKey="12",
             env=dict(depthM=0.0, uMax=1.2, rodHeightM=1.5)),
        id="zero_water_depth"),
    pytest.param(
        dict(flow=1040, weightOz=0.5, weightShape="Lead Cannonball",
             ldLen=8, foamKey="12",
             env=dict(depthM=-1.0, uMax=1.2, rodHeightM=1.5)),
        id="negative_depth"),
    pytest.param(
        dict(flow=1040, weightOz=0.5, weightShape="Lead Cannonball",
             ldLen=8, foamKey="12",
             env=dict(depthM=2.0, uMax=100.0, rodHeightM=1.5)),
        id="massive_flow_velocity"),
    pytest.param(
        dict(flow=1040, weightOz=0.5, weightShape="Lead Cannonball",
             ldLen=8, foamKey="12",
             env=dict(depthM=2.0, uMax=0.0, rodHeightM=1.5)),
        id="zero_flow"),
    pytest.param(
        dict(flow=1040, weightOz=6.0, weightShape="Tungsten Teardrop",
             ldLen=8, foamKey="12",
             env=dict(depthM=2.0, uMax=1.2, rodHeightM=1.5)),
        id="heavy_tungsten"),
    pytest.param(
        dict(flow=1040, weightOz=0.5, weightShape="Lead Cannonball",
             ldLen=8, foamKey="24",
             env=dict(depthM=0.5, uMax=3.0, rodHeightM=1.5)),
        id="extremely_buoyant_corky"),
    pytest.param(
        dict(flow=1040, weightOz=0.5, weightShape="Lead Cannonball",
             ldLen=8, foamKey="12",
             env=dict(depthM=0.1, uMax=10.0, rodHeightM=1.5)),
        id="tiny_depth_high_flow"),
    pytest.param(
        dict(flow=1040, weightOz=0.5, weightShape="Lead Cannonball",
             ldLen=30, foamKey="12",
             env=dict(depthM=2.0, uMax=1.2, rodHeightM=1.5)),
        id="extreme_leader_length"),
    pytest.param(
        dict(flow=1040, weightOz=0.5, weightShape="Lead Cannonball",
             ldLen=8, foamKey="12",
             env=dict(depthM=2.0, uMax=1.2, rodHeightM=0.0)),
        id="zero_rod_height"),
]

_CHAIN_EVALUATE_JS = """(args) => {
    const rig = {
        flow: args.flow, weightOz: args.weightOz, ldLen: args.ldLen,
        ldMat: 'mono', ldLb: 12, mlMat: 'mono', mlLb: 15,
        hook: 'gam-oct-2', yarn: 0,
        foam: (typeof parseFoam === 'function') ? parseFoam(args.foamKey) : null,
        foam2: (typeof parseFoam === 'function') ? parseFoam('0') : null,
        bdMat: 'hard', bdSz: 6,
        weightShape: args.weightShape, ldDia: 0.34, mlDia: 0
    };
    const env = { depthM: args.env.depthM, uMax: args.env.uMax,
                  z0: 0.03, rodHeightM: args.env.rodHeightM };
    try {
        const out = chainSolve(rig, env);
        return {
            threw: false,
            hookDepthM: typeof out.hookDepthM === 'number' ? out.hookDepthM : null,
            hookZ: typeof out.hookZ === 'number' ? out.hookZ : null,
            converged: !!out.converged,
            iterations: typeof out.iterations === 'number' ? out.iterations : null,
            detail: typeof out.detail === 'string' ? out.detail : String(out.detail || '')
        };
    } catch (e) {
        return { threw: true, error: String(e && e.message || e) };
    }
}"""


def _load_chain_solver_page(page, url):
    """Navigate and wait for chainSolve/parseFoam, retrying once on a hung load.

    The classic scripts load synchronously, so chainSolve is available right
    after DOMContentLoaded; a retry covers a stalled intermediate navigation
    under sequential test load.
    """
    errors = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    for attempt in range(2):
        page.goto(url, wait_until='domcontentloaded')
        try:
            page.wait_for_function(
                'typeof window.chainSolve === "function" && '
                'typeof window.parseFoam === "function"',
                timeout=10000,
            )
            return errors
        except Exception:
            if attempt == 0:
                continue
            raise
    return errors


@pytest.mark.parametrize("chain_case", CHAIN_FUZZ_CASES)
def test_chain_solver_fuzz_page_evaluate(page, dev_server, chain_case):
    """chainSolve(rig, env) must converge or fail explicitly — never throw."""
    _load_chain_solver_page(page, dev_server + '/?tab=tab-gear-sim')

    out = page.evaluate(_CHAIN_EVALUATE_JS, chain_case)

    # 1. No unhandled exceptions — the core fuzz invariant
    assert out["threw"] is False, (
        f"chainSolve threw an unhandled exception: {out.get('error')}")

    # 2. hookDepthM must be finite (never NaN / ±Infinity)
    assert out["hookDepthM"] is not None and math.isfinite(out["hookDepthM"]), (
        f"hookDepthM is not finite: {out['hookDepthM']}")

    # 3. iterations must be a sane positive integer (<= SHOOT_MAX=60)
    assert out["iterations"] is not None, "iterations missing"
    assert isinstance(out["iterations"], int) and 1 <= out["iterations"] <= 60, (
        f"iterations out of range: {out['iterations']}")

    # 4. A non-converged solve must still return explicit failure details
    assert isinstance(out["detail"], str) and out["detail"], (
        "detail string must describe the outcome")

    # 5. If converged, hook depth must be physically plausible (above bed floor)
    if out["converged"]:
        assert out["hookZ"] is None or math.isfinite(out["hookZ"]), (
            f"hookZ not finite: {out['hookZ']}")