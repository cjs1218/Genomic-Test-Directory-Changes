// Pipeline test: builds the site data from two small made-up releases in a temporary copy and checks the change log.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');

test('build_site records what changed, and when', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdh-'));
  fs.mkdirSync(path.join(root, 'tools')); fs.mkdirSync(path.join(root, 'sources', 'parsed'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'tools', 'build_site.py'), path.join(root, 'tools', 'build_site.py'));
  const ind = (code, name, crit, tests, extra = {}) => ({ code, name, part: '', group: '', change: '', criteria: crit.map(t => [0, '', t]), tests, ...extra });
  const t = (id, method, panels = []) => ({ id, target: 'Panel', method, commissioning: 'Core', group: '', panels });
  const v1 = [ind('R1', 'Alpha', ['Age < 40'], [t('R1.1', 'Small panel', [5])]), ind('R2', 'Beta disorder', ['x'], [t('R2.1', 'WGS')]), ind('R3', 'Gamma', ['same'], [t('R3.1', 'WGS')])];
  const v2 = [ind('R1', 'Alpha', ['Age < 45'], [t('R1.1', 'WGS', [5]), t('R1.2', 'MLPA')]), ind('R3', 'Gamma  ', ['same'], [t('R3.1', 'WGS')], { change: 'Wording clarified' }), ind('R4', 'Beta disorders', ['see R2'], [t('R4.1', 'WGS')])];
  const write = (id, inds) => fs.writeFileSync(path.join(root, 'sources', 'parsed', id + '.json'), JSON.stringify({ id, meta: {}, indications: inds }));
  write('a', v1); write('b', v2);
  fs.writeFileSync(path.join(root, 'sources', 'manifest.json'), JSON.stringify({ releases: [
    { id: 'b', label: 'B', published: '2021-01-01' }, { id: 'a', label: 'A', published: '2019-01-01' }] }));
  execFileSync('python3', [path.join(root, 'tools', 'build_site.py')], { stdio: 'pipe' });
  const ctx = {};
  new Function('ctx', fs.readFileSync(path.join(root, 'data', 'changes.js'), 'utf8').replace(/const (\w+) =/g, 'ctx.$1 =') + ';')(ctx);
  const rel = {}; new Function('ctx', fs.readFileSync(path.join(root, 'data', 'releases.js'), 'utf8').replace(/const (\w+) =/g, 'ctx.$1 =') + ';')(rel);
  assert.deepEqual(rel.TDH_RELEASES.map(r => r.id), ['a', 'b'], 'ordered by date, not manifest order');
  const ev = c => ctx.TDH_CHANGES[c].events;
  assert.deepEqual(ev('R1')[0].k, ['criteria', 'tests']);
  assert.ok(ev('R1')[0].d.includes('R1.1 method: Small panel → WGS'));
  assert.ok(ev('R1')[0].d.some(d => d.startsWith('R1.2 added')));
  assert.deepEqual(ev('R2')[0].k, ['removed']);
  assert.deepEqual(ev('R4')[0].k, ['added']);
  assert.deepEqual(ev('R3')[0], { r: 'b', k: [], n: 'Wording clarified' }, 'spacing alone is not a change, but the note is kept');
  const link = ctx.TDH_LINKS.find(l => l.from === 'R2');
  assert.deepEqual(link.to, ['R4'], 'R4 mentions R2 and has a similar name');
  assert.ok(fs.existsSync(path.join(root, 'data', 'v', 'a.js')));
});
