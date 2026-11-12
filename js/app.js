/* Test Directory Changes: page code. Data: TDH_RELEASES, TDH_CHANGES, TDH_LINKS (loaded with the page); each release
   (data/v/<id>.js) and each panel's gene history (data/panels/<id>.js) are loaded when first needed. */
'use strict';
const C = TDHCore;
const TDH = window.TDH = {
  rel: {}, panels: {},
  addRelease(id, d) { d.byCode = Object.fromEntries(d.indications.map(e => [e.code, e])); this.rel[id] = d; },
  addPanel(id, d) { this.panels[id] = d; }
};
const RELEASES = TDH_RELEASES;
const LATEST = RELEASES[RELEASES.length - 1];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const relById = id => RELEASES.find(r => r.id === id);
const today = () => new Date().toISOString().slice(0, 10);
const codeNum = c => parseInt(c.slice(1), 10);
const KIND_LABEL = { added: 'New code', removed: 'Removed', name: 'Renamed', criteria: 'Criteria', tests: 'Tests', panels: 'Panels',
  overlapping: 'Overlapping', pathway: 'Pathway', specialties: 'Specialties', noted: 'Noted in spreadsheet' };

function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
async function release(id) {
  if (!TDH.rel[id]) await loadScript(`data/v/${encodeURIComponent(id)}.js`);
  return TDH.rel[id];
}
async function panel(pid) {
  if (!(pid in TDH.panels)) { try { await loadScript(`data/panels/${pid}.js`); } catch (e) { TDH.panels[pid] = null; } }
  return TDH.panels[pid];
}

// ---------- names and search ----------
const CODES = Object.keys(TDH_CHANGES).sort((a, b) => codeNum(a) - codeNum(b));
function latestName(code) { const n = TDH_CHANGES[code].names; return n.length ? n[n.length - 1][1] : ''; }
function isCurrent(code) { return TDH_CHANGES[code].present.includes(LATEST.id); }

function fillCodeList() {
  const opts = [];
  for (const c of CODES) {
    const rec = TDH_CHANGES[c];
    opts.push(`<option value="${esc(c + ' – ' + latestName(c))}">${isCurrent(c) ? '' : 'not in ' + esc(LATEST.label)}</option>`);
    rec.names.slice(0, -1).forEach(([rid, n]) => opts.push(`<option value="${esc(c + ' – ' + n)}">earlier name (${esc(relById(rid).label)})</option>`));
  }
  $('#codes').innerHTML = opts.join('');
}

/** Codes matching what was typed: an R code, or every word found in one of the code's names (old names included). */
function findCodes(q) {
  const m = q.match(/^\s*(R\d+)\b/i);
  if (m) { const c = m[1].toUpperCase(); return TDH_CHANGES[c] ? [c] : []; }
  const words = C.norm(q).split(/[^a-z0-9]+/).filter(w => w.length > 1);
  if (!words.length) return [];
  return CODES.filter(c => TDH_CHANGES[c].names.some(([, n]) => { const t = C.norm(n); return words.every(w => t.includes(w)); }));
}

// ---------- form ----------
function fillReleaseSelects() {
  const opt = r => `<option value="${esc(r.id)}">${esc(r.label)} – ${esc(C.relDate(r))}</option>`;
  $('#from').innerHTML = RELEASES.map(opt).join('');
  $('#to').innerHTML = RELEASES.map(opt).join('');
  $('#rel').innerHTML = RELEASES.slice().reverse().map(opt).join('');
  $('#from').value = RELEASES[0].id;
  $('#to').value = LATEST.id;
}

$('#seen').addEventListener('change', () => {
  const v = $('#seen').value;
  if (!v) return;
  $('#from').value = (C.releaseAt(RELEASES, v) || RELEASES[0]).id;
});
$('#from').addEventListener('change', () => {
  const v = $('#seen').value;
  if (v && (C.releaseAt(RELEASES, v) || RELEASES[0]).id !== $('#from').value) $('#seen').value = '';
});

