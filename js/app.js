/* Test Directory Changes: page code. Data: TDH_RELEASES, TDH_CHANGES, TDH_LINKS (loaded with the page); each release
   (data/v/<id>.js), each panel's gene history (data/panels/<id>.js) and the gene search index (data/genes.js) are
   loaded when first needed. */
'use strict';
const C = TDHCore;
const TDH = window.TDH = {
  rel: {}, panels: {}, genes: null,
  addRelease(id, d) { d.byCode = Object.fromEntries(d.indications.map(e => [e.code, e])); this.rel[id] = d; },
  addPanel(id, d) { this.panels[id] = d; },
  addGenes(g) { this.genes = g; }
};
const RELEASES = TDH_RELEASES;
const LATEST = RELEASES[RELEASES.length - 1];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const relById = id => RELEASES.find(r => r.id === id);
const today = () => new Date().toISOString().slice(0, 10);
const codeNum = c => parseInt(c.slice(1), 10);
const KIND_LABEL = { added: 'New code', removed: 'Retired', name: 'Renamed', criteria: 'Criteria', tests: 'Tests', panels: 'Panels',
  overlapping: 'Overlapping', pathway: 'Pathway', specialties: 'Specialties', noted: 'Noted in spreadsheet' };
const MAIN_KINDS = ['added', 'removed', 'name', 'criteria', 'tests'];  // what the timeline shows by default
/** A release as people say it: "April 2022 (v3)", or just "October 2018 (2018/19)". */
const relName = r => `${C.relDate(r)} (${r.label})`;

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
let genesLoading = null;
function loadGenes() { return genesLoading || (genesLoading = loadScript('data/genes.js').catch(() => { TDH.genes = {}; })); }

// ---------- names and search ----------
const CODES = Object.keys(TDH_CHANGES).sort((a, b) => codeNum(a) - codeNum(b));
function latestName(code) { const n = TDH_CHANGES[code].names; return n.length ? n[n.length - 1][1] : ''; }
function isCurrent(code) { return TDH_CHANGES[code].present.includes(LATEST.id); }
/** " → now R27" for a retired code with a known replacement ("possibly" ones get a question mark). */
function nowCovered(code) {
  const l = TDH_LINKS.find(x => x.from === code && x.to && x.to.length);
  return l ? ` → now ${l.to.join(', ')}${l.auto ? '?' : ''}` : '';
}

/** Search results: [{code, why}] ranked: exact code, code prefix, name (current or earlier), gene. */
function search(q) {
  const t = q.trim();
  if (!t) return [];
  const out = [], seen = new Set();
  const add = (code, why, rank) => { if (!seen.has(code)) { seen.add(code); out.push({ code, why, rank }); } };
  const m = t.match(/^R?(\d+)$/i);
  if (m) {
    if (TDH_CHANGES['R' + m[1]]) add('R' + m[1], '', 0);
    CODES.filter(c => c.slice(1).startsWith(m[1])).forEach(c => add(c, '', 1));
  }
  const codeIn = t.match(/^\s*(R\d+)\b/i);
  if (codeIn && TDH_CHANGES[codeIn[1].toUpperCase()]) add(codeIn[1].toUpperCase(), '', 0);
  const words = C.norm(t).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !/^r\d+$/.test(w));
  if (words.length) {
    for (const c of CODES) {
      const names = TDH_CHANGES[c].names;
      const cur = C.norm(latestName(c));
      if (words.every(w => cur.includes(w))) { add(c, '', words.some(w => new RegExp('\\b' + w).test(cur)) ? 2 : 3); continue; }
      const old = names.find(([, n]) => words.every(w => C.norm(n).includes(w)));
      if (old) add(c, `earlier name: ${old[1]}`, 4);
    }
  }
  if (TDH.genes && /^[A-Za-z0-9-]{2,}$/.test(t)) {
    const g = t.toUpperCase();
    (TDH.genes[g] || []).forEach(c => add(c, `tests ${g}`, 5));
    if (g.length >= 3) Object.keys(TDH.genes).filter(k => k !== g && k.startsWith(g)).slice(0, 5)
      .forEach(k => TDH.genes[k].forEach(c => add(c, `tests ${k}`, 6)));
  }
  return out.sort((a, b) => a.rank - b.rank);
}

