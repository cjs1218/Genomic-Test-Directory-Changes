#!/usr/bin/env python3
"""Parse one published release of the rare and inherited disease National Genomic Test Directory into
sources/parsed/<id>.json.

A release is one entry in sources/manifest.json: the directory spreadsheet (.xlsx) and the eligibility criteria
document (.pdf) published together. The output has the same shape as GeneRoute's Test Directory Explorer data
(tools/update-explorer.py there), so both tools read the directory the same way.

Older releases (2018-2021) lay out the spreadsheet and PDF differently. Column names are matched by the aliases in
COLUMNS; when the PDF has no criteria section for a code, criteria from a spreadsheet criteria column are used if there is
one. Everything that could not be matched is listed at the end and saved in the output's "problems" list, so check the
output of every historic release by eye before committing it.

Usage: python3 tools/parse_version.py <release id>       (one release from the manifest)
       python3 tools/parse_version.py --all              (every release whose files are present)
Needs python3 with openpyxl and pdftotext (poppler)."""
import argparse, json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openpyxl
from extract_criteria import lines, heading, extract, FOOTER

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SOURCES = os.path.join(ROOT, 'sources')
PARSED = os.path.join(SOURCES, 'parsed')

# Spreadsheet columns: key -> header names seen across releases (compared lower-case, spaces collapsed).
COLUMNS = {
    'ci': ['clinical indication id', 'clinical indication code', 'ci id', 'ci code', 'indication id'],
    'id': ['test id', 'test code'],
    'name': ['clinical indication', 'clinical indication name', 'clinical indication title'],
    'target': ['target/genes', 'targets/genes', 'target genes', 'target', 'targets', 'genes'],
    'method': ['test method', 'method', 'test method interim'],  # 2018-19: interim = what labs offered then
    'planned': ['test method phase 3'],  # 2018-19: the method planned once WGS was in place
    'commissioning': ['commissioning category', 'commissioning'],
    'group': ['specialist test group', 'test group', 'specialist service group', 'clinical group'],
    'family': ['optimal family structure'],
    'comment': ['comments'],
    'part': ['part in the eligibility criteria document', 'part'],
    'scope': ['test scope', 'scope', 'scope(s)'],
    'criteria': ['eligibility criteria', 'testing criteria', 'eligibility criteria for testing'],
}
REQUIRED = ['ci', 'id', 'name']
SECTIONS = ['Testing Criteria', 'Overlapping indications', 'Where in Pathway', 'Requesting Specialties',
            'Specialist Service Group', 'Associated Tests']
FAMILY_WORDS = re.compile(r'(?i)\(?(singleton|trio|duo|parents|only|other|or|accepted|when|necessary|multiple|affected|individuals|3|generations)\)?')
CODE = re.compile(r'^R\d+$')
TEST = re.compile(r'^R\d+\.\d+$')


def clean(v):
    return re.sub(r'\s+', ' ', str(v)).strip() if v is not None else ''


def tidy_method(m):
    m = clean(m)
    return re.sub(r'\b(Small|Medium|Large) Panel\b', lambda x: x.group(1) + ' panel', m[:1].upper() + m[1:]) \
        .replace('Highly specialised', 'Highly Specialised')


def norm_head(h):
    return re.sub(r'\s+', ' ', clean(h).lower())


def find_table(wb):
    """(worksheet, header row number, {key: column index}, change column header) for the rare disease indications table."""
    best = None
    for ws in wb.worksheets:
        for n, row in enumerate(ws.iter_rows(max_row=15, values_only=True), start=1):
            heads = [norm_head(c) for c in row]
            col = {}
            for key, names in COLUMNS.items():
                for i, h in enumerate(heads):
                    if h in names and key not in col: col[key] = i
            if all(k in col for k in REQUIRED):
                change = next((clean(row[i]) for i, h in enumerate(heads) if h.startswith('changes') or h.startswith('amendments') or h == 'change'), None)
                score = len(col) + (5 if 'r&id' in ws.title.lower() or 'rare' in ws.title.lower() else 0)
                if not best or score > best[0]: best = (score, ws, n, col, change)
                break
    if not best: sys.exit('No sheet has the columns ' + ', '.join(COLUMNS[k][0] for k in REQUIRED))
    return best[1:]