$('#compare-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const codes = findCodes($('#code').value);
  const box = $('#choices');
  if (codes.length === 1) { box.hidden = true; go({ code: codes[0], seen: $('#seen').value, from: $('#from').value, to: $('#to').value }); return; }
  box.hidden = false;
  box.className = 'card';
  box.innerHTML = !codes.length
    ? `<p>No R code or name matches “${esc($('#code').value)}”. Try an R code (e.g. R208) or one word from the condition.</p>`
    : `<h3>${codes.length} matching codes</h3><ul class="choice-list">${codes.slice(0, 80).map(c => `<li><a href="#${hashFor({ code: c, seen: $('#seen').value, from: $('#from').value, to: $('#to').value })}"><span class="code">${c}</span> – ${esc(latestName(c))}</a>${isCurrent(c) ? '' : ` <span class="chip removed">not in ${esc(LATEST.label)}</span>`}${TDH_CHANGES[c].names.length > 1 ? `<div class="hint">Also: ${TDH_CHANGES[c].names.slice(0, -1).map(n => esc(n[1])).join('; ')}</div>` : ''}</li>`).join('')}</ul>`;
});

function hashFor(s) {
  const p = [s.code];
  if (s.seen) p.push('seen=' + s.seen);
  else if (s.from) p.push('from=' + encodeURIComponent(s.from));
  if (s.to && s.to !== LATEST.id) p.push('to=' + encodeURIComponent(s.to));
  return p.join('&');
}
function go(s) { const h = '#' + hashFor(s); if (location.hash === h) route(); else location.hash = h; }

// ---------- rendering helpers ----------
function diffHtml(ops, side) {
  return ops.map(([op, t]) => op === 0 ? esc(t) : op < 0 ? (side === 'b' ? '' : `<del>${esc(t)}</del>`) : (side === 'a' ? '' : `<ins>${esc(t)}</ins>`)).join('');
}
function docLinks(r, ent) {
  const L = r.links || {};
  const out = [];
  if (L.pdf) out.push(`<a href="${esc(L.pdf)}${ent && ent.page ? '#page=' + ent.page : ''}">Eligibility criteria PDF${ent && ent.page ? ' (p. ' + ent.page + ')' : ''}</a>`);
  if (L.xlsx) out.push(`<a href="${esc(L.xlsx)}">Spreadsheet</a>`);
  if (L.archive) out.push(`<a href="${esc(L.archive)}">Web archive</a>`);
  return out.join(' · ');
}
function chips(kinds) {
  return `<span class="chips">${kinds.map(k => `<span class="chip ${k === 'added' || k === 'removed' ? k : ''}">${esc(KIND_LABEL[k] || k)}</span>`).join('')}</span>`;
}

// ---------- compare view ----------
let critMode = 'side';
try { critMode = localStorage.getItem('tdh-crit') || 'side'; } catch (e) { /* storage blocked */ }

