import json, os, sys
sys.path.insert(0, 'scripts/tools')
from precompute_spot_widths import RIVERS

river_lookup = {r['id']: r for r in RIVERS}
out_dir = 'data/spot_widths'

for f in sorted(os.listdir('data/hydro_measured')):
    if not f.endswith('.json'): continue
    src = os.path.join('data/hydro_measured', f)
    with open(src) as fp:
        d = json.load(fp)
    rid = d.get('id', f[:-5])
    rinfo = river_lookup.get(rid, {})
    d['name'] = rinfo.get('name', rid.replace('_', ' ').title())
    d['site_id'] = rinfo.get('site_id', '00000000')
    dst = os.path.join(out_dir, f)
    with open(dst, 'w') as fp:
        json.dump(d, fp)
    nm = d.get('name', ''); si = d.get('site_id', '')
    print(f'{rid}: name={nm}, site_id={si}')
print('Done')