MONTH = r'(January|February|March|April|May|June|July|August|September|October|November|December)'


def sheet_version(wb):
    """Version and date written on the spreadsheet's front sheet, e.g. 'v9 (8 April 2026)', 'v8.1 (9 July 2025)',
    'v3 (April 2022)' or 'October 2018', or ''."""
    for ws in wb.worksheets[:1]:
        for row in ws.iter_rows(max_row=5, values_only=True):
            for c in row or []:
                t = clean(c)
                m = re.search(rf'(\d{{1,2}})(?:st|nd|rd|th)? {MONTH} (20\d\d)\W+(?:v|version )([\d.]+)', t, re.I)
                if m: return f'v{m.group(4).rstrip(".").removesuffix(".0")} ({m.group(1)} {m.group(2)} {m.group(3)})'
                m = re.search(rf'\bv([\d.]+),? (?:(\d{{1,2}})(?:st|nd|rd|th)? )?{MONTH} (20\d\d)', t, re.I)
                if m: return f'v{m.group(1).rstrip(".")} ({(m.group(2) + " ") if m.group(2) else ""}{m.group(3)} {m.group(4)})'
                m = re.search(rf'{MONTH} (20\d\d)(?: (v[\d.]+))?', t)
                if m: return (m.group(3) + ' ' if m.group(3) else '') + f'({m.group(1)} {m.group(2)})' if m.group(3) else f'{m.group(1)} {m.group(2)}'
    return ''


def read_sheet(path, problems):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws, hrow, col, change = find_table(wb)
    head = next(ws.iter_rows(min_row=hrow, max_row=hrow, values_only=True))
    change_i = next((i for i, h in enumerate(head) if change and clean(h) == change), None)
    for key in COLUMNS:
        if key not in col and key not in ('criteria', 'scope', 'family', 'planned', 'comment'): problems.append(f'spreadsheet: no {key} column')
    rows, last_ci = [], None
    for r in ws.iter_rows(min_row=hrow + 1, values_only=True):
        g = lambda k: clean(r[col[k]]) if k in col and col[k] < len(r) else ''
        raw = r[col['criteria']] if 'criteria' in col and col['criteria'] < len(r) and r[col['criteria']] is not None else ''
        crit_lines = '\n'.join(clean(x) for x in str(raw).splitlines() if clean(x))
        ci, tid = g('ci'), g('id')
        if not ci and TEST.match(tid): ci = tid.split('.')[0]  # merged cells in older sheets
        if not ci and tid and last_ci: ci = last_ci
        if not CODE.match(ci): continue
        last_ci = ci
        rows.append({'ci': ci, 'id': tid, 'name': g('name'), 'target': g('target'), 'method': tidy_method(g('method')),
                     'commissioning': tidy_method(g('commissioning')), 'group': g('group'), 'part': g('part'),
                     'scope': g('scope'), 'family': g('family'), 'planned': tidy_method(g('planned')), 'comment': g('comment'),
                     'sheetCriteria': crit_lines,
                     'change': clean(r[change_i]) if change_i is not None and change_i < len(r) else ''})
    return sheet_version(wb), change, rows


def pdf_version(L):
    for _, l in L[:400]:
        m = re.search(r'(\d{1,2})(?:st|nd|rd|th)? ([A-Z][a-z]+) (20\d\d) v([\d.]+)\s*$', l.strip())
        if m: return f'v{m.group(4)} ({m.group(1)} {m.group(2)} {m.group(3)})'
    return ''


def block(L, start, codes_at):
    end = min([i for i in codes_at if i > start] + [len(L)])
    for k in range(start + 1, end):
        if re.match(r'^(Part [IVXL]+\.|Change Log for)', L[k][1].strip()): end = k; break
    return [(pn, l) for pn, l in L[start:end] if l.strip() and not re.fullmatch(r'\d{1,3}', l.strip()) and not FOOTER.search(l.strip())]