async function renderCompare(s) {
  const out = $('#result');
  const code = s.code;
  if (!TDH_CHANGES[code]) { out.innerHTML = `<div class="card"><p>${esc(code)} is not in any version loaded here.</p></div>`; return; }
  const seenRel = s.seen ? C.releaseAt(RELEASES, s.seen) : null;
  const relA = s.seen ? (seenRel || RELEASES[0]) : (relById(s.from) || RELEASES[0]);
  const relB = relById(s.to) || LATEST;
  $('#code').value = `${code} – ${latestName(code)}`;
  $('#seen').value = s.seen || '';
  $('#from').value = relA.id; $('#to').value = relB.id;
  out.innerHTML = '<p class="muted">Loading…</p>';
  let A, B;
  try { [A, B] = await Promise.all([release(relA.id), release(relB.id)]); }
  catch (e) { out.innerHTML = `<div class="card notice">${esc(e.message)}</div>`; return; }
  const entA = A.byCode[code], entB = B.byCode[code];
  const rec = TDH_CHANGES[code];
  const links = TDH_LINKS.filter(l => l.from === code);
  const backwards = RELEASES.indexOf(relA) > RELEASES.indexOf(relB);
  const name = (entB || entA || {}).name || latestName(code);

  const notices = [];
  if (s.seen && !seenRel) notices.push(`${C.longDate(s.seen)} is earlier than the earliest version loaded (${relA.label}, published ${C.relDate(relA)}). Add the older version to compare from the right date.`);
  if (C.sameMonthUnsure(seenRel, s.seen)) notices.push(`${esc(seenRel.label)} was published in ${esc(C.relDate(seenRel))}; the exact day is not stated, so check whether the previous version still applied on ${esc(C.longDate(s.seen))}.`);
  if (backwards) notices.push('The “then” version is later than the “compare with” version.');
  if (!entA && entB) notices.push(`${code} was not in ${relA.label}.`);
  if (entA && !entB) notices.push(`${code} is not in ${relB.label}.` + (links.length ? ' ' + links.map(l => l.to.length ? `${l.auto ? 'Possibly replaced by' : 'Replaced by'} ${l.to.map(c => `<a href="#${c}">${c}</a>`).join(', ')}${l.why ? ' (' + esc(l.why.join('; ')) + ')' : ''}${l.note ? ' – ' + esc(l.note) : ''}.` : 'No replacement code found.').join(' ') : ''));
  if (!entA && !entB) notices.push(`${code} is in neither version. It appears in: ${rec.present.map(id => esc(relById(id).label)).join(', ')}.`);

  const verCard = (label, r, ent, extra) => `<div class="ver"><div class="label">${label}</div><strong>${esc(r.label)}</strong>
    <div>Published ${esc(C.relDate(r))}${r.inForceFrom ? ', in force ' + esc(C.longDate(r.inForceFrom)) : ''}</div>
    ${extra ? `<div class="hint">${extra}</div>` : ''}
    <div class="small">${ent ? esc(ent.name) : '<em>Code not in this version</em>'}</div>
    <div class="hint no-print">${docLinks(r, ent)}</div></div>`;

  out.innerHTML = `
  <div class="card" id="r-head">
    <div class="result-head">
      <div><h2><span class="code">${esc(code)}</span> – ${esc(name)}</h2>
        ${rec.names.length > 1 ? `<p class="hint">Names over time: ${rec.names.map(([rid, n]) => `${esc(n)} (from ${esc(relById(rid).label)})`).join(' → ')}</p>` : ''}</div>
      <div class="toolbar no-print"><button type="button" class="secondary" id="copy-link">Copy link</button><button type="button" id="print">Print</button></div>
    </div>
    <div class="versions">
      ${verCard(s.seen ? 'In force when seen' : 'Then', relA, entA, s.seen ? 'Patient seen ' + esc(C.longDate(s.seen)) : '')}
      ${verCard(relB === LATEST ? 'Now (latest loaded)' : 'Compared with', relB, entB)}
    </div>
    ${notices.map(n => `<div class="notice">${n}</div>`).join('')}
  </div>
  <div class="card" id="r-summary"><h3>Summary for a reply</h3><pre class="summary-text" id="summary-text">Working out…</pre>
    <div class="toolbar no-print"><button type="button" id="copy-summary">Copy summary</button><span class="hint" id="copied" role="status"></span></div></div>
  <div class="card" id="r-timeline"><h3>When it changed</h3>${timeline(code, relA, relB)}</div>
  <div class="card" id="r-criteria"></div>
  <div class="card" id="r-tests"><h3>Tests</h3>${testsTable(entA, entB)}</div>
  <div class="card" id="r-genes"><h3>Genes (PanelApp green genes)</h3><p class="muted">Loading gene lists…</p></div>
  <div class="card" id="r-other"><h3>Other sections</h3>${otherSections(entA, entB)}</div>`;
  renderCriteria(entA, entB, relA, relB);
  $('#copy-link').onclick = () => copy(location.href, 'Link copied');
  $('#print').onclick = () => window.print();
  const genes = await renderGenes(entA, entB, s.seen || C.inForce(relA), relB === LATEST ? today() : C.inForce(relB));
  const noCrit = [relA, relB].filter(r => r.noCriteria);
  let text = C.summary({ code, seen: s.seen, relA: s.seen ? seenRel : relA, relB, releases: RELEASES, events: rec.events, entA, entB, links, genes });
  if (noCrit.length) text = text.replace(/\nDates are when/, `\nThe eligibility criteria for ${noCrit.map(r => r.label).join(' and ')} are not loaded yet, so criteria changes in ${noCrit.length > 1 ? 'those versions' : 'that version'} are not included.\nDates are when`);
  $('#summary-text').textContent = text;
  $('#copy-summary').onclick = () => copy(text, 'Summary copied');
  document.title = `${code} – Test Directory Changes`;
}