// ---------- type-ahead ----------
const input = $('#code'), list = $('#code-list');
let options = [], active = -1;
function optionLabel(c) { return `${c} – ${latestName(c)}`; }
function renderOptions() {
  if (!options.length) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); return; }
  list.innerHTML = options.slice(0, 8).map((o, i) => `<li role="option" id="opt-${i}" data-code="${o.code}" aria-selected="${i === active}">
    <span class="code">${o.code}</span> ${esc(latestName(o.code))}${isCurrent(o.code) ? '' : ` <span class="chip removed">retired${nowCovered(o.code)}</span>`}
    ${o.why ? `<span class="why">${esc(o.why)}</span>` : ''}</li>`).join('');
  list.hidden = false; input.setAttribute('aria-expanded', 'true');
  if (active >= 0) input.setAttribute('aria-activedescendant', 'opt-' + active); else input.removeAttribute('aria-activedescendant');
}
function choose(code) {
  input.value = optionLabel(code); input.dataset.code = code;
  options = []; active = -1; renderOptions(); $('#form-error').hidden = true;
}
input.addEventListener('input', async () => {
  delete input.dataset.code;
  if (!TDH.genes) loadGenes().then(() => { if (document.activeElement === input) { options = search(input.value); renderOptions(); } });
  options = search(input.value); active = -1; renderOptions();
});
input.addEventListener('keydown', ev => {
  if (list.hidden) return;
  const n = Math.min(options.length, 8);
  if (ev.key === 'ArrowDown') { active = (active + 1) % n; renderOptions(); ev.preventDefault(); }
  else if (ev.key === 'ArrowUp') { active = (active - 1 + n) % n; renderOptions(); ev.preventDefault(); }
  else if (ev.key === 'Enter' && active >= 0) { choose(options[active].code); ev.preventDefault(); }
  else if (ev.key === 'Escape') { options = []; renderOptions(); }
});
input.addEventListener('blur', () => setTimeout(() => { options = []; renderOptions(); }, 150));
list.addEventListener('mousedown', ev => { const li = ev.target.closest('li[data-code]'); if (li) { ev.preventDefault(); choose(li.dataset.code); } });

// ---------- form ----------
function fillReleaseSelects() {
  const opt = r => `<option value="${esc(r.id)}">${esc(relName(r))}</option>`;
  $('#from').innerHTML = '<option value="">The version in force on the date seen</option>' + RELEASES.map(opt).join('');
  $('#to').innerHTML = RELEASES.map(opt).join('');
  $('#rel').innerHTML = RELEASES.slice().reverse().map(opt).join('');
  $('#to').value = LATEST.id;
}
$('#from').addEventListener('change', () => { if ($('#from').value) $('#seen').value = ''; });
$('#seen').addEventListener('change', () => { if ($('#seen').value) $('#from').value = ''; });

$('#compare-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('#form-error'), box = $('#choices');
  err.hidden = true;
  const state = { seen: $('#seen').value, from: $('#from').value, to: $('#to').value };
  if (state.seen && state.seen > today()) { err.textContent = 'The date seen is in the future.'; err.hidden = false; return; }
  if (input.dataset.code) { box.hidden = true; go({ code: input.dataset.code, ...state }); return; }
  if (!input.value.trim()) { err.textContent = 'Enter an R code, condition or gene.'; err.hidden = false; input.focus(); return; }
  await loadGenes();
  const found = search(input.value);
  if (found.length === 1) { box.hidden = true; go({ code: found[0].code, ...state }); return; }
  box.hidden = false; box.className = 'card';
  box.innerHTML = !found.length
    ? `<p>Nothing matches “${esc(input.value)}”. Try an R code (e.g. R208), one word from the condition, or a gene symbol.</p>`
    : `<h3>${found.length} matches – choose one</h3><ul class="choice-list">${found.slice(0, 80).map(o => `<li><a href="#${hashFor({ code: o.code, ...state })}"><span class="code">${o.code}</span> – ${esc(latestName(o.code))}</a>${isCurrent(o.code) ? '' : ` <span class="chip removed">retired${nowCovered(o.code)}</span>`}${o.why ? `<div class="hint">${esc(o.why)}</div>` : ''}</li>`).join('')}</ul>`;
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
function copy(text, where, msg) {
  const say = m => { const c = $(where); if (c) c.textContent = m; };
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => say(msg), () => { prompt('Copy:', text); });
}
/** One line of criteria for display: indentation dropped (the marker shows the level). */
const lineText = s => String(s || '').trim();

