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
  // the registration contract: draw a signature with the mouse, type the name, sign
  const signContract = async (pg, name) => {
    await pg.waitForSelector('#signature-pad', { timeout: 10000 });
    await pg.locator('#signature-pad').scrollIntoViewIfNeeded();
    const box = await pg.locator('#signature-pad').boundingBox();
    await pg.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
    await pg.mouse.down();
    for (let i = 1; i <= 24; i++) await pg.mouse.move(box.x + box.width * (0.2 + i * 0.025), box.y + box.height * (0.6 + Math.sin(i / 2) * 0.25));
    await pg.mouse.up();
    await pg.fill('#contract-name', name);
    await pg.click('[data-act=sign-enrol]');
  };

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
  await page.waitForSelector('.paces', { timeout: 60000 });
  await shot('02-paces');
  const paceWeeks = await page.evaluate(() => Array.from(document.querySelectorAll('.pace-card .pace-n')).map((n) => parseInt(n.textContent, 10)));
  assert(paceWeeks.length === 3 && new Set(paceWeeks.filter(Number.isFinite)).size === paceWeeks.filter(Number.isFinite).length, `three pacings with distinct lengths (${paceWeeks.join('/')})`);
  assert(paceWeeks[0] <= paceWeeks[1] && paceWeeks[1] <= paceWeeks[2], 'condensed ≤ standard ≤ extended');
  await page.click('[data-act=choose-pace][data-pace=standard]');
  await page.waitForSelector('.prospectus', { timeout: 10000 });
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
    assert(pro.plan.pace === 'standard' && pro.plan.studyDays.length === 5, 'standard pace: Mon–Fri study blocks');
    assert(pro.sessions.every((s) => s.chunks.length >= 2 && s.chunks.length <= 5), 'every study block has 2–5 chunks');
    assert(pro.sessions.every((s) => s.chunks.every((k) => k.minutes >= 5 && k.minutes <= 25)), 'every chunk is 5–25 minutes');
    const readSegs = pro.sessions.flatMap((s) => s.chunks.filter((k) => k.kind === 'read').map((k) => k.segment));
    assert(new Set(readSegs).size === pro.material.segments.length, `reading chunks cover every segment (${new Set(readSegs).size}/${pro.material.segments.length})`);
    const reads = pro.sessions.flatMap((s) => s.chunks.filter((k) => k.kind === 'read')).sort((a, b) => a.from - b.from);
    assert(reads.every((k, i) => i === 0 || k.from >= reads[i - 1].to), 'reading chunks never overlap');
  }
  await page.click('[data-act=enrol-confirm]');
  await page.waitForSelector('.sheet.contract', { timeout: 10000 });
  await shot('02b-contract');
  await page.fill('#contract-name', 'Somebody Else');
  await page.click('[data-act=sign-enrol]');
  await sleep(300);
  assert((await page.evaluate(() => L.S.courses.length)) === 0, 'a wrong name does not sign the contract');
  await signContract(page, 'ada lovelace');
  await page.waitForFunction(() => L.route().name === 'course' && document.querySelector('.plan'), null, { timeout: 15000 });
  assert((await route()) === 'course', 'signing the contract enrols and lands on the course page');
  const course = await page.evaluate(() => L.S.courses[0]);
  assert(course.contract && course.contract.signature.startsWith('data:image/png') && course.contract.no.startsWith('LYC-C-'), 'the signed contract (signature image + number) is stored on the course');
  assert(course.color !== '#4ade80', `the first course is not the brand green (${course.color})`);
  assert(course && course.code && /\s\d{3}$/.test(course.code), `course code assigned (${course && course.code})`);
  assert(course.weeks.length === course.term.weeks, 'weeks array matches term length');
  assert(course.weeks.every((w) => w.kind === 'final' || w.segments.length > 0), 'every teaching week has reading segments');
  const ledger1 = await page.evaluate(() => L.S.ledger.map((e) => e.type));
  assert(ledger1.includes('matriculated') && ledger1.includes('contract_signed') && ledger1.includes('enrolled'), 'ledger has matriculated + contract_signed + enrolled');
  await shot('03-course-plan');

  console.log('3. daily chunks: today, not yet, late');
  const s0 = course.sessions[0];
  await setClock(`${s0.date}T${String(Math.floor(s0.start / 60)).padStart(2, '0')}:${String(s0.start % 60).padStart(2, '0')}:30`);
  await sweep();
  await page.goto(file + '?debug=1#/today');
  await page.waitForSelector('.study-block', { timeout: 5000 });
  await shot('03b-today-study');
  const nChecks = await page.evaluate(() => document.querySelectorAll('.study-block [data-in=chunk-done]').length);
  assert(nChecks === s0.chunks.length, `today's study lists the day's ${s0.chunks.length} chunks`);
  const done1 = await page.evaluate(({ cid, sid, kid }) => L.registrar.complete(cid, sid, kid), { cid: course.id, sid: s0.id, kid: s0.chunks[0].id });
  assert(done1 === 'done', 'a chunk completed on its day counts on time');
  const notYet = await page.evaluate(({ cid, sid, kid }) => L.registrar.complete(cid, sid, kid), { cid: course.id, sid: course.sessions[2].id, kid: course.sessions[2].chunks[0].id });
  assert(notYet === 'not_yet', 'a future day\'s chunk cannot be completed early');
  const s1 = course.sessions[1];
  await setClock(`${course.sessions[2].date}T12:00:00`);
  await sweep();
  const late1 = await page.evaluate(({ cid, sid, kid }) => L.registrar.complete(cid, sid, kid), { cid: course.id, sid: s1.id, kid: s1.chunks[0].id });
  assert(late1 === 'late', 'a chunk completed after its day is recorded late');
  const part = await page.evaluate((cid) => L.registrar.standing(L.registrar.course(cid)).participation, course.id);
  assert(part && part.done === 2 && Math.abs(part.credit - 1.5) < 1e-9, `participation credit: on-time 1 + late ½ (${part && part.credit})`);
  await page.goto(file + `?debug=1#/course/${course.id}/day/${s0.date}`);
  await page.waitForFunction(() => document.querySelector('#reading-body') && !/Loading/.test(document.querySelector('#reading-body').textContent), null, { timeout: 10000 });
  const readTxt = await page.evaluate(() => document.querySelector('#reading-body').innerText.length);
  assert(readTxt > 200, 'day view shows the chunk\'s material (text source)');
  await shot('03c-day-view');

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
    const p = L.registrar.plans({ analysis, segments, text: norm, sources: [src], words: L.intake.words(norm) }).standard;
    const c = await L.registrar.enrol(p, { name: L.S.student.name, signature: L.S.courses[0].contract.signature });
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
      L.registrar.plans({ analysis, segments, text: norm, sources: [src], words: L.intake.words(norm) });
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

  console.log('7b. a passed course earns a certificate; a failed one does not');
  assert(!(await page.evaluate((id) => !!L.registrar.course(id).certificate, course.id)), 'the failed course has no certificate');
  const passed = await page.evaluate(async () => {
    L.S.settings.weeklyHours = 40; L.save();
    const src = L.intake.fromText(L.SAMPLE.text, 'Probability again');
    const norm = L.intake.normalize(src.text); const segments = L.intake.segment(norm);
    const { analysis } = await L.faculty.offline.analyze({ text: norm, segments, hint: 'Probability for Certificates', words: L.intake.words(norm) });
    const p = L.registrar.plans({ analysis, segments, text: norm, sources: [src], words: L.intake.words(norm) }).condensed;
    const c = await L.registrar.enrol(p, { name: L.S.student.name, signature: L.S.courses[0].contract.signature });
    for (const a of c.assessments.slice().sort((x, y) => (x.opensAt < y.opensAt ? -1 : 1))) {
      await L.clock.setOffset(new Date(a.opensAt).getTime() + 60000 - Date.now());
      await L.registrar.sweep();
      await L.registrar.begin(c.id, a.id, {});
      for (const q of a.paper.questions) L.registrar.answer(c.id, a.id, q.id, q.type === 'mcq' ? q.answer : (q.modelAnswer || q.prompt));
      await L.registrar.submit(c.id, a.id, {});
    }
    await L.clock.setOffset(new Date(c.term.end + 'T12:00:00').getTime() + 86400000 - Date.now());
    await L.registrar.sweep();
    const cc = L.registrar.course(c.id);
    return { id: cc.id, final: cc.final, cert: cc.certificate, grades: cc.assessments.map((a) => a.grade && a.grade.pct) };
  });
  assert(passed.final && passed.final.pct >= 70, `sitting every paper well completes the course above the pass mark (${passed.final && passed.final.pct})`);
  assert(passed.cert && /^LYC-\d{4}-\d{5}$/.test(passed.cert.no) && /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(passed.cert.code) && passed.cert.hash.length === 64, `a certificate is issued (${passed.cert && passed.cert.no} ${passed.cert && passed.cert.code})`);
  const types7 = await page.evaluate(() => L.S.ledger.map((e) => e.type));
  assert(types7.includes('certificate_issued'), 'ledger records the certificate');
  await page.goto(file + `?debug=1#/certificate/${passed.id}`);
  await page.waitForSelector('.sheet.certificate svg', { timeout: 10000 });
  const certText = await page.evaluate(() => document.querySelector('.sheet.certificate').textContent);
  assert(certText.includes('Ada Lovelace') && certText.includes('Certificate of Completion') && certText.includes(passed.cert.code), 'certificate shows the student, the title and the verification code');
  assert(await page.evaluate(() => !!document.querySelector('.sheet.certificate image')), 'certificate carries the student\'s own signature');
  await shot('07b-certificate');
  const png = await page.evaluate(async (id) => { const b = await L.papers.certificatePng(L.registrar.course(id)); return b && b.size; }, passed.id);
  assert(png > 20000, `certificate exports as a PNG (${png} bytes)`);
  await page.goto(file + `?debug=1#/contract/${passed.id}`);
  await page.waitForSelector('.sheet.contract', { timeout: 10000 });
  assert(await page.evaluate(() => !!document.querySelector('.sheet.contract .pad-wrap.is-signed img')), 'the signed contract is viewable with its signature');
  await page.goto(file + '?debug=1#/stats');
  await page.waitForSelector('.tile', { timeout: 10000 });
  const statsTxt = await page.evaluate(() => document.querySelector('#main').innerText);
  assert(/Current streak/.test(statsTxt) && /Longest streak/.test(statsTxt), 'stats page shows streak tiles');
  assert(await page.evaluate(() => !!document.querySelector('.chart rect')), 'stats page draws the weekly bar chart');
  await shot('07c-stats');
  await page.goto(file + '?debug=1#/record');
  await page.waitForSelector('.transcript', { timeout: 5000 });
  assert(await page.evaluate(() => /Certificates/.test(document.querySelector('#main').innerText) && !!document.querySelector('a[href^="#/certificate/"]')), 'grades page lists the certificate');

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
  const routes = ['#/today', '#/courses', `#/course/${course.id}?tab=syllabus`, `#/course/${course.id}?tab=assessments`, `#/course/${course.id}?tab=grades`, `#/course/${course.id}?tab=materials`, `#/course/${course.id}?tab=plan`, `#/course/${course.id}/day/${course.sessions[0].date}`, '#/calendar', '#/record', '#/settings', '#/enrol', '#/stats', `#/contract/${course.id}`];
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

  console.log('12. a PDF through the wizard: original pages');
  await page.goto(file + '?debug=1#/enrol');
  await page.waitForSelector('#file-input', { state: 'attached', timeout: 5000 });
  await page.setInputFiles('#file-input', path.join(root, 'tools', 'fixtures', 'mechanics.pdf'));
  await page.waitForSelector('.source-row', { timeout: 30000 });
  await page.click('[data-act=submit-registrar]');
  await page.waitForSelector('.paces', { timeout: 60000 });
  await page.click('[data-act=choose-pace][data-pace=condensed]');
  await page.waitForSelector('.prospectus', { timeout: 10000 });
  const pdfPro = await page.evaluate(() => window.__prospectus);
  assert(pdfPro.material.sources[0].pageStarts && pdfPro.material.sources[0].pageStarts.length === 3, 'PDF source carries page offsets (3 pages)');
  assert(pdfPro.sessions.some((s) => s.chunks.some((k) => k.kind === 'read' && k.pages && k.pages[0] >= 1)), 'reading chunks point at page ranges');
  assert(pdfPro.plan.pace === 'condensed' && pdfPro.plan.studyDays.length === 6, 'condensed pace studies six days a week');
  await page.click('[data-act=enrol-confirm]');
  await signContract(page, 'Ada Lovelace');
  await page.waitForFunction(() => L.route().name === 'course', null, { timeout: 15000 });
  const pdfCourse = await page.evaluate(() => L.S.courses[L.S.courses.length - 1]);
  assert(pdfCourse.color !== course.color, `the second course gets its own colour (${pdfCourse.color})`);
  const firstRead = pdfCourse.sessions.flatMap((s) => s.chunks.filter((k) => k.kind === 'read').map((k) => ({ s, k })))[0];
  await page.goto(file + `?debug=1#/course/${pdfCourse.id}/day/${firstRead.s.date}?chunk=${firstRead.k.id}`);
  await page.waitForSelector('#reading-body canvas', { timeout: 30000 });
  const canvases = await page.evaluate(() => document.querySelectorAll('#reading-body canvas').length);
  assert(canvases >= 1, `original PDF pages rendered (${canvases} canvas)`);
  await shot('22-pdf-pages');
  await page.goto(file + `?debug=1#/course/${pdfCourse.id}/day/${firstRead.s.date}?chunk=${firstRead.k.id}&view=text`);
  await page.waitForFunction(() => document.querySelector('#reading-body.reading') && document.querySelector('#reading-body').innerText.length > 50, null, { timeout: 10000 });
  assert(true, 'text toggle shows the extracted text');
  const stored = await page.evaluate(async (id) => { const f = await L.db.getFile(id); return f && f.kind === 'pdf' && f.bytes && f.bytes.byteLength > 1000; }, pdfCourse.material.sources[0].id);
  assert(stored, 'original PDF bytes stored on the device');

  console.log('13. phone layout');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const r of ['#/today', `#/course/${pdfCourse.id}?tab=plan`, `#/course/${pdfCourse.id}?tab=assessments`, '#/calendar', `#/assess/${course.id}/${quiz1.id}`, '#/record', '#/stats', `#/certificate/${passed.id}`, `#/contract/${passed.id}`]) {
    await page.goto(file + '?debug=1' + r); await sleep(350);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(ov <= 0, `phone ${r} has no horizontal overflow (${ov}px)`);
  }
  const tabbar = await page.evaluate(() => getComputedStyle(document.querySelector('.rail')).position);
  assert(tabbar === 'fixed', 'rail becomes a fixed bottom tab bar on phones');
  await page.goto(file + '?debug=1#/today'); await sleep(300);
  await shot('23-phone-today');
  await page.goto(file + `?debug=1#/assess/${course.id}/${quiz1.id}`); await sleep(300);
  await shot('24-phone-result');
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('14. phone, fresh device: a 600-page book, enrol, reload, study');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Europe/London', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const m = await mctx.newPage();
  m.on('console', (x) => { if (x.type() === 'error') consoleErrors.push('phone: ' + x.text()); });
  m.on('pageerror', (e) => consoleErrors.push('phone pageerror: ' + e.message));
  await m.goto(file + '?debug=1#/welcome');
  await m.waitForSelector('#student-name', { timeout: 15000 });
  await m.fill('#student-name', 'Grace Hopper');
  await m.tap('[data-act=matriculate]');
  await m.waitForSelector('.empty', { timeout: 5000 });
  await m.screenshot({ path: path.join(shots, '30-phone-empty.png') });
  await m.goto(file + '?debug=1#/enrol');
  await m.waitForSelector('#file-input', { state: 'attached', timeout: 5000 });
  await m.setInputFiles('#file-input', path.join(root, 'tools', 'fixtures', 'book-600.pdf'));
  await m.waitForSelector('.source-row', { timeout: 180000 });
  const src600 = await m.evaluate(() => document.querySelector('.source-row .num').textContent);
  console.log('   source:', src600.trim());
  await m.tap('[data-act=submit-registrar]');
  await m.waitForSelector('.paces', { timeout: 120000 });
  await m.screenshot({ path: path.join(shots, '31-phone-paces.png') });
  const paces = await m.evaluate(() => Array.from(document.querySelectorAll('.pace-card')).map((c) => ({ weeks: parseInt(c.querySelector('.pace-n').textContent, 10), text: c.innerText })));
  assert(paces.length === 3, 'three pace cards');
  const mins = paces.map((p) => parseInt((/(\d+) min/.exec(p.text) || [])[1], 10));
  assert(mins[0] > mins[1] && mins[1] > mins[2], `daily minutes fall from condensed to extended (${mins.join(' > ')})`);
  assert(paces[0].weeks < paces[1].weeks && paces[1].weeks < paces[2].weeks, `weeks rise from condensed to extended (${paces.map((p) => p.weeks).join(' < ')})`);
  assert(paces[2].weeks >= paces[1].weeks * 1.8 && paces[1].weeks >= paces[0].weeks * 1.8, `term length follows daily effort, not a cap (${paces.map((p) => p.weeks).join('/')})`);
  await m.tap('[data-act=choose-pace][data-pace=standard]');
  await m.waitForSelector('.prospectus', { timeout: 10000 });
  await m.tap('[data-act=enrol-confirm]');
  await m.waitForSelector('.sheet.contract', { timeout: 10000 });
  await m.screenshot({ path: path.join(shots, '31b-phone-contract.png') });
  const ovc = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(ovc <= 0, `phone contract has no horizontal overflow (${ovc}px)`);
  await signContract(m, 'Grace Hopper');
  await m.waitForFunction(() => L.route().name === 'course', null, { timeout: 30000 });
  const bookId = await m.evaluate(() => L.S.courses[0].id);
  await m.screenshot({ path: path.join(shots, '32-phone-course.png') });
  // the reload is the whole point: the course must survive it
  await m.reload();
  await m.waitForFunction(() => window.L && L.S && L.S.courses.length === 1, null, { timeout: 15000 });
  const after = await m.evaluate(async (id) => { const c = L.S.courses[0]; const mat = await L.db.getMaterial(id); const f = await L.db.getFile(c.material.sources[0].id); return { same: c.id === id, mat: !!(mat && mat.length > 100000), file: !!(f && f.bytes && f.bytes.byteLength > 100000), pages: c.material.sources[0].pageStarts.length, chunks: c.sessions.reduce((n, s) => n + s.chunks.length, 0), weeks: c.term.weeks }; }, bookId);
  assert(after.same && after.mat && after.file, 'after a reload the course, its text and its PDF are all still there');
  assert(after.pages === 600, `600 page offsets recorded (${after.pages})`);
  const roles = await m.evaluate(() => { const c = L.S.courses[0]; const segs = c.material.segments; const reads = c.sessions.flatMap((s) => s.chunks.filter((k) => k.kind === 'read')); return { front: segs.filter((g) => g.role === 'front').length, back: segs.filter((g) => g.role === 'back').length, firstPage: Math.min(...reads.map((k) => k.pages ? k.pages[0] : 999)), lastPage: Math.max(...reads.map((k) => k.pages ? k.pages[1] : 0)), titles: reads.map((k) => k.title).filter((t) => /contents|index|copyright/i.test(t)).length }; });
  assert(roles.front >= 1 && roles.back >= 1, `title, copyright, contents and index pages are classified (${roles.front} front, ${roles.back} back)`);
  assert(roles.firstPage >= 5 && roles.lastPage <= 597 && roles.titles === 0, `no study chunk covers the contents or index pages (reading spans pp. ${roles.firstPage}–${roles.lastPage})`);
  console.log(`   ${after.weeks} weeks · ${after.chunks} chunks`);
  const book = await m.evaluate(() => L.S.courses[0]);
  const firstDay = book.sessions[0];
  await m.evaluate((iso) => { L.clock.setOffset(new Date(iso).getTime() - Date.now()); }, `${firstDay.date}T09:05:00`);
  await m.goto(file + `?debug=1#/course/${bookId}/day/${firstDay.date}`);
  await m.waitForSelector('#reading-body canvas', { timeout: 60000 });
  await m.screenshot({ path: path.join(shots, '33-phone-pages.png') });
  const ov1 = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(ov1 <= 0, `phone day view has no horizontal overflow (${ov1}px)`);
  await m.tap('.study-block .chunk:first-child .chunk-check');
  await m.waitForFunction(() => document.querySelector('.study-block .chunk[data-state=done]'), null, { timeout: 5000 });
  const tile = await m.evaluate(() => { const c = L.S.courses[0]; return L.tileState(c, L.date.iso(L.today())); });
  assert(tile === 'part', `today's tile lights up after a chunk is ticked (${tile})`);
  await m.goto(file + '?debug=1#/today');
  await m.waitForSelector('.study-block', { timeout: 5000 });
  await m.screenshot({ path: path.join(shots, '34-phone-today.png') });
  await m.goto(file + '?debug=1#/courses');
  await m.waitForSelector('.course-card .tiles', { timeout: 5000 });
  await m.screenshot({ path: path.join(shots, '35-phone-courses.png') });
  const ov2 = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(ov2 <= 0, `phone courses page has no horizontal overflow (${ov2}px)`);
  await mctx.close();

  await browser.close();
  if (consoleErrors.length) { console.log('\nConsole errors:'); consoleErrors.forEach((e) => console.log('  ! ' + e)); }
  console.log(`\n${failures.length} failed, ${consoleErrors.length} console errors`);
  process.exit(failures.length || consoleErrors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
