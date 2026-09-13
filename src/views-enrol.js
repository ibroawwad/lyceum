(function (L) {
  'use strict';

  const R = () => L.registrar;
  const esc = L.esc;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  // wizard state lives only for the session; nothing is written until Enrol
  const W = { sources: [], hint: '', step: 1, plans: null, prospectus: null, error: null, log: [], busy: false, sampleLoaded: false };
  const totalWords = () => L.sum(W.sources.map((s) => s.words));

  function steps() {
    const st = [['Material', 1], ['Pace', 2], ['Prospectus', 3]];
    return `<div class="wizard-steps">${st.map(([n, i]) => `<div class="wizard-step${W.step === i ? ' is-active' : W.step > i ? ' is-done' : ''}"><span class="n">${i}</span>${n}</div>`).join('')}</div>`;
  }
  function materialStep() {
    const b = R().budget();
    return `<div class="grid-2">
      <div class="stack gap-2">
        <div class="drop" id="drop"><input type="file" id="file-input" multiple accept=".pdf,.docx,.txt,.md,.markdown,.html,.htm,application/pdf,text/plain,text/markdown,text/html"><div><b>Drop files here</b> or <a href="#" data-act="pick-file">choose from your computer</a></div><div class="small mt-1">PDF, Word (.docx), Markdown, plain text or HTML. Several files become one course.</div></div>
        <div class="field"><label for="paste">Or paste text</label><textarea id="paste" class="textarea" placeholder="Paste lecture notes, a chapter, a syllabus…"></textarea><div class="cols"><button class="btn btn-sm" data-act="add-text">Add text</button></div></div>
        <div class="field"><label for="url">Or fetch a web page</label><div class="cols"><input id="url" class="input" type="url" placeholder="https://…" style="flex:1"><button class="btn btn-sm" data-act="add-url">Fetch</button></div><span class="hint">Some sites block fetching; save the page as PDF if that happens.</span></div>
      </div>
      <div class="stack gap-2">
        <div class="card"><div class="card-head"><h2>Sources</h2><span class="small muted num">${W.sources.length ? `${L.fmt.num(totalWords())} words` : 'none yet'}</span></div><div class="card-body">
          ${W.sources.length ? `<div class="sources">${W.sources.map((s) => `<div class="source-row"><span class="pill">${esc(s.kind)}</span><span class="truncate" title="${esc(s.name)}">${esc(s.name)}</span><span class="num small muted">${L.fmt.num(s.words)} w${s.pages ? ` · ${s.pages} pp` : ''}</span><button class="btn btn-quiet btn-sm" data-act="remove-source" data-id="${s.id}">Remove</button></div>`).join('')}</div>` : '<p class="small muted">Add at least one source. The registrar reads everything you give it as one body of material.</p>'}
          <div class="field mt-3"><label for="hint">Course title <span class="muted" style="font-weight:400">(optional)</span></label><input id="hint" class="input" value="${esc(W.hint)}" data-in="hint" placeholder="Leave blank and the faculty will name it"></div>
        </div></div>
        <div class="panel small"><b>Study budget:</b> ${b.available} of ${b.weekly} hours a week free${b.committed ? ` (${b.committed} h committed)` : ''}. The registrar paces the course to fit.</div>
        ${W.error ? `<div class="notice" data-kind="bad"><span>${esc(W.error)}</span></div>` : ''}
        <div class="cols"><button class="btn btn-primary" data-act="submit-registrar"${W.sources.length && !W.busy ? '' : ' disabled'}>Submit to the registrar</button>${W.sources.length ? `<button class="btn btn-quiet" data-act="clear-sources">Clear</button>` : ''}</div>
      </div></div>`;
  }
  function prospectus(p) {
    const slot = p.plan.slot;
    const weightRows = Object.entries(p.policy.weights).map(([k, w]) => `<div class="tile"><div class="tile-n" style="font-size:22px">${w}%</div><div class="tile-l">${k === 'participation' ? 'Participation' : esc(R().KIND_TITLE[k] + (p.assessments.filter((a) => a.kind === k).length > 1 ? 's' : ''))}</div></div>`).join('');
    return `<div class="prospectus">
      <div class="prospectus-head"><div><span class="eyebrow">Prospectus · ${esc(p.subject)} · ${esc(p.level)}</span><span class="code" style="--ch:${p.hue};font-size:15px">${esc(p.code)}</span><h2>${esc(p.title)}</h2><p class="lede mt-2">${esc(p.description)}</p></div>
        <div class="right nowrap"><div class="tile"><div class="tile-n">${p.credits}</div><div class="tile-l">credit${p.credits === 1 ? '' : 's'}</div></div></div></div>
      <div class="prospectus-body">
        <div class="grid-2"><dl class="kv"><dt>Term</dt><dd class="mono">${L.fmt.date(p.term.start)} – ${L.fmt.date(p.term.end)} · ${p.term.weeks} weeks</dd><dt>Load</dt><dd>${p.plan.hoursPerWeek} h/week · ${p.plan.totalHours} h in all</dd><dt>Pace</dt><dd>${esc(p.plan.paceLabel)} · ${p.plan.studyDays.length === 7 ? 'every day' : 'Mon–Fri'}</dd><dt>Study block</dt><dd>${hm(slot.start)} daily · about ${p.plan.minutesPerDay} min · ${p.sessions.length} blocks in all</dd><dt>Material</dt><dd>${p.material.sources.length} source${p.material.sources.length === 1 ? '' : 's'} · ${L.fmt.num(p.material.words)} words · ${p.material.segments.length} segments</dd><dt>Faculty</dt><dd>${p.analysis.source === 'llm' ? esc(p.analysis.model) : 'offline registrar'}${p.analysis.note ? `<div class="small muted">${esc(p.analysis.note)}</div>` : ''}</dd><dt>Withdrawal</dt><dd>until ${L.fmt.date(L.date.addDays(L.date.parse(p.policy.withdrawBefore), -1))}</dd></dl>
          <div><span class="label">Grade weights</span><div class="weights mt-1">${weightRows}</div><p class="small muted mt-1">Late work: −${p.policy.late.perDayPct}% per day, up to ${p.policy.late.maxDays} days. Examinations: no late window.</p></div></div>
        <div><span class="label">Week by week</span><div class="syllabus mt-1">${p.weeks.map((w) => `<div class="week-row" style="grid-template-columns:56px 118px minmax(0,1fr)"><div class="wk">Week<b>${w.n}</b></div><div class="dates">${L.fmt.date(w.start)}</div><div><div class="topic">${esc(w.title)}</div><div class="parts">${w.parts.map((x) => esc(x.label)).join(' · ')}</div></div></div>`).join('')}</div></div>
        <div><span class="label">Assessments</span><div class="table-wrap mt-1"><table class="table"><thead><tr><th>Assessment</th><th>Opens</th><th>Due</th><th class="num">Length</th><th class="num">Weight</th></tr></thead><tbody>${p.assessments.map((a) => { const n = p.assessments.filter((x) => x.kind === a.kind).length; return `<tr><td>${esc(a.title)}<div class="small muted">${esc(R().KIND_TITLE[a.kind])} · weeks ${a.coversWeeks.length > 3 ? `${a.coversWeeks[0]}–${a.coversWeeks[a.coversWeeks.length - 1]}` : a.coversWeeks.join(', ')}</div></td><td class="mono small nowrap">${L.fmt.dt(a.opensAt)}</td><td class="mono small nowrap">${L.fmt.dt(a.dueAt)}${a.lateAllowed ? `<div class="muted">late until ${L.fmt.date(a.closesAt)}</div>` : ''}</td><td class="num small">${a.durationMin ? L.fmt.dur(a.durationMin) : 'untimed'}</td><td class="num">${((p.policy.weights[a.kind] || 0) / n).toFixed(1)}%</td></tr>`; }).join('')}</tbody></table></div></div>
        <div class="registrar-note"><span class="label">Registrar's note</span>This schedule is binding. Dates, weights and examinations cannot be changed after enrolment. Papers open and close on the calendar above; a paper not submitted by its close is recorded as 0. Withdrawal is possible until the date shown, after which the grade stands on the transcript.</div>
        <div class="cols"><button class="btn btn-primary" data-act="enrol-confirm">Enrol</button><button class="btn btn-quiet" data-act="enrol-paces">Back to paces</button><button class="btn btn-quiet" data-act="enrol-discard">Discard</button><span class="small muted">Term begins ${L.fmt.dateLong(p.term.start)}.</span></div>
      </div></div>`;
  }
  function paceCards() {
    const keys = ['condensed', 'standard', 'extended'];
    return `<div class="paces">${keys.map((k) => { const p = W.plans[k]; const meta = R().PACES[k];
      if (p.unavailable) return `<div class="pace-card is-unavailable"><span class="label">${esc(meta.label)}</span><div class="pace-n">—</div><p class="small muted">${esc(p.unavailable)}</p></div>`;
      const exams = p.assessments.filter((a) => a.kind === 'midterm' || a.kind === 'final').length;
      return `<div class="pace-card${k === 'standard' ? ' is-default' : ''}"><span class="label">${esc(meta.label)}${k === 'standard' ? ' · recommended' : ''}</span><div class="pace-n">${p.term.weeks} <span>weeks</span></div><p class="small muted">${esc(meta.blurb)}</p>
        <dl class="kv small"><dt>Ends</dt><dd class="mono">${L.fmt.date(p.term.end)}</dd><dt>Load</dt><dd>${p.plan.hoursPerWeek} h/week · ${p.plan.minutesPerDay} min/day</dd><dt>Days</dt><dd>${p.plan.studyDays.length === 7 ? 'every day' : 'Mon–Fri'}</dd><dt>Assessments</dt><dd>${p.assessments.length} · ${exams} exam${exams === 1 ? '' : 's'}${p.assessments.some((a) => a.kind === 'project') ? ' · project' : ''}</dd><dt>Credits</dt><dd>${p.credits}</dd><dt>Withdraw by</dt><dd class="mono">${L.fmt.date(L.date.addDays(L.date.parse(p.policy.withdrawBefore), -1))}</dd></dl>
        <button class="btn ${k === 'standard' ? 'btn-primary' : ''} w-full mt-2" data-act="choose-pace" data-pace="${k}">Choose ${esc(meta.label.toLowerCase())}</button></div>`; }).join('')}</div>
      <p class="small muted mt-2">The registrar sets these three; there is no custom pace. Whichever you choose becomes binding at enrolment.</p>
      <div class="cols mt-2"><button class="btn btn-quiet" data-act="enrol-back">Back to material</button></div>`;
  }
  L.views.enrol = {
    title: 'Enrol',
    render(p, q) {
      const body = W.step === 1 ? materialStep()
        : W.step === 2 ? (W.plans ? paceCards() : `<div class="card"><div class="card-body"><div class="log" id="registrar-log">${W.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>${W.error ? `<div class="notice mt-2" data-kind="bad"><span>${esc(W.error)}</span></div><div class="cols mt-2"><button class="btn" data-act="enrol-back">Back to material</button></div>` : ''}</div></div>`)
        : W.step === 3 && W.prospectus ? prospectus(W.prospectus) : '';
      const h1 = W.step === 3 ? 'Prospectus' : W.step === 2 && W.plans ? 'Choose a pace' : 'Enrol in a course';
      const lede = W.step === 1 ? 'Give the registrar the material. It comes back as a course with a fixed term, a daily study block and every assessment dated.' : W.step === 3 ? 'Read the terms below. Enrolling makes them binding.' : W.plans ? `The registrar proposes three pacings for ${esc(W.plans.standard.title || W.plans.condensed.title || 'this material')}. Pick one; there is no fourth.` : 'The registrar is reading your material.';
      return `<div class="page"><div class="page-head"><div><span class="eyebrow">Office of the Registrar · Enrolment</span><h1 class="display">${h1}</h1><p class="lede">${lede}</p></div></div>${steps()}${body}</div>`;
    },
    async mount(root, p, q) {
      window.__prospectus = W.prospectus || null;
      if (q.sample === '1' && !W.sampleLoaded && !W.busy) {
        W.sampleLoaded = true;
        W.sources = [Object.assign(L.intake.fromText(L.SAMPLE.text, L.SAMPLE.name), { kind: 'markdown' })];
        W.hint = '';
        L.ui.toast('Sample material loaded. It will be scheduled like any real course.', 'info', 4000);
        history.replaceState(null, '', location.pathname + location.search + '#/enrol');
        await L.actions['submit-registrar']();
        return;
      }
      const drop = root.querySelector('#drop'); const input = root.querySelector('#file-input');
      if (drop && input) {
        ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
        ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
        drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
        input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
      }
    },
    unmount() { window.__prospectus = null; },
  };
  async function addFiles(files) {
    for (const f of Array.from(files || [])) {
      const busy = L.ui.busy(`Reading ${f.name}…`);
      try { const src = await L.intake.fromFile(f); if (src.words < 50) throw new Error(`${f.name} has almost no text (${src.words} words).`); W.sources.push(src); L.ui.toast(`Added ${f.name} · ${L.fmt.num(src.words)} words.`, 'good'); }
      catch (e) { L.ui.toast(e.message, 'bad', 6000); }
      finally { busy.done(); }
    }
    W.error = null; L.render();
  }
  L.actions['pick-file'] = () => document.getElementById('file-input')?.click();
  L.actions['add-text'] = () => {
    const ta = document.getElementById('paste'); const text = (ta?.value || '').trim();
    if (text.split(/\s+/).length < 50) { L.ui.toast('Paste at least a few paragraphs.', 'warn'); return; }
    const src = L.intake.fromText(text, `Pasted text ${W.sources.filter((s) => /^Pasted/.test(s.name)).length + 1}`);
    W.sources.push(src); W.error = null; L.render();
  };
  L.actions['add-url'] = async () => {
    const url = (document.getElementById('url')?.value || '').trim(); if (!url) return;
    const busy = L.ui.busy(`Fetching ${url}…`);
    try { const src = await L.intake.fromUrl(url); W.sources.push(src); W.error = null; L.ui.toast(`Fetched ${src.name} · ${L.fmt.num(src.words)} words.`, 'good'); }
    catch (e) { L.ui.toast(e.message, 'bad', 7000); }
    finally { busy.done(); L.render(); }
  };
  L.actions['remove-source'] = (el) => { W.sources = W.sources.filter((s) => s.id !== el.dataset.id); L.render(); };
  L.actions['clear-sources'] = () => { W.sources = []; W.error = null; L.render(); };
  L.inputs.hint = (el) => { W.hint = el.value; };
  L.actions['enrol-back'] = () => { W.step = 1; W.plans = null; W.prospectus = null; W.error = null; W.log = []; L.render(); };
  L.actions['enrol-discard'] = () => { W.step = 1; W.plans = null; W.prospectus = null; W.log = []; W.error = null; L.render(); L.ui.toast('Prospectus discarded. Nothing was recorded.'); };
  L.actions['choose-pace'] = (el) => { const p = W.plans && W.plans[el.dataset.pace]; if (!p || p.unavailable) return; W.prospectus = p; W.step = 3; L.render(); };
  L.actions['enrol-paces'] = () => { W.prospectus = null; W.step = 2; L.render(); };

  L.actions['submit-registrar'] = async () => {
    if (!W.sources.length || W.busy) return;
    W.busy = true; W.step = 2; W.plans = null; W.prospectus = null; W.error = null; W.log = [];
    const log = (m) => { W.log.push(m); const el = document.getElementById('registrar-log'); if (el) { const d = document.createElement('div'); d.textContent = m; el.appendChild(d); } };
    L.render();
    try {
      // sources are already normalised; join them as-is so each one's page offsets stay valid
      let pos = 0;
      for (const s of W.sources) { s.offset = pos; pos += s.text.length + 2; }
      const text = W.sources.map((s) => s.text).join('\n\n');
      const words = L.intake.words(text);
      log(`Reading ${W.sources.length} source${W.sources.length === 1 ? '' : 's'} · ${L.fmt.num(words)} words`);
      const segments = L.intake.segment(text);
      log(`${segments.length} segment${segments.length === 1 ? '' : 's'} found`);
      const t0 = Date.now();
      if (L.faculty.available()) log('Consulting faculty…');
      const r = await L.faculty.analyze({ segments, text, hint: W.hint.trim(), words, sourceName: W.sources[0].name, onModel: (m) => log(`Faculty: ${m}`) });
      if (r.source === 'llm') log(`Faculty (${r.model}) replied in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      else log(r.note || 'Analysed by the offline registrar');
      const analysis = Object.assign({}, r.analysis, { source: r.source, model: r.model, note: r.note });
      log(`${analysis.units.length} units · ${analysis.level} · difficulty ${analysis.difficulty}/5`);
      log('Drawing up three pacings…');
      W.plans = R().plans({ analysis, segments, text, sources: W.sources, words });
      log(['condensed', 'standard', 'extended'].map((k) => `${k}: ${W.plans[k].unavailable ? 'unavailable' : W.plans[k].term.weeks + ' weeks'}`).join(' · '));
    } catch (e) {
      console.error(e);
      W.error = e.message || 'The registrar could not schedule this material.';
    } finally { W.busy = false; L.render(); }
  };
  L.actions['enrol-confirm'] = async () => {
    const p = W.prospectus; if (!p) return;
    const ok = await L.ui.confirm({ title: `Enrol in ${p.code}?`, body: `<p><b>${esc(p.title)}</b> — ${p.term.weeks} weeks from ${L.fmt.dateLong(p.term.start)}, ${p.plan.hoursPerWeek} hours a week, ${p.assessments.length} assessments.</p><p>From this moment the schedule is binding: no date, weight or examination can be changed. Withdrawal is possible until ${L.fmt.date(L.date.addDays(L.date.parse(p.policy.withdrawBefore), -1))}.</p>`, ok: 'Enrol' });
    if (!ok) return;
    const c = await R().enrol(p);
    W.step = 1; W.sources = []; W.hint = ''; W.plans = null; W.prospectus = null; W.log = []; W.sampleLoaded = false;
    L.ui.toast(`Enrolled in ${c.code}. Term begins ${L.fmt.date(c.term.start)}.`, 'good', 5000);
    L.go(`/course/${c.id}`);
  };
})(window.L);