/** Criteria changes as a list of then/now pairs (the "changes only" view); long lists show the first few. */
function changesHtml(changes, labelA, labelB, limit) {
  if (!changes.length) return '<p class="muted">No change in wording.</p>';
  const row = (tag, html, cls = '') => `<div class="${cls}"><span class="tag">${esc(tag)}</span><span class="txt">${html}</span></div>`;
  const item = c => {
    const ctx = c.after ? `<div class="ctx">After: ${esc(lineText(c.after).slice(0, 140))}${lineText(c.after).length > 140 ? '…' : ''}</div>` : '';
    if (c.kind === 'changed') return `<li>${ctx}${row(labelA, diffHtml(c.ops, 'a'), 'then')}${row(labelB, diffHtml(c.ops, 'b'), 'now')}</li>`;
    if (c.kind === 'removed') return `<li>${ctx}${row(labelA, `<del>${esc(lineText(c.a))}</del>`, 'then')}${row(labelB, 'No longer included', 'now gone')}</li>`;
    return `<li>${ctx}${row(labelA, 'Not included', 'then gone')}${row(labelB, `<ins>${esc(lineText(c.b))}</ins>`, 'now')}</li>`;
  };
  const n = limit && changes.length > limit + 2 ? limit : changes.length;
  const more = changes.length - n;
  return `<ol class="changes">${changes.slice(0, n).map(item).join('')}</ol>`
    + (more ? `<ol class="changes" hidden>${changes.slice(n).map(item).join('')}</ol><button type="button" class="secondary no-print show-more">Show all ${changes.length} changes</button>` : '');
}
function wireShowMore(root) {
  root.querySelectorAll('.show-more').forEach(b => b.onclick = () => { b.previousElementSibling.hidden = false; b.remove(); });
}

// ---------- compare view ----------
let critMode = 'changes';
try { critMode = localStorage.getItem('tdh-crit2') || 'changes'; } catch (e) { /* storage blocked */ }
let showAll = false;

