#!/usr/bin/env python3
"""Gene ratings (green, amber, red) on each PanelApp panel at every GMS sign-off, so the app can show which genes a
test covered on a given date, and how ratings changed between two dates.

PanelApp records each sign-off as an activity ("Panel version 76.1 has been signed off on 2026-08-12"). The signed-off
version in force on a date is the latest one signed off on or before it; before a panel's first sign-off there is no
signed-off gene list (the app says so).

Downloads are cached in sources/panelapp/<id>.json (a panel version never changes), so re-running only fetches new
sign-offs. Writes data/panels/<id>.js: for each sign-off, the genes that became or stopped being green (add/rem), amber
(aa/ar) and red (ra/rr), starting from an empty panel.

Usage: python3 tools/panel_history.py [--missing] [--all-signed] [panel id …]
       default: every panel named in sources/parsed/; --all-signed: also every panel PanelApp has signed off;
       --missing: only panels not yet downloaded with ratings"""
import concurrent.futures, json, os, re, sys, time, urllib.error, urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
CACHE = os.path.join(ROOT, 'sources', 'panelapp')
OUT = os.path.join(ROOT, 'data', 'panels')
SIGNED_NOW = {}
API = 'https://panelapp.genomicsengland.co.uk/api/v1/panels/'
SIGNED = re.compile(r'Panel version ([\d.]+) has been signed off on (\d{4}-\d\d-\d\d)')
OLD_SIGNED = re.compile(r'^Panel version has been signed off')  # before 2022: the activity carries the version after sign-off


def before(v):
    major, minor = (int(n) for n in v.split('.'))
    return f'{major}.{minor - 1}' if minor > 0 else None


def signed_off_now():
    out, url = {}, API + 'signedoff/'
    while url:
        d = get_json(url)
        for p in d['results']: out[int(p['id'])] = (str(p['version']), (p.get('signed_off') or '')[:10])
        url = d.get('next')
    return out


def get_json(url):
    """GET with a pause between requests; on 429 waits as PanelApp asks (Retry-After) and tries again."""
    req = urllib.request.Request(url, headers={'User-Agent': 'genomic-test-directory-changes (panel history)', 'Accept': 'application/json'})
    for attempt in range(8):
        time.sleep(0.4)
        try:
            with urllib.request.urlopen(req, timeout=180) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 7:
                time.sleep(int(e.headers.get('Retry-After') or 0) or 15 * (attempt + 1)); continue
            raise
        except Exception:
            if attempt >= 3: raise
            time.sleep(5)


def ratings(d):
    """{gene, STR or region: 'G' | 'A' | 'R'} from PanelApp confidence levels (3 green, 2 amber, 1 or 0 red)."""
    out = {}
    for key, name in (('genes', lambda x: x['gene_data']['gene_symbol']), ('strs', lambda x: x['entity_name'] + ' (STR)'),
                      ('regions', lambda x: x['entity_name'] + ' (region)')):
        for x in d.get(key, []):
            out[name(x)] = {'3': 'G', '2': 'A'}.get(str(x.get('confidence_level')), 'R')
    return dict(sorted(out.items()))


def green(d):
    return sorted(k for k, v in ratings(d).items() if v == 'G')


