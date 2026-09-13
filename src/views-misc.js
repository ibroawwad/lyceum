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
          ...sess.map(({ course: c, session: s }) => `<a class="cal-ev" style="--ch:${c.hue}" href="#/course/${c.id}/day/${s.date}" title="${esc(c.title)} · ${s.chunks.length} chunks">${hm(s.start)} ${esc(c.code)}${s.chunks.length && s.chunks.every((k) => k.done) ? ' ✓' : ''}</a>`),
          ...due.map(({ course: c, assessment: a }) => `<a class="cal-ev is-due${a.kind === 'midterm' || a.kind === 'final' ? ' is-exam' : ''}" style="--ch:${c.hue}" href="#/assess/${c.id}/${a.id}" title="${esc(a.title)} due ${L.fmt.time(a.dueAt)}">${esc(a.title)} · ${esc(c.code)}</a>`),
        ];
        cells.push(`<div class="cal-day${other ? ' is-other' : ''}${iso === D.iso(today) ? ' is-today' : ''}"><div class="d">${d.getDate()}${d.getDate() === 1 ? ' ' + D.monthName(d).slice(0, 3) : ''}</div>${ev.join('')}</div>`);
        if (i === 34 && D.addDays(gridStart, 35).getMonth() !== m.getMonth()) break;
      }
      // weekly timetable for the current week
      const weekStart = D.addDays(today, -D.dow(today));
      const H0 = 8, H1 = 21, PX = 40; // 40px per hour → 520px
      const cols = DAYS.map((name, di) => {
        const d = D.addDays(weekStart, di);
        const blocks = R().sessionsOn(d).map(({ course: c, session: s }) => `<a class="tt-block" style="--ch:${c.hue};top:${((s.start / 60) - H0) * PX}px;height:${(s.minutes / 60) * PX - 2}px" href="#/course/${c.id}/day/${s.date}" title="${esc(c.title)}"><b>${esc(c.code)}</b>${hm(s.start)} · ${s.chunks.length} chunks</a>`);
        const exams = R().deadlines({ from: D.setTime(d, 0, 0), to: D.setTime(d, 23, 59, 59) }).filter(({ assessment: a }) => a.durationMin && (a.kind === 'midterm' || a.kind === 'final')).map(({ course: c, assessment: a }) => `<a class="tt-block" style="--ch:${c.hue};top:${(new Date(a.opensAt).getHours() - H0) * PX}px;height:${(new Date(a.dueAt) - new Date(a.opensAt)) / 3600000 * PX - 2}px;background:var(--surface-2);border-left-color:var(--ink)" href="#/assess/${c.id}/${a.id}"><b>${esc(c.code)}</b>${esc(a.title)} window</a>`);
        return `<div class="tt-col">${blocks.join('')}${exams.join('')}</div>`;
      });
      const hours = []; for (let h = H0 + 1; h < H1; h++) hours.push(`<span style="top:${(h - H0) * PX}px">${String(h).padStart(2, '0')}:00</span>`);
      const active = R().courses('active');
      return `<div class="page">
        <div class="page-head"><div><span class="eyebrow">Calendar</span><h1 class="display">${D.monthName(m)} ${m.getFullYear()}</h1></div>
          <div class="actions cal-nav"><a class="btn btn-quiet" href="#/calendar?m=${ym(prev)}">← ${D.monthName(prev).slice(0, 3)}</a><a class="btn" href="#/calendar">Today</a><a class="btn btn-quiet" href="#/calendar?m=${ym(next)}">${D.monthName(next).slice(0, 3)} →</a></div></div>
        <div class="calendar">${DAYS.map((d) => `<div class="cal-h">${d}</div>`).join('')}${cells.join('')}</div>
        <div class="agenda-14">${Array.from({ length: 14 }, (_, i) => D.addDays(today, i)).map((d, i) => { const sess = R().sessionsOn(d); const due = R().deadlines({ from: D.setTime(d, 0, 0), to: D.setTime(d, 23, 59, 59) }); if (!sess.length && !due.length) return ''; return `<div class="agenda-day"><div class="agenda-date"><b>${D.dayName(d).slice(0, 3)}</b> ${L.fmt.date(d).slice(4)}${i === 0 ? ' · today' : ''}</div>${sess.map(({ course: c, session: s }) => `<a class="cal-ev" style="--ch:${c.hue}" href="#/course/${c.id}/day/${s.date}">${hm(s.start)} ${esc(c.code)} · ${s.chunks.length} chunks · ${L.fmt.dur(s.minutes)}</a>`).join('')}${due.map(({ course: c, assessment: a }) => `<a class="cal-ev is-due${a.kind === 'midterm' || a.kind === 'final' ? ' is-exam' : ''}" style="--ch:${c.hue}" href="#/assess/${c.id}/${a.id}">${esc(a.title)} · ${esc(c.code)} · ${L.fmt.time(a.dueAt)}</a>`).join('')}</div>`; }).join('') || '<p class="muted small">Nothing in the next two weeks.</p>'}</div>
        <div class="cols mt-2 small muted">${active.map((c) => `<span class="cols gap-1"><span class="dot" style="--ch:${c.hue}"></span>${esc(c.code)} ${esc(c.title)}</span>`).join('') || 'No active courses.'}</div>
        <div class="section"><div class="section-head"><h2>Timetable · week of ${L.fmt.date(weekStart)}</h2><span class="small muted">Concurrent courses never share a block</span></div>
          <div class="timetable"><div class="tt-h"></div>${DAYS.map((n, i) => `<div class="tt-h${D.iso(D.addDays(weekStart, i)) === D.iso(today) ? ' is-today' : ''}">${n} ${D.addDays(weekStart, i).getDate()}</div>`).join('')}<div class="tt-hours">${hours.join('')}</div>${cols.join('')}</div></div>
      </div>`;
    },
  };

  // ---------- record ----------
  const LEDGER_LABEL = { matriculated: 'Matriculated', enrolled: 'Enrolled', withdrawn: 'Withdrew', session_attended: 'Attended session', chunk_completed: 'Chunk done', assessment_started: 'Began paper', assessment_submitted: 'Submitted paper', assessment_graded: 'Graded', assessment_missed: 'Missed', course_completed: 'Course completed', clock_override: 'Clock moved', clock_reset: 'Clock reset', settings_changed: 'Settings changed', data_imported: 'Record imported' };
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
  L.views.record = {
    title: 'Record',
    render() {
      const s = L.S.student; const g = R().gpa();
      const courses = R().courses('all');
      return `<div class="page">
        <div class="page-head"><div><span class="eyebrow">Office of the Registrar · Academic record</span><h1 class="display">Transcript</h1></div><div class="actions"><button class="btn" data-act="verify-ledger">Verify chain</button><button class="btn" data-act="print">Print</button></div></div>
        <div class="transcript">
          <div class="transcript-head"><div><div class="label">Student</div><div class="serif" style="font-size:24px;font-weight:500">${esc(s.name)}</div><div class="mono small muted">${esc(s.id)} · matriculated ${L.fmt.date(s.createdAt)}</div></div><div class="seal-lg">L</div></div>
          <table class="table"><thead><tr><th>Code</th><th>Course</th><th class="num">Credits</th><th>Term</th><th class="num">Mark</th><th class="num">Grade</th></tr></thead><tbody>
            ${courses.length ? courses.map((c) => { const st = R().courseState(c); const sd = R().standing(c); return `<tr><td class="code" style="--ch:${c.hue}">${esc(c.code)}</td><td>${esc(c.title)}<div class="small muted">${esc(c.level)}${c.plan.paceLabel ? ` · ${esc(c.plan.paceLabel.toLowerCase())} pace` : ''}</div></td><td class="num">${c.credits}</td><td class="mono small">${L.fmt.date(c.term.start)} – ${L.fmt.date(c.term.end)}</td><td class="num">${c.final ? (c.final.pct == null ? '—' : L.fmt.pct(c.final.pct)) : (sd.current == null ? '—' : L.fmt.pct(sd.current) + '*')}</td><td class="num"><span class="letter" style="font-size:18px">${c.final ? c.final.letter : (st === 'upcoming' ? '·' : 'IP')}</span></td></tr>`; }).join('') : '<tr class="row-muted"><td colspan="6">No courses on record.</td></tr>'}
          </tbody></table>
          <div class="cols mt-3" style="justify-content:space-between"><div class="small muted">IP = in progress (*standing to date) · W = withdrawn · GPA counts completed courses only</div><div class="cols gap-3"><span><span class="label">Credits</span> <b class="num">${g.credits}</b></span><span><span class="label">GPA</span> <b class="num">${g.gpa == null ? '—' : g.gpa.toFixed(2)}</b></span></div></div>
        </div>
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
      return `<div class="page">
        <div class="page-head"><div><span class="eyebrow">Settings</span><h1 class="display">Settings</h1></div></div>
        <div class="grid-2">
          <div class="stack gap-3">
            <div class="card"><div class="card-head"><h2>Faculty</h2><span class="small muted">${L.faculty.available() ? 'key set' : 'offline examiner'}</span></div><div class="card-body stack gap-2">
              <div class="field"><label for="api-key">OpenRouter key</label><input id="api-key" class="input mono" type="password" autocomplete="off" value="${esc(s.apiKey)}" data-in="api-key" placeholder="sk-or-v1-…"><span class="hint">Stored only in this browser. With no key, papers are set and graded by the offline examiner.</span></div>
              <div class="field"><label for="model">Preferred model</label><input id="model" class="input mono" list="model-list" value="${esc(s.model)}" data-in="model"><datalist id="model-list">${models.map((m) => `<option value="${esc(m)}">`).join('')}</datalist><span class="hint">Falls back through ${L.faculty.MODELS.length} models, then to the offline examiner.</span></div>
              <div class="cols"><button class="btn" data-act="test-faculty">Test connection</button><span class="small muted" id="faculty-test"></span></div>
            </div></div>
            <div class="card"><div class="card-head"><h2>Study budget</h2></div><div class="card-body"><div class="field"><label for="weekly-hours">Hours per week you can give to coursework</label><div class="cols"><input id="weekly-hours" class="input num" type="number" min="4" max="40" step="1" value="${s.weeklyHours}" data-in="weekly-hours" style="width:110px"><span class="small muted">Applies to future enrolments. The registrar refuses a course that would exceed it.</span></div></div></div></div>
            <div class="card"><div class="card-head"><h2>Appearance</h2></div><div class="card-body"><div class="switch" role="group" aria-label="Theme">${['system', 'light', 'dark'].map((t) => `<button data-act="theme" data-theme="${t}" aria-pressed="${s.theme === t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`).join('')}</div></div></div>
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
