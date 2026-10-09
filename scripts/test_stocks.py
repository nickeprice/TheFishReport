import sys, json
sys.path.insert(0, 'api')
from water_report import fetch_report_for_site

report = fetch_report_for_site('12101500', 47.2, -122.3)
if report:
    print('Got %d days' % len(report))
    for day in report[:2]:
        sc = day.get('species_calendar')
        esc = day.get('esc_stocks')
        print('  title=%s calendar=%s esc=%s' % (day.get('title','?'), 'YES' if sc else 'no', 'YES' if esc else 'no'))
        if sc:
            print('    calendar entries: %d' % len(sc))
            for s in sc:
                print('      %s: status=%s progress=%s peak_frac=%s' % (
                    s.get('species','?'), s.get('status_text',''), s.get('progress',''), s.get('peak_frac','')))
        else:
            print('    NO CALENDAR DATA')
        if esc:
            print('    esc stocks keys: %s' % list(esc.keys()))
else:
    print('No report returned')