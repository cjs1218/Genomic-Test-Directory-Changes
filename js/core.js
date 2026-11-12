/* Logic with no page code, so it can be tested in Node: which release was in force on a date, word-level differences,
   what changed between two releases and the plain-English summary. */
(function (root) {
  'use strict';

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function longDate(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return d ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
  }

  /** A release's publication date as written: '8 April 2026', or 'October 2018' when only the month is stated. */
  function relDate(r) {
    if (r.datePrecision === 'month') { const [y, m] = r.published.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; }
    return longDate(r.published);
  }

  /** True when a date falls in the month of a release whose exact publication day is not stated. */
  function sameMonthUnsure(r, iso) { return !!(r && r.datePrecision === 'month' && iso && iso.slice(0, 7) === r.published.slice(0, 7)); }

  function inForce(r) { return r.inForceFrom || r.published; }

  /** The release in force on an ISO date (the latest one in force on or before it), or null if the date is earlier than all. */
  function releaseAt(releases, iso) {
    let found = null;
    for (const r of releases) if (inForce(r) <= iso) found = r;
    return found;
  }

  /** Releases after `from` up to and including `to` (by position in the ordered list). */
  function between(releases, fromId, toId) {
    const i = releases.findIndex(r => r.id === fromId), j = releases.findIndex(r => r.id === toId);
    return releases.slice(i + 1, j + 1);
  }

  // ---------- word-level differences (Myers O(ND)) ----------
  function tokens(s) { return String(s).match(/\n|[^\S\n]+|[A-Za-z0-9À-ɏ]+|[^\sA-Za-z0-9À-ɏ]/g) || []; }

  /** Edit script between two token arrays: [[op, text]] with op 0 same, -1 only in a, 1 only in b; runs merged. */
  function diffTokens(a, b) {
    // trim the common start and end first: most criteria change in only a few places
    let pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    let suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
    const n = A.length, m = B.length, max = n + m, off = max + 1;
    const v = new Int32Array(2 * max + 3), trace = [];
    let done = n === 0 && m === 0;
    for (let d = 0; d <= max && !done; d++) {
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && A[x] === B[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) { done = true; break; }
      }
    }
    const ops = [];
    let x = n, y = m;
    for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
      const vv = trace[d], k = x - y;
      const prevK = (k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1])) ? k + 1 : k - 1;
      const px = vv[off + prevK], py = px - prevK;
      while (x > px && y > py) { ops.push([0, A[--x]]); y--; }
      if (d > 0) { if (x === px) ops.push([1, B[--y]]); else ops.push([-1, A[--x]]); }
    }
    while (x > 0 && y > 0) { ops.push([0, A[--x]]); y--; }
    ops.reverse();
    const all = a.slice(0, pre).map(t => [0, t]).concat(ops, a.slice(a.length - suf).map(t => [0, t]));
    return tidyOps(all);
  }

  /** Merge runs, and fold a single space between two changes into them so edits read as phrases, not confetti. */
  function tidyOps(ops) {
    const merged = [];
    for (const [op, t] of ops) {
      const last = merged[merged.length - 1];
      if (last && last[0] === op) last[1] += t; else merged.push([op, t]);
    }
    const out = [];
    for (let i = 0; i < merged.length; i++) {
      const [op, t] = merged[i];
      if (op === 0 && /^[^\S\n]+$/.test(t) && i > 0 && i < merged.length - 1 && merged[i - 1][0] !== 0 && merged[i + 1][0] !== 0) {
        out.push([-1, t], [1, t]); continue;
      }
      out.push([op, t]);
    }
    const res = [];
    // regroup: within a changed stretch put deletions before insertions
    let i = 0;
    while (i < out.length) {
      if (out[i][0] === 0) { res.push(out[i]); i++; continue; }
      let del = '', ins = '';
      while (i < out.length && out[i][0] !== 0) { if (out[i][0] < 0) del += out[i][1]; else ins += out[i][1]; i++; }
      if (del) res.push([-1, del]);
      if (ins) res.push([1, ins]);
    }
    return res;
  }

  function diffText(a, b) { return diffTokens(tokens(a), tokens(b)); }

  function similar(x, y) {
    const wx = new Set(norm(x).split(/[^a-z0-9<>≥≤%]+/).filter(Boolean)), wy = new Set(norm(y).split(/[^a-z0-9<>≥≤%]+/).filter(Boolean));
    if (!wx.size || !wy.size) return false;
    let both = 0; wx.forEach(w => { if (wy.has(w)) both++; });
    return both / Math.max(wx.size, wy.size) >= 0.5;
  }

  /** Line-first difference for multi-line text: whole lines added or removed stay whole; a changed line is compared word by word. */
  function diffLines(a, b) {
    const la = String(a).split('\n'), lb = String(b).split('\n');
    if (!a) la.length = 0;
    if (!b) lb.length = 0;
    const withBreaks = ls => ls.map((l, n) => n < ls.length - 1 ? l + '\n' : l);
    const lineOps = diffTokens(withBreaks(la), withBreaks(lb)).flatMap(([op, t]) => t.split(/(?<=\n)/).filter(Boolean).map(l => [op, l]));
    const out = [];
    let i = 0;
    while (i < lineOps.length) {
      if (lineOps[i][0] === 0) { out.push(lineOps[i]); i++; continue; }
      const dels = [], ins = [];
      while (i < lineOps.length && lineOps[i][0] !== 0) { (lineOps[i][0] < 0 ? dels : ins).push(lineOps[i][1]); i++; }
      // pair each removed line with the next similar added line, in order; the rest are whole-line changes
      let j = 0;
      for (const d of dels) {
        const k = ins.findIndex((x, n) => n >= j && similar(d, x));
        if (k < 0) { out.push([-1, d]); continue; }
        for (; j < k; j++) out.push([1, ins[j]]);
        out.push(...diffText(d, ins[k])); j = k + 1;
      }
      for (; j < ins.length; j++) out.push([1, ins[j]]);
    }
    const merged = [];
    for (const o of out) { const l = merged[merged.length - 1]; if (l && l[0] === o[0]) l[1] += o[1]; else merged.push([o[0], o[1]]); }
    return merged.filter(o => o[1]);
  }

  /** Letters and digits only: two lines that agree on these differ only in spacing or punctuation. */
  const MARKER = /^\s*(?:\d{1,2}[.)]|[a-z][.)]|\(?[ivx]+[.)]|\([a-z0-9]+\)|[•\-])\s*/;
  /** Letters and digits only, without the list marker: two lines that agree on these differ only in spacing,
      punctuation or numbering ("e." becoming "f." when an item is added above). */
  function wordsOnly(s) { return norm(String(s).replace(MARKER, '')).replace(/[^a-z0-9<>≥≤%]+/g, ''); }

  /**
   * What changed, line by line, between two multi-line texts: [{kind: 'changed'|'removed'|'added', a, b, ops, after}].
   * 'changed' pairs a removed line with a similar added one (ops: word differences); 'after' is the unchanged line just
   * before, for context. Changes only in spacing or punctuation are left out.
   */
  function lineChanges(a, b) {
    const la = a ? String(a).split('\n') : [], lb = b ? String(b).split('\n') : [];
    const lineOps = diffTokens(la.map(l => l + '\n'), lb.map(l => l + '\n'))
      .flatMap(([op, t]) => t.split(/(?<=\n)/).filter(Boolean).map(l => [op, l.replace(/\n$/, '')]));
    const out = [];
    let i = 0, after = '';
    while (i < lineOps.length) {
      if (lineOps[i][0] === 0) { if (lineOps[i][1].trim()) after = lineOps[i][1]; i++; continue; }
      const dels = [], ins = [];
      while (i < lineOps.length && lineOps[i][0] !== 0) { (lineOps[i][0] < 0 ? dels : ins).push(lineOps[i][1]); i++; }
      let ctx = after;
      const used = new Set();
      const start = out.length;
      for (const d of dels) {
        const k = ins.findIndex((x, n) => !used.has(n) && similar(d, x));
        if (k < 0) { if (d.trim()) out.push({ kind: 'removed', a: d, after: ctx }); continue; }
        used.add(k);
        if (wordsOnly(d) !== wordsOnly(ins[k])) out.push({ kind: 'changed', a: d, b: ins[k], ops: diffText(d.trim(), ins[k].trim()), after: ctx });
      }
      ins.forEach((x, n) => { if (!used.has(n) && x.trim()) out.push({ kind: 'added', b: x, after: ctx }); });
      for (let n = start + 1; n < out.length; n++) out[n].after = '';  // context only for the first change in a run
    }
    // a line moved elsewhere shows as removed + added with the same words: not a change in wording
    const rem = out.filter(c => c.kind === 'removed').map(c => wordsOnly(c.a));
    const add = out.filter(c => c.kind === 'added').map(c => wordsOnly(c.b));
    return out.filter(c => !(c.kind === 'removed' && add.includes(wordsOnly(c.a))) && !(c.kind === 'added' && rem.includes(wordsOnly(c.b))));
  }

  /** The release whose criteria are used for a release: itself if its criteria are loaded, else the nearest earlier one, else the nearest later one. */
  function criteriaSource(releases, rel) {
    if (!rel || !rel.noCriteria) return rel;
    const i = releases.indexOf(rel);
    for (let j = i - 1; j >= 0; j--) if (!releases[j].noCriteria) return releases[j];
    for (let j = i + 1; j < releases.length; j++) if (!releases[j].noCriteria) return releases[j];
    return null;
  }

  /** Criteria rows [level, marker, text] as text: one line each, indented by level. */
  function criteriaText(items) {
    return (items || []).map(([lv, m, t]) => '  '.repeat(lv || 0) + (m ? m + ' ' : '') + t).join('\n');
  }

  function norm(s) {
    return String(s || '').replace(/[‐-―−]/g, '-').replace(/[‘’‛`]/g, "'").replace(/[“”]/g, '"')
      .replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // ---------- genes ----------
  /** Green genes of a panel (data from data/panels/<id>.js) at its signed-off version in force on a date, or null before the first sign-off. */
  function panelAt(panel, iso) {
    let genes = new Set(), at = null;
    for (const s of panel.signoffs) {
      if (s.date > iso) break;
      s.add.forEach(g => genes.add(g)); s.rem.forEach(g => genes.delete(g)); at = s;
    }
    return at ? { v: at.v, date: at.date, genes } : null;
  }

  function setDiff(a, b) {
    return { added: [...b].filter(g => !a.has(g)).sort(), removed: [...a].filter(g => !b.has(g)).sort() };
  }

  // ---------- plain-English summary ----------
  const KIND_TEXT = {
    added: 'first published', removed: 'removed from the directory', name: 'renamed', criteria: 'eligibility criteria changed',
    tests: 'tests changed', panels: 'PanelApp panel(s) for the tests changed', overlapping: 'overlapping indications changed',
    pathway: '“where in pathway” changed', specialties: 'requesting specialties changed', noted: 'change noted in the spreadsheet'
  };

  function relText(r) { return `${r.label} (published ${relDate(r)}${r.inForceFrom ? ', in force from ' + longDate(r.inForceFrom) : ''})`; }

  /**
   * opts: {code, seen (ISO date or ''), relA, relB (release objects; relA may be null), releases, events (this code's events),
   *        entA, entB (indications or undefined), links (TDH_LINKS entries for this code), genes: [{panel, name, a, b, diff}]}
   */
  function summary(o) {
    const L = [];
    const ent = o.entB || o.entA;
    const name = ent ? ent.name : '';
    L.push(`${o.code}${name ? ' – ' + name : ''}`);
    if (o.seen) {
      L.push(o.relA ? `Seen on ${longDate(o.seen)}: the rare and inherited disease National Genomic Test Directory in force was ${relText(o.relA)}.`
        : `Seen on ${longDate(o.seen)}: this is earlier than the earliest version loaded here (${relText(o.releases[0])}), which is used for the comparison below.`);
      if (sameMonthUnsure(o.relA, o.seen)) L.push(`The patient was seen in the month ${o.relA.label} was published, and the exact publication day is not stated: check whether the previous version still applied on that date.`);
    } else if (o.relA) L.push(`Compared from ${relText(o.relA)}.`);
    const relA = o.relA || o.releases[0];
    L.push(`Compared with ${relText(o.relB)}.`);
    if (!o.entA && o.entB) {
      const first = o.events.find(e => e.k.includes('added'));
      const r = first && o.releases.find(x => x.id === first.r);
      L.push(`${o.code} was not in the directory in force then${r ? `; it was first published in ${relText(r)}` : ''}.`);
    }
    if (o.entA && !o.entB) {
      const gone = o.events.find(e => e.k.includes('removed'));
      const r = gone && o.releases.find(x => x.id === gone.r);
      L.push(`${o.code} is not in ${o.relB.label}${r ? `: it was removed in ${relText(r)}` : ''}.`);
      for (const l of o.links || []) {
        const cite = l.source && /NHS England/.test(l.source) ? ` (${l.source})` : '';
        if (l.to && l.to.length) L.push(`${l.auto ? 'Possibly replaced by' : 'Replaced by'} ${l.to.join(', ')}${l.note ? ' – ' + l.note : ''}${cite}.`);
        else if (l.note) L.push(`${l.note[0].toUpperCase()}${l.note.slice(1)}${cite}.`);
      }
    }
    if (o.entA && o.entB && norm(o.entA.name) !== norm(o.entB.name)) L.push(`Then called “${o.entA.name}”; now “${o.entB.name}”.`);
    const span = between(o.releases, relA.id, o.relB.id).map(r => r.id);
    const evs = o.events.filter(e => span.includes(e.r) && e.k.some(k => k !== 'noted'));
    if (!span.length) L.push('Both dates fall under the same version, so nothing changed between them.');
    else if (!evs.length) L.push(`The entry for ${o.code} did not change in the ${span.length} version${span.length > 1 ? 's' : ''} published since.`);
    else {
      L.push(`The entry for ${o.code} changed in ${evs.length} of the ${span.length} version${span.length > 1 ? 's' : ''} published since:`);
      for (const e of evs) {
        const r = o.releases.find(x => x.id === e.r);
        let s = `• ${r.label} (${relDate(r)}): ${e.k.filter(k => k !== 'noted').map(k => KIND_TEXT[k] || k).join('; ')}`;
        const tests = (e.d || []).filter(d => /^R\d+\.\d+ /.test(d));
        if (tests.length) s += ` (${tests.join('; ')})`;
        if (e.n) s += `. Directory note: “${e.n}”`;
        L.push(s + '.');
      }
    }
    for (const g of o.genes || []) {
      if (!g.a && !g.b) continue;
      const at = (x, used) => used === false ? 'panel not used for this code (genes listed in the test target)' : x ? `${x.genes.size} green genes (signed-off v${x.v}, ${longDate(x.date)})` : 'no GMS signed-off version';
      let s = `Genes – ${g.name} (PanelApp ${g.panel}): then ${at(g.a, g.inA)}; now ${at(g.b, g.inB)}`;
      if (g.a && g.b) {
        const parts = [];
        if (g.diff.added.length) parts.push(`${g.diff.added.length} added${g.diff.added.length <= 12 ? ' (' + g.diff.added.join(', ') + ')' : ''}`);
        if (g.diff.removed.length) parts.push(`${g.diff.removed.length} removed${g.diff.removed.length <= 12 ? ' (' + g.diff.removed.join(', ') + ')' : ''}`);
        s += parts.length ? `; ${parts.join(', ')}` : '; no change in green genes';
      }
      L.push(s + '.');
    }
    L.push('Dates are when each version was published. Based on the published directory documents; check the linked documents for the full wording before replying.');
    return L.join('\n');
  }

  const quote = s => `“${String(s).replace(MARKER, '').trim()}”`;
  /** "March 2019 (2019/20)" or "8 April 2026 (v9)": when a release was published, then its name. */
  const relSays = r => `${relDate(r)} (${r.label})`;
  const monthOf = r => r.datePrecision === 'month' ? relDate(r) : relDate(r).replace(/^\d+ /, '');

  /**
   * The short answer for a reply, in plain English. o: {code, name, seen, relA (null if before all), relB, releases,
   * events, entA, entB, links (with named codes), critA, critB (releases the criteria came from), changes (lineChanges
   * of the criteria), maxChanges}
   */
  function shortAnswer(o) {
    const L = [], relA = o.relA || o.releases[0];
    L.push(`${o.code}${o.name ? ' – ' + o.name : ''}`);
    const latest = o.relB === o.releases[o.releases.length - 1] ? 'The current version was' : 'It is compared with the version';
    if (o.seen) L.push(o.relA ? `Seen on ${longDate(o.seen)}, when the directory published in ${relSays(o.relA)} applied. ${latest} published ${relSays(o.relB)}.`
      : `Seen on ${longDate(o.seen)}, before the earliest version held here (${relSays(o.releases[0])}). ${latest} published ${relSays(o.relB)}.`);
    else L.push(`Comparing the directory published ${relSays(relA)} with the one published ${relSays(o.relB)}.`);
    if (o.seen && sameMonthUnsure(o.relA, o.seen)) L.push(`(${o.relA.label} was published in ${relDate(o.relA)} and the exact day is not stated, so the previous version may still have applied.)`);
    const span = between(o.releases, relA.id, o.relB.id).map(r => r.id);
    const evs = o.events.filter(e => span.includes(e.r));
    const rel = id => o.releases.find(r => r.id === id);
    const when = list => list.map(e => monthOf(rel(e.r))).join(', ');
    if (!o.entA && o.entB) {
      const first = o.events.find(e => e.k.includes('added'));
      L.push(`${o.code} did not exist then${first ? `: it was first published in ${monthOf(rel(first.r))} (${rel(first.r).label})` : ''}.`);
    }
    if (o.entA && !o.entB) {
      const gone = o.events.find(e => e.k.includes('removed'));
      L.push(`${o.code} has since been retired${gone ? ` (${monthOf(rel(gone.r))}, ${rel(gone.r).label})` : ''}.`);
      for (const l of o.links || []) {
        const cite = l.source && /NHS England/.test(l.source) ? ` (${l.source})` : '';
        if (l.to && l.to.length) L.push(`${l.auto ? 'It may now be covered by' : 'It is now covered by'} ${l.to.join(' and ')}${l.note ? ': ' + l.note : ''}${cite}.`);
        else if (l.note) L.push(`${l.note[0].toUpperCase()}${l.note.slice(1)}${cite}.`);
      }
    }
    if (o.entA && o.entB && norm(o.entA.name) !== norm(o.entB.name)) L.push(`It was then called “${o.entA.name}”.`);
    const crit = evs.filter(e => e.k.includes('criteria'));
    const tests = evs.filter(e => e.k.includes('tests'));
    if (o.entA && o.entB) {
      if (!span.length) L.push('No new version was published between these dates.');
      else if (!crit.length && !tests.length) L.push(`The eligibility criteria and tests have not changed in the ${span.length} version${span.length > 1 ? 's' : ''} published since.`);
      else {
        L.push(crit.length ? `The eligibility criteria changed ${crit.length} time${crit.length > 1 ? 's' : ''}: ${when(crit)}.` : 'The eligibility criteria wording has not changed.');
        if (tests.length) L.push(`The tests offered changed ${tests.length} time${tests.length > 1 ? 's' : ''}: ${when(tests)}.`);
      }
      const ch = o.changes || [];
      if (ch.length && o.critA && o.critB) {
        const sub = [];
        if (o.critA !== relA) sub.push(`the ${relA.label} criteria document is not held, so ${o.critA.label} is used`);
        if (o.critB !== o.relB) sub.push(`the ${o.relB.label} criteria document is not held yet, so ${o.critB.label} is used`);
        const via = sub.length ? ` (${sub.join('; ')})` : '';
        L.push(`What the criteria said then and say now${via}:`);
        for (const c of ch.slice(0, o.maxChanges || 6)) {
          if (c.kind === 'changed') L.push(`• Then: ${quote(c.a)}\n  Now: ${quote(c.b)}`);
          else if (c.kind === 'removed') L.push(`• No longer included: ${quote(c.a)}`);
          else L.push(`• Added: ${quote(c.b)}`);
        }
        if (ch.length > (o.maxChanges || 6)) L.push(`• … and ${ch.length - (o.maxChanges || 6)} more change${ch.length - (o.maxChanges || 6) > 1 ? 's' : ''} to the wording.`);
      }
    }
    L.push('Dates are when each version was published. Please check the full wording in the linked documents before replying.');
    return L.join('\n');
  }

  const api = { lineChanges, criteriaSource, shortAnswer, longDate, relDate, sameMonthUnsure, inForce, releaseAt, between, tokens, diffTokens, diffText, diffLines, criteriaText, norm, panelAt, setDiff, summary, KIND_TEXT };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TDHCore = api;
})(typeof self !== 'undefined' ? self : this);
