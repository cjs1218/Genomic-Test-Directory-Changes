// Browser check of the main journeys. Skipped when Playwright isn't installed (npm i -D playwright to run it).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path'), http = require('http'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { /* not installed */ }

function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  return http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
}

test('main journeys work in a browser', { skip: !pw && 'playwright not installed' }, async () => {
  const server = serve(path.join(__dirname, '..')); await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await pw.chromium.launch(); const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base);
    assert.ok(await page.isVisible('#start'), 'start panel shown');
    await page.fill('#code', 'brca1'); await page.waitForSelector('#code-list li');
    const opts = await page.$$eval('#code-list li', ls => ls.map(l => l.dataset.code));
    assert.ok(opts.includes('R208'), 'gene search finds R208');
    await page.click('#code-list li[data-code="R208"]');
    await page.fill('#seen', '2019-06-01'); await page.click('button[type=submit]');
    await page.waitForFunction(() => /Seen on 1 June 2019/.test(document.querySelector('#summary-text')?.textContent || ''));
    const short = await page.textContent('#summary-text');
    assert.match(short, /Then: “Breast cancer \(age < 30 years\), OR”/);
    assert.ok(!(await page.isVisible('#start')), 'start panel hidden with a result');
    assert.ok(await page.$('.changes li'), 'criteria changes listed');
    await page.click('[data-step]'); await page.waitForSelector('.step .changes, .step .muted');
    await page.goto(base + '#R59&seen=2021-03-01'); await page.waitForFunction(() => /retired/.test(document.querySelector('#summary-text')?.textContent || ''));
    assert.match(await page.textContent('#summary-text'), /It is now covered by R27/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
