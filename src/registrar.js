(function (L) {
  'use strict';

  const D = L.date;
  const DAY = 86400000;
  const HUES = [160, 220, 15, 275, 45, 195, 330, 95];
  const SCALE = [[93, 'A', 4.0], [90, 'A−', 3.7], [87, 'B+', 3.3], [83, 'B', 3.0], [80, 'B−', 2.7], [77, 'C+', 2.3], [73, 'C', 2.0], [70, 'C−', 1.7], [67, 'D+', 1.3], [63, 'D', 1.0], [60, 'D−', 0.7], [-Infinity, 'F', 0]];
  const KIND_TITLE = { quiz: 'Quiz', pset: 'Problem set', midterm: 'Midterm examination', final: 'Final examination', project: 'Term project' };

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
  function plan({ analysis, segments, text, sources, words }) {
    const now = L.today();
    const b = budget();
    if (b.available < 3) {
      const running = courses('active').sort(L.by((c) => c.term.end));
      const nextFree = running.length ? running[0].term.end : null;
      throw new RegistrarError('budget', `Your timetable is full: ${b.available % 1 ? b.available.toFixed(1) : b.available} hours a week are free and a course needs at least 3.${nextFree ? ` The next course ends on ${L.fmt.date(nextFree)}.` : ''}`, { available: b.available, nextFree });
    }
    // §8.1–8.2 hours, weeks, credits
    const readHours = words / 9000;
    const diffMult = [0.85, 0.95, 1.05, 1.2, 1.4][analysis.difficulty - 1];
    // read + notes + practice + review; every headed section is at least a lecture's worth of study
    const totalHours = Math.max(6, segments.length * 2.5, readHours * 3.5 * diffMult);
    const hpw0 = Math.min(b.available, 6);
    const weeks = L.clamp(Math.ceil(totalHours / hpw0), 2, 16);
    const hoursPerWeek = Math.max(3, Math.ceil((totalHours / weeks) * 2) / 2);
    const credits = hoursPerWeek >= 9 ? 4 : hoursPerWeek >= 6 ? 3 : hoursPerWeek >= 4 ? 2 : 1;
    const start = D.nextMonday(now);
    const term = { start: D.iso(start), end: D.iso(D.addDays(start, weeks * 7 - 1)), weeks };
    const concurrent = L.S.courses.filter((c) => c.state === 'enrolled' && overlaps(c, { term }));

    // §8.3 timetable slot
    const sessionsPerWeek = hoursPerWeek >= 7 ? 3 : 2;
    const minutes = hoursPerWeek >= 6 ? 75 : 50;
    const rows = [];
    for (const h of [9, 11, 14, 16, 18]) {
      rows.push({ days: sessionsPerWeek === 3 ? [0, 2, 4] : [0, 2], start: h * 60 });
      rows.push({ days: [1, 3], start: h * 60 });
    }
    const taken = (slot) => concurrent.some((c) => c.sessions.some((s) => slot.days.includes(s.day) && slot.start < s.start + s.minutes && s.start < slot.start + minutes));
    const slot = rows.find((r) => !taken(r));
    if (!slot) throw new RegistrarError('timetable', 'No timetable slot is free for this term. Wait for a course to end, or withdraw from one.');
    slot.minutes = minutes;

    // §8.4 weeks
    const midWeek = weeks >= 5 ? Math.ceil(weeks / 2) : 0;
    const capacity = (n) => (n === weeks ? 0.35 : n === midWeek ? 0.5 : 1);
    const C = L.sum(Array.from({ length: weeks }, (_, i) => capacity(i + 1)));
    const units = analysis.units;
    const sizeSum = L.sum(units.map((u) => u.relativeSize));
    const shares = units.map((u) => (u.relativeSize / sizeSum) * C);
    const weeksOut = [];
    let ui = 0, uLeft = shares[0], uDone = 0; // uDone = fraction of the current unit already placed
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
    // rounding can leave the tail of the last unit unplaced — give it to the last teaching week
    if (ui < units.length) {
      const tail = weeksOut[weeksOut.length - 1];
      for (let k = ui; k < units.length; k++) tail.rawParts.push({ unit: k, from: k === ui ? uDone : 0, to: 1 });
    }
    // translate fractional unit coverage into segment indices and labels
    const partCount = {};
    weeksOut.forEach((w) => w.rawParts.forEach((p) => { partCount[p.unit] = (partCount[p.unit] || 0) + 1; }));
    const partSeen = {};
    for (const w of weeksOut) {
      const segs = new Set();
      const parts = [];
      for (const p of w.rawParts) {
        const u = units[p.unit];
        const [a, z] = u.segments; const n = z - a + 1;
        let s0 = a + Math.floor(p.from * n), s1 = a + Math.ceil(p.to * n) - 1;
        s0 = L.clamp(s0, a, z); s1 = L.clamp(Math.max(s1, s0), a, z);
        for (let i = s0; i <= s1; i++) segs.add(i);
        partSeen[p.unit] = (partSeen[p.unit] || 0) + 1;
        const label = partCount[p.unit] > 1 ? `${u.title} · Part ${partSeen[p.unit]} of ${partCount[p.unit]}` : u.title;
        parts.push({ unit: p.unit, fraction: Math.max(0, p.to - p.from), label });
      }
      if (!segs.size) { const prev = weeksOut[w.n - 2]; const last = prev ? prev.segments[prev.segments.length - 1] : 0; segs.add(last); }
      const titles = parts.map((p) => units[p.unit].title).filter((t, i, arr) => arr.indexOf(t) === i);
      let title = titles.length <= 2 ? titles.join(' · ') : `${titles.slice(0, 2).join(' · ')} … and ${titles.length - 2} more`;
      if (w.kind === 'final') title = 'Review and final examination';
      if (w.kind === 'midterm') title = 'Midterm week · ' + title;
      const objectives = parts.flatMap((p) => units[p.unit].objectives).filter((o, i, arr) => arr.indexOf(o) === i).slice(0, 6);
      w.title = title; w.parts = parts; w.segments = Array.from(segs).sort((x, y) => x - y); w.objectives = objectives;
      delete w.rawParts;
    }

    // §8.3 sessions
    const sessions = [];
    for (const w of weeksOut) {
      const days = w.kind === 'final' ? slot.days.slice(0, 1) : slot.days;
      days.forEach((day, k) => {
        sessions.push({ id: L.uid('s'), week: w.n, day, date: D.iso(D.addDays(D.parse(w.start), day)), start: slot.start, minutes, kind: k === 2 ? 'Problem class' : 'Lecture', topic: w.kind === 'final' ? 'Review' : w.title, attended: null });
      });
    }

    // §8.5 assessments
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
    if (midWeek) {
      const d = examDate(wk(midWeek), [2, 3, 1]);
      assessments.push({ id: L.uid('a'), kind: 'midterm', title: 'Midterm examination', week: midWeek, coversWeeks: Array.from({ length: midWeek }, (_, i) => i + 1), opensAt: at(d, 9), dueAt: at(d, 21), closesAt: at(d, 21), durationMin: 75, lateAllowed: false, paper: null, attempt: null, grade: null });
    }
    if (weeks >= 8) {
      const due = at(D.addDays(D.parse(wk(weeks - 1)), 4), 23, 59, 0);
      assessments.push({ id: L.uid('a'), kind: 'project', title: 'Term project', week: weeks - 1, coversWeeks: Array.from({ length: weeks - 1 }, (_, i) => i + 1), opensAt: at(wk(3), 8), dueAt: due, closesAt: iso(D.addDays(D.parse(due), 3)), durationMin: null, lateAllowed: true, paper: null, attempt: null, grade: null });
    }
    {
      const d = examDate(wk(weeks), [4, 3, 2]);
      assessments.push({ id: L.uid('a'), kind: 'final', title: 'Final examination', week: weeks, coversWeeks: weeksOut.map((w) => w.n), opensAt: at(d, 9), dueAt: at(d, 21), closesAt: at(d, 21), durationMin: 120, lateAllowed: false, paper: null, attempt: null, grade: null });
    }
    assessments.sort(L.by('dueAt'));

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
    const hueUse = HUES.map((h) => L.S.courses.filter((c) => c.hue === h).length);
    const hue = HUES[hueUse.indexOf(Math.min(...hueUse))];

    return {
      code, title: analysis.title, subject: analysis.subject, subjectCode: analysis.subjectCode, level: analysis.level, difficulty: analysis.difficulty,
      description: analysis.description, prerequisites: analysis.prerequisites || [], credits, hue,
      material: { sources: sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, words: s.words, chars: s.chars, pages: s.pages, url: s.url })), words, chars: text.length, segments },
      analysis: { source: analysis.source || 'offline', model: analysis.model, note: analysis.note, units },
      term, plan: { hoursPerWeek, totalHours: Math.round(totalHours * 10) / 10, slot, sessionsPerWeek }, weeks: weeksOut, sessions, assessments, policy, notes: {},
      sourcesText: text,
    };
  }

  async function enrol(prospectus) {
    const c = Object.assign({}, prospectus, { id: L.uid('c'), createdAt: new Date(L.now()).toISOString(), state: 'enrolled' });
    const text = c.sourcesText; delete c.sourcesText;
    L.S.courses.push(c);
    await L.db.putMaterial(c.id, text);
    await L.ledger.append('enrolled', { courseId: c.id, code: c.code, title: c.title, weeks: c.term.weeks, start: c.term.start, end: c.term.end, hoursPerWeek: c.plan.hoursPerWeek });
    L.save();
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
    const held = c.sessions.filter((s) => s.date <= today);
    const attended = held.filter((s) => s.attended).length;
    const pw = c.policy.weights.participation || 0;
    const participation = { attended, held: held.length, weight: pw, avg: held.length ? (attended / held.length) * 100 : null };
    if (pw && (held.length || finalise)) {
      const avg = finalise ? (attended / Math.max(1, c.sessions.length)) * 100 : participation.avg;
      cats.push({ kind: 'participation', weight: pw, done: attended, total: finalise ? c.sessions.length : held.length, avg, contrib: (pw * avg) / 100 });
      contribSum += (pw * avg) / 100; weightUsed += pw;
    }
    const current = weightUsed ? (contribSum / weightUsed) * 100 : null;
    // projection: ungraded items assumed at the running average of graded work
    let projected = null;
    if (gradedN) {
      const runAvg = gradedAvgSum / gradedN;
      let sum = 0;
      for (const [kind, weight] of Object.entries(c.policy.weights)) {
        if (kind === 'participation') { sum += weight * (participation.avg == null ? 100 : participation.avg) / 100; continue; }
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
  async function attend(courseId, sessionId) {
    const c = course(courseId); if (!c) throw new Error('Unknown course.');
    const s = c.sessions.find((x) => x.id === sessionId); if (!s) throw new Error('Unknown session.');
    if (s.attended) return 'already';
    if (D.iso(L.today()) !== s.date) return 'not_today';
    s.attended = new Date(L.now()).toISOString();
    await L.ledger.append('session_attended', { courseId: c.id, ref: s.id, week: s.week, kind: s.kind });
    L.save();
    return 'attended';
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
          changed = true;
        }
      }
      if (changed) { L.save(); L.emit('state'); }
    })().finally(() => { sweeping = null; });
    return sweeping;
  }

  L.registrar = { RegistrarError, KIND_TITLE, SCALE, budget, plan, enrol, withdraw, course, courses, courseState, currentWeek, week, sessionsOn, deadlines, nextDeadline, load, assessmentState, deadline, standing, letter, points, gpa, attend, begin, answer, submit, sweep, materialFor };
})(window.L);