def bullets(seg, short=False):
    items, notes, ind = [], [], None
    for _, l in seg:
        s = l.strip()
        if s.startswith('Referrals for testing will') or s.startswith('Please note'): break
        b = re.match(r'^[•\-−·]\s*(.*)$', s)
        here = len(l) - len(l.lstrip())
        if short:
            t = b.group(1) if b else s
            if t.startswith('*') or re.match(r'For R\d', t): notes.append(t)
            elif items and not b and (items[-1].endswith(',') or t[:1].islower()): items[-1] += ' ' + t
            else: items.append(t)
            continue
        if b: items.append(b.group(1)); ind = here
        elif items and ind is not None and here > ind and not notes: items[-1] += ' ' + s
        elif not items and not notes and ind is None and not s.startswith('*'): items.append(s)
        else: notes.append(s)
    tidy = lambda xs: [re.sub(r'\s+', ' ', x).strip() for x in xs if x.strip()]
    return tidy(items), tidy(notes)


SECTION = re.compile(r'^(%s)(?: for ([\w -]+?))?(?: \(see next page\)| [–-] next page)?$' % '|'.join(SECTIONS))


def sections(seg):
    found, cur = {}, None
    for pn, l in seg:
        m = SECTION.match(l.strip())
        if m: cur = m.group(1) + ('|' + m.group(2) if m.group(2) else ''); found[cur] = []; continue
        if cur: found[cur].append((pn, l))
    return found


def table(seg):
    """Associated Tests table -> {test id: {family, scope}} using the header's column positions."""
    out, cols, cur = {}, None, None
    for _, l in seg:
        if re.match(r'^\s*Code\s+Name\s+Optimal', l):
            names = [r'Code', r'Name', r'Optimal', r'Scope\(s\)', r'Target(?! Name)', r'Target Name', r'Method']
            found = [re.search(n, l) for n in names]
            cols = [m.start() if m else 10 ** 6 for m in found]; cur = None; continue
        if not cols or l.strip() in ('Structure', 'Family', 'Family Structure'): continue
        m = re.match(r'^\s*(R\d+\.\d+)\b', l)
        if m: cur = out.setdefault(m.group(1), {k: '' for k in ('family', 'scope')})
        if not cur: continue
        for word in re.finditer(r'\S+', l):
            k = max([i for i, c in enumerate(cols) if c <= word.start() + 2] or [0])
            key = {2: 'family', 3: 'scope'}.get(k)
            if key: cur[key] = (cur[key] + ' ' + word.group(0)).strip()
    for v in out.values():
        w = re.sub(r'\s*\(\s*', ' (', v['family']).split()
        while w and not FAMILY_WORDS.fullmatch(w[0]): w.pop(0)
        while w and not FAMILY_WORDS.fullmatch(w[-1]): w.pop()
        ok = w and all(FAMILY_WORDS.fullmatch(x) for x in w) and w[0].lower() not in ('or', 'only')
        v['family'] = ' '.join(w) if ok else ''
        v['scope'] = re.sub(r'\s*,\s*', ', ', v['scope']).strip(' ,;')
        if re.search(r'\b(loci|genes?|[Pp]anel|interval|of)\b', v['scope']): v['scope'] = ''
    return out


def change_log(L):
    """The PDF's closing change log, as plain lines (kept so the app can show it next to each release)."""
    for i, (_, l) in enumerate(L):
        if re.match(r'^\s*Change Log for', l):
            return [s for s in (re.sub(r'\s+', ' ', x).strip() for _, x in L[i:]) if s and not FOOTER.search(s) and not re.fullmatch(r'\d{1,3}', s)]
    return []


