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
    if (name === 'contract' || name === 'certificate') params.id = seg[1];
    return { name, params, query };
  };

  // ---------- icons ----------
  const I = {
    today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    courses: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="1"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    record: '<svg viewBox="0 0 24 24"><path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4M9 12h6M9 16h6"/></svg>',
    enrol: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>',
    stats: '<svg viewBox="0 0 24 24"><path d="M4 19.5h16M6 16V10M11 16V5M16 16v-4M21 16V8"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  };

  L.LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true" class="mark"><g fill="currentColor"><path d="M32 4 L61 20 L58.5 22.6 L32 8.2 L5.5 22.6 L3 20 Z"/><path d="M32 9.6 L56 22.6 L8 22.6 Z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M32 12.4 l1.4 3.2 3.2 1.4 -3.2 1.4 -1.4 3.2 -1.4 -3.2 -3.2 -1.4 3.2 -1.4z"/><rect x="6" y="23" width="52" height="2.4" rx="0.6"/><rect x="7.5" y="25.6" width="49" height="1.6"/><rect x="10.5" y="30" width="5.2" height="28" rx="0.6"/><rect x="8.9" y="27.5" width="8.4" height="3" rx="1"/><circle cx="9.6" cy="29" r="1.3"/><circle cx="16.6" cy="29" r="1.3"/><rect x="9.3" y="57" width="7.6" height="2.2" rx="0.5"/><rect x="22.5" y="30" width="5.2" height="28" rx="0.6"/><rect x="20.9" y="27.5" width="8.4" height="3" rx="1"/><circle cx="21.6" cy="29" r="1.3"/><circle cx="28.6" cy="29" r="1.3"/><rect x="21.3" y="57" width="7.6" height="2.2" rx="0.5"/><rect x="34.5" y="30" width="5.2" height="28" rx="0.6"/><rect x="32.9" y="27.5" width="8.4" height="3" rx="1"/><circle cx="33.6" cy="29" r="1.3"/><circle cx="40.6" cy="29" r="1.3"/><rect x="33.3" y="57" width="7.6" height="2.2" rx="0.5"/><rect x="46.5" y="30" width="5.2" height="28" rx="0.6"/><rect x="44.9" y="27.5" width="8.4" height="3" rx="1"/><circle cx="45.6" cy="29" r="1.3"/><circle cx="52.6" cy="29" r="1.3"/><rect x="45.3" y="57" width="7.6" height="2.2" rx="0.5"/></g></svg>';
  L.MARK_INNER = '<g fill="currentColor"><path d="M32 4 L61 20 L58.5 22.6 L32 8.2 L5.5 22.6 L3 20 Z"/><path d="M32 9.6 L56 22.6 L8 22.6 Z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M32 12.4 l1.4 3.2 3.2 1.4 -3.2 1.4 -1.4 3.2 -1.4 -3.2 -3.2 -1.4 3.2 -1.4z"/><rect x="6" y="23" width="52" height="2.4" rx="0.6"/><rect x="7.5" y="25.6" width="49" height="1.6"/><rect x="10.5" y="30" width="5.2" height="28" rx="0.6"/><rect x="8.9" y="27.5" width="8.4" height="3" rx="1"/><circle cx="9.6" cy="29" r="1.3"/><circle cx="16.6" cy="29" r="1.3"/><rect x="9.3" y="57" width="7.6" height="2.2" rx="0.5"/><rect x="22.5" y="30" width="5.2" height="28" rx="0.6"/><rect x="20.9" y="27.5" width="8.4" height="3" rx="1"/><circle cx="21.6" cy="29" r="1.3"/><circle cx="28.6" cy="29" r="1.3"/><rect x="21.3" y="57" width="7.6" height="2.2" rx="0.5"/><rect x="34.5" y="30" width="5.2" height="28" rx="0.6"/><rect x="32.9" y="27.5" width="8.4" height="3" rx="1"/><circle cx="33.6" cy="29" r="1.3"/><circle cx="40.6" cy="29" r="1.3"/><rect x="33.3" y="57" width="7.6" height="2.2" rx="0.5"/><rect x="46.5" y="30" width="5.2" height="28" rx="0.6"/><rect x="44.9" y="27.5" width="8.4" height="3" rx="1"/><circle cx="45.6" cy="29" r="1.3"/><circle cx="52.6" cy="29" r="1.3"/><rect x="45.3" y="57" width="7.6" height="2.2" rx="0.5"/></g>';
  L.logo = (big = false) => `<span class="logo${big ? ' is-big' : ''}">${L.LOGO}<span>Lyceum</span></span>`;
  // one tile per calendar day of the term: full / part / none / future / off (no study block that day)
  L.tileState = (c, iso) => {
    const s = c.sessions.find((x) => x.date === iso);
    const today = L.date.iso(L.today());
    if (!s) return 'off';
    if (iso > today) return 'future';
    const done = s.chunks.filter((k) => k.done).length;
    return done === s.chunks.length && s.chunks.length ? 'full' : done ? 'part' : 'none';
  };
  L.tilesGrid = (c) => {
    const today = L.date.iso(L.today());
    const start = L.date.parse(c.term.start);
    const cols = Math.max(12, c.term.weeks); // a fixed horizon keeps short courses from looking like three fat columns
    const end = L.date.addDays(start, cols * 7 - 1);
    const out = [];
    for (let d = start; d <= end; d = L.date.addDays(d, 1)) { const iso = L.date.iso(d); const v = iso > c.term.end ? 'off' : L.tileState(c, iso); out.push(`<i data-v="${v}"${iso === today ? ' class="is-today"' : ''} title="${iso}"></i>`); }
    return `<div class="tiles-wrap"><div class="tiles" style="--ch:${L.cc(c)};--cols:${cols}">${out.join('')}</div></div>`;
  };
  L.tilesRow = (c, days = 14) => {
    const today = L.today();
    const out = [];
    for (let i = days - 1; i >= 0; i--) { const iso = L.date.iso(L.date.addDays(today, -i)); const v = iso < c.term.start || iso > c.term.end ? 'off' : L.tileState(c, iso); out.push(`<i data-v="${v}"${i === 0 ? ' class="is-today"' : ''}></i>`); }
    return `<div class="tiles-row" style="--ch:${L.cc(c)}">${out.join('')}</div>`;
  };

  // ---------- rail ----------
  function renderRail() {
    const rail = document.getElementById('rail');
    if (!rail) return;
    const s = L.S.student;
    if (!s) { rail.innerHTML = ''; rail.hidden = true; return; }
    rail.hidden = false;
    const { name } = L.route();
    const cur = (n) => (n === name || (n === 'courses' && ['course', 'day', 'week', 'assess', 'contract', 'certificate'].includes(name)) || (n === 'settings' && ['enrol', 'record'].includes(name)) ? ' aria-current="page"' : '');
    const openNow = L.S.courses.filter((c) => c.state === 'enrolled').flatMap((c) => c.assessments.filter((a) => ['open', 'late', 'in_progress'].includes(R().assessmentState(c, a)))).length;
    const active = R().courses('active').length;
    const nd = R().nextDeadline();
    rail.innerHTML = `
      <div class="rail-brand">${L.logo()}</div>
      <nav class="rail-nav">
        <a href="#/today"${cur('today')}>${I.today}<span>Today</span>${openNow ? `<span class="badge">${openNow}</span>` : ''}</a>
        <a href="#/courses"${cur('courses')}>${I.courses}<span>Courses</span>${active ? `<span class="badge is-quiet">${active}</span>` : ''}</a>
        <a href="#/calendar"${cur('calendar')}>${I.calendar}<span>Calendar</span></a>
        <a href="#/stats"${cur('stats')}>${I.stats}<span>Stats</span></a>
        <a href="#/settings"${cur('settings')}>${I.settings}<span>More</span></a>
      </nav>
      <div class="rail-foot">
        <div class="rail-clock"><div class="big" data-clock>${L.fmt.time(L.now())}</div><div class="sub" data-clock-date>${L.fmt.date(L.now())} ${new Date(L.now()).getFullYear()}${L.S.clock.offsetMs ? ' · clock offset' : ''}</div></div>
        ${nd ? `<div class="rail-next"><span class="label">Next deadline</span><div>${esc(nd.course.code)} · ${esc(nd.assessment.title)}</div><div class="when" data-countdown="${nd.at}">${L.fmt.rel(nd.at - L.now())}</div></div>` : ''}
        <div class="rail-student"><div class="seal">${esc(s.name.trim().charAt(0).toUpperCase())}</div><div><div class="name">${esc(s.name)}</div><div class="id">${esc(s.id)}</div></div></div>
      </div>`;
  }

  // tile grids get an explicit pixel size from their container so they never spill out of a card (Safari
  // sizes aspect-ratio grid items unreliably); long terms scroll to the most recent weeks
  L.sizeTiles = (root = document) => {
    root.querySelectorAll('.tiles').forEach((g) => {
      const wrap = g.parentElement; const cols = Number(g.style.getPropertyValue('--cols')) || 12;
      const w = wrap.clientWidth || 300;
      const gap = w / cols > 18 ? 4 : 3;
      const tile = L.clamp(Math.floor((w - (cols - 1) * gap) / cols), 7, 22);
      g.style.setProperty('--tile', `${tile}px`); g.style.setProperty('--gap', `${gap}px`);
      wrap.scrollLeft = wrap.scrollWidth;
    });
    root.querySelectorAll('.tiles-row').forEach((g) => {
      const n = g.children.length || 14; const w = g.parentElement.clientWidth || 300;
      const gap = 3; g.style.setProperty('--gap', `${gap}px`);
      g.style.setProperty('--tile', `${L.clamp(Math.floor((w - (n - 1) * gap) / n), 6, 14)}px`);
    });
  };
  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => L.sizeTiles(), 120); });

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
    try { renderRail(); } catch (e) { console.error(e); }
    const busy = main.querySelector('.busy'); // keep an in-flight progress strip across re-renders
    try { main.innerHTML = view.render(route.params, route.query); }
    catch (e) { console.error(e); main.innerHTML = `<div class="page"><div class="empty"><h2>This page could not be drawn.</h2><p class="mono small">${esc(e.message)}</p><p><a class="btn mt-2" href="#/today">Back to Today</a></p></div></div>`; return; }
    if (busy) main.prepend(busy);
    L.sizeTiles(main);
    if (view.mount) { try { const r = view.mount(main, route.params, route.query); if (r && r.catch) r.catch((e) => { console.error(e); L.ui.toast(e.message || 'Something went wrong.', 'bad'); }); } catch (e) { console.error(e); } }
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
    title: 'Start',
    render() {
      return `<div class="welcome">
        ${L.logo(true)}
        <h1>Any material becomes a real course, with a real calendar.</h1>
        <p class="lede">Bring a PDF, notes or a web page. The registrar proposes three pacings; pick one and the term is fixed: a daily block of bite-sized chunks, quizzes, problem sets and exams, and a permanent record.</p>
        <ul class="rules">
          <li><span class="n">01</span><span>Dates, weights and exams are fixed once you enrol.</span></li>
          <li><span class="n">02</span><span>Papers open and close on the calendar, not when you feel ready.</span></li>
          <li><span class="n">03</span><span>One attempt each. A missed paper is a zero.</span></li>
          <li><span class="n">04</span><span>The record is permanent. Withdraw only in the first 60% of a term.</span></li>
        </ul>
        <div class="welcome-right">
          <div class="field"><label for="student-name">Your name, as it should appear on the record</label><input id="student-name" class="input" autocomplete="name" placeholder="e.g. Ada Lovelace" data-in="student-name"></div>
          <button class="btn btn-primary w-full" data-act="matriculate">Start</button>
          <span class="small muted center">One student per device.</span>
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
          <div class="page-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h1 class="display">${greeting()}, ${esc(firstName())}.</h1><p class="lede">Nothing enrolled yet.</p></div></div>
          <div class="empty">
            <h2>Start with what you want to learn.</h2>
            <p>Drop in a PDF, a chapter, notes or a web page. You get three pacings; choose one and every study day, quiz and exam is fixed.</p>
            <div class="cols mt-3"><a class="btn btn-primary" href="#/enrol">Add a course</a><button class="btn" data-act="load-sample">Try the sample</button></div>
            <p class="small muted mt-2">The sample is six short lectures on probability.</p>
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
      if (L.storageProblem) notices.push(`<div class="notice" data-kind="bad"><span>${esc(L.storageProblem)}</span></div>`);
      if (L.S.clock.offsetMs) notices.push(`<div class="notice" data-kind="warn"><span>The registrar clock is offset by ${L.fmt.rel(L.S.clock.offsetMs).replace(/^in /, '')}. Every action is recorded against the offset time. <a href="#/settings">Reset</a>.</span></div>`);
      missed.slice(-3).forEach(({ c, a }) => notices.push(`<div class="notice" data-kind="bad"><span>${esc(a.title)} for ${esc(c.code)} was missed and is recorded as 0.</span></div>`));
      openNow.filter((x) => x.st === 'late').forEach(({ c, a }) => notices.push(`<div class="notice"><span>${esc(a.title)} for ${esc(c.code)} is past due. Late submissions lose ${c.policy.late.perDayPct}% per day until ${L.fmt.dt(a.closesAt)}.</span></div>`));
      const gpa = R().gpa();
      const row = (c, a, when, action) => `<div class="row"><span class="icon-sq is-sm" style="--ch:${L.cc(c)}">${esc(c.subjectCode.slice(0, 2))}</span><div class="t"><b>${esc(a.title)}</b><span>${esc(c.code)} · ${when}</span></div>${action}</div>`;
      return `<div class="page">
        <div class="page-head is-row"><div><span class="eyebrow">${esc(eyebrow)}</span><h1 class="display">${greeting()}, ${esc(firstName())}.</h1></div><div class="actions"><a class="btn btn-icon" href="#/enrol" aria-label="Add a course" title="Add a course">+</a></div></div>
        ${notices.length ? `<div class="stack gap-1 mb-3">${notices.join('')}</div>` : ''}
        <div class="today-grid stack gap-2 stagger">
          ${sessions.length ? sessions.map(({ course: c, session: s }) => L.studyBlock(c, s, { today: true })).join('') : `<div class="card quiet"><div class="card-body"><b>No study block today.</b><div class="small muted mt-1">${nd ? `${esc(nd.assessment.title)} for ${esc(nd.course.code)} is due ${L.fmt.rel(nd.at - now)}.` : 'Nothing is due in the coming days.'}</div></div></div>`}
          ${overdue.length ? `<div class="card"><div class="card-head"><h3>Catch up</h3><span class="small muted">${overdue.length} from earlier days</span></div><div class="card-body pt-0"><div class="chunks">${overdue.slice(0, 6).map(({ c, s, k }) => L.chunkRow(c, s, k)).join('')}</div>${overdue.length > 6 ? `<p class="small muted mt-1">… and ${overdue.length - 6} more in the course plans.</p>` : ''}</div></div>` : ''}
          ${openNow.length ? `<div class="card"><div class="card-head"><h3>Open now</h3></div><div class="card-body pt-0 rows">${openNow.map(({ c, a, st }) => row(c, a, st === 'in_progress' ? `<span data-countdown="${R().deadline(c, a)}">${L.fmt.rel(R().deadline(c, a) - now)}</span> left` : st === 'late' ? `late · closes ${L.fmt.dt(a.closesAt)}` : `due ${L.fmt.dt(a.dueAt)}`, `<a class="btn btn-sm ${st === 'in_progress' ? '' : 'btn-primary'}" href="#/assess/${c.id}/${a.id}">${st === 'in_progress' ? 'Resume' : st === 'late' ? 'Submit late' : 'Begin'}</a>`)).join('')}</div></div>` : ''}
          ${due.length ? `<div class="card"><div class="card-head"><h3>Due soon</h3><span class="small muted">next 7 days</span></div><div class="card-body pt-0 rows">${due.map(({ course: c, assessment: a, at }) => row(c, a, L.fmt.dt(at), `<a class="btn btn-sm btn-quiet" href="#/assess/${c.id}/${a.id}">Details</a>`)).join('')}</div></div>` : ''}
          ${courses.length ? `<div class="card"><div class="card-head"><h3>Standing</h3><span class="small muted">${gpa.completed ? `GPA ${gpa.gpa.toFixed(2)} · ${gpa.credits} cr` : `${load.hours} / ${load.budget} h this week`}</span></div><div class="card-body pt-0 rows">${courses.map((c) => { const st = R().standing(c); const cs = R().courseState(c); return `<a class="row" href="#/course/${c.id}"><span class="icon-sq is-sm" style="--ch:${L.cc(c)}">${esc(c.subjectCode.slice(0, 2))}</span><div class="t"><b>${esc(c.title)}</b><span>${cs === 'upcoming' ? `starts ${L.fmt.date(c.term.start)}` : `week ${R().currentWeek(c)} of ${c.term.weeks}`}${st.current == null ? '' : ` · ${L.fmt.pct(st.current)}`}</span></div><div class="letter">${st.letter || '·'}</div></a>`; }).join('')}</div></div>` : ''}
        </div>
      </div>`;
    },
  };
  L.actions['load-sample'] = () => { L.go('/enrol?sample=1'); };

  // one day's study block: heading + numbered bite-sized chunks
  const KIND_LABEL = { read: 'Read', practise: 'Practise', review: 'Review' };
  L.chunkRow = (c, s, k, { number, hint = false } = {}) => {
    const todayIso = L.date.iso(L.today());
    const state = k.done ? (L.date.iso(k.done) <= s.date ? 'done' : 'late') : s.date < todayIso ? 'overdue' : s.date > todayIso ? 'future' : 'due';
    const where = k.kind === 'read' ? (k.pages ? (k.pages[0] === k.pages[1] ? `p. ${k.pages[0]}` : `pp. ${k.pages[0]}–${k.pages[1]}`) : '') : '';
    const href = k.kind === 'read' ? `#/course/${c.id}/day/${s.date}?chunk=${k.id}` : `#/course/${c.id}/day/${s.date}`;
    const meta = [`<span class="kind">${KIND_LABEL[k.kind] || k.kind}</span>`, where, `${k.minutes} min`, state === 'late' ? 'done late' : state === 'overdue' ? `due ${L.fmt.date(s.date)}` : ''].filter(Boolean).join(' · ');
    return `<div class="chunk" data-state="${state}" data-kind="${k.kind}">
      <div class="chunk-body"><a class="chunk-title" href="${href}">${esc(k.title)}</a>${hint && k.hint ? `<div class="chunk-hint">${esc(k.hint)}</div>` : ''}<div class="chunk-meta">${meta}</div></div>
      <label class="chunk-check"><input type="checkbox" data-in="chunk-done" data-course="${c.id}" data-session="${s.id}" data-chunk="${k.id}"${k.done ? ' checked disabled' : state === 'future' ? ' disabled' : ''}><span class="sr-only">Done</span></label></div>`;
  };
  L.studyBlock = (c, s, { today = false, hints = false } = {}) => {
    const done = s.chunks.filter((k) => k.done).length;
    return `<div class="study-block" style="--ch:${L.cc(c)}"><div class="study-head"><a class="icon-sq" href="#/course/${c.id}" aria-label="${esc(c.code)}">${esc(c.subjectCode.slice(0, 2))}</a><div class="t"><b>${esc(c.title)}</b><span>${done}/${s.chunks.length} · ${L.fmt.dur(s.minutes)} · ${esc(s.topic)}</span></div>${today ? `<a class="btn btn-sm btn-quiet" href="#/course/${c.id}/day/${s.date}">Open</a>` : ''}</div>
      <div class="chunks">${s.chunks.map((k, i) => L.chunkRow(c, s, k, { number: i + 1, hint: hints })).join('')}</div></div>`;
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
