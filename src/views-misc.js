(function (L) {
  'use strict';

  const R = () => L.registrar;
  const esc = L.esc;
  const D = L.date;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  // ---------- calendar ----------
  L.views.calendar = {
    title: 'Calendar',
    render(p, q) {
      const today = L.today();
      const m = /^\d{4}-\d{2}$/.test(q.m || '') ? D.parse(q.m + '-01') : new Date(today.getFullYear(), today.getMonth(), 1);
      const first = new Date(m.getFullYear(), m.getMonth(), 1);
      const gridStart = D.addDays(first, -D.dow(first));
      const prev = new Date(m.getFullYear(), m.getMonth() - 1, 1), next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = D.addDays(gridStart, i);
        const iso = D.iso(d);
        const other = d.getMonth() !== m.getMonth();
        const sess = R().sessionsOn(d);
        const due = R().deadlines({ from: D.setTime(d, 0, 0), to: D.setTime(d, 23, 59, 59) });
        const ev = [
          ...sess.map(({ course: c, session: s }) => `<a class="cal-ev" style="--ch:${L.cc(c)}" href="#/course/${c.id}/day/${s.date}" title="${esc(c.title)} · ${s.chunks.length} chunks">${hm(s.start)} ${esc(c.code)}${s.chunks.length && s.chunks.every((k) => k.done) ? ' ✓' : ''}</a>`),
          ...due.map(({ course: c, assessment: a }) => `<a class="cal-ev is-due${a.kind === 'midterm' || a.kind === 'final' ? ' is-exam' : ''}" style="--ch:${L.cc(c)}" href="#/assess/${c.id}/${a.id}" title="${esc(a.title)} due ${L.fmt.time(a.dueAt)}">${esc(a.title)} · ${esc(c.code)}</a>`),
        ];
        cells.push(`<div class="cal-day${other ? ' is-other' : ''}${iso === D.iso(today) ? ' is-today' : ''}"><div class="d">${d.getDate()}${d.getDate() === 1 ? ' ' + D.monthName(d).slice(0, 3) : ''}</div>${ev.join('')}</div>`);
        if (i === 34 && D.addDays(gridStart, 35).getMonth() !== m.getMonth()) break;
      }
      // weekly timetable for the week being looked at (the current one unless the student paged)
      const wk0 = /^\d{4}-\d{2}-\d{2}$/.test(q.w || '') ? D.parse(q.w) : D.addDays(today, -D.dow(today));
      const weekStart = wk0;
      const H0 = 8, H1 = 21, PX = 40; // 40px per hour → 520px
      const cols = DAYS.map((name, di) => {
        const d = D.addDays(weekStart, di);
        const blocks = R().sessionsOn(d).map(({ course: c, session: s }) => `<a class="tt-block" style="--ch:${L.cc(c)};top:${((s.start / 60) - H0) * PX}px;height:${(s.minutes / 60) * PX - 2}px" href="#/course/${c.id}/day/${s.date}" title="${esc(c.title)}"><b>${esc(c.code)}</b>${hm(s.start)} · ${s.chunks.length} chunks</a>`);
        const exams = R().deadlines({ from: D.setTime(d, 0, 0), to: D.setTime(d, 23, 59, 59) }).filter(({ assessment: a }) => a.durationMin && (a.kind === 'midterm' || a.kind === 'final')).map(({ course: c, assessment: a }) => `<a class="tt-block" style="--ch:${L.cc(c)};top:${(new Date(a.opensAt).getHours() - H0) * PX}px;height:${(new Date(a.dueAt) - new Date(a.opensAt)) / 3600000 * PX - 2}px;background:var(--surface-2);border-left-color:var(--ink)" href="#/assess/${c.id}/${a.id}"><b>${esc(c.code)}</b>${esc(a.title)} window</a>`);
        return `<div class="tt-col">${blocks.join('')}${exams.join('')}</div>`;
      });
      const hours = []; for (let h = H0 + 1; h < H1; h++) hours.push(`<span style="top:${(h - H0) * PX}px">${String(h).padStart(2, '0')}:00</span>`);
      const active = R().courses('active');
      const view = q.v === 'week' ? 'week' : q.v === 'month' ? 'month' : 'agenda';
      const wkPrev = D.iso(D.addDays(wk0, -7)), wkNext = D.iso(D.addDays(wk0, 7));
      const weekDays = Array.from({ length: 7 }, (_, i) => D.addDays(wk0, i));
      const dayList = (d) => { const sess = R().sessionsOn(d); const due = R().deadlines({ from: D.setTime(d, 0, 0), to: D.setTime(d, 23, 59, 59) }); return sess.map(({ course: c, session: s }) => `<a class="cal-ev" style="--ch:${L.cc(c)}" href="#/course/${c.id}/day/${s.date}">${hm(s.start)} ${esc(c.code)} · ${s.chunks.length} chunks · ${L.fmt.dur(s.minutes)}${s.chunks.length && s.chunks.every((k) => k.done) ? ' ✓' : ''}</a>`).join('') + due.map(({ course: c, assessment: a }) => `<a class="cal-ev is-due${a.kind === 'midterm' || a.kind === 'final' ? ' is-exam' : ''}" style="--ch:${L.cc(c)}" href="#/assess/${c.id}/${a.id}">${esc(a.title)} · ${esc(c.code)} · ${L.fmt.time(a.dueAt)}</a>`).join(''); };
      const switcher = `<div class="switch cal-switch" role="group" aria-label="View">${[['agenda', 'Agenda'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => `<a href="#/calendar?v=${k}"${view === k ? ' class="is-on"' : ''}>${l}</a>`).join('')}</div>`;
      // paging: arrows either side of the period's name; a way back to now only when away from it
      const thisMonth = m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth();
      const thisWeek = D.iso(wk0) === D.iso(D.addDays(today, -D.dow(today)));
      const nav = view === 'month' ? `<div class="cal-nav"><a class="btn btn-quiet" href="#/calendar?v=month&m=${ym(prev)}" aria-label="Previous month">←</a><b class="cal-title">${D.monthName(m)} ${m.getFullYear()}</b><a class="btn btn-quiet" href="#/calendar?v=month&m=${ym(next)}" aria-label="Next month">→</a>${thisMonth ? '' : '<a class="btn btn-sm" href="#/calendar?v=month">Today</a>'}</div>`
        : view === 'week' ? `<div class="cal-nav"><a class="btn btn-quiet" href="#/calendar?v=week&w=${wkPrev}" aria-label="Previous week">←</a><b class="cal-title">${L.fmt.date(wk0)} – ${L.fmt.date(D.addDays(wk0, 6))}</b><a class="btn btn-quiet" href="#/calendar?v=week&w=${wkNext}" aria-label="Next week">→</a>${thisWeek ? '' : '<a class="btn btn-sm" href="#/calendar?v=week">This week</a>'}</div>` : '';
      const sub = view === 'month' ? `${active.length} active course${active.length === 1 ? '' : 's'}` : view === 'week' ? `Week ${thisWeek ? 'now' : 'of ' + L.fmt.date(wk0)}` : 'Next two weeks';
      return `<div class="page is-wide">
        <div class="page-head is-row"><div><h1 class="display">Calendar</h1><span class="small muted">${sub}</span></div>${switcher}</div>
        ${nav}
        ${view === 'month' ? `<div class="calendar is-shown">${DAYS.map((d) => `<div class="cal-h">${d}</div>`).join('')}${cells.join('')}</div>` : ''}
        ${view === 'week' ? `<div class="week-list">${weekDays.map((d) => { const iso = D.iso(d); const ev = dayList(d); return `<div class="agenda-day${iso === D.iso(today) ? ' is-today' : ''}"><div class="agenda-date"><b>${D.dayName(d).slice(0, 3)}</b> ${L.fmt.date(d).slice(4)}${iso === D.iso(today) ? ' · today' : ''}</div>${ev || '<span class="small muted">Nothing scheduled.</span>'}</div>`; }).join('')}</div>` : ''}
        <div class="agenda-14${view === 'agenda' ? ' is-shown' : ' is-hidden'}">${Array.from({ length: 14 }, (_, i) => D.addDays(today, i)).map((d, i) => { const sess = R().sessionsOn(d); const due = R().deadlines({ from: D.setTime(d, 0, 0), to: D.setTime(d, 23, 59, 59) }); if (!sess.length && !due.length) return ''; return `<div class="agenda-day"><div class="agenda-date"><b>${D.dayName(d).slice(0, 3)}</b> ${L.fmt.date(d).slice(4)}${i === 0 ? ' · today' : ''}</div>${sess.map(({ course: c, session: s }) => `<a class="cal-ev" style="--ch:${L.cc(c)}" href="#/course/${c.id}/day/${s.date}">${hm(s.start)} ${esc(c.code)} · ${s.chunks.length} chunks · ${L.fmt.dur(s.minutes)}</a>`).join('')}${due.map(({ course: c, assessment: a }) => `<a class="cal-ev is-due${a.kind === 'midterm' || a.kind === 'final' ? ' is-exam' : ''}" style="--ch:${L.cc(c)}" href="#/assess/${c.id}/${a.id}">${esc(a.title)} · ${esc(c.code)} · ${L.fmt.time(a.dueAt)}</a>`).join('')}</div>`; }).join('') || '<p class="muted small">Nothing in the next two weeks.</p>'}</div>
        <div class="cols mt-2 small muted">${active.map((c) => `<span class="cols gap-1"><span class="dot" style="--ch:${L.cc(c)}"></span>${esc(c.code)} ${esc(c.title)}</span>`).join('') || 'No active courses.'}</div>
        <div class="section${view === 'week' ? '' : ' is-hidden'}"><div class="section-head"><h2>Timetable · week of ${L.fmt.date(weekStart)}</h2><span class="small muted">Concurrent courses never share a block</span></div>
          <div class="timetable"><div class="tt-h"></div>${DAYS.map((n, i) => `<div class="tt-h${D.iso(D.addDays(weekStart, i)) === D.iso(today) ? ' is-today' : ''}">${n} ${D.addDays(weekStart, i).getDate()}</div>`).join('')}<div class="tt-hours">${hours.join('')}</div>${cols.join('')}</div></div>
      </div>`;
    },
  };

  // ---------- stats ----------
  L.views.stats = {
    title: 'Stats',
    render() {
      const st = R().stats();
      const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
      const max = Math.max(60, ...st.weekMinutes.map((w) => w.minutes));
      const W = 560, H = 160, pad = 28, bw = (W - pad * 2) / 8;
      const bars = st.weekMinutes.map((w, i) => { const h = Math.round((w.minutes / max) * (H - 40)); return `<g transform="translate(${pad + i * bw} 0)"><rect x="${bw * 0.18}" y="${H - 24 - h}" width="${bw * 0.64}" height="${h}" rx="4" fill="${i === 7 ? 'var(--accent)' : 'var(--card-3)'}"/><text x="${bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${L.fmt.date(w.from).slice(4)}</text>${w.minutes ? `<text x="${bw / 2}" y="${H - 30 - h}" text-anchor="middle" font-size="10" fill="var(--text-2)">${w.minutes >= 60 ? (w.minutes / 60).toFixed(1) + 'h' : w.minutes + 'm'}</text>` : ''}</g>`; }).join('');
      const courses = st.perCourse.filter((x) => x.due > 0 || R().courseState(x.course) === 'running');
      return `<div class="page"><div class="page-head is-row"><div><h1 class="display">Stats</h1></div><div class="actions"><a class="btn btn-sm btn-quiet" href="#/record">Grades →</a></div></div>
        ${!courses.length ? `<div class="empty"><h2>No study days yet.</h2><p>Streaks and rates appear once a course is running.</p></div>` : `
        <div class="grid-2" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="tile"><div class="tile-n">${st.streak}<span class="small muted" style="font-size:14px;font-weight:500"> day${st.streak === 1 ? '' : 's'}</span></div><div class="tile-l">Current streak</div></div><div class="tile"><div class="tile-n">${st.longest}</div><div class="tile-l">Longest streak</div></div><div class="tile"><div class="tile-n">${pct(st.completionRate)}</div><div class="tile-l">Chunks done</div></div><div class="tile"><div class="tile-n">${pct(st.onTimeRate)}</div><div class="tile-l">Done on the day</div></div></div>
        <div class="section"><div class="section-head"><h2>Minutes studied · last 8 weeks</h2><span class="small muted">${st.days.perfect} perfect · ${st.days.partial} partial · ${st.days.missed} missed days</span></div><div class="card"><div class="card-body"><svg viewBox="0 0 ${W} ${H}" width="100%" class="chart" role="img" aria-label="Minutes studied per week">${bars}</svg></div></div></div>
        <div class="section"><div class="section-head"><h2>By course</h2></div><div class="stack gap-2">${courses.map(({ course: c, rate, onTime, streak }) => `<div class="card"><div class="card-body"><div class="cols" style="justify-content:space-between"><div style="min-width:0"><a class="code" style="--ch:${L.cc(c)}" href="#/course/${c.id}">${esc(c.code)}</a> <span class="small muted">· ${esc(c.title)}</span></div><div class="small num muted">${pct(rate)} done · ${pct(onTime)} on the day · streak ${streak}</div></div><div class="mt-2">${L.tilesRow(c, 28)}</div></div></div>`).join('')}</div></div>`}
      </div>`;
    },
  };

  // ---------- record ----------
  const LEDGER_LABEL = { matriculated: 'Matriculated', enrolled: 'Enrolled', withdrawn: 'Withdrew', session_attended: 'Attended session', chunk_completed: 'Chunk done', chunk_checked: 'Quick check', contract_signed: 'Contract signed', certificate_issued: 'Certificate issued', assessment_started: 'Began paper', assessment_submitted: 'Submitted paper', assessment_graded: 'Graded', assessment_missed: 'Missed', course_completed: 'Course completed', clock_override: 'Clock moved', clock_reset: 'Clock reset', settings_changed: 'Settings changed', data_imported: 'Record imported' };
  function ledgerDetail(e) {
    const c = e.courseId && R().course(e.courseId);
    const code = c ? c.code : (e.detail.code || '');
    const a = c && e.ref && c.assessments.find((x) => x.id === e.ref);
    const d = e.detail;
    switch (e.type) {
      case 'matriculated': return `${d.name} · ${d.id}`;
      case 'enrolled': return `${code} ${d.title} · ${d.weeks} weeks from ${L.fmt.date(d.start)}`;
      case 'withdrawn': return `${code} in week ${d.week}`;
      case 'session_attended': return `${code} · week ${d.week} ${d.kind}`;
      case 'chunk_completed': return `${code} · ${d.title}${d.onTime ? '' : ' · late'}`;
      case 'chunk_checked': return `${code} · ${d.right}/${d.of} · ${d.passed ? 'passed' : 'try again'}`;
      case 'contract_signed': return `${code} · ${d.no} · signed by ${d.name}`;
      case 'certificate_issued': return `${code} · ${d.no} · ${d.letter} (${L.fmt.pct(d.pct)}) · ${d.code}`;
      case 'assessment_started': return `${code} · ${a ? a.title : d.kind} · seal ${String(d.seal || '').slice(0, 8)}`;
      case 'assessment_submitted': return `${code} · ${a ? a.title : ''} · ${d.answered}/${d.of} answered${d.auto ? ' · auto' : ''}`;
      case 'assessment_graded': return `${code} · ${a ? a.title : ''} · ${L.fmt.pct(d.pct)}${d.penaltyPct ? ` (−${d.penaltyPct}% late)` : ''} · ${d.source}`;
      case 'assessment_missed': return `${code} · ${a ? a.title : d.kind} · closed ${L.fmt.dt(d.closedAt)}`;
      case 'course_completed': return `${code} · ${d.letter} (${L.fmt.pct(d.pct)})`;
      case 'clock_override': return `offset ${L.fmt.rel(d.toMs).replace(/^in /, '+')}`;
      case 'clock_reset': return 'offset cleared';
      case 'data_imported': return `${d.courses} course${d.courses === 1 ? '' : 's'}`;
      default: return JSON.stringify(d).slice(0, 80);
    }
  }
  // ---------- teaching: the instructor's cohorts ----------
  let teachData = null, teachErr = null, teachBusy = false;
  L.views.teach = {
    title: 'Teaching',
    render() {
      if (!L.S.instructor) return `<div class="page"><div class="page-head"><div><h1 class="display">Teaching</h1><p class="lede">Sign in as an instructor under More to publish cohort courses.</p></div></div></div>`;
      const list = teachData ? teachData.cohorts : null;
      return `<div class="page">
        <div class="page-head is-row"><div><h1 class="display">Teaching</h1><span class="small muted">${esc(L.S.instructor.name)}</span></div><div class="actions"><a class="btn btn-primary btn-sm" href="#/enrol?teach=1">New cohort course</a></div></div>
        ${teachErr ? `<div class="notice" data-kind="bad"><span>${esc(teachErr)}</span></div>` : ''}
        ${!list ? '<p class="small muted">Loading…</p>' : !list.length ? '<div class="empty"><p>No cohorts yet. Publish a course and share its code.</p></div>' : `<div class="stack gap-2">${list.map((co) => { const n = co.roster.length; const done = n ? Math.round(co.roster.reduce((a, m) => a + ((m.progress && m.progress.chunksTotal) ? (m.progress.chunksDone / m.progress.chunksTotal) : 0), 0) / n * 100) : 0; const state = co.term.start > L.date.iso(L.today()) ? `starts ${L.fmt.date(co.term.start)}` : co.term.end < L.date.iso(L.today()) ? 'ended' : 'running';
          return `<div class="card"><div class="card-head"><h2>${esc(co.title)}</h2><span class="mono small" style="letter-spacing:0.12em">${esc(co.code)}</span></div><div class="card-body">
            <div class="small muted">${esc(co.courseCode)} · ${co.term.weeks} weeks · ${esc(co.pace)} · ${state}${co.closed ? ' · closed' : ''}</div>
            <div class="meter mt-2"><div class="bar"><i style="width:${done}%"></i></div><span class="small muted num">${n} student${n === 1 ? '' : 's'} · ${done}% of chunks</span></div>
            ${n ? `<details class="mt-2"><summary class="small">Roster</summary><div class="rows mt-1">${co.roster.map((m) => { const p = m.progress || {}; return `<div class="row"><span class="truncate">${esc(m.name)}</span><span class="small muted num">${p.chunksTotal ? `${p.chunksDone}/${p.chunksTotal}` : 'not started'}${p.letter ? ` · ${esc(p.letter)}` : ''}${p.streak ? ` · ${p.streak}d` : ''}</span></div>`; }).join('')}</div></details>` : ''}
            <div class="cols mt-2"><button class="btn btn-sm" data-act="copy-join" data-code="${esc(co.code)}">Copy join link</button><button class="btn btn-sm btn-quiet" data-act="cohort-close" data-code="${esc(co.code)}" data-closed="${co.closed ? '0' : '1'}">${co.closed ? 'Reopen enrolment' : 'Close enrolment'}</button></div>
          </div></div>`; }).join('')}</div>`}
      </div>`;
    },
    // the list is fetched on every visit but only re-rendered when it changed, so the fetch never chases its own render
    async mount() { if (!L.S.instructor || teachBusy) return; teachBusy = true; try { const next = await L.cohort.list(); const changed = JSON.stringify(next) !== JSON.stringify(teachData) || teachErr; teachData = next; teachErr = null; if (changed) L.render(); } catch (e) { if (teachErr !== e.message) { teachErr = e.message; L.render(); } } finally { teachBusy = false; } },
  };
  L.actions['cohort-close'] = async (el) => { try { await L.cohort.close(el.dataset.code, el.dataset.closed === '1'); teachData = await L.cohort.list(); L.render(); } catch (e) { L.ui.toast(e.message, 'bad'); } };
  L.views.record = {
    title: 'Record',
    render() {
      const s = L.S.student; const g = R().gpa();
      const courses = R().courses('all');
      return `<div class="page">
        <div class="page-head is-row"><div><h1 class="display">Grades</h1></div><div class="actions"><button class="btn btn-sm" data-act="verify-ledger">Verify record</button><button class="btn btn-sm" data-act="print">Print</button></div></div>
        <div class="transcript">
          <div class="transcript-head"><div><div class="label">Student</div><div style="font-size:20px;font-weight:700">${esc(s.name)}</div><div class="mono small muted">${esc(s.id)} · since ${L.fmt.date(s.createdAt)}</div></div><div class="seal-lg">L</div></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Course</th><th class="num">Credits</th><th>Term</th><th class="num">Mark</th><th class="num">Grade</th></tr></thead><tbody>
            ${courses.length ? courses.map((c) => { const st = R().courseState(c); const sd = R().standing(c); return `<tr><td class="code" style="--ch:${L.cc(c)}">${esc(c.code)}</td><td>${esc(c.title)}<div class="small muted">${esc(c.level)}${c.plan.paceLabel ? ` · ${esc(c.plan.paceLabel.toLowerCase())} pace` : ''}</div></td><td class="num">${c.credits}</td><td class="mono small">${L.fmt.date(c.term.start)} – ${L.fmt.date(c.term.end)}</td><td class="num">${c.final ? (c.final.pct == null ? '—' : L.fmt.pct(c.final.pct)) : (sd.current == null ? '—' : L.fmt.pct(sd.current) + '*')}</td><td class="num"><span class="letter" style="font-size:18px">${c.final ? c.final.letter : (st === 'upcoming' ? '·' : 'IP')}</span></td></tr>`; }).join('') : '<tr class="row-muted"><td colspan="6">No courses on record.</td></tr>'}
          </tbody></table></div>
          <div class="cols mt-3" style="justify-content:space-between"><div class="small muted">IP = in progress (*standing to date) · W = withdrawn · GPA counts completed courses only</div><div class="cols gap-3"><span><span class="label">Credits</span> <b class="num">${g.credits}</b></span><span><span class="label">GPA</span> <b class="num">${g.gpa == null ? '—' : g.gpa.toFixed(2)}</b></span></div></div>
        </div>
        ${(() => { const certs = L.S.courses.filter((c) => c.certificate); const failed = L.S.courses.filter((c) => c.final && !c.certificate && c.final.letter !== 'W'); return `<div class="section"><div class="section-head"><h2>Certificates</h2><span class="small muted">${certs.length} issued · pass mark ${L.papers.PASS}%</span></div>${certs.length ? `<div class="stack gap-2">${certs.map((c) => `<div class="card"><div class="card-body cols" style="justify-content:space-between"><div><div style="font-weight:600">${esc(c.title)}</div><div class="small muted">${esc(c.code)} · ${esc(c.certificate.letter)} ${L.fmt.pct(c.certificate.pct)} · ${esc(c.certificate.no)} · issued ${L.fmt.date(c.certificate.issuedAt)}</div></div><a class="btn btn-sm" href="#/certificate/${c.id}">View</a></div></div>`).join('')}</div>` : `<p class="muted small">A certificate is issued when a course ends with ${L.papers.PASS}% or more.${failed.length ? ` ${failed.map((c) => `${esc(c.code)} ended at ${L.fmt.pct(c.final.pct)} — no certificate.`).join(' ')}` : ''}</p>`}</div>`; })()}
        <div class="section ledger-list"><div class="section-head"><h2>Ledger</h2><span class="small muted">${L.S.ledger.length} entries · hash-chained, append-only</span></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Event</th><th>Detail</th><th>When</th><th>Hash</th></tr></thead><tbody>
            ${L.S.ledger.slice(-60).reverse().map((e) => `<tr><td class="mono small muted">${e.i}</td><td>${LEDGER_LABEL[e.type] || e.type}</td><td class="small">${esc(ledgerDetail(e))}</td><td class="mono small nowrap">${L.fmt.dt(e.t)}</td><td class="hash">${e.hash.slice(0, 8)}</td></tr>`).join('')}
          </tbody></table></div></div>
      </div>`;
    },
  };
  L.actions['verify-ledger'] = async () => { const v = await L.ledger.verify(); L.ui.toast(v.ok ? `Ledger verified: ${L.S.ledger.length} entries, chain intact.` : `Ledger broken at entry ${v.brokenAt}. The record has been altered.`, v.ok ? 'good' : 'bad', 5000); };
  L.actions.print = () => window.print();

  // ---------- settings ----------
  L.views.settings = {
    title: 'Settings',
    render() {
      const s = L.S.settings;
      const off = L.S.clock.offsetMs || 0;
      const models = L.faculty.MODELS.includes(s.model) ? L.faculty.MODELS : [s.model, ...L.faculty.MODELS];
      const papers = L.S.courses.filter((c) => c.contract || c.certificate);
      return `<div class="page">
        <div class="page-head is-row"><div><h1 class="display">More</h1></div><div class="actions"><a class="btn btn-sm btn-quiet" href="#/record">Grades →</a></div></div>
        <p class="small muted" style="margin:-6px 0 8px"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms</a> · Lyceum is an independent study tool, not an accredited institution.</p>
        <div class="card mb-3"><div class="card-head"><h3>Library</h3><span class="small muted">open-access titles</span></div><div class="card-body"><p class="small" style="margin:0 0 10px">Textbooks and classics under open licences, ready to enrol: OpenStax courses, Euclid, Darwin, Marcus Aurelius…</p><a class="btn btn-primary btn-sm" href="#/library">Open the Library</a></div></div>
        <div class="card mb-3"><div class="card-head"><h3>Instructor</h3><span class="small muted">${L.S.instructor ? esc(L.S.instructor.name) : 'cohort courses'}</span></div><div class="card-body">
          ${L.S.instructor ? `<p class="small" style="margin:0 0 10px">Signed in as an instructor. Publish a course plan and share its code; every student who joins follows the same term.</p><div class="cols"><a class="btn btn-primary btn-sm" href="#/teach">Your cohorts</a><a class="btn btn-sm" href="#/enrol?teach=1">New cohort course</a><button class="btn btn-sm btn-quiet" data-act="instructor-out">Sign out</button></div>`
          : `<p class="small" style="margin:0 0 10px">Instructors publish a course for a class to join. Keys are issued by Lyceum.</p><div class="cols"><input id="instructor-key" class="input mono" type="password" autocomplete="off" placeholder="lyi_…" style="flex:1;max-width:260px"><button class="btn btn-sm" data-act="instructor-in">Sign in</button></div>`}
        </div></div>
        <div class="card"><div class="card-head"><h3>Papers</h3><span class="small muted">${papers.length ? `${L.S.courses.filter((c) => c.certificate).length} certificate${L.S.courses.filter((c) => c.certificate).length === 1 ? '' : 's'}` : ''}</span></div><div class="card-body rows">${papers.length ? papers.map((c) => `<div class="row"><div style="min-width:0;flex:1"><div class="truncate" style="font-weight:600">${esc(c.title)}</div><div class="small muted">${esc(c.code)}${c.certificate ? ` · ${esc(c.certificate.letter)} ${L.fmt.pct(c.certificate.pct)}` : ''}</div></div><div class="cols gap-1">${c.contract ? `<a class="btn btn-sm" href="#/contract/${c.id}">Contract</a>` : ''}${c.certificate ? `<a class="btn btn-sm btn-primary" href="#/certificate/${c.id}">Certificate</a>` : ''}</div></div>`).join('') : '<p class="small muted">Contracts appear when you enrol; certificates when a course ends at 70% or more.</p>'}</div></div>
        <div class="grid-2 mt-3">
          <div class="stack gap-3">
            <div class="card"><div class="card-head"><h2>Faculty</h2><span class="small muted">${L.faculty.available() ? 'key set' : 'offline examiner'}</span></div><div class="card-body stack gap-2">
              <div class="field"><label for="api-key">OpenRouter key</label><input id="api-key" class="input mono" type="password" autocomplete="off" value="${esc(s.apiKey)}" data-in="api-key" placeholder="sk-or-v1-…"><span class="hint">Stored only in this browser. With no key, papers are set and graded by the offline examiner.</span></div>
              <div class="field"><label for="model">Preferred model</label><input id="model" class="input mono" list="model-list" value="${esc(s.model)}" data-in="model"><datalist id="model-list">${models.map((m) => `<option value="${esc(m)}">`).join('')}</datalist><span class="hint">Falls back through ${L.faculty.MODELS.length} models, then to the offline examiner.</span></div>
              <div class="cols"><button class="btn" data-act="test-faculty">Test connection</button><span class="small muted" id="faculty-test"></span></div>
              <div class="divider"></div>
              <div class="field"><label for="api-base">Lyceum server</label><input id="api-base" class="input mono" autocomplete="off" spellcheck="false" value="${esc(s.apiBase)}" data-in="api-base" placeholder="${esc(L.API_BASE || 'https://api.…')}"><span class="hint">${serverHint()}</span></div>
              ${L.debug ? `<div class="field"><label for="iap-dev">Developer enrolment secret</label><input id="iap-dev" class="input mono" type="password" autocomplete="off" value="${esc(s.iapDevSecret || '')}" data-in="iap-dev" placeholder="matches IAP_DEV_SECRET on a test server"><span class="hint">Runs the paid-enrolment path without a store. ${L.store.pending().length ? `${L.store.pending().length} purchase(s) waiting for the server.` : ''}</span></div>` : ''}
            </div></div>
            <div class="card"><div class="card-head"><h2>Study budget</h2></div><div class="card-body"><div class="field"><label for="weekly-hours">Hours per week you can give to coursework</label><div class="cols"><input id="weekly-hours" class="input num" type="number" min="4" max="40" step="1" value="${s.weeklyHours}" data-in="weekly-hours" style="width:110px"><span class="small muted">Applies to future enrolments. The registrar refuses a course that would exceed it.</span></div></div></div></div>
            <div class="card"><div class="card-head"><h2>Appearance</h2></div><div class="card-body"><div class="switch" role="group" aria-label="Theme">${['dark', 'light', 'system'].map((t) => `<button data-act="theme" data-theme="${t}" aria-pressed="${s.theme === t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`).join('')}</div></div></div>
          </div>
          <div class="stack gap-3">
            <div class="card"><div class="card-head"><h2>Registrar clock</h2><span class="small muted mono" data-clock>${L.fmt.time(L.now())}</span></div><div class="card-body">
              ${off ? `<div class="notice" data-kind="warn"><span>The clock is offset by <b>${L.fmt.rel(off).replace(/^in /, '+')}</b>. Every entry in the ledger carries the offset time.</span></div>` : '<p class="small muted">The clock runs on real time.</p>'}
              ${L.debug ? `<div class="cols mt-2"><button class="btn btn-sm" data-act="clock" data-ms="3600000">+1 hour</button><button class="btn btn-sm" data-act="clock" data-ms="86400000">+1 day</button><button class="btn btn-sm" data-act="clock" data-ms="604800000">+1 week</button><span class="small muted">debug mode</span></div>` : ''}
              ${off ? `<div class="mt-2"><button class="btn btn-sm" data-act="clock-reset">Reset clock</button></div>` : ''}
            </div></div>
            <div class="card"><div class="card-head"><h2>Data</h2></div><div class="card-body stack gap-2">
              <div class="cols"><button class="btn" data-act="export">Export record</button><label class="btn">Import<input type="file" accept="application/json,.json" data-in="import" hidden></label></div>
              <p class="small muted">The export holds your record, ledger and all course material. Importing replaces what is on this device and is itself written to the ledger.</p>
              <div class="divider"></div>
              <div class="cols"><button class="btn btn-danger" data-act="erase">Erase this device</button><span class="small muted">Removes the student record, every course and the ledger.</span></div>
            </div></div>
            <div class="card"><div class="card-head"><h2>Students</h2></div><div class="card-body"><p class="small">This device holds one student record: <b>${esc(L.S.student.name)}</b> (${esc(L.S.student.id)}). Multi-student accounts arrive with the server release.</p><button class="btn btn-sm mt-1" disabled>Add student</button></div></div>
          </div>
        </div></div>`;
    },
  };
  L.inputs['api-key'] = (el) => { L.S.settings.apiKey = el.value.trim(); L.save(); };
  function serverHint() {
    const h = L.serverHealth; const base = (L.S.settings.apiBase || L.API_BASE || '').trim();
    if (!base) return 'Serves the Library, the faculty proxy and certificate verification. Leave empty to work alone.';
    if (!h) return 'Checking…';
    if (!h.ok) return 'Not reachable right now.';
    return `Connected · faculty ${h.faculty ? 'on' : 'off'} · ${h.free ? 'free pilot' : h.entitlements ? 'paid enrolments' : 'no entitlements'}`;
  }
  L.actions['instructor-in'] = async () => { const el = document.getElementById('instructor-key'); const k = (el ? el.value : '').trim(); if (!k) return; try { const r = await L.cohort.signIn(k); L.ui.toast(`Welcome, ${r.name}.`, 'good'); L.render(); } catch (e) { L.ui.toast(e.message, 'bad', 6000); } };
  L.actions['instructor-out'] = () => { L.cohort.signOut(); L.render(); };
  L.inputs['iap-dev'] = (el) => { L.S.settings.iapDevSecret = el.value.trim(); L.save(); };
  L.inputs['api-base'] = (el) => { L.S.settings.apiBase = el.value.trim().replace(/\/$/, ''); L.save(); L.faculty.probe().then(() => L.render()); };
  L.inputs.model = (el) => { L.S.settings.model = el.value.trim(); L.save(); };
  L.inputs['weekly-hours'] = (el) => { const v = L.clamp(Math.round(Number(el.value) || 12), 4, 40); L.S.settings.weeklyHours = v; L.save(); };
  L.actions.theme = (el) => { L.theme.set(el.dataset.theme); L.render(); };
  L.actions['test-faculty'] = async (el) => {
    const out = document.getElementById('faculty-test'); el.disabled = true; out.textContent = 'Testing…';
    const r = await L.faculty.test();
    out.textContent = r.ok ? `Connected: ${r.model} answered in ${(r.ms / 1000).toFixed(1)} s.` : `Not available: ${r.error}`;
    el.disabled = false;
  };
  L.actions.clock = async (el) => { await L.clock.setOffset((L.S.clock.offsetMs || 0) + Number(el.dataset.ms)); await R().sweep(); L.render(); };
  L.actions['clock-reset'] = async () => { await L.clock.reset(); await R().sweep(); L.ui.toast('Clock reset to real time.', 'good'); L.render(); };
  L.actions.export = async () => {
    const obj = await L.exportRecord();
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `lyceum-${L.S.student.id}-${D.iso(L.now())}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    L.ui.toast('Record exported.', 'good');
  };
  L.inputs.import = async (el) => {
    const f = el.files && el.files[0]; if (!f) return;
    const ok = await L.ui.confirm({ title: 'Import this record?', body: `<p><b>${esc(f.name)}</b> will replace the student record, every course and the ledger on this device.</p>`, ok: 'Import', danger: true });
    if (!ok) { el.value = ''; return; }
    try { await L.importRecord(JSON.parse(await f.text())); L.ui.toast('Record imported.', 'good'); L.go('/today'); } catch (e) { L.ui.toast(e.message, 'bad'); }
    el.value = '';
  };
  L.actions.erase = async () => {
    const ok = await L.ui.confirm({ title: 'Erase this device?', body: '<p>The student record, every course, all material and the ledger will be removed from this browser. Export first if you want to keep them.</p>', ok: 'Erase everything', danger: true });
    if (ok) await L.reset();
  };
})(window.L);