async function renderCompare(s) {
  const out = $('#result');
  const code = s.code;
  $('#start').hidden = true;
  if (!TDH_CHANGES[code]) { out.innerHTML = `<div class="card"><p>${esc(code)} is not in any version held here.</p></div>`; return; }
  const rec = TDH_CHANGES[code];
  const firstWith = relById(rec.present[0]);
  const seenRel = s.seen ? C.releaseAt(RELEASES, s.seen) : null;
  const relA = s.seen ? (seenRel || RELEASES[0]) : (relById(s.from) || firstWith);
  const relB = relById(s.to) || LATEST;
  // criteria come from the PDF; when a release's PDF isn't held, use the nearest release whose criteria are
  const critA = C.criteriaSource(RELEASES, relA), critB = C.criteriaSource(RELEASES, relB);
  input.value = optionLabel(code); input.dataset.code = code;
  $('#seen').value = s.seen || ''; $('#from').value = s.seen ? '' : relA.id; $('#to').value = relB.id;
  if (!s.seen && s.from) $('#more-options').open = true;
  out.innerHTML = '<p class="muted">Loading…</p>';
  let A, B, CA, CB;
  try { [A, B, CA, CB] = await Promise.all([relA, relB, critA || relA, critB || relB].map(r => release(r.id))); }
  catch (e) { out.innerHTML = `<div class="card notice">${esc(e.message)}</div>`; return; }
  const entA = A.byCode[code], entB = B.byCode[code];
  const centA = CA.byCode[code], centB = CB.byCode[code];  // the entries the criteria and other PDF sections come from
  const links = TDH_LINKS.filter(l => l.from === code);
  const linksNamed = links.map(l => ({ ...l, to: (l.to || []).map(c => TDH_CHANGES[c] ? `${c} (${latestName(c)})` : c) }));
  const name = (entB || entA || {}).name || latestName(code);

  const notices = [];
  if (s.seen && !seenRel) notices.push(`${C.longDate(s.seen)} is before the earliest version held here (${esc(relName(RELEASES[0]))}), so the comparison starts from that version.`);
  if (C.sameMonthUnsure(seenRel, s.seen)) notices.push(`${esc(seenRel.label)} was published in ${esc(C.relDate(seenRel))} but the exact day is not stated, so the previous version may still have applied on ${esc(C.longDate(s.seen))}.`);
  if (!s.seen && !s.from) notices.push(`No date given, so this compares from ${esc(relName(relA))}, the first version that includes ${esc(code)}.`);
  if (RELEASES.indexOf(relA) > RELEASES.indexOf(relB)) notices.push('The “then” version is later than the “compare with” version.');
  if (entA && !entB) notices.push(`${esc(code)} is not in ${esc(relB.label)}. ` + (links.length ? links.map(l => l.to.length
    ? `${l.auto ? 'It may now be covered by' : 'It is now covered by'} ${l.to.map(c => `<a href="#${c}${s.seen ? '&seen=' + s.seen : ''}">${c} ${esc(TDH_CHANGES[c] ? latestName(c) : '')}</a>`).join(' and ')}${l.note ? ': ' + esc(l.note) : ''}${l.auto && l.why ? ` <span class="hint">(${esc(l.why.join('; '))})</span>` : ''}${l.source ? ` <span class="hint">(${esc(l.source)})</span>` : ''}.`
    : `${esc(l.note || 'No replacement code is named.')}${l.source ? ` <span class="hint">(${esc(l.source)})</span>` : ''}`).join(' ') : 'No replacement code is named.'));
  if (!entA && entB) notices.push(`${esc(code)} did not exist in ${esc(relA.label)}.`);

  const verCard = (label, r, ent, extra) => `<div class="ver"><div class="label">${label}</div><strong>${esc(relName(r))}</strong>
    ${extra ? `<div class="hint">${extra}</div>` : ''}
    <div class="small">${ent ? esc(ent.name) : '<em>Code not in this version</em>'}</div>
    <div class="hint no-print">${docLinks(r, ent)}</div></div>`;

  out.innerHTML = `
  <div class="card" id="r-head">
    <div class="result-head">
      <div><h2><span class="code">${esc(code)}</span> – ${esc(name)}</h2>
        ${rec.names.length > 1 ? `<p class="hint">Earlier names: ${rec.names.slice(0, -1).map(([rid, n]) => `${esc(n)} (from ${esc(C.relDate(relById(rid)))})`).join('; ')}</p>` : ''}</div>
      <div class="toolbar no-print"><button type="button" class="secondary" id="copy-link">Copy link</button><button type="button" class="secondary" id="print">Print</button></div>
    </div>
    <div class="versions">
      ${verCard(s.seen ? 'In force when seen' : 'Then', relA, entA, s.seen ? 'Patient seen ' + esc(C.longDate(s.seen)) : '')}
      ${verCard(relB === LATEST ? 'Now' : 'Compared with', relB, entB)}
    </div>
    ${notices.map(n => `<div class="notice">${n}</div>`).join('')}
  </div>
  <div class="card answer" id="r-summary"><h3>Short answer</h3><pre class="summary-text" id="summary-text">Working out…</pre>
    <div class="toolbar no-print"><button type="button" id="copy-summary">Copy short answer</button><span class="hint" id="copied" role="status"></span></div>
    <details class="detail-record no-print"><summary>Detailed record (every change, with genes) for notes</summary>
      <pre class="summary-text" id="detail-text">Working out…</pre>
      <button type="button" class="secondary" id="copy-detail">Copy detailed record</button><span class="hint" id="copied-detail" role="status"></span></details>
  </div>
  <div class="card" id="r-criteria"></div>
  <div class="card" id="r-timeline"><h3>When it changed</h3><div id="timeline"></div></div>
  <div class="card" id="r-tests"><h3>Tests</h3>${testsTable(entA, entB, centA, centB)}</div>
  <div class="card" id="r-genes"><h3>Genes</h3><p class="muted">Loading gene lists…</p></div>
  <div class="card" id="r-other"><h3>Other sections of the criteria</h3>${otherSections(critA === critB ? null : centA, critA === critB ? null : centB, critA, critB)}</div>`;

  const changes = (centA && centB) ? C.lineChanges(C.criteriaText(centA.criteria), C.criteriaText(centB.criteria)) : [];
  renderCriteria({ code, centA, centB, critA, critB, relA, relB, changes });
  renderTimeline(code, relA, relB, s.seen);
  $('#copy-link').onclick = () => copy(location.href, '#copied', 'Link copied');
  $('#print').onclick = () => window.print();
  const short = C.shortAnswer({ code, name, seen: s.seen, relA: s.seen ? seenRel : relA, relB, releases: RELEASES, events: rec.events,
    entA, entB, links: linksNamed, critA, critB, changes, maxChanges: 6 });
  $('#summary-text').textContent = short;
  $('#copy-summary').onclick = () => copy(short, '#copied', 'Short answer copied');
  document.title = `${code} – Test Directory Changes`;
  const genes = await renderGenes(entA, entB, s.seen || C.inForce(relA), relB === LATEST ? today() : C.inForce(relB));
  let detail = C.summary({ code, seen: s.seen, relA: s.seen ? seenRel : relA, relB, releases: RELEASES, events: rec.events, entA, entB, links: linksNamed, genes });
  const noCrit = [relA, relB].filter(r => r.noCriteria);
  if (noCrit.length) detail = detail.replace(/\nDates are when/, `\nThe eligibility criteria documents for ${noCrit.map(r => r.label).join(' and ')} are not held yet; criteria were compared using ${[critA, critB].filter(Boolean).map(r => r.label).join(' and ')}.\nDates are when`);
  $('#detail-text').textContent = detail;
  $('#copy-detail').onclick = () => copy(detail, '#copied-detail', 'Detailed record copied');
}