function copy(text, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => { const c = $('#copied'); if (c) c.textContent = msg; else alert(msg); },
    () => prompt('Copy:', text));
}

function timeline(code, relA, relB) {
  const rec = TDH_CHANGES[code];
  const ia = RELEASES.indexOf(relA), ib = RELEASES.indexOf(relB);
  const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia];
  const evBy = Object.fromEntries(rec.events.map(e => [e.r, e]));
  const items = RELEASES.map((r, i) => {
    const e = evBy[r.id];
    const inRange = i > lo && i <= hi;
    const end = i === ia ? (relA === relB ? 'Both' : 'Then') : i === ib ? 'Compared with' : '';
    const present = rec.present.includes(r.id);
    const kinds = e ? e.k : [];
    const cls = [kinds.some(k => k !== 'noted') ? 'changed' : '', end ? 'endpoint' : '', !inRange && !end ? 'outside' : ''].join(' ');
    let body = '';
    if (e && e.d) body += `<ul class="details-list">${e.d.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`;
    if (e && e.n) body += `<p class="note">Spreadsheet change note: “${esc(e.n)}”</p>`;
    if (!e && i > 0 && present) body = '<p class="note">No change.</p>';
    if (!present && !(e && e.k.includes('removed'))) body = '<p class="note">Code not in this version.</p>';
    if (i === 0 && !e) body = present ? '<p class="note">Earliest version loaded.</p>' : body;
    return `<li class="${cls}"><span class="when">${esc(C.relDate(r))}</span> – ${esc(r.label)}${end ? ` <strong>(${end})</strong>` : ''}${chips(kinds)}${body}</li>`;
  });
  return `<p class="hint">Every version loaded, oldest first. Changes are dated by the version they were first published in; changes between “then” and “compared with” are highlighted.</p><ol class="timeline">${items.join('')}</ol>`;
}

function renderCriteria(entA, entB, relA, relB) {
  const box = $('#r-criteria');
  const ta = entA ? C.criteriaText(entA.criteria) : '', tb = entB ? C.criteriaText(entB.criteria) : '';
  const missing = [relA, relB].filter(r => r.noCriteria);
  if (missing.length) {
    box.innerHTML = `<h3>Eligibility criteria</h3><div class="notice">The eligibility criteria document for ${missing.map(r => esc(r.label)).join(' and ')} has not been added yet, so the wording can't be compared. ${missing.map(r => r.links && r.links.pdf ? `<a href="${esc(r.links.pdf)}">${esc(r.label)} criteria PDF</a>` : '').join(' ')}</div>`
      + [[relA, entA], [relB, entB]].filter(([r]) => !r.noCriteria).map(([r, e]) => `<h4>${esc(r.label)}</h4><pre class="crit">${esc(e ? C.criteriaText(e.criteria) : '') || '<em>Not in this version</em>'}</pre>`).join('');
    return;
  }
  const same = C.norm(ta) === C.norm(tb);
  const ops = C.diffLines(ta, tb);
  const pdf = (r, e) => r.links && r.links.pdf && e && e.page ? ` <a class="no-print small" href="${esc(r.links.pdf)}#page=${e.page}">PDF p. ${e.page}</a>` : '';
  const head = `<div class="result-head"><h3>Eligibility criteria</h3><div class="seg no-print" role="group" aria-label="Layout">
    <button type="button" data-mode="side" aria-pressed="${critMode === 'side'}">Side by side</button><button type="button" data-mode="inline" aria-pressed="${critMode === 'inline'}">Changes inline</button></div></div>
    <p class="legend">${same ? (ta ? 'The wording is the same in both versions (apart from layout).' : 'No criteria in either version.') : '<del>Removed wording</del> and <ins>added wording</ins>, compared word by word. Layout differences between PDF versions can show as small changes.'}</p>`;
  const body = critMode === 'inline'
    ? `<pre class="crit">${diffHtml(ops, 'all') || '<em>None</em>'}</pre>`
    : `<div class="side"><div><h4>${esc(relA.label)}${pdf(relA, entA)}</h4><pre class="crit">${diffHtml(ops, 'a') || '<em>Not in this version</em>'}</pre></div>
       <div><h4>${esc(relB.label)}${pdf(relB, entB)}</h4><pre class="crit">${diffHtml(ops, 'b') || '<em>Not in this version</em>'}</pre></div></div>`;
  box.innerHTML = head + body;
  box.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    critMode = b.dataset.mode;
    try { localStorage.setItem('tdh-crit', critMode); } catch (e) { /* storage blocked */ }
    renderCriteria(entA, entB, relA, relB);
  });
}

