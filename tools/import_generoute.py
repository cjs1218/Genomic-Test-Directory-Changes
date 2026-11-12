#!/usr/bin/env python3
"""Import a release already parsed by GeneRoute's Test Directory Explorer (test-directory-explorer/data/directory.js)
into sources/parsed/<id>.json, so a release whose spreadsheet is no longer published can still be compared.

Usage: python3 tools/import_generoute.py <path to GeneRoute directory.js> <release id>"""
import json, os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


def main():
    path, rid = sys.argv[1], sys.argv[2]
    src = open(path, encoding='utf-8').read()
    tdx = json.loads(re.search(r'const TDX = (\{.*\});\s*$', src, re.S).group(1))
    inds = []
    for e in tdx['indications']:
        e = dict(e)
        e['tests'] = [{k: v for k, v in t.items() if v not in ('', None)} | {'panels': t.get('panels', [])} for t in e['tests']]
        inds.append(e)
    m = tdx['meta']
    out = {'id': rid, 'meta': {'sheetVersion': m.get('directory', ''), 'pdfVersion': m.get('criteria', ''),
                               'changeColumn': m.get('changeColumn', ''), 'importedFrom': 'GeneRoute ' + os.path.basename(path)},
           'changeLog': [], 'indications': inds, 'problems': []}
    os.makedirs(os.path.join(ROOT, 'sources', 'parsed'), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, 'sources', 'parsed', rid + '.json'), 'w'), ensure_ascii=False, indent=0)
    print(f'{rid}: {len(inds)} indications imported ({m.get("directory")}, criteria {m.get("criteria")})')


if __name__ == '__main__':
    main()