function renderCriteria(o) {
  const box = $('#r-criteria');
  const { centA, centB, critA, critB, relA, relB, changes } = o;
  const la = critA ? critA.label : '', lb = critB ? critB.label : '';
  const pdf = (r, e) => r && r.links && r.links.pdf && e && e.page ? ` <a class="no-print small" href="${esc(r.links.pdf)}#page=${e.page}">${esc(r.label)} criteria PDF, page ${e.page}</a>` : '';
  let head = `<div class="result-head"><h3>Eligibility criteria: what changed</h3>
    <div class="seg no-print" role="group" aria-label="How to show the criteria">
      ${[['changes', 'Changes only'], ['side', 'Side by side'], ['inline', 'Full text']].map(([m, l]) => `<button type="button" data-mode="${m}" aria-pressed="${critMode === m}">${l}</button>`).join('')}</div></div>`;
  const subst = [];
  if (critA && critA !== relA) subst.push(`the ${esc(relA.label)} criteria document isn't held, so ${esc(critA.label)} is used`);
  if (critB && critB !== relB) subst.push(`the ${esc(relB.label)} criteria document isn't held yet, so ${esc(critB.label)} (the latest held) is used${relB.links && relB.links.pdf ? ` – <a href="${esc(relB.links.pdf)}">${esc(relB.label)} PDF</a>` : ''}`);
  if (subst.length) head += `<div class="notice">Note: ${subst.join('; ')}.</div>`;
  if (!centA || !centB) {
    box.innerHTML = head + `<p class="muted">${!centA && !centB ? 'No criteria held for this code in either version.' : `${esc(o.code)} has no criteria in ${esc(!centA ? la : lb)}.`}</p>`
      + [[critA, centA], [critB, centB]].filter(([, e]) => e).map(([r, e]) => `<h4>${esc(r.label)}${pdf(r, e)}</h4><pre class="crit">${esc(C.criteriaText(e.criteria))}</pre>`).join('');
  } else if (critA === critB) {
    box.innerHTML = head + `<p class="muted">Both dates use the same criteria (${esc(la)}), so there is nothing to compare.</p>`;
  } else {
    const ta = C.criteriaText(centA.criteria), tb = C.criteriaText(centB.criteria);
    const ops = C.diffLines(ta, tb);
    const legend = `<p class="legend">${changes.length ? `${changes.length} change${changes.length > 1 ? 's' : ''} to the wording between ${esc(la)} and ${esc(lb)}: <del>removed</del> and <ins>added</ins> words are marked. Changes only in spacing or punctuation are not counted.` : `The wording is the same in ${esc(la)} and ${esc(lb)} (apart from spacing and punctuation).`}</p>`;
    let body;
    if (critMode === 'side') body = `<div class="side"><div><h4>${esc(la)}${pdf(critA, centA)}</h4><pre class="crit">${diffHtml(ops, 'a')}</pre></div><div><h4>${esc(lb)}${pdf(critB, centB)}</h4><pre class="crit">${diffHtml(ops, 'b')}</pre></div></div>`;
    else if (critMode === 'inline') body = `<p class="hint">Original documents:${pdf(critA, centA)} ·${pdf(critB, centB)}</p><pre class="crit">${diffHtml(ops, 'all')}</pre>`;
    else body = changesHtml(changes, la, lb, 8) + `<p class="hint no-print">Original documents:${pdf(critA, centA)} ·${pdf(critB, centB)}</p>`;
    box.innerHTML = head + legend + body;
    wireShowMore(box);
  }
  box.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    critMode = b.dataset.mode;
    try { localStorage.setItem('tdh-crit2', critMode); } catch (e) { /* storage blocked */ }
    renderCriteria(o);
  });
}