const PDF_FIELDS = ['family', 'scope'];
const TEST_FIELDS = [['target', 'Target'], ['method', 'Method'], ['commissioning', 'Commissioning'], ['family', 'Family structure'], ['scope', 'Scope']];
function testsTable(entA, entB) {
  const ta = Object.fromEntries((entA ? entA.tests : []).map(t => [t.id, t]));
  const tb = Object.fromEntries((entB ? entB.tests : []).map(t => [t.id, t]));
  const ids = [...new Set([...Object.keys(ta), ...Object.keys(tb)])].sort((x, y) => parseFloat(x.split('.')[1]) - parseFloat(y.split('.')[1]));
  if (!ids.length) return '<p class="muted">No tests in either version.</p>';
  const rows = ids.map(id => {
    const a = ta[id], b = tb[id];
    const cls = !a ? 'is-added' : !b ? 'is-removed' : '';
    // family structure and scope come from the criteria PDF: blank in one version usually means its PDF isn't loaded
    const unknown = (k, x, y) => PDF_FIELDS.includes(k) && (!x || !y);
    const status = !a ? 'Added' : !b ? 'Removed' : TEST_FIELDS.some(([k]) => !unknown(k, a[k], b[k]) && C.norm(a[k]) !== C.norm(b[k])) ? 'Changed' : 'Same';
    const cells = TEST_FIELDS.map(([k]) => {
      const x = a ? a[k] || '' : '', y = b ? b[k] || '' : '';
      if (!a) return `<td>${esc(y)}</td>`;
      if (!b) return `<td>${esc(x)}</td>`;
      if (unknown(k, x, y)) return `<td>${esc(x || y)}${x || y ? ` <span class="hint">(${x ? 'then' : 'now'} only)</span>` : ''}</td>`;
      return `<td>${C.norm(x) === C.norm(y) ? esc(y) : diffHtml(C.diffText(x, y), 'all')}</td>`;
    }).join('');
    return `<tr class="${cls}"><td class="code">${esc(id)}</td><td>${status}</td>${cells}</tr>`;
  });
  return `<div class="table-wrap"><table><thead><tr><th>Test</th><th>Status</th>${TEST_FIELDS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function otherSections(entA, entB) {
  const parts = [['overlapping', 'Overlapping indications'], ['pathway', 'Where in pathway'], ['specialties', 'Requesting specialties']];
  const html = parts.map(([k, label]) => {
    const asText = e => { const v = e && e[k]; return Array.isArray(v) ? v.map(x => '• ' + x).join('\n') : (v || ''); };
    const x = asText(entA), y = asText(entB);
    if (!x && !y) return '';
    const same = C.norm(x) === C.norm(y);
    return `<details ${same ? '' : 'open'}><summary><strong>${label}</strong> – ${same ? 'no change' : 'changed'}</summary><pre class="crit">${same ? esc(y) : diffHtml(C.diffLines(x, y), 'all')}</pre></details>`;
  }).join('');
  return html || '<p class="muted">Not given in these versions.</p>';
}

async function renderGenes(entA, entB, dateA, dateB) {
  const box = $('#r-genes');
  const pa = new Set((entA ? entA.tests : []).flatMap(t => t.panels || []));
  const pb = new Set((entB ? entB.tests : []).flatMap(t => t.panels || []));
  const ids = [...new Set([...pa, ...pb])];
  if (!ids.length) { box.innerHTML = '<h3>Genes (PanelApp green genes)</h3><p class="muted">No PanelApp panel is named for the tests in these versions (e.g. whole-genome tests without a panel, or single-gene tests listed by name in the Tests table).</p>'; return []; }
  const genes = [];
  const blocks = [];
  for (const pid of ids) {
    const p = await panel(pid);
    if (!p) { blocks.push(`<div class="notice">PanelApp panel ${pid}: no gene history saved yet (run tools/panel_history.py).</div>`); continue; }
    // a panel only counts on a side whose tests named it (older releases often listed genes by name instead)
    const inA = pa.has(pid), inB = pb.has(pid);
    const a = inA ? C.panelAt(p, dateA) : null, b = inB ? C.panelAt(p, dateB) : null;
    const d = a && b ? C.setDiff(a.genes, b.genes) : { added: [], removed: [] };
    genes.push({ panel: pid, name: p.name, a, b, inA, inB, diff: d });
    const at = (x, dt, used) => !used ? 'not used for this code (see the test targets above)' : x ? `signed-off v${esc(x.v)} (${esc(C.longDate(x.date))}): <b>${x.genes.size}</b> green genes` : `no GMS signed-off version on ${esc(C.longDate(dt))}${p.signoffs.length ? ` (first sign-off ${esc(C.longDate(p.signoffs[0].date))})` : ''}`;
    const scope = pa.has(pid) && pb.has(pid) ? '' : pa.has(pid) ? ` <span class="chip removed">only in ${'then'}</span>` : ` <span class="chip added">only now</span>`;
    const list = (arr, tag) => arr.length ? `<p class="genes"><strong>${tag} (${arr.length}):</strong> ${arr.map(g => `<span>${tag === 'Added' ? '<ins>' : '<del>'}${esc(g)}${tag === 'Added' ? '</ins>' : '</del>'}</span>`).join('')}</p>` : '';
    blocks.push(`<div class="ver" style="margin-bottom:10px"><strong><a href="https://panelapp.genomicsengland.co.uk/panels/${pid}/">${esc(p.name)}</a> (${pid})</strong>${scope}
      <div>Then (${esc(C.longDate(dateA))}): ${at(a, dateA, inA)}</div><div>Now (${esc(C.longDate(dateB))}): ${at(b, dateB, inB)}</div>
      ${a && b ? (d.added.length || d.removed.length ? list(d.added, 'Added') + list(d.removed, 'Removed') : '<p class="note">No change in green genes.</p>') : ''}</div>`);
  }
  box.innerHTML = `<h3>Genes (PanelApp green genes)</h3><p class="hint">Green genes on each panel named for the tests, at the GMS signed-off version in force on each date (the version laboratories test against).</p>${blocks.join('')}`;
  return genes;
}

// ---------- release view ----------
function renderRelease(id, filter) {
  const r = relById(id) || LATEST;
  $('#rel').value = r.id; $('#rel-filter').value = filter || '';
  const i = RELEASES.indexOf(r);
  const prev = RELEASES[i - 1];
  const rows = [];
  for (const c of CODES) {
    const e = TDH_CHANGES[c].events.find(x => x.r === r.id);
    if (!e || (filter && !e.k.includes(filter))) continue;
    rows.push(`<li><a href="#${hashFor({ code: c, from: prev ? prev.id : r.id, to: r.id })}"><span class="code">${c}</span> – ${esc(latestName(c))}</a>${chips(e.k)}
      ${e.d ? `<ul class="details-list">${e.d.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}${e.n ? `<p class="note">Spreadsheet: “${esc(e.n)}”</p>` : ''}</li>`);
  }
  $('#release-result').innerHTML = `<div class="card"><h2>${esc(r.label)} – published ${esc(C.relDate(r))}</h2>
    <p class="hint">${prev ? `Compared with the previous version loaded, ${esc(prev.label)} (${esc(C.relDate(prev))}).` : 'This is the earliest version loaded, so only the spreadsheet’s own change notes are listed.'} ${docLinks(r)}</p>
    <p>${rows.length} code${rows.length === 1 ? '' : 's'}.</p><ul class="choice-list">${rows.join('')}</ul></div>`;
}
$('#rel').addEventListener('change', () => { location.hash = `view=release&rel=${encodeURIComponent($('#rel').value)}${$('#rel-filter').value ? '&kind=' + $('#rel-filter').value : ''}`; });
$('#rel-filter').addEventListener('change', () => $('#rel').dispatchEvent(new Event('change')));

