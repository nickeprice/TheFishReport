import json

with open('public/src/data/regions/washington.js', 'r') as f:
    content = f.read()

start = content.index('{')
end = content.rindex(';')
json_str = content[start:end]

data = json.loads(json_str)
pool = data['discovery_pool']
wbs = data['waterbodies']

print(f'SUCCESS: Valid JSON')
print(f'discovery_pool: {len(pool)} gauges')
print(f'waterbodies: {len(wbs)} entries')

for wb in wbs:
    related = wb.get('related_gauges')
    rc = len(related) if related else 0
    print(f'  {wb[\"id\"]:20s} gauge={wb[\"gauge\"][\"site_id\"]} hours={wb[\"legal_hours\"]} related={rc}')

ids = [wb['id'] for wb in wbs]
dead = [d for d in ['toutle','lewis','kalama'] if d in ids]
if dead:
    print(f'WARNING: Dead rivers still present: {dead}')
else:
    print(f'OK: Dead rivers (toutle/lewis/kalama) removed')