#!/usr/bin/env node
// Headless-Chrome scenario test for dist/lyceum.html.
// Run: node tools/build.js && node tools/smoke.js
// Fails (exit 1) on any console error, page error, or failed assertion. Screenshots → shots/.
// The selectors and L.* calls used here are part of the contract (SPEC.md §10). Extend freely; never weaken.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const root = path.join(__dirname, '..');
const file = 'file://' + path.join(root, 'dist', 'lyceum.html');
const shots = path.join(root, 'shots');
fs.mkdirSync(shots, { recursive: true });

const failures = [];
const consoleErrors = [];
function assert(cond, msg) { if (!cond) { failures.push(msg); console.log('  ✗ ' + msg); } else { console.log('  ✓ ' + msg); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// format a Date as a local wall-clock string (no timezone), so the browser reads it as its own local time
const local = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  const shot = async (name) => page.screenshot({ path: path.join(shots, name + '.png'), fullPage: false });
  const route = () => page.evaluate(() => (window.L && L.route ? L.route().name : location.hash));
  const setClock = async (isoLocal) => page.evaluate((iso) => {
    const target = new Date(iso).getTime();
    L.clock.setOffset(target - Date.now());
  }, isoLocal);
  const sweep = async () => { await page.evaluate(async () => { await L.registrar.sweep(); L.render(); }); await sleep(150); };
  const okModal = async () => { await page.waitForSelector('.modal [data-act=modal-ok]', { timeout: 5000 }); await page.click('.modal [data-act=modal-ok]'); };

  console.log('1. welcome / matriculation');
  await page.goto(file + '?debug=1#/welcome');
  await page.waitForSelector('#student-name', { timeout: 15000 });
  assert((await route()) === 'welcome', 'fresh device lands on welcome');
  await page.fill('#student-name', 'Ada Lovelace');
  await page.click('[data-act=matriculate]');
  await page.waitForSelector('.empty', { timeout: 5000 });
  assert((await route()) === 'today', 'matriculation lands on today');
  const student = await page.evaluate(() => L.S.student);
  assert(student && student.name === 'Ada Lovelace' && /^LYC-\d{2}-\d{4}$/.test(student.id), 'student record created with LYC id');
  await shot('01-today-empty');

  console.log('2. sample course → prospectus');
  await page.click('[data-act=load-sample]');
  await page.waitForSelector('.prospectus', { timeout: 60000 });
  await shot('02-prospectus');
  const pro = await page.evaluate(() => window.__prospectus || null);
  assert(pro, 'wizard exposes window.__prospectus while a prospectus is shown (debug aid)');
  if (pro) {
    assert(pro.term.weeks >= 2 && pro.term.weeks <= 16, `weeks within 2..16 (${pro.term.weeks})`);
    assert(pro.assessments.length >= 3, `has assessments (${pro.assessments.length})`);
    const q1 = pro.assessments.find((a) => a.kind === 'quiz');
    assert(q1 && new Date(q1.opensAt).getDay() === 5 && new Date(q1.opensAt).getHours() === 8, 'quiz 1 opens Friday 08:00');
    assert(q1 && new Date(q1.dueAt).getDay() === 0 && new Date(q1.dueAt).getHours() === 23, 'quiz 1 due Sunday 23:59');
    const fin = pro.assessments.find((a) => a.kind === 'final');
    assert(fin && fin.durationMin === 120, 'final is 120 minutes');
    const w = Object.values(pro.policy.weights).reduce((a, b) => a + b, 0);
    assert(w === 100, `weights sum to 100 (${w})`);
    assert(new Date(pro.term.start + 'T00:00:00').getDay() === 1, 'term starts on a Monday');
    assert(pro.sessions.length >= pro.term.weeks * 2 - 2, 'sessions generated for every teaching week');
  }
  await page.click('[data-act=enrol-confirm]');
  await okModal();
  await page.waitForFunction(() => L.route().name === 'course' && document.querySelector('.syllabus'), null, { timeout: 15000 });
  assert((await route()) === 'course', 'enrolment lands on the course page');
  const course = await page.evaluate(() => L.S.courses[0]);
  assert(course && course.code && /\s\d{3}$/.test(course.code), `course code assigned (${course && course.code})`);
  assert(course.weeks.length === course.term.weeks, 'weeks array matches term length');
  assert(course.weeks.every((w) => w.segments.length > 0), 'every week has reading segments');
  const ledger1 = await page.evaluate(() => L.S.ledger.map((e) => e.type));
  assert(ledger1.includes('matriculated') && ledger1.includes('enrolled'), 'ledger has matriculated + enrolled');
  await shot('03-course-syllabus');

  console.log('3. attend a session on its day');
  const s0 = course.sessions[0];
  await setClock(`${s0.date}T${String(Math.floor(s0.start / 60)).padStart(2, '0')}:${String(s0.start % 60).padStart(2, '0')}:30`);
  await sweep();
  const att = await page.evaluate(({ cid, sid }) => L.registrar.attend(cid, sid), { cid: course.id, sid: s0.id });
  assert(att === 'attended', 'attendance recorded on the session day');
  const att2 = await page.evaluate(({ cid, sid }) => L.registrar.attend(cid, sid), { cid: course.id, sid: course.sessions[1].id });
  assert(att2 === 'not_today', 'cannot attend a session on another day');

  console.log('4. quiz 1: locked → open → sit → graded');
  const quiz1 = course.assessments.find((a) => a.kind === 'quiz');
  let st = await page.evaluate(({ cid, aid }) => L.registrar.assessmentState(L.registrar.course(cid), L.registrar.course(cid).assessments.find((a) => a.id === aid)), { cid: course.id, aid: quiz1.id });
  assert(st === 'upcoming', `quiz 1 is locked before it opens (${st})`);
  const beginEarly = await page.evaluate(async ({ cid, aid }) => { try { await L.registrar.begin(cid, aid, {}); return 'began'; } catch (e) { return 'refused'; } }, { cid: course.id, aid: quiz1.id });
  assert(beginEarly === 'refused', 'begin() refuses a locked assessment');
  const q1open = new Date(quiz1.opensAt); q1open.setMinutes(q1open.getMinutes() + 30);
  await setClock(local(q1open));
  await sweep();
  st = await page.evaluate(({ cid, aid }) => L.registrar.assessmentState(L.registrar.course(cid), L.registrar.course(cid).assessments.find((a) => a.id === aid)), { cid: course.id, aid: quiz1.id });
  assert(st === 'open', `quiz 1 opens on time (${st})`);
  await page.goto(file + `?debug=1#/assess/${course.id}/${quiz1.id}`);
  await page.waitForSelector('#pledge', { timeout: 5000 });
  await shot('04-assess-before');
  await page.check('#pledge');
  await page.click('[data-act=begin]');
  await page.waitForSelector('.exam', { timeout: 60000 });
  await shot('05-exam-room');
  const paper = await page.evaluate(({ cid, aid }) => L.registrar.course(cid).assessments.find((a) => a.id === aid).paper, { cid: course.id, aid: quiz1.id });
  assert(paper && paper.questions.length === 8, `quiz paper has 8 questions (${paper && paper.questions.length})`);
  assert(paper && /^[0-9a-f]{64}$/.test(paper.seal), 'paper is sealed with a sha256');
  // answer: first option for mcq, a sentence for short
  for (const q of paper.questions) {
    if (q.type === 'mcq') await page.click(`[data-in=answer][data-qid="${q.id}"][value="0"]`);
    else await page.fill(`[data-in=answer][data-qid="${q.id}"]`, 'Probability is a function on events satisfying the axioms; independence means the joint probability factorises as a product.');
  }
  await sleep(400);
  const saved = await page.evaluate(({ cid, aid }) => Object.keys(L.registrar.course(cid).assessments.find((a) => a.id === aid).attempt.answers).length, { cid: course.id, aid: quiz1.id });
  assert(saved === 8, `answers autosaved (${saved}/8)`);
  await page.click('[data-act=submit-paper]');
  await okModal();
  await page.waitForSelector('.result', { timeout: 60000 });
  await shot('06-result');
  const g = await page.evaluate(({ cid, aid }) => L.registrar.course(cid).assessments.find((a) => a.id === aid).grade, { cid: course.id, aid: quiz1.id });
  assert(g && g.pct >= 0 && g.pct <= 100 && g.letter, `quiz graded (${g && g.pct}% ${g && g.letter})`);
  assert(g && g.results.length === 8, 'per-question results present');
  const again = await page.evaluate(async ({ cid, aid }) => { try { await L.registrar.begin(cid, aid, {}); return 'began'; } catch (e) { return 'refused'; } }, { cid: course.id, aid: quiz1.id });
  assert(again === 'refused', 'a graded assessment cannot be started again');

  console.log('5. miss a quiz, standing, timed auto-submit');
  const quiz2 = course.assessments.filter((a) => a.kind === 'quiz')[1];
  if (quiz2) {
    const after = new Date(quiz2.closesAt); after.setHours(after.getHours() + 2);
    await setClock(local(after));
    await sweep();
    const g2 = await page.evaluate(({ cid, aid }) => L.registrar.course(cid).assessments.find((a) => a.id === aid).grade, { cid: course.id, aid: quiz2.id });
    assert(g2 && g2.missed === true && g2.pct === 0, 'missed quiz is graded 0 by the sweep');
    const types = await page.evaluate(() => L.S.ledger.map((e) => e.type));
    assert(types.includes('assessment_missed'), 'ledger records the miss');
  }
  const standing = await page.evaluate((cid) => L.registrar.standing(L.registrar.course(cid)), course.id);
  assert(standing && standing.current !== null && standing.letter, `standing computed (${standing && standing.current} ${standing && standing.letter})`);
  const quiz3 = course.assessments.filter((a) => a.kind === 'quiz')[2];
  if (quiz3) {
    const o = new Date(quiz3.opensAt); o.setMinutes(o.getMinutes() + 5);
    await setClock(local(o));
    await sweep();
    await page.evaluate(({ cid, aid }) => L.registrar.begin(cid, aid, {}), { cid: course.id, aid: quiz3.id });
    const dl = await page.evaluate(({ cid, aid }) => L.registrar.deadline(L.registrar.course(cid), L.registrar.course(cid).assessments.find((a) => a.id === aid)), { cid: course.id, aid: quiz3.id });
    assert(dl && dl - (o.getTime() + 15 * 60000) === 0, 'timed deadline = start + 15 min');
    const late = new Date(o.getTime() + 16 * 60000);
    await setClock(local(late));
    await sweep();
    const g3 = await page.evaluate(({ cid, aid }) => L.registrar.course(cid).assessments.find((a) => a.id === aid).grade, { cid: course.id, aid: quiz3.id });
    assert(g3 && g3.pct === 0 && !g3.missed && g3.results.length === 8, 'expired timed attempt is auto-submitted (blank → 0, not missed)');
  }

  console.log('6. a second course cannot clash; budget is enforced');
  await page.goto(file + '?debug=1#/today');
  await page.waitForSelector('.today-grid', { timeout: 5000 });
  await shot('07-today-running');
  const second = await page.evaluate(async () => {
    const text = Array.from({ length: 40 }, (_, i) => `## Topic ${i + 1}\n\n` + 'Kinematics describes motion using displacement, velocity and acceleration. Newton\'s second law relates net force to mass and acceleration. Energy is conserved in closed systems; work equals force times displacement along the direction of motion. Momentum is conserved when no external force acts. '.repeat(6)).join('\n\n');
    const src = L.intake.fromText(text, 'Mechanics notes');
    const norm = L.intake.normalize(src.text);
    const segments = L.intake.segment(norm);
    const { analysis } = await L.faculty.offline.analyze({ text: norm, segments, hint: 'Classical Mechanics', words: L.intake.words(norm) });
    const p = L.registrar.plan({ analysis, segments, text: norm, sources: [src], words: L.intake.words(norm) });
    const c = await L.registrar.enrol(p);
    return { id: c.id, code: c.code, slot: c.plan.slot, weeks: c.term.weeks, start: c.term.start };
  });
  assert(second && second.id, `second course enrolled (${second && second.code})`);
  const clash = await page.evaluate(() => {
    const cs = L.registrar.courses('active');
    const blocks = [];
    for (const c of cs) for (const s of c.sessions) blocks.push({ c: c.id, d: s.date, a: s.start, b: s.start + s.minutes });
    let n = 0;
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const x = blocks[i], y = blocks[j];
      if (x.c !== y.c && x.d === y.d && x.a < y.b && y.a < x.b) n++;
    }
    const exams = [];
    for (const c of cs) for (const a of c.assessments) if (a.kind === 'midterm' || a.kind === 'final') exams.push({ c: c.id, d: a.opensAt.slice(0, 10) });
    let e = 0;
    for (let i = 0; i < exams.length; i++) for (let j = i + 1; j < exams.length; j++) if (exams[i].c !== exams[j].c && exams[i].d === exams[j].d) e++;
    return { n, e };
  });
  assert(clash.n === 0, `no session overlaps between concurrent courses (${clash.n})`);
  assert(clash.e === 0, `no exam-day collisions between concurrent courses (${clash.e})`);
  const budget = await page.evaluate(() => L.registrar.budget());
  assert(budget.committed <= budget.weekly + 1e-9, `committed hours within budget (${budget.committed}/${budget.weekly})`);
  const refused = await page.evaluate(async () => {
    L.S.settings.weeklyHours = 4; L.save();
    try {
      const src = L.intake.fromText('## A\n\n' + 'Cells divide by mitosis. '.repeat(400), 'Bio');
      const norm = L.intake.normalize(src.text); const segments = L.intake.segment(norm);
      const { analysis } = await L.faculty.offline.analyze({ text: norm, segments, hint: 'Cell Biology', words: L.intake.words(norm) });
      L.registrar.plan({ analysis, segments, text: norm, sources: [src], words: L.intake.words(norm) });
      return 'planned';
    } catch (e) { return e.code || 'error'; } finally { L.S.settings.weeklyHours = 12; L.save(); }
  });
  assert(refused === 'budget', `registrar refuses when the study budget is full (${refused})`);

  console.log('7. withdrawal window, completion, GPA');
  const wd = await page.evaluate(async (id) => { try { await L.registrar.withdraw(id); return 'withdrawn'; } catch (e) { return 'refused'; } }, second.id);
  assert(wd === 'withdrawn', 'withdrawal allowed early in the term');
  const c1 = await page.evaluate((id) => L.registrar.course(id), course.id);
  const afterWithdrawDeadline = new Date(c1.policy.withdrawBefore + 'T12:00:00');
  await setClock(local(afterWithdrawDeadline));
  await sweep();
  const wd2 = await page.evaluate(async (id) => { try { await L.registrar.withdraw(id); return 'withdrawn'; } catch (e) { return 'refused'; } }, course.id);
  assert(wd2 === 'refused', 'withdrawal refused after 60 % of the term');
  const end = new Date(c1.term.end + 'T12:00:00'); end.setDate(end.getDate() + 1);
  await setClock(local(end));
  await sweep();
  const done = await page.evaluate((id) => L.registrar.course(id).final, course.id);
  assert(done && done.letter, `course completed with a final grade (${done && done.letter} ${done && done.pct})`);
  const gpa = await page.evaluate(() => L.registrar.gpa());
  assert(gpa && gpa.completed === 1 && gpa.credits >= 1, `GPA over completed courses (${gpa && gpa.gpa})`);
  const wState = await page.evaluate((id) => L.registrar.courseState(L.registrar.course(id)), second.id);
  assert(wState === 'withdrawn', 'withdrawn course reports withdrawn');

  console.log('8. ledger integrity');
  let v = await page.evaluate(() => L.ledger.verify());
  assert(v.ok === true, 'ledger chain verifies');
  v = await page.evaluate(async () => { const e = L.S.ledger[2]; const keep = e.detail; e.detail = { tampered: true }; const r = await L.ledger.verify(); e.detail = keep; return r; });
  assert(v.ok === false && v.brokenAt === 2, 'tampering is detected at the right entry');
  v = await page.evaluate(() => L.ledger.verify());
  assert(v.ok === true, 'restored ledger verifies again');

  console.log('9. export / import round trip');
  const rt = await page.evaluate(async () => {
    const obj = await L.exportRecord();
    const before = JSON.stringify(L.S.courses.map((c) => c.id));
    await L.importRecord(JSON.parse(JSON.stringify(obj)));
    const mat = await L.db.getMaterial(L.S.courses[0].id);
    return { same: before === JSON.stringify(L.S.courses.map((c) => c.id)), hasMaterial: !!(mat && mat.length > 500), hasLedger: L.S.ledger.length > 5 };
  });
  assert(rt.same && rt.hasMaterial && rt.hasLedger, 'export/import preserves courses, materials and ledger');

  console.log('10. every route renders, light and dark, no overflow');
  const routes = ['#/today', '#/courses', `#/course/${course.id}?tab=syllabus`, `#/course/${course.id}?tab=assessments`, `#/course/${course.id}?tab=grades`, `#/course/${course.id}?tab=materials`, `#/course/${course.id}/week/1`, '#/calendar', '#/record', '#/settings', '#/enrol'];
  let i = 8;
  for (const r of routes) {
    await page.goto(file + '?debug=1' + r);
    await sleep(350);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(ov <= 0, `${r} has no horizontal overflow (${ov}px)`);
    const txt = await page.evaluate(() => document.querySelector('#main').innerText.length);
    assert(txt > 40, `${r} renders content`);
    await shot(String(i++).padStart(2, '0') + '-' + r.replace(/[^a-z0-9]+/gi, '-'));
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.goto(file + '?debug=1#/today'); await sleep(300);
  await shot('20-today-dark');
  await page.goto(file + '?debug=1#/calendar'); await sleep(300);
  await shot('21-calendar-dark');

  console.log('11. clock reset is logged');
  await page.evaluate(() => L.clock.reset());
  const types = await page.evaluate(() => L.S.ledger.map((e) => e.type));
  assert(types.includes('clock_override') && types.includes('clock_reset'), 'clock overrides and reset are in the ledger');

  await browser.close();
  if (consoleErrors.length) { console.log('\nConsole errors:'); consoleErrors.forEach((e) => console.log('  ! ' + e)); }
  console.log(`\n${failures.length} failed, ${consoleErrors.length} console errors`);
  process.exit(failures.length || consoleErrors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
