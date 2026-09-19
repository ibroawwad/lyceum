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
  L.ICON = 'data:image/jpeg;base64,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'; // the temple mark, an opaque square; .mark-img rounds its corners
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
