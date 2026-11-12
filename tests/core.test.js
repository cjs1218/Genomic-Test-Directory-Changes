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

test('month-only releases show the month, and a same-month visit is flagged', () => {
  const R = [{ id: 'a', label: '2018/19', published: '2018-10-01', datePrecision: 'month' }, { id: 'b', label: 'v4', published: '2022-10-31' }];
  assert.equal(C.relDate(R[0]), 'October 2018');
  assert.equal(C.relDate(R[1]), '31 October 2022');
  assert.ok(C.sameMonthUnsure(R[0], '2018-10-12'));
  assert.ok(!C.sameMonthUnsure(R[0], '2018-11-12'));
  assert.ok(!C.sameMonthUnsure(R[1], '2022-10-31'));
  const s = C.summary({ code: 'R1', seen: '2018-10-12', relA: R[0], relB: R[1], releases: R, events: [], entA: { name: 'X' }, entB: { name: 'X' }, links: [], genes: [] });
  assert.match(s, /2018\/19 \(published October 2018\)/);
  assert.match(s, /exact publication day is not stated/);
});

test('a panel the earlier tests did not use is not reported as unsigned', () => {
  const R = [{ id: 'a', label: 'A', published: '2019-03-01' }, { id: 'b', label: 'B', published: '2024-01-01' }];
  const s = C.summary({ code: 'R208', seen: '2019-06-01', relA: R[0], relB: R[1], releases: R, events: [], entA: { name: 'X' }, entB: { name: 'X' }, links: [],
    genes: [{ panel: 635, name: 'Inherited breast cancer', a: null, b: { v: '3.2', date: '2026-08-12', genes: new Set(['BRCA1']) }, inA: false, inB: true, diff: { added: [], removed: [] } }] });
  assert.match(s, /then panel not used for this code/);
  assert.doesNotMatch(s, /then no GMS signed-off/);
});

test('retired codes: documented replacement cites its source; no replacement says so', () => {
  const R = [{ id: 'a', label: 'v2', published: '2021-01-01' }, { id: 'b', label: 'v3', published: '2022-04-01' }];
  const base = { seen: '2021-06-01', relA: R[0], relB: R[1], releases: R, entA: { name: 'Old' }, entB: undefined, genes: [], events: [{ r: 'b', k: ['removed'] }] };
  const s1 = C.summary({ ...base, code: 'R34', links: [{ from: 'R34', to: ['R32 (Retinal disorders)'], note: 'now within the scope of R32', source: 'NHS England change log, v3 (April 2022) eligibility criteria' }] });
  assert.match(s1, /Replaced by R32 \(Retinal disorders\) – now within the scope of R32 \(NHS England change log, v3/);
  const s2 = C.summary({ ...base, code: 'R398', links: [{ from: 'R398', to: [], note: 'Retired; the directory names no replacement code', source: 'NHS England change log, v3' }] });
  assert.match(s2, /Retired; the directory names no replacement code \(NHS England change log, v3\)\./);
  const s3 = C.summary({ ...base, code: 'R59', links: [{ from: 'R59', to: ['R27'], note: 'x', source: 'confirmed by the clinical team' }] });
  assert.doesNotMatch(s3, /clinical team/, 'internal confirmations are not quoted in a reply');
});
