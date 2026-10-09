import sys

with open('docs/PLAN_REFERENCE.md', 'r') as f:
    content = f.read()

start = content.find('<a id="drift-coverage"></a>')
end = content.find('<a id="drift-flow-rec"></a>')
if start >= 0 and end > start:
    before = content[:start].rstrip()
    after = content[end:]
    new_content = before + '\n\n\n' + after
    with open('docs/PLAN_REFERENCE.md', 'w') as f:
        f.write(new_content)
    print('Removed', end - start, 'bytes')
else:
    print(f'start={start} end={end}')
    sys.exit(1)