(function (L) {
  'use strict';

  const R = () => L.registrar;
  const esc = L.esc;
  const KT = (k) => L.registrar.KIND_TITLE[k] || k;
  const courseChip = (st) => `<span class="chip" data-state="${st}">${({ upcoming: 'Starts soon', running: 'In term', completed: 'Completed', withdrawn: 'Withdrawn' })[st]}</span>`;
  const notFound = (what) => `<div class="page"><div class="empty"><h2>${what} not found.</h2><p>It may have been erased from this device. <a href="#/courses">Back to courses</a>.</p></div></div>`;
  const weightShare = (c, a) => { const n = c.assessments.filter((x) => x.kind === a.kind).length; return (c.policy.weights[a.kind] || 0) / n; };

  // ---------- courses ----------
  L.views.courses = {
    title: 'Courses',
    render() {
      const all = R().courses('all');
      if (!all.length) return `<div class="page"><div class="page-head"><div><span class="eyebrow">Courses</span><h1 class="display">No courses on record.</h1></div><div class="actions"><a class="btn btn-primary" href="#/enrol">Enrol in a course</a></div></div><div class="empty"><h2>Bring the registrar some material.</h2><p>A course appears here once you enrol. Its calendar, weights and examinations are fixed from that moment.</p><div class="cols mt-3"><a class="btn btn-primary" href="#/enrol">Enrol</a><button class="btn" data-act="load-sample">Load the sample course</button></div></div></div>`;
      const rows = all.map((c) => {
        const st = R().courseState(c); const s = R().standing(c); const wk = R().currentWeek(c);
        const canWithdraw = c.state === 'enrolled' && st !== 'completed' && L.date.iso(L.today()) < c.policy.withdrawBefore;
        return `<div class="card"><div class="card-body" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start">
          <div><div class="course-lockup"><span class="code" style="--ch:${c.hue}">${esc(c.code)}</span><a href="#/course/${c.id}" style="color:inherit"><h2 class="serif" style="font-size:22px;font-weight:500">${esc(c.title)}</h2></a>${courseChip(st)}</div>
            <div class="course-meta"><span><b>${c.credits}</b> credit${c.credits === 1 ? '' : 's'}</span><span>${esc(c.level)}</span><span class="mono">${L.fmt.date(c.term.start)} – ${L.fmt.date(c.term.end)}</span><span>${c.term.weeks} weeks · ${c.plan.hoursPerWeek} h/week</span>${st === 'running' ? `<span>week <b>${wk}</b> of ${c.term.weeks}</span>` : ''}</div></div>
          <div class="right"><div class="letter">${c.final ? c.final.letter : (s.letter || '·')}</div><div class="small muted num">${c.final ? (c.final.pct == null ? 'withdrawn' : L.fmt.pct(c.final.pct)) : (s.current == null ? 'no grades yet' : L.fmt.pct(s.current) + ' so far')}</div>
            <div class="cols mt-2" style="justify-content:flex-end"><a class="btn btn-sm" href="#/course/${c.id}">Open</a>${canWithdraw ? `<button class="btn btn-quiet btn-sm" data-act="withdraw" data-course="${c.id}">Withdraw</button>` : ''}</div></div>
        </div></div>`;
      });
      return `<div class="page"><div class="page-head"><div><span class="eyebrow">Courses · ${all.length} on record</span><h1 class="display">Courses</h1></div><div class="actions"><a class="btn btn-primary" href="#/enrol">Enrol in a course</a></div></div><div class="stack gap-2">${rows.join('')}</div></div>`;
    },
  };
  L.actions.withdraw = async (el) => {
    const c = R().course(el.dataset.course); if (!c) return;
    const ok = await L.ui.confirm({ title: `Withdraw from ${c.code}?`, body: `<p><b>${esc(c.title)}</b> will be closed today and recorded as <b>W</b> on your transcript. Its timetable slot is released. This cannot be undone.</p><p class="small muted">Withdrawal deadline: ${L.fmt.date(L.date.addDays(L.date.parse(c.policy.withdrawBefore), -1))}.</p>`, ok: 'Withdraw', danger: true });
    if (!ok) return;
    await R().withdraw(c.id);
    L.ui.toast(`Withdrawn from ${c.code}. Recorded as W.`, 'warn');
    L.go('/courses');
  };

  // ---------- course page ----------
  function header(c) {
    const st = R().courseState(c); const wk = R().currentWeek(c);
    const slot = c.plan.slot; const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const h = Math.floor(slot.start / 60), m = slot.start % 60;
    const canWithdraw = c.state === 'enrolled' && st !== 'completed' && L.date.iso(L.today()) < c.policy.withdrawBefore;
    return `<div class="page-head"><div><span class="eyebrow">${esc(c.subject)} · ${esc(c.level)} · ${c.credits} credit${c.credits === 1 ? '' : 's'}</span>
      <div class="course-lockup"><span class="code" style="--ch:${c.hue}">${esc(c.code)}</span>${courseChip(st)}</div><h1 class="display mt-1">${esc(c.title)}</h1>
      <div class="course-meta"><span class="mono">${L.fmt.date(c.term.start)} – ${L.fmt.date(c.term.end)}</span><span><b>${c.term.weeks}</b> weeks${st === 'running' ? ` · week <b>${wk}</b>` : ''}</span><span><b>${c.plan.hoursPerWeek}</b> h/week</span><span>${slot.days.map((d) => dayNames[d]).join('/')} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${slot.minutes} min</span><span class="small muted">Faculty: ${c.analysis.source === 'llm' ? esc(c.analysis.model || 'model') : 'offline registrar'}</span></div></div>
      <div class="actions">${canWithdraw ? `<button class="btn btn-quiet" data-act="withdraw" data-course="${c.id}">Withdraw</button>` : ''}${wk >= 1 && wk <= c.term.weeks ? `<a class="btn btn-primary" href="#/course/${c.id}/week/${wk}">This week's reading</a>` : ''}</div></div>`;
  }
  const tabs = (c, tab) => `<nav class="tabs">${['syllabus', 'assessments', 'grades', 'materials'].map((t) => `<a href="#/course/${c.id}?tab=${t}"${t === tab ? ' aria-current="page"' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</a>`).join('')}</nav>`;

  function syllabus(c) {
    const wk = R().currentWeek(c);
    return `<div class="syllabus">${c.weeks.map((w) => {
      const sess = c.sessions.filter((s) => s.week === w.n);
      const opens = c.assessments.filter((a) => a.opensAt.slice(0, 10) >= w.start && a.opensAt.slice(0, 10) <= L.date.iso(L.date.addDays(L.date.parse(w.start), 6)));
      const dueA = c.assessments.filter((a) => a.dueAt.slice(0, 10) >= w.start && a.dueAt.slice(0, 10) <= L.date.iso(L.date.addDays(L.date.parse(w.start), 6)));
      const cls = w.n === wk ? ' is-current' : w.n < wk ? ' is-past' : '';
      return `<div class="week-row${cls}">
        <div class="wk">Week<b>${w.n}</b></div>
        <div class="dates">${L.fmt.date(w.start)}<br>– ${L.fmt.date(L.date.addDays(L.date.parse(w.start), 6))}</div>
        <div><div class="topic"><a href="#/course/${c.id}/week/${w.n}" style="color:inherit">${esc(w.title)}</a></div><div class="parts">${w.parts.map((p) => esc(p.label)).join(' · ')}</div>
          <details><summary>${w.objectives.length} objective${w.objectives.length === 1 ? '' : 's'}</summary><ul class="objectives">${w.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></details></div>
        <div class="sessions">${sess.map((s) => `<div>${L.fmt.date(s.date)} ${String(Math.floor(s.start / 60)).padStart(2, '0')}:${String(s.start % 60).padStart(2, '0')} · ${esc(s.kind)} ${s.attended ? '<span class="att">✓</span>' : ''}</div>`).join('')}</div>
        <div class="due">${opens.map((a) => `<div><span class="muted">opens</span> <a href="#/assess/${c.id}/${a.id}">${esc(a.title)}</a> <span class="mono muted">${L.fmt.date(a.opensAt)}</span></div>`).join('')}${dueA.map((a) => `<div><span class="muted">due</span> <a href="#/assess/${c.id}/${a.id}">${esc(a.title)}</a> <span class="mono muted">${L.fmt.date(a.dueAt)} ${L.fmt.time(a.dueAt)}</span> ${L.stateChip(R().assessmentState(c, a))}</div>`).join('')}</div>
      </div>`;
    }).join('')}</div>`;
  }
  function assessments(c) {
    const rows = c.assessments.map((a) => {
      const st = R().assessmentState(c, a);
      return `<tr><td><a href="#/assess/${c.id}/${a.id}" style="color:inherit;font-weight:500">${esc(a.title)}</a><div class="small muted">${esc(KT(a.kind))} · covers week${a.coversWeeks.length > 1 ? 's' : ''} ${a.coversWeeks.length > 3 ? `${a.coversWeeks[0]}–${a.coversWeeks[a.coversWeeks.length - 1]}` : a.coversWeeks.join(', ')}</div></td><td class="mono small nowrap">${L.fmt.dt(a.opensAt)}</td><td class="mono small nowrap">${L.fmt.dt(a.dueAt)}${a.lateAllowed ? `<div class="muted">late until ${L.fmt.date(a.closesAt)}</div>` : ''}</td><td class="num small">${a.durationMin ? L.fmt.dur(a.durationMin) : 'untimed'}</td><td class="num">${weightShare(c, a).toFixed(1)}%</td><td>${L.stateChip(st)}</td><td class="num">${a.grade ? `${L.fmt.pct(a.grade.pct)}${a.grade.late.penaltyPct ? `<div class="small muted">−${a.grade.late.penaltyPct}% late</div>` : ''}` : '—'}</td><td class="action">${L.actionFor(c, a)}</td></tr>`;
    });
    return `<div class="table-wrap"><table class="table assess-table"><thead><tr><th>Assessment</th><th>Opens</th><th>Due</th><th class="num">Length</th><th class="num">Weight</th><th>State</th><th class="num">Score</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function grades(c) {
    const s = R().standing(c);
    const scale = R().SCALE.filter(([min]) => Number.isFinite(min));
    return `<div class="grid-2">
      <div class="stack gap-2">
        <div class="cols gap-2"><div class="tile" style="flex:1"><div class="tile-n">${c.final ? c.final.letter : (s.letter || '—')}</div><div class="tile-l">${c.final ? 'Final grade' : 'Current standing'}</div></div><div class="tile" style="flex:1"><div class="tile-n">${c.final ? (c.final.pct == null ? '—' : L.fmt.pct(c.final.pct)) : L.fmt.pct(s.current)}</div><div class="tile-l">${c.final ? 'Final mark' : 'Weighted, graded work only'}</div></div><div class="tile" style="flex:1"><div class="tile-n">${c.final ? '·' : L.fmt.pct(s.projected)}</div><div class="tile-l">Projected at this pace</div></div></div>
        <div class="card"><div class="card-head"><h3>Breakdown</h3></div><div class="card-body"><table class="table"><thead><tr><th>Category</th><th class="num">Weight</th><th class="num">Graded</th><th class="num">Average</th><th class="num">Contributes</th></tr></thead><tbody>
          ${Object.entries(c.policy.weights).map(([k, w]) => { const cat = s.categories.find((x) => x.kind === k); const items = c.assessments.filter((a) => a.kind === k).length; return `<tr><td>${k === 'participation' ? 'Participation (attendance)' : esc(KT(k) + (items > 1 ? 's' : ''))}</td><td class="num">${w}%</td><td class="num">${k === 'participation' ? `${s.participation.attended}/${s.participation.held}` : `${cat ? cat.done : 0}/${items}`}</td><td class="num">${cat && cat.avg != null ? L.fmt.pct(cat.avg) : '—'}</td><td class="num">${cat && cat.contrib != null ? cat.contrib.toFixed(1) + ' pts' : '—'}</td></tr>`; }).join('')}
        </tbody></table></div></div>
      </div>
      <div class="stack gap-2">
        <div class="registrar-note"><span class="label">Registrar's note</span>Weights, dates and examinations were fixed at enrolment on ${L.fmt.date(c.createdAt)} and cannot be changed. Late work loses ${c.policy.late.perDayPct}% per day for up to ${c.policy.late.maxDays} days where a late window exists; examinations have none. Withdrawal was possible until ${L.fmt.date(L.date.addDays(L.date.parse(c.policy.withdrawBefore), -1))}.</div>
        <div class="card"><div class="card-head"><h3>Letter scale</h3><span class="small muted">standard 4.0</span></div><div class="card-body"><div class="weights">${scale.map(([min, l, p]) => `<div class="small"><span class="letter" style="font-size:16px">${l}</span> <span class="muted">≥ ${min}%</span> <span class="mono muted">${p.toFixed(1)}</span></div>`).join('')}</div></div></div>
      </div></div>`;
  }
  function materials(c) {
    return `<div class="grid-2"><div class="card"><div class="card-head"><h3>Sources</h3><span class="small muted num">${L.fmt.num(c.material.words)} words</span></div><div class="card-body"><table class="table"><tbody>${c.material.sources.map((s) => `<tr><td><span class="pill">${esc(s.kind)}</span></td><td>${esc(s.name)}${s.url ? `<div class="small muted truncate">${esc(s.url)}</div>` : ''}</td><td class="num small">${L.fmt.num(s.words)} w${s.pages ? ` · ${s.pages} pp` : ''}</td></tr>`).join('')}</tbody></table>
      <p class="small muted mt-2">Analysed by ${c.analysis.source === 'llm' ? `faculty (${esc(c.analysis.model || 'model')})` : 'the offline registrar'}.${c.analysis.note ? ' ' + esc(c.analysis.note) : ''}</p></div></div>
      <div class="card"><div class="card-head"><h3>Units</h3><span class="small muted">${c.analysis.units.length}</span></div><div class="card-body stack gap-2">${c.analysis.units.map((u, i) => `<div><div style="font-weight:500">${i + 1}. ${esc(u.title)}</div><div class="small muted">${u.topics.map(esc).join(' · ')}</div></div>`).join('')}</div></div></div>
      <div class="section"><div class="section-head"><h2>About this course</h2></div><p style="max-width:70ch">${esc(c.description)}</p>${c.prerequisites.length ? `<p class="small muted">Assumed: ${c.prerequisites.map(esc).join('; ')}.</p>` : ''}</div>`;
  }
  L.views.course = {
    title: (p) => R().course(p.id)?.code || 'Course',
    render(p, q) {
      const c = R().course(p.id); if (!c) return notFound('Course');
      const tab = ['syllabus', 'assessments', 'grades', 'materials'].includes(q.tab) ? q.tab : 'syllabus';
      const body = tab === 'syllabus' ? syllabus(c) : tab === 'assessments' ? assessments(c) : tab === 'grades' ? grades(c) : materials(c);
      return `<div class="page">${header(c)}${tabs(c, tab)}${body}</div>`;
    },
  };

  // ---------- reading ----------
  L.views.reading = {
    title: (p) => R().course(p.id)?.code || 'Reading',
    render(p) {
      const c = R().course(p.id); if (!c) return notFound('Course');
      const w = R().week(c, p.n); if (!w) return notFound('Week');
      const sess = c.sessions.filter((s) => s.week === w.n);
      const notes = c.notes && c.notes[w.n];
      return `<div class="page"><div class="page-head"><div><span class="eyebrow"><a href="#/course/${c.id}">${esc(c.code)}</a> · Week ${w.n} of ${c.term.weeks} · ${L.fmt.date(w.start)} – ${L.fmt.date(L.date.addDays(L.date.parse(w.start), 6))}</span><h1 class="display">${esc(w.title)}</h1></div>
        <div class="actions">${w.n > 1 ? `<a class="btn btn-quiet" href="#/course/${c.id}/week/${w.n - 1}">← Week ${w.n - 1}</a>` : ''}${w.n < c.term.weeks ? `<a class="btn btn-quiet" href="#/course/${c.id}/week/${w.n + 1}">Week ${w.n + 1} →</a>` : ''}</div></div>
        <div class="reading-layout"><div>
          <div class="reading" id="reading-body"><p class="muted" style="font-family:var(--font-body);font-size:14px">Loading the material…</p></div>
          ${notes ? `<div class="section"><div class="section-head"><h2>Lecture notes</h2><span class="small muted">${notes.source === 'llm' ? esc(notes.model || '') : 'offline'}</span></div><div class="notes" id="notes-body"></div></div>` : ''}
        </div>
        <aside class="reading-side">
          <div class="card"><div class="card-head"><h3>Objectives</h3></div><div class="card-body"><ol style="margin:0;padding-left:18px" class="small">${w.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ol></div></div>
          <div class="card"><div class="card-head"><h3>Sessions</h3></div><div class="card-body small stack gap-1">${sess.map((s) => `<div class="cols" style="justify-content:space-between"><span>${L.fmt.date(s.date)} · ${esc(s.kind)}</span>${s.attended ? '<span class="chip" data-state="good">Attended</span>' : s.date === L.date.iso(L.today()) ? `<button class="btn btn-sm btn-primary" data-act="attend" data-course="${c.id}" data-session="${s.id}">Attend</button>` : '<span class="muted mono">' + (s.date < L.date.iso(L.today()) ? 'missed' : 'upcoming') + '</span>'}</div>`).join('')}</div></div>
          <div class="card"><div class="card-body"><button class="btn w-full" data-act="notes" data-course="${c.id}" data-week="${w.n}">${notes ? 'Regenerate lecture notes' : 'Lecture notes'}</button><p class="small muted mt-1">${L.faculty.available() ? 'Written by faculty from this week’s material.' : 'Compiled offline. Add a faculty key in Settings for written notes.'}</p></div></div>
        </aside></div></div>`;
    },
    async mount(root, p) {
      const c = R().course(p.id); const w = c && R().week(c, p.n); if (!w) return;
      const text = (await L.db.getMaterial(c.id)) || '';
      const body = root.querySelector('#reading-body'); if (!body) return;
      const segs = c.material.segments.filter((s) => w.segments.includes(s.i));
      body.innerHTML = segs.map((s) => {
        const raw = text.slice(s.start, s.end).replace(/^\s*#{1,6}\s*[^\n]*\n/, '');
        const paras = raw.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/^#{1,6}\s*/, ''));
        return `<div class="reading-src">${esc(c.code)} · segment ${s.i + 1} · ${L.fmt.num(s.words)} words</div><h2>${esc(s.title)}</h2>${paras.map((x) => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('')}`;
      }).join('') || '<p class="muted">The material for this week is not on this device.</p>';
      const notes = c.notes && c.notes[w.n];
      const nb = root.querySelector('#notes-body');
      if (notes && nb) nb.innerHTML = window.marked && window.DOMPurify ? window.DOMPurify.sanitize(window.marked.parse(notes.markdown)) : `<pre style="white-space:pre-wrap">${esc(notes.markdown)}</pre>`;
    },
  };
  L.actions.notes = async (el) => {
    const c = R().course(el.dataset.course); const w = R().week(c, Number(el.dataset.week));
    el.disabled = true; el.textContent = 'Writing notes…';
    const busy = L.ui.busy(`Week ${w.n}: gathering the material…`);
    try {
      const text = await R().materialFor(c, [w.n]);
      const r = await L.faculty.notes({ course: c, week: w, text, onModel: (m) => busy.update(`Faculty: ${m}`) });
      c.notes = c.notes || {}; c.notes[w.n] = { markdown: r.markdown, source: r.source, model: r.model, at: new Date(L.now()).toISOString() };
      L.save();
      if (r.note) L.ui.toast(r.note, 'warn', 5000);
    } finally { busy.done(); L.render(); }
  };

  // ---------- assessment ----------
  const stateLine = { upcoming: 'Locked until it opens', open: 'Open', late: 'Late window', in_progress: 'In progress', graded: 'Graded', missed: 'Missed' };
  function before(c, a, st) {
    const now = L.now();
    const opensIn = L.date.parse(a.opensAt) - now;
    const canBegin = st === 'open' || st === 'late';
    const btn = st === 'upcoming' ? `Opens <span data-countdown="${L.date.parse(a.opensAt).getTime()}">${L.fmt.rel(opensIn)}</span>` : st === 'late' ? `Submit late (−${Math.min(c.policy.late.maxDays, Math.ceil((now - L.date.parse(a.dueAt)) / 86400000)) * c.policy.late.perDayPct}%)` : 'Begin';
    const brief = a.kind === 'project' && a.paper?.brief;
    return `<div class="exam">
      <div class="card"><div class="card-body"><dl class="kv"><dt>Kind</dt><dd>${esc(KT(a.kind))}</dd><dt>Covers</dt><dd>${a.coversWeeks.map((n) => `week ${n}`).join(', ')}</dd><dt>Opens</dt><dd class="mono">${L.fmt.dt(a.opensAt)}</dd><dt>Due</dt><dd class="mono">${L.fmt.dt(a.dueAt)}${a.lateAllowed ? ` <span class="muted">· late window until ${L.fmt.dt(a.closesAt)}, −${c.policy.late.perDayPct}%/day</span>` : ' <span class="muted">· no late submissions</span>'}</dd><dt>Length</dt><dd>${a.durationMin ? `${L.fmt.dur(a.durationMin)} from the moment you begin, or until the window closes, whichever is first` : 'Untimed, one submission'}</dd><dt>Weight</dt><dd>${weightShare(c, a).toFixed(1)}% of the course grade</dd><dt>Paper</dt><dd>${a.paper ? `Sealed ${L.fmt.dt(a.paper.generatedAt)} · <span class="hash">${a.paper.seal.slice(0, 12)}</span>` : 'Set at the moment you begin, from the covered material'}</dd></dl></div></div>
      ${brief ? `<div class="section"><div class="section-head"><h2>Brief</h2></div><div class="notes">${window.marked && window.DOMPurify ? window.DOMPurify.sanitize(window.marked.parse(brief)) : `<pre style="white-space:pre-wrap">${esc(brief)}</pre>`}</div></div>` : ''}
      <div class="pledge mt-3"><label class="check"><input type="checkbox" id="pledge" data-in="pledge"${canBegin ? '' : ' disabled'}><span><b>Honour pledge.</b> I will complete this ${a.kind === 'quiz' || a.kind === 'midterm' || a.kind === 'final' ? 'paper' : 'work'} on my own, without notes where the paper is timed, and I understand that I have one attempt and that the timer does not stop if I leave this page.</span></label></div>
      <div class="cols mt-3"><button class="btn btn-primary" id="begin-btn" data-act="begin" data-course="${c.id}" data-assess="${a.id}" disabled>${btn}</button><span class="small muted">${st === 'upcoming' ? `Opens ${L.fmt.dt(a.opensAt)}.` : st === 'late' ? `Closes ${L.fmt.dt(a.closesAt)}.` : `Due ${L.fmt.dt(a.dueAt)}.`}</span></div>
    </div>`;
  }
  function examRoom(c, a) {
    const dl = R().deadline(c, a);
    const qs = a.paper.questions;
    const brief = a.kind === 'project' && a.paper.brief;
    return `<div class="exam">
      <div class="exam-bar"><div><div class="title">${esc(c.code)} · ${esc(a.title)}</div><div class="sub">${qs.length} question${qs.length === 1 ? '' : 's'} · ${L.sum(qs.map((q) => q.points))} points · answers save as you type</div></div><div class="count" id="exam-count">0 / ${qs.length} answered</div><div class="timer num" id="exam-timer" data-deadline="${dl}">${a.durationMin ? '--:--' : 'untimed'}</div></div>
      ${a.paper.note && a.paper.source !== 'llm' ? `<p class="small muted mb-3">${esc(a.paper.note)}</p>` : ''}
      ${brief ? `<div class="notes mb-3">${window.marked && window.DOMPurify ? window.DOMPurify.sanitize(window.marked.parse(brief)) : `<pre style="white-space:pre-wrap">${esc(brief)}</pre>`}</div>` : ''}
      ${qs.map((q, i) => `<div class="question" id="${q.id}"><div class="qh"><span class="qn">Question ${i + 1} · ${q.type === 'mcq' ? 'multiple choice' : q.type === 'short' ? 'short answer' : q.type} · ${q.points} pt${q.points === 1 ? '' : 's'}</span></div>
        ${brief && q.type === 'essay' ? '<div class="prompt">Your submission (report, examples and reflection as set out in the brief).</div>' : `<div class="prompt${q.type === 'essay' ? ' serif' : ''}">${esc(q.prompt)}</div>`}
        ${q.type === 'mcq' ? `<div class="options">${q.options.map((o, k) => `<label><input type="radio" name="${q.id}" data-in="answer" data-qid="${q.id}" data-course="${c.id}" data-assess="${a.id}" value="${k}"${String(a.attempt.answers[q.id]) === String(k) ? ' checked' : ''}><span class="k">${String.fromCharCode(65 + k)}</span><span>${esc(o)}</span></label>`).join('')}</div>`
          : `<div class="answer"><textarea class="textarea" data-in="answer" data-qid="${q.id}" data-course="${c.id}" data-assess="${a.id}" placeholder="${q.type === 'short' ? 'Two or three sentences.' : q.type === 'problem' ? 'Show your working.' : 'Structure your answer with headings if it helps.'}"${q.type !== 'short' ? ' style="min-height:220px"' : ''}>${esc(a.attempt.answers[q.id] || '')}</textarea></div>`}
      </div>`).join('')}
      <div class="cols mt-4"><button class="btn btn-primary" data-act="submit-paper" data-course="${c.id}" data-assess="${a.id}">Submit paper</button><span class="small muted">One submission. ${a.durationMin ? 'When the timer reaches zero the paper is submitted as it stands.' : `Due ${L.fmt.dt(a.dueAt)}.`}</span></div>
    </div>`;
  }
  function result(c, a) {
    const g = a.grade;
    if (g.missed) return `<div class="result"><div class="result-head"><div class="score">0</div><div><div style="font-weight:600">Missed — recorded as 0.</div><div class="small muted">The window closed ${L.fmt.dt(a.closesAt)} without a submission. This counts ${weightShare(c, a).toFixed(1)}% of the course grade.</div></div></div></div>`;
    const qs = a.paper.questions;
    return `<div class="result">
      <div class="result-head"><div class="score">${L.fmt.pct(g.pct)}</div><div><div style="font-weight:600;font-size:16px"><span class="letter" style="font-size:20px">${g.letter}</span> &nbsp; ${g.points} of ${g.max} points${g.late.penaltyPct ? ` · raw ${L.fmt.pct(g.rawPct)} less ${g.late.penaltyPct}% (${g.late.days} day${g.late.days === 1 ? '' : 's'} late)` : ''}</div><div class="small muted">Submitted ${L.fmt.dt(a.attempt.submittedAt)}${a.attempt.auto ? ' automatically when time expired' : ''} · graded by ${g.source === 'llm' ? esc(g.model || 'faculty') : g.source === 'local' ? 'the registrar' : 'the offline examiner'}${g.note ? ` · ${esc(g.note)}` : ''}</div></div></div>
      <div class="section"><div class="section-head"><h2>Paper</h2><span class="hash">seal ${a.paper.seal.slice(0, 16)}</span></div>
      ${qs.map((q, i) => { const r = g.results.find((x) => x.id === q.id) || { points: 0, feedback: '' }; const ans = a.attempt.answers[q.id];
        return `<div class="result-q"><div class="qh cols" style="justify-content:space-between"><span class="qn">Question ${i + 1}</span><span class="pts">${r.points} / ${q.points}</span></div><div class="prompt" style="white-space:pre-wrap">${esc(q.prompt)}</div>
          ${q.type === 'mcq' ? `<div class="options">${q.options.map((o, k) => `<label class="${k === q.answer ? 'is-correct' : String(ans) === String(k) ? 'is-wrong' : ''}"><span class="k">${String.fromCharCode(65 + k)}</span><span>${esc(o)}</span>${String(ans) === String(k) ? '<span class="small muted" style="margin-left:auto">your answer</span>' : ''}</label>`).join('')}</div>`
            : `<div class="model-answer"><b class="small">Your answer</b><div style="white-space:pre-wrap">${esc(ans || '(no answer)')}</div></div>${q.modelAnswer ? `<div class="model-answer"><b class="small">Model answer</b><div>${esc(q.modelAnswer)}</div></div>` : ''}`}
          <div class="fb">${esc(r.feedback)}</div></div>`; }).join('')}
      </div></div>`;
  }
  let timerHandler = null;
  L.views.assess = {
    title: (p) => { const c = R().course(p.id); const a = c && c.assessments.find((x) => x.id === p.aid); return a ? a.title : 'Assessment'; },
    render(p) {
      const c = R().course(p.id); if (!c) return notFound('Course');
      const a = c.assessments.find((x) => x.id === p.aid); if (!a) return notFound('Assessment');
      const st = R().assessmentState(c, a);
      const head = `<div class="page-head"><div><span class="eyebrow"><a href="#/course/${c.id}?tab=assessments">${esc(c.code)}</a> · ${esc(KT(a.kind))} · ${stateLine[st]}</span><h1 class="display">${esc(a.title)}</h1><p class="lede">${esc(c.title)} · week ${a.week}</p></div><div class="actions">${L.stateChip(st)}</div></div>`;
      const body = st === 'in_progress' ? examRoom(c, a) : a.grade ? result(c, a) : before(c, a, st);
      return `<div class="page">${st === 'in_progress' ? '' : head}${body}</div>`;
    },
    mount(root, p) {
      const c = R().course(p.id); const a = c && c.assessments.find((x) => x.id === p.aid); if (!a) return;
      if (R().assessmentState(c, a) !== 'in_progress') return;
      const count = () => { const n = a.paper.questions.filter((q) => String(a.attempt.answers[q.id] ?? '').trim() !== '').length; const el = root.querySelector('#exam-count'); if (el) el.textContent = `${n} / ${a.paper.questions.length} answered`; };
      count();
      const timer = root.querySelector('#exam-timer');
      const dl = R().deadline(c, a);
      let fired = false;
      timerHandler = () => {
        if (!document.body.contains(timer)) return;
        const left = dl - L.now();
        if (a.durationMin) {
          const s = Math.max(0, Math.floor(left / 1000));
          timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
          timer.dataset.level = s < 60 ? 'bad' : s < 300 ? 'warn' : '';
        } else timer.textContent = `due ${L.fmt.rel(left)}`;
        if (left <= 0 && !fired) { fired = true; R().submit(c.id, a.id, { auto: true }).then(() => { L.ui.toast('Time is up. The paper was submitted as it stood.', 'warn', 6000); L.render(); }).catch((e) => { console.error(e); L.render(); }); }
        count();
      };
      timerHandler();
      L.on('tick-views', timerHandler);
    },
    unmount() { timerHandler = null; },
  };
  // the tick bus has no off(); handlers check they are still current
  L.on('tick-views', () => {});
  L.inputs.pledge = (el) => { const b = document.getElementById('begin-btn'); if (b) b.disabled = !el.checked; };
  L.actions.begin = async (el) => {
    const c = R().course(el.dataset.course); const a = c.assessments.find((x) => x.id === el.dataset.assess);
    if (!document.getElementById('pledge')?.checked) { L.ui.toast('Tick the honour pledge to begin.', 'warn'); return; }
    el.disabled = true; el.textContent = 'Setting the paper…';
    const busy = L.ui.busy(`${a.title}: preparing…`);
    try { await R().begin(c.id, a.id, { onLog: (m) => busy.update(m) }); }
    finally { busy.done(); L.render(); }
  };
  L.inputs.answer = (el) => { R().answer(el.dataset.course, el.dataset.assess, el.dataset.qid, el.value); const c = R().course(el.dataset.course); const a = c.assessments.find((x) => x.id === el.dataset.assess); const n = a.paper.questions.filter((q) => String(a.attempt.answers[q.id] ?? '').trim() !== '').length; const cnt = document.getElementById('exam-count'); if (cnt) cnt.textContent = `${n} / ${a.paper.questions.length} answered`; };
  L.actions['submit-paper'] = async (el) => {
    const c = R().course(el.dataset.course); const a = c.assessments.find((x) => x.id === el.dataset.assess);
    const blank = a.paper.questions.filter((q) => String(a.attempt.answers[q.id] ?? '').trim() === '').length;
    const ok = await L.ui.confirm({ title: 'Submit this paper?', body: `<p>${blank ? `<b>${blank}</b> question${blank === 1 ? ' is' : 's are'} unanswered.` : 'Every question has an answer.'} Once submitted the paper cannot be reopened.</p>`, ok: 'Submit' });
    if (!ok) return;
    el.disabled = true; el.textContent = 'Grading…';
    const busy = L.ui.busy('Submitting and grading…');
    try { const g = await R().submit(c.id, a.id, {}); L.ui.toast(`${a.title}: ${L.fmt.pct(g.pct)} (${g.letter}).`, 'good', 5000); }
    finally { busy.done(); L.render(); }
  };
  L.weightShare = weightShare;
})(window.L);
