const test = require('node:test');
const assert = require('node:assert');
const path = require('path'), { execFileSync } = require('child_process');

test('parse_version reads an old-style spreadsheet without a PDF', () => {
  const out = JSON.parse(execFileSync('python3', [path.join(__dirname, 'parse_fixture.py')], { encoding: 'utf8' }));
  assert.equal(out.meta.sheetVersion, 'v1.2 (1st October 2019)'.replace('1st', '1'));
  const [r1, r2] = out.indications;
  assert.equal(r1.code, 'R1'); assert.equal(r1.name, 'Alpha');
  assert.deepEqual(r1.tests.map(t => t.id), ['R1.1', 'R1.2'], 'blank merged cell continues R1');
  assert.deepEqual(r1.tests[0].panels, [55]);
  assert.equal(r1.tests[0].method, 'Small panel');
  assert.deepEqual(r1.criteria, [[0, '', 'Age under 40'], [0, '', 'OR family history']]);
  assert.equal(r1.criteriaSource, 'spreadsheet');
  assert.ok(!r2.criteria, 'no criteria invented');
  assert.deepEqual(out.problems.filter(p => /no criteria|PDF/.test(p)), ['no eligibility criteria PDF: criteria come from the spreadsheet only'], 'one note, not one per code');
});