function renderTimeline(code, relA, relB, seen) {
  const rec = TDH_CHANGES[code];
  const ia = RELEASES.indexOf(relA), ib = RELEASES.indexOf(relB);
  const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia];
  const evBy = Object.fromEntries(rec.events.map(e => [e.r, e]));
  let hidden = 0;
  const items = [];
  RELEASES.forEach((r, i) => {
    const e = evBy[r.id];
    const inRange = i > lo && i <= hi;
    const end = i === ia ? (seen ? 'In force when seen' : 'Then') : i === ib ? (relB === LATEST ? 'Now' : 'Compared with') : '';
    const kinds = e ? e.k : [];
    const main = kinds.filter(k => MAIN_KINDS.includes(k));
    const present = rec.present.includes(r.id);
    if (!showAll && !end && !(inRange && main.length)) { hidden++; return; }
    const shown = showAll ? kinds : main;
    const cls = [main.length ? 'changed' : '', end ? 'endpoint' : '', !inRange && !end ? 'outside' : ''].join(' ');
    const details = (e && e.d || []).filter(d => showAll || !/^Eligibility criteria compared with/.test(d));
    let body = '';
    if (details.length) body += `<ul class="details-list">${details.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`;
    if (e && e.n) body += `<p class="note">NHS England's note: “${esc(e.n)}”</p>`;
    if (kinds.includes('criteria')) body += `<button type="button" class="link no-print" data-step="${esc(r.id)}">Show the wording change</button><div class="step" id="step-${esc(r.id)}" hidden></div>`;
    if (!e && present && i > 0) body += r.noCriteria ? '<p class="note">No change to the tests or name. Its criteria document is not held yet, so wording changes can’t be checked.</p>' : '<p class="note">No change.</p>';
    if (!present && !(e && e.k.includes('removed'))) body += '<p class="note">Code not in this version.</p>';
    items.push(`<li class="${cls}"><span class="when">${esc(C.relDate(r))}</span> – ${esc(r.label)}${end ? ` <strong>(${end})</strong>` : ''}${chips(shown)}${body}</li>`);
  });
  const box = $('#timeline');
  box.innerHTML = `<p class="hint">${showAll ? 'Every version held, oldest first.' : 'Versions that changed the criteria, the tests, the name or the code itself, between the two dates.'} Each change is dated by the version that first published it.</p>
    <ol class="timeline">${items.join('')}</ol>
    <button type="button" class="link no-print" id="toggle-all">${showAll ? 'Show main changes only' : `Show every version${hidden ? ` (${hidden} more, including minor changes to pathway, specialties and overlapping indications)` : ''}`}</button>`;
  $('#toggle-all').onclick = () => { showAll = !showAll; renderTimeline(code, relA, relB, seen); };
  box.querySelectorAll('[data-step]').forEach(b => b.onclick = async () => {
    const div = $('#step-' + CSS.escape(b.dataset.step));
    if (!div.hidden) { div.hidden = true; b.textContent = 'Show the wording change'; return; }
    const r = relById(b.dataset.step);
    const i = RELEASES.indexOf(r);
    const prev = RELEASES.slice(0, i).reverse().find(x => !x.noCriteria && rec.present.includes(x.id));
    div.hidden = false; div.innerHTML = '<p class="muted">Loading…</p>'; b.textContent = 'Hide the wording change';
    if (!prev) { div.innerHTML = '<p class="muted">No earlier criteria held to compare with.</p>'; return; }
    const [P, R] = await Promise.all([release(prev.id), release(r.id)]);
    const a = P.byCode[code], c = R.byCode[code];
    const ch = a && c ? C.lineChanges(C.criteriaText(a.criteria), C.criteriaText(c.criteria)) : [];
    div.innerHTML = `<p class="hint">Compared with ${esc(relName(prev))}.</p>` + changesHtml(ch, prev.label, r.label, 6);
    wireShowMore(div);
  });
}

