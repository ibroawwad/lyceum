const fs = require('fs'); const vm = require('vm');
const store = {};
const ctx = { console, crypto: globalThis.crypto, TextEncoder, setTimeout, clearTimeout, setInterval() {}, addEventListener() {}, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } }, document: { readyState: 'complete', addEventListener() {}, querySelector: () => null, documentElement: { setAttribute() {}, removeAttribute() {} } }, location: { search: '?debug=1', hash: '' }, indexedDB: undefined, fetch: undefined, Date, URLSearchParams, AbortController, JSON, Math };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['core.js', 'sample.js', 'intake.js', 'faculty.js', 'registrar.js']) vm.runInContext(fs.readFileSync('src/' + f, 'utf8'), ctx, { filename: f });
const L = ctx.L;
(async () => {
  const text = L.intake.normalize(L.SAMPLE.text); const segs = L.intake.segment(text);
  const { analysis } = await L.faculty.offline.analyze({ text, segments: segs, hint: '' });
  const src = L.intake.fromText(text, 'sample');
  const all = L.registrar.plans({ analysis, segments: segs, text, sources: [src], words: L.intake.words(text) });
  for (const k of Object.keys(all)) console.log('pace', k, all[k].unavailable || `${all[k].term.weeks}w ${all[k].plan.hoursPerWeek}h/w ${all[k].plan.minutesPerDay}min/day ${all[k].sessions.length} blocks`);
  const p = all.standard;
  console.log(p.code, p.title, 'weeks', p.term.weeks, p.term.start, '→', p.term.end, 'hpw', p.plan.hoursPerWeek, 'total', p.plan.totalHours, 'credits', p.credits, 'slot', JSON.stringify(p.plan.slot));
  p.weeks.forEach(w => console.log(' wk', w.n, w.start, w.kind, '|', w.title, '| segs', w.segments));
  p.sessions.slice(0, 6).forEach(s => console.log('  day', s.date, s.minutes + 'min', s.chunks.map(k => `[${k.kind}] ${k.title} (${k.minutes})`).join(' | ')));
  const readChunks = p.sessions.flatMap(s => s.chunks.filter(k => k.kind === 'read'));
  const covered = readChunks.map(k => k.segment); const uniq = new Set(covered);
  console.log(' read chunks', readChunks.length, 'segments covered', [...uniq].sort().join(','), 'every day 2-5 chunks:', p.sessions.every(s => s.chunks.length >= 2 && s.chunks.length <= 5), 'max read min', Math.max(...readChunks.map(k => k.minutes)));
  p.assessments.forEach(a => console.log(' ', a.kind.padEnd(8), a.title.padEnd(20), a.opensAt, '→', a.dueAt, 'closes', a.closesAt, a.durationMin, 'covers', a.coversWeeks.join(',')));
  console.log(' weights', p.policy.weights, 'withdrawBefore', p.policy.withdrawBefore, 'sessions', p.sessions.length);
  const c = await L.registrar.enrol(p);
  // second course
  const text2 = Array.from({ length: 40 }, (_, i) => `## Topic ${i + 1}\n\n` + 'Kinematics describes motion using displacement, velocity and acceleration. Newton\'s second law relates net force to mass and acceleration. Energy is conserved in closed systems; work equals force times displacement along the direction of motion. Momentum is conserved when no external force acts. '.repeat(6)).join('\n\n');
  const n2 = L.intake.normalize(text2); const s2 = L.intake.segment(n2);
  const a2 = (await L.faculty.offline.analyze({ text: n2, segments: s2, hint: 'Classical Mechanics' })).analysis;
  const p2 = L.registrar.plans({ analysis: a2, segments: s2, text: n2, sources: [L.intake.fromText(n2, 'mech')], words: L.intake.words(n2) }).standard;
  console.log(p2.code, 'weeks', p2.term.weeks, 'hpw', p2.plan.hoursPerWeek, 'slot', JSON.stringify(p2.plan.slot), 'units', a2.units.length, 'assessments', p2.assessments.map(a => a.kind + '@' + a.opensAt.slice(0, 10)).join(' '));
  const c2 = await L.registrar.enrol(p2);
  console.log('budget', L.registrar.budget());
  // exam clash check
  const ex = [...c.assessments, ...c2.assessments].filter(a => /midterm|final/.test(a.kind)).map(a => a.opensAt.slice(0, 10));
  console.log('exam days', ex, 'distinct', new Set(ex).size === ex.length);
  // quiz flow
  const q1 = c.assessments.find(a => a.kind === 'quiz');
  const blk = c.sessions[0];
  await L.clock.setOffset(new Date(blk.date + 'T10:00:00').getTime() - Date.now());
  console.log('complete on day:', await L.registrar.complete(c.id, blk.id, blk.chunks[0].id), 'again:', await L.registrar.complete(c.id, blk.id, blk.chunks[0].id), 'future:', await L.registrar.complete(c.id, c.sessions[3].id, c.sessions[3].chunks[0].id));
  console.log('state before', L.registrar.assessmentState(c, q1));
  await L.clock.setOffset(new Date(q1.opensAt).getTime() + 60000 - Date.now());
  console.log('state open', L.registrar.assessmentState(c, q1));
  L.db.getMaterial = async () => text; // stub IDB
  await L.registrar.begin(c.id, q1.id, { onLog: (m) => console.log('   log:', m) });
  console.log('paper', q1.paper.questions.map(q => q.type).join(','), q1.paper.seal.slice(0, 12));
  for (const q of q1.paper.questions) L.registrar.answer(c.id, q1.id, q.id, q.type === 'mcq' ? q.answer : q.modelAnswer);
  const g = await L.registrar.submit(c.id, q1.id, {});
  console.log('grade', g.pct, g.letter, g.results.map(r => r.points).join(','));
  console.log('standing', JSON.stringify(L.registrar.standing(c)));
  console.log('ledger', L.S.ledger.map(e => e.type).join(','), (await L.ledger.verify()).ok);
  console.log('q1 sample:', q1.paper.questions[0].prompt, q1.paper.questions[0].options, q1.paper.questions[6].prompt);
})().catch(e => { console.error(e); process.exit(1); });
// auto-submit of an expired timed attempt (appended check)
(async () => {
  await new Promise(r => setTimeout(r, 1500));
  const L = ctx.L; const c = L.S.courses[0];
  const q2 = c.assessments.filter(a => a.kind === 'quiz')[1];
  await L.clock.setOffset(new Date(q2.opensAt).getTime() + 60000 - Date.now());
  await L.registrar.begin(c.id, q2.id, {});
  const dl = L.registrar.deadline(c, q2);
  console.log('deadline = start+15min:', dl - (new Date(q2.attempt.startedAt).getTime() + 15 * 60000) === 0);
  await L.clock.setOffset(L.S.clock.offsetMs + 16 * 60000);
  await L.registrar.sweep();
  console.log('auto-submitted:', q2.grade && q2.grade.pct === 0 && q2.attempt.auto === true && !q2.grade.missed, 'state', L.registrar.assessmentState(c, q2));
})().catch(e => { console.error(e); process.exit(1); });
