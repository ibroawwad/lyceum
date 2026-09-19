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
  L.ICON = 'data:image/png;base64,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'; // the temple mark with its own transparent rounded corners
  L.logo = (big = false) => `<span class="logo${big ? ' is-big' : ''}"><img class="mark-img" src="${L.ICON}" alt="" width="${big ? 72 : 30}" height="${big ? 72 : 30}"><span>Lyceum</span></span>`;
  // HabitKit semantics: a day is filled when its block was done (part-filled when some of it) and every other day is
  // the same empty tile — weekends, days before or after the term, missed days. The grid never explains itself.
  L.tileState = (c, iso) => {
    const s = c.sessions.find((x) => x.date === iso);
    if (!s || !s.chunks.length) return 'empty';
    const done = s.chunks.filter((k) => k.done).length;
    return done === s.chunks.length ? 'full' : done ? 'part' : 'empty';
  };
  // a complete grid of whole weeks, Monday to Sunday, ending with the current week; sizeTiles trims it to the
  // columns that fit, so every card shows exactly as many weeks as its width allows and no partial column
  const GRID_WEEKS = 53;
  L.tilesGrid = (c) => {
    const today = L.today(); const todayIso = L.date.iso(today);
    const start = L.date.addDays(L.date.addDays(today, -L.date.dow(today)), -(GRID_WEEKS - 1) * 7);
    const out = [];
    for (let i = 0; i < GRID_WEEKS * 7; i++) { const iso = L.date.iso(L.date.addDays(start, i)); const v = L.tileState(c, iso); out.push(`<i data-v="${v}"${iso === todayIso ? ' class="is-today"' : ''} title="${iso}"></i>`); }
    const done = c.sessions.filter((x) => x.date <= todayIso && x.chunks.length && x.chunks.every((k) => k.done)).length;
    return `<div class="tiles-wrap" role="img" aria-label="Study grid for ${esc(c.code)}: ${done} full days so far"><div class="tiles" style="--ch:${L.cc(c)}" aria-hidden="true">${out.join('')}</div></div>`;
  };
  L.tilesRow = (c, days = 14) => {
    const today = L.today();
    const out = [];
    for (let i = days - 1; i >= 0; i--) { const iso = L.date.iso(L.date.addDays(today, -i)); out.push(`<i data-v="${L.tileState(c, iso)}"${i === 0 ? ' class="is-today"' : ''}></i>`); }
    return `<div class="tiles-row" style="--ch:${L.cc(c)}" role="img" aria-label="Last ${days} days for ${esc(c.code)}">${out.join('')}</div>`;
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
      <nav class="rail-nav" aria-label="Main">
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
  // tiles are one fixed size everywhere (HabitKit); the grid is cut to whole columns that fit, newest week last
  L.sizeTiles = (root = document) => {
    root.querySelectorAll('.tiles-wrap').forEach((w) => {
      const t = w.querySelector('.tiles'); if (!t) return;
      const cs = getComputedStyle(t); const tile = parseFloat(cs.getPropertyValue('--tile')) || 13, gap = parseFloat(cs.getPropertyValue('--gap')) || 3;
      const width = w.clientWidth || (w.parentElement && w.parentElement.clientWidth) || 0; if (!width) return;
      const cols = Math.max(4, Math.floor((width + gap) / (tile + gap)));
      const cells = t.children, hide = Math.max(0, cells.length - cols * 7);
      for (let i = 0; i < cells.length; i++) cells[i].hidden = i < hide;
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
    (L.native ? L.native.restore().then(() => L.native.boot()) : Promise.resolve()).catch((e) => console.error(e))
      .then(() => L.faculty.probe()).then(() => R().sweep()).then(() => L.render()).catch((e) => { console.error(e); L.render(); });
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
            <div class="cols mt-3"><a class="btn btn-primary" href="#/enrol">Add a course</a><a class="btn" href="#/library">Library</a><button class="btn btn-quiet" data-act="load-sample">Try the sample</button></div>
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
      <label class="chunk-check"><input type="checkbox" data-in="chunk-done" data-course="${c.id}" data-session="${s.id}" data-chunk="${k.id}" aria-label="${k.done ? 'Done: ' : 'Mark done: '}${esc(k.title)}"${k.done ? ' checked disabled' : state === 'future' ? ' disabled' : ''}></label></div>`;
  };
  L.studyBlock = (c, s, { today = false, hints = false } = {}) => {
    const done = s.chunks.filter((k) => k.done).length;
    return `<div class="study-block" style="--ch:${L.cc(c)}"><div class="study-head"><a class="icon-sq" href="#/course/${c.id}" aria-label="${esc(c.code)}">${esc(c.subjectCode.slice(0, 2))}</a><div class="t"><b>${esc(c.title)}</b><span>${done}/${s.chunks.length} · ${L.fmt.dur(s.minutes)} · ${esc(s.topic)}</span></div>${today ? `<a class="btn btn-sm btn-quiet" href="#/course/${c.id}/day/${s.date}">Open</a>` : ''}</div>
      <div class="chunks">${s.chunks.map((k, i) => L.chunkRow(c, s, k, { number: i + 1, hint: hints })).join('')}</div></div>`;
  };
  // quick check: a bottom sheet with two questions; both right → the chunk is done
  async function openCheck(courseId, sessionId, chunkId) {
    const c = R().course(courseId); const s = c.sessions.find((x) => x.id === sessionId); const ch = s.chunks.find((x) => x.id === chunkId);
    const busy = L.ui.busy('Setting two questions from this chunk…');
    let chk; try { chk = await R().checkPaper(courseId, sessionId, chunkId); } finally { busy.done(); }
    const body = `<p class="small muted">Two questions from <b>${esc(ch.title)}</b>. Both right and the chunk counts.${chk.source === 'offline' ? ' (Set by the offline examiner.)' : ''}</p>
      <form id="check-form" class="stack gap-2">${chk.questions.map((q, i) => `<div class="question" style="margin:0"><div class="prompt">${i + 1}. ${esc(q.prompt)}</div><div class="options">${q.options.map((o, k) => `<label><input type="radio" name="${q.id}" value="${k}"><span class="k">${'ABCD'[k]}</span><span>${esc(o)}</span></label>`).join('')}</div></div>`).join('')}</form>`;
    L.ui.modal({ title: 'Quick check', body, actions: [{ label: 'Not yet — read again', act: 'modal-cancel' }, { label: 'Check', act: 'check-submit', primary: true }] });
    L.checkCtx = { courseId, sessionId, chunkId };
  }
  L.actions['check-submit'] = async () => {
    const ctx = L.checkCtx; if (!ctx) return;
    const form = document.getElementById('check-form'); const answers = {};
    new FormData(form).forEach((v, k) => { answers[k] = v; });
    const c = R().course(ctx.courseId); const s = c.sessions.find((x) => x.id === ctx.sessionId); const ch = s.chunks.find((x) => x.id === ctx.chunkId);
    if (Object.keys(answers).length < ch.check.questions.length) { L.ui.toast('Answer both questions.', 'warn'); return; }
    const r = await R().submitCheck(ctx.courseId, ctx.sessionId, ctx.chunkId, answers);
    L.ui.closeModal(); L.checkCtx = null;
    if (r.passed) { if (L.native) L.native.haptic('success'); L.ui.toast(r.result === 'late' ? 'Passed — recorded as late (half credit).' : 'Passed. Chunk done.', 'good'); }
    else { if (L.native) L.native.haptic('medium'); L.ui.toast(`${r.right} of ${ch.check.questions.length} right. Read it again, then try once more.`, 'warn', 4000); }
    L.render();
  };
  L.inputs['chunk-done'] = async (el) => {
    if (!el.checked) return;
    const r = await R().complete(el.dataset.course, el.dataset.session, el.dataset.chunk);
    if (r === 'needs_check') { el.checked = false; openCheck(el.dataset.course, el.dataset.session, el.dataset.chunk); return; }
    if (r === 'not_yet') { el.checked = false; L.ui.toast('That chunk is scheduled for a later day.', 'warn'); return; }
    if (L.native) L.native.haptic(r === 'done' ? 'success' : 'light');
    if (r === 'late') L.ui.toast('Done — recorded as late (half credit).', 'warn');
    else if (r === 'done') L.ui.toast('Done.', 'good', 1600);
    L.render();
  };
})(window.L);
