// tools/panel_history.py: a super panel lists a gene once per child panel; the gene keeps its best rating.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path'), { execFileSync } = require('child_process');

test('panel ratings: best rating wins for a gene listed more than once', () => {
  const code = `
import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..', 'tools'))})
import panel_history as ph
g = lambda s, l: {'gene_data': {'gene_symbol': s}, 'confidence_level': l}
d = {'genes': [g('A', '3'), g('A', '1'), g('B', '1'), g('B', '2'), g('C', '0'), g('D', '2'), g('D', '3')],
     'strs': [{'entity_name': 'X', 'confidence_level': '3'}], 'regions': []}
print(json.dumps(ph.ratings(d)))`;
  const r = JSON.parse(execFileSync('python3', ['-c', code], { encoding: 'utf8' }));
  assert.deepEqual(r, { A: 'G', B: 'A', C: 'R', D: 'G', 'X (STR)': 'G' });
});
