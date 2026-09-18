(function (L) {
  'use strict';

  const D = L.date;
  const DAY = 86400000;
  const COLORS = ['#22d3ee', '#f5b12b', '#fb7185', '#a78bfa', '#60a5fa', '#f472b6', '#fb923c', '#a3e635']; // never the brand green
  const SCALE = [[93, 'A', 4.0], [90, 'A−', 3.7], [87, 'B+', 3.3], [83, 'B', 3.0], [80, 'B−', 2.7], [77, 'C+', 2.3], [73, 'C', 2.0], [70, 'C−', 1.7], [67, 'D+', 1.3], [63, 'D', 1.0], [60, 'D−', 0.7], [-Infinity, 'F', 0]];
  const KIND_TITLE = { quiz: 'Quiz', pset: 'Problem set', midterm: 'Midterm examination', final: 'Final examination', project: 'Term project' };
  // the registrar's three pacings, defined by daily effort; the term length follows from the material
  const PACES = {
    condensed: { label: 'Condensed', minutesPerDay: 120, studyDays: [0, 1, 2, 3, 4, 5], blurb: 'Two hours a day, six days a week. The shortest term the material allows.' },
    standard: { label: 'Standard', minutesPerDay: 60, studyDays: [0, 1, 2, 3, 4], blurb: 'An hour a day on weekdays. The pace of a regular term.' },
    extended: { label: 'Extended', minutesPerDay: 30, studyDays: [0, 1, 2, 3, 4], blurb: 'Half an hour a day on weekdays. Light and long.' },
  };
  const MIN_HPW = 2.5;

  class RegistrarError extends Error {
    constructor(code, message, extra = {}) { super(message); this.name = 'RegistrarError'; this.code = code; Object.assign(this, extra); }
  }

  const iso = (d) => D.isoLocal(d);
  const at = (dateStr, h, m = 0, s = 0) => iso(D.setTime(D.parse(dateStr), h, m, s));
  const ms = (v) => D.parse(v).getTime();

  // ---------- queries ----------
  const course = (id) => L.S.courses.find((c) => c.id === id);
  function courseState(c) {
    if (c.state === 'withdrawn') return 'withdrawn';
    const today = D.iso(L.today());
    if (today < c.term.start) return 'upcoming';
    if (today > c.term.end) return 'completed';
    return 'running';
  }
  function courses(filter = 'all') {
    const all = L.S.courses.slice().sort(L.by('createdAt'));
    if (filter === 'all') return all;
    if (filter === 'active') return all.filter((c) => ['upcoming', 'running'].includes(courseState(c)));
    return all.filter((c) => ['completed', 'withdrawn'].includes(courseState(c)));
  }
  function currentWeek(c) {
    const diff = Math.floor((L.today().getTime() - ms(c.term.start)) / DAY);
    if (diff < 0) return 0;
    return Math.min(c.term.weeks + 1, Math.floor(diff / 7) + 1);
  }
  const week = (c, n) => c.weeks.find((w) => w.n === n);
  const overlaps = (a, b) => a.term.start <= b.term.end && b.term.start <= a.term.end;

  function budget() {
    const weekly = Number(L.S.settings.weeklyHours) || 12;
    const committed = L.sum(courses('active').map((c) => c.plan.hoursPerWeek));
    return { weekly, committed, available: Math.max(0, weekly - committed) };
  }

  // ---------- planning ----------
  // Study hours the material needs: read + notes + practice + review; every headed section is at least a lecture's worth.
  function hoursFor({ words, segments, analysis }) {
    const readHours = words / 9000;
    const diffMult = [0.85, 0.95, 1.05, 1.2, 1.4][analysis.difficulty - 1];
    // the per-section floor matters for dense short notes; for a long book the word count carries the estimate
    return Math.max(6, Math.min(segments.length * 2.5, 40), readHours * 3.5 * diffMult);
  }

  // Break one segment into bite-sized reading chunks: at its sub-headings when it has them, else at paragraph
  // boundaries so no chunk runs past `maxMin` minutes. Never straddles a segment.
  function chunkSegment(text, seg, maxMin) {
    const minutesFor = (from, to) => L.clamp(Math.round(L.intake.words(text.slice(from, to)) / 70), 5, 60);
    const pieces = [];
    const cuts = [seg.start, ...(seg.subheads || []).map((h) => h.at).filter((a) => a > seg.start && a < seg.end), seg.end];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const from = cuts[i], to = cuts[i + 1];
      const title = i === 0 ? seg.title : (seg.subheads.find((h) => h.at === from) || {}).title || seg.title;
      if (minutesFor(from, to) <= maxMin) { pieces.push({ title, from, to }); continue; }
      // split long pieces at paragraph boundaries into roughly equal parts
      const body = text.slice(from, to);
      const paras = []; let p = 0;
      for (const m of body.matchAll(/\n\s*\n/g)) { paras.push([from + p, from + m.index]); p = m.index + m[0].length; }
      paras.push([from + p, to]);
      const parts = Math.ceil(minutesFor(from, to) / maxMin);
      const target = L.intake.words(body) / parts;
      let cur = null, acc = 0, n = 1;
      for (const [a, b] of paras) {
        if (!cur) cur = [a, b]; else cur[1] = b;
        acc += L.intake.words(text.slice(a, b));
        if (acc >= target * 0.9 && n < parts) { pieces.push({ title: `${title} · part ${n}`, from: cur[0], to: cur[1] }); cur = null; acc = 0; n++; }
      }
      if (cur) pieces.push({ title: parts > 1 ? `${title} · part ${n}` : title, from: cur[0], to: cur[1] });
    }
    let kept = pieces.filter((p) => L.intake.words(text.slice(p.from, p.to)) > 0);
    // a tiny opening piece (a title page, an intro line) joins the piece after it
    if (kept.length > 1 && L.intake.words(text.slice(kept[0].from, kept[0].to)) < 80) { kept[1].from = kept[0].from; kept.shift(); }
    // tiny sub-sections merge with their neighbours until a chunk is worth sitting down for
    const merged = [];
    for (const p of kept) {
      const last = merged[merged.length - 1];
      if (last && minutesFor(last.from, last.to) < 12 && minutesFor(last.from, p.to) <= maxMin) { last.to = p.to; last.title = last.title.replace(/ …$/, '') + ' …'; }
      else merged.push(Object.assign({}, p));
    }
    kept = merged;
    return kept.map((p) => Object.assign(p, { minutes: minutesFor(p.from, p.to) }));
  }

  // a chunk title fits on two phone lines: drop markdown hashes and long numbering, cap the length
  function shortTitle(t) {
    t = String(t || '').replace(/^#+\s*/, '').replace(/\s+/g, ' ').replace(/\s*…$/, '').trim();
    if (t.length > 64) t = t.slice(0, 61).replace(/\s+\S*$/, '') + '…';
    return t;
  }
  function buildPlan({ analysis, segments, text, sources, words, paceKey }) {
    const pace = PACES[paceKey];
    const b = budget();
    if (b.available < MIN_HPW) {
      const running = courses('active').sort(L.by((c) => c.term.end));
      const nextFree = running.length ? running[0].term.end : null;
      throw new RegistrarError('budget', `Your timetable is full: ${b.available % 1 ? b.available.toFixed(1) : b.available} hours a week are free and a course needs at least ${MIN_HPW}.${nextFree ? ` The next course ends on ${L.fmt.date(nextFree)}.` : ''}`, { available: b.available, nextFree });
    }
    const totalHours = hoursFor({ words, segments, analysis });
    const studyDays = pace.studyDays;
    // daily effort sets the weekly load; if the budget cannot carry it, the pace is reduced to fit (and says so)
    let minutesPerDay = pace.minutesPerDay;
    let hoursPerWeek = (minutesPerDay * studyDays.length) / 60;
    let reduced = false;
    if (hoursPerWeek > b.available + 1e-9) { hoursPerWeek = Math.floor(b.available * 2) / 2; minutesPerDay = Math.floor((hoursPerWeek * 60) / studyDays.length); reduced = true; }
    const weeks = L.clamp(Math.ceil(totalHours / hoursPerWeek), 2, 52);
    const credits = hoursPerWeek >= 9 ? 4 : hoursPerWeek >= 6 ? 3 : hoursPerWeek >= 4 ? 2 : 1;
    const start = D.nextMonday(L.today());
    const term = { start: D.iso(start), end: D.iso(D.addDays(start, weeks * 7 - 1)), weeks };
    const concurrent = L.S.courses.filter((c) => c.state === 'enrolled' && overlaps(c, { term }));

    // timetable slot: one daily study block on each study day, at an hour no concurrent course uses on those days
    const rows = [9, 11, 14, 16, 18, 7, 20].map((h) => ({ days: studyDays, start: h * 60, minutes: minutesPerDay }));
    const taken = (slot) => concurrent.some((c) => c.sessions.some((s) => slot.days.includes(s.day) && slot.start < s.start + s.minutes && s.start < slot.start + slot.minutes));
    const slot = rows.find((r) => !taken(r));
    if (!slot) throw new RegistrarError('timetable', 'No timetable slot is free for this term. Wait for a course to end, or withdraw from one.');

    // weeks: pour units into weeks by relative size; the midterm week takes half a load, the final week a third
    const midWeek = weeks >= 5 ? Math.ceil(weeks / 2) : 0;
    const capacity = (n) => (n === weeks ? 0.35 : n === midWeek ? 0.5 : 1);
    const C = L.sum(Array.from({ length: weeks }, (_, i) => capacity(i + 1)));
    const units = analysis.units;
    const sizeSum = L.sum(units.map((u) => u.relativeSize));
    const shares = units.map((u) => (u.relativeSize / sizeSum) * C);
    const weeksOut = [];
    let ui = 0, uLeft = shares[0], uDone = 0;
    for (let n = 1; n <= weeks; n++) {
      let cap = capacity(n);
      const parts = [];
      while (cap > 1e-9 && ui < units.length) {
        const take = Math.min(cap, uLeft);
        const frac = take / shares[ui];
        parts.push({ unit: ui, from: uDone, to: Math.min(1, uDone + frac) });
        uDone += frac; uLeft -= take; cap -= take;
        if (uLeft <= 1e-9) { ui++; uLeft = shares[ui] || 0; uDone = 0; }
      }
      if (!parts.length && ui < units.length) parts.push({ unit: ui, from: uDone, to: uDone });
      weeksOut.push({ n, start: D.iso(D.addDays(start, (n - 1) * 7)), rawParts: parts, kind: n === weeks ? 'final' : n === midWeek ? 'midterm' : 'teaching' });
    }
    if (ui < units.length) { const tail = weeksOut[weeksOut.length - 1]; for (let k = ui; k < units.length; k++) tail.rawParts.push({ unit: k, from: k === ui ? uDone : 0, to: 1 }); }
    const partCount = {}; weeksOut.forEach((w) => w.rawParts.forEach((p) => { partCount[p.unit] = (partCount[p.unit] || 0) + 1; }));
    const partSeen = {};
    let nextSeg = 0; // segments are handed out in order so no two weeks read the same pages
    for (const w of weeksOut) {
      const parts = [];
      let wantEnd = nextSeg - 1;
      for (const p of w.rawParts) {
        const u = units[p.unit];
        const [a, z] = u.segments; const n = z - a + 1;
        wantEnd = Math.max(wantEnd, L.clamp(a + Math.ceil(p.to * n) - 1, a, z));
        partSeen[p.unit] = (partSeen[p.unit] || 0) + 1;
        parts.push({ unit: p.unit, fraction: Math.max(0, p.to - p.from), label: partCount[p.unit] > 1 ? `${u.title} · Part ${partSeen[p.unit]} of ${partCount[p.unit]}` : u.title });
      }
      const segs = [];
      for (let i = nextSeg; i <= wantEnd && i < segments.length; i++) if ((segments[i].role || 'body') === 'body') segs.push(i);
      if (!segs.length && w.n < weeks) { let j = nextSeg; while (j < segments.length && (segments[j].role || 'body') !== 'body') j++; if (j < segments.length) { segs.push(j); wantEnd = Math.max(wantEnd, j); } }
      if (segs.length) nextSeg = Math.max(nextSeg, segs[segs.length - 1] + 1); else nextSeg = Math.max(nextSeg, wantEnd + 1);
      const titles = parts.map((p) => units[p.unit].title).filter((t, i, arr) => arr.indexOf(t) === i);
      let title = titles.length <= 2 ? titles.join(' · ') : `${titles.slice(0, 2).join(' · ')} … and ${titles.length - 2} more`;
      if (w.kind === 'final') title = 'Review and final examination';
      if (w.kind === 'midterm') title = 'Midterm week · ' + title;
      w.title = title; w.parts = parts; w.segments = segs; w.objectives = parts.flatMap((p) => units[p.unit].objectives).filter((o, i, arr) => arr.indexOf(o) === i).slice(0, 6);
      delete w.rawParts;
    }
    // anything left over (rounding) goes to the last teaching week
    if (nextSeg < segments.length) { const w = weeksOut[Math.max(0, weeks - 2)]; for (let i = nextSeg; i < segments.length; i++) if ((segments[i].role || 'body') === 'body') w.segments.push(i); }

    // assessments
    const examDays = new Set();
    for (const c of concurrent) for (const a of c.assessments) if (a.kind === 'midterm' || a.kind === 'final') examDays.add(a.opensAt.slice(0, 10));
    const assessments = [];
    let qn = 0, pn = 0;
    const wk = (n) => weeksOut[n - 1].start;
    for (const w of weeksOut) {
      if (w.kind !== 'final') {
        qn++;
        assessments.push({ id: L.uid('a'), kind: 'quiz', title: `Quiz ${qn}`, week: w.n, coversWeeks: [w.n], opensAt: at(D.addDays(D.parse(w.start), 4), 8), dueAt: at(D.addDays(D.parse(w.start), 6), 23, 59, 0), closesAt: at(D.addDays(D.parse(w.start), 6), 23, 59, 0), durationMin: 15, lateAllowed: false, paper: null, attempt: null, grade: null });
      }
      if (w.n % 2 === 0 && w.kind !== 'final') {
        pn++;
        const due = at(D.addDays(D.parse(w.start), 6), 23, 59, 0);
        assessments.push({ id: L.uid('a'), kind: 'pset', title: `Problem set ${pn}`, week: w.n, coversWeeks: [w.n - 1, w.n], opensAt: at(w.start, 8), dueAt: due, closesAt: iso(D.addDays(D.parse(due), 3)), durationMin: null, lateAllowed: true, paper: null, attempt: null, grade: null });
      }
    }
    const examDate = (weekStart, prefs) => {
      for (const day of prefs) { const d = D.iso(D.addDays(D.parse(weekStart), day)); if (!examDays.has(d)) { examDays.add(d); return d; } }
      const d = D.iso(D.addDays(D.parse(weekStart), prefs[0])); examDays.add(d); return d;
    };
    let midDate = null, finalDate;
    if (midWeek) {
      midDate = examDate(wk(midWeek), [2, 3, 1]);
      assessments.push({ id: L.uid('a'), kind: 'midterm', title: 'Midterm examination', week: midWeek, coversWeeks: Array.from({ length: midWeek }, (_, i) => i + 1), opensAt: at(midDate, 9), dueAt: at(midDate, 21), closesAt: at(midDate, 21), durationMin: 75, lateAllowed: false, paper: null, attempt: null, grade: null });
    }
    if (weeks >= 8) {
      const due = at(D.addDays(D.parse(wk(weeks - 1)), 4), 23, 59, 0);
      assessments.push({ id: L.uid('a'), kind: 'project', title: 'Term project', week: weeks - 1, coversWeeks: Array.from({ length: weeks - 1 }, (_, i) => i + 1), opensAt: at(wk(3), 8), dueAt: due, closesAt: iso(D.addDays(D.parse(due), 3)), durationMin: null, lateAllowed: true, paper: null, attempt: null, grade: null });
    }
    finalDate = examDate(wk(weeks), [4, 3, 2]);
    assessments.push({ id: L.uid('a'), kind: 'final', title: 'Final examination', week: weeks, coversWeeks: weeksOut.map((w) => w.n), opensAt: at(finalDate, 9), dueAt: at(finalDate, 21), closesAt: at(finalDate, 21), durationMin: 120, lateAllowed: false, paper: null, attempt: null, grade: null });
    assessments.sort(L.by('dueAt'));

    // daily study blocks with bite-sized chunks; reading gets the larger share of each day, practice the rest
    const maxMin = L.clamp(Math.round(minutesPerDay / 3), 10, 25);
    const practiseMin = L.clamp(Math.round(minutesPerDay * 0.3), 10, 30);
    const locateIn = (from, to) => locateWith(sources, from, to);
    const sessions = [];
    let dayIndex = 0;
    let prevTitles = [];
    for (const w of weeksOut) {
      const reading = w.segments.filter((i) => (segments[i].role || 'body') === 'body').flatMap((i) => chunkSegment(text, segments[i], maxMin).map((p) => Object.assign(p, { segment: i })));
      let days = studyDays.map((day) => ({ day, date: D.iso(D.addDays(D.parse(w.start), day)) }));
      if (w.kind === 'final') days = days.filter((d) => d.date < finalDate);
      if (w.kind === 'midterm' && midDate) days = days.filter((d) => d.date !== midDate);
      if (!days.length) continue;
      // spread the week's reading across its days: each day takes its share by count, capped by the day's reading time
      const readBudget = Math.max(maxMin, Math.min(Math.ceil(L.sum(reading.map((r) => r.minutes)) / days.length), Math.round(minutesPerDay * 0.7)));
      let ri = 0;
      days.forEach((d, di) => {
        const chunks = [];
        let acc = 0;
        const share = Math.ceil((reading.length - ri) / (days.length - di));
        while (ri < reading.length && chunks.length < share && (acc === 0 || acc + reading[ri].minutes <= readBudget * 1.25)) {
          const r = reading[ri++];
          const loc = locateIn(r.from, r.to);
          chunks.push({ id: L.uid('k'), kind: 'read', title: shortTitle(r.title), segment: r.segment, from: r.from, to: r.to, pages: loc.pages, source: loc.source ? loc.source.id : null, minutes: r.minutes, done: null });
          acc += r.minutes;
        }
        const clean = (t) => shortTitle(t.replace(/ · part \d+$/, '').replace(/ …$/, ''));
        if (dayIndex > 0 && prevTitles.length) chunks.push({ id: L.uid('k'), kind: 'review', title: `Review · ${clean(prevTitles[0])}`, hint: 'Recall yesterday\'s key ideas without looking, then check them against the pages.', minutes: 10, done: null });
        const focus = chunks.filter((k) => k.kind === 'read').map((k) => k.title);
        if (w.kind === 'final' || w.kind === 'midterm') chunks.push({ id: L.uid('k'), kind: 'practise', title: `Practise · ${w.kind === 'final' ? 'final exam' : 'midterm'}`, hint: `Work problems across ${w.kind === 'final' ? 'the whole course' : 'weeks 1–' + midWeek}; time yourself.`, minutes: practiseMin, done: null });
        else chunks.push({ id: L.uid('k'), kind: 'practise', title: `Practise · ${clean(focus[0] || prevTitles[0] || w.title)}`, hint: 'Rework the examples, then write two problems of your own and solve them.', minutes: practiseMin, done: null });
        const minutes = L.sum(chunks.map((k) => k.minutes));
        sessions.push({ id: L.uid('s'), week: w.n, day: d.day, date: d.date, start: slot.start, minutes, kind: 'Study block', topic: focus.length ? focus[0].replace(/ · part \d+$/, '') : (w.kind === 'final' ? 'Review' : w.title), chunks });
        prevTitles = focus.length ? focus : prevTitles;
        dayIndex++;
      });
      // leftover reading (rare rounding) lands on the week's last day
      while (ri < reading.length) { const r = reading[ri++]; const loc = locateIn(r.from, r.to); const last = sessions[sessions.length - 1]; last.chunks.splice(last.chunks.findIndex((k) => k.kind !== 'read'), 0, { id: L.uid('k'), kind: 'read', title: shortTitle(r.title), segment: r.segment, from: r.from, to: r.to, pages: loc.pages, source: loc.source ? loc.source.id : null, minutes: r.minutes, done: null }); last.minutes += r.minutes; }
    }

    // weights
    let weights = weeks < 5 ? { quiz: 20, pset: 30, final: 45, participation: 5 }
      : weeks < 8 ? { quiz: 15, pset: 25, midterm: 20, final: 35, participation: 5 }
        : { quiz: 10, pset: 20, midterm: 20, project: 15, final: 30, participation: 5 };
    for (const k of Object.keys(weights)) if (k !== 'participation' && !assessments.some((a) => a.kind === k)) { weights.final += weights[k]; delete weights[k]; }
    const policy = { weights, late: { perDayPct: 10, maxDays: 3 }, scale: 'standard', withdrawBefore: D.iso(D.addDays(start, Math.floor(weeks * 7 * 0.6))) };

    // identity
    const levelNo = analysis.level === 'advanced' ? 3 : analysis.level === 'intermediate' ? 2 : 1;
    const seq = 1 + L.S.courses.filter((c) => c.subjectCode === analysis.subjectCode).length;
    const code = `${analysis.subjectCode} ${levelNo}${String(seq).padStart(2, '0')}`;
    const colorUse = COLORS.map((h) => L.S.courses.filter((c) => c.color === h).length);
    const color = COLORS[colorUse.indexOf(Math.min(...colorUse))]; // least used; ties go to the first free, so course 1 is cyan, 2 amber…

    return {
      code, title: analysis.title, subject: analysis.subject, subjectCode: analysis.subjectCode, level: analysis.level, difficulty: analysis.difficulty,
      description: analysis.description, prerequisites: analysis.prerequisites || [], credits, color,
      material: { sources: sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, words: s.words, chars: s.chars, pages: s.pages, url: s.url, offset: s.offset || 0, pageStarts: s.pageStarts, hasFile: !!s.file, outlined: !!s.outline })), words, chars: text.length, segments: segments.map((g) => ({ i: g.i, title: g.title, start: g.start, end: g.end, words: g.words, role: g.role || 'body' })) },
      analysis: { source: analysis.source || 'offline', model: analysis.model, note: analysis.note, units },
      term, plan: { pace: paceKey, paceLabel: pace.label, hoursPerWeek, totalHours: Math.round(totalHours * 10) / 10, slot, studyDays, minutesPerDay, sessionsPerWeek: studyDays.length, reduced },
      weeks: weeksOut, sessions, assessments, policy, notes: {},
      sourcesText: text, sourceFiles: sources.filter((s) => s.file).map((s) => ({ id: s.id, file: s.file })),
    };
  }
  function locateWith(sources, from, to) {
    let src = sources[0];
    for (const s of sources) if ((s.offset || 0) <= from) src = s;
    if (!src || !src.pageStarts) return { source: src, pages: null };
    const pageOf = (off) => { const rel = off - (src.offset || 0); let p = 0; for (let i = 0; i < src.pageStarts.length; i++) if (src.pageStarts[i] <= rel) p = i; return p + 1; };
    return { source: src, pages: [pageOf(from), pageOf(Math.max(from, to - 1))] };
  }

  // The three pacings. Each is a full prospectus or { unavailable } — a throw only when all three are impossible.
  function plans(input) {
    const out = {};
    const errs = [];
    for (const key of Object.keys(PACES)) {
      try { out[key] = buildPlan(Object.assign({}, input, { paceKey: key })); }
      catch (e) { out[key] = { pace: key, paceLabel: PACES[key].label, unavailable: e.message, code: e.code }; errs.push(e); }
    }
    if (!Object.keys(PACES).some((k) => !out[k].unavailable)) throw errs[0] || new RegistrarError('budget', 'No pacing fits your study budget.');
    return out;
  }
  const plan = (input) => plans(input).standard; // kept for tools that want one prospectus

  async function enrol(prospectus, contract) {
    if (prospectus.unavailable) throw new Error(prospectus.unavailable);
    if (!contract || !contract.signature || !contract.name) throw new Error('Enrolment needs a signed registration contract.');
    const no = contract.no || L.papers.contractNo();
    const textHash = await L.sha256(L.papers.contractText(prospectus, L.S.student, no));
    const c = Object.assign({}, prospectus, { id: L.uid('c'), createdAt: new Date(L.now()).toISOString(), state: 'enrolled', contract: { no, signedAt: new Date(L.now()).toISOString(), name: contract.name, signature: contract.signature, textHash } });
    const text = c.sourcesText; delete c.sourcesText;
    const files = c.sourceFiles || []; delete c.sourceFiles;
    // the record comes first; a storage failure for the material must never lose the enrolment
    L.S.courses.push(c);
    L.saveNow();
    const problems = [];
    try { await L.db.putMaterial(c.id, text); } catch (e) { console.error(e); c.material.textStored = false; problems.push('the text copy'); }
    for (const f of files) {
      try { await L.db.putFile(f.id, f.file); }
      catch (e) { console.error(e); const src = c.material.sources.find((x) => x.id === f.id); if (src) src.hasFile = false; problems.push(`the original of ${f.file.name || 'a file'}`); }
    }
    await L.ledger.append('contract_signed', { courseId: c.id, no, textHash, name: contract.name });
    await L.ledger.append('enrolled', { courseId: c.id, code: c.code, title: c.title, weeks: c.term.weeks, start: c.term.start, end: c.term.end, hoursPerWeek: c.plan.hoursPerWeek, pace: c.plan.pace });
    L.saveNow();
    if (problems.length && L.ui) L.ui.toast(`Enrolled, but this device could not store ${problems.join(' and ')}. Reading will use what is available.`, 'warn', 8000);
    return c;
  }

  async function withdraw(courseId) {
    const c = course(courseId);
    if (!c || c.state !== 'enrolled') throw new Error('This course is not active.');
    const st = courseState(c);
    if (st === 'completed') throw new Error(`${c.code} has ended. The grade stands.`);
    if (D.iso(L.today()) >= c.policy.withdrawBefore) throw new Error(`The withdrawal deadline for ${c.code} was ${L.fmt.date(D.addDays(D.parse(c.policy.withdrawBefore), -1))}. The grade will stand.`);
    c.state = 'withdrawn';
    c.withdrawnAt = new Date(L.now()).toISOString();
    c.final = { pct: null, letter: 'W', at: c.withdrawnAt };
    await L.ledger.append('withdrawn', { courseId: c.id, code: c.code, week: currentWeek(c) });
    L.save();
  }

  // ---------- calendar queries ----------
  function sessionsOn(date) {
    const d = D.iso(date);
    const out = [];
    for (const c of L.S.courses) if (c.state === 'enrolled') for (const s of c.sessions) if (s.date === d) out.push({ course: c, session: s });
    return out.sort((a, b) => a.session.start - b.session.start);
  }
  function deadlines({ from, to }) {
    const a = ms(from), z = ms(to);
    const out = [];
    for (const c of L.S.courses) if (c.state === 'enrolled') for (const x of c.assessments) { const t = ms(x.dueAt); if (t >= a && t <= z) out.push({ course: c, assessment: x, at: t }); }
    return out.sort(L.by('at'));
  }
  function nextDeadline() {
    const now = L.now();
    let best = null;
    for (const c of L.S.courses) {
      if (c.state !== 'enrolled' || courseState(c) === 'completed') continue;
      for (const a of c.assessments) {
        const st = assessmentState(c, a);
        if (!['upcoming', 'open', 'late', 'in_progress'].includes(st)) continue;
        const t = st === 'late' ? ms(a.closesAt) : st === 'in_progress' ? deadline(c, a) : ms(a.dueAt);
        if (t >= now && (!best || t < best.at)) best = { course: c, assessment: a, at: t };
      }
    }
    return best;
  }
  function load(weekStart) {
    const d = weekStart ? D.iso(weekStart) : D.iso(D.addDays(L.today(), -D.dow(L.today())));
    const end = D.iso(D.addDays(D.parse(d), 6));
    const hours = L.sum(L.S.courses.filter((c) => c.state === 'enrolled' && c.term.start <= end && c.term.end >= d).map((c) => c.plan.hoursPerWeek));
    return { hours, budget: Number(L.S.settings.weeklyHours) || 12 };
  }

  // ---------- grades ----------
  const letter = (pct) => SCALE.find(([min]) => pct >= min)[1];
  const points = (lt) => (SCALE.find(([, l]) => l === lt) || [0, 'F', 0])[2];
  function standing(c, { finalise = false } = {}) {
    const today = D.iso(L.today());
    const cats = [];
    let contribSum = 0, weightUsed = 0, gradedAvgSum = 0, gradedN = 0;
    for (const [kind, weight] of Object.entries(c.policy.weights)) {
      if (kind === 'participation' || !weight) continue;
      const items = c.assessments.filter((a) => a.kind === kind);
      const done = items.filter((a) => a.grade);
      const avg = done.length ? L.sum(done.map((a) => a.grade.pct)) / (finalise ? items.length : done.length) : (finalise ? 0 : null);
      const contrib = avg == null ? null : (weight * avg) / 100;
      cats.push({ kind, weight, done: done.length, total: items.length, avg, contrib });
      if (contrib != null) { contribSum += contrib; weightUsed += weight; }
      done.forEach((a) => { gradedAvgSum += a.grade.pct; gradedN++; });
    }
    // participation = chunks done on their day (full credit) or later (half), over chunks due so far
    // a day's chunks fall due at the end of that day; today's count only once they are done
    const dueChunks = c.sessions.filter((s) => finalise || s.date <= today).flatMap((s) => s.chunks.filter((ch) => finalise || s.date < today || ch.done).map((ch) => ({ s, ch })));
    const credit = L.sum(dueChunks.map(({ s, ch }) => (!ch.done ? 0 : D.iso(ch.done) <= s.date ? 1 : 0.5)));
    const done = dueChunks.filter(({ ch }) => ch.done).length;
    const pw = c.policy.weights.participation || 0;
    const participation = { done, due: dueChunks.length, credit, weight: pw, avg: dueChunks.length ? (credit / dueChunks.length) * 100 : null };
    if (pw && dueChunks.length) {
      cats.push({ kind: 'participation', weight: pw, done, total: dueChunks.length, avg: participation.avg, contrib: (pw * participation.avg) / 100 });
      contribSum += (pw * participation.avg) / 100; weightUsed += pw;
    }
    const current = weightUsed ? (contribSum / weightUsed) * 100 : null;
    // projection: ungraded items assumed at the running average of graded work
    let projected = null;
    if (gradedN) {
      const runAvg = gradedAvgSum / gradedN;
      let sum = 0;
      for (const [kind, weight] of Object.entries(c.policy.weights)) {
        if (kind === 'participation') { sum += weight * (participation.avg == null ? runAvg : participation.avg) / 100; continue; }
        const items = c.assessments.filter((a) => a.kind === kind);
        if (!items.length) continue;
        const avg = L.sum(items.map((a) => (a.grade ? a.grade.pct : runAvg))) / items.length;
        sum += (weight * avg) / 100;
      }
      projected = sum;
    }
    return { current, projected, letter: current == null ? null : letter(current), categories: cats, participation };
  }
  function gpa() {
    const done = L.S.courses.filter((c) => c.final && c.final.letter !== 'W');
    const credits = L.sum(done.map((c) => c.credits));
    const g = credits ? L.sum(done.map((c) => points(c.final.letter) * c.credits)) / credits : null;
    return { gpa: g == null ? null : Math.round(g * 100) / 100, credits, completed: done.length };
  }

  // ---------- assessment lifecycle ----------
  function assessmentState(c, a) {
    if (a.grade) return a.grade.missed ? 'missed' : 'graded';
    if (a.attempt && a.attempt.startedAt && !a.attempt.submittedAt) return 'in_progress';
    const now = L.now();
    if (now < ms(a.opensAt)) return 'upcoming';
    if (now < ms(a.dueAt)) return 'open';
    if (a.lateAllowed && now < ms(a.closesAt)) return 'late';
    return 'missed';
  }
  function deadline(c, a) {
    if (!a.attempt || !a.attempt.startedAt || a.attempt.submittedAt) return null;
    const close = ms(a.closesAt);
    if (!a.durationMin) return close;
    return Math.min(ms(a.attempt.startedAt) + a.durationMin * 60000, close);
  }
  function find(courseId, aid) {
    const c = course(courseId); if (!c) throw new Error('Unknown course.');
    const a = c.assessments.find((x) => x.id === aid); if (!a) throw new Error('Unknown assessment.');
    return { c, a };
  }
  async function materialFor(c, weekNs) {
    const text = (await L.db.getMaterial(c.id)) || '';
    const segIdx = new Set();
    for (const n of weekNs) { const w = week(c, n); if (w) w.segments.forEach((i) => segIdx.add(i)); }
    const segs = c.material.segments.filter((s) => segIdx.has(s.i));
    if (!segs.length || !text) return text;
    return segs.map((s) => `${s.title}\n\n${text.slice(s.start, s.end).trim()}`).join('\n\n');
  }
  async function complete(courseId, sessionId, chunkId) {
    const c = course(courseId); if (!c) throw new Error('Unknown course.');
    const s = c.sessions.find((x) => x.id === sessionId); if (!s) throw new Error('Unknown study block.');
    const ch = s.chunks.find((x) => x.id === chunkId); if (!ch) throw new Error('Unknown chunk.');
    if (ch.done) return 'already';
    const today = D.iso(L.today());
    if (today < s.date) return 'not_yet';
    if (ch.kind === 'read' && !ch.checked) return 'needs_check'; // the tick is earned by the quick check (§8.8)
    ch.done = new Date(L.now()).toISOString();
    await L.ledger.append('chunk_completed', { courseId: c.id, ref: s.id, chunk: ch.id, week: s.week, onTime: today === s.date, title: ch.title });
    L.save();
    return today === s.date ? 'done' : 'late';
  }
  // ---------- quick check: two questions from the chunk itself; pass = both right ----------
  async function checkPaper(courseId, sessionId, chunkId) {
    const c = course(courseId); const s = c.sessions.find((x) => x.id === sessionId); const ch = s.chunks.find((x) => x.id === chunkId);
    if (ch.check) return ch.check;
    const text = ((await L.db.getMaterial(c.id)) || '').slice(ch.from, ch.to);
    L.currentCourseToken = c.entitlement ? c.entitlement.token : null;
    const { paper, source } = await L.faculty.composePaper({ course: c, assessment: { id: 'chk_' + ch.id, kind: 'check', title: `Check · ${ch.title}`, coversWeeks: [s.week] }, text });
    ch.check = { questions: paper.questions.filter((q) => q.type === 'mcq').slice(0, 2).map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, answer: q.answer })), source, attempts: 0 };
    L.save();
    return ch.check;
  }
  async function submitCheck(courseId, sessionId, chunkId, answers) {
    const c = course(courseId); const s = c.sessions.find((x) => x.id === sessionId); const ch = s.chunks.find((x) => x.id === chunkId);
    if (!ch.check) throw new Error('No check to submit.');
    ch.check.attempts++;
    const right = ch.check.questions.filter((q) => Number(answers[q.id]) === q.answer).length;
    const passed = right === ch.check.questions.length;
    await L.ledger.append('chunk_checked', { courseId: c.id, ref: s.id, chunk: ch.id, right, of: ch.check.questions.length, attempt: ch.check.attempts, passed });
    if (passed) { ch.checked = new Date(L.now()).toISOString(); L.save(); return { passed, right, result: await complete(courseId, sessionId, chunkId) }; }
    L.save();
    return { passed, right };
  }
  // which page range of which source a char range of the material falls on
  function locate(c, from, to) {
    const srcs = c.material.sources;
    let src = srcs[0];
    for (const s of srcs) if ((s.offset || 0) <= from) src = s;
    if (!src || !src.pageStarts) return { source: src, pages: null };
    const pageOf = (off) => { const rel = off - (src.offset || 0); let p = 0; for (let i = 0; i < src.pageStarts.length; i++) if (src.pageStarts[i] <= rel) p = i; return p + 1; };
    return { source: src, pages: [pageOf(from), pageOf(Math.max(from, to - 1))] };
  }
  async function begin(courseId, aid, { onLog } = {}) {
    const { c, a } = find(courseId, aid);
    const st = assessmentState(c, a);
    if (st === 'in_progress') return;
    if (st === 'graded') throw new Error('This assessment has already been submitted.');
    if (st === 'missed') throw new Error('This assessment was missed. It is recorded as 0.');
    if (st === 'upcoming') throw new Error(`This assessment is not open. It opens ${L.fmt.dt(a.opensAt)}.`);
    const log = onLog || (() => {});
    if (!a.paper) {
      log('Assembling the covered material…');
      const text = await materialFor(c, a.coversWeeks);
      log(L.faculty.available() ? 'Setting the paper…' : 'Setting the paper (offline examiner)…');
      L.currentCourseToken = c.entitlement ? c.entitlement.token : null;
      const r = await L.faculty.composePaper({ course: c, assessment: a, text, onModel: (m) => log(`Faculty: ${m}`) });
      // the state may have been re-rendered while we waited; write to the live object
      const live = find(courseId, aid);
      if (live.a.paper) return;
      live.a.paper = r.paper;
      if (r.note) log(r.note);
    }
    const live = find(courseId, aid);
    if (assessmentState(live.c, live.a) !== st && assessmentState(live.c, live.a) !== 'in_progress') throw new Error('The window closed while the paper was being set.');
    live.a.attempt = { startedAt: new Date(L.now()).toISOString(), answers: {}, submittedAt: null };
    await L.ledger.append('assessment_started', { courseId: c.id, ref: a.id, kind: a.kind, seal: live.a.paper.seal, source: live.a.paper.source });
    L.save();
  }
  function answer(courseId, aid, qid, value) {
    const { c, a } = find(courseId, aid);
    if (assessmentState(c, a) !== 'in_progress') return false;
    const dl = deadline(c, a);
    if (dl && L.now() > dl) return false;
    a.attempt.answers[qid] = value;
    L.save();
    return true;
  }
  const submitting = new Set();
  async function submit(courseId, aid, { auto = false } = {}) {
    const { c, a } = find(courseId, aid);
    if (assessmentState(c, a) !== 'in_progress') throw new Error('This assessment is not in progress.');
    if (submitting.has(aid)) throw new Error('Already submitting.');
    submitting.add(aid);
    try {
      const dl = deadline(c, a);
      const when = auto ? dl : Math.min(L.now(), dl || L.now());
      a.attempt.submittedAt = new Date(when).toISOString();
      a.attempt.auto = auto;
      const answered = a.paper.questions.filter((q) => String(a.attempt.answers[q.id] ?? '').trim() !== '').length;
      await L.ledger.append('assessment_submitted', { courseId: c.id, ref: a.id, auto, answered, of: a.paper.questions.length });
      L.currentCourseToken = c.entitlement ? c.entitlement.token : null;
      const r = await L.faculty.grade({ course: c, assessment: a, paper: a.paper, answers: a.attempt.answers });
      const pts = L.sum(r.results.map((x) => x.points));
      const max = L.sum(a.paper.questions.map((q) => q.points));
      const rawPct = max ? (pts / max) * 100 : 0;
      let days = 0, penaltyPct = 0;
      if (when > ms(a.dueAt) && a.lateAllowed) {
        days = Math.ceil((when - ms(a.dueAt)) / DAY);
        penaltyPct = Math.min(days * c.policy.late.perDayPct, c.policy.late.maxDays * c.policy.late.perDayPct);
      }
      const pct = Math.round(rawPct * (1 - penaltyPct / 100) * 10) / 10;
      a.grade = { pct, points: pts, max, rawPct: Math.round(rawPct * 10) / 10, late: { days, penaltyPct }, missed: false, source: r.source, model: r.model, note: r.note, results: r.results, at: new Date(L.now()).toISOString(), letter: letter(pct) };
      await L.ledger.append('assessment_graded', { courseId: c.id, ref: a.id, pct, rawPct: a.grade.rawPct, penaltyPct, source: r.source, model: r.model || null });
      L.save();
      return a.grade;
    } finally { submitting.delete(aid); }
  }
  let sweeping = null;
  function sweep() {
    if (sweeping) return sweeping;
    sweeping = (async () => {
      let changed = false;
      for (const c of L.S.courses) {
        if (c.state !== 'enrolled') continue;
        for (const a of c.assessments) {
          const st = assessmentState(c, a);
          if (st === 'in_progress') {
            const dl = deadline(c, a);
            if (dl && L.now() >= dl) { try { await submit(c.id, a.id, { auto: true }); changed = true; } catch (e) { console.error(e); } }
          } else if (st === 'missed' && !a.grade) {
            a.grade = { pct: 0, points: 0, max: 0, rawPct: 0, late: { days: 0, penaltyPct: 0 }, missed: true, source: 'registrar', results: [], at: new Date(L.now()).toISOString(), letter: 'F' };
            await L.ledger.append('assessment_missed', { courseId: c.id, ref: a.id, kind: a.kind, closedAt: a.closesAt });
            changed = true;
          }
        }
        if (!c.final && courseState(c) === 'completed') {
          const s = standing(c, { finalise: true });
          const pct = Math.round((s.current || 0) * 10) / 10;
          c.final = { pct, letter: letter(pct), at: new Date(L.now()).toISOString() };
          await L.ledger.append('course_completed', { courseId: c.id, code: c.code, pct, letter: c.final.letter });
          if (L.papers) { try { await L.papers.issueCertificate(c); } catch (e) { console.error(e); } }
          changed = true;
        }
      }
      if (changed) { L.save(); L.emit('state'); }
    })().finally(() => { sweeping = null; });
    return sweeping;
  }

  // ---------- streaks and stats (over every enrolled course) ----------
  function stats() {
    const today = D.iso(L.today());
    const byDay = {}; // date → { due, done, onTime, minutes }
    const perCourse = [];
    for (const c of L.S.courses) {
      if (c.state !== 'enrolled') continue;
      let cDue = 0, cDone = 0, cOn = 0;
      for (const s of c.sessions) {
        if (s.date > today) continue;
        const d = byDay[s.date] || (byDay[s.date] = { due: 0, done: 0, onTime: 0, minutes: 0 });
        for (const k of s.chunks) {
          d.due++; cDue++;
          if (k.done) { d.done++; cDone++; d.minutes += k.minutes; if (D.iso(k.done) <= s.date) { d.onTime++; cOn++; } }
        }
      }
      // course streak: consecutive study days, ending today or yesterday, fully done on the day
      let streak = 0;
      const days = c.sessions.filter((s) => s.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));
      for (const s of days) {
        const full = s.chunks.length && s.chunks.every((k) => k.done && D.iso(k.done) <= s.date);
        if (s.date === today && !full) continue; // today is still open
        if (full) streak++; else break;
      }
      perCourse.push({ course: c, due: cDue, done: cDone, rate: cDue ? cDone / cDue : null, onTime: cDone ? cOn / cDone : null, streak });
    }
    const dates = Object.keys(byDay).sort();
    let streak = 0, longest = 0, run = 0, perfect = 0, partial = 0, missed = 0;
    for (const d of dates) {
      const x = byDay[d];
      const full = x.due && x.done === x.due && x.onTime === x.due;
      if (full) { run++; longest = Math.max(longest, run); perfect++; } else { run = 0; if (x.done) partial++; else missed++; }
    }
    // current streak: walk back from today (today counts only when complete)
    for (let i = dates.length - 1; i >= 0; i--) {
      const x = byDay[dates[i]];
      const full = x.due && x.done === x.due && x.onTime === x.due;
      if (dates[i] === today && !full) continue;
      if (full) streak++; else break;
    }
    // minutes studied per week for the last 8 weeks (Mon–Sun)
    const weekStart = D.addDays(L.today(), -D.dow(L.today()));
    const weekMinutes = [];
    for (let w = 7; w >= 0; w--) {
      const from = D.iso(D.addDays(weekStart, -7 * w)), to = D.iso(D.addDays(weekStart, -7 * w + 6));
      let m = 0; for (const d of dates) if (d >= from && d <= to) m += byDay[d].minutes;
      weekMinutes.push({ from, minutes: m });
    }
    const dueAll = L.sum(dates.map((d) => byDay[d].due)), doneAll = L.sum(dates.map((d) => byDay[d].done)), onAll = L.sum(dates.map((d) => byDay[d].onTime));
    return { streak, longest, days: { perfect, partial, missed }, weekMinutes, completionRate: dueAll ? doneAll / dueAll : null, onTimeRate: doneAll ? onAll / doneAll : null, minutes: L.sum(dates.map((d) => byDay[d].minutes)), perCourse };
  }

  L.registrar = { RegistrarError, KIND_TITLE, SCALE, PACES, stats, budget, plan, plans, enrol, withdraw, course, courses, courseState, currentWeek, week, sessionsOn, deadlines, nextDeadline, load, assessmentState, deadline, standing, letter, points, gpa, complete, checkPaper, submitCheck, locate, begin, answer, submit, sweep, materialFor };
})(window.L);