const PDF_FIELDS = ['family', 'scope'];
const TEST_FIELDS = [['target', 'Target'], ['method', 'Method'], ['commissioning', 'Commissioning'], ['family', 'Family structure'], ['scope', 'Scope']];
function testsTable(entA, entB, centA, centB) {
  // family structure and scope come from the criteria PDF: fill them in from the release the criteria came from
  const withPdf = (ent, cent) => (ent ? ent.tests : []).map(t => {
    const ct = cent && cent !== ent ? (cent.tests || []).find(x => x.id === t.id) : null;
    return ct ? { ...t, family: t.family || ct.family, scope: t.scope || ct.scope } : t;
  });
  const ta = Object.fromEntries(withPdf(entA, centA).map(t => [t.id, t]));
  const tb = Object.fromEntries(withPdf(entB, centB).map(t => [t.id, t]));
  const ids = [...new Set([...Object.keys(ta), ...Object.keys(tb)])].sort((x, y) => parseFloat(x.split('.')[1]) - parseFloat(y.split('.')[1]));
  if (!ids.length) return '<p class="muted">No tests in either version.</p>';
  const rows = ids.map(id => {
    const a = ta[id], b = tb[id];
    const cls = !a ? 'is-added' : !b ? 'is-removed' : '';
    const unknown = (k, x, y) => PDF_FIELDS.includes(k) && (!x || !y);
    const status = !a ? 'Added' : !b ? 'Removed' : TEST_FIELDS.some(([k]) => !unknown(k, a[k], b[k]) && C.norm(a[k]) !== C.norm(b[k])) ? 'Changed' : 'Same';
    const cells = TEST_FIELDS.map(([k, label]) => {
      const x = a ? a[k] || '' : '', y = b ? b[k] || '' : '';
      const td = v => `<td data-label="${label}"><span>${v}</span></td>`;
      if (!a) return td(esc(y));
      if (!b) return td(esc(x));
      if (unknown(k, x, y)) return td(esc(x || y));
      return td(C.norm(x) === C.norm(y) ? esc(y) : diffHtml(C.diffText(x, y), 'all'));
    }).join('');
    return `<tr class="${cls}"><td class="code" data-label="Test"><span>${esc(id)}</span></td><td data-label="Status"><span><span class="status ${status.toLowerCase()}">${status}</span></span></td>${cells}</tr>`;
  });
  return `<div class="table-wrap"><table class="tests"><thead><tr><th>Test</th><th>Status</th>${TEST_FIELDS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function otherSections(centA, centB, critA, critB) {
  if (!centA || !centB) return `<p class="muted">${critA === critB ? 'Both dates use the same criteria document, so these sections are unchanged.' : 'Not held for both versions.'}</p>`;
  const parts = [['overlapping', 'Overlapping indications (other codes to consider)'], ['pathway', 'Where in the pathway'], ['specialties', 'Who can request it']];
  const html = parts.map(([k, label]) => {
    const asText = e => { const v = e && e[k]; return Array.isArray(v) ? v.map(x => '• ' + x).join('\n') : (v || ''); };
    const x = asText(centA), y = asText(centB);
    if (!x && !y) return '';
    const same = C.norm(x).replace(/\s+/g, '') === C.norm(y).replace(/\s+/g, '');
    return `<details><summary><strong>${label}</strong> – ${same ? 'no change' : 'changed'}</summary><pre class="crit">${same ? esc(y) : diffHtml(C.diffLines(x, y), 'all')}</pre></details>`;
  }).join('');
  return `<p class="hint">Compared between ${esc(critA.label)} and ${esc(critB.label)}.</p>` + (html || '<p class="muted">Not given in these versions.</p>');
}

async function renderGenes(entA, entB, dateA, dateB) {
  const box = $('#r-genes');
  const pa = new Set((entA ? entA.tests : []).flatMap(t => t.panels || []));
  const pb = new Set((entB ? entB.tests : []).flatMap(t => t.panels || []));
  const ids = [...new Set([...pa, ...pb])];
  const head = '<h3>Genes</h3><p class="hint">For tests that use a PanelApp panel: the genes on the panel that laboratories test (green genes, at the version signed off for NHS testing) on each date. Genes listed by name are in the Tests table above.</p>';
  if (!ids.length) { box.innerHTML = head + '<p class="muted">These tests don’t use a PanelApp panel in either version.</p>'; return []; }
  const genes = [];
  const blocks = [];
  for (const pid of ids) {
    const p = await panel(pid);
    if (!p) { blocks.push(`<div class="notice">PanelApp panel ${pid}: gene history not available.</div>`); continue; }
    const inA = pa.has(pid), inB = pb.has(pid);
    const a = inA ? C.panelAt(p, dateA) : null, b = inB ? C.panelAt(p, dateB) : null;
    const d = a && b ? C.setDiff(a.genes, b.genes) : { added: [], removed: [] };
    genes.push({ panel: pid, name: p.name, a, b, inA, inB, diff: d });
    const at = (x, dt, used) => !used ? 'panel not used then (genes listed in the test target)' : x ? `<b>${x.genes.size}</b> genes <span class="hint">(signed off ${esc(C.longDate(x.date))})</span>` : `no signed-off gene list yet${p.signoffs.length ? ` <span class="hint">(first signed off ${esc(C.longDate(p.signoffs[0].date))})</span>` : ''}`;
    const list = (arr, tag) => arr.length ? `<p class="genes"><strong>${tag} (${arr.length}):</strong> ${arr.map(g => `<span>${tag === 'Added' ? '<ins>' : '<del>'}${esc(g)}${tag === 'Added' ? '</ins>' : '</del>'}</span>`).join('')}</p>` : '';
    blocks.push(`<div class="ver panel-box"><strong><a href="https://panelapp.genomicsengland.co.uk/panels/${pid}/">${esc(p.name)}</a></strong> <span class="hint">PanelApp ${pid}</span>
      <div>Then (${esc(C.longDate(dateA))}): ${at(a, dateA, inA)}</div><div>Now (${esc(C.longDate(dateB))}): ${at(b, dateB, inB)}</div>
      ${a && b ? (d.added.length || d.removed.length ? list(d.added, 'Added') + list(d.removed, 'Removed') : '<p class="note">No change in the genes tested.</p>') : ''}</div>`);
  }
  box.innerHTML = head + blocks.join('');
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
      ${e.d ? `<ul class="details-list">${e.d.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}${e.n ? `<p class="note">NHS England's note: “${esc(e.n)}”</p>` : ''}</li>`);
  }
  $('#release-result').innerHTML = `<div class="card"><h2>${esc(relName(r))}</h2>
    <p class="hint">${prev ? `Compared with the previous version, ${esc(relName(prev))}.` : 'This is the earliest version held, so only its own change notes are listed.'} ${docLinks(r)}</p>
    <p>${rows.length} code${rows.length === 1 ? '' : 's'}.</p><ul class="choice-list">${rows.join('')}</ul></div>`;
}
$('#rel').addEventListener('change', () => { location.hash = `view=release&rel=${encodeURIComponent($('#rel').value)}${$('#rel-filter').value ? '&kind=' + $('#rel-filter').value : ''}`; });
$('#rel-filter').addEventListener('change', () => $('#rel').dispatchEvent(new Event('change')));

// ---------- versions view ----------
function renderVersions() {
  $('#versions-view').innerHTML = `<div class="card"><h2>Versions held</h2>
    <p>Each row is one publication of the rare and inherited disease directory (spreadsheet and eligibility criteria). A version is taken to be in force from the day it was published until the next one.</p>
    ${RELEASES.slice().reverse().map(r => `<div class="rel-row"><strong>${esc(r.label)}</strong><div>Published ${esc(C.relDate(r))}${r.inForceFrom ? '; in force ' + esc(C.longDate(r.inForceFrom)) : ''}.
      ${r.counts.indications} R codes, ${r.counts.tests} tests.${r.noCriteria ? ' <span class="chip removed">criteria document not held yet</span>' : ''}
      <div class="hint">Directory ${esc(r.directory || '')}${r.criteria ? '; criteria ' + esc(r.criteria) : ''}</div><div class="hint">${docLinks(r)}</div></div></div>`).join('')}</div>`;
}

// ---------- routing ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const q = Object.fromEntries(h.split('&').filter(Boolean).map(p => p.includes('=') ? p.split(/=(.*)/s).slice(0, 2) : ['code', p]));
  const view = q.view || 'compare';
  document.querySelectorAll('.tab').forEach(t => { if (t.dataset.view === view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  $('#compare-view').hidden = view !== 'compare'; $('#release-view').hidden = view !== 'release'; $('#versions-view').hidden = view !== 'versions';
  if (view === 'release') renderRelease(q.rel, q.kind);
  else if (view === 'versions') renderVersions();
  else if (q.code && /^R\d+$/i.test(q.code)) { $('#choices').hidden = true; renderCompare({ code: q.code.toUpperCase(), seen: q.seen || '', from: q.from, to: q.to }); }
  else { $('#result').innerHTML = ''; $('#start').hidden = false; document.title = 'Test Directory Changes'; }
}

function init() {
  fillReleaseSelects();
  $('#stats').textContent = `Every version from ${C.relDate(RELEASES[0])} to ${C.relDate(LATEST)} (${RELEASES.length} versions)`;
  $('#built').textContent = `Data built ${C.longDate(TDH_BUILT)}.`;
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeprint', () => document.querySelectorAll('details:not(.detail-record)').forEach(d => d.open = true));
  route();
}
init();
