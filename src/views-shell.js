(function (L) {
  'use strict';

  const R = () => L.registrar;
  const esc = L.esc;
  L.views = L.views || {};
  L.actions = L.actions || {};
  L.inputs = L.inputs || {};

  // ---------- router ----------
  L.go = (path) => { location.hash = path.startsWith('#') ? path : '#' + path; };
  L.route = () => {
    const raw = (location.hash || '#/today').slice(1);
    const [pathPart, queryPart = ''] = raw.split('?');
    const seg = pathPart.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(queryPart));
    const params = {};
    let name = seg[0] || 'today';
    if (name === 'course' && seg[1]) { params.id = seg[1]; if (seg[2] === 'day' && seg[3]) { name = 'day'; params.date = seg[3]; } else if (seg[2] === 'week' && seg[3]) { name = 'week'; params.n = Number(seg[3]); } }
    if (name === 'assess') { params.id = seg[1]; params.aid = seg[2]; }
    return { name, params, query };
  };

  // ---------- icons ----------
  const I = {
    today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    courses: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="1"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    record: '<svg viewBox="0 0 24 24"><path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4M9 12h6M9 16h6"/></svg>',
    enrol: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  };

  // ---------- rail ----------
  function renderRail() {
    const rail = document.getElementById('rail');
    if (!rail) return;
    const s = L.S.student;
    if (!s) { rail.innerHTML = ''; rail.hidden = true; return; }
    rail.hidden = false;
    const { name } = L.route();
    const cur = (n) => (n === name || (n === 'courses' && ['course', 'day', 'week', 'assess'].includes(name)) ? ' aria-current="page"' : '');
    const openNow = L.S.courses.filter((c) => c.state === 'enrolled').flatMap((c) => c.assessments.filter((a) => ['open', 'late', 'in_progress'].includes(R().assessmentState(c, a)))).length;
    const active = R().courses('active').length;
    const nd = R().nextDeadline();
    rail.innerHTML = `
      <div class="rail-brand"><span class="wordmark">Lyceum</span><span class="est">Registrar</span></div>
      <nav class="rail-nav">
        <a href="#/today"${cur('today')}>${I.today}<span>Today</span>${openNow ? `<span class="badge">${openNow}</span>` : ''}</a>
        <a href="#/courses"${cur('courses')}>${I.courses}<span>Courses</span>${active ? `<span class="badge" style="background:var(--surface-2);color:var(--ink-2)">${active}</span>` : ''}</a>
        <a href="#/calendar"${cur('calendar')}>${I.calendar}<span>Calendar</span></a>
        <a href="#/record"${cur('record')}>${I.record}<span>Record</span></a>
        <a href="#/enrol"${cur('enrol')} class="rail-enrol">${I.enrol}<span>Enrol</span></a>
        <a href="#/settings"${cur('settings')}>${I.settings}<span>Settings</span></a>
      </nav>
      <div class="rail-foot">
        <div class="rail-clock"><div class="big" data-clock>${L.fmt.time(L.now())}</div><div class="sub" data-clock-date>${L.fmt.date(L.now())} ${new Date(L.now()).getFullYear()}${L.S.clock.offsetMs ? ' · clock offset' : ''}</div></div>
        ${nd ? `<div class="rail-next"><span class="label">Next deadline</span><div>${esc(nd.course.code)} · ${esc(nd.assessment.title)}</div><div class="when" data-countdown="${nd.at}">${L.fmt.rel(nd.at - L.now())}</div></div>` : ''}
        <div class="rail-student"><div class="seal">${esc(s.name.trim().charAt(0).toUpperCase())}</div><div><div class="name">${esc(s.name)}</div><div class="id">${esc(s.id)}</div></div></div>
      </div>`;
  }

  // ---------- render ----------
  let current = null;
  L.render = () => {
    const main = document.getElementById('main');
    if (!main) return;
    const route = L.route();
    if (!L.S.student && route.name !== 'welcome') { L.go('/welcome'); return; }
    if (L.S.student && route.name === 'welcome') { L.go('/today'); return; }
    const view = L.views[route.name] || L.views.today;
    if (current && current.unmount) { try { current.unmount(); } catch (e) { console.error(e); } }
    current = view;
    document.title = (view.title ? (typeof view.title === 'function' ? view.title(route.params) : view.title) + ' · ' : '') + 'Lyceum';
    renderRail();
    const busy = main.querySelector('.busy'); // keep an in-flight progress strip across re-renders
    main.innerHTML = view.render(route.params, route.query);
    if (busy) main.prepend(busy);
    if (view.mount) view.mount(main, route.params, route.query);
    L.S.ui.lastRoute = location.hash;
    window.scrollTo(0, 0);
  };

  L.boot = () => {
    document.addEventListener('click', async (ev) => {
      const el = ev.target.closest('[data-act]');
      if (!el || el.closest('#modals')) return;
      const fn = L.actions[el.dataset.act];
      if (!fn) return;
      ev.preventDefault();
      try { await fn(el, ev); } catch (e) { console.error(e); L.ui.toast(e.message || 'Something went wrong.', 'bad'); }
    });
    const onInput = (ev) => { const el = ev.target.closest('[data-in]'); if (!el) return; const fn = L.inputs[el.dataset.in]; if (fn) { try { fn(el, ev); } catch (e) { console.error(e); } } };
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
    window.addEventListener('hashchange', L.render);
    L.on('tick', () => {
      document.querySelectorAll('[data-clock]').forEach((n) => { n.textContent = L.fmt.time(L.now()); });
      document.querySelectorAll('[data-countdown]').forEach((n) => { n.textContent = L.fmt.rel(Number(n.dataset.countdown) - L.now()); });
      L.emit('tick-views');
    });
    let tick = 0;
    L.on('tick', () => { if (++tick % 30 === 0 && !document.querySelector('.exam')) renderRail(); });
    R().sweep().then(() => L.render()).catch((e) => { console.error(e); L.render(); });
  };

  // ---------- welcome ----------
  L.views.welcome = {
    title: 'Matriculation',
    render() {
      return `<div class="welcome">
        <div class="welcome-left">
          <div class="wordmark">Lyceum</div>
          <h1>Any material you bring becomes a real course, with a real calendar.</h1>
          <p class="lede">Upload notes, a textbook chapter, a PDF or a web page. The registrar reads it, proposes three pacings, and once you choose one it fixes the term: a daily study block of bite-sized chunks, quizzes, problem sets and examinations, and a permanent record of how you do. You study; the schedule holds.</p>
          <ul class="rules">
            <li><span class="n">01</span><span>The schedule is binding. Once you enrol, dates, weights and examinations cannot be changed.</span></li>
            <li><span class="n">02</span><span>The clock is real. Papers open and close on the calendar, not when you feel ready.</span></li>
            <li><span class="n">03</span><span>One attempt per assessment. A missed paper is recorded as zero.</span></li>
            <li><span class="n">04</span><span>The record is permanent and tamper-evident. Withdrawals are allowed only in the first 60% of a term.</span></li>
          </ul>
        </div>
        <div class="welcome-right">
          <span class="eyebrow">Office of the Registrar · Matriculation</span>
          <h2 class="display" style="font-size:28px">Enter your name as it should appear on the record.</h2>
          <div class="field mt-3"><label for="student-name">Full name</label><input id="student-name" class="input" autocomplete="name" placeholder="e.g. Ada Lovelace" data-in="student-name"></div>
          <div class="cols mt-3"><button class="btn btn-primary" data-act="matriculate">Matriculate</button><span class="small muted">This device holds one student record.</span></div>
        </div>
      </div>`;
    },
    mount(root) { const i = root.querySelector('#student-name'); if (i) { i.focus(); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') L.actions.matriculate(); }); } },
  };
  L.actions.matriculate = async () => {
    const name = (document.getElementById('student-name')?.value || '').trim();
    if (name.length < 2) { L.ui.toast('Enter your name to matriculate.', 'warn'); return; }
    const yr = String(new Date(L.now()).getFullYear()).slice(-2);
    const n = new Uint16Array(1); crypto.getRandomValues(n);
    L.S.student = { id: `LYC-${yr}-${String(n[0] % 10000).padStart(4, '0')}`, name, createdAt: new Date(L.now()).toISOString() };
    await L.ledger.append('matriculated', { name, id: L.S.student.id });
    L.saveNow();
    L.go('/today');
  };

  // ---------- today ----------
  const greeting = () => { const h = new Date(L.now()).getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
  const firstName = () => (L.S.student?.name || '').trim().split(/\s+/)[0];
  const stateChip = (st) => `<span class="chip" data-state="${st}">${({ upcoming: 'Locked', open: 'Open', late: 'Late window', in_progress: 'In progress', submitted: 'Submitted', graded: 'Graded', missed: 'Missed' })[st] || st}</span>`;
  L.stateChip = stateChip;
  L.actionFor = (c, a) => {
    const st = R().assessmentState(c, a);
    const href = `#/assess/${c.id}/${a.id}`;
    if (st === 'open') return `<a class="btn btn-primary btn-sm" href="${href}">Begin</a>`;
    if (st === 'late') return `<a class="btn btn-sm" href="${href}">Submit late</a>`;
    if (st === 'in_progress') return `<a class="btn btn-primary btn-sm" href="${href}">Resume</a>`;
    if (st === 'graded' || st === 'missed') return `<a class="btn btn-quiet btn-sm" href="${href}">Review</a>`;
    return `<a class="btn btn-quiet btn-sm" href="${href}">Details</a>`;
  };

  L.views.today = {
    title: 'Today',
    render() {
      const now = L.now();
      const today = L.today();
      const courses = R().courses('active');
      const running = courses.filter((c) => R().courseState(c) === 'running');
      const week = running.length ? Math.max(...running.map((c) => R().currentWeek(c))) : 0;
      const eyebrow = `${L.fmt.dateLong(now)}${week ? ` · Week ${week} of term` : ''}`;
      if (!L.S.courses.length) {
        return `<div class="page">
          <div class="page-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h1 class="display">${greeting()}, ${esc(firstName())}.</h1><p class="lede">You are not enrolled in anything yet. Bring the registrar some material and it will come back as a course with a term calendar.</p></div></div>
          <div class="empty">
            <h2>Start with what you want to learn.</h2>
            <p>Drop in a PDF, a chapter, lecture notes or a web page. The registrar assesses the material, proposes a condensed, a standard and an extended pace, and once you choose it fixes every study day, quiz, problem set and examination in advance.</p>
            <div class="cols mt-3"><a class="btn btn-primary" href="#/enrol">Enrol in a course</a><button class="btn" data-act="load-sample">Load the sample course</button></div>
            <p class="small muted mt-2">The sample is six lectures of introductory probability, plainly marked as sample material.</p>
          </div>
        </div>`;
      }
      const sessions = R().sessionsOn(today);
      const todayIso = L.date.iso(today);
      const overdue = [];
      for (const c of L.S.courses) if (c.state === 'enrolled') for (const s of c.sessions) if (s.date < todayIso && s.date >= L.date.iso(L.date.addDays(today, -7))) for (const k of s.chunks) if (!k.done) overdue.push({ c, s, k });
      const openNow = [];
      for (const c of L.S.courses) if (c.state === 'enrolled') for (const a of c.assessments) { const st = R().assessmentState(c, a); if (['open', 'late', 'in_progress'].includes(st)) openNow.push({ c, a, st }); }
      const due = R().deadlines({ from: now, to: now + 7 * 86400000 }).filter(({ course: c, assessment: a }) => !a.grade && R().assessmentState(c, a) !== 'in_progress');
      const nd = R().nextDeadline();
      const todayChunks = sessions.flatMap(({ session: s }) => s.chunks);
      const todayDone = todayChunks.filter((k) => k.done).length;
      const lede = [
        todayChunks.length ? `${todayChunks.length} study chunk${todayChunks.length === 1 ? '' : 's'} today, about ${L.fmt.dur(L.sum(todayChunks.map((k) => k.minutes)))}${todayDone ? ` · ${todayDone} done` : ''}.` : 'No study block today.',
        nd ? `${esc(nd.assessment.title)} for ${esc(nd.course.code)} is due ${L.fmt.rel(nd.at - now)}.` : 'Nothing is due in the coming days.',
      ].join(' ');
      const load = R().load();
      const missed = L.S.courses.filter((c) => c.state === 'enrolled').flatMap((c) => c.assessments.filter((a) => a.grade && a.grade.missed).map((a) => ({ c, a })));
      const notices = [];
      if (L.S.clock.offsetMs) notices.push(`<div class="notice" data-kind="warn"><span>The registrar clock is offset by ${L.fmt.rel(L.S.clock.offsetMs).replace(/^in /, '')}. Every action is recorded against the offset time. <a href="#/settings">Reset</a>.</span></div>`);
      missed.slice(-3).forEach(({ c, a }) => notices.push(`<div class="notice" data-kind="bad"><span>${esc(a.title)} for ${esc(c.code)} was missed and is recorded as 0.</span></div>`));
      openNow.filter((x) => x.st === 'late').forEach(({ c, a }) => notices.push(`<div class="notice"><span>${esc(a.title)} for ${esc(c.code)} is past due. Late submissions lose ${c.policy.late.perDayPct}% per day until ${L.fmt.dt(a.closesAt)}.</span></div>`));
      const gpa = R().gpa();
      return `<div class="page">
        <div class="page-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h1 class="display">${greeting()}, ${esc(firstName())}.</h1><p class="lede">${lede}</p></div>
          <div class="actions"><a class="btn" href="#/enrol">Enrol</a></div></div>
        <div class="today-grid">
          <div>
            <div class="section" style="margin-top:0"><div class="section-head"><h2>Today's study</h2><span class="small muted">${esc(L.fmt.date(now))}${todayChunks.length ? ` · ${todayDone}/${todayChunks.length}` : ''}</span></div>
              ${sessions.length ? sessions.map(({ course: c, session: s }) => L.studyBlock(c, s, { today: true })).join('') : `<p class="muted">No study block today. ${nd ? 'Use the time on what is due next.' : ''}</p>`}
              ${overdue.length ? `<div class="mt-3"><span class="label">Catch up · ${overdue.length} chunk${overdue.length === 1 ? '' : 's'} from earlier days</span><div class="chunks mt-1">${overdue.slice(0, 6).map(({ c, s, k }) => L.chunkRow(c, s, k)).join('')}${overdue.length > 6 ? `<p class="small muted">… and ${overdue.length - 6} more in the course plans.</p>` : ''}</div></div>` : ''}
            </div>
            <div class="section"><div class="section-head"><h2>Open now</h2></div>
              ${openNow.length ? `<div class="agenda">${openNow.map(({ c, a, st }) => `<div class="agenda-item"><div class="time">${st === 'in_progress' ? `<span data-countdown="${R().deadline(c, a)}">${L.fmt.rel(R().deadline(c, a) - now)}</span>` : st === 'late' ? `closes ${L.fmt.rel(L.date.parse(a.closesAt) - now)}` : `due ${L.fmt.rel(L.date.parse(a.dueAt) - now)}`}</div><div class="who"><span class="dot" style="--ch:${c.hue}"></span><span class="code" style="--ch:${c.hue}">${esc(c.code)}</span></div><div class="what"><div class="t">${esc(a.title)} ${stateChip(st)}</div><div class="s">${a.durationMin ? L.fmt.dur(a.durationMin) + ' · ' : ''}${esc(R().KIND_TITLE[a.kind])} · closes ${L.fmt.dt(a.closesAt)}</div></div><div class="action">${L.actionFor(c, a)}</div></div>`).join('')}</div>` : '<p class="muted">Nothing is open at the moment.</p>'}
            </div>
            <div class="section"><div class="section-head"><h2>Due in the next 7 days</h2></div>
              ${due.length ? `<div class="agenda due-list">${due.map(({ course: c, assessment: a, at }) => `<div class="agenda-item"><div class="time">${L.fmt.dt(at)}</div><div class="who"><span class="dot" style="--ch:${c.hue}"></span><span class="code" style="--ch:${c.hue}">${esc(c.code)}</span></div><div class="what"><div class="t">${esc(a.title)}</div><div class="s">${esc(R().KIND_TITLE[a.kind])}${a.durationMin ? ` · ${L.fmt.dur(a.durationMin)}` : ''} · opens ${L.fmt.dt(a.opensAt)}</div></div><div class="action">${L.actionFor(c, a)}</div></div>`).join('')}</div>` : '<p class="muted">Nothing due this week.</p>'}
            </div>
          </div>
          <div class="stack gap-3">
            <div class="card"><div class="card-head"><h2>Standing</h2><span class="small muted">${gpa.completed ? `${gpa.completed} completed` : 'no completed courses'}</span></div><div class="card-body">
              <div class="cols gap-2"><div class="tile" style="flex:1"><div class="tile-n">${gpa.gpa == null ? '—' : gpa.gpa.toFixed(2)}</div><div class="tile-l">GPA · ${gpa.credits} credit${gpa.credits === 1 ? '' : 's'} earned</div></div></div>
              <div class="mt-2">${courses.length ? courses.map((c) => { const s = R().standing(c); const st = R().courseState(c); return `<div class="standing-row"><div><a class="code" style="--ch:${c.hue}" href="#/course/${c.id}">${esc(c.code)}</a> <span class="small muted">· ${st === 'upcoming' ? `starts ${L.fmt.date(c.term.start)}` : `week ${R().currentWeek(c)} of ${c.term.weeks}`}</span><div class="small truncate">${esc(c.title)}</div></div><div class="num mono small">${s.current == null ? '—' : L.fmt.pct(s.current)}</div><div class="letter">${s.letter || '·'}</div></div>`; }).join('') : '<p class="muted small">No active courses.</p>'}</div>
            </div></div>
            <div class="card"><div class="card-head"><h2>This week's load</h2><span class="small muted num">${load.hours} / ${load.budget} h</span></div><div class="card-body"><div class="progress${load.hours > load.budget ? ' is-over' : ''}"><i style="width:${Math.min(100, (load.hours / load.budget) * 100)}%"></i></div><p class="small muted mt-2">${courses.map((c) => `${esc(c.code)} ${c.plan.hoursPerWeek} h`).join(' · ') || 'No committed hours.'}</p></div></div>
            ${notices.length ? `<div class="stack gap-1"><span class="label">Notices</span>${notices.join('')}</div>` : ''}
          </div>
        </div>
      </div>`;
    },
  };
  L.actions['load-sample'] = () => { L.go('/enrol?sample=1'); };

  // one day's study block: heading + numbered bite-sized chunks
  const KIND_LABEL = { read: 'Read', practise: 'Practise', review: 'Review' };
  L.chunkRow = (c, s, k, { number } = {}) => {
    const todayIso = L.date.iso(L.today());
    const state = k.done ? (L.date.iso(k.done) <= s.date ? 'done' : 'late') : s.date < todayIso ? 'overdue' : s.date > todayIso ? 'future' : 'due';
    const where = k.kind === 'read' ? (k.pages ? (k.pages[0] === k.pages[1] ? `p. ${k.pages[0]}` : `pp. ${k.pages[0]}–${k.pages[1]}`) : 'text') : '';
    const href = k.kind === 'read' ? `#/course/${c.id}/day/${s.date}?chunk=${k.id}` : `#/course/${c.id}/day/${s.date}`;
    return `<div class="chunk" data-state="${state}"><label class="chunk-check"><input type="checkbox" data-in="chunk-done" data-course="${c.id}" data-session="${s.id}" data-chunk="${k.id}"${k.done ? ' checked disabled' : state === 'future' ? ' disabled' : ''}><span class="sr-only">Done</span></label>
      <div class="chunk-body"><a class="chunk-title" href="${href}">${number ? `<span class="chunk-n">${number}</span>` : ''}${esc(k.title)}</a><div class="chunk-meta"><span class="pill">${KIND_LABEL[k.kind] || k.kind}</span>${where ? ` <span class="mono">${where}</span>` : ''} <span class="num">${k.minutes} min</span>${state === 'late' ? ' <span class="chip" data-state="warn">Done late</span>' : state === 'overdue' ? ` <span class="chip" data-state="bad">Due ${L.fmt.date(s.date)}</span>` : ''}</div></div></div>`;
  };
  L.studyBlock = (c, s, { today = false } = {}) => {
    const done = s.chunks.filter((k) => k.done).length;
    const h = Math.floor(s.start / 60), m = s.start % 60;
    return `<div class="study-block" style="--ch:${c.hue}"><div class="study-head"><div><span class="code" style="--ch:${c.hue}">${esc(c.code)}</span> <span class="small muted">· week ${s.week} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${L.fmt.dur(s.minutes)}</span><div class="study-topic">${esc(s.topic)}</div></div><div class="num small muted">${done}/${s.chunks.length}</div></div>
      <div class="progress mb-2"><i style="width:${s.chunks.length ? (done / s.chunks.length) * 100 : 0}%"></i></div>
      <div class="chunks">${s.chunks.map((k, i) => L.chunkRow(c, s, k, { number: i + 1 })).join('')}</div></div>`;
  };
  L.inputs['chunk-done'] = async (el) => {
    if (!el.checked) return;
    const r = await R().complete(el.dataset.course, el.dataset.session, el.dataset.chunk);
    if (r === 'not_yet') { el.checked = false; L.ui.toast('That chunk is scheduled for a later day.', 'warn'); return; }
    if (r === 'late') L.ui.toast('Done — recorded as late (half credit).', 'warn');
    else if (r === 'done') L.ui.toast('Done.', 'good', 1600);
    L.render();
  };
})(window.L);
