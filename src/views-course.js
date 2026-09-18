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
      if (!all.length) return `<div class="page"><div class="page-head"><div><h1 class="display">Courses</h1></div><div class="actions"><a class="btn btn-primary" href="#/enrol">Add a course</a></div></div><div class="empty"><h2>No courses yet.</h2><p>Add material and choose a pace. Dates, weights and exams are fixed from that moment.</p><div class="cols mt-3"><a class="btn btn-primary" href="#/enrol">Add a course</a><button class="btn" data-act="load-sample">Try the sample</button></div></div></div>`;
      const rows = all.map((c) => {
        const st = R().courseState(c); const s = R().standing(c); const wk = R().currentWeek(c);
        const sub = st === 'running' ? `week ${wk} of ${c.term.weeks}` : st === 'upcoming' ? `starts ${L.fmt.date(c.term.start)}` : st === 'withdrawn' ? 'withdrawn' : `completed · ${c.final ? c.final.letter : ''}`;
        return `<a class="course-card" href="#/course/${c.id}" style="--ch:${L.cc(c)}">
          <div class="head"><span class="icon-sq">${esc(c.subjectCode.slice(0, 2))}</span><div class="t"><b>${esc(c.title)}</b><span>${esc(c.code)} · ${sub}</span></div><div class="letter">${c.final ? c.final.letter : (s.letter || '')}</div></div>
          ${L.tilesGrid(c)}<div class="tiles-legend" style="--ch:${L.cc(c)}">less <i></i><i data-v="part"></i><i data-v="full"></i> more</div>
        </a>`;
      });
      return `<div class="page"><div class="page-head is-row"><div><h1 class="display">Courses</h1></div><div class="actions"><a class="btn btn-icon" href="#/enrol" aria-label="Add a course" title="Add a course">+</a></div></div><div class="stack gap-2 stagger">${rows.join('')}</div></div>`;
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
    return `<div class="page-head" style="--ch:${L.cc(c)}"><div><div class="course-lockup"><span class="icon-sq">${esc(c.subjectCode.slice(0, 2))}</span><div><h1 class="display" style="font-size:22px">${esc(c.title)}</h1><div class="small muted">${esc(c.code)} · ${st === 'running' ? `week ${wk} of ${c.term.weeks}` : st === 'upcoming' ? `starts ${L.fmt.date(c.term.start)}` : st} · ${esc((c.plan.paceLabel || 'standard').toLowerCase())} · ${c.plan.minutesPerDay} min/day · ${c.credits} cr</div></div></div>
      <div class="mt-2">${L.tilesGrid(c)}</div></div>
      <div class="actions">${wk >= 1 && wk <= c.term.weeks ? `<a class="btn btn-primary" href="#/course/${c.id}/day/${nextBlockDate(c)}">${c.sessions.some((s) => s.date === L.date.iso(L.today())) ? "Today's block" : 'Next block'}</a>` : ''}${c.certificate ? `<a class="btn" href="#/certificate/${c.id}">Certificate</a>` : ''}${c.contract ? `<a class="btn btn-quiet" href="#/contract/${c.id}">Contract</a>` : ''}${canWithdraw ? `<button class="btn btn-quiet" data-act="withdraw" data-course="${c.id}">Withdraw</button>` : ''}</div></div>`;
  }
  const nextBlockDate = (c) => { const t = L.date.iso(L.today()); const s = c.sessions.find((x) => x.date >= t) || c.sessions[c.sessions.length - 1]; return s ? s.date : c.term.start; };
  const tabs = (c, tab) => `<nav class="tabs">${['plan', 'syllabus', 'assessments', 'grades', 'materials'].map((t) => `<a href="#/course/${c.id}?tab=${t}"${t === tab ? ' aria-current="page"' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</a>`).join('')}</nav>`;

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
        <div class="sessions">${sess.map((s) => { const d = s.chunks.filter((k) => k.done).length; return `<div><a href="#/course/${c.id}/day/${s.date}" style="color:inherit">${L.fmt.date(s.date)}</a> · ${s.chunks.length} chunks ${d === s.chunks.length && s.chunks.length ? '<span class="att">✓</span>' : d ? `<span class="muted">${d}/${s.chunks.length}</span>` : ''}</div>`; }).join('')}</div>
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
        <div class="tiles-2"><div class="tile"><div class="tile-n">${c.final ? c.final.letter : (s.letter || '—')}</div><div class="tile-l">${c.final ? 'Final grade' : 'Current standing'}</div></div><div class="tile"><div class="tile-n">${c.final ? (c.final.pct == null ? '—' : L.fmt.pct(c.final.pct)) : L.fmt.pct(s.current)}</div><div class="tile-l">${c.final ? 'Final mark' : 'Weighted, graded work only'}</div></div><div class="tile"><div class="tile-n">${c.final ? '·' : L.fmt.pct(s.projected)}</div><div class="tile-l">Projected at this pace</div></div></div>
        <div class="card"><div class="card-head"><h3>Breakdown</h3></div><div class="card-body"><div class="breakdown-wrap"><table class="table"><thead><tr><th>Category</th><th class="num">Weight</th><th class="num">Graded</th><th class="num">Average</th><th class="num">Contributes</th></tr></thead><tbody>
          ${Object.entries(c.policy.weights).map(([k, w]) => { const cat = s.categories.find((x) => x.kind === k); const items = c.assessments.filter((a) => a.kind === k).length; return `<tr><td>${k === 'participation' ? 'Participation (attendance)' : esc(KT(k) + (items > 1 ? 's' : ''))}</td><td class="num">${w}%</td><td class="num">${k === 'participation' ? `${s.participation.attended}/${s.participation.held}` : `${cat ? cat.done : 0}/${items}`}</td><td class="num">${cat && cat.avg != null ? L.fmt.pct(cat.avg) : '—'}</td><td class="num">${cat && cat.contrib != null ? cat.contrib.toFixed(1) + ' pts' : '—'}</td></tr>`; }).join('')}
        </tbody></table></div></div></div>
      </div>
      <div class="stack gap-2">
        <div class="registrar-note"><span class="label">Fixed at enrolment.</span>Late work −${c.policy.late.perDayPct}%/day up to ${c.policy.late.maxDays} days; exams have no late window. Withdrawal until ${L.fmt.date(L.date.addDays(L.date.parse(c.policy.withdrawBefore), -1))}.</div>
        <div class="card"><div class="card-head"><h3>Letter scale</h3><span class="small muted">standard 4.0</span></div><div class="card-body"><div class="weights">${scale.map(([min, l, p]) => `<div class="small"><span class="letter" style="font-size:16px">${l}</span> <span class="muted">≥ ${min}%</span> <span class="mono muted">${p.toFixed(1)}</span></div>`).join('')}</div></div></div>
      </div></div>`;
  }
  function materials(c) {
    return `<div class="grid-2"><div class="card"><div class="card-head"><h3>Sources</h3><span class="small muted num">${L.fmt.num(c.material.words)} words</span></div><div class="card-body"><table class="table"><tbody>${c.material.sources.map((s) => `<tr><td><span class="pill">${esc(s.kind)}</span></td><td>${esc(s.name)}${s.url ? `<div class="small muted truncate">${esc(s.url)}</div>` : ''}</td><td class="num small">${L.fmt.num(s.words)} w${s.pages ? ` · ${s.pages} pp` : ''}</td></tr>`).join('')}</tbody></table>
      <p class="small muted mt-2">Analysed by ${c.analysis.source === 'llm' ? `faculty (${esc(c.analysis.model || 'model')})` : 'the offline registrar'}.${c.analysis.note ? ' ' + esc(c.analysis.note) : ''}</p>
      ${(() => { const skipped = c.material.segments.filter((g) => g.role && g.role !== 'body'); if (!skipped.length) return ''; return `<p class="small muted mt-1"><b>Not scheduled</b> (front and back matter): ${skipped.map((g) => { const loc = R().locate(c, g.start, g.end); return esc(g.title) + (loc.pages ? ` (pp. ${loc.pages[0]}–${loc.pages[1]})` : ''); }).join(', ')}.</p>`; })()}</div></div>
      <div class="card"><div class="card-head"><h3>Units</h3><span class="small muted">${c.analysis.units.length}</span></div><div class="card-body stack gap-2">${c.analysis.units.map((u, i) => `<div><div style="font-weight:500">${i + 1}. ${esc(u.title)}</div><div class="small muted">${u.topics.map(esc).join(' · ')}</div></div>`).join('')}</div></div></div>
      <div class="section"><div class="section-head"><h2>About this course</h2></div><p style="max-width:70ch">${esc(c.description)}</p>${c.prerequisites.length ? `<p class="small muted">Assumed: ${c.prerequisites.map(esc).join('; ')}.</p>` : ''}</div>`;
  }
  function planTab(c) {
    const today = L.date.iso(L.today());
    const byWeek = L.groupBy(c.sessions, 'week');
    return `<div class="plan">${c.weeks.map((w) => `<div class="plan-week"><div class="section-head"><h2>Week ${w.n} · ${esc(w.title)}</h2><span class="small muted mono">${L.fmt.date(w.start)} – ${L.fmt.date(L.date.addDays(L.date.parse(w.start), 6))}</span></div>
      <div class="plan-days">${(byWeek[w.n] || []).map((s) => `<div class="plan-day${s.date === today ? ' is-today' : s.date < today ? ' is-past' : ''}"><div class="plan-date"><b>${L.date.dayName(s.date).slice(0, 3)}</b> ${L.fmt.date(s.date).slice(4)}</div>${L.studyBlock(c, s)}</div>`).join('') || '<p class="muted small">No study blocks this week.</p>'}</div></div>`).join('')}</div>`;
  }
  L.views.course = {
    title: (p) => R().course(p.id)?.code || 'Course',
    render(p, q) {
      const c = R().course(p.id); if (!c) return notFound('Course');
      const tab = ['plan', 'syllabus', 'assessments', 'grades', 'materials'].includes(q.tab) ? q.tab : 'plan';
      const body = tab === 'plan' ? planTab(c) : tab === 'syllabus' ? syllabus(c) : tab === 'assessments' ? assessments(c) : tab === 'grades' ? grades(c) : materials(c);
      return `<div class="page">${header(c)}${tabs(c, tab)}${body}</div>`;
    },
  };

  // ---------- day view: the study block, and the original pages for its reading chunks ----------
  L.views.week = { title: 'Week', render(p) { const c = R().course(p.id); if (!c) return notFound('Course'); const s = c.sessions.find((x) => x.week === p.n) || c.sessions[0]; setTimeout(() => L.go(s ? `/course/${c.id}/day/${s.date}` : `/course/${c.id}`), 0); return '<div class="page"></div>'; } };
  let pageRenderToken = 0;
  L.views.day = {
    title: (p) => R().course(p.id)?.code || 'Study',
    render(p, q) {
      const c = R().course(p.id); if (!c) return notFound('Course');
      const s = c.sessions.find((x) => x.date === p.date); if (!s) return notFound('Study block');
      const idx = c.sessions.indexOf(s);
      const prev = c.sessions[idx - 1], next = c.sessions[idx + 1];
      const reads = s.chunks.filter((k) => k.kind === 'read');
      const active = reads.find((k) => k.id === q.chunk) || reads[0];
      const w = R().week(c, s.week);
      const notes = c.notes && c.notes[s.week];
      const mode = q.view === 'text' ? 'text' : 'pages';
      const src = active && c.material.sources.find((x) => x.id === active.source);
      const canPages = !!(src && src.hasFile);
      return `<div class="page is-wide"><div class="page-head" style="--ch:${L.cc(c)}"><div><span class="eyebrow"><a href="#/course/${c.id}" class="code">${esc(c.code)}</a> · week ${s.week} · ${L.fmt.dateLong(s.date)}</span><h1 class="display">${esc(s.topic)}</h1><p class="lede">${L.fmt.dur(s.minutes)} · ${s.chunks.length} chunks</p></div>
        <div class="actions">${prev ? `<a class="btn btn-quiet" href="#/course/${c.id}/day/${prev.date}">← ${L.fmt.date(prev.date)}</a>` : ''}${next ? `<a class="btn btn-quiet" href="#/course/${c.id}/day/${next.date}">${L.fmt.date(next.date)} →</a>` : ''}</div></div>
        <div class="reading-layout">
          <div>
            ${active ? `<div class="reading-src"><span>${esc(active.title)}${active.pages ? ` · ${active.pages[0] === active.pages[1] ? `page ${active.pages[0]}` : `pages ${active.pages[0]}–${active.pages[1]}`}` : ''}${src ? ` · ${esc(src.name)}` : ''}</span>${canPages ? `<span class="switch"><a class="${mode === 'pages' ? 'is-on' : ''}" href="#/course/${c.id}/day/${s.date}?chunk=${active.id}">Pages</a><a class="${mode === 'text' ? 'is-on' : ''}" href="#/course/${c.id}/day/${s.date}?chunk=${active.id}&view=text">Text</a></span>` : ''}</div>
              <div id="reading-body" class="${canPages && mode === 'pages' ? 'pages' : 'reading'}"><p class="muted" style="font-family:var(--font-body);font-size:14px">Loading…</p></div>` : `<div class="panel">No reading today — this block is review and practice. ${w && w.segments.length === 0 ? 'Use the plan tab to reopen earlier days’ pages.' : ''}</div>`}
            ${notes ? `<div class="section"><div class="section-head"><h2>Lecture notes · week ${s.week}</h2><span class="small muted">${notes.source === 'llm' ? esc(notes.model || '') : 'offline'}</span></div><div class="notes" id="notes-body"></div></div>` : ''}
          </div>
          <aside class="reading-side">
            ${L.studyBlock(c, s, { hints: true })}
            ${w && w.objectives.length ? `<div class="card"><div class="card-head"><h3>This week's objectives</h3></div><div class="card-body"><ol style="margin:0;padding-left:18px" class="small">${w.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ol></div></div>` : ''}
            <div class="card"><div class="card-body"><button class="btn w-full" data-act="notes" data-course="${c.id}" data-week="${s.week}">${notes ? 'Regenerate lecture notes' : 'Lecture notes for this week'}</button><p class="small muted mt-1">${L.faculty.available() ? 'Written by faculty from this week’s material.' : 'Compiled offline. Add a faculty key in Settings for written notes.'}</p></div></div>
          </aside></div></div>`;
    },
    async mount(root, p, q) {
      const c = R().course(p.id); const s = c && c.sessions.find((x) => x.date === p.date); if (!s) return;
      const reads = s.chunks.filter((k) => k.kind === 'read');
      const active = reads.find((k) => k.id === q.chunk) || reads[0];
      const body = root.querySelector('#reading-body');
      const notes = c.notes && c.notes[s.week];
      const nb = root.querySelector('#notes-body');
      if (notes && nb) nb.innerHTML = window.marked && window.DOMPurify ? window.DOMPurify.sanitize(window.marked.parse(notes.markdown)) : `<pre style="white-space:pre-wrap">${esc(notes.markdown)}</pre>`;
      if (!active || !body) return;
      const token = ++pageRenderToken;
      const src = c.material.sources.find((x) => x.id === active.source);
      const wantPages = src && src.hasFile && q.view !== 'text';
      const file = wantPages ? await L.db.getFile(src.id) : null;
      if (token !== pageRenderToken) return;
      if (file && file.kind === 'pdf' && active.pages && window.pdfjsLib) {
        try { await renderPdfPages(body, file.bytes, active.pages, token); return; }
        catch (e) { console.warn('page render failed, falling back to text', e); }
      } else if (file && file.kind === 'html') {
        body.className = 'reading html-page';
        body.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(file.html, { FORBID_TAGS: ['style', 'script', 'iframe', 'form'] }) : esc(file.html);
        return;
      }
      // extracted text for this chunk
      const text = (await L.db.getMaterial(c.id)) || '';
      if (token !== pageRenderToken) return;
      body.className = 'reading';
      const raw = text.slice(active.from, active.to);
      const paras = raw.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      body.innerHTML = paras.map((x) => (/^#{1,6}\s/.test(x) ? `<h2>${esc(x.replace(/^#{1,6}\s*/, ''))}</h2>` : `<p>${esc(x).replace(/\n/g, '<br>')}</p>`)).join('') || '<p class="muted">The material for this chunk is not on this device.</p>';
    },
    unmount() { pageRenderToken++; },
  };
  async function renderPdfPages(body, bytes, [from, to], token) {
    const pdf = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    if (token !== pageRenderToken) return;
    body.className = 'pages';
    body.innerHTML = '';
    const width = Math.min(body.clientWidth || 720, 900);
    for (let n = from; n <= Math.min(to, pdf.numPages); n++) {
      const page = await pdf.getPage(n);
      if (token !== pageRenderToken) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: scale * dpr });
      const wrap = document.createElement('figure'); wrap.className = 'pdf-page';
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height; canvas.style.width = `${vp.width / dpr}px`; canvas.style.height = `${vp.height / dpr}px`;
      const cap = document.createElement('figcaption'); cap.className = 'mono small muted'; cap.textContent = `Page ${n} of ${pdf.numPages}`;
      wrap.append(canvas, cap); body.appendChild(wrap);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  }
  // ---------- papers ----------
  L.views.contract = {
    title: 'Contract',
    render(p) {
      const c = R().course(p.id); if (!c || !c.contract) return notFound('Contract');
      return `<div class="page"><div class="page-head"><div><span class="eyebrow"><a href="#/course/${c.id}" class="code" style="--ch:${L.cc(c)}">${esc(c.code)}</a></span><h1 class="display">Registration contract</h1><p class="lede">Signed ${L.fmt.dt(c.contract.signedAt)} · ${esc(c.contract.no)}</p></div><div class="actions"><button class="btn" data-act="print">Print / Save PDF</button></div></div>
        <div class="sheet-viewport">${L.papers.contractSheet(c, L.S.student, { no: c.contract.no, signedAt: c.contract.signedAt, signature: c.contract.signature, name: c.contract.name })}</div>
        <p class="small muted mt-2 mono">Text hash ${esc(c.contract.textHash.slice(0, 16))}… · recorded in the ledger as contract_signed.</p></div>`;
    },
  };
  L.views.certificate = {
    title: 'Certificate',
    render(p) {
      const c = R().course(p.id); if (!c) return notFound('Course');
      if (!c.certificate) return `<div class="page"><div class="empty"><h2>No certificate for ${esc(c.code)}.</h2><p>${c.final ? (c.final.letter === 'W' ? 'The course was withdrawn.' : `The final grade (${L.fmt.pct(c.final.pct)}) is below the ${L.papers.PASS}% required.`) : 'The course has not ended yet.'}</p><p><a class="btn mt-2" href="#/course/${c.id}">Back to the course</a></p></div></div>`;
      const cert = c.certificate;
      return `<div class="page"><div class="page-head"><div><span class="eyebrow"><a href="#/course/${c.id}" class="code" style="--ch:${L.cc(c)}">${esc(c.code)}</a></span><h1 class="display">Certificate of Completion</h1><p class="lede">${esc(cert.no)} · issued ${L.fmt.date(cert.issuedAt)} · verification ${esc(cert.code)}</p></div><div class="actions"><button class="btn btn-primary" data-act="share-certificate" data-course="${c.id}">Share image</button><button class="btn" data-act="print">Print / Save PDF</button></div></div>
        <div class="sheet-viewport is-landscape"><div class="sheet certificate" id="sheet">${L.papers.certificateSvg(c)}</div></div>
        <p class="small muted mt-2">Verify on the device that issued it: More → Grades → Verify record. Hash ${esc(cert.hash.slice(0, 16))}…</p></div>`;
    },
  };
  L.actions['share-certificate'] = async (el) => {
    const c = R().course(el.dataset.course); if (!c || !c.certificate) return;
    const blob = await L.papers.certificatePng(c);
    if (L.native && L.native.isNative()) { try { if (await L.native.shareFile(`${c.certificate.no}.png`, blob, `Certificate ${c.certificate.no}`)) return; } catch (e) { if (e && /cancel/i.test(e.message || '')) return; console.error(e); } }
    const file = new File([blob], `${c.certificate.no}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Certificate ${c.certificate.no}` }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    L.ui.toast('Certificate image saved.', 'good');
  };
  L.actions.print = () => window.print();

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
    unmount() { if (timerHandler) L.off('tick-views', timerHandler); timerHandler = null; },
  };
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
