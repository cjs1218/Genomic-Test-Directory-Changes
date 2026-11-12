// Logic tests: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/core.js');

const rebuild = (ops, side) => ops.filter(o => o[0] === 0 || o[0] === side).map(o => o[1]).join('');

test('release in force on a date', () => {
  const R = [{ id: 'v1', published: '2019-01-01' }, { id: 'v2', published: '2021-05-01', inForceFrom: '2021-06-01' }];
  assert.equal(C.releaseAt(R, '2018-12-31'), null);
  assert.equal(C.releaseAt(R, '2019-01-01').id, 'v1');
  assert.equal(C.releaseAt(R, '2021-05-15').id, 'v1', 'published but not yet in force');
  assert.equal(C.releaseAt(R, '2021-06-01').id, 'v2');
});

test('word differences rebuild both texts exactly', () => {
  const words = ['breast', 'cancer', 'age', '<40', 'OR', ',', ' ', '\n', 'ovarian'];
  for (let i = 0; i < 2000; i++) {
    const r = () => Array.from({ length: Math.random() * 25 | 0 }, () => words[Math.random() * words.length | 0]).join(' ');
    const a = r(), b = r();
    for (const ops of [C.diffText(a, b), C.diffLines(a, b)]) {
      assert.equal(rebuild(ops, -1), a); assert.equal(rebuild(ops, 1), b);
    }
  }
});

test('a changed threshold shows as one small edit', () => {
  const ops = C.diffText('Breast cancer (age <40 years), OR', 'Breast cancer (age <45 years), OR');
  assert.deepEqual(ops.filter(o => o[0] !== 0), [[-1, '40'], [1, '45']]);
});

test('an added criterion stays a whole line', () => {
  const ops = C.diffLines('a. one, OR\nb. two', 'a. one, OR\nb. two, OR\nc. Male breast cancer at any age');
  const ins = ops.filter(o => o[0] === 1).map(o => o[1]).join('');
  assert.match(ins, /c\. Male breast cancer at any age/);
  assert.ok(!ops.some(o => o[0] === -1 && /one/.test(o[1])));
});

test('genes at a date follow the sign-offs', () => {
  const p = { signoffs: [{ v: '1.0', date: '2020-02-01', add: ['A', 'B'], rem: [] }, { v: '2.0', date: '2022-01-01', add: ['C'], rem: ['A'] }] };
  assert.equal(C.panelAt(p, '2019-12-31'), null);
  assert.deepEqual([...C.panelAt(p, '2021-01-01').genes].sort(), ['A', 'B']);
  const now = C.panelAt(p, '2026-01-01');
  assert.equal(now.v, '2.0');
  assert.deepEqual(C.setDiff(C.panelAt(p, '2021-01-01').genes, now.genes), { added: ['C'], removed: ['A'] });
});

test('summary dates each change and handles a retired code', () => {
  const releases = [{ id: 'v1', label: 'v1', published: '2019-01-01' }, { id: 'v2', label: 'v2', published: '2020-06-01' }, { id: 'v3', label: 'v3', published: '2022-03-01' }];
  const s = C.summary({ code: 'R1', seen: '2019-05-05', relA: releases[0], relB: releases[2], releases,
    events: [{ r: 'v2', k: ['criteria'] }, { r: 'v3', k: ['tests'], d: ['R1.2 added: WGS (WGS)'] }],
    entA: { name: 'Thing', criteria: [] }, entB: { name: 'Thing', criteria: [] }, links: [], genes: [] });
  assert.match(s, /Seen on 5 May 2019: .* v1 \(published 1 January 2019\)/);
  assert.match(s, /changed in 2 of the 2 versions/);
  assert.match(s, /v2 \(1 June 2020\): eligibility criteria changed/);
  assert.match(s, /v3 \(1 March 2022\): tests changed \(R1\.2 added/);
  const gone = C.summary({ code: 'R9', seen: '2019-05-05', relA: releases[0], relB: releases[2], releases,
    events: [{ r: 'v2', k: ['removed'] }], entA: { name: 'Old' }, entB: undefined, links: [{ from: 'R9', to: ['R10'], auto: true }], genes: [] });
  assert.match(gone, /R9 is not in v3: it was removed in v2/);
  assert.match(gone, /Possibly replaced by R10/);
});