def parse(rel):
    problems = []
    files = rel.get('files', {})
    xlsx = os.path.join(SOURCES, 'files', files['xlsx']) if files.get('xlsx') else None
    pdf = os.path.join(SOURCES, 'files', files['pdf']) if files.get('pdf') else None
    if not xlsx or not os.path.exists(xlsx): sys.exit(f'{rel["id"]}: spreadsheet not found ({files.get("xlsx")})')
    sheet_ver, change_col, rows = read_sheet(xlsx, problems)
    L = []
    if pdf and os.path.exists(pdf):
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(['pdftotext', '-layout', pdf, os.path.join(tmp, 't.txt')], check=True)
            L = lines(open(os.path.join(tmp, 't.txt'), encoding='utf-8', errors='replace').read())
    else:
        problems.append('no eligibility criteria PDF: criteria come from the spreadsheet only')

    order = list(dict.fromkeys(r['ci'] for r in rows))
    crit = extract(L, order, log=open(os.devnull, 'w')) if L else {}
    starts = {c: heading(L, c)[0] for c in order if L and heading(L, c)}
    at = sorted(starts.values())
    inds = []
    for c in order:
        tests = [r for r in rows if r['ci'] == c]
        e = {'code': c, 'name': next((t['name'] for t in tests if t['name']), ''), 'part': tests[0]['part'], 'group': tests[0]['group'],
             'change': '; '.join(dict.fromkeys(t['change'] for t in tests if t['change'] and t['change'].lower() != 'no change'))}
        tbl = {}
        if c in starts:
            sec = sections(block(L, starts[c], at))
            e['page'] = crit[c]['page']
            e['criteria'] = crit[c]['items']
            e['overlapping'] = sum(bullets(sec.get('Overlapping indications', [])), [])
            e['pathway'] = ' '.join(l.strip() for _, l in sec.get('Where in Pathway', []))
            e['specialties'], notes = bullets(sec.get('Requesting Specialties', []), True)
            if notes: e['specialtyNotes'] = notes
            e['serviceGroup'] = bullets(sec.get('Specialist Service Group', []), True)[0]
            tbl = table(sec.get('Associated Tests', []))
        else:
            sheet_crit = next((t['sheetCriteria'] for t in tests if t['sheetCriteria']), '')
            if sheet_crit:
                e['criteria'] = [[0, '', s] for s in sheet_crit.split('\n') if s]
                e['criteriaSource'] = 'spreadsheet'
            elif L:  # without a PDF this is expected, and noted once above
                problems.append(f'{c}: no criteria found')
        e['tests'] = []
        for t in tests:
            panels = [int(p) for p in re.findall(r'\((\d+)\)', t['target'])]
            x = {k: t[k] for k in ('id', 'target', 'method', 'commissioning', 'group')}
            x['panels'] = panels
            x.update({k: v for k, v in tbl.get(t['id'], {}).items() if v})
            if t['scope'] and not x.get('scope'): x['scope'] = t['scope']
            if t['family'] and not x.get('family'): x['family'] = t['family']
            if t['planned'] and t['planned'] != t['method']: x['planned'] = t['planned']
            if t['comment']: x['comment'] = t['comment']
            if t['change'] and t['change'].lower() != 'no change': x['change'] = t['change']
            if c in starts and t['id'] not in tbl: problems.append(f'{t["id"]}: not in the PDF Associated Tests table')
            e['tests'].append(x)
        inds.append(e)
    inds.sort(key=lambda e: int(e['code'][1:]))
    in_pdf = {m.group(1) for _, l in L for m in [re.match(r'^\s*(R\d+)\s+[A-Z]', l)] if m and '....' not in l}
    for c in sorted(in_pdf - set(order), key=lambda c: int(c[1:])):
        if heading(L, c): problems.append(f'{c}: in the PDF but not in the spreadsheet')
    meta = {'sheetVersion': sheet_ver, 'pdfVersion': pdf_version(L) if L else '', 'changeColumn': change_col or ''}
    return {'id': rel['id'], 'meta': meta, 'changeLog': change_log(L) if L else [], 'indications': inds, 'problems': problems}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*'); ap.add_argument('--all', action='store_true')
    a = ap.parse_args()
    manifest = json.load(open(os.path.join(SOURCES, 'manifest.json')))
    rels = [r for r in manifest['releases'] if a.all or r['id'] in a.ids]
    if a.all: rels = [r for r in rels if r.get('files', {}).get('xlsx') and os.path.exists(os.path.join(SOURCES, 'files', r['files']['xlsx']))]
    if not rels: sys.exit('Nothing to parse: name a release id from sources/manifest.json, or add its files first.')
    os.makedirs(PARSED, exist_ok=True)
    for rel in rels:
        out = parse(rel)
        json.dump(out, open(os.path.join(PARSED, rel['id'] + '.json'), 'w'), ensure_ascii=False, indent=0)
        n = len(out['indications'])
        print(f'{rel["id"]}: {n} indications, {sum(len(e["tests"]) for e in out["indications"])} tests; '
              f'spreadsheet says {out["meta"]["sheetVersion"] or "?"}, PDF says {out["meta"]["pdfVersion"] or "?"}')
        for p in out['problems'][:60]: print('  check:', p)
        if len(out['problems']) > 60: print(f'  … and {len(out["problems"]) - 60} more in the output file')


if __name__ == '__main__':
    main()