def history(pid):
    path = os.path.join(CACHE, f'{pid}.json')
    old = json.load(open(path)) if os.path.exists(path) else {'signoffs': []}
    have = {s['v']: s for s in old['signoffs']}
    acts = get_json(f'{API}{pid}/activities/')
    acts = acts if isinstance(acts, list) else acts.get('results', [])
    so = {}
    for a in acts:
        m = SIGNED.search(a.get('text') or '')
        if m: so[m.group(1)] = m.group(2)
        elif OLD_SIGNED.match(a.get('text') or '') and before(str(a['panel_version'])):
            so.setdefault(before(str(a['panel_version'])), a['created'][:10])
    if SIGNED_NOW.get(pid) and SIGNED_NOW[pid][1]: so.setdefault(*SIGNED_NOW[pid])
    cur = get_json(f'{API}{pid}/')
    out = {'id': pid, 'name': cur['name'], 'current': str(cur['version']), 'signoffs': []}
    for v, date in sorted(so.items(), key=lambda x: (x[1], [int(n) for n in x[0].split('.')])):
        if v in have and 'ratings' in have[v]: out['signoffs'].append(have[v]); continue
        d = cur if str(cur['version']) == v else get_json(f'{API}{pid}/?version={v}')
        r = ratings(d)
        out['signoffs'].append({'v': v, 'date': date, 'ratings': r, 'green': sorted(k for k, x in r.items() if x == 'G')})
    out['currentRatings'] = ratings(cur)
    out['currentGreen'] = sorted(k for k, x in out['currentRatings'].items() if x == 'G')
    os.makedirs(CACHE, exist_ok=True)
    json.dump(out, open(path, 'w'), indent=0)
    return out


def step(prev, cur):
    """Changes from one set of ratings to the next: green add/rem, amber aa/ar, red ra/rr (empty lists left out)."""
    out = {}
    for lv, (a, r) in (('G', ('add', 'rem')), ('A', ('aa', 'ar')), ('R', ('ra', 'rr'))):
        was = {k for k, v in prev.items() if v == lv}; now = {k for k, v in cur.items() if v == lv}
        if now - was or a in ('add',): out[a] = sorted(now - was)
        if was - now or r in ('rem',): out[r] = sorted(was - now)
    return out


def write(h):
    sos, prev = [], {}
    for s in h['signoffs']:
        cur = s.get('ratings') or {g: 'G' for g in s['green']}
        sos.append({'v': s['v'], 'date': s['date'], **step(prev, cur)})
        prev = cur
    cur = h.get('currentRatings') or {g: 'G' for g in h['currentGreen']}
    obj = {'name': h['name'], 'current': {'v': h['current'], **step(prev, cur)}, 'signoffs': sos}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f'{h["id"]}.js'), 'w') as f:
        f.write('/* PanelApp gene ratings at each GMS sign-off. Generated by tools/panel_history.py; do not edit by hand. */\n'
                f'TDH.addPanel({h["id"]},{json.dumps(obj, separators=(",", ":"))});\n')


def main():
    missing_only = '--missing' in sys.argv
    global SIGNED_NOW
    SIGNED_NOW = signed_off_now()
    ids = [int(x) for x in sys.argv[1:] if x.isdigit()]
    if not ids:
        pdir = os.path.join(ROOT, 'sources', 'parsed')
        for f in os.listdir(pdir):
            for e in json.load(open(os.path.join(pdir, f)))['indications']:
                for t in e['tests']: ids += t.get('panels', [])
        if '--all-signed' in sys.argv: ids += list(SIGNED_NOW)
        ids = sorted(set(ids))

    def has_ratings(i):
        f = os.path.join(CACHE, f'{i}.json')
        if not os.path.exists(f): return False
        h = json.load(open(f))
        return 'currentRatings' in h and all('ratings' in s for s in h['signoffs'])
    if missing_only: ids = [i for i in ids if not has_ratings(i)]
    print(f'{len(ids)} panels')
    failed = []

    def one(pid):
        try:
            h = history(pid); write(h); return pid, len(h['signoffs'])
        except Exception as e:
            return pid, e
    with concurrent.futures.ThreadPoolExecutor(1) as ex:
        for n, (pid, r) in enumerate(ex.map(one, ids), 1):
            if isinstance(r, Exception): failed.append(pid); print(f'  failed {pid}: {r}', file=sys.stderr)
            elif n % 25 == 0: print(f'  {n}/{len(ids)}')
    print('done' + (f'; failed: {failed}' if failed else ''))


if __name__ == '__main__':
    main()