// ---------- versions view ----------
function renderVersions() {
  $('#versions-view').innerHTML = `<div class="card"><h2>Versions loaded</h2>
    <p>Each row is one publication of the rare and inherited disease directory (spreadsheet and eligibility criteria). A version is taken to be in force from the day it was published until the next one.</p>
    ${RELEASES.slice().reverse().map(r => `<div class="rel-row"><strong>${esc(r.label)}</strong><div>Published ${esc(C.relDate(r))}${r.inForceFrom ? '; in force ' + esc(C.longDate(r.inForceFrom)) : ''}.
      Directory ${esc(r.directory || '')}; criteria ${esc(r.criteria || '')}. ${r.counts.indications} R codes, ${r.counts.tests} tests.
      ${r.problems ? `<span class="chip removed">${r.problems} items to check from parsing</span>` : ''}<div class="hint">${docLinks(r)}${r.parsedFrom ? ' · ' + esc(r.parsedFrom) : ''}</div></div></div>`).join('')}
    <p class="hint">Older versions are being added from the <a href="https://webarchive.nationalarchives.gov.uk/ukgwa/timeline/https:/www.england.nhs.uk/publication/national-genomic-test-directories/">UK Government Web Archive</a>. Until they are, comparisons start from the earliest version listed here.</p></div>`;
}

