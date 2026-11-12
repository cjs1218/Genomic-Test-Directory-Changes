"""Run by tests/parse.test.js: an old-style spreadsheet (different column names, merged indication cells, criteria in the
sheet, no PDF) must still parse."""
import json, os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import openpyxl, parse_version as pv

tmp = tempfile.mkdtemp()
os.makedirs(os.path.join(tmp, 'files'))
wb = openpyxl.Workbook()
wb.active.title = 'Cover'; wb.active['A1'] = 'National genomic test directory 1st October 2019 v1.2'
ws = wb.create_sheet('Rare disease')
ws.append(['Clinical Indication ID', 'Clinical Indication Name', 'Test ID', 'Targets', 'Test method', 'Commissioning category', 'Eligibility criteria'])
ws.append(['R1', 'Alpha', 'R1.1', 'Alpha panel (55)', 'small Panel', 'Core', 'Age under 40\nOR family history'])
ws.append([None, None, 'R1.2', 'GENE1', 'Single gene', 'Core', None])
ws.append(['R2', 'Beta', 'R2.1', 'WGS', 'WGS', 'Core', ''])
wb.save(os.path.join(tmp, 'files', 'old.xlsx'))
pv.SOURCES = tmp
out = pv.parse({'id': 'old', 'files': {'xlsx': 'old.xlsx'}})
print(json.dumps(out))
