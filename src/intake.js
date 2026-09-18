(function (L) {
  'use strict';

  const STOP = new Set(('a about above after again against all also although always am among an and another any are around as at be became because been before being below between both but by came can cannot could did do does doing done down during each either else enough even ever every few first for from further had has have having he her here hers herself him himself his how however i if in into is it its itself just last least less let like made make many may me might more most much must my myself never next no nor not now of off often on once one only or other others our ours ourselves out over own per rather said same second see seem seen several shall she should since so some still such than that the their theirs them themselves then there therefore these they this those though three through thus to too toward two under until up upon us use used using very was we were what when where whether which while who whom whose why will with within without would yes yet you your yours yourself yourselves example examples chapter section figure table following called given note notes lecture lectures course page pages number value values also thing things way ways part parts case cases fact point points show shows shown means mean used uses form forms general generally particular simply often usually sometimes well nothing something anything everything everyone someone anyone compute computed computes occur occurs occurred written write writes suppose supposed roughly exactly directly itself either neither whose become becomes became remain remains remained instead already always almost among along whereas within without toward towards later earlier again further rather quite really actually indeed hence whence thereby therein whereby overall likewise similarly otherwise nevertheless nonetheless although despite unless until since while whether').split(/\s+/));

  const words = (text) => (String(text || '').match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g) || []).length;

  // ---------- normalisation ----------
  const PAGE = '\u241E'; // page separator the PDF reader inserts; survives normalisation so page offsets can be recovered
  function normalize(text) {
    let t = String(text || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n');
    // words broken across a line with a hyphen ("proba-\nbility")
    t = t.replace(/([A-Za-z]{2,})-\n(?=[a-z])/g, '$1');
    // running headers / footers / page numbers: short lines repeated four or more times
    const lines = t.split('\n');
    const counts = {};
    for (const ln of lines) { const k = ln.trim(); if (k && k.length < 90) counts[k] = (counts[k] || 0) + 1; }
    const kept = lines.filter((ln) => { const k = ln.trim(); return k === PAGE || !(k && k.length < 90 && counts[k] >= 4); });
    t = kept.map((l) => l.replace(/\s+$/, '')).join('\n');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  // ---------- segmentation ----------
  const HEAD_RE = [
    /^#{1,4}\s+\S/,
    /^(chapter|unit|part|section|lecture|module|lesson|week)\s+[0-9ivx]+/i,
    /^\d{1,2}(\.\d{1,2}){0,2}\s+[A-Z]/,
  ];
  function isAllCaps(s) { const w = s.split(/\s+/); return w.length >= 2 && /^[A-Z0-9\s\-:,&'()]+$/.test(s) && /[A-Z]{2}/.test(s); }
  function isTitleCase(s) {
    const w = s.split(/\s+/).filter(Boolean);
    if (w.length < 2 || w.length > 10) return false;
    const caps = w.filter((x) => /^[A-Z]/.test(x) || /^(of|the|and|in|to|a|an|for|on|with|by)$/.test(x));
    return caps.length === w.length && /^[A-Z]/.test(w[0]);
  }
  function headingTitle(line) {
    return line.replace(/^#{1,6}\s*/, '').replace(/\s+#+$/, '').trim();
  }
  // ---------- page-level front / back matter (PDFs) ----------
  // A page is judged by its shape: a contents page is lines ending in page numbers, an index is short lines
  // with comma-separated numbers, a copyright page names its ISBN. Front matter = every page up to the last
  // such page in the opening stretch; back matter = from the first index-like page in the closing stretch.
  function pageShape(pg) {
    const lines = pg.split('\n').map((l) => l.trim()).filter(Boolean);
    const w = words(pg);
    if (w < 25) return 'blank';
    const head = lines.slice(0, 4).join(' ');
    if (/^(table of )?contents\b/i.test(head) || /\bcontents\b/i.test(lines[0] || '')) return 'toc';
    if (w < 450 && /©|copyright|all rights reserved|isbn[\s:-]*[\d-]|printed in|library of congress|first (published|edition)|typeset in/i.test(pg)) return 'copyright';
    if (/^index\b/i.test(lines[0] || '')) return 'index';
    const ending = lines.filter((l) => /(\.{3,}|…)\s*\d{1,4}$/.test(l) || (/\s\d{1,4}$/.test(l) && l.length < 80) || /^\d{1,4}$/.test(l)).length;
    if (lines.length >= 8 && ending / lines.length >= 0.4) return 'toc';
    const indexy = lines.filter((l) => /\d{1,4}(\s*[,–-]\s*\d{1,4})+\s*$/.test(l) && l.length < 70).length;
    if (lines.length >= 15 && indexy / lines.length >= 0.3) return 'index';
    if (/^(bibliography|references|works cited|glossary|answers to|solutions to|about the author)/i.test(lines[0] || '')) return 'back';
    return 'body';
  }
  // returns char ranges (in the joined text) that are front or back matter, one per source with page offsets
  function pageRoles(sources) {
    const ranges = [];
    for (const src of sources || []) {
      if (!src.pageStarts || src.pageStarts.length < 3 || !src.text) continue;
      const n = src.pageStarts.length; const base = src.offset || 0;
      const shapes = src.pageStarts.map((st, i) => pageShape(src.text.slice(st, i + 1 < n ? src.pageStarts[i + 1] : src.text.length)));
      const opening = Math.max(3, Math.min(20, Math.ceil(n * 0.12)));
      let frontEnd = -1;
      for (let i = 0; i < opening; i++) if (['toc', 'copyright', 'blank'].includes(shapes[i])) frontEnd = i;
      if (frontEnd >= 0 && frontEnd < n - 1) ranges.push({ role: 'front', start: base, end: base + src.pageStarts[frontEnd + 1], pages: [1, frontEnd + 1] });
      const closing = Math.max(n - Math.max(3, Math.ceil(n * 0.15)), frontEnd + 2);
      let backStart = -1;
      for (let i = closing; i < n; i++) if (['index', 'back'].includes(shapes[i])) { backStart = i; break; }
      if (backStart > 0) ranges.push({ role: 'back', start: base + src.pageStarts[backStart], end: base + src.text.length, pages: [backStart + 1, n] });
    }
    return ranges;
  }

  // Segments from a PDF's own outline: one segment per top-level bookmark (depth 0, or depth 1 when the
  // top level is just "Part I/II"), each spanning from its page to the next entry's page.
  function segmentFromOutline(text, src) {
    const ol = (src.outline || []).filter((o) => o.page >= 1 && o.page <= src.pageStarts.length);
    if (ol.length < 3) return null;
    const top = ol.filter((o) => o.depth === 0);
    const useDepth = top.length >= 3 && top.length <= 80 ? 0 : 1;
    const entries = ol.filter((o) => o.depth === useDepth).filter((o, i, a) => i === 0 || o.page > a[i - 1].page);
    if (entries.length < 3 || entries.length > 120) return null;
    const base = src.offset || 0;
    const at = (page) => base + src.pageStarts[page - 1];
    const segs = [];
    if (entries[0].page > 1) segs.push({ title: 'Front matter', start: base, end: at(entries[0].page) });
    entries.forEach((e, i) => segs.push({ title: e.title, start: at(e.page), end: i + 1 < entries.length ? at(entries[i + 1].page) : base + src.text.length }));
    // sub-entries become the chunk sub-headings
    const subs = ol.filter((o) => o.depth === useDepth + 1);
    const out = segs.map((g, i) => ({ i, title: g.title, start: g.start, end: g.end, words: words(text.slice(g.start, g.end)), subheads: subs.filter((o) => at(o.page) > g.start && at(o.page) < g.end).map((o) => ({ title: o.title, at: at(o.page) })), fromOutline: true }));
    return out.filter((g) => g.end > g.start);
  }

  function segment(text, opts = {}) {
    text = String(text || '');
    // a single PDF with a usable outline is segmented by it; everything else by heading detection
    const srcs = opts.sources || [];
    if (srcs.length === 1 && srcs[0].outline && srcs[0].pageStarts) {
      const out = segmentFromOutline(text, srcs[0]);
      if (out) {
        // merge tiny outline entries (a two-page preface) into their neighbour, then classify
        for (let i = out.length - 1; i > 0; i--) if (out[i].words < 80) { out[i - 1].end = out[i].end; out[i - 1].words += out[i].words; out.splice(i, 1); }
        // page-shape detection still cuts off an index or contents run hiding inside a bookmarked chapter
        const forced = pageRoles(srcs);
        for (const r of forced) for (const at of [r.start, r.end]) { const g = out.find((x) => x.start < at && at < x.end); if (g) { const tail = Object.assign({}, g, { start: at, end: g.end, subheads: g.subheads.filter((h) => h.at >= at) }); g.end = at; g.subheads = g.subheads.filter((h) => h.at < at); out.splice(out.indexOf(g) + 1, 0, tail); } }
        out.forEach((g, i) => { g.i = i; g.words = words(text.slice(g.start, g.end)); });
        classify(out, text);
        for (const g of out) for (const r of forced) if (g.start >= r.start && g.end <= r.end) { g.role = r.role; if (r.role === 'back' && !BACK.test(g.title)) g.title = 'Back matter'; }
        if (!out.some((g) => g.role === 'body')) out.forEach((g) => { g.role = 'body'; });
        return out;
      }
    }
    const lines = text.split('\n');
    // char offset of each line
    const offsets = []; let pos = 0;
    for (const ln of lines) { offsets.push(pos); pos += ln.length + 1; }
    const heads = [];
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].trim();
      if (!s || s.length >= 90 || /\.$/.test(s) || /^\d+$/.test(s)) continue;
      let ok = HEAD_RE.some((re) => re.test(s)) || isAllCaps(s);
      if (!ok && isTitleCase(s)) {
        const next = (lines[i + 1] || '').trim();
        const next2 = (lines[i + 2] || '').trim();
        ok = next === '' ? next2.length >= 60 || next2 === '' : next.length >= 100;
        if (ok && i > 0 && (lines[i - 1] || '').trim() !== '') ok = false; // a Title Case line inside a paragraph is prose
      }
      if (ok) heads.push({ line: i, title: headingTitle(s), start: offsets[i] });
    }
    let segs = [];
    const spansOk = () => {
      if (heads.length < 3) return false;
      const gaps = [];
      for (let i = 0; i < heads.length; i++) {
        const end = i + 1 < heads.length ? heads[i + 1].start : text.length;
        gaps.push(words(text.slice(heads[i].start, end)));
      }
      gaps.sort((a, b) => a - b);
      return gaps[Math.floor(gaps.length / 2)] >= 60;
    };
    if (spansOk()) {
      const front = text.slice(0, heads[0].start);
      if (words(front) >= 120) segs.push({ title: 'Front matter', start: 0, end: heads[0].start });
      for (let i = 0; i < heads.length; i++) {
        const start = (i === 0 && !segs.length) ? 0 : heads[i].start;
        const end = i + 1 < heads.length ? heads[i + 1].start : text.length;
        segs.push({ title: heads[i].title, start, end });
      }
      // merge tiny segments into a neighbour
      let changed = true;
      while (changed && segs.length > 1) {
        changed = false;
        for (let i = 0; i < segs.length; i++) {
          if (words(text.slice(segs[i].start, segs[i].end)) < 80) {
            if (i > 0) { segs[i - 1].end = segs[i].end; segs.splice(i, 1); }
            else { segs[1].start = segs[0].start; segs.splice(0, 1); } // a tiny opening piece is a title page; keep the real heading
            changed = true; break;
          }
        }
      }
      // cap at 60 by merging the smallest adjacent pairs
      while (segs.length > 60) {
        let best = 0, bestW = Infinity;
        for (let i = 0; i + 1 < segs.length; i++) {
          const w = words(text.slice(segs[i].start, segs[i + 1].end));
          if (w < bestW) { bestW = w; best = i; }
        }
        segs[best].end = segs[best + 1].end; segs.splice(best + 1, 1);
      }
    } else {
      // paragraph chunks of ~1,200 words, larger when the document is long (at most ~60 segments)
      const chunkWords = Math.max(1200, Math.ceil(words(text) / 60));
      const paras = [];
      let p = 0;
      for (const m of text.matchAll(/\n\s*\n/g)) { paras.push({ start: p, end: m.index }); p = m.index + m[0].length; }
      paras.push({ start: p, end: text.length });
      let cur = null, n = 1;
      for (const para of paras) {
        if (!cur) cur = { title: `Part ${n}`, start: para.start, end: para.end };
        else cur.end = para.end;
        if (words(text.slice(cur.start, cur.end)) >= chunkWords) { segs.push(cur); cur = null; n++; }
      }
      if (cur) { if (segs.length && words(text.slice(cur.start, cur.end)) < 300) segs[segs.length - 1].end = cur.end; else segs.push(cur); }
      if (!segs.length) segs.push({ title: 'Part 1', start: 0, end: text.length });
    }
    // PDF front/back matter found page by page: cut the segments at those boundaries and fix their roles
    const forced = pageRoles(opts.sources);
    for (const r of forced) {
      const cut = (at) => { for (let i = 0; i < segs.length; i++) { const g = segs[i]; if (g.start < at && at < g.end) { const tail = { title: g.title, start: at, end: g.end }; g.end = at; segs.splice(i + 1, 0, tail); break; } } };
      cut(r.start); cut(r.end);
    }
    const out = segs.map((s, i) => ({ i, title: s.title, start: s.start, end: s.end, words: words(text.slice(s.start, s.end)) }));
    // sub-headings inside a segment name the bite-sized chunks; any detected heading that is not a segment boundary counts
    const bounds = new Set(out.map((s) => s.start));
    for (const s of out) s.subheads = heads.filter((h) => h.start > s.start && h.start < s.end && !bounds.has(h.start)).map((h) => ({ title: h.title, at: h.start }));
    classify(out, text);
    for (const s of out) for (const r of forced) if (s.start >= r.start && s.end <= r.end) { s.role = r.role; if (r.role === 'front' && !/contents|preface|copyright|title/i.test(s.title)) s.title = s.title === 'Part 1' || /^Part \d+$/.test(s.title) ? 'Front matter' : s.title; }
    if (!out.some((g) => g.role === 'body')) out.forEach((g) => { g.role = 'body'; });
    return out;
  }

  // ---------- key terms ----------
  function keyTerms(text, n = 40) {
    text = String(text || '');
    const freq = {}, capMid = {}, bigrams = {};
    const sentences = text.split(/(?<=[.!?])\s+|\n+/);
    for (const s of sentences) {
      const toks = s.match(/[A-Za-z][A-Za-z\-]{3,}/g) || [];
      toks.forEach((t, idx) => {
        const lc = t.toLowerCase();
        if (STOP.has(lc) || /^-|-$/.test(lc)) return;
        freq[lc] = (freq[lc] || 0) + 1;
        if (idx > 0 && /^[A-Z]/.test(t)) capMid[lc] = true;
        // "sample space", "random variable": a bigram of two content words is usually the real concept
        const nx = toks[idx + 1] && toks[idx + 1].toLowerCase();
        if (nx && !STOP.has(nx) && s.includes(t + ' ' + toks[idx + 1])) { const bg = lc + ' ' + nx; bigrams[bg] = (bigrams[bg] || 0) + 1; }
      });
      // capitalised phrases, not sentence-initial
      const ph = s.match(/(?:^|\s)([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2})/g) || [];
      for (let raw of ph) {
        raw = raw.trim();
        if (s.trim().startsWith(raw)) continue;
        const lc = raw.toLowerCase();
        if (raw.split(' ').every((w) => STOP.has(w.toLowerCase()))) continue;
        freq[lc] = (freq[lc] || 0) + 1; capMid[lc] = true;
      }
    }
    for (const [bg, f] of Object.entries(bigrams)) if (f >= 3) { freq[bg] = f * 1.8; capMid[bg] = true; }
    // fold plurals into their singular so "event" and "events" count once
    for (const t of Object.keys(freq)) {
      if (/s$/.test(t) && !/ss$/.test(t) && freq[t.slice(0, -1)]) { freq[t.slice(0, -1)] += freq[t]; capMid[t.slice(0, -1)] = capMid[t.slice(0, -1)] || capMid[t]; delete freq[t]; }
    }
    return Object.entries(freq)
      .map(([t, f]) => [t, f * (capMid[t] ? 1.6 : 1) * (t.length >= 8 ? 1.3 : 1)])
      .filter(([t, sc]) => freq[t] >= 2 || sc >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([t]) => t);
  }
  // ---------- front / back matter ----------
  // Contents, prefaces, indexes and the like classify the book but are never studied.
  const FRONT = /^(?:\d+[.)]?\s*)?(table of contents|contents|preface|foreword|acknowledg\w*|copyright|dedication|about the authors?|how to use this book|list of (figures|tables)|title page|frontispiece)\b/i;
  const BACK = /^(?:\d+[.)]?\s*)?(index|glossary|bibliography|references|works cited|answers( to (selected )?exercises)?|solutions( to (selected )?exercises)?|credits|colophon)\b/i;
  function looksLikeToc(body) {
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 8) return false;
    const numbered = lines.filter((l) => /(\.{3,}|…)\s*\d{1,4}$/.test(l) || (/\s\d{1,4}$/.test(l) && l.length < 90)).length;
    return numbered / lines.length >= 0.5;
  }
  function classify(segments, text) {
    for (const g of segments) {
      const body = text.slice(g.start, g.end);
      const title = (g.title || '').trim();
      if (FRONT.test(title) || looksLikeToc(body)) g.role = 'front';
      else if (BACK.test(title)) g.role = 'back';
      else g.role = 'body';
    }
    const firstBody = segments.findIndex((g) => g.role === 'body');
    // a short untitled opening before the first real section is front matter (title page, epigraph)
    for (const g of segments) if (g.i < firstBody && g.role === 'body' && g.words < 150) g.role = 'front';
    if (!segments.some((g) => g.role === 'body')) segments.forEach((g) => { g.role = 'body'; }); // never schedule nothing
    return segments;
  }
  L.intake = { words, normalize, segment, classify, pageShape, pageRoles, keyTerms, STOP };

  // ---------- offline analysis ----------
  const SUBJECTS = [
    [/probabilit|statistic|random variable|bayes/i, 'STAT', 'Statistics'],
    [/calculus|algebra|theorem|integral|derivative|matrix|matrices/i, 'MATH', 'Mathematics'],
    [/physics|newton|momentum|quantum|kinematic|thermodynamic/i, 'PHYS', 'Physics'],
    [/chemistr|molecule|reaction|acid|organic/i, 'CHEM', 'Chemistry'],
    [/biolog|cell|protein|gene|organism|evolution/i, 'BIOL', 'Biology'],
    [/medic|clinical|patient|diagnos|pharmac|anatom/i, 'MED', 'Medicine'],
    [/histor|century|empire|revolution|dynasty/i, 'HIST', 'History'],
    [/econom|market|inflation|demand|supply/i, 'ECON', 'Economics'],
    [/computer|algorithm|program|software|data structure|compiler/i, 'CS', 'Computer Science'],
    [/\blaw\b|legal|contract|statute|court/i, 'LAW', 'Law'],
    [/philosoph|ethic|epistem|metaphys/i, 'PHIL', 'Philosophy'],
    [/language|grammar|linguist|syntax|phonolog/i, 'LING', 'Linguistics'],
    [/psycholog|cognit|behaviou?r|perception/i, 'PSYC', 'Psychology'],
    [/engineer|circuit|mechanic|structural|signal/i, 'ENGR', 'Engineering'],
    [/business|marketing|management|strateg|finance/i, 'BUS', 'Business'],
  ];
  function repairUnits(units, segCount) {
    let us = (Array.isArray(units) ? units : []).map((u) => {
      const seg = Array.isArray(u.segments) ? u.segments.map(Number) : [];
      let from = Number.isFinite(seg[0]) ? seg[0] : 0, to = Number.isFinite(seg[1]) ? seg[1] : from;
      if (to < from) [from, to] = [to, from];
      return {
        title: String(u.title || '').trim() || 'Unit',
        segments: [L.clamp(from, 0, segCount - 1), L.clamp(to, 0, segCount - 1)],
        topics: (Array.isArray(u.topics) ? u.topics : []).map(String).filter(Boolean),
        objectives: (Array.isArray(u.objectives) ? u.objectives : []).map(String).filter(Boolean),
        relativeSize: L.clamp(Math.round(Number(u.relativeSize) || 3), 1, 5),
      };
    }).sort((a, b) => a.segments[0] - b.segments[0]);
    const out = [];
    let cursor = 0;
    for (const u of us) {
      if (u.segments[1] < cursor) continue; // fully overlapped by the previous unit
      u.segments[0] = cursor; // fill any gap by extending forward from where we are
      if (u.segments[1] < u.segments[0]) continue;
      out.push(u); cursor = u.segments[1] + 1;
    }
    if (!out.length) out.push({ title: 'Unit 1', segments: [0, segCount - 1], topics: [], objectives: [], relativeSize: 3 });
    out[out.length - 1].segments[1] = segCount - 1;
    return out;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function objectivesFor(topics, title) {
    const t = topics.length ? topics : [title.toLowerCase()];
    const a = t[0], b = t[1] || t[0], c = t[2] || t[0];
    return [
      `Explain ${a} and state the conditions under which it applies.`,
      `Apply ${b} to a worked problem drawn from the material and interpret the result.`,
      `Compare ${a} with ${c} and identify where each one fails.`,
    ];
  }
  function difficultyOf(text) {
    const sents = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
    const toks = text.match(/[A-Za-z]{2,}/g) || [];
    const avgSent = toks.length / Math.max(1, sents.length);
    const avgWord = L.sum(toks.map((w) => w.length)) / Math.max(1, toks.length);
    const longShare = toks.filter((w) => w.length >= 9).length / Math.max(1, toks.length);
    const lines = text.split('\n').filter(Boolean);
    const formulaShare = lines.filter((l) => /[=∑∫^]|\d\/\d/.test(l)).length / Math.max(1, lines.length);
    let score = 0;
    score += avgSent > 30 ? 2 : avgSent > 23 ? 1 : 0;
    score += avgWord > 5.8 ? 1.5 : avgWord > 5.2 ? 0.75 : 0;
    score += longShare > 0.18 ? 1.5 : longShare > 0.13 ? 0.75 : 0;
    score += formulaShare > 0.35 ? 1 : formulaShare > 0.15 ? 0.5 : 0;
    return L.clamp(Math.round(1 + score), 1, 5);
  }
  function analyzeOffline({ text, segments, hint, sourceName }) {
    text = String(text || '');
    const allSegments = segments;
    const bodySegs = segments.filter((g) => (g.role || 'body') === 'body');
    if (bodySegs.length) segments = bodySegs;
    const firstHead = segments.find((s) => s.title && !/^Part \d+$/.test(s.title) && s.title !== 'Front matter');
    const docTitle = (/^#\s+(.+)$/m.exec(text.slice(0, 4000)) || [])[1];
    // the first short line of the document is usually its title (a PDF's cover, a chapter heading)
    const firstLine = (text.split('\n').map((l) => l.trim()).find((l) => l.length >= 4 && l.length <= 90 && !/[.:;]$/.test(l)) || '').replace(/^#+\s*/, '');
    let title = (hint || '').trim() || (docTitle || '').trim() || firstLine || (firstHead ? firstHead.title : '') || (sourceName || 'Untitled course').replace(/\.[a-z0-9]+$/i, '');
    title = title.replace(/^\d+(\.\d+)*\s+/, '');
    const probe = (title + '\n' + text.slice(0, 20000));
    let subjectCode = null, subject = 'General studies';
    for (const [re, code, name] of SUBJECTS) if (re.test(probe)) { subjectCode = code; subject = name; break; }
    if (!subjectCode) subjectCode = (title.replace(/[^A-Za-z]/g, '').slice(0, 4) || 'GEN').toUpperCase();
    const difficulty = difficultyOf(text);
    const level = difficulty <= 2 ? 'introductory' : difficulty === 3 ? 'intermediate' : 'advanced';
    // units: contiguous groups of roughly equal words, 4–10
    const total = L.sum(segments.map((s) => s.words));
    const nUnits = segments.length <= 8 ? segments.length : Math.min(segments.length, L.clamp(Math.round(total / 2500), 4, 10));
    const target = total / nUnits;
    const groups = [];
    if (nUnits >= segments.length) segments.forEach((s) => groups.push({ from: s.i, to: s.i, words: s.words }));
    else {
      let cur = null;
      for (const s of segments) {
        if (!cur) cur = { from: s.i, to: s.i, words: s.words };
        else if (cur.words >= target * 0.8 && groups.length < nUnits - 1) { groups.push(cur); cur = { from: s.i, to: s.i, words: s.words }; }
        else { cur.to = s.i; cur.words += s.words; }
      }
      if (cur) groups.push(cur);
    }
    const maxW = Math.max(...groups.map((g) => g.words));
    const units = groups.map((g, k) => {
      const utext = text.slice(allSegments[g.from].start, allSegments[g.to].end);
      const topics = keyTerms(utext, 5);
      const first = allSegments[g.from];
      const t = first.title && !/^Part \d+$/.test(first.title) ? first.title : `Unit ${k + 1}: ${topics.slice(0, 2).map(cap).join(' and ') || 'Reading'}`;
      return { title: t, segments: [g.from, g.to], topics, objectives: objectivesFor(topics, t), relativeSize: L.clamp(Math.round((g.words / maxW) * 5), 1, 5) };
    });
    const names = units.slice(0, 3).map((u) => u.title).filter((n) => n.toLowerCase() !== title.toLowerCase());
    const through = names.length ? ` works through ${names.slice(0, -1).join(', ')}${names.length > 1 ? ' and ' : ''}${names[names.length - 1]}${units.length > 3 ? ' and more' : ''}` : ` covers its material in ${units.length} unit${units.length === 1 ? '' : 's'}`;
    const description = `${title}${through}, with weekly quizzes and problem sets drawn directly from the material. The course is set at ${level} level and ends with a written final examination.`;
    // unit ranges use original indices; non-body segments inside a range are skipped when scheduling
    return { title, subjectCode, subject, level, difficulty, description, prerequisites: [], units: repairUnits(units, allSegments.length) };
  }
  L.intake.analyzeOffline = analyzeOffline;
  L.intake.repairUnits = repairUnits;

  // ---------- parsers ----------
  function htmlToText(html, base) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,nav,footer,header,aside,noscript,svg,iframe').forEach((n) => n.remove());
    const title = (doc.querySelector('title')?.textContent || '').trim();
    const out = [];
    const walk = (node) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) { out.push(ch.textContent.replace(/\s+/g, ' ')); continue; }
        if (ch.nodeType !== 1) continue;
        const tag = ch.tagName.toLowerCase();
        const m = /^h([1-6])$/.exec(tag);
        if (m) { out.push(`\n\n${'#'.repeat(Math.min(4, +m[1]))} ${ch.textContent.replace(/\s+/g, ' ').trim()}\n\n`); continue; }
        if (tag === 'li') { out.push('\n- '); walk(ch); out.push('\n'); continue; }
        if (/^(p|div|section|article|blockquote|pre|tr|ul|ol|table|figure|dd|dt)$/.test(tag)) { out.push('\n\n'); walk(ch); out.push('\n\n'); continue; }
        if (tag === 'br') { out.push('\n'); continue; }
        walk(ch);
      }
    };
    walk(doc.body || doc);
    return { title: title || base || 'Web page', text: out.join('').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n') };
  }
  function make(name, kind, text, extra = {}, alreadyNormalized = false) {
    if (!alreadyNormalized) text = normalize(text);
    return Object.assign({ id: L.uid('src'), name, kind, text, words: words(text), chars: text.length }, extra);
  }
  const MAX_PAGES = 1500;
  async function fromFile(file, onProgress) {
    const name = file.name || 'file';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const progress = onProgress || (() => {});
    if (ext === 'pdf' || file.type === 'application/pdf') {
      if (!window.pdfjsLib) throw new Error('PDF reading needs the pdf.js library, which did not load. Check your connection or paste the text.');
      const bytes = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const numPages = pdf.numPages;
      if (numPages > MAX_PAGES) throw new Error(`${name} has ${numPages} pages; the limit is ${MAX_PAGES}. Split it and enrol the parts as one course.`);
      const pages = [];
      for (let p = 1; p <= numPages; p++) {
        if (p === 1 || p % 10 === 0 || p === numPages) { progress(`Reading page ${p} of ${numPages}…`); await new Promise((r) => setTimeout(r, 0)); }
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        let line = '', lastY = null, buf = [];
        for (const it of content.items) {
          if (!('str' in it)) continue;
          const y = it.transform ? Math.round(it.transform[5]) : null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) { buf.push(line.trim()); line = ''; }
          line += it.str + (it.hasEOL ? '\n' : ' ');
          lastY = y;
        }
        buf.push(line.trim());
        pages.push(buf.join('\n'));
        page.cleanup();
      }
      // bookmarks, when the publisher included them, give exact chapter boundaries
      let outline = [];
      try {
        const raw = await pdf.getOutline();
        const walk = async (items, depth) => { for (const it of items || []) { let pageIndex = null; try { const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest; if (dest && dest[0]) pageIndex = await pdf.getPageIndex(dest[0]); } catch (e) { /* unresolvable */ } if (pageIndex != null && it.title) outline.push({ title: it.title.replace(/\s+/g, ' ').trim(), page: pageIndex + 1, depth }); if (it.items && it.items.length && depth < 2) await walk(it.items, depth + 1); } };
        await walk(raw, 0);
      } catch (e) { outline = []; }
      pdf.destroy();
      if (pages.join('').replace(/\s+/g, '').length < 200) throw new Error('That PDF has no extractable text (it may be scanned). Try a text export.');
      progress('Cleaning up the text…');
      // normalise the whole document once (running headers repeat across pages), then recover page offsets from the separators
      const norm = normalize(pages.join('\n\n' + PAGE + '\n\n'));
      const pieces = norm.split(PAGE);
      const pageStarts = []; const parts = []; let pos = 0;
      for (const piece of pieces) { const t = piece.replace(/^\n+/, '').replace(/\n+$/, ''); pageStarts.push(pos); parts.push(t); pos += t.length + 2; }
      const src = make(name, 'pdf', parts.join('\n\n'), { pages: numPages, pageStarts, outline: outline.length >= 3 ? outline : null }, true);
      src.file = { kind: 'pdf', name, bytes };
      return src;
    }
    if (ext === 'docx') {
      if (!window.mammoth) throw new Error('Word reading needs the mammoth library, which did not load. Check your connection or paste the text.');
      const buf = await file.arrayBuffer();
      const r = await window.mammoth.extractRawText({ arrayBuffer: buf });
      const src = make(name, 'docx', r.value || '');
      try { const h = await window.mammoth.convertToHtml({ arrayBuffer: buf }); src.file = { kind: 'html', name, html: h.value || '' }; } catch (e) { /* text only */ }
      return src;
    }
    const raw = await file.text();
    if (ext === 'html' || ext === 'htm' || /text\/html/.test(file.type)) { const h = htmlToText(raw, name); const src = make(h.title || name, 'html', h.text); src.file = { kind: 'html', name, html: raw }; return src; }
    if (ext === 'md' || ext === 'markdown') return make(name, 'markdown', raw);
    return make(name, 'text', raw);
  }
  async function fetchText(url, ms = 10000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = r.headers.get('content-type') || '';
      const body = await r.text();
      return { ct, body };
    } finally { clearTimeout(t); }
  }
  async function fromUrl(url) {
    url = String(url || '').trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let host = url; try { host = new URL(url).hostname + new URL(url).pathname; } catch (e) { /* keep */ }
    if (location.protocol !== 'file:') {
      try {
        const { ct, body } = await fetchText(url);
        if (/text\/html/.test(ct)) { const h = htmlToText(body, host); if (h.text.replace(/\s+/g, '').length > 200) { const src = make(h.title, 'url', h.text, { url }); src.file = { kind: 'html', name: h.title, html: body }; return src; } }
        else if (/text\/plain|markdown|application\/json/.test(ct)) return make(host, 'url', body, { url });
        throw new Error('not text');
      } catch (e) { /* fall through to the reader proxy */ }
    }
    try {
      const { body } = await fetchText('https://r.jina.ai/' + url, 20000);
      const m = /^Title:\s*(.+)$/m.exec(body);
      const text = body.replace(/^(Title|URL Source|Published Time):.*$/gm, '').replace(/^Markdown Content:\s*$/m, '');
      if (text.replace(/\s+/g, '').length < 200) throw new Error('empty');
      return make(m ? m[1].trim() : host, 'url', text, { url });
    } catch (e) {
      throw new Error('Could not fetch that page (blocked by the site or offline). Save it as PDF or paste the text.');
    }
  }
  L.intake.fromFile = fromFile;
  L.intake.fromUrl = fromUrl;
  L.intake.fromText = (text, name = 'Pasted text') => make(name, /^\s*#/.test(text) ? 'markdown' : 'text', text);
  L.intake.htmlToText = htmlToText;
})(window.L);