// ---------- routing ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const q = Object.fromEntries(h.split('&').filter(Boolean).map(p => p.includes('=') ? p.split(/=(.*)/s).slice(0, 2) : ['code', p]));
  const view = q.view || 'compare';
  document.querySelectorAll('.tab').forEach(t => t.toggleAttribute('aria-current', t.dataset.view === view) || t.dataset.view === view && t.setAttribute('aria-current', 'page'));
  $('#compare-view').hidden = view !== 'compare'; $('#release-view').hidden = view !== 'release'; $('#versions-view').hidden = view !== 'versions';
  if (view === 'release') renderRelease(q.rel, q.kind);
  else if (view === 'versions') renderVersions();
  else if (q.code && /^R\d+$/i.test(q.code)) { $('#choices').hidden = true; renderCompare({ code: q.code.toUpperCase(), seen: q.seen || '', from: q.from, to: q.to }); }
  else { $('#result').innerHTML = ''; document.title = 'Test Directory Changes'; }
}

function init() {
  fillCodeList(); fillReleaseSelects();
  $('#stats').textContent = `${RELEASES.length} version${RELEASES.length === 1 ? '' : 's'} loaded: ${RELEASES[0].label} (${C.relDate(RELEASES[0])})${RELEASES.length > 1 ? ' to ' + LATEST.label + ' (' + C.relDate(LATEST) + ')' : ''}`;
  $('#built').textContent = `Data built ${C.longDate(TDH_BUILT)}.`;
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeprint', () => document.querySelectorAll('details').forEach(d => d.open = true));
  route();
}
init();
