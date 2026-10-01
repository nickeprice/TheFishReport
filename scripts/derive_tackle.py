#!/usr/bin/env python3
"""Real-unit tackle prototype (task 0). READ-ONLY: touches no app file, deterministic.

Lift in grams-force (gf), drag in gf per foot (gf/ft), heights in inches.
    drag   F = 1/2 rho Cd A v^2
    lift   F = V (rho_water - rho_body)         (negative -> sinks)
LOCKED data: only the line diameters (src/data/tackle.json). Everything else below is
DERIVED from published dimensions + labelled ASSUMPTIONS (marked ASSUME). Nothing here was
weighed. Foam density is unsourced: the report prints the 0.05 / 0.15 / 0.25 spread.

Leader model (closed form, reduces to the old catenary when D=0): uniform downstream line
drag w (gf/ft) along L ft, plus point drag D (float+bead+hook+yarn) and point lift F at the
free end, vertical tension F constant (neutral line):
    h = (F/w) * [asinh((D + w L)/F) - asinh(D/F)]
The mainline sits upstream of the sliding weight, which anchors it, so it adds no leader term.
Usage: python3 scripts/derive_tackle.py
"""
import json
import math
import os

RHO_W = 998.6            # kg/m3 (tackle.json water_density_g_cm3 = 0.9986)
G_PER_N = 1000.0 / 9.80665   # N -> gf
FT, IN, MM = 0.3048, 0.0254, 0.001
CD_LINE = 1.2            # ASSUME cylinder in crossflow, Re ~100-1000; constant
CD_SPHERE = 0.47
CD_YARN = 1.0            # ASSUME bluff bundle
FOAM_RHO = (0.05, 0.15, 0.25)   # ASSUME g/cm3, unsourced

# Published body diameters / lengths, inches (yakimabait, vandamwarehouse, sportco).
CORKY_IN = {'14': 0.25, '12': 0.3125, '10': 0.375, '8': 0.5, '6': 0.625, '4': 0.75}
CHEATER_IN = {'14': 0.25, '12': 0.3125, '10': 0.375, '8': 0.5}
CHEATER_ASPECT = 0.75    # ASSUME teardrop width/length -> ellipsoid pi/6 L W^2

# Hook: Gamakatsu Octopus 1/0 measured (one specimen): 26.3 mm long, ~1.02 mm wire.
HOOK_LEN_MM = {'2/0': 29.0, '1/0': 26.3, '1': 24.0, '2': 22.0}   # ASSUME ladder, +/-
HOOK_WIRE_RATIO = 3.2    # ASSUME wire length = 3.2 x hook length
STEEL = 7.85             # g/cm3
BEAD_RHO = {'hard': 1.18, 'soft': 1.10}   # ASSUME acrylic / silicone
YARN_G_PER_IN = 0.0127   # ASSUME 0.5 g/m acrylic
ACRYLIC = 1.18
YARN_WIDTH_MM = 3.0      # ASSUME loose strand bundle width


def load_line_mm(line_id):
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, '..', 'src', 'data', 'tackle.json')) as fh:
        for it in json.load(fh)['items']:
            if it['id'] == line_id:
                return it['diameter_mm']
    raise SystemExit('unknown line id ' + line_id)


def foam_lift_gf(kind, size, rho):
    if rho >= 0.998:
        raise SystemExit('REFUSED: foam density %.3f >= water (negative lift)' % rho)
    if kind == 'corky':
        d = CORKY_IN[size] * IN
        vol, area = math.pi / 6 * d ** 3, math.pi / 4 * d * d
    else:
        L = CHEATER_IN[size] * IN
        W = L * CHEATER_ASPECT
        vol, area = math.pi / 6 * L * W * W, math.pi / 4 * L * W
    vol_cm3 = vol * 1e6
    return vol_cm3 * (0.9986 - rho), 0.5 * RHO_W * CD_SPHERE * area


def hook_sink_gf(size):
    r = HOOK_LEN_MM[size] / HOOK_LEN_MM['1/0']
    wire_mm = HOOK_LEN_MM[size] * HOOK_WIRE_RATIO
    d_cm = 0.102 * r
    vol = math.pi / 4 * d_cm ** 2 * wire_mm / 10
    area_m2 = (d_cm * 10 * MM) * (HOOK_LEN_MM[size] * MM)   # wire dia x hook length, broadside
    return vol * (STEEL - 0.9986), 0.5 * RHO_W * 1.0 * area_m2


def bead(mat, mm):
    if not mm:
        return 0.0, 0.0
    d = mm * MM
    vol_cm3 = math.pi / 6 * d ** 3 * 1e6
    return -vol_cm3 * (BEAD_RHO[mat] - 0.9986), 0.5 * RHO_W * CD_SPHERE * math.pi / 4 * d * d


def yarn(inches):
    lift = inches * YARN_G_PER_IN * (0.9986 / ACRYLIC - 1.0)
    area = inches * IN * YARN_WIDTH_MM * MM
    return lift, 0.5 * RHO_W * CD_YARN * area


def height_in(lift, leader_ft, w, d):
    if lift <= 0 or w <= 0 or leader_ft <= 0:
        return 0.0
    h = (lift / w) * (math.asinh((d + w * leader_ft) / lift) - math.asinh(d / lift))
    return min(h, leader_ft) * 12


def rig(kind, size, rho, hook, yarn_in, bd, leader_ft, line_mm, v_fps):
    v = v_fps * FT
    lift, f_drag_n = foam_lift_gf(kind, size, rho)
    h_sink, h_drag_n = hook_sink_gf(hook)
    y_lift, y_drag_n = yarn(yarn_in)
    b_lift, b_drag_n = bead(*bd)
    net = lift - h_sink + y_lift + b_lift
    d_gf = (f_drag_n + h_drag_n + y_drag_n + b_drag_n) * v * v * G_PER_N
    w_gf_ft = 0.5 * RHO_W * CD_LINE * line_mm * MM * v * v * FT * G_PER_N
    return net, d_gf, w_gf_ft, height_in(net, leader_ft, w_gf_ft, d_gf)


def main():
    line_mm = load_line_mm('fluoro-generic-12')
    print('REAL-UNIT PROTOTYPE  line fluoro-generic-12 = %.2f mm  Cd_line=%.1f' % (line_mm, CD_LINE))
    print('lift gf (net) | point drag gf | line drag gf/ft | height in   [rho_foam 0.05 / 0.15 / 0.25]')
    rigs = [('corky', '14', '2', 1, None), ('corky', '12', '1', 2, None), ('corky', '10', '1/0', 2, None),
            ('corky', '8', '1/0', 2, None), ('cheater', '10', '1', 2, None), ('corky', '12', '1/0', 2, ('soft', 6))]
    for v_fps in (1.5, 2.44, 3.5):
        print('\n== bottom velocity %.2f ft/s, leader 3 ft ==' % v_fps)
        for kind, size, hook, yin, bd in rigs:
            cells = []
            for rho in FOAM_RHO:
                n, d, w, h = rig(kind, size, rho, hook, yin, bd or ('hard', 0), 3.0, line_mm, v_fps)
                cells.append('%6.3f %5.3f %5.3f %5.1f"' % (n, d, w, h))
            print('%-7s %-2s hook %-3s yarn %d"%s | %s' % (kind, size, hook, yin, ' bead' if bd else '     ', ' | '.join(cells)))


if __name__ == '__main__':
    main()